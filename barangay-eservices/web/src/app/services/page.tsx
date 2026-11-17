import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPeso } from "@/lib/format";
import { PageHeading } from "@/components/ui";

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: services, error } = await supabase.from("document_types")
    .select("id,name,description,fee,processing_days,document_requirements(requirement_text,sort_order)")
    .eq("is_archived", false).order("name");
  if (error) throw new Error(`Could not load services: ${error.message}`);

  return (
    <div className="public-page">
      <header className="public-header"><Link className="brand-inline" href="/"><span className="brand-mark">BE</span>Barangay E-Services</Link><nav><Link href="/">Home</Link><Link className="button button-small" href="/auth/login">Sign in</Link></nav></header>
      <main className="container public-content">
        <PageHeading title="Services & requirements" description="Review the requirements and estimated processing time before submitting a request." />
        <div className="service-list">
          {(services ?? []).map((service) => (
            <article className="panel" key={service.id}>
              <div className="service-list-head"><div><h2>{service.name}</h2><p>{service.description}</p></div><div className="service-price">{Number(service.fee) ? formatPeso(service.fee) : "Free"}<small>{service.processing_days} working day(s)</small></div></div>
              <h3>What to prepare</h3>
              {service.document_requirements?.length
                ? <ul>{[...service.document_requirements].sort((a, b) => a.sort_order - b.sort_order).map((item) => <li key={item.requirement_text}>{item.requirement_text}</li>)}</ul>
                : <p className="muted">No additional requirements listed.</p>}
              <Link className="text-link" href="/auth/register">Create an account to request this document →</Link>
            </article>
          ))}
          {!services?.length && <div className="empty-state">No services are available yet. Please check back later.</div>}
        </div>
      </main>
      <footer className="public-footer"><div className="container"><strong>Barangay E-Services</strong><span>For emergencies, call 911.</span></div></footer>
    </div>
  );
}
