// The only file that talks to the mail provider (Resend). Everything else in the
// module is provider-independent, so swapping providers means rewriting this file.
//
// API shapes checked against Resend's docs and the SDK's types (resend 6.x) on
// 2026-11-16: the `email.received` webhook carries metadata only, so the body,
// headers and attachments are fetched separately; attachment download URLs
// expire after an hour, so they are downloaded during ingest, not later.
import { Resend, type WebhookEventPayload } from "resend";
import type { EmailConfig } from "./config";
import type { InboundEmail } from "./types";

export type ProviderEvent = WebhookEventPayload;

export type OutgoingEmail = {
  from: string;
  to: string;
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Uint8Array }[];
};

/** Sends one message. Throws when the provider refuses it — nothing was sent. */
export async function sendEmail(cfg: EmailConfig, email: OutgoingEmail): Promise<{ providerId: string }> {
  const { data, error } = await new Resend(cfg.apiKey).emails.send({
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    ...(email.cc?.length ? { cc: email.cc } : {}),
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    ...(email.headers ? { headers: email.headers } : {}),
    ...(email.attachments?.length
      ? { attachments: email.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })) }
      : {}),
  });
  if (error || !data) throw new Error(`email send failed: ${error?.message ?? "no response"}`);
  return { providerId: data.id };
}

/** The verified event, or null when the signature does not check out. */
export function verifyWebhook(cfg: EmailConfig, rawBody: string, headers: Headers): ProviderEvent | null {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return null;
  try {
    return new Resend(cfg.apiKey).webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret: cfg.webhookSecret,
    });
  } catch {
    return null;
  }
}

/** The outbound message a bounce / failure event is about; null for any other event. */
export function readDeliveryFailure(event: ProviderEvent): { providerId: string } | null {
  if (event.type !== "email.bounced" && event.type !== "email.failed") return null;
  return { providerId: event.data.email_id };
}

const splitRefs = (value: string | undefined): string[] => (value ? value.split(/\s+/).filter(Boolean) : []);

/** The full inbound message behind an `email.received` event; null for any other event. */
export async function readInbound(cfg: EmailConfig, event: ProviderEvent): Promise<InboundEmail | null> {
  if (event.type !== "email.received") return null;
  const id = event.data.email_id;
  const resend = new Resend(cfg.apiKey);

  const { data, error } = await resend.emails.receiving.get(id);
  if (error || !data) throw new Error(`inbound email fetch failed: ${error?.message ?? "no response"}`);

  const files = await resend.emails.receiving.attachments.list({ emailId: id, limit: 100 });
  if (files.error || !files.data) {
    throw new Error(`inbound attachments fetch failed: ${files.error?.message ?? "no response"}`);
  }

  // Header names arrive lower-cased, but that is the provider's habit, not a promise.
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(data.headers ?? {})) headers[name.toLowerCase()] = value;

  return {
    providerId: id,
    messageId: data.message_id || null,
    inReplyTo: headers["in-reply-to"]?.trim() || null,
    references: splitRefs(headers["references"]),
    from: data.from,
    to: data.to ?? [],
    cc: data.cc ?? [],
    subject: data.subject ?? "",
    text: data.text,
    headers,
    attachments: files.data.data.map((a) => ({
      filename: a.filename ?? "",
      mime: a.content_type || null,
      size: a.size,
      download: async () => {
        const res = await fetch(a.download_url);
        if (!res.ok) throw new Error(`attachment download failed: ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      },
    })),
  };
}
