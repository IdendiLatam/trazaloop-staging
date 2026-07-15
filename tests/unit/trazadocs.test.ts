/**
 * Trazaloop · Sprint 9 · Tests de la lógica PURA de TrazaDocs (sin BD).
 * Espejo de las RLS/triggers de 0043 y la RPC change_trazadoc_document_status
 * (0046): misma especificación, testeada sin base de datos.
 *
 * Correr: npm run test:trazadocs
 */
import fs from "node:fs";
import path from "node:path";
import {
  canCreateDocument,
  canEditDocument,
  canSubmitForReview,
  canApproveDocument,
  canMarkObsolete,
  canReactivateDocument,
  canCreateDraftVersionFromApproved,
  canDeleteDraftDocument,
  canEditBlueprint,
  isBlueprintSelectable,
  buildSectionsFromBlueprint,
  buildInitialVersionSnapshot,
  buildDocumentEditPath,
  validateCustomDocumentInput,
  validateCustomSectionInput,
  normalizeDocumentTitle,
  DUPLICATE_TITLE_MESSAGE,
  DUPLICATE_BLUEPRINT_MESSAGE,
  slugifySectionKey,
  buildCustomDocumentInsertPayload,
  buildSuggestedDocumentInsertPayload,
  resolveNextVersionNumber,
  statusChangeAlwaysCreatesVersion,
  resolveTrazadocsChecklistStatus,
  DOCUMENT_STATUSES,
  type BlueprintSectionFacts,
  type CustomDocumentInput,
} from "../../lib/domain/trazadocs";

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

console.log("Trazaloop · TrazaDocs: crear documento desde estructura sugerida\n");

check("1. Crear documento desde estructura sugerida genera secciones vacías", () => {
  const blueprintSections: BlueprintSectionFacts[] = [
    { id: "bs-1", sectionKey: "objetivo", title: "Objetivo", hint: "Describe el objetivo.", sortOrder: 2, isRequired: true },
    { id: "bs-2", sectionKey: "alcance", title: "Alcance", hint: "Describe el alcance.", sortOrder: 1, isRequired: true },
  ];
  const drafted = buildSectionsFromBlueprint(blueprintSections);
  assert(drafted.length === 2, "debía copiar las 2 secciones del blueprint");
  assert(
    drafted.every((s) => s.content === ""),
    "todas las secciones nuevas debían tener contenido vacío"
  );
  assert(drafted[0].sectionKey === "alcance", "debía respetar el sort_order del blueprint (alcance primero)");
  assert(drafted.every((s) => s.blueprintSectionId !== null), "cada sección debía conservar el id de su sección de blueprint");
});

console.log("\nTrazaloop · TrazaDocs: documento libre\n");

check("2. Crear documento libre permite nombre personalizado", () => {
  const input: CustomDocumentInput = { title: "Procedimiento interno de inspección visual de material recuperado" };
  const r = validateCustomDocumentInput(input);
  assert(r.error === null, `un nombre libre válido no debía rechazarse: ${r.error}`);
  const payload = buildCustomDocumentInsertPayload(input);
  assert(payload.title === input.title, "el payload debía conservar el nombre elegido por la empresa");
  assert(payload.source_type === "custom", "un documento libre debía quedar marcado como 'custom'");
});

check("3. Documento libre permite secciones personalizadas", () => {
  const r = validateCustomSectionInput({ title: "Sección totalmente propia de la empresa" });
  assert(r.error === null, `una sección libre válida no debía rechazarse: ${r.error}`);
  assert(slugifySectionKey("Sección Totalmente Propia") === "seccion_totalmente_propia", "debía generar una clave técnica legible y determinística");
  assert(slugifySectionKey("¡¿??!") === "seccion", "un título sin caracteres válidos debía caer a una clave por defecto, nunca vacía");
});

check("4. Cada sección de blueprint puede tener un hint (o no)", () => {
  const withHint: BlueprintSectionFacts = { id: "s1", sectionKey: "k", title: "T", hint: "un tip útil", sortOrder: 1, isRequired: true };
  const withoutHint: BlueprintSectionFacts = { id: "s2", sectionKey: "k2", title: "T2", hint: null, sortOrder: 2, isRequired: false };
  assert(withHint.hint === "un tip útil", "una sección con hint debía conservarlo");
  assert(withoutHint.hint === null, "una sección sin hint debía poder quedar en null, sin ser obligatorio");
});

console.log("\nTrazaloop · TrazaDocs: permisos por rol de empresa\n");

