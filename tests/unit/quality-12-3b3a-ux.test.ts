/**
 * Trazaloop · QUALITY-12.3B3A · La interfaz de partes interesadas.
 *
 * Esta suite lee el código. Lo que comprueba no se ve ejecutando la pantalla:
 * que las rutas existan y estén protegidas, que la búsqueda y el resumen sean
 * de servidor, que ningún componente escriba en la base por su cuenta, que la
 * interfaz no ofrezca las dos relaciones que la base rechaza, y que en móvil
 * haya algo más que una tabla de siete columnas.
 *
 * El cableado —que los botones hagan lo que dicen— se prueba montando los
 * componentes en un DOM de verdad, en tests/ui/quality-12-3b3a-ux.test.tsx.
 *
 * Correr: npm run test:quality123b3a-ux
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CORE_RELATION_PAIRS, PERIPHERAL_REF_KINDS, canMutate, strategyScope,
} from "../../lib/domain/quality-interested-parties";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const RUTA = "app/(app)/(shell)/quality/context/interested-parties";
const COMP = "components/domain/quality/interested-parties";

const LISTA = leer(`${RUTA}/page.tsx`);
const FICHA = leer(`${RUTA}/[assessmentId]/page.tsx`);
const CATS = leer(`${RUTA}/categories/page.tsx`);
const REGISTRY = leer("lib/modules/registry.ts");
const ACC = leer("server/actions/quality-interested-parties.ts");
const DOM = leer("lib/domain/quality-interested-parties.ts");

const componentes = readdirSync(join(raiz, COMP))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ nombre: f, texto: leer(`${COMP}/${f}`) }));
const fuente = (f: string) => componentes.find((c) => c.nombre === f)!.texto;

/**
 * El código SIN comentarios.
 *
 * Hace falta porque varias de estas comprobaciones buscan una palabra que el
 * propio archivo EXPLICA por qué no usa —«ninguna se llama desempeño», «el
 * responsable no es texto libre»—. Buscar en el comentario haría fallar a la
 * prueba justo en los archivos que mejor se portan.
 */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nQUALITY-12.3B3A · Interfaz de partes interesadas\n");

// ===========================================================================
// A–B · La ruta
// ===========================================================================

check("A. Las tres rutas existen y todas exigen el módulo Quality", () => {
  for (const f of [`${RUTA}/page.tsx`, `${RUTA}/[assessmentId]/page.tsx`,
                   `${RUTA}/categories/page.tsx`]) {
    assert(existsSync(join(raiz, f)), `falta ${f}`);
  }
  for (const [n, s] of [["lista", LISTA], ["ficha", FICHA], ["categorías", CATS]] as const) {
    assert(s.includes("requireQualityModule()"),
      `la página de ${n} no pasa por el guard del módulo`);
  }
});

check("B. La interfaz NO depende de PCR ni de Textiles", () => {
  const todo = [LISTA, FICHA, CATS, ...componentes.map((c) => c.texto)].join("\n");
  for (const prohibido of ["/traceability", "/textiles", "lib/db/traceability",
                           "lib/db/textiles", "requireCprModule", "output_batch"]) {
    assert(!todo.includes(prohibido),
      `la pantalla referencia ${prohibido}: una empresa con Quality y sin PCR no la podría abrir`);
  }
});

check("B2. El menú tiene el grupo Contexto, preparado para 4.1 y sin implementarlo", () => {
  assert(REGISTRY.includes("QUALITY_CONTEXTO_GROUP"), "no existe el grupo Contexto");
  assert(/title: "Contexto"/.test(REGISTRY), "el grupo no se llama Contexto");
  assert(REGISTRY.includes("/quality/context/interested-parties"),
    "el grupo no enlaza a partes interesadas");
  const grupos = REGISTRY.slice(REGISTRY.indexOf("groups: [QUALITY_CONTEXTO_GROUP"));
  assert(grupos.startsWith("groups: [QUALITY_CONTEXTO_GROUP"),
    "Contexto no va primero en el menú de Quality");
  assert(!REGISTRY.includes("/quality/context/organization"),
    "se implementó 4.1, y este sprint no lo incluye");
});

// ===========================================================================
// C–F · Resumen, búsqueda, filtros y paginación
// ===========================================================================

