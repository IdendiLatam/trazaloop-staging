/**
 * Trazaloop · PE-04B2 · La base comercial cerrada, y la migración.
 *
 * Dos cosas que solo se pueden comprobar ejecutando: que las revisiones de B1
 * sigan intactas siendo historia, y que cada empresa acabe donde le toca sin
 * perder ni ganar nada por accidente.
 *
 * Correr: npm run test:pe04b2-baseline
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
const orgsCreadas: string[] = [];

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B2" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b2" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

/**
 * Una empresa nueva por el camino REAL del producto, con su propia persona.
 *
 * Cada empresa necesita su dueño: `create_organization` rechaza a quien ya
 * pertenece a una —«Tu cuenta ya está asociada a una empresa»—, así que
 * reutilizar el mismo usuario para diez escenarios falla en el segundo. Se crea
 * la persona aquí para que cada caso sea independiente del anterior.
 */
async function nuevaEmpresa(nombre: string) {
  const p = await persona("b2-org");
  const { data, error } = await p.cli.rpc("create_organization", { p_name: nombre });
  assert(!error, `crear empresa: ${error?.message}`);
  orgsCreadas.push(data as string);
  return { org: data as string, cli: p.cli, id: p.id };
}

const limite = async (plan: string, recurso: string) => {
  const { data } = await admin.from("v_public_plan_limits")
    .select("limit_state, limit_value").eq("plan_code", plan)
    .eq("resource_code", recurso).maybeSingle();
  return data as { limit_state: string; limit_value: number | null } | null;
};

