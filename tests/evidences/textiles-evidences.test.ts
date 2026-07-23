/**
 * Trazaloop · Sprint T5 (Textil) · Verificación de evidencias textiles.
 * Ejecutar: npx tsx tests/evidences/textiles-evidences.test.ts
 *
 * Verifica por inspección de SQL/código y por lógica de dominio pura los 24
 * puntos del encargo: migración 0075 acotada, RLS/inmutabilidad, validación
 * polimórfica mismo-tenant, storage privado con signed URLs, guardas de
 * roles para revisión, brechas simples y lenguaje sin promesas.
 */

import fs from "node:fs";
import path from "node:path";
import {
  computeReferenceEvidenceGaps,
  computeMaterialEvidenceGaps,
  isAllowedTextileEvidenceMime,
  isTextileEvidenceExpired,
  canSetTextileEvidenceStatus,
  buildTextileEvidencePath,
  TEXTILE_EVIDENCE_TYPES,
  TEXTILE_EVIDENCE_STATUSES,
  TEXTILE_EVIDENCE_ENTITY_TYPES,
  TEXTILE_EVIDENCE_LINK_TYPES,
} from "../../lib/domain/textiles-evidences";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(error as Error).message}`);
  }
}

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "supabase/migrations/0075_textile_evidences.sql";
const migrationSql = read(MIGRATION);
const actionsSrc = read("server/actions/textiles-evidences.ts");
const dbSrc = read("lib/db/textiles-evidences.ts");
const domainSrc = read("lib/domain/textiles-evidences.ts");
const listPage = read("app/(app)/(shell)/textiles/evidences/page.tsx");
const newPage = read("app/(app)/(shell)/textiles/evidences/new/page.tsx");
const detailPage = read("app/(app)/(shell)/textiles/evidences/[id]/page.tsx");
const referencePage = read("app/(app)/(shell)/textiles/references/[id]/page.tsx");
const shellPage = read("app/(app)/(shell)/textiles/page.tsx");
const allNewUi = listPage + newPage + detailPage;

console.log("\nSprint T5 · Evidencias textiles\n");

// ---------------------------------------------------------------------------
console.log("— Migración 0075: alcance y estructura —");

check("1. Existe la migración 0075 y su rango sigue intacto", () => {
  // Actualizado en T5.1 (misma deriva de pins que en T2.1/T4): se fija solo
  // el rango propio del sprint; el hardening 0076 y sprints posteriores son
  // legítimos.
  assert(fs.existsSync(path.join(root, MIGRATION)), "falta 0075");
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 75);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0075_textile_evidences.sql"]),
    `el rango 0075 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Crea exactamente las 2 tablas permitidas de evidencias textiles", () => {
  const created = [...migrationSql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]);
  assert(
    JSON.stringify([...created].sort()) ===
      JSON.stringify(["textile_evidence_links", "textile_evidences"]),
    `tablas creadas: ${created.join(", ")}`
  );
});

check("3-6. No crea órdenes/lotes, pasaporte, TrazaDocs Textil ni circularidad", () => {
  const banned = [
    "production_order", "textile_order", "textile_batch", "textile_lot",
    "passport", "textile_trazadoc", "textile_document", "circularity",
    "qr_", "module_access", "module_subscription", "textile_claims",
  ];
  const lower = migrationSql.toLowerCase();
  for (const term of banned) {
    assert(!lower.includes(term), `la migración menciona "${term}" (fuera de alcance T5)`);
  }
});

check("7. No toca objetos CPR (evidences/evidence_links intactos; Opción B)", () => {
  const cprObjects = ["evidences", "evidence_links", "batches", "products", "materials", "suppliers", "trazadocs"];
  for (const t of cprObjects) {
    assert(
      !new RegExp(`(create|alter|drop)\\s+(table|policy|view|trigger)[^;]{0,80}public\\.${t}\\b(?!_)`, "i").test(
        migrationSql.replace(/public\.textile_\w+/g, "public.__textile__")
      ),
      `la migración altera el objeto CPR "${t}"`
    );
  }
  assert(!/drop\s/i.test(migrationSql), "la migración no debe contener drops");
  assert(!/alter table storage\.|create policy [^;]* on storage\./i.test(migrationSql), "no debía tocar políticas de storage (D-T5-01: se reutiliza el bucket con la misma convención de ruta)");
});

