"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cosudoku.theme", next ? "dark" : "light");
    } catch {
      // 忽略（隐私模式等）
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "切换到浅色背景" : "切换到深色背景"}
      title={dark ? "切换到浅色背景" : "切换到深色背景"}
      className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-lg shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
