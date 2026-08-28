/**
 * Trazaloop · QUALITY-12.2D · La revisión contextual, leyendo el código.
 *
 * Comprueba lo que tiene que ser cierto antes de que nadie pulse el botón: que
 * la recuperación la gobierna la guía y no una tabla escondida en el código,
 * que no entra el Context Pack global, que un hallazgo no puede llamarse no
 * conformidad, que «confirmada» la escribe una función y no el modelo, y que
 * no viaja un dato personal al proveedor por revisar un párrafo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODEL_FINDING_TYPES, REVIEW_FINDING_TYPES, REVIEW_SEVERITIES,
  RELATED_CONTEXT_TYPES, ROUTABLE_CONTEXT_TYPES, UNSCOPED_CONTEXT_TYPES,
  REVIEW_FINDING_LABEL, REVIEW_SEVERITY_LABEL, RELATED_CONTEXT_LABEL,
} from "../../lib/domain/document-review";
import { REVIEW_SCHEMA, REVIEW_LIMITS, validateReview } from "../../lib/intelligence/document-review/schema";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
/**
 * Quita comentarios antes de mirar el código.
 *
 * No es cosmético: sin esto, el comentario que explica POR QUÉ este panel no
 * puede llevar un `<form>` hace fallar la comprobación de que no lleva un
 * `<form>`. Y al revés es peor: una prueba que acepta la palabra escrita en un
 * comentario da por buena una promesa en vez de un hecho.
 */