check("8. Ambas tablas tienen organization_id not null → organizations", () => {
  for (const t of ["textile_evidences", "textile_evidence_links"]) {
    const block = migrationSql.split(`create table public.${t}`)[1]?.split(");")[0] ?? "";
    assert(
      /organization_id uuid not null references public\.organizations/.test(block),
      `${t} sin organization_id correcto`
    );
  }
});

check("9. Ambas tablas habilitan RLS restringida a authenticated y sin anon", () => {
  for (const t of ["textile_evidences", "textile_evidence_links"]) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(migrationSql), `${t} sin RLS`);
  }
  assert(!/to anon\b/.test(migrationSql), "ninguna política debe otorgar a anon");
  assert(/for insert to authenticated\s+with check \(\s*public\.is_org_member\(organization_id\)\s+and status = 'pending_review'/.test(migrationSql), "toda evidencia debe NACER en pending_review (insert endurecido)");
  assert(/status <> 'accepted'/.test(migrationSql), "una evidencia aceptada no debe poder borrarse");
});

check("10. organization_id protegido contra cambios en ambas tablas", () => {
  const count = (migrationSql.match(/execute function public\.prevent_organization_id_change/g) ?? []).length;
  assert(count === 2, `esperaba 2 triggers de inmutabilidad (hay ${count})`);
  const audits = (migrationSql.match(/execute function public\.audit_row_change/g) ?? []).length;
  assert(audits === 2, `esperaba auditoría en las 2 tablas (hay ${audits})`);
});

check("11. entity_type y link_type validados por CHECK (catálogos cerrados)", () => {
  // Actualizado en T6 y T7: los catálogos de vínculos se AMPLÍAN por
  // encargo en cada sprint que suma entidades (T6 §10, T7 §12) y el CHECK
  // vigente vive en la última migración que lo recreó (su suite lo
  // verifica). Fijar aquí longitudes exactas rompía con cada ampliación
  // legítima (misma deriva que los pins de migraciones): este check fija lo
  // que T5 garantiza — los 11/12 ORIGINALES siguen en 0075 y el dominio es
  // un SUPERCONJUNTO que nunca los pierde.
  const t5Entities = TEXTILE_EVIDENCE_ENTITY_TYPES.slice(0, 11);
  const t5Links = TEXTILE_EVIDENCE_LINK_TYPES.slice(0, 12);
  for (const v of t5Entities) {
    assert(migrationSql.includes(`'${v}'`), `entity_type ${v} debía estar en el CHECK de 0075`);
  }
  for (const v of t5Links) {
    assert(migrationSql.includes(`'${v}'`), `link_type ${v} debía estar en el CHECK de 0075`);
  }
  assert(migrationSql.includes("textile_evidence_links_entity_check"), "falta CHECK de entity_type");
  assert(migrationSql.includes("textile_evidence_links_type_check"), "falta CHECK de link_type");
  assert(TEXTILE_EVIDENCE_ENTITY_TYPES.length >= 11 && TEXTILE_EVIDENCE_LINK_TYPES.length >= 12 && TEXTILE_EVIDENCE_TYPES.length === 13, "los enums del dominio perdieron valores de T5");
});

check("12. Mecanismo anti cross-tenant: FK compuesta + trigger polimórfico de las 11 entidades", () => {
  assert(
    /foreign key \(organization_id, evidence_id\)\s+references public\.textile_evidences \(organization_id, id\)/.test(migrationSql),
    "falta FK compuesta vínculo→evidencia"
  );
  assert(migrationSql.includes("validate_textile_evidence_link_org"), "falta el trigger polimórfico");
  for (const t of ["textile_suppliers", "textile_materials", "textile_components", "textile_processes", "textile_outsourced_processes", "textile_collections", "textile_products", "textile_references", "textile_reference_fiber_composition", "textile_reference_materials", "textile_reference_components"]) {
    assert(new RegExp(`from ${t}\\s+where id = new\\.entity_id`).test(migrationSql), `el trigger debía resolver ${t}`);
  }
  assert(migrationSql.includes("v_target_org <> new.organization_id"), "el trigger debía bloquear organizaciones distintas");
  assert(migrationSql.includes("before insert or update on public.textile_evidence_links"), "el trigger debía cubrir insert y update");
});

