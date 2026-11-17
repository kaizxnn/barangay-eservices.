import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const webDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localEnvFile = resolve(webDirectory, ".env.local");
const usage = `Usage:
  node scripts/migrate-legacy-mysql.mjs --dry-run [path-to-mysql-dump.sql]
  node scripts/migrate-legacy-mysql.mjs [path-to-mysql-dump.sql]

Live mode requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
SUPABASE_SERVICE_ROLE_KEY in web/.env.local or the process environment.
`;

function readLocalEnvironment() {
  const values = {};
  if (!existsSync(localEnvFile)) return values;
  for (const line of readFileSync(localEnvFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    values[match[1]] = value;
  }
  return values;
}

function findInsertStatements(sql) {
  const statements = [];
  let start = 0;
  let quoted = false;
  let backtick = false;
  let escaped = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (!backtick && character === "'") {
      if (quoted && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === "`") {
      backtick = !backtick;
      continue;
    }
    if (!quoted && !backtick && character === ";") {
      const statement = sql.slice(start, index + 1).trim();
      if (/^INSERT\s+INTO\b/i.test(statement)) statements.push(statement);
      start = index + 1;
    }
  }
  return statements;
}

function decodeMysqlString(value) {
  return value.replace(/\\([0btnrZ\\"'])/g, (_, character) => ({
    "0": "\0",
    b: "\b",
    t: "\t",
    n: "\n",
    r: "\r",
    Z: "\x1a",
    "\\": "\\",
    '"': '"',
    "'": "'",
  })[character]);
}

function parseLiteral(source) {
  const token = source.trim();
  if (/^NULL$/i.test(token)) return null;
  if (token.startsWith("'") && token.endsWith("'")) {
    return decodeMysqlString(token.slice(1, -1).replace(/''/g, "'"));
  }
  if (/^-?\d+$/.test(token)) return Number.parseInt(token, 10);
  if (/^-?(?:\d+\.\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) return Number(token);
  throw new Error(`Unsupported value in legacy SQL dump: ${token.slice(0, 40)}`);
}

function parseTupleValues(source) {
  const values = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "'") {
      if (quoted && source[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === ",") {
      values.push(parseLiteral(source.slice(start, index)));
      start = index + 1;
    }
  }
  values.push(parseLiteral(source.slice(start)));
  return values;
}

function parseInsert(statement) {
  const match = statement.match(/^INSERT\s+INTO\s+`([^`]+)`\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]*);$/i);
  if (!match) throw new Error(`Could not parse an INSERT statement: ${statement.slice(0, 80)}`);
  const table = match[1];
  const columns = [...match[2].matchAll(/`([^`]+)`/g)].map((item) => item[1]);
  const rows = [];
  const values = match[3];
  let tupleStart = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < values.length; index += 1) {
    const character = values[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "'") {
      if (quoted && values[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") {
      if (depth === 0) tupleStart = index + 1;
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        const tuple = parseTupleValues(values.slice(tupleStart, index));
        if (tuple.length !== columns.length) {
          throw new Error(`Column count mismatch in legacy ${table} row.`);
        }
        rows.push(Object.fromEntries(columns.map((column, columnIndex) => [column, tuple[columnIndex]])));
      }
    }
  }
  if (depth !== 0 || quoted) throw new Error(`Unterminated value in legacy ${table} rows.`);
  return [table, rows];
}

function parseMysqlDump(sql) {
  const tables = new Map();
  for (const statement of findInsertStatements(sql)) {
    const [table, rows] = parseInsert(statement);
    tables.set(table, [...(tables.get(table) ?? []), ...rows]);
  }
  return tables;
}

function requiredRows(tables, table) {
  const rows = tables.get(table);
  if (!rows?.length) throw new Error(`The legacy SQL dump does not contain ${table} records.`);
  return rows;
}

function asTimestamp(value) {
  if (!value) return null;
  return `${String(value).replace(" ", "T")}+08:00`;
}

function deterministicUuid(namespace, id) {
  const bytes = createHash("sha1").update(`${namespace}:${id}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function batch(items, size = 100) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function ensureSuccess(operation, label) {
  const { data, error } = await operation;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function upsertRows(client, table, rows, conflict) {
  for (const chunk of batch(rows)) {
    await ensureSuccess(client.from(table).upsert(chunk, { onConflict: conflict }), `Importing ${table}`);
  }
}

async function loadAuthUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const result = await ensureSuccess(client.auth.admin.listUsers({ page, perPage: 1000 }), "Reading Supabase Auth users");
    users.push(...result.users);
    if (result.users.length < 1000) break;
  }
  return new Map(users.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user]));
}

async function ensureLegacyUser(client, existingUsers, legacyUser) {
  const email = String(legacyUser.email).trim().toLowerCase();
  if (!email || email.length > 254) throw new Error(`Legacy user ${legacyUser.user_id} has an invalid email.`);
  let user = existingUsers.get(email);
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: randomBytes(36).toString("base64url"),
      email_confirm: Boolean(legacyUser.email_verified_at),
      user_metadata: {
        first_name: legacyUser.first_name,
        last_name: legacyUser.last_name,
        legacy_import: true,
      },
    });
    if (error || !data.user) {
      throw new Error(`Could not import legacy account ${legacyUser.user_id} (${email}): ${error?.message ?? "No user returned."}`);
    }
    user = data.user;
    existingUsers.set(email, user);
  }
  return user.id;
}

async function mapUpsertIds(client, table, rows, nameColumn) {
  const ids = new Map();
  for (const chunk of batch(rows, 100)) {
    const existing = await ensureSuccess(
      client.from(table).select(`id,${nameColumn}`).in(nameColumn, chunk.map((row) => row[nameColumn])),
      `Checking existing ${table}`,
    );
    for (const row of existing ?? []) ids.set(row[nameColumn], row.id);
    const missing = chunk.filter((row) => !ids.has(row[nameColumn]));
    if (missing.length) {
      const inserted = await ensureSuccess(
        client.from(table).insert(missing).select(`id,${nameColumn}`),
        `Importing ${table}`,
      );
      for (const row of inserted ?? []) ids.set(row[nameColumn], row.id);
    }
  }
  return ids;
}

async function ensureLegacyTransactions(client, table, rows, legacyIdColumn, referenceColumn, namespace) {
  const ids = new Map();
  const prepared = rows.map((row) => ({
    ...row,
    id: deterministicUuid(namespace, row[legacyIdColumn]),
    reference_no: row[referenceColumn] || `${namespace}-${row[legacyIdColumn]}`,
  }));
  const references = prepared.map((row) => row.reference_no);
  const existing = new Map();
  for (const part of batch(references, 100)) {
    const result = await ensureSuccess(
      client.from(table).select("id,reference_no").in("reference_no", part),
      `Checking existing ${table}`,
    );
    for (const row of result ?? []) existing.set(row.reference_no, row.id);
  }

  const missing = prepared.filter((row) => !existing.has(row.reference_no));
  const unexpectedMatches = prepared.filter((row) => {
    const existingId = existing.get(row.reference_no);
    return existingId && existingId !== row.id;
  });
  if (unexpectedMatches.length) {
    throw new Error(`A legacy ${table} reference already belongs to a different record; resolve the duplicate before importing.`);
  }
  for (const chunk of batch(missing, 100)) {
    const inserted = await ensureSuccess(
      client.from(table).insert(chunk).select("id,reference_no"),
      `Importing ${table}`,
    );
    for (const row of inserted ?? []) existing.set(row.reference_no, row.id);
  }
  for (const row of prepared) ids.set(row[legacyIdColumn], existing.get(row.reference_no));
  return ids;
}

async function runMigration(dumpPath, dryRun) {
  if (!existsSync(dumpPath)) throw new Error(`MySQL dump not found: ${dumpPath}`);
  const tables = parseMysqlDump(readFileSync(dumpPath, "utf8"));
  const counts = Object.fromEntries([...tables].map(([table, rows]) => [table, rows.length]));
  for (const table of ["roles", "puroks", "users", "barangay_settings", "document_types",
    "document_requirements", "document_requests", "request_status_history",
    "concern_categories", "concerns", "concern_updates", "activity_logs"]) {
    requiredRows(tables, table);
  }
  console.log("Legacy dump parsed successfully. Row counts:", JSON.stringify(counts, null, 2));
  console.log("Legacy password hashes and email verification tokens will not be imported.");
  console.log("Newly created Supabase accounts receive random, discarded passwords; users must reset their passwords.");
  if (dryRun) {
    console.log("Dry run only. No Supabase connection or database changes were made.");
    return;
  }

  const localEnvironment = readLocalEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.SUPABASE_URL
    ?? localEnvironment.NEXT_PUBLIC_SUPABASE_URL
    ?? localEnvironment.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnvironment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Live import requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in web/.env.local. Never put the service-role key in Vercel or a NEXT_PUBLIC_ variable.");
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rows = (table) => requiredRows(tables, table);
  const roles = new Map(rows("roles").map((role) => [role.role_id, role.role_key]));

  const [purokIds, documentIds, categoryIds] = await Promise.all([
    mapUpsertIds(client, "puroks", rows("puroks").map((row) => ({ name: row.purok_name })), "name"),
    mapUpsertIds(client, "document_types", rows("document_types").map((row) => ({
      name: row.name,
      description: row.description,
      fee: row.fee,
      processing_days: row.processing_days,
      is_archived: Boolean(row.is_archived),
      created_at: asTimestamp(row.created_at),
      updated_at: asTimestamp(row.updated_at),
    })), "name"),
    mapUpsertIds(client, "concern_categories", rows("concern_categories").map((row) => ({
      name: row.name,
      description: row.description,
      default_priority: row.default_priority,
      is_archived: Boolean(row.is_archived),
      created_at: asTimestamp(row.created_at),
      updated_at: asTimestamp(row.updated_at),
    })), "name"),
  ]);
  const legacyPuroks = new Map(rows("puroks").map((row) => [row.purok_id, purokIds.get(row.purok_name)]));
  const legacyDocuments = new Map(rows("document_types").map((row) => [row.doc_type_id, documentIds.get(row.name)]));
  const legacyCategories = new Map(rows("concern_categories").map((row) => [row.category_id, categoryIds.get(row.name)]));

  const authUsers = await loadAuthUsers(client);
  const userIds = new Map();
  for (const legacyUser of rows("users")) {
    userIds.set(legacyUser.user_id, await ensureLegacyUser(client, authUsers, legacyUser));
  }
  await upsertRows(client, "profiles", rows("users").map((user) => {
    const role = roles.get(user.role_id);
    if (!role) throw new Error(`Legacy user ${user.user_id} has an unknown role.`);
    return {
      id: userIds.get(user.user_id),
      email: String(user.email).trim().toLowerCase(),
      role,
      first_name: user.first_name,
      last_name: user.last_name,
      contact_no: user.contact_no,
      street_address: user.street_address,
      purok_id: user.purok_id == null ? null : legacyPuroks.get(user.purok_id),
      email_verified_at: asTimestamp(user.email_verified_at),
      is_active: Boolean(user.is_active),
      created_at: asTimestamp(user.created_at),
      updated_at: asTimestamp(user.updated_at),
    };
  }), "id");

  const settings = rows("barangay_settings")[0];
  if (settings) {
    const existingSettings = await ensureSuccess(
      client.from("barangay_settings")
        .select("barangay_name,municipality,province,office_hours,logo_path,updated_by,updated_at")
        .eq("id", true)
        .maybeSingle(),
      "Checking barangay settings",
    );
    await ensureSuccess(client.from("barangay_settings").upsert({
      id: true,
      barangay_name: settings.barangay_name ?? existingSettings?.barangay_name ?? null,
      municipality: settings.municipality ?? existingSettings?.municipality ?? null,
      province: settings.province ?? existingSettings?.province ?? null,
      office_hours: settings.office_hours ?? existingSettings?.office_hours ?? null,
      logo_path: existingSettings?.logo_path ?? null,
      updated_by: settings.updated_by == null ? existingSettings?.updated_by ?? null : userIds.get(settings.updated_by),
      updated_at: asTimestamp(settings.updated_at) ?? existingSettings?.updated_at,
    }, { onConflict: "id" }), "Importing barangay settings");
  }

  const requirements = rows("document_requirements");
  for (const legacyDocument of rows("document_types")) {
    const documentId = legacyDocuments.get(legacyDocument.doc_type_id);
    const existing = await ensureSuccess(
      client.from("document_requirements").select("requirement_text").eq("doc_type_id", documentId),
      "Checking existing document requirements",
    );
    const existingTexts = new Set((existing ?? []).map((row) => row.requirement_text));
    const missing = requirements
      .filter((row) => row.doc_type_id === legacyDocument.doc_type_id && !existingTexts.has(row.requirement_text))
      .map((row) => ({
        doc_type_id: documentId,
        requirement_text: row.requirement_text,
        sort_order: row.sort_order,
      }));
    for (const chunk of batch(missing)) {
      await ensureSuccess(client.from("document_requirements").insert(chunk), "Importing document requirements");
    }
  }

  const requestRows = rows("document_requests").map((row) => ({
    resident_id: userIds.get(row.resident_id),
    doc_type_id: legacyDocuments.get(row.doc_type_id),
    purpose: row.purpose,
    copies: row.copies,
    fee_amount: row.fee_amount,
    status: row.status,
    remarks: row.remarks,
    handled_by: row.handled_by == null ? null : userIds.get(row.handled_by),
    is_archived: Boolean(row.is_archived),
    created_at: asTimestamp(row.created_at),
    updated_at: asTimestamp(row.updated_at),
  }));
  const requestIds = await ensureLegacyTransactions(
    client,
    "document_requests",
    requestRows,
    "request_id",
    "reference_no",
    "legacy-request",
  );
  const legacyRequests = new Map(rows("document_requests").map((row) => [row.request_id, requestIds.get(row.request_id)]));
  await upsertRows(client, "request_status_history", rows("request_status_history").map((row) => ({
    id: 1_000_000_000 + row.history_id,
    request_id: legacyRequests.get(row.request_id),
    from_status: row.from_status,
    to_status: row.to_status,
    remarks: row.remarks,
    changed_by: userIds.get(row.changed_by),
    changed_at: asTimestamp(row.changed_at),
  })), "id");

  const concernRows = rows("concerns").map((row) => ({
    resident_id: userIds.get(row.resident_id),
    category_id: legacyCategories.get(row.category_id),
    purok_id: legacyPuroks.get(row.purok_id),
    title: row.title,
    description: row.description,
    location: row.location,
    priority: row.priority,
    status: row.status,
    assigned_to: row.assigned_to == null ? null : userIds.get(row.assigned_to),
    resolution: row.resolution,
    is_archived: Boolean(row.is_archived),
    created_at: asTimestamp(row.created_at),
    updated_at: asTimestamp(row.updated_at),
  }));
  const concernIds = await ensureLegacyTransactions(
    client,
    "concerns",
    concernRows,
    "concern_id",
    "reference_no",
    "legacy-concern",
  );
  const legacyConcerns = new Map(rows("concerns").map((row) => [row.concern_id, concernIds.get(row.concern_id)]));
  await upsertRows(client, "concern_updates", rows("concern_updates").map((row) => ({
    id: 1_000_000_000 + row.update_id,
    concern_id: legacyConcerns.get(row.concern_id),
    from_status: row.from_status,
    to_status: row.to_status,
    note: row.note,
    changed_by: userIds.get(row.changed_by),
    changed_at: asTimestamp(row.changed_at),
  })), "id");

  await upsertRows(client, "activity_logs", rows("activity_logs").map((row) => ({
    id: 1_000_000_000 + row.log_id,
    user_id: row.user_id == null ? null : userIds.get(row.user_id),
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id == null
      ? null
      : String(
        row.entity_type === "user" ? userIds.get(row.entity_id)
          : row.entity_type === "document_request" ? legacyRequests.get(row.entity_id)
            : row.entity_type === "concern" ? legacyConcerns.get(row.entity_id)
              : row.entity_type === "document_type" ? legacyDocuments.get(row.entity_id)
                : row.entity_id,
      ),
    details: row.details,
    ip_address: row.ip_address,
    created_at: asTimestamp(row.created_at),
  })), "id");

  console.log("Legacy data import completed successfully.");
  console.log("Accounts were imported with random passwords that were not saved. Have account holders use password recovery before signing in.");
  console.log("Email-verification tokens and the old logo file were not imported. Verify users in Supabase Auth or have them re-register.");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
} else {
  const dryRun = args.includes("--dry-run");
  const dumpArgument = args.find((arg) => !arg.startsWith("--"));
  const bundledDumpPath = resolve(webDirectory, "../database/barangay_eservices.sql");
  const dumpPath = resolve(dumpArgument ?? bundledDumpPath);
  runMigration(dumpPath, dryRun).catch((error) => {
    console.error(error instanceof Error ? error.message : "Legacy import failed.");
    process.exitCode = 1;
  });
}
