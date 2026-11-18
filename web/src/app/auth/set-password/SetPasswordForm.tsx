"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { AuthError, authButtonClass, authInputClass } from "../AuthCard";

const ERRORS: Record<string, string> = {
  weak_password: `הסיסמה חלשה מדי — לפחות ${MIN_PASSWORD_LENGTH} תווים.`,
  same_password: "זו הסיסמה הנוכחית. בחרו סיסמה אחרת.",
  no_session: "פג תוקף ההתחברות. פתחו שוב את הקישור מהמייל.",
};

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) {
      setError("הסיסמאות אינן זהות.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(ERRORS[json.error] ?? "שמירת הסיסמה נכשלה. נסו שוב.");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("שגיאת רשת");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm text-zinc-600">סיסמה חדשה</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          autoFocus
          className={authInputClass}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          לפחות {MIN_PASSWORD_LENGTH} תווים
        </span>
      </label>

      <label className="block">
        <span className="text-sm text-zinc-600">אימות סיסמה</span>
        <input
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={authInputClass}
        />
      </label>

      {error && <AuthError>{error}</AuthError>}

      <button type="submit" disabled={busy} className={authButtonClass}>
        {busy ? "שומר…" : "שמירה וכניסה"}
      </button>
    </form>
  );
}
