/**
 * Trazaloop · QUALITY-13B3 · El inventario, comprobado contra las migraciones.
 *
 * POR QUÉ ESTA SUITE ES LA MÁS IMPORTANTE DEL TRAMO
 *
 * Porque un inventario escrito a mano envejece en semanas. Estas comprobaciones
 * NO leen el inventario y lo dan por bueno: abren las migraciones, sacan el
 * vocabulario real de avisos y pendientes, buscan quién escribe cada uno, y
 * comparan. Si mañana alguien añade un emisor y no lo inventaría, esto se pone
 * en rojo.
 *
 * Es la diferencia entre un documento y un contrato.
 *
 * Correr: npm run test:quality13b3-observers
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ATTENTION_MECHANISMS, DECLARED_WITHOUT_EMITTER, DUE_SOON_OBSERVERS, INFORMATIONAL_ALERTS,
  LEGACY_TEN, OBSERVERS, OVERDUE_OBSERVERS, TIMING_UNDECIDABLE,
  conditionsSilencedBySweepSupersession, observerByCode, observerForAlert, observerForTask,
} from "../../lib/domain/quality-observers";
import { INTEGRATION_SUBJECTS, allDeepLinks } from "../../lib/domain/quality-integration";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

// ---------------------------------------------------------------------------
// Las migraciones, leídas de verdad
// ---------------------------------------------------------------------------

const DIR = "supabase/migrations";
const FICHEROS = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const TODO = FICHEROS.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");

/** El cuerpo de la ÚLTIMA definición de cada función. Una función redefinida en
 *  una migración posterior manda sobre la anterior; comparar contra la primera
 *  daría por buena una guarda que ya no existe. */
