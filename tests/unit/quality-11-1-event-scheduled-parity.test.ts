/**
 * Trazaloop · QUALITY-11.1 · Puras y estáticas.
 *
 * Comprueban que los dos huecos se cerraron REUTILIZANDO lo que ya existía, y
 * no construyendo al lado:
 *
 *   · un solo evaluador — el de QUALITY-11;
 *   · un solo ejecutor de salidas — extraído aquí para que los dos caminos lo
 *     compartan de verdad, en vez de parecerse;
 *   · un solo proveedor de sujetos — el mismo, acotable a uno;
 *   · un solo outbox — `work_events`, que ya escribían las RPC de dominio;
 *   · ninguna cola externa, ningún segundo planificador, ninguna IA.
 *
 * Y que lo que el puente NO puede hacer sigue sin poder hacerse: reaccionar a
 * un hecho que la propia automatización produjo, leer una tabla que venga del
 * JSON de un evento, o decidir algo que decide una persona.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeEventRule, describeSignalOrigin, EVENT_DELIVERY_IS_ACKNOWLEDGED,
  EVENT_IS_NOT_A_DECISION, ONE_CONDITION_ONE_SIGNAL, RUN_KINDS, RUN_KIND_LABEL,
  TRIGGER_KINDS, TRIGGER_KIND_LABEL, TRIGGER_KIND_MEANING,
} from "../../lib/domain/quality-automation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIG = "supabase/migrations/0131_quality_automation_event_bridge.sql";
const SQL = stripSql(read(MIG));
const RAW = read(MIG);
const DOMAIN = read("lib/domain/quality-automation.ts");
const DB = read("lib/db/quality-automation.ts");
const ACTIONS = read("server/actions/quality-automation.ts");
const RUNNER = read("app/api/automation/run/route.ts");

const COMPONENTS_DIR = "components/domain/quality/automation";
const COMPONENTS = readdirSync(join(ROOT, COMPONENTS_DIR))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => read(join(COMPONENTS_DIR, f))).join("\n");

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

function functionBody(name: string, src = SQL): string {
  const i = src.indexOf(`function public.${name}`);
  assert(i >= 0, `no existe la función ${name}`);
  const rest = src.slice(i);
  return rest.slice(0, rest.indexOf("$$;") + 3);
}

const PROCESADOR = functionBody("quality_automation_process_events");
const EMISOR = functionBody("quality_automation_emit");
const MOTOR = functionBody("quality_automation_run");

console.log("\nQUALITY-11.1 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · NO SE REDISEÑÓ NADA (§2)");

check("A1. la migración NO crea un segundo motor de nada", () => {
  const tablas = [...SQL.matchAll(/create table if not exists public\.([a-z0-9_]+)/g)]
    .map((m) => m[1]);
  assert(tablas.length === 3,
    `QUALITY-11.1 crea ${tablas.length} tablas: ${tablas.join(", ")}`);
  for (const t of tablas) {
    assert(/event_catalog|event_contracts|event_deliveries/.test(t),
      `la tabla ${t} no es del puente de eventos`);
  }
  for (const prohibido of ["queue", "outbox", "job", "worker", "notification"]) {
    assert(!SQL.includes(`create table if not exists public.quality_automation_${prohibido}`),
      `se creó una tabla de ${prohibido}: eso es infraestructura nueva`);
  }
});

check("A2. NO se introdujo ninguna cola externa (§27)", () => {
  for (const veneno of ["kafka", "redis", "rabbit", "sqs", "pubsub", "pg_net", "pgmq"]) {
    assert(!new RegExp(veneno, "i").test(SQL), `la migración menciona ${veneno}`);
    assert(!new RegExp(veneno, "i").test(stripTs(DB) + stripTs(ACTIONS)),
      `el código menciona ${veneno}`);
  }
});

check("A3. el outbox es `work_events`, que ya existía (§28)", () => {
  assert(/from work_events e/.test(PROCESADOR),
    "el procesador no lee la bitácora transversal");
  assert(!/create table (if not exists )?public\.work_events/.test(SQL),
    "se recreó la bitácora");
});

check("A4. NADA de IA (§objetivo)", () => {
  const PROHIBIDO = /api\.openai|new OpenAI|@anthropic|gpt-[0-9]|pgvector|embedding_|llm_/i;
  for (const [n, src] of [["migración", SQL], ["dominio", stripTs(DOMAIN)],
                          ["db", stripTs(DB)], ["acciones", stripTs(ACTIONS)],
                          ["pantalla", stripTs(COMPONENTS)]] as const) {
    const m = PROHIBIDO.exec(src);
    assert(m === null, `${n}: aparece «${m?.[0]}»`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nB · GAP-01 · PARIDAD PROGRAMADA (§3…§8)");

check("B1. los dos barridos heredados dejan de exigir sesión, sin perder permisos", () => {
  for (const f of ["quality_scan_pending_measurements", "work_scan_pending_actions"]) {
    const cuerpo = functionBody(f);
    assert(!/if auth\.uid\(\) is null then raise exception/.test(cuerpo),
      `${f} sigue exigiendo sesión: el barrido programado no puede ejecutarlo`);
    assert(/if auth\.uid\(\) is not null then/.test(cuerpo),
      `${f} dejó de comprobar el rol cuando SÍ hay sesión`);
    assert(/No perteneces a esta empresa/.test(cuerpo),
      `${f} perdió la comprobación de pertenencia`);
    assert(/Solo la administración o el área de calidad/.test(cuerpo),
      `${f} perdió la comprobación de rol`);
  }
});

check("B2. su lógica de negocio NO se tocó", () => {
  // Las claves de dedupe y los tipos de salida son los de QUALITY-03 y
  // QUALITY-04: si cambiaran, sus suites lo verían y sus bandejas también.
  const pm = functionBody("quality_scan_pending_measurements");
  assert(/'ev:due:'/.test(pm) && /'tk:due:'/.test(pm) && /'al:due:'/.test(pm),
    "las claves de dedupe de las mediciones pendientes cambiaron");
  assert(/'indicator\.measurement_due'/.test(pm), "el tipo de evento cambió");
  const pa = functionBody("work_scan_pending_actions");
  assert(/'ev:act:overdue:'/.test(pa) && /'al:act:overdue:'/.test(pa),
    "las claves de dedupe de las acciones vencidas cambiaron");
  assert(/'al:act:eff:'/.test(pa), "la clave de la eficacia pendiente cambió");
});

check("B3. y aprenden a CEDER ante la regla que les releva (§8)", () => {
  for (const f of ["quality_scan_pending_measurements", "work_scan_pending_actions"]) {
    const cuerpo = functionBody(f);
    assert(new RegExp(`supersedes_observer = '${f}'`).test(cuerpo),
      `${f} no comprueba si la empresa adoptó la regla equivalente`);
    assert(/r\.status = 'active'/.test(cuerpo),
      `${f} cedería ante una regla que ni siquiera está activa`);
    assert(/return 0;/.test(cuerpo), `${f} no calla cuando debe callar`);
  }
});

check("B4. las tres condiciones heredadas existen como plantilla (§39)", () => {
  for (const p of ["indicator_measurement_due", "action_overdue",
                   "action_effectiveness_pending"]) {
    assert(SQL.includes(`'${p}'`), `falta la plantilla ${p}`);
  }
  // Y las dos que relevan lo declaran.
  const bloque = SQL.slice(SQL.indexOf("insert into public.quality_automation_rule_templates"));
  assert(/'quality_scan_pending_measurements'/.test(bloque),
    "ninguna plantilla releva el barrido de mediciones");
  assert(/'work_scan_pending_actions'/.test(bloque),
    "ninguna plantilla releva el barrido de acciones");
});

check("B5. el catálogo tipado ganó los dos hechos que faltaban (§5, §6)", () => {
  assert(/'measurement_period_closed'/.test(SQL),
    "sin este hecho, la regla equivalente reclamaría periodos ya cerrados");
  assert(/'requires_effectiveness'/.test(SQL),
    "sin este hecho, la regla de eficacia reclamaría a todas las acciones");
  const proveedor = functionBody("quality_automation_subjects");
  assert(/quality_period_is_closed\(/.test(proveedor),
    "el proveedor no calcula si el periodo está cerrado");
  assert(/a\.requires_effectiveness/.test(proveedor),
    "el proveedor no expone si la acción exige verificar eficacia");
});

// ---------------------------------------------------------------------------
console.log("\nC · GAP-02 · EL PUENTE (§10…§21)");

check("C1. el enrutador filtra por tipo de hecho, no evalúa todo (§15)", () => {
  assert(/v\.event_types @> array\[v_ev\.event_type\]/.test(PROCESADOR),
    "el enrutador no filtra por el tipo del hecho: sería N×M");
  assert(/trigger_kind = 'event'/.test(PROCESADOR),
    "el enrutador no distingue las reglas por evento");
  assert(/using gin \(event_types\)/.test(SQL),
    "no hay índice para enrutar por tipo de hecho");
  assert(/distinct on \(r\.id\)/.test(PROCESADOR),
    "una regla podría evaluarse dos veces con dos versiones");
});

check("C2. el sujeto se traduce por CONTRATO, nunca por el JSON del hecho (§17)", () => {
  assert(/from quality_automation_event_contracts/.test(PROCESADOR),
    "el procesador no usa los contratos registrados");
  assert(!/payload ->>|payload->>/.test(PROCESADOR),
    "el procesador lee el payload del evento para resolver el sujeto");
  assert(!/execute format|execute '/.test(PROCESADOR),
    "el procesador construye SQL en tiempo de ejecución");
  // Los resolutores son con nombre, escritos a mano.
  assert(/when 'direct' then/.test(PROCESADOR),
    "no existe el resolutor directo");
  assert(/resolver in \('direct', 'supplier_evaluation_to_scope'\)/.test(SQL),
    "los resolutores no están acotados");
});

check("C3. y la fuente de la regla tiene que ser la del contrato", () => {
  assert(/v_rule\.source_code <> v_con\.source_code/.test(PROCESADOR),
    "una regla podría reaccionar a un hecho que habla de otro objeto");
});

check("C4. el evaluador es EL MISMO (§19)", () => {
  assert(/quality_automation_evaluate\(/.test(PROCESADOR),
    "el puente no usa el evaluador de QUALITY-11");
  assert(!/create or replace function public\.quality_automation_evaluate/.test(SQL),
    "el puente reescribió el evaluador");
  assert(!/create or replace function public\.quality_automation_check/.test(SQL),
    "el puente reescribió el comparador");
});

check("C5. el proveedor de sujetos es EL MISMO, acotado (§18)", () => {
  assert(/quality_automation_subjects\(\s*\n?\s*p_organization_id, v_rule\.source_code, v_today, 1, v_sub_id\)/
    .test(PROCESADOR),
    "el puente no reutiliza el proveedor de sujetos");
  const proveedor = functionBody("quality_automation_subjects");
  assert(/p_subject_id      uuid default null/.test(proveedor),
    "el proveedor no admite acotarse a un sujeto");
  const ramas = (proveedor.match(/p_subject_id is null or/g) ?? []).length;
  assert(ramas === 18, `solo ${ramas} de las 18 fuentes admiten el filtro por sujeto`);
});

check("C6. el ejecutor de salidas es UNO, y los dos caminos lo llaman (§20)", () => {
  assert(/quality_automation_emit\(/.test(PROCESADOR), "el puente no usa el ejecutor");
  assert(/quality_automation_emit\(/.test(MOTOR), "el barrido no usa el ejecutor");
  // Y ninguno de los dos inserta señales por su cuenta.
  assert(!/insert into quality_signals/.test(PROCESADOR),
    "el puente inserta señales directamente");
  assert(!/insert into quality_signals/.test(MOTOR),
    "el barrido inserta señales directamente");
  assert(/insert into quality_signals/.test(EMISOR),
    "el ejecutor no es quien emite la señal");
});

check("C7. el dedupe es el mismo en los dos caminos: por eso no colisionan (§59)", () => {
  const clave = functionBody("quality_automation_dedupe_key");
  assert(/'auto:' \|\| p_version_id::text \|\| ':' \|\| p_subject_id::text/.test(clave),
    "la clave de dedupe cambió de forma");
  assert(!/event|run|today/.test(clave.replace(/QUALITY.*/g, "")),
    "la clave incluye el camino o la fecha: entonces sí podrían duplicarse");
  assert(/quality_automation_dedupe_key\(/.test(MOTOR)
    && /quality_automation_dedupe_key\(v_version_id/.test(EMISOR)
      || /quality_automation_dedupe_key\(p_version_id, p_subject_id\)/.test(EMISOR),
    "los dos caminos no calculan la clave con la misma función");
  assert(ONE_CONDITION_ONE_SIGNAL.length > 60, "no está escrito por qué no colisionan");
});

