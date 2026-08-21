/**
 * Trazaloop Quality · QUALITY-01.2 · Pruebas puras y estáticas.
 *
 *   A · Invitaciones: el destino tras aceptar es NEUTRO, nunca PCR.
 *   D · Mapa: la disposición y las flechas se calculan sin navegador.
 *   E · Documentos de Quality: la causa del «This page couldn't load».
 *   F · Auditoría de listas de módulos escritas a mano, con invariantes que
 *       impiden que vuelvan a aparecer.
 *   M · Convenciones de la migración 0114.
 *
 * Correr: npm run test:quality012
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SHELL_MODULES,
  SHELL_MODULE_KEYS,
  getShellModule,
  shellModuleName,
  trazadocDocumentHref,
} from "../../lib/modules/registry";
import { COMMERCIAL_MODULES } from "../../lib/modules/catalog";
import {
  MODULE_SELECTOR_PATH,
  resolveAcceptInviteDestination,
} from "../../lib/domain/team";
import {
  computeQualityMapLayout,
  describeEdge,
  shouldShowAllEdgeLabels,
  EDGE_LABEL_LIMIT,
} from "../../lib/domain/quality-map-layout";
import { splitInteractions } from "../../lib/domain/quality-processes";
import {
  QUALITY_DOCUMENT_CATEGORIES,
  isQualityDocumentCategory,
  qualityDocumentCategoryLabel,
} from "../../lib/domain/quality-documents";
import { TRAZADOC_MODULE_KEYS, isTrazadocDocumentModule } from "../../lib/domain/trazadocs";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0114_quality_relations_io_documents_and_map_edges.sql";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

/** Todos los .ts/.tsx del código ejecutable (sin node_modules, sin pruebas). */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry)) out.push(rel);
    }
  };
  for (const dir of ["app", "components", "lib", "server"]) walk(dir);
  return out;
}

const SOURCES = sourceFiles();
const firstLines = (src: string) => src.split("\n").slice(0, 5).join("\n");

/** Comentarios y literales de cadena fuera: las llaves que llevan dentro no
 *  son estructura del programa y falsearían el conteo. */
function stripCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

const BLOCK_KEYWORDS = new Set(["if", "else", "for", "while", "switch", "try", "catch", "finally", "do"]);

/**
 * ¿Cuántas funciones envuelven a la posición `index`?
 *
 * Se recorre el archivo llevando una pila de llaves y anotando cuáles abren el
 * cuerpo de una FUNCIÓN (una flecha, una declaración o un método) y cuáles son
 * un simple bloque (`if`, `for`, `try`…). El resultado distingue lo que se
 * ejecuta durante el render de lo que se ejecuta después.
 */
function functionDepthAt(source: string, index: number): number {
  const stack: boolean[] = [];
  for (let i = 0; i < index; i += 1) {
    const c = source[i];
    if (c === "{") {
      stack.push(opensFunctionBody(source, i));
    } else if (c === "}") {
      stack.pop();
    }
  }
  return stack.filter(Boolean).length;
}

