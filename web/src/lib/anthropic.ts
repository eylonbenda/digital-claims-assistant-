import Anthropic from "@anthropic-ai/sdk";

// Every call goes out bounded. Left at the SDK defaults a request gets a 10-minute
// timeout and 2 retries — and the TS SDK scales that default *up* for large
// `max_tokens` on non-streaming requests — so one degraded API day can pin a caller
// for ~30 minutes with nothing to stop it. The morning-brief ranking is the longest
// legitimate call here (measured ~100s at 40 claims), so 120s clears it comfortably
// while still failing fast enough for callers to degrade instead of hang.
const REQUEST_TIMEOUT_MS = 120_000;

// Lazy, null-safe client — returns null when no key is configured so importing
// modules (e.g. route handlers) don't crash at build/import time.
export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
}

// Default to Opus 4.8 (best quality). Override via env if you want a cheaper tier.
export const CLAIMS_MODEL = process.env.CLAIMS_AI_MODEL ?? "claude-opus-4-8";
