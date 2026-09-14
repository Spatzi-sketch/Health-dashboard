import type { Metadata } from "next";

// Self-hosted fonts (via @fontsource) instead of next/font/google so the
// dashboard builds and runs fully offline — no runtime call to
// fonts.googleapis.com. The same font-family names are bound to the
// `--font-*` CSS variables in globals.css.
import "@fontsource/geist-sans/index.css";
import "@fontsource/geist-mono/index.css";
import "@fontsource/inter/index.css";
import "@fontsource/instrument-serif/index.css";
import "@fontsource/jetbrains-mono/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROWZY",
  description:
    "The ROWZY dashboard starter — real interface, demo data, zero keys.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
