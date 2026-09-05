export type PlayerIdentity = { name: string; color: string };

const KEY = "cosudoku.player";

const COLORS = [
  "#f472b6", // pink
  "#60a5fa", // blue
  "#34d399", // green
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#f87171", // red
  "#22d3ee", // cyan
  "#a3e635", // lime
];

export function getIdentity(): PlayerIdentity {
  if (typeof localStorage === "undefined") {
    return { name: "", color: COLORS[0] };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (parsed && typeof parsed.name === "string" && parsed.name) {
        return {
          name: parsed.name,
          color: parsed.color || COLORS[0],
        };
      }
    }
  } catch {
    // 忽略解析错误，回退到新身份
  }
  const identity: PlayerIdentity = {
    name: `玩家${Math.floor(1000 + Math.random() * 9000)}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // 忽略（隐私模式等）
  }
  return identity;
}

export function saveIdentity(identity: PlayerIdentity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // 忽略
  }
}
