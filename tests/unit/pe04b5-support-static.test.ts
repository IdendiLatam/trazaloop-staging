/**
 * Trazaloop · PE-04B5 · Lo que se puede comprobar leyendo.
 *
 * Correr: npm run test:pe04b5-static
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
function archivos(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const r = join(dir, e);
    if (statSync(r).isDirectory()) archivos(r, salida);
    else if (/\.tsx?$/.test(e)) salida.push(r);
  }
  return salida;
}
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\*\s.*$/gm, "");
}

const M67 = leer("supabase/migrations/0167_support_entitlements_and_commercial_admin.sql");

console.log("\nPE-04B5 · Estático\n");

// ---------------------------------------------------------------------------
console.log("A · Una sola puerta de envío");
// ---------------------------------------------------------------------------

check("A1. Ningún camino inserta en `support_tickets` fuera de la RPC", () => {
  // Una segunda puerta que inserta sin resolver el derecho es la forma de que
  // el cupo deje de significar algo el día que alguien la use por comodidad.
  const intrusos = ["lib", "server", "app", "components"]
    .flatMap((r) => archivos(r))
    .filter((ruta) => /from\("support_tickets"\)\s*\n?\s*\.insert\(/.test(sinComentarios(leer(ruta))));
  assert(intrusos.length === 0,
    `insertan tickets directamente: ${intrusos.join(", ")}. El único envío es \`support_submit_ticket\`.`);
});

check("A2. `insertSupportTicket` sigue retirada", () => {
  assert(!/export async function insertSupportTicket\b/.test(leer("lib/db/support.ts")),
    "volvió la escritura directa que no comprobaba el derecho comercial");
});

check("A3. El envío pasa por la RPC atómica", () => {
  const acc = leer("server/actions/support.ts");
  assert(acc.includes("submitSupportTicket("), "la acción no usa la puerta canónica");
  assert(leer("lib/db/support-entitlements.ts").includes('rpc("support_submit_ticket"'),
    "la capa de datos no llama a la RPC de envío");
});

// ---------------------------------------------------------------------------
console.log("\nB · Los dos ejes, separados");
// ---------------------------------------------------------------------------

check("B1. El derecho NO se deduce de la categoría", () => {
  // Deducirlo de la etiqueta que el cliente eligió para el tema sería deducir
  // un derecho comercial de una palabra suya.
  const i = M67.indexOf("create or replace function public.organization_support_entitlement");
  const cuerpo = M67.slice(i, M67.indexOf("$$;", i));
  for (const cat of ["'bug'", "'technical_support'", "'trazadocs'", "'calculation'"]) {
    assert(!cuerpo.includes(cat), `el resolutor mira la categoría ${cat}`);
  }
  assert(cuerpo.includes("functional_support_cases_monthly"),
    "el resolutor no lee el límite del catálogo canónico");
});

check("B2. El reporte técnico está SIEMPRE permitido, incluso sin plan resoluble", () => {
  const i = M67.indexOf("create or replace function public.organization_support_entitlement");
  const cuerpo = M67.slice(i, M67.indexOf("$$;", i));
  const rama = cuerpo.slice(cuerpo.indexOf("v_plan->>'status' <> 'found'"));
  assert(/'technical_reporting_allowed', true/.test(rama.slice(0, 600)),
    "sin plan resoluble se cierra el reporte de averías: enterarse de que el producto está roto no puede depender de leer un plan");
});

check("B3. Un ticket técnico no consume: solo el funcional fija periodo", () => {
  const i = M67.indexOf("create or replace function public.support_submit_ticket");
  const cuerpo = M67.slice(i, M67.indexOf("$$;", i));
  assert(/if p_support_kind = 'functional_guidance' then/.test(cuerpo),
    "el consumo no está acotado al tipo funcional");
  assert(cuerpo.includes("pg_advisory_xact_lock"), "el consumo no se serializa por empresa");
});

check("B4. La UX enseña los dos ejes por separado", () => {
  const tarjeta = leer("components/domain/support/support-entitlement-card.tsx");
  assert(/Problemas t[eé]cnicos/.test(tarjeta), "no se enseña el eje técnico");
  assert(/Orientaci[oó]n funcional/.test(tarjeta), "no se enseña el eje funcional");
  assert(/no consume/i.test(tarjeta),
    "no se dice que reportar una avería no gasta cupo · quien lo dude dejará de reportar");
  assert(!/Acompa[ñn]amiento[^.]{0,40}incluid/i.test(tarjeta),
    "se insinúa que el Acompañamiento está incluido");
});

check("B5. Y no se promete un plazo de resolución", () => {
  for (const f of ["components/domain/support/support-entitlement-card.tsx",
                   "components/domain/support/support-kind-choice.tsx"]) {
    const src = leer(f);
    assert(!/resuelto en|resolvemos en|soluci[oó]n en 24/i.test(src),
      `${f} promete un plazo de resolución`);
    if (/1 d[ií]a h[aá]bil/.test(src)) {
      assert(/respuesta inicial/i.test(src), `${f} da el plazo sin decir que es de PRIMERA RESPUESTA`);
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · La cola");
// ---------------------------------------------------------------------------

check("C1. La severidad técnica va por delante de la prioridad comercial", () => {
  const i = M67.indexOf("create or replace function public.support_queue_rank");
  const cuerpo = M67.slice(i, M67.indexOf("$$;", i));
  const posTecnico = cuerpo.indexOf("p_support_kind = 'technical' and p_priority = 'urgent'");
  const posComercial = cuerpo.indexOf("p_commercial_priority = 'prioritized'");
  assert(posTecnico > -1 && posComercial > -1, "faltan las ramas de la cola");
  assert(posTecnico < posComercial,
    "lo comercial se evalúa antes que la severidad: pagar no puede colarse delante de una caída");
});

// ---------------------------------------------------------------------------
console.log("\nD · La consola comercial");
// ---------------------------------------------------------------------------

check("D1. Solo la administración de plataforma escribe", () => {
  const acc = leer("server/actions/commercial-console.ts");
  const escrituras = ["createDraftRevisionAction", "updateDraftRevisionAction",
    "updateDraftLimitAction", "publishRevisionAction", "assignPlanAction"];
  for (const fn of escrituras) {
    const i = acc.indexOf(`export async function ${fn}`);
    assert(i > -1, `falta ${fn}`);
    const siguiente = acc.indexOf("export async function", i + 10);
    const cuerpo = acc.slice(i, siguiente === -1 ? undefined : siguiente);
    assert(cuerpo.includes("exigirSuperadmin()"), `${fn} no exige administración de plataforma`);
  }
  assert(M67.includes("is_platform_superadmin()"),
    "la base no vuelve a comprobarlo por su cuenta");
});

check("D2. Publicar y cambiar de plan exigen confirmación escrita", () => {
  const acc = leer("server/actions/commercial-console.ts");
  assert(acc.includes('formData.get("confirm") !== "publicar"'), "publicar no pide confirmación");
  assert(acc.includes('formData.get("confirm") !== "cambiar"'), "la transición no pide confirmación");
  const consola = leer("components/domain/platform/plan-catalog-console.tsx");
  assert(consola.includes("describeRevisionChanges("),
    "se confirma sin enseñar QUÉ cambia · confirmar sobre un JSON no es confirmar");
});

check("D3. Publicar NO mueve a las empresas ya asignadas · y se dice en pantalla", () => {
  const consola = leer("components/domain/platform/plan-catalog-console.tsx");
  assert(/no se mueven/i.test(consola),
    "la pantalla no advierte que las empresas ya asignadas conservan su revisión");
  const acc = leer("server/actions/commercial-console.ts");
  assert(!/update\([^)]*organization_plan_assignments/.test(acc),
    "publicar toca asignaciones existentes");
});

check("D4. `core` no se puede asignar · ni en la base ni en la pantalla", () => {
  assert(M67.includes("MODULE_NOT_COMMERCIAL"), "la base no rechaza los módulos internos");
  assert(leer("lib/db/module-catalog-read.ts").includes('eq("is_functional", true)'),
    "la pantalla ofrece módulos no funcionales");
});

check("D5. Etiquetas humanas, no claves internas", () => {
  const cat = leer("lib/domain/commercial-catalog.ts");
  for (const [clave, etiqueta] of [
    ["storage_bytes", "Almacenamiento"],
    ["ai_weighted_credits_monthly", "Créditos de Intelligence"],
    ["functional_support_cases_monthly", "Orientación funcional"],
  ]) {
    assert(cat.includes(`${clave}: "${etiqueta}"`), `falta la etiqueta humana de ${clave}`);
  }
  // La invariante es que se DICE, no que se grite: B6F.1 pasó el aviso a
  // minúsculas y añadió que el impuesto se calcula aparte, sin prometer un país.
  assert(/antes de impuestos/i.test(cat),
    "no se dice que los precios son antes de impuestos");
  assert(/por separado/i.test(cat),
    "no se dice que los impuestos se calculan aparte");
});

check("D6. «Sin configurar» no se enseña como «sin límite» ni como cero", () => {
  const cat = leer("lib/domain/commercial-catalog.ts");
  assert(/not_configured[\s\S]{0,120}Sin configurar/.test(cat),
    "un límite sin decidir se pinta como si alguien lo hubiera decidido");
});

// ---------------------------------------------------------------------------
console.log("\nE · Nada legacy presentado como vigente");
// ---------------------------------------------------------------------------

check("E1. La cola de plataforma enseña el plan CANÓNICO", () => {
  const i = M67.indexOf("create view public.v_platform_support_ticket_summary");
  const cuerpo = M67.slice(i, M67.indexOf(";", M67.indexOf("where public.is_platform_staff()", i)));
  assert(cuerpo.includes("organization_effective_plan_code"),
    "la cola de soporte sigue enseñando el plan heredado como si fuera el vigente");
  assert(!/coalesce\(sub\.plan_code/.test(cuerpo), "sigue el coalesce a «demo»");
  assert(cuerpo.includes("account_status"),
    "el estado administrativo sigue llamándose como si fuera el plan");
});

check("E2. La consola no lee planes legacy", () => {
  for (const f of ["lib/db/commercial-console.ts", "server/actions/commercial-console.ts",
                   "components/domain/platform/organization-commercial-panel.tsx"]) {
    const src = sinComentarios(leer(f));
    assert(!/organization_subscriptions|plan_definitions/.test(src),
      `${f} lee el catálogo o la suscripción heredados`);
  }
});

check("E3. No aparece Demo como plan canónico ni Advisor como plan", () => {
  const cat = leer("lib/domain/commercial-catalog.ts");
  assert(/PLAN_DISPLAY_ORDER[\s\S]{0,120}"free", "full", "extra"/.test(cat),
    "el orden de planes no es exactamente Free, Full y Extra");
  assert(!/"demo"|"advisor"/.test(cat), "aparece un plan que no existe comercialmente");
  const pagina = leer("app/(app)/platform/plans/page.tsx");
  assert(/Acompa[ñn]amiento especializado/.test(pagina) && /no es un plan/.test(pagina),
    "no se dice que el Acompañamiento es un servicio aparte y no un plan");
});

check("E4. Configurado y efectivo se enseñan por separado", () => {
  const panel = leer("components/domain/platform/organization-commercial-panel.tsx");
  assert(/Plan efectivo/.test(panel), "no se enseña el plan efectivo");
  assert(/Asignaciones configuradas/.test(panel), "no se enseñan las asignaciones configuradas");
});

check("E5. La bajada avisa del impacto y promete que no se borra nada", () => {
  const panel = leer("components/domain/platform/organization-commercial-panel.tsx");
  assert(/NO SE BORRAR[ÁA] NING[ÚU]N DATO/.test(panel), "no se dice que no se borra nada");
  assert(/por encima del l[ií]mite/.test(panel), "no se advierte que puede quedar por encima de la cuota");
});

// ---------------------------------------------------------------------------
console.log("\nF · Seguridad y alcance");
// ---------------------------------------------------------------------------

check("F1. Las tablas nuevas nacen con RLS y política", () => {
  const creadas = [...M67.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert(creadas.length >= 2, `se esperaban al menos 2 tablas nuevas, hay ${creadas.length}`);
  for (const t of creadas) {
    assert(M67.includes(`alter table public.${t} enable row level security`), `${t} nace sin RLS`);
    assert(new RegExp(`create policy \\w+ on public\\.${t}`).test(M67), `${t} no tiene política`);
    assert(new RegExp(`revoke insert, update, delete, truncate on public\\.${t}`).test(M67),
      `${t} no revoca la escritura`);
  }
  assert(M67.includes("SEC01_RLS_PREFLIGHT"), "0167 no lleva el preflight de seguridad");
});

check("F2. `/support` sigue fuera del reloj y de la puerta de mutación", () => {
  // Una empresa Free que agotó su tiempo tiene que poder decir «Trazaloop está
  // roto». Si el envío pasara por la puerta de negocio, el modo consulta lo
  // bloquearía y nos quedaríamos sin enterarnos.
  const reg = leer("lib/usage/metered-surfaces.ts");
  assert(/prefix: "\/support"/.test(reg), "`/support` dejó de estar exento del reloj");
  // Se quitan los comentarios antes de mirar: el propio código EXPLICA que
  // aquí nunca se llama a la puerta de mutación, y esa explicación no es una
  // llamada. Confundirlas es como se convierte un guardia en ruido.
  const acc = sinComentarios(leer("server/actions/support.ts"));
  const i = acc.indexOf("export async function createSupportTicketAction");
  const cuerpo = acc.slice(i, acc.indexOf("export async function", i + 10));
  assert(!/checkOrganizationCanMutate|checkCprCanMutate|checkQualityCanMutate/.test(cuerpo),
    "el envío de tickets pasa por la puerta de mutación de negocio");
});

check("F3. Soporte no hereda acceso general al inquilino", () => {
  // Ver un ticket no puede convertirse en ver la empresa entera.
  const i = M67.indexOf("create policy support_reclass_select");
  const cuerpo = M67.slice(i, M67.indexOf(";", i));
  assert(/is_org_member\(organization_id\) or public\.is_platform_staff\(\)/.test(cuerpo),
    "la política de reclasificaciones no acota por empresa ni por personal");
});

console.log(`\nPE-04B5 · estático: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
