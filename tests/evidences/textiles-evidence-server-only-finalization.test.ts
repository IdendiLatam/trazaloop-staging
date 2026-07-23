/**
 * Trazaloop · Sprint T9E.3 (Textil) · Finalización SERVER-ONLY (estático):
 * los RPC que insertan evidencias / marcan limpieza NO son invocables por
 * `authenticated` — solo el servidor (service_role) los ejecuta, tras hacer
 * TODAS las verificaciones externas (objeto en Storage, bytes, firma).
 *
 * Verifica contra el CÓDIGO REAL (y la migración 0098):
 *   · 0098 revoca finalize/cleanup 0097 a public/anon/authenticated y crea
 *     las variantes *_server con GRANT solo a service_role;
 *   · las *_server reciben el actor explícito y NO confían en auth.uid();
 *   · la Server Action invoca las *_server con el cliente ADMIN (server-only)
 *     y hace la verificación del objeto/bytes/firma ANTES del RPC;
 *   · lib/supabase/admin.ts importa "server-only";
 *   · NINGÚN módulo cliente ("use client") importa el cliente admin;
 *   · nadie invoca los RPC sellados de 0097 desde el código de la app.
 *
 * Correr: npx tsx tests/evidences/textiles-evidence-server-only-finalization.test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripSqlComments = (s: string) => s.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/0098_server_only_textile_evidence_finalize.sql";
const ACTIONS = "server/actions/textiles-evidences.ts";
const DB = "lib/db/textiles-evidences.ts";
const ADMIN = "lib/supabase/admin.ts";

console.log("Trazaloop · T9E.3: migración 0098 (sellado + variantes server)\n");

check("1. 0098 REVOCA finalize/cleanup de 0097 a public, anon y authenticated", () => {
  const sql = stripSqlComments(read(MIGRATION)).toLowerCase();
  assert(
    /revoke\s+all\s+on\s+function\s+public\.finalize_textile_evidence_upload\s*\(\s*uuid\s*,\s*bigint\s*,\s*text\s*\)\s*\n?\s*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/.test(
      sql
    ),
    "falta el revoke completo del finalize 0097"
  );
  assert(
    /revoke\s+all\s+on\s+function\s+public\.record_textile_upload_intent_cleanup\s*\(\s*uuid\s*,\s*boolean\s*\)\s*\n?\s*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/.test(
      sql
    ),
    "falta el revoke completo del cleanup 0097"
  );
});

check("2. 0098 crea las variantes *_server con GRANT SOLO a service_role", () => {
  const sql = stripSqlComments(read(MIGRATION)).toLowerCase();
  assert(
    sql.includes("create or replace function public.finalize_textile_evidence_upload_server"),
    "falta finalize_textile_evidence_upload_server"
  );
  assert(
    sql.includes("create or replace function public.record_textile_upload_intent_cleanup_server"),
    "falta record_textile_upload_intent_cleanup_server"
  );
  for (const fn of [
    "finalize_textile_evidence_upload_server",
    "record_textile_upload_intent_cleanup_server",
  ]) {
    const grant = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+service_role\\s*;`
    );
    assert(grant.test(sql), `falta el grant service_role de ${fn}`);
    const revoke = new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*\\n?\\s*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`
    );
    assert(revoke.test(sql), `falta el revoke public/anon/authenticated de ${fn}`);
    assert(!new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[^;]*to[^;]*authenticated`).test(sql),
      `${fn} JAMÁS debe otorgarse a authenticated`);
  }
});

check("3. Las *_server reciben ACTOR explícito y NO confían en auth.uid()", () => {
  const sql = stripSqlComments(read(MIGRATION));
  const serverPart = sql.slice(sql.indexOf("finalize_textile_evidence_upload_server"));
  assert(serverPart.includes("p_actor_id uuid"), "falta el parámetro p_actor_id");
  assert(!/auth\.uid\s*\(\)/.test(serverPart), "las funciones server no deben leer auth.uid()");
  assert(/from\s+public\.memberships/i.test(serverPart), "debe revalidar membresía en SQL");
  assert(/created_by\s*<>\s*p_actor_id/i.test(serverPart), "debe revalidar que el actor sea el creador");
  assert(/for\s+update/i.test(serverPart), "debe bloquear el intento con FOR UPDATE");
});

console.log("\nTrazaloop · T9E.3: capa de aplicación (admin server-only)\n");

check("4. lib/supabase/admin.ts importa \"server-only\"", () => {
  const src = stripComments(read(ADMIN));
  assert(/import\s+"server-only"/.test(src), "falta import \"server-only\"");
  assert(src.includes("SUPABASE_SERVICE_ROLE_KEY"), "debe usar la service role key del entorno");
});

check("5. lib/db invoca los RPC *_server SOLO con el cliente admin", () => {
  const src = stripComments(read(DB));
  assert(
    src.includes('import { createAdminClient } from "@/lib/supabase/admin"'),
    "lib/db debe importar el cliente admin"
  );
  const fin = src.slice(src.indexOf("export async function finalizeTextileEvidenceUploadRpc"));
  const finBody = fin.slice(0, fin.indexOf("export async function", 10));
  assert(finBody.includes("createAdminClient()"), "finalize debe usar el cliente admin");
  assert(finBody.includes('"finalize_textile_evidence_upload_server"'), "finalize debe llamar la variante _server");
  assert(finBody.includes("p_actor_id"), "finalize debe pasar el actor explícito");
  const clean = src.slice(src.indexOf("export async function recordTextileUploadIntentCleanupRpc"));
  const cleanBody = clean.slice(0, clean.indexOf("export async function", 10));
  assert(cleanBody.includes("createAdminClient()"), "cleanup debe usar el cliente admin");
  assert(cleanBody.includes('"record_textile_upload_intent_cleanup_server"'), "cleanup debe llamar la variante _server");
  assert(cleanBody.includes("p_actor_id"), "cleanup debe pasar el actor explícito");
});

check("6. La app JAMÁS invoca los RPC sellados de 0097 con sesión de usuario", () => {
  const roots = ["app", "components", "lib", "server", "scripts"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const src = stripComments(readFileSync(p, "utf8"));
        if (
          /rpc\(\s*"finalize_textile_evidence_upload"/.test(src) ||
          /rpc\(\s*"record_textile_upload_intent_cleanup"/.test(src)
        ) {
          offenders.push(p);
        }
      }
    }
  };
  for (const r of roots) walk(join(process.cwd(), r));
  assert(offenders.length === 0, `RPC sellados aún invocados en: ${offenders.join(", ")}`);
});

check("7. NINGÚN módulo cliente (\"use client\") importa el cliente admin", () => {
  const roots = ["app", "components", "lib", "server"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        const isClient = /^\s*["']use client["']/.test(src.trimStart());
        if (isClient && /supabase\/admin/.test(src)) offenders.push(p);
      }
    }
  };
  for (const r of roots) walk(join(process.cwd(), r));
  assert(offenders.length === 0, `módulos cliente importan admin: ${offenders.join(", ")}`);
});

check("8. La Server Action verifica objeto+bytes+firma ANTES del RPC atómico", () => {
  const src = stripComments(read(ACTIONS));
  const fin = src.slice(src.indexOf("export async function finalizeTextileEvidenceUpload"));
  const iInfo = fin.indexOf("getTextileEvidenceObjectInfo");
  const iBytes = fin.indexOf("downloadTextileEvidenceObjectBytes");
  const iSig = fin.indexOf("validateTextileEvidenceBinarySignature");
  const iRpc = fin.indexOf("finalizeTextileEvidenceUploadRpc");
  assert(iInfo > 0 && iBytes > 0 && iSig > 0 && iRpc > 0, "faltan pasos de verificación");
  assert(iInfo < iRpc && iBytes < iRpc && iSig < iRpc, "el RPC debe ser el ÚLTIMO paso");
  assert(fin.includes("intent.createdBy !== userId"), "debe verificar el creador antes del RPC");
});

check("9. La Server Action pasa el actor resuelto en servidor al RPC", () => {
  const src = stripComments(read(ACTIONS));
  const fin = src.slice(src.indexOf("export async function finalizeTextileEvidenceUpload"));
  assert(
    /finalizeTextileEvidenceUploadRpc\(\s*userId\s*,/.test(fin),
    "el finalize debe recibir el userId resuelto por el servidor"
  );
  assert(
    /recordTextileUploadIntentCleanupRpc\(\s*userId\s*,/.test(fin),
    "el cleanup debe recibir el userId resuelto por el servidor"
  );
});

check("10. begin y mark_failed SIGUEN siendo RPC de usuario (no admin)", () => {
  const src = stripComments(read(DB));
  const begin = src.slice(src.indexOf("export async function beginTextileEvidenceUploadRpc"));
  const beginBody = begin.slice(0, begin.indexOf("export async function", 10));
  assert(beginBody.includes("createServerClient"), "begin usa la sesión del usuario");
  assert(!beginBody.includes("createAdminClient"), "begin JAMÁS usa el cliente admin");
  const mark = src.slice(src.indexOf("export async function markTextileEvidenceUploadFailedRpc"));
  const markBody = mark.slice(0, mark.indexOf("export async function", 10));
  assert(markBody.includes("createServerClient"), "mark_failed usa la sesión del usuario");
  assert(!markBody.includes("createAdminClient"), "mark_failed JAMÁS usa el cliente admin");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
