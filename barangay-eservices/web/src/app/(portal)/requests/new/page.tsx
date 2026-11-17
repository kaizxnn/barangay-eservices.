import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createRequest } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { Notice, PageHeading } from "@/components/ui";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(["resident"]);
  const { error: message } = await searchParams;
  const supabase = await createClient();
  const { data: documents, error } = await supabase.from("document_types")
    .select("id,name,description,fee,processing_days").eq("is_archived", false).order("name");
  if (error) throw new Error(`Could not load available documents: ${error.message}`);

  return (
    <>
      <PageHeading title="Request a document" description="Choose a service and tell us why you need the document." />
      {message && <Notice tone="error">{message}</Notice>}
      {!documents?.length ? <Notice>No document services are available right now. Please check back later.</Notice> : (
        <section className="panel form-panel">
          <form action={createRequest} className="form-stack">
            <label>Document type<select name="doc_type_id" required defaultValue=""><option value="" disabled>Choose a document</option>
              {documents.map((doc) => <option value={doc.id} key={doc.id}>{doc.name} — {Number(doc.fee) ? `₱${Number(doc.fee).toFixed(2)}` : "Free"} / copy</option>)}
            </select></label>
            <label>Purpose<textarea name="purpose" rows={3} maxLength={255} required placeholder="Briefly explain why you need this document." /></label>
            <label>Number of copies<select name="copies" defaultValue="1">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <p className="form-hint">The amount shown is an estimate based on the current service fee. Payment and document release are completed at the barangay hall.</p>
            <div className="button-row"><button className="button" type="submit">Submit request</button><Link className="button button-outline" href="/requests">Cancel</Link></div>
          </form>
        </section>
      )}
    </>
  );
}
