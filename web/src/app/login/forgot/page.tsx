"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthError, authButtonClass, authInputClass } from "../../auth/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError("השליחה נכשלה. נסו שוב.");
        return;
      }
      setSent(true);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="שכחתי סיסמה" subtitle="נשלח קישור לבחירת סיסמה חדשה">
      {sent ? (
        <p className="mt-6 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          אם הכתובת רשומה במערכת, נשלח אליה עכשיו קישור לאיפוס הסיסמה.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm text-zinc-600">אימייל</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className={authInputClass}
            />
          </label>

          {error && <AuthError>{error}</AuthError>}

          <button type="submit" disabled={busy} className={authButtonClass}>
            {busy ? "שולח…" : "שליחת קישור"}
          </button>
        </form>
      )}

      <Link href="/login" className="mt-4 block text-center text-sm text-blue-600 hover:underline">
        חזרה לכניסה
      </Link>
    </AuthCard>
  );
}