const CUERPOS = new Map<string, string>();
for (const f of FICHEROS) {
  const s = readFileSync(join(DIR, f), "utf8");
  for (const m of s.matchAll(/create or replace function public\.([a-z_0-9]+)\s*\(/g)) {
    const fin = s.indexOf("\n$$;", m.index ?? 0);
    CUERPOS.set(m[1], s.slice(m.index ?? 0, fin < 0 ? undefined : fin));
  }
}

/** El vocabulario que el CHECK admite, de su última definición. */
function vocabulario(columna: "alert_type" | "task_type"): string[] {
  const tabla = columna === "alert_type" ? "work_alerts" : "work_tasks";
  const defs = [...TODO.matchAll(
    new RegExp(`constraint ${tabla}_type_check\\s*\\n?\\s*check \\(${columna} in \\(([\\s\\S]*?)\\)\\)`, "g"))];
  assert(defs.length > 0, `no se encontró el CHECK de ${columna}`);
  const ultima = defs[defs.length - 1][1];
  return [...new Set([...ultima.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))].sort();
}

const VOC_ALERTAS = vocabulario("alert_type");
const VOC_TAREAS = vocabulario("task_type");

/** Qué funciones escriben este tipo en esa tabla. */
function emisores(tipo: string, tabla: "work_alerts" | "work_tasks"): string[] {
  const salida: string[] = [];
  for (const [fn, cuerpo] of CUERPOS) {
    if (cuerpo.includes(`'${tipo}'`) && cuerpo.includes(`insert into ${tabla}`)) salida.push(fn);
  }
  return salida.sort();
}

console.log("\nQUALITY-13B3 · Inventario de observadores\n");

// ===========================================================================
console.log("A · El inventario está COMPLETO");
// ===========================================================================

check("A1. Cada aviso del vocabulario está inventariado o declarado sin emisor", () => {
  const conObservador = new Set(OBSERVERS.flatMap((o) => o.alertTypes));
  const sinEmisor = new Set<string>(DECLARED_WITHOUT_EMITTER.alerts);
  const solapan = [...conObservador].filter((t) => sinEmisor.has(t));
  assert(solapan.length === 0, `en las dos listas a la vez: ${solapan.join(", ")}`);
  const cubiertos = new Set([...conObservador, ...sinEmisor]);
  const faltan = VOC_ALERTAS.filter((t) => !cubiertos.has(t));
  assert(faltan.length === 0, `avisos del CHECK sin clasificar: ${faltan.join(", ")}`);
  const sobran = [...cubiertos].filter((t) => !VOC_ALERTAS.includes(t));
  assert(sobran.length === 0, `avisos inventados que el CHECK no admite: ${sobran.join(", ")}`);
});

check("A2. Lo mismo con los pendientes", () => {
  const conObservador = new Set(OBSERVERS.flatMap((o) => o.taskTypes));
  const sinEmisor = new Set<string>(DECLARED_WITHOUT_EMITTER.tasks);
  const solapan = [...conObservador].filter((t) => sinEmisor.has(t));
  assert(solapan.length === 0, `en las dos listas a la vez: ${solapan.join(", ")}`);
  const cubiertos = new Set([...conObservador, ...sinEmisor]);
  const faltan = VOC_TAREAS.filter((t) => !cubiertos.has(t));
  assert(faltan.length === 0, `pendientes del CHECK sin clasificar: ${faltan.join(", ")}`);
  const sobran = [...cubiertos].filter((t) => !VOC_TAREAS.includes(t));
  assert(sobran.length === 0, `pendientes inventados: ${sobran.join(", ")}`);
});

check("A3. Cada observador escribe DE VERDAD lo que dice escribir", () => {
  for (const o of OBSERVERS) {
    const cuerpo = CUERPOS.get(o.mechanism);
    assert(cuerpo, `el mecanismo ${o.mechanism} no existe como función en las migraciones`);
    for (const t of o.alertTypes) {
      assert(emisores(t, "work_alerts").includes(o.mechanism),
        `${o.code} dice emitir el aviso «${t}» y ${o.mechanism} no lo escribe`);
    }
    for (const t of o.taskTypes) {
      assert(emisores(t, "work_tasks").includes(o.mechanism),
        `${o.code} dice emitir el pendiente «${t}» y ${o.mechanism} no lo escribe`);
    }
  }
});

check("A4. Y lo declarado SIN emisor no lo escribe nadie", () => {
  for (const t of DECLARED_WITHOUT_EMITTER.alerts) {
    const e = emisores(t, "work_alerts");
    assert(e.length === 0, `«${t}» se declara sin emisor y lo escribe ${e.join(", ")}`);
  }
  for (const t of DECLARED_WITHOUT_EMITTER.tasks) {
    const e = emisores(t, "work_tasks");
    assert(e.length === 0, `«${t}» se declara sin emisor y lo escribe ${e.join(", ")}`);
  }
});

check("A5. Ningún código de observador se repite", () => {
  const codigos = OBSERVERS.map((o) => o.code);
  assert(codigos.length === new Set(codigos).size, "hay dos observadores con el mismo código");
  for (const o of OBSERVERS) {
    assert(o.code.startsWith(`${o.mechanism}.`),
      `el código ${o.code} no nombra su mecanismo`);
    assert(o.condition.length > 15, `${o.code} no explica qué mira`);
    assert(o.truthSource.length > 5, `${o.code} no dice dónde vive la verdad que observa`);
  }
});

check("A6. Cada sujeto observado sabe llevar a su dominio", () => {
  for (const o of OBSERVERS) {
    assert((INTEGRATION_SUBJECTS as readonly string[]).includes(o.subjectKind),
      `${o.code} observa un sujeto que el contrato no sabe nombrar: ${o.subjectKind}`);
  }
  for (const h of allDeepLinks()) {
    assert(h.startsWith("/quality/"), `destino fuera de Quality: ${h}`);
  }
});

// ===========================================================================
console.log("\nB · Los cinco mecanismos, clasificados");
// ===========================================================================

check("B1. Los cinco de 13A están, y ninguno se declara verdad de negocio", () => {
  for (const n of ["quality_signals", "quality_risk_signals", "quality_supplier_signals",
                   "quality_customer_signals", "quality_knowledge_signals"]) {
    const m = ATTENTION_MECHANISMS.find((x) => x.name === n);
    assert(m, `falta el mecanismo ${n}`);
    assert(m!.klass !== "business_truth",
      `${n} se declara verdad de negocio, y solo OBSERVA una verdad de otro`);
    assert(/nada/i.test(m!.authoritativeFor),
      `${n} dice ser autoridad sobre algo: ${m!.authoritativeFor}`);
  }
});

check("B2. `quality_risk_signals` no la escribe NADIE, y por eso está dormida", () => {
  const escriben = [...CUERPOS].filter(([, b]) => b.includes("insert into quality_risk_signals"));
  assert(escriben.length === 0,
    `la escriben: ${escriben.map(([f]) => f).join(", ")}`);
  assert(!TODO.includes("insert into quality_risk_signals"),
    "alguna migración inserta en quality_risk_signals");
  const m = ATTENTION_MECHANISMS.find((x) => x.name === "quality_risk_signals")!;
  assert(m.consumers.length === 0, "se le atribuye un consumidor que no tiene");
  assert(/NADIE/.test(m.writer), "no se dice que no tiene emisor");
});

check("B3. Las otras tres son ALMACENES de su barrido, no observadores", () => {
  for (const [tabla, barrido] of [
    ["quality_supplier_signals", "quality_scan_supplier_reviews"],
    ["quality_customer_signals", "quality_scan_customer_voice"],
    ["quality_knowledge_signals", "quality_scan_people_signals"],
  ] as const) {
    const m = ATTENTION_MECHANISMS.find((x) => x.name === tabla)!;
    assert(m.klass === "observer_result", `${tabla} no se clasifica como resultado`);
    assert(m.writer === barrido, `${tabla} dice escribirla ${m.writer}`);
    assert(CUERPOS.get(barrido)!.includes(`insert into ${tabla}`),
      `${barrido} no escribe en ${tabla}`);
    assert(m.consumers.length > 0, `${tabla} se queda sin consumidor declarado`);
  }
});

check("B4. Los avisos y pendientes son SALIDAS, no fuentes de verdad", () => {
  const m = ATTENTION_MECHANISMS.find((x) => x.name === "work_alerts / work_tasks")!;
  assert(m.klass === "observer_result", "se clasifican como algo distinto de una salida");
  assert(/destinatarios/i.test(m.authoritativeFor),
    "no se explica que se multiplican por destinatario y por eso no se cuentan");
});

// ===========================================================================
console.log("\nC · Los diez de 13A, uno por uno");
// ===========================================================================

check("C1. Están los diez, y son los diez que 13A nombró", () => {
  assert(LEGACY_TEN.length === 10, `hay ${LEGACY_TEN.length} en vez de diez`);
  const esperados = [
    "quality_scan_audits", "quality_scan_customer_voice", "quality_scan_management_reviews",
    "quality_scan_people_signals", "quality_scan_risk_reviews", "quality_scan_supplier_reviews",
    "quality_risk_signals", "quality_supplier_signals", "quality_customer_signals",
    "quality_knowledge_signals",
  ];
  for (const n of esperados) {
    assert(LEGACY_TEN.some((l) => l.name === n), `falta ${n}`);
  }
});

check("C2. Cada uno existe de verdad: función o tabla", () => {
  for (const l of LEGACY_TEN) {
    if (l.kind === "sweep") {
      assert(CUERPOS.has(l.name), `el barrido ${l.name} no existe`);
    } else {
      assert(TODO.includes(`create table public.${l.name}`), `la tabla ${l.name} no existe`);
    }
  }
});

check("C3. Cada uno lleva veredicto y motivo, y ninguno se borra", () => {
  for (const l of LEGACY_TEN) {
    assert(["keep", "supersede", "rewrite", "defer"].includes(l.classification),
      `${l.name} sin clasificar`);
    assert(l.reason.length > 40, `${l.name} sin motivo suficiente`);
    assert(l.classification !== "supersede",
      `${l.name} se declara relevado y ninguno de los diez lo está`);
  }
});

check("C4. El recuento de condiciones de cada barrido cuadra con el inventario", () => {
  for (const l of LEGACY_TEN) {
    if (l.kind !== "sweep") continue;
    const n = OBSERVERS.filter((o) => o.mechanism === l.name).length;
    assert(n === l.conditions,
      `${l.name} declara ${l.conditions} condiciones y el inventario tiene ${n}`);
  }
});

check("C5. Un barrido NO es un observador: casi todos miran varias cosas", () => {
  const multi = LEGACY_TEN.filter((l) => l.kind === "sweep" && l.conditions > 1);
  assert(multi.length >= 5,
    `solo ${multi.length} barridos con más de una condición: el hallazgo del tramo no se sostiene`);
  const uno = LEGACY_TEN.filter((l) => l.kind === "sweep" && l.conditions === 1);
  assert(uno.length === 1 && uno[0].name === "quality_scan_risk_reviews",
    "el único barrido de una sola condición debería ser el de revisiones de riesgo");
});

// ===========================================================================
console.log("\nD · Compatibilidad antes de relevar (§25)");
// ===========================================================================

check("D1. Solo hay DOS relevos, y son los que ya existían", () => {
  const relevados = OBSERVERS.filter((o) => o.supersededBy !== null);
  assert(relevados.length === 2, `hay ${relevados.length} relevos`);
  const codigos = relevados.map((o) => o.code).sort();
  assert(codigos[0] === "quality_scan_pending_measurements.measurement_due"
      && codigos[1] === "work_scan_pending_actions.action_overdue",
    `los relevos son ${codigos.join(" · ")}`);
});

check("D2. Cada relevo declara la plantilla que lo releva, y esa plantilla existe", () => {
  for (const o of OBSERVERS) {
    if (!o.supersededBy) continue;
    assert(TODO.includes(`('${o.supersededBy}',`),
      `la plantilla ${o.supersededBy} no está en ninguna migración`);
    assert(["already_superseded", "safe_to_supersede"].includes(o.compatibility),
      `${o.code} está relevado con veredicto ${o.compatibility}`);
  }
});

check("D3. Cada NO equivalente explica por qué NO", () => {
  const noEq = OBSERVERS.filter((o) => o.compatibility === "not_equivalent");
  assert(noEq.length >= 6, `solo ${noEq.length} comprobaciones de compatibilidad negativas`);
  for (const o of noEq) {
    assert(o.note.length > 80, `${o.code} rechaza el relevo sin explicarlo`);
    assert(o.supersededBy === null, `${o.code} se releva pese a no ser equivalente`);
  }
});

check("D4. Y ninguno se releva sin candidato", () => {
  for (const o of OBSERVERS) {
    if (o.compatibility === "no_candidate") {
      assert(o.supersededBy === null, `${o.code} se releva sin plantilla candidata`);
    }
  }
});

check("D5. El defecto está inventariado como lo que es", () => {
  const eff = observerByCode("work_scan_pending_actions.effectiveness_due")!;
  assert(eff, "no está inventariada la condición de eficacia");
  assert(eff.supersededBy === null, "se declara relevada, y ninguna plantilla la observa");
  assert(/DEFECTO/.test(eff.note), "no se nombra el defecto que este tramo encontró");
  // Ninguna de las 26 plantillas la releva.
  assert(!TODO.includes("'work_scan_pending_actions.effectiveness_due'")
      || TODO.match(/'work_scan_pending_actions\.effectiveness_due'/g)!.length <= 2,
    "alguna plantilla declara relevar la eficacia");
});

check("D6. Relevar un barrido entero apagaría condiciones que nadie releva", () => {
  const perdidas = conditionsSilencedBySweepSupersession("work_scan_pending_actions");
  assert(perdidas.length === 1 && perdidas[0].code.endsWith("effectiveness_due"),
    `apagaría ${perdidas.map((p) => p.code).join(", ")}`);
  // El barrido de mediciones NO pierde nada: por eso su relevo siempre fue seguro.
  assert(conditionsSilencedBySweepSupersession("quality_scan_pending_measurements").length === 0,
    "el barrido de mediciones perdería condiciones al relevarse, y no debería");
});

// ===========================================================================
console.log("\nE · La migración 0153");
// ===========================================================================

const M0153 = readFileSync(join(DIR, "0153_quality_attention_convergence.sql"), "utf8");

/**
 * B3 se entregó sobre 0153 y esa es su migración. Fijar aquí la cabecera del
 * repositorio era una foto, no un invariante: la puso en rojo el primer tramo
 * que añadió otra migración por un motivo distinto. Lo que se comprueba es la
 * promesa —que 0153 existe y es la de B3—, no cuántas vinieron después.
 */
check("E1. Existe, y no se ha tocado desde entonces", () => {
  assert(FICHEROS.includes("0153_quality_attention_convergence.sql"),
    "desapareció la migración de B3");
  const posteriores = FICHEROS.filter((f) => Number(f.slice(0, 4)) > 153);
  for (const f of posteriores) {
    const c = readFileSync(join(DIR, f), "utf8");
    assert(!/quality_observer_is_superseded|work_scan_pending_actions|quality_scan_/.test(c),
      `${f} vuelve a tocar el relevo de observadores que B3 dejó cerrado`);
  }
});

check("E2. NO crea ninguna tabla · ni sexta de atención, ni de tablero", () => {
  assert(!/create table/i.test(M0153), "0153 crea una tabla");
  for (const prohibida of ["quality_attention", "quality_dashboard", "quality_observers",
                           "quality_supplier_processes", "quality_complaint_processes"]) {
    assert(!M0153.includes(prohibida), `0153 nombra la tabla prohibida ${prohibida}`);
  }
});

check("E3. NO crea un motor de tareas nuevo", () => {
  assert(!/create table public\.work_/i.test(M0153), "0153 crea una tabla de trabajo");
  // Los `insert into work_alerts` que hay dentro son los de los DOS barridos
  // reemitidos, literalmente los mismos que ya estaban en 0131. Se comprueba
  // que no aparece ninguno fuera de esos dos cuerpos de función.
  const fuera = M0153.split("create or replace function public.quality_scan_pending_measurements")[0];
  assert(!/insert into work_/i.test(fuera),
    "0153 escribe avisos o pendientes fuera de los barridos que reemite");
  assert(!/create table|create sequence/i.test(M0153), "0153 crea estructura nueva");
});

check("E4. NO borra ni desactiva ningún barrido", () => {
  assert(!/drop function/i.test(M0153), "0153 borra una función");
  assert(!/drop table/i.test(M0153), "0153 borra una tabla");
  assert(!/cascade/i.test(M0153), "0153 usa CASCADE");
});

check("E5. El relevo se comprueba condición a condición", () => {
  assert(M0153.includes("create or replace function public.quality_observer_is_superseded"),
    "0153 no crea el resolvedor de relevo");
  assert(M0153.includes("'work_scan_pending_actions.action_overdue'"),
    "no se guarda la condición de acción vencida por su código cualificado");
  assert(M0153.includes("'work_scan_pending_actions.effectiveness_due'"),
    "la condición de eficacia no pregunta por su cuenta");
  assert(M0153.includes("'quality_scan_pending_measurements.measurement_due'"),
    "la condición de medición pendiente no se cualifica");
  // Y ya no queda la guarda vieja de función entera.
  const barridos = M0153.split("-- 2 · LOS DOS BARRIDOS")[1] ?? "";
  assert(!/supersedes_observer = 'work_scan_pending_actions'\)/.test(barridos),
    "sigue la guarda antigua de barrido entero dentro de la función");
});

