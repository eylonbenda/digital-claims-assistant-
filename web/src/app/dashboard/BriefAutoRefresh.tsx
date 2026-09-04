"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The dashboard renders the rules-only ordering immediately and warms the AI
// ranking behind the response. Without this the agent would keep the heuristic
// ordering for their whole first session of the day — the ranking would be sitting
// in the cache, just never picked up. One delayed refresh collects it.
//
// Deliberately one shot, not a poll: the warm either lands inside the window or it
// doesn't, and a retry loop would re-trigger `after()` on every attempt and pay for
// the model again. If this refresh is too early, the next navigation picks it up.
const REFRESH_DELAY_MS = 45_000;

export default function BriefAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}
