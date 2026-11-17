import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateSettings, uploadBarangayLogo } from "@/app/actions";
import { Notice, PageHeading } from "@/components/ui";

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireUser(["admin"]);
  const { error: message, saved } = await searchParams;
  const supabase = await createClient();
  const { data: settings, error } = await supabase.from("barangay_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(`Could not load barangay settings: ${error.message}`);
  return (
    <>
      <PageHeading title="Barangay settings" description="This information appears on the public landing page and in service communications." />
      {message && <Notice tone="error">{message}</Notice>}
      {saved && <Notice tone="success">Barangay settings were updated.</Notice>}
      <section className="panel form-panel">
        <h2>Barangay profile</h2>
        <form action={updateSettings} className="form-stack">
          <label>Barangay name<input name="barangay_name" defaultValue={settings?.barangay_name ?? ""} maxLength={100} placeholder="e.g. San Isidro" /></label>
          <div className="form-grid"><label>City or municipality<input name="municipality" defaultValue={settings?.municipality ?? ""} maxLength={100} /></label><label>Province<input name="province" defaultValue={settings?.province ?? ""} maxLength={100} /></label></div>
          <label>Office hours<input name="office_hours" defaultValue={settings?.office_hours ?? ""} maxLength={150} placeholder="Monday to Friday, 8:00 AM to 5:00 PM" /></label>
          <button className="button" type="submit">Save barangay details</button>
        </form>
      </section>
      <section className="panel form-panel">
        <h2>Barangay logo</h2>
        {settings?.logo_path && <img className="barangay-logo" src={settings.logo_path} alt="Current barangay logo" />}
        <p className="muted">PNG, JPEG, or WebP only; maximum file size 2 MB.</p>
        <form action={uploadBarangayLogo} className="form-stack">
          <label>Select logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
          <button className="button button-outline" type="submit">Upload logo</button>
        </form>
      </section>
    </>
  );
}
