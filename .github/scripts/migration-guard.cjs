// Migration guard — see .github/workflows/migration-guard.yml.
//
// Migrations are never applied by deploy: each web/db/migrations/NNN_*.sql is
// pasted into the Supabase SQL editor by hand, dev *and* prod. A merged PR whose
// migration never reached prod deploys green and 500s at runtime (the 007 incident).
// This check stays red until a human attests, via label, that prod has it.
// It also fails when an added migration doesn't record its own number in
// public.schema_migrations (convention since 010; /api/health reads that table).
// Tests: web/scripts/__tests__/migration-guard.test.mjs (npm run test:scripts).
const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS_DIR = "web/db/migrations";
const SCHEMA_FILE = "web/db/schema.sql";
const LABEL = "migration-applied-prod";
const MARKER = "<!-- migration-guard -->";
const MAX_SQL_CHARS = 12000; // per file; GitHub comments cap at 65536 total

/**
 * Since migration 010 every migration records itself in public.schema_migrations,
 * which /api/health compares against the build. True when `sql` has an
 * `insert into [public.]schema_migrations ... values (...'NNN'...)` statement for
 * `version` (a multi-row backfill counts). Comments are stripped first so a
 * commented-out insert doesn't pass.
 */
function recordsOwnVersion(sql, version) {
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  const inserts = code.match(/insert\s+into\s+(?:public\.)?schema_migrations\b[^;]*/gi) ?? [];
  const n = Number(version);
  return inserts.some((stmt) => [...stmt.matchAll(/'(\d+)'/g)].some((m) => Number(m[1]) === n));
}

/**
 * Pure decision. `changed` is the PR's file list ({ filename, status } as returned
 * by pulls.listFiles), `migrationFiles` every basename currently in MIGRATIONS_DIR.
 */
function evaluate({ changed, labels, migrationFiles, readFile }) {
  const inDir = (f) => f.filename.startsWith(`${MIGRATIONS_DIR}/`) && f.filename.endsWith(".sql");
  const added = changed.filter((f) => inDir(f) && (f.status === "added" || f.status === "renamed"));
  const edited = changed.filter((f) => inDir(f) && f.status === "modified");
  const schemaTouched = changed.some((f) => f.filename === SCHEMA_FILE);

  const byNumber = new Map();
  for (const name of migrationFiles) {
    const m = /^(\d+)_/.exec(name);
    if (!m) continue;
    byNumber.set(m[1], [...(byNumber.get(m[1]) ?? []), name]);
  }
  const duplicates = [...byNumber.values()].filter((names) => names.length > 1);

  const failures = [];
  const warnings = [];
  const attested = labels.includes(LABEL);

  if (duplicates.length) {
    failures.push(
      `Duplicate migration numbers: ${duplicates.map((d) => d.map((n) => `\`${n}\``).join(" / ")).join("; ")}. ` +
        `Renumber this PR's migration to the next free number.`,
    );
  }
  if ((added.length || edited.length) && !attested) {
    failures.push(`Not yet attested: apply the SQL below to **prod**, then add the \`${LABEL}\` label.`);
  }
  const unrecorded = added.filter((f) => {
    const version = /^(\d+)_/.exec(path.basename(f.filename))?.[1];
    const sql = readFile(f.filename);
    return version && sql !== null && !recordsOwnVersion(sql, version);
  });
  if (unrecorded.length) {
    failures.push(
      `Missing schema-version row: ${unrecorded.map((f) => `\`${path.basename(f.filename)}\``).join(", ")} must end with ` +
        "`insert into public.schema_migrations(version) values ('NNN') on conflict do nothing;` for its own number — " +
        "otherwise /api/health reports the DB as behind after deploy.",
    );
  }
  if (edited.length) {
    warnings.push(
      `This PR **edits an existing migration** (${edited.map((f) => `\`${path.basename(f.filename)}\``).join(", ")}). ` +
        `Prod already ran the old version and will not re-run it — prefer a new migration.`,
    );
  }
  if (added.length && !schemaTouched) {
    warnings.push(`\`${SCHEMA_FILE}\` is unchanged — new migrations are normally folded into it too.`);
  }

  const sqlBlocks = [...added, ...edited]
    .map((f) => {
      let sql = readFile(f.filename) ?? "-- (file not found in checkout)";
      if (sql.length > MAX_SQL_CHARS) sql = `${sql.slice(0, MAX_SQL_CHARS)}\n-- … truncated; open the file in the PR diff`;
      return `<details><summary><code>${path.basename(f.filename)}</code></summary>\n\n\`\`\`sql\n${sql}\n\`\`\`\n</details>`;
    })
    .join("\n\n");

  const status = failures.length ? "❌ **Blocked**" : "✅ **Attested** — prod has been marked as migrated.";
  const body = [
    MARKER,
    "## 🗄️ Migration guard",
    status,
    ...failures.map((f) => `- ${f}`),
    ...warnings.map((w) => `- ⚠️ ${w}`),
    "",
    "**Migrations are never applied by deploy.** Before merging:",
    "1. Paste each file below into the **dev** Supabase SQL editor and run it.",
    "2. Paste the same into the **prod (`claims-pilot`)** SQL editor and run it — prod schema must exist *before* the code goes live.",
    `3. Add the \`${LABEL}\` label to this PR. The check re-runs and turns green.`,
    "",
    sqlBlocks,
  ].join("\n");

  return { ok: failures.length === 0, body, failures, warnings };
}

/** Entry point for actions/github-script. */
async function run({ github, context, core }) {
  const pr = context.payload.pull_request;
  const { owner, repo } = context.repo;

  const changed = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pr.number,
    per_page: 100,
  });
  const labels = (pr.labels ?? []).map((l) => l.name);
  const migrationFiles = fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR) : [];
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

  const result = evaluate({ changed, labels, migrationFiles, readFile });

  // Upsert one sticky comment. Best-effort: a comment failure must not mask the verdict.
  try {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pr.number,
      per_page: 100,
    });
    const existing = comments.find((c) => c.body?.startsWith(MARKER));
    if (existing) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: result.body });
    } else {
      await github.rest.issues.createComment({ owner, repo, issue_number: pr.number, body: result.body });
    }
  } catch (err) {
    core.warning(`Could not post migration-guard comment: ${err.message}`);
  }

  for (const w of result.warnings) core.warning(w);
  if (!result.ok) core.setFailed(result.failures.join("\n"));
}

module.exports = { evaluate, run, recordsOwnVersion, LABEL };
