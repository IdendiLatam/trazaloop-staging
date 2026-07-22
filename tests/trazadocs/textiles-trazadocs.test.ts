/**
 * Trazaloop · Sprint T8 (Textil) · TrazaDocs Textil sobre el motor
 * TrazaDocs con module_key — pruebas por inspección de SQL y código
 * (encargo T8 §20, 30 puntos agrupados en 20 checks).
 *
 * Correr: npx tsx tests/trazadocs/textiles-trazadocs.test.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
/** SQL sin comentarios (los encabezados NIEGAN alcances: "sin pasaporte…"). */
function sqlNoComments(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const MIG = "supabase/migrations/0082_textile_trazadocs.sql";
const sql = read(MIG);
const sqlCode = sqlNoComments(sql);
const dbShared = read("lib/db/trazadocs.ts");
const dbTextiles = read("lib/db/textiles-trazadocs.ts");
const actionsSrc = read("server/actions/textiles-trazadocs.ts");
const domainSrc = read("lib/domain/textiles-trazadocs.ts");
const listPage = read("app/(app)/(shell)/textiles/trazadocs/page.tsx");
const detailPage = read("app/(app)/(shell)/textiles/trazadocs/[documentId]/page.tsx");
const printPage = read("app/(app)/(print)/textiles/trazadocs/[documentId]/print/page.tsx");

console.log("Sprint T8 · TrazaDocs Textil\n");

check("1. Existe 0082 y su rango sigue intacto", () => {
  // Actualizado en T8.1 (misma deriva de pins de T2.1–T8): se fija SOLO el
  // slot propio; 0083+ son sprints legítimos posteriores.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 82);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0082_textile_trazadocs.sql"]),
    `el rango 0082 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. 0082 NO crea pasaporte, QR, IA, ACV/huella ni planes por módulo (puntos 2–6)", () => {
  for (const banned of [
    /create\s+table[^;]*passport/i,
    /create\s+table[^;]*pasaporte/i,
    /\bqr_/i,
    /\bblockchain\b/i,
    /\b(ai|ia)_(model|prompt|agent)/i,
    /\blca\b|\bacv\b|huella|carbon_footprint/i,
    /organization_module_(access|subscriptions)/i,
    /module_plan/i,
  ]) {
    assert(!banned.test(sqlCode), `0082 contiene alcance prohibido: ${banned}`);
  }
});

check("3. module_key ADITIVO con default 'cpr' + check ('cpr','textiles') en blueprints y documents (punto 8)", () => {
  assert(
    /alter table public\.trazadoc_blueprints\s+add column if not exists module_key text not null default 'cpr'/.test(sql),
    "faltó module_key aditivo en trazadoc_blueprints"
  );
  assert(
    /alter table public\.trazadoc_documents\s+add column if not exists module_key text not null default 'cpr'/.test(sql),
    "faltó module_key aditivo en trazadoc_documents"
  );
  assert(
    (sql.match(/check \(module_key in \('cpr', 'textiles'\)\)/g) ?? []).length === 2,
    "faltó el check de valores de module_key en ambas tablas"
  );
});

check("4. Trigger de verdad-servidor: el documento HEREDA module_key de su estructura y es INMUTABLE", () => {
  assert(sql.includes("create or replace function public.set_trazadoc_document_module_key()"), "faltó la función del trigger");
  assert(
    /if new\.blueprint_id is not null then\s+select module_key into new\.module_key\s+from trazadoc_blueprints where id = new\.blueprint_id;/.test(sql),
    "el INSERT debía heredar module_key del blueprint (ignorando al cliente)"
  );
  assert(
    sql.includes("if new.module_key is distinct from old.module_key then") &&
      sql.includes("El módulo de un documento TrazaDocs no puede cambiarse."),
    "el UPDATE debía dejar module_key inmutable"
  );
  assert(
    /create trigger t_trazadoc_documents_module_key\s+before insert or update on public\.trazadoc_documents/.test(sql),
    "faltó el trigger BEFORE INSERT OR UPDATE"
  );
});

check("5. 0082 NO toca CPR: sin update/delete de filas CPR, sin cambio de códigos CPR, sin create/alter/drop policy (puntos 7, 9, 28)", () => {
  assert(!/\bdelete from\b/i.test(sqlCode), "0082 no debía borrar filas");
  assert(!/\bupdate\s+public\.trazadoc/i.test(sqlCode), "0082 no debía actualizar filas del motor");
  assert(!/\b(create|alter|drop)\s+policy\b/i.test(sqlCode), "0082 no debía tocar RLS (deny-by-default intacto)");
  assert(!/drop\s+(table|view|function|trigger)/i.test(sqlCode), "0082 no debía tener drops destructivos");
  // Los únicos INSERT son estructuras TXT (module_key 'textiles'):
  const inserts = sqlCode.match(/insert into public\.(\w+)/g) ?? [];
  assert(
    inserts.every((i) => i.endsWith("trazadoc_blueprints") || i.endsWith("trazadoc_blueprint_sections")),
    `0082 solo debía sembrar blueprints/secciones (hay: ${inserts.join(", ")})`
  );
});

check("6. Seed: 12 estructuras base TXT con module_key='textiles', idempotentes (puntos 8, 20)", () => {
  const codes = ["TXT-MAN-001","TXT-PRO-002","TXT-PRO-003","TXT-PRO-004","TXT-PRO-005","TXT-PRO-006","TXT-PRO-007","TXT-PRO-008","TXT-PRO-009","TXT-PRO-010","TXT-PRO-011","TXT-MAT-012"];
  for (const c of codes) assert(sql.includes(`'${c}'`), `faltó la estructura ${c}`);
  const blueprintInserts = sql.match(/insert into public\.trazadoc_blueprints/g) ?? [];
  assert(blueprintInserts.length === 12, `debían ser 12 inserts de blueprint (hay ${blueprintInserts.length})`);
  assert(
    (sql.match(/'textiles'\)\s*\non conflict \(code\) do nothing;/g) ?? []).length === 12,
    "los 12 blueprints debían ser module_key='textiles' e idempotentes (on conflict do nothing)"
  );
  assert(
    (sql.match(/on conflict \(blueprint_id, section_key\) do nothing;/g) ?? []).length === 12,
    "las secciones de los 12 blueprints debían ser idempotentes"
  );
});

check("7. Los 12 documentos tienen secciones base y tips (puntos 17, 19)", () => {
  // Cada fila de sección del seed lleva hint no nulo (5 columnas +
  // sort/required): contamos filas de VALUES de secciones.
  const sectionRows = sql.match(/\('d0000000-0000-4000-8000-00000000\d{4}', '[a-z_]+', '/g) ?? [];
  assert(sectionRows.length >= 120, `debían sembrarse 120+ secciones con tip (hay ${sectionRows.length})`);
  assert(
    sql.includes("insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)"),
    "cada sección debía incluir su hint (tip) en el insert"
  );
});

check("8. Los documentos citan referencias técnicas como preparación (punto 18) y sin la palabra vetada", () => {
  for (const ref of ["ISO 22095", "ISO 2076", "ISO 3758", "ISO 5157", "ISO 14021", "ISO 59004", "ISO 59010", "ISO 59020", "UNE-EN 15343", "GS1 EPCIS", "GRS/RCS", "OCS/GOTS", "OEKO-TEX MADE IN GREEN", "ESPR (UE) 2024/1781"]) {
    assert(sql.includes(ref), `faltó la referencia técnica ${ref}`);
  }
  assert(sql.includes("Referencias de preparación documental"), "las referencias debían presentarse como preparación documental");
  assert(!/reglamento/i.test(sql), "0082 no debía usar la palabra vetada por compliance (el ESPR se cita como 'ESPR (UE) 2024/1781')");
});

check("9. Textos obligatorios: evidencias (no certificación externa), claims (soporte) y circularidad (puntos 21–23)", () => {
  assert(
    sql.includes("La aceptación interna de una evidencia no equivale a certificación externa ni validación por una autoridad."),
    "faltó el texto obligatorio del documento de evidencias (TXT-PRO-004)"
  );
  assert(
    sql.includes("Toda declaración ambiental debe estar soportada por evidencia suficiente y revisada internamente antes de ser usada en comunicaciones externas."),
    "faltó el texto obligatorio del documento de claims (TXT-PRO-006)"
  );
  assert(
    sql.includes("La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial."),
    "faltó el texto obligatorio del documento de circularidad (TXT-PRO-007)"
  );
});

check("10. La matriz usa estados documentales de preparación, jamás un dictamen (punto 24)", () => {
  assert(
    sql.includes("documentado, parcialmente documentado, pendiente, no aplica, requiere revisión"),
    "la matriz (TXT-MAT-012) debía usar los 5 estados de preparación"
  );
  assert(!/cumple\s*\/\s*no cumple/i.test(sql), "la matriz no debía usar estados de dictamen");
});

check("11. Vistas ampliadas: summary, blueprint_summary y maestro exponen module_key AL FINAL (aditivo)", () => {
  for (const v of ["v_trazadoc_document_summary", "v_trazadoc_blueprint_summary", "v_trazadoc_document_master"]) {
    assert(sql.includes(`create or replace view public.${v}`), `faltó recrear ${v}`);
  }
  assert(
    (sql.match(/security_invoker = true/g) ?? []).length >= 3,
    "las vistas debían conservar security_invoker (RLS de las tablas manda)"
  );
  assert(sql.includes("'/textiles/trazadocs/' || d.id::text"), "el maestro debía enrutar documentos textiles a /textiles/trazadocs");
  assert(sql.includes("'cpr'::text                                       as module_key"), "los documentos descargables del maestro son CPR");
});

check("12. Separación en capa de datos: default 'cpr' preserva CPR; envolturas fijan 'textiles' (puntos 14–16)", () => {
  assert(dbShared.includes(`export type TrazadocModuleKey = "cpr" | "textiles";`), "faltó el tipo TrazadocModuleKey");
  for (const fn of ["listDocuments", "getDocument", "listAvailableBlueprints", "getBlueprintByIdForCompany", "findDocumentByNormalizedTitle"]) {
    const idx = dbShared.indexOf(`export async function ${fn}`);
    assert(idx >= 0, `faltó ${fn}`);
    const slice = dbShared.slice(idx, idx + 900);
    assert(slice.includes(`moduleKey: TrazadocModuleKey = "cpr"`), `${fn} debía filtrar por módulo con default 'cpr'`);
    assert(slice.includes(`.eq("module_key", moduleKey)`), `${fn} debía aplicar .eq(module_key)`);
  }
  assert(dbTextiles.includes(`const MODULE = "textiles" as const;`), "la capa textil debía fijar el módulo en servidor");
  const master = read("lib/db/trazadocs-master.ts");
  assert(master.includes(`.eq("module_key", "cpr")`), "el maestro documental sigue siendo CPR (Textil no se mezcla)");
});

check("13. Tips Textil no se mezclan con tips CPR: los hints viven por blueprint y las envolturas listan solo estructuras textiles (punto 16)", () => {
  assert(dbTextiles.includes("listAvailableBlueprints(MODULE)"), "las plantillas textiles debían pedirse con module 'textiles'");
  assert(dbTextiles.includes("getBlueprintSections(blueprintId)"), "los tips salen de las secciones de la estructura (motor existente)");
  assert(dbTextiles.includes("getDocument(orgId, documentId, MODULE)"), "el detalle textil debía exigir module 'textiles'");
});

check("14. Server actions fijan module en servidor y NO aceptan module_key del cliente (puntos 12–13)", () => {
  assert(!/formData\.get\((["'`])module/.test(actionsSrc), "las actions no debían leer module del formulario");
  const actionsCode = actionsSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!actionsCode.includes("module_key"), "las actions no debían manipular module_key directamente (lo hereda el trigger de 0082)");
  assert(actionsSrc.includes("getTextileTrazadocBlueprint(blueprintId)"), "la creación debía validar que la estructura sea TEXTIL");
  assert(
    (actionsSrc.match(/getTextileTrazadocDetail\(/g) ?? []).length >= 2,
    "editar y transicionar debían verificar primero que el documento sea Textil y de la organización"
  );
});

