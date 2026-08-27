/**
 * Trazaloop · Acceso comercial POR MÓDULO al contenido de los hints
 * administrables (botón "i" de TrazaDocs CPR y Textiles).
 *
 * Verifican, sobre la lógica pura real y la fuente de las páginas:
 *  · Demo NUNCA recibe el contenido administrado ni sus enlaces (CPR y
 *    Textiles), sino el mensaje fijo exacto;
 *  · Full y Extra reciben el contenido administrado sin cambios;
 *  · el acceso se resuelve POR MÓDULO (accesos mixtos en la misma empresa);
 *  · el backoffice del superadministrador conserva el contenido real;
 *  · la decisión ocurre en SERVIDOR: al cliente solo viaja lo autorizado;
 *  · no se tocan migraciones previas y ninguna migración posterior conoce el aviso Demo (0103 = PCR-01, 0104 = PCR-02, 0105 = PCR-02.5) y cleanup-staging queda fuera.
 *
 * Correr: npm run test:hint-demo-access
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEMO_HINT_MESSAGE,
  DEMO_HINT_TITLE,
  PLATFORM_HINT_VIEWER,
  canViewAdministeredHint,
  organizationHintViewer,
  resolveHintForViewer,
  resolveHintMapForViewer,
} from "../../lib/domain/hint-access";
import { parseHintText } from "../../lib/domain/hint-links";
import type { ModuleAccessMode } from "../../lib/modules/access";

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
const ROOT = path.join(__dirname, "..", "..");
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

// Hints administrados de ejemplo: contienen exactamente lo que un usuario
// Demo no debe recibir (tutoriales, videos, guías paso a paso, enlaces).
const CPR_HINT =
  "Guía paso a paso para declarar el contenido reciclado.\n" +
  "Ver el [video tutorial CPR](https://tutoriales.trazaloop.com/cpr/video-1) y luego [ajustes](/settings).";
const TEXTILES_HINT =
  "Guía paso a paso de composición de fibras.\n" +
  "Ver el [video tutorial Textil](https://tutoriales.trazaloop.com/textiles/video-9).";

/** Fragmentos que jamás pueden aparecer en la salida de un usuario Demo. */
const CPR_SECRETS = [
  "Guía paso a paso para declarar el contenido reciclado",
  "https://tutoriales.trazaloop.com/cpr/video-1",
  "video tutorial CPR",
  "/settings",
];
const TEXTILES_SECRETS = [
  "Guía paso a paso de composición de fibras",
  "https://tutoriales.trazaloop.com/textiles/video-9",
  "video tutorial Textil",
];

const CPR_SECTIONS = [{ id: "sec-cpr-1", hint: CPR_HINT }];
const TEXTILES_SECTIONS = [{ id: "sec-tex-1", hint: TEXTILES_HINT }];

/** Lo que realmente se serializa hacia el navegador para ese espectador. */
function payloadFor(
  sections: { id: string; hint: string }[],
  accessMode: ModuleAccessMode | null
): string {
  return JSON.stringify(resolveHintMapForViewer(sections, organizationHintViewer(accessMode)));
}

console.log("Trazaloop · Hints administrables: Demo / Full / Extra por módulo\n");

check("1. Demo CPR NO recibe el contenido administrado de CPR", () => {
  const resolved = resolveHintForViewer(CPR_HINT, organizationHintViewer("demo"));
  assert(resolved !== null, "Demo debía recibir el aviso fijo, no ausencia de hint");
  assert(resolved.restricted === true, "en Demo el hint debía marcarse como restringido");
  assert(resolved.text === DEMO_HINT_MESSAGE, "Demo debía recibir el mensaje fijo");
  assert(resolved.title === DEMO_HINT_TITLE, "Demo debía recibir el título breve");
  for (const secret of CPR_SECRETS) {
    assert(!resolved.text.includes(secret), `el contenido real se filtró en Demo: «${secret}»`);
  }
});

check("2. Demo Textiles NO recibe el contenido administrado de Textiles", () => {
  const resolved = resolveHintForViewer(TEXTILES_HINT, organizationHintViewer("demo"));
  assert(resolved !== null && resolved.restricted === true, "Demo Textiles debía quedar restringido");
  assert(resolved.text === DEMO_HINT_MESSAGE, "Demo Textiles debía recibir el mensaje fijo");
  for (const secret of TEXTILES_SECRETS) {
    assert(!resolved.text.includes(secret), `el contenido real se filtró en Demo: «${secret}»`);
  }
});

