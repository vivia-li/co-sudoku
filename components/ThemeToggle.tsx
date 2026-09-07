"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

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
      className="fixed left-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/80 text-zinc-500 shadow-sm backdrop-blur transition-colors hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      {dark ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
    </button>
  );
}
