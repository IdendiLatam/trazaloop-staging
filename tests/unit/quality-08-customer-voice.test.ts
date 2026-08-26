/**
 * Trazaloop · QUALITY-08 · Puras y estáticas.
 *
 * Comprueban que las separaciones de VC existan EN EL CÓDIGO y no solo en la
 * prosa del informe:
 *
 *   CLIENTE ≠ CONTACTO ≠ QUIEN RESPONDE
 *   ENCUESTA ≠ VERSIÓN ≠ CAMPAÑA ≠ RESPUESTA
 *   RETROALIMENTACIÓN ≠ QUEJA
 *   QUEJA ≠ NO CONFORMIDAD
 *   RESULTADO DE SATISFACCIÓN ≠ DECISIÓN FORMAL
 *   SEÑAL ≠ CASO ≠ NC
 *
 * y que lo que este dominio NO debe ser —un CRM, una plataforma de marketing,
 * un sistema que homologa satisfacción sola— no se haya colado por una columna,
 * un enum o un cálculo.
 *
 * El bloque más importante es el del ANONIMATO: busca activamente el camino por
 * el que una respuesta anónima podría volver a tener dueño.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateIsSafeToShow, ANONYMITY_MODES, ANSWER_OUTCOMES, answerCounts, averageScore,
  canCloseCustomerVoice, canManageCustomerVoice, CAMPAIGN_STATUSES, comparabilityKey,
  COMPLAINT_IS_NOT_NC, COMPLAINT_KINDS, CUSTOMER_SIGNAL_KINDS, FEEDBACK_KINDS,
  isComplaint, METRIC_METHODS, npsBand, npsScaleIsValid, npsScore, QUESTION_TYPES,
  questionNeedsOptions, questionNeedsScale, RESPONSE_STATUSES, responseRate,
  scaleIsValid, scaleValues, SMALL_GROUP_THRESHOLD, splitComparableSeries,
  SURVEY_VERSION_STATUSES, topBoxPercent, VOICE_SOURCES,
} from "../../lib/domain/quality-customer-voice";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import {
  ALERT_TYPES, ALERT_TYPE_LABEL, SUBJECT_TYPES, TASK_TYPES, TASK_TYPE_LABEL,
} from "../../lib/domain/work-inbox";
import { LIFECYCLE_ENTITIES } from "../../lib/domain/lifecycle";
import { NATIVE_SOURCE_KEYS } from "../../lib/domain/quality-indicators";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
/** Sin esto, una prueba que busca «CRM» falla justamente por el comentario que
 *  explica que NO se construye un CRM. */
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIG = "supabase/migrations/0126_quality_customer_voice.sql";
const SQL = stripSql(read(MIG));
const DOMAIN = read("lib/domain/quality-customer-voice.ts");
const DB = read("lib/db/quality-customer-voice.ts");
const PUBLIC_DB = read("lib/db/quality-survey-public.ts");
const ACTIONS = read("server/actions/quality-customer-voice.ts");
const PUBLIC_ACTION = read("server/actions/quality-survey-public.ts");
const ADAPTERS = read("lib/export/adapters/quality-customer-voice.ts");

const COMPONENTS_DIR = "components/domain/quality/customer-voice";
const componentFiles = readdirSync(join(ROOT, COMPONENTS_DIR)).filter((f) => f.endsWith(".tsx"));
const COMPONENTS = componentFiles.map((f) => read(join(COMPONENTS_DIR, f))).join("\n");

const ROUTES_DIR = "app/(app)/(shell)/quality/customer-voice";
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name)));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(join(dir, e.name));
  }
  return out;
}
const routeFiles = walk(ROUTES_DIR);

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

function tableBody(name: string): string {
  const i = SQL.indexOf(`create table public.${name} (`);
  assert(i >= 0, `no existe la tabla ${name}`);
  const rest = SQL.slice(i);
  return rest.slice(0, rest.indexOf("\n);"));
}

function functionBody(name: string): string {
  const i = SQL.indexOf(`function public.${name}`);
  assert(i >= 0, `no existe la función ${name}`);
  const rest = SQL.slice(i);
  return rest.slice(0, rest.indexOf("$$;") + 3);
}

console.log("\nQUALITY-08 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · CLIENTE = PAPEL DE LA IDENTIDAD EXTERNA (VC-03, §5)");

check("A1. no se creó ninguna tabla de clientes: se creó el PERFIL", () => {
  assert(!/create table public\.customers\b/.test(SQL), "se creó una tabla de clientes");
  assert(!/create table public\.quality_customers\b/.test(SQL), "se creó una tabla de clientes");
  assert(/create table public\.quality_customer_profiles/.test(SQL),
    "no existe el perfil de cliente");
  assert(/party_id\s+uuid not null/.test(tableBody("quality_customer_profiles")),
    "el perfil de cliente no cuelga de la identidad externa");
});

check("A2. la misma empresa puede ser cliente Y proveedor", () => {
  const cuerpo = tableBody("quality_customer_profiles");
  // Un único por (empresa, party) permite UN perfil de cliente por empresa
  // externa, y el perfil de proveedor de QUALITY-07 vive en otra tabla: los dos
  // papeles conviven sobre una sola identidad.
  assert(/unique \(organization_id, party_id\)/.test(cuerpo),
    "una empresa externa podría tener dos perfiles de cliente");
  assert(/is_also_supplier/.test(SQL),
    "la ficha no sabe decir que el mismo cliente es también proveedor");
});

check("A3. PCR apunta a la identidad transversal en vez de duplicarla", () => {
  assert(/alter table public\.customer_requirements\s+add column if not exists external_party_id uuid/.test(SQL),
    "no se abrió el puente con los requisitos de cliente de PCR");
  assert(!/alter table public\.customer_requirements\s+alter column external_party_id set not null/.test(SQL),
    "el puente se declaró obligatorio: PCR dejaría de funcionar sin Quality");
  assert(!/update customer_requirements/i.test(SQL),
    "la migración reescribe datos de PCR");
});

check("A4. la pantalla ofrece REUTILIZAR la empresa antes que crear otra", () => {
  const dir = read(join(COMPONENTS_DIR, "customers.tsx"));
  const reutilizar = dir.indexOf("adoptCustomerAction");
  const crear = dir.indexOf("createCustomerAction");
  assert(reutilizar >= 0 && crear >= 0, "faltan el alta o la reutilización");
  assert(reutilizar < crear,
    "crear un cliente aparece antes que darle el papel a la empresa que ya existe");
  assert(/listPartiesWithoutCustomerRole/.test(DB),
    "no se ofrecen las empresas que todavía no son clientes");
});

// ---------------------------------------------------------------------------
console.log("\nB · CLIENTE ≠ CONTACTO ≠ QUIEN RESPONDE (§6, §7)");

check("B1. los contactos son de la EMPRESA, no del papel de cliente", () => {
  assert(!/create table public\.quality_customer_contacts/.test(SQL),
    "se duplicaron los contactos en vez de reutilizar los de la identidad externa");
  assert(/quality_external_party_contacts/.test(DB),
    "la capa de datos no lee los contactos de la identidad externa");
});

check("B2. la voz NO se guarda contra un nombre de texto", () => {
  const cuerpo = tableBody("quality_customer_feedback");
  assert(/customer_id\s+uuid/.test(cuerpo), "la manifestación no apunta al cliente");
  // `reporter_name` existe para quien todavía no tiene ficha, pero no es la
  // identidad histórica: esa es `customer_id`.
  assert(/contact_id\s+uuid/.test(cuerpo), "no se puede decir qué contacto la trasladó");
});

check("B3. responder NO obliga a crear un contacto", () => {
  const cuerpo = tableBody("quality_survey_responses");
  assert(/respondent_kind\s+text not null/.test(cuerpo),
    "no se distingue quién responde");
  assert(/contact_id\s+uuid,/.test(cuerpo) && !/contact_id\s+uuid not null/.test(cuerpo),
    "la respuesta exige un contacto registrado");
  assert(/respondent_name\s+text/.test(cuerpo),
    "no se puede registrar a quien responde sin ficha");
});

check("B4. un cliente puede existir sin ningún contacto", () => {
  const cuerpo = tableBody("quality_customer_profiles");
  assert(!/contact_id\s+uuid not null/.test(cuerpo),
    "el cliente exige un contacto para existir");
});

