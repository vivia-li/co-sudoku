// 数独核心逻辑：生成器（保证唯一解）、求解器、冲突检测。

export type Grid = number[][]; // 9x9，0 表示空格
export type Difficulty = "easy" | "medium" | "hard";

export const SIZE = 9;
export const EMPTY = 0;

const CLUES: Record<Difficulty, number> = {
  easy: 45,
  medium: 36,
  hard: 28,
};

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid(grid: Grid, row: number, col: number, num: number): boolean {
  for (let i = 0; i < SIZE; i++) {
    if (grid[row][i] === num) return false;
    if (grid[i][col] === num) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === num) return false;
    }
  }
  return true;
}

function findEmpty(grid: Grid): [number, number] | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === EMPTY) return [r, c];
    }
  }
  return null;
}

// 回溯求解（用随机顺序遍历数字，因此能生成随机解）
function solveGrid(grid: Grid): boolean {
  const cell = findEmpty(grid);
  if (!cell) return true;
  const [r, c] = cell;
  for (const num of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (isValid(grid, r, c, num)) {
      grid[r][c] = num;
      if (solveGrid(grid)) return true;
      grid[r][c] = EMPTY;
    }
  }
  return false;
}

// 统计解的个数，达到 limit 即提前返回（用于唯一解判定）
function countSolutions(grid: Grid, limit: number): number {
  const cell = findEmpty(grid);
  if (!cell) return 1;
  const [r, c] = cell;
  let count = 0;
  for (let num = 1; num <= 9; num++) {
    if (isValid(grid, r, c, num)) {
      grid[r][c] = num;
      count += countSolutions(grid, limit);
      grid[r][c] = EMPTY;
      if (count >= limit) return count;
    }
  }
  return count;
}

function generateSolution(): Grid {
  const grid = emptyGrid();
  solveGrid(grid);
  return grid;
}

// 生成一道有唯一解的题目。单格贪心挖空 + 多轮重试，尽量逼近目标提示数。
export function generatePuzzle(difficulty: Difficulty): {
  puzzle: Grid;
  solution: Grid;
} {
  const targetClues = CLUES[difficulty];
  const targetRemoved = SIZE * SIZE - targetClues;

  const allPositions: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) allPositions.push([r, c]);
  }

  let best: { puzzle: Grid; solution: Grid; removed: number } | null = null;

  // hard 需要挖得更狠，给更多尝试次数
  const attempts = difficulty === "hard" ? 60 : 20;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateSolution();
    const puzzle = solution.map((row) => [...row]);
    let removed = 0;

    for (const [r, c] of shuffle(allPositions)) {
      if (removed >= targetRemoved) break;
      const backup = puzzle[r][c];
      puzzle[r][c] = EMPTY;
      if (countSolutions(puzzle, 2) === 1) {
        removed++;
      } else {
        puzzle[r][c] = backup;
      }
    }

    if (removed >= targetRemoved) {
      return { puzzle, solution };
    }
    if (!best || removed > best.removed) {
      best = { puzzle, solution, removed };
    }
  }

  // 极罕见情况下达不到目标，返回挖得最狠的那个（仍保证唯一解）
  return { puzzle: best!.puzzle, solution: best!.solution };
}

// —— 序列化（用于存入数据库 / 传输）——
export function gridToString(grid: Grid): string {
  return grid.flat().join("");
}

export function stringToGrid(s: string): Grid {
  const nums = s
    .slice(0, 81)
    .padEnd(81, "0")
    .split("")
    .map((ch) => (ch === "0" || ch === "." ? 0 : Number(ch)));
  const grid: Grid = [];
  for (let r = 0; r < SIZE; r++) {
    grid.push(nums.slice(r * SIZE, (r + 1) * SIZE));
  }
  return grid;
}

// 返回冲突格子的 "r,c" 集合（同行/列/宫重复）
export function findConflicts(board: Grid): Set<string> {
  const conflicts = new Set<string>();
  const seen = new Map<number, [number, number]>();

  const checkUnit = (cells: [number, number][]) => {
    seen.clear();
    for (const [r, c] of cells) {
      const v = board[r][c];
      if (v === EMPTY) continue;
      const prev = seen.get(v);
      if (prev) {
        conflicts.add(`${r},${c}`);
        conflicts.add(`${prev[0]},${prev[1]}`);
      } else {
        seen.set(v, [r, c]);
      }
    }
  };

  // 行
  for (let r = 0; r < SIZE; r++) {
    const cells: [number, number][] = [];
    for (let c = 0; c < SIZE; c++) cells.push([r, c]);
    checkUnit(cells);
  }
  // 列
  for (let c = 0; c < SIZE; c++) {
    const cells: [number, number][] = [];
    for (let r = 0; r < SIZE; r++) cells.push([r, c]);
    checkUnit(cells);
  }
  // 宫
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells: [number, number][] = [];
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push([r, c]);
      }
      checkUnit(cells);
    }
  }

  return conflicts;
}

export function isBoardComplete(board: Grid): boolean {
  return board.every((row) => row.every((v) => v !== EMPTY));
}

// 与某格同行/列/宫的其它格子（不含自身），用于智能笔记
export function peerCells(cell: number): number[] {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const set = new Set<number>();
  for (let i = 0; i < SIZE; i++) {
    set.add(r * SIZE + i);
    set.add(i * SIZE + c);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      set.add(rr * SIZE + cc);
    }
  }
  set.delete(cell);
  return [...set];
}