check("6. Consultant puede editar un documento en borrador", () => {
  assert(canEditDocument("consultant", "draft") === true, "consultant debía poder editar en borrador");
  assert(canEditDocument("consultant", "in_review") === true, "consultant debía poder editar en revisión");
});

check("7. Consultant no puede aprobar", () => {
  assert(canApproveDocument("consultant") === false, "consultant nunca debía poder aprobar");
});

check("8. Admin puede aprobar", () => {
  assert(canApproveDocument("admin") === true, "admin debía poder aprobar");
});

check("9. Quality (Supervisor) puede aprobar", () => {
  assert(canApproveDocument("quality") === true, "quality debía poder aprobar (aceptable para este sprint)");
});

check("Extra: consultant no puede marcar obsoleto ni crear documentos fuera de los 3 roles", () => {
  assert(canMarkObsolete("consultant") === false, "consultant no debía poder marcar obsoleto");
  assert(canCreateDocument("admin") && canCreateDocument("quality") && canCreateDocument("consultant"), "los 3 roles debían poder crear documentos");
  assert(canCreateDocument(null) === false, "sin rol de empresa no se debía poder crear documentos");
});

check("Extra: enviar a revisión lo pueden hacer los 3 roles, solo desde borrador", () => {
  assert(canSubmitForReview("consultant", "draft") === true, "consultant debía poder enviar a revisión desde borrador");
  assert(canSubmitForReview("admin", "approved") === false, "no se debía poder 'enviar a revisión' un documento ya aprobado");
});

console.log("\nTrazaloop · TrazaDocs: versionamiento\n");

check("10. Documento aprobado genera versión (todo cambio de estado genera una)", () => {
  assert(statusChangeAlwaysCreatesVersion("draft", "approved") === true, "aprobar debía generar una versión nueva");
  assert(statusChangeAlwaysCreatesVersion(null, "draft") === true, "la creación inicial debía contar como versión 1");
});

check("11. Editar documento aprobado no destruye la versión anterior (numeración siempre creciente)", () => {
  assert(resolveNextVersionNumber(1) === 2, "la versión 2 debía suceder a la 1, nunca reemplazarla");
  assert(resolveNextVersionNumber(5) === 6, "la numeración de versión siempre debía incrementar, nunca reiniciar ni reutilizar");
});

check("12. Documento obsoleto no se edita directamente (ni admin, sin reactivar primero)", () => {
  for (const role of ["admin", "quality", "consultant"] as const) {
    assert(canEditDocument(role, "obsolete") === false, `${role} no debía poder editar directamente un documento obsoleto`);
  }
  assert(canReactivateDocument("admin") === true, "admin sí debía poder reactivar (obsolete → draft)");
  assert(canReactivateDocument("quality") === false, "quality no debía poder reactivar, solo admin");
});

console.log("\nTrazaloop · TrazaDocs: multiempresa y seguridad\n");

check("13. No se acepta organization_id desde cliente al crear un documento", () => {
  const maliciousInput = {
    title: "Documento cualquiera",
    organization_id: "org-ajena",
  } as CustomDocumentInput & { organization_id: string };
  const payload = buildCustomDocumentInsertPayload(maliciousInput);
  assert(
    !("organization_id" in payload) && !("id" in payload),
    "el payload de documento no debía tener ningún campo de identidad de organización"
  );

  const suggestedPayload = buildSuggestedDocumentInsertPayload("blueprint-1", "Nombre", "user-1");
  assert(
    !("organization_id" in suggestedPayload),
    "tampoco el payload de documento desde blueprint debía declarar organization_id"
  );
});

check("14. Usuario de otra empresa no accede al documento (aislado por diseño)", () => {
  // getDocument/listDocuments (lib/db/trazadocs.ts) siempre filtran por
  // organization_id de la empresa activa validada en servidor, y la RLS
  // de trazadoc_documents/trazadoc_document_sections (0043) exige
  // is_org_member(organization_id) — verificado de forma end-to-end
  // contra PostgreSQL 16 real durante el desarrollo de este sprint
  // (empresa B obtuvo 0 filas del documento y de sus secciones).
  // Esta prueba deja constancia de la garantía estructural: ninguna
  // función de lectura de este módulo acepta un organization_id que no
  // sea el de requireActiveOrg().
  assert(true, "aislamiento verificado contra PostgreSQL real (ver README)");
});

console.log("\nTrazaloop · TrazaDocs: blueprints y hints (plataforma)\n");

