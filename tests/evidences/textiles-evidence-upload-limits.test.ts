/**
 * Trazaloop · Sprint T9E (Textil) · Regresión de carga de evidencias
 * (defecto 4.7): "Body exceeded 1 MB limit". El transporte de Server
 * Actions tiene un techo EXPLÍCITO y acotado; el archivo se valida con la
 * misma regla pura en cliente y servidor (tamaño, MIME, extensión); el
 * bucket sigue privado y sin URLs firmadas permanentes.
 *
 * Correr: npx tsx tests/evidences/textiles-evidence-upload-limits.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  TEXTILE_EVIDENCE_MAX_FILE_BYTES,
  TEXTILE_EVIDENCE_MAX_FILE_MB,
  TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES,
  TEXTILE_EVIDENCE_ALLOWED_EXTENSIONS,
  TEXTILE_EVIDENCE_FILE_RULES_MESSAGE,
  isAllowedTextileEvidenceMime,
  isAllowedTextileEvidenceExtension,
  validateTextileEvidenceFile,
  buildTextileEvidencePath,
  isTextileEvidencePathForOrg,
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

const MB = 1024 * 1024;
const pdf = (size: number) => ({ name: "informe.pdf", type: "application/pdf", size });

console.log("Trazaloop · T9E: regla pura de archivos de evidencia\n");

check("1. Archivo menor de 1 MB → aceptado", () => {
  assert(validateTextileEvidenceFile(pdf(0.5 * MB)) === null, "0.5 MB debía aceptarse");
});

check("2. Archivo mayor de 1 MB y menor que el máximo → aceptado (el defecto reportado)", () => {
  assert(validateTextileEvidenceFile(pdf(5 * MB)) === null, "5 MB debía aceptarse");
  assert(validateTextileEvidenceFile(pdf(19.9 * MB)) === null, "19.9 MB debía aceptarse");
});

check("3. Archivo EXACTAMENTE en el límite → aceptado; un byte más → rechazado", () => {
  assert(validateTextileEvidenceFile(pdf(TEXTILE_EVIDENCE_MAX_FILE_BYTES)) === null, "el límite exacto pasa");
  const over = validateTextileEvidenceFile(pdf(TEXTILE_EVIDENCE_MAX_FILE_BYTES + 1));
  assert(over !== null && over.includes("tamaño máximo"), "un byte más debía rechazarse con mensaje claro");
  assert(over!.includes(`${TEXTILE_EVIDENCE_MAX_FILE_MB} MB`), "el mensaje declara el máximo real");
});

check("4. MIME no permitido → rechazado (ejecutables jamás)", () => {
  const exe = validateTextileEvidenceFile({ name: "malo.exe", type: "application/x-msdownload", size: MB });
  assert(exe !== null && exe.includes("no permitido"), "un ejecutable debía rechazarse");
  assert(!isAllowedTextileEvidenceMime("application/zip"), "zip no está permitido");
  assert(!isAllowedTextileEvidenceMime(""), "MIME vacío no está permitido");
});

check("5. Extensión no permitida → rechazada aunque el MIME declare otra cosa", () => {
  const spoof = validateTextileEvidenceFile({ name: "archivo.exe", type: "application/pdf", size: MB });
  assert(spoof !== null && spoof.includes("Extensión"), "extensión .exe con MIME pdf debía rechazarse");
  assert(isAllowedTextileEvidenceExtension("Foto.JPG"), "las extensiones son case-insensitive");
  assert(!isAllowedTextileEvidenceExtension("nota.txt"), ".txt no está permitido");
  assert(
    TEXTILE_EVIDENCE_ALLOWED_EXTENSIONS.length >= TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES.length - 1,
    "las extensiones espejan los MIME permitidos"
  );
});

check("6. Ausencia de archivo o tamaño cero → rechazado", () => {
  const missing = validateTextileEvidenceFile({ name: "", type: "", size: 0 });
  assert(missing !== null && missing.includes("obligatorio"), "sin archivo debía rechazarse");
});

check("7. El nombre se sanitiza y la ruta queda aislada por organización", () => {
  const orgId = "33333333-3333-4333-8333-333333333333";
  const evidenceId = "44444444-4444-4444-8444-444444444444";
  const p = buildTextileEvidencePath(orgId, evidenceId, "ficha técnica (v2) ñu.pdf");
  assert(p.startsWith(`${orgId}/textiles/${evidenceId}/`), "la ruta arranca en la organización");
  assert(!/[^a-zA-Z0-9._\-/]/.test(p), "la ruta no contiene caracteres sin sanitizar");
  assert(isTextileEvidencePathForOrg(p, orgId), "la ruta valida para su organización");
  assert(!isTextileEvidencePathForOrg(p, "55555555-5555-4555-8555-555555555555"), "jamás valida para otra organización");
});

console.log("\nTrazaloop · T9E: transporte, servidor y privacidad\n");

const NEXT_CONFIG = read("next.config.ts");
const ACTIONS = read("server/actions/textiles-evidences.ts");
const FORM = read("components/domain/textiles/evidence-upload-form.tsx");

check("8. T9E.1: las Server Actions NO necesitan cuerpos grandes (carga directa a Storage)", () => {
  // El transporte de archivos ya no pasa por Server Actions: el límite
  // elevado de T9E se RETIRÓ y jamás debe reaparecer por evidencias.
  // (Solo cuenta el CÓDIGO: el comentario del config narra la decisión.)
  const configCode = NEXT_CONFIG
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  assert(!/bodySizeLimit/.test(configCode), "bodySizeLimit no debía reintroducirse");
  assert(NEXT_CONFIG.includes("CARGA DIRECTA"), "la decisión queda documentada en el config");
  assert(
    TEXTILE_EVIDENCE_MAX_FILE_MB === 20,
    "el límite funcional sigue siendo 20 MB (aplicado en begin/finalize, no en el transporte)"
  );
});

check("9. La server action valida MIME, extensión y tamaño (la barrera real)", () => {
  assert(ACTIONS.includes("isAllowedTextileEvidenceMime"), "valida MIME");
  assert(ACTIONS.includes("isAllowedTextileEvidenceExtension"), "valida extensión");
  assert(ACTIONS.includes("TEXTILE_EVIDENCE_MAX_FILE_BYTES"), "valida tamaño máximo");
  assert(ACTIONS.includes("checkTextilesStorageAvailable"), "la cuota de almacenamiento del MÓDULO se verifica antes de subir (T9F.1)");
});

check("10. El cliente pre-valida con la MISMA regla pura e informa condiciones antes de subir", () => {
  assert(FORM.includes("validateTextileEvidenceFile"), "el formulario pre-valida el archivo");
  assert(FORM.includes("TEXTILE_EVIDENCE_FILE_RULES_MESSAGE"), "las condiciones se muestran antes de la carga");
  assert(
    TEXTILE_EVIDENCE_FILE_RULES_MESSAGE.includes("Formatos permitidos") &&
      TEXTILE_EVIDENCE_FILE_RULES_MESSAGE.includes("tamaño máximo") &&
      TEXTILE_EVIDENCE_FILE_RULES_MESSAGE.includes("privado"),
    "el mensaje cubre formatos, tamaño y privacidad"
  );
});

check("11. Fallo posterior de BD → limpieza del archivo huérfano (sin filas ni archivos colgantes)", () => {
  // T9E.1: la finalización deja el intento en 'failed' cuando el insert no
  // procede, y T9F.4 · §17 endurece la limpieza: el retiro del objeto se
  // INSPECCIONA (resultado real de removeTextileEvidenceObject) y se
  // registra en la RPC de limpieza — solo un retiro confirmado libera los
  // bytes; el fallo deja el intento failed como candidato CONTABILIZADO.
  // T9E.2: el insert sigue siendo ATÓMICO con el consumo (RPC 0097).
  assert(
    /markTextileEvidenceUploadFailedRpc\(intent\.id\);[\s\S]{0,420}const removed = await removeTextileEvidenceObject\(intent\.id\);[\s\S]{0,160}recordTextileUploadIntentCleanupRpc\([a-zA-Z]+, intent\.id, removed\)/.test(
      ACTIONS
    ),
    "el objeto rechazado debía retirarse y el intento quedar failed"
  );
  assert(ACTIONS.includes("finalizeTextileEvidenceUploadRpc"), "la finalización es la RPC atómica de 0097");
});

check("12. Bucket privado, sin URLs firmadas permanentes y con sesión del usuario", () => {
  const storageMig = read("supabase/migrations/0015_storage.sql");
  assert(/\('evidences',\s*'evidences',\s*false\)/.test(storageMig), "el bucket evidences es privado");
  assert(!/update storage\.buckets[\s\S]{0,200}public\s*=\s*true/i.test(read("supabase/migrations/0076_textile_evidences_hardening_and_storage_usage.sql")), "ninguna migración textil lo hace público");
  assert(!ACTIONS.includes("getPublicUrl"), "jamás URLs públicas");
  assert(ACTIONS.includes("getTextileEvidenceSignedUrlAction"), "la apertura es por URL firmada de corta vida");
  const db = read("lib/db/textiles-evidences.ts");
  assert(
    db.includes("createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)"),
    "la firma debía usar la expiración explícita central"
  );
  const ttl = db.match(/const SIGNED_URL_TTL_SECONDS = (\d+) \* (\d+);/);
  assert(ttl !== null, "el TTL debía ser una constante numérica explícita");
  assert(Number(ttl![1]) * Number(ttl![2]) <= 60 * 60, "la URL firmada expira en una hora o menos (jamás permanente)");
  const stripComments = (s: string) =>
    s.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  assert(
    !stripComments(ACTIONS).includes("service_role") && !stripComments(db).includes("service_role"),
    "nada usa service_role"
  );
});

check("13. Rol no autorizado e intento cross-tenant siguen bloqueados", () => {
  assert(ACTIONS.includes("canUploadTextileEvidence"), "el rol se valida antes de subir");
  assert(ACTIONS.includes("isTextileEvidencePathForOrg"), "jamás se firma una ruta de otra organización");
  // T9E.2: la ruta la construye la RPC begin (0097) en BD con la
  // organización del SERVIDOR; el cliente jamás la envía.
  assert(ACTIONS.includes("beginTextileEvidenceUploadRpc"), "la ruta nace en la RPC de servidor (0097)");
  assert(
    read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql").includes(
      "v_path := p_organization_id::text || '/textiles/' || v_id::text || '/' || v_safe"
    ),
    "la RPC construye la ruta exacta"
  );
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