check("E6. La forma antigua se sigue honrando", () => {
  assert(M0153.includes("split_part(p_observer, '.', 1)"),
    "el resolvedor no admite el nombre del barrido a secas, que es lo ya guardado");
});

check("E7. Las actualizaciones son ACOTADAS, no un barrido general", () => {
  const updates = [...M0153.matchAll(/update public\.[a-z_]+[\s\S]*?;/g)].map((m) => m[0]);
  assert(updates.length === 4, `hay ${updates.length} actualizaciones`);
  for (const u of updates) {
    assert(/where/i.test(u), "una actualización sin `where`");
    assert(/(template_code|code) =/.test(u), "una actualización que no acota por plantilla");
    assert(/supersedes_observer = '[a-z_]+'/.test(u),
      "una actualización que no acota por el valor exacto que corrige");
  }
});

// ===========================================================================
console.log("\nF · Lo que NO se toca");
// ===========================================================================

check("F1. Ni el motor, ni su clave, ni el estado de las señales", () => {
  for (const prohibido of ["quality_signals_open_dedupe_uniq", "quality_signal_acknowledge",
                           "quality_signal_resolve", "quality_signal_suppress",
                           "quality_automation_emit", "quality_automation_subjects"]) {
    assert(!M0153.includes(prohibido), `0153 toca ${prohibido}`);
  }
});

