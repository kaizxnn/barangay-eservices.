import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { oneRelation } from "@/lib/format";

async function sendStatusEmail(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("Status email not sent: configure RESEND_API_KEY and EMAIL_FROM.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Status email provider rejected the message", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Status email delivery failed", error);
    return false;
  }
}

function requestMessage(status: string, reference: string, document: string, fee: number, remarks: string, link: string) {
  const updates: Record<string, string> = {
    Approved: "Your request has been approved and will be processed shortly.",
    Rejected: "Your request was not approved.",
    "Ready for Pickup": `Your document is ready. Please claim it at the barangay hall and bring a valid ID and the fee of PHP ${fee.toFixed(2)}.`,
    Released: "Your document has been released. Thank you.",
  };
  return [
    `Request ${reference} (${document}) is now ${status}.`,
    updates[status] ?? "",
    remarks ? `Remarks from the barangay: ${remarks}` : "",
    link ? `View your request: ${link}` : "",
  ].filter(Boolean).join("\n");
}

export async function notifyRequestStatus(
  supabase: SupabaseClient,
  requestId: string,
  status: string,
  remarks: string,
) {
  if (!["Approved", "Rejected", "Ready for Pickup", "Released"].includes(status)) return true;
  const { data, error } = await supabase.from("document_requests")
    .select("reference_no,fee_amount,resident:profiles!document_requests_resident_id_fkey(email,first_name),document_types(name)")
    .eq("id", requestId).maybeSingle();
  if (error || !data) {
    console.error("Could not load request recipient for status email", error?.message ?? "Request not found");
    return false;
  }

  const resident = oneRelation(data.resident);
  const document = oneRelation(data.document_types);
  if (!resident?.email) {
    console.error("Request status email has no resident email address", requestId);
    return false;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const link = siteUrl ? `${siteUrl}/requests/${requestId}` : "";
  return sendStatusEmail(
    resident.email,
    `Request ${data.reference_no ?? requestId}: ${status}`,
    `Good day, ${resident.first_name}.\n\n${requestMessage(status, data.reference_no ?? requestId, document?.name ?? "document request", Number(data.fee_amount), remarks, link)}`,
  );
}

export async function notifyConcernStatus(
  supabase: SupabaseClient,
  concernId: string,
  status: string,
  note: string,
) {
  if (!["Assigned", "Resolved", "Rejected"].includes(status)) return true;
  const { data, error } = await supabase.from("concerns")
    .select("reference_no,title,resident:profiles!concerns_resident_id_fkey(email,first_name)")
    .eq("id", concernId).maybeSingle();
  if (error || !data) {
    console.error("Could not load concern recipient for status email", error?.message ?? "Concern not found");
    return false;
  }

  const resident = oneRelation(data.resident);
  if (!resident?.email) {
    console.error("Concern status email has no resident email address", concernId);
    return false;
  }
  const updates: Record<string, string> = {
    Assigned: "A barangay staff member has been assigned to your report.",
    Resolved: "The barangay has marked your report as resolved. You can close it from your account if the problem is fixed.",
    Rejected: "The barangay could not act on this report.",
  };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const link = siteUrl ? `${siteUrl}/concerns/${concernId}` : "";
  const text = [
    `Good day, ${resident.first_name}.`,
    "",
    `Your concern ${data.reference_no ?? concernId} (${data.title}) is now ${status}.`,
    updates[status],
    note && status !== "Assigned" ? `Note from the barangay: ${note}` : "",
    link ? `View your concern: ${link}` : "",
  ].filter(Boolean).join("\n");
  return sendStatusEmail(resident.email, `Concern ${data.reference_no}: ${status}`, text);
}
