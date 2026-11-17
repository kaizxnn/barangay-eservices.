import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeading, Status } from "@/components/ui";
import { loadConcernQueue, queuePriority } from "@/lib/queue";

export default async function StaffDashboardPage() {
  const { profile } = await requireUser(["staff", "admin"]);
  if (profile.role === "admin") redirect("/admin");
  const supabase = await createClient();
  const [
    { count: pendingRequests, error: requestError },
    { count: openConcerns, error: concernError },
    { count: queueCount, error: queueCountError },
  ] = await Promise.all([
    supabase.from("document_requests").select("*", { count: "exact", head: true }).in("status", ["Pending", "Under Review"]).eq("is_archived", false),
    supabase.from("concerns").select("*", { count: "exact", head: true }).in("status", ["Submitted", "Under Review"]).eq("is_archived", false),
    supabase.from("concerns").select("*", { count: "exact", head: true }).in("status", ["Submitted", "Under Review"]).is("assigned_to", null).eq("is_archived", false),
  ]);
  if (requestError || concernError || queueCountError) throw new Error(`Could not load staff dashboard: ${requestError?.message ?? concernError?.message ?? queueCountError?.message}`);
  const orderedQueue = (await loadConcernQueue(supabase)).slice(0, 6);
  const queueCheckedAt = Date.now();

  return (
    <>
      <PageHeading title={`Good day, ${profile.first_name}`} description="Here is the work currently waiting for the barangay team." />
      <section className="stat-grid">
        <Link className="stat-card" href="/requests"><span>Requests to review</span><strong>{pendingRequests ?? 0}</strong><small>Open document requests →</small></Link>
        <Link className="stat-card stat-card-blue" href="/concerns"><span>Concerns to review</span><strong>{openConcerns ?? 0}</strong><small>Open community reports →</small></Link>
        <Link className="stat-card stat-card-gold" href="/staff/queue"><span>Unassigned concerns</span><strong>{queueCount ?? 0}</strong><small>Open triage queue →</small></Link>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">TRIAGE</span><h2>Unassigned concerns</h2></div><Link href="/staff/queue">View queue</Link></div>
        {orderedQueue.length ? <div className="record-list">{orderedQueue.map((item) => <Link className="record-row" href={`/concerns/${item.id}`} key={item.id}>
          <span><strong>{item.title}</strong><small>{item.reference_no ?? "Reference pending"} · {new Date(item.created_at).toLocaleDateString("en-PH")}</small></span><Status value={["Low", "Routine", "High", "Urgent"][queuePriority(Number(item.priority), item.created_at, queueCheckedAt) - 1]} />
        </Link>)}</div> : <p className="muted">No unassigned concerns are waiting for review.</p>}
      </section>
    </>
  );
}
