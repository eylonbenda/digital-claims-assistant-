import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { loadEnv, type Env } from "./env.ts";
import { assertSafeTarget } from "./guard.ts";

// The recorder looks for this name on the dashboard before it records anything: seeing
// it proves the running app and this seed talk to the same database.
export const MARKER_CLIENT_NAME = "דנה לוי (הדגמה)";
const DEMO_AGENT_NAME = "מוסך הדגמה";
const BUCKET = "claim-docs";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`seed: ${what} failed — ${r.error.message}`);
  return r.data as T;
}

async function findOrCreateUser(db: SupabaseClient, env: Env): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`seed: listing users failed — ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === env.demoEmail.toLowerCase());
    if (hit) {
      // Keep the password in step with .env.local so login always works.
      const upd = await db.auth.admin.updateUserById(hit.id, { password: env.demoPassword });
      if (upd.error) throw new Error(`seed: resetting the demo password failed — ${upd.error.message}`);
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email: env.demoEmail,
    password: env.demoPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`seed: creating the demo user failed — ${error?.message}`);
  return data.user.id;
}

// Deletes ONLY the demo agent's claims. Every statement is scoped by that agent's id.
async function resetClaims(db: SupabaseClient, agentId: string): Promise<void> {
  const claims = must(await db.from("claims").select("id").eq("agent_id", agentId), "listing demo claims") as { id: string }[];
  const ids = claims.map((c) => c.id);
  if (ids.length === 0) return;
  const paths: string[] = [];
  for (const table of ["claim_documents", "generated_forms"] as const) {
    const rows = must(await db.from(table).select("storage_path").in("claim_id", ids), `listing ${table}`) as { storage_path: string }[];
    paths.push(...rows.map((r) => r.storage_path).filter(Boolean));
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`seed: removing stored files failed — ${error.message}`);
  }
  must(await db.from("claims").delete().eq("agent_id", agentId).select("id"), "deleting demo claims");
}

export async function seed(env: Env): Promise<{ agentId: string }> {
  await assertSafeTarget(env);
  const db = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = await findOrCreateUser(db, env);

  // The on_auth_user_created trigger (migration 001) makes the agents row; upsert covers
  // a project where the trigger is missing.
  const agent = must(
    await db.from("agents")
      .upsert({ auth_user_id: userId, email: env.demoEmail, name: DEMO_AGENT_NAME }, { onConflict: "auth_user_id" })
      .select("id")
      .single(),
    "naming the demo agent",
  ) as { id: string };

  await resetClaims(db, agent.id);

  // Background claims so the dashboard is not empty on camera. All fictional.
  must(
    // Every row carries the same keys: a bulk insert sends null for a key a row omits.
    await db.from("claims").insert([
      { agent_id: agent.id, client_name: MARKER_CLIENT_NAME, client_phone: "0500000003", status: "submitted",
        claim_type: "own_policy", policy_insurer: "harel", created_at: daysAgo(2), submitted_at: daysAgo(2) },
      { agent_id: agent.id, client_name: "משה פרץ (הדגמה)", client_phone: "0500000004", status: "created",
        claim_type: "unknown", policy_insurer: null, created_at: daysAgo(1), submitted_at: null },
      { agent_id: agent.id, client_name: "נועה שחר (הדגמה)", client_phone: "0500000005", status: "in_progress",
        claim_type: "unknown", policy_insurer: null, created_at: daysAgo(3), submitted_at: null },
    ]).select("id"),
    "inserting background claims",
  );
  return { agentId: agent.id };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seed(loadEnv()).then(
    (r) => console.log(`seeded agent ${r.agentId}, 3 claims`),
    (e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); },
  );
}
