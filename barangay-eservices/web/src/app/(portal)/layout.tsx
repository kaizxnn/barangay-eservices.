import { requireUser } from "@/lib/auth";
import { PortalShell } from "@/components/portal-shell";
import type { ReactNode } from "react";

export default async function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { profile } = await requireUser();
  return <PortalShell profile={profile}>{children}</PortalShell>;
}
