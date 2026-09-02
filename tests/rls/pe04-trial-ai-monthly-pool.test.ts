/**
 * Trazaloop · PE-04 · La bolsa mensual de Intelligence no la eleva la prueba.
 *
 * El defecto que corrige 0170 no lo vio ninguna prueba porque todas miraban la
 * bolsa de la prueba y ninguna miraba el TECHO mensual. Esta suite mira lo que
 * nadie miraba, y lo mira por los dos caminos: el que informa y el que cobra.
 *
 * Lo que solo se sabe ejecutando:
 *
 *   · que Free + prueba dé 50 + 25 y no 50 + 500;
 *   · que comprar Full CON la prueba viva dé 50 + 500 —la regla es general,
 *     no «25 durante la prueba»—;
 *   · que el camino de reserva obedezca lo mismo que el de consulta;
 *   · que una empresa que gasta todo lo que se le ofrece NO quede por encima
 *     del cupo al caducar la prueba;
 *   · y que sin plan no-prueba resoluble se DENIEGUE, en vez de caer a 25.
 *
 * Correr: npm run test:pe04-trial-ai
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

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personas: string[] = [];

const PRUEBA = 50, FREE = 25, FULL = 500, EXTRA = 2000;

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA prueba IA" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "trial-ai" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  return { id: data.user!.id, email, cli };
}

type Creditos = {
  state: string; reason: string | null;
  plan_code: string | null; monthly_plan_code: string | null;
  period_month: string; limit_state: string | null;
  monthly_limit: number | null; monthly_used: number; monthly_remaining: number | null;
  trial_active: boolean; trial_total: number | null;
  trial_used: number | null; trial_remaining: number | null;
};

async function main() {
  const sa = await persona("tai-sa", "superadmin");
  const ana = await persona("tai-ana");

  const { data: orgId, error: eo } = await ana.cli.rpc("create_organization", { p_name: `QA TAI ${sello}` });
  assert(!eo, `crear empresa: ${eo?.message}`);
  const org = orgId as string;

  const creditos = async (cli = ana.cli): Promise<Creditos> => {
    const { data, error } = await cli.rpc("ai_credits_status", { p_organization_id: org });
    assert(!error, `ai_credits_status: ${error?.message}`);
    return data as unknown as Creditos;
  };
  const bolsaMensual = async (cli = ana.cli) => {
    const { data, error } = await cli.rpc("ai_monthly_allowance", { p_organization_id: org });
    assert(!error, `ai_monthly_allowance: ${error?.message}`);
    return data as { status: string; reason?: string; plan_code?: string; limit_value?: number };
  };
  const reservar = async (op: string, clave: string | null = null, cli = ana.cli) => {
    const { data, error } = await cli.rpc("ai_credits_reserve", {
      p_organization_id: org, p_operation_code: op, p_idempotency_key: clave });
    if (error) return { ok: false as const, code: error.message ?? "" };
    return { ok: true as const, r: data as { reservation_id: string; pool: string; weight_credits: number; reused: boolean } };
  };
  const revision = async (code: string) => {
    const { data } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", code).eq("status", "published").is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  const limpiarLibro = async () => {
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
  };
  // Un borrado que falla contra una clave `on delete restrict` DEVUELVE un
  // error, no lo lanza: si nadie lo mira, el escenario siguiente arranca sobre
  // los restos del anterior y falla por una razón que no es la suya. Se mira, y
  // además se comprueba que no quedó ninguna.
  const resetAsignaciones = async () => {
    await limpiarLibro();
    const { error } = await admin.from("organization_plan_assignments")
      .delete().eq("organization_id", org);
    assert(!error, `limpiar asignaciones: ${error?.message}`);
    const { count } = await admin.from("organization_plan_assignments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert((count ?? 0) === 0, `quedaron ${count} asignaciones del escenario anterior`);
  };
  /** Una base permanente del plan pedido, con el `grant_kind` que se pida. */
  const conceder = async (code: "free" | "full" | "extra", kind: "base" | "sold" | "courtesy") => {
    const { data, error } = await admin.from("organization_plan_assignments").insert({
      organization_id: org, plan_revision_id: await revision(code),
      scope: "organization", grant_kind: kind, source: "manual" })
      .select("id, starts_at, ends_at").single();
    assert(!error, `conceder ${code}/${kind}: ${error?.message}`);
    // Y se comprueba que la concesión está VIVA en el instante en que se va a
    // leer. Sin esto, un escenario mal montado se presenta como un techo
    // equivocado y parece un defecto del resolutor.
    const fila = data as { starts_at: string; ends_at: string | null };
    assert(new Date(fila.starts_at).getTime() <= Date.now(),
      `la concesión ${code}/${kind} empieza en el futuro: ${fila.starts_at}`);
    assert(fila.ends_at === null, `la concesión ${code}/${kind} nació cerrada`);
  };
  /** El plan no-prueba que ve el resolutor ahora mismo. Sirve de diagnóstico. */
  const planNoPrueba = async () => {
    const { data, error } = await ana.cli.rpc("plan_effective_for_organization_non_trial",
      { p_organization_id: org });
    assert(!error, `plan no-prueba: ${error?.message}`);
    return data as { status: string; plan_code?: string; grant_kind?: string };
  };
  /** Una prueba de Full viva, empezada una hora antes para poder cerrarla. */
  const conPrueba = async () => {
    const { data, error } = await admin.from("organization_plan_assignments").insert({
      organization_id: org, plan_revision_id: await revision("full"),
      scope: "organization", grant_kind: "trial", source: "trial",
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 48 * 3600_000).toISOString() }).select("id").single();
    assert(!error, `prueba: ${error?.message}`);
    return (data as { id: string }).id;
  };
  const cerrarPruebas = async () => {
    const { data } = await admin.from("organization_plan_assignments")
      .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
    for (const f of (data ?? []) as { id: string; starts_at: string }[]) {
      const { error } = await admin.from("organization_plan_assignments")
        .update({ ends_at: new Date(new Date(f.starts_at).getTime() + 1).toISOString() })
        .eq("id", f.id);
      assert(!error, `cerrar prueba: ${error?.message}`);
    }
  };

  console.log("\nPE-04 · La prueba no eleva la bolsa mensual de Intelligence\n");

  try {
    // =====================================================================
    console.log("A · Free + prueba · el caso que estaba roto");
    // =====================================================================

    await check("A/B. Free + prueba = 50 de prueba + 25 mensuales · NO 500", async () => {
      await resetAsignaciones();
      await conceder("free", "base");
      await conPrueba();
      const c = await creditos();
      assert(c.trial_active && c.trial_total === PRUEBA, `prueba ${c.trial_total}`);
      assert(c.monthly_limit !== FULL,
        `la mensual durante la prueba es ${c.monthly_limit}: la prueba entregó la bolsa de Full`);
      assert(c.monthly_limit === FREE,
        `la mensual durante la prueba es ${c.monthly_limit}, y debía ser la de Free`);
    });

    await check("Y el estado dice DE DÓNDE sale cada bolsa, sin confundirlas", async () => {
      const c = await creditos();
      // Dos conceptos, dos nombres. El plan del PRODUCTO sigue siendo Full: es
      // lo que el cliente contrató y lo que dicen los otros cuatro ejes. Lo que
      // cambia es de dónde sale la bolsa mensual.
      assert(c.plan_code === "full", `el plan del producto dice ser ${c.plan_code}`);
      assert(c.monthly_plan_code === "free", `la bolsa mensual dice venir de ${c.monthly_plan_code}`);
    });

    await check("El resolutor canónico se puede consultar por separado", async () => {
      const b = await bolsaMensual();
      assert(b.status === "resolved", `dijo ${b.status}`);
      assert(b.plan_code === "free" && b.limit_value === FREE,
        `resolvió ${b.plan_code}/${b.limit_value}`);
      // Y el plan efectivo, por su puerta, sigue diciendo Full.
      const { data: p } = await ana.cli.rpc("plan_effective_for_organization", { p_organization_id: org });
      assert((p as { plan_code: string }).plan_code === "full",
        "el plan efectivo dejó de ser Full durante la prueba: eso rompería los otros cuatro ejes");
      const { data: np } = await ana.cli.rpc("plan_effective_for_organization_non_trial",
        { p_organization_id: org });
      assert((np as { plan_code: string }).plan_code === "free",
        `el plan no-prueba dijo ${(np as { plan_code: string }).plan_code}`);
    });

    // =====================================================================
    console.log("\nB · El camino que cobra, no solo el que informa");
    // =====================================================================

    await check("C/D. Se gasta primero la bolsa que caduca, y después la mensual", async () => {
      await limpiarLibro();
      const r1 = await reservar("ask");                       // peso 5
      assert(r1.ok && r1.r.pool === "trial", `salió de «${r1.ok && r1.r.pool}»`);
      for (let i = 0; i < 9; i += 1) assert((await reservar("ask")).ok, `la ${i + 2}ª falló`);
      const c = await creditos();
      assert(c.trial_remaining === 0 && c.monthly_used === 0,
        `prueba ${c.trial_remaining}, mensual ${c.monthly_used}`);
      const r2 = await reservar("ask");
      assert(r2.ok && r2.r.pool === "monthly", `la siguiente salió de «${r2.ok && r2.r.pool}»`);
    });

    await check("E. Y el techo total es 50 + 25 · ni una operación más", async () => {
      // Quedan 20 de la mensual tras la anterior. Cuatro de peso 5 la agotan.
      for (let i = 0; i < 4; i += 1) assert((await reservar("ask")).ok, `la ${i + 1}ª falló`);
      const c = await creditos();
      assert(c.trial_used === PRUEBA && c.monthly_used === FREE,
        `gastado: prueba ${c.trial_used}, mensual ${c.monthly_used}`);
      assert(c.state === "AT_LIMIT", `dijo ${c.state}`);
      const r = await reservar("ask");
      assert(!r.ok && r.code.includes("AI_CREDIT_LIMIT_REACHED"),
        `con 75 gastados aún dejó ejecutar: ${r.ok ? "permitida" : r.code}`);
    });

    await check("La denegación es atómica: no cabe media operación", async () => {
      // Con la bolsa exacta agotada, una operación de peso 1 tampoco entra.
      const r = await reservar("document.quick_edit");
      assert(!r.ok, "una operación de peso 1 se coló por encima del tope");
      const c = await creditos();
      assert(c.monthly_used === FREE, `el intento fallido dejó rastro: ${c.monthly_used}`);
    });

    // =====================================================================
    console.log("\nC · Al caducar la prueba · el daño que ya no ocurre");
    // =====================================================================

    await check("F. Lo gastado en la mensual sobrevive, y NO deja a la empresa pasada", async () => {
      await limpiarLibro();
      // Se gastan los 50 de prueba y 20 de la mensual, que es lo que el
      // producto ofrece de verdad.
      for (let i = 0; i < 14; i += 1) assert((await reservar("ask")).ok, `la ${i + 1}ª falló`);
      const antes = await creditos();
      assert(antes.trial_used === PRUEBA && antes.monthly_used === 20,
        `antes: prueba ${antes.trial_used}, mensual ${antes.monthly_used}`);
      await cerrarPruebas();
      const c = await creditos();
      assert(!c.trial_active, "la prueba sigue viva tras cerrarla");
      assert(c.monthly_used === 20 && c.monthly_limit === FREE,
        `tras caducar: ${c.monthly_used}/${c.monthly_limit}`);
      assert(c.state !== "OVER_LIMIT",
        `quedó ${c.state}: la empresa acabó por encima de un cupo que nunca excedió`);
      // Y le quedan exactamente los cinco que le sobraban.
      assert(c.monthly_remaining === 5, `le quedan ${c.monthly_remaining}`);
      const r = await reservar("ask");
      assert(r.ok && r.r.pool === "monthly", `no pudo seguir operando: ${!r.ok && r.code}`);
    });

    await check("G. Los créditos de prueba no usados caducan con ella", async () => {
      await limpiarLibro();
      const c = await creditos();
      assert(c.trial_remaining === null && c.trial_total === null,
        `la bolsa de la prueba sigue alcanzable: ${c.trial_remaining}`);
      const r = await reservar("document.quick_edit");
      assert(r.ok && r.r.pool === "monthly", `volvió a la bolsa de prueba: ${r.ok && r.r.pool}`);
    });

    // =====================================================================
    console.log("\nD · La regla es general · no es «25 durante la prueba»");
    // =====================================================================

    await check("H. Full comprado CON la prueba viva = 50 de prueba + 500 mensuales", async () => {
      await resetAsignaciones();
      await conceder("free", "base");
      await conceder("full", "sold");
      await conPrueba();
      assert((await planNoPrueba()).plan_code === "full",
        `el escenario no quedó montado: el plan no-prueba es ${(await planNoPrueba()).plan_code}`);
      const c = await creditos();
      assert(c.trial_active && c.trial_total === PRUEBA, `prueba ${c.trial_total}`);
      assert(c.monthly_limit === FULL,
        `un cliente que pagó Full quedó retenido en ${c.monthly_limit}`);
      assert(c.monthly_plan_code === "full", `la bolsa mensual viene de ${c.monthly_plan_code}`);
    });

    await check("I. Extra comprado con la prueba viva = 50 + 2000", async () => {
      await resetAsignaciones();
      await conceder("free", "base");
      await conceder("extra", "sold");
      await conPrueba();
      const np = await planNoPrueba();
      assert(np.plan_code === "extra",
        `el escenario no quedó montado: el plan no-prueba es ${np.plan_code}/${np.grant_kind}`);
      const c = await creditos();
      assert(c.monthly_limit === EXTRA, `dio ${c.monthly_limit}`);
      assert(c.trial_total === PRUEBA, `la bolsa de la prueba desapareció: ${c.trial_total}`);
    });

    await check("J. La cortesía es una concesión comercial real · también cuenta", async () => {
      await resetAsignaciones();
      await conceder("free", "base");
      await conceder("full", "courtesy");
      await conPrueba();
      const c = await creditos();
      assert(c.monthly_limit === FULL,
        `una cortesía de Full dio ${c.monthly_limit}: 'courtesy' es no-prueba y sí eleva`);
    });

    await check("K. Con módulos mezclados manda el mayor NO-prueba", async () => {
      // Quality comprado en Full, PCR en Free con prueba, Textiles en Free.
      // La bolsa es de la EMPRESA: sale del mayor no-prueba, y la prueba no la
      // sube por encima de eso.
      await resetAsignaciones();
      for (const m of ["quality", "traceability_6632", "textiles"]) {
        const { error } = await admin.from("organization_plan_assignments").insert({
          organization_id: org, plan_revision_id: await revision("free"),
          scope: "module", module_code: m, grant_kind: "base", source: "manual" });
        assert(!error, `base de ${m}: ${error?.message}`);
      }
      const { error: eq } = await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await revision("full"),
        scope: "module", module_code: "quality", grant_kind: "sold", source: "manual" });
      assert(!eq, `Quality en Full: ${eq?.message}`);
      const { error: et } = await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await revision("full"),
        scope: "module", module_code: "traceability_6632", grant_kind: "trial", source: "trial",
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 48 * 3600_000).toISOString() });
      assert(!et, `prueba de PCR: ${et?.message}`);
      const c = await creditos();
      assert(c.monthly_limit === FULL, `dio ${c.monthly_limit}`);
      assert(c.monthly_plan_code === "full", `vino de ${c.monthly_plan_code}`);
    });

    await check("Y una prueba de Extra sobre Full comprado NO sube a 2000", async () => {
      await resetAsignaciones();
      await conceder("full", "sold");
      const { error } = await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await revision("extra"),
        scope: "organization", grant_kind: "trial", source: "trial",
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 48 * 3600_000).toISOString() });
      assert(!error, `prueba de Extra: ${error?.message}`);
      const c = await creditos();
      assert(c.monthly_limit === FULL,
        `una prueba de Extra elevó la bolsa mensual a ${c.monthly_limit}`);
    });

    // =====================================================================
    console.log("\nE · Sin dato NO es cero, y tampoco 25");
    // =====================================================================

    await check("L. Sin plan no-prueba resoluble se DENIEGA · no cae a Free", async () => {
      await resetAsignaciones();
      // Solo una prueba, sin base debajo: el caso que un `coalesce` a 25 habría
      // tapado inventando una cuota que nadie concedió.
      await conPrueba();
      const b = await bolsaMensual();
      assert(b.status === "unavailable", `resolvió ${JSON.stringify(b)}`);
      assert(b.reason === "non_trial_plan_absent", `la razón fue «${b.reason}»`);
      const c = await creditos();
      // No se presenta como cuota agotada: sería decirle al cliente que gastó
      // algo que no gastó. Se comprueba ANTES de afirmar el estado correcto,
      // porque es la confusión concreta que hay que impedir.
      assert(c.state !== "OVER_LIMIT" && c.state !== "AT_LIMIT",
        `un fallo de resolución se presentó como ${c.state}`);
      assert(c.state === "UNAVAILABLE", `el estado dijo ${c.state}`);
      assert(c.monthly_limit !== FREE, "cayó a los 25 de Free sin que nadie los concediera");
      const r = await reservar("ask");
      assert(!r.ok && r.code.includes("ENTITLEMENT_UNAVAILABLE"),
        `la reserva respondió ${r.ok ? "permitida" : r.code}`);
    });

    // =====================================================================
    console.log("\nF · Lo que B4 ya garantizaba sigue garantizado");
    // =====================================================================

    await check("M. Un fallo del proveedor libera la reserva de SU bolsa", async () => {
      await resetAsignaciones();
      await conceder("free", "base");
      await conPrueba();
      const r = await reservar("ask");
      assert(r.ok && r.r.pool === "trial", `la reserva salió de «${r.ok && r.r.pool}»`);
      const { data: liberada, error } = await ana.cli.rpc("ai_credits_release", {
        p_reservation_id: r.ok ? r.r.reservation_id : "" });
      assert(!error && liberada === true, `liberar: ${error?.message}`);
      const c = await creditos();
      assert(c.trial_used === 0 && c.monthly_used === 0,
        `tras liberar quedó prueba ${c.trial_used}, mensual ${c.monthly_used}`);
    });

    await check("N. La misma clave de idempotencia devuelve la MISMA reserva", async () => {
      await limpiarLibro();
      const a = await reservar("ask", "tai-idem-1");
      const b = await reservar("ask", "tai-idem-1");
      assert(a.ok && b.ok, "alguna de las dos falló");
      assert(a.r.reservation_id === b.r.reservation_id, "se crearon dos reservas");
      assert(b.r.reused === true, "la segunda no se marcó reutilizada");
      const c = await creditos();
      assert(c.trial_used === 5, `se cobró dos veces: ${c.trial_used}`);
    });

    await check("O. Dos reservas simultáneas junto al tope no pasan las dos", async () => {
      await limpiarLibro();
      // Se deja la bolsa total en exactamente 5: 50 de prueba y 20 de la
      // mensual gastados de 25.
      for (let i = 0; i < 14; i += 1) assert((await reservar("ask")).ok, `la ${i + 1}ª falló`);
      const antes = await creditos();
      assert(antes.monthly_remaining === 5, `quedaban ${antes.monthly_remaining}`);
      const [x, y] = await Promise.all([reservar("ask"), reservar("ask")]);
      const ok = [x, y].filter((r) => r.ok).length;
      assert(ok === 1, `pasaron ${ok} de dos: el candado por empresa no serializó`);
      const c = await creditos();
      assert(c.monthly_used === FREE, `la mensual acabó en ${c.monthly_used}, por encima de ${FREE}`);
    });

    // =====================================================================
    console.log("\nG · Quién puede ver esto");
    // =====================================================================

    await check("P/Q. El personal de plataforma lo lee · un ajeno no", async () => {
      const { data: c, error: e1 } = await sa.cli.rpc("ai_credits_status", { p_organization_id: org });
      assert(!e1 && c, `el superadmin no pudo leerlo: ${e1?.message}`);
      const cs = c as unknown as Creditos;
      assert(cs.monthly_plan_code !== undefined,
        "el superadmin no puede distinguir de dónde sale la bolsa mensual");
      const ajeno = await persona("tai-ajeno");
      const { error: e2 } = await ajeno.cli.rpc("ai_monthly_allowance", { p_organization_id: org });
      assert(e2, "un ajeno leyó la bolsa mensual de otra empresa");
      const { error: e3 } = await ajeno.cli.rpc("plan_effective_for_organization_non_trial",
        { p_organization_id: org });
      assert(e3, "un ajeno leyó el plan no-prueba de otra empresa");
    });

    await check("Y el ranking interno no es alcanzable desde un cliente", async () => {
      const { error } = await ana.cli.rpc("plan_effective_scan", {
        p_organization_id: org, p_as_of: new Date().toISOString(), p_exclude_trial: true });
      assert(error, "se pudo entrar al ranking saltándose la comprobación de identidad");
    });

    await check("El diagnóstico de afectadas tampoco lo ve un cliente", async () => {
      const { error: e1 } = await ana.cli.rpc("ai_trial_monthly_overrun");
      assert(e1, "el dueño de una empresa leyó el diagnóstico de toda la plataforma");
      const { error: e2 } = await sa.cli.rpc("ai_trial_monthly_overrun");
      assert(e2, "el diagnóstico quedó abierto al personal de plataforma vía RPC");
      const { data, error: e3 } = await admin.rpc("ai_trial_monthly_overrun");
      assert(!e3 && Array.isArray(data), `el servicio no pudo leerlo: ${e3?.message}`);
    });
  } finally {
    for (const tabla of ["ai_credit_ledger", "organization_usage_minutes",
      "organization_usage_leases", "commercial_assignment_events",
      "organization_plan_assignments", "subscription_plan_history",
      "organization_subscriptions", "organization_modules", "memberships"]) {
      const { error } = await admin.from(tabla).delete().eq("organization_id", org);
      if (error) console.error(`  (residuo) ${tabla}: ${error.message}`);
    }
    const { error } = await admin.from("organizations").delete().eq("id", org);
    if (error) console.error(`  (residuo) la empresa ${org}: ${error.message}`);
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04 · bolsa mensual y prueba: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
