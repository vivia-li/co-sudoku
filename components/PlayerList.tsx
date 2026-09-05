"use client";

import type { Player } from "@/lib/game";

export default function PlayerList({
  players,
  selfKey,
}: {
  players: Player[];
  selfKey: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-400">
        在线玩家 · {players.length}
      </h2>
      <ul className="space-y-2">
        {players.length === 0 && (
          <li className="text-sm text-zinc-500">等待其他玩家加入…</li>
        )}
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="truncate text-zinc-200">{p.name}</span>
            {p.id === selfKey && (
              <span className="shrink-0 text-xs text-zinc-500">（你）</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