check("15. Guardas Textil: actions con requireTextilesForAction; páginas con requireTextilesModule + force-dynamic (puntos 11, 25)", () => {
  assert(actionsSrc.includes('import { requireTextilesForAction } from "@/lib/auth/require-textiles-module"'), "actions sin guarda Textil");
  assert((actionsSrc.match(/await gate\(\)/g) ?? []).length >= 6, "todas las actions debían pasar por la guarda");
  for (const [src, name] of [[listPage, "listado"], [detailPage, "detalle"], [printPage, "impresión"]] as const) {
    assert(src.includes("requireTextilesModule"), `la página de ${name} debía usar requireTextilesModule`);
    assert(src.includes('export const dynamic = "force-dynamic"'), `la página de ${name} debía ser force-dynamic`);
  }
  const guard = read("lib/auth/require-textiles-module.ts");
  const modules = read("lib/modules/textiles.ts");
  assert(guard.includes("organization_modules") || modules.includes("module_code"), "la habilitación sigue leyendo organization_modules.module_code");
  assert(guard.includes("TEXTILES_MODULE_ENABLED") || modules.includes("TEXTILES_MODULE_ENABLED"), "el flag TEXTILES_MODULE_ENABLED sigue en la guarda");
});

check("16. Rutas /textiles/trazadocs y /textiles/trazadocs/[documentId] existen y el shell enlaza (punto 10)", () => {
  assert(fs.existsSync(path.join(root, "app/(app)/(shell)/textiles/trazadocs/page.tsx")), "faltó /textiles/trazadocs");
  assert(fs.existsSync(path.join(root, "app/(app)/(shell)/textiles/trazadocs/[documentId]/page.tsx")), "faltó /textiles/trazadocs/[documentId]");
  assert(fs.existsSync(path.join(root, "app/(app)/(print)/textiles/trazadocs/[documentId]/print/page.tsx")), "faltó la ruta de impresión");
  const shell = read("app/(app)/(shell)/textiles/page.tsx");
  assert(shell.includes('href="/textiles/trazadocs"') && shell.includes("TrazaDocs Textil"), "el shell debía enlazar TrazaDocs Textil");
});

