import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setUserActive, setUserRole } from "@/app/actions";
import { Notice, PageHeading, Status } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireUser(["admin"]);
  const { error: message, saved } = await searchParams;
  const supabase = await createClient();
  const { data: users, error } = await supabase.from("profiles")
    .select("id,email,first_name,last_name,role,is_active,email_verified_at,created_at")
    .order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(`Could not load user accounts: ${error.message}`);
  return (
    <>
      <PageHeading title="User accounts" description="Assign system roles and manage account access. New registrations always start as residents." />
      {message && <Notice tone="error">{message}</Notice>}{saved && <Notice tone="success">Account details were updated.</Notice>}
      {users?.length ? <div className="table-wrap"><table><thead><tr><th>Name / email</th><th>Role</th><th>Verification</th><th>Account</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>{users.map((account) => <tr key={account.id}>
          <td><strong>{account.first_name} {account.last_name}</strong><small className="cell-subtitle">{account.email ?? "No email address"}</small></td>
          <td><Status value={account.role} /></td><td>{account.email_verified_at ? "Verified" : "Unverified"}</td><td>{account.is_active ? "Active" : "Inactive"}</td><td>{formatDate(account.created_at)}</td>
          <td className="action-cell">
            <form action={setUserRole} className="role-form"><input type="hidden" name="profile_id" value={account.id} /><label className="visually-hidden" htmlFor={`role-${account.id}`}>Role for {account.first_name}</label>
              <select id={`role-${account.id}`} name="role" defaultValue={account.role}><option value="resident">Resident</option><option value="staff">Staff</option><option value="admin">Admin</option></select><button className="text-button" type="submit">Save role</button></form>
            <form action={setUserActive}><input type="hidden" name="profile_id" value={account.id} /><input type="hidden" name="active" value={String(!account.is_active)} /><button className="text-button" type="submit">{account.is_active ? "Deactivate" : "Activate"}</button></form>
          </td>
        </tr>)}</tbody></table></div> : <p className="muted">No accounts have registered yet.</p>}
    </>
  );
}
