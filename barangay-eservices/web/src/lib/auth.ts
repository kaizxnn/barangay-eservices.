import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "staff" | "resident";

export type Profile = {
  id: string;
  role: Role;
  first_name: string;
  last_name: string;
  contact_no: string | null;
  street_address: string | null;
  purok_id: number | null;
  is_active: boolean;
  email_verified_at: string | null;
};

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify the current session: ${authError.message}`);
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Could not load the user profile: ${error.message}`);
  if (!data || !data.is_active) return null;
  return { user, profile: data as Profile };
}

export async function requireUser(roles?: Role[]) {
  const current = await getProfile();
  if (!current) redirect("/auth/login");
  if (!current.user.email_confirmed_at) redirect("/auth/verify");
  if (roles && !roles.includes(current.profile.role)) redirect("/dashboard?error=access-denied");
  return current;
}

export function homeForRole(role: Role) {
  return role === "admin" ? "/admin" : role === "staff" ? "/staff" : "/dashboard";
}