check("3. Full CPR recibe el hint administrado, exactamente como lo escribió el superadmin", () => {
  const resolved = resolveHintForViewer(CPR_HINT, organizationHintViewer("full"));
  assert(resolved !== null && resolved.restricted === false, "Full debía ver el contenido administrado");
  assert(resolved.text === CPR_HINT, "Full debía recibir el texto administrado sin alteraciones");
});

check("4. Extra CPR recibe el hint administrado", () => {
  const resolved = resolveHintForViewer(CPR_HINT, organizationHintViewer("extra"));
  assert(resolved !== null && resolved.restricted === false, "Extra debía ver el contenido administrado");
  assert(resolved.text === CPR_HINT, "Extra debía recibir el texto administrado sin alteraciones");
});

check("5. Full Textiles recibe el hint administrado", () => {
  const resolved = resolveHintForViewer(TEXTILES_HINT, organizationHintViewer("full"));
  assert(resolved !== null && resolved.restricted === false, "Full Textiles debía ver el contenido real");
  assert(resolved.text === TEXTILES_HINT, "Full Textiles debía recibir el texto administrado íntegro");
});

check("6. Extra Textiles recibe el hint administrado", () => {
  const resolved = resolveHintForViewer(TEXTILES_HINT, organizationHintViewer("extra"));
  assert(resolved !== null && resolved.restricted === false, "Extra Textiles debía ver el contenido real");
  assert(resolved.text === TEXTILES_HINT, "Extra Textiles debía recibir el texto administrado íntegro");
});

check("7. Accesos MIXTOS por módulo: cada hint usa el modo de SU módulo", () => {
  // A. Empresa con CPR Demo y Textiles Full.
  const aCpr = resolveHintForViewer(CPR_HINT, organizationHintViewer("demo"));
  const aTex = resolveHintForViewer(TEXTILES_HINT, organizationHintViewer("full"));
  assert(aCpr !== null && aCpr.text === DEMO_HINT_MESSAGE, "A: el hint CPR debía ser el aviso Demo");
  assert(aTex !== null && aTex.text === TEXTILES_HINT, "A: el hint Textiles debía ser el administrado");

  // B. Empresa con CPR Extra y Textiles Demo.
  const bCpr = resolveHintForViewer(CPR_HINT, organizationHintViewer("extra"));
  const bTex = resolveHintForViewer(TEXTILES_HINT, organizationHintViewer("demo"));
  assert(bCpr !== null && bCpr.text === CPR_HINT, "B: el hint CPR debía ser el administrado");
  assert(bTex !== null && bTex.text === DEMO_HINT_MESSAGE, "B: el hint Textiles debía ser el aviso Demo");

  // El modo de un módulo jamás desbloquea el otro.
  assert(!payloadFor(CPR_SECTIONS, "demo").includes("tutoriales.trazaloop.com"), "A: fuga en CPR Demo");
  assert(!payloadFor(TEXTILES_SECTIONS, "demo").includes("tutoriales.trazaloop.com"), "B: fuga en Textiles Demo");
});

check("8. El mensaje Demo coincide EXACTAMENTE con el texto comercial acordado", () => {
  assert(
    DEMO_HINT_MESSAGE ===
      "Los tutoriales, guías paso a paso y videos no están disponibles en la versión Demo. Accede a estos recursos en los planes Full y Extra.",
    "el mensaje fijo de Demo cambió"
  );
  assert(DEMO_HINT_TITLE === "Recurso disponible en Full y Extra", "el título breve de Demo cambió");
  // Sin botones de pago, precios ni enlaces comerciales.
  assert(!/\[[^\]]*\]\([^)]*\)/.test(DEMO_HINT_MESSAGE), "el aviso Demo no debe contener enlaces");
  assert(!/https?:|\$|COP|USD|precio/i.test(DEMO_HINT_MESSAGE), "el aviso Demo no debe traer precios ni URLs");
});