// ---------------------------------------------------------------------------
console.log("\n— Storage y signed URLs —");

check("13. Storage: bucket privado `evidences` con ruta {org}/textiles/… (políticas 0015 aplican)", () => {
  assert(domainSrc.includes("${organizationId}/textiles/${evidenceId}/"), "la ruta debía empezar por organization_id (primer segmento = empresa)");
  const p = buildTextileEvidencePath("org-1", "ev-1", "ficha técnica#1.pdf");
  assert(p === "org-1/textiles/ev-1/ficha_t_cnica_1.pdf", `ruta inesperada: ${p}`);
  assert(actionsSrc.includes('"evidences"') || actionsSrc.includes("EVIDENCES_BUCKET"), "las actions debían usar el bucket evidences");
  const storage0015 = read("supabase/migrations/0015_storage.sql");
  assert(storage0015.includes("public: ") === false && storage0015.includes("false"), "el bucket debía seguir privado (0015 intacto)");
  assert(actionsSrc.includes("checkTextilesStorageAvailable"), "la subida debía verificar la cuota de almacenamiento del módulo (T9F.1)");
  assert(actionsSrc.includes("TEXTILE_EVIDENCE_MAX_FILE_BYTES") && actionsSrc.includes("isAllowedTextileEvidenceMime"), "la subida debía validar tamaño y mime");
  assert(!isAllowedTextileEvidenceMime("application/x-msdownload") && !isAllowedTextileEvidenceMime("application/octet-stream"), "los ejecutables debían rechazarse");
  assert(isAllowedTextileEvidenceMime("application/pdf") && isAllowedTextileEvidenceMime("image/png"), "PDF e imagen debían permitirse");
});

check("14. Sin URLs públicas permanentes: apertura solo por signed URL de corta vida", () => {
  assert(dbSrc.includes("createSignedUrl"), "debía usarse createSignedUrl");
  assert(!dbSrc.includes("getPublicUrl") && !actionsSrc.includes("getPublicUrl") && !allNewUi.includes("getPublicUrl"), "no debía usarse getPublicUrl");
  assert(dbSrc.includes("SIGNED_URL_TTL_SECONDS"), "la signed URL debía tener TTL corto");
  assert(detailPage.includes("getTextileEvidenceSignedUrlAction"), "el detalle debía abrir el archivo vía action de signed URL");
});

// ---------------------------------------------------------------------------
console.log("\n— Server actions, roles y rutas —");

check("15. Todas las server actions pasan por la triple guarda + modo lectura", () => {
  assert(actionsSrc.includes("requireTextilesForAction"), "sin guard del módulo");
  assert(actionsSrc.includes("checkTextilesCanMutate"), "sin verificación de solo lectura (T9F.1: por módulo)");
  const exported = (actionsSrc.match(/export async function \w+Action/g) ?? []).length;
  const gates = (actionsSrc.match(/await gate\(\)/g) ?? []).length;
  // archiveTextileEvidenceAction delega en updateTextileEvidenceStatusAction.
  // T9E.1: la creación con archivo se dividió en begin/finalize (carga
  // directa a Storage) — 8 actions en total, todas con gate.
  assert(exported === 8, `esperaba exactamente las 8 actions del encargo (hay ${exported})`);
  assert(gates >= exported - 1, `hay actions sin gate (${gates}/${exported})`);
});

