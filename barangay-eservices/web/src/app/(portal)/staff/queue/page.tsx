import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeading, Status, EmptyState } from "@/components/ui";
import { loadConcernQueue, queuePriority } from "@/lib/queue";
import { oneRelation } from "@/lib/format";

export default async function StaffQueuePage() {
  await requireUser(["staff", "admin"]);
  const supabase = await createClient();
  const queueItems = await loadConcernQueue(supabase);
  const queueCheckedAt = Date.now();
  return (
    <>
      <PageHeading title="Concern triage queue" description="Unassigned reports sorted by staff priority, with one urgency level added for every three days waiting." />
      {queueItems.length ? <div className="table-wrap"><table><thead><tr><th>Queue priority</th><th>Reference</th><th>Concern</th><th>Category</th><th>Purok</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
        <tbody>{queueItems.map((item) => { const category = oneRelation(item.concern_categories); const purok = oneRelation(item.puroks); return <tr key={item.id}>
          <td>{["Low", "Routine", "High", "Urgent"][queuePriority(Number(item.priority), item.created_at, queueCheckedAt) - 1]}</td><td>{item.reference_no ?? "—"}</td><td>{item.title}</td>
          <td>{category?.name}</td><td>{purok?.name}</td><td>{new Date(item.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td>
          <td><Status value={item.status} /></td><td><Link className="text-link" href={`/concerns/${item.id}`}>Review and assign</Link></td>
        </tr>; })}</tbody></table></div> : <EmptyState title="Queue is clear" text="No unassigned concerns need triage right now." />}
    </>
  );
}
