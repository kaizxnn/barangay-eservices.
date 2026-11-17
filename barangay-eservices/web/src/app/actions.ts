"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createActionClient } from "@/lib/supabase/server";
import { formNumber, formString } from "@/lib/format";
import { notifyConcernStatus, notifyRequestStatus } from "@/lib/status-notifications";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function checkSupabaseError(error: { message: string } | null, fallback: string): void {
  if (!error) return;
  console.error(fallback, error.message);
  throw new Error(fallback);
}

function registrationErrorMessage(error: { code?: string; message: string }): string {
  const message = error.message.toLowerCase();
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return "An account with that email already exists. Sign in, or contact the administrator if you need a password reset.";
    case "weak_password":
      return "That password does not meet the security requirements. Try a longer password with a mix of letters, numbers, and symbols.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Email registration is currently disabled. Contact the site administrator.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many registration or email attempts. Wait a few minutes before trying again.";
    case "email_address_invalid":
      return "Supabase rejected that email address. Check the address and try again.";
    case "email_address_not_authorized":
      return "Supabase has not authorized email delivery to that address. Configure an SMTP provider in Supabase Auth.";
  }

  if (message.includes("redirect") || message.includes("allow list") || message.includes("allowlist")) {
    return "The email verification redirect URL is not allowed. Add your Vercel URL ending in /auth/callback to Supabase Authentication → URL Configuration → Redirect URLs.";
  }
  if (message.includes("database error saving new user") || message.includes("database error")) {
    return "Supabase could not create the account profile. Check that the database migration ran successfully; the Supabase Auth/Postgres logs contain the specific database error.";
  }
  if (message.includes("already registered") || message.includes("already exists")) {
    return "An account with that email already exists. Sign in, or contact the administrator if you need a password reset.";
  }

  return "Registration failed. Check the Supabase Auth logs for the specific reason, then try again.";
}

export async function signIn(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) fail("/auth/login", "Enter your email and password.");

  const supabase = await createActionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Sign-in failed", error.message);
    fail("/auth/login", "Email or password is incorrect.");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  checkSupabaseError(userError, "Could not load the signed-in user.");
  if (!user) fail("/auth/login", "Sign-in did not create an active session.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  checkSupabaseError(profileError, "Could not load the signed-in profile.");
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    fail("/auth/login", "This account is inactive. Contact the barangay administrator.");
  }
  redirect(user.email_confirmed_at ? (profile.role === "admin" ? "/admin" : profile.role === "staff" ? "/staff" : "/dashboard") : "/auth/verify");
}

export async function signUp(formData: FormData) {
  const firstName = formString(formData, "first_name");
  const lastName = formString(formData, "last_name");
  const email = formString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60) {
    fail("/auth/register", "Enter a first and last name (up to 60 characters each).");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("/auth/register", "Enter a valid email address.");
  if (password.length < 10) fail("/auth/register", "Use a password with at least 10 characters.");

  const supabase = await createActionClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: baseUrl ? `${baseUrl}/auth/callback?next=/dashboard` : undefined,
      data: { first_name: firstName, last_name: lastName },
    },
  });
  if (error) {
    console.error("Registration failed", { code: error.code, status: error.status, message: error.message });
    fail("/auth/register", registrationErrorMessage(error));
  }
  redirect("/auth/verify");
}

export async function signOut() {
  const supabase = await createActionClient();
  const { error } = await supabase.auth.signOut();
  checkSupabaseError(error, "Could not sign out.");
  redirect("/");
}

export async function createRequest(formData: FormData) {
  const { profile } = await requireUser(["resident"]);
  const docTypeId = formNumber(formData, "doc_type_id");
  const copies = formNumber(formData, "copies");
  const purpose = formString(formData, "purpose");
  if (!Number.isInteger(docTypeId) || docTypeId < 1 || !Number.isInteger(copies) || copies < 1 || copies > 5 || !purpose || purpose.length > 255) {
    fail("/requests/new", "Check the document, purpose, and number of copies.");
  }

  const supabase = await createActionClient();
  const { data, error } = await supabase.rpc("create_document_request", {
    p_doc_type_id: docTypeId,
    p_purpose: purpose,
    p_copies: copies,
  });
  checkSupabaseError(error, "Could not create the document request.");
  if (!data) fail("/requests/new", "The request was not created. Try again.");
  redirect(`/requests/${data}`);
}

