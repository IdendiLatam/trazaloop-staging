/**
 * Trazaloop · QUALITY-12.2C · La asistencia de redacción, leyendo el código.
 *
 * Comprueba lo que tiene que ser cierto antes de que nadie pulse el botón: que
 * no se genera desde vacío, que el permiso es del módulo del documento y no de
 * Quality, que no entra ni un adaptador del Copilot, que «Reemplazar» no
 * guarda, y que no viaja un dato personal al proveedor por mejorar un párrafo.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  QUICK_EDIT_ACTIONS, QUICK_EDIT_LABEL,
} from "../../lib/domain/document-authoring";
import {
  QUICK_EDIT_SCHEMA, validateQuickEdit,
} from "../../lib/intelligence/document-authoring/schema";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIG = read("supabase/migrations/0138_document_authoring_runs.sql");
const ORQ = read("lib/intelligence/document-authoring/quick-edit.ts");
const CTX = read("lib/intelligence/document-authoring/context.ts");
const POL = read("lib/intelligence/document-authoring/policy.ts");
const ACCION = read("server/actions/document-authoring.ts");
const UI = read("components/domain/documents/quick-edit.tsx");
const EDITOR = read("components/domain/trazadocs/section-editor.tsx");
const GATE = read("lib/db/assisted-writing.ts");

console.log("\nQUALITY-12.2C · asistencia de redacción\n");

// ===========================================================================
console.log("A · EDIT-FIRST");
// ===========================================================================

check("A1. sin texto no se llama al proveedor", () => {
  const code = stripTs(ORQ);
  assert(/const MIN_USER_TEXT = \d+/.test(ORQ), "no hay mínimo de texto");
  const i = code.indexOf("texto.length < MIN_USER_TEXT");
  const j = code.indexOf("document_authoring_start_run");
  assert(i > 0 && j > i,
    "la comprobación de texto vacío no ocurre ANTES de abrir la operación");
  assert(code.indexOf("provider.generateStructured") > i,
    "se llamaría al proveedor con el texto vacío");
});

check("A2. la pantalla tampoco lo ofrece", () => {
  assert(/const hayTexto = currentText\.trim\(\)\.length >= 20;/.test(UI),
    "la pantalla no comprueba que haya texto");
  assert(/disabled=\{!hayTexto\}/.test(UI), "el botón se puede pulsar sin texto");
  assert(/Escribe primero el contenido/.test(UI), "no se explica por qué está apagado");
});

check("A3. NO hay generación desde cero", () => {
  const todo = POL + ORQ + ACCION + UI;
  for (const p of ["Generar sección", "generate_section", "Crear procedimiento",
                   "Escribir por mí", "write_for_me", "draft_section"]) {
    assert(!new RegExp(p, "i").test(todo), `existe una capacidad de generar: ${p}`);
  }
});

// ===========================================================================
console.log("\nB · LAS ACCIONES");
// ===========================================================================

check("B1. seis acciones, lista cerrada", () => {
  assert(QUICK_EDIT_ACTIONS.length === 6, `hay ${QUICK_EDIT_ACTIONS.length} acciones`);
  for (const a of ["improve_writing", "clarify", "formalize", "shorten",
                   "review_against_guidance", "alternative_wording"]) {
    assert((QUICK_EDIT_ACTIONS as readonly string[]).includes(a), `falta ${a}`);
    assert(QUICK_EDIT_LABEL[a as never], `${a} no tiene nombre en pantalla`);
  }
});

check("B2. la base también las valida", () => {
  assert(/quality_ai_runs_action_check/.test(MIG), "la base acepta cualquier acción");
  for (const a of QUICK_EDIT_ACTIONS) {
    assert(new RegExp(`'${a}'`).test(MIG), `la base no conoce ${a}`);
  }
});

check("B3. no hay instrucción libre que convierta esto en el Copilot", () => {
  const code = stripTs(ACCION);
  assert(/readAction\(form/.test(code), "la acción no se lee de una lista cerrada");
  assert(!/prompt|instruction|system_prompt/.test(code.toLowerCase().replace(/quickeditprompt/g, "")),
    "una acción de servidor acepta instrucciones del formulario");
  assert(/QUICK_EDIT_ACTIONS as readonly string\[\]\)\.includes\(v\)/.test(ACCION),
    "la acción no se valida contra la lista cerrada");
});

// ===========================================================================
console.log("\nC · EL PERMISO ES DEL MÓDULO DEL DOCUMENTO");
// ===========================================================================

check("C1. la acción NO exige Quality", () => {
  // Sobre el CÓDIGO: el módulo explica por qué no usa esa puerta, y explicarlo
  // no es usarla.
  assert(!/requireQualityForAction|requireQualityModule/.test(stripTs(ACCION)),
    "la asistencia exige Quality aunque el documento sea de otro módulo");
  assert(/requireActiveOrg/.test(ACCION), "no se resuelve la empresa en servidor");
});

check("C2. el módulo se LEE del documento, no de la petición", () => {
  assert(/const moduleKey = String\(doc\.module_key \?\? ""\);/.test(ACCION),
    "el módulo sale de la petición y no del documento");
  const fn = /create or replace function public\.document_authoring_start_run[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/if v_doc\.module_key is distinct from p_module_key then/.test(fn),
    "la base no comprueba que el módulo declarado sea el del documento");
  assert(/'module_mismatch'/.test(fn), "no hay motivo para el módulo que no coincide");
});

check("C3. los dos vocabularios de módulo se traducen", () => {
  const fn = /create or replace function public\.document_authoring_start_run[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/case p_module_key when 'cpr' then 'traceability_6632'/.test(fn),
    "no se traduce el módulo documental al comercial: el fallo de QUALITY-12.2A");
  assert(/MODULO_COMERCIAL/.test(ACCION), "la acción no traduce los vocabularios");
  assert(/cpr: "traceability_6632"/.test(ACCION), "la traducción de CPR es incorrecta");
});

check("C4. Demo no, y por la razón correcta", () => {
  const fn = /create or replace function public\.document_authoring_start_run[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/in \('full', 'extra'\)/.test(fn), "Demo podría usar la asistencia");
  assert(/puerta de atrás/.test(MIG),
    "no consta por qué Demo queda fuera: la guía no se entrega en Demo");
  assert(/access\.accessMode === "full" \|\| access\.accessMode === "extra"/.test(GATE),
    "la pantalla ofrecería el botón en Demo");
});

check("C5. sin pertenencia no hay nada", () => {
  const fn = /create or replace function public\.document_authoring_start_run[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/if not is_org_member\(p_organization_id\) then/.test(fn),
    "no se comprueba la pertenencia");
  assert(/and d\.organization_id = p_organization_id/.test(fn),
    "el documento podría ser de otra empresa");
});

// ===========================================================================
console.log("\nD · EL CONTEXTO MÍNIMO");
// ===========================================================================

check("D1. ni un adaptador del Copilot", () => {
  const todo = stripTs(ORQ + CTX + ACCION);
  for (const p of ["buildContext", "context/adapters", "customer_comment",
                   "quality_audits", "quality_risks", "quality_indicators",
                   "quality_signals", "v_quality_", "ContextPack"]) {
    assert(!todo.includes(p), `la asistencia arrastra ${p}, que es del Copilot`);
  }
});

check("D2. cuatro cajones, separados y etiquetados", () => {
  for (const c of ["<TEXTO_DE_LA_PERSONA>", "<GUIA_DE_LA_SECCION>",
                   "<PERFIL_DE_LA_EMPRESA>", "<DATOS_DEL_DOCUMENTO>"]) {
    assert(CTX.includes(c), `falta el cajón ${c}`);
    assert(CTX.includes(c.replace("<", "</")), `el cajón ${c} no se cierra`);
  }
  assert(/LA GUÍA DICE QUÉ DEBERÍA CONTENER LA SECCIÓN/.test(CTX),
    "no consta por qué van separados");
});

check("D3. la guía sale de la fuente canónica de 12.2A", () => {
  assert(/getCurrentAuthoringGuidance|getSectionRoleGuidance/.test(ACCION),
    "la guía no sale del resolver canónico");
  assert(!/blueprint_sections/.test(stripTs(ACCION)),
    "se lee la columna congelada como segunda autoridad");
  assert(/doc\.blueprint_id\s*\n?\s*\?/.test(ACCION),
    "no se distingue el documento con estructura del que no la tiene");
});

check("D4. el perfil es el compacto de 12.2B", () => {
  assert(/getOrganizationAuthoringContext/.test(ACCION), "no se usa el perfil compacto");
  assert(!/from\("organizations"\)/.test(stripTs(ACCION)),
    "se consulta la empresa por segunda vez en lugar de usar el compacto");
});

// ===========================================================================
console.log("\nE · PRIVACIDAD");
// ===========================================================================

check("E1. no viaja un dato personal por mejorar un párrafo", () => {
  const todo = stripTs(CTX + ORQ);
  for (const p of ["email", "phone", "tax_id", "address", "membership",
                   "profiles", "full_name", "logo", "billing", "storage_path"]) {
    assert(!new RegExp(p, "i").test(todo), `el material enviado incluye ${p}`);
  }
});

check("E2. lo que se envía se compone en un solo sitio", () => {
  assert(/export function renderQuickEditInput/.test(CTX),
    "no hay un único constructor del material");
  assert(/renderQuickEditInput\(\{ \.\.\.req\.context, userText: texto \}\)/.test(ORQ),
    "el orquestador compone el material por su cuenta");
});

// ===========================================================================
console.log("\nF · REEMPLAZAR NO GUARDA");
// ===========================================================================

check("F1. la propuesta no toca la base", () => {
  const code = stripTs(ORQ + ACCION);
  // Leer el documento y la sección es necesario —hay que saber de qué módulo
  // es y qué guía le toca—. Lo que no puede haber es una sola escritura.
  for (const p of [".update(", ".insert(", ".upsert(", ".delete(",
                   "revalidatePath", "trazadoc_publish", "approve("]) {
    assert(!code.includes(p), `la asistencia escribe o revalida: ${p}`);
  }
  assert(/\.from\("trazadoc_document_sections"\)\s*\n\s*\.select\(/.test(code),
    "la sección se lee de una forma que no es una consulta de solo lectura");
});

check("F2. «Reemplazar» solo cambia el editor", () => {
  assert(/onClick=\{\(\) => onReplace\(state\.suggestion!\.suggestedText\)\}/.test(UI),
    "Reemplazar no se limita a llamar al editor");
  assert(/Reemplazar solo cambia el editor\. Sigues teniendo que guardar\./.test(UI),
    "no se dice que hay que guardar después");
  // El panel no puede tener ninguna acción de servidor que no sea la propia.
  assert(!/updateDocumentSectionsAction|updateQualityDocumentSectionAction|saveTextile/.test(UI),
    "el panel invoca una acción de guardado");
});

check("F3. sobre una revisión en solo lectura no se ofrece", () => {
  assert(/assistedWriting && documentId && !readOnly/.test(EDITOR),
    "el botón aparecería sobre una revisión aprobada en modo lectura");
  assert(/if \(disabled\) return null;/.test(UI), "el panel no se apaga cuando toca");
});

check("F4. cada intento parte del texto humano vigente", () => {
  assert(/currentText: string;/.test(UI), "el panel no recibe el texto vivo");
  assert(/form\.set\("user_text", currentText\)/.test(UI),
    "el reintento no envía el texto humano vigente");
  assert(/encadenar salidas desvía el significado/.test(UI),
    "no consta por qué no se encadena la salida anterior");
});

// ===========================================================================
console.log("\nG · LA SALIDA");
// ===========================================================================

check("G1. una propuesta sin texto se rechaza", () => {
  const r = validateQuickEdit({ suggested_text: "   " }, 100);
  assert(!r.ok, "una propuesta vacía se aceptó");
});

check("G2. una propuesta desproporcionada se rechaza", () => {
  const r = validateQuickEdit(
    { suggested_text: "x".repeat(5000), change_summary: [], missing_information: [], warnings: [] },
    100);
  assert(!r.ok, "una propuesta cincuenta veces más larga se aceptó");
});

check("G3. las listas se recortan a su tope", () => {
  const r = validateQuickEdit({
    suggested_text: "Un texto mejorado y razonable.",
    change_summary: ["a", "b", "c", "d"],
    missing_information: ["1", "2", "3", "4", "5"],
    warnings: ["x", "y", "z"],
  }, 100);
  assert(r.ok, "una propuesta válida se rechazó");
  if (!r.ok) return;
  assert(r.suggestion.changeSummary.length === 2, "el resumen no se acotó");
  assert(r.suggestion.missingInformation.length === 3, "lo que falta no se acotó");
  assert(r.suggestion.warnings.length === 2, "los avisos no se acotaron");
  assert(r.trimmed, "no se avisa de que se recortó");
});

check("G4. una salida inválida NO se pinta", () => {
  const code = stripTs(ORQ);
  const i = code.indexOf("validateQuickEdit");
  const j = code.indexOf("quality_ai_complete_run");
  assert(i > 0 && j > i, "se cierra la operación antes de validar");
  assert(/reason: "invalid_output"/.test(code), "no hay camino para la salida rota");
  assert(/Tu texto sigue como estaba/.test(ORQ),
    "no se dice que el texto de la persona no se tocó");
});

// ===========================================================================
console.log("\nH · EL PROVEEDOR");
// ===========================================================================

check("H1. se reutiliza el contrato validado en QUALITY-12.1", () => {
  assert(/from "@\/lib\/ai\/provider"/.test(ORQ), "no se usa el contrato de proveedor");
  assert(/from "@\/lib\/ai\/config"/.test(ORQ), "no se usa la configuración central");
  assert(!/openai|anthropic|api_key|apiKey/i.test(stripTs(ORQ)),
    "el orquestador conoce al proveedor por dentro");
});

check("H2. sin proveedor real NO se finge uno", () => {
  // La distinción exacta: falta credencial → se rechaza; el doble pedido a
  // mano → se permite. Nadie llega a lo segundo por accidente.
  assert(/if \(!live && cfg\.provider !== "fake"\)/.test(ORQ),
    "se respondería con el doble como si fuera un modelo real");
  assert(/reason: "not_configured"/.test(ORQ), "no hay motivo para el entorno sin proveedor");
  assert(/hay que escribirlo/.test(ORQ), "no consta por qué el doble sí puede pasar");
});

check("H3. el fallo del proveedor no toca el texto", () => {
  assert(/Tu texto no se ha tocado/.test(ORQ), "no se tranquiliza a quien lo ve fallar");
  assert(/quality_ai_fail_run/.test(ORQ), "un fallo no queda registrado");
});

// ===========================================================================
console.log("\nI · PROCEDENCIA Y CONSUMO");
// ===========================================================================

check("I1. la operación se registra con su procedencia", () => {
  for (const c of ["module_key", "document_id", "section_key",
                   "guidance_revision_id", "action"]) {
    assert(new RegExp(`add column if not exists ${c}`).test(MIG), `no se registra ${c}`);
  }
  assert(/p_guidance_revision_id: req\.context\.guidance\?\.revisionId \?\? null/.test(ORQ),
    "no se registra con qué revisión de la guía se trabajó");
});

check("I2. el consumo se separa del Copilot", () => {
  assert(/'document\.quick_edit'/.test(MIG), "no hay caso de uso propio");
  assert(/create or replace view public\.v_document_authoring_usage/.test(MIG),
    "no se puede comparar el consumo con el del Copilot");
  assert(/where r\.use_case = 'document\.quick_edit'/.test(MIG),
    "la vista de consumo mezcla los dos casos de uso");
});

check("I3. la vista de consumo no expone el texto", () => {
  const v = /create or replace view public\.v_document_authoring_usage[\s\S]*?;\n/.exec(MIG)![0];
  for (const c of ["r.question", "r.answer"]) {
    assert(!v.includes(c), `la vista de consumo expone ${c}`);
  }
  assert(/security_invoker = true/.test(v), "la vista no hereda la RLS");
});

// ===========================================================================
console.log("\nJ · LA MIGRACIÓN");
// ===========================================================================

check("J1. la 0138 es la última y no edita ninguna anterior", () => {
  const m = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const i = m.indexOf("0138_document_authoring_runs.sql");
  assert(i === m.length - 1, "la 0138 no es la última");
  assert(m[i - 1] === "0137_organization_profile_and_quality_guidance.sql",
    "algo se coló entre la 0137 y la 0138");
  for (const f of ["0132_quality_ai_copilot.sql", "0136_trazadoc_canonical_authoring_guidance.sql",
                   "0137_organization_profile_and_quality_guidance.sql"]) {
    assert(!/document_authoring_start_run/.test(read(`supabase/migrations/${f}`)),
      `${f} fue editada con contenido de QUALITY-12.2C`);
  }
});

check("J2. la puerta nueva NO depende de los ajustes de Quality", () => {
  const fn = /create or replace function public\.document_authoring_start_run[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(!/quality_ai_enabled|quality_ai_settings|quality_ai_feature_allowed/.test(fn),
    "la asistencia documental depende del interruptor de Quality");
  assert(/security definer/.test(fn) && /set search_path = public/.test(fn),
    "la función definer no fija search_path");
});

check("J3. hay un freno de seguridad, y se dice que no es una cuota", () => {
  assert(/p_daily_limit/.test(MIG), "no hay tope diario");
  assert(/no una cuota comercial/.test(MIG),
    "no consta que el tope no es la cuota comercial (12.2F)");
});

// ===========================================================================
console.log("\nK · NOMBRE VISIBLE");
// ===========================================================================

check("K1. la capacidad se llama «Mejorar con Intelligence»", () => {
  assert(/Mejorar con Intelligence/.test(UI), "no se usa el nombre acordado");
  assert(!/Copilot/.test(UI), "la capacidad nueva se presenta como Copilot");
});

check("K2. NO se hizo el renombrado global", () => {
  // 12.2E es quien renombra. Aquí solo se nombra la capacidad nueva.
  const registry = read("lib/modules/registry.ts");
  assert(/label: "Copilot"/.test(registry),
    "se renombró el menú del Copilot, que es trabajo de 12.2E");
});

// ===========================================================================
console.log("\nL · FORMULARIOS ANIDADOS · el defecto de la primera versión");
// ===========================================================================

check("L1. el panel no tiene formulario propio", () => {
  const code = stripTs(UI);
  assert(!/<form[\s>]/.test(code),
    "el panel vuelve a meter un <form>, y vive dentro del de guardado");
  assert(/startTransition\(\(\) => dispatch\(form\)\)/.test(code),
    "la acción no se despacha desde un manejador");
  assert(/type="button"\s*\n?\s*onClick=\{proponer\}/.test(UI)
    || /onClick=\{proponer\}/.test(UI),
    "el botón de proponer no tiene manejador propio");
});

check("L2. nadie renderiza dentro de un form algo que pinte otro form", () => {
  // EL GUARDA GENERAL, Y TIENE QUE SER TRANSITIVO.
  //
  // El defecto real no era «un componente con form renderiza a otro con form».
  // Era una cadena de tres: el editor pinta el formulario de guardado, dentro
  // pone <SectionEditor> —que no pinta ninguno— y ese pone <QuickEditPanel>,
  // que sí. Un guarda que solo mire al hijo directo no ve nada.
  //
  // Así que se construye el grafo de composición a nivel de COMPONENTE y se
  // pregunta si algo de lo que cuelga de una región <form>…</form> acaba
  // pintando otro <form>, a la profundidad que sea.
  const archivos: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      if (e.isDirectory()) recorrer(`${d}/${e.name}`);
      else if (e.name.endsWith(".tsx")) archivos.push(`${d}/${e.name}`);
    }
  };
  recorrer("components");

  type Comp = { nombre: string; archivo: string; cuerpo: string; propio: boolean };
  const comps = new Map<string, Comp>();          // "archivo::Nombre"
  const porNombre = new Map<string, string[]>();  // Nombre → claves
  const importes = new Map<string, Map<string, string>>(); // archivo → Nombre → archivo

  for (const f of archivos) {
    const src = stripTs(read(f));

    const mapa = new Map<string, string>();
    for (const m of src.matchAll(/import \{([^}]+)\} from "(@\/components\/[^"]+|\.[^"]+)"/g)) {
      const ruta = m[2].startsWith("@/")
        ? `${m[2].slice(2)}.tsx`
        : `${f.split("/").slice(0, -1).join("/")}/${m[2].replace(/^\.\//, "")}.tsx`;
      for (const n of m[1].split(",").map((x) => x.trim().replace(/^type /, ""))) {
        if (n.length > 0) mapa.set(n, ruta);
      }
    }
    importes.set(f, mapa);

    // Los componentes del archivo, y su cuerpo: de su `function` a la
    // siguiente declaración de nivel superior.
    const decls = [...src.matchAll(/^(?:export )?function ([A-Z][A-Za-z0-9_]*)\s*\(/gm)];
    for (let i = 0; i < decls.length; i += 1) {
      const desde = decls[i].index!;
      const hasta = i + 1 < decls.length ? decls[i + 1].index! : src.length;
      const cuerpo = src.slice(desde, hasta);
      const clave = `${f}::${decls[i][1]}`;
      comps.set(clave, {
        nombre: decls[i][1], archivo: f, cuerpo, propio: /<form[\s>]/.test(cuerpo),
      });
      porNombre.set(decls[i][1], [...(porNombre.get(decls[i][1]) ?? []), clave]);
    }
  }

  /** Qué componentes renderiza un trozo de JSX, resueltos a su archivo. */
  function hijos(archivo: string, jsx: string): string[] {
    const mapa = importes.get(archivo) ?? new Map();
    const out: string[] = [];
    for (const m of jsx.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)) {
      const n = m[1];
      const destino = mapa.get(n) ?? archivo;
      const clave = `${destino}::${n}`;
      if (comps.has(clave)) out.push(clave);
    }
    return [...new Set(out)];
  }

  /** ¿Este componente acaba pintando un form, a la profundidad que sea? */
  const memo = new Map<string, boolean>();
  function pintaFormHondo(clave: string, visto = new Set<string>()): boolean {
    if (memo.has(clave)) return memo.get(clave)!;
    if (visto.has(clave)) return false;
    visto.add(clave);
    const c = comps.get(clave);
    if (!c) return false;
    const r = c.propio
      || hijos(c.archivo, c.cuerpo).some((h) => pintaFormHondo(h, visto));
    memo.set(clave, r);
    return r;
  }

  function regionesDeForm(src: string): string[] {
    const out: string[] = [];
    let i = src.indexOf("<form");
    while (i !== -1) {
      const fin = src.indexOf("</form>", i);
      if (fin === -1) break;
      out.push(src.slice(i, fin));
      i = src.indexOf("<form", fin);
    }
    return out;
  }

  const problemas: string[] = [];
  for (const [clave, c] of comps) {
    if (!c.propio) continue;
    const dentro = regionesDeForm(c.cuerpo).join("\n");
    if (dentro.length === 0) continue;
    for (const h of hijos(c.archivo, dentro)) {
      if (h === clave) continue;
      if (pintaFormHondo(h)) {
        problemas.push(`${c.archivo} · <${c.nombre}> pone dentro de su form a `
          + `<${comps.get(h)!.nombre}>, que acaba pintando otro`);
      }
    }
  }
  assert(problemas.length === 0, problemas.join(" · "));
});

console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
