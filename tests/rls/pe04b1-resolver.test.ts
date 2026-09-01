/**
 * Trazaloop · PE-04B1 · El resolutor, las asignaciones y la sombra.
 *
 * La suite que de verdad importa de este tramo. Comprueba tres cosas que solo
 * se pueden comprobar ejecutando:
 *
 *   · que una prueba caduque **por efecto del tiempo**, sin ningún proceso que
 *     baje a nadie de plan;
 *   · que `core` —que nace en `full` para siempre en toda empresa— NO eleve el
 *     nivel comercial, porque si lo hiciera el plan no significaría nada;
 *   · que un fallo devuelva `unavailable` y NO un plan.
 *
 * Correr: npm run test:pe04b1-resolver
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personasCreadas: string[] = [];

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B1R" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b1r" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

const hora = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function main() {
  const {
    resolveModulePlan, resolveOrganizationPlan, resolvePlanLimit, allowsUsage,
  } = await import("@/lib/db/commercial-plans");
  const { classifyDrift, legacyModeToCanonical, summarizeDrift } =
    await import("@/lib/db/plan-shadow");

  const sa = await persona("b1r-sa", "superadmin");
  const dueño = await persona("b1r-org");

  const { data: orgId } = await dueño.cli.rpc("create_organization",
    { p_name: `B1R ${sello}` });
  const org = orgId as string;

  // PE-04B2 · Se parte de una empresa SIN asignaciones canónicas.
  //
  // Desde 0163, crear una empresa ya le da su base Free y su prueba de Full: es
  // exactamente lo que B2 construyó. Esta suite comprueba el RESOLUTOR, y para
  // eso necesita poder poner las asignaciones una a una y ver qué contesta en
  // cada paso — incluido el paso en el que no hay ninguna.
  //
  // Lo que la provisión hace de verdad lo comprueba `pe04b2-baseline`.
  await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
  const otraOrg = (await (await persona("b1r-otro")).cli
    .rpc("create_organization", { p_name: `B1R otra ${sello}` })).data as string;
  await admin.from("organization_plan_assignments").delete().eq("organization_id", otraOrg);

  const rev = async (code: string) => {
    const { data } = await admin.from("plan_revisions")
      .select("id").eq("plan_code", code).eq("status", "published")
      .is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  const asignar = async (campos: Record<string, unknown>) => {
    const { data, error } = await admin.from("organization_plan_assignments")
      .insert({ organization_id: org, source: "manual", ...campos }).select("id").single();
    assert(!error, `asignar: ${error?.message}`);
    return (data as { id: string }).id;
  };

  console.log("\nPE-04B1 · El resolutor\n");

  try {
    // =====================================================================
    console.log("A · Sin asignación no se inventa un plan");
    // =====================================================================

    await check("A1. Una empresa sin asignación canónica responde «absent»", async () => {
      const o = await resolveOrganizationPlan(org, { client: dueño.cli });
      assert(o.status === "absent", `respondió «${o.status}»`);
      const m = await resolveModulePlan(org, "traceability_6632", { client: dueño.cli });
      assert(m.status === "absent", `el módulo respondió «${m.status}»`);
    });

    await check("A2. Y «absent» NO es «free» · son cosas distintas", async () => {
      // Un resolutor que devolviera el plan más bajo ante la ausencia haría
      // imposible distinguir «no tiene nada» de «tiene el suelo».
      const o = await resolveOrganizationPlan(org, { client: dueño.cli });
      assert(!("planCode" in o), "la ausencia trajo un código de plan");
    });

    // =====================================================================
    console.log("\nB · La base Free y la precedencia");
    // =====================================================================

    await check("B1. Con base Free, el resolutor devuelve free", async () => {
      await asignar({ plan_revision_id: await rev("free"),
        scope: "organization", grant_kind: "base", source: "seed" });
      const o = await resolveOrganizationPlan(org, { client: dueño.cli });
      assert(o.status === "found" && o.planCode === "free", `respondió ${JSON.stringify(o)}`);
      assert(o.status === "found" && o.grantKind === "base", "no se conserva el tipo de concesión");
    });

    await check("B2. `core` en full NO eleva el nivel de la empresa", async () => {
      // `core` nace en `full` para siempre en TODA empresa, porque es
      // infraestructura. Si contara, cualquier empresa resolvería a Full
      // comercialmente y el plan dejaría de significar nada.
      await asignar({ plan_revision_id: await rev("full"), scope: "module",
        module_code: "core", grant_kind: "courtesy" });
      const o = await resolveOrganizationPlan(org, { client: dueño.cli });
      assert(o.status === "found" && o.planCode === "free",
        `core elevó la empresa a «${o.status === "found" ? o.planCode : o.status}»`);
    });

    await check("B3. Un módulo FUNCIONAL en full sí eleva", async () => {
      await asignar({ plan_revision_id: await rev("full"), scope: "module",
        module_code: "quality", grant_kind: "sold" });
      const o = await resolveOrganizationPlan(org, { client: dueño.cli });
      assert(o.status === "found" && o.planCode === "full",
        `un módulo funcional en full no elevó: ${JSON.stringify(o)}`);
    });

    await check("B4. Y extra gana a full, que gana a free", async () => {
      const id = await asignar({ plan_revision_id: await rev("extra"), scope: "module",
        module_code: "textiles", grant_kind: "sold" });
      const o = await resolveOrganizationPlan(org, { client: dueño.cli });
      assert(o.status === "found" && o.planCode === "extra",
        `la precedencia falló: ${JSON.stringify(o)}`);
      await admin.from("organization_plan_assignments")
        .update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    });

    await check("B5. Cada módulo resuelve LO SUYO · la mezcla se conserva", async () => {
      // PCR sin asignación propia hereda la de empresa (free); Quality tiene la
      // suya (full). Colapsar a un plan por empresa perdería justo esto.
      const cpr = await resolveModulePlan(org, "traceability_6632", { client: dueño.cli });
      const qua = await resolveModulePlan(org, "quality", { client: dueño.cli });
      assert(cpr.status === "found" && cpr.planCode === "free",
        `PCR: ${JSON.stringify(cpr)}`);
      assert(qua.status === "found" && qua.planCode === "full",
        `Quality: ${JSON.stringify(qua)}`);
    });

    // =====================================================================
    console.log("\nC · La prueba caduca por efecto del TIEMPO");
    // =====================================================================

    await check("C1. Una prueba SIEMPRE tiene final", async () => {
      const { error } = await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await rev("full"),
        scope: "module", module_code: "traceability_6632",
        grant_kind: "trial", source: "trial" });
      assert(error, "se creó una prueba sin fecha de fin: eso es un plan");
    });

    let prueba = "";
    await check("C2. Vigente, eleva el módulo a full", async () => {
      prueba = await asignar({ plan_revision_id: await rev("full"), scope: "module",
        module_code: "traceability_6632", grant_kind: "trial", source: "trial",
        ends_at: hora(48) });
      const m = await resolveModulePlan(org, "traceability_6632", { client: dueño.cli });
      assert(m.status === "found" && m.planCode === "full" && m.grantKind === "trial",
        `la prueba no elevó: ${JSON.stringify(m)}`);
    });

    await check("C3. Y al vencer cae SOLA a Free · sin escribir nada", async () => {
      // Es la comprobación central del modelo. Se pregunta por un momento
      // futuro y la respuesta ya es Free: no hay ningún proceso programado que
      // tenga que correr, y por tanto no hay ninguna ventana en la que el
      // estado esté mal porque el proceso no ha corrido todavía.
      const despues = await resolveModulePlan(org, "traceability_6632",
        { client: dueño.cli, asOf: new Date(Date.now() + 72 * 3600_000) });
      assert(despues.status === "found" && despues.planCode === "free",
        `al vencer la prueba quedó: ${JSON.stringify(despues)}`);

      // Y la fila de la prueba SIGUE AHÍ, sin reescribir: es historia comercial.
      const { data } = await admin.from("organization_plan_assignments")
        .select("grant_kind, ends_at").eq("id", prueba).single();
      assert(data!.grant_kind === "trial", "la prueba se reescribió a otra cosa");
      assert(data!.ends_at !== null, "la prueba perdió su fecha de fin");
    });

    await check("C4. Una prueba ya vencida no participa", async () => {
      const id = await asignar({ plan_revision_id: await rev("extra"), scope: "module",
        module_code: "quality", grant_kind: "trial", source: "trial",
        starts_at: hora(-48), ends_at: hora(-24) });
      const m = await resolveModulePlan(org, "quality", { client: dueño.cli });
      assert(m.status === "found" && m.planCode === "full",
        `una prueba vencida participó: ${JSON.stringify(m)}`);
      await admin.from("organization_plan_assignments").delete().eq("id", id);
    });

    // =====================================================================
    console.log("\nD · La historia no se reescribe");
    // =====================================================================

    await check("D1. Una asignación no cambia de plan ni de empresa", async () => {
      for (const campo of [
        { plan_revision_id: await rev("extra") },
        { organization_id: otraOrg },
        { grant_kind: "sold" },
        { scope: "organization", module_code: null },
      ]) {
        const { error } = await admin.from("organization_plan_assignments")
          .update(campo).eq("id", prueba);
        assert(error, `se pudo cambiar ${Object.keys(campo).join(", ")}`);
      }
    });

    await check("D2. Un periodo ya cerrado no se reabre", async () => {
      const id = await asignar({ plan_revision_id: await rev("free"),
        scope: "module", module_code: "textiles", grant_kind: "courtesy",
        starts_at: hora(-72), ends_at: hora(-48) });
      const { error } = await admin.from("organization_plan_assignments")
        .update({ ends_at: null }).eq("id", id);
      assert(error, "se reabrió un periodo cerrado: eso cambia lo que la empresa tuvo");
      await admin.from("organization_plan_assignments").delete().eq("id", id);
    });

    await check("D3. Cerrar una vigente SÍ se puede · es como se cambia de plan", async () => {
      const { error } = await admin.from("organization_plan_assignments")
        .update({ ends_at: hora(1) }).eq("id", prueba);
      assert(!error, `no se pudo cerrar una asignación vigente: ${error?.message}`);
      await admin.from("organization_plan_assignments")
        .update({ ends_at: hora(48) }).eq("id", prueba);
    });

    // =====================================================================
    console.log("\nE · Un fallo NO es un plan");
    // =====================================================================

    await check("E1. Sin sesión, el resolutor no devuelve un plan", async () => {
      const anonimo = createClient(URL!, ANON!, { auth: { persistSession: false } });
      const o = await resolveOrganizationPlan(org, { client: anonimo });
      assert(o.status === "unavailable", `sin sesión respondió «${o.status}»`);
      assert(!("planCode" in o), "un fallo trajo un código de plan");
    });

    await check("E2. Una empresa ajena tampoco · y no dice cuál es su plan", async () => {
      const o = await resolveOrganizationPlan(otraOrg, { client: dueño.cli });
      assert(o.status === "unavailable", `respondió «${o.status}»`);
    });

    await check("E3. Un identificador inventado da «unavailable», no «free»", async () => {
      const o = await resolveOrganizationPlan("00000000-0000-0000-0000-000000000000",
        { client: dueño.cli });
      assert(o.status !== "found", `respondió ${JSON.stringify(o)}`);
      assert(!("planCode" in o), "un identificador inventado trajo un plan");
    });

    // =====================================================================
    console.log("\nF · Los límites deniegan cuando no se saben");
    // =====================================================================

    await check("F1. `not_configured` DENIEGA, no concede", async () => {
      const lim = await resolvePlanLimit(await rev("free"), "ai_runs_per_month", admin);
      assert(lim.status === "not_configured", `la IA de free está «${lim.status}»`);
      const r = allowsUsage(lim, 0, 1);
      assert(!r.allowed, "un límite sin decidir dejó pasar una operación");
      assert(r.reason === "not_configured", `el motivo fue «${r.reason}»`);
    });

    await check("F2. `unavailable` también deniega", async () => {
      const r = allowsUsage({ status: "unavailable", resourceCode: "x" }, 0, 1);
      assert(!r.allowed, "una avería dejó pasar una operación");
      assert(r.reason === "unavailable", `el motivo fue «${r.reason}»`);
    });

    await check("F3. `unlimited` concede y `finite` cuenta bien en el borde", async () => {
      assert(allowsUsage({ status: "unlimited", resourceCode: "x" }, 1e9).allowed,
        "un ilimitado denegó");
      const finito = { status: "finite" as const, value: 5, resourceCode: "x" };
      assert(allowsUsage(finito, 4, 1).allowed, "4 + 1 sobre 5 se denegó");
      assert(!allowsUsage(finito, 5, 1).allowed, "5 + 1 sobre 5 se permitió");
    });

    await check("F4. Y el almacenamiento de free es el que se copió", async () => {
      const lim = await resolvePlanLimit(await rev("free"), "storage_bytes", admin);
      const { data: legacy } = await admin.from("plan_definitions")
        .select("storage_limit_bytes").eq("code", "demo").single();
      assert(lim.status === "finite" && lim.value === Number(legacy!.storage_limit_bytes),
        `free tiene ${JSON.stringify(lim)}`);
    });

    // =====================================================================
    console.log("\nG · Aislamiento entre empresas");
    // =====================================================================

    await check("G1. Una empresa no ve la asignación de otra", async () => {
      const { data } = await dueño.cli.from("organization_plan_assignments")
        .select("organization_id").eq("organization_id", otraOrg);
      assert((data ?? []).length === 0, "se leyó la asignación de otra empresa");
    });

    await check("G2. Pero el personal de plataforma sí ve todas", async () => {
      const { data } = await sa.cli.from("organization_plan_assignments")
        .select("id").eq("organization_id", org);
      assert((data ?? []).length > 0, "el superadministrador no ve las asignaciones");
    });

    await check("G3. El catálogo es compartido; la asignación, no", async () => {
      const { data: cat } = await dueño.cli.from("v_public_plan_catalog").select("plan_code");
      assert((cat ?? []).length === 3, "el catálogo no es visible para un cliente");
    });

    // =====================================================================
    console.log("\nH · La comparación en sombra");
    // =====================================================================

    await check("H1. `demo` legacy se traduce a `free` canónico", async () => {
      assert(legacyModeToCanonical("demo") === "free", "la traducción de demo cambió");
      assert(legacyModeToCanonical("full") === "full", "full no se traduce a sí mismo");
      assert(legacyModeToCanonical("extra") === "extra", "extra no se traduce a sí mismo");
      assert(legacyModeToCanonical(null) === null, "un modo desconocido produjo un plan");
    });

    await check("H2. Detecta la deriva del modelo VIEJO · el defecto de PE-04A", async () => {
      // Módulos en full y suscripción en demo: exactamente el caso que hace que
      // la consola diga «Plan Demo · 50 MB» a un cliente que tiene Full.
      const c = classifyDrift({
        legacyModuleAccessMode: "full",
        legacyEffectivePlan: "full",
        legacySubscriptionPlan: "demo",
        canonical: { status: "found", planCode: "full",
          planRevisionId: "x", grantKind: "sold", endsAt: null },
      });
      assert(c.drift === "LEGACY_DRIFT", `clasificó como «${c.drift}»`);
      assert(c.legacyMismatch, "no marcó el desacuerdo entre las fuentes viejas");
    });

    await check("H3. Y lo marca AUNQUE el canónico aún no haya migrado", async () => {
      // Mientras B1 no migre a nadie, el canónico responde `absent` y todo cae
      // en EXPECTED_MIGRATION_DIFFERENCE. Si el desacuerdo viejo no se contara
      // aparte, quedaría escondido tras ese estado transitorio — que es el dato
      // que B2 necesita.
      const c = classifyDrift({
        legacyModuleAccessMode: "full",
        legacyEffectivePlan: "full",
        legacySubscriptionPlan: "demo",
        canonical: { status: "absent" },
      });
      assert(c.drift === "EXPECTED_MIGRATION_DIFFERENCE", `clasificó como «${c.drift}»`);
      assert(c.legacyMismatch, "el desacuerdo viejo quedó escondido");
    });

    await check("H4. Nunca fuerza una coincidencia", async () => {
      const c = classifyDrift({
        legacyModuleAccessMode: "full",
        legacyEffectivePlan: "full",
        legacySubscriptionPlan: "full",
        canonical: { status: "found", planCode: "free",
          planRevisionId: "x", grantKind: "base", endsAt: null },
      });
      assert(c.drift !== "MATCH", "clasificó como coincidencia algo que no coincide");
    });

    await check("H5. Un canónico indisponible se dice, no se tapa", async () => {
      const c = classifyDrift({
        legacyModuleAccessMode: "full", legacyEffectivePlan: "full",
        legacySubscriptionPlan: "full", canonical: { status: "unavailable" },
      });
      assert(c.drift === "CANONICAL_UNAVAILABLE", `clasificó como «${c.drift}»`);
    });

    await check("H6. El resumen cuenta el desacuerdo viejo aparte", async () => {
      const r = summarizeDrift([
        { organizationId: "a", organizationName: "A", moduleCode: null,
          legacyModuleAccessMode: null, legacyEffectivePlan: "full",
          legacySubscriptionPlan: "demo", canonical: { status: "absent" },
          drift: "EXPECTED_MIGRATION_DIFFERENCE", legacyMismatch: true, note: "" },
        { organizationId: "b", organizationName: "B", moduleCode: null,
          legacyModuleAccessMode: null, legacyEffectivePlan: "full",
          legacySubscriptionPlan: "full", canonical: { status: "absent" },
          drift: "EXPECTED_MIGRATION_DIFFERENCE", legacyMismatch: false, note: "" },
      ]);
      assert(r.EXPECTED_MIGRATION_DIFFERENCE === 2, `contó ${r.EXPECTED_MIGRATION_DIFFERENCE}`);
      assert(r.legacyMismatch === 1, `contó ${r.legacyMismatch} desacuerdos viejos`);
    });
  } finally {
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    await admin.from("organizations").delete().in("id", [org, otraOrg]);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04B1 · resolutor: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