export async function updateRequest(formData: FormData) {
  await requireUser(["admin", "staff", "resident"]);
  const id = formString(formData, "id");
  const status = formString(formData, "status");
  const remarks = formString(formData, "remarks");
  if (!id || !status) fail("/requests", "Select a valid request status.");

  const supabase = await createActionClient();
  const { error } = await supabase.rpc("transition_document_request", {
    p_request_id: id,
    p_to_status: status,
    p_remarks: remarks || null,
  });
  if (error) {
    console.error("Request status change failed", error.message);
    fail(`/requests/${encodeURIComponent(id)}`, "That status change is not allowed. Refresh the record and try again.");
  }
  const emailSent = await notifyRequestStatus(supabase, id, status, remarks);
  redirect(emailSent ? `/requests/${id}` : `/requests/${id}?notice=email-not-sent`);
}

export async function editRequest(formData: FormData) {
  await requireUser(["resident"]);
  const id = formString(formData, "id");
  const docTypeId = formNumber(formData, "doc_type_id");
  const copies = formNumber(formData, "copies");
  const purpose = formString(formData, "purpose");
  if (!id || !Number.isInteger(docTypeId) || docTypeId < 1 || !Number.isInteger(copies) || copies < 1 || copies > 5
    || !purpose || purpose.length > 255) {
    fail("/requests", "Check the document, purpose, and number of copies.");
  }
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("edit_document_request", {
    p_request_id: id,
    p_doc_type_id: docTypeId,
    p_purpose: purpose,
    p_copies: copies,
  });
  if (error) {
    console.error("Document request edit failed", error.message);
    fail(`/requests/${encodeURIComponent(id)}`, "Only your pending requests can be edited. Refresh and try again.");
  }
  redirect(`/requests/${id}?saved=1`);
}

export async function createConcern(formData: FormData) {
  await requireUser(["resident"]);
  const categoryId = formNumber(formData, "category_id");
  const purokId = formNumber(formData, "purok_id");
  const title = formString(formData, "title");
  const description = formString(formData, "description");
  const location = formString(formData, "location");
  if (!Number.isInteger(categoryId) || categoryId < 1 || !Number.isInteger(purokId) || purokId < 1
    || !title || title.length > 120 || !description || description.length > 10000
    || !location || location.length > 200) {
    fail("/concerns/new", "Check the category, purok, title, description, and location.");
  }

  const supabase = await createActionClient();
  const { data, error } = await supabase.rpc("create_concern", {
    p_category_id: categoryId,
    p_purok_id: purokId,
    p_title: title,
    p_description: description,
    p_location: location,
  });
  checkSupabaseError(error, "Could not submit the community concern.");
  if (!data) fail("/concerns/new", "The concern was not submitted. Try again.");
  redirect(`/concerns/${data}`);
}

export async function updateConcern(formData: FormData) {
  const { profile } = await requireUser(["admin", "staff", "resident"]);
  const id = formString(formData, "id");
  const status = formString(formData, "status");
  const note = formString(formData, "note");
  const assignee = formString(formData, "assigned_to");
  const resolution = formString(formData, "resolution");
  const priorityValue = formString(formData, "priority");
  const priority = priorityValue ? Number(priorityValue) : null;
  if (!id || !status) fail("/concerns", "Select a valid concern status.");
  if (priority !== null && (!Number.isInteger(priority) || priority < 1 || priority > 4)) {
    fail(`/concerns/${encodeURIComponent(id)}`, "Choose a valid priority.");
  }

  const supabase = await createActionClient();
  const { error } = await supabase.rpc("transition_concern", {
    p_concern_id: id,
    p_to_status: status,
    p_note: note || null,
    p_assigned_to: profile.role !== "resident" && assignee ? assignee : null,
    p_resolution: resolution || null,
    p_priority: profile.role !== "resident" ? priority : null,
  });
  if (error) {
    console.error("Concern status change failed", error.message);
    fail(`/concerns/${encodeURIComponent(id)}`, "That status change is not allowed. Refresh the record and try again.");
  }
  const emailSent = await notifyConcernStatus(supabase, id, status, note);
  redirect(emailSent ? `/concerns/${id}` : `/concerns/${id}?notice=email-not-sent`);
}