check("17. Reutilización real del motor: cero tablas nuevas; misma RPC de transición/versionado; mismo límite de plan", () => {
  assert(!/create\s+table/i.test(sqlCode), "0082 no debía crear tablas (el motor TrazaDocs se reutiliza)");
  assert(actionsSrc.includes("changeDocumentStatus"), "las transiciones textiles usan la RPC del motor (estado+versión atómicos)");
  assert(actionsSrc.includes('checkResourceLimit("documents_trazadocs")'), "la creación textil respeta el mismo límite de plan de TrazaDocs");
  assert(
    actionsSrc.includes("buildSectionsFromBlueprint") && actionsSrc.includes("buildInitialVersionSnapshot"),
    "la creación reutiliza los builders del dominio TrazaDocs"
  );
});

check("18. Roles del motor respetados: consultant prepara/envía; aprueban administración/calidad", () => {
  for (const helper of ["canCreateDocument", "canEditDocument", "canSubmitForReview", "canApproveDocument", "canMarkObsolete", "canCreateDraftVersionFromApproved"]) {
    assert(actionsSrc.includes(helper), `faltó el chequeo de rol ${helper} (dominio TrazaDocs)`);
  }
  assert(actionsSrc.includes("aprueban administración o calidad"), "el mensaje de aprobación debía dejar claro quién aprueba");
});

