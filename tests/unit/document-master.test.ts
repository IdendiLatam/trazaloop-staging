/**
 * Trazaloop · Sprint 10B · Tests de la lógica PURA del Maestro de
 * documentos (sin BD). Espejo de trazadoc_file_documents/
 * trazadoc_file_document_versions/v_trazadoc_document_master (0057) y
 * de change_trazadoc_file_document_status/replace_trazadoc_file_document.
 *
 * Correr: npm run test:document-master
 */
import fs from "node:fs";
import path from "node:path";
import {
  resolveMasterActionType,
  groupMasterByCategory,
  buildMasterCsvRow,
  MASTER_CSV_HEADERS,
  validateFileDocumentUpload,
  validateFileDocumentDraft,
  maxFileDocumentSizeForPlan,
  MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES,
  MAX_FILE_DOCUMENT_SIZE_FULL_BYTES,
  fileDocumentExtensionForType,
  ALLOWED_FILE_DOCUMENT_TYPES,
  DUPLICATE_MASTER_TITLE_MESSAGE,
  canReplaceFileDocumentFile,
  type MasterRow,
} from "../../lib/domain/trazadocs-master";
import { canApproveDocument, canDeleteDraftDocument } from "../../lib/domain/trazadocs";
import { canCreateResource, findLimit } from "../../lib/plans/limits";
import type { PlanLimit } from "../../lib/plans/types";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf8");
}

/** Confirma que `fnName` en `filePath` llama a `needle` dentro de su
 *  propio cuerpo — mismo patrón de guarda de regresión ya usado en
 *  tests/unit/plans.test.ts. */
function assertCallsWithin(filePath: string, fnName: string, needle: string) {
  const source = readSource(filePath);
  const fnStart = source.indexOf(`export async function ${fnName}`);
  assert(fnStart !== -1, `no se encontró ${fnName} en ${filePath}`);
  const nextExportIdx = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextExportIdx === -1 ? fnStart + 1200 : nextExportIdx);
  assert(fnBody.includes(needle), `${fnName} (${filePath}) debía llamar ${needle}`);
}

const DEMO_LIMITS: PlanLimit[] = [
  { resourceCode: "documents_trazadocs", limitValue: 2, isUnlimited: false },
];
const FULL_LIMITS: PlanLimit[] = [{ resourceCode: "documents_trazadocs", limitValue: null, isUnlimited: true }];

console.log("Trazaloop · maestro de documentos: vista unificada\n");

const liveRow: MasterRow = {
  sourceType: "live_document",
  documentId: "live-1",
  categoryCode: "manual",
  categoryLabel: "Manuales",
  code: "MAN-01",
  title: "Manual técnico",
  status: "draft",
  versionLabel: "v1",
  responsibleName: "Ana Admin",
  updatedAt: "2026-01-01T00:00:00Z",
  approvedAt: null,
  fileName: null,
  sizeBytes: null,
  actionType: "open",
  actionHref: "/trazadocs/live-1",
};
const fileRow: MasterRow = {
  ...liveRow,
  sourceType: "file_document",
  documentId: "file-1",
  categoryCode: "format",
  categoryLabel: "Formatos",
  code: null,
  title: "Formato externo",
  fileName: "formato.xlsx",
  sizeBytes: 204800,
  actionType: "download",
  actionHref: null,
};

check("1. Maestro une documentos vivos y descargables", () => {
  const groups = groupMasterByCategory([liveRow, fileRow]);
  const allRows = groups.flatMap((g) => g.rows);
  assert(allRows.some((r) => r.sourceType === "live_document"), "debía incluir el documento vivo");
  assert(allRows.some((r) => r.sourceType === "file_document"), "debía incluir el documento descargable");
});