export async function editConcern(formData: FormData) {
  await requireUser(["resident"]);
  const id = formString(formData, "id");
  const categoryId = formNumber(formData, "category_id");
  const purokId = formNumber(formData, "purok_id");
  const title = formString(formData, "title");
  const description = formString(formData, "description");
  const location = formString(formData, "location");
  if (!id || !Number.isInteger(categoryId) || categoryId < 1 || !Number.isInteger(purokId) || purokId < 1
    || !title || title.length > 120 || !description || description.length > 10000
    || !location || location.length > 200) {
    fail("/concerns", "Check the category, purok, title, description, and location.");
  }
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("edit_concern", {
    p_concern_id: id,
    p_category_id: categoryId,
    p_purok_id: purokId,
    p_title: title,
    p_description: description,
    p_location: location,
  });
  if (error) {
    console.error("Community concern edit failed", error.message);
    fail(`/concerns/${encodeURIComponent(id)}`, "Only your submitted concerns can be edited. Refresh and try again.");
  }
  redirect(`/concerns/${id}?saved=1`);
}

export async function updateProfile(formData: FormData) {
  const { user } = await requireUser();
  const firstName = formString(formData, "first_name");
  const lastName = formString(formData, "last_name");
  const phone = formString(formData, "contact_no");
  const address = formString(formData, "street_address");
  const purok = formString(formData, "purok_id");
  const purokId = purok ? Number(purok) : null;
  if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60
    || phone.length > 13 || address.length > 150
    || (purok && (!Number.isInteger(purokId) || Number.isNaN(purokId)))) {
    fail("/profile", "Check the profile fields and try again.");
  }

  const supabase = await createActionClient();
  const { error } = await supabase.from("profiles").update({
    first_name: firstName,
    last_name: lastName,
    contact_no: phone || null,
    street_address: address || null,
    purok_id: purokId,
  }).eq("id", user.id);
  checkSupabaseError(error, "Could not update the profile.");
  redirect("/profile?saved=1");
}

export async function updateSettings(formData: FormData) {
  const { user } = await requireUser(["admin"]);
  const barangayName = formString(formData, "barangay_name");
  const municipality = formString(formData, "municipality");
  const province = formString(formData, "province");
  const officeHours = formString(formData, "office_hours");
  if (barangayName.length > 100 || municipality.length > 100 || province.length > 100 || officeHours.length > 150) {
    fail("/admin/settings", "One or more fields exceed their maximum length.");
  }

  const supabase = await createActionClient();
  const { error } = await supabase.from("barangay_settings").update({
    barangay_name: barangayName || null,
    municipality: municipality || null,
    province: province || null,
    office_hours: officeHours || null,
    updated_by: user.id,
  }).eq("id", true);
  checkSupabaseError(error, "Could not update barangay settings.");
  redirect("/admin/settings?saved=1");
}

export async function createDocumentType(formData: FormData) {
  await requireUser(["admin"]);
  const name = formString(formData, "name");
  const description = formString(formData, "description");
  const fee = Number(formData.get("fee"));
  const processingDays = formNumber(formData, "processing_days");
  const requirements = formString(formData, "requirements").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (!name || name.length > 100 || description.length > 500 || !Number.isFinite(fee) || fee < 0
    || !Number.isInteger(processingDays) || processingDays < 1 || processingDays > 30
    || requirements.some((value) => value.length > 200)) {
    fail("/admin/services", "Check the service fields and requirements.");
  }
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("admin_create_document_type", {
    p_name: name,
    p_description: description,
    p_fee: fee,
    p_processing_days: processingDays,
    p_requirements: requirements,
  });
  checkSupabaseError(error, "Could not create the document type.");
  redirect("/admin/services?saved=1");
}

export async function createCategory(formData: FormData) {
  await requireUser(["admin"]);
  const name = formString(formData, "name");
  const description = formString(formData, "description");
  const priority = formNumber(formData, "default_priority");
  if (!name || name.length > 100 || description.length > 500 || priority < 1 || priority > 4) {
    fail("/admin/services", "Check the category details and priority.");
  }
  const supabase = await createActionClient();
  const { error } = await supabase.from("concern_categories").insert({
    name,
    description,
    default_priority: priority,
  });
  checkSupabaseError(error, "Could not create the concern category.");
  redirect("/admin/services?saved=1");
}

export async function setUserRole(formData: FormData) {
  await requireUser(["admin"]);
  const profileId = formString(formData, "profile_id");
  const role = formString(formData, "role");
  if (!profileId || !["admin", "staff", "resident"].includes(role)) fail("/admin/users", "Choose a valid user role.");
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("set_profile_role", { p_profile_id: profileId, p_role: role });
  checkSupabaseError(error, "Could not update the user's role.");
  redirect("/admin/users?saved=1");
}

