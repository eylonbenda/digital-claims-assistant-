# Pilot Launch + Follow-ups Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get two pilot agents live this week on a deployed app whose headline value is the auto-filled accident-notice PDF, and ship a "מעקבים להיום" follow-ups digest on the dashboard.

**Architecture:** Track A is a deploy critical path: swap the unlicensed dev font for OFL Noto Sans Hebrew and QA-re-render all 9 insurer templates, then provision a *separate* prod Supabase, deploy `web/` to Vercel off `main`, smoke-test on a phone, onboard agents. Track B adds a read-only digest of due/overdue tasks to `/dashboard`, built as a pure Vitest-covered function in `web/src/lib/tasks/` plus a presentational server component; WhatsApp chase reuses the existing `wa.me` pattern.

**Tech Stack:** Next.js 16 (App Router, async `headers()`), TypeScript, Tailwind v4 RTL, Supabase (Postgres/Auth/Storage/RLS), pdf-lib + @pdf-lib/fontkit, Vitest, Vercel.

## Global Constraints

- Branch + PR per change; never commit to `main`. PR trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Hebrew UI strings, English identifiers. Hebrew is drawn in **logical order** in PDFs — never reverse.
- This Next.js is v16 — check `web/node_modules/next/dist/docs/` before writing Next code (async `params`/`headers()`).
- Spec: `docs/superpowers/specs/2026-07-18-pilot-launch-design.md`.
- All `npm`/`npx` commands run from `web/` unless noted.
- Out of scope: email digest, WhatsApp Business API, AI doc-validation, custom domain, UX redesign.

---

## Track A — Pilot launch

### Task 1: Swap bundled font to Noto Sans Hebrew (OFL)

The bundled `app-hebrew.ttf` is Windows Arial — not licensed for redistribution. Replace it with Noto Sans Hebrew (OFL 1.1). Keep the filename `app-hebrew.ttf` so no template/engine code changes.

**Files:**
- Replace: `web/src/lib/formfill/assets/app-hebrew.ttf` (binary)
- Create: `web/src/lib/formfill/assets/OFL.txt`
- Modify: `web/src/lib/formfill/engine.ts:11` (comment only)

**Interfaces:**
- Produces: same asset path consumed by `engine.ts` (`fontFile = "app-hebrew.ttf"`) — no signature changes.

- [ ] **Step 1: Download the font + license into the assets dir**

```bash
cd web/src/lib/formfill/assets
curl -L -o app-hebrew.ttf "https://github.com/google/fonts/raw/main/ofl/notosanshebrew/NotoSansHebrew%5Bwdth%2Cwght%5D.ttf"
curl -L -o OFL.txt "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/OFL.txt"
```

This is the variable font; fontkit embeds its default instance (Regular 400), which is what the forms use. **Fallback if QA (Step 3) shows missing Latin glyphs or tofu:** use Rubik instead — `curl -L -o app-hebrew.ttf "https://github.com/google/fonts/raw/main/ofl/rubik/Rubik%5Bwght%5D.ttf"` + its `OFL.txt` from `ofl/rubik/` (Rubik has full Hebrew+Latin coverage).

- [ ] **Step 2: Update the stale comment in the engine**

In `web/src/lib/formfill/engine.ts` replace the note on line ~11:

```ts
// NOTE: app-hebrew.ttf is Noto Sans Hebrew (OFL 1.1 — license bundled as OFL.txt).
```

- [ ] **Step 3: Render one form and verify glyph coverage**

```bash
cd web
npx tsx scripts/fill.ts hachshara ../.pdfwork/_qa_hachshara.pdf
node ../.pdfwork/render.mjs ../.pdfwork/_qa_hachshara.pdf ../.pdfwork/_qa_hachshara.png
```

Read the PNG. Expected: Hebrew text renders in Noto Sans (not tofu/boxes), digits (dates, phone, license plate) render, no field overflows its box. If Latin/digits are missing → apply the Rubik fallback from Step 1 and re-run.

- [ ] **Step 4: Run tests + build**

