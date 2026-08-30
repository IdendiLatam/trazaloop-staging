/**
 * Trazaloop · QUALITY-13B1 · El contrato de integración.
 *
 * Comprobaciones puras y estáticas: aritmética de la matriz, vocabulario
 * temporal, enlaces, la frontera de la tarea propia, y las tres cosas que B1
 * prometió NO hacer —ninguna tabla nueva, ningún `service_role`, ningún enlace
 * fuera de Quality—.
 *
 * Correr: npm run test:quality13b1-integration
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  allDeepLinks, asOf, CURRENT, deepLink, DOMAIN_NATIVE_TASK_TABLES,
  hasDetailRoute, INTEGRATION_SUBJECTS, isDomainNativeTask, period,
  sameMoment, temporalLabel, TEMPORAL_MODES,
  type IntegrationSubject,
} from "../../lib/domain/quality-integration";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nQUALITY-13B1 · Contrato de integración\n");

// ===========================================================================
// A · La matriz cuadra, y se cuenta desde el documento
// ===========================================================================

/**
 * Recuenta la matriz de QUALITY-13A leyendo el archivo.
 *
 * Existe porque el informe de 13A publicó «130 celdas · 78 · 33 · 9 · 10» sobre
 * una tabla que decía otra cosa, y nadie lo vio hasta la revisión humana. Las
 * dos cifras —la contada y la publicada— salen del MISMO archivo, así que la
 * prueba no lleva ni un número escrito a mano y no puede quedarse obsoleta.
 */
function recontarMatriz() {
  const doc = leer("docs/quality/quality-13/QUALITY_13A_DOMAIN_INTEGRATION_MATRIX.md");
  const desde = doc.indexOf("| Dominio |");
  const hasta = doc.indexOf("## 1.bis");
  assert(desde !== -1 && hasta > desde, "no se encuentra la tabla de la sección 1");
  const tabla = doc.slice(desde, hasta);

  const cabecera = tabla.split("\n")[0];
  const ejes = cabecera.split("|").map((c) => c.trim()).filter(Boolean).slice(1);
  const filas = tabla.split("\n").filter((l) => l.startsWith("| **"));

  const conteo: Record<string, number> = {};
  for (const f of filas) {
    const celdas = f.split("|").map((c) => c.trim().replace(/\*\*/g, "")).filter((_, i, a) =>
      i > 0 && i < a.length - 1);
    assert(celdas.length === ejes.length + 1,
      `la fila «${celdas[0]}» tiene ${celdas.length - 1} celdas y hay ${ejes.length} ejes`);
    for (const v of celdas.slice(1)) conteo[v] = (conteo[v] ?? 0) + 1;
  }

  const publicado = (etiqueta: string): number => {
    const m = new RegExp(`\\| ${etiqueta} \\| \\*?\\*?(\\d+)`).exec(doc);
    assert(m, `el resumen no publica «${etiqueta}»`);
    return Number(m![1]);
  };

  return {
    filas: filas.length, ejes: ejes.length, conteo,
    total: Object.values(conteo).reduce((a, b) => a + b, 0),
    clasificadas: Object.entries(conteo)
      .filter(([k]) => k !== "—").reduce((a, [, v]) => a + v, 0),
    publicado,
  };
}

check("A1. la matriz cuadra consigo misma", () => {
  const m = recontarMatriz();
  assert(m.total === m.filas * m.ejes,
    `${m.filas} × ${m.ejes} = ${m.filas * m.ejes}, y hay ${m.total} celdas`);
  assert(m.clasificadas + (m.conteo["—"] ?? 0) === m.total,
    "las clasificadas más la diagonal no suman el total");
});

check("A2. el resumen publicado coincide con lo que dice la tabla", () => {
  const m = recontarMatriz();
  const esperado: [string, number][] = [
    ["Filas de dominio", m.filas],
    ["Ejes evaluados", m.ejes],
    ["Celdas totales", m.total],
    ["Celdas clasificadas", m.clasificadas],
    ["LISTO", m.conteo["L"] ?? 0],
    ["PARCIAL", m.conteo["P"] ?? 0],
    ["FALTA", m.conteo["F"] ?? 0],
    ["N/A", m.conteo["N/A"] ?? 0],
  ];
  for (const [etiqueta, valor] of esperado) {
    const pub = m.publicado(etiqueta);
    assert(pub === valor,
      `«${etiqueta}»: la tabla dice ${valor} y el resumen publica ${pub}`);
  }
});

check("A3. los cuatro estados suman las celdas clasificadas", () => {
  const m = recontarMatriz();
  const suma = (m.conteo["L"] ?? 0) + (m.conteo["P"] ?? 0)
    + (m.conteo["F"] ?? 0) + (m.conteo["N/A"] ?? 0);
  assert(suma === m.clasificadas,
    `los estados suman ${suma} y hay ${m.clasificadas} celdas clasificadas`);
  const desconocidos = Object.keys(m.conteo).filter((k) => !["L", "P", "F", "N/A", "—"].includes(k));
  assert(desconocidos.length === 0,
    `la matriz usa símbolos que nadie declaró: ${desconocidos.join(", ")}`);
});

