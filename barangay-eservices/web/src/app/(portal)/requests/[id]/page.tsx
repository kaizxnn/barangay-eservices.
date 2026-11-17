import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, oneRelation } from "@/lib/format";
import { archiveRequest, editRequest, updateRequest } from "@/app/actions";
import { Notice, PageHeading, Status } from "@/components/ui";

const staffTransitions: Record<string, string[]> = {
  Pending: ["Under Review", "Cancelled"],
  "Under Review": ["Approved", "Rejected"],
  Approved: ["Processing"],
  Processing: ["Ready for Pickup"],
  "Ready for Pickup": ["Released"],
};

export default async function RequestDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; notice?: string }>;
}) {
  const { profile } = await requireUser();
  const [{ id }, { error: message, saved, notice }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("document_requests")
    .select("*,document_types(name,description,processing_days),resident:profiles!document_requests_resident_id_fkey(first_name,last_name)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load document request: ${error.message}`);
  if (!request) notFound();

  const { data: history, error: historyError } = await supabase.from("request_status_history")
    .select("from_status,to_status,remarks,changed_at,actor:profiles!request_status_history_changed_by_fkey(first_name,last_name)")
    .eq("request_id", id).order("changed_at", { ascending: true });
  if (historyError) throw new Error(`Could not load request history: ${historyError.message}`);
  const documentType = oneRelation(request.document_types);
  const resident = oneRelation(request.resident);

  const isResident = profile.role === "resident";
  const actions = isResident
    ? request.resident_id === profile.id && request.status === "Pending" ? ["Cancelled"] : []
    : staffTransitions[request.status] ?? [];
  const { data: documents, error: documentError } = isResident && request.status === "Pending"
    ? await supabase.from("document_types").select("id,name,fee").eq("is_archived", false).order("name")
    : { data: [], error: null };
  if (documentError) throw new Error(`Could not load available documents: ${documentError.message}`);
  return (
    <>
      <PageHeading title={documentType?.name ?? "Document request"} description={`Submitted ${formatDate(request.created_at)}`} action={{ href: "/requests", label: "Back to requests" }} />
      {message && <Notice tone="error">{message}</Notice>}
      {saved && <Notice tone="success">Your changes have been saved.</Notice>}
      {notice === "email-not-sent" && <Notice tone="error">The request status changed, but the notification email could not be sent. Check the email provider configuration and logs.</Notice>}
      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading"><h2>Request details</h2><div className="button-row"><Status value={request.status} />{request.is_archived && <Status value="Archived" />}</div></div>
          <dl className="detail-list">
            <dt>Reference number</dt><dd>{request.reference_no ?? "Not assigned"}</dd>
            {!isResident && <><dt>Resident</dt><dd>{resident?.first_name} {resident?.last_name}</dd></>}
            <dt>Purpose</dt><dd>{request.purpose}</dd><dt>Copies</dt><dd>{request.copies}</dd>
            <dt>Fee at submission</dt><dd>₱{Number(request.fee_amount).toFixed(2)}</dd>
            <dt>Processing estimate</dt><dd>{documentType?.processing_days ?? "—"} working day(s)</dd>
            {request.remarks && <><dt>Latest remarks</dt><dd>{request.remarks}</dd></>}
          </dl>
        </article>
        <article className="panel">
          <span className="eyebrow">STATUS HISTORY</span><h2>Updates</h2>
          {history?.length ? <ol className="timeline">{history.map((item, index) => { const actor = oneRelation(item.actor); return <li key={`${item.changed_at}-${index}`}>
            <span className="timeline-dot" /><strong>{item.to_status}</strong><small>{formatDate(item.changed_at)} · {actor?.first_name ?? "Barangay"} {actor?.last_name ?? "team"}</small>
            {item.remarks && <p>{item.remarks}</p>}
          </li>; })}</ol> : <p className="muted">No updates yet.</p>}
        </article>
      </section>
      {isResident && request.resident_id === profile.id && request.status === "Pending" && documents?.length > 0 && <section className="panel form-panel">
        <h2>Edit pending request</h2>
        <form action={editRequest} className="form-stack">
          <input type="hidden" name="id" value={request.id} />
          <label>Document type<select name="doc_type_id" required defaultValue={String(request.doc_type_id)}>{documents.map((doc) => <option value={doc.id} key={doc.id}>{doc.name} — {Number(doc.fee) ? `₱${Number(doc.fee).toFixed(2)}` : "Free"} / copy</option>)}</select></label>
          <label>Purpose<textarea name="purpose" rows={3} maxLength={255} required defaultValue={request.purpose} /></label>
          <label>Number of copies<select name="copies" defaultValue={String(request.copies)}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button className="button button-outline" type="submit">Save request changes</button>
        </form>
      </section>}
      {actions.length > 0 && <section className="panel form-panel">
        <h2>Update request</h2>
        <form action={updateRequest} className="form-stack">
          <input type="hidden" name="id" value={request.id} />
          <label>Next status<select name="status" required defaultValue=""><option value="" disabled>Choose an update</option>{actions.map((status) => <option key={status}>{status}</option>)}</select></label>
          {!isResident && <label>Remarks<textarea name="remarks" rows={2} maxLength={500} placeholder="Optional update for the resident" /></label>}
          <button className="button" type="submit">Save status update</button>
        </form>
      </section>}
      {!isResident && (request.is_archived ? profile.role === "admin" : ["Released", "Rejected", "Cancelled"].includes(request.status)) && <section className="panel">
        <form action={archiveRequest}><input type="hidden" name="id" value={request.id} /><input type="hidden" name="archived" value={String(!request.is_archived)} />
          <button className="button button-outline" type="submit">{request.is_archived ? "Restore request" : "Archive finished request"}</button></form>
      </section>}
    </>
  );
}