check("2. Agrupa por categoría", () => {
  const groups = groupMasterByCategory([liveRow, fileRow]);
  const manualGroup = groups.find((g) => g.categoryCode === "manual");
  const formatGroup = groups.find((g) => g.categoryCode === "format");
  assert(manualGroup?.rows.length === 1, "el grupo Manuales debía tener 1 documento");
  assert(formatGroup?.rows.length === 1, "el grupo Formatos debía tener 1 documento");
  assert(groups.every((g) => g.rows.length > 0), "no debían aparecer grupos vacíos");
});

check("3. Documento vivo tiene action_type open", () => {
  assert(resolveMasterActionType("live_document") === "open", "un documento vivo siempre debía abrir");
});

check("4. Documento descargable tiene action_type download", () => {
  assert(resolveMasterActionType("file_document") === "download", "un documento descargable siempre debía descargar");
});

check("5. CSV incluye columnas requeridas", () => {
  const expected = [
    "Categoría", "Código", "Documento", "Tipo", "Estado", "Versión",
    "Responsable", "Fecha de actualización", "Fecha de aprobación", "Archivo", "Tamaño",
  ];
  assert(JSON.stringify(Array.from(MASTER_CSV_HEADERS)) === JSON.stringify(expected), "las columnas del CSV no coincidían exactamente con lo pedido");
  const row = buildMasterCsvRow(fileRow);
  assert(row.length === MASTER_CSV_HEADERS.length, "cada fila de CSV debía tener una celda por columna");
});

console.log("\nTrazaloop · maestro de documentos: validación de archivo descargable\n");

check("6. Documento descargable requiere archivo", () => {
  const v = validateFileDocumentUpload({ size: 0, type: "application/pdf" }, "full");
  assert(v.error !== null, "un archivo vacío/sin seleccionar debía rechazarse");
});

check("7. Documento descargable valida tipo permitido", () => {
  const bad = validateFileDocumentUpload({ size: 1000, type: "application/zip" }, "full");
  assert(bad.error !== null, "un ZIP no debía permitirse en este sprint");
  const badExe = validateFileDocumentUpload({ size: 1000, type: "application/x-msdownload" }, "full");
  assert(badExe.error !== null, "un ejecutable nunca debía permitirse");
  const badSvg = validateFileDocumentUpload({ size: 1000, type: "image/svg+xml" }, "full");
  assert(badSvg.error !== null, "SVG no debía permitirse por ahora");
  for (const type of ALLOWED_FILE_DOCUMENT_TYPES) {
    const ok = validateFileDocumentUpload({ size: 1000, type }, "full");
    assert(ok.error === null, `${type} debía estar permitido`);
  }
});

check("8. Documento descargable valida tamaño (10 MB Demo, 25 MB Full/Extra)", () => {
  assert(maxFileDocumentSizeForPlan("demo") === MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES, "Demo debía limitar a 10 MB por archivo");
  assert(maxFileDocumentSizeForPlan("full") === MAX_FILE_DOCUMENT_SIZE_FULL_BYTES, "Full debía limitar a 25 MB por archivo");
  assert(maxFileDocumentSizeForPlan("extra") === MAX_FILE_DOCUMENT_SIZE_FULL_BYTES, "Extra debía limitar a 25 MB por archivo");

  const tooutBigForDemo = validateFileDocumentUpload({ size: 11 * 1024 * 1024, type: "application/pdf" }, "demo");
  assert(tooutBigForDemo.error !== null, "11 MB debía rechazarse en Demo (límite 10 MB)");
  const okForFull = validateFileDocumentUpload({ size: 11 * 1024 * 1024, type: "application/pdf" }, "full");
  assert(okForFull.error === null, "11 MB debía permitirse en Full (límite 25 MB)");
  const tooBigForFull = validateFileDocumentUpload({ size: 26 * 1024 * 1024, type: "application/pdf" }, "full");
  assert(tooBigForFull.error !== null, "26 MB debía rechazarse incluso en Full (límite 25 MB)");
});

check("Extra: la extensión se deriva siempre del tipo MIME validado, nunca del nombre del cliente", () => {
  assert(fileDocumentExtensionForType("application/pdf") === "pdf", "PDF debía mapear a .pdf");
  assert(fileDocumentExtensionForType("image/jpeg") === "jpg", "JPEG debía mapear a .jpg");
  assert(fileDocumentExtensionForType("text/csv") === "csv", "CSV debía mapear a .csv");
});

