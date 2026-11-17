import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeading({ title, description, action }: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action && <Link className="button" href={action.href}>{action.label}</Link>}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" }) {
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Status({ value }: { value: string }) {
  const tone = ["Approved", "Released", "Resolved", "Closed"].includes(value)
    ? "green"
    : ["Rejected", "Cancelled", "Withdrawn"].includes(value)
      ? "red"
      : ["In Progress", "Processing", "Under Review", "Assigned", "Ready for Pickup"].includes(value)
        ? "blue"
        : "amber";
  return <span className={`status status-${tone}`}>{value}</span>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong><p>{text}</p>
      {action && <Link className="button button-outline" href={action.href}>{action.label}</Link>}
    </div>
  );
}
