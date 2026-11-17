import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, oneRelation } from "@/lib/format";
import { EmptyState, PageHeading, Status } from "@/components/ui";

export default async function ConcernsPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  let query = supabase.from("concerns")
    .select("id,reference_no,title,priority,status,is_archived,created_at,concern_categories(name),puroks(name)")
    .order("created_at", { ascending: false }).limit(100);
  if (profile.role === "resident") query = query.eq("resident_id", profile.id);
  const { data: concerns, error } = await query;
  if (error) throw new Error(`Could not load community concerns: ${error.message}`);

  return (
    <>
      <PageHeading title={profile.role === "resident" ? "My community concerns" : "Community concerns"}
        description={profile.role === "resident" ? "Follow up on the community issues you have reported." : "Review reports and track progress toward resolution."}
        action={profile.role === "resident" ? { href: "/concerns/new", label: "Report a concern" } : profile.role === "staff" ? { href: "/staff/queue", label: "Open triage queue" } : undefined} />
      {concerns?.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Concern</th><th>Category / Purok</th><th>Priority</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
        <tbody>{concerns.map((row) => { const category = oneRelation(row.concern_categories); const purok = oneRelation(row.puroks); return <tr key={row.id}>
          <td><strong>{row.reference_no ?? "—"}</strong></td><td>{row.title}</td>
          <td>{category?.name ?? "—"}<small className="cell-subtitle">{purok?.name ?? ""}</small></td>
          <td>{["Low", "Routine", "High", "Urgent"][Number(row.priority) - 1]}</td><td>{formatDate(row.created_at)}</td>
          <td><div className="button-row"><Status value={row.status} />{row.is_archived && <Status value="Archived" />}</div></td><td><Link className="text-link" href={`/concerns/${row.id}`}>Open</Link></td>
        </tr>; })}</tbody></table></div>
        : <EmptyState title="No concerns reported yet" text="Your submitted community reports and their status updates will appear here."
          action={profile.role === "resident" ? { href: "/concerns/new", label: "Report a concern" } : undefined} />}
    </>
  );
}
