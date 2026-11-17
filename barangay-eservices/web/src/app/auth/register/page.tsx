import Link from "next/link";
import { signUp } from "@/app/actions";
import { Notice } from "@/components/ui";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <Link href="/" className="brand-inline auth-brand"><span className="brand-mark">BE</span>Barangay E-Services</Link>
      <section className="auth-card">
        <span className="eyebrow">RESIDENT ACCOUNT</span><h1>Create your account</h1><p className="muted">Register to request barangay documents and follow community concerns.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <form action={signUp} className="form-stack">
          <div className="form-grid">
            <label>First name<input name="first_name" autoComplete="given-name" required maxLength={60} /></label>
            <label>Last name<input name="last_name" autoComplete="family-name" required maxLength={60} /></label>
          </div>
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required /><small>Use at least 10 characters.</small></label>
          <button className="button button-wide" type="submit">Create account</button>
        </form>
        <p className="auth-switch">Already registered? <Link href="/auth/login">Sign in</Link></p>
      </section>
      <p className="auth-footnote"><Link href="/">Return home</Link></p>
    </main>
  );
}
