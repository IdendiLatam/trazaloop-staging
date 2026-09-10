import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo } from "../support/fixture-cleanup";
import { readFileSync } from "node:fs";
import {
  etiquetaComercial, esAccesoDePrueba, aclaracionDePrueba,
  type EstadoComercial,
} from "../../lib/plans/commercial-display";
import { finDelDiaEnZona } from "../../lib/domain/zona-horaria";
import { mensajeDeTransicion } from "../../lib/domain/transicion-comercial";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · STABILIZATION-01 · Que el estado comercial diga la verdad.
 *
 * LOS CUATRO DEFECTOS QUE ESTA SUITE IMPIDE QUE VUELVAN
 *
 *   · Una empresa en prueba leía «Plan Full» en su propio panel sin haber
 *     contratado nada.
 *   · «Módulos y planes por empresa» parecía convertirla en cliente Full y no
 *     movía ni el plan ni las cuotas.
 *   · La transición comercial fallaba con una frase que no decía nada.
 *   · Y `organization_plan_limits` llevaba rota para TODAS las empresas por un
 *     tipo de retorno, fallando en silencio.
 *
 * Casi todo se ejecuta contra la base, con sesiones reales, porque estas cosas
 * no se comprueban leyendo el código: se comprueban preguntándole al sistema.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!URL || !SERVICE || !ANON || !DB_URL) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
const pg = new PgClient({ connectionString: DB_URL });

let passed = 0;
let failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];

async function check(nombre: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}
function assert(cond: boolean, mensaje: string) {
  if (!cond) throw new Error(mensaje);
}

async function persona(etiqueta: string, staff = false) {
  const email = `stab01-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  assert(!error && Boolean(u.user), `crear ${etiqueta}: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  if (staff) {
    await admin.from("platform_staff")
      .insert({ user_id: uid, role_code: "superadmin", status: "active" });
  }
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  return { uid, cli };
}