check("9. La salida entregada a Demo no contiene el hint real ni sus URLs", () => {
  const cprPayload = payloadFor(CPR_SECTIONS, "demo");
  const texPayload = payloadFor(TEXTILES_SECTIONS, "demo");
  for (const secret of CPR_SECRETS) {
    assert(!cprPayload.includes(secret), `la carga útil Demo CPR contenía «${secret}»`);
  }
  for (const secret of TEXTILES_SECRETS) {
    assert(!texPayload.includes(secret), `la carga útil Demo Textiles contenía «${secret}»`);
  }
  assert(cprPayload.includes(DEMO_HINT_MESSAGE), "la carga útil Demo debía llevar el aviso fijo");
  // Ni HTML, ni Markdown, ni URL alguna procedente del hint real.
  assert(!/</.test(cprPayload.replace(/\\u003c/g, "")), "la carga útil Demo no debe llevar HTML");
});

check("10. El superadministrador conserva consulta, edición y vista previa del contenido real", () => {
  const resolved = resolveHintForViewer(CPR_HINT, PLATFORM_HINT_VIEWER);
  assert(resolved !== null && resolved.restricted === false, "el backoffice debía ver el contenido real");
  assert(resolved.text === CPR_HINT, "el backoffice debía ver el texto administrado íntegro");
  assert(canViewAdministeredHint(PLATFORM_HINT_VIEWER) === true, "el backoffice siempre está autorizado");

  // El backoffice no pasa por la resolución comercial ni guarda el aviso.
  const editor = read("components/domain/trazadocs/blueprint-detail-editor.tsx");
  assert(editor.includes("<HintText text={value} />"), "la vista previa del editor debía seguir intacta");
  assert(!editor.includes("hint-access"), "el editor del superadmin no debe pasar por la puerta comercial");
  assert(!editor.includes(DEMO_HINT_MESSAGE), "el editor jamás debe mostrar el aviso Demo en lugar del real");

  const platformDb = read("lib/db/trazadocs-platform.ts");
  assert(platformDb.includes("hint: input.hint"), "la creación de hints del superadmin debía conservarse");
  assert(platformDb.includes("hint: input.hint,"), "la edición de hints del superadmin debía conservarse");
  assert(!platformDb.includes(DEMO_HINT_MESSAGE), "el mensaje Demo jamás se persiste en la capa de datos");

  const actions = read("server/actions/trazadocs-master.ts") + read("server/actions/trazadocs.ts");
  assert(!actions.includes(DEMO_HINT_MESSAGE), "ninguna acción debe escribir el mensaje Demo");
});

check("11. Full y Extra conservan el renderizado de enlaces (mismo parser, mismos tokens)", () => {
  for (const mode of ["full", "extra"] as ModuleAccessMode[]) {
    const resolved = resolveHintForViewer(CPR_HINT, organizationHintViewer(mode));
    assert(resolved !== null, `${mode} debía recibir hint`);
    const tokens = parseHintText(resolved.text);
    const links = tokens.filter((t) => t.type === "link") as Extract<
      ReturnType<typeof parseHintText>[number],
      { type: "link" }
    >[];
    assert(links.length === 2, `${mode} debía conservar los dos enlaces del hint`);
    assert(links[0].external === true && links[0].href.startsWith("https://"), "enlace externo intacto");
    assert(links[1].external === false && links[1].href === "/settings", "enlace interno intacto");
  }
  // Demo no produce ningún enlace.
  const demo = resolveHintForViewer(CPR_HINT, organizationHintViewer("demo"));
  assert(demo !== null, "Demo debía recibir el aviso");
  assert(
    parseHintText(demo.text).every((t) => t.type !== "link"),
    "el aviso Demo no debe producir enlaces"
  );
});

check("12. Tooltips y ayudas NO administrables no se sustituyen", () => {
  // El aviso Demo solo puede vivir en la lógica pura de hints administrables.
  const roots = ["app", "components", "lib", "server"];
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && read(rel).includes(DEMO_HINT_MESSAGE)) users.push(rel);
    }
  };
  for (const r of roots) walk(r);
  assert(
    users.length === 1 && users[0] === "lib/domain/hint-access.ts",
    `el mensaje Demo debía definirse solo en lib/domain/hint-access.ts (se encontró en: ${users.join(", ")})`
  );

  // Campos de formulario, validaciones, alertas y mensajes de límites no
  // pasan por la puerta comercial de hints.
  for (const rel of [
    "components/ui/field.tsx",
    "components/ui/alert.tsx",
    "lib/modules/messages.ts",
    "lib/domain/legal.ts",
  ]) {
    if (!exists(rel)) continue;
    assert(!read(rel).includes("hint-access"), `${rel} no debe consumir la puerta comercial de hints`);
  }

  // Las tarjetas descriptivas (CPR) conservan sus textos propios.
  const catalog = read("app/(app)/(shell)/(cpr)/catalog/page.tsx");
  assert(
    catalog.includes('hint: "Quién entrega el material que ingresa."'),
    "los textos descriptivos de las tarjetas no debían tocarse"
  );
  assert(!catalog.includes("hint-access"), "las tarjetas descriptivas no pasan por la puerta comercial");

  // El botón "i" conserva su etiqueta accesible y su atributo title.
  const hintComponent = read("components/ui/section-hint.tsx");
  assert(hintComponent.includes('aria-label="Más información"'), "aria-label del botón «i» intacto");
  assert(hintComponent.includes('title="Más información"'), "title del botón «i» intacto");
});

