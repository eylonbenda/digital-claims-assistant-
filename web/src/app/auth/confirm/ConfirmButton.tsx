"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, authButtonClass } from "../AuthCard";

export function ConfirmButton({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type: "invite" | "recovery";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type }),
      });
      if (!res.ok) {
        setError(
          type === "invite"
            ? "פג תוקף הקישור או שכבר נעשה בו שימוש. בקשו הזמנה חדשה."
            : "פג תוקף הקישור או שכבר נעשה בו שימוש. בקשו קישור איפוס חדש."
        );
        setBusy(false);
        return;
      }
      router.push("/auth/set-password");
      router.refresh();
    } catch {
      setError("שגיאת רשת");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {error && <AuthError>{error}</AuthError>}
      <button type="button" onClick={handleClick} disabled={busy} className={authButtonClass}>
        {busy ? "רגע…" : "המשך"}
      </button>
      {error && type === "recovery" && (
        <Link
          href="/login/forgot"
          className="block text-center text-sm text-blue-600 hover:underline"
        >
          שליחת קישור חדש
        </Link>
      )}
    </div>
  );
}