check("C8. el linaje llega hasta el hecho (§21)", () => {
  assert(/add column if not exists source_event_id uuid references public\.work_events/.test(SQL),
    "la señal no puede recordar el hecho que la disparó");
  assert(/p_event_id/.test(EMISOR), "el ejecutor no recibe el hecho de origen");
  assert(/source_event_id\)/.test(EMISOR), "el ejecutor no guarda el hecho de origen");
  assert(/'source_event_id', p_event_id/.test(EMISOR),
    "el hecho de la bitácora no anota de qué hecho vino");
});

// ---------------------------------------------------------------------------
console.log("\nD · IDEMPOTENCIA Y REINTENTO (§22, §23, §57)");

check("D1. el acuse de entrega es único por hecho y versión", () => {
  assert(/unique \(organization_id, event_id, rule_version_id\)/.test(SQL),
    "no hay restricción única sobre la entrega: procesar dos veces duplicaría");
  assert(/on conflict \(organization_id, event_id, rule_version_id\) do update/.test(PROCESADOR),
    "el procesador no se apoya en la restricción");
  assert(EVENT_DELIVERY_IS_ACKNOWLEDGED.length > 40, "no está escrito");
});

check("D2. una entrega ya hecha NO se vuelve a evaluar", () => {
  assert(/if v_deliv is null then\s*\n\s*continue;/.test(PROCESADOR),
    "el procesador sigue adelante aunque la entrega ya estuviera hecha");
});

