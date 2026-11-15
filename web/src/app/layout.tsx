import type { Metadata } from "next";
import { Geist_Mono, Heebo } from "next/font/google";
import "./globals.css";

// Heebo is a variable font with real Hebrew glyphs — the previous sans (Geist) is
// latin-only, so every Hebrew string fell back to a system font.
const heebo = Heebo({ variable: "--font-heebo", subsets: ["hebrew", "latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "עוזר התביעות הדיגיטלי",
  description: "מערכת ניהול תביעות רכב לסוכני ביטוח",
  icons: {
    icon: [
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
