# Co-Sudoku 🧩

和朋友**实时协作**解同一张数独棋盘的网页应用。多人通过一个房间链接加入，在同一张棋盘上实时看到彼此的落子和光标。

## 功能

- 三种难度（简单 / 中等 / 困难），题目生成保证唯一解
- 创建房间，分享链接邀请好友实时协作
- 实时同步落子 + 在线玩家列表 + 各自选中格高亮
- 数字九宫格输入（标注每个数字还剩几个），键盘 1–9 / 退格同样可用
- 笔记模式（✏️ 打草稿，候选数实时同步，按 N 或点击按钮切换）
- 深色 / 浅色背景一键切换（左上角按钮，自动记忆）
- 冲突高亮（同行/列/宫重复）与胜利提示

## 技术栈

- **前端**：Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **实时 + 数据库**：Supabase（Postgres + Realtime + Presence）
- **托管**：Vercel

## 本地运行

1. 安装依赖

   ```bash
   npm install
   ```

2. 在 [Supabase](https://supabase.com) 新建项目，打开 **SQL Editor**，把 [`supabase/schema.sql`](supabase/schema.sql) 整段粘贴执行（建表 + 开启 RLS + 启用 Realtime）。

3. 在 Supabase 项目 **Settings → API** 找到 Project URL 和 `anon` key，复制环境变量：

   ```bash
   cp .env.example .env.local
   # 编辑 .env.local，填入 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

4. 启动开发服务器

   ```bash
   npm run dev
   ```

   打开 http://localhost:3000

## 部署到 Vercel

1. 把本仓库推送到 GitHub（或直接导入 Vercel）。
2. 在 Vercel 新建项目并导入该仓库，框架选择 Next.js。
3. 在项目 **Settings → Environment Variables** 添加 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
4. Deploy。把部署后的链接发给朋友即可联机。

## 数据库结构

- `rooms`：房间（房间号、题目、难度）
- `moves`：落子日志（append-only，按 id 顺序回放重建棋盘，天然规避并发覆盖）
- `notes`：笔记 / 候选数（每个格子每个数字一行，存在即标记，实时同步插入与删除）

实时同步基于 Supabase Realtime 的 Postgres Changes（`moves` / `notes` 表事件）与 Presence（在线玩家 + 选中格）。
