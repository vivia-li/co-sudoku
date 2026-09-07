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

  const presenceKey = useId();
  const selectedRef = useRef<number | null>(null);
  const boardRef = useRef<Grid | null>(null);
  const notesRef = useRef<Note[]>([]);

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

      // 笔记加载失败不阻塞进房（表不存在时静默跳过）
      const { data: notesData } = await supabase
        .from("notes")
        .select("*")
        .eq("room_id", code)
        .order("id", { ascending: true });
      if (!cancelled) {
        setNotes((notesData as Note[]) ?? []);
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
          if (typeof id === "number") removeNoteById(id);
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
            .in("cell", peerCells(cell));
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
        }
      } else {
        const { data, error } = await supabase
          .from("notes")
          .insert({ room_id: code, cell, digit, player_name: identity.name })
          .select()
          .single();
        if (!error && data) appendNote(data as Note);
      }
    },
    [supabase, room, code, identity.name, appendNote],
  );

  const clearNotesInCell = useCallback(
    async (cell: number) => {
      if (!supabase) return;
      await supabase.from("notes").delete().eq("room_id", code).eq("cell", cell);
    },
    [supabase, code],
  );

  // 向当前选中的格子输入（数字键与九宫格共用；笔记模式下写草稿）
  const placeInSelectedCell = useCallback(
    (value: number) => {
      const sel = selectedRef.current;
      if (sel == null || !puzzleGrid) return;
      const r = Math.floor(sel / 9);
      const c = sel % 9;
      if (puzzleGrid[r][c] !== 0) return; // 题目格不可编辑

      if (value === 0) {
        // 擦除：笔记模式下清空草稿，否则擦除数字
        if (noteMode) void clearNotesInCell(sel);
        else void makeMove(sel, 0);
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
    [puzzleGrid, noteMode, makeMove, toggleNote, clearNotesInCell],
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
          请先设置 <code className="text-sky-600 dark:text-sky-400">NEXT_PUBLIC_SUPABASE_URL</code> 和{" "}
          <code className="text-sky-600 dark:text-sky-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-500 dark:border-zinc-700 dark:border-t-sky-400" />
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="ml-12 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← 首页
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 font-mono text-sm tracking-widest dark:border-zinc-700 dark:bg-zinc-900">
            {code}
          </span>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:border-sky-500 hover:text-sky-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-sky-300"
          >
            {copied ? "已复制 ✓" : "复制邀请链接"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
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
          <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
            点击格子后用键盘或九宫格填写 · ✏️ 笔记模式打草稿（按 N 切换）· 红色为冲突
          </p>
        </div>

        <aside className="w-full space-y-3 lg:w-72 lg:shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setNoteMode((v) => !v)}
              aria-pressed={noteMode}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                noteMode
                  ? "border-amber-400 bg-amber-400/15 text-amber-700 dark:border-amber-500 dark:text-amber-300"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
              }`}
            >
              ✏️ 笔记{noteMode ? " 开" : " 关"}
            </button>
            <button
              type="button"
              onClick={() => placeInSelectedCell(0)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
            >
              🧹 擦除
            </button>
          </div>
          <NumberPad
            remaining={remaining}
            noteMode={noteMode}
            onSelect={placeInSelectedCell}
          />
          <PlayerList players={players} selfKey={presenceKey} />
        </aside>
      </div>

      {won && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-4 text-2xl font-bold">恭喜解出！</h2>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">
              你们合作完成了这道数独。
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-6 w-full rounded-lg bg-sky-500 py-2.5 font-semibold text-white hover:bg-sky-400"
            >
              再来一局
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
