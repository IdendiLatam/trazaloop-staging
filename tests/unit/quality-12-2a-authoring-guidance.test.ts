/**
 * Trazaloop · QUALITY-12.2A · La guía de autoría, canónica y con historia.
 *
 * Esta suite lee código y SQL. Lo que comprueba es lo que tiene que ser cierto
 * antes de que ningún modelo lea una guía: que hay UNA fuente, que la anterior
 * dejó de poder cambiar, que una revisión publicada no se reescribe, y que en
 * Demo el texto no sale de la base.
 *
 * Lo que necesita una base real —el traslado de los 250, la resolución
 * histórica, el intento de leer por identificador desde Demo— vive en
 * `tests/rls/quality-12-2a-guidance.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const MIG = read("supabase/migrations/0136_trazadoc_canonical_authoring_guidance.sql");
const GUIDANCE = read("lib/db/authoring-guidance.ts");
const PLATFORM = read("lib/db/trazadocs-platform.ts");
const TRAZADOCS = read("lib/db/trazadocs.ts");
const DOMAIN = read("lib/domain/trazadocs.ts");

function stripTs(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
function stripSql(s: string): string {
  return s.replace(/^\s*--.*$/gm, "");
}

console.log("\nQUALITY-12.2A · guía de autoría canónica\n");

// ===========================================================================
console.log("A · IDENTIDAD ≠ REVISIÓN");
// ===========================================================================

check("A1. hay una tabla de identidad y otra de revisiones", () => {
  assert(/create table public\.trazadoc_authoring_guidance \(/.test(MIG),
    "no existe la identidad");
  assert(/create table public\.trazadoc_authoring_guidance_revisions \(/.test(MIG),
    "no existen las revisiones");
});

check("A2. la identidad NO depende del título visible ni del idioma", () => {
  const tabla = /create table public\.trazadoc_authoring_guidance \([\s\S]*?\n\);/.exec(MIG)![0];
  assert(/module_key/.test(tabla) && /blueprint_code/.test(tabla) && /section_key/.test(tabla),
    "la identidad no usa la terna que el descubrimiento demostró estable");
  for (const prohibido of ["title", "label", "locale", "idioma", "sort_order", "position"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(tabla),
      `la identidad depende de «${prohibido}», que cambia sin que cambie la sección`);
  }
});

check("A3. la identidad es única, contando los nulos", () => {
  assert(/unique nulls not distinct \(module_key, blueprint_code, section_key\)/.test(MIG),
    "sin `nulls not distinct`, dos guías de papel del mismo módulo no chocarían");
});

check("A4. dos alcances: sección de estructura y papel de sección", () => {
  assert(/check \(scope in \('blueprint_section', 'section_role'\)\)/.test(MIG),
    "no están los dos alcances");
  assert(/trazadoc_authoring_guidance_shape_check/.test(MIG),
    "nada impide una fila a medias entre los dos alcances");
});

// ===========================================================================
console.log("\nB · LA HISTORIA");
// ===========================================================================

check("B1. una revisión publicada no se modifica ni se borra", () => {
  assert(/trazadoc_guidance_revision_is_immutable/.test(MIG), "no hay freno");
  assert(/before update or delete on public\.trazadoc_authoring_guidance_revisions/.test(MIG),
    "el freno no cubre las dos operaciones");
  const fn = /create or replace function public\.trazadoc_guidance_revision_is_immutable[\s\S]*?\$\$;/.exec(MIG)![0];
  for (const campo of ["guidance", "purpose", "example", "do_not_invent",
                       "normative_class", "content_hash", "revision_number", "effective_from"]) {
    assert(new RegExp(`new\\.${campo} is distinct from old\\.${campo}`).test(fn),
      `${campo} se puede cambiar después de publicado`);
  }
});

check("B2. la única excepción es CERRAR la revisión, y una sola vez", () => {
  const fn = /create or replace function public\.trazadoc_guidance_revision_is_immutable[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/old\.effective_to is not null and new\.effective_to is distinct from old\.effective_to/.test(fn),
    "una revisión ya cerrada se puede volver a cerrar con otra fecha");
});

check("B3. solo una revisión vigente por guía", () => {
  assert(/create unique index trazadoc_guidance_revisions_vigente[\s\S]*?where effective_to is null/.test(MIG),
    "«la vigente» podría tener más de una respuesta");
});

check("B4. la vigencia se modela como en el control documental", () => {
  assert(/effective_from\s+timestamptz not null/.test(MIG), "falta el inicio de vigencia");
  assert(/effective_to\s+timestamptz/.test(MIG), "falta el fin de vigencia");
  assert(/superseded_by_revision_id/.test(MIG), "una revisión no dice quién la sucede");
});

check("B5. publicar es la única puerta de escritura, y es de plataforma", () => {
  const fn = /create or replace function public\.trazadoc_publish_guidance[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/if not is_platform_superadmin\(\) then/.test(fn),
    "cualquiera podría publicar una guía");
  // Cierra primero y enlaza después: solo puede haber una revisión abierta por
  // guía, y ese índice no se puede diferir.
  assert(/update trazadoc_authoring_guidance_revisions\s+set effective_to = v_ahora/.test(fn),
    "publicar no cierra la anterior");
  assert(/update trazadoc_authoring_guidance_revisions\s+set superseded_by_revision_id = v_nuevo/.test(fn),
    "publicar no enlaza la anterior con la nueva");
  assert(fn.indexOf("set effective_to = v_ahora") < fn.indexOf("insert into trazadoc_authoring_guidance_revisions"),
    "se abre la nueva antes de cerrar la vigente: habría dos abiertas a la vez");
  assert(/grant select on table public\.trazadoc_authoring_guidance_revisions to authenticated;/.test(MIG),
    "las revisiones deberían ser de solo lectura fuera de la RPC");
  assert(!/grant [a-z, ]*insert[a-z, ]* on table public\.trazadoc_authoring_guidance_revisions/.test(MIG),
    "se concede escritura directa sobre las revisiones");
});

check("B6. republicar lo mismo NO crea una revisión", () => {
  const fn = /create or replace function public\.trazadoc_publish_guidance[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/v_actual\.content_hash = v_hash/.test(fn),
    "una historia llena de revisiones idénticas no explica nada");
});

// ===========================================================================
console.log("\nC · UNA SOLA FUENTE");
// ===========================================================================

check("C1. `hint` quedó congelado por trigger", () => {
  assert(/create or replace function public\.trazadoc_hint_is_frozen/.test(MIG),
    "no hay freno sobre la columna antigua");
  assert(/create trigger t_trazadoc_blueprint_sections_hint_frozen/.test(MIG),
    "el freno no está instalado");
  assert(/new\.hint is distinct from old\.hint/.test(MIG), "el freno no mira el hint");
});

check("C2. nadie lee ya la columna congelada", () => {
  for (const [nombre, src] of [["lib/db/trazadocs.ts", TRAZADOCS],
                               ["lib/db/authoring-guidance.ts", GUIDANCE]] as const) {
    const code = stripTs(src);
    assert(!/[.("']hint["')\s:,]/.test(code), `${nombre} sigue leyendo la columna congelada`);
  }
  // Y el tipo estructural dejó de arrastrarla: tenerla ahí invitaba a copiar la
  // guía dentro del documento.
  const tipo = /export type BlueprintSectionFacts = \{[\s\S]*?\n\};/.exec(DOMAIN)![0];
  assert(!/hint/.test(tipo), "la guía volvió a viajar pegada a los datos de la sección");
});

check("C3. el backoffice publica revisiones en lugar de escribir la columna", () => {
  const code = stripTs(PLATFORM);
  assert(/publishSectionGuidance/.test(code), "no hay publicación de revisiones");
  assert(/trazadoc_publish_guidance/.test(code), "no se usa la RPC de publicación");
  assert(!/hint: input\.hint/.test(code), "el backoffice sigue escribiendo la columna");
  assert(/v_trazadoc_authoring_guidance_current/.test(code),
    "el backoffice lee la columna antigua en vez de la guía vigente");
});

check("C4. la puerta antigua se retiró: no hay dos caminos", () => {
  let existe = true;
  try { read("lib/db/hint-access.ts"); } catch { existe = false; }
  assert(!existe, "sigue habiendo una segunda puerta de resolución de hints");
});

// ===========================================================================
console.log("\nD · LA REGLA COMERCIAL, DENTRO DE LA BASE");
// ===========================================================================

check("D1. el contenido solo sale en Full o Extra", () => {
  const fn = /create or replace function public\.trazadoc_guidance_as_of[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/resolve_organization_module_access/.test(fn),
    "no se reutiliza la fuente de verdad del acceso por módulo");
  assert(/in \('full', 'extra'\)/.test(fn), "no se acota a los planes que pagan");
  assert(/case when v_permite then r\.guidance end/.test(fn),
    "el texto sale aunque el plan no lo permita");
});

check("D2. sin ser miembro, no hay guía", () => {
  const fn = /create or replace function public\.trazadoc_guidance_as_of[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/if not is_org_member\(p_organization_id\) then/.test(fn),
    "no se comprueba la pertenencia a la empresa");
});

check("D3. las tablas NO son legibles para los miembros", () => {
  for (const t of ["trazadoc_authoring_guidance", "trazadoc_authoring_guidance_revisions"]) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(MIG),
      `${t} sin RLS`);
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(MIG),
      `${t} no revoca antes de conceder`);
  }
  // La política de lectura es de plataforma: un miembro corriente no puede
  // pedir la fila por identificador, que era el hueco de la columna antigua.
  assert(/create policy trazadoc_authoring_guidance_select on public\.trazadoc_authoring_guidance\s+for select to authenticated using \(is_platform_staff\(\)\);/.test(MIG),
    "la identidad es legible por cualquier miembro");
  assert(/create policy trazadoc_guidance_revisions_select on public\.trazadoc_authoring_guidance_revisions\s+for select to authenticated using \(is_platform_staff\(\)\);/.test(MIG),
    "el TEXTO de la guía es legible por cualquier miembro");
});

check("D4. en Demo se sabe que HAY guía, sin recibirla", () => {
  const fn = /create or replace function public\.trazadoc_guidance_as_of[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/true\s+as has_guidance/.test(fn), "no se informa de que la guía existe");
  assert(/\(not v_permite\)\s+as restricted/.test(fn), "no se informa de la restricción");
  // El aviso de Demo NO se guarda en la base: lo compone la aplicación.
  assert(!/no están disponibles en la versión Demo/.test(MIG),
    "el aviso comercial acabó dentro de la base");
  assert(/demoHint\(\)/.test(GUIDANCE), "la aplicación dejó de componer el aviso fijo");
});

check("D5. fallo cerrado: sin resolución, no hay guía", () => {
  const code = stripTs(GUIDANCE);
  assert(/if \(error\) return \[\];/.test(code),
    "un error de resolución no cae en «sin guía»");
  assert(!/blueprint_sections/.test(code),
    "hay un camino de vuelta hacia la columna congelada");
});

// ===========================================================================
console.log("\nE · LA GUÍA NO ES EVIDENCIA");
// ===========================================================================

check("E1. cada revisión puede declarar qué NO se puede inventar", () => {
  assert(/do_not_invent\s+text/.test(MIG), "no existe el campo");
  assert(/No afirmar que la empresa, el producto o el sistema cumple/.test(MIG),
    "la barrera de §8 no está escrita junto a los textos que la necesitan");
});

check("E2. la clasificación normativa es una lista cerrada", () => {
  for (const clase of ["safe", "normative_reference", "conformity_risk",
                       "certification_risk", "ambiguous"]) {
    assert(new RegExp(`'${clase}'`).test(MIG), `falta la clase ${clase}`);
  }
  assert(/trazadoc_guidance_revisions_normative_check/.test(MIG),
    "la clasificación es un campo libre");
});

check("E3. clasificar es describir, no editar: se hace al escribir", () => {
  const sql = stripSql(MIG);
  // Un `update ... set normative_class` posterior chocaría con la
  // inmutabilidad, y con razón: reclasificar es publicar una revisión nueva.
  assert(!/update[\s\S]{0,200}set normative_class/.test(sql),
    "se reclasifica una revisión ya publicada en lugar de publicar otra");
});

check("E4. el tipo que consume la guía lleva la barrera al lado del texto", () => {
  assert(/doNotInvent: string \| null;/.test(GUIDANCE),
    "quien reciba la guía no recibe qué no puede inventar");
  assert(/relatedContextTypes: string\[\];/.test(GUIDANCE),
    "no se declara qué contexto pediría una revisión contextual");
});

// ===========================================================================
console.log("\nF · QUALITY, SIN INVENTAR 250 TEXTOS");
// ===========================================================================

check("F1. existe la guía por PAPEL de sección", () => {
  assert(/trazadoc_guidance_for_section_role/.test(MIG),
    "no hay forma de dar guía a un documento que no nace de una estructura");
  assert(/getSectionRoleGuidance/.test(GUIDANCE), "el resolver no la expone");
});

check("F2. el módulo quality está admitido, y sin textos inventados", () => {
  assert(/check \(module_key in \('cpr', 'textiles', 'quality'\)\)/.test(MIG),
    "quality no puede tener guía ni el día que se escriba");
  assert(!/'quality',\s*null,\s*'/.test(MIG),
    "se sembraron guías de Quality que nadie escribió");
});

// ===========================================================================
console.log("\nG · LA MIGRACIÓN");
// ===========================================================================

check("G1. la 0136 es la última y va detrás de la 0135", () => {
  const m = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const i = m.indexOf("0136_trazadoc_canonical_authoring_guidance.sql");
  assert(i === m.length - 1, "la 0136 no es la última");
  assert(m[i - 1] === "0135_quality_ai_theme_evidence_scope.sql",
    "algo se coló entre la 0135 y la 0136");
});

check("G2. ninguna migración anterior se editó", () => {
  for (const f of ["0132_quality_ai_copilot.sql",
                   "0133_quality_ai_copilot_completion.sql",
                   "0134_quality_ai_provider_call_truth.sql",
                   "0135_quality_ai_theme_evidence_scope.sql",
                   "0043_trazadocs_core.sql",
                   "0044_trazadocs_seed_blueprints.sql",
                   "0082_textile_trazadocs.sql"]) {
    const c = read(`supabase/migrations/${f}`);
    assert(!/trazadoc_authoring_guidance/.test(c),
      `${f} fue editada con contenido de QUALITY-12.2A`);
  }
});

check("G3. toda función definer fija su search_path", () => {
  const fns = [...MIG.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\$\$;/g)];
  assert(fns.length >= 4, `solo se encontraron ${fns.length} funciones`);
  for (const f of fns) {
    if (!/security definer/.test(f[0])) continue;
    assert(/set search_path = public/.test(f[0]), `${f[1]} no fija search_path`);
  }
});

check("G4. nada se concede a anon", () => {
  assert(!/grant [a-z, ]+ on (table |function )?public\.trazadoc_authoring_guidance[a-z_]* to [a-z, ]*anon/.test(MIG),
    "se concede algo a anon");
  assert(!/to public, anon/.test(MIG.replace(/revoke all[^;]*;/g, "")),
    "se concede algo a public o anon");
});

check("G5. no se llama a ningún proveedor de IA", () => {
  for (const p of ["openai", "anthropic", "QUALITY_AI", "responses.create", "gpt-"]) {
    assert(!new RegExp(p, "i").test(MIG + GUIDANCE + PLATFORM),
      `QUALITY-12.2A no debía tocar el proveedor y menciona ${p}`);
  }
});

console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
