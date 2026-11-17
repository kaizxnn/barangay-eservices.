import Link from "next/link";
import { signIn } from "@/app/actions";
import { Notice } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <Link href="/" className="brand-inline auth-brand"><span className="brand-mark">BE</span>Barangay E-Services</Link>
      <section className="auth-card">
        <span className="eyebrow">WELCOME BACK</span><h1>Sign in to your account</h1><p className="muted">Manage requests and follow updates from your barangay.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <form action={signIn} className="form-stack">
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button button-wide" type="submit">Sign in</button>
        </form>
        <p className="auth-switch">New to Barangay E-Services? <Link href="/auth/register">Create a resident account</Link></p>
      </section>
      <p className="auth-footnote"><Link href="/services">Browse service requirements</Link><span>•</span><Link href="/">Return home</Link></p>
    </main>
  );
}
