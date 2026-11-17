import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeading } from "@/components/ui";

export default async function AdminDashboardPage() {
  const { profile } = await requireUser(["admin", "staff"]);
  if (profile.role === "staff") redirect("/staff");
  const supabase = await createClient();
  const [
    { count: residents, error: residentsError },
    { count: requests, error: requestsError },
    { count: concerns, error: concernsError },
    { count: unverified, error: unverifiedError },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "resident"),
    supabase.from("document_requests").select("*", { count: "exact", head: true }).eq("is_archived", false),
    supabase.from("concerns").select("*", { count: "exact", head: true }).eq("is_archived", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "resident").is("email_verified_at", null),
  ]);
  if (residentsError || requestsError || concernsError || unverifiedError) {
    throw new Error(`Could not load administrative dashboard: ${residentsError?.message ?? requestsError?.message ?? concernsError?.message ?? unverifiedError?.message}`);
  }
  return (
    <>
      <PageHeading title="Administrator dashboard" description="Manage the services, accounts, and records for your barangay." />
      <section className="stat-grid">
        <Link className="stat-card" href="/staff/residents"><span>Resident accounts</span><strong>{residents ?? 0}</strong><small>{unverified ?? 0} awaiting email verification →</small></Link>
        <Link className="stat-card stat-card-blue" href="/requests"><span>Document requests</span><strong>{requests ?? 0}</strong><small>View all requests →</small></Link>
        <Link className="stat-card stat-card-gold" href="/concerns"><span>Community concerns</span><strong>{concerns ?? 0}</strong><small>View all concerns →</small></Link>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ADMINISTRATION</span><h2>System setup</h2></div></div>
        <div className="quick-links">
          <Link href="/admin/settings"><strong>Barangay settings</strong><small>Update name, location, office hours and logo.</small></Link>
          <Link href="/admin/services"><strong>Services and categories</strong><small>Configure document types, requirements, concerns and puroks.</small></Link>
          <Link href="/admin/users"><strong>User accounts</strong><small>Assign staff roles and manage access.</small></Link>
          <Link href="/admin/reports"><strong>Reports</strong><small>View record totals and activity trends.</small></Link>
        </div>
      </section>
    </>
  );
}