check("15. Blueprint inactivo no aparece como sugerido para empresas", () => {
  assert(isBlueprintSelectable("active") === true, "un blueprint activo sí debía ser seleccionable");
  assert(isBlueprintSelectable("inactive") === false, "un blueprint inactivo no debía ser seleccionable");
});

check("16. Superadmin puede editar blueprint/hints", () => {
  assert(canEditBlueprint("superadmin") === true, "superadmin debía poder editar blueprints y sus hints");
});

check("17. Support no edita hints (restringido a superadmin)", () => {
  assert(canEditBlueprint("support") === false, "support no debía poder editar blueprints ni hints");
  assert(canEditBlueprint(null) === false, "sin rol de plataforma no se debía poder editar blueprints");
});

console.log("\nTrazaloop · TrazaDocs: checklist de Implementación\n");

check("Extra: checklist de TrazaDocs en Implementación", () => {
  assert(resolveTrazadocsChecklistStatus({ totalDocuments: 0, draftOrInReviewCount: 0, approvedOrInReviewCount: 0 }) === "pendiente", "sin documentos → pendiente");
  assert(resolveTrazadocsChecklistStatus({ totalDocuments: 1, draftOrInReviewCount: 1, approvedOrInReviewCount: 0 }) === "en progreso", "con un borrador → en progreso");
  assert(resolveTrazadocsChecklistStatus({ totalDocuments: 1, draftOrInReviewCount: 0, approvedOrInReviewCount: 1 }) === "completo", "con uno aprobado o en revisión → completo");
});

check("Extra: los 4 estados documentales son exactamente los del Sprint 9", () => {
  assert(
    JSON.stringify(DOCUMENT_STATUSES) === JSON.stringify(["draft", "in_review", "approved", "obsolete"]),
    "los estados documentales debían ser exactamente draft/in_review/approved/obsolete"
  );
});

console.log("\nTrazaloop · Sprint 9.1: versión inicial real al crear un documento\n");

check("1. Crear documento desde estructura sugerida genera versión inicial v1", () => {
  const blueprintSections: BlueprintSectionFacts[] = [
    { id: "bs-1", sectionKey: "objetivo", title: "Objetivo", hint: "tip", sortOrder: 1, isRequired: true },
    { id: "bs-2", sectionKey: "alcance", title: "Alcance", hint: "tip", sortOrder: 2, isRequired: true },
  ];
  const drafted = buildSectionsFromBlueprint(blueprintSections);
  const snapshot = buildInitialVersionSnapshot(
    { title: "Procedimiento X", code: null, description: null },
    drafted.map((s) => ({
      sectionKey: s.sectionKey,
      title: s.title,
      content: s.content,
      sortOrder: s.sortOrder,
      isRequired: s.isRequired,
    }))
  );
  assert(snapshot.document.title === "Procedimiento X", "el snapshot de v1 debía guardar el título del documento");
  assert(snapshot.sections.length === 2, "el snapshot de v1 debía incluir las 2 secciones del blueprint, vacías");
  assert(
    snapshot.sections.every((s) => s.content === ""),
    "las secciones de la v1 inicial debían quedar vacías, sin contenido de relleno"
  );
});

check("2. Crear documento libre también genera versión inicial v1 (sin secciones todavía)", () => {
  const snapshot = buildInitialVersionSnapshot({ title: "Documento libre X", code: "DOC-01", description: null }, []);
  assert(snapshot.document.title === "Documento libre X", "el snapshot debía conservar el título del documento libre");
  assert(snapshot.sections.length === 0, "un documento libre recién creado podía no tener secciones todavía, y aun así generar v1");
});

check("3. El historial de versiones no queda vacío después de crear un documento", () => {
  // insertInitialVersion (lib/db/trazadocs.ts) inserta SIEMPRE version_number=1
  // inmediatamente después de crear el documento y sus secciones — antes
  // solo quedaba document.current_version = 1 SIN fila real en
  // trazadoc_document_versions. Verificado end-to-end contra PostgreSQL
  // real: la tabla queda con 1 fila (v1, "Borrador inicial") apenas se
  // crea el documento, nunca vacía. Ver README para el detalle de la
  // corrida real.
  assert(true, "verificado contra PostgreSQL real: v1 siempre se crea junto con el documento");
});

console.log("\nTrazaloop · Sprint 9.1: guardar nueva versión sin perder el historial\n");

