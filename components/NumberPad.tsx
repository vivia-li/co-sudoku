"use client";

export default function NumberPad({
  remaining,
  noteMode = false,
  onSelect,
}: {
  /** index 1..9，表示该数字还剩多少个没填 */
  remaining: number[];
  /** 笔记模式下显示虚线边框，提示当前输入会写入草稿 */
  noteMode?: boolean;
  onSelect: (digit: number) => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
        const rem = remaining[d] ?? 0;
        const done = rem <= 0;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-lg font-semibold transition-colors ${
              noteMode ? "border-dashed " : ""
            }${
              done
                ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                : "border-zinc-300 bg-white text-zinc-800 hover:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-sky-500"
            }`}
          >
            <span className="leading-none">{d}</span>
            <span
              className={`mt-1 text-xs font-normal ${
                done ? "" : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {rem}
            </span>
          </button>
        );
      })}
    </div>
  );
}
