#!/usr/bin/env node
// Stop hook: type-check web/ before Claude is allowed to end its turn.
//
// - Skips when no .ts/.tsx under web/ is dirty (docs-only turns cost nothing).
// - Skips when web/node_modules is missing (fresh worktree without install).
// - On tsc failure: exit 2 + errors on stderr → Claude Code blocks the stop and
//   feeds the errors back to the model.
// - If we already blocked once this turn (stop_hook_active), warn the user
//   instead of blocking again, so pre-existing/unfixable errors can't loop.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 60;

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const web = join(root, "web");
const tscBin = join(web, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tscBin)) process.exit(0);

let dirty = "";
try {
  dirty = execFileSync("git", ["status", "--porcelain", "--", "web"], {
    cwd: root,
    encoding: "utf8",
  });
} catch {
  process.exit(0);
}
const touchesTs = dirty
  .split("\n")
  .some((l) => /\.(ts|tsx)"?$/.test(l.trim()));
if (!touchesTs) process.exit(0);

const res = spawnSync(process.execPath, [tscBin, "--noEmit", "-p", "."], {
  cwd: web,
  encoding: "utf8",
});
if (res.status === 0) process.exit(0);

const lines = `${res.stdout}${res.stderr}`.trim().split("\n");
const shown = lines.slice(0, MAX_LINES).join("\n");
const more = lines.length > MAX_LINES ? `\n… ${lines.length - MAX_LINES} more lines` : "";
const report = `tsc --noEmit failed in web/:\n${shown}${more}`;

if (input.stop_hook_active) {
  process.stdout.write(
    JSON.stringify({ systemMessage: `⚠ Type errors remain after one fix attempt.\n${report}` }),
  );
  process.exit(0);
}

process.stderr.write(`${report}\nFix these type errors before finishing.`);
process.exit(2);