```bash
cd web && npm test && npx next build
```
Expected: Vitest green, build passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/formfill/assets/app-hebrew.ttf web/src/lib/formfill/assets/OFL.txt web/src/lib/formfill/engine.ts
git commit -m "feat(formfill): swap dev Arial for OFL Noto Sans Hebrew"
```

### Task 2: QA re-render all 9 insurer forms with the new font

Templates are coordinate-anchored (origins fixed) but glyph widths changed — centered, wrapped, and tight fields can drift. Render every insurer with the stress sample and inspect.

**Files:**
- Possibly modify: `web/src/lib/formfill/templates/{hachshara,migdal,menora,ayalon,shlomo,libra,harel,aig,phoenix}.ts` (coordinate nudges only where drift is found)

**Interfaces:**
- Consumes: Task 1's font. No API changes.

- [ ] **Step 1: Render all 9**

```bash
cd web
for i in hachshara migdal menora ayalon shlomo libra harel aig phoenix; do
  npx tsx scripts/fill.ts $i ../.pdfwork/_qa_$i.pdf
  node ../.pdfwork/render.mjs ../.pdfwork/_qa_$i.pdf ../.pdfwork/_qa_$i.png
done
```

- [ ] **Step 2: Inspect each PNG**

Read each `_qa_<insurer>.png`. Per form check: (a) values sit inside their printed boxes, (b) checkbox marks still land in the boxes, (c) wrapped multi-line fields (event description) don't spill, (d) no clipped digits in date/phone/plate fields.

- [ ] **Step 3: Fix any drifted template**

For each drifted field, nudge the coordinate/width in the insurer's template file (same method as the 07-12 QA pass — `.pdfwork/coords.mjs` for reference glyph positions if needed), re-run that insurer's render from Step 1, re-inspect. Repeat until clean.

- [ ] **Step 4: Run tests + build, commit**

```bash
cd web && npm test && npx next build
git add web/src/lib/formfill/templates/
git commit -m "fix(formfill): re-QA all 9 forms under Noto Sans Hebrew"
```
(Skip the commit if no template needed changes — say so in the PR body.)

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/pilot-launch
gh pr create --title "feat: pilot launch — OFL font swap + 9-form QA" --body "Swaps the dev-only Arial for Noto Sans Hebrew (OFL, license bundled), re-QAs all 9 insurer renders. Part of the pilot-launch spec (docs/superpowers/specs/2026-07-18-pilot-launch-design.md).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Leave the PR for the user to review/merge (standing rule). **Vercel deploy (Task 4) waits for this merge.**

### Task 3: Provision prod Supabase (user-assisted, ops)

Real client PII — a fresh project, separate from the dev sandbox. Project creation + key copying happens in the Supabase dashboard (user action); everything else is paste-ready.

- [ ] **Step 1 (user): Create project** at [supabase.com](https://supabase.com) — name e.g. `claims-pilot`, region `eu-central-1` (closest to IL), strong DB password.
- [ ] **Step 2: Run schema + migrations in the SQL editor, in this exact order** (each file pasted wholesale):
  1. `web/db/schema.sql`
  2. `web/db/migrations/001_agent_setup.sql`
  3. `web/db/migrations/002_grants.sql`
  4. `web/db/migrations/003_storage.sql` (creates the private `claim-docs` bucket)
  5. `web/db/migrations/004_doc_types_and_claim_flags.sql`
  6. `web/db/migrations/005_claim_notes.sql`
  7. `web/db/migrations/006_tasks_engine.sql`
- [ ] **Step 3 (user): Create 3 auth users** — Dashboard → Authentication → Users → Add user (email + password, auto-confirm): owner + the 2 pilot agents. The `001` trigger auto-creates their `agents` rows.
- [ ] **Step 4: Verify locally against prod** — temporarily point `web/.env.local` at the prod keys, `npm run dev`, log in as owner, create a claim, open `/c/<token>`, submit the wizard with a photo; confirm the claim + document + generated form appear in the dashboard. **Then restore `.env.local` to the dev project keys.**

### Task 4: Vercel project + deploy (user-assisted, ops)

- [ ] **Step 1 (user): Import the repo** at [vercel.com/new](https://vercel.com/new) → `eylonbenda/digital-claims-assistant-`. **Root Directory = `web`**, framework auto-detects Next.js. Production branch `main`.
- [ ] **Step 2: Set env vars** (Project → Settings → Environment Variables, Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (prod project's), `ANTHROPIC_API_KEY`.
- [ ] **Step 3: Deploy** — merge the Task 2 PR (or click Redeploy). Expected: build green (CI already proved `next build`).
- [ ] **Step 4: Verify** — `https://<app>.vercel.app/api/health` reports all keys wired; `/api/version` returns `0.1.0`; `/login` renders RTL.

