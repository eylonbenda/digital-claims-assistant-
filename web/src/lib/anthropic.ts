import Anthropic from "@anthropic-ai/sdk";

// Lazy, null-safe client — returns null when no key is configured so importing
// modules (e.g. route handlers) don't crash at build/import time.
export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// Default to Opus 4.8 (best quality). Override via env if you want a cheaper tier.
export const CLAIMS_MODEL = process.env.CLAIMS_AI_MODEL ?? "claude-opus-4-8";