check("13. La decisión ocurre en SERVIDOR: al cliente solo llega el hint autorizado", () => {
  const gate = read("lib/db/hint-access.ts");
  assert(gate.startsWith('import "server-only";'), "la puerta comercial debía ser server-only");
  assert(
    gate.includes("resolveModuleAccessForOrg"),
    "debía reutilizarse la fuente de verdad de acceso por módulo (sin segunda interpretación)"
  );
  assert(
    !gate.includes("createAdminClient") && !gate.includes("SERVICE_ROLE"),
    "la puerta comercial no debe usar service role"
  );

  const cprPage = read("app/(app)/(shell)/(cpr)/trazadocs/[id]/edit/page.tsx");
  assert(
    cprPage.includes("resolveModuleHintsForOrg") && cprPage.includes("CPR_MODULE_CODE"),
    "la página CPR debía resolver los hints con el módulo CPR en servidor"
  );
  const texPage = read("app/(app)/(shell)/textiles/trazadocs/[documentId]/page.tsx");
  assert(
    texPage.includes("resolveModuleHintsForOrg") && texPage.includes("TEXTILES_MODULE_CODE"),
    "la página Textil debía resolver los hints con el módulo Textiles en servidor"
  );

  // Los componentes de cliente reciben el objeto ya autorizado; jamás
  // resuelven acceso ni leen organization_modules.
  for (const rel of [
    "components/ui/section-hint.tsx",
    "components/domain/trazadocs/section-editor.tsx",
    "components/domain/trazadocs/document-editor.tsx",
    "components/domain/textiles/trazadoc-editor.tsx",
  ]) {
    const src = read(rel);
    assert(
      !src.includes('from "@/lib/db/hint-access"'),
      `${rel} no debe importar la puerta server-only desde el cliente`
    );
    assert(
      !src.includes("resolveModuleAccessForOrg") && !src.includes("organization_modules"),
      `${rel} no debe consultar el acceso comercial desde el navegador`
    );
    assert(
      !src.includes("ResolvedHint") || src.includes('from "@/lib/domain/hint-access"'),
      `${rel} debía tipar el hint con el contrato compartido`
    );
  }
  assert(
    read("components/ui/section-hint.tsx").includes("hint.restricted"),
    "el componente debía renderizar el aviso Demo dentro del mismo panel"
  );
});

check("14. Fail-closed y paridad de UX: sin modo resoluble → aviso; sin hint → sin botón «i»", () => {
  const noMode = resolveHintForViewer(CPR_HINT, organizationHintViewer(null));
  assert(noMode !== null && noMode.text === DEMO_HINT_MESSAGE, "sin modo resoluble se entrega el aviso fijo");
  for (const mode of ["demo", "full", "extra", null] as (ModuleAccessMode | null)[]) {
    const viewer = organizationHintViewer(mode);
    assert(resolveHintForViewer(null, viewer) === null, `sin hint no debe haber botón «i» (${mode})`);
    assert(resolveHintForViewer("   \n ", viewer) === null, `hint vacío no debe abrir panel (${mode})`);
  }
  assert(resolveHintForViewer("", PLATFORM_HINT_VIEWER) === null, "sin hint tampoco hay botón en backoffice");
  // El mapa omite las secciones sin hint: nada de entradas vacías.
  const map = resolveHintMapForViewer([{ id: "a", hint: null }, { id: "b", hint: CPR_HINT }], organizationHintViewer("demo"));
  assert(!("a" in map) && "b" in map, "solo las secciones con hint administrado entran al mapa");
});

