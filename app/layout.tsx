import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Semantic Journey — Semantic Accessibility Journey Analyzer",
  description:
    "Test whether an interface still makes sense when you experience it through semantics instead of sight.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