/** Una empresa nueva, por el camino real del producto. */
async function empresaNueva(etiqueta: string) {
  const p = await persona(etiqueta);
  const { data: orgId, error } = await p.cli.rpc("create_organization",
    { p_name: `STAB01 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  assert(!error && typeof orgId === "string", `crear empresa: ${error?.message}`);
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", p.uid);
  return { org, ...p };
}

/** El estado comercial tal y como lo compone la lectura única del servidor. */
async function estadoDe(cli: SupabaseClient, org: string): Promise<EstadoComercial> {
  const [efectivo, contratado] = await Promise.all([
    cli.rpc("plan_effective_for_organization", { p_organization_id: org }),
    cli.rpc("plan_effective_for_organization_non_trial", { p_organization_id: org }),
  ]);
  const e = (efectivo.data ?? {}) as Record<string, unknown>;
  const c = (contratado.data ?? {}) as Record<string, unknown>;
  return {
    contractedPlanCode: (c.plan_code as EstadoComercial["contractedPlanCode"]) ?? null,
    effectivePlanCode: (e.plan_code as EstadoComercial["effectivePlanCode"]) ?? null,
    grantKind: (e.grant_kind as EstadoComercial["grantKind"]) ?? null,
    grantEndsAt: (e.ends_at as string | null) ?? null,
    contractedPlanRevisionId: (c.plan_revision_id as string | null) ?? null,
  };
}

const leer = (p: string) => readFileSync(p, "utf8");

/**
 * El código SIN comentarios. Tres de estas comprobaciones nacieron rojas por
 * leer la prosa: el aviso «lleva la cifra 48» porque su cabecera EXPLICA que la
 * prueba dura 48 horas, y el panel «mira la tabla heredada» porque un
 * comentario dice que ya NO la mira. Una guarda que se dispara con el texto que
 * explica lo contrario de lo que persigue no protege nada.
 */
const leerCodigo = (p: string) =>
  leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

async function main() {
  console.log("\nSTABILIZATION-01 · el estado comercial\n");
  await pg.connect();

  const staff = await persona("staff", true);
  const nueva = await empresaNueva("nueva");

  // =========================================================================
  console.log("A · Lo contratado y lo efectivo son cosas distintas");
  // =========================================================================

  let estadoNueva: EstadoComercial;

  await check("1. Empresa nueva · contratado free, efectivo full, concesión de prueba", async () => {
    estadoNueva = await estadoDe(nueva.cli, nueva.org);
    assert(estadoNueva.contractedPlanCode === "free",
      `contratado = ${estadoNueva.contractedPlanCode}`);
    assert(estadoNueva.effectivePlanCode === "full",
      `efectivo = ${estadoNueva.effectivePlanCode}`);
    assert(estadoNueva.grantKind === "trial", `concesión = ${estadoNueva.grantKind}`);
    assert(Boolean(estadoNueva.grantEndsAt), "una prueba sin fecha de fin no es una prueba");
  });

  await check("2. Y NO se le llama «Full» · se le llama Demo Full, con su fecha", async () => {
    const etiqueta = etiquetaComercial(estadoNueva);
    assert(etiqueta.startsWith("Demo Full"), `la etiqueta fue «${etiqueta}»`);
    assert(etiqueta !== "Full", "seguía diciendo que la empresa tiene Full");
    assert(etiqueta.includes("hasta"), "no dice hasta cuándo");
    const aclara = aclaracionDePrueba(estadoNueva);
    assert(Boolean(aclara) && aclara!.includes("no ha contratado"),
      "falta la frase que dice que no lo contrató");
  });

  await check("3. Panel y consola resuelven con la MISMA lectura", () => {
    const panel = leer("app/(app)/(shell)/(cpr)/dashboard/page.tsx");
    const consola = leer("app/(app)/platform/organizations/[id]/page.tsx");
    for (const [nombre, src] of [["el panel", panel], ["la consola", consola]] as const) {
      assert(src.includes("getOrganizationCommercialState("),
        `${nombre} no usa la lectura única del estado comercial`);
    }
    assert(consola.includes("etiquetaComercial(estadoComercial)"),
      "la consola no usa la etiqueta común");
    assert(!consola.includes("PLAN_LABEL[planDetail.effectivePlanCode]"),
      "la consola volvió a pintar el código efectivo a secas");
    const estado = leer("lib/db/commercial-state.ts");
    assert(estado.includes("plan_effective_for_organization")
      && estado.includes("plan_effective_for_organization_non_trial"),
      "la lectura única no deriva de las dos resoluciones canónicas");
  });

  // =========================================================================
  console.log("\nB · Durante la prueba, cada cuota sale de donde debe");
  // =========================================================================

  await check("4. Almacenamiento y minutos son los de Full; los créditos mensuales, los de Free", async () => {
    const { data: alm } = await nueva.cli.rpc("organization_storage_quota",
      { p_organization_id: nueva.org });
    const a = alm as Record<string, unknown>;
    assert(a.plan_code === "full" && Number(a.limit_bytes) === 524_288_000,
      `almacenamiento: ${JSON.stringify(a)}`);

    const { data: tiempo } = await nueva.cli.rpc("organization_time_status",
      { p_organization_id: nueva.org });
    const t = tiempo as Record<string, unknown>;
    assert(t.metered === false, `durante la prueba el tiempo no se mide: ${JSON.stringify(t)}`);

    const { data: cred } = await nueva.cli.rpc("ai_credits_status",
      { p_organization_id: nueva.org });
    const c = cred as Record<string, unknown>;
    assert(c.monthly_plan_code === "free",
      `la bolsa mensual tiene que salir del plan contratado, y salió de ${c.monthly_plan_code}`);
    assert(Number(c.monthly_limit) === 25, `mensuales = ${c.monthly_limit}`);
    assert(c.trial_active === true, "la bolsa de la prueba no está viva");
    assert(Number(c.trial_total) === 50, `extraordinarios = ${c.trial_total}`);
  });

  await check("5. Y las dos bolsas son SEPARADAS · 25 renovables + 50 una sola vez", async () => {
    const { rows } = await pg.query(
      `select coalesce(t.trial_ai_credits,0)::int as extras from public.commercial_trial_policy t`);
    assert(rows[0].extras === 50, `la política declara ${rows[0].extras} extraordinarios`);
    const { rows: pools } = await pg.query(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.ai_credit_ledger'::regclass and pg_get_constraintdef(oid) ilike '%pool%'`);
    assert(pools.length > 0, "el libro de créditos no distingue bolsas");
    const alw = leer("lib/db/commercial-state.ts");
    assert(alw.includes("creditosPruebaTotal") && alw.includes("creditosMensuales"),
      "el resumen del aviso no separa las dos bolsas");
  });

  await check("6. El aviso de Demo no lleva ni una cifra escrita a mano", () => {
    const src = leerCodigo("components/domain/onboarding/trial-access-banner.tsx");
    for (const n of ["25", "50", "48", "30", "500"]) {
      assert(!new RegExp(`>\\s*${n}\\b|\\b${n}\\s*(créditos|horas|minutos)`).test(src),
        `el aviso lleva la cifra ${n} escrita a mano`);
    }
    assert(src.includes("resumen.creditosMensuales")
      && src.includes("resumen.creditosPruebaTotal")
      && src.includes("resumen.minutosDiariosTrasLaPrueba")
      && src.includes("resumen.duracionHoras"),
      "el aviso no está leyendo las cifras del sistema");
  });

  // =========================================================================
  console.log("\nC · Los límites del plan vuelven a leerse");
  // =========================================================================

  await check("7. `organization_plan_limits` devuelve filas · no lista vacía", async () => {
    const { data, error } = await nueva.cli.rpc("organization_plan_limits",
      { p_organization_id: nueva.org });
    assert(!error, `la función volvió a fallar: ${error?.message}`);
    const filas = (data ?? []) as Array<Record<string, unknown>>;
    assert(filas.length > 0, "devolvió una lista vacía");
    const alm = filas.find((f) => f.resource_code === "storage_bytes");
    assert(Number(alm?.limit_value) === 524_288_000, `almacenamiento: ${alm?.limit_value}`);
  });

  await check("8. Extra · 5 GB sin desbordar el entero", async () => {
    const extra = await empresaNueva("extra");
    const { data: rev } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", "extra").eq("status", "published").is("effective_to", null).single();
    const { error } = await staff.cli.rpc("commercial_assign_plan", {
      p_organization_id: extra.org, p_plan_revision_id: (rev as { id: string }).id,
      p_scope: "organization", p_module_code: null, p_starts_at: null, p_ends_at: null,
      p_reason: "STAB01 · comprobación de 5 GB" });
    assert(!error, `asignar extra: ${error?.message}`);
    const { data, error: e2 } = await staff.cli.rpc("organization_plan_limits",
      { p_organization_id: extra.org });
    assert(!e2, `límites de extra: ${e2?.message}`);
    const alm = ((data ?? []) as Array<Record<string, unknown>>)
      .find((f) => f.resource_code === "storage_bytes");
    assert(Number(alm?.limit_value) === 5_368_709_120,
      `5 GB llegaron como ${alm?.limit_value}`);
  });

  // =========================================================================
  console.log("\nD · Acceso a módulos NO es plan comercial");
  // =========================================================================

  await check("9. Cambiar `access_mode` no mueve plan, ni contratado, ni cuotas", async () => {
    const antes = await estadoDe(staff.cli, nueva.org);
    const { data: almAntes } = await staff.cli.rpc("organization_storage_quota",
      { p_organization_id: nueva.org });
    const { rows: asigAntes } = await pg.query(
      "select count(*)::int n from public.organization_plan_assignments where organization_id=$1",
      [nueva.org]);

    const { error } = await staff.cli.rpc("set_organization_module_access", {
      p_organization_id: nueva.org, p_module_code: "quality", p_target_state: "extra" });
    assert(!error, `cambiar acceso: ${error?.message}`);

    const despues = await estadoDe(staff.cli, nueva.org);
    const { data: almDespues } = await staff.cli.rpc("organization_storage_quota",
      { p_organization_id: nueva.org });
    const { rows: asigDespues } = await pg.query(
      "select count(*)::int n from public.organization_plan_assignments where organization_id=$1",
      [nueva.org]);

    assert(JSON.stringify(antes) === JSON.stringify(despues),
      `el estado comercial se movió: ${JSON.stringify(antes)} → ${JSON.stringify(despues)}`);
    assert(JSON.stringify(almAntes) === JSON.stringify(almDespues), "la cuota cambió");
    assert(asigAntes[0].n === asigDespues[0].n, "aparecieron o desaparecieron asignaciones");

    const { data: mod } = await admin.from("organization_modules").select("access_mode")
      .eq("organization_id", nueva.org).eq("module_code", "quality").single();
    assert((mod as { access_mode: string }).access_mode === "extra",
      "y sin embargo el acceso al módulo sí tenía que cambiar");
  });

  await check("10. Y la pantalla ya no se presenta como cambio de plan", () => {
    const src = leer("components/domain/platform/organization-modules-section.tsx");
    assert(src.includes("Acceso a módulos"), "no se renombró la sección");
    assert(!/>\s*Módulos y planes de la empresa\s*</.test(src),
      "sigue titulándose «Módulos y planes de la empresa»");
    assert(/No cambia su plan contratado|no cambia el plan/i.test(src),
      "no advierte que no cambia el plan comercial");
    assert(src.includes("Transición comercial"),
      "no dice dónde se cambia el plan de verdad");
  });

  // =========================================================================
  console.log("\nE · La transición comercial");
  // =========================================================================

  await check("11. Sigue siendo el único camino que mueve el plan", async () => {
    const { rows } = await pg.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prokind='f' and p.prorettype <> 'trigger'::regtype::oid
          and pg_get_functiondef(p.oid) ~* '(insert into|update)[[:space:]]+(public\\.)?organization_plan_assignments'
        order by 1`);
    const escritores = rows.map((r: { proname: string }) => r.proname);
    for (const esperado of ["commercial_apply_assignment", "commercial_provision_module_base"]) {
      assert(escritores.includes(esperado), `falta ${esperado} entre los escritores`);
    }
    assert(!escritores.includes("set_organization_module_access"),
      "la pantalla de módulos ganó capacidad de escribir asignaciones comerciales");
    const accion = leer("server/actions/commercial-console.ts");
    assert(accion.includes('rpc("commercial_assign_plan"'),
      "la transición dejó de pasar por la primitiva canónica");
  });

  await check("12. Una transición válida sí cambia el estado y arrastra la cuota", async () => {
    const cliente = await empresaNueva("cliente");
    const antes = await estadoDe(staff.cli, cliente.org);
    assert(antes.contractedPlanCode === "free", "no partía de Free");

    const { data: rev } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single();
    const { error } = await staff.cli.rpc("commercial_assign_plan", {
      p_organization_id: cliente.org, p_plan_revision_id: (rev as { id: string }).id,
      p_scope: "organization", p_module_code: null, p_starts_at: null, p_ends_at: null,
      p_reason: "STAB01 · contratación de Full" });
    assert(!error, `transición: ${error?.message}`);

    const despues = await estadoDe(staff.cli, cliente.org);
    assert(despues.contractedPlanCode === "full",
      `contratado tras la transición = ${despues.contractedPlanCode}`);
    assert(!esAccesoDePrueba(despues), "seguía pareciendo una prueba");
    assert(etiquetaComercial(despues) === "Full",
      `ahora sí tiene que llamarse Full, y se llamó «${etiquetaComercial(despues)}»`);

    const { data: alm } = await staff.cli.rpc("organization_storage_quota",
      { p_organization_id: cliente.org });
    assert(Number((alm as Record<string, unknown>).limit_bytes) === 524_288_000,
      "la cuota no siguió al plan");
  });

  await check("13. `ASSIGNMENT_PERIOD_INVALID` llega identificable", async () => {
    const v = await empresaNueva("periodo");
    const { data: rev } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single();
    const { error } = await staff.cli.rpc("commercial_assign_plan", {
      p_organization_id: v.org, p_plan_revision_id: (rev as { id: string }).id,
      p_scope: "organization", p_module_code: null, p_starts_at: null,
      p_ends_at: new Date(Date.now() - 3_600_000).toISOString(),
      p_reason: "STAB01 · fin en el pasado" });
    assert(Boolean(error), "la base aceptó una vigencia que termina antes de empezar");
    assert(String(error?.message).includes("ASSIGNMENT_PERIOD_INVALID"),
      `código: ${error?.message}`);
    const mensaje = mensajeDeTransicion(error!.message);
    assert(mensaje.includes("fecha de fin"), `mensaje inútil: «${mensaje}»`);
    assert(!mensaje.startsWith("No fue posible"), "siguió cayendo en el genérico");
  });

  await check("14. `ASSIGNMENT_CONFLICTS_WITH_FUTURE` llega identificable", async () => {
    const v = await empresaNueva("futuro");
    const { data: rev } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single();
    // Una transición PROGRAMADA. Se monta por la vía directa porque la consola
    // no ofrece hoy fecha de inicio, y aun así el contrato de la primitiva la
    // admite: si un día la ofrece, este camino ya está descrito.
    await pg.query(
      `insert into public.organization_plan_assignments
         (organization_id, plan_revision_id, scope, grant_kind, source, starts_at, reason)
       values ($1, $2, 'organization', 'sold', 'manual', now() + interval '5 days', 'STAB01 programada')`,
      [v.org, (rev as { id: string }).id]);
    const { error } = await staff.cli.rpc("commercial_assign_plan", {
      p_organization_id: v.org, p_plan_revision_id: (rev as { id: string }).id,
      p_scope: "organization", p_module_code: null, p_starts_at: null, p_ends_at: null,
      p_reason: "STAB01 · sobre una programada" });
    assert(Boolean(error) && String(error?.message).includes("ASSIGNMENT_CONFLICTS_WITH_FUTURE"),
      `código: ${error?.message}`);
    const mensaje = mensajeDeTransicion(error!.message);
    assert(mensaje.includes("programada"), `mensaje inútil: «${mensaje}»`);
  });

  await check("15. El genérico solo queda para lo desconocido, y lleva el código", () => {
    const m = mensajeDeTransicion("algo que nadie ha visto nunca");
    assert(m.startsWith("No fue posible"), "el desconocido dejó de ser genérico");
    assert(m.includes("algo que nadie ha visto nunca"),
      "el genérico no lleva el código para poder buscarlo");
  });

  // =========================================================================
  console.log("\nF · La fecha elegida es un día, no un instante");
  // =========================================================================

  await check("16. Elegir el 15 no retrocede al 14 en Colombia", () => {
    const iso = finDelDiaEnZona("2026-09-15", "America/Bogota");
    assert(iso === "2026-09-16T04:59:59.999Z", `salió ${iso}`);
    const local = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota", dateStyle: "short", timeStyle: "medium",
    }).format(new Date(iso!));
    assert(/\b15\/0?9\b/.test(local), `en Bogotá cayó en ${local}`);
    // Y lo que hacía el código anterior, para que se vea la diferencia.
    const viejo = new Date("2026-09-15").toISOString();
    assert(viejo === "2026-09-15T00:00:00.000Z", "referencia inesperada");
    assert(iso !== viejo, "se volvió a mandar la medianoche UTC");
  });

  await check("17. Con horario de verano también, y una fecha inválida no pasa", () => {
    const verano = finDelDiaEnZona("2026-06-15", "Europe/Madrid");
    const invierno = finDelDiaEnZona("2026-01-15", "Europe/Madrid");
    assert(verano === "2026-06-15T21:59:59.999Z", `verano: ${verano}`);
    assert(invierno === "2026-01-15T22:59:59.999Z", `invierno: ${invierno}`);
    assert(finDelDiaEnZona("2026-02-30", "UTC") === null, "aceptó un 30 de febrero");
    assert(finDelDiaEnZona("ayer", "UTC") === null, "aceptó texto libre");
    const accion = leer("server/actions/commercial-console.ts");
    assert(accion.includes("finDelDiaEnZona(endsAt, zona)"),
      "la acción no usa la conversión por zona");
    assert(!accion.includes("new Date(endsAt).toISOString()"),
      "la acción volvió a mandar la medianoche UTC");
    assert(accion.includes("organization_business_timezone"),
      "la zona no sale de la que el modelo ya define");
  });

  // =========================================================================
  console.log("\nG · Lo que no se ha tocado");
  // =========================================================================

  await check("18. La transición es atómica y no reescribe historia ajena", async () => {
    const otra = await empresaNueva("ajena");
    const { rows: antes } = await pg.query(
      `select id, plan_revision_id, starts_at, ends_at from public.organization_plan_assignments
        where organization_id = $1 order by id`, [otra.org]);
    const v = await empresaNueva("atomica");
    const { data: rev } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", "extra").eq("status", "published").is("effective_to", null).single();
    await staff.cli.rpc("commercial_assign_plan", {
      p_organization_id: v.org, p_plan_revision_id: (rev as { id: string }).id,
      p_scope: "organization", p_module_code: null, p_starts_at: null, p_ends_at: null,
      p_reason: "STAB01 · atomicidad" });
    const { rows: despues } = await pg.query(
      `select id, plan_revision_id, starts_at, ends_at from public.organization_plan_assignments
        where organization_id = $1 order by id`, [otra.org]);
    assert(JSON.stringify(antes) === JSON.stringify(despues),
      "una transición tocó las asignaciones de otra empresa");
    // Y sobre la suya: una sola permanente abierta, sin huecos ni solapes.
    const { rows: abiertas } = await pg.query(
      `select count(*)::int n from public.organization_plan_assignments
        where organization_id = $1 and ends_at is null and grant_kind in ('sold','courtesy')`,
      [v.org]);
    assert(abiertas[0].n === 1, `quedaron ${abiertas[0].n} asignaciones vendidas abiertas`);
  });

  await check("19. Nada de lo nuevo depende del legado `organization_subscriptions`", () => {
    for (const f of ["lib/db/commercial-state.ts", "lib/plans/commercial-display.ts",
                     "lib/domain/zona-horaria.ts",
                     "components/domain/onboarding/trial-access-banner.tsx"]) {
      const src = leerCodigo(f);
      assert(!src.includes("organization_subscriptions"),
        `${f} consulta la tabla heredada`);
      assert(!src.includes("change_organization_plan"),
        `${f} usa el camino heredado`);
    }
    const panel = leerCodigo("app/(app)/(shell)/(cpr)/dashboard/page.tsx");
    assert(!panel.includes("organization_subscriptions"),
      "el panel volvió a mirar la tabla heredada");
  });

  await check("20. Y el legado sigue en pie · este tramo no lo retira", async () => {
    const { rows } = await pg.query("select to_regclass('public.organization_subscriptions') as t");
    assert(rows[0].t !== null, "se retiró la tabla heredada, y no tocaba");
    const { rows: fn } = await pg.query(
      "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='change_organization_plan'");
    assert(fn[0].n === 1, "se retiró change_organization_plan, y no tocaba");
  });

  // ---- Limpieza ----------------------------------------------------------
  //
  // TEST-HYGIENE-05 · Era una copia a mano del barrido, con `catch {}` en cada
  // borrado y sin comprobar nada al final. Ahora va por el ayudante común, que
  // es el mismo código en Local y en Staging y DEVUELVE lo que no pudo hacer.
  // Las personas también: el ayudante borra lo que es suyo —incluido
  // `platform_staff`, que colgaba de un borrado a mano— y después pregunta si
  // se fueron de verdad.
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas });

  await check("21. La suite no deja un solo fixture detrás", async () => {
    assert(residuo.problemas.length === 0,
      `la limpieza informó de: ${residuo.problemas.join(" · ")}`);
    // Por IDENTIFICADOR propio, nunca por parecido de nombre: contar «las que
    // se llaman STAB01» mira toda la base y acusa a fixtures ajenos.
    assert(residuo.organizaciones === 0 && residuo.personas === 0
      && Object.keys(residuo.porTabla).length === 0,
      `quedaron fixtures: ${describirResiduo(residuo)}`);
    const { rows: asig } = await pg.query(
      `select count(*)::int n from public.organization_plan_assignments
        where organization_id = any($1::uuid[])`, [orgs]);
    assert(asig[0].n === 0, `quedaron ${asig[0].n} concesiones de plan`);
    const { rows: mods } = await pg.query(
      `select count(*)::int n from public.organization_modules
        where organization_id = any($1::uuid[])`, [orgs]);
    assert(mods[0].n === 0, `quedaron ${mods[0].n} módulos`);
  });

  await pg.end();

  console.log(`\nSTABILIZATION-01 · estado comercial: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
