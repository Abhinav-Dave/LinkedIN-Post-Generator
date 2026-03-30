import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkedIn Post Generator",
  description: "B2B LinkedIn batch generator with trend + style-guide grounding",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</body>
    </html>
  );
}
