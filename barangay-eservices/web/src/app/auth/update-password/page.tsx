import Link from "next/link";
import { updatePassword } from "@/app/actions";
import { Notice } from "@/components/ui";

export default async function UpdatePasswordPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <Link href="/" className="brand-inline auth-brand"><span className="brand-mark">BE</span>Barangay E-Services</Link>
      <section className="auth-card">
        <span className="eyebrow">ACCOUNT RECOVERY</span><h1>Choose a new password</h1>
        <p className="muted">Use at least 10 characters for your new password.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <form action={updatePassword} className="form-stack">
          <label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
          <label>Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={10} required /></label>
          <button className="button button-wide" type="submit">Update password</button>
        </form>
      </section>
    </main>
  );
}