### Task 5: Prod smoke test (phone in hand)

- [ ] **Step 1:** Log in as owner on the live URL → create claim → copy the `/c/<token>` link.
- [ ] **Step 2:** Open the link **on a phone** → full wizard: identity, insurer select, driver step, injuries, photos upload (camera), license/registration upload, 3rd-party details, declaration → submit.
- [ ] **Step 3:** On `/dashboard/[id]`: auto-filled PDF present and correct insurer template; uploaded docs viewable via signed URLs; AI classification proposal rendered; checklist + spawned tasks visible; WhatsApp doc-chase button opens wa.me with the right message.
- [ ] **Step 4:** Confirm the generated PDF opens on the phone and desktop — Hebrew legible, fields aligned (the prod font path, `outputFileTracingIncludes`, is only truly exercised here).
- [ ] **Step 5:** Log any failure as a fix task; pilot breakage preempts Track B.

### Task 6: Agent onboarding

- [ ] **Step 1:** Send each pilot agent (WhatsApp, Hebrew):

```
היי [שם], מוכנים להתחיל 🙂
זה הקישור למערכת: https://<app>.vercel.app/login
אימייל: [email] · סיסמה: [password] (אפשר לשנות אחרי הכניסה)

איך פותחים תביעה:
1. "תביעה חדשה" → שם + טלפון של הלקוח
2. שולחים ללקוח את הקישור שנוצר (כפתור וואטסאפ מוכן)
3. הלקוח ממלא לבד מהנייד — כולל צילומי רכב ורישיונות
4. כשהוא מסיים: הטופס "הודעה על תאונה" מחכה לך מלא ב-PDF, עם סיווג התביעה ורשימת המסמכים

אני זמין לכל שאלה — ואשמח לשמוע מה עבד ומה חסר אחרי התביעה הראשונה.
```

- [ ] **Step 2:** Shepherd the first claim of each agent remotely; capture friction as notes for `docs/validation-guide.md` / `docs/assumptions-canvas.md`.

---

## Track B — Follow-ups digest ("מעקבים להיום")

Separate branch off `main`: `feat/followups-digest`. Do not stack on `feat/pilot-launch`.

### Task 7: Extract `waPhone` into a shared module

`ReadinessStrip.tsx` has a local `waPhone`; the digest needs it too. Extract, don't duplicate.

**Files:**
- Create: `web/src/lib/wa.ts`
- Create: `web/src/lib/wa.test.ts`
- Modify: `web/src/app/dashboard/[id]/ReadinessStrip.tsx:10-16` (delete local fn, import instead)

**Interfaces:**
- Produces: `waPhone(phone: string): string | null` — Israeli local mobile → international digits (`0521234567` → `972521234567`), `null` if unparseable.

- [ ] **Step 1: Write the failing test** — `web/src/lib/wa.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { waPhone } from "./wa";

describe("waPhone", () => {
  it("converts local mobile to international", () => {
    expect(waPhone("0521234567")).toBe("972521234567");
  });
  it("strips formatting characters", () => {
    expect(waPhone("052-123 4567")).toBe("972521234567");
  });
  it("passes through numbers already in international form", () => {
    expect(waPhone("972521234567")).toBe("972521234567");
  });
  it("returns null for garbage", () => {
    expect(waPhone("abc")).toBeNull();
    expect(waPhone("03")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './wa'`):

```bash
cd web && npx vitest run src/lib/wa.test.ts
```

- [ ] **Step 3: Create `web/src/lib/wa.ts`** (move the implementation verbatim from `ReadinessStrip.tsx`):

```ts
// Israeli local mobile → wa.me international format (0521234567 → 972521234567).
export function waPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;
  return null;
}
```

- [ ] **Step 4: Point `ReadinessStrip.tsx` at it** — delete its local `waPhone` (lines 10–16) and add:

```ts
import { waPhone } from "@/lib/wa";
```

- [ ] **Step 5: Run tests — expect PASS** (`npx vitest run`), then commit:

