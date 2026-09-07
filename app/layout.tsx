import type { Metadata } from "next";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Co-Sudoku · 联机数独",
  description: "和朋友实时协作，一起解同一张数独棋盘",
};

// 在 React 水合前根据 localStorage 设置主题，避免闪烁
const themeInitScript = `
(function () {
  try {
    if (localStorage.getItem('cosudoku.theme') === 'light') {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
