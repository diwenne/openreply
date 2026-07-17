import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ManyChat Alternative - Instagram Comment to DM Campaign OS",
  description:
    "A B2B SaaS for sending Meta-compliant Instagram private replies when customers comment keywords on posts and reels.",
  keywords: [
    "instagram automation",
    "comment to DM",
    "instagram private replies",
    "social commerce",
    "manychat alternative",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
