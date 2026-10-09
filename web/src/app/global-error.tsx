"use client"; // Error boundaries must be Client Components

// Last-resort screen when the root layout itself fails. The server-side error is
// already reported via instrumentation.ts (onRequestError); this only keeps the user
// from staring at a blank page. Replaces the root layout, so it brings its own
// <html>/<body> and inline styles.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <h2>משהו השתבש</h2>
        <p>אפשר לנסות שוב. אם זה חוזר, כדאי לפנות למי ששלח לכם את הקישור.</p>
        {error.digest && <p style={{ color: "#888", fontSize: 12 }}>קוד: {error.digest}</p>}
        <button onClick={() => unstable_retry()} style={{ padding: "8px 16px", marginTop: 8 }}>
          נסו שוב
        </button>
      </body>
    </html>
  );
}
