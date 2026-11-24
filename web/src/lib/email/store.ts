import type { SupabaseClient } from "@supabase/supabase-js";
import type { FailureStore } from "./failure";
import type { EmailStore } from "./ingest";
import type { MatchMethod } from "./types";

const BUCKET = "claim-docs";

// EmailStore over Supabase, for the service client (the webhook has no user session).
// Every error is thrown: ingest treats a throw as "try again", and a swallowed read
// error here would look like "no such message" or "no claims" and misfile mail.
export function supabaseEmailStore(svc: SupabaseClient): EmailStore {
  return {
    async hasProviderId(providerId) {
      const { data, error } = await svc.from("claim_emails").select("id").eq("provider_id", providerId).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async agentByAlias(alias) {
      const { data, error } = await svc
        .from("agents").select("id, claims_mailbox").eq("inbound_alias", alias).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, claims_mailbox: (data.claims_mailbox as string | null) ?? null } : null;
    },
    async claimIds(agentId) {
      const { data, error } = await svc.from("claims").select("id").eq("agent_id", agentId);
      if (error) throw error;
      return (data ?? []).map((c) => c.id as string);
    },
    async threadIndex(agentId) {
      const { data, error } = await svc
        .from("claim_emails").select("message_id, claim_id")
        .eq("agent_id", agentId).not("claim_id", "is", null).not("message_id", "is", null);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.message_id as string, r.claim_id as string]));
    },
    async recentEmails(agentId, since) {
      const { data, error } = await svc
        .from("claim_emails").select("direction, claim_id, from_addr, to_addrs, match_method")
        .eq("agent_id", agentId).gte("received_at", since);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        direction: r.direction as "outbound" | "inbound",
        claimId: (r.claim_id as string | null) ?? null,
        from: r.from_addr as string,
        to: (r.to_addrs as string[] | null) ?? [],
        matchMethod: (r.match_method as MatchMethod | null) ?? null,
      }));
    },
    async upload(path, bytes, mime) {
      const { error } = await svc.storage.from(BUCKET).upload(path, bytes, {
        contentType: mime ?? "application/octet-stream",
      });
      if (error) throw error;
    },
    async insertEmail(row) {
      const { error } = await svc.from("claim_emails").insert(row);
      if (error) throw error;
    },
    async insertAttachments(rows) {
      const { error } = await svc.from("claim_email_attachments").insert(rows);
      if (error) throw error;
    },
  };
}

// FailureStore over Supabase. handling_status is deliberately not touched.
export function supabaseFailureStore(svc: SupabaseClient): FailureStore {
  return {
    async markDeliveryFailed(providerId) {
      const { data, error } = await svc
        .from("claim_emails")
        .update({ delivery_failed: true })
        .eq("provider_id", providerId)
        .eq("direction", "outbound")
        .eq("delivery_failed", false)
        .select("claim_id");
      if (error) throw error;
      return data?.length ? { claimId: (data[0].claim_id as string | null) ?? null } : null;
    },
    async addTask(claimId, title) {
      const { error } = await svc
        .from("tasks")
        .insert({ claim_id: claimId, title, source: "manual", due_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}