// ---------------------------------------------------------------------------
console.log("\nC · FUENTES DE VOZ (VC-01, VC-04, §8)");

check("C1. las cuatro fuentes existen", () => {
  assert(VOICE_SOURCES.length === 4, "faltan fuentes de voz del cliente");
  for (const v of ["relational", "periodic", "transactional", "spontaneous"]) {
    assert((VOICE_SOURCES as readonly string[]).includes(v), `falta la fuente ${v}`);
    assert(SQL.includes(`'${v}'`), `la base no admite la fuente ${v}`);
  }
});

check("C2. la voz espontánea NO tiene que pasar por una encuesta", () => {
  const cuerpo = tableBody("quality_customer_feedback");
  assert(!/response_id\s+uuid not null/.test(cuerpo),
    "toda manifestación exige venir de una respuesta de encuesta");
  assert(!/campaign_id/.test(cuerpo),
    "la manifestación exige una campaña");
  assert(/SATISFACTION_IS_MULTISOURCE/.test(COMPONENTS),
    "la pantalla no dice que la satisfacción no es solo una encuesta");
});

check("C3. el contexto transaccional se REFERENCIA y no se inventa", () => {
  const cuerpo = tableBody("quality_survey_campaigns");
  assert(/context_ref_kind\s+text/.test(cuerpo) && /context_ref_id\s+uuid/.test(cuerpo),
    "no hay forma de anclar una campaña a una transacción");
  assert(/\(context_ref_kind is null\) = \(context_ref_id is null\)/.test(cuerpo),
    "se puede declarar media referencia de contexto");
});

// ---------------------------------------------------------------------------
console.log("\nD · ENCUESTA ≠ VERSIÓN (VC-07, §9, §10, §16)");

check("D1. son dos tablas y las preguntas cuelgan de la VERSIÓN", () => {
  assert(/create table public\.quality_surveys/.test(SQL), "falta la encuesta");
  assert(/create table public\.quality_survey_versions/.test(SQL), "falta la versión");
  assert(/version_id\s+uuid not null/.test(tableBody("quality_survey_questions")),
    "las preguntas cuelgan de la encuesta: cambiar una reescribiría el pasado");
});

check("D2. una versión publicada NO se puede editar", () => {
  assert(/quality_survey_version_is_published/.test(SQL),
    "no hay guarda contra editar una versión publicada");
  assert(/t_quality_survey_questions_only_in_draft/.test(SQL),
    "la guarda existe pero no está conectada a las preguntas");
  const cuerpo = functionBody("quality_survey_version_is_published");
  assert(/v_status is distinct from 'draft'/.test(cuerpo),
    "la guarda no comprueba que la versión siga en borrador");
});

check("D3. publicar cierra la anterior y no toca ninguna respuesta", () => {
  const cuerpo = functionBody("quality_publish_survey_version");
  assert(/status = 'superseded'/.test(cuerpo), "la versión anterior no queda sustituida");
  assert(/effective_to = p_effective_from - 1/.test(cuerpo),
    "la versión anterior no recibe fin de vigencia");
  assert(!/update quality_survey_responses/i.test(cuerpo)
      && !/update quality_survey_answers/i.test(cuerpo),
    "publicar una versión toca respuestas ya recogidas");
});

check("D4. una versión publicada tiene que decir desde cuándo rige", () => {
  const cuerpo = tableBody("quality_survey_versions");
  assert(/status = 'draft' or \(effective_from is not null and published_at is not null\)/.test(cuerpo),
    "se puede publicar una versión sin vigencia");
});

check("D5. la respuesta ata la versión con la que se recogió", () => {
  assert(/version_id\s+uuid not null/.test(tableBody("quality_survey_responses")),
    "la respuesta no dice con qué versión se recogió");
  assert(/quality_survey_version_structure/.test(SQL),
    "no se puede reconstruir la estructura exacta de una versión");
});

// ---------------------------------------------------------------------------
console.log("\nE · PREGUNTAS Y ESCALAS (§11, §12, §13)");

check("E1. siete tipos, ni uno más", () => {
  assert(QUESTION_TYPES.length === 7, `hay ${QUESTION_TYPES.length} tipos de pregunta`);
  assert(!/branch|skip_logic|conditional/i.test(stripTs(DOMAIN) + SQL),
    "aparece lógica condicional: Trazaloop no es un constructor de formularios");
});

check("E2. la pregunta tiene identidad ESTABLE entre versiones", () => {
  const cuerpo = tableBody("quality_survey_questions");
  assert(/stable_key\s+text not null/.test(cuerpo),
    "la pregunta no tiene clave estable: comparar dependería del número de orden");
  assert(/unique \(version_id, stable_key\)/.test(cuerpo),
    "la clave estable puede repetirse dentro de una versión");
  assert(/question_stable_key/.test(tableBody("quality_customer_metric_definitions")),
    "la métrica localiza la pregunta por otra cosa que su clave estable");
});

check("E3. las escalas son CONFIGURABLES, sin ningún 1–5 cableado", () => {
  const cuerpo = tableBody("quality_survey_questions");
  for (const c of ["scale_min", "scale_max", "scale_step"]) {
    assert(new RegExp(`${c}\\s+integer`).test(cuerpo), `falta ${c}`);
  }
  assert(!/scale_min\s+integer\s+not null default 1/.test(cuerpo),
    "la escala trae un 1 cableado por defecto");
  assert(scaleIsValid(0, 10) && scaleIsValid(1, 5) && !scaleIsValid(5, 5),
    "la validación de escalas no distingue una escala real de una degenerada");
  assert(scaleValues(0, 10).length === 11, "la escala 0–10 no produce once valores");
  assert(questionNeedsScale("scale") && !questionNeedsScale("text"),
    "el dominio no sabe qué tipos necesitan escala");
  assert(questionNeedsOptions("single_choice") && !questionNeedsOptions("scale"),
    "el dominio no sabe qué tipos necesitan opciones");
});

check("E4. la base exige lo que cada tipo necesita", () => {
  const cuerpo = tableBody("quality_survey_questions");
  assert(/question_type <> 'scale'/.test(cuerpo) && /scale_max > scale_min/.test(cuerpo),
    "se puede guardar una escala sin extremos o al revés");
  assert(/jsonb_array_length\(options\) >= 2/.test(cuerpo),
    "se puede guardar una pregunta de opciones sin opciones");
});

// ---------------------------------------------------------------------------
console.log("\nF · CAMPAÑA (VC-26, VC-27, §17, §18)");

check("F1. la campaña es otra cosa que la encuesta", () => {
  const cuerpo = tableBody("quality_survey_campaigns");
  assert(/survey_id\s+uuid not null/.test(cuerpo) && /version_id\s+uuid not null/.test(cuerpo),
    "la campaña no ata su encuesta y su versión");
  assert(CAMPAIGN_STATUSES.length === 4, "faltan estados de campaña");
});

check("F2. la misma versión sirve para varias campañas", () => {
  const cuerpo = tableBody("quality_survey_campaigns");
  assert(!/unique \(organization_id, version_id\)/.test(cuerpo),
    "una versión solo se puede usar en una campaña");
});

check("F3. la campaña conoce su periodo y su ventana", () => {
  const cuerpo = tableBody("quality_survey_campaigns");
  for (const c of ["period_label", "period_start", "period_end", "opens_on", "closes_on"]) {
    assert(cuerpo.includes(c), `falta ${c}`);
  }
});

check("F4. reabrir es una decisión con historia", () => {
  const cuerpo = tableBody("quality_survey_campaigns");
  assert(/reopened_at/.test(cuerpo) && /reopen_count/.test(cuerpo) && /reopen_reason/.test(cuerpo),
    "no queda constancia de que una campaña se reabrió");
  const f = functionBody("quality_reopen_survey_campaign");
  assert(/Reabrir una campaña cerrada exige decir por qué/.test(f),
    "se puede reabrir sin motivo");
});

check("F5. solo se aplica una versión PUBLICADA", () => {
  const f = functionBody("quality_open_survey_campaign");
  assert(/v_version\.status <> 'published'/.test(f),
    "se puede abrir una campaña sobre una versión en borrador");
});

