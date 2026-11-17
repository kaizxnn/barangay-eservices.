import { NextResponse, type NextRequest } from "next/server";
import { createActionClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (!code) return NextResponse.redirect(new URL("/auth/verify?error=missing-code", request.url));

  const supabase = await createActionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Email verification callback failed", error.message);
    return NextResponse.redirect(new URL("/auth/verify?error=verification-failed", request.url));
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
