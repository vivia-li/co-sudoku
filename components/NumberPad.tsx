"use client";

export default function NumberPad({
  remaining,
  onSelect,
}: {
  /** index 1..9，表示该数字还剩多少个没填 */
  remaining: number[];
  onSelect: (digit: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
        const rem = remaining[d] ?? 0;
        const done = rem <= 0;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-label={`输入 ${d}`}
            className={`relative flex h-11 flex-col items-center justify-center rounded-xl border text-lg font-semibold transition-all duration-150 active:scale-95 sm:h-16 sm:text-xl ${
              done
                ? "border-transparent bg-zinc-100 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-600"
                : "border-zinc-200 bg-white text-zinc-800 shadow-sm hover:border-[var(--accent)] hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-[var(--accent)]"
            }`}
          >
            <span className="leading-none tabular-nums">{d}</span>
            <span
              className={`mt-0.5 text-[10px] font-medium leading-none tabular-nums sm:mt-1 sm:text-[11px] ${
                done
                  ? "text-zinc-300 dark:text-zinc-600"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {done ? "·" : rem}
            </span>
          </button>
        );
      })}
    </div>
  );
}
