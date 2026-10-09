"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// The operator keeps the dashboard open in a tab all day. Without this, a claim a
// client submitted (or a document they uploaded) after the page loaded stays
// invisible until she reloads by hand. Re-render on return to the tab, at most
// once a minute so tab-flipping doesn't hammer the server.
const MIN_INTERVAL_MS = 60_000;

export default function RefreshOnFocus() {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now(); // the page just rendered fresh
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last.current < MIN_INTERVAL_MS) return;
      last.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);
  return null;
}