check("15. Sin cambios de esquema del aviso Demo: ninguna migración lo conoce; posteriores autorizadas: 0105 (PCR-02.5, inventario)", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  // Sprints posteriores legítimos (cada uno con su propia suite de candados):
  const knownLater = new Set([
    "0105_pcr025_inventory_and_quantity_guards.sql",
    // Bloque PCR-03 (reserva declarada del brief)
    "0106_pcr031_evidence_governance.sql",
    "0107_pcr032_traceability_exercises.sql",
    "0108_pcr033_audit_dossiers.sql",
    "0109_pcr0341_evidence_status_case_hotfix.sql",
    // Hotfix 0110: calificación de pgcrypto en create_platform_organization.
    "0110_platform_org_pgcrypto_schema_fix.sql",
    // Q0.3H: privilegios de rol reproducibles desde migraciones (DR-22).
    "0111_platform_role_privileges.sql",
    // QUALITY-01: fundación de Procesos de Trazaloop Quality.
    "0112_quality_process_foundation.sql",
    // QUALITY-01.1: correcciones de aceptación (documentos y ciclo del cargo).
    "0113_quality_documents_and_position_lifecycle.sql",
    // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
    // salidas, y snapshot de las aristas del mapa publicado.
    "0114_quality_relations_io_documents_and_map_edges.sql",
    // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
    // entorno remoto concede DML por defecto sobre cada tabla nueva.
    "0115_quality_map_edges_privilege_hardening.sql",
    // QUALITY-02: control documental — identidad, revisión inmutable, workflow
    // con revisores y aprobadores, decisiones append-only, bandeja transversal
    // de tareas y alertas, y la lista maestra como vista derivada.
    "0116_document_control_revisions_workflow_and_tasks.sql",
    // QUALITY-03: objetivos, indicadores con configuración versionada,
    // mediciones con linaje, eventos de desempeño y cierre de ciclo.
    "0117_quality_objectives_indicators_and_measurements.sql",
    "0118_quality_measurement_engine_privilege_hardening.sql",
    "0119_quality_temporal_eligibility_and_lifecycle.sql",
    "0120_quality_draft_process_deletion.sql",
    "0121_work_cases_and_actions_engine.sql",
    // QUALITY-05: riesgos, oportunidades, controles y tratamiento, con
    // metodología configurable y versionada.
    "0122_quality_risks_and_opportunities.sql",
    // QUALITY-06: personas, cargos versionados, competencia, desarrollo,
    // desempeño, conocimiento y lecciones aprendidas.
    "0123_quality_people_competence_knowledge.sql",
    // QUALITY-06: el barrido de Personas también genera tareas.
    "0124_quality_people_tasks_from_sweep.sql",
    // QUALITY-07: proveedores, criticidad, evaluación y reevaluación.
    "0125_quality_suppliers_evaluation.sql",
    // QUALITY-08: voz del cliente, satisfacción, retroalimentación y quejas.
    "0126_quality_customer_voice.sql",
    "0127_quality_audits.sql",
    "0128_quality_management_review.sql",
    // QUALITY-11: automatización determinística, señales y observación transversal.
    "0129_quality_automation_observation.sql",
    // QUALITY-11 · corrección: el barrido programado y los observadores heredados.
    "0130_quality_automation_scheduled_observers.sql",
    // QUALITY-11.1: puente de eventos y paridad del barrido programado.
    "0131_quality_automation_event_bridge.sql",
    // QUALITY-12: el Copilot, sus consultas y sus borradores.
    "0132_quality_ai_copilot.sql",
    "0133_quality_ai_copilot_completion.sql",
    "0134_quality_ai_provider_call_truth.sql",
    "0135_quality_ai_theme_evidence_scope.sql",
  ]);
  const forbidden = files.filter((f) => (/^010[5-9]|^01[1-9]\d/.test(f)) && !knownLater.has(f));
  assert(forbidden.length === 0, `no debía existir una migración nueva: ${forbidden.join(", ")}`);
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    assert(!sql.includes(DEMO_HINT_MESSAGE), `${f} no debe almacenar el mensaje Demo`);
    assert(!/demo_hint/.test(sql), `${f} no debe declarar una columna demo_hint`);
  }
  // El defecto conocido de cleanup-staging queda fuera de alcance.
  const cleanup = read("scripts/release/v1/cleanup-staging.ts");
  assert(
    !cleanup.includes("hint-access") && !cleanup.includes(DEMO_HINT_MESSAGE),
    "cleanup-staging.ts está fuera del alcance de esta pasada"
  );
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
