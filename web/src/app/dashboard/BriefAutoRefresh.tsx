"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The dashboard renders the rules-only ordering immediately and warms the AI
// ranking behind the response. Without this the agent would keep the heuristic
// ordering for their whole first session of the day — the ranking would be sitting
// in the cache, just never picked up. These refreshes collect it.
//
// Timings are measured, not guessed: against the dev project, a 14-claim book took
// ~46s from response flush to the cache row landing, so the original single 45s
// attempt raced the write and lost about half the time. First attempt now clears
// that comfortably; the second covers a larger book, or a first warm that Vercel's
// maxDuration cut short (the re-render schedules a fresh one).
//
// Both timers are scheduled once, on mount. That matters: if the first refresh
// finds the cache still cold, this component stays mounted and the effect does not
// re-run, so the second timer is the one already pending rather than a new one.
// When the cache is warm the server drops this component, unmounting it and
// clearing whatever is still scheduled.
const REFRESH_DELAYS_MS = [55_000, 115_000];

export default function BriefAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timers = REFRESH_DELAYS_MS.map((ms) => setTimeout(() => router.refresh(), ms));
    return () => timers.forEach(clearTimeout);
  }, [router]);
  return null;
}