check("C. El resumen sale de la consulta de servidor, no de las filas cargadas", () => {
  assert(LISTA.includes("getSummary(org.organizationId)"),
    "la página no pide el resumen a la capa de datos");
  const cards = fuente("summary-cards.tsx");
  assert(!/\.filter\(|\.length|\.reduce\(/.test(cards.replace(/cards\.map|cards\.length/g, "")),
    "las tarjetas calculan cifras en el componente");
  assert(!/desempeño|rendimiento/i.test(sinComentarios(cards)),
    "el resumen llama «desempeño» a completitud administrativa");
});

check("D. La búsqueda es de servidor y viaja en la URL", () => {
  assert(LISTA.includes("searchAssessments(org.organizationId"),
    "la lista no usa la búsqueda paginada de B2");
  assert(/q,\s*page: uno\("page"\)/.test(LISTA), "no se pasan q y page a la consulta");
  const lista = fuente("parties-list.tsx");
  assert(lista.includes("ListSearchForm"), "no usa el formulario de búsqueda compartido");
  assert(!/rows\.filter\(/.test(lista), "el componente filtra las filas ya cargadas");
});

check("E. La paginación conserva búsqueda y filtros", () => {
  const lista = fuente("parties-list.tsx");
  assert(lista.includes("ListPagination"), "no hay paginador");
  assert(/extraParams=\{extra\}/.test(lista), "el paginador pierde los filtros al cambiar de página");
  assert(lista.includes("total={total}"), "el paginador no recibe el total real");
});

check("F. Los cuatro filtros mínimos existen y se resuelven en servidor", () => {
  const lista = fuente("parties-list.tsx");
  for (const f of ["categoria", "tipo", "pertinencia", "revision"]) {
    assert(lista.includes(`name="${f}"`), `falta el filtro ${f}`);
    assert(LISTA.includes(`uno("${f}")`), `la página no lee el filtro ${f} de la URL`);
  }
  assert(LISTA.includes("reviewState:"), "el estado de revisión no llega a la consulta");
});

check("F2. Un valor desconocido en la URL se ignora, no se pasa a la consulta", () => {
  assert(LISTA.includes("function pick"), "no hay validación del vocabulario de la URL");
  assert(/pick\(uno\("tipo"\), SUBJECT_KINDS\)/.test(LISTA), "el tipo no se valida");
  assert(/pick\(uno\("pertinencia"\), RELEVANCE_STATES\)/.test(LISTA), "la pertinencia no se valida");
});

// ===========================================================================
// G–I · Alta
// ===========================================================================

check("G. La entidad externa se ELIGE; no se recrea una ficha local", () => {
  const panel = fuente("new-party-panel.tsx");
  assert(panel.includes("parties.map"), "no hay selector de entidades existentes");
  assert(/proveedor|Proveedores/.test(panel) && /cliente|Voz del cliente/.test(panel),
    "no avisa de que la entidad puede existir ya en otro módulo");
  assert(panel.includes("hasAssessment"), "no avisa de las que ya tienen análisis");
  assert(!/quality_external_parties/.test(panel),
    "el componente habla directamente con la tabla de identidad");
  assert(ACC.includes("createExternalPartyAction"),
    "no existe el alta de identidad, y hace falta para partes que no son ni clientes ni proveedores");
});

check("G2. No se ofrecen unidades organizativas como parte interesada", () => {
  const todo = componentes.map((c) => c.texto).join("\n");
  assert(!/org_unit|quality_org_units/.test(todo),
    "la interfaz ofrece unidades organizativas como parte interesada");
});

check("H. Los colectivos se crean desde la pantalla", () => {
  const panel = fuente("new-party-panel.tsx");
  assert(panel.includes("createGroupAction"), "no se puede crear un colectivo");
  assert(/Trabajadores|dirección|propietarios/i.test(panel),
    "no se explica con ejemplos qué es un colectivo");
});

check("I. El primer análisis se registra con pertinencia y justificación", () => {
  const panel = fuente("new-party-panel.tsx");
  assert(panel.includes("createAssessmentAction"), "no se puede registrar el análisis");
  assert(panel.includes('name="relevance_status"'), "no se pide la pertinencia");
  assert(/required=\{pertinencia === "not_relevant"\}/.test(panel),
    "no se exige justificación al declarar no pertinente");
  assert(panel.includes("priority_method_note"),
    "se puede puntuar sin decir en qué se apoya");
});

// ===========================================================================
// J–K · Historia
// ===========================================================================

check("J. Sustituir un análisis pide confirmación y explica qué pasa", () => {
  const s = fuente("assessment-section.tsx");
  assert(s.includes("ConfirmDialog"), "no hay confirmación al sustituir");
  assert(/se conservará|se conserva/.test(s),
    "la confirmación no dice que el análisis anterior se conserva");
  assert(!/>\s*Editar análisis|editAssessment/.test(s),
    "hay un botón de editar el análisis: un histórico no se reescribe");
});

check("K. En modo histórico no hay un solo botón que escriba", () => {
  const detalle = fuente("detail-view.tsx");
  assert(detalle.includes("canMutate as puedeEscribir") || detalle.includes("puedeEscribir("),
    "la ficha no usa la regla del dominio para apagar la escritura");
  assert(/puedeEscribir\(\{ canManage, asOf \}\)/.test(detalle),
    "el modo histórico no participa en la decisión");
  // La regla en sí, comprobada de verdad y no por lectura.
  assert(canMutate({ canManage: true, asOf: "2026-01-01" }) === false,
    "el dominio deja escribir en modo histórico");
  assert(canMutate({ canManage: false, asOf: null }) === false,
    "el dominio deja escribir sin permiso");
  assert(canMutate({ canManage: true, asOf: null }) === true,
    "el dominio no deja escribir cuando sí se puede");
});

// ===========================================================================
// L–P · Necesidades, expectativas, requisitos y procesos
// ===========================================================================

check("L–M. Necesidad y expectativa son opciones explícitas, con su explicación", () => {
  const s = fuente("requirements-section.tsx");
  assert(s.includes("AYUDA_TIPO"), "no se explica la diferencia entre los tres");
  for (const k of ["need", "expectation", "requirement"]) {
    assert(s.includes(`value={k}`) || s.includes(`"${k}"`), `falta la opción ${k}`);
  }
  assert(/todavía no obliga|Tampoco obliga/i.test(s),
    "no se dice que necesidades y expectativas no obligan");
});

check("N. Un requisito exige subtipo, y solo el requisito lo pide", () => {
  const s = fuente("requirements-section.tsx");
  assert(/entryKind === "requirement" \? \(/.test(s),
    "el subtipo se pide siempre, también para necesidades y expectativas");
  assert(/name="requirement_kind" required/.test(s), "el subtipo no es obligatorio");
});

check("O. Convertir pide confirmación y motivo, y dice que el origen se conserva", () => {
  const s = fuente("requirements-section.tsx");
  assert(s.includes("convertToRequirementAction"), "no se puede convertir");
  assert(/name="rationale" rows=\{2\} required/.test(s), "se puede convertir sin motivo");
  assert(/no desaparece|se conserva tal cual/.test(s),
    "no se dice que la entrada de origen se conserva");
  assert(s.includes("ConfirmDialog"), "convertir no pide confirmación");
});

check("P. Requisito → proceso se relaciona DENTRO del requisito", () => {
  const s = fuente("requirements-section.tsx");
  assert(s.includes("attachRequirementProcessAction"), "no se puede relacionar un proceso");
  assert(s.includes('name="link_kind"'), "no se elige el tipo de relación");
  assert(/desde \{l\.effectiveFrom\}/.test(s), "no se muestra desde cuándo rige el vínculo");
  assert(s.includes("Terminar vínculo"), "no se puede terminar el vínculo");
  assert(!/eliminar vínculo|borrar vínculo/i.test(s),
    "se ofrece borrar el vínculo en vez de cerrarlo");
});

// ===========================================================================
// Q–S · Estrategias
// ===========================================================================

check("Q–R. El alcance se elige y se guarda como VÍNCULOS, no como un id suelto", () => {
  const s = fuente("strategies-section.tsx");
  assert(s.includes('name="requirement_ids"'), "no hay selección múltiple de requisitos");
  assert(s.includes('type="checkbox"'), "la selección de requisitos no es múltiple");
  assert(!/name="requirement_id"\s+required[^>]*\/>\s*<\/label>\s*<\/fieldset>/.test(s),
    "la estrategia guarda un requisito único");
  assert(s.includes("strategyScope"), "el alcance no lo decide el dominio");
  // Y la regla, ejecutada.
  assert(strategyScope(0) === "general", "0 vínculos debía ser general");
  assert(strategyScope(1) === "specific", "1 vínculo debía ser específica");
  assert(strategyScope(3) === "multi", "3 vínculos debían ser multi-requisito");
});

check("S. El responsable de una estrategia es un CARGO", () => {
  const s = fuente("strategies-section.tsx");
  assert(s.includes('name="owner_position_id"'), "no se asigna cargo responsable");
  assert(/un cargo, no una persona/i.test(s), "no se explica por qué es un cargo");
  const codigo = sinComentarios(s);
  assert(!/name="owner_profile_id"|name="owner_name"|name="owner_person/i.test(codigo),
    "el responsable se puede asignar a una persona");
  assert(!/<input[^>]*name="owner[^"]*"[^>]*type="text"/i.test(codigo),
    "el responsable se puede escribir como texto libre");
});

check("S2. El seguimiento no presupone encuesta", () => {
  const s = fuente("strategies-section.tsx");
  assert(s.includes("MONITORING_METHODS"), "el vocabulario de seguimiento no es el del dominio");
  assert(/no tiene por qué ser una encuesta/i.test(s),
    "no se advierte de que el seguimiento no es necesariamente una encuesta");
  assert(/no se presume anual|No se presume anual/.test(s),
    "no se dice que la cadencia no se presume");
});

// ===========================================================================
// T–V · Seguimiento, referencias y revisiones
// ===========================================================================

check("T. Lo relacionado se dice en lenguaje de producto, nunca con nombres de columna", () => {
  const s = fuente("monitoring-section.tsx");
  assert(s.includes("PERIPHERAL_REF_LABEL"), "no se traduce el tipo de referencia");
  // `owner_kind` y `ref_kind` pueden aparecer como name= de un input oculto;
  // lo que no puede es aparecer como TEXTO para la persona.
  assert(!/>\s*(owner_kind|ref_kind)\s*</.test(s), "se enseña un nombre de columna en pantalla");
  // `${r.refKind}:${r.refId}` es la CLAVE del mapa de nombres, no texto
  // visible: se excluye antes de buscar.
  const visible = sinComentarios(s).replace(/`\$\{r\.refKind\}:\$\{r\.refId\}`/g, "CLAVE");
  assert(!/\{r\.refKind\}/.test(visible), "se pinta el identificador técnico del tipo");
  assert(!/\{r\.refId\}/.test(visible), "se pinta un UUID en pantalla");
  assert(s.includes("refLabels.get"), "las referencias no muestran el nombre de lo referenciado");
});

check("T2. Voz del cliente y Proveedores se ENLAZAN, no se copian", () => {
  const s = fuente("monitoring-section.tsx");
  assert(s.includes("/quality/customer-voice/customers/"), "no enlaza a Voz del cliente");
  assert(s.includes("/quality/suppliers/"), "no enlaza a Proveedores");
  assert(/no una copia|no se reproducen|los datos viven allí/i.test(s),
    "no se dice que el dato vive en el otro módulo");
});

check("U–V. La revisión sin cambios es una opción de primera clase", () => {
  const s = fuente("reviews-section.tsx");
  assert(/Revisado, sin cambios/.test(s), "no existe la opción «sin cambios»");
  assert(/Se requieren cambios/.test(s), "no existe la opción «se requieren cambios»");
  assert(/No se crea un análisis nuevo/i.test(s),
    "no se aclara que registrar «sin cambios» no fabrica un análisis");
  assert(/required=\{veredicto === "escalated"\}/.test(s),
    "se puede escalar sin decir qué se escala");
});

check("W. El estado de revisión lo calcula el dominio, no el componente", () => {
  const badges = fuente("badges.tsx");
  assert(badges.includes("REVIEW_STATE_LABEL"), "las etiquetas no vienen del dominio");
  const todo = componentes.map((c) => c.texto).join("\n");
  assert(!/next_review_on\s*<|nextReviewOn\s*<\s*(hoy|today)/.test(todo),
    "algún componente recalcula si una revisión está vencida");
  assert(!/setDate\(|getTime\(\)|Date\.now\(\)/.test(todo),
    "algún componente hace aritmética de fechas: eso es lógica de dominio");
});

// ===========================================================================
// X–Z · Modo histórico, categorías y permisos
// ===========================================================================

check("X. El modo histórico se anuncia y es de solo lectura", () => {
  const detalle = fuente("detail-view.tsx");
  assert(detalle.includes("historicalNotice"), "no se avisa de que se está mirando el pasado");
  assert(detalle.includes("HistoricalBadge"), "no se marca visualmente el estado histórico");
  assert(/role="status"/.test(detalle), "el aviso no se anuncia a un lector de pantalla");
  const historia = fuente("history-section.tsx");
  assert(historia.includes('name="fecha"'), "no hay selector de fecha");
  assert(!historia.includes("useActionState"),
    "la sección de historia tiene formularios que escriben");
});

check("Y. Una categoría se desactiva; NO se borra", () => {
  const s = fuente("categories-manager.tsx");
  assert(s.includes("setCategoryActiveAction"), "no se puede desactivar");
  assert(s.includes("Reactivar"), "no se puede reactivar");
  assert(!/deleteCategory|Eliminar categoría|borrar categoría/i.test(s),
    "se ofrece borrar una categoría");
  assert(s.includes("ConfirmDialog"), "desactivar no pide confirmación");
  assert(!ACC.includes("deleteCategoryAction"), "existe una acción de borrado de categorías");
  assert(s.includes("seedCategoriesAction"),
    "las categorías iniciales no se siembran: serían constantes del frontend");
});

check("Z. Los controles dependen de la CAPACIDAD, no de un rol escrito a mano", () => {
  for (const [n, s] of [["lista", LISTA], ["ficha", FICHA], ["categorías", CATS]] as const) {
    assert(s.includes("canManageInterestedParties("),
      `la página de ${n} no resuelve el permiso por capacidad`);
  }
  const todo = componentes.map((c) => c.texto).join("\n");
  for (const rol of ['"admin"', '"quality"', '"consultant"', "roleCode"]) {
    assert(!todo.includes(rol),
      `un componente compara contra ${rol}: eso acopla la interfaz a los roles de hoy`);
  }
  assert(fuente("parties-list.tsx").includes("canManage"),
    "la lista no distingue quién puede administrar");
});

// ===========================================================================
// AA–AC · Las tres reglas duras
// ===========================================================================

check("AA. Ningún componente escribe en la base por su cuenta", () => {
  for (const c of componentes) {
    assert(!/from "@\/lib\/supabase|createServerClient|createClient\(/.test(c.texto),
      `${c.nombre} crea un cliente de base de datos`);
    assert(!/from "@\/lib\/db\/[a-z-]+";[\s\S]{0,400}\b(insert|update|delete)\(/.test(c.texto),
      `${c.nombre} muta la base directamente`);
    const importaDb = /import\s+(type\s+)?\{[^}]*\}\s+from\s+"@\/lib\/db\//.exec(c.texto);
    if (importaDb) {
      assert(importaDb[1] === "type ",
        `${c.nombre} importa funciones de lib/db: la interfaz consume acciones, no consultas`);
    }
  }
});

check("AA2. Cada formulario de escritura declara sobre QUÉ escribe", () => {
  // Un formulario que no lleva el identificador de su dueño se pinta perfecto,
  // se envía perfecto y la acción lo rechaza. Pasó con el alta de entradas.
  const REQUERIDO: Record<string, string> = {
    "requirements-section.tsx": "assessment_id",
    "strategies-section.tsx": "assessment_id",
    "reviews-section.tsx": "assessment_id",
    "assessment-section.tsx": "assessment_id",
    "monitoring-section.tsx": "owner_id",
  };
  for (const [archivo, campo] of Object.entries(REQUERIDO)) {
    const src = fuente(archivo);
    assert(new RegExp(`type="hidden"[^>]*name="${campo}"`).test(src.replace(/\s+/g, " ")),
      `${archivo} tiene un formulario de escritura sin ${campo}`);
  }
});

check("AB. La interfaz NO ofrece las relaciones centrales como referencia genérica", () => {
  for (const par of CORE_RELATION_PAIRS) {
    assert(!(PERIPHERAL_REF_KINDS as readonly string[]).includes(par.refKind),
      `${par.refKind} está en el vocabulario periférico que ve la persona`);
  }
  const s = fuente("monitoring-section.tsx");
  assert(/name="owner_kind" value="stakeholder_assessment"/.test(s),
    "el propietario de la referencia no está fijado al análisis");
  assert(!/quality_stakeholder_requirement"|quality_process"/.test(s),
    "el selector ofrece un destino que es una relación central");
  assert(DOM.includes("CORE_RELATION_PAIRS"),
    "el dominio no declara las parejas prohibidas");
});

check("AC. En móvil hay tarjetas, no una tabla de siete columnas", () => {
  const lista = fuente("parties-list.tsx");
  assert(/md:hidden/.test(lista), "no hay lista condensada para móvil");
  assert(/hidden[\s\S]{0,40}md:block/.test(lista), "la tabla no se oculta en móvil");
  assert(/overflow-x-auto/.test(lista), "la tabla no puede desplazarse en anchuras intermedias");
  const detalle = fuente("detail-view.tsx");
  assert(/flex-wrap/.test(detalle), "la navegación de secciones no se ajusta en móvil");
});

// ===========================================================================
// Copy y accesibilidad
// ===========================================================================

check("AD. Sin promesas de cumplimiento ni afirmaciones de certificación", () => {
  const todo = [LISTA, FICHA, CATS, ...componentes.map((c) => c.texto)].join("\n");
  for (const prohibido of ["cumplimiento garantizado", "certificado ISO", "conforme a ISO",
                           "garantiza el cumplimiento", "cumple la norma"]) {
    assert(!new RegExp(prohibido, "i").test(todo), `la interfaz afirma «${prohibido}»`);
  }
  assert(!/\borganización\b/.test(todo.replace(/unidades organizativas/g, "")),
    "hay texto visible que dice «organización» en vez de «empresa»");
});

check("AE. Etiquetas reales, no placeholders haciendo de etiqueta", () => {
  for (const c of componentes) {
    const inputs = c.texto.match(/<input[^>]*>/g) ?? [];
    for (const i of inputs) {
      if (/type="(hidden|radio|checkbox|submit)"/.test(i)) continue;
      assert(!(/placeholder=/.test(i) && !/name=/.test(i)),
        `${c.nombre} tiene un campo con placeholder y sin nombre`);
    }
    const selects = c.texto.match(/<select[^>]*>/g) ?? [];
    for (const sel of selects) {
      assert(/name=/.test(sel), `${c.nombre} tiene un select sin nombre`);
    }
  }
  const lista = fuente("parties-list.tsx");
  assert(/<caption className="sr-only">/.test(lista), "la tabla no tiene título accesible");
  assert(/scope="col"/.test(lista), "las cabeceras de la tabla no declaran su alcance");
});

check("AF. La ayuda usa el patrón «i» existente y NO la infraestructura administrada", () => {
  assert(LISTA.includes("SectionHint"), "la pantalla no ofrece ayuda contextual");
  assert(DOM.includes("INTERESTED_PARTIES_HELP"), "el contenido de ayuda no vive en el dominio");
  assert(!LISTA.includes("authoring-guidance") && !LISTA.includes("resolveHintForViewer"),
    "se conectó la ayuda a la infraestructura de guías administradas de TrazaDocs");
  assert(/transversal posterior|sprint transversal/.test(DOM),
    "no queda escrito que el endurecimiento global de la ayuda viene después");
});

check("AG. B3A no trajo tutoriales, reglas de automatización ni llamadas a un proveedor", () => {
  const todo = [LISTA, FICHA, CATS, ACC, ...componentes.map((c) => c.texto)].join("\n");
  for (const prohibido of ["Ver video", "tutorial", "quality_automation_sources",
                           "openai", "OpenAI", "loadIntelligenceContext"]) {
    assert(!todo.includes(prohibido), `B3A incluye «${prohibido}», y está fuera de alcance`);
  }
});

console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