async function main() {
  const { resolveOrganizationPlan, resolveModulePlan } =
    await import("@/lib/db/commercial-plans");

  const sa = await persona("b2-sa", "superadmin");
  const dueño = await persona("b2-org");

  console.log("\nPE-04B2 · La base comercial y la migración\n");

  try {
    // =====================================================================
    console.log("A · Las revisiones de B1 siguen siendo historia");
    // =====================================================================

    await check("A1. Las de B1 se conservan, retiradas y con sus valores", async () => {
      const { data } = await admin.from("plan_revisions")
        .select("plan_code, revision_number, status, effective_to, monthly_price_minor")
        .like("internal_notes", "PE-04B1%");
      assert((data ?? []).length === 3, `hay ${(data ?? []).length} revisiones de B1`);
      for (const r of data ?? []) {
        assert(r.status === "retired", `la de ${r.plan_code} quedó en «${r.status}»`);
        assert(r.effective_to !== null, `la de ${r.plan_code} quedó con el periodo abierto`);
      }
      // Y el precio de la de Full sigue siendo el que tenía.
      const full = (data ?? []).find((r) => r.plan_code === "full");
      assert(Number(full!.monthly_price_minor) === 4000,
        `la revisión de B1 de full dice ${full!.monthly_price_minor}`);
    });

    await check("A2. Y no se pueden tocar · siguen siendo inmutables", async () => {
      const { data: r } = await admin.from("plan_revisions")
        .select("id").like("internal_notes", "PE-04B1%").limit(1).single();
      const { error } = await sa.cli.from("plan_revisions")
        .update({ monthly_price_minor: 1 }).eq("id", r!.id);
      assert(error, "se pudo editar una revisión de B1");
    });

    await check("A3. Hay exactamente una vigente por plan", async () => {
      for (const code of ["free", "full", "extra"]) {
        const { data } = await admin.from("plan_revisions")
          .select("id").eq("plan_code", code).eq("status", "published").is("effective_to", null);
        assert((data ?? []).length === 1,
          `${code} tiene ${(data ?? []).length} revisiones vigentes`);
      }
    });

    // =====================================================================
    console.log("\nB · La base comercial cerrada");
    // =====================================================================

    await check("B1. Free · 0, 50 MiB, 25 créditos, 30/día y 300/mes", async () => {
      const { data } = await admin.from("v_public_plan_catalog")
        .select("price_state, currency, monthly_price_minor, annual_price_minor")
        .eq("plan_code", "free").single();
      assert(data!.price_state === "configured" && Number(data!.monthly_price_minor) === 0,
        `free cuesta ${data!.monthly_price_minor}`);
      const alm = await limite("free", "storage_bytes");
      assert(alm?.limit_state === "finite" && Number(alm.limit_value) === 52428800,
        `free tiene ${JSON.stringify(alm)}`);
      const ia = await limite("free", "ai_weighted_credits_monthly");
      assert(ia?.limit_state === "finite" && Number(ia.limit_value) === 25,
        `los créditos de free son ${JSON.stringify(ia)}`);
      const dia = await limite("free", "active_minutes_daily");
      assert(dia?.limit_state === "finite" && Number(dia.limit_value) === 30,
        `los minutos diarios de free son ${JSON.stringify(dia)}`);
      const mes = await limite("free", "active_minutes_monthly");
      assert(mes?.limit_state === "finite" && Number(mes.limit_value) === 300,
        `los minutos mensuales de free son ${JSON.stringify(mes)}`);
    });

    await check("B2. Full · 4000/40000, 500 MiB, 500 créditos, sin tope de tiempo", async () => {
      const { data } = await admin.from("v_public_plan_catalog")
        .select("monthly_price_minor, annual_price_minor").eq("plan_code", "full").single();
      assert(Number(data!.monthly_price_minor) === 4000, `mensual ${data!.monthly_price_minor}`);
      assert(Number(data!.annual_price_minor) === 40000, `anual ${data!.annual_price_minor}`);
      const alm = await limite("full", "storage_bytes");
      assert(Number(alm!.limit_value) === 524288000, `full tiene ${alm!.limit_value} bytes`);
      const ia = await limite("full", "ai_weighted_credits_monthly");
      assert(Number(ia!.limit_value) === 500, `los créditos de full son ${ia!.limit_value}`);
      for (const r of ["active_minutes_daily", "active_minutes_monthly"]) {
        const t = await limite("full", r);
        assert(t?.limit_state === "unlimited", `full tiene «${t?.limit_state}» en ${r}`);
      }
    });

    await check("B3. Extra · 10000/100000, 5 GiB, 2000 créditos, 2 casos", async () => {
      const { data } = await admin.from("v_public_plan_catalog")
        .select("monthly_price_minor, annual_price_minor").eq("plan_code", "extra").single();
      assert(Number(data!.monthly_price_minor) === 10000, `mensual ${data!.monthly_price_minor}`);
      assert(Number(data!.annual_price_minor) === 100000, `anual ${data!.annual_price_minor}`);
      const alm = await limite("extra", "storage_bytes");
      assert(Number(alm!.limit_value) === 5368709120, `extra tiene ${alm!.limit_value} bytes`);
      const ia = await limite("extra", "ai_weighted_credits_monthly");
      assert(Number(ia!.limit_value) === 2000, `los créditos de extra son ${ia!.limit_value}`);
      const sop = await limite("extra", "functional_support_cases_monthly");
      assert(sop?.limit_state === "finite" && Number(sop.limit_value) === 2,
        `el acompañamiento de extra es ${JSON.stringify(sop)}`);
    });

    await check("B4. Y Free y Full NO tienen acompañamiento funcional", async () => {
      for (const code of ["free", "full"]) {
        const sop = await limite(code, "functional_support_cases_monthly");
        assert(sop?.limit_state === "finite" && Number(sop.limit_value) === 0,
          `${code} tiene ${JSON.stringify(sop)} casos de acompañamiento`);
      }
    });

    await check("B5. «Advisor» sigue sin ser un plan", async () => {
      const { data } = await admin.from("plans").select("code");
      const codigos = (data ?? []).map((p) => p.code).sort();
      assert(JSON.stringify(codigos) === JSON.stringify(["extra", "free", "full"]),
        `los planes son: ${codigos.join(", ")}`);
    });

    await check("B6. La prueba: Full, 48 horas y 50 créditos EN TOTAL", async () => {
      const { data } = await admin.from("commercial_trial_policy")
        .select("enabled, trial_plan_code, trial_duration_hours, trial_ai_credits").single();
      assert(data!.enabled, "la prueba está apagada");
      assert(data!.trial_plan_code === "full", `la prueba da «${data!.trial_plan_code}»`);
      assert(Number(data!.trial_duration_hours) === 48, `dura ${data!.trial_duration_hours} h`);
      assert(Number(data!.trial_ai_credits) === 50,
        `la bolsa de la prueba es ${data!.trial_ai_credits}`);
      // Y NO son los 500 al mes de Full: son cosas distintas.
      const ia = await limite("full", "ai_weighted_credits_monthly");
      assert(Number(data!.trial_ai_credits) !== Number(ia!.limit_value),
        "la prueba recibe la bolsa mensual de Full");
    });

    await check("B7. La prueba NO es un cuarto plan · apunta a la revisión REAL de Full",
      async () => {
        const { data: pol } = await admin.from("commercial_trial_policy")
          .select("trial_plan_code").single();
        const { data: rev } = await admin.from("plan_revisions")
          .select("id").eq("plan_code", pol!.trial_plan_code)
          .eq("status", "published").is("effective_to", null).single();
        const { data: pruebas } = await admin.from("organization_plan_assignments")
          .select("plan_revision_id").eq("grant_kind", "trial").limit(5);
        for (const p of pruebas ?? []) {
          assert(p.plan_revision_id === rev!.id,
            "una prueba apunta a una revisión que no es la de Full vigente");
        }
      });

    // =====================================================================
    console.log("\nC · Una empresa nueva nace con Free y una prueba");
    // =====================================================================

    let orgNueva = "";
    let cliNueva: SupabaseClient = dueño.cli;
    let dueñoNuevaId = "";
    await check("C1. Free permanente + prueba de Full en cada módulo funcional", async () => {
      const e = await nuevaEmpresa(`B2 nueva ${sello}`);
      orgNueva = e.org; cliNueva = e.cli; dueñoNuevaId = e.id;
      const { data } = await admin.from("organization_plan_assignments")
        .select("module_code, grant_kind, ends_at, source")
        .eq("organization_id", orgNueva).order("module_code");
      const bases = (data ?? []).filter((a) => a.grant_kind === "base");
      const pruebas = (data ?? []).filter((a) => a.grant_kind === "trial");
      assert(bases.length === 3, `hay ${bases.length} bases Free y hay 3 módulos funcionales`);
      assert(pruebas.length === 3, `hay ${pruebas.length} pruebas`);
      for (const b of bases) assert(b.ends_at === null, `la base de ${b.module_code} caduca`);
      for (const p of pruebas) assert(p.ends_at !== null, `la prueba de ${p.module_code} no caduca`);
    });

    await check("C2. `core` NO recibe asignación comercial", async () => {
      const { data } = await admin.from("organization_plan_assignments")
        .select("module_code").eq("organization_id", orgNueva).eq("module_code", "core");
      assert((data ?? []).length === 0, "core recibió asignación comercial");
    });

    await check("C3. Y resuelve a Full mientras la prueba está viva", async () => {
      const o = await resolveOrganizationPlan(orgNueva, { client: cliNueva });
      assert(o.status === "found" && o.planCode === "full" && o.grantKind === "trial",
        `resolvió ${JSON.stringify(o)}`);
    });

    await check("C4. Al vencer cae a Free · SIN escribir nada", async () => {
      const futuro = new Date(Date.now() + 72 * 3600_000);
      const o = await resolveOrganizationPlan(orgNueva, { client: cliNueva, asOf: futuro });
      assert(o.status === "found" && o.planCode === "free" && o.grantKind === "base",
        `al vencer resolvió ${JSON.stringify(o)}`);
    });

    await check("C5. La duración sale de la POLÍTICA, no de un literal", async () => {
      await admin.from("commercial_trial_policy").update({ trial_duration_hours: 6 }).eq("id", true);
      const otra = (await nuevaEmpresa(`B2 politica ${sello}`)).org;
      const { data } = await admin.from("organization_plan_assignments")
        .select("starts_at, ends_at").eq("organization_id", otra)
        .eq("grant_kind", "trial").limit(1).single();
      const horas = (new Date(data!.ends_at as string).getTime()
        - new Date(data!.starts_at as string).getTime()) / 3600_000;
      assert(Math.abs(horas - 6) < 0.2, `la prueba duró ${horas.toFixed(2)} horas y la política decía 6`);
      await admin.from("commercial_trial_policy").update({ trial_duration_hours: 48 }).eq("id", true);
    });

    await check("C6. Cambiar la política NO reescribe las pruebas ya concedidas", async () => {
      const { data } = await admin.from("organization_plan_assignments")
        .select("starts_at, ends_at").eq("organization_id", orgNueva)
        .eq("grant_kind", "trial").limit(1).single();
      const horas = (new Date(data!.ends_at as string).getTime()
        - new Date(data!.starts_at as string).getTime()) / 3600_000;
      assert(Math.abs(horas - 48) < 0.2,
        `la prueba anterior pasó a durar ${horas.toFixed(2)} horas`);
    });

    // =====================================================================
    console.log("\nD · La prueba se da UNA vez");
    // =====================================================================

    await check("D1. Volver a provisionar no concede otra prueba", async () => {
      const { data: antes } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", orgNueva).eq("grant_kind", "trial");
      await admin.rpc("provision_new_organization_modules" as never,
        { p_org: orgNueva, p_actor: dueñoNuevaId } as never);
      const { data: despues } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", orgNueva).eq("grant_kind", "trial");
      assert((despues ?? []).length === (antes ?? []).length,
        `las pruebas pasaron de ${(antes ?? []).length} a ${(despues ?? []).length}`);
    });

    await check("D2. Ni aunque la prueba ya haya caducado", async () => {
      // Se caduca a mano una prueba y se vuelve a provisionar: no se regala otra.
      const { data: p } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", orgNueva).eq("grant_kind", "trial")
        .limit(1).single();
      await admin.from("organization_plan_assignments")
        .update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", p!.id);
      const { data: antes } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", orgNueva).eq("grant_kind", "trial");
      await admin.rpc("provision_new_organization_modules" as never,
        { p_org: orgNueva, p_actor: dueñoNuevaId } as never);
      const { data: despues } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", orgNueva).eq("grant_kind", "trial");
      assert((despues ?? []).length === (antes ?? []).length,
        "una prueba caducada permitió conceder otra: apagar y encender regalaría producto");
    });

    // =====================================================================
    console.log("\nE · La migración: nadie pierde, nadie gana");
    // =====================================================================

    await check("E1. Un módulo Full conserva su nivel", async () => {
      const e = await nuevaEmpresa(`B2 full ${sello}`);
      const org = e.org;
      await admin.from("organization_modules")
        .update({ access_mode: "full", access_expires_at: null })
        .eq("organization_id", org).eq("module_code", "quality");
      // Se cierran las asignaciones canónicas para simular una empresa legacy
      // sin migrar, y se vuelve a migrar.
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);
      const m = await resolveModulePlan(org, "quality", { client: e.cli });
      assert(m.status === "found" && m.planCode === "full" && m.grantKind === "sold",
        `un módulo Full quedó en ${JSON.stringify(m)}`);
    });

    await check("E2. Una prueba VIGENTE conserva su fecha · no se reinician 48 horas", async () => {
      const e = await nuevaEmpresa(`B2 demo vivo ${sello}`);
      const org = e.org;
      const caduca = new Date(Date.now() + 5 * 3600_000).toISOString();
      await admin.from("organization_modules")
        .update({ access_mode: "demo", access_expires_at: caduca })
        .eq("organization_id", org).eq("module_code", "quality");
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);
      const { data } = await admin.from("organization_plan_assignments")
        .select("ends_at").eq("organization_id", org).eq("module_code", "quality")
        .eq("grant_kind", "trial").single();
      const diff = Math.abs(new Date(data!.ends_at as string).getTime() - new Date(caduca).getTime());
      assert(diff < 2000,
        `la prueba migrada caduca en ${data!.ends_at} y la legacy en ${caduca}`);
    });

    await check("E3. Una prueba VENCIDA queda en Free · y eso es una mejora", async () => {
      const e = await nuevaEmpresa(`B2 demo muerto ${sello}`);
      const org = e.org;
      await admin.from("organization_modules")
        .update({ access_mode: "demo",
                  access_expires_at: new Date(Date.now() - 3600_000).toISOString() })
        .eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);
      const m = await resolveModulePlan(org, "quality", { client: e.cli });
      assert(m.status === "found" && m.planCode === "free" && m.grantKind === "base",
        `una prueba vencida quedó en ${JSON.stringify(m)}`);
      const { data } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", org).eq("grant_kind", "trial");
      assert((data ?? []).length === 0, "una prueba vencida generó una concesión");
    });

    await check("E4. La mezcla por módulo se conserva", async () => {
      const e = await nuevaEmpresa(`B2 mezcla ${sello}`);
      const org = e.org;
      await admin.from("organization_modules").update({ access_mode: "extra", access_expires_at: null })
        .eq("organization_id", org).eq("module_code", "quality");
      await admin.from("organization_modules").update({ access_mode: "full", access_expires_at: null })
        .eq("organization_id", org).eq("module_code", "traceability_6632");
      await admin.from("organization_modules")
        .update({ access_mode: "demo", access_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("organization_id", org).eq("module_code", "textiles");
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);

      const q = await resolveModulePlan(org, "quality", { client: e.cli });
      const c = await resolveModulePlan(org, "traceability_6632", { client: e.cli });
      const t = await resolveModulePlan(org, "textiles", { client: e.cli });
      // Cada módulo, LO SUYO. Es la comprobación central de la mezcla: si el
      // modelo colapsara a un plan por empresa, los tres dirían «extra».
      assert(q.status === "found" && q.planCode === "extra", `Quality: ${JSON.stringify(q)}`);
      assert(c.status === "found" && c.planCode === "full", `PCR: ${JSON.stringify(c)}`);
      assert(t.status === "found" && t.planCode === "free", `Textiles: ${JSON.stringify(t)}`);
      // La empresa entera resuelve al MEJOR de sus módulos.
      const o = await resolveOrganizationPlan(org, { client: e.cli });
      assert(o.status === "found" && o.planCode === "extra", `la empresa: ${JSON.stringify(o)}`);
      // Y la asignación de CADA módulo es la suya, aunque la resolución mire todas.
      const { data } = await admin.from("organization_plan_assignments")
        .select("module_code, grant_kind, plan_revision_id")
        .eq("organization_id", org).eq("grant_kind", "sold");
      const porModulo = new Map((data ?? []).map((a) => [a.module_code, a.plan_revision_id]));
      const { data: revExtra } = await admin.from("plan_revisions").select("id")
        .eq("plan_code", "extra").eq("status", "published").is("effective_to", null).single();
      const { data: revFull } = await admin.from("plan_revisions").select("id")
        .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single();
      assert(porModulo.get("quality") === revExtra!.id, "Quality no quedó asignado a Extra");
      assert(porModulo.get("traceability_6632") === revFull!.id, "PCR no quedó asignado a Full");
      assert(!porModulo.has("textiles"), "Textiles, con prueba vencida, recibió una asignación de pago");
    });

    await check("E5. Migrar dos veces no duplica nada", async () => {
      const { data: antes } = await admin.from("organization_plan_assignments").select("id");
      await admin.rpc("commercial_migrate_organizations" as never);
      await admin.rpc("commercial_migrate_organizations" as never);
      const { data: despues } = await admin.from("organization_plan_assignments").select("id");
      assert((antes ?? []).length === (despues ?? []).length,
        `las asignaciones pasaron de ${(antes ?? []).length} a ${(despues ?? []).length}`);
    });

    // =====================================================================
    console.log("\nF · La doble verdad Full → Demo, cerrada");
    // =====================================================================

    await check("F1. Módulo Full + suscripción Demo → FULL", async () => {
      const e = await nuevaEmpresa(`B2 doble ${sello}`);
      const org = e.org;
      await admin.from("organization_modules")
        .update({ access_mode: "full", access_expires_at: null }).eq("organization_id", org);
      await admin.from("organization_subscriptions")
        .update({ plan_code: "demo" }).eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);

      // La contradicción legacy sigue ahí — no se borra nada.
      const { data: sub } = await admin.from("organization_subscriptions")
        .select("plan_code").eq("organization_id", org).single();
      assert(sub!.plan_code === "demo", "la fila legacy se reescribió: eso sería falsificar");

      // Y el plan efectivo dice Full.
      const { data: efectivo } = await e.cli
        .rpc("get_organization_effective_plan", { p_organization_id: org });
      assert(efectivo === "full", `el plan efectivo dice «${efectivo}»`);
    });

    await check("F2. Módulo con prueba VENCIDA + suscripción Full → FREE", async () => {
      // El error simétrico: una suscripción legacy en `full` NO puede elevar un
      // módulo cuya prueba caducó.
      const e = await nuevaEmpresa(`B2 doble inv ${sello}`);
      const org = e.org;
      await admin.from("organization_modules")
        .update({ access_mode: "demo",
                  access_expires_at: new Date(Date.now() - 3600_000).toISOString() })
        .eq("organization_id", org);
      await admin.from("organization_subscriptions")
        .update({ plan_code: "full" }).eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);
      const { data: efectivo } = await e.cli
        .rpc("get_organization_effective_plan", { p_organization_id: org });
      assert(efectivo === "free",
        `una suscripción legacy elevó a «${efectivo}» un módulo con la prueba vencida`);
    });

    await check("F3. El plan efectivo ya NO lee la suscripción legacy", async () => {
      // Se comprueba por COMPORTAMIENTO, que es más fuerte que leer el código:
      // se borra la fila legacy entera y el plan efectivo no cambia.
      const e = await nuevaEmpresa(`B2 sin sub ${sello}`);
      const org = e.org;
      await admin.from("organization_modules")
        .update({ access_mode: "full", access_expires_at: null }).eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);
      const { data: antes } = await e.cli
        .rpc("get_organization_effective_plan", { p_organization_id: org });
      await admin.from("organization_subscriptions").delete().eq("organization_id", org);
      const { data: despues } = await e.cli
        .rpc("get_organization_effective_plan", { p_organization_id: org });
      assert(antes === despues && despues === "full",
        `borrar la suscripción cambió el plan de «${antes}» a «${despues}»`);
    });

    await check("F4. Y la cuota que se enseña sale del plan canónico", async () => {
      const e = await nuevaEmpresa(`B2 cuota ${sello}`);
      const org = e.org;
      await admin.from("organization_modules")
        .update({ access_mode: "full", access_expires_at: null }).eq("organization_id", org);
      await admin.from("organization_subscriptions")
        .update({ plan_code: "demo" }).eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.rpc("commercial_migrate_organizations" as never);
      const { data } = await e.cli
        .rpc("organization_commercial_storage_bytes", { p_organization_id: org });
      const r = data as { status: string; plan_code: string; limit_bytes: number };
      assert(r.status === "found", `la cuota canónica dijo «${r.status}»`);
      assert(r.plan_code === "full", `la cuota es del plan «${r.plan_code}»`);
      assert(Number(r.limit_bytes) === 524288000,
        `la cuota canónica dice ${r.limit_bytes} y debía decir 524288000`);
      // Mientras, la vista legacy sigue diciendo los 50 MB. No se borra: se
      // deja de obedecer.
      const { data: legacy } = await admin.from("v_organization_plan_usage")
        .select("plan_code, storage_limit_bytes").eq("organization_id", org).maybeSingle();
      if (legacy) {
        assert(Number(legacy.storage_limit_bytes) === 52428800,
          "la vista legacy dejó de decir lo que decía: se ha tocado algo que era evidencia");
      }
    });

    // =====================================================================
    console.log("\nG · Un fallo no es un plan");
    // =====================================================================

    await check("G1. Sin sesión no se obtiene un plan", async () => {
      const anonimo = createClient(URL!, ANON!, { auth: { persistSession: false } });
      const o = await resolveOrganizationPlan(orgNueva, { client: anonimo });
      assert(o.status === "unavailable", `respondió «${o.status}»`);
      assert(!("planCode" in o), "un fallo trajo un plan");
    });

    await check("G2. Ni «free» ni «demo» por accidente", async () => {
      const anonimo = createClient(URL!, ANON!, { auth: { persistSession: false } });
      const o = await resolveOrganizationPlan(orgNueva, { client: anonimo });
      assert(o.status !== "found", "un fallo devolvió un plan encontrado");
      const { error } = await anonimo.rpc("get_organization_effective_plan",
        { p_organization_id: orgNueva });
      assert(error, "un anónimo obtuvo el plan efectivo");
    });
  } finally {
    await admin.from("commercial_trial_policy")
      .update({ trial_duration_hours: 48, trial_ai_credits: 50 }).eq("id", true);
    for (const org of orgsCreadas) {
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.from("organizations").delete().eq("id", org);
    }
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04B2 · base comercial: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