// ===========================================================================
// B–D · El tiempo (QI-29)
// ===========================================================================

check("B. El presente se declara, y se dice con palabras", () => {
  assert(TEMPORAL_MODES.includes("current"), "falta el modo presente");
  assert(temporalLabel(CURRENT) === "Estado actual", "el presente no se etiqueta");
  assert(sameMoment(CURRENT, CURRENT), "dos presentes deberían ser el mismo momento");
});

check("C. Una fecha se declara con SU fecha", () => {
  const a = asOf("2026-06-30");
  assert(a.mode === "as_of" && a.asOf === "2026-06-30", "el corte no viaja");
  assert(temporalLabel(a).includes("2026-06-30"),
    "la etiqueta histórica no dice a qué fecha corresponde");
  assert(!sameMoment(a, CURRENT),
    "una fecha pasada y el presente NO son el mismo momento");
  assert(!sameMoment(a, asOf("2026-06-29")), "dos fechas distintas no son el mismo momento");
  assert(sameMoment(a, asOf("2026-06-30")), "la misma fecha debería serlo");
});

check("D. Un periodo declara sus dos extremos", () => {
  const p = period("2026-01-01", "2026-03-31");
  assert(p.mode === "period", "el modo no es periodo");
  assert(temporalLabel(p).includes("2026-01-01") && temporalLabel(p).includes("2026-03-31"),
    "la etiqueta de periodo no dice de cuándo a cuándo");
  assert(!sameMoment(p, CURRENT), "un periodo no es el presente");
  assert(!sameMoment(p, period("2026-01-01", "2026-04-30")), "periodos distintos, momentos distintos");
});

// ===========================================================================
// E–F · Los enlaces (QI-26)
// ===========================================================================

check("E. Todo sujeto tiene enlace, y el que tiene ficha lleva a la ficha", () => {
  for (const k of INTEGRATION_SUBJECTS) {
    const lista = deepLink(k);
    assert(lista.startsWith("/quality/"), `${k} no lleva a Quality: ${lista}`);
    const conId = deepLink(k, "abc-123");
    if (hasDetailRoute(k)) {
      assert(conId.includes("abc-123"), `${k} declara ficha y no usa el identificador`);
    } else {
      assert(conId === lista,
        `${k} no tiene ficha propia y aun así fabrica una ruta con identificador`);
    }
  }
});

check("E2. Cada ruta de detalle declarada EXISTE en la aplicación", () => {
  // Un enlace a una página inexistente es peor que no enlazar: promete y falla.
  const rutas = new Set(
    readdirSync(join(raiz, "app/(app)/(shell)/quality"), { recursive: true, withFileTypes: true })
      .filter((d) => d.name === "page.tsx")
      .map((d) => String(d.parentPath ?? d.path).split("app/(app)/(shell)")[1])
  );
  for (const k of INTEGRATION_SUBJECTS) {
    const href = deepLink(k, "00000000-0000-0000-0000-000000000000");
    // La ruta con parámetro se compara sustituyendo el identificador por [x].
    const patron = href.replace(/\/[0-9a-f-]{36}$/, "/[id]");
    const existe = [...rutas].some((r) => {
      const normal = r.replace(/\/\[[^\]]+\]/g, "/[id]");
      return normal === patron || normal === href;
    });
    assert(existe, `${k} enlaza a «${href}» y esa página no existe`);
  }
});

check("F. Ni un enlace se va a PCR ni a Textiles", () => {
  for (const href of allDeepLinks()) {
    assert(href.startsWith("/quality/"),
      `el contrato produce un enlace fuera de Quality: ${href}`);
    assert(!/traceability|textiles/.test(href), `enlace acoplado a otro módulo: ${href}`);
  }
  const fuentes = ["lib/domain/quality-integration.ts", "lib/db/quality-process-context.ts",
                   "lib/db/quality-position-context.ts"].map(leer).join("\n");
  assert(!/\/traceability|\/textiles/.test(fuentes),
    "la capa de integración referencia otro módulo");
});

// ===========================================================================
// L–M · La frontera de la tarea propia (QI-24)
// ===========================================================================

check("L. La tarea propia de dominio está declarada como tal", () => {
  assert(DOMAIN_NATIVE_TASK_TABLES.length >= 4, "la lista de tareas propias es sospechosamente corta");
  assert(isDomainNativeTask("quality_development_plan_items"),
    "el desarrollo de personas debería ser tarea propia");
  assert(!isDomainNativeTask("work_actions"),
    "una acción transversal NO es una tarea propia de dominio");
  assert(!isDomainNativeTask("work_cases"), "un caso no es una tarea propia");
});

