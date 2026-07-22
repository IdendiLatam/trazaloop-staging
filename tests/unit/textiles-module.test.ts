/**
 * Trazaloop · Sprint T1 (Textil) · Tests de la lógica PURA del módulo
 * Trazaloop Textil (sin BD) + invariantes de fuente del sprint.
 *
 * Correr: npx tsx tests/unit/textiles-module.test.ts
 * (Sin script en package.json a propósito: T1 no modifica package.json.)
 */
import fs from "node:fs";
import path from "node:path";
import {
  TEXTILES_MODULE_KEY,
  TEXTILES_FLAG_ENV,
  TEXTILES_HOME_PATH,
  TEXTILES_PLANNED_SECTIONS,
  isTextilesFlagEnabled,
  organizationHasTextiles,
  canAccessTextilesModule,
} from "../../lib/modules/textiles";

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

console.log("Trazaloop · Textil T1: clave y feature flag\n");

check("1. La clave oficial del módulo es exactamente 'textiles' (DL-01)", () => {
  assert(TEXTILES_MODULE_KEY === "textiles", "module_key debía ser 'textiles'");
  assert(TEXTILES_FLAG_ENV === "TEXTILES_MODULE_ENABLED", "el flag debía llamarse TEXTILES_MODULE_ENABLED");
  assert(TEXTILES_HOME_PATH === "/textiles", "la ruta raíz debía ser /textiles (DL-04)");
});

check("2. El flag solo enciende con 'true' o '1' — apagado por defecto", () => {
  assert(isTextilesFlagEnabled("true") && isTextilesFlagEnabled("1"), "'true' y '1' debían encender");
  for (const off of [undefined, null, "", "false", "0", "TRUE", "yes", "on"]) {
    assert(!isTextilesFlagEnabled(off), `'${String(off)}' debía dejar el módulo apagado`);
  }
});

check("3. Habilitación por organización: exige fila 'textiles' Y enabled", () => {
  assert(!organizationHasTextiles([]), "sin módulos no hay acceso");
  assert(
    !organizationHasTextiles([{ code: "core", enabled: true }, { code: "traceability_6632", enabled: true }]),
    "los módulos CPR no habilitan Textil"
  );
  assert(!organizationHasTextiles([{ code: "textiles", enabled: false }]), "fila deshabilitada no da acceso");
  assert(!organizationHasTextiles([{ code: "textil", enabled: true }]), "la clave 'textil' (singular) jamás cuenta");
  assert(organizationHasTextiles([{ code: "textiles", enabled: true }]), "fila habilitada sí da acceso");
});

check("4. Acceso combinado: flag apagado bloquea aunque la organización esté habilitada", () => {
  const enabled = [{ code: "textiles", enabled: true }];
  assert(!canAccessTextilesModule("false", enabled), "flag apagado debía bloquear");
  assert(!canAccessTextilesModule(undefined, enabled), "flag ausente debía bloquear");
  assert(!canAccessTextilesModule("true", []), "flag encendido sin habilitación debía bloquear");
  assert(canAccessTextilesModule("true", enabled), "flag + habilitación debía permitir");
});

console.log("\nTrazaloop · Textil T1: invariantes de fuente del sprint\n");

check("5. El layout de /textiles aplica el guard del módulo a todo el namespace", () => {
  const layout = readSource("../../app/(app)/(shell)/textiles/layout.tsx");
  assert(layout.includes("requireTextilesModule"), "el layout debía llamar a requireTextilesModule");
  assert(layout.includes('force-dynamic'), "el layout debía ser force-dynamic (nunca prerender)");
});

check("6. El guard valida flag + organización habilitada y responde 404", () => {
  const guard = readSource("../../lib/auth/require-textiles-module.ts");
  assert(guard.includes("isTextilesModuleEnabled()") && guard.includes("notFound()"), "flag apagado debía dar 404");
  assert(guard.includes("requireActiveOrg"), "debía validar la empresa activa en servidor");
  assert(guard.includes("organizationHasTextiles"), "debía validar organization_modules");
});

check("7. La landing comunica Trazaloop como plataforma y CPR como módulo", () => {
  const landing = readSource("../../app/page.tsx");
  const hero = landing.slice(landing.indexOf("<h1"), landing.indexOf("</h1>"));
  assert(hero.includes("Trazaloop") && !hero.includes("Trazaloop CPR"), "el hero debía decir 'Trazaloop', no 'Trazaloop CPR'");
  assert(landing.includes("Plataforma modular para gestionar trazabilidad"), "debía usar el subtítulo de plataforma");
  assert(landing.includes("Trazaloop CPR"), "CPR debía seguir presente como módulo disponible");
  assert(landing.includes("NTC 6632") && landing.includes("UNE-EN 15343"), "las normas CPR viven en la tarjeta del módulo");
});

check("8. El portal /modules usa la clave 'textiles' y nunca expone el enlace sin flag+habilitación", () => {
  const portal = readSource("../../app/(app)/modules/page.tsx");
  assert(portal.includes('key: "textiles"'), "la tarjeta debía usar key 'textiles' (DL-01)");
  assert(!portal.includes('key: "textil"'), "la clave 'textil' (singular) debía desaparecer");
  assert(portal.includes("isTextilesModuleEnabled()") && portal.includes("organizationHasTextiles"), "el enlace privado debía exigir flag + habilitación en servidor");
});

