"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
} from "@supabase/supabase-js";
import SudokuBoard from "@/components/SudokuBoard";
import PlayerList from "@/components/PlayerList";
import {
  findConflicts,
  isBoardComplete,
  stringToGrid,
  type Grid,
} from "@/lib/sudoku";
import { buildBoard, type Move, type Player, type Room } from "@/lib/game";
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [copied, setCopied] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const presenceKey = useId();
  const selectedRef = useRef<number | null>(null);

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

  const puzzleGrid = useMemo<Grid | null>(
    () => (room ? stringToGrid(room.puzzle) : null),
    [room],
  );

  const board = useMemo<Grid | null>(() => {
    if (!room) return null;
    const sorted = [...moves].sort((a, b) => a.id - b.id);
    return buildBoard(room.puzzle, sorted);
  }, [room, moves]);

  const conflicts = useMemo(
    () => (board ? findConflicts(board) : new Set<string>()),
    [board],
  );

  const won = useMemo(
    () =>
      board !== null && isBoardComplete(board) && conflicts.size === 0,
    [board, conflicts],
  );

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

  // 初始加载：房间信息 + 历史落子
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
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [code, configured, supabase, reloadTick]);

  // 订阅实时落子 + 在线玩家 presence
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
  }, [supabase, code, status, identity, presenceKey, appendMove]);

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
      if (!error && data) appendMove(data as Move);
    },
    [supabase, room, code, identity.name, appendMove],
  );

  // 键盘输入
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const sel = selectedRef.current;
      if (sel == null || !puzzleGrid) return;
      const r = Math.floor(sel / 9);
      const c = sel % 9;
      if (puzzleGrid[r][c] !== 0) return; // 题目格不可编辑
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        void makeMove(sel, Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        void makeMove(sel, 0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [puzzleGrid, makeMove]);

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
        <p className="mt-2 text-sm text-zinc-400">
          请先设置 <code className="text-sky-400">NEXT_PUBLIC_SUPABASE_URL</code> 和{" "}
          <code className="text-sky-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
          环境变量，并执行 supabase/schema.sql 建表。
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 text-sm"
        >
          返回首页
        </button>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400 h-8 w-8" />
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
        <p className="mt-2 text-sm text-zinc-400">
          {status === "notfound"
            ? `没有找到房间「${code}」，请确认房间号是否正确。`
            : "网络或服务异常，请重试。"}
        </p>
        <button
          type="button"
          onClick={() =>
            status === "notfound" ? router.push("/") : setReloadTick((t) => t + 1)
          }
          className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 text-sm"
        >
          {status === "notfound" ? "返回首页" : "重试"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← 首页
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-mono tracking-widest">
            {code}
          </span>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-sky-500 hover:text-sky-300"
          >
            {copied ? "已复制 ✓" : "复制邀请链接"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          {board && puzzleGrid && (
            <SudokuBoard
              board={board}
              puzzle={puzzleGrid}
              conflicts={conflicts}
              selected={selected}
              peers={peers}
              onSelect={onSelect}
            />
          )}
          <p className="mt-4 text-center text-sm text-zinc-500">
            点击格子后用数字键 1–9 填写，退格键擦除 · 红色表示冲突
          </p>
        </div>

        <aside className="w-full space-y-4 lg:w-64">
          <PlayerList
            players={players}
            selfKey={presenceKey}
          />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            <h2 className="mb-2 font-semibold text-zinc-300">如何一起玩</h2>
            <p>把上面的邀请链接发给朋友，大家会在同一张棋盘上实时看到彼此的落子。</p>
          </div>
        </aside>
      </div>

      {won && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-8 text-center">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-4 text-2xl font-bold">恭喜解出！</h2>
            <p className="mt-2 text-zinc-400">你们合作完成了这道数独。</p>
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