check("D3. una entrega FALLIDA sí se reintenta, y cuenta el intento (§23)", () => {
  assert(/where quality_automation_event_deliveries\.status = 'failed'/.test(PROCESADOR),
    "solo se reintenta… nada: no hay condición de reintento");
  assert(/attempts = quality_automation_event_deliveries\.attempts \+ 1/.test(PROCESADOR),
    "no se cuentan los intentos");
  // Y el reintento tiene que poder VER el hecho aunque la marca de agua haya
  // pasado por encima.
  assert(/d\.status = 'failed'\)\)/.test(PROCESADOR),
    "la marca de agua deja fuera los hechos fallidos: el reintento sería imposible");
});

check("D4. la marca de agua no es la garantía: solo evita releer (§24)", () => {
  assert(/events_processed_through/.test(SQL), "no hay marca de agua");
  assert(/es lo que evita releer la bitácora entera/.test(RAW),
    "no está escrito para qué sirve la marca de agua");
  assert(/Su restricción única es lo que hace idempotente la entrega/.test(RAW),
    "no está escrito que la garantía de no duplicar es el acuse");
});

// ---------------------------------------------------------------------------
console.log("\nE · LO QUE EL PUENTE NO PUEDE HACER (§14, §25, §26)");

check("E1. los hechos de la automatización NO se enrutan (§25)", () => {
  assert(/e\.source_domain <> 'automation'/.test(PROCESADOR),
    "el puente enruta sus propios hechos: el ciclo se cerraría");
});

