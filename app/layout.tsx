import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gemma 4 Chat — Chrome Prompt API",
  description: "On-device Gemma 4 chat with file workspace, AI file editing, and web search.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
