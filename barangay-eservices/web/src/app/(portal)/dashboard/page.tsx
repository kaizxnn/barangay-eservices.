import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, oneRelation } from "@/lib/format";
import { PageHeading, Status } from "@/components/ui";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  if (profile.role === "admin") redirect("/admin");
  if (profile.role === "staff") redirect("/staff");

  const supabase = await createClient();
  const [
    { count: requestCount, error: requestCountError },
    { count: concernCount, error: concernCountError },
    { data: requests, error: requestsError },
    { data: concerns, error: concernsError },
  ] = await Promise.all([
    supabase.from("document_requests").select("*", { count: "exact", head: true }).eq("resident_id", profile.id),
    supabase.from("concerns").select("*", { count: "exact", head: true }).eq("resident_id", profile.id),
    supabase.from("document_requests").select("id,reference_no,status,created_at,document_types(name)").eq("resident_id", profile.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("concerns").select("id,reference_no,title,status,created_at").eq("resident_id", profile.id).order("created_at", { ascending: false }).limit(5),
  ]);
  if (requestCountError || concernCountError || requestsError || concernsError) {
    throw new Error(`Could not load dashboard records: ${requestCountError?.message ?? concernCountError?.message ?? requestsError?.message ?? concernsError?.message}`);
  }

  return (
    <>
      <PageHeading title={`Welcome, ${profile.first_name}`} description="Here’s an overview of your barangay service activity." />
      <section className="stat-grid" aria-label="Your activity">
        <Link className="stat-card" href="/requests"><span>Document requests</span><strong>{requestCount ?? 0}</strong><small>View all your requests →</small></Link>
        <Link className="stat-card stat-card-blue" href="/concerns"><span>Community concerns</span><strong>{concernCount ?? 0}</strong><small>Track submitted reports →</small></Link>
        <Link className="stat-card stat-card-gold" href="/requests/new"><span>Need a document?</span><strong className="stat-action">Request online</strong><small>Check services and submit →</small></Link>
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">DOCUMENTS</span><h2>Recent requests</h2></div><Link href="/requests">See all</Link></div>
          {(requests ?? []).length ? <div className="record-list">{requests?.map((row) => (
            <Link href={`/requests/${row.id}`} className="record-row" key={row.id}>
              <span><strong>{oneRelation(row.document_types)?.name ?? "Document request"}</strong><small>{row.reference_no ?? "Reference pending"} · {formatDate(row.created_at)}</small></span><Status value={row.status} />
            </Link>
          ))}</div> : <p className="muted">No document requests yet.</p>}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">COMMUNITY</span><h2>Recent concerns</h2></div><Link href="/concerns">See all</Link></div>
          {(concerns ?? []).length ? <div className="record-list">{concerns?.map((row) => (
            <Link href={`/concerns/${row.id}`} className="record-row" key={row.id}>
              <span><strong>{row.title}</strong><small>{row.reference_no ?? "Reference pending"} · {formatDate(row.created_at)}</small></span><Status value={row.status} />
            </Link>
          ))}</div> : <p className="muted">No community concerns reported yet.</p>}
        </section>
      </div>
    </>
  );
}
