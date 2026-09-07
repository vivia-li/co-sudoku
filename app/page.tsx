"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePuzzle, gridToString, type Difficulty } from "@/lib/sudoku";
import { generateRoomCode } from "@/lib/game";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getIdentity, saveIdentity } from "@/lib/player";

const DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: "easy", label: "简单", desc: "45 个提示数" },
  { value: "medium", label: "中等", desc: "36 个提示数" },
  { value: "hard", label: "困难", desc: "28 个提示数" },
];

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  useEffect(() => {
    setName(getIdentity().name);
  }, []);

  function updateName(value: string) {
    setName(value);
    const identity = getIdentity();
    saveIdentity({ ...identity, name: value });
  }

  async function createRoom() {
    if (!configured) {
      setError("Supabase 尚未配置，请先按 README 完成环境变量设置");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { puzzle } = generatePuzzle(difficulty);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode();
        const { error: insertError } = await supabase
          .from("rooms")
          .insert({ id: code, puzzle: gridToString(puzzle), difficulty });
        if (!insertError) {
          router.push(`/room/${code}`);
          return;
        }
      }
      setError("创建房间失败，请重试");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建房间失败");
    } finally {
      setBusy(false);
    }
  }

  function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("请输入有效的房间号");
      return;
    }
    router.push(`/room/${code}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] shadow-lg shadow-indigo-500/25">
          <span className="grid grid-cols-3 gap-1.5">
            {[1, 1, 0, 0, 1, 0, 1, 0, 1].map((filled, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-[2px] ${
                  filled ? "bg-white" : "bg-white/25"
                }`}
              />
            ))}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Co-Sudoku</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          与朋友实时协作，一起解开同一张数独棋盘
        </p>
      </div>

      {!configured && (
        <div className="mb-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          提示：Supabase 尚未配置。请参考项目 README 设置环境变量后再创建房间。
        </div>
      )}

      <div className="w-full space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            你的昵称
          </label>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            placeholder="输入昵称，方便朋友认出你"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-[var(--accent)] focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:bg-zinc-900"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            难度
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDifficulty(d.value)}
                className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  difficulty === d.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700"
                }`}
              >
                <div className="font-medium">{d.label}</div>
                <div className="mt-0.5 text-xs opacity-70">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={createRoom}
          disabled={busy}
          className="w-full rounded-lg bg-[var(--accent)] py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "创建中…" : "创建房间"}
        </button>

        <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          或加入已有房间
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="房间号，如 ABC123"
            maxLength={8}
            className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm uppercase tracking-widest outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-400 focus:border-[var(--accent)] focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:bg-zinc-900"
          />
          <button
            type="button"
            onClick={joinRoom}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-zinc-800 dark:text-zinc-200"
          >
            加入
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-500 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