check("F2. Reconocer NO es resolver, y la base ya lo garantiza", () => {
  const ack = CUERPOS.get("quality_signal_acknowledge");
  assert(ack, "no existe la función de reconocer");
  assert(!/resolved_at\s*=/.test(ack!), "reconocer toca la fecha de resolución");
  const res = CUERPOS.get("quality_signal_resolve")!;
  assert(/resolved_at = now\(\)/.test(res), "resolver no marca la resolución");
});

check("F3. Ningún observador abre casos ni acciones por su cuenta", () => {
  for (const o of OBSERVERS) {
    assert(o.createsCase === false, `${o.code} dice abrir un caso automáticamente`);
  }
  // Y ninguno de los barridos inserta en work_cases ni en work_actions.
  for (const l of LEGACY_TEN) {
    if (l.kind !== "sweep") continue;
    const b = CUERPOS.get(l.name)!;
    assert(!/insert into work_cases|insert into work_actions/.test(b),
      `${l.name} abre un caso o una acción por su cuenta`);
  }
});

check("F4. Y ninguno llama «no conformidad» a lo que no lo es", () => {
  for (const o of OBSERVERS) {
    assert(!/no conformidad/i.test(o.condition),
      `${o.code} llama no conformidad a su condición`);
  }
  const hallazgo = observerByCode("quality_scan_audits.audit_finding_unevaluated")!;
  assert(/sin evaluar/i.test(hallazgo.condition), "el hallazgo no se describe por su evaluación");
  const meta = observerByCode("quality_emit_performance_signals.indicator_target_missed")!;
  assert(/NO es una no conformidad/i.test(meta.note),
    "no se aclara que estar fuera de meta no es una no conformidad");
});