check("M. Ningún cargador de integración da por sentado que todo pendiente es acción", () => {
  for (const f of ["lib/db/quality-process-context.ts", "lib/db/quality-position-context.ts"]) {
    const src = sinComentarios(leer(f));
    // Leer work_actions está bien; convertir tareas propias en acciones, no.
    for (const t of DOMAIN_NATIVE_TASK_TABLES) {
      const inserta = new RegExp(`from\\("work_actions"\\)[\\s\\S]{0,200}${t}`).test(src)
        || new RegExp(`${t}[\\s\\S]{0,200}insert`).test(src);
      assert(!inserta, `${f} parece convertir ${t} en una acción transversal`);
    }
    assert(!/\.insert\(|\.update\(|\.delete\(/.test(src),
      `${f} escribe en la base: las primitivas de integración solo LEEN`);
  }
});

// ===========================================================================
// U–V · Las dos promesas de B1
// ===========================================================================

check("U. Ni una línea usa service_role", () => {
  for (const f of ["lib/domain/quality-integration.ts", "lib/db/quality-process-context.ts",
                   "lib/db/quality-position-context.ts"]) {
    const src = sinComentarios(leer(f));
    assert(!/service_role|SERVICE_ROLE/.test(src), `${f} usa service_role`);
    assert(!/createClient\s*\(/.test(src), `${f} crea su propio cliente`);
  }
});

check("V. B1 no creó ninguna tabla nueva de negocio", () => {
  const prohibidas = ["quality_attention", "quality_process_context", "quality_integration",
                      "quality_dashboard", "quality_supplier_processes", "quality_supplier_process",
                      "quality_complaint_processes", "quality_complaint_process"];
  const migracion = existsSync(join(raiz, "supabase/migrations/0152_quality_process_automation_source.sql"))
    ? leer("supabase/migrations/0152_quality_process_automation_source.sql") : "";
  for (const t of prohibidas) {
    assert(!new RegExp(`create table[^;]*${t}`, "i").test(migracion),
      `0152 crea la tabla prohibida ${t}`);
  }
  assert(!/create table/i.test(migracion),
    "0152 crea una tabla: B1 no debía crear ninguna");
  assert(!/drop\s+\w+\s+[^;]*cascade/i.test(migracion), "0152 usa DROP ... CASCADE");
});

check("V2. Tampoco una vista que lo una todo (QI-05)", () => {
  const migracion = leer("supabase/migrations/0152_quality_process_automation_source.sql");
  assert(!/create (or replace )?view/i.test(migracion),
    "0152 crea una vista: la composición es de aplicación, no una mega-vista");
  const ctx = leer("lib/db/quality-process-context.ts");
  assert(/Promise\.all\(/.test(ctx), "las secciones no se leen en paralelo");
  assert(/count: "exact", head: true/.test(ctx),
    "los recuentos no se piden a la base: se estarían contando filas traídas");
});

check("V3. La composición aísla el fallo y NO lo convierte en cero", () => {
  const dom = leer("lib/domain/quality-integration.ts");
  for (const estado of ["unavailable", "not_visible"]) {
    assert(dom.includes(`"${estado}"`), `falta el estado ${estado}`);
  }
  assert(/count: number \| null/.test(dom),
    "el recuento no admite «sin dato»: un fallo se volvería 0");
  const ctx = leer("lib/db/quality-process-context.ts");
  assert(/catch/.test(ctx), "ninguna sección captura su propio fallo");
  assert(/esFaltaDePermiso/.test(ctx), "no se distingue el permiso del fallo");
});

check("W. La fuente de proceso existe, sin contrato de evento y con su razón", () => {
  const mig = leer("supabase/migrations/0152_quality_process_automation_source.sql");
  assert(/insert into public\.quality_automation_sources/.test(mig),
    "0152 no registra la fuente de proceso");
  assert(/'process', 'processes'/.test(mig), "la fuente no declara su dominio");
  assert(/array\['schedule'\]/.test(mig),
    "la fuente admite reglas por evento y no hay ni un hecho `process.*` que las dispare");
  // Se mira si INSERTA un contrato, no si lo nombra: el encabezado explica
  // largamente por qué no lo hay, y esa explicación es parte del valor.
  assert(!/insert into public\.quality_automation_event_contracts/.test(mig),
    "0152 registra un contrato para hechos que nadie emite");
  assert(/no existe ni un solo `work_event` de tipo `process\.\*`/.test(mig),
    "no queda escrito POR QUÉ no hay contrato");
  assert(!/insert into public\.quality_automation_rule_templates/.test(mig),
    "0152 siembra plantillas: eso es trabajo de B3, con sus comprobaciones");

  // Y las salidas admiten el nuevo sujeto: sin esto la primera regla de B3
  // fallaría dentro del ejecutor, con la condición ya evaluada.
  for (const tabla of ["work_alerts_subject_type_check", "work_tasks_subject_type_check"]) {
    const i = mig.indexOf(tabla + "\n");
    const bloque = mig.slice(mig.indexOf("add constraint " + tabla));
    assert(bloque.slice(0, bloque.indexOf(";")).includes("'quality_process'"),
      `${tabla} no admite un proceso como sujeto`);
    void i;
  }
});

console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
