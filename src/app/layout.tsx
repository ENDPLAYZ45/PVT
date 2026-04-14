import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PVT — Private E2E Encrypted Messaging",
  description:
    "A privacy-first messaging platform with end-to-end encryption. Your messages, your keys, your privacy.",
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