export async function setUserActive(formData: FormData) {
  await requireUser(["admin"]);
  const profileId = formString(formData, "profile_id");
  const active = formString(formData, "active") === "true";
  if (!profileId) fail("/admin/users", "Choose a valid user account.");
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("set_profile_active", { p_profile_id: profileId, p_active: active });
  checkSupabaseError(error, "Could not update the account status.");
  redirect("/admin/users?saved=1");
}

export async function setDocumentTypeArchived(formData: FormData) {
  await requireUser(["admin"]);
  const id = formNumber(formData, "id");
  const archived = formString(formData, "archived") === "true";
  if (!Number.isInteger(id) || id < 1) fail("/admin/services", "Choose a valid document type.");
  const supabase = await createActionClient();
  const { error } = await supabase.from("document_types").update({ is_archived: archived }).eq("id", id);
  checkSupabaseError(error, "Could not update the document type.");
  redirect("/admin/services?saved=1");
}

export async function setCategoryArchived(formData: FormData) {
  await requireUser(["admin"]);
  const id = formNumber(formData, "id");
  const archived = formString(formData, "archived") === "true";
  if (!Number.isInteger(id) || id < 1) fail("/admin/services", "Choose a valid concern category.");
  const supabase = await createActionClient();
  const { error } = await supabase.from("concern_categories").update({ is_archived: archived }).eq("id", id);
  checkSupabaseError(error, "Could not update the concern category.");
  redirect("/admin/services?saved=1");
}

export async function createPurok(formData: FormData) {
  await requireUser(["admin"]);
  const name = formString(formData, "name");
  if (!name || name.length > 60) fail("/admin/services", "Enter a purok name up to 60 characters.");
  const supabase = await createActionClient();
  const { error } = await supabase.from("puroks").insert({ name });
  checkSupabaseError(error, "Could not add the purok.");
  redirect("/admin/services?saved=1");
}

export async function uploadBarangayLogo(formData: FormData) {
  const { user } = await requireUser(["admin"]);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024
    || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    fail("/admin/settings", "Choose a PNG, JPEG, or WebP logo up to 2 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = file.type === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const isJpeg = file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = file.type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isPng && !isJpeg && !isWebp) fail("/admin/settings", "The selected file contents do not match a supported image format.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;
  const supabase = await createActionClient();
  const { error: uploadError } = await supabase.storage.from("barangay-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  checkSupabaseError(uploadError, "Could not upload the barangay logo.");
  const { data } = supabase.storage.from("barangay-assets").getPublicUrl(path);
  const { error: settingsError } = await supabase.from("barangay_settings").update({
    logo_path: data.publicUrl,
    updated_by: user.id,
  }).eq("id", true);
  checkSupabaseError(settingsError, "The logo uploaded, but barangay settings could not be updated.");
  redirect("/admin/settings?saved=1");
}

export async function archiveRequest(formData: FormData) {
  const { profile } = await requireUser(["admin", "staff"]);
  const id = formString(formData, "id");
  const archived = formString(formData, "archived") === "true";
  if (!id) fail("/requests", "Choose a valid request.");
  if (!archived && profile.role !== "admin") fail(`/requests/${encodeURIComponent(id)}`, "Only an administrator can restore archived records.");
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("archive_document_request", { p_request_id: id, p_archived: archived });
  if (error) {
    console.error("Document request archive action failed", error.message);
    fail(`/requests/${encodeURIComponent(id)}`, "Only finished requests can be archived; restoration requires an administrator.");
  }
  redirect(`/requests/${id}?saved=1`);
}

export async function archiveConcern(formData: FormData) {
  const { profile } = await requireUser(["admin", "staff"]);
  const id = formString(formData, "id");
  const archived = formString(formData, "archived") === "true";
  if (!id) fail("/concerns", "Choose a valid concern.");
  if (!archived && profile.role !== "admin") fail(`/concerns/${encodeURIComponent(id)}`, "Only an administrator can restore archived records.");
  const supabase = await createActionClient();
  const { error } = await supabase.rpc("archive_concern", { p_concern_id: id, p_archived: archived });
  if (error) {
    console.error("Community concern archive action failed", error.message);
    fail(`/concerns/${encodeURIComponent(id)}`, "Only finished concerns can be archived; restoration requires an administrator.");
  }
  redirect(`/concerns/${id}?saved=1`);
}
