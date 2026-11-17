import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/app/actions";
import { Notice, PageHeading } from "@/components/ui";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { user, profile } = await requireUser();
  const { error: message, saved } = await searchParams;
  const supabase = await createClient();
  const { data: puroks, error } = await supabase.from("puroks").select("id,name").order("name");
  if (error) throw new Error(`Could not load puroks: ${error.message}`);

  return (
    <>
      <PageHeading title="My profile" description="Keep your contact details current so the barangay can follow up if needed." />
      {message && <Notice tone="error">{message}</Notice>}
      {saved && <Notice tone="success">Your profile was updated.</Notice>}
      <section className="panel form-panel">
        <form action={updateProfile} className="form-stack">
          <label>Email address<input value={user.email ?? ""} readOnly /><small>Email is managed by your verified sign-in account.</small></label>
          <div className="form-grid">
            <label>First name<input name="first_name" defaultValue={profile.first_name} maxLength={60} required /></label>
            <label>Last name<input name="last_name" defaultValue={profile.last_name} maxLength={60} required /></label>
          </div>
          <label>Contact number<input name="contact_no" type="tel" defaultValue={profile.contact_no ?? ""} maxLength={13} /></label>
          <label>Street address<input name="street_address" defaultValue={profile.street_address ?? ""} maxLength={150} /></label>
          <label>Purok<select name="purok_id" defaultValue={profile.purok_id ?? ""}><option value="">Not specified</option>{puroks?.map((purok) => <option value={purok.id} key={purok.id}>{purok.name}</option>)}</select></label>
          <button className="button" type="submit">Save profile</button>
        </form>
      </section>
    </>
  );
}