check("E2. ninguna de las nueve decisiones formales aparece en el puente (§14)", () => {
  const PROHIBIDO: [string, RegExp][] = [
    ["declarar una no conformidad", /insert into work_cases|classification\s*=/],
    ["aprobar un proveedor", /approval_status\s*=|insert into quality_supplier_approval_decisions/],
    ["declarar competencia", /update quality_person_competencies/],
    ["cerrar una acción", /effectiveness_result\s*=/],
    ["cerrar una auditoría", /update quality_audits/],
    ["cerrar la revisión", /update quality_management_reviews/],
  ];
  for (const [nombre, patron] of PROHIBIDO) {
    assert(!patron.test(PROCESADOR), `el puente podría ${nombre}`);
    assert(!patron.test(EMISOR), `el ejecutor podría ${nombre}`);
  }
  assert(EVENT_IS_NOT_A_DECISION.length > 60, "no está escrito que un hecho no decide");
});

check("E3. una regla rota no deshace el hecho de negocio (§26)", () => {
  // El procesamiento ocurre DESPUÉS de la transacción que escribió el hecho:
  // por eso una automatización que falla no puede tumbar una queja guardada.
  assert(/exception when others then/.test(PROCESADOR),
    "una regla rota tumbaría el procesamiento entero");
  assert(/'failed', sqlerrm/.test(PROCESADOR), "el fallo no queda escrito");
  assert(/after insert on public\.quality_customer_feedback/.test(SQL),
    "el hecho de la queja no se emite después de guardarla");
});

