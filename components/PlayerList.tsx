"use client";

import type { Player } from "@/lib/game";
import { UsersIcon } from "@/components/icons";

export default function PlayerList({
  players,
  selfKey,
}: {
  players: Player[];
  selfKey: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:mb-3">
        <UsersIcon className="h-3.5 w-3.5" />
        在线玩家
        <span className="ml-auto text-zinc-300 dark:text-zinc-600">
          {players.length}
        </span>
      </h2>
      <ul className="space-y-2 sm:space-y-2.5">
        {players.length === 0 && (
          <li className="text-sm text-zinc-400 dark:text-zinc-500">
            等待其他玩家加入…
          </li>
        )}
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/60 dark:ring-black/40"
              style={{ backgroundColor: p.color }}
            />
            <span className="truncate text-zinc-700 dark:text-zinc-200">
              {p.name}
            </span>
            {p.id === selfKey && (
              <span className="shrink-0 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                你
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
