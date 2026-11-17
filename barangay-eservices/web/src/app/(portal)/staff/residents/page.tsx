import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeading, EmptyState } from "@/components/ui";
import { formatDate, oneRelation } from "@/lib/format";

export default async function ResidentsPage() {
  await requireUser(["staff", "admin"]);
  const supabase = await createClient();
  const { data: residents, error } = await supabase.from("profiles")
    .select("id,email,first_name,last_name,contact_no,is_active,email_verified_at,created_at,puroks(name)")
    .eq("role", "resident").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Could not load residents: ${error.message}`);
  return (
    <>
      <PageHeading title="Residents" description="Resident accounts and their contact details." />
      {residents?.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Contact</th><th>Purok</th><th>Account</th><th>Joined</th></tr></thead>
        <tbody>{residents.map((resident) => { const purok = oneRelation(resident.puroks); return <tr key={resident.id}>
          <td><strong>{resident.first_name} {resident.last_name}</strong></td><td>{resident.email}</td><td>{resident.contact_no ?? "—"}</td>
          <td>{purok?.name ?? "—"}</td><td>{!resident.is_active ? "Inactive" : resident.email_verified_at ? "Verified" : "Unverified"}</td><td>{formatDate(resident.created_at)}</td>
        </tr>; })}</tbody></table></div> : <EmptyState title="No resident accounts" text="Newly registered residents will appear here." />}
    </>
  );
}
