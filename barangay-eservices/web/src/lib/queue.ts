import type { SupabaseClient } from "@supabase/supabase-js";

export function queuePriority(priority: number, createdAt: string, now = Date.now()) {
  const ageDays = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 86_400_000));
  return Math.min(4, priority + Math.floor(ageDays / 3));
}

export function compareQueueItems<T extends { id: string; priority: number; created_at: string }>(a: T, b: T, now = Date.now()) {
  return queuePriority(b.priority, b.created_at, now) - queuePriority(a.priority, a.created_at, now)
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id);
}

export async function loadConcernQueue(supabase: SupabaseClient) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("concerns")
      .select("id,reference_no,title,priority,status,created_at,concern_categories(name),puroks(name)")
      .in("status", ["Submitted", "Under Review"]).is("assigned_to", null).eq("is_archived", false)
      .order("created_at", { ascending: true }).order("id").range(from, from + 999);
    if (error) throw new Error(`Could not load the concern queue: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const now = Date.now();
  return rows.sort((a, b) => compareQueueItems(a, b, now));
}