```bash
git add web/src/lib/wa.ts web/src/lib/wa.test.ts "web/src/app/dashboard/[id]/ReadinessStrip.tsx"
git commit -m "refactor: extract waPhone into lib/wa"
```

### Task 8: `buildDigest` — pure selection/grouping/message logic (TDD)

**Files:**
- Create: `web/src/lib/tasks/digest.ts`
- Create: `web/src/lib/tasks/digest.test.ts`

**Interfaces:**
- Consumes: `waPhone` from Task 7; `TaskStatus` from `web/src/lib/tasks/types.ts`.
- Produces (used by Task 9):

```ts
export type DigestTaskRow = {
  id: string; claim_id: string; key: string | null; title: string;
  status: TaskStatus; due_at: string | null;
};
export type DigestClaimRow = {
  id: string; client_name: string | null; client_phone: string | null; access_token: string;
};
export type DigestEntry = { task: DigestTaskRow; daysOverdue: number; waHref: string | null };
export type DigestGroup = { claim: DigestClaimRow; entries: DigestEntry[] };
export function buildDigest(
  tasks: DigestTaskRow[], claims: DigestClaimRow[], now: Date, origin: string
): DigestGroup[];
```

Rules: include open tasks (`status !== "done"`) with `due_at` ≤ end of `now`'s day; `daysOverdue` = whole days past due (0 = due today); `waHref` only for `key === "chase_missing_docs"` with a parseable client phone (message = generic Hebrew doc-chase + `${origin}/c/${access_token}` upload link — the digest doesn't know *which* docs are missing; the cockpit's ReadinessStrip covers the itemized chase); groups sorted by their max `daysOverdue` desc, entries within a group likewise; claims with no qualifying tasks omitted.

- [ ] **Step 1: Write the failing tests** — `web/src/lib/tasks/digest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDigest, type DigestClaimRow, type DigestTaskRow } from "./digest";

const NOW = new Date("2026-07-18T10:00:00Z");
const ORIGIN = "https://app.example";

const claim = (over: Partial<DigestClaimRow> = {}): DigestClaimRow => ({
  id: "c1", client_name: "ישראל ישראלי", client_phone: "0521234567",
  access_token: "tok1", ...over,
});
const task = (over: Partial<DigestTaskRow> = {}): DigestTaskRow => ({
  id: "t1", claim_id: "c1", key: "follow_up_insurer", title: "מעקב תשובת מבטח",
  status: "todo", due_at: "2026-07-15T00:00:00Z", ...over,
});

describe("buildDigest", () => {
  it("includes overdue and due-today tasks, excludes future ones", () => {
    const groups = buildDigest(
      [
        task({ id: "t1", due_at: "2026-07-15T00:00:00Z" }), // overdue
        task({ id: "t2", due_at: "2026-07-18T23:00:00Z" }), // due today
        task({ id: "t3", due_at: "2026-07-25T00:00:00Z" }), // future
      ],
      [claim()], NOW, ORIGIN
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.task.id)).toEqual(["t1", "t2"]);
  });

  it("excludes done tasks and tasks without a due date", () => {
    const groups = buildDigest(
      [task({ status: "done" }), task({ id: "t2", due_at: null })],
      [claim()], NOW, ORIGIN
    );
    expect(groups).toHaveLength(0);
  });

  it("computes daysOverdue (0 = due today)", () => {
    const groups = buildDigest(
      [task({ due_at: "2026-07-15T00:00:00Z" }), task({ id: "t2", due_at: "2026-07-18T20:00:00Z" })],
      [claim()], NOW, ORIGIN
    );
    expect(groups[0].entries[0].daysOverdue).toBe(3);
    expect(groups[0].entries[1].daysOverdue).toBe(0);
  });

  it("orders groups by most-overdue first", () => {
    const groups = buildDigest(
      [
        task({ id: "t1", claim_id: "c1", due_at: "2026-07-17T00:00:00Z" }),
        task({ id: "t2", claim_id: "c2", due_at: "2026-07-10T00:00:00Z" }),
      ],
      [claim({ id: "c1" }), claim({ id: "c2", access_token: "tok2" })],
      NOW, ORIGIN
    );
    expect(groups.map((g) => g.claim.id)).toEqual(["c2", "c1"]);
  });

  it("builds a wa.me chase link only for chase_missing_docs with a valid phone", () => {
    const groups = buildDigest(
      [
        task({ id: "t1", key: "chase_missing_docs", title: "להשלים מסמכים חסרים מהלקוח" }),
        task({ id: "t2", key: "follow_up_insurer" }),
      ],
      [claim()], NOW, ORIGIN
    );
    const [chase, other] = groups[0].entries.map((e) => e.waHref);
    expect(chase).toContain("wa.me/972521234567");
    expect(chase).toContain(encodeURIComponent(`${ORIGIN}/c/tok1`));
    expect(other).toBeNull();
  });

  it("omits the wa link when the phone is unparseable", () => {
    const groups = buildDigest(
      [task({ key: "chase_missing_docs" })],
      [claim({ client_phone: null })], NOW, ORIGIN
    );
    expect(groups[0].entries[0].waHref).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './digest'`):

