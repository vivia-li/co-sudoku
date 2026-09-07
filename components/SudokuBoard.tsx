"use client";

import type { CSSProperties } from "react";
import { SIZE, type Grid } from "@/lib/sudoku";

type Props = {
  board: Grid;
  puzzle: Grid;
  conflicts: Set<string>;
  selected: number | null;
  peers: Map<number, string>;
  notes: Map<number, Set<number>>;
  onSelect: (index: number) => void;
};

function borderStyle(r: number, c: number): CSSProperties {
  const strongTop = r % 3 === 0;
  const strongLeft = c % 3 === 0;
  return {
    borderStyle: "solid",
    borderTopWidth: strongTop ? 2 : 1,
    borderTopColor: strongTop ? "var(--board-line-strong)" : "var(--board-line)",
    borderLeftWidth: strongLeft ? 2 : 1,
    borderLeftColor: strongLeft ? "var(--board-line-strong)" : "var(--board-line)",
    borderRightWidth: c === SIZE - 1 ? 2 : 0,
    borderRightColor: "var(--board-line-strong)",
    borderBottomWidth: r === SIZE - 1 ? 2 : 0,
    borderBottomColor: "var(--board-line-strong)",
  };
}

export default function SudokuBoard({
  board,
  puzzle,
  conflicts,
  selected,
  peers,
  notes,
  onSelect,
}: Props) {
  const selectedValue =
    selected != null ? board[Math.floor(selected / SIZE)][selected % SIZE] : 0;
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const value = board[r][c];
    const clue = puzzle[r][c] !== 0;
    const isSelected = selected === i;
    const peerColor = peers.get(i);
    const conflict = conflicts.has(`${r},${c}`);
    const noteSet = notes.get(i);
    const sameDigit = selectedValue !== 0 && value === selectedValue;

    cells.push(
      <div
        key={i}
        onClick={() => onSelect(i)}
        className={`group relative flex aspect-square cursor-pointer items-center justify-center text-xl font-medium tabular-nums transition-colors sm:text-3xl ${
          clue
            ? "bg-zinc-50/60 text-zinc-900 dark:bg-zinc-900/30 dark:text-zinc-100"
            : "text-[var(--accent)]"
        } ${conflict ? "!text-red-500 dark:!text-red-400" : ""}`}
        style={borderStyle(r, c)}
      >
        {/* 悬停提示 */}
        <span className="pointer-events-none absolute inset-0 bg-transparent transition-colors group-hover:bg-[var(--accent-softer)]" />
        {/* 选中高亮 */}
        {isSelected && (
          <span className="pointer-events-none absolute inset-0 bg-[var(--accent-soft)]" />
        )}
        {/* 相同数字高亮 */}
        {!isSelected && sameDigit && (
          <span className="pointer-events-none absolute inset-0 bg-[var(--accent-softer)]" />
        )}
        {/* 其他玩家所在格 */}
        {peerColor && !isSelected && (
          <span
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: `inset 0 0 0 2px ${peerColor}` }}
          />
        )}
        {value !== 0 ? (
          <span
            className={`relative ${clue ? "font-semibold" : "font-medium"}`}
          >
            {value}
          </span>
        ) : noteSet && noteSet.size > 0 ? (
          <span className="relative grid h-full w-full grid-cols-3 grid-rows-3 p-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <span
                key={d}
                className={`flex items-center justify-center text-[0.45em] leading-none ${
                  selectedValue === d
                    ? "font-semibold text-[var(--accent)]"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {noteSet.has(d) ? d : ""}
              </span>
            ))}
          </span>
        ) : null}
      </div>,
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[480px] grid-cols-9 overflow-hidden rounded-xl bg-white shadow-lg shadow-zinc-900/[0.04] ring-1 ring-zinc-900/5 lg:max-w-[540px] dark:bg-zinc-950 dark:shadow-black/40 dark:ring-white/5">
      {cells}
    </div>
  );
}
