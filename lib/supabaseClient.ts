import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase 未配置：请在环境变量中设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}
