-- Co-Sudoku 数据库结构
-- 使用方法：在 Supabase 项目的 SQL Editor 里整段执行（可重复执行，幂等）。

-- 房间表
create table if not exists public.rooms (
  id text primary key,                 -- 房间号（6 位）
  puzzle text not null,                -- 题目（81 字符，0 表示空格）
  difficulty text not null,            -- easy | medium | hard
  created_at timestamptz not null default now()
);

-- 落子日志表（append-only，冲突天然规避）
create table if not exists public.moves (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  cell int not null check (cell between 0 and 80),
  value int not null check (value between 0 and 9),
  player_name text not null default 'anonymous',
  created_at timestamptz not null default now()
);

create index if not exists moves_room_idx on public.moves (room_id, id);

-- 笔记（候选数）表：每个格子每个数字一行，存在即代表该候选数被标记
create table if not exists public.notes (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  cell int not null check (cell between 0 and 80),
  digit int not null check (digit between 1 and 9),
  player_name text not null default 'anonymous',
  created_at timestamptz not null default now(),
  unique (room_id, cell, digit)
);

create index if not exists notes_room_idx on public.notes (room_id);

-- 关键：Realtime 的 DELETE 事件需要 REPLICA IDENTITY FULL，
-- 否则 old_record 只有主键、不含 room_id，带 room_id 过滤的客户端将收不到删除事件
--（表现为：自己删除笔记后其它玩家看不到，或本地擦除笔记后界面不刷新）。
alter table public.notes replica identity full;

-- 开启行级安全（RLS）
alter table public.rooms enable row level security;
alter table public.moves enable row level security;
alter table public.notes enable row level security;

-- MVP：允许匿名读写（房间号本身就是“密码”，足够短且难以猜中）
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms for select using (true);

drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms for insert with check (true);

drop policy if exists "moves_select" on public.moves;
create policy "moves_select" on public.moves for select using (true);

drop policy if exists "moves_insert" on public.moves;
create policy "moves_insert" on public.moves for insert with check (true);

drop policy if exists "notes_select" on public.notes;
create policy "notes_select" on public.notes for select using (true);

drop policy if exists "notes_insert" on public.notes;
create policy "notes_insert" on public.notes for insert with check (true);

drop policy if exists "notes_delete" on public.notes;
create policy "notes_delete" on public.notes for delete using (true);

-- 把 moves / notes 表加入 Realtime 发布（幂等写法）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moves'
  ) then
    alter publication supabase_realtime add table public.moves;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
