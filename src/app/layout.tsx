import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenSpeck - AI 助手",
  description: "基于 Gemini 的智能 AI 助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
