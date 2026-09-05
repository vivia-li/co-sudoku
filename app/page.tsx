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
        // 房间号碰撞（极小概率），换一个重试
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
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mb-3 text-5xl">🧩</div>
        <h1 className="text-4xl font-bold tracking-tight">Co-Sudoku</h1>
        <p className="mt-2 text-zinc-400">和朋友实时协作，一起解同一张数独棋盘</p>
      </div>

      {!configured && (
        <div className="mb-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          提示：Supabase 尚未配置。请参考项目 README 设置环境变量后再创建房间。
        </div>
      )}

      <div className="w-full space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            你的昵称
          </label>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            placeholder="输入昵称，方便朋友认出你"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            难度
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDifficulty(d.value)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  difficulty === d.value
                    ? "border-sky-500 bg-sky-500/15 text-sky-300"
                    : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                <div className="font-medium">{d.label}</div>
                <div className="text-xs opacity-70">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={createRoom}
          disabled={busy}
          className="w-full rounded-lg bg-sky-500 py-3 font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "创建中…" : "创建房间"}
        </button>

        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span className="h-px flex-1 bg-zinc-800" />
          或加入已有房间
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="房间号，如 ABC123"
            maxLength={8}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-sky-500"
          />
          <button
            type="button"
            onClick={joinRoom}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-sky-500 hover:text-sky-300"
          >
            加入
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
