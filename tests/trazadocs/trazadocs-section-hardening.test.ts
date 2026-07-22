/**
 * Trazaloop · Sprint T8.1 · Hardening de edición de secciones TrazaDocs y
 * separación por módulo (0083 + capa de código).
 * Correr: npx tsx tests/trazadocs/trazadocs-section-hardening.test.ts
 *
 * Riesgo cerrado: updateSectionContent(orgId, sectionId, content)
 * actualizaba por organización + sección SIN amarrar document_id ni
 * module_key — un formulario manipulado podía editar desde la ruta Textil
 * una sección de OTRO documento de la misma organización (incluso CPR en
 * borrador/revisión), y viceversa. Además, vía API directa podían
 * insertarse secciones en documentos aprobados y "mudarse" secciones de
 * documento actualizando document_id.
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
function stripTs(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const MIG = "supabase/migrations/0083_trazadocs_section_module_hardening.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const dbShared = read("lib/db/trazadocs.ts");
const cprActions = read("server/actions/trazadocs.ts");
const textileActions = read("server/actions/textiles-trazadocs.ts");

console.log("Sprint T8.1 · Hardening de edición de secciones TrazaDocs\n");

check("1. Existe 0083 y su rango sigue intacto", () => {
  // Actualizado en T9A (misma deriva de pins de T2.1–T8): se fija SOLO el
  // slot propio; 0084+ son sprints legítimos posteriores.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 83);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0083_trazadocs_section_module_hardening.sql"]),
    `el rango 0083 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Solo una función + un trigger: sin tablas, políticas, vistas, filas ni alcance prohibido", () => {
  assert(
    !/create\s+table|drop\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view|drop\s+view|alter\s+table|insert\s+into|update\s+public|delete\s+from/.test(sqlCode),
    "0083 solo debía crear la función y el trigger"
  );
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(
    JSON.stringify(fns) === JSON.stringify(["protect_trazadoc_document_section_integrity"]),
    `funciones inesperadas: ${fns.join(", ")}`
  );
  for (const term of ["passport", "pasaporte_", "qr_", "blockchain", "lca_", "carbon", "module_access", "module_subscription"]) {
    assert(!sqlCode.includes(term), `0083 menciona "${term}" (fuera de alcance)`);
  }
});

check("3. No toca migraciones previas: el trigger de module_key (0082) y la política de 0047 siguen intactos", () => {
  const m82 = read("supabase/migrations/0082_textile_trazadocs.sql");
  assert(m82.includes("t_trazadoc_documents_module_key"), "0082 perdió su trigger de module_key");
  const m47 = read("supabase/migrations/0047_trazadocs_version_control.sql");
  assert(m47.includes("drop policy if exists trazadoc_document_sections_update"), "0047 cambió");
  assert(!sql.includes("set_trazadoc_document_module_key"), "0083 no debía redefinir el trigger de 0082");
});

check("4. Trigger BEFORE INSERT OR UPDATE sobre secciones; sin guard en DELETE (cascade de borradores intacto)", () => {
  assert(
    /create trigger t_trazadoc_document_sections_integrity\s+before insert or update on public\.trazadoc_document_sections/.test(sql),
    "faltó el trigger BEFORE INSERT OR UPDATE"
  );
  assert(!/before\s+(insert\s+or\s+update\s+or\s+)?delete/i.test(sqlCode), "no debía haber guard de DELETE (rompería el cascade legítimo)");
});

check("5. INSERT y UPDATE exigen documento padre existente y en borrador/revisión", () => {
  assert(sql.includes("select d.status into v_status"), "el guard no consulta el estado del padre");
  assert(sql.includes("La sección debe pertenecer a un documento existente."), "faltó el mensaje de padre inexistente");
  assert(
    sql.includes("if v_status not in ('draft', 'in_review') then") &&
      sql.includes("mientras el documento está en borrador o en revisión"),
    "el guard no exige padre editable"
  );
});

check("6. UPDATE: document_id y section_key son INMUTABLES (una sección no se muda de documento)", () => {
  assert(
    sql.includes("if new.document_id is distinct from old.document_id then") &&
      sql.includes("Una sección no puede moverse a otro documento."),
    "faltó la inmutabilidad de document_id"
  );
  assert(
    sql.includes("if new.section_key is distinct from old.section_key then") &&
      sql.includes("La clave de una sección no puede cambiarse."),
    "faltó la inmutabilidad de section_key"
  );
});

check("7. La función fija search_path, revoca execute y solo lee trazadoc_documents", () => {
  assert(sql.includes("set search_path = public"), "faltó search_path");
  assert(
    sql.includes("revoke execute on function public.protect_trazadoc_document_section_integrity() from public, anon, authenticated"),
    "faltó el revoke"
  );
});

check("8. El helper inseguro fue REEMPLAZADO: existe updateSectionContentForDocument con el amarre completo", () => {
  assert(!/export async function updateSectionContent\(/.test(dbShared), "el helper inseguro updateSectionContent(orgId, sectionId, content) debía desaparecer");
  assert(dbShared.includes("export async function updateSectionContentForDocument(input: {"), "faltó el helper seguro");
  for (const field of ["organizationId: string;", "documentId: string;", "sectionId: string;", "moduleKey: TrazadocModuleKey;", "content: string;"]) {
    assert(dbShared.includes(field), `la firma del helper seguro debía exigir ${field}`);
  }
});

check("9. El helper seguro valida organización+módulo+estado editable y amarra la sección al documento", () => {
  const idx = dbShared.indexOf("export async function updateSectionContentForDocument");
  const body = dbShared.slice(idx, idx + 1600);
  assert(body.includes("getDocumentFacts(input.organizationId, input.documentId, input.moduleKey)"), "el helper no verifica el documento del módulo");
  assert(body.includes('doc.status !== "draft" && doc.status !== "in_review"'), "el helper no exige estado editable");
  assert(body.includes('.eq("document_id", input.documentId)'), "el update no amarra document_id");
  assert(body.includes("La sección no pertenece a este documento."), "faltó el mensaje de sección ajena");
  const facts = dbShared.indexOf("export async function getDocumentFacts");
  const factsBody = dbShared.slice(facts, facts + 700);
  assert(factsBody.includes('.eq("module_key", moduleKey)'), "getDocumentFacts no filtra por módulo");
});

check("10. deleteSection y reorderSections exigen documentId y filtran por document_id", () => {
  for (const fn of ["deleteSection", "reorderSections"]) {
    const idx = dbShared.indexOf(`export async function ${fn}(`);
    assert(idx >= 0, `faltó ${fn}`);
    const body = dbShared.slice(idx, idx + 900);
    assert(body.includes("documentId: string"), `${fn} debía exigir documentId`);
    assert(body.includes('.eq("document_id", documentId)'), `${fn} debía amarrar document_id`);
  }
});

check("11. updateDocumentMetadata y deleteDocument amarran módulo con default 'cpr' (CPR intacto; Textil fuera de alcance CPR)", () => {
  for (const fn of ["updateDocumentMetadata", "deleteDocument"]) {
    const idx = dbShared.indexOf(`export async function ${fn}(`);
    const body = dbShared.slice(idx, idx + 900);
    assert(body.includes('moduleKey: TrazadocModuleKey = "cpr"'), `${fn} debía recibir moduleKey con default 'cpr'`);
    assert(body.includes('.eq("module_key", moduleKey)'), `${fn} debía filtrar por módulo`);
  }
});

check("12. Actions CPR validan documento del módulo 'cpr' + estado + rol antes de tocar secciones, y en transiciones", () => {
  assert(
    (cprActions.match(/getDocumentFacts\(org\.organizationId, documentId, "cpr"\)/g) ?? []).length >= 5,
    "las actions CPR de secciones y el helper de transición debían verificar el documento CPR (5 sitios)"
  );
  const idx = cprActions.indexOf("export async function updateDocumentSectionsAction");
  const body = cprActions.slice(idx, idx + 1800);
  assert(body.includes("canEditDocument(org.roleCode, doc.status)"), "updateDocumentSectionsAction debía exigir rol + estado editable");
  assert(body.includes('moduleKey: "cpr"'), "updateDocumentSectionsAction debía fijar moduleKey='cpr' en servidor");
  assert(!/updateSectionContent\(/.test(stripTs(cprActions)), "las actions CPR no debían usar el helper inseguro");
});

check("13. La action Textil fija moduleKey='textiles' en servidor y valida el documento antes del amarre por sección", () => {
  const idx = textileActions.indexOf("export async function updateTextileTrazadocSectionsAction");
  const body = textileActions.slice(idx, idx + 1800);
  assert(body.includes("getTextileTrazadocDetail(g.ok.organizationId, documentId)"), "la action textil debía validar primero el documento Textil");
  assert(body.includes('moduleKey: "textiles"'), "la action textil debía fijar moduleKey='textiles'");
  assert(body.includes("updateSectionContentForDocument({"), "la action textil debía usar el helper seguro");
  assert(!/updateSectionContent\(/.test(stripTs(textileActions)), "la action textil no debía usar el helper inseguro");
  assert(!/formData\.get\((["'`])module/.test(textileActions), "el módulo jamás llega del cliente");
});

check("14. Ningún caller del helper inseguro queda en el producto", () => {
  const dirs = ["server", "lib", "app", "components"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const src = stripTs(fs.readFileSync(p, "utf8"));
        if (/\bupdateSectionContent\(/.test(src)) offenders.push(path.relative(root, p));
      }
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  assert(offenders.length === 0, `callers del helper inseguro: ${offenders.join(", ")}`);
});

check("15. Sin service_role, RLS intacta y lenguaje prudente", () => {
  assert(!stripTs(dbShared + cprActions + textileActions).includes("service_role"), "sin service_role");
  assert(!/\b(create|alter|drop)\s+policy\b/.test(sqlCode), "0083 no debía tocar RLS");
  for (const term of ["certificación garantizada", "cumple automáticamente", "listo para certificar"]) {
    assert(!sql.toLowerCase().includes(term), `texto prohibido: ${term}`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