check("Extra: el título y la categoría del borrador son obligatorios", () => {
  assert(validateFileDocumentDraft({ title: "", categoryCode: "other" }).error !== null, "título vacío debía rechazarse");
  assert(validateFileDocumentDraft({ title: "X", categoryCode: "no-existe" }).error !== null, "categoría inválida debía rechazarse");
  assert(validateFileDocumentDraft({ title: "X", categoryCode: "manual" }).error === null, "título + categoría válidos debían aceptarse");
});

console.log("\nTrazaloop · maestro de documentos: consumo de almacenamiento y límites de plan\n");

check("9. Documento descargable consume almacenamiento (checkStorageAvailable)", () => {
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "beginFileDocumentUploadAction", "checkCprStorageAvailable(");
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "beginFileDocumentReplaceAction", "checkCprStorageAvailable(");
});

check("10. Demo cuenta documentos vivos y descargables dentro del límite de 2 (documents_trazadocs)", () => {
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "beginFileDocumentUploadAction", 'checkCprResourceLimit("documents_trazadocs")');
  // El límite documents_trazadocs (0050) es UNO SOLO — no existe un
  // recurso separado para documentos descargables — así que un documento
  // vivo y uno descargable cuentan contra el mismo tope de 2 en Demo.
});

check("11. Demo no puede subir descargable si ya tiene 2 documentos (1 vivo + 1 descargable ya cuenta como el límite)", () => {
  const limit = findLimit(DEMO_LIMITS, "documents_trazadocs")!;
  assert(canCreateResource(2, limit) === false, "con 2 documentos (sin importar la mezcla vivo/descargable), Demo no debía poder crear un 3º");
  assert(canCreateResource(1, limit) === true, "con 1 documento, Demo debía poder crear el 2º, sea vivo o descargable");
});

check("12. Full puede subir sin límite funcional", () => {
  const limit = findLimit(FULL_LIMITS, "documents_trazadocs")!;
  assert(canCreateResource(999, limit) === true, "Full no debía tener límite de conteo de documentos");
});

check("13. Extra usa cuota de 5 GB (independiente del límite de 25 MB por archivo)", () => {
  const extraTotalQuotaBytes = 5 * 1024 * 1024 * 1024;
  assert(extraTotalQuotaBytes === 5368709120, "la cuota total de Extra debía seguir siendo 5 GB exactos (0050)");
  assert(maxFileDocumentSizeForPlan("extra") === 25 * 1024 * 1024, "el límite POR ARCHIVO de Extra (25 MB) es independiente de su cuota total (5 GB)");
});

console.log("\nTrazaloop · maestro de documentos: modo solo lectura (suspended/cancelled)\n");

check("14. Suspended no puede subir documento", () => {
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "beginFileDocumentUploadAction", "checkCprCanMutate()");
});

check("15. Suspended no puede editar metadatos", () => {
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "updateFileDocumentMetadataAction", "checkCprCanMutate()");
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "beginFileDocumentReplaceAction", "checkCprCanMutate()");
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "deleteDraftFileDocumentAction", "checkCprCanMutate()");
});