check("E4. el hecho se emite DENTRO de la transacción que lo produce (§28)", () => {
  const trg = functionBody("quality_customer_feedback_event");
  assert(/insert into work_events/.test(trg), "el disparador no escribe el hecho");
  assert(!/http|pg_net|perform pg_sleep/.test(trg),
    "el disparador hace un efecto externo dentro de la transacción de negocio");
});

// ---------------------------------------------------------------------------
console.log("\nF · SEGURIDAD (§16, §48, §49)");

check("F1. toda función nueva es definer con `search_path` fijo (§49)", () => {
  const defs = [...SQL.matchAll(/create or replace function public\.([a-z0-9_]+)[\s\S]{0,700}?\$\$/g)];
  for (const d of defs) {
    if (!/security definer/.test(d[0])) continue;
    assert(/set search_path = public/.test(d[0]),
      `${d[1]} es security definer y no fija el search_path`);
  }
});

check("F2. la empresa NO viene del navegador: el rol se comprueba con sesión (§16)", () => {
  assert(/if auth\.uid\(\) is not null then\s*\n\s*if not quality_manages_automation/.test(PROCESADOR),
    "el procesador no comprueba el rol de quien lo dispara");
  const acciones = stripTs(ACTIONS);
  assert(/processEventsAction/.test(acciones), "no hay acción para procesar hechos");
  assert(!/p_organization_id: formData|organization_id"\)/.test(acciones),
    "alguna acción acepta la empresa desde el formulario");
});

check("F3. el cliente no manda un tipo de hecho inventado (§16, §35)", () => {
  const acciones = stripTs(ACTIONS);
  assert(/readEventTypes/.test(acciones), "los hechos no se rearman en el servidor");
  assert(/\^\[a-z_\]\+\\\.\[a-z_\]\+\$/.test(acciones),
    "no se comprueba la forma del tipo de hecho recibido");
  // Y la base rechaza cualquiera que no esté en el catálogo.
  const val = functionBody("quality_automation_validate_event_version");
  assert(/no es un hecho observable del catálogo/.test(val),
    "un hecho inventado pasaría la validación");
});