check("F5. La tarea propia de dominio sigue siendo propia (QI-24)", () => {
  for (const code of ["quality_scan_people_signals.knowledge_transfer_overdue",
                      "quality_scan_people_signals.learning_effectiveness_pending",
                      "quality_scan_people_signals.development_item_pending"]) {
    const o = observerByCode(code)!;
    assert(o, `falta ${code}`);
    assert(o.subjectKind.startsWith("quality_"),
      `${code} apunta a un sujeto transversal en vez de al suyo`);
    assert(o.subjectKind !== "work_action", `${code} se convirtió en acción`);
  }
});

// ===========================================================================
console.log("\nG · Búsqueda y resúmenes");
// ===========================================================================

check("G1. Cada aviso emitido encuentra a su observador", () => {
  for (const o of OBSERVERS) {
    for (const t of o.alertTypes) {
      assert(observerForAlert(t), `el aviso «${t}» no encuentra observador`);
    }
    for (const t of o.taskTypes) {
      assert(observerForTask(t), `el pendiente «${t}» no encuentra observador`);
    }
  }
  assert(observerForAlert("no_existe") === null, "se inventa un observador para un tipo ajeno");
});

check("G2. «Vencido» y «por vencer» solo donde significan algo", () => {
  const codigos = new Set(OBSERVERS.map((o) => o.code));
  for (const c of [...OVERDUE_OBSERVERS, ...DUE_SOON_OBSERVERS, ...TIMING_UNDECIDABLE]) {
    assert(codigos.has(c), `${c} no está en el inventario`);
  }
  const solapan = OVERDUE_OBSERVERS.filter((c) => DUE_SOON_OBSERVERS.includes(c));
  assert(solapan.length === 0, `en las dos listas: ${solapan.join(", ")}`);
  assert(TIMING_UNDECIDABLE.length > 0,
    "no se reconoce ningún caso indecidible, y hay al menos uno");
  for (const c of TIMING_UNDECIDABLE) {
    assert(!OVERDUE_OBSERVERS.includes(c) && !DUE_SOON_OBSERVERS.includes(c),
      `${c} es indecidible y a la vez está clasificado`);
  }
});