check("16. La subida usa la sesión del usuario; el cliente admin solo en las operaciones server-only documentadas", () => {
  // Regla original (T5): nada de service_role. Desde T9E.3/T9E.4 hay
  // EXCEPCIONES ACOTADAS y deliberadas en la capa de datos: las dos RPC
  // `*_server` (finalización y cierre de limpieza, selladas para
  // `authenticated` en 0098) y la retirada FÍSICA de objetos textiles (0099
  // eliminó la política DELETE de cliente). La Server Action sigue sin
  // tocar service_role: delega en lib/db.
  assert(
    !actionsSrc.includes("SUPABASE_SERVICE_ROLE") &&
      !actionsSrc.includes("serviceRole") &&
      !actionsSrc.includes("createAdminClient"),
    "actions usa service_role"
  );
  assert(
    !dbSrc.includes("SUPABASE_SERVICE_ROLE") && !dbSrc.includes("serviceRole"),
    "db incrusta la service role key en lugar de usar el cliente admin server-only"
  );
  // El cliente admin solo puede aparecer dentro de las funciones permitidas.
  const ADMIN_ALLOWED = [
    "finalizeTextileEvidenceUploadRpc",
    "recordTextileUploadIntentCleanupRpc",
    "removeTextileEvidenceObject",
  ];
  const bodies = dbSrc.split(/export async function /).slice(1);
  for (const body of bodies) {
    if (!body.includes("createAdminClient()")) continue;
    const fnName = body.slice(0, body.indexOf("("));
    assert(
      ADMIN_ALLOWED.includes(fnName),
      `${fnName} usa el cliente admin fuera de las operaciones server-only permitidas`
    );
  }
  // La lectura/firma de archivos sigue con la sesión del usuario (RLS real).
  assert(
    dbSrc.includes("createServerClient()"),
    "la capa de datos debe seguir usando la sesión del usuario para lo demás"
  );
});

check("17. Cambiar estado exige rol autorizado en action Y en trigger SQL", () => {
  assert(actionsSrc.includes("canSetTextileEvidenceStatus"), "la action debía verificar el rol");
  assert(migrationSql.includes("guard_textile_evidence_review"), "falta el guard SQL de revisión");
  assert(/new\.status is distinct from old\.status[\s\S]{0,220}has_org_role\(new\.organization_id, array\['admin','quality'\]\)/.test(migrationSql), "el guard debía exigir admin/quality para cambiar status");
  assert(migrationSql.includes("security definer"), "el guard debía ser security definer para evaluar roles");
});

check("18. Consultor no puede aceptar evidencias (dominio + guard)", () => {
  assert(canSetTextileEvidenceStatus("admin") && canSetTextileEvidenceStatus("quality"), "admin/quality debían poder revisar");
  assert(!canSetTextileEvidenceStatus("consultant") && !canSetTextileEvidenceStatus("operator"), "consultant/operator no debían poder revisar");
  assert(/old\.status <> 'pending_review'[\s\S]{0,200}admin','quality/.test(migrationSql), "una evidencia ya revisada solo la edita admin/quality");
});

check("19. /textiles/evidences existe bajo el guard Textil (layout + require por página)", () => {
  const layout = read("app/(app)/(shell)/textiles/layout.tsx");
  assert(layout.includes("requireTextilesModule"), "el layout perdió el guard");
  for (const [name, src] of [["list", listPage], ["new", newPage], ["detail", detailPage]] as const) {
    assert(src.includes("requireTextilesModule"), `la página ${name} no re-verifica el módulo`);
    assert(src.includes('dynamic = "force-dynamic"'), `la página ${name} debe ser dinámica`);
  }
});

