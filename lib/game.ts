import {
  EMPTY,
  SIZE,
  type Grid,
  gridToString,
  stringToGrid,
} from "./sudoku";

export type Difficulty = "easy" | "medium" | "hard";

export type Room = {
  id: string;
  puzzle: string; // 81 字符题目
  difficulty: Difficulty;
  created_at: string;
};

export type Move = {
  id: number;
  room_id: string;
  cell: number; // 0..80
  value: number; // 0..9，0 表示擦除
  player_name: string;
  created_at: string;
};

export type Note = {
  id: number;
  room_id: string;
  cell: number; // 0..80
  digit: number; // 1..9，笔记（候选数）
  player_name: string;
  created_at: string;
};

export type Player = {
  id: string;
  name: string;
  color: string;
  cell: number | null; // 当前选中的格子
};

// 去掉易混淆字符 0/O/1/I
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(len = 6): string {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < len; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

// 题目格是否已给定（不能修改）
export function isClue(puzzle: Grid, r: number, c: number): boolean {
  return puzzle[r][c] !== EMPTY;
}

// 由题目 + 落子日志重建棋盘（按日志顺序，后落子覆盖先落子；题目格不可覆盖）
export function buildBoard(puzzleStr: string, moves: Move[]): Grid {
  const puzzle = stringToGrid(puzzleStr);
  const board = puzzle.map((row) => [...row]);
  for (const m of moves) {
    const r = Math.floor(m.cell / SIZE);
    const c = m.cell % SIZE;
    if (isClue(puzzle, r, c)) continue;
    board[r][c] = m.value;
  }
  return board;
}

export function cellToIndex(r: number, c: number): number {
  return r * SIZE + c;
}

export function indexToCell(index: number): [number, number] {
  return [Math.floor(index / SIZE), index % SIZE];
}

export function boardToString(board: Grid): string {
  return gridToString(board);
}