```bash
cd web && npx vitest run src/lib/tasks/digest.test.ts
```

- [ ] **Step 3: Implement `web/src/lib/tasks/digest.ts`:**

```ts
import { waPhone } from "@/lib/wa";
import type { TaskStatus } from "./types";

export type DigestTaskRow = {
  id: string;
  claim_id: string;
  key: string | null;
  title: string;
  status: TaskStatus;
  due_at: string | null;
};

export type DigestClaimRow = {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  access_token: string;
};

export type DigestEntry = {
  task: DigestTaskRow;
  daysOverdue: number; // 0 = due today
  waHref: string | null;
};

export type DigestGroup = { claim: DigestClaimRow; entries: DigestEntry[] };

const DAY_MS = 86_400_000;

// The one task whose counterparty is the client (docs chase) — the only one a
// wa.me link can address; insurer-facing tasks have no phone in the data model.
const CLIENT_CHASE_KEY = "chase_missing_docs";

function chaseHref(claim: DigestClaimRow, origin: string): string | null {
  const wa = claim.client_phone ? waPhone(claim.client_phone) : null;
  if (!wa) return null;
  const first = claim.client_name?.split(" ")[0];
  const msg = [
    `שלום${first ? ` ${first}` : ""}, בהמשך לתביעה שלך —`,
    `עדיין חסרים לנו מסמכים כדי להתקדם מול חברת הביטוח.`,
    `אפשר להעלות אותם כאן: ${origin}/c/${claim.access_token}`,
    `תודה!`,
  ].join("\n");
  return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
}

// Due-today-or-overdue open tasks, grouped per claim, most urgent first.
export function buildDigest(
  tasks: DigestTaskRow[],
  claims: DigestClaimRow[],
  now: Date,
  origin: string
): DigestGroup[] {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const byClaim = new Map(claims.map((c) => [c.id, c]));
  const groups = new Map<string, DigestGroup>();

  for (const t of tasks) {
    if (t.status === "done" || !t.due_at) continue;
    const due = new Date(t.due_at);
    if (due > endOfToday) continue;
    const claim = byClaim.get(t.claim_id);
    if (!claim) continue;

    const daysOverdue = Math.max(0, Math.floor((now.getTime() - due.getTime()) / DAY_MS));
    const waHref = t.key === CLIENT_CHASE_KEY ? chaseHref(claim, origin) : null;

    let group = groups.get(claim.id);
    if (!group) {
      group = { claim, entries: [] };
      groups.set(claim.id, group);
    }
    group.entries.push({ task: t, daysOverdue, waHref });
  }

  const result = [...groups.values()];
  for (const g of result) g.entries.sort((a, b) => b.daysOverdue - a.daysOverdue);
  result.sort((a, b) => b.entries[0].daysOverdue - a.entries[0].daysOverdue);
  return result;
}
```

- [ ] **Step 4: Run — expect PASS:**

```bash
cd web && npx vitest run src/lib/tasks/digest.test.ts
```

- [ ] **Step 5: Full suite + commit:**

```bash
cd web && npm test
git add web/src/lib/tasks/digest.ts web/src/lib/tasks/digest.test.ts
git commit -m "feat(tasks): buildDigest — due/overdue selection, grouping, wa chase links"
```

### Task 9: `FollowupsPanel` + dashboard wiring

**Files:**
- Create: `web/src/app/dashboard/FollowupsPanel.tsx`
- Modify: `web/src/app/dashboard/page.tsx` (extend the existing task query; build origin; render panel above the claims table)