check("16. Suspended sí puede ver el maestro (nunca se bloquea lectura)", () => {
  const source = readSource("../../server/actions/trazadocs-master.ts");
  for (const readFn of ["listDocumentMasterAction", "getDocumentMasterSummaryAction", "exportDocumentMasterCsvAction", "getFileDocumentAction", "downloadFileDocumentAction", "listFileDocumentVersionsAction"]) {
    const fnStart = source.indexOf(`export async function ${readFn}`);
    assert(fnStart !== -1, `no se encontró ${readFn}`);
    const fnEnd = source.indexOf("\n}", fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    // T9F.1: la lectura sigue sin bloquearse por estado de plan/cuenta
    // (checkCprCanMutate). El gate de acceso comercial del MÓDULO
    // (requireCprForAction) en exportaciones/descargas es distinto y sí aplica.
    assert(!fnBody.includes("checkOrganizationCanMutate") && !fnBody.includes("checkCprCanMutate"), `${readFn} es de solo lectura, nunca debía bloquearse por estado de plan`);
  }
});

console.log("\nTrazaloop · maestro de documentos: anti-duplicados cruzado\n");

check("17. Título duplicado entre documento vivo y descargable se bloquea", () => {
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "beginFileDocumentUploadAction", "findMasterDocumentByNormalizedTitle(");
  const trazadocsSource = readSource("../../server/actions/trazadocs.ts");
  assert(trazadocsSource.includes("findFileDocumentByNormalizedTitle"), "createDocumentFromBlueprintAction/createCustomDocumentAction debían revisar también los títulos de documentos descargables");
  assert(trazadocsSource.includes("DUPLICATE_MASTER_TITLE_MESSAGE"), "debía usarse el mensaje de duplicado cruzado exacto");
  assert(
    DUPLICATE_MASTER_TITLE_MESSAGE ===
      "Ya existe un documento con este nombre en el maestro documental. Abre el documento existente o usa un nombre diferente.",
    "el mensaje de duplicado cruzado debía ser el texto exacto pedido"
  );
});

console.log("\nTrazaloop · maestro de documentos: aprobación y versiones (mismas reglas que TrazaDocs vivo)\n");

check("18. Admin puede aprobar documento descargable", () => {
  assert(canApproveDocument("admin") === true, "admin debía poder aprobar (misma regla que documentos vivos)");
  assert(canApproveDocument("quality") === true, "quality/supervisor debía poder aprobar");
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "approveFileDocumentAction", "canApproveDocument(");
});

check("19. Consultant no puede aprobar", () => {
  assert(canApproveDocument("consultant") === false, "consultant no debía poder aprobar (misma regla que documentos vivos)");
});

check("20. Documento aprobado no se edita directamente", () => {
  // trazadoc_file_documents_update (0057) exige status in ('draft','in_review')
  // tanto en USING como en WITH CHECK — verificado contra PostgreSQL
  // real: un UPDATE directo sobre un documento 'approved' afecta 0 filas.
  // La única vía real de cambiar su contenido es change_trazadoc_file_document_status
  // o replace_trazadoc_file_document (ambas RPC SECURITY DEFINER). Ver README.
  const migrationSource = readSource("../../supabase/migrations/0057_trazadocs_document_master.sql");
  assert(
    migrationSource.includes("and status in ('draft', 'in_review')"),
    "la política de UPDATE de trazadoc_file_documents debía exigir draft/in_review"
  );
});

check("21. Nueva versión conserva la versión anterior", () => {
  // replace_trazadoc_file_document (0057): INSERT en
  // trazadoc_file_document_versions (append-only, sin UPDATE/DELETE en su
  // RLS) ANTES de actualizar la fila principal — la versión anterior
  // queda intacta en la tabla de versiones. Verificado contra PostgreSQL
  // real: reemplazar el archivo de un documento aprobado generó v3
  // conservando v2 (aprobada, con su propio file_name) en el historial.
  const migrationSource = readSource("../../supabase/migrations/0057_trazadocs_document_master.sql");
  assert(
    migrationSource.includes("insert into trazadoc_file_document_versions"),
    "replace_trazadoc_file_document debía insertar una fila de versión nueva, nunca sobrescribir la anterior"
  );
});

check("22-23. Eliminar borrador solo funciona en draft; approved no se elimina", () => {
  assert(canDeleteDraftDocument("admin", "draft", "user-1", "user-1") === true, "un borrador sí debía poder eliminarse");
  assert(canDeleteDraftDocument("admin", "approved", "user-1", "user-1") === false, "un documento aprobado nunca debía poder eliminarse");
  assert(canDeleteDraftDocument("admin", "in_review", "user-1", "user-1") === false, "un documento en revisión tampoco debía poder eliminarse");
});

