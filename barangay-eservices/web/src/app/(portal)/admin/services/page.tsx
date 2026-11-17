import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createCategory, createDocumentType, createPurok, setCategoryArchived, setDocumentTypeArchived } from "@/app/actions";
import { Notice, PageHeading, Status } from "@/components/ui";
import { formatPeso } from "@/lib/format";

export default async function AdminServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireUser(["admin"]);
  const { error: message, saved } = await searchParams;
  const supabase = await createClient();
  const [
    { data: documents, error: documentError },
    { data: categories, error: categoryError },
    { data: puroks, error: purokError },
  ] = await Promise.all([
    supabase.from("document_types").select("id,name,description,fee,processing_days,is_archived,document_requirements(requirement_text,sort_order)").order("name"),
    supabase.from("concern_categories").select("id,name,description,default_priority,is_archived").order("name"),
    supabase.from("puroks").select("id,name").order("name"),
  ]);
  if (documentError || categoryError || purokError) throw new Error(`Could not load service setup: ${documentError?.message ?? categoryError?.message ?? purokError?.message}`);

  return (
    <>
      <PageHeading title="Services and categories" description="Manage document services, concern categories, and local puroks." />
      {message && <Notice tone="error">{message}</Notice>}{saved && <Notice tone="success">Your changes have been saved.</Notice>}
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">DOCUMENT SERVICES</span><h2>Document types</h2></div></div>
        {documents?.length ? <div className="table-wrap inset-table"><table><thead><tr><th>Service</th><th>Fee</th><th>Processing</th><th>Status</th><th></th></tr></thead><tbody>
          {documents.map((doc) => <tr key={doc.id}><td><strong>{doc.name}</strong><small className="cell-subtitle">{doc.description}{doc.document_requirements?.length ? ` · ${doc.document_requirements.length} requirements` : ""}</small></td>
            <td>{formatPeso(doc.fee)}</td><td>{doc.processing_days} day(s)</td><td><Status value={doc.is_archived ? "Archived" : "Active"} /></td>
            <td><form action={setDocumentTypeArchived}><input type="hidden" name="id" value={doc.id} /><input type="hidden" name="archived" value={String(!doc.is_archived)} /><button className="text-button" type="submit">{doc.is_archived ? "Restore" : "Archive"}</button></form></td></tr>)}
        </tbody></table></div> : <p className="muted">No document services configured.</p>}
      </section>
      <section className="panel form-panel">
        <h2>Add document type</h2>
        <form action={createDocumentType} className="form-stack">
          <label>Name<input name="name" required maxLength={100} /></label>
          <label>Description<textarea name="description" rows={2} maxLength={500} /></label>
          <div className="form-grid"><label>Fee per copy (PHP)<input name="fee" type="number" step="0.01" min="0" defaultValue="0" required /></label><label>Processing days<input name="processing_days" type="number" min="1" max="30" defaultValue="1" required /></label></div>
          <label>Requirements (one per line)<textarea name="requirements" rows={4} maxLength={4000} placeholder={"Valid ID\nProof of residency"} /></label>
          <button className="button" type="submit">Add document type</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">COMMUNITY REPORTS</span><h2>Concern categories</h2></div></div>
        {categories?.length ? <div className="table-wrap inset-table"><table><thead><tr><th>Category</th><th>Default priority</th><th>Status</th><th></th></tr></thead><tbody>
          {categories.map((category) => <tr key={category.id}><td><strong>{category.name}</strong><small className="cell-subtitle">{category.description}</small></td><td>{["Low", "Routine", "High", "Urgent"][Number(category.default_priority) - 1]}</td><td><Status value={category.is_archived ? "Archived" : "Active"} /></td>
            <td><form action={setCategoryArchived}><input type="hidden" name="id" value={category.id} /><input type="hidden" name="archived" value={String(!category.is_archived)} /><button className="text-button" type="submit">{category.is_archived ? "Restore" : "Archive"}</button></form></td></tr>)}
        </tbody></table></div> : <p className="muted">No concern categories configured.</p>}
      </section>
      <section className="panel form-panel">
        <h2>Add concern category</h2>
        <form action={createCategory} className="form-stack">
          <label>Name<input name="name" required maxLength={100} /></label>
          <label>Description<textarea name="description" rows={2} maxLength={500} /></label>
          <label>Default priority<select name="default_priority" defaultValue="2"><option value="1">Low</option><option value="2">Routine</option><option value="3">High</option><option value="4">Urgent</option></select></label>
          <button className="button" type="submit">Add category</button>
        </form>
      </section>
      <section className="panel form-panel">
        <h2>Puroks</h2>
        <div className="chip-list">{puroks?.map((purok) => <span className="chip" key={purok.id}>{purok.name}</span>)}</div>
        <form action={createPurok} className="inline-form"><label className="grow">Add purok<input name="name" maxLength={60} required /></label><button className="button" type="submit">Add</button></form>
      </section>
    </>
  );
}