check("19. Sin service_role y sin acceso cross-tenant en las superficies nuevas (puntos 27, 29)", () => {
  const stripped = [dbTextiles, actionsSrc, listPage, detailPage, printPage]
    .map((src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))
    .join("\n");
  assert(!stripped.includes("service_role"), "las superficies T8 no debían usar service_role");
  assert(!stripped.includes("SUPABASE_SERVICE_ROLE"), "las superficies T8 no debían leer la llave de servicio");
  assert(
    (actionsSrc.match(/g\.ok\.organizationId/g) ?? []).length >= 5,
    "toda operación debía amarrarse a la organización activa validada en servidor"
  );
});

check("20. Lenguaje prudente en UI y seeds: disclaimers presentes, sin promesas (punto 26)", () => {
  assert(
    domainSrc.includes("No equivalen") && domainSrc.includes("por sí solos a certificación, sello ni cumplimiento regulatorio automático"),
    "faltó el aviso de preparación documental del módulo"
  );
  assert(listPage.includes("TEXTILE_TRAZADOCS_DISCLAIMER"), "el listado debía mostrar el aviso");
  assert(printPage.includes("TEXTILE_TRAZADOCS_DISCLAIMER"), "la impresión debía incluir el aviso");
  assert(
    read("components/domain/textiles/trazadoc-editor.tsx").includes("no significa\n        aprobado por una entidad externa") ||
      read("components/domain/textiles/trazadoc-editor.tsx").includes("no significa aprobado por una entidad externa"),
    "el editor debía aclarar el alcance de la aprobación interna"
  );
  for (const src of [sql, domainSrc, listPage, detailPage, actionsSrc]) {
    assert(!/listo\s+para\s+certificar/i.test(src), "sin promesas de certificación");
    assert(!/cumple\s+autom[aá]ticamente/i.test(src), "sin promesas de cumplimiento automático");
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
