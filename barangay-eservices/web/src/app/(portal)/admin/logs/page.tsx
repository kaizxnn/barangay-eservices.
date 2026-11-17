import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, oneRelation } from "@/lib/format";
import { EmptyState, PageHeading } from "@/components/ui";

export default async function AdminLogsPage() {
  await requireUser(["admin"]);
  const supabase = await createClient();
  const { data: logs, error } = await supabase.from("activity_logs")
    .select("id,action,entity_type,entity_id,details,created_at,profiles(first_name,last_name)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Could not load the activity log: ${error.message}`);
  return (
    <>
      <PageHeading title="Activity log" description="Recent system actions and record updates." />
      {logs?.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Account</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
        {logs.map((log) => { const actor = oneRelation(log.profiles); return <tr key={log.id}><td>{formatDate(log.created_at)}</td><td>{actor ? `${actor.first_name} ${actor.last_name}` : "System"}</td>
          <td>{log.action.replaceAll("_", " ")}</td><td>{log.entity_type ?? "—"} {log.entity_id ?? ""}</td><td>{log.details ?? "—"}</td></tr>; })}
      </tbody></table></div> : <EmptyState title="No activity recorded" text="New account and workflow activity will appear here." />}
    </>
  );
}
