import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Co-Sudoku · 联机数独",
  description: "和朋友实时协作，一起解同一张数独棋盘",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
