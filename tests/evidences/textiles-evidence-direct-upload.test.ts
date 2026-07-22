/**
 * Trazaloop · Sprint T9E.1 (Textil) · Regresión de CARGA DIRECTA de
 * evidencias: los bytes del archivo van del navegador a Supabase Storage
 * (signed upload URL emitida en servidor) y JAMÁS atraviesan una Server
 * Action, un Route Handler ni una función serverless. La finalización
 * verifica el intento (0094) y la metadata REAL del objeto.
 *
 * T9E.2: la finalización es ATÓMICA (RPC 0097), las transiciones de
 * intentos son SOLO por RPC, la firma binaria del objeto se verifica en
 * servidor y la limpieza es RECUPERABLE. Complementan: la suite pura de
 * firmas (textiles-evidence-signatures) y las pruebas REALES de staging
 * (tests/rls/textiles-t9e1-multitenant y textiles-t9e2-integrity).
 *
 * Correr: npx tsx tests/evidences/textiles-evidence-direct-upload.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  TEXTILE_EVIDENCE_MAX_FILE_BYTES,
  TEXTILE_EVIDENCE_UPLOAD_INTENT_TTL_MINUTES,
  TEXTILE_EVIDENCE_UPLOAD_INTENT_STATUSES,
  validateTextileEvidenceUploadedObject,
  isTextileUploadIntentExpired,
  sanitizeTextileEvidenceFileName,
  buildTextileEvidencePath,
} from "../../lib/domain/textiles-evidences";

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
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const ACTIONS = read("server/actions/textiles-evidences.ts");
const FORM = read("components/domain/textiles/evidence-upload-form.tsx");
const DB = read("lib/db/textiles-evidences.ts");
const MIG = read("supabase/migrations/0094_textile_evidence_upload_intents.sql");
const NEW_PAGE = read("app/(app)/(shell)/textiles/evidences/new/page.tsx");
const FORM_CODE = stripComments(FORM);
const ACTIONS_CODE = stripComments(ACTIONS);

console.log("Trazaloop · T9E.1: los bytes no atraviesan Next.js\n");

check("1. El formulario JAMÁS mete el File en el FormData de una Server Action", () => {
  assert(!/formData\.(set|append)\(\s*["']file["']/.test(FORM_CODE), "el File no debe viajar en FormData");
  assert(!/new FormData\(\)[\s\S]{0,600}file/.test(FORM_CODE.split("metadataFormData")[1]?.split("}")[0] ?? ""), "metadataFormData solo lleva campos pequeños");
  assert(!/action=\{[a-zA-Z]*[Aa]ction\}/.test(FORM_CODE), "sin form action={serverAction} con binario");
  assert(FORM.includes("uploadFileDirectly"), "la subida usa el camino directo");
});

check("2. La subida del binario es un PUT a la signed upload URL de Storage (nunca a Next.js)", () => {
  assert(FORM_CODE.includes('xhr.open("PUT", signedUrl'), "el PUT va a la URL firmada");
  assert(!/fetch\(["']\/api/.test(FORM_CODE), "sin route handlers para el binario");
  assert(!FORM_CODE.includes("localhost"), "el destino jamás es localhost");
  assert(FORM_CODE.includes('xhr.setRequestHeader("x-upsert", "false")'), "sin upsert: la ruta es de un solo uso");
  assert(FORM.includes("event.loaded / event.total"), "la UI muestra progreso real");
  assert(FORM.includes("xhr.abort") || FORM.includes("cancelUpload"), "la carga puede cancelarse");
});

check("3. La página de creación usa begin/finalize (no la action antigua con archivo)", () => {
  assert(NEW_PAGE.includes("beginTextileEvidenceUploadAction"), "falta begin en la página");
  assert(NEW_PAGE.includes("finalizeTextileEvidenceUploadAction"), "falta finalize en la página");
  assert(!ACTIONS.includes("createTextileEvidenceAction"), "la action antigua con archivo debía desaparecer");
  assert(!/formData\.get\(["']file["']\)/.test(ACTIONS_CODE), "ninguna action lee un File del FormData");
  assert(!ACTIONS_CODE.includes("arrayBuffer"), "ninguna action toca los bytes del archivo");
});

console.log("\nTrazaloop · T9E.1: fase A (inicio) — servidor manda\n");

check("4. begin exige módulo + rol y valida tamaño/MIME/extensión DECLARADOS", () => {
  const begin = ACTIONS.split("export async function beginTextileEvidenceUploadAction")[1]?.split("export async function")[0] ?? "";
  assert(begin.includes("await gate()"), "begin sin triple guarda");
  assert(begin.includes("canUploadTextileEvidence"), "begin sin verificación de rol");
  assert(begin.includes("isAllowedTextileEvidenceMime"), "begin sin validación de MIME");
  assert(begin.includes("isAllowedTextileEvidenceExtension"), "begin sin validación de extensión");
  assert(begin.includes("TEXTILE_EVIDENCE_MAX_FILE_BYTES"), "begin sin límite de tamaño");
  assert(begin.includes("checkStorageAvailable"), "begin sin verificación de cuota");
});

check("5. T9E.2: la ruta EXACTA nace en la RPC de BD (gen_random_uuid + saneo) — el cliente jamás la envía", () => {
  const MIG97 = read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql");
  assert(MIG97.includes("gen_random_uuid()"), "el id debía ser criptográficamente aleatorio (BD)");
  assert(
    MIG97.includes("v_path := p_organization_id::text || '/textiles/' || v_id::text || '/' || v_safe"),
    "la RPC construye la ruta exacta en servidor"
  );
  assert(ACTIONS.includes("beginTextileEvidenceUploadRpc"), "begin delega el intento en la RPC 0097");
  assert(!ACTIONS_CODE.includes("input.organizationId"), "jamás organization_id del cliente");
  assert(!/input\.(objectPath|path)/.test(ACTIONS_CODE), "el cliente jamás decide la ruta");
  const p = buildTextileEvidencePath("org-1", "intent-1", "reporte final (v2).pdf");
  assert(p === "org-1/textiles/intent-1/reporte_final__v2_.pdf", "ruta canónica {org}/textiles/{id}/{safe}");
  assert(sanitizeTextileEvidenceFileName("../..//x.pdf") === ".._..__x.pdf", "el nombre queda saneado sin traversal");
  assert(
    /object_path = organization_id::text \|\| '\/textiles\/' \|\| id::text \|\| '\/' \|\| safe_filename/.test(MIG97),
    "el CHECK de 0097 ata la ruta EXACTA al intento"
  );
});

check("6. begin devuelve solo lo necesario y el token no se persiste ni incluye service role", () => {
  assert(ACTIONS.includes("createTextileEvidenceSignedUploadUrl"), "begin emite la URL firmada en servidor");
  assert(!/insert\([\s\S]{0,400}token/i.test(stripComments(DB).split("createTextileEvidenceUploadIntent")[1]?.split("export")[0] ?? ""), "el token jamás se guarda en el intento");
  assert(!/token\s+text/.test(MIG), "0094 no tiene columna de token");
  assert(!stripComments(DB).includes("SERVICE_ROLE"), "la capa de datos jamás usa service role");
  assert(!FORM_CODE.includes("SERVICE_ROLE") && !FORM_CODE.includes("service_role"), "el cliente jamás ve service role");
});

check("7. El intento nace con TTL corto y expiración verificable", () => {
  assert(TEXTILE_EVIDENCE_UPLOAD_INTENT_TTL_MINUTES <= 60, "el TTL debía ser corto");
  assert(ACTIONS.includes("TEXTILE_EVIDENCE_UPLOAD_INTENT_TTL_MINUTES"), "begin usa el TTL central");
  assert(isTextileUploadIntentExpired(new Date(Date.now() - 1000).toISOString()), "vencido → expirado");
  assert(!isTextileUploadIntentExpired(new Date(Date.now() + 60_000).toISOString()), "vigente → no expirado");
});

console.log("\nTrazaloop · T9E.1: fase C (finalización) — el objeto REAL manda\n");

check("8. La finalización verifica intento: organización, usuario creador, vigencia y consumo", () => {
  const fin = ACTIONS.split("export async function finalizeTextileEvidenceUploadAction")[1] ?? "";
  assert(fin.includes("getTextileEvidenceUploadIntent(g.ok.organizationId"), "el intento se busca por organización ACTIVA");
  assert(fin.includes("intent.createdBy !== userId"), "el intento debía pertenecer al usuario");
  assert(fin.includes("isTextileUploadIntentExpired"), "la vigencia se verifica");
  // T9E.2: el estado consumido lo resuelve la RPC atómica con idempotencia
  // (already_finalized); la acción traduce sus códigos sin ignorarlos.
  assert(fin.includes("finalizeTextileEvidenceUploadRpc"), "la finalización delega en la RPC atómica");
  assert(fin.includes("finalized.errorCode !== null"), "el resultado del consumo JAMÁS se ignora");
});

check("9. La finalización valida el objeto REAL: tamaño/Content-Type Y FIRMA BINARIA (T9E.2)", () => {
  const fin = ACTIONS.split("export async function finalizeTextileEvidenceUploadAction")[1] ?? "";
  assert(fin.includes("getTextileEvidenceObjectInfo(intent.objectPath)"), "se consulta el objeto real en Storage");
  assert(fin.includes("validateTextileEvidenceUploadedObject"), "se valida contra la regla pura central");
  assert(DB.includes(".info(objectPath)"), "la metadata sale de storage.info");
  // T9E.2: el Content-Type almacenado proviene del PUT del navegador — por
  // eso ADEMÁS se descargan los bytes desde Storage y se exige la firma.
  assert(fin.includes("downloadTextileEvidenceObjectBytes"), "los bytes reales se descargan desde Storage");
  assert(fin.includes("validateTextileEvidenceBinarySignature"), "la firma binaria es obligatoria");
  assert(!fin.includes("arrayBuffer()") || DB.includes("arrayBuffer"), "el archivo jamás viaja por la action");
  // La finalización ya NO recibe metadata del cliente: solo el intentId.
  assert(/finalizeTextileEvidenceUploadAction\(\s*intentId: string\s*\)/.test(ACTIONS), "finalize solo recibe intentId");
  const finBody = stripComments(fin.split("export async function")[0] ?? fin);
  assert(!finBody.includes("parseMetadata"), "finalize no acepta otra metadata del cliente");
});

check("10. Regla pura de verificación: inexistente, tamaño distinto, MIME distinto y sobre-límite se rechazan", () => {
  const base = { expectedSizeBytes: 1000, expectedMimeType: "application/pdf" };
  assert(
    validateTextileEvidenceUploadedObject({ ...base, realSizeBytes: null, realMimeType: null }) !== null,
    "objeto inexistente → rechazo"
  );
  assert(
    validateTextileEvidenceUploadedObject({ ...base, realSizeBytes: 999, realMimeType: "application/pdf" })?.includes("tamaño"),
    "tamaño real distinto → rechazo"
  );
  assert(
    validateTextileEvidenceUploadedObject({ ...base, realSizeBytes: 1000, realMimeType: "application/zip" }) !== null,
    "MIME real no permitido → rechazo"
  );
  assert(
    validateTextileEvidenceUploadedObject({ ...base, realSizeBytes: 1000, realMimeType: "image/png" })?.includes("tipo"),
    "MIME real distinto del declarado → rechazo"
  );
  assert(
    validateTextileEvidenceUploadedObject({
      expectedSizeBytes: TEXTILE_EVIDENCE_MAX_FILE_BYTES + 1,
      expectedMimeType: "application/pdf",
      realSizeBytes: TEXTILE_EVIDENCE_MAX_FILE_BYTES + 1,
      realMimeType: "application/pdf",
    }) !== null,
    "sobre el máximo → rechazo"
  );
  assert(
    validateTextileEvidenceUploadedObject({ ...base, realSizeBytes: 1000, realMimeType: "application/pdf" }) === null,
    "objeto íntegro → aceptado"
  );
});

check("11. T9E.2: insert + consumo son UNA transacción (RPC 0097); sin INSERT directo desde TypeScript", () => {
  const MIG97 = read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql");
  // La app JAMÁS inserta la evidencia directamente: solo la RPC atómica.
  assert(!/from\("textile_evidences"\)\s*\.insert/.test(ACTIONS_CODE), "queda un INSERT directo en TS");
  assert(ACTIONS.includes("finalizeTextileEvidenceUploadRpc"), "finalize usa la RPC atómica");
  assert(MIG97.includes("for update"), "la RPC bloquea el intento con FOR UPDATE");
  const insertPos = MIG97.indexOf("insert into public.textile_evidences");
  const consumePos = MIG97.indexOf("set status = 'consumed'");
  assert(insertPos > 0 && consumePos > insertPos, "insert + consumo viven en la MISMA función/transacción");
  assert(MIG97.includes("'already_finalized', true"), "doble finalize → idempotente con el MISMO evidence_id");
  assert(MIG97.includes("evidence_id = v_intent.id"), "el intento queda ligado a SU evidencia");
  assert(MIG97.includes("INTENT_CONSUMED_INCONSISTENT"), "consumido sin evidencia → inconsistencia explícita");
});

check("12. Fallo tras la subida: objeto retirado + intento failed vía RPC — jamás fila inconsistente", () => {
  const fin = ACTIONS.split("export async function finalizeTextileEvidenceUploadAction")[1] ?? "";
  assert(
    /objectError[\s\S]{0,500}removeTextileEvidenceObject[\s\S]{0,300}markTextileEvidenceUploadFailedRpc/.test(fin),
    "objeto inválido → retiro + intento failed (RPC)"
  );
  assert(
    /signatureError[\s\S]{0,500}removeTextileEvidenceObject[\s\S]{0,300}markTextileEvidenceUploadFailedRpc/.test(fin),
    "firma inválida → retiro + intento failed (RPC) SIN crear evidencia"
  );
  // La atomicidad de la RPC garantiza que un fallo del insert revierte el
  // consumo (misma transacción): no existe rama TS que consuma sin insertar.
  assert(!ACTIONS_CODE.includes("consumeTextileEvidenceUploadIntent"), "no quedan consumos manuales en TS");
});

console.log("\nTrazaloop · T9E.1: intentos (0094), limpieza y transporte\n");

check("13. 0094: RLS deny-by-default, sin anon, aislada por organización y con estados acotados", () => {
  assert(MIG.includes("enable row level security"), "RLS activa");
  assert(!/to anon/.test(MIG), "cero políticas para anon");
  assert(MIG.includes("is_org_member(organization_id)"), "lectura solo miembros");
  assert(
    MIG.includes("has_org_role(organization_id, array['admin', 'quality', 'consultant'])"),
    "escritura solo roles de carga"
  );
  assert(MIG.includes("created_by = auth.uid()"), "el intento nace del usuario real");
  for (const s of TEXTILE_EVIDENCE_UPLOAD_INTENT_STATUSES) {
    assert(MIG.includes(`'${s}'`), `estado ${s} en el CHECK`);
  }
});

check("14. 0094: inmutabilidad de ruta/organización/creador y consumo único (también para service_role)", () => {
  assert(MIG.includes("guard_textile_evidence_upload_intent"), "falta el guard");
  assert(!/guard_textile_evidence_upload_intent\(\)[\s\S]{0,200}security definer/.test(MIG), "el guard NO es security definer (obliga a service_role)");
  assert(MIG.includes("son inmutables"), "los datos declarados son inmutables");
  assert(MIG.includes("Solo un intento pendiente puede consumirse"), "consumo único: solo desde pending");
  assert(MIG.includes("Un intento de carga consumido no puede eliminarse"), "los consumidos no se borran");
  assert(MIG.includes("position(organization_id::text || '/textiles/' in object_path) = 1"), "la ruta jamás sale de la organización (CHECK)");
  assert(MIG.includes("expires_at > created_at"), "restricción de expiración");
  assert(/object_path\s+text not null unique/.test(MIG), "sin rutas duplicadas");
});

check("15. Limpieza RECUPERABLE (T9E.2): solo cierra con retiro CONFIRMADO y nunca toca evidencias reales", () => {
  assert(
    /cleanupExpiredUploadIntents\(g\.ok\.organizationId,\s*actorId\)/.test(ACTIONS),
    "begin dispara la limpieza oportunista con el actor resuelto en servidor"
  );
  assert(/limit = 3/.test(ACTIONS), "la limpieza oportunista está acotada");
  // Barrera de evidencia vinculada ANTES de retirar + resultado confirmado.
  assert(
    /textileEvidenceExistsForPath[\s\S]{0,300}recordTextileUploadIntentCleanupRpc\(actorId, intent\.id, false\)/.test(ACTIONS),
    "ruta de evidencia real → jamás se retira"
  );
  assert(
    /const removed = await removeTextileEvidenceObject\(intent\.id\);[\s\S]{0,200}recordTextileUploadIntentCleanupRpc\(actorId, intent\.id, removed\)/.test(ACTIONS),
    "el cierre depende del resultado REAL del retiro"
  );
  const script = read("scripts/cleanup-textile-upload-intents.ts");
  assert(script.includes("--apply"), "el script tiene dry-run por defecto");
  assert(script.includes('eq("status", "pending")') && script.includes("expires_at"), "el script apunta a vencidos");
  assert(script.includes('eq("status", "failed")'), "el script REINTENTA fallidos (recuperable)");
  assert(script.includes('=== "consumed") continue'), "el script JAMÁS toca consumidos");
  assert(/from\("textile_evidences"\)[\s\S]{0,200}file_path/.test(script), "el script verifica evidencia vinculada antes de borrar");
  assert(/if \(rmErr\) \{[\s\S]{0,600}cleanup_attempts[\s\S]{0,400}continue;/.test(script), "retiro fallido → contador y sigue recuperable (sin marcar expired)");
  assert(/objectsRemoved\+\+;[\s\S]{0,700}status: "expired"/.test(script), "solo el retiro confirmado cierra el intento");
  assert(!script.includes("object_path}`)"), "el script no imprime rutas privadas completas");
});

check("16. El bucket sigue privado y sin URLs firmadas permanentes", () => {
  const storageMig = read("supabase/migrations/0015_storage.sql");
  assert(/\('evidences',\s*'evidences',\s*false\)/.test(storageMig), "bucket privado");
  assert(!MIG.toLowerCase().includes("public = true"), "0094 jamás publica el bucket");
  const ttl = DB.match(/const SIGNED_URL_TTL_SECONDS = (\d+) \* (\d+);/);
  assert(ttl !== null && Number(ttl[1]) * Number(ttl[2]) <= 3600, "la firma de DESCARGA sigue siendo de corta vida");
});

check("17. next.config sin bodySizeLimit: el transporte de metadata cabe en el default", () => {
  const config = stripComments(read("next.config.ts"));
  assert(!config.includes("bodySizeLimit"), "el límite elevado de T9E quedó retirado");
  assert(!config.includes("serverActions:"), "no queda configuración de serverActions");
});

console.log("\nTrazaloop · T9E.2: transiciones SOLO por RPC y metadata en begin\n");

check("18. 0097: clientes SIN INSERT/UPDATE/DELETE directos; SELECT solo del creador", () => {
  const MIG97 = read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql");
  assert(MIG97.includes("drop policy textile_upload_intents_insert"), "insert directo retirado");
  assert(MIG97.includes("drop policy textile_upload_intents_update"), "update directo retirado");
  assert(MIG97.includes("drop policy textile_upload_intents_delete"), "delete directo retirado");
  assert(/for select to authenticated[\s\S]{0,160}created_by = auth\.uid\(\)/.test(MIG97), "SELECT limitado al creador");
  const creates = (MIG97.match(/create policy/g) ?? []).length;
  assert(creates === 1, "solo debía recrearse la política de SELECT");
  for (const rpc of [
    "begin_textile_evidence_upload",
    "finalize_textile_evidence_upload",
    "mark_textile_evidence_upload_failed",
    "record_textile_upload_intent_cleanup",
  ]) {
    assert(MIG97.includes(`create or replace function public.${rpc}`), `falta la RPC ${rpc}`);
    assert(MIG97.includes(`revoke execute on function public.${rpc}`), `sin revoke en ${rpc}`);
  }
  assert((MIG97.match(/security definer/g) ?? []).length >= 4, "las RPCs son SECURITY DEFINER");
  assert((MIG97.match(/set search_path = public/g) ?? []).length >= 5, "search_path fijado en todas");
  assert(/created_by <> v_uid[\s\S]{0,80}INTENT_NOT_OWNED|v_intent\.created_by <> v_uid/.test(MIG97), "las RPCs exigen el CREADOR (mismo-org no basta)");
});

check("19. 0097: metadata funcional CANÓNICA validada en begin e inmutable en el intento", () => {
  const MIG97 = read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql");
  assert(MIG97.includes("evidence_metadata jsonb"), "columna de metadata canónica");
  assert(MIG97.includes("METADATA_TITLE_INVALID") && MIG97.includes("METADATA_TYPE_INVALID"), "begin valida la metadata en BD");
  assert(MIG97.includes("La metadata funcional del intento es inmutable"), "guard: metadata inmutable");
  assert(MIG97.includes("INTENT_WITHOUT_METADATA"), "finalize exige la metadata del intento");
  assert(MIG97.includes("v_meta->>'title'"), "la evidencia nace de la metadata del INTENTO");
  const begin = ACTIONS.split("export async function beginTextileEvidenceUploadAction")[1]?.split("export async function")[0] ?? "";
  assert(begin.includes("parseMetadata(input.metadata)"), "begin valida la metadata ANTES de emitir la URL");
  const beginTypes = ACTIONS.split("export type BeginTextileEvidenceUploadInput")[1]?.split("};")[0] ?? "";
  assert(beginTypes.includes("metadata: FormData"), "la metadata viaja en begin");
});

check("20. 0097: vínculo intento↔evidencia verificable e imborrable", () => {
  const MIG97 = read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql");
  assert(MIG97.includes("textile_upload_intents_evidence_uniq"), "índice único del vínculo");
  assert(MIG97.includes("textile_upload_intents_consumed_link_check"), "consumed exige evidencia");
  assert(MIG97.includes("La evidencia asociada a un intento no puede cambiar"), "guard: evidence_id inmutable");
  assert(MIG97.includes("Un intento consumido debe quedar ligado a su evidencia"), "guard: consumo requiere evidencia");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