check("F6. la versión no se cambia bajo los pies de quien ya respondió", () => {
  const f = functionBody("quality_campaign_anonymity_is_final");
  assert(/new\.version_id is distinct from old\.version_id/.test(f),
    "se puede cambiar la versión de una campaña con respuestas");
});

// ---------------------------------------------------------------------------
console.log("\nG · ANONIMATO REAL (VC-08, VC-29, §22, §23, §65, §100)");

/**
 * Este bloque busca ACTIVAMENTE el camino por el que una respuesta anónima
 * podría volver a tener dueño. No comprueba que exista una promesa: comprueba
 * que no exista la columna, el join ni la ruta que la rompería.
 */

check("G1. la respuesta NO guarda de qué invitación vino cuando es anónima", () => {
  const cuerpo = tableBody("quality_survey_responses");
  assert(/invitation_id\s+uuid,/.test(cuerpo), "no existe el vínculo ni para las identificadas");
  assert(/respondent_kind <> 'anonymous'\s*\n?\s*or \(customer_id is null and contact_id is null/.test(cuerpo)
      || /anonymous_shape_check/.test(cuerpo),
    "una respuesta declarada anónima podría llevar identidad");
  // Y la guarda que lo impone contra la campaña, no solo contra sí misma.
  const f = functionBody("quality_response_matches_campaign_anonymity");
  assert(/anonymity_mode = 'anonymous'/.test(f), "la guarda no mira el modo de la campaña");
  for (const c of ["customer_id", "contact_id", "respondent_name", "respondent_email", "invitation_id"]) {
    assert(new RegExp(`new\\.${c} is not null`).test(f),
      `la guarda no impide guardar ${c} en una campaña anónima`);
  }
});

check("G2. la INVITACIÓN no guarda a qué respuesta dio lugar", () => {
  const cuerpo = tableBody("quality_survey_invitations");
  assert(!/response_id/.test(cuerpo),
    "la invitación apunta a la respuesta: el anonimato se rompe con un join");
});

check("G3. la respuesta no tiene autor: no hay created_by ni force_created_by", () => {
  const cuerpo = tableBody("quality_survey_responses");
  assert(!/created_by/.test(cuerpo),
    "la respuesta guarda quién la escribió: en una anónima eso es la identidad");
  assert(!/t_quality_survey_responses_force_created_by/.test(SQL),
    "hay un disparador que rellenaría el autor de la respuesta");
  assert(!/t_quality_survey_answers_force_created_by/.test(SQL),
    "hay un disparador que rellenaría el autor de las answers");
});

check("G4. las respuestas NO llevan auditoría de fila", () => {
  // Una fila de auditoría guarda quién escribió. Para una respuesta anónima
  // enviada desde una sesión iniciada, eso sería exactamente lo que se prometió
  // no guardar. Se sustituye por una guarda de inmutabilidad, que es más
  // fuerte que un rastro que puede delatar.
  assert(!/t_audit_quality_survey_responses/.test(SQL),
    "las respuestas tienen auditoría de fila: el autor acabaría en el audit_log");
  assert(!/t_audit_quality_survey_answers/.test(SQL),
    "las answers tienen auditoría de fila");
  assert(/quality_response_is_submitted/.test(SQL),
    "sin auditoría y sin guarda, una respuesta enviada sería editable");
});

check("G5. la sesión NO puede escribir una respuesta: solo la RPC", () => {
  // Si la aplicación pudiera insertar, alguien crearía una respuesta «anónima»
  // con el cliente puesto y la promesa dependería de que se acordara.
  assert(!/create policy quality_survey_responses_(write|insert|update)/.test(SQL),
    "hay política de escritura sobre las respuestas");
  assert(!/create policy quality_survey_answers_(write|insert|update)/.test(SQL),
    "hay política de escritura sobre las answers");
  assert(/grant select on table public\.quality_survey_responses\s+to authenticated/.test(SQL),
    "no se concede la lectura de respuestas");
  assert(!/grant select, insert, update, delete on table public\.quality_survey_responses/.test(SQL),
    "se concede escritura de respuestas a la sesión");
  assert(!/from\("quality_survey_responses"\)\s*\n?\s*\.insert/.test(DB),
    "la capa de datos inserta respuestas directamente");
});

check("G6. la manifestación de una campaña anónima no puede recibir cliente", () => {
  const f = functionBody("quality_feedback_respects_anonymity");
  assert(/v_mode = 'anonymous'/.test(f), "la guarda no mira el modo de la campaña");
  assert(/new\.customer_id is not null/.test(f),
    "se puede atribuir a un cliente un comentario de campaña anónima");
  assert(/t_quality_feedback_respects_anonymity/.test(SQL),
    "la guarda existe pero no está conectada");
});

check("G7. el caso abierto desde un comentario anónimo no hereda identidad", () => {
  const f = functionBody("quality_open_case_from_customer_feedback");
  assert(/v_anon/.test(f), "la RPC no mira si la manifestación vino de una campaña anónima");
  assert(/not v_anon/.test(f),
    "el caso recibe la referencia al cliente aunque el comentario fuera anónimo");
});

check("G8. la ficha del cliente NO cuenta respuestas anónimas", () => {
  const vista = SQL.slice(SQL.indexOf("create or replace view public.v_quality_customer_overview"));
  const cuerpo = vista.slice(0, vista.indexOf(";\n"));
  assert(/c\.anonymity_mode = 'identified'/.test(cuerpo),
    "la ficha del cliente cuenta respuestas sin comprobar el modo de la campaña");
  const ficha = read(join(COMPONENTS_DIR, "customer-file.tsx"));
  assert(/anónim/i.test(ficha), "la ficha no advierte de que no muestra lo anónimo");
});

check("G9. el PDF individual de una respuesta ANÓNIMA no se genera", () => {
  const i = ADAPTERS.indexOf('key: "quality.survey-response.detail"');
  assert(i >= 0, "no existe el papel de la respuesta identificada");
  const bloque = ADAPTERS.slice(i, ADAPTERS.indexOf("// ------", i));
  assert(/anonymityMode === "anonymous"\) return null/.test(bloque),
    "el PDF de una respuesta anónima se genera igual");
});

check("G10. el anonimato NO se puede cambiar de opinión", () => {
  const f = functionBody("quality_campaign_anonymity_is_final");
  assert(/new\.anonymity_mode is distinct from old\.anonymity_mode/.test(f),
    "no se comprueba el cambio de modo");
  assert(/old\.status <> 'draft'/.test(f) && /quality_survey_responses/.test(f)
      && /quality_survey_invitations/.test(f),
    "se puede cambiar el anonimato después de invitar o de recibir respuestas");
});

check("G11. §45 · un grupo diminuto no se desglosa", () => {
  assert(SMALL_GROUP_THRESHOLD >= 3, "el umbral de reidentificación es demasiado bajo");
  assert(aggregateIsSafeToShow(5, "anonymous"), "cinco respuestas anónimas no se pueden enseñar");
  assert(!aggregateIsSafeToShow(1, "anonymous"),
    "una única respuesta anónima se desglosa: eso reidentifica");
  assert(aggregateIsSafeToShow(1, "identified"),
    "una respuesta identificada tampoco se puede enseñar, y no hay motivo");
  assert(/aggregateIsSafeToShow/.test(COMPONENTS) && /aggregateIsSafeToShow/.test(ADAPTERS),
    "ni la pantalla ni el papel aplican el umbral");
});

// ---------------------------------------------------------------------------
console.log("\nH · LA PUERTA PÚBLICA (§25, §26, §27, §66, §67, §68, §89)");

