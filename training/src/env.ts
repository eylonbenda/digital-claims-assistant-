import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const TRAINING_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT_DIR = path.join(TRAINING_ROOT, "out");

export type Env = {
  baseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  demoEmail: string;
  demoPassword: string;
  prodSupabaseUrl: string | null;
};

// Reads training/.env.local. Errors name the missing key, never a value.
export function loadEnv(): Env {
  config({ path: path.join(TRAINING_ROOT, ".env.local"), quiet: true });
  const need = (key: string): string => {
    const v = process.env[key]?.trim();
    if (!v) throw new Error(`training/.env.local is missing ${key} (see .env.example)`);
    return v;
  };
  return {
    baseUrl: (process.env.BASE_URL?.trim() || "http://localhost:3100").replace(/\/+$/, ""),
    supabaseUrl: need("SUPABASE_URL"),
    serviceRoleKey: need("SUPABASE_SERVICE_ROLE_KEY"),
    demoEmail: need("DEMO_AGENT_EMAIL"),
    demoPassword: need("DEMO_AGENT_PASSWORD"),
    prodSupabaseUrl: process.env.PROD_SUPABASE_URL?.trim() || null,
  };
}