check("F4. los acuses y los catálogos son de solo lectura para la sesión", () => {
  assert(/grant select on table public\.quality_automation_event_deliveries to authenticated/.test(SQL),
    "los acuses no se pueden leer");
  assert(!/grant [^;]*(insert|update|delete)[^;]*quality_automation_event_deliveries/.test(SQL),
    "una sesión puede escribir un acuse");
  for (const t of ["quality_automation_event_catalog", "quality_automation_event_contracts"]) {
    assert(new RegExp(`revoke all on table public\\.${t} from anon, authenticated`).test(SQL),
      `${t} no revoca los privilegios por omisión`);
    assert(new RegExp(`grant select on table public\\.${t} to authenticated`).test(SQL),
      `${t} no concede lectura`);
  }
  assert(/before delete on public\.quality_automation_event_deliveries/.test(SQL),
    "los acuses se pueden borrar: son la prueba de qué vio qué regla");
});

check("F5. un hecho de negocio no se puede falsificar desde una sesión (§48)", () => {
  // `work_events` es de solo lectura para `authenticated` desde 0118, y esta
  // migración no lo cambia.
  assert(!/grant [^;]*insert[^;]*on (table )?public\.work_events/.test(SQL),
    "la migración concedió escritura sobre la bitácora de hechos");
});

// ---------------------------------------------------------------------------
console.log("\nG · LA PANTALLA Y EL PLANIFICADOR (§29, §35, §36, §37, §38)");