check("G3. Los avisos informativos están identificados", () => {
  for (const t of INFORMATIONAL_ALERTS) {
    assert(VOC_ALERTAS.includes(t), `${t} no es un aviso real`);
    assert(observerForAlert(t), `${t} no tiene observador`);
  }
  assert(INFORMATIONAL_ALERTS.includes("document_approved"),
    "«documento aprobado» se cuenta como algo que requiere atención");
});

// ===========================================================================
console.log("\nH · El cargador convergido");
// ===========================================================================

const CARGADOR = readFileSync("lib/db/quality-attention.ts", "utf8");
const RESUMEN = readFileSync("lib/domain/quality-attention.ts", "utf8");

check("H1. NO lee la tabla dormida", () => {
  assert(!CARGADOR.includes('"quality_risk_signals"'),
    "el cargador lee quality_risk_signals, que no la escribe nadie");
  assert(/no se lee/i.test(CARGADOR), "no se explica por qué no se lee");
});

check("H2. NO usa service_role ni se crea su propio cliente", () => {
  assert(!/service_role|SERVICE_ROLE/.test(CARGADOR), "el cargador usa service_role");
  assert(!/createClient\(/.test(CARGADOR), "el cargador se crea un cliente propio");
});

check("H3. NO escribe nada", () => {
  assert(!/\.(insert|update|upsert|delete)\(/.test(CARGADOR),
    "el cargador de atención escribe");
});

check("H4. No inventa gravedad ni puntuación global", () => {
  for (const [n, src] of [["cargador", CARGADOR], ["resumen", RESUMEN]] as const) {
    // Sin los comentarios: nombrar lo que NO se hace es parte de explicarlo.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert(!/attention_score|quality_priority|severity_score/i.test(codigo),
      `el ${n} inventa una escala global`);
  }
  assert(/no se promedian/i.test(RESUMEN), "no se declara que las gravedades no se promedian");
});

check("H5. El estado se DERIVA: ninguna tabla mutable nueva", () => {
  assert(/Nada de esto se guarda/i.test(RESUMEN),
    "no se declara que el estado no se persiste");
  const codigo = RESUMEN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/\.(insert|update|upsert|delete)\(/.test(codigo), "el módulo de estado escribe");
});

console.log(`\nQUALITY-13B3 · inventario: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