check("H1. el token NUNCA se guarda en claro", () => {
  const cuerpo = tableBody("quality_survey_invitations");
  assert(/token_hash\s+text not null/.test(cuerpo), "no se guarda el hash");
  assert(!/\btoken\s+text/.test(cuerpo), "hay una columna con el token en claro");
  assert(/digest\(v_token, 'sha256'\)/.test(SQL), "el token no se resume con sha256");
  // Y el hash no se concede a ninguna sesión.
  assert(/grant select \(id, organization_id, campaign_id, token_prefix/.test(SQL),
    "la concesión de columnas no es explícita");
  const grant = SQL.slice(SQL.indexOf("grant select (id, organization_id, campaign_id, token_prefix"));
  const linea = grant.slice(0, grant.indexOf(";"));
  assert(!/token_hash/.test(linea), "se concede el hash del token a la sesión");
});

check("H2. la ruta pública NO acepta la empresa desde el navegador", () => {
  assert(!/organization_id/.test(stripTs(PUBLIC_DB)),
    "la capa pública menciona la empresa: el token es quien resuelve el contexto");
  assert(!/organization_id/.test(stripTs(PUBLIC_ACTION)),
    "la acción pública acepta la empresa");
  const f = functionBody("quality_resolve_survey_token");
  assert(!/p_organization_id/.test(f), "la RPC pública recibe la empresa como parámetro");
});

check("H3. todo fallo dice lo mismo", () => {
  const f = functionBody("quality_resolve_survey_token");
  const motivos = [...f.matchAll(/'reason', '([a-z_]+)'/g)].map((m) => m[1]);
  assert(motivos.length >= 4, "la RPC no cubre los casos de rechazo");
  assert(new Set(motivos).size === 1 && motivos[0] === "not_available",
    `la RPC distingue motivos de rechazo: ${[...new Set(motivos)].join(", ")}`);
});

check("H4. campaña en borrador, cerrada o fuera de ventana: denegado (§89)", () => {
  const f = functionBody("quality_resolve_survey_token");
  assert(/v_campaign\.status <> 'open'/.test(f), "no se comprueba el estado de la campaña");
  assert(/v_version\.status <> 'published'/.test(f), "se puede responder una versión en borrador");
  assert(/current_date < v_campaign\.opens_on/.test(f)
      && /current_date > v_campaign\.closes_on/.test(f),
    "la ventana no se comprueba en el servidor");
  // §67 · El reloj es el del SERVIDOR.
  assert(!/p_now|p_today/.test(f), "la ventana se comprueba contra una fecha del cliente");
});

check("H5. §68 · el token se consume con un update CONDICIONAL", () => {
  const f = functionBody("quality_submit_survey_response");
  const i = f.indexOf("update quality_survey_invitations");
  assert(i >= 0, "el envío no consume la invitación");
  const upd = f.slice(i, f.indexOf("returning * into v_inv", i));
  assert(/status = 'pending'/.test(upd),
    "el consumo del token no exige que siguiera pendiente: dos envíos ganarían los dos");
  assert(/revoked_at is null/.test(upd) && /expires_at is null or expires_at > now\(\)/.test(upd),
    "un token revocado o caducado se puede consumir");
});

check("H6. una pregunta de otra encuesta no se cuela por el cuerpo", () => {
  const f = functionBody("quality_submit_survey_response");
  assert(/version_id = v_version\.id/.test(f),
    "no se comprueba que la pregunta sea de la versión de esta campaña");
  assert(/jsonb_array_length\(p_answers\) > 200/.test(f),
    "no hay límite de tamaño del cuerpo");
});

check("H7. `anon` no tiene privilegios sobre ninguna tabla del dominio", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_(?:customer|survey)[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(tablas.length >= 12, `solo se encontraron ${tablas.length} tablas`);
  for (const t of tablas) {
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon`).test(SQL),
      `${t} no revoca los privilegios de anon`);
  }
  assert(/grant execute on function public\.quality_resolve_survey_token\(text\) to anon/.test(SQL),
    "la puerta pública de lectura no está concedida a anon");
  assert(/grant execute on function public\.quality_submit_survey_response\(text, jsonb\) to anon/.test(SQL),
    "la puerta pública de envío no está concedida a anon");
});

check("H8. la página pública vive FUERA del shell autenticado", () => {
  const rutas = readdirSync(join(ROOT, "app"));
  assert(rutas.includes("survey"), "no existe la ruta pública de encuesta");
  const page = read("app/survey/[token]/page.tsx");
  assert(/robots: \{ index: false/.test(page), "la encuesta pública es indexable");
  assert(/resolvePublicSurvey/.test(page), "la página no pasa por la capa pública");
  assert(!/requireQualityModule|requireSession/.test(page),
    "la página pública exige sesión: quien responde no tiene cuenta");
});

// ---------------------------------------------------------------------------
console.log("\nI · RESPUESTAS (VC-11, §20, §21, §61)");

check("I1. borrador se edita; enviada es final", () => {
  assert(RESPONSE_STATUSES.length === 3, "faltan estados de respuesta");
  const f = functionBody("quality_response_is_submitted");
  assert(/old\.status = 'submitted'/.test(f) && !/new\.status = 'submitted'/.test(f),
    "la guarda mira el estado NUEVO: bloquearía el propio envío");
  assert(/t_quality_responses_submitted_is_final/.test(SQL), "la guarda no está conectada");
});

check("I2. tampoco se cambian sus valores por la puerta de atrás", () => {
  assert(/quality_answer_parent_is_open/.test(SQL),
    "los valores de una respuesta enviada se pueden cambiar");
  assert(/t_quality_answers_parent_is_open/.test(SQL), "la guarda no está conectada");
});

check("I3. corregir es una respuesta NUEVA, no una sobrescritura", () => {
  const cuerpo = tableBody("quality_survey_responses");
  assert(/supersedes_id/.test(cuerpo) && /superseded_by/.test(cuerpo),
    "no hay forma de sustituir una respuesta conservando la original");
  assert(/correction_note/.test(cuerpo), "una corrección puede quedarse sin explicar");
});

check("I4. una respuesta enviada no se elimina", () => {
  const f = functionBody("quality_response_is_submitted");
  assert(/tg_op = 'DELETE'/.test(f) && /no se elimina/.test(f),
    "se puede borrar una respuesta enviada");
});

// ---------------------------------------------------------------------------
console.log("\nJ · «NO APLICA» NO ES UN CERO (§40, §80)");

check("J1. tres desenlaces y solo uno cuenta", () => {
  assert(ANSWER_OUTCOMES.length === 3, "faltan desenlaces de una respuesta");
  assert(answerCounts("answered"), "lo respondido no cuenta");
  assert(!answerCounts("not_applicable") && !answerCounts("skipped"),
    "«no aplica» o «sin responder» entran en el cálculo");
});

check("J2. la base RECHAZA un valor en lo que no se respondió", () => {
  const cuerpo = tableBody("quality_survey_answers");
  assert(/outcome = 'answered'\s*\n?\s*or \(value_numeric is null and value_text is null and value_choices is null\)/.test(cuerpo),
    "se puede guardar un valor en un «no aplica»");
});

check("J3. el cálculo excluye lo que no se respondió", () => {
  const f = functionBody("quality_compute_campaign_metrics");
  assert(/a\.outcome = 'answered'/.test(f),
    "el cálculo no filtra por el desenlace de la respuesta");
  assert(/filter \(where a\.outcome = 'not_applicable'\)/.test(f),
    "no se cuenta cuántos «no aplica» quedaron fuera");
});

check("J4. y se dice cuánto se pudo mirar", () => {
  const cuerpo = tableBody("quality_customer_metric_results");
  for (const c of ["sample_size", "not_applicable", "skipped"]) {
    assert(cuerpo.includes(c), `el resultado no cuenta ${c}`);
  }
  assert(/NOT_APPLICABLE_IS_NOT_ZERO/.test(COMPONENTS) && /NOT_APPLICABLE_IS_NOT_ZERO/.test(ADAPTERS),
    "ni la pantalla ni el papel lo explican");
});

// ---------------------------------------------------------------------------
console.log("\nK · MÉTRICAS (VC-12, VC-13, §14, §15, §78)");

check("K1. Trazaloop NO impone ninguna metodología", () => {
  assert(METRIC_METHODS.length >= 5, "faltan métodos de cálculo");
  assert((METRIC_METHODS as readonly string[]).includes("custom"),
    "no se puede declarar una métrica propia de la empresa");
  assert(/create table public\.quality_customer_metric_definitions/.test(SQL),
    "las métricas no las define la empresa");
});

check("K2. §14 · solo se llama NPS a lo que se mide de 0 a 10", () => {
  const cuerpo = tableBody("quality_customer_metric_definitions");
  assert(/method <> 'nps'\s*\n?\s*or \(expects_scale_min = 0 and expects_scale_max = 10/.test(cuerpo),
    "se puede declarar un NPS con otra escala");
  assert(npsScaleIsValid(0, 10), "0–10 no se admite como escala de NPS");
  assert(!npsScaleIsValid(1, 5) && !npsScaleIsValid(1, 10),
    "una escala que no es 0–10 pasa como NPS");
  assert(/NPS solo se llama NPS con escala 0–10/.test(ACTIONS),
    "la acción no explica por qué se rechaza");
});

check("K3. §78 · la fórmula del NPS es la correcta", () => {
  assert(npsBand(10) === "promoter" && npsBand(9) === "promoter", "9 y 10 no son promotores");
  assert(npsBand(8) === "passive" && npsBand(7) === "passive", "7 y 8 no son pasivos");
  assert(npsBand(6) === "detractor" && npsBand(0) === "detractor", "0 y 6 no son detractores");
  assert(npsBand(11) === null && npsBand(-1) === null, "un valor fuera de escala tiene banda");
  // El escenario del encargo: 10, 9, 8, 6 → 2 promotores, 1 pasivo, 1 detractor
  // → 50 % − 25 % = 25.
  const r = npsScore([10, 9, 8, 6]);
  assert(r === 25, `el NPS de [10,9,8,6] dio ${r} en vez de 25`);
  assert(npsScore([]) === null, "sin respuestas el NPS es un número");
  assert(npsScore([0, 0]) === -100, "cuatro detractores no dan −100");
  // Y la base calcula lo mismo.
  const f = functionBody("quality_compute_campaign_metrics");
  assert(/between 9 and 10/.test(f) && /between 7 and 8/.test(f) && /between 0 and 6/.test(f),
    "las bandas de la base no coinciden con la metodología");
  assert(/v_promoters::numeric \* 100 \/ v_sample\)\s*\n?\s*- \(v_detractors::numeric \* 100 \/ v_sample/.test(f),
    "la base no calcula %promotores − %detractores");
});

check("K4. si la escala cambió, NO se calcula un NPS falso", () => {
  const f = functionBody("quality_compute_campaign_metrics");
  assert(/v_def\.method = 'nps'\s*\n?\s*and \(v_question\.scale_min is distinct from 0/.test(f),
    "se calcularía un NPS sobre una escala que ya no es 0–10");
  assert(/continue;/.test(f), "no hay forma de saltarse una métrica que no aplica");
});

check("K5. los otros cálculos son los que dicen ser", () => {
  assert(averageScore([80, 90]) === 85, "el promedio no es un promedio");
  assert(averageScore([]) === null, "sin datos el promedio es un número");
  assert(topBoxPercent([5, 4, 3, 2], 4) === 50, "el porcentaje favorable no cuadra");
  assert(topBoxPercent([], 4) === null, "sin datos el porcentaje favorable es un número");
});

check("K6. el resultado guarda CÓMO se calculó (VC-12, VC-28)", () => {
  const cuerpo = tableBody("quality_customer_metric_results");
  assert(/method_snapshot\s+jsonb not null/.test(cuerpo),
    "el resultado no congela su método: recalcular con otra fórmula lo cambiaría en silencio");
  assert(/comparability_key\s+text not null/.test(cuerpo),
    "el resultado no lleva clave de comparabilidad");
  assert(/t_quality_customer_metric_results_immutable/.test(SQL),
    "un resultado calculado se puede reescribir");
});

// ---------------------------------------------------------------------------
console.log("\nL · TENDENCIA Y COMPARABILIDAD (§36, §37, §86)");

check("L1. la clave de comparabilidad cambia cuando cambia el instrumento", () => {
  const a = comparabilityKey({ method: "csat", questionStableKey: "sat.global", scaleMin: 1, scaleMax: 5 });
  const b = comparabilityKey({ method: "csat", questionStableKey: "sat.global", scaleMin: 0, scaleMax: 10 });
  const c = comparabilityKey({ method: "nps", questionStableKey: "sat.global", scaleMin: 0, scaleMax: 10 });
  const d = comparabilityKey({ method: "csat", questionStableKey: "otra", scaleMin: 1, scaleMax: 5 });
  assert(a !== b, "cambiar la escala no rompe la comparabilidad");
  assert(b !== c, "cambiar el método no rompe la comparabilidad");
  assert(a !== d, "cambiar la pregunta no rompe la comparabilidad");
  assert(a === comparabilityKey({ method: "csat", questionStableKey: "sat.global", scaleMin: 1, scaleMax: 5 }),
    "la clave no es determinista");
});

check("L2. §86 · una serie con escalas distintas se PARTE", () => {
  const tramos = splitComparableSeries([
    { comparabilityKey: "csat|s|1-5" },
    { comparabilityKey: "csat|s|1-5" },
    { comparabilityKey: "csat|s|0-10" },
  ]);
  assert(tramos.length === 2, `la serie se dibujó en ${tramos.length} tramo(s), se esperaban 2`);
  assert(tramos[0].length === 2 && tramos[1].length === 1, "el corte cayó en el sitio equivocado");
});

check("L3. la vista marca el punto exacto donde se rompe", () => {
  const i = SQL.indexOf("create or replace view public.v_quality_metric_series");
  assert(i >= 0, "no existe la vista de la serie");
  const cuerpo = SQL.slice(i, SQL.indexOf(";\n", i));
  assert(/breaks_comparability/.test(cuerpo), "la vista no marca el corte de serie");
  assert(/lag\(r\.comparability_key\)/.test(cuerpo),
    "el corte no se calcula contra la medición anterior");
});

check("L4. y la pantalla y el papel lo dicen", () => {
  assert(/COMPARABILITY_BROKEN/.test(COMPONENTS), "la pantalla no advierte del corte");
  assert(/COMPARABILITY_BROKEN/.test(ADAPTERS), "el papel no advierte del corte");
  assert(/splitComparableSeries/.test(COMPONENTS),
    "la pantalla dibuja una línea continua sobre series distintas");
});

// ---------------------------------------------------------------------------
console.log("\nM · COBERTURA Y CERO RESPUESTAS (§38, §39, §79)");

check("M1. §38 · sin denominador NO hay tasa de respuesta", () => {
  const sin = responseRate(12, null);
  assert(sin.rate === null, "se fabricó una tasa sin denominador");
  assert(sin.reason.length > 20, "no se explica por qué no hay tasa");
  const con = responseRate(12, 40);
  assert(con.rate === 30, `la tasa dio ${con.rate} en vez de 30`);
  assert(responseRate(3, 0).rate === null, "un denominador cero produce una tasa");
});

check("M2. la vista distingue el recuento de la tasa, y dice sobre qué base", () => {
  const i = SQL.indexOf("create or replace view public.v_quality_campaign_summary");
  const cuerpo = SQL.slice(i, SQL.indexOf(";\n", i));
  assert(/responses_count/.test(cuerpo), "la vista no cuenta las respuestas");
  assert(/response_rate/.test(cuerpo) && /else null/.test(cuerpo),
    "la vista calcula una tasa aunque no haya denominador");
  assert(/response_rate_basis/.test(cuerpo),
    "la vista no dice sobre qué denominador calculó");
});

check("M3. §79 · cero respuestas no es cero satisfacción", () => {
  assert(/ZERO_RESPONSES_IS_NOT_ZERO/.test(COMPONENTS), "la pantalla no lo dice");
  assert(/ZERO_RESPONSES_IS_NOT_ZERO/.test(ADAPTERS), "el papel no lo dice");
  assert(/Sin respuestas/.test(COMPONENTS), "la pantalla enseña un 0 donde no hay datos");
  const f = functionBody("quality_compute_campaign_metrics");
  assert(/if v_sample = 0 then\s*\n?\s*v_value := null;/.test(f),
    "sin respuestas se calcula un cero");
});

check("M4. la población declarada tiene que ser creíble", () => {
  const cuerpo = tableBody("quality_survey_campaigns");
  assert(/population_size is null or population_size > 0/.test(cuerpo),
    "se puede declarar una población de cero y calcular sobre ella");
});

// ---------------------------------------------------------------------------
console.log("\nN · QUEJA ≠ NO CONFORMIDAD (VC-16, VC-22, VC-30, §30, §31, §84)");

check("N1. OBLIGATORIO · la manifestación NO lleva clasificación de NC", () => {
  const cuerpo = tableBody("quality_customer_feedback");
  assert(!/nonconformity|no_conformidad|classification/i.test(cuerpo),
    "la manifestación ya viene clasificada como no conformidad");
  assert(COMPLAINT_IS_NOT_NC.length > 40, "falta la frase que las separa");
  assert(/COMPLAINT_IS_NOT_NC/.test(COMPONENTS), "la pantalla no lo dice");
  assert(/NOT_NC_NOTE|COMPLAINT_IS_NOT_NC/.test(ADAPTERS), "el papel no lo dice");
});

check("N2. registrar una queja no abre ningún caso", () => {
  // La única ruta hacia un caso es la RPC explícita. Si `recordFeedback`
  // pudiera abrirlo, §31 se rompería sin que nadie lo notara.
  const i = DB.indexOf("export async function recordFeedback");
  const cuerpo = DB.slice(i, DB.indexOf("\n}", i));
  assert(!/work_cases|openCase/.test(cuerpo), "registrar una queja abre un caso");
  assert(/COMPLAINT_IS_NOT_AUTOMATIC_CASE/.test(COMPONENTS),
    "la pantalla no explica que abrir un caso es una decisión");
});

check("N3. §84 · el caso nace SIN clasificar", () => {
  const f = functionBody("quality_open_case_from_customer_feedback");
  assert(!/'nonconformity'/.test(f),
    "el caso nace clasificado como no conformidad: eso lo decide una persona");
  assert(/classification/.test(f) === false || /'pending'/.test(f),
    "el caso no nace pendiente de clasificar");
  assert(/'complaint'/.test(f) && /'issue'/.test(f),
    "una sugerencia abriría un caso de tipo queja, deformando el recuento");
});

check("N4. el caso lleva referencias, no copias", () => {
  const f = functionBody("quality_open_case_from_customer_feedback");
  assert(/work_references/.test(f), "el caso no guarda referencia a lo que lo originó");
  assert(/'quality_customer_feedback'/.test(f),
    "el caso no referencia la manifestación");
});

check("N5. la voz no se reduce a positivo/negativo", () => {
  assert(FEEDBACK_KINDS.length === 6, "faltan tipos de manifestación");
  for (const k of ["complaint", "claim", "suggestion", "compliment", "comment"]) {
    assert((FEEDBACK_KINDS as readonly string[]).includes(k), `falta el tipo ${k}`);
  }
  assert(COMPLAINT_KINDS.length === 2, "el catálogo de quejas no distingue queja de reclamo");
  assert(isComplaint("complaint") && isComplaint("claim"), "una queja no consta como queja");
  assert(!isComplaint("compliment") && !isComplaint("suggestion"),
    "una felicitación o una sugerencia cuentan como queja");
});

// ---------------------------------------------------------------------------
console.log("\nO · SEÑALES (VC-17, §34, §35, §85)");

check("O1. una satisfacción baja produce una SEÑAL, no una NC ni un riesgo", () => {
  assert(CUSTOMER_SIGNAL_KINDS.length >= 5, "faltan señales del dominio");
  const f = functionBody("quality_scan_customer_voice");
  assert(!/insert into work_cases/i.test(f), "el barrido abre casos");
  assert(!/quality_risks/i.test(f), "el barrido crea riesgos");
  assert(!/insert into work_actions/i.test(f), "el barrido crea acciones");
  assert(!/classification/i.test(f), "el barrido clasifica algo");
  assert(!/update quality_customer_feedback\s+set\s+status/i.test(f.replace(/\n/g, " ")),
    "el barrido cambia el estado de una queja");
});

check("O2. el barrido es idempotente", () => {
  const f = functionBody("quality_scan_customer_voice");
  assert(/dedupe_key/.test(f), "los avisos del barrido no llevan clave de deduplicación");
  assert(/on conflict do nothing/.test(f), "las señales se duplicarían en la segunda pasada");
  assert(/quality_customer_signals_dedupe/.test(SQL),
    "no hay índice único que impida la señal repetida");
});

check("O3. una señal atendida se cierra sola", () => {
  const f = functionBody("quality_scan_customer_voice");
  assert(/set status = 'resolved'/.test(f),
    "una señal hay que apagarla a mano después de haber hecho el trabajo");
});

check("O4. el barrido de otra empresa se rechaza", () => {
  const f = functionBody("quality_scan_customer_voice");
  assert(/is_org_member\(p_organization_id\)/.test(f),
    "cualquiera podría barrer la empresa de otro");
});

// ---------------------------------------------------------------------------
console.log("\nP · MOTORES TRANSVERSALES (MDR-46, §33, §57, §58, §92)");

check("P1. no hay tablas propias de tareas, alertas, acciones ni casos", () => {
  for (const t of ["quality_customer_tasks", "quality_customer_alerts",
                   "quality_customer_actions", "quality_customer_cases",
                   "quality_customer_indicators"]) {
    assert(!SQL.includes(`create table public.${t}`),
      `se creó ${t} en vez de usar el motor transversal`);
  }
});

check("P2. el ensanche es ADITIVO", () => {
  for (const v of ["document_review", "risk_review_due", "supplier_reevaluation_due"]) {
    assert(SQL.includes(`'${v}'`), `el ensanche perdió el tipo de tarea ${v}`);
  }
  for (const v of ["complaint_review", "campaign_closing_review",
                   "customer_signal_review", "customer_voice_review_due"]) {
    assert(SQL.includes(`'${v}'`), `falta el tipo de tarea ${v}`);
    assert((TASK_TYPES as readonly string[]).includes(v), `la bandeja no conoce ${v}`);
    assert(TASK_TYPE_LABEL[v as keyof typeof TASK_TYPE_LABEL].length > 0,
      `${v} no tiene etiqueta legible`);
  }
  for (const v of ["complaint_unreviewed", "campaign_closing_soon", "satisfaction_drop"]) {
    assert((ALERT_TYPES as readonly string[]).includes(v), `la bandeja no conoce la alerta ${v}`);
    assert(ALERT_TYPE_LABEL[v as keyof typeof ALERT_TYPE_LABEL].length > 0,
      `${v} no tiene etiqueta legible`);
  }
});

check("P3. §92 · los asuntos nuevos LLEVAN a alguna parte", () => {
  const vista = read("components/domain/quality/tasks-view.tsx");
  for (const s of ["quality_customer_profile", "quality_survey_campaign",
                   "quality_customer_feedback", "quality_customer_voice_review"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `falta el asunto ${s}`);
    assert(vista.includes(`case "${s}"`),
      `${s} no tiene destino: la tarea acabaría enlazando a Documentos`);
  }
});

check("P4. §49 · la satisfacción alimenta el motor de indicadores que ya existe", () => {
  assert(/quality_native_source_keys/.test(SQL),
    "no se ensanchó el catálogo de fuentes nativas de QUALITY-03");
  const nuevas = ["quality.customer_complaints_count",
                  "quality.customer_complaints_closed_ratio",
                  "quality.customer_survey_responses_count",
                  "quality.customer_open_complaints_count"];
  for (const k of nuevas) {
    assert(SQL.includes(`'${k}'`), `falta la fuente nativa ${k}`);
    assert(NATIVE_SOURCE_KEYS.includes(k),
      `el dominio de TypeScript no conoce ${k}: se podría configurar y después no calcularse`);
  }
  // Y las que ya existían siguen estando.
  for (const k of ["quality.documents_effective_ratio", "quality.processes_published_ratio"]) {
    assert(SQL.includes(`'${k}'`), `el ensanche perdió la fuente ${k}`);
  }
});

check("P5. §50 · calcular una métrica no toca ninguna medición cerrada", () => {
  const f = functionBody("quality_compute_campaign_metrics");
  assert(!/quality_measurements/i.test(f), "el cálculo escribe mediciones de QUALITY-03");
  assert(!/update quality_indicator/i.test(f), "el cálculo modifica indicadores");
  assert(/decides_nothing/.test(f), "el cálculo no declara que no decide nada");
});

// ---------------------------------------------------------------------------
console.log("\nQ · SEGURIDAD (§62, §63, §64)");

check("Q1. TODA función SECURITY DEFINER fija un search_path seguro", () => {
  const definers = SQL.split(/create or replace function/).slice(1)
    .filter((f) => /security definer/i.test(f));
  assert(definers.length > 0, "la migración no define ninguna función de acto formal");
  for (const f of definers) {
    const nombre = (f.match(/public\.([a-z0-9_]+)/) ?? [])[1] ?? "?";
    assert(/set search_path\s*=\s*public/i.test(f),
      `${nombre} es SECURITY DEFINER sin search_path fijo`);
  }
});

check("Q2. §64 · ninguna definer se fía del p_organization_id que le mandan", () => {
  const definers = SQL.split(/create or replace function/).slice(1)
    .filter((f) => /security definer/i.test(f) && /p_organization_id/.test(f));
  assert(definers.length > 0, "no hay ninguna definer parametrizada por empresa");
  for (const f of definers) {
    const nombre = (f.match(/public\.([a-z0-9_]+)/) ?? [])[1] ?? "?";
    // Los PREDICADOS de permiso quedan fuera: no devuelven datos, devuelven si
    // QUIEN LLAMA tiene un papel, y `has_org_role` ya lo resuelve.
    const esPredicado = /returns boolean/i.test(f)
      && /(has_org_role|is_org_member)\s*\(\s*p_organization_id/.test(f);
    if (esPredicado) continue;
    // Y las que ningún cliente puede ejecutar.
    const esInterna = new RegExp(
      `revoke all on function public\\.${nombre}\\([^)]*\\) from [^;]*authenticated`
    ).test(f);
    if (esInterna) continue;
    assert(/is_org_member\s*\(/.test(f),
      `${nombre} recibe p_organization_id del cliente y no comprueba la pertenencia`);
  }
});

check("Q3. las funciones que reciben un identificador derivan la empresa de la FILA", () => {
  for (const fn of ["quality_publish_survey_version", "quality_open_survey_campaign",
                    "quality_close_survey_campaign", "quality_issue_survey_invitation",
                    "quality_compute_campaign_metrics",
                    "quality_open_case_from_customer_feedback",
                    "quality_close_customer_voice_review"]) {
    const f = functionBody(fn);
    assert(!/p_organization_id/.test(f.split("as $$")[0]),
      `${fn} acepta la empresa como parámetro en vez de derivarla de la fila`);
    assert(/quality_(manages|closes)_customer_voice\(/.test(f),
      `${fn} no comprueba el permiso sobre la empresa que derivó`);
  }
});

check("Q4. las catorce tablas llevan RLS", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_(?:customer|survey)[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(tablas.length >= 12, `solo se encontraron ${tablas.length} tablas`);
  for (const t of tablas) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL),
      `${t} se quedó sin RLS`);
  }
});

check("Q5. las vistas respetan la sesión", () => {
  const vistas = [...SQL.matchAll(/create or replace view public\.(v_quality_[a-z_]+)/g)]
    .map((m) => m[1]);
  assert(vistas.length >= 3, `solo se encontraron ${vistas.length} vistas`);
  for (const v of vistas) {
    const i = SQL.indexOf(`create or replace view public.${v}`);
    assert(/security_invoker\s*=\s*true/.test(SQL.slice(i, i + 200)),
      `${v} no declara security_invoker: se saltaría RLS`);
  }
});

check("Q6. cada política se llama como su tabla", () => {
  for (const m of SQL.matchAll(/create policy ([a-z0-9_]+)\s+on public\.([a-z0-9_]+)/g)) {
    const [, politica, tabla] = m;
    assert(politica.startsWith(tabla),
      `la política ${politica} está en ${tabla}: el nombre engaña a quien audite`);
  }
});

check("Q7. §62 · las capacidades están separadas", () => {
  assert(canManageCustomerVoice("consultant"), "el consultor no puede acompañar el dominio");
  assert(!canCloseCustomerVoice("consultant"),
    "un consultor externo cierra el periodo de satisfacción de su cliente");
  assert(canCloseCustomerVoice("admin") && canCloseCustomerVoice("quality"),
    "quien tiene que cerrar el periodo no puede");
  for (const f of ["quality_manages_customer_voice", "quality_reads_customer_voice",
                   "quality_closes_customer_voice"]) {
    assert(SQL.includes(`function public.${f}`), `falta la capacidad ${f}`);
  }
});

check("Q8. el rol no se lee del navegador y no se usa service_role", () => {
  assert(!/formData\.get\("role|roleCode = text\(/.test(ACTIONS),
    "una acción toma el rol del formulario");
  assert(/requireQualityForAction/.test(ACTIONS), "las acciones no pasan por el guard");
  assert(!/service_role|SERVICE_ROLE/.test(stripTs(DB) + stripTs(ACTIONS) + stripTs(PUBLIC_DB)),
    "la capa normal usa la clave de servicio");
});

// ---------------------------------------------------------------------------
console.log("\nR · NO ES UN CRM NI MARKETING (§4)");

check("R1. sin embudo, ni oportunidad comercial, ni valor de cuenta", () => {
  const prohibido = /\b(pipeline|deal|opportunity_stage|lead_score|account_value|mrr|arr|churn_prediction)\b/i;
  assert(!prohibido.test(SQL), "la migración introduce vocabulario de CRM");
  assert(!prohibido.test(stripTs(DOMAIN) + stripTs(DB)), "el dominio introduce vocabulario de CRM");
});

check("R2. sin envío masivo ni seguimiento de apertura", () => {
  const prohibido = /\b(open_rate|click_rate|unsubscribe|mailing_list|campaign_blast|tracking_pixel)\b/i;
  assert(!prohibido.test(SQL), "aparece vocabulario de marketing");
  assert(!/opened_at|clicked_at/.test(tableBody("quality_survey_invitations")),
    "la invitación rastrea si se abrió el correo");
});

check("R3. §24 · el cliente no queda puntuado como persona", () => {
  assert(!/customer_score|client_rating|satisfaction_score_for_customer/i.test(SQL),
    "se guarda una puntuación por cliente");
  assert(!/ranking/i.test(stripTs(COMPONENTS)),
    "la pantalla ordena a los clientes en un ranking");
});

// ---------------------------------------------------------------------------
console.log("\nS · CICLO DE VIDA (§60, §88)");

check("S1. una encuesta con respuestas no se elimina", () => {
  assert(/quality_survey_deletion_verdict/.test(SQL), "no hay dictamen para la encuesta");
  assert(/quality_survey_delete_guard/.test(SQL), "el dictamen no se impone");
  const f = functionBody("quality_survey_deletion_verdict");
  assert(/respuesta recibida|respuestas recibidas/.test(f),
    "el dictamen no cuenta las respuestas como historia");
});

check("S2. un cliente con historia tampoco", () => {
  assert(/quality_customer_deletion_verdict/.test(SQL), "no hay dictamen para el cliente");
  assert(/quality_customer_delete_guard/.test(SQL), "el dictamen no se impone");
});

check("S3. una campaña con respuestas tampoco", () => {
  assert(/quality_campaign_delete_guard/.test(SQL), "una campaña con respuestas se puede borrar");
});

check("S4. la puerta pública del ciclo de vida sigue siendo UNA", () => {
  const f = functionBody("quality_deletion_eligibility");
  for (const e of ["'customer'", "'survey'", "'supplier'", "'person'", "'indicator'"]) {
    assert(f.includes(e), `la RPC de ciclo de vida no conoce ${e}`);
  }
  for (const e of ["customer", "survey"]) {
    assert((LIFECYCLE_ENTITIES as readonly string[]).includes(e),
      `la aplicación no conoce ${e} como entidad con ciclo de vida`);
  }
  assert(/revoke all on function public\.quality_survey_deletion_verdict\(uuid\) from public, anon, authenticated/.test(SQL),
    "el dictamen del dominio es llamable desde el cliente: habría dos puertas");
  // Reescribir el despachador es la forma más fácil de perder una comprobación
  // que costó un sprint. Estas dos venían de QUALITY-06 y de QUALITY-03.1.
  assert(/if auth\.uid\(\) is null then return v_none; end if;/.test(f),
    "el dictamen responde sin sesión");
  assert(/p_entity = 'person' and not quality_can_read_person/.test(f),
    "se perdió la comprobación de QUALITY-06: quien no puede ver una ficha se enteraría de cuánta historia tiene");
});

check("S5. un cierre de periodo cerrado es final", () => {
  assert(/quality_voice_review_is_closed/.test(SQL), "un cierre anual se puede reescribir");
  const f = functionBody("quality_voice_review_is_closed");
  assert(/old\.status = 'closed'/.test(f), "la guarda mira el estado nuevo");
});

// ---------------------------------------------------------------------------
console.log("\nT · CIERRE ANUAL (VC-05, VC-06)");

check("T1. existe el cierre formal del periodo", () => {
  assert(/create table public\.quality_customer_voice_reviews/.test(SQL),
    "no existe el cierre consolidado del periodo");
  const cuerpo = tableBody("quality_customer_voice_reviews");
  assert(/period_start\s+date not null/.test(cuerpo) && /period_end\s+date not null/.test(cuerpo),
    "el cierre no delimita su periodo");
  assert(/summary_snapshot\s+jsonb/.test(cuerpo), "el cierre no congela su retrato");
});

check("T2. VC-06 · cerrar exige un veredicto sobre la metodología", () => {
  const cuerpo = tableBody("quality_customer_voice_reviews");
  assert(/methodology_verdict/.test(cuerpo), "el cierre no revisa la metodología");
  assert(/status <> 'closed'\s*\n?\s*or \(methodology_verdict is not null/.test(cuerpo),
    "se puede cerrar sin decir si la metodología sigue sirviendo");
  const f = functionBody("quality_close_customer_voice_review");
  assert(/Un cierre sin conclusiones escritas no es una revisión/.test(f),
    "se puede cerrar sin conclusiones");
});

check("T3. el cierre deja una decisión formal en el motor transversal", () => {
  const f = functionBody("quality_close_customer_voice_review");
  assert(/insert into work_decisions/.test(f),
    "el cierre no queda registrado como decisión formal");
  assert(/'customer_voice_review'/.test(f), "la decisión no dice sobre qué se tomó");
});

// ---------------------------------------------------------------------------
console.log("\nU · PAPEL (§69, §70, §71, §72, §73, §75)");

check("U1. cada entidad con identidad propia tiene su papel", () => {
  const claves = new Set(promisedKeys());
  for (const k of ["quality.customer.detail", "quality.customer.list",
                   "quality.survey.detail", "quality.survey-version.detail",
                   "quality.survey-campaign.detail", "quality.survey-campaign.list",
                   "quality.survey-response.detail",
                   "quality.customer-feedback.detail", "quality.customer-complaint.detail",
                   "quality.customer-satisfaction.list", "quality.customer-voice-trend.list",
                   "quality.customer-voice-review.detail"]) {
    assert(claves.has(k), `el inventario no promete ${k}`);
    assert(ADAPTERS.includes(`key: "${k}"`), `no existe el adaptador de ${k}`);
  }
});

check("U2. §107 · el inventario no deja nada pendiente", () => {
  const nombres = EXPORT_INVENTORY.map((r) => r.entity);
  const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  assert(repetidos.length === 0, `nombres repetidos en el inventario: ${repetidos.join(", ")}`);
  const q08 = EXPORT_INVENTORY.filter((r) =>
    /cliente|encuesta|campaña|satisfacción|voz del cliente|Respuesta|Queja|Manifestación|Invitación|Pregunta de encuesta/i
      .test(r.entity) && r.module === "quality");
  assert(q08.length >= 15, `solo ${q08.length} entidades de QUALITY-08 en el inventario`);
});

check("U3. §75 · el papel de una queja NO se llama no conformidad", () => {
  const i = ADAPTERS.indexOf('key: "quality.customer-complaint.detail"');
  const bloque = ADAPTERS.slice(i, i + 900);
  assert(/documentName: "Queja o reclamo de cliente"/.test(bloque),
    "el papel de la queja no se llama queja");
  assert(!/no conformidad/i.test(bloque.replace(/NOT_NC_NOTE/g, "")),
    "el papel de la queja se presenta como no conformidad");
});

check("U4. §73 · el papel de una versión no se reconstruye con otra", () => {
  const i = ADAPTERS.indexOf('key: "quality.survey-version.detail"');
  const bloque = ADAPTERS.slice(i, ADAPTERS.indexOf("// ------", i));
  assert(/getVersionStructure/.test(bloque),
    "el papel de la versión no lee su estructura congelada");
  assert(/temporality: "historical"/.test(bloque),
    "la versión no se declara como documento del pasado");
});

// ---------------------------------------------------------------------------
console.log("\nV · UX Y ACCESIBILIDAD (§90, §93, §94, §95)");

check("V1. §90 · cinco entradas de menú, no quince", () => {
  const nav = read("lib/modules/registry.ts");
  const i = nav.indexOf("QUALITY_VOZ_CLIENTE_GROUP");
  assert(i >= 0, "el módulo no ofrece la voz del cliente en el menú");
  const grupo = nav.slice(i, nav.indexOf("};", i));
  const entradas = [...grupo.matchAll(/label:/g)].length;
  assert(entradas === 5, `el grupo tiene ${entradas} entradas de menú`);
});

check("V2. las rutas internas están protegidas y son dinámicas", () => {
  assert(routeFiles.length >= 7, `solo hay ${routeFiles.length} rutas internas`);
  for (const f of routeFiles) {
    const src = read(f);
    assert(/requireQualityModule/.test(src), `${f} no exige el módulo`);
    assert(/export const dynamic = "force-dynamic"/.test(src), `${f} no es dinámica`);
  }
});

check("V3. las pantallas dicen «empresa», no «organización»", () => {
  const visibles = [...COMPONENTS.matchAll(/>([^<>{}]*organizaci[oó]n[^<>{}]*)</gi)]
    .map((m) => m[1].trim()).filter((t) => t.length > 0);
  assert(visibles.length === 0,
    `hay texto visible que dice «organización»: ${visibles.slice(0, 2).join(" · ")}`);
});

check("V4. §24 · el formulario público dice si es anónimo ANTES de enviar", () => {
  const form = read(join(COMPONENTS_DIR, "public-survey-form.tsx"));
  const aviso = form.indexOf("ANONYMITY_MODE_NOTICE");
  const boton = form.indexOf("Enviar respuesta");
  assert(aviso >= 0, "el formulario no dice en qué modo se responde");
  assert(aviso < boton, "el aviso de anonimato aparece después del botón de enviar");
});

check("V5. §94 · el formulario público es accesible", () => {
  const form = read(join(COMPONENTS_DIR, "public-survey-form.tsx"));
  assert(/<fieldset/.test(form) && /<legend/.test(form),
    "las preguntas no se agrupan con fieldset y legend");
  assert(/\(obligatoria\)/.test(form) && /\(opcional\)/.test(form),
    "lo obligatorio se marca solo con un símbolo");
  assert(/role="alert"/.test(form), "los errores no se anuncian a un lector de pantalla");
  assert(/sr-only/.test(form), "hay controles sin etiqueta accesible");
  assert(!/color:\s*red|text-red/.test(form),
    "hay información transmitida únicamente por color");
});

check("V6. §93 · la página pública muestra la empresa sin abrir su almacenamiento", () => {
  const form = read(join(COMPONENTS_DIR, "public-survey-form.tsx"));
  assert(/organizationName/.test(form), "la encuesta pública no dice de quién es");
  assert(!/logo_storage_path|organization-assets|createSignedUrl/.test(form + PUBLIC_DB),
    "la página pública toca el almacenamiento privado de la empresa");
});

// ---------------------------------------------------------------------------
console.log("\nW · MIGRACIÓN (§96, §97)");

check("W1. 0126 es la única migración de este dominio", () => {
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const deVoz = migraciones.filter((f) => /customer_voice/.test(f));
  assert(deVoz.length === 1 && deVoz[0] === "0126_quality_customer_voice.sql",
    `hay ${deVoz.length} migraciones de voz del cliente: ${deVoz.join(", ")}`);
  assert(migraciones.includes("0125_quality_suppliers_evaluation.sql"),
    "una migración anterior desapareció");
});

check("W2. append-only: no destruye nada de lo que ya había", () => {
  assert(!/drop table|drop column|truncate/i.test(SQL),
    "la migración destruye estructura existente");
  const drops = [...SQL.matchAll(/drop constraint ([a-z0-9_]+)/g)].length;
  const adds = [...SQL.matchAll(/add constraint ([a-z0-9_]+)/g)].length;
  assert(adds >= drops, "se soltó una restricción sin volver a ponerla");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
