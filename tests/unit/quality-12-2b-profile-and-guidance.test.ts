/**
 * Trazaloop · QUALITY-12.2B · Perfil de empresa y guía de autoría de Quality.
 *
 * Esta suite lee código y SQL. Comprueba lo que tiene que ser cierto antes de
 * que nada de esto llegue a un modelo: que el perfil tiene topes de verdad,
 * que el contexto compacto no arrastra basura, que la guía de Quality no cita
 * normas para parecer seria, y que este sprint no toca el proveedor.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ORG_PROFILE_LIMITS, ORG_PROFILE_TOKEN_BUDGET, authoringContextTokens,
  buildOrganizationProfilePayload, parseProductsServices, renderAuthoringContext,
  validateOrganizationProfileInput, withinProfileBudget,
  type OrganizationAuthoringContext,
} from "../../lib/domain/organization-profile";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const MIG = read("supabase/migrations/0137_organization_profile_and_quality_guidance.sql");
const DOMAIN = read("lib/domain/organization-profile.ts");
const DB = read("lib/db/organization-profile.ts");
const GUIDANCE = read("lib/db/authoring-guidance.ts");
const ACCIONES = read("server/actions/settings.ts");
const ORGS = read("server/actions/organizations.ts");

const SECTORES = ["manufacturing", "food", "textile", "other"];

console.log("\nQUALITY-12.2B · perfil de empresa y guía de Quality\n");

// ===========================================================================
console.log("A · EL PERFIL");
// ===========================================================================

check("A1. cuatro campos, en la propia empresa y no en una tabla aparte", () => {
  assert(/alter table public\.organizations[\s\S]{0,400}add column if not exists sector_code/.test(MIG),
    "el perfil no vive en organizations");
  for (const c of ["sector_code", "primary_activity", "products_services",
                   "organization_description"]) {
    assert(new RegExp(`add column if not exists ${c}`).test(MIG), `falta ${c}`);
  }
  assert(!/create table public\.organization_profiles/.test(MIG),
    "se creó una tabla 1:1 que siempre existiría y siempre estaría llena");
});

check("A2. el sector sale de un catálogo, no de un campo libre", () => {
  assert(/create table public\.organization_sectors/.test(MIG), "no hay catálogo");
  assert(/sector_code text references public\.organization_sectors \(code\)/.test(MIG),
    "el sector no está atado al catálogo");
  const filas = [...MIG.matchAll(/^\s*\('([a-z_]+),?'?/gm)];
  void filas;
  assert(/\('other',\s*'Otro'/.test(MIG), "no hay «Otro» para lo que no encaje");
});

check("A3. los topes están en la BASE, no solo en el formulario", () => {
  assert(/organizations_primary_activity_len[\s\S]{0,160}between 3 and 160/.test(MIG),
    "la actividad no tiene tope en la base");
  assert(/organizations_description_len[\s\S]{0,160}between 10 and 280/.test(MIG),
    "la descripción no tiene tope en la base");
  assert(/organization_products_services_ok/.test(MIG),
    "la lista de productos no tiene forma comprobada");
  assert(/between 1 and 6/.test(MIG) && /length\(btrim\(x\)\) > 50/.test(MIG),
    "la lista de productos no acota cantidad ni longitud");
});

check("A4. los topes del código coinciden con los de la base", () => {
  assert(ORG_PROFILE_LIMITS.primaryActivity === 160, "actividad descuadrada");
  assert(ORG_PROFILE_LIMITS.description === 280, "descripción descuadrada");
  assert(ORG_PROFILE_LIMITS.productItems === 6, "cantidad de productos descuadrada");
  assert(ORG_PROFILE_LIMITS.productItemLength === 50, "longitud de producto descuadrada");
});

check("A5. la validación rechaza lo que la base rechazaría", () => {
  const base = { sectorCode: "food", primaryActivity: "", productsServices: "", description: "" };
  assert(validateOrganizationProfileInput(base, SECTORES).error === null, "un perfil vacío es válido");
  assert(validateOrganizationProfileInput(
    { ...base, sectorCode: "inventado" }, SECTORES).error !== null, "aceptó un sector inventado");
  assert(validateOrganizationProfileInput(
    { ...base, primaryActivity: "x".repeat(161) }, SECTORES).error !== null,
    "aceptó una actividad más larga que el tope");
  assert(validateOrganizationProfileInput(
    { ...base, description: "corta" }, SECTORES).error !== null,
    "aceptó una descripción de cinco caracteres");
  assert(validateOrganizationProfileInput(
    { ...base, productsServices: "a\nb\nc\nd\ne\nf\ng" }, SECTORES).error !== null,
    "aceptó siete productos");
  assert(validateOrganizationProfileInput(
    { ...base, productsServices: "x".repeat(51) }, SECTORES).error !== null,
    "aceptó un producto de 51 caracteres");
});

check("A6. el payload no lleva jamás el identificador de la empresa", () => {
  const p = buildOrganizationProfilePayload({
    sectorCode: "food", primaryActivity: "Panadería industrial",
    productsServices: "Pan\nBollería", description: "",
  });
  assert(!("id" in p) && !("organization_id" in p),
    "el payload declara a qué empresa pertenece, y eso lo decide el servidor");
  assert(Array.isArray(p.products_services) && (p.products_services as string[]).length === 2,
    "la lista no se parseó");
  assert(p.organization_description === null, "un campo vacío debería quedar en null");
});

// ===========================================================================
console.log("\nB · EL CONTEXTO COMPACTO");
// ===========================================================================

const COMPLETO: OrganizationAuthoringContext = {
  organizationName: "Envases del Caribe S.A.S.",
  sector: "Plásticos y caucho",
  primaryActivity: "Fabricación de envases plásticos a partir de resina reciclada posconsumo",
  productsServices: ["Envases para alimentos", "Preformas PET", "Maquila de soplado"],
  description: "Planta en Barranquilla que transforma resina reciclada en envases "
    + "para la industria de alimentos y bebidas, con despacho nacional.",
};

check("B1. solo lleva lo que sirve para redactar", () => {
  // Se mira el CÓDIGO que construye el contexto, no el texto de ejemplo: en
  // castellano «compromisos» contiene «iso» y «bebidas» contiene «id», así que
  // buscar subcadenas en la prosa solo produce falsos positivos.
  const code = DB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = /create or replace function public\.organization_authoring_context[\s\S]*?\$\$;/
    .exec(MIG)![0];
  for (const campo of ["logo", "tax_id", "created_at", "updated_at", "created_by",
                       "legal_name", "address", "phone"]) {
    assert(!fn.includes(campo), `el contexto compacto de la base trae ${campo}`);
  }
  for (const campo of ["logo", "tax_id", "created_at", "updated_at"]) {
    assert(!code.includes(campo), `la lectura del contexto trae ${campo}`);
  }
});

check("B2. un perfil completo cabe en el presupuesto", () => {
  const t = authoringContextTokens(COMPLETO);
  assert(withinProfileBudget(COMPLETO), `un perfil típico ocupa ${t} tokens`);
  assert(t >= 60, `un perfil completo debería aportar algo: ${t} tokens`);
  console.log(`      perfil completo ≈ ${t} tokens (tope ${ORG_PROFILE_TOKEN_BUDGET})`);
});

check("B3. ni el perfil MÁS LARGO POSIBLE se pasa del presupuesto", () => {
  // Los topes de cada campo, todos al máximo a la vez. Si esto cupiera por los
  // pelos, el presupuesto sería una ilusión.
  const maximo: OrganizationAuthoringContext = {
    organizationName: "N".repeat(60),
    sector: "Organizaciones sin ánimo de lucro",
    primaryActivity: "A".repeat(ORG_PROFILE_LIMITS.primaryActivity),
    productsServices: Array.from({ length: ORG_PROFILE_LIMITS.productItems },
      () => "P".repeat(ORG_PROFILE_LIMITS.productItemLength)),
    description: "D".repeat(ORG_PROFILE_LIMITS.description),
  };
  const t = authoringContextTokens(maximo);
  assert(t <= ORG_PROFILE_TOKEN_BUDGET,
    `el perfil máximo ocupa ${t} tokens y el tope es ${ORG_PROFILE_TOKEN_BUDGET}`);
  console.log(`      perfil máximo   ≈ ${t} tokens`);
});

check("B4. un perfil vacío no rompe: devuelve el nombre y ya", () => {
  const vacio: OrganizationAuthoringContext = {
    organizationName: "Empresa antigua",
    sector: null, primaryActivity: null, productsServices: [], description: null,
  };
  const texto = renderAuthoringContext(vacio);
  assert(texto === "Empresa: Empresa antigua", `devolvió: ${texto}`);
  assert(authoringContextTokens(vacio) < 20, "un perfil vacío ocupa demasiado");
});

check("B5. no se trunca en silencio", () => {
  // Lo que no puede recortar es el CONTEXTO. Acortar un valor dentro de un
  // mensaje de error es otra cosa: ahí recortar es cortesía, no pérdida.
  const render = /export function renderAuthoringContext[\s\S]*?\n}/.exec(DOMAIN)![0];
  const payload = /export function buildOrganizationProfilePayload[\s\S]*?\n}/.exec(DOMAIN)![0];
  for (const fn of [render, payload]) {
    assert(!/\.slice\(/.test(fn) && !/substring/.test(fn),
      "el contexto recorta por su cuenta en lugar de rechazar lo que no cabe");
  }
});

check("B6. la lista de productos se parte por líneas y por punto y coma", () => {
  assert(parseProductsServices("Pan\nBollería; Tortas").length === 3, "no se parte bien");
  assert(parseProductsServices("  \n\n ").length === 0, "las líneas vacías cuentan");
});

// ===========================================================================
console.log("\nC · EL PERFIL NO ES EVIDENCIA");
// ===========================================================================

check("C1. la base lo dice donde no se puede ignorar", () => {
  assert(/contexto de ESTILO, nunca evidencia/.test(MIG),
    "la columna de descripción no advierte qué es y qué no es");
  assert(/NINGUNO DE LOS DOS DICE QUÉ HACE LA EMPRESA EN SUS PROCESOS/.test(MIG),
    "la migración no separa perfil de hechos del sistema de gestión");
});

check("C2. nada de este sprint infiere el perfil", () => {
  const todo = DOMAIN + DB + ACCIONES + ORGS;
  for (const p of ["inferir", "deducir", "autocompletar", "guess"]) {
    assert(!new RegExp(p, "i").test(todo.replace(/\/\*[\s\S]*?\*\//g, "")),
      `algo intenta ${p} el perfil`);
  }
  assert(/sin que una persona los confirme|no rellena el perfil/i.test(MIG + DOMAIN),
    "no consta que el perfil no se rellena solo");
});

// ===========================================================================
console.log("\nD · LA GUÍA DE QUALITY");
// ===========================================================================

check("D1. cinco papeles, los que el producto crea de verdad", () => {
  const claves = ["purpose", "scope", "responsibilities", "development", "records"];
  const acciones = read("server/actions/quality-documents.ts");
  const defecto = /const DEFAULT_SECTIONS = \[[\s\S]*?\] as const;/.exec(acciones)![0];
  for (const k of claves) {
    assert(new RegExp(`key: "${k}"`).test(defecto),
      `${k} no es una sección que el producto cree`);
    assert(new RegExp(`\\('${k}',`).test(MIG), `no hay guía para ${k}`);
  }
  // Y ni una más: inventar papeles sería inventar documentos.
  const enMigracion = [...MIG.matchAll(/\('(purpose|scope|responsibilities|development|records)',\s*'/g)];
  assert(enMigracion.length === 5, `se sembraron ${enMigracion.length} papeles`);
});

check("D2. NO se crearon blueprints falsos para Quality", () => {
  assert(!/insert into public\.trazadoc_blueprints/.test(MIG),
    "se creó una estructura artificial para que Quality tuviera guía");
  assert(/'section_role', 'quality'/.test(MIG),
    "la guía de Quality no usa el alcance por papel");
});

check("D3. las guías de Quality no citan ninguna norma", () => {
  const bloque = /for v_fila in\s+select \* from \(values\s+\('purpose'[\s\S]*?end \$\$;/
    .exec(MIG)![0];
  // Con límite de palabra: «compromisos» contiene «iso» y «revisión» contiene
  // «isi». Buscar subcadenas en castellano encuentra normas donde no las hay.
  for (const n of ["\\bISO\\b", "\\b9001\\b", "\\bNTC\\b", "\\bUNE\\b", "certificad"]) {
    assert(!new RegExp(n, "i").test(bloque),
      `una guía genérica de Quality cita ${n}: orientar la redacción de un «Objetivo» no lo necesita`);
  }
});

check("D4. cada guía de Quality dice qué NO se puede inventar", () => {
  const bloque = /for v_fila in\s+select \* from \(values\s+\('purpose'[\s\S]*?end \$\$;/
    .exec(MIG)![0];
  const noInventar = [...bloque.matchAll(/'No (inventar|atribuir|dar por|asumir)[^']*'/g)];
  assert(noInventar.length >= 5, `solo ${noInventar.length} de 5 declaran su barrera`);
  assert(/No inventar responsables, cargos ni atribuciones/.test(bloque),
    "la sección de responsabilidades no prohíbe inventar un responsable");
});

check("D5. las secciones a medida NO reciben guía, y es correcto", () => {
  assert(/no son papeles/.test(MIG),
    "no consta por qué una sección propia de la empresa no tiene guía");
  assert(/porClave\.get\(s\.sectionKey\)/.test(GUIDANCE),
    "la resolución no es por papel de sección");
  assert(/if \(!g \|\| !g\.hasGuidance\) continue;/.test(GUIDANCE),
    "una sección sin papel conocido acabaría con guía de otra");
});

// ===========================================================================
console.log("\nE · EL CONTEXTO RELACIONADO");
// ===========================================================================

check("E1. la taxonomía es cerrada y pequeña", () => {
  assert(/trazadoc_guidance_related_context_check/.test(MIG), "no se valida");
  const lista = /check \(related_context_types <@ array\[([\s\S]*?)\]::text\[\]\)/.exec(MIG)![1];
  const valores = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert(valores.length >= 8 && valores.length <= 16,
    `la taxonomía tiene ${valores.length} valores: ni cerrada ni pequeña`);
  for (const v of ["organization_profile", "process", "position", "document"]) {
    assert(valores.includes(v), `falta ${v}`);
  }
  // Sin sinónimos que en 12.2D obligarían a adivinar.
  assert(!valores.includes("positions") && !valores.includes("cargo"),
    "hay sinónimos en la taxonomía");
});

check("E2. se enriquece por PAPEL, no a bulto", () => {
  assert(/as m\(clave, barrera, contexto\) on m\.clave = g\.section_key/.test(MIG),
    "el enriquecimiento no se ata al papel de la sección");
  assert(/and r\.do_not_invent is null/.test(MIG),
    "el enriquecimiento pisaría barreras ya escritas");
  assert(/repetir el mismo párrafo burocrático en 250 filas no\n-- protege de nada/.test(MIG),
    "no consta por qué no se rellenaron las 250");
});

check("E3. enriquecer crea revisión, no reescribe", () => {
  const bloque = MIG.slice(MIG.indexOf("LA BARRERA, DONDE EL PAPEL"));
  assert(/set effective_to = v_ahora where id = v_fila\.rev_id/.test(bloque),
    "no se cierra la revisión anterior");
  assert(/insert into trazadoc_authoring_guidance_revisions/.test(bloque),
    "no se publica una revisión nueva");
  assert(/set superseded_by_revision_id = v_nuevo/.test(bloque),
    "la anterior no queda enlazada con la nueva");
  assert(bloque.indexOf("set effective_to") < bloque.indexOf("insert into"),
    "se abre la nueva antes de cerrar la vigente");
});

// ===========================================================================
console.log("\nF · SEGURIDAD Y ALCANCE DEL SPRINT");
// ===========================================================================

check("F1. el contexto compacto exige pertenencia", () => {
  const fn = /create or replace function public\.organization_authoring_context[\s\S]*?\$\$;/.exec(MIG)![0];
  assert(/if not \(is_org_member\(p_organization_id\) or is_platform_staff\(\)\) then/.test(fn),
    "cualquiera podría pedir el perfil de cualquier empresa");
  assert(/security definer/.test(fn) && /set search_path = public/.test(fn),
    "la función definer no fija search_path");
});

check("F2. editar el perfil exige rol y empresa activa", () => {
  const fn = /export async function updateOrganizationProfileAction[\s\S]*?\n}/.exec(ACCIONES)![0];
  assert(/await requireActiveOrg\(\)/.test(fn), "no se resuelve la empresa en servidor");
  assert(/canEditCompany\(org\.roleCode\)/.test(fn), "no se comprueba el rol");
  assert(/checkOrganizationCanMutate\(\)/.test(fn), "no se comprueba el estado de la empresa");
  assert(/org\.organizationId, buildOrganizationProfilePayload/.test(fn),
    "el identificador de empresa no sale del servidor");
});

check("F3. el catálogo de sectores es de solo lectura", () => {
  assert(/revoke all on table public\.organization_sectors from anon, authenticated;/.test(MIG),
    "no se revoca antes de conceder");
  assert(/grant select on table public\.organization_sectors to authenticated;/.test(MIG),
    "no se concede la lectura");
  assert(!/grant [a-z, ]*insert[a-z, ]* on table public\.organization_sectors/.test(MIG),
    "una empresa podría inventarse sectores");
});

check("F4. este sprint NO toca el proveedor de IA", () => {
  const todo = MIG + DOMAIN + DB + ACCIONES + ORGS
    + read("components/domain/settings/organization-profile-form.tsx");
  for (const p of ["openai", "anthropic", "QUALITY_AI", "responses.create",
                   "quick_edit", "contextual_review", "gpt-"]) {
    assert(!new RegExp(p, "i").test(todo), `QUALITY-12.2B menciona ${p}`);
  }
});

check("F5. la 0137 es la última y no edita ninguna anterior", () => {
  const m = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const i = m.indexOf("0137_organization_profile_and_quality_guidance.sql");
  assert(i === m.length - 1, "la 0137 no es la última");
  assert(m[i - 1] === "0136_trazadoc_canonical_authoring_guidance.sql",
    "algo se coló entre la 0136 y la 0137");
  for (const f of ["0136_trazadoc_canonical_authoring_guidance.sql",
                   "0006_rls_tenancy.sql", "0042_restrict_organization_creation.sql"]) {
    assert(!/organization_sectors|organization_authoring_context/.test(read(`supabase/migrations/${f}`)),
      `${f} fue editada con contenido de QUALITY-12.2B`);
  }
});

check("F6. las empresas existentes no se rompen ni se rellenan", () => {
  assert(!/update public\.organizations\s+set (sector_code|primary_activity)/.test(MIG),
    "se rellenó el perfil de empresas existentes");
  for (const c of ["sector_code", "primary_activity", "products_services",
                   "organization_description"]) {
    assert(!new RegExp(`${c}[^;]*not null`).test(MIG), `${c} se declaró obligatorio`);
  }
});

console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