**Interfaces:**
- Consumes: `buildDigest`, `DigestGroup` from Task 8.
- Produces: UI only.

- [ ] **Step 1: Create `web/src/app/dashboard/FollowupsPanel.tsx`** (server component, presentational; renders nothing when empty):

```tsx
import Link from "next/link";
import type { DigestGroup } from "@/lib/tasks/digest";

// "מעקבים להיום" — the agent's day in one section: every due/overdue task
// across all claims, most urgent claim first. Hidden entirely when empty.
export default function FollowupsPanel({ groups }: { groups: DigestGroup[] }) {
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
      <h3 className="text-base font-bold text-orange-900">
        מעקבים להיום ({total})
      </h3>
      <div className="mt-3 space-y-3">
        {groups.map((g) => (
          <div key={g.claim.id} className="rounded-lg border border-orange-100 bg-white p-3">
            <Link
              href={`/dashboard/${g.claim.id}`}
              className="text-sm font-semibold text-zinc-900 hover:underline"
            >
              {g.claim.client_name ?? "ללא שם"}
            </Link>
            <ul className="mt-1.5 space-y-1.5">
              {g.entries.map((e) => (
                <li key={e.task.id} className="flex flex-wrap items-center gap-2 text-sm">
                  {e.daysOverdue > 0 ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      באיחור {e.daysOverdue === 1 ? "יום" : `${e.daysOverdue} ימים`}
                    </span>
                  ) : (
                    <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                      להיום
                    </span>
                  )}
                  <span className="text-zinc-700">{e.task.title}</span>
                  {e.waHref && (
                    <a
                      href={e.waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-800"
                    >
                      וואטסאפ ללקוח ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire `web/src/app/dashboard/page.tsx`:**

Add imports:

```ts
import { headers } from "next/headers";
import FollowupsPanel from "./FollowupsPanel";
import { buildDigest } from "@/lib/tasks/digest";
```

Extend the existing task query (it already feeds the next-task column — one query serves both) by changing its `select` to:

```ts
    .select("id, claim_id, key, title, status, due_at")
```

After the `claimsWithTasks` mapping, build the digest (same origin pattern as `dashboard/[id]/page.tsx:85-87`):

```ts
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const digest = buildDigest(
    (taskRows ?? []) as Parameters<typeof buildDigest>[0],
    (claims ?? []).map((c) => ({
      id: c.id,
      client_name: c.client_name,
      client_phone: c.client_phone,
      access_token: c.access_token,
    })),
    new Date(),
    origin
  );
```

Render the panel between the heading row and the table:

```tsx
        <FollowupsPanel groups={digest} />

        <ClaimsTable claims={claimsWithTasks} />
```

Note: the tasks query keeps `.neq("status", "done")` — `buildDigest` re-filters defensively. TS note: the widened `select` returns rows typed by Supabase as loose objects; the `as Parameters<typeof buildDigest>[0]` cast keeps this contained to one line. `status` values arrive as the `task_status` enum strings matching `TaskStatus`.

- [ ] **Step 3: Verify in the preview** — start the dev server, log in, and check: dashboard with an overdue-task claim shows the panel (badge text, claim link navigates to the cockpit, wa link opens WhatsApp with the Hebrew message + upload URL); dashboard with no due tasks shows no panel.

- [ ] **Step 4: Full test + build:**

```bash
cd web && npm test && npx next build
```

- [ ] **Step 5: Commit + PR:**

```bash
git add web/src/app/dashboard/FollowupsPanel.tsx web/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): מעקבים להיום — due/overdue follow-ups digest with wa.me chase"
git push -u origin feat/followups-digest
gh pr create --title "feat: follow-ups digest (מעקבים להיום) on the dashboard" --body "Due-today/overdue tasks across all claims, grouped by claim, with pre-filled WhatsApp doc-chase links. Pure buildDigest lib + Vitest per the task-engine style. Spec: docs/superpowers/specs/2026-07-18-pilot-launch-design.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Execution order

Task 1 → 2 (PR #A) → [user merges] → 3 → 4 → 5 → 6 (pilot live). Track B (7 → 8 → 9, PR #B) runs in parallel on its own branch any time; it reaches the pilot agents on its own merge. Pilot breakage always preempts Track B.