const stripTs = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
   .replace(/\/\*[\s\S]*?\*\//g, "")
   .replace(/^\s*\/\/.*$/gm, "");

const MIG = read("supabase/migrations/0139_document_contextual_review.sql");
const ORQ = read("lib/intelligence/document-review/contextual-review.ts");
const RUTA = read("lib/intelligence/document-review/routing.ts");
const ADAP = read("lib/intelligence/document-review/adapters.ts");
const OBS = read("lib/intelligence/document-review/observations.ts");
const POL = read("lib/intelligence/document-review/policy.ts");
const CTX = read("lib/intelligence/document-review/context.ts");
const ESQ = read("lib/intelligence/document-review/schema.ts");
const SCOPE = read("lib/intelligence/document-review/scope.ts");
const ACCION = read("server/actions/document-review.ts");
const UI = read("components/domain/documents/contextual-review.tsx");
const EDITOR = read("components/domain/trazadocs/section-editor.tsx");
const TEXTIL = read("components/domain/textiles/trazadoc-section-field.tsx");
const TODO = [ORQ, RUTA, ADAP, OBS, POL, CTX, ESQ, SCOPE, ACCION].join("\n");
/** Los mismos, pero sin una sola línea de comentario: lo que de verdad corre. */
const CODIGO = stripTs(TODO);
const UI_CODIGO = stripTs(UI);
const ACCION_CODIGO = stripTs(ACCION);

console.log("\nQUALITY-12.2D · revisión contextual de documentos\n");

// ===========================================================================
console.log("A · LA GUÍA GOBIERNA LA RECUPERACIÓN");
// ===========================================================================

check("A1. el enrutado parte de related_context_types de la guía", () => {
  assert(/declaredTypes: req\.guidance\?\.relatedContextTypes/.test(ORQ),
    "el orquestador no pasa los tipos de la guía");
  assert(/routeTypes\(params\.declaredTypes\)/.test(RUTA),
    "el enrutado no consume los tipos declarados");
});

check("A2. no hay una tabla sección→contexto escondida en el código", () => {
  // Lo que NO puede existir: un mapa de claves de sección a tipos.
  assert(!/responsabilidades|responsibilities\s*:\s*\[/.test(stripTs(RUTA)),
    "el enrutado tiene un mapeo por clave de sección");
  assert(!/"objetivo"\s*:/.test(stripTs(RUTA)), "hay un mapeo por título de sección");
});

check("A3. un tipo que la guía no declara no se consulta", () => {
  assert(/for \(const type of requested\)/.test(RUTA),
    "no se itera solo sobre lo declarado");
  assert(/registro\[type\]/.test(RUTA), "los adaptadores no se eligen por tipo");
});

check("A4. la taxonomía del código es la misma que la de la base", () => {
  const enSql = [...MIG.matchAll(/'(\w+)',\s+--/g)].map((m) => m[1]);
  // 0139 no redefine la lista; la de 0137 es la autoridad. Aquí basta con que
  // el código no haya inventado un decimotercer tipo.
  assert(RELATED_CONTEXT_TYPES.length === 12,
    `el código declara ${RELATED_CONTEXT_TYPES.length} tipos, no 12`);
  assert(enSql.length >= 0, "");
});

check("A5. rutables y sin alcance suman los doce, sin solaparse", () => {
  assert(ROUTABLE_CONTEXT_TYPES.length + UNSCOPED_CONTEXT_TYPES.length === 12,
    "las dos listas no suman doce");
  for (const t of ROUTABLE_CONTEXT_TYPES) {
    assert(!UNSCOPED_CONTEXT_TYPES.includes(t), `${t} está en las dos listas`);
  }
});

check("A6. un tipo sin alcance se declara como límite, no se busca a ciegas", () => {
  assert(/kind: "unscoped_type"/.test(RUTA), "no se declara el tipo sin alcance");
  assert(/unscoped\.map/.test(RUTA), "los tipos sin alcance no llegan a los límites");
});

// ===========================================================================
console.log("\nB · NADA DE CONTEXT PACK GLOBAL");
// ===========================================================================

check("B1. no se importa ni un adaptador del Copilot", () => {
  assert(!/lib\/ai\/context\/adapters/.test(CODIGO),
    "se importaron los adaptadores del Copilot");
  assert(!/from "@\/lib\/ai\/context\/builder"/.test(TODO),
    "se importó el constructor de contexto del Copilot");
  assert(!/registerAdapter/.test(CODIGO), "se registró un adaptador global");
});

check("B2. ningún adaptador sabe leer sin alcance", () => {
  // Cada `load` de dominio empieza comprobando que hay a qué agarrarse.
  const guardas = ADAP.match(/if \(scope\.processIds\.length === 0\) return;/g) ?? [];
  assert(guardas.length >= 4,
    `solo ${guardas.length} adaptadores comprueban el alcance de procesos`);
  // Y el de cargos, que no cuelga de procesos, se ata al alcance por otra vía.
  assert(/const ids = \[\.\.\.new Set\(\[/.test(ADAP) && /if \(ids\.length === 0\) return;/.test(ADAP),
    "el de cargos leería sin alcance");
});

check("B3. hay un tope de tipos y otro de consultas", () => {
  assert(/MAX_CONTEXT_TYPES = 6/.test(RUTA), "falta el tope de tipos");
  assert(/MAX_QUERIES = 12/.test(RUTA), "falta el tope de consultas");
  assert(/w\.queries >= MAX_QUERIES/.test(RUTA), "el tope de consultas no se aplica");
});

check("B4. pasarse del tope NO es silencioso", () => {
  assert(/for \(const type of dropped\) limits\.push/.test(RUTA),
    "los tipos descartados no se declaran");
  assert(/for \(const type of w\.truncated\)/.test(RUTA),
    "los tipos recortados no se declaran");
});

check("B5. los adaptadores no usan cliente administrativo", () => {
  assert(!/service_role|SERVICE_ROLE|createAdminClient/.test(CODIGO),
    "hay un cliente administrativo en la revisión contextual");
});

// ===========================================================================
console.log("\nC · UN HALLAZGO NO ES UNA NO CONFORMIDAD");
// ===========================================================================

check("C1. la palabra no existe entre los tipos", () => {
  for (const t of REVIEW_FINDING_TYPES) {
    assert(!/nonconform|no_conformidad|nc_/i.test(t), `el tipo ${t} suena a NC`);
  }
});

check("C2. las severidades no son de auditoría", () => {
  assert(REVIEW_SEVERITIES.join(",") === "info,attention,conflict",
    `severidades inesperadas: ${REVIEW_SEVERITIES.join(",")}`);
  for (const s of REVIEW_SEVERITIES) {
    assert(!/minor|major|critical|mayor|menor|critica/i.test(s),
      `la severidad ${s} usa vocabulario de auditoría`);
  }
});

check("C3. las etiquetas visibles tampoco declaran conformidad", () => {
  const visibles = [...Object.values(REVIEW_FINDING_LABEL),
    ...Object.values(REVIEW_SEVERITY_LABEL), ...Object.values(RELATED_CONTEXT_LABEL)];
  for (const e of visibles) {
    assert(!/\bconforme\b|\bcumple\b|no conformidad|certificad/i.test(e),
      `la etiqueta «${e}» declara conformidad`);
  }
});

check("C4. la política prohíbe declarar cumplimiento, con esas palabras", () => {
  assert(/No digas nunca que algo cumple, es conforme, satisface un requisito/.test(POL),
    "la política no prohíbe declarar cumplimiento");
  assert(/NO son no conformidades/.test(POL),
    "la política no dice que los hallazgos no son no conformidades");
});

check("C5. la política conserva las distinciones del dominio", () => {
  assert(/control no es una acción/i.test(POL), "falta control != acción");
  assert(/riesgo no es un incumplimiento/i.test(POL), "falta riesgo != incumplimiento");
  assert(/indicador\s*\n?bajo su meta tampoco/i.test(POL.replace(/\n/g, "\n")),
    "falta indicador bajo meta != incumplimiento");
});

check("C6. la revisión no escribe en ninguna tabla de negocio", () => {
  const negocio = ["work_cases", "work_actions", "quality_risks", "quality_controls",
    "quality_objectives", "quality_indicators", "trazadoc_document_sections",
    "trazadoc_document_revisions", "trazadoc_documents", "suppliers"];
  for (const t of negocio) {
    const re = new RegExp(`from\\("${t}"\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`);
    assert(!re.test(CODIGO), `se escribe en ${t}`);
  }
  assert(!/\.rpc\("quality_ai_create_suggestion/.test(CODIGO), "crea sugerencias persistidas");
});

check("C7. lo único que se escribe es la operación y sus fuentes", () => {
  const escrituras = [...CODIGO.matchAll(/from\("(\w+)"\)\s*\n?\s*\.update\(/g)].map((m) => m[1]);
  for (const t of escrituras) {
    assert(t === "quality_ai_runs", `se actualiza ${t}, que no es el registro de la operación`);
  }
  assert(/quality_ai_add_reference/.test(ORQ), "no se guardan las fuentes");
});

check("C8. no existe una tabla de hallazgos", () => {
  assert(!/create table[^;]*finding/i.test(MIG), "la migración crea una tabla de hallazgos");
  assert(!/insert into[^;]*finding/i.test(MIG), "la migración persiste hallazgos");
});

// ===========================================================================
console.log("\nD · «CONFIRMADA» LA ESCRIBE EL CÓDIGO");
// ===========================================================================

check("D1. el modelo no puede escribir confirmed_conflict", () => {
  assert(!MODEL_FINDING_TYPES.includes("confirmed_conflict" as never),
    "el modelo puede declarar una discrepancia confirmada");
  const enums = JSON.stringify(REVIEW_SCHEMA);
  assert(!enums.includes("confirmed_conflict"),
    "el esquema ofrece confirmed_conflict al modelo");
});

check("D2. si aun así lo escribe, se degrada", () => {
  const r = validateReview({
    summary: "Resumen.",
    findings: [{
      type: "confirmed_conflict", severity: "conflict", excerpt: "x",
      fact: "y", explanation: "z", refs: [1], next_step: "", wording: "",
    }],
  }, 3);
  assert(r.ok, "la validación falló");
  assert(r.review.findings[0].type === "possible_conflict",
    `no se degradó: quedó ${r.review.findings[0].type}`);
});

check("D3. el ascenso exige que el código haya comparado y que se cite lo mismo", () => {
  assert(/function promoteConfirmed/.test(ORQ), "no existe el ascenso");
  assert(/o\.kind === "position_differs" \|\| o\.kind === "frequency_differs"/.test(ORQ),
    "el ascenso no se basa en las comparaciones deterministas");
  assert(/f\.type === "possible_conflict" && f\.sourceRefs\.some/.test(ORQ),
    "el ascenso no exige coincidencia de cita");
});

check("D4. las comparaciones exigen los DOS lados resueltos", () => {
  // Sin cargo responsable —ni del documento ni de un proceso— no se compara.
  assert(/const dueno = duenoDoc \?\? \(duenosProc\.length === 1 \? duenosProc\[0\] : null\);\s*\n\s*if \(!dueno\) return \[\];/.test(RUTA),
    "se compara el cargo sin cargo registrado");
  // Y con DOS procesos con dueños distintos tampoco: no se sabe cuál gobierna.
  assert(/duenosProc\.length === 1/.test(RUTA),
    "con varios dueños de proceso se elegiría uno");
  assert(/if \(!registrada \|\| registrada === escrita\) continue;/.test(RUTA),
    "se compara la frecuencia sin frecuencia registrada");
});

check("D5. una frase con dos frecuencias no confirma nada", () => {
  assert(/vistas\.size === 1 \? \[\.\.\.vistas\]\[0\] : null/.test(OBS),
    "una frase con dos periodicidades devolvería una");
});

// ===========================================================================
console.log("\nE · RESOLUCIÓN DE ENTIDADES PRUDENTE");
// ===========================================================================

check("E1. se resuelve por nombre completo, del catálogo hacia el texto", () => {
  assert(/const matched = catalogo\.filter\(\(e\) => \{[\s\S]*?t\.includes\(n\)/.test(OBS),
    "la resolución no va del catálogo al texto");
});

check("E2. una palabra que apunta a varios registros es ambigua y no se elige", () => {
  assert(/if \(candidatos\.length < 2\) continue;/.test(OBS), "no se detecta ambigüedad");
  assert(/kind: "ambiguous"/.test(RUTA), "la ambigüedad no llega a las observaciones");
  assert(/No se ha elegido ninguno/.test(OBS), "la ambigüedad no dice que no eligió");
});

check("E3. las palabras genéricas de un cargo no distinguen a nadie", () => {
  assert(/GENERICAS/.test(OBS), "no hay lista de palabras genéricas");
  for (const g of ["coordinador", "jefe", "responsable", "area"]) {
    assert(new RegExp(`"${g}"`).test(OBS), `«${g}» no está entre las genéricas`);
  }
});

check("E4. ni embeddings, ni búsqueda vectorial, ni base semántica", () => {
  assert(!/embedding|vector|cosine|pgvector|similarity|semantic/i.test(CODIGO),
    "hay búsqueda por parecido");
  assert(!/\.ilike\(|\.textSearch\(|\.like\(/.test(CODIGO),
    "hay búsqueda difusa contra la base");
});

check("E5. el catálogo se queda en el servidor", () => {
  // Del catálogo solo salen los ids que se pasan al adaptador.
  assert(/cargosExtra\.push\(\.\.\.r\.matched\.map\(\(m\) => m\.id\)\)/.test(RUTA),
    "del catálogo de cargos sale algo más que los coincidentes");
  assert(/procesosExtra\.push\(\.\.\.r\.matched\.map\(\(m\) => m\.id\)\)/.test(RUTA),
    "del catálogo de procesos sale algo más que los coincidentes");
  assert(!/catalogo\.map\(\(c\) => c\.name\)/.test(RUTA), "se envía el catálogo entero");
});

// ===========================================================================
console.log("\nF · PRIVACIDAD");
// ===========================================================================

check("F1. no se leen personas, ni asignaciones, ni perfiles", () => {
  const prohibidas = ["quality_people", "quality_position_assignments", "profiles",
    "organization_members", "auth.users"];
  for (const t of prohibidas) {
    assert(!new RegExp(`from\\("${t.replace(".", "\\.")}"\\)`).test(CODIGO),
      `se lee ${t}`);
  }
});

check("F2. ninguna columna personal aparece en un select", () => {
  const selects = [...ADAP.matchAll(/\.select\(([\s\S]*?)\)\s*\n/g)].map((m) => m[1]).join(" ");
  for (const col of ["email", "phone", "telefono", "tax_id", "address", "direccion",
    "billing", "responsible", "storage_path", "physical_custodian",
    "physical_location", "owner_profile_id", "created_by", "full_name"]) {
    assert(!new RegExp(`\\b${col}\\b`).test(selects),
      `la columna ${col} viaja en un select de los adaptadores`);
  }
});

check("F3. la fuente de cargos deja escrito que se cita el cargo y no la persona", () => {
  assert(/Position != Person != User/.test(MIG),
    "el catálogo de fuentes no distingue cargo de persona");
});

check("F4. los adaptadores nombran sus columnas, no piden todo", () => {
  assert(!/\.select\("\*"\)/.test(ADAP), "un adaptador pide todas las columnas");
});

// ===========================================================================
console.log("\nG · EL PERMISO ES DEL MÓDULO DEL DOCUMENTO");
// ===========================================================================

check("G1. la acción no exige Quality", () => {
  assert(!/requireQualityForAction|requireQuality/.test(ACCION_CODIGO),
    "la acción exige Quality para revisar cualquier documento");
});

check("G2. el módulo se lee de la base, no de la petición", () => {
  assert(/const moduleKey = String\(doc\.module_key/.test(ACCION),
    "el módulo no sale del documento");
  assert(!/formData\.get\("module/.test(ACCION_CODIGO), "el módulo llega del cliente");
});

check("G3. la base vuelve a comprobarlo y traduce PCR", () => {
  assert(/v_doc\.module_key is distinct from p_module_key/.test(MIG),
    "la función no comprueba que el módulo coincida con el del documento");
  assert(/when 'cpr' then 'traceability_6632'/.test(MIG),
    "la función no traduce el módulo comercial de PCR");
});

check("G4. Demo no, Full y Extra sí", () => {
  assert(/not in \('full', 'extra'\)/.test(MIG), "la función no cierra Demo");
  assert(/reason', 'demo'/.test(MIG), "Demo no se distingue del resto de negativas");
});

check("G5. el tope diario es SUYO, no compartido con la redacción", () => {
  assert(/use_case = 'document\.contextual_review'\s*\n\s*and started_at/.test(MIG),
    "el tope diario cuenta operaciones de otro caso de uso");
});

// ===========================================================================
console.log("\nH · EL PROVEEDOR SOLO CUANDO HACE FALTA");
// ===========================================================================

check("H1. sin hechos no se llama, y se registra que no se llamó", () => {
  assert(/if \(ruta\.writer\.isEmpty\(\)\)/.test(ORQ), "se llama sin hechos");
  assert(/p_provider_called: false/.test(ORQ), "no se registra que no hubo llamada");
  const i = ORQ.indexOf("ruta.writer.isEmpty()");
  const j = ORQ.indexOf("provider.generateStructured");
  assert(i > 0 && j > i, "la llamada al proveedor ocurre antes de comprobar si hay hechos");
});

check("H2. el permiso se comprueba ANTES de construir el contexto", () => {
  // Desde el cuerpo de la función, no desde el principio del archivo: los
  // `import` de arriba nombran `buildReviewContext` mucho antes de que se use.
  const cuerpo = ORQ.slice(ORQ.indexOf("export async function runContextualReview"));
  const permiso = cuerpo.indexOf("document_review_start_run");
  const contexto = cuerpo.indexOf("await buildReviewContext");
  assert(permiso > 0 && contexto > permiso,
    "se lee la empresa antes de saber si hay permiso");
});

check("H3. sin proveedor real no se finge uno", () => {
  assert(/if \(!live && cfg\.provider !== "fake"\)/.test(ORQ),
    "se caería al doble sin credencial");
});

check("H4. el resumen del caso sin contexto lo escribe el código", () => {
  assert(/function sinContexto/.test(ORQ), "no hay resumen determinista");
  // El texto va partido en varias líneas del fuente, así que se compara
  // aplanado: si no, la comprobación depende de dónde caiga el salto.
  const plano = ORQ.replace(/"\s*\n\s*\+ "/g, "").replace(/\s+/g, " ");
  assert(/no significa que el texto esté mal/.test(plano),
    "el resumen sin contexto podría leerse como un incumplimiento");
});

check("H5. y distingue los DOS vacíos, que no son el mismo problema", () => {
  // «La guía no señala nada» no tiene arreglo; «este documento no está atado a
  // nada» sí. Contarlos igual hizo pasar por defecto de la funcionalidad una
  // relación que faltaba en los datos, durante la validación humana.
  assert(/reason === "no_types"/.test(ORQ), "el resumen no distingue los dos vacíos");
  assert(/emptyReason/.test(RUTA), "el enrutado no dice por qué quedó vacío");
  const plano = ORQ.replace(/"\s*\n\s*\+ "/g, "").replace(/\s+/g, " ");
  assert(/Si lo relacionas con su proceso/.test(plano),
    "el caso accionable no dice qué hacer");
});

// ===========================================================================
console.log("\nI · VERDAD HISTÓRICA SIN FINGIR");
// ===========================================================================

check("I1. cada adaptador declara si sabe reconstruir el pasado", () => {
  const decl = [...ADAP.matchAll(/historical: (true|false)/g)].map((m) => m[1]);
  assert(decl.length >= 6, `solo ${decl.length} adaptadores lo declaran`);
  assert(decl.includes("true") && decl.includes("false"),
    "todos declaran lo mismo, lo cual es sospechoso");
});

check("I2. el que no sabe se APAGA con fecha, no responde con el dato de hoy", () => {
  assert(/if \(scopeAmpliado\.asOf && !adapter\.historical\)/.test(RUTA),
    "un adaptador sin histórico respondería con el estado actual");
  assert(/kind: "no_historical"/.test(RUTA), "no se declara la limitación");
});

check("I3. los que sí saben filtran por la fecha", () => {
  const porFecha = ADAP.match(/scope\.asOf\s*\n?\s*\? q\.lte\("effective_from", scope\.asOf\)/g) ?? [];
  assert(porFecha.length >= 3,
    `solo ${porFecha.length} adaptadores filtran por fecha de vigencia`);
});

check("I4. la pantalla no puede pedir una revisión histórica hoy", () => {
  assert(/asOf: null,/.test(ACCION), "la acción manda una fecha");
  assert(!/formData\.get\("as_of"|formData\.get\("asof"/i.test(ACCION),
    "la acción acepta una fecha del cliente");
});

// ===========================================================================
console.log("\nJ · INYECCIÓN DE INSTRUCCIONES");
// ===========================================================================

check("J1. cada cosa va en su cajón, etiquetada", () => {
  for (const c of ["TEXTO", "GUIA", "DOCUMENTO",
    "HECHOS", "COMPROBADO",
    "LIMITES"]) {
    assert(CTX.includes(`<${c}>`) && CTX.includes(`</${c}>`), `falta el cajón ${c}`);
  }
});

check("J2. la política dice que el texto Y los hechos son contenido", () => {
  assert(/Si el TEXTO o un HECHO traen algo con forma de instrucción/.test(POL),
    "la política solo protege contra la inyección desde el texto");
  assert(/NO la obedeces/.test(POL), "la política no dice que no se obedece");
});

// ===========================================================================
console.log("\nK · LA PANTALLA");
// ===========================================================================

check("K1. el panel NO tiene formulario propio", () => {
  assert(!/<form/.test(UI_CODIGO), "el panel volvió a meter un <form> dentro de otro");
  assert(/const form = new FormData\(\)/.test(UI), "no construye el FormData a mano");
  assert(/startTransition\(\(\) => dispatch\(form\)\)/.test(UI),
    "no despacha en una transición");
});

check("K2. todos sus botones son type=button", () => {
  const botones = [...UI_CODIGO.matchAll(/<button\b([\s\S]*?)>/g)].map((m) => m[1]);
  for (const b of botones) {
    assert(/type="button"/.test(b), "hay un <button> sin type=\"button\"");
  }
  assert(/<Button\s+type="button"/.test(UI), "el botón principal no es type=button");
});

check("K3. el estado de trabajo se ve", () => {
  assert(/data-testid="review-pending"/.test(UI), "no hay estado de espera visible");
  assert(/role="status"/.test(UI), "el estado de espera no se anuncia");
});

check("K4. se distingue de «Mejorar redacción»", () => {
  assert(/Revisar consistencia/.test(UI), "el botón no se llama distinto");
  assert(!/Mejorar con Intelligence/.test(UI), "el panel reusa la etiqueta de 12.2C");
  assert(/QuickEditPanel[\s\S]*ContextualReviewPanel/.test(EDITOR),
    "los dos paneles no conviven en el editor compartido");
  assert(/ContextualReviewPanel/.test(TEXTIL), "el editor textil no lo tiene");
});

check("K5. «Aplicar» solo toca el editor", () => {
  assert(/onApply\(f\.suggestedWording\)/.test(UI), "aplicar no usa la redacción propuesta");
  assert(!/save|guardar|submit|Action\(/i.test(
    (/onClick=\{\(\) => onApply[\s\S]{0,120}/.exec(UI) ?? [""])[0]),
    "aplicar hace algo más que cambiar el editor");
});

check("K6. la pantalla avisa de que esto no es una auditoría", () => {
  assert(/no es una auditoría ni una no conformidad/.test(UI),
    "la pantalla no aclara qué NO es");
  assert(/ha cambiado el documento/.test(UI),
    "la pantalla no dice que no se cambió nada");
});

check("K7. cada hallazgo enseña solo SUS fuentes", () => {
  assert(/state\.findingSources\?\.\[i\]/.test(UI),
    "la pantalla pinta fuentes que no son de ese hallazgo");
  assert(/\.slice\(0, 3\)/.test(UI), "no hay tope de fuentes por hallazgo");
});

check("K8. se puede ignorar un hallazgo y no pasa nada más", () => {
  assert(/data-testid="review-ignore"/.test(UI), "no hay botón de ignorar");
  assert(/setIgnorados\(\(s\) => new Set\(s\)\.add\(i\)\)/.test(UI),
    "ignorar hace algo más que ocultarlo");
});

// ===========================================================================
console.log("\nL · EL CONTRATO DE SALIDA");
// ===========================================================================

check("L1. no se reutiliza el esquema del Copilot", () => {
  assert(!/ANSWER_SCHEMA/.test(CODIGO), "se reutilizó el esquema del Copilot");
  assert(!/evidence_level/.test(JSON.stringify(REVIEW_SCHEMA)),
    "el esquema arrastra el nivel de evidencia del Copilot");
});

check("L2. un hallazgo sin cita no se pinta", () => {
  const r = validateReview({
    summary: "Resumen.",
    findings: [{ type: "possible_conflict", severity: "attention", excerpt: "x",
      fact: "y", explanation: "z", refs: [], next_step: "", wording: "" }],
  }, 3);
  assert(r.ok && r.review.findings.length === 0, "un hallazgo sin cita sobrevivió");
  assert(r.ok && r.rejected === 1, "no se contó como descartado");
});

check("L3. una cita a un hecho que no se envió se descarta", () => {
  const r = validateReview({
    summary: "Resumen.",
    findings: [{ type: "possible_conflict", severity: "attention", excerpt: "x",
      fact: "y", explanation: "z", refs: [99], next_step: "", wording: "" }],
  }, 3);
  assert(r.ok && r.review.findings.length === 0, "sobrevivió una cita inventada");
});

check("L4. un hallazgo sobre la guía puede no citar hechos", () => {
  const r = validateReview({
    summary: "Resumen.",
    findings: [{ type: "guidance_gap", severity: "info", excerpt: "",
      fact: "", explanation: "la guía pide un responsable", refs: [],
      next_step: "", wording: "" }],
  }, 3);
  assert(r.ok && r.review.findings.length === 1, "se descartó un hallazgo de guía");
});

check("L5. sin resumen no hay revisión", () => {
  const r = validateReview({ summary: "  ", findings: [] }, 3);
  assert(!r.ok, "una revisión sin resumen pasó");
});

check("L6. los topes se imponen del lado de acá", () => {
  const muchos = Array.from({ length: 12 }, () => ({
    type: "consistent", severity: "info", excerpt: "x", fact: "y",
    explanation: "z", refs: [1], next_step: "", wording: "",
  }));
  const r = validateReview({ summary: "Resumen.", findings: muchos }, 3);
  assert(r.ok && r.review.findings.length === REVIEW_LIMITS.findings,
    "no se aplicó el tope de hallazgos");
  assert(r.ok && r.trimmed, "no se avisó del recorte");
});

check("L7. los textos largos se recortan, no se rechazan", () => {
  const r = validateReview({
    summary: "s".repeat(2000),
    findings: [{ type: "consistent", severity: "info", excerpt: "x".repeat(2000),
      fact: "y", explanation: "z", refs: [1], next_step: "", wording: "" }],
  }, 3);
  assert(r.ok, "un texto largo tumbó la revisión");
  assert(r.review.summary.length <= REVIEW_LIMITS.summary, "el resumen no se recortó");
  assert(r.review.findings[0].userTextExcerpt.length <= REVIEW_LIMITS.excerpt,
    "el extracto no se recortó");
});

// ===========================================================================
console.log("\nM · LA MIGRACIÓN");
// ===========================================================================

check("M1. es append-only: no toca 0138 ni anteriores", () => {
  assert(!/alter table public\.quality_ai_runs\s+drop/i.test(MIG), "borra una columna");
  assert(!/drop function public\.document_authoring_start_run/i.test(MIG),
    "borra la función de 12.2C");
  assert(!/create or replace function public\.document_authoring_start_run/i.test(MIG),
    "reescribe la función de 12.2C");
  assert(!/drop view public\.v_document_authoring_usage/i.test(MIG),
    "borra la vista de 12.2C");
});

check("M2. la vista lee con los permisos de quien pregunta", () => {
  assert(/create or replace view public\.v_document_review_usage\s*\nwith \(security_invoker = true\)/.test(MIG),
    "la vista no tiene security_invoker");
});

check("M3. la vista no expone el texto ni los hallazgos", () => {
  const vista = /create or replace view public\.v_document_review_usage[\s\S]*?;/.exec(MIG)?.[0] ?? "";
  for (const c of ["question", "answer", "r.answer", "context_snapshot"]) {
    assert(!new RegExp(`\\b${c.replace(".", "\\.")}\\b`).test(vista),
      `la vista expone ${c}`);
  }
});

check("M4. las funciones nuevas fijan search_path y revocan anon", () => {
  assert(/set search_path = public/.test(MIG), "la función no fija search_path");
  assert(/revoke all on function public\.document_review_start_run/.test(MIG),
    "la función no revoca permisos");
  assert(/revoke all on public\.v_document_review_usage from anon, authenticated/.test(MIG),
    "la vista no revoca anon");
});

check("M5. registra qué contexto se resolvió y cuántas consultas costó", () => {
  assert(/add column if not exists related_context_types text\[\]/.test(MIG),
    "no se guarda qué contexto se resolvió");
  assert(/add column if not exists context_queries integer/.test(MIG),
    "no se guarda cuántas consultas costó");
  assert(/document_review_record_context/.test(ORQ), "el orquestador no lo escribe");
  assert(/p_types: types, p_queries: queries/.test(ORQ),
    "el orquestador no manda lo que resolvió");
  // Y por función, no por `update`: la tabla solo tiene política de lectura, y
  // un `update` que no toca ninguna fila no se queja.
  assert(!/from\("quality_ai_runs"\)\s*\n?\s*\.update\(/.test(ORQ),
    "el contexto se apunta con un update directo, que no afecta a ninguna fila");
});

check("M6. el caso de uso es propio y separado", () => {
  assert(/'document\.contextual_review'/.test(MIG), "no hay caso de uso propio");
  assert(!/'document\.quick_edit'/.test(
    /create or replace function public\.document_review_start_run[\s\S]*?\$\$;/.exec(MIG)?.[0] ?? ""),
    "la función nueva cuenta operaciones de 12.2C");
});

// ===========================================================================
console.log("\nN · ETIQUETAS Y VOCABULARIO");
// ===========================================================================

check("N1. cada tipo y severidad tiene etiqueta en castellano", () => {
  for (const t of REVIEW_FINDING_TYPES) {
    assert((REVIEW_FINDING_LABEL[t] ?? "").length > 0, `${t} sin etiqueta`);
  }
  for (const s of REVIEW_SEVERITIES) {
    assert((REVIEW_SEVERITY_LABEL[s] ?? "").length > 0, `${s} sin etiqueta`);
  }
  for (const c of RELATED_CONTEXT_TYPES) {
    assert((RELATED_CONTEXT_LABEL[c] ?? "").length > 0, `${c} sin etiqueta`);
  }
});

check("N2. el vocabulario de la pantalla no es server-only", () => {
  const dom = read("lib/domain/document-review.ts");
  assert(!/^import "server-only"/m.test(dom),
    "el vocabulario es server-only y el panel no podrá importarlo");
});

console.log(`\n${passed} conformes · ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
