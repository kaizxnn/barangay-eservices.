import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, oneRelation } from "@/lib/format";
import { archiveConcern, editConcern, updateConcern } from "@/app/actions";
import { Notice, PageHeading, Status } from "@/components/ui";

const staffTransitions: Record<string, string[]> = {
  Submitted: ["Under Review", "Rejected"],
  "Under Review": ["Assigned"],
};

export default async function ConcernDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; notice?: string }>;
}) {
  const { profile } = await requireUser();
  const [{ id }, { error: message, saved, notice }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: concern, error } = await supabase.from("concerns")
    .select("*,concern_categories(name),puroks(name),resident:profiles!concerns_resident_id_fkey(first_name,last_name),assignee:profiles!concerns_assigned_to_fkey(first_name,last_name)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load community concern: ${error.message}`);
  if (!concern) notFound();

  const { data: updates, error: updatesError } = await supabase.from("concern_updates")
    .select("from_status,to_status,note,changed_at,actor:profiles!concern_updates_changed_by_fkey(first_name,last_name)")
    .eq("concern_id", id).order("changed_at", { ascending: true });
  if (updatesError) throw new Error(`Could not load concern history: ${updatesError.message}`);

  const isResident = profile.role === "resident";
  const actions = isResident
    ? concern.resident_id === profile.id
      ? concern.status === "Submitted" ? ["Withdrawn"] : concern.status === "Resolved" ? ["Closed"] : []
      : []
    : [...(staffTransitions[concern.status] ?? []),
      ...(concern.status === "Assigned" && concern.assigned_to === profile.id ? ["In Progress"] : []),
      ...(concern.status === "In Progress" && concern.assigned_to === profile.id ? ["Resolved"] : [])];

  const { data: staff, error: staffError } = !isResident && concern.status === "Under Review"
    ? await supabase.from("profiles").select("id,first_name,last_name").in("role", ["staff", "admin"]).eq("is_active", true).order("first_name")
    : { data: [], error: null };
  if (staffError) throw new Error(`Could not load staff members: ${staffError.message}`);
  const { data: editOptions, error: editOptionsError } = isResident && concern.resident_id === profile.id && concern.status === "Submitted"
    ? await Promise.all([
      supabase.from("concern_categories").select("id,name").eq("is_archived", false).order("name"),
      supabase.from("puroks").select("id,name").order("name"),
    ]).then(([categories, puroks]) => ({
      data: { categories: categories.data, puroks: puroks.data },
      error: categories.error ?? puroks.error,
    }))
    : { data: null, error: null };
  if (editOptionsError) throw new Error(`Could not load concern edit options: ${editOptionsError.message}`);
  const category = oneRelation(concern.concern_categories);
  const purok = oneRelation(concern.puroks);
  const resident = oneRelation(concern.resident);
  const assignee = oneRelation(concern.assignee);

  return (
    <>
      <PageHeading title={concern.title} description={`Submitted ${formatDate(concern.created_at)}`} action={{ href: "/concerns", label: "Back to concerns" }} />
      {message && <Notice tone="error">{message}</Notice>}
      {saved && <Notice tone="success">Your changes have been saved.</Notice>}
      {notice === "email-not-sent" && <Notice tone="error">The concern status changed, but the notification email could not be sent. Check the email provider configuration and logs.</Notice>}
      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading"><h2>Concern details</h2><div className="button-row"><Status value={concern.status} />{concern.is_archived && <Status value="Archived" />}</div></div>
          <dl className="detail-list">
            <dt>Reference number</dt><dd>{concern.reference_no ?? "Not assigned"}</dd>
            {!isResident && <><dt>Resident</dt><dd>{resident?.first_name} {resident?.last_name}</dd></>}
            <dt>Category</dt><dd>{category?.name}</dd><dt>Purok</dt><dd>{purok?.name}</dd>
            <dt>Priority</dt><dd>{["Low", "Routine", "High", "Urgent"][Number(concern.priority) - 1]}</dd>
            <dt>Location</dt><dd>{concern.location}</dd><dt>Description</dt><dd className="preserve-lines">{concern.description}</dd>
            <dt>Assigned to</dt><dd>{assignee ? `${assignee.first_name} ${assignee.last_name}` : "Not assigned"}</dd>
            {concern.resolution && <><dt>Resolution</dt><dd>{concern.resolution}</dd></>}
          </dl>
        </article>
        <article className="panel">
          <span className="eyebrow">STATUS HISTORY</span><h2>Updates</h2>
          {updates?.length ? <ol className="timeline">{updates.map((item, index) => { const actor = oneRelation(item.actor); return <li key={`${item.changed_at}-${index}`}>
            <span className="timeline-dot" /><strong>{item.to_status}</strong><small>{formatDate(item.changed_at)} · {actor?.first_name ?? "Barangay"} {actor?.last_name ?? "team"}</small>
            {item.note && <p>{item.note}</p>}
          </li>; })}</ol> : <p className="muted">No updates yet.</p>}
        </article>
      </section>
      {editOptions && <section className="panel form-panel">
        <h2>Edit submitted concern</h2>
        <form action={editConcern} className="form-stack">
          <input type="hidden" name="id" value={concern.id} />
          <label>Category<select name="category_id" defaultValue={String(concern.category_id)} required>{editOptions.categories?.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>Purok<select name="purok_id" defaultValue={String(concern.purok_id)} required>{editOptions.puroks?.map((purok) => <option value={purok.id} key={purok.id}>{purok.name}</option>)}</select></label>
          <label>Short title<input name="title" defaultValue={concern.title} maxLength={120} required /></label>
          <label>Description<textarea name="description" rows={4} defaultValue={concern.description} maxLength={10000} required /></label>
          <label>Specific location<input name="location" defaultValue={concern.location} maxLength={200} required /></label>
          <button className="button button-outline" type="submit">Save concern changes</button>
        </form>
      </section>}
      {actions.length > 0 && <section className="panel form-panel">
        <h2>Update concern</h2>
        <form action={updateConcern} className="form-stack">
          <input type="hidden" name="id" value={concern.id} />
          <label>Next status<select name="status" required defaultValue=""><option value="" disabled>Choose an update</option>{actions.map((status) => <option key={status}>{status}</option>)}</select></label>
          {!isResident && concern.status === "Under Review" && <label>Assign to<select name="assigned_to" required defaultValue=""><option value="" disabled>Choose a staff member</option>{staff?.map((member) => <option value={member.id} key={member.id}>{member.first_name} {member.last_name}</option>)}</select></label>}
          {!isResident && ["Submitted", "Under Review"].includes(concern.status) && <label>Priority<select name="priority" defaultValue={String(concern.priority)}><option value="1">Low</option><option value="2">Routine</option><option value="3">High</option><option value="4">Urgent</option></select></label>}
          {!isResident && <label>Update note<textarea name="note" rows={2} maxLength={1000} placeholder="Optional update for the resident" /></label>}
          {!isResident && concern.status === "In Progress" && <label>Resolution<textarea name="resolution" rows={3} maxLength={1000} placeholder="Describe how the concern was resolved." required /></label>}
          <button className="button" type="submit">Save status update</button>
        </form>
      </section>}
      {!isResident && (concern.is_archived ? profile.role === "admin" : ["Closed", "Rejected", "Withdrawn"].includes(concern.status)) && <section className="panel">
        <form action={archiveConcern}><input type="hidden" name="id" value={concern.id} /><input type="hidden" name="archived" value={String(!concern.is_archived)} />
          <button className="button button-outline" type="submit">{concern.is_archived ? "Restore concern" : "Archive finished concern"}</button></form>
      </section>}
    </>
  );
}
