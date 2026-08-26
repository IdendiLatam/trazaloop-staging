/**
 * Trazaloop · EXPORT-01.1 · Cobertura universal completa.
 *
 * EXPORT-01 construyó el motor. Este sprint cierra la promesa: todo objeto de
 * negocio administrado por Trazaloop que tenga sentido documental se puede
 * descargar en PDF.
 *
 * La comprobación que da nombre al sprint es una sola: NO PUEDE QUEDAR NINGUNA
 * ENTIDAD EN ESTADO PENDIENTE. Todo lo demás existe para que esa afirmación no
 * se pueda hacer en falso —clasificando algo como «no aplica» sin motivo, o
 * declarando una ficha que nadie implementó—.
 *
 * Se lee el inventario COMO DATO (`lib/export/inventory.ts`), no como prosa.
 * Un markdown no falla: se queda atrás en silencio.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPORT_INVENTORY, inventoryCounts, promisedKeys, type AxisState,
} from "../../lib/export/inventory";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ---------------------------------------------------------------------------
// Claves reales del registro, leídas estáticamente.
// ---------------------------------------------------------------------------
const ADAPTER_DIR = "lib/export/adapters";
const ADAPTERS = readdirSync(join(ROOT, ADAPTER_DIR))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: `${ADAPTER_DIR}/${f}`, source: read(`${ADAPTER_DIR}/${f}`) }));

const KEY_SHAPE = /"([a-z0-9-]+\.[a-z0-9-]+\.(?:detail|list|historical))"/g;

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const REGISTERED = new Set<string>();
for (const a of ADAPTERS) {
  for (const m of stripComments(a.source).matchAll(KEY_SHAPE)) REGISTERED.add(m[1]);
}

const REGISTRY_SOURCE = read("lib/export/registry.ts");

console.log("\nEXPORT-01.1 · cobertura universal: 0 pendientes\n");

// ---------------------------------------------------------------------------
console.log("A · El inventario no admite pendientes");

check("A1. NINGUNA fila queda en un estado provisional", () => {
  // Es la comprobación que define el sprint. Los cuatro estados finales son
  // afirmaciones: «se descarga», «va dentro de su padre», «no es documentable»
  // y «no hay histórico veraz». «Pendiente» no es una afirmación, es una deuda.
  const PROHIBIDOS = ["PENDING", "TODO", "LATER", "MECHANICAL", "NOT_IMPLEMENTED", "UNRESOLVED"];
  const source = read("lib/export/inventory.ts");
  const code = stripComments(source);
  for (const p of PROHIBIDOS) {
    assert(
      !new RegExp(`state:\\s*"${p}"`).test(code),
      `el inventario declara un estado provisional: ${p}`
    );
  }
  for (const row of EXPORT_INVENTORY) {
    for (const [axisName, axis] of Object.entries({
      ficha: row.detail, listado: row.list, histórico: row.historical,
    }) as [string, AxisState][]) {
      assert(
        ["AVAILABLE", "EMBEDDED", "NOT_APPLICABLE", "HISTORICAL_NOT_SUPPORTED"].includes(axis.state),
        `«${row.entity}» tiene un ${axisName} en estado desconocido: ${axis.state}`
      );
    }
  }
});

check("A2. toda ficha declarada AVAILABLE tiene definición en el registro", () => {
  for (const row of EXPORT_INVENTORY) {
    if (row.detail.state !== "AVAILABLE") continue;
    assert(
      REGISTERED.has(row.detail.key),
      `«${row.entity}» promete la ficha ${row.detail.key} y no existe`
    );
  }
});

check("A3. todo listado declarado AVAILABLE tiene definición en el registro", () => {
  for (const row of EXPORT_INVENTORY) {
    if (row.list.state !== "AVAILABLE") continue;
    assert(
      REGISTERED.has(row.list.key),
      `«${row.entity}» promete el listado ${row.list.key} y no existe`
    );
  }
});

check("A4. todo histórico declarado AVAILABLE tiene definición en el registro", () => {
  for (const row of EXPORT_INVENTORY) {
    if (row.historical.state !== "AVAILABLE") continue;
    assert(
      REGISTERED.has(row.historical.key),
      `«${row.entity}» promete el histórico ${row.historical.key} y no existe`
    );
  }
});

check("A5. toda exportación del registro está clasificada en el inventario", () => {
  // La dirección contraria: si alguien añade una clave y no la clasifica, el
  // inventario deja de ser el inventario.
  const promised = new Set(promisedKeys());
  const huerfanas = [...REGISTERED].filter((k) => !promised.has(k));
  assert(
    huerfanas.length === 0,
    `hay exportaciones sin clasificar en el inventario: ${huerfanas.join(", ")}`
  );
});

check("A6. NOT_APPLICABLE siempre trae un motivo real", () => {
  // §34 · «No alcanzó el tiempo» no es una razón arquitectónica. Un motivo de
  // menos de 25 caracteres no puede explicar por qué algo no es documentable.
  const VACIAS = /no alcanz|falta tiempo|pendiente|más adelante|por ahora no/i;
  for (const row of EXPORT_INVENTORY) {
    for (const axis of [row.detail, row.list, row.historical]) {
      if (axis.state !== "NOT_APPLICABLE") continue;
      assert(axis.reason.length >= 25, `«${row.entity}»: motivo demasiado corto para ser un motivo`);
      assert(!VACIAS.test(axis.reason), `«${row.entity}»: eso no es una razón arquitectónica`);
    }
  }
});

check("A7. EMBEDDED siempre nombra a su padre, y el padre existe", () => {
  const entidades = new Set(EXPORT_INVENTORY.map((r) => r.entity));
  // Los padres pueden nombrarse por su entidad o por el título de un listado
  // que sí está en el inventario; ambos se resuelven contra las filas reales.
  const plurales = new Set([
    "Evidencias", "Requisitos de cliente", "Colecciones", "Fibras", "Materiales textiles",
    "Componentes", "Procesos textiles", "Procesos tercerizados", "Proveedores textiles",
    "Cierres de periodo", "Evidencias textiles",
  ]);
  for (const row of EXPORT_INVENTORY) {
    for (const axis of [row.detail, row.list, row.historical]) {
      if (axis.state !== "EMBEDDED") continue;
      assert(axis.parent.length > 0, `«${row.entity}»: EMBEDDED sin padre`);
      assert(axis.reason.length >= 25, `«${row.entity}»: EMBEDDED sin motivo suficiente`);
      assert(
        entidades.has(axis.parent) || plurales.has(axis.parent),
        `«${row.entity}»: el padre «${axis.parent}» no está en el inventario`
      );
    }
  }
});

check("A8. HISTORICAL_NOT_SUPPORTED nunca se usa para evitar el PDF actual", () => {
  // §35 · Es la trampa evidente: clasificar algo como «sin histórico» y no
  // implementar nada. Si una entidad no puede reconstruir su pasado, su ficha
  // ACTUAL tiene que existir igualmente.
  for (const row of EXPORT_INVENTORY) {
    if (row.historical.state !== "HISTORICAL_NOT_SUPPORTED") continue;
    assert(
      row.historical.reason.length >= 40,
      `«${row.entity}»: un límite histórico exige explicar QUÉ no guarda el dominio`
    );
    const tieneAlgo =
      row.detail.state === "AVAILABLE" ||
      row.list.state === "AVAILABLE" ||
      row.detail.state === "EMBEDDED" ||
      row.list.state === "EMBEDDED";
    assert(
      tieneAlgo,
      `«${row.entity}» se declara sin histórico y tampoco tiene PDF actual: eso es una deuda disfrazada`
    );
  }
});

// ---------------------------------------------------------------------------
console.log("\nB · Las definiciones nuevas declaran qué afirman sobre el tiempo");

check("B1. una definición marcada `current` explica por qué no hay histórico", () => {
  for (const a of ADAPTERS) {
    const code = stripComments(a.source);
    for (const m of code.matchAll(/temporality:\s*"current"/g)) {
      const after = code.slice(m.index ?? 0, (m.index ?? 0) + 900);
      const before = code.slice(Math.max(0, (m.index ?? 0) - 900), m.index ?? 0);
      assert(
        /historicalLimitReason/.test(after) || /historicalLimitReason/.test(before),
        `${a.file}: una exportación «actual» sin motivo declarado`
      );
    }
  }
});

check("B2. ninguna definición `historical` finge un pasado que no guarda", () => {
  // Una exportación histórica NO puede llevar la nota de estado actual: sería
  // decir las dos cosas a la vez.
  const HIST = /temporality:\s*"historical"/;
  for (const a of ADAPTERS) {
    const code = stripComments(a.source);
    for (const block of code.split(/export const \w+/).slice(1)) {
      if (!HIST.test(block)) continue;
      const cuerpo = block.slice(0, block.indexOf("\n};") + 3 || block.length);
      assert(
        !/currentStateNote\(/.test(cuerpo),
        `${a.file}: una exportación histórica lleva el aviso de estado actual`
      );
    }
  }
});

check("B3. el aviso de estado actual existe y NO es alarmista", () => {
  const src = read("lib/export/print-model.ts");
  assert(/CURRENT_STATE_TITLE/.test(src), "no existe el aviso de estado actual");
  assert(
    /Representación del estado actual/.test(src),
    "el aviso no usa el texto acordado"
  );
  const ALARMISTA = /no confiar|no válido|no sirve|cuidado|advertencia grave/i;
  assert(!ALARMISTA.test(src), "el aviso de estado actual está redactado en tono alarmista");
});

// ---------------------------------------------------------------------------
console.log("\nC · Lo que EXPORT-01 dejó abierto");

check("C1. la acción tiene ficha propia y es TRANSVERSAL", () => {
  const src = read("lib/export/adapters/quality-work.ts");
  assert(/key: "quality\.action\.detail"/.test(src), "la acción no tiene ficha propia");
  // Una sola definición para acciones de caso y de riesgo: §47.
  const claves = [...stripComments(src).matchAll(/"quality\.action\.detail"/g)];
  assert(claves.length === 1, "hay más de una definición de acción: la transversalidad se perdió");
  assert(
    /listActionContexts/.test(src),
    "la ficha de la acción no lee su contexto: sería una copia de su padre"
  );
});

check("C2. la acción muestra la prórroga en vez de esconderla", () => {
  const src = read("lib/export/adapters/quality-work.ts");
  assert(/originalDueOn/.test(src) && /prorrogada/.test(src),
    "la ficha de la acción no distingue la fecha objetivo original de la vigente");
});

check("C3. el control tiene ficha propia y NO se confunde con una acción", () => {
  const src = read("lib/export/adapters/quality-work.ts");
  assert(/key: "quality\.control\.detail"/.test(src), "el control no tiene ficha propia");
  assert(
    /barrera permanente|no tiene fecha de cierre/.test(src),
    "el PDF del control no explica en qué se diferencia de una acción de tratamiento"
  );
});

check("C4. la ficha de empresa no filtra lo que no debe", () => {
  const src = read("lib/export/adapters/core.ts");
  const bloque = src.slice(src.indexOf("coreCompanyDetail"), src.indexOf("coreTeamList"));
  for (const prohibido of ["billing", "stripe", "password", "token", "secret", "hash"]) {
    assert(
      !new RegExp(prohibido, "i").test(bloque),
      `la ficha de empresa toca «${prohibido}»`
    );
  }
});

check("C5. el equipo se exporta sin el token de invitación", () => {
  const src = read("lib/export/adapters/core.ts");
  const bloque = src.slice(src.indexOf("coreTeamList"), src.indexOf("coreSupportTicketDetail"));
  assert(!/i\.token|\.token\b/.test(bloque),
    "el listado de equipo imprime el token de invitación: es una credencial de un solo uso");
});

check("C6. TrazaDocs usa el MISMO motor en los tres módulos", () => {
  const src = read("lib/export/adapters/quality-documents.ts");
  assert(/function documentDetail\(/.test(src), "no hay una definición parametrizada por módulo");
  for (const key of ["quality.document.detail", "trazadocs.document.detail", "textiles.document.detail"]) {
    assert(src.includes(key), `falta ${key}`);
  }
  // Y no existe un renderizador paralelo por módulo.
  for (const a of ADAPTERS) {
    assert(
      !/function\s+(pcr|textile)DocumentPdf/i.test(a.source),
      `${a.file}: hay un renderizador documental paralelo`
    );
  }
});

check("C7. los maestros de TrazaDocs filtran con los nombres de la pantalla", () => {
  // La lección directa del defecto que EXPORT-01 encontró: nombres propios de
  // filtro hacen que el usuario filtre, descargue y reciba la lista completa.
  const src = read("lib/export/adapters/trazadocs.ts");
  for (const nombre of ["q", "category", "status", "type"]) {
    assert(
      new RegExp(`key: "${nombre}"`).test(src),
      `el maestro no declara el filtro «${nombre}» que usa la pantalla`
    );
  }
  assert(/filterDocumentMaster/.test(src),
    "el maestro no usa la misma función de filtrado que la pantalla");
  const pantalla = read("server/actions/trazadocs-master.ts");
  assert(/filterDocumentMaster/.test(pantalla),
    "la pantalla dejó de usar la función compartida: los dos conjuntos pueden divergir");
});

// ---------------------------------------------------------------------------
console.log("\nD · Ningún atajo nuevo en seguridad");

check("D1. todas las exportaciones nuevas pasan por el endpoint único", () => {
  const rutas = readdirSync(join(ROOT, "app/(app)/(shell)"), { recursive: true }) as string[];
  const nuevas = rutas.filter(
    (f) => typeof f === "string" && f.endsWith("route.ts") && /pdf|export|download/i.test(f)
  );
  // Solo se aceptan: el endpoint único y los dos artefactos documentales
  // heredados, que ya existían y siguen enlazados por compatibilidad.
  const PERMITIDAS = [
    "export/[key]/route.ts",
    "quality/documents/[documentId]/pdf/route.ts",
    "quality/documents/master/pdf/route.ts",
  ];
  for (const r of nuevas) {
    assert(
      PERMITIDAS.some((p) => r.endsWith(p)),
      `hay una ruta de descarga fuera del endpoint único: ${r}`
    );
  }
});

check("D2. ningún adaptador nuevo usa la clave de servicio", () => {
  for (const a of ADAPTERS) {
    assert(
      !/createAdminClient|SUPABASE_SECRET_KEY|service_role/.test(stripComments(a.source)),
      `${a.file}: un adaptador no puede saltarse la RLS`
    );
  }
});

check("D3. ningún adaptador acepta la empresa desde la petición", () => {
  for (const a of ADAPTERS) {
    const code = stripComments(a.source);
    assert(
      !/req\.filters\.organization|req\.filters\["organization/.test(code),
      `${a.file}: la empresa tiene que salir de la sesión`
    );
  }
});

check("D4. el endpoint sigue exigiendo entitlement por módulo, incluido `core`", () => {
  const src = read("app/(app)/(shell)/export/[key]/route.ts");
  assert(/resolveModuleAccessForOrg/.test(src), "no se comprueba el entitlement");
  assert(/core: null/.test(src),
    "el módulo transversal debe declarar explícitamente que no exige entitlement de módulo");
  assert(/requireActiveOrg/.test(src) && /requireSession/.test(src),
    "el endpoint dejó de exigir sesión y empresa activa");
});

// ---------------------------------------------------------------------------
console.log("\nE · Recuento");

check("E1. el inventario cubre las entidades de los cuatro módulos", () => {
  const modulos = new Set(EXPORT_INVENTORY.map((r) => r.module));
  for (const m of ["quality", "trazadocs", "cpr", "textiles", "core"]) {
    assert(modulos.has(m as never), `el inventario no clasifica nada de ${m}`);
  }
});

check("E2. EXPORTABLE_PENDING = 0", () => {
  const counts = inventoryCounts();
  const total = EXPORT_INVENTORY.length * 3;
  const suma = counts.AVAILABLE + counts.EMBEDDED + counts.NOT_APPLICABLE + counts.HISTORICAL_NOT_SUPPORTED;
  assert(suma === total, `hay ejes sin estado final: ${total - suma}`);
  console.log(
    `      ${EXPORT_INVENTORY.length} entidades · ${counts.AVAILABLE} descargables · ` +
    `${counts.EMBEDDED} embebidas · ${counts.NOT_APPLICABLE} no documentables · ` +
    `${counts.HISTORICAL_NOT_SUPPORTED} sin histórico veraz`
  );
});

check("E3. el registro declara TODAS las claves que el inventario promete", () => {
  const faltan = promisedKeys().filter((k) => !REGISTRY_SOURCE.includes(k.split(".")[0]));
  assert(faltan.length === 0, `claves prometidas sin módulo en el registro: ${faltan.join(", ")}`);
});

// ---------------------------------------------------------------------------
console.log("\nG · Un embebido mal nombrado devuelve vacío, no un error");

check("G1. las relaciones COMPUESTAS se embeben por el nombre de la restricción", () => {
  // Encontrado ejecutando esta validación contra Staging: PostgREST no resuelve
  // una clave foránea compuesta (MDR-42) por el nombre de la columna. Responde
  // «Could not find a relationship», el error viaja en `error` y no en `data`,
  // y la consulta devuelve [] SIN DECIR NADA. La tabla de acciones del caso
  // salía vacía en pantalla y en el PDF, como si el caso no tuviera acciones.
  const src = read("lib/db/work-cases.ts");
  assert(
    !/quality_positions:owner_position_id\(/.test(src),
    "el embebido del cargo vuelve a nombrarse por la columna: devolverá vacío en silencio"
  );
  assert(
    /quality_positions!work_actions_owner_position_fk\(/.test(src),
    "el embebido del cargo debe nombrar la restricción compuesta"
  );
  assert(
    !/trazadoc_documents:document_id\(/.test(src),
    "el embebido del documento vuelve a nombrarse por la columna"
  );
  assert(
    /trazadoc_documents!work_case_requirements_doc_fk\(/.test(src),
    "el embebido del documento debe nombrar la restricción compuesta"
  );
});

check("G2. ningún embebido nuevo por columna entra sin pensarlo", () => {
  // Los embebidos por COLUMNA solo son válidos cuando la clave foránea es
  // simple. La lista blanca obliga a comprobarlo al añadir uno nuevo, en vez
  // de descubrirlo cuando una pantalla aparezca vacía.
  const PERMITIDOS = new Set(["requirements:requirement_id", "frameworks:framework_id"]);
  const dir = "lib/db";
  for (const f of readdirSync(join(ROOT, dir))) {
    if (!f.endsWith(".ts")) continue;
    const src = stripComments(read(`${dir}/${f}`));
    for (const m of src.matchAll(/([a-z_]+):([a-z_]+_id)\(/g)) {
      const hint = `${m[1]}:${m[2]}`;
      assert(
        PERMITIDOS.has(hint),
        `${dir}/${f}: embebido por columna «${hint}». Si la clave foránea es COMPUESTA devolverá vacío en silencio: nómbrala por la restricción, o añádela a la lista blanca si de verdad es simple.`
      );
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\nF · Los documentos siguen al dato");

check("F1. la matriz publicada nombra TODAS las entidades del inventario", () => {
  const doc = read("docs/export/export-01-1/EXPORT_01_1_COVERAGE_MATRIX.md");
  const faltan = EXPORT_INVENTORY.filter((r) => !doc.includes(r.entity)).map((r) => r.entity);
  assert(faltan.length === 0, `la matriz no menciona: ${faltan.join(", ")}`);
});

check("F2. la matriz publicada nombra TODAS las claves", () => {
  const doc = read("docs/export/export-01-1/EXPORT_01_1_COVERAGE_MATRIX.md");
  const faltan = promisedKeys().filter((k) => !doc.includes(k));
  assert(faltan.length === 0, `la matriz no menciona: ${faltan.join(", ")}`);
});

check("F3. el recuento publicado concuerda con el dato", () => {
  const doc = read("docs/export/export-01-1/EXPORT_01_1_COVERAGE_MATRIX.md");
  const counts = inventoryCounts();
  const pares: [string, number][] = [
    ["Entidades clasificadas", EXPORT_INVENTORY.length],
    ["`AVAILABLE`", counts.AVAILABLE],
    ["`EMBEDDED`", counts.EMBEDDED],
    ["`NOT_APPLICABLE`", counts.NOT_APPLICABLE],
    ["`HISTORICAL_NOT_SUPPORTED`", counts.HISTORICAL_NOT_SUPPORTED],
  ];
  for (const [etiqueta, valor] of pares) {
    assert(
      doc.includes(`| ${etiqueta} | **${valor}** |`),
      `el documento no dice «${etiqueta} = ${valor}»: se quedó atrás`
    );
  }
  assert(doc.includes("| **`PENDING`** | **0** |"), "el documento no declara 0 pendientes");
});

check("F4. el inventario de EXPORT-01 quedó sincronizado", () => {
  const doc = read("docs/export/export-01/EXPORT_01_INVENTORY.md");
  const m = /Exportadores en el registro \| \*\*(\d+)\*\*/.exec(doc);
  assert(m, "el inventario de EXPORT-01 no declara cuántos exportadores hay");
  assert(
    Number(m[1]) === promisedKeys().length,
    `dice ${m[1]} y el registro tiene ${promisedKeys().length}`
  );
  assert(
    /Clasificadas y pendientes de adaptador \| \*\*0\*\*/.test(doc),
    "el inventario de EXPORT-01 sigue declarando pendientes"
  );
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
