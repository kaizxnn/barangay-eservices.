import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import { Notice } from "@/components/ui";

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <main className="auth-page">
      <Link href="/" className="brand-inline auth-brand"><span className="brand-mark">BE</span>Barangay E-Services</Link>
      <section className="auth-card">
        <span className="eyebrow">ACCOUNT RECOVERY</span><h1>Reset your password</h1>
        <p className="muted">Enter your account email and we will send a password reset link.</p>
        {error && <Notice tone="error">{error}</Notice>}
        {sent && <Notice>If an account exists for that email, a reset link has been sent.</Notice>}
        <form action={requestPasswordReset} className="form-stack">
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <button className="button button-wide" type="submit">Send reset link</button>
        </form>
        <p className="auth-switch"><Link href="/auth/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
