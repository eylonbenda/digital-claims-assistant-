// Email is off unless all three variables are set. Callers treat null as "feature
// off": hide the UI, answer 503 from the routes, never throw.
export type EmailConfig = { apiKey: string; webhookSecret: string; inboundDomain: string };

export function emailConfig(
  env: Record<string, string | undefined> = process.env,
): EmailConfig | null {
  const apiKey = env.EMAIL_PROVIDER_API_KEY?.trim();
  const webhookSecret = env.EMAIL_WEBHOOK_SECRET?.trim();
  const inboundDomain = env.EMAIL_INBOUND_DOMAIN?.trim().toLowerCase();
  if (!apiKey || !webhookSecret || !inboundDomain) return null;
  return { apiKey, webhookSecret, inboundDomain };
}

/** The business's system address: where it sends from and where replies arrive. */
export function inboundAddress(alias: string, domain: string): string {
  return `${alias}@${domain}`;
}
