import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import type { Profile, Role } from "@/lib/auth";

const links: Record<Role, Array<[string, string, string]>> = {
  resident: [
    ["Dashboard", "/dashboard", "Overview"],
    ["My document requests", "/requests", "Track your requests"],
    ["Report a concern", "/concerns", "Community reports"],
    ["Services", "/services", "Requirements and fees"],
    ["My profile", "/profile", "Account details"],
  ],
  staff: [
    ["Dashboard", "/staff", "Work overview"],
    ["Document requests", "/requests", "Review and process"],
    ["Community concerns", "/concerns", "Review and resolve"],
    ["Residents", "/staff/residents", "Resident directory"],
    ["My profile", "/profile", "Account details"],
  ],
  admin: [
    ["Dashboard", "/admin", "System overview"],
    ["Document requests", "/requests", "All requests"],
    ["Community concerns", "/concerns", "All concerns"],
    ["Residents", "/staff/residents", "Resident directory"],
    ["Services & categories", "/admin/services", "Service setup"],
    ["Reports", "/admin/reports", "System activity"],
    ["Activity log", "/admin/logs", "Audit trail"],
    ["User accounts", "/admin/users", "Roles and access"],
    ["Barangay settings", "/admin/settings", "Office profile"],
    ["My profile", "/profile", "Account details"],
  ],
};

const roleName: Record<Role, string> = {
  resident: "Resident",
  staff: "Barangay staff",
  admin: "Administrator",
};

export function PortalShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const activeLinks = links[profile.role];
  return (
    <div className="portal">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/">
          <span className="brand-mark">BE</span>
          <span><strong>Barangay E-Services</strong><small>Online community services</small></span>
        </Link>
        <nav className="side-nav" aria-label="Account navigation">
          {activeLinks.map(([label, href, detail]) => (
            <Link href={href} key={href}>
              <span>{label}</span><small>{detail}</small>
            </Link>
          ))}
        </nav>
        <div className="side-account">
          <span className="eyebrow">SIGNED IN AS</span>
          <strong>{profile.first_name} {profile.last_name}</strong>
          <span>{roleName[profile.role]}</span>
          <form action={signOut}><button className="button button-outline-light" type="submit">Sign out</button></form>
        </div>
      </aside>
      <div className="portal-main">
        <header className="mobile-header">
          <Link className="brand-inline" href="/">Barangay E-Services</Link>
          <form action={signOut}><button className="button button-small button-outline" type="submit">Sign out</button></form>
        </header>
        <nav className="mobile-nav" aria-label="Account navigation">
          {activeLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <main className="content">{children}</main>
        <footer className="footer"><span>Barangay E-Services</span><span>Digital service, closer to home.</span></footer>
      </div>
    </div>
  );
}
