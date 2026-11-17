import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createConcern } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { Notice, PageHeading } from "@/components/ui";

export default async function NewConcernPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(["resident"]);
  const { error: message } = await searchParams;
  const supabase = await createClient();
  const [{ data: categories, error: categoriesError }, { data: puroks, error: puroksError }] = await Promise.all([
    supabase.from("concern_categories").select("id,name,description").eq("is_archived", false).order("name"),
    supabase.from("puroks").select("id,name").order("name"),
  ]);
  if (categoriesError || puroksError) throw new Error(`Could not load concern form options: ${categoriesError?.message ?? puroksError?.message}`);

  return (
    <>
      <PageHeading title="Report a community concern" description="Share a local issue so the barangay team can review and follow up." />
      {message && <Notice tone="error">{message}</Notice>}
      {!categories?.length || !puroks?.length ? <Notice>Concern categories and puroks must be configured before reports can be submitted.</Notice> : (
        <section className="panel form-panel">
          <form action={createConcern} className="form-stack">
            <label>Category<select name="category_id" required defaultValue=""><option value="" disabled>Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <label>Purok<select name="purok_id" required defaultValue=""><option value="" disabled>Choose a purok</option>{puroks.map((purok) => <option value={purok.id} key={purok.id}>{purok.name}</option>)}</select></label>
            <label>Short title<input name="title" maxLength={120} required placeholder="e.g. Damaged streetlight near the basketball court" /></label>
            <label>Describe the concern<textarea name="description" rows={5} maxLength={10000} required placeholder="What happened, and when did you first notice it?" /></label>
            <label>Specific location<input name="location" maxLength={200} required placeholder="Street, landmark, or nearby address" /></label>
            <p className="form-hint">Do not use this form for emergencies. Call 911 if someone is in immediate danger.</p>
            <div className="button-row"><button className="button" type="submit">Submit concern</button><Link className="button button-outline" href="/concerns">Cancel</Link></div>
          </form>
        </section>
      )}
    </>
  );
}