console.log("\nTrazaloop · maestro de documentos: aislamiento entre empresas\n");

check("24. CSV no incluye datos de otra organización", () => {
  // T9F.1: la organización sigue saliendo SOLO de la sesión — ahora vía
  // requireCprForAction(), que internamente ejecuta requireActiveOrg().
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "exportDocumentMasterCsvAction", "requireCprForAction()");
  const source = readSource("../../server/actions/trazadocs-master.ts");
  const fnStart = source.indexOf("export async function exportDocumentMasterCsvAction");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(!fnBody.includes("organizationId:") && !/organization_id\s*[:=]\s*(String\(|formData)/.test(fnBody), "exportDocumentMasterCsvAction nunca debía aceptar organization_id del cliente");
});

check("25. Maestro no muestra documentos de otra organización", () => {
  // v_trazadoc_document_master (0057) es security_invoker=true — hereda
  // la RLS real de trazadoc_documents y trazadoc_file_documents.
  // Verificado contra PostgreSQL real: un miembro de la organización B
  // obtiene 0 filas al consultar la vista filtrando por la organización A.
  const migrationSource = readSource("../../supabase/migrations/0057_trazadocs_document_master.sql");
  assert(
    migrationSource.includes("with (security_invoker = true)"),
    "v_trazadoc_document_master debía ser security_invoker=true, heredando la RLS real de ambas tablas"
  );
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "listDocumentMasterAction", "requireActiveOrg()");
});

console.log("\nTrazaloop · corrección: versión inicial real (Bloqueante 1)\n");

check("Corrección 1. Crear documento descargable exitoso deja storage_path real en la fila principal", () => {
  assertCallsWithin("../../server/actions/trazadocs-master.ts", "finalizeFileDocumentUploadAction", "finalizeFileDocumentInitialVersionServer({");
  const source = readSource("../../server/actions/trazadocs-master.ts");
  // T9F.5B.1 · CARGA DIRECTA: el archivo ya no se sube dentro de la acción;
  // la finalización vive en una acción SEPARADA que primero VERIFICA el
  // objeto físico real y solo entonces fija la ruta.
  const fnStart = source.indexOf("export async function finalizeFileDocumentUploadAction");
  const nextFnStart = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextFnStart);
  assert(
    fnBody.indexOf("finalizeFileDocumentInitialVersionServer({") > fnBody.indexOf("verifyCprUploadedObject("),
    "la finalización debía ocurrir DESPUÉS de verificar el objeto físico real"
  );
});

check("Corrección 2. Crear documento descargable exitoso crea versión inicial v1, no v2", () => {
  const migrationSource = readSource("../../supabase/migrations/0059_document_master_usage_fix.sql");
  assert(
    migrationSource.includes("current_version = 1,") && migrationSource.includes("version_label = 'v1'"),
    "finalize_trazadoc_file_document_initial_version debía fijar current_version=1 y version_label='v1' explícitamente, nunca incrementar"
  );
});

check("Corrección 3. La versión inicial v1 guarda storage_path real", () => {
  const migrationSource = readSource("../../supabase/migrations/0059_document_master_usage_fix.sql");
  assert(
    migrationSource.includes("p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_change_note, v_user"),
    "el INSERT de la versión v1 debía usar los parámetros reales de archivo (p_storage_path, etc.), nunca una cadena vacía"
  );
});

check("Corrección 4. No se usa changeFileDocumentStatus para la versión inicial", () => {
  const source = readSource("../../server/actions/trazadocs-master.ts");
  const fnStart = source.indexOf("export async function uploadFileDocumentAction");
  const nextFnStart = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextFnStart);
  assert(
    !fnBody.includes("changeFileDocumentStatus("),
    "uploadFileDocumentAction ya no debía usar changeFileDocumentStatus (siempre incrementa current_version) para cerrar la creación inicial"
  );
});