check("9. La migración 0070 es solo la fila del catálogo, idempotente y privada", () => {
  const mig = readSource("../../supabase/migrations/0070_add_textiles_module.sql");
  assert(mig.includes("on conflict (code) do nothing"), "debía ser idempotente");
  assert(mig.includes("'textiles'") && mig.includes("false"), "debía insertar textiles con is_available = false");
  assert(!/create table|alter table|drop /i.test(mig), "no debía crear/alterar/borrar nada");
});

check("10. Migraciones textiles bajo control: 0070–0099 (módulo, diagnóstico, hardening, catálogos, productos, evidencias, hardening de evidencias, inmutabilidad de archivo, trazabilidad, hardening de trazabilidad, circularidad, hardening de circularidad, TrazaDocs Textil, hardening de secciones, pasaporte técnico, hardening de pasaporte, fuentes/vínculos, vínculo documental, snapshot completo, enlaces privados, fibras personalizadas T9E , intentos de carga T9E.1, fixes digest T9E.1 y finalización atómica T9E.2 y sellado server-only T9E.3 y Storage RLS T9E.4)", () => {
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) >= 70).sort();
  assert(
    JSON.stringify(files) === JSON.stringify(["0070_add_textiles_module.sql", "0071_textile_diagnostic.sql", "0072_textile_diagnostic_hardening.sql", "0073_textile_catalogs.sql", "0074_textile_products_and_composition.sql", "0075_textile_evidences.sql", "0076_textile_evidences_hardening_and_storage_usage.sql", "0077_textile_evidence_file_metadata_immutability.sql", "0078_textile_orders_lots_traceability.sql", "0079_textile_traceability_status_hardening.sql", "0080_textile_circularity_assessments.sql", "0081_textile_circularity_creation_hardening.sql", "0082_textile_trazadocs.sql", "0083_trazadocs_section_module_hardening.sql", "0084_textile_technical_passports.sql", "0085_textile_technical_passport_state_hardening.sql", "0086_textile_passport_sources_and_links_fix.sql", "0087_textile_passport_documentary_link_fix.sql", "0088_textile_technical_passport_full_snapshot.sql", "0089_textile_technical_passport_snapshot_fixes.sql", "0090_textile_technical_passport_snapshot_sources_closure.sql", "0091_textile_passport_circularity_evidence_hotfix.sql", "0092_textile_passport_private_share_links.sql", "0093_textile_custom_fibers.sql", "0094_textile_evidence_upload_intents.sql", "0095_fix_passport_share_digest_schema.sql", "0096_fix_passport_generation_digest_schema.sql", "0097_atomic_textile_evidence_upload_finalize.sql", "0098_server_only_textile_evidence_finalize.sql", "0099_textile_storage_rls_and_csv_utf8_closure.sql"]),
    `solo debían existir 0070–0099 (hay: ${files.join(", ")})`
  );
  const mig = readSource("../../supabase/migrations/0071_textile_diagnostic.sql");
  assert(!/plan_definitions|plan_limits|organization_subscriptions|organization_module_access/.test(mig), "0071 no debía tocar planes ni acceso por módulo");
  assert(!/alter table public\.(?!textile_)/.test(mig), "0071 no debía alterar tablas no textiles");
});

check("Extra: el shell lista 4 secciones futuras y contiene diagnóstico + catálogos + productos + evidencias (T5)", () => {
  assert(TEXTILES_PLANNED_SECTIONS.length === 0, "no debían quedar secciones futuras (T9C hizo funcional el pasaporte técnico)");
  assert(!TEXTILES_PLANNED_SECTIONS.includes("Diagnóstico Textil"), "el diagnóstico ya no es sección futura");
  assert(!TEXTILES_PLANNED_SECTIONS.some((s) => s.startsWith("Evidencias")), "evidencias ya no es sección futura");
  assert(!TEXTILES_PLANNED_SECTIONS.some((s) => s.includes("trazabilidad")), "trazabilidad ya no es sección futura (T6)");
  assert(!TEXTILES_PLANNED_SECTIONS.some((s) => s.includes("Circularidad")), "circularidad ya no es sección futura (T7)");
  assert(!TEXTILES_PLANNED_SECTIONS.some((s) => s.includes("TrazaDocs")), "TrazaDocs Textil ya no es sección futura (T8)");
  assert(!TEXTILES_PLANNED_SECTIONS.some((s) => s.includes("Pasaporte")), "el pasaporte técnico ya no es sección futura (T9C)");
  const shellDir = path.resolve(__dirname, "../../app/(app)/(shell)/textiles");
  const entries = fs.readdirSync(shellDir).sort();
  assert(
    JSON.stringify(entries) === JSON.stringify(["catalogs", "circularity", "diagnostic", "evidences", "layout.tsx", "page.tsx", "passports", "products", "references", "traceability", "trazadocs"]),
    `el shell debía tener catalogs/circularity/diagnostic/evidences/passports/products/references/traceability/trazadocs + layout + page (hay: ${entries.join(", ")})`
  );
});

if (failures > 0) {
  console.error(`\n${failures} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo verde.");
