"use client";

import type { CSSProperties } from "react";
import { SIZE, type Grid } from "@/lib/sudoku";

type Props = {
  board: Grid;
  puzzle: Grid;
  conflicts: Set<string>;
  selected: number | null;
  peers: Map<number, string>;
  onSelect: (index: number) => void;
};

function borderStyle(r: number, c: number): CSSProperties {
  return {
    borderStyle: "solid",
    borderColor: "#3f3f46", // zinc-700
    borderTopWidth: r % 3 === 0 ? 2 : 1,
    borderLeftWidth: c % 3 === 0 ? 2 : 1,
    borderRightWidth: c === SIZE - 1 ? 2 : 0,
    borderBottomWidth: r === SIZE - 1 ? 2 : 0,
  };
}

export default function SudokuBoard({
  board,
  puzzle,
  conflicts,
  selected,
  peers,
  onSelect,
}: Props) {
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const value = board[r][c];
    const clue = puzzle[r][c] !== 0;
    const isSelected = selected === i;
    const peerColor = peers.get(i);
    const conflict = conflicts.has(`${r},${c}`);

    cells.push(
      <div
        key={i}
        onClick={() => onSelect(i)}
        className={`relative flex aspect-square cursor-pointer items-center justify-center text-xl font-medium tabular-nums sm:text-3xl ${
          clue ? "bg-zinc-800/40 text-zinc-100" : "text-sky-400"
        } ${conflict ? "!text-red-500" : ""}`}
        style={borderStyle(r, c)}
      >
        {isSelected && (
          <span className="pointer-events-none absolute inset-0 bg-sky-400/25" />
        )}
        {peerColor && !isSelected && (
          <span
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: `inset 0 0 0 2px ${peerColor}` }}
          />
        )}
        {value !== 0 && <span className="relative">{value}</span>}
      </div>,
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[480px] grid-cols-9 overflow-hidden rounded-lg bg-zinc-950 shadow-xl shadow-black/40">
      {cells}
    </div>
  );
}
