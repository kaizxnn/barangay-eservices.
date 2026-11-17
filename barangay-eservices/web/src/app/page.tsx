import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPeso } from "@/lib/format";

export default async function HomePage() {
  const supabase = await createClient();
  const [
    { data: settings, error: settingsError },
    { data: services, error: servicesError },
    { data: { user }, error: authError },
  ] = await Promise.all([
    supabase.from("barangay_settings").select("barangay_name,municipality,province,office_hours,logo_path").eq("id", true).maybeSingle(),
    supabase.from("document_types").select("id,name,description,fee,processing_days").eq("is_archived", false).order("name").limit(6),
    supabase.auth.getUser(),
  ]);
  if (settingsError) throw new Error(`Could not load barangay settings: ${settingsError.message}`);
  if (servicesError) throw new Error(`Could not load public services: ${servicesError.message}`);
  if (authError) throw new Error(`Could not verify the current session: ${authError.message}`);

  const location = [settings?.municipality, settings?.province].filter(Boolean).join(", ");
  const name = settings?.barangay_name ? `Barangay ${settings.barangay_name}` : "Barangay E-Services";
  return (
    <div className="public-page">
      <header className="public-header">
        <Link className="brand-inline" href="/"><span className="brand-mark">BE</span>Barangay E-Services</Link>
        <nav aria-label="Main navigation">
          <Link href="/services">Services & requirements</Link>
          {user ? <Link className="button button-small" href="/dashboard">Open my account</Link> : <>
            <Link href="/auth/login">Sign in</Link><Link className="button button-small" href="/auth/register">Create account</Link>
          </>}
        </nav>
      </header>
      <main>
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">{location || "COMMUNITY SERVICES ONLINE"}</div>
            <h1>Barangay services,<br /><span>within reach.</span></h1>
            <p>Request documents, check requirements, and follow up community concerns online—whenever it works for you.</p>
            <div className="button-row">
              <Link className="button" href={user ? "/dashboard" : "/auth/register"}>{user ? "Go to dashboard" : "Get started"}</Link>
              <Link className="button button-outline" href="/services">Explore services</Link>
            </div>
          </div>
          <aside className="hero-card">
            {settings?.logo_path && <img className="barangay-logo" src={settings.logo_path} alt={`${name} logo`} />}
            <span className="eyebrow">YOUR BARANGAY, CONNECTED</span>
            <h2>{name}</h2>
            {location && <p>{location}</p>}
            <div className="office-hours"><span>Office hours</span><strong>{settings?.office_hours || "Please ask at the barangay hall."}</strong></div>
            <small>Document requests are completed and paid for at the barangay hall. For emergencies, call 911.</small>
          </aside>
        </section>
        <section className="container section">
          <div className="section-title"><div><span className="eyebrow">START HERE</span><h2>Popular document services</h2></div><Link href="/services">View all services <span aria-hidden="true">→</span></Link></div>
          <div className="service-grid">
            {(services ?? []).map((service) => (
              <article className="service-card" key={service.id}>
                <span className="service-icon" aria-hidden="true">▤</span>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <div className="service-meta"><span>{Number(service.fee) ? formatPeso(service.fee) : "Free"}</span><span>{service.processing_days} working day(s)</span></div>
              </article>
            ))}
            {!services?.length && <div className="empty-state">Service information will appear here once configured by your barangay.</div>}
          </div>
        </section>
        <section className="container section how-section">
          <div><span className="eyebrow">HOW IT WORKS</span><h2>Easy to start.<br />Simple to follow.</h2><p>Create a resident account once to use online services and track updates.</p></div>
          <ol className="steps">
            <li><span>01</span><div><strong>Check requirements</strong><p>Review the fee, processing time, and what to bring.</p></div></li>
            <li><span>02</span><div><strong>Send your request</strong><p>Sign in to request documents or report a community issue.</p></div></li>
            <li><span>03</span><div><strong>Follow your status</strong><p>See updates from the barangay team in your account.</p></div></li>
          </ol>
        </section>
      </main>
      <footer className="public-footer"><div className="container"><strong>Barangay E-Services</strong><span>Service that brings the barangay closer.</span></div></footer>
    </div>
  );
}