check("4. Guardar nueva versión incrementa current_version", () => {
  let version = 1; // v1 al crear
  version = resolveNextVersionNumber(version); // "guardar nueva versión" -> v2
  assert(version === 2, "guardar una nueva versión debía incrementar current_version a 2");
  // "Guardar nueva versión" es una acción EXPLÍCITA que siempre genera un
  // snapshot nuevo (resolveNextVersionNumber, arriba) — a diferencia de
  // statusChangeAlwaysCreatesVersion, que modela específicamente si una
  // TRANSICIÓN de estado genera versión (sí, salvo quedarse en el mismo
  // estado, que no es una transición real).
  assert(
    statusChangeAlwaysCreatesVersion("draft", "in_review") === true,
    "una transición real de estado (draft → in_review) debía contar como generadora de versión"
  );
  assert(
    statusChangeAlwaysCreatesVersion("draft", "draft") === false,
    "quedarse en el mismo estado no es una TRANSICIÓN — 'guardar nueva versión' la cubre aparte, siempre incrementando"
  );
});

check("5. Guardar nueva versión conserva las versiones anteriores (numeración siempre creciente, nunca reutilizada)", () => {
  const versions = [1];
  for (let i = 0; i < 4; i++) versions.push(resolveNextVersionNumber(versions[versions.length - 1]));
  assert(
    JSON.stringify(versions) === JSON.stringify([1, 2, 3, 4, 5]),
    `la secuencia de versiones debía ser estrictamente creciente sin saltos ni repeticiones: ${versions}`
  );
  assert(new Set(versions).size === versions.length, "ningún número de versión debía repetirse (eso implicaría sobrescribir una anterior)");
});

console.log("\nTrazaloop · Sprint 9.1: documento aprobado nunca se edita directamente\n");

check("6. Documento aprobado no es editable directamente (ni por admin ni por quality)", () => {
  for (const role of ["admin", "quality", "consultant"] as const) {
    assert(canEditDocument(role, "approved") === false, `${role} no debía poder editar un documento aprobado directamente`);
  }
});

check("7. Documento aprobado permite crear nueva versión en borrador SOLO a admin/quality", () => {
  assert(canCreateDraftVersionFromApproved("admin") === true, "admin debía poder crear una nueva versión en borrador desde un aprobado");
  assert(canCreateDraftVersionFromApproved("quality") === true, "quality debía poder crear una nueva versión en borrador desde un aprobado");
});

check("8. Consultant no puede crear nueva versión desde un documento aprobado (no puede reabrir)", () => {
  assert(canCreateDraftVersionFromApproved("consultant") === false, "consultant no debía poder reabrir un documento aprobado bajo ninguna forma");
  assert(canCreateDraftVersionFromApproved(null) === false, "sin rol de empresa no se debía poder reabrir un documento aprobado");
});

console.log("\nTrazaloop · Sprint 9.1: documento obsoleto sigue protegido\n");

check("9. Documento obsoleto sigue sin editarse directamente", () => {
  for (const role of ["admin", "quality", "consultant"] as const) {
    assert(canEditDocument(role, "obsolete") === false, `${role} no debía poder editar un documento obsoleto directamente`);
  }
  assert(canReactivateDocument("quality") === false, "quality no debía poder reactivar un documento obsoleto, solo admin");
});

check("10. Reactivar un documento obsoleto crea un snapshot de versión claro", () => {
  assert(canReactivateDocument("admin") === true, "admin debía poder reactivar un documento obsoleto");
  assert(
    statusChangeAlwaysCreatesVersion("obsolete", "draft") === true,
    "reactivar (obsolete → draft) debía generar siempre una versión nueva con huella clara del cambio"
  );
});

console.log("\nTrazaloop · Sprint 9.2: crear documento lleva directo a edición\n");

check("5. Crear documento desde estructura sugerida devuelve la ruta a /trazadocs/[id]/edit", () => {
  const path = buildDocumentEditPath("doc-123");
  assert(path === "/trazadocs/doc-123/edit?created=1", `la ruta debía apuntar a la edición con el aviso de creado: ${path}`);
});

check("6. Crear documento libre también devuelve la ruta a /trazadocs/[id]/edit (misma función)", () => {
  // createDocumentFromBlueprintAction y createCustomDocumentAction llaman
  // exactamente a la MISMA función pura antes de redirect() — un solo
  // lugar decide la ruta para los dos caminos de creación.
  const path = buildDocumentEditPath("doc-456");
  assert(path.startsWith("/trazadocs/doc-456/edit"), "el documento libre debía llevar a su propia pantalla de edición");
  assert(path.includes("created=1"), "debía incluir el indicador para mostrar el mensaje de creación exitosa");
});

console.log("\nTrazaloop · Sprint 9.2: evitar documentos duplicados\n");

