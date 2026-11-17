import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { Notice } from "@/components/ui";

export default async function VerifyPage() {
  const current = await getProfile();
  return (
    <main className="auth-page">
      <Link href="/" className="brand-inline auth-brand"><span className="brand-mark">BE</span>Barangay E-Services</Link>
      <section className="auth-card">
        <span className="eyebrow">ONE MORE STEP</span><h1>Verify your email</h1>
        <Notice>We sent a verification link to the email address you registered. Open the link to activate your account.</Notice>
        {current?.user.email && <p className="verification-email">{current.user.email}</p>}
        <p className="muted">If you don’t see it, check your spam folder. You can also sign in after verifying.</p>
        <Link className="button button-wide" href="/auth/login">Go to sign in</Link>
      </section>
      <p className="auth-footnote"><Link href="/">Return home</Link></p>
    </main>
  );
}
