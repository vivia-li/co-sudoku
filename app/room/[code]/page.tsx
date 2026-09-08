"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  RealtimeChannel,
  RealtimePostgresDeletePayload,
  RealtimePostgresInsertPayload,
} from "@supabase/supabase-js";
import SudokuBoard from "@/components/SudokuBoard";
import PlayerList from "@/components/PlayerList";
import NumberPad from "@/components/NumberPad";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  EraserIcon,
  PenIcon,
  PencilIcon,
} from "@/components/icons";
import {
  findConflicts,
  isBoardComplete,
  peerCells,
  stringToGrid,
  type Grid,
} from "@/lib/sudoku";
import {
  buildBoard,
  type Move,
  type Note,
  type Player,
  type Room,
} from "@/lib/game";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getIdentity, type PlayerIdentity } from "@/lib/player";

type Status = "loading" | "ready" | "notfound" | "error" | "noconfig";

// 把笔记相关的数据库错误翻译成可读提示（重点是“表不存在”场景）
function noteErrorMessage(code?: string): string {
  if (code === "PGRST205") {
    return "笔记功能暂不可用：数据库缺少 notes 表，请在 Supabase SQL Editor 中执行 supabase/schema.sql 后重试。";
  }
  if (code === "23505") {
    return "该候选数已存在。";
  }
  return "笔记操作失败，请稍后重试。";
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const router = useRouter();

  const [identity, setIdentity] = useState<PlayerIdentity>({
    name: "…",
    color: "#ffffff",
  });
  const [room, setRoom] = useState<Room | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [copied, setCopied] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const presenceKey = useId();
  const selectedRef = useRef<number | null>(null);
  const boardRef = useRef<Grid | null>(null);
  const notesRef = useRef<Note[]>([]);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);

  const configured = isSupabaseConfigured();
  const supabase = configured ? getSupabase() : null;

  useEffect(() => {
    setIdentity(getIdentity());
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const puzzleGrid = useMemo<Grid | null>(
    () => (room ? stringToGrid(room.puzzle) : null),
    [room],
  );

  const board = useMemo<Grid | null>(() => {
    if (!room) return null;
    const sorted = [...moves].sort((a, b) => a.id - b.id);
    return buildBoard(room.puzzle, sorted);
  }, [room, moves]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const conflicts = useMemo(
    () => (board ? findConflicts(board) : new Set<string>()),
    [board],
  );

  const won = useMemo(
    () => board !== null && isBoardComplete(board) && conflicts.size === 0,
    [board, conflicts],
  );

  // 每个数字还剩多少个没填（9 - 当前已填数量，下限 0）
  const remaining = useMemo(() => {
    const counts = new Array<number>(10).fill(0);
    if (board) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const v = board[r][c];
          if (v >= 1 && v <= 9) counts[v]++;
        }
      }
    }
    return counts.map((n) => Math.max(0, 9 - n));
  }, [board]);

  // cell -> 笔记数字集合
  const noteMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const n of notes) {
      let s = map.get(n.cell);
      if (!s) {
        s = new Set<number>();
        map.set(n.cell, s);
      }
      s.add(n.digit);
    }
    return map;
  }, [notes]);

  const peers = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of players) {
      if (p.id !== presenceKey && p.cell != null) {
        map.set(p.cell, p.color);
      }
    }
    return map;
  }, [players, presenceKey]);

  const appendMove = useCallback((m: Move) => {
    setMoves((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  const appendNote = useCallback((n: Note) => {
    setNotes((prev) => (prev.some((x) => x.id === n.id) ? prev : [...prev, n]));
  }, []);

  const removeNoteById = useCallback((id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2200);
  }, []);

  // 初始加载：房间信息 + 历史落子 + 笔记
  useEffect(() => {
    if (!configured) {
      setStatus("noconfig");
      return;
    }
    if (!supabase || !code) return;
    let cancelled = false;

    (async () => {
      setStatus("loading");
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", code)
        .single();

      if (cancelled) return;
      if (roomError || !roomData) {
        setStatus(roomError?.code === "PGRST116" ? "notfound" : "error");
        return;
      }
      setRoom(roomData as Room);

      const { data: movesData, error: movesError } = await supabase
        .from("moves")
        .select("*")
        .eq("room_id", code)
        .order("id", { ascending: true });

      if (cancelled) return;
      if (movesError) {
        setStatus("error");
        return;
      }
      setMoves((movesData as Move[]) ?? []);

      // 笔记加载失败不阻塞进房；表不存在（PGRST205）时给出明确提示
      const { data: notesData, error: notesError } = await supabase
        .from("notes")
        .select("*")
        .eq("room_id", code)
        .order("id", { ascending: true });
      if (!cancelled) {
        if (notesError) {
          setNoteError(noteErrorMessage(notesError.code));
        } else {
          setNotes((notesData as Note[]) ?? []);
        }
      }

      if (!cancelled) setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [code, configured, supabase, reloadTick]);

  // 订阅实时落子 + 笔记 + 在线玩家 presence
  useEffect(() => {
    if (!supabase || !code || status !== "ready") return;

    const channel = supabase.channel(`room:${code}`, {
      config: { presence: { key: presenceKey } },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moves",
          filter: `room_id=eq.${code}`,
        },
        (payload: RealtimePostgresInsertPayload<Move>) => {
          appendMove(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notes",
          filter: `room_id=eq.${code}`,
        },
        (payload: RealtimePostgresInsertPayload<Note>) => {
          appendNote(payload.new);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notes",
          filter: `room_id=eq.${code}`,
        },
        (payload: RealtimePostgresDeletePayload<Note>) => {
          const id = payload.old?.id;
          if (id != null) removeNoteById(Number(id));
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{
          name?: string;
          color?: string;
          cell?: number | null;
        }>();
        const list: Player[] = [];
        for (const key of Object.keys(state)) {
          for (const p of state[key]) {
            list.push({
              id: key,
              name: p.name ?? "?",
              color: p.color ?? "#ffffff",
              cell: p.cell ?? null,
            });
          }
        }
        setPlayers(list);
      })
      .subscribe(async (subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          subscribedRef.current = true;
          await channel.track({
            name: identity.name,
            color: identity.color,
            cell: selectedRef.current,
          });
        }
      });

    channelRef.current = channel;
    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [
    supabase,
    code,
    status,
    identity,
    presenceKey,
    appendMove,
    appendNote,
    removeNoteById,
  ]);

  // 选中格变化时，同步到 presence
  useEffect(() => {
    if (subscribedRef.current && channelRef.current) {
      channelRef.current.track({
        name: identity.name,
        color: identity.color,
        cell: selected,
      });
    }
  }, [selected, identity]);

  const makeMove = useCallback(
    async (cell: number, value: number) => {
      if (!supabase || !room) return;
      const { data, error } = await supabase
        .from("moves")
        .insert({
          room_id: code,
          cell,
          value,
          player_name: identity.name,
        })
        .select()
        .single();
      if (!error && data) {
        appendMove(data as Move);
        // 填入正式数字后：
        // 1) 清除该格草稿
        // 2) 智能笔记：同行/列/宫其他格子里“该数字”的草稿一并删除
        if (value >= 1) {
          const peers = peerCells(cell);
          const peerSet = new Set(peers);
          // 本地立即同步移除相关笔记，避免依赖 Realtime DELETE 回推
          setNotes((prev) =>
            prev.filter(
              (n) =>
                n.cell !== cell && !(n.digit === value && peerSet.has(n.cell)),
            ),
          );
          void supabase
            .from("notes")
            .delete()
            .eq("room_id", code)
            .eq("cell", cell);
          void supabase
            .from("notes")
            .delete()
            .eq("room_id", code)
            .eq("digit", value)
            .in("cell", peers);
        }
      }
    },
    [supabase, room, code, identity.name, appendMove],
  );

  const toggleNote = useCallback(
    async (cell: number, digit: number) => {
      if (!supabase || !room) return;
      const exists = notesRef.current.some(
        (n) => n.cell === cell && n.digit === digit,
      );
      if (exists) {
        const { error } = await supabase
          .from("notes")
          .delete()
          .eq("room_id", code)
          .eq("cell", cell)
          .eq("digit", digit);
        if (!error) {
          setNotes((prev) =>
            prev.filter((n) => !(n.cell === cell && n.digit === digit)),
          );
        } else {
          setNoteError(noteErrorMessage(error.code));
        }
      } else {
        const { data, error } = await supabase
          .from("notes")
          .insert({ room_id: code, cell, digit, player_name: identity.name })
          .select()
          .single();
        if (!error && data) {
          appendNote(data as Note);
        } else if (error) {
          setNoteError(noteErrorMessage(error.code));
        }
      }
    },
    [supabase, room, code, identity.name, appendNote],
  );

  const clearNotesInCell = useCallback(
    async (cell: number) => {
      if (!supabase) return;
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("room_id", code)
        .eq("cell", cell);
      if (!error) {
        // 本地立即移除该格笔记，不依赖 Realtime 回推（Realtime DELETE 可能因过滤条件收不到）
        setNotes((prev) => prev.filter((n) => n.cell !== cell));
      } else {
        setNoteError(noteErrorMessage(error.code));
      }
    },
    [supabase, code],
  );

  // 擦除选中的格子：数字与笔记一并清空（不依赖当前是“数字”还是“笔记”模式）
  const eraseSelectedCell = useCallback(async () => {
    const sel = selectedRef.current;
    if (sel == null || !puzzleGrid) {
      showNotice("请先选择一个格子");
      return;
    }
    const r = Math.floor(sel / 9);
    const c = sel % 9;
    if (puzzleGrid[r][c] !== 0) return; // 题目格不可编辑
    const b = boardRef.current;
    if (b && b[r][c] !== 0) await makeMove(sel, 0); // 擦除数字
    await clearNotesInCell(sel); // 清空笔记
  }, [puzzleGrid, makeMove, clearNotesInCell, showNotice]);

  // 向当前选中的格子输入（数字键与九宫格共用；笔记模式下写草稿）
  const placeInSelectedCell = useCallback(
    (value: number) => {
      const sel = selectedRef.current;
      if (sel == null || !puzzleGrid) return;
      const r = Math.floor(sel / 9);
      const c = sel % 9;
      if (puzzleGrid[r][c] !== 0) return; // 题目格不可编辑

      if (value === 0) {
        void eraseSelectedCell();
        return;
      }

      if (noteMode) {
        const b = boardRef.current;
        if (b && b[r][c] !== 0) return; // 已填数字的格子不写笔记
        void toggleNote(sel, value);
      } else {
        void makeMove(sel, value);
      }
    },
    [puzzleGrid, noteMode, makeMove, toggleNote, eraseSelectedCell],
  );

  // 键盘输入
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        setNoteMode((v) => !v);
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        placeInSelectedCell(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        placeInSelectedCell(0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [placeInSelectedCell]);

  function onSelect(index: number) {
    setSelected((prev) => (prev === index ? null : index));
  }

  async function copyLink() {
    try {
      const url = `${window.location.origin}/room/${code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用
    }
  }

  if (status === "noconfig") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl">⚙️</p>
        <h1 className="mt-3 text-xl font-semibold">Supabase 尚未配置</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          请先设置{" "}
          <code className="text-[var(--accent)]">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          和{" "}
          <code className="text-[var(--accent)]">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          环境变量，并执行 supabase/schema.sql 建表。
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-6 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          返回首页
        </button>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-[var(--accent)] dark:border-zinc-800" />
      </main>
    );
  }

  if (status === "notfound" || status === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl">🔍</p>
        <h1 className="mt-3 text-xl font-semibold">
          {status === "notfound" ? "房间不存在" : "加载失败"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {status === "notfound"
            ? `没有找到房间「${code}」，请确认房间号是否正确。`
            : "网络或服务异常，请重试。"}
        </p>
        <button
          type="button"
          onClick={() =>
            status === "notfound" ? router.push("/") : setReloadTick((t) => t + 1)
          }
          className="mt-6 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          {status === "notfound" ? "返回首页" : "重试"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-3 py-3 sm:px-4 sm:py-6">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-3 sm:mb-4">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="ml-12 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          首页
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-mono text-sm tracking-[0.2em] dark:border-zinc-800 dark:bg-zinc-900">
            {code}
          </span>
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-zinc-800 dark:text-zinc-300"
          >
            {copied ? (
              <CheckIcon className="h-4 w-4" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
            {copied ? "已复制" : "邀请链接"}
          </button>
        </div>
      </header>

      {noteError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
          <span className="flex-1">{noteError}</span>
          <button
            type="button"
            onClick={() => setNoteError(null)}
            aria-label="关闭提示"
            className="shrink-0 rounded px-1 text-lg leading-none opacity-60 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start sm:gap-6">
        <div className="flex-1">
          {board && puzzleGrid && (
            <SudokuBoard
              board={board}
              puzzle={puzzleGrid}
              conflicts={conflicts}
              selected={selected}
              peers={peers}
              notes={noteMap}
              onSelect={onSelect}
            />
          )}
          <p className="mt-2 hidden text-center text-sm text-zinc-400 dark:text-zinc-500 sm:block">
            选中格子后输入数字 · 按{" "}
            <kbd className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-800">
              N
            </kbd>{" "}
            切换笔记模式 · 红色为冲突
          </p>
        </div>

        <aside className="w-full space-y-3 lg:w-72 lg:shrink-0 sm:space-y-4">
          <div className="flex gap-2">
            <div className="flex flex-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setNoteMode(false)}
                aria-pressed={!noteMode}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors sm:py-2 ${
                  !noteMode
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                <PenIcon className="h-4 w-4" />
                数字
              </button>
              <button
                type="button"
                onClick={() => setNoteMode(true)}
                aria-pressed={noteMode}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors sm:py-2 ${
                  noteMode
                    ? "bg-white text-[var(--accent)] shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                <PencilIcon className="h-4 w-4" />
                笔记
              </button>
            </div>
            <button
              type="button"
              onClick={() => void eraseSelectedCell()}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
            >
              <EraserIcon className="h-4 w-4" />
              擦除
            </button>
          </div>

          <NumberPad remaining={remaining} onSelect={placeInSelectedCell} />
          <PlayerList players={players} selfKey={presenceKey} />
        </aside>
      </div>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {notice}
        </div>
      )}

      {won && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              恭喜解出！
            </h2>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">
              你们合作完成了这道数独。
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-6 w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              再来一局
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