check("G1. el constructor dice CUÁNDO MIRA, y ofrece los hechos del catálogo", () => {
  assert(/CUÁNDO MIRA/.test(COMPONENTS), "el constructor no pregunta cuándo mira");
  assert(/CUANDO OCURRE/.test(COMPONENTS), "el constructor no ofrece los hechos");
  assert(/name="trigger_kind"/.test(COMPONENTS), "no se puede elegir el disparo");
  assert(/name="event_type"/.test(COMPONENTS), "no se pueden marcar los hechos");
  assert(!/JSON\.stringify\(.*event_types/.test(COMPONENTS),
    "la pantalla muestra JSON técnico");
});

check("G2. las dos formas de mirar se explican en castellano (§35)", () => {
  assert(TRIGGER_KINDS.join() === "schedule,event", "los disparos cambiaron");
  for (const k of TRIGGER_KINDS) {
    assert(TRIGGER_KIND_LABEL[k].length > 5, `${k} no tiene nombre visible`);
    assert(TRIGGER_KIND_MEANING[k].length > 60, `${k} no explica qué significa`);
    assert(!/trigger|event_type|cron/i.test(TRIGGER_KIND_LABEL[k]),
      `${k} usa jerga técnica en su nombre`);
  }
});

check("G3. el resumen de una regla por evento se genera SIN modelo (§36)", () => {
  const frase = describeEventRule(
    ["Se registró una queja"],
    [{ field: "feedback_kind", operator: "equals", value: "complaint" }],
    [{ kind: "CREATE_SIGNAL" }, { kind: "CREATE_ALERT", recipientKind: "rule_owner_position" }],
    { feedback_kind: "Tipo" }
  );
  assert(frase.startsWith("Cuando "), `la frase no empieza por el hecho: ${frase}`);
  assert(/emitirá una señal/.test(frase) && /avisará/.test(frase),
    `la frase no dice qué hará: ${frase}`);
  assert(!/complaint\.recorded|CREATE_SIGNAL|jsonb/.test(frase),
    `la frase filtra jerga técnica: ${frase}`);
  const otra = describeEventRule(
    ["Se registró una queja"],
    [{ field: "feedback_kind", operator: "equals", value: "complaint" }],
    [{ kind: "CREATE_SIGNAL" }, { kind: "CREATE_ALERT", recipientKind: "rule_owner_position" }],
    { feedback_kind: "Tipo" }
  );
  assert(frase === otra, "la misma regla produce dos frases distintas");
});

check("G4. las ejecuciones distinguen su origen (§37)", () => {
  assert(RUN_KINDS.includes("event"), "no existe la ejecución por evento");
  assert(RUN_KIND_LABEL.event.length > 5, "la ejecución por evento no tiene nombre visible");
  assert(/run_kind in \('manual', 'scheduled', 'simulation', 'event'\)/.test(SQL),
    "la base no admite la ejecución por evento");
  assert(/'event', v_today, auth\.uid\(\), 'running'/.test(PROCESADOR),
    "el puente no marca su ejecución como de eventos");
});

check("G5. la señal dice de dónde vino (§38)", () => {
  assert(describeSignalOrigin(true, "Se registró una queja")
    === "Automatización por evento · Se registró una queja",
    "el origen por evento no se nombra como pide el encargo");
  assert(describeSignalOrigin(false, null) === "Observación programada",
    "el origen programado no se nombra como pide el encargo");
  assert(/describeSignalOrigin/.test(COMPONENTS), "la pantalla no muestra el origen");
  assert(/from_event/.test(SQL), "la vista no expone el origen");
});

check("G6. el planificador drena los hechos y luego barre, por la misma puerta (§29)", () => {
  assert(/quality_automation_process_events/.test(RUNNER),
    "el planificador no procesa los hechos pendientes");
  assert(/quality_automation_run/.test(RUNNER), "el planificador dejó de barrer");
  assert(!/insert into|from\("quality_signals"\)/.test(RUNNER),
    "el planificador escribe por su cuenta");
  assert(/event_runs:/.test(RUNNER), "el planificador no informa de lo que enrutó");
});

check("G7. no se configuró ningún cron en Production (§42, §43)", () => {
  let vercel = "";
  try { vercel = read("vercel.json"); } catch { vercel = ""; }
  assert(!/crons/.test(vercel), "se configuró un cron: eso toca configuración de Production");
});

// ---------------------------------------------------------------------------
console.log("\nH · LA MIGRACIÓN (§41)");

check("H1. QUALITY-11.1 es UNA migración, la 0131, y es la última", () => {
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  assert(migraciones.includes("0131_quality_automation_event_bridge.sql"), "falta la 0131");
  assert(migraciones[migraciones.length - 1] === "0131_quality_automation_event_bridge.sql",
    "la 0131 no es la última");
});

check("H2. NO se editaron la 0129 ni la 0130", () => {
  const c129 = read("supabase/migrations/0129_quality_automation_observation.sql");
  const c130 = read("supabase/migrations/0130_quality_automation_scheduled_observers.sql");
  assert(!/QUALITY-11\.1/.test(c129), "la 0129 fue editada por QUALITY-11.1");
  assert(!/QUALITY-11\.1/.test(c130), "la 0130 fue editada por QUALITY-11.1");
});

check("H3. el catálogo de eventos se AMPLÍA, nunca se estrecha", () => {
  assert(/El catálogo de eventos se estaría estrechando/.test(RAW),
    "no hay guarda contra estrechar el catálogo de eventos");
  assert(/array_length\(v_tipos, 1\) < 80/.test(SQL),
    "la guarda no comprueba un mínimo razonable");
});

check("H4. pgcrypto, si se usa, va cualificado por esquema", () => {
  const sin = /[^.\w](gen_random_bytes|digest|crypt)\s*\(/.exec(
    SQL.replace(/extensions\.(gen_random_bytes|digest|crypt)/g, "OK"));
  assert(sin === null, `«${sin?.[1]}» se llama sin cualificar`);
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