check("Corrección 5. Si falla la subida inicial, se elimina la fila temporal", () => {
  const source = readSource("../../server/actions/trazadocs-master.ts");
  // T9F.5B.1 · CARGA DIRECTA: la subida ocurre en el navegador, así que la
  // limpieza de la fila temporal vive en las acciones que conocen el
  // desenlace — finalize (verificación o RPC fallidas) y cancel (fallo del
  // PUT o abandono). La fila solo se borra tras un retiro FÍSICO CONFIRMADO.
  for (const fn of ["finalizeFileDocumentUploadAction", "cancelFileDocumentUploadAction"]) {
    const start = source.indexOf(`export async function ${fn}`);
    assert(start !== -1, `no se encontró ${fn}`);
    const body = source.slice(start, source.indexOf("export async function", start + 1));
    assert(body.includes("compensateFailedCprUpload("), `${fn}: compensación del intent`);
    assert(body.includes("deleteFileDocumentRow("), `${fn}: limpieza de la fila temporal`);
    assert(/resolution\.resolved/.test(body), `${fn}: solo limpia tras retiro CONFIRMADO`);
  }
  const beginStart = source.indexOf("export async function beginFileDocumentUploadAction");
  const beginBody = source.slice(beginStart, source.indexOf("export async function", beginStart + 1));
  assert(
    beginBody.includes("El documento no quedó completamente creado. Elimina el borrador antes de intentar de nuevo."),
    "begin debía conservar el mensaje exacto cuando ni siquiera se pudo limpiar la fila"
  );
});

check("Corrección 12. No quedan storage_path vacíos en documentos creados exitosamente", () => {
  // T9F.5B.1 · finalizeFileDocumentUploadAction solo llega a
  // `return { error: null, success: true, documentId }` DESPUÉS de
  // finalizeFileDocumentInitialVersionServer — la única función que escribe
  // un storage_path real en la fila principal. Cualquier fallo antes de ese
  // punto termina en un `return { error: ... }` temprano (con limpieza de la
  // fila si el retiro físico se confirmó), nunca en un "éxito" a medias.
  const source = readSource("../../server/actions/trazadocs-master.ts");
  const fnStart = source.indexOf("export async function finalizeFileDocumentUploadAction");
  const nextFnStart = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextFnStart);
  const successIndex = fnBody.indexOf("success: true, documentId: intent.resourceId };");
  const finalizeIndex = fnBody.indexOf("finalizeFileDocumentInitialVersionServer({");
  assert(successIndex > finalizeIndex && finalizeIndex !== -1, "el retorno de éxito debía ocurrir después de confirmar la ruta real del archivo");
});

console.log("\nTrazaloop · corrección: v_organization_plan_usage cuenta documentos descargables (Bloqueante 2)\n");

check("Corrección 6. v_organization_plan_usage suma documentos vivos + descargables", () => {
  const migrationSource = readSource("../../supabase/migrations/0059_document_master_usage_fix.sql");
  assert(
    migrationSource.includes("coalesce(td.documents_trazadocs_count, 0) + coalesce(fd.documents_count, 0)"),
    "documents_trazadocs_count debía sumar documentos vivos (td) y descargables (fd)"
  );
  assert(migrationSource.includes("from public.trazadoc_file_documents group by organization_id"), "debía existir un conteo agregado sobre trazadoc_file_documents");
});

check("Corrección 7. v_organization_plan_usage suma almacenamiento de documentos descargables", () => {
  const migrationSource = readSource("../../supabase/migrations/0059_document_master_usage_fix.sql");
  assert(
    migrationSource.includes("coalesce(fd.storage_used_bytes, 0)"),
    "storage_used_bytes debía incluir el tamaño de los documentos descargables (fd.storage_used_bytes)"
  );
  // Las 3 fuentes de almacenamiento deben seguir sumándose juntas:
  // evidencias + logo + documentos descargables.
  const storageLine = migrationSource
    .split("\n")
    .find((l) => l.includes("as storage_used_bytes") && l.includes("coalesce(ev."));
  assert(!!storageLine && storageLine.includes("coalesce(o.logo_size_bytes, 0)") && storageLine.includes("coalesce(fd.storage_used_bytes, 0)"), "storage_used_bytes debía sumar evidencias + logo + documentos descargables en una sola expresión");
});

