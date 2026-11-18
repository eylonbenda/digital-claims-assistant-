import Link from "next/link";
import { AuthCard, AuthError } from "../AuthCard";
import { ConfirmButton } from "./ConfirmButton";

// Landing page for the invite / password-reset email links:
//   /auth/confirm?token_hash=…&type=invite|recovery
// It deliberately does NOT verify the token on load — see api/auth/confirm.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = params.type === "invite" || params.type === "recovery" ? params.type : null;

  if (!tokenHash || !type) {
    return (
      <AuthCard title="הקישור אינו תקין">
        <div className="mt-6 space-y-4">
          <AuthError>הקישור חסר או שגוי. בקשו קישור חדש ונסו שוב.</AuthError>
          <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
            חזרה לכניסה
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={type === "invite" ? "ברוכים הבאים" : "איפוס סיסמה"}
      subtitle={
        type === "invite"
          ? "הוזמנתם למערכת ניהול תביעות הרכב. נשאר רק לבחור סיסמה."
          : "לחצו להמשך כדי לבחור סיסמה חדשה."
      }
    >
      <ConfirmButton tokenHash={tokenHash} type={type} />
    </AuthCard>
  );
}
