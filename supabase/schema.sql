-- Co-Sudoku 数据库结构
-- 使用方法：在 Supabase 项目的 SQL Editor 里整段执行。

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

-- 开启行级安全（RLS）
alter table public.rooms enable row level security;
alter table public.moves enable row level security;

-- MVP：允许匿名读写（房间号本身就是“密码”，足够短且难以猜中）
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms for select using (true);

drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms for insert with check (true);

drop policy if exists "moves_select" on public.moves;
create policy "moves_select" on public.moves for select using (true);

drop policy if exists "moves_insert" on public.moves;
create policy "moves_insert" on public.moves for insert with check (true);

-- 把 moves 表加入 Realtime 发布，以便订阅 INSERT 事件
alter publication supabase_realtime add table public.moves;
