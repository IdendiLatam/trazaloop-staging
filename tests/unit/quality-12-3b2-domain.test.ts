/**
 * Trazaloop · QUALITY-12.3B2 · La capa de dominio y la forma del código.
 *
 * Dos clases de comprobación, y las dos son estáticas a propósito:
 *
 *   · LO QUE CALCULA el dominio puro —vigencias, estados de revisión,
 *     prioridad— sin base de datos, porque no la necesita.
 *   · LO QUE EL CÓDIGO NO HACE. Que no haya UI, que no se use `service_role`,
 *     que las dos relaciones centrales no se hayan colado en
 *     `work_references`, que no exista una segunda arquitectura de servicios.
 *     Eso no se ve ejecutando: se ve leyendo, y por eso se lee aquí.
 *
 * Correr: npm run test:quality123b2-domain
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canManageInterestedParties, DOMAIN_ERRORS, effectiveOn, INTERESTED_PARTIES_MANAGER_ROLES,
  isEffectiveOn, nextReviewFrom, priorityView, relevanceFromPriority, reviewState,
  SUGGESTED_METHOD, today,
} from "../../lib/domain/quality-interested-parties";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");
const DB = leer("lib/db/quality-interested-parties.ts");
const DOM = leer("lib/domain/quality-interested-parties.ts");
const ACC = leer("server/actions/quality-interested-parties.ts");
const MIG = leer("supabase/migrations/0150_quality_interested_parties_integrations.sql");

console.log("\nQUALITY-12.3B2 · Dominio y forma del código\n");

// ===========================================================================
// A–F · La primitiva temporal
// ===========================================================================

check("A. effective_from inclusivo, effective_to EXCLUSIVO", () => {
  const fila = { effective_from: "2026-03-01", effective_to: "2026-06-30" };
  assert(isEffectiveOn(fila, "2026-03-01"), "el día de inicio debía contar");
  assert(isEffectiveOn(fila, "2026-06-29"), "la víspera del cierre debía contar");
  assert(!isEffectiveOn(fila, "2026-06-30"), "el día de cierre NO debía contar");
  assert(!isEffectiveOn(fila, "2026-02-28"), "antes de empezar no cuenta");
});

check("B. Una vigencia abierta cuenta desde su inicio y para siempre", () => {
  const fila = { effective_from: "2026-01-01", effective_to: null };
  assert(isEffectiveOn(fila, "2099-12-31"), "una vigencia abierta debía seguir vigente");
  assert(!isEffectiveOn(fila, "2025-12-31"), "no debía valer antes de empezar");
});

check("C. Sucesión sin solape y sin hueco: un solo vigente cada día", () => {
  const historia = [
    { effective_from: "2026-01-01", effective_to: "2026-06-30" },
    { effective_from: "2026-06-30", effective_to: null },
  ];
  for (const dia of ["2026-01-01", "2026-06-29", "2026-06-30", "2026-12-31"]) {
    const vigentes = effectiveOn(historia, dia);
    assert(vigentes.length === 1, `el ${dia} había ${vigentes.length} vigentes, debía haber 1`);
  }
});

check("D. reviewState distingue nunca revisado de al día", () => {
  const nunca = reviewState({ lastReviewedOn: null, nextReviewOn: null,
    cadenceMonths: null, onDate: "2026-08-29" });
  assert(nunca === "never_reviewed", `esperaba never_reviewed, dio ${nunca}`);
  const alDia = reviewState({ lastReviewedOn: "2026-08-01", nextReviewOn: "2026-11-01",
    cadenceMonths: 3, onDate: "2026-08-29" });
  assert(alDia === "up_to_date", `esperaba up_to_date, dio ${alDia}`);
  // Y sin cadencia ni fecha prevista NO se acusa de vencido a nadie.
  const sinCadencia = reviewState({ lastReviewedOn: "2020-01-01", nextReviewOn: null,
    cadenceMonths: null, onDate: "2026-08-29" });
  assert(sinCadencia === "up_to_date",
    `sin cadencia no se declara vencido, dio ${sinCadencia}`);
  const vencida = reviewState({ lastReviewedOn: "2026-01-01", nextReviewOn: "2026-04-01",
    cadenceMonths: 3, onDate: "2026-08-29" });
  assert(vencida === "overdue", `esperaba overdue, dio ${vencida}`);
});

check("E. nextReviewFrom respeta la cadencia y no inventa sin ella", () => {
  assert(nextReviewFrom("2026-08-29", null) === null, "sin cadencia no hay próxima fecha");
  const seis = nextReviewFrom("2026-08-29", 6);
  assert(seis === "2027-02-28" || seis === "2027-03-01",
    `seis meses desde 2026-08-29 dio ${seis}`);
});

check("F. today() devuelve una fecha ISO de diez caracteres", () => {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(today()), `today() dio ${today()}`);
});

// ===========================================================================
// G–I · Prioridad y pertinencia son dos preguntas
// ===========================================================================

check("G. La prioridad NO deriva la pertinencia: la función lanza", () => {
  let lanzo = false;
  try { relevanceFromPriority(); } catch { lanzo = true; }
  assert(lanzo, "relevanceFromPriority debía lanzar: son dos preguntas distintas");
});

check("H. La metodología sugerida es influencia × impacto, y es solo sugerencia", () => {
  assert(SUGGESTED_METHOD.code === "influence_x_impact", "cambió el código sugerido");
  assert(/sugerid|sugerencia/i.test(DOM),
    "el dominio debía decir que la metodología es sugerida, no obligatoria");
  assert(/no es obligatoria|puede cambiarla|no usar ninguna/i.test(DOM),
    "el dominio debía decir explícitamente que la plantilla no obliga");
});

check("I. Un número sin metodología no se enseña", () => {
  // La base ya lo impide; esto es la segunda barrera. Un 9 suelto en pantalla
  // no lo puede defender nadie en una auditoría.
  const v = priorityView({ priorityLabel: "high", priorityScore: 9, priorityMethodNote: null });
  assert(v.kind === "none", `una puntuación sin método debía degradarse, dio ${v.kind}`);
  const w = priorityView({ priorityLabel: "high", priorityScore: 9,
    priorityMethodNote: "influencia 3 × impacto 3" });
  assert(w.kind === "scored", `con método debía puntuar, dio ${w.kind}`);
  assert(w.kind === "scored" && w.text.includes("influencia"),
    "la puntuación debe presentarse SIEMPRE junto a su metodología");
});

// ===========================================================================
// J–L · Permisos
// ===========================================================================

check("J. El guardián de rol es espejo EXACTO del de la base", () => {
  const sql = leer("supabase/migrations/0149_quality_interested_parties_core.sql");
  const m = sql.match(/has_org_role\(p_organization_id, array\[([^\]]+)\]\)/);
  assert(m, "no se encontró la lista de roles en 0149");
  const enSql = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  const enTs = [...INTERESTED_PARTIES_MANAGER_ROLES].sort();
  assert(JSON.stringify(enSql) === JSON.stringify(enTs),
    `la base concede ${enSql.join(",")} y el dominio ${enTs.join(",")}`);
});

check("K. canManageInterestedParties niega lo que no conoce", () => {
  assert(canManageInterestedParties("quality"), "quality debía poder");
  assert(!canManageInterestedParties("operator"), "operator no debía poder");
  assert(!canManageInterestedParties(null), "sin rol no se puede");
});

check("L. Cada acción de servidor pasa por la puerta antes de escribir", () => {
  const funciones = [...ACC.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
  assert(funciones.length >= 15, `esperaba al menos 15 acciones, hay ${funciones.length}`);
  for (const f of funciones) {
    const cuerpo = ACC.slice(ACC.indexOf(`export async function ${f}(`));
    const hasta = cuerpo.indexOf("\n}\n");
    assert(cuerpo.slice(0, hasta).includes("await gate()"), `${f} no llama a gate()`);
  }
});

// ===========================================================================
// M–R · Lo que el código NO hace
// ===========================================================================

check("M. Ninguna capa nueva usa service_role", () => {
  // Se miran los comentarios aparte: el encabezado de lib/db DICE que nunca se
  // usa, y esa frase no puede hacer fallar a la prueba que comprueba lo mismo.
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [n, src] of [["db", DB], ["dominio", DOM], ["acciones", ACC]] as const) {
    assert(!/service_role|SERVICE_ROLE/.test(sinComentarios(src)),
      `${n} usa service_role fuera de un comentario`);
    assert(!/createClient\s*\(/.test(sinComentarios(src)),
      `${n} crea su propio cliente: debe operar con la sesión`);
  }
});

check("N. La capa de datos es server-only y el dominio NO", () => {
  assert(DB.startsWith('import "server-only";'), "lib/db debía ser server-only");
  assert(!DOM.includes('import "server-only"'),
    "el dominio no debe ser server-only: lo comparten pantalla y servidor");
});

check("O. Las tres capas de B2 no saben que existe una pantalla", () => {
  // ESTA COMPROBACIÓN CAMBIÓ EN B3A, Y CONVIENE DECIR POR QUÉ.
  //
  // En B2 decía «no existe ninguna página de partes interesadas», y era la
  // comprobación correcta entonces: el encargo prohibía construir interfaz y
  // eso había que poder demostrarlo. B3A construyó la interfaz a propósito, así
  // que aquella forma caducó: mantenerla obligaría a borrar la pantalla para
  // que la prueba pasara, que es el termómetro mandando sobre el enfermo.
  //
  // Lo que NO caduca es la separación que protegía: la capa de datos y las
  // acciones no importan React ni componentes, y por tanto siguen siendo
  // utilizables sin pantalla —desde una prueba, desde un constructor de
  // Revisión por la Dirección, desde lo que venga—.
  for (const [n, src] of [["db", DB], ["dominio", DOM], ["acciones", ACC]] as const) {
    assert(!/from "react"|from "@\/components\//.test(src),
      `${n} importa React o un componente: la capa de aplicación no debe saber de pantallas`);
    assert(!/\.tsx"/.test(src), `${n} importa un archivo .tsx`);
  }
  // Y el dominio sigue siendo compartible: si fuera server-only, la pantalla
  // no podría usar sus etiquetas y acabaría copiándolas.
  assert(!DOM.includes('import "server-only"'), "el dominio se volvió server-only");
});

check("P. Las dos relaciones centrales NO viven en work_references", () => {
  // Requisito→proceso y estrategia→requisito tienen tabla propia porque tienen
  // vigencia. Si alguien las moviera a work_references, se perdería el «desde
  // cuándo», que es justo lo que pregunta una auditoría.
  const refKinds = MIG.slice(MIG.indexOf("work_references_ref_kind_check"));
  const bloque = refKinds.slice(0, refKinds.indexOf(";"));
  assert(!bloque.includes("quality_stakeholder_requirement_process"),
    "requisito→proceso apareció como tipo de work_references");
  assert(!bloque.includes("quality_stakeholder_strategy_requirement"),
    "estrategia→requisito apareció como tipo de work_references");
  assert(DB.includes("quality_stakeholder_requirement_processes")
    && DB.includes("quality_stakeholder_strategy_requirements"),
    "las dos relaciones deben resolverse contra sus tablas propias");
});

check("Q. No hay una segunda arquitectura de servicios", () => {
  assert(ACC.includes("requireQualityForAction") && ACC.includes("checkQualityCanMutate"),
    "las acciones deben usar la misma puerta que el resto de Quality");
  for (const dir of ["server/services", "lib/services", "lib/application"]) {
    assert(!existsSync(join(raiz, dir)), `apareció ${dir}: eso es una arquitectura paralela`);
  }
});

check("R. Ninguna lectura sin paginar ni tope", () => {
  // Toda consulta que pueda crecer lleva `range`, `limit` o `readAllStrict`.
  // Sin eso PostgREST corta en 1 000 filas sin decirlo.
  const listas = [...DB.matchAll(/export async function (list\w+|search\w+|load\w+)\(/g)]
    .map((m) => m[1]);
  assert(listas.length >= 6, `esperaba al menos 6 lectores, hay ${listas.length}`);
  for (const f of listas) {
    const desde = DB.indexOf(`export async function ${f}(`);
    const cuerpo = DB.slice(desde, DB.indexOf("\n}\n", desde));
    const acotada = /\.range\(|\.limit\(|readAllStrict|count: "exact", head: true/.test(cuerpo);
    assert(acotada, `${f} lee sin acotar: PostgREST cortaría en 1 000 filas en silencio`);
  }
});

// ===========================================================================
// S–T · El vocabulario de fallos
// ===========================================================================

check("S. Todos los códigos de fallo tienen texto para una persona", () => {
  for (const [code, texto] of Object.entries(DOMAIN_ERRORS)) {
    assert(typeof texto === "string" && texto.length > 15, `${code} sin mensaje utilizable`);
    assert(!/[A-Z_]{6,}|error:|violates/.test(texto), `${code} filtra jerga de SQL: ${texto}`);
  }
});

check("T. La capa de datos nunca devuelve el mensaje crudo de PostgreSQL", () => {
  assert(!/error\.message/.test(DB),
    "lib/db devuelve error.message en algún sitio: eso lleva SQL a la pantalla");
  assert(DB.includes("mapDbError"), "lib/db debe traducir los fallos por mapDbError");
});

console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
