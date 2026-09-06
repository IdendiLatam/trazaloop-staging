/**
 * Trazaloop · PE-04B6 · Aceptación integrada de PE-04.
 *
 * No repite lo que ya prueban B1..B5 pieza a pieza. Comprueba que las piezas,
 * juntas, cuentan la MISMA historia: el ciclo completo de una empresa —nace,
 * prueba, caduca, sube, baja, vuelve— y que en cada punto el plan efectivo, el
 * almacenamiento, la IA, el tiempo y el soporte digan lo mismo.
 *
 * Correr: npm run test:pe04b6-lifecycle
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

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

const MiB = 1024 * 1024;
const FREE_BYTES = 50 * MiB, FULL_BYTES = 500 * MiB, EXTRA_BYTES = 5 * 1024 * MiB;

type J = Record<string, unknown>;

async function main() {
  const sa = await persona("b6-sa", "superadmin");
  const soporte = await persona("b6-support", "support");
  const dueño = await persona("b6-org");

  // Se crea por el camino REAL de aprovisionamiento del producto.
  const { data: orgId, error: eOrg } = await dueño.cli.rpc("create_organization",
    { p_name: `B6 ${sello}` });
  assert(!eOrg, `crear empresa: ${eOrg?.message}`);
  const org = orgId as string;

  const plan = async (cli = dueño.cli) => {
    const { data, error } = await cli.rpc("plan_effective_for_organization",
      { p_organization_id: org });
    assert(!error, `plan: ${error?.message}`);
    return data as J;
  };
  const almacenamiento = async (cli = dueño.cli) => {
    const { data, error } = await cli.rpc("organization_storage_status", { p_organization_id: org });
    assert(!error, `almacenamiento: ${error?.message}`);
    return data as J;
  };
  const ia = async (cli = dueño.cli) => {
    const { data, error } = await cli.rpc("ai_credits_status", { p_organization_id: org });
    assert(!error, `ia: ${error?.message}`);
    return data as J;
  };
  const tiempo = async (cli = dueño.cli) => {
    const { data, error } = await cli.rpc("organization_time_status", { p_organization_id: org });
    assert(!error, `tiempo: ${error?.message}`);
    return data as J;
  };
  const soporteDe = async (cli = dueño.cli) => {
    const { data, error } = await cli.rpc("organization_support_entitlement",
      { p_organization_id: org });
    assert(!error, `soporte: ${error?.message}`);
    return data as J;
  };
  const puerta = async (intent: string) => {
    const { data } = await dueño.cli.rpc("organization_commercial_can_mutate",
      { p_organization_id: org, p_intent: intent });
    return (data as J).allowed === true;
  };
  const revision = async (code: string) => {
    const { data } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", code).eq("status", "published").is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  const ocupar = async (bytes: number, etiqueta: string) => {
    const { error } = await admin.from("storage_orphan_candidates").insert({
      organization_id: org, module_code: "traceability_6632", bucket_id: "trazadocs-documents",
      object_path: `${org}/document_files/b6-${etiqueta}.bin`, size_bytes: bytes,
      source_type: "unreferenced", status: "pending_delete" });
    assert(!error, `ocupar: ${error?.message}`);
  };
  const gastarMinutos = async (n: number, offsetDias = 0) => {
    const { data: hoy } = await admin.rpc("organization_business_today", { p_organization_id: org });
    const base = new Date(`${hoy as string}T08:00:00Z`);
    base.setUTCDate(base.getUTCDate() + offsetDias);
    const dia = new Date(base); dia.setUTCHours(0, 0, 0, 0);
    const d = dia.toISOString().slice(0, 10);
    await admin.from("organization_usage_minutes").insert(
      Array.from({ length: n }, (_, i) => ({
        organization_id: org,
        minute_start: new Date(base.getTime() + i * 60_000).toISOString(),
        business_date: d, business_month: `${d.slice(0, 7)}-01`,
      })));
  };
  const gastarCreditos = async (n: number) => {
    const { data: st } = await dueño.cli.rpc("ai_credits_status", { p_organization_id: org });
    await admin.from("ai_credit_ledger").insert({
      organization_id: org, pool: "monthly", period_month: (st as J).period_month as string,
      operation_code: "ask", weight_credits: n, state: "consumed",
      settled_at: new Date().toISOString() });
  };
  const ticket = async (kind: "technical" | "functional_guidance", prio = "normal") => {
    const { data, error } = await dueño.cli.rpc("support_submit_ticket", {
      p_organization_id: org, p_subject: `B6 ${kind} ${Math.random()}`,
      p_description: "Descripción de aceptación integrada.",
      p_category: kind === "technical" ? "bug" : "trazadocs",
      p_related_module: "platform", p_priority: prio, p_support_kind: kind });
    return error ? { ok: false as const, code: error.message ?? "" } : { ok: true as const, r: data as J };
  };
  /**
   * Borrar asignaciones exige borrar antes lo que las referencia: los eventos
   * comerciales y el libro de créditos las apuntan con `on delete restrict`.
   * Un `delete` que falla en silencio dejaba la empresa con el plan anterior y
   * hacía que las comprobaciones siguientes midieran otra cosa.
   */
  const resetAsignaciones = async () => {
    await admin.from("commercial_assignment_events").delete().eq("organization_id", org);
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
    const { error } = await admin.from("organization_plan_assignments")
      .delete().eq("organization_id", org);
    assert(!error, `no se pudieron retirar las asignaciones: ${error?.message}`);
  };

  const limpiar = async () => {
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
    await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
  };

  console.log("\nPE-04B6 · Aceptación integrada\n");

  try {
    // =====================================================================
    console.log("D · La empresa nace");
    // =====================================================================

    let pruebaId = "";

    await check("D1. Nace con base Free y prueba de Full · por el camino real", async () => {
      const { data } = await dueño.cli.from("organization_plan_assignments")
        .select("id, scope, module_code, grant_kind, ends_at, plan_revisions(plan_code)")
        .eq("organization_id", org);
      const filas = (data ?? []) as unknown as
        { id: string; grant_kind: string; ends_at: string | null; plan_revisions: { plan_code: string } }[];
      assert(filas.some((f) => f.grant_kind === "base" && f.plan_revisions.plan_code === "free"),
        "no nació con base Free");
      const t = filas.find((f) => f.grant_kind === "trial");
      assert(t, "no nació con prueba");
      assert(t!.plan_revisions.plan_code === "full", `la prueba es de ${t!.plan_revisions.plan_code}`);
      assert(t!.ends_at !== null, "la prueba no caduca sola");
      pruebaId = t!.id;
    });

    await check("D2. Y durante la prueba el EFECTIVO es Full · `core` no eleva", async () => {
      const p = await plan();
      assert(p.status === "found" && p.plan_code === "full", `resolvió ${JSON.stringify(p)}`);
      // `core` nace en full en toda empresa: si contara, el plan no significaría nada.
      const { data } = await admin.from("organization_plan_assignments")
        .select("module_code").eq("organization_id", org).eq("module_code", "core");
      assert((data ?? []).length === 0 || p.plan_code === "full",
        "core alteró el nivel comercial");
    });

    await check("D3. Los cinco ejes están de acuerdo durante la prueba", async () => {
      const [alm, cred, t, sop] = await Promise.all([almacenamiento(), ia(), tiempo(), soporteDe()]);
      assert(alm.quota_bytes === FULL_BYTES, `almacenamiento ${alm.quota_bytes}`);
      assert(t.metered === false, "la prueba mide tiempo de Free");
      assert(cred.trial_active === true && cred.trial_total === 50, `prueba de IA: ${JSON.stringify(cred.trial_total)}`);
      // Los cinco ejes están de acuerdo, y estar de acuerdo NO es decir todos lo
      // mismo: la prueba da almacenamiento de Full y reloj de Full, no da
      // orientación funcional —que es de Extra— y no da la bolsa mensual de
      // Full. Esta línea afirmaba 500 y así codificó el defecto que corrigió
      // 0170. La asimetría de Intelligence es deliberada y viene de PE-04B4.
      assert(cred.monthly_limit === 25, `la mensual durante la prueba es ${cred.monthly_limit}`);
      assert(cred.monthly_plan_code === "free" && cred.plan_code === "full",
        `origen de las bolsas: mensual ${cred.monthly_plan_code}, producto ${cred.plan_code}`);
      assert(sop.technical_reporting_allowed === true, "sin reporte técnico");
      assert(sop.functional_guidance_allowed === false,
        "la prueba de Full regaló la orientación funcional, que es de Extra");
    });

    // =====================================================================
    console.log("\nE · La prueba caduca sola");
    // =====================================================================

    await check("E1. Al vencer, el efectivo cae a Free · sin cron y sin borrar nada", async () => {
      const { count: antes } = await admin.from("organization_plan_assignments")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      // La provisión crea una prueba POR MÓDULO funcional, no una sola: cerrar
      // únicamente la primera dejaba a la empresa en Full por las otras.
      //
      // Y se cierran poniendo su fin justo DESPUÉS de su propio inicio: una
      // prueba real caduca por el paso del tiempo, y el modelo exige
      // `ends_at > starts_at`. Adelantar el reloj de la concesión —no el del
      // sistema— es la forma determinista de ver el vencimiento sin esperar 48
      // horas, y no reescribe nada más.
      const { data: pruebas } = await admin.from("organization_plan_assignments")
        .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
      const filasPrueba = (pruebas ?? []) as { id: string; starts_at: string }[];
      assert(filasPrueba.length > 0, "no había ninguna prueba que cerrar");
      for (const p of filasPrueba) {
        const fin = new Date(new Date(p.starts_at).getTime() + 1).toISOString();
        const { error } = await admin.from("organization_plan_assignments")
          .update({ ends_at: fin }).eq("id", p.id);
        assert(!error, `cerrar prueba ${p.id}: ${error?.message}`);
      }
      assert(pruebaId.length > 0, "no se identificó ninguna prueba al nacer");
      const p = await plan();
      assert(p.status === "found" && p.plan_code === "free", `resolvió ${p.plan_code}`);
      const { count: despues } = await admin.from("organization_plan_assignments")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(antes === despues, "caducar la prueba borró asignaciones");
    });

    await check("E2. Y los cinco ejes vuelven a Free a la vez", async () => {
      const [alm, cred, t, sop] = await Promise.all([almacenamiento(), ia(), tiempo(), soporteDe()]);
      assert(alm.quota_bytes === FREE_BYTES, `almacenamiento ${alm.quota_bytes}`);
      assert(cred.monthly_limit === 25, `créditos ${cred.monthly_limit}`);
      assert(cred.trial_active === false && cred.trial_remaining === null,
        "los créditos de prueba siguen alcanzables tras caducar");
      assert(t.metered === true && t.daily_limit === 30 && t.monthly_limit === 300,
        `tiempo ${JSON.stringify([t.daily_limit, t.monthly_limit])}`);
      assert(sop.technical_reporting_allowed === true && sop.functional_guidance_allowed === false,
        "el soporte no volvió a Free");
    });

    // =====================================================================
    console.log("\nJ · Bajada con datos dentro");
    // =====================================================================

    await check("J1. Con 200 MiB dentro, Free queda OVER_LIMIT · y NADA se borra", async () => {
      await limpiar();
      await ocupar(200 * MiB, "grande");
      const alm = await almacenamiento();
      assert(alm.state === "OVER_LIMIT", `dijo ${alm.state}`);
      const { count } = await admin.from("storage_orphan_candidates")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 1, `los datos cambiaron: ${count}`);
    });

    await check("J2. Se puede leer, descargar y BORRAR · no subir", async () => {
      assert(await puerta("read"), "no se puede leer");
      assert(await puerta("delete_or_reduce"), "no se puede borrar: quedaría atrapada");
      const { error } = await dueño.cli.rpc("organization_storage_guard",
        { p_organization_id: org, p_requested_bytes: 1, p_already_counted_bytes: 0 });
      assert(error && (error.message ?? "").includes("STORAGE_QUOTA_EXCEEDED"),
        `subir respondió ${error?.message ?? "permitido"}`);
    });

    await check("J3. Al borrar lo suficiente, volver a subir se permite", async () => {
      await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
      await ocupar(10 * MiB, "pequeno");
      const alm = await almacenamiento();
      assert(alm.state === "WITHIN_LIMIT", `dijo ${alm.state}`);
      const { error } = await dueño.cli.rpc("organization_storage_guard",
        { p_organization_id: org, p_requested_bytes: 1 * MiB, p_already_counted_bytes: 0 });
      assert(!error, `seguía bloqueado: ${error?.message}`);
    });

    // =====================================================================
    console.log("\nM/N/O · El reloj de Free y el modo consulta");
    // =====================================================================

    await check("M. A los 30 minutos del día entra en modo consulta", async () => {
      await limpiar();
      await gastarMinutos(30);
      const t = await tiempo();
      assert(t.state === "CONSULTATION_DAILY_LIMIT", `dijo ${t.state}`);
    });

    await check("O1. Leer, descargar y borrar siguen · crear, subir y ejecutar IA no", async () => {
      assert(await puerta("read"), "no se puede leer");
      assert(await puerta("delete_or_reduce"), "no se puede borrar");
      assert(await puerta("essential_account_operation"), "no se puede tocar la propia cuenta");
      assert(!(await puerta("business_increase_or_modify")), "se puede crear en modo consulta");
      assert(!(await puerta("ai_execution")), "se puede ejecutar IA en modo consulta");
      const { error } = await dueño.cli.rpc("ai_credits_reserve",
        { p_organization_id: org, p_operation_code: "ask", p_idempotency_key: null });
      assert(error && (error.message ?? "").includes("CONSULTATION_MODE"),
        `la IA respondió ${error?.message ?? "permitida"}`);
    });

    await check("P. Y reportar un problema técnico SIGUE disponible en modo consulta", async () => {
      // Si se bloqueara, dejaríamos de enterarnos de que el producto falla justo
      // para quien más barato lo tiene.
      const r = await ticket("technical");
      assert(r.ok, `no se pudo reportar: ${!r.ok && r.code}`);
    });

    await check("O2. Al reiniciar el día vuelve la operación normal", async () => {
      await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
      assert((await tiempo()).state === "NORMAL", "no volvió a normal");
      assert(await puerta("business_increase_or_modify"), "seguía bloqueado");
    });

    await check("N. El tope MENSUAL no se escapa reiniciando el día", async () => {
      await gastarMinutos(300, -1);   // ayer: mes agotado, día de hoy intacto
      const t = await tiempo();
      assert(t.state === "CONSULTATION_MONTHLY_LIMIT", `dijo ${t.state} con ${t.monthly_used} del mes`);
      assert(t.daily_used === 0, "hoy no debía estar gastado");
      assert(!(await puerta("business_increase_or_modify")), "el tope mensual no bloqueó");
      await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
    });

    // =====================================================================
    console.log("\nAB/AC · Ejes independientes");
    // =====================================================================

    await check("AC1. Sin créditos pero con tiempo: el resto del producto sigue", async () => {
      await limpiar();
      await gastarCreditos(25);
      assert((await ia()).state === "AT_LIMIT", "no llegó al tope de créditos");
      assert(await puerta("business_increase_or_modify"),
        "quedarse sin IA paralizó el producto: son ejes independientes");
      const { error } = await dueño.cli.rpc("organization_storage_guard",
        { p_organization_id: org, p_requested_bytes: 1024, p_already_counted_bytes: 0 });
      assert(!error, "sin créditos tampoco se puede subir");
    });

    await check("AC2. Con tiempo agotado y créditos de sobra: la IA se niega", async () => {
      await limpiar();
      await gastarMinutos(30);
      assert((await ia()).monthly_remaining === 25, "no quedaban créditos que probar");
      const { error } = await dueño.cli.rpc("ai_credits_reserve",
        { p_organization_id: org, p_operation_code: "ask", p_idempotency_key: null });
      assert(error && (error.message ?? "").includes("CONSULTATION_MODE"), `respondió ${error?.message}`);
      await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
      const { error: e2 } = await dueño.cli.rpc("ai_credits_reserve",
        { p_organization_id: org, p_operation_code: "ask", p_idempotency_key: null });
      assert(!e2, `al reiniciar el tiempo la IA seguía bloqueada: ${e2?.message}`);
    });

    await check("AC3. Almacenamiento lleno + modo consulta: BORRAR sigue posible", async () => {
      await limpiar();
      await ocupar(200 * MiB, "combinado");
      await gastarMinutos(30);
      assert((await almacenamiento()).state === "OVER_LIMIT", "no está por encima");
      assert((await tiempo()).state === "CONSULTATION_DAILY_LIMIT", "no está en modo consulta");
      assert(await puerta("delete_or_reduce"),
        "con el disco lleno y el cupo agotado no podría borrar: quedaría atrapada");
      assert(!(await puerta("business_increase_or_modify")), "aún dejaba crear");
      await limpiar();
    });

    // =====================================================================
    console.log("\nR/S · Subir y bajar de plan");
    // =====================================================================

    await check("R1. Free → Full por el camino canónico · efecto inmediato", async () => {
      await limpiar();
      await gastarCreditos(10);
      const { error } = await sa.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: await revision("full"),
        p_scope: "organization", p_module_code: null,
        p_starts_at: null, p_ends_at: null,
        p_reason: "Aceptación integrada de PE-04B6: subida controlada a Full." });
      assert(!error, `asignar Full: ${error?.message}`);
      const [p, alm, cred, t, sop] = await Promise.all([plan(), almacenamiento(), ia(), tiempo(), soporteDe()]);
      assert(p.plan_code === "full", `plan ${p.plan_code}`);
      assert(alm.quota_bytes === FULL_BYTES, `almacenamiento ${alm.quota_bytes}`);
      assert(cred.monthly_limit === 500, `créditos ${cred.monthly_limit}`);
      assert(cred.monthly_used === 10,
        `lo ya consumido cambió a ${cred.monthly_used}: subir no regala un mes nuevo`);
      assert(t.metered === false, "Full sigue con reloj comercial");
      assert(sop.functional_guidance_allowed === false, "Full incluyó orientación funcional");
    });

    await check("R2. Full → Extra · sin migrar datos y sin conceder módulos", async () => {
      const { data: modsAntes } = await admin.from("organization_modules")
        .select("module_code, enabled").eq("organization_id", org);
      const { error } = await sa.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: await revision("extra"),
        p_scope: "organization", p_module_code: null,
        p_starts_at: null, p_ends_at: null,
        p_reason: "Aceptación integrada de PE-04B6: subida controlada a Extra." });
      assert(!error, `asignar Extra: ${error?.message}`);
      const [alm, cred, t, sop] = await Promise.all([almacenamiento(), ia(), tiempo(), soporteDe()]);
      assert(alm.quota_bytes === EXTRA_BYTES, `almacenamiento ${alm.quota_bytes}`);
      assert(cred.monthly_limit === 2000, `créditos ${cred.monthly_limit}`);
      assert(t.metered === false, "Extra tiene reloj comercial");
      assert(sop.functional_guidance_allowed === true && sop.functional_cases_limit === 2,
        `soporte ${JSON.stringify(sop.functional_cases_limit)}`);
      const { data: modsDespues } = await admin.from("organization_modules")
        .select("module_code, enabled").eq("organization_id", org);
      assert(JSON.stringify(modsAntes) === JSON.stringify(modsDespues),
        "subir a Extra concedió acceso a módulos: son ejes distintos");
    });

    await check("Q. Extra: 1 técnico consume 0 · 2 funcionales agotan · el 3.º se niega", async () => {
      assert((await ticket("technical")).ok, "el técnico falló");
      assert((await soporteDe()).functional_cases_used === 0, "el técnico consumió cupo");
      assert((await ticket("functional_guidance")).ok, "el 1.º funcional falló");
      assert((await ticket("functional_guidance")).ok, "el 2.º funcional falló");
      const tercero = await ticket("functional_guidance");
      assert(!tercero.ok && tercero.code.includes("FUNCTIONAL_SUPPORT_LIMIT_REACHED"),
        `el 3.º respondió ${!tercero.ok && tercero.code}`);
    });

    await check("S1. Extra → Full: los casos abiertos siguen abiertos", async () => {
      const { data: antes } = await admin.from("support_tickets")
        .select("id, status").eq("organization_id", org).eq("support_kind", "functional_guidance");
      const { error } = await sa.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: await revision("full"),
        p_scope: "organization", p_module_code: null,
        p_starts_at: null, p_ends_at: null,
        p_reason: "Aceptación integrada de PE-04B6: bajada controlada a Full." });
      assert(!error, `bajar: ${error?.message}`);
      const { data: despues } = await admin.from("support_tickets")
        .select("id, status").eq("organization_id", org).eq("support_kind", "functional_guidance");
      assert(JSON.stringify(antes) === JSON.stringify(despues),
        "bajar de plan tocó los casos ya aceptados");
      const nuevo = await ticket("functional_guidance");
      assert(!nuevo.ok && nuevo.code.includes("FUNCTIONAL_SUPPORT_NOT_INCLUDED"),
        `tras bajar respondió ${!nuevo.ok && nuevo.code}`);
      assert((await ticket("technical")).ok, "se perdió el reporte técnico al bajar");
    });

    await check("S2. Volver a Extra el mismo mes NO reinicia el cupo de soporte", async () => {
      const { error } = await sa.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: await revision("extra"),
        p_scope: "organization", p_module_code: null,
        p_starts_at: null, p_ends_at: null,
        p_reason: "Aceptación integrada de PE-04B6: vuelta a Extra en el mismo mes." });
      assert(!error, `volver: ${error?.message}`);
      const sop = await soporteDe();
      assert(sop.functional_cases_used === 2 && sop.functional_cases_remaining === 0,
        `tras volver: ${sop.functional_cases_used}/${sop.functional_cases_limit}`);
      const cred = await ia();
      assert(cred.monthly_used === 10, `el consumo de IA se duplicó a ${cred.monthly_used}`);
    });

    // =====================================================================
    console.log("\nI · Empresa con módulos mezclados");
    // =====================================================================

    await check("I1. Cada módulo conserva su plan, y la empresa toma el mayor", async () => {
      await resetAsignaciones();
      const mezcla: Record<string, "free" | "full" | "extra"> = {
        quality: "extra", traceability_6632: "full", textiles: "free",
      };
      for (const [mod, code] of Object.entries(mezcla)) {
        const { error } = await sa.cli.rpc("commercial_assign_plan", {
          p_organization_id: org, p_plan_revision_id: await revision(code),
          p_scope: "module", p_module_code: mod,
          p_starts_at: null, p_ends_at: null,
          p_reason: `Aceptación integrada: ${mod} en ${code}.` });
        assert(!error, `asignar ${mod}: ${error?.message}`);
      }
      for (const [mod, code] of Object.entries(mezcla)) {
        const { data } = await dueño.cli.rpc("plan_effective_for_module", {
          p_organization_id: org, p_module_code: mod });
        assert((data as J).plan_code === code, `${mod} resolvió ${(data as J).plan_code}`);
      }
      // Los recursos de EMPRESA toman el nivel más alto elegible.
      const p = await plan();
      assert(p.plan_code === "extra", `la empresa resolvió ${p.plan_code}`);
      const alm = await almacenamiento();
      assert(alm.quota_bytes === EXTRA_BYTES, `almacenamiento ${alm.quota_bytes}`);
      const sop = await soporteDe();
      assert(sop.functional_cases_limit === 2, "el soporte no siguió al nivel más alto");
    });

    await check("I2. Y Extra NO concede acceso a un módulo que la empresa no tiene", async () => {
      const { data } = await dueño.cli.rpc("resolve_organization_module_access", {
        p_organization_id: org, p_module_code: "construccion" });
      const acceso = data as J;
      assert(acceso.allowed !== true,
        "tener Extra abrió un módulo no contratado: comercial y acceso son ejes distintos");
    });

    // =====================================================================
    console.log("\nAB · Cuando no se puede saber");
    // =====================================================================

    await check("AB1. Sin plan resoluble NADIE dice «Free» ni «agotaste tu cuota»", async () => {
      await resetAsignaciones();
      const [alm, cred, t, sop] = await Promise.all([almacenamiento(), ia(), tiempo(), soporteDe()]);
      assert(alm.state === "QUOTA_UNAVAILABLE" && alm.reason === "plan_absent", `almacenamiento ${JSON.stringify(alm.state)}`);
      assert(cred.state === "UNAVAILABLE" && cred.reason === "plan_absent", `ia ${JSON.stringify(cred.state)}`);
      assert(t.state === "ENTITLEMENT_UNAVAILABLE", `tiempo ${t.state}`);
      assert(sop.state === "UNAVAILABLE", `soporte ${sop.state}`);
      // Ninguno afirma un plan concreto.
      for (const [nombre, x] of [["almacenamiento", alm], ["ia", cred], ["tiempo", t]] as const) {
        assert(x.plan_code === undefined || x.plan_code === null,
          `${nombre} inventó el plan «${x.plan_code}»`);
      }
    });

    await check("AB2. Pero leer, borrar y reportar averías siguen", async () => {
      assert(await puerta("read"), "no se puede leer");
      assert(await puerta("delete_or_reduce"), "no se puede borrar");
      assert(!(await puerta("business_increase_or_modify")), "se puede crear sin plan resoluble");
      assert((await ticket("technical")).ok, "no se pudo reportar una avería sin plan resoluble");
    });

    // =====================================================================
    console.log("\nV · Los resolutores no se contradicen");
    // =====================================================================

    await check("V. En Free, Full y Extra los cinco ejes cuentan lo mismo", async () => {
      const esperado = {
        free:  { bytes: FREE_BYTES,  creditos: 25,   medido: true,  casos: 0 },
        full:  { bytes: FULL_BYTES,  creditos: 500,  medido: false, casos: 0 },
        extra: { bytes: EXTRA_BYTES, creditos: 2000, medido: false, casos: 2 },
      } as const;
      for (const code of ["free", "full", "extra"] as const) {
        await resetAsignaciones();
        await admin.from("organization_plan_assignments").insert({
          organization_id: org, plan_revision_id: await revision(code),
          scope: "organization", grant_kind: "base", source: "manual" });
        const [p, alm, cred, t, sop] = await Promise.all([plan(), almacenamiento(), ia(), tiempo(), soporteDe()]);
        const e = esperado[code];
        assert(p.plan_code === code, `${code}: el plan dijo ${p.plan_code}`);
        assert(alm.plan_code === code, `${code}: el almacenamiento dijo ${alm.plan_code}`);
        assert(cred.plan_code === code, `${code}: la IA dijo ${cred.plan_code}`);
        assert(t.plan_code === code, `${code}: el tiempo dijo ${t.plan_code}`);
        assert(sop.effective_plan === code, `${code}: el soporte dijo ${sop.effective_plan}`);
        assert(alm.quota_bytes === e.bytes, `${code}: almacenamiento ${alm.quota_bytes}`);
        assert(cred.monthly_limit === e.creditos, `${code}: créditos ${cred.monthly_limit}`);
        assert(t.metered === e.medido, `${code}: medido=${t.metered}`);
        assert((sop.functional_cases_limit ?? 0) === e.casos, `${code}: casos ${sop.functional_cases_limit}`);
      }
    });

    // =====================================================================
    console.log("\nZ/AA · Roles");
    // =====================================================================

    await check("Z. Soporte lee el contexto comercial y NO cambia nada · por efecto", async () => {
      // Un UPDATE filtrado por RLS no da error: da cero filas. Se comprueba el
      // efecto, no el error.
      const { error: eLee } = await soporte.cli.rpc("organization_support_entitlement",
        { p_organization_id: org });
      assert(!eLee, `soporte no pudo leer: ${eLee?.message}`);

      const revId = await revision("extra");
      const { data: antes } = await admin.from("plan_revisions").select("display_name").eq("id", revId).single();
      await soporte.cli.from("plan_revisions").update({ display_name: "soporte-intruso" }).eq("id", revId);
      const { data: despues } = await admin.from("plan_revisions").select("display_name").eq("id", revId).single();
      assert((antes as J).display_name === (despues as J).display_name, "soporte cambió el catálogo");

      const { error: eAsigna } = await soporte.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: revId, p_scope: "organization",
        p_module_code: null, p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_reason: "Intento de soporte de cambiar el plan de una empresa." });
      assert(eAsigna, "soporte pudo asignar un plan");
    });

    await check("AA. El dueño de la empresa no se sube el plan ni se reinicia contadores", async () => {
      const revId = await revision("extra");
      const { error: e1 } = await dueño.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: revId, p_scope: "organization",
        p_module_code: null, p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_reason: "Intento del cliente de asignarse Extra." });
      assert(e1, "el cliente se asignó un plan");

      const { data: antesLim } = await admin.from("plan_revision_limits")
        .select("limit_value").eq("plan_revision_id", revId).eq("resource_code", "storage_bytes").single();
      await dueño.cli.from("plan_revision_limits").update({ limit_value: 999 })
        .eq("plan_revision_id", revId).eq("resource_code", "storage_bytes");
      const { data: despuesLim } = await admin.from("plan_revision_limits")
        .select("limit_value").eq("plan_revision_id", revId).eq("resource_code", "storage_bytes").single();
      assert((antesLim as J).limit_value === (despuesLim as J).limit_value,
        "el cliente cambió un límite del catálogo");

      // Ni borra sus propios contadores para empezar de cero.
      await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
      await gastarMinutos(5);
      await dueño.cli.from("organization_usage_minutes").delete().eq("organization_id", org);
      const { count } = await admin.from("organization_usage_minutes")
        .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) === 5, `el cliente borró su propio consumo: quedan ${count}`);

      const { error: e4 } = await dueño.cli.from("commercial_trial_policy")
        .update({ trial_ai_credits: 5000 }).eq("id", true);
      const { data: pol } = await admin.from("commercial_trial_policy").select("trial_ai_credits").single();
      assert(e4 || (pol as J).trial_ai_credits === 50, "el cliente cambió la política de prueba");
    });

    // =====================================================================
    console.log("\nAC · Seguridad al cierre");
    // =====================================================================

    await check("AC. Cero tablas de `public` sin RLS", async () => {
      const { data, error } = await admin.rpc("public_tables_without_rls");
      assert(!error, `no se pudo consultar: ${error?.message}`);
      const filas = (data ?? []) as { table_name: string }[];
      assert(filas.length === 0, `sin RLS: ${filas.map((f) => f.table_name).join(", ")}`);
    });

    await check("Ninguna fuga entre empresas en las tablas comerciales", async () => {
      const otro = await persona("b6-ajeno");
      const { data: otroId } = await otro.cli.rpc("create_organization", { p_name: `B6 ajena ${sello}` });
      try {
        for (const tabla of ["organization_plan_assignments", "ai_credit_ledger",
                             "organization_usage_minutes", "support_tickets",
                             "commercial_assignment_events"]) {
          const { data } = await otro.cli.from(tabla).select("*").eq("organization_id", org);
          assert((data ?? []).length === 0, `${tabla}: una empresa ajena leyó ${(data ?? []).length} filas`);
        }
      } finally {
        await admin.from("organization_plan_assignments").delete().eq("organization_id", otroId as string);
        await admin.from("memberships").delete().eq("organization_id", otroId as string);
        await admin.from("organization_modules").delete().eq("organization_id", otroId as string);
        await admin.from("subscription_plan_history").delete().eq("organization_id", otroId as string);
        await admin.from("organization_subscriptions").delete().eq("organization_id", otroId as string);
        await admin.from("organizations").delete().eq("id", otroId as string);
      }
    });
  } finally {
    await admin.from("support_ticket_reclassifications").delete().eq("organization_id", org);
    await admin.from("support_ticket_status_history").delete().eq("organization_id", org);
    await admin.from("support_ticket_messages").delete().eq("organization_id", org);
    await admin.from("support_tickets").delete().eq("organization_id", org);
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
    await admin.from("commercial_assignment_events").delete().eq("organization_id", org);
    await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
    await admin.from("organization_usage_leases").delete().eq("organization_id", org);
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    await admin.from("memberships").delete().eq("organization_id", org);
    await admin.from("organizations").delete().eq("id", org);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04B6 · ciclo integrado: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