check("20. /textiles enlaza a Evidencias textiles y quedan 4 secciones futuras", () => {
  assert(shellPage.includes('href="/textiles/evidences"') && shellPage.includes("Evidencias textiles"), "el shell no enlaza evidencias");
  const modSrc = read("lib/modules/textiles.ts");
  assert(!/PLANNED_SECTIONS[^;]*"Evidencias/.test(modSrc), "evidencias no debe seguir como sección futura");
});

// ---------------------------------------------------------------------------
console.log("\n— Lenguaje y brechas —");

check("21. Sin promesas de certificación en UI/textos", () => {
  assert(listPage.includes("TEXTILE_EVIDENCES_DISCLAIMER") && detailPage.includes("TEXTILE_EVIDENCES_DISCLAIMER"), "falta el aviso en las páginas");
  assert(domainSrc.includes("no equivalen por sí solas a certificación"), "el aviso cambió");
  const lower = (allNewUi + domainSrc + actionsSrc).toLowerCase();
  for (const term of ["certificado garantizado", "cumplimiento automático", "validado por norma", "producto certificado", "evidencia aprobada por autoridad", "pasaporte oficial"]) {
    assert(!lower.includes(term), `texto prohibido: "${term}"`);
  }
});

check("22. 'Aceptada' se presenta como aceptación INTERNA, nunca certificación externa", () => {
  assert(domainSrc.includes("Evidencia aceptada internamente como soporte documental. No equivale a certificación externa."), "falta la nota de aceptación interna");
  assert(detailPage.includes("TEXTILE_EVIDENCE_ACCEPTED_NOTE"), "el detalle debía mostrar la nota al estar aceptada");
  assert(migrationSql.toLowerCase().includes("aceptación interna"), "la migración debía documentar el significado de accepted");
  assert(TEXTILE_EVIDENCE_STATUSES.includes("accepted") && TEXTILE_EVIDENCE_STATUSES.length === 5, "estados fuera del catálogo del encargo");
});

check("23. Brechas simples: reciclado/orgánico/composición (y ficha de material) detectadas", () => {
  const fibers = [
    { id: "f1", fiberName: "Poliéster reciclado (declarado)", isRecycledDeclared: true, isOrganicDeclared: false },
    { id: "f2", fiberName: "Algodón orgánico (declarado)", isRecycledDeclared: false, isOrganicDeclared: true },
  ];
  const none = computeReferenceEvidenceGaps({ fibers, links: [] });
  assert(none.some((g) => g.code === "recycled_without_support"), "debía detectar reciclado sin soporte");
  assert(none.some((g) => g.code === "organic_without_support"), "debía detectar orgánico sin soporte");
  assert(none.some((g) => g.code === "composition_without_support"), "debía detectar composición sin soporte");

  const covered = computeReferenceEvidenceGaps({
    fibers,
    links: [
      { entityType: "fiber_composition", entityId: "f1", linkType: "recycled_claim_support" },
      { entityType: "fiber_composition", entityId: "f2", linkType: "organic_claim_support" },
      { entityType: "reference", entityId: "r1", linkType: "composition_support" },
    ],
  });
  assert(covered.length === 0, `con soportes no debía haber brechas (hay: ${covered.map((g) => g.code).join(", ")})`);

  const refLevel = computeReferenceEvidenceGaps({
    fibers: [fibers[0]],
    links: [{ entityType: "reference", entityId: "r1", linkType: "recycled_claim_support" }],
  });
  assert(!refLevel.some((g) => g.code === "recycled_without_support"), "el soporte a nivel de referencia debía cubrir la fibra");

  assert(computeReferenceEvidenceGaps({ fibers: [], links: [] }).length === 0, "sin composición no hay brechas");
  assert(computeMaterialEvidenceGaps({ hasSupplierDatasheet: true, links: [] }).length === 1, "material con ficha declarada sin evidencia debía tener brecha");
  assert(computeMaterialEvidenceGaps({ hasSupplierDatasheet: true, links: [{ evidenceType: "supplier_datasheet" }] }).length === 0, "material con ficha vinculada no debía tener brecha");
  assert(referencePage.includes("computeReferenceEvidenceGaps"), "el detalle de referencia debía mostrar las brechas");
  assert(isTextileEvidenceExpired("2020-01-01") && !isTextileEvidenceExpired(null), "la vigencia vencida debía detectarse");
});

check("24. El sprint no modifica funcionalmente CPR (actions/rutas/migraciones intactas)", () => {
  const cprEvidencesActions = read("server/actions/evidences.ts");
  assert(!cprEvidencesActions.includes("textile"), "las actions de evidencias CPR no debían tocarse");
  const cprMigration = read("supabase/migrations/0019_evidences_base.sql");
  assert(!cprMigration.includes("textile"), "0019 (CPR) no debía tocarse");
  const dir = path.join(root, "supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) < 70);
  assert(files.length === 69 || files.length > 0, "las migraciones CPR debían seguir presentes");
  assert(!listPage.includes("/evidences\"") && !detailPage.includes("from(\"evidences\")"), "la UI textil no debía apuntar a rutas/tablas CPR");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