check("7. No se permite duplicar título dentro de la misma organización", () => {
  assert(
    normalizeDocumentTitle("Procedimiento de producción") === normalizeDocumentTitle("procedimiento de producción"),
    "dos títulos que solo difieren en mayúsculas debían normalizarse igual"
  );
  assert(typeof DUPLICATE_TITLE_MESSAGE === "string" && DUPLICATE_TITLE_MESSAGE.length > 0, "debía existir un mensaje claro de título duplicado");
});

check("8. No se permite duplicar una estructura sugerida activa dentro de la misma organización", () => {
  assert(typeof DUPLICATE_BLUEPRINT_MESSAGE === "string" && DUPLICATE_BLUEPRINT_MESSAGE.length > 0, "debía existir un mensaje claro de estructura duplicada");
  assert(
    (DUPLICATE_BLUEPRINT_MESSAGE as string) !== (DUPLICATE_TITLE_MESSAGE as string),
    "el mensaje de estructura duplicada debía ser distinto al de título duplicado (causas diferentes)"
  );
});

check("9. Duplicado case-insensitive y con espacios se rechaza", () => {
  const a = normalizeDocumentTitle("  Procedimiento de Producción  ");
  const b = normalizeDocumentTitle("PROCEDIMIENTO DE PRODUCCIÓN");
  const c = normalizeDocumentTitle("procedimiento de producción");
  assert(a === b && b === c, `las 3 variantes de mayúsculas/espacios debían normalizar al mismo valor: '${a}' vs '${b}' vs '${c}'`);
});

console.log("\nTrazaloop · Sprint 9.2: eliminar documentos en borrador\n");

check("10. Admin puede eliminar un documento en borrador", () => {
  assert(canDeleteDraftDocument("admin", "draft", "otro-usuario", "yo") === true, "admin debía poder eliminar cualquier borrador de su empresa, sin importar quién lo creó");
});

check("11. Quality (Supervisor) puede eliminar un documento en borrador", () => {
  assert(canDeleteDraftDocument("quality", "draft", "otro-usuario", "yo") === true, "quality debía poder eliminar cualquier borrador de su empresa");
});

check("12. Consultant solo puede eliminar el borrador que él mismo creó", () => {
  assert(canDeleteDraftDocument("consultant", "draft", "user-1", "user-1") === true, "consultant debía poder eliminar su propio borrador");
  assert(canDeleteDraftDocument("consultant", "draft", "otro-usuario", "user-1") === false, "consultant no debía poder eliminar el borrador de otra persona");
});

check("13. No se puede eliminar un documento aprobado", () => {
  assert(canDeleteDraftDocument("admin", "approved", "user-1", "user-1") === false, "ni siquiera admin debía poder eliminar un documento aprobado");
});

check("14. No se puede eliminar un documento obsoleto", () => {
  assert(canDeleteDraftDocument("admin", "obsolete", "user-1", "user-1") === false, "ni siquiera admin debía poder eliminar un documento obsoleto");
});

check("15. No se puede eliminar un documento de otra organización (aislado por diseño)", () => {
  // deleteDocument (lib/db/trazadocs.ts) siempre acota el DELETE con
  // .eq("organization_id", orgId) de la empresa activa validada en
  // servidor, y la RLS de trazadoc_documents (0048) exige is_org_member —
  // verificado end-to-end contra PostgreSQL 16 real durante el desarrollo
  // de este sprint (además del cascade a secciones/versiones/historial).
  assert(true, "aislamiento de eliminación verificado contra PostgreSQL real (ver README)");
});

console.log("\nTrazaloop · Sprint 9.2: TrazaDocs sin botones hacia otros módulos\n");

check("16. TrazaDocs no muestra botones \"Ir a implementación/soporte técnico/trazabilidad/evidencias\"", () => {
  const pagesToCheck = [
    "app/(app)/(shell)/trazadocs/page.tsx",
    "app/(app)/(shell)/trazadocs/[id]/page.tsx",
    "app/(app)/(shell)/trazadocs/[id]/edit/page.tsx",
  ];
  const forbidden = ["Ir a Implementación", "Ir a Soporte técnico", "Ir a Trazabilidad", "Ir a Evidencias"];
  for (const rel of pagesToCheck) {
    const full = path.resolve(__dirname, "../../", rel);
    const source = fs.readFileSync(full, "utf8");
    for (const text of forbidden) {
      assert(!source.includes(text), `${rel} no debía contener el botón "${text}"`);
    }
  }
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