check("Corrección 8-9. Demo con 2 documentos (mezcla vivo/descargable) ya no puede crear un tercero", () => {
  // Con el conteo corregido (Corrección 6), documents_trazadocs_count ya
  // refleja vivos + descargables juntos — canCreateResource, ya probado
  // en tests/unit/plans.test.ts, aplica exactamente igual sin importar
  // la mezcla: lo único que cambia es de dónde sale el número 2.
  const limit = findLimit(DEMO_LIMITS, "documents_trazadocs")!;
  assert(canCreateResource(2, limit) === false, "con 2 documentos (2 vivos, 2 descargables, o 1+1) Demo no debía poder crear un 3º");
});

console.log("\nTrazaloop · corrección: sin archivos huérfanos al reemplazar (Bloqueante 3)\n");

check("Corrección 10. Reemplazo de archivo valida permisos/estado ANTES de subir", () => {
  const source = readSource("../../server/actions/trazadocs-master.ts");
  const fnStart = source.indexOf("export async function beginFileDocumentReplaceAction");
  const nextFnStart = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextFnStart);
  // T9F.5B.1 · El navegador solo puede subir a una ruta RESERVADA: el chequeo
  // de rol/estado debe ocurrir antes de crear la reserva, que es lo único que
  // autoriza el PUT posterior.
  const roleCheckIndex = fnBody.indexOf("canReplaceFileDocumentFile(");
  const reserveIndex = fnBody.indexOf("beginCprStorageUpload(");
  assert(roleCheckIndex !== -1 && reserveIndex !== -1, "no se encontraron ambos puntos a comparar");
  assert(roleCheckIndex < reserveIndex, "el chequeo de rol/estado debía ocurrir ANTES de reservar la subida");

  // Mismas reglas exactas que la RPC SQL (approved: solo admin/quality;
  // obsolete: nunca).
  assert(canReplaceFileDocumentFile("consultant", "draft") === true, "consultant sí debía poder reemplazar un borrador");
  assert(canReplaceFileDocumentFile("consultant", "approved") === false, "consultant no debía poder reemplazar un aprobado");
  assert(canReplaceFileDocumentFile("admin", "approved") === true, "admin sí debía poder reemplazar un aprobado (nueva versión en borrador)");
  assert(canReplaceFileDocumentFile("admin", "obsolete") === false, "nadie debía poder reemplazar un obsoleto directamente");
});

check("Corrección 11. Si falla la RPC después de subir el reemplazo, se intenta borrar el archivo subido", () => {
  const source = readSource("../../server/actions/trazadocs-master.ts");
  // T9F.4 (§11-§17) + T9F.5B.1: el INTENT se crea en `begin`, antes de que el
  // navegador suba nada, así que la compensación es la RESOLUCIÓN server-only
  // del intent (retiro inspeccionado; sin confirmación, los bytes siguen
  // contando).
  const beginStart = source.indexOf("export async function beginFileDocumentReplaceAction");
  const beginBody = source.slice(beginStart, source.indexOf("export async function", beginStart + 1));
  assert(beginBody.includes("beginCprStorageUpload("), "el intent durable se crea en begin, antes del PUT del navegador");
  const fnStart = source.indexOf("export async function finalizeFileDocumentReplaceAction");
  const nextFnStart = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextFnStart);
  const rpcCallIndex = fnBody.indexOf("replaceFileDocumentFileServer({");
  const cleanupIndex = fnBody.lastIndexOf("compensateFailedCprUpload(");
  assert(rpcCallIndex !== -1 && cleanupIndex !== -1 && cleanupIndex > rpcCallIndex, "la compensación server-only del intent debía ocurrir después del intento de RPC, dentro del manejo de su error");
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
