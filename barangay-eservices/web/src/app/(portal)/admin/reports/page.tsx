import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeading, Status } from "@/components/ui";

export default async function AdminReportsPage() {
  await requireUser(["admin"]);
  const supabase = await createClient();
  const [
    { data: requests, error: requestError },
    { data: concerns, error: concernError },
    { data: users, error: userError },
  ] = await Promise.all([
    supabase.from("document_requests").select("status,created_at").eq("is_archived", false).limit(1000),
    supabase.from("concerns").select("status,priority,created_at").eq("is_archived", false).limit(1000),
    supabase.from("profiles").select("role,is_active").limit(1000),
  ]);
  if (requestError || concernError || userError) throw new Error(`Could not load reports: ${requestError?.message ?? concernError?.message ?? userError?.message}`);
  const tally = (rows: Array<{ status: string }> | null) => Object.entries((rows ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const byRequestStatus = tally(requests);
  const byConcernStatus = tally(concerns);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const count = (rows: Array<{ created_at: string }> | null) => (rows ?? []).filter((row) => row.created_at.startsWith(key)).length;
    return { label: date.toLocaleDateString("en-PH", { month: "short", year: "numeric" }), requests: count(requests), concerns: count(concerns) };
  });
  return (
    <>
      <PageHeading title="Reports" description="A snapshot of requests, community concerns, and registered accounts." />
      <section className="stat-grid">
        <div className="stat-card"><span>Residents</span><strong>{users?.filter((row) => row.role === "resident").length ?? 0}</strong><small>Registered resident accounts</small></div>
        <div className="stat-card stat-card-blue"><span>Document requests</span><strong>{requests?.length ?? 0}</strong><small>Non-archived requests</small></div>
        <div className="stat-card stat-card-gold"><span>Community concerns</span><strong>{concerns?.length ?? 0}</strong><small>Non-archived reports</small></div>
      </section>
      <div className="dashboard-columns">
        <section className="panel"><span className="eyebrow">DOCUMENTS</span><h2>Requests by status</h2>
          {byRequestStatus.length ? <ul className="status-list">{byRequestStatus.map(([status, count]) => <li key={status}><Status value={status} /><strong>{count}</strong></li>)}</ul> : <p className="muted">No document requests recorded.</p>}
        </section>
        <section className="panel"><span className="eyebrow">COMMUNITY</span><h2>Concerns by status</h2>
          {byConcernStatus.length ? <ul className="status-list">{byConcernStatus.map(([status, count]) => <li key={status}><Status value={status} /><strong>{count}</strong></li>)}</ul> : <p className="muted">No concerns recorded.</p>}
        </section>
      </div>
      <section className="panel"><span className="eyebrow">RECENT SIX MONTHS</span><h2>Monthly activity</h2>
        <div className="table-wrap inset-table"><table><thead><tr><th>Month</th><th>Document requests</th><th>Community concerns</th></tr></thead><tbody>
          {months.map((month) => <tr key={month.label}><td>{month.label}</td><td>{month.requests}</td><td>{month.concerns}</td></tr>)}
        </tbody></table></div>
        <p className="form-hint">Report totals include up to 1,000 most recent non-archived records.</p>
      </section>
    </>
  );
}