function opensFunctionBody(source: string, braceIndex: number): boolean {
  const before = source.slice(0, braceIndex).trimEnd();
  if (before.endsWith("=>")) return true;
  if (!before.endsWith(")")) return false;

  // Retroceder hasta el paréntesis que abre la lista de argumentos y mirar qué
  // palabra lo precede: `if (…) {` es un bloque; `foo(…) {` es una función.
  let depth = 0;
  let i = before.length - 1;
  for (; i >= 0; i -= 1) {
    if (before[i] === ")") depth += 1;
    else if (before[i] === "(") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (i < 0) return false;
  const head = before.slice(0, i).trimEnd();
  const word = head.match(/([A-Za-z0-9_$]+)$/)?.[1] ?? "";
  return !BLOCK_KEYWORDS.has(word);
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nA · Invitaciones: el destino tras aceptar es NEUTRO\n");

const ANY_MODULE_HOME = ["/dashboard", "/textiles", "/quality"];

check("A1. Sin contexto, se aterriza en el SELECTOR DE MÓDULOS, no en PCR", () => {
  const destination: string = resolveAcceptInviteDestination({
    returnTo: null,
    enterableModuleHomePaths: ANY_MODULE_HOME,
  });
  assert(destination !== "/dashboard", "el fallback jamás puede ser la portada de PCR");
  assert(destination === MODULE_SELECTOR_PATH, `aterrizó en ${destination}`);
});

check("A2. Da igual desde qué módulo se invitó: el defecto es el mismo selector", () => {
  // El encargo lo pide explícitamente para PCR, Textiles, Quality y un área
  // transversal: ninguno de los cuatro puede tener un destino privilegiado.
  for (const origin of ["cpr", "textiles", "quality", "platform"]) {
    const destination = resolveAcceptInviteDestination({
      returnTo: undefined,
      enterableModuleHomePaths: ANY_MODULE_HOME,
    });
    assert(destination === MODULE_SELECTOR_PATH, `invitando desde ${origin} fue a ${destination}`);
  }
});

check("A3. Un return_to VÁLIDO se conserva: es la ruta de inicio de un módulo entrable", () => {
  assert(
    resolveAcceptInviteDestination({
      returnTo: "/quality",
      enterableModuleHomePaths: ANY_MODULE_HOME,
    }) === "/quality",
    "un módulo entrable debía conservarse"
  );
  assert(
    resolveAcceptInviteDestination({
      returnTo: "/textiles",
      enterableModuleHomePaths: ANY_MODULE_HOME,
    }) === "/textiles",
    "Textiles debía conservarse"
  );
});

check("A4. Un módulo al que la empresa NO puede entrar cae al selector", () => {
  // Es lo que impide que el parámetro conceda nada: los módulos entrables los
  // calcula el servidor con el estado comercial real.
  assert(
    resolveAcceptInviteDestination({
      returnTo: "/quality",
      enterableModuleHomePaths: ["/dashboard"],
    }) === MODULE_SELECTOR_PATH,
    "un módulo no entrable no puede conservarse"
  );
  assert(
    resolveAcceptInviteDestination({ returnTo: "/dashboard", enterableModuleHomePaths: [] }) ===
      MODULE_SELECTOR_PATH,
    "sin módulos entrables, siempre el selector"
  );
});

check("A5. Ningún return_to inválido abre un redirect: se ignoran todos", () => {
  const hostiles = [
    "https://evil.example.com",
    "//evil.example.com",
    "///evil.example.com",
    "http://localhost:3000/dashboard",
    "/quality/../../etc/passwd",
    "javascript:alert(1)",
    "/platform",
    "/quality/documents",
    "  /quality  extra",
    "",
    "   ",
    "quality",
  ];
  for (const hostile of hostiles) {
    const destination = resolveAcceptInviteDestination({
      returnTo: hostile,
      enterableModuleHomePaths: ANY_MODULE_HOME,
    });
    assert(destination === MODULE_SELECTOR_PATH, `«${hostile}» acabó en ${destination}`);
  }
});

check("A6. La action de aceptar redirige al destino resuelto, no a /dashboard", () => {
  const src = stripTs(read("server/actions/team.ts"));
  const action = src.slice(src.indexOf("export async function acceptTeamInvitationAction"));
  const body = action.slice(0, action.indexOf("async function resolveDestinationAfterAccept"));
  assert(!/redirect\("\/dashboard"\)/.test(body), "seguía redirigiendo a la portada de PCR");
  assert(/resolveDestinationAfterAccept/.test(body), "debía resolver el destino en servidor");
  assert(
    /isEnterableState\(s\.access\.derivedState\)/.test(src),
    "los módulos entrables deben salir del estado comercial real"
  );
});

check("A7. Elegir empresa tampoco desemboca en PCR", () => {
  const src = stripTs(read("server/actions/organizations.ts"));
  const action = src.slice(src.indexOf("export async function selectActiveOrganizationAction"));
  assert(!/redirect\("\/dashboard"\)/.test(action), "seleccionar empresa seguía llevando a PCR");
  assert(/redirect\(MODULE_SELECTOR_PATH\)/.test(action), "debía llevar al selector de módulos");
});

check("A8. El enlace de invitación NO inyecta un módulo por su cuenta", () => {
  // Decisión de QUALITY-01.2: el enlace es neutro. `return_to` existe y se
  // valida, pero se pasa a propósito solo cuando alguien lo pide; si el
  // constructor lo añadiera solo, la invitación volvería a tener sesgo.
  const src = stripTs(read("lib/auth/invitation-link.ts"));
  assert(!/return_to/.test(src), "el constructor del enlace no debe inyectar return_to");
  assert(/\/accept-invite\?token=/.test(src), "el enlace sigue siendo el de aceptación");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nB · Relaciones entre procesos: una sola, leída desde ambos lados\n");

const REL = {
  id: "r1",
  sourceProcessId: "compras",
  sourceProcessName: "Compras",
  targetProcessId: "produccion",
  targetProcessName: "Producción",
  sourceOutputId: "o1",
  sourceOutputName: "Materia prima aprobada",
  targetInputId: "i1",
  targetInputName: "Materia prima",
  informationItem: "Materia prima aprobada",
  description: null,
};

check("B1. La MISMA fila es «entrega a» en un proceso y «recibe de» en el otro", () => {
  const fromSource = splitInteractions("compras", [REL]);
  const fromTarget = splitInteractions("produccion", [REL]);
  assert(fromSource.outgoing.length === 1 && fromSource.incoming.length === 0,
    "desde Compras debía ser saliente");
  assert(fromTarget.incoming.length === 1 && fromTarget.outgoing.length === 0,
    "desde Producción debía ser entrante");
  assert(fromSource.outgoing[0].id === fromTarget.incoming[0].id,
    "no puede haber dos registros para el mismo hecho");
});

check("B2. Los cuatro extremos llegan a la pantalla (no se pierden al separar)", () => {
  const { incoming } = splitInteractions("produccion", [REL]);
  assert(incoming[0].sourceOutputName === "Materia prima aprobada", "faltó la salida de origen");
  assert(incoming[0].targetInputName === "Materia prima", "faltó la entrada de destino");
});

check("B3. La ficha muestra RECIBE DE y ENTREGA A, y ofrece crear desde ambos", () => {
  const ui = read("components/domain/quality/process-detail.tsx");
  assert(ui.includes("Recibe de"), "faltaba la vista «Recibe de»");
  assert(ui.includes("Entrega a"), "faltaba la vista «Entrega a»");
  assert(ui.includes("Añadir proceso del que recibe"), "no se podía crear desde el extremo receptor");
  assert(ui.includes("Añadir proceso al que entrega"), "no se podía crear desde el extremo emisor");
  assert(ui.includes("Salida origen:"), "faltaba nombrar la salida de origen");
  assert(ui.includes("Entrada en este proceso:"), "faltaba nombrar la entrada propia");
  assert(ui.includes("Salida de este proceso:"), "faltaba nombrar la salida propia");
  assert(ui.includes("Entrada destino:"), "faltaba nombrar la entrada de destino");
});

check("B4. Ambos puntos de vista escriben la MISMA estructura", () => {
  const ui = stripTs(read("components/domain/quality/process-detail.tsx"));
  // El formulario es uno solo; lo que cambia es quién ocupa cada papel.
  const relateCalls = ui.match(/relateQualityProcesses\(\{[\s\S]*?\}\)/g) ?? [];
  assert(relateCalls.length === 2, `debía haber exactamente dos llamadas, hay ${relateCalls.length}`);
  for (const call of relateCalls) {
    for (const field of ["sourceProcessId", "sourceOutputId", "targetProcessId", "targetInputId"]) {
      assert(call.includes(field), `una de las dos llamadas no envía ${field}`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nD · El mapa dibuja el flujo REAL\n");

const BANDS = [
  {
    categoryCode: "core",
    label: "Misionales",
    nodes: [
      { processId: "compras", processName: "Compras", processCode: "P-01", categoryCode: "core", sortOrder: 1 },
      { processId: "produccion", processName: "Producción", processCode: "P-02", categoryCode: "core", sortOrder: 2 },
      { processId: "despachos", processName: "Despachos", processCode: "P-03", categoryCode: "core", sortOrder: 3 },
    ],
  },
];

const EDGES = [
  {
    id: "e1",
    sourceProcessId: "compras",
    targetProcessId: "produccion",
    sourceOutputName: "Materia prima aprobada",
    targetInputName: "Materia prima",
    informationItem: "Materia prima aprobada",
  },
  {
    id: "e2",
    sourceProcessId: "produccion",
    targetProcessId: "despachos",
    sourceOutputName: "Producto terminado",
    targetInputName: "Producto para despacho",
    informationItem: "Producto terminado",
  },
];

check("D1. Compras → Producción → Despachos, con la dirección correcta", () => {
  const layout = computeQualityMapLayout({ bands: BANDS, edges: EDGES });
  assert(layout.nodes.length === 3, "faltan bloques");
  assert(layout.edges.length === 2, "faltan flechas");
  const [a, b] = layout.edges;
  assert(a.sourceProcessId === "compras" && a.targetProcessId === "produccion", "primera flecha invertida");
  assert(b.sourceProcessId === "produccion" && b.targetProcessId === "despachos", "segunda flecha invertida");
  assert(a.label === "Materia prima aprobada → Materia prima", `etiqueta inesperada: ${a.label}`);
});

check("D2. Cada flecha nace y muere en el borde de su bloque, nunca en el vacío", () => {
  const layout = computeQualityMapLayout({ bands: BANDS, edges: EDGES });
  const byId = new Map(layout.nodes.map((n) => [n.processId, n]));
  for (const edge of layout.edges) {
    const match = edge.path.match(/^M ([\d.]+) ([\d.]+) C .* ([\d.]+) ([\d.]+)$/);
    assert(match, `trazado ilegible: ${edge.path}`);
    const source = byId.get(edge.sourceProcessId)!;
    const target = byId.get(edge.targetProcessId)!;
    const inside = (n: typeof source, x: number, y: number) =>
      x >= n.x - 1 && x <= n.x + n.width + 1 && y >= n.y - 1 && y <= n.y + n.height + 1;
    assert(inside(source, Number(match![1]), Number(match![2])), "la flecha no sale del bloque origen");
    assert(inside(target, Number(match![3]), Number(match![4])), "la flecha no llega al bloque destino");
  }
});

check("D3. Dos relaciones entre el mismo par NO se superponen", () => {
  const twin = [
    EDGES[0],
    { ...EDGES[0], id: "e1b", sourceOutputName: "Devoluciones", targetInputName: "Producto no conforme" },
  ];
  const layout = computeQualityMapLayout({ bands: BANDS, edges: twin });
  assert(layout.edges.length === 2, "faltó una de las dos");
  assert(layout.edges[0].path !== layout.edges[1].path, "las dos flechas se dibujan encima");
  assert(
    layout.edges[0].labelY !== layout.edges[1].labelY ||
      layout.edges[0].labelX !== layout.edges[1].labelX,
    "las dos etiquetas caen en el mismo punto"
  );
});

check("D4. Una relación con un extremo fuera del mapa se cuenta, no se pierde en silencio", () => {
  const layout = computeQualityMapLayout({
    bands: BANDS,
    edges: [...EDGES, { ...EDGES[0], id: "e3", targetProcessId: "no-esta-en-el-mapa" }],
  });
  assert(layout.edges.length === 2, "no debía dibujarse la relación colgante");
  assert(layout.danglingEdgeCount === 1, "debía contarse la relación colgante");
});

check("D5. Las bandas por categoría se conservan y no se solapan", () => {
  const layout = computeQualityMapLayout({
    bands: [
      { categoryCode: "strategic", label: "Estratégicos", nodes: [BANDS[0].nodes[0]] },
      { categoryCode: "core", label: "Misionales", nodes: [BANDS[0].nodes[1]] },
      { categoryCode: "support", label: "Apoyo", nodes: [BANDS[0].nodes[2]] },
    ],
    edges: [],
  });
  assert(layout.bands.map((b) => b.label).join("|") === "Estratégicos|Misionales|Apoyo",
    "el orden de las bandas cambió");
  const ys = layout.nodes.map((n) => n.y);
  assert(ys[0] < ys[1] && ys[1] < ys[2], "las bandas se solapan verticalmente");
  assert(layout.height > ys[2], "el lienzo no cubre la última banda");
});

check("D6. Con muchas relaciones las etiquetas dejan de mostrarse todas a la vez", () => {
  assert(shouldShowAllEdgeLabels(3), "con tres relaciones deben verse todas");
  assert(shouldShowAllEdgeLabels(EDGE_LABEL_LIMIT), "en el límite aún deben verse");
  assert(!shouldShowAllEdgeLabels(EDGE_LABEL_LIMIT + 1), "pasado el límite el mapa se satura");
  assert(!shouldShowAllEdgeLabels(0), "sin relaciones no hay nada que etiquetar");
});

check("D7. La etiqueta degrada bien cuando falta un extremo", () => {
  const base = { id: "x", sourceProcessId: "a", targetProcessId: "b" };
  assert(describeEdge({ ...base, sourceOutputName: "S", targetInputName: "E", informationItem: null }) === "S → E", "");
  assert(describeEdge({ ...base, sourceOutputName: null, targetInputName: null, informationItem: "Item" }) === "Item", "");
  assert(describeEdge({ ...base, sourceOutputName: null, targetInputName: "E", informationItem: null }) === "→ E", "");
  assert(describeEdge({ ...base, sourceOutputName: null, targetInputName: null, informationItem: null }) === "Relación", "");
});

check("D9. Los bloques de una banda se ordenan por FLUJO, no alfabéticamente", () => {
  // Con el orden alfabético, Despachos quedaba EN MEDIO de Compras y
  // Producción y la flecha entre ambos tenía que cruzarle por encima: el mapa
  // se leía al revés de como funciona la empresa.
  const alfabetico = [
    { processId: "compras", processName: "Compras", processCode: null, categoryCode: "core", sortOrder: 0 },
    { processId: "despachos", processName: "Despachos", processCode: null, categoryCode: "core", sortOrder: 0 },
    { processId: "produccion", processName: "Producción", processCode: null, categoryCode: "core", sortOrder: 0 },
  ];
  const layout = computeQualityMapLayout({
    bands: [{ categoryCode: "core", label: "Misionales", nodes: alfabetico }],
    edges: EDGES,
  });
  const orden = [...layout.nodes].sort((a, b) => a.x - b.x).map((n) => n.processId);
  assert(orden.join(">") === "compras>produccion>despachos", `el orden es ${orden.join(">")}`);
});

check("D10. Un ciclo entre procesos no rompe el mapa: se conserva el orden", () => {
  // A alimenta a B y B alimenta a A es legítimo en un sistema de gestión.
  const ciclo = [
    { id: "c1", sourceProcessId: "compras", targetProcessId: "produccion", sourceOutputName: "x", targetInputName: "y", informationItem: null },
    { id: "c2", sourceProcessId: "produccion", targetProcessId: "compras", sourceOutputName: "y", targetInputName: "x", informationItem: null },
  ];
  const layout = computeQualityMapLayout({ bands: BANDS, edges: ciclo });
  assert(layout.nodes.length === 3, "el mapa perdió bloques ante un ciclo");
  assert(layout.edges.length === 2, "el mapa perdió flechas ante un ciclo");
});

check("D11. Ninguna etiqueta acaba encima de un bloque", () => {
  const layout = computeQualityMapLayout({
    bands: [
      { categoryCode: "strategic", label: "Estratégicos", nodes: [BANDS[0].nodes[0]] },
      { categoryCode: "core", label: "Misionales", nodes: [BANDS[0].nodes[1], BANDS[0].nodes[2]] },
    ],
    edges: [
      ...EDGES,
      { id: "e3", sourceProcessId: "compras", targetProcessId: "despachos", sourceOutputName: "Directo", targetInputName: "Entrada", informationItem: null },
    ],
  });
  for (const edge of layout.edges) {
    const dentro = layout.nodes.find(
      (n) =>
        edge.labelX >= n.x - 6 && edge.labelX <= n.x + n.width + 6 &&
        edge.labelY >= n.y - 6 && edge.labelY <= n.y + n.height + 6
    );
    assert(!dentro, `la etiqueta «${edge.label}» cae sobre el bloque ${dentro?.processName}`);
  }
});

check("D12. Las etiquetas se pintan DESPUÉS de los bloques", () => {
  // Si se pintaran antes, el bloque las taparía: es lo que ocurría con
  // «Producto terminado → …», que aparecía cortado a la mitad.
  const canvas = read("components/domain/quality/map-canvas.tsx");
  const nodos = canvas.indexOf("{/* Bloques */}");
  const etiquetas = canvas.indexOf("Y las etiquetas ENCIMA de todo");
  assert(nodos > 0 && etiquetas > nodos, "las etiquetas deben renderizarse después de los bloques");
});

check("D8. El mapa no pide volver a dibujar lo ya registrado", () => {
  const canvas = read("components/domain/quality/map-canvas.tsx");
  assert(!/addEdge|createEdge|drawEdge|nueva flecha/i.test(stripTs(canvas)),
    "el mapa no debe ofrecer crear conexiones a mano");
  const db = read("lib/db/quality-processes.ts");
  assert(db.includes("quality_process_interactions"), "las aristas del borrador salen de las relaciones");
  assert(db.includes("quality_process_map_edges"), "las de una versión publicada, del snapshot");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nE · Quality → Documentos → Crear documento\n");

check("E1. Las categorías del formulario son un ARRAY de verdad, no una referencia de servidor", () => {
  // La causa exacta del «This page couldn't load»: la constante se exportaba
  // desde un módulo "use server", así que en el navegador no era un array y
  // `.map` reventaba en pleno render.
  assert(Array.isArray(QUALITY_DOCUMENT_CATEGORIES), "debe ser un array");
  assert(QUALITY_DOCUMENT_CATEGORIES.length > 0, "no puede venir vacío");
  assert(typeof QUALITY_DOCUMENT_CATEGORIES.map === "function", "debe poder recorrerse");
  assert(isQualityDocumentCategory("procedure"), "«procedure» debía ser válida");
  assert(!isQualityDocumentCategory("technical_support"), "una categoría de PCR no pertenece aquí");
  assert(qualityDocumentCategoryLabel("record") === "Registro", "etiqueta inesperada");
});

check("E2. La constante vive en el DOMINIO y el formulario la importa de ahí", () => {
  const action = read("server/actions/quality-documents.ts");
  assert(!/export const QUALITY_DOCUMENT_CATEGORIES/.test(action),
    "una server action no puede exportar valores al cliente");
  const view = read("components/domain/quality/documents-view.tsx");
  assert(view.includes('from "@/lib/domain/quality-documents"'),
    "el formulario debe tomar las categorías del dominio");
  assert(!/QUALITY_DOCUMENT_CATEGORIES[\s\S]{0,80}from "@\/server\/actions/.test(view),
    "el formulario seguía importando la constante del módulo de servidor");
});

check("E3. INVARIANTE: ningún módulo \"use server\" exporta valores", () => {
  // Es la clase de defecto, no el defecto: cualquier constante exportada desde
  // un archivo "use server" llega rota al cliente. Se comprueba en todo el
  // código ejecutable para que no vuelva a colarse en otro módulo.
  const offenders: string[] = [];
  for (const file of SOURCES) {
    const src = read(file);
    if (!/^\s*["']use server["']/m.test(firstLines(src))) continue;
    const matches = stripTs(src).matchAll(/^export\s+(const|let|var|class|enum)\s+([A-Za-z0-9_$]+)/gm);
    for (const m of matches) offenders.push(`${file} → ${m[2]}`);
  }
  assert(offenders.length === 0, `exportan valores desde "use server": ${offenders.join(", ")}`);
});

check("E4. INVARIANTE: no se navega durante el render", () => {
  // El segundo defecto de la misma pantalla, latente detrás del primero:
  // llamar a router.push mientras React pinta actualiza el Router desde OTRO
  // componente, y en React 19 eso es un error, no un aviso.
  //
  // La diferencia entre lo correcto y lo incorrecto es exactamente una: si la
  // llamada está dentro de una función anidada (un efecto, un manejador, una
  // transición) se ejecuta DESPUÉS del render; si está suelta en el cuerpo del
  // componente, se ejecuta DURANTE. Eso es lo que mide functionDepthAt.
  // Primero se comprueba que el detector detecta: un invariante que no puede
  // fallar no protege de nada. `bad` es el código exacto que reventaba.
  const bad = stripCode(`
    export function View({ state }) {
      const router = useRouter();
      if (state.success && state.documentId) {
        router.push("/x");
      }
      return null;
    }
  `);
  const good = stripCode(`
    export function View({ state }) {
      const router = useRouter();
      useEffect(() => {
        if (state.success) { router.push("/x"); }
      }, [state.success, router]);
      return null;
    }
  `);
  assert(functionDepthAt(bad, bad.indexOf("router.push")) <= 1, "el detector no ve el defecto original");
  assert(functionDepthAt(good, good.indexOf("router.push")) > 1, "el detector marca código correcto");

  const offenders: string[] = [];
  for (const file of SOURCES.filter((f) => f.endsWith(".tsx"))) {
    const raw = read(file);
    if (!/^\s*["']use client["']/m.test(firstLines(raw))) continue;
    const src = stripCode(raw);
    for (const match of src.matchAll(/router\.(push|replace)\(/g)) {
      // 1 = cuerpo del componente; 2 o más = dentro de una función anidada.
      if (functionDepthAt(src, match.index!) <= 1) {
        offenders.push(`${file}:${lineOf(src, match.index!)}`);
      }
    }
  }
  assert(offenders.length === 0, `navegan durante el render: ${offenders.join(", ")}`);
});

check("E5. El documento se crea con module_key fijado en SERVIDOR", () => {
  const action = stripTs(read("server/actions/quality-documents.ts"));
  assert(action.includes("module_key: QUALITY_DOC_MODULE"), "el módulo debe fijarse en servidor");
  assert(!/formData\.get\("module/.test(action), "el cliente no puede elegir el módulo");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nF · Auditoría de listas de módulos escritas a mano\n");

check("F1. Todo módulo comercial FUNCIONAL tiene shell, ruta de inicio y página real", () => {
  for (const mod of COMMERCIAL_MODULES.filter((m) => m.status === "functional")) {
    const shell = getShellModule(mod.key);
    assert(shell !== null, `el módulo funcional «${mod.key}» no tiene definición de shell`);
    assert(mod.homePath !== null, `«${mod.key}» no declara ruta de entrada`);
    const candidates = [
      `app/(app)/(shell)${mod.homePath}/page.tsx`,
      `app/(app)/(shell)/(cpr)${mod.homePath}/page.tsx`,
      `app${mod.homePath}/page.tsx`,
    ];
    assert(candidates.some((p) => existsSync(join(ROOT, p))),
      `la página de entrada de «${mod.key}» (${mod.homePath}) no existe en disco`);
  }
});

check("F2. El registro y sus claves no pueden separarse", () => {
  assert(SHELL_MODULES.length === SHELL_MODULE_KEYS.length, "el registro y sus claves divergieron");
  for (const key of SHELL_MODULE_KEYS) {
    assert(getShellModule(key) !== null, `«${key}» no tiene definición`);
  }
  for (const mod of SHELL_MODULES) {
    assert((SHELL_MODULE_KEYS as readonly string[]).includes(mod.key), `«${mod.key}» falta en las claves`);
  }
});

check("F3. Un documento se abre en SU módulo, nunca en la ruta de PCR por defecto", () => {
  assert(trazadocDocumentHref("cpr", "d1") === "/trazadocs/d1", "PCR");
  assert(trazadocDocumentHref("textiles", "d1") === "/textiles/trazadocs/d1", "Textiles");
  assert(trazadocDocumentHref("quality", "d1") === "/quality/documents/d1", "Quality");
  assert(trazadocDocumentHref("inventado", "d1") === null, "un módulo desconocido no ofrece enlace");
  for (const mod of SHELL_MODULES) {
    const href = mod.documentPath("d1");
    assert(href.startsWith("/"), `${mod.key} declara una ruta relativa`);
    assert(href.includes("d1"), `${mod.key} no usa el identificador del documento`);
  }
});

check("F4. Las pantallas de Quality no enlazan documentos a la ruta de PCR", () => {
  // Era el enlace roto: una empresa que solo tiene Quality pulsaba el documento
  // que acababa de asociar y se topaba con el guard de otro módulo.
  for (const file of SOURCES.filter((f) => f.startsWith("components/domain/quality/"))) {
    const src = stripTs(read(file));
    assert(!/`\/trazadocs\/\$\{/.test(src), `${file} sigue enlazando a la ruta de PCR`);
    assert(!/"\/trazadocs\//.test(src), `${file} sigue enlazando a la ruta de PCR`);
  }
});

check("F5. El nombre de un módulo sale del registro, no de mapas repetidos", () => {
  assert(shellModuleName("quality") === "Trazaloop Quality", "");
  assert(shellModuleName("cpr") === "Trazaloop PCR", "");
  assert(shellModuleName("textiles") === "Trazaloop Textiles", "");
  assert(shellModuleName("inventado") === "inventado", "un valor inesperado no puede vaciar la pantalla");
  for (const file of ["components/domain/quality/documents-view.tsx", "components/domain/quality/process-detail.tsx"]) {
    const src = stripTs(read(file));
    assert(!/cpr:\s*"PCR"/.test(src), `${file} conserva un mapa de etiquetas escrito a mano`);
  }
});

check("F6. Los módulos de TrazaDocs se DERIVAN del registro", () => {
  assert(TRAZADOC_MODULE_KEYS === SHELL_MODULE_KEYS, "deben ser la misma lista, no una copia");
  for (const key of ["cpr", "textiles", "quality"]) {
    assert(isTrazadocDocumentModule(key), `«${key}» debía ser un módulo documental válido`);
  }
  assert(!isTrazadocDocumentModule("construccion"), "un módulo sin shell no puede tener documentos");
  // Y la base tiene que aceptar exactamente esos: si un módulo nuevo entra al
  // registro sin ampliar la CHECK, esta prueba falla ANTES que la aplicación.
  const check0113 = stripSql(read("supabase/migrations/0113_quality_documents_and_position_lifecycle.sql"));
  for (const key of TRAZADOC_MODULE_KEYS) {
    assert(check0113.includes(`'${key}'`),
      `la migración documental no acepta module_key='${key}': amplía la CHECK antes de publicar el módulo`);
  }
});

check("F7. Una pantalla TRANSVERSAL no ofrece atajos de un solo módulo", () => {
  const team = stripTs(read("app/(app)/(shell)/team/page.tsx"));
  for (const pcrRoute of ['href="/implementation"', 'href="/imports"', 'href="/evidences"', 'href="/traceability"']) {
    assert(!team.includes(pcrRoute), `Equipo seguía enlazando a ${pcrRoute}, que es de PCR`);
  }
  assert(team.includes("resolveShellModuleForPath"), "los atajos deben salir del módulo activo");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nM · Migración 0114 · convenciones\n");

check("M1. Append-only: 0114 existe, sin renumerar ni duplicar prefijos", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const numbers = files.map((f) => Number(f.slice(0, 4))).sort((a, b) => a - b);
  assert(numbers.includes(114), "0114 debe existir");
  assert(new Set(numbers).size === numbers.length, "hay prefijos duplicados");
  assert(existsSync(join(ROOT, MIG)), "la migración no está donde dice");
});

check("M2. No se toca ninguna migración anterior", () => {
  const sql = stripSql(read(MIG));
  assert(!/drop table (?!if exists public\.quality_process_map_edges)/i.test(sql),
    "0114 no debe eliminar tablas existentes");
  for (const forbidden of ["grant all", "alter default privileges"]) {
    assert(!new RegExp(forbidden, "i").test(sql), `jamás ${forbidden.toUpperCase()}`);
  }
});

check("M3. La tabla nueva declara RLS, aislamiento y privilegios explícitos", () => {
  const sql = stripSql(read(MIG));
  assert(/alter table public\.quality_process_map_edges enable row level security/.test(sql),
    "faltó habilitar RLS");
  assert(/using \(public\.is_org_member\(organization_id\)\)/.test(sql), "faltó el aislamiento por empresa");
  assert(/grant select on table public\.quality_process_map_edges to authenticated;/.test(sql),
    "authenticated debía recibir solo SELECT");
  assert(/revoke truncate, references, trigger on table[\s\S]*quality_process_map_edges/.test(sql),
    "deben revocarse los privilegios de DDL");
  assert(/revoke all on table public\.quality_process_map_edges from anon/.test(sql),
    "anon no puede conservar nada");
});

check("M4. El snapshot del mapa SOLO lo escribe la RPC de publicación", () => {
  const sql = stripSql(read(MIG));
  const policies = sql.match(/create policy \w+ on public\.quality_process_map_edges\s+for (\w+)/g) ?? [];
  assert(policies.length === 1, `debía haber una sola política, hay ${policies.length}`);
  assert(policies[0].includes("for select"), "la única política debe ser de lectura");
  assert(/insert into quality_process_map_edges/.test(sql), "la RPC debe escribir el snapshot");
  assert(/create or replace function public\.quality_publish_map_version/.test(sql),
    "el snapshot se escribe al publicar");
});

check("M5. Las invariantes del modelo relacional están en la BASE, no solo en la UI", () => {
  const sql = stripSql(read(MIG));
  assert(/quality_process_documents_io_fk[\s\S]*quality_process_io \(organization_id, id\)/.test(sql),
    "la relación documento↔entrada debe llevar FK compuesta con la empresa");
  assert(/pertenecer a este proceso/.test(sql), "faltó el trigger que ata la entrada a su proceso");
  assert(/nulls not distinct/i.test(sql), "faltó la unicidad que impide duplicados exactos");
  assert(/No se registran relaciones nuevas con un proceso retirado/.test(sql),
    "faltó la guarda de procesos retirados");
  // La autorrelación sigue prohibida: es una decisión del modelo, no de la UI.
  const foundation = stripSql(read("supabase/migrations/0112_quality_process_foundation.sql"));
  assert(/quality_process_interactions_not_self check \(source_process_id <> target_process_id\)/.test(foundation),
    "la prohibición de autorrelación no puede desaparecer");
  assert(!/drop constraint quality_process_interactions_not_self/i.test(sql),
    "0114 no debe levantar la prohibición de autorrelación");
});

check("M7. El snapshot es de SOLO LECTURA también donde el entorno concede de más", () => {
  // Conceder SELECT no quita lo que el entorno ya concedió. En un proyecto
  // remoto de Supabase los privilegios por defecto dan arwdDxtm sobre cada
  // tabla nueva, así que `authenticated` se quedaba con DML sobre el snapshot
  // —invisible en local, donde el entorno solo da Dxtm—. Lo descubrió la
  // validación contra Staging; 0115 lo revoca.
  const sql = stripSql(read("supabase/migrations/0115_quality_map_edges_privilege_hardening.sql"));
  assert(
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*quality_process_map_edges[\s\S]*from authenticated/.test(sql),
    "0115 debe revocar el DML que concede el entorno"
  );
  assert(/revoke all on table public\.quality_process_map_edges from anon/.test(sql),
    "anon no puede conservar nada");
  assert(!/create table|alter table|update |delete from/i.test(sql),
    "0115 solo revoca: no crea, no altera y no toca datos");
});

check("M6. Publicar conserva el histórico en vez de recalcularlo", () => {
  const sql = stripSql(read(MIG));
  assert(/source_output_name/.test(sql) && /target_input_name/.test(sql),
    "el snapshot debe guardar los NOMBRES, o renombrar una salida reescribiría el pasado");
  assert(/delete from quality_process_map_edges where map_version_id = p_version_id/.test(sql),
    "publicar debe ser idempotente");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\nQUALITY-01.2 unit/estático: ${passed} ✔, ${failed} ✘\n`);
process.exit(failed === 0 ? 0 : 1);
