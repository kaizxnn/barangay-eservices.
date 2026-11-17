import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, oneRelation } from "@/lib/format";
import { PageHeading, Status, EmptyState } from "@/components/ui";

export default async function RequestsPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  let query = supabase.from("document_requests")
    .select("id,reference_no,purpose,copies,fee_amount,status,is_archived,created_at,document_types(name)")
    .order("created_at", { ascending: false }).limit(100);
  if (profile.role === "resident") query = query.eq("resident_id", profile.id);
  const { data: requests, error } = await query;
  if (error) throw new Error(`Could not load document requests: ${error.message}`);

  return (
    <>
      <PageHeading title={profile.role === "resident" ? "My document requests" : "Document requests"}
        description={profile.role === "resident" ? "Follow the progress of documents you have requested." : "Review and process requests submitted by residents."}
        action={profile.role === "resident" ? { href: "/requests/new", label: "New request" } : undefined} />
      {(requests ?? []).length ? (
        <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Document</th><th>Submitted</th><th>Fee</th><th>Status</th><th></th></tr></thead>
          <tbody>{requests?.map((row) => <tr key={row.id}>
            <td><strong>{row.reference_no ?? "—"}</strong></td><td>{oneRelation(row.document_types)?.name ?? "Document"}</td>
            <td>{formatDate(row.created_at)}</td><td>₱{Number(row.fee_amount).toFixed(2)}</td><td><div className="button-row"><Status value={row.status} />{row.is_archived && <Status value="Archived" />}</div></td>
            <td><Link className="text-link" href={`/requests/${row.id}`}>Open</Link></td>
          </tr>)}</tbody>
        </table></div>
      ) : <EmptyState title="No document requests yet" text="When you submit a request, its status and updates will appear here."
        action={profile.role === "resident" ? { href: "/requests/new", label: "Request a document" } : undefined} />}
    </>
  );
}
