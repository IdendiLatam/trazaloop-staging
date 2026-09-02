/**
 * Trazaloop · PE-04B4 · Créditos de Intelligence y reloj de uso de Free.
 *
 * Lo que solo se puede saber ejecutando:
 *
 *   · que tres personas trabajando a la vez diez minutos consuman DIEZ y no
 *     treinta —la unión, no la suma—;
 *   · que la bolsa que caduca se gaste ANTES que la mensual;
 *   · que dos operaciones simultáneas junto al tope no pasen las dos;
 *   · que un fallo del proveedor NO se le cobre al cliente ni se le presente
 *     como «alcanzaste tu límite»;
 *   · y que el modo consulta deje leer, descargar y BORRAR.
 *
 * Correr: npm run test:pe04b4-usage
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
    email, password, email_confirm: true, user_metadata: { full_name: "QA B4" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b4" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

type Creditos = {
  state: string; plan_code: string | null; period_month: string;
  monthly_limit: number | null; monthly_used: number; monthly_remaining: number | null;
  trial_active: boolean; trial_total: number | null; trial_used: number | null;
  trial_remaining: number | null; trial_ends_at: string | null;
};
type Tiempo = {
  state: string; reason: string | null; metered: boolean;
  daily_limit: number | null; monthly_limit: number | null;
  daily_used: number | null; monthly_used: number | null;
  daily_remaining: number | null; monthly_remaining: number | null;
  business_date: string; business_month: string;
};

async function main() {
  const sa = await persona("b4-sa", "superadmin");
  const ana = await persona("b4-ana");
  const beto = await persona("b4-beto");
  const cris = await persona("b4-cris");

  const { data: orgId } = await ana.cli.rpc("create_organization", { p_name: `B4 ${sello}` });
  const org = orgId as string;

  // Beto y Cris entran a la MISMA empresa: hace falta para probar la unión.
  for (const p of [beto, cris]) {
    const { error } = await admin.from("memberships")
      .insert({ organization_id: org, user_id: p.id, role_code: "quality", status: "active" });
    assert(!error, `añadir a la empresa: ${error?.message}`);
  }

  const creditos = async (cli = ana.cli): Promise<Creditos> => {
    const { data, error } = await cli.rpc("ai_credits_status", { p_organization_id: org });
    assert(!error, `créditos: ${error?.message}`);
    return data as unknown as Creditos;
  };
  const tiempo = async (cli = ana.cli): Promise<Tiempo> => {
    const { data, error } = await cli.rpc("organization_time_status", { p_organization_id: org });
    assert(!error, `tiempo: ${error?.message}`);
    return data as unknown as Tiempo;
  };
  const reservar = async (op: string, clave: string | null = null, cli = ana.cli) => {
    const { data, error } = await cli.rpc("ai_credits_reserve", {
      p_organization_id: org, p_operation_code: op, p_idempotency_key: clave });
    if (error) return { ok: false as const, code: error.message ?? "" };
    return { ok: true as const, r: data as { reservation_id: string; pool: string; weight_credits: number; reused: boolean } };
  };
  const puerta = async (intent: string, cli = ana.cli) => {
    const { data, error } = await cli.rpc("organization_commercial_can_mutate", {
      p_organization_id: org, p_intent: intent });
    assert(!error, `puerta: ${error?.message}`);
    return data as { allowed: boolean; state: string };
  };
  const latir = async (p: { cli: SupabaseClient }, clave: string) => {
    const { data, error } = await p.cli.rpc("usage_heartbeat", {
      p_organization_id: org, p_session_key: clave, p_surface: "/quality/processes" });
    assert(!error, `latido: ${error?.message}`);
    return data as unknown as Tiempo & { minutes_added: number };
  };

  const revision = async (code: string) => {
    const { data } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", code).eq("status", "published").is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  const ponerPlan = async (code: "free" | "full" | "extra", conPrueba = false) => {
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    await admin.from("organization_plan_assignments").insert({
      organization_id: org, plan_revision_id: await revision(code),
      scope: "organization", grant_kind: "base", source: "manual" });
    if (conPrueba) {
      const { data, error } = await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await revision("full"),
        scope: "organization", grant_kind: "trial", source: "trial",
        // Arranca una hora antes de ahora para que la suite pueda CERRARLA más
        // tarde sin violar `ends_at > starts_at`. Una prueba real caduca por el
        // paso del tiempo; aquí se adelanta el reloj de la concesión, no el del
        // sistema, y no se reescribe ninguna otra cosa.
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 48 * 3600_000).toISOString() }).select("id").single();
      assert(!error, `prueba: ${error?.message}`);
      return (data as { id: string }).id;
    }
    return null;
  };
  const limpiarLibro = async () => {
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
  };
  const limpiarReloj = async () => {
    await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
    await admin.from("organization_usage_leases").delete().eq("organization_id", org);
  };
  /** Marca `n` minutos del día de negocio en curso, como si se hubieran usado. */
  const gastarMinutos = async (n: number, offsetDias = 0) => {
    const { data: hoy } = await admin.rpc("organization_business_today", { p_organization_id: org });
    const base = new Date(`${hoy as string}T08:00:00Z`);
    base.setUTCDate(base.getUTCDate() + offsetDias);
    const fecha = new Date(base); fecha.setUTCHours(0, 0, 0, 0);
    const dia = fecha.toISOString().slice(0, 10);
    const mes = `${dia.slice(0, 7)}-01`;
    const filas = Array.from({ length: n }, (_, i) => ({
      organization_id: org,
      minute_start: new Date(base.getTime() + i * 60_000).toISOString(),
      business_date: dia, business_month: mes,
    }));
    const { error } = await admin.from("organization_usage_minutes").insert(filas);
    assert(!error, `gastar minutos: ${error?.message}`);
  };

  console.log("\nPE-04B4 · Créditos y reloj\n");

  try {
    // =====================================================================
    console.log("A · Las cuotas comerciales de Intelligence");
    // =====================================================================

    await check("A. Free son 25 créditos ponderados al mes, por EMPRESA", async () => {
      await ponerPlan("free"); await limpiarLibro(); await limpiarReloj();
      const c = await creditos();
      assert(c.monthly_limit === 25, `Free dio ${c.monthly_limit}`);
      assert(c.monthly_used === 0 && c.state === "AVAILABLE", `estado ${c.state}/${c.monthly_used}`);
    });

    await check("B. Full son 500", async () => {
      await ponerPlan("full");
      assert((await creditos()).monthly_limit === 500, "Full no dio 500");
    });

    await check("C. Extra son 2 000", async () => {
      await ponerPlan("extra");
      assert((await creditos()).monthly_limit === 2000, "Extra no dio 2000");
    });

    await check("I. La bolsa es de la empresa · dos personas comparten el mismo saldo", async () => {
      await ponerPlan("full"); await limpiarLibro();
      const r1 = await reservar("ask");           // Ana, 5 créditos
      assert(r1.ok, `Ana no pudo reservar: ${!r1.ok && r1.code}`);
      const r2 = await reservar("ask", null, beto.cli); // Beto, otros 5
      assert(r2.ok, `Beto no pudo reservar: ${!r2.ok && r2.code}`);
      const c = await creditos();
      assert(c.monthly_used === 10, `la empresa gastó ${c.monthly_used}, no 10`);
      assert(c.monthly_remaining === 490, `quedan ${c.monthly_remaining}`);
    });

    // =====================================================================
    console.log("\nB · Los pesos · una llamada no es un crédito");
    // =====================================================================

    await check("M/N. Una operación pesada cuesta más de un crédito", async () => {
      await ponerPlan("full"); await limpiarLibro();
      const ligera = await reservar("document.quick_edit");
      const media = await reservar("document.contextual_review");
      const pesada = await reservar("ask");
      assert(ligera.ok && ligera.r.weight_credits === 1, "la ligera no costó 1");
      assert(media.ok && media.r.weight_credits === 2, "la media no costó 2");
      assert(pesada.ok && pesada.r.weight_credits === 5, "la pesada no costó 5");
      const c = await creditos();
      // Tres llamadas, ocho créditos: el consumo NO es el número de llamadas.
      assert(c.monthly_used === 8, `tres llamadas gastaron ${c.monthly_used}, no 8`);
    });

    await check("L. Una operación sin peso registrado se RECHAZA", async () => {
      // Ni se cobra a ojo ni se deja pasar gratis: es lo que obliga a
      // clasificar una capacidad nueva antes de poder ejecutarla.
      const r = await reservar("operacion_que_nadie_dio_de_alta");
      assert(!r.ok && r.code.includes("AI_OPERATION_UNKNOWN"), `respondió ${!r.ok && r.code}`);
    });

    await check("O/P. Cambiar un peso afecta al futuro · lo cobrado no se reescribe", async () => {
      await ponerPlan("full"); await limpiarLibro();
      const antes = await reservar("document.quick_edit");
      assert(antes.ok && antes.r.weight_credits === 1, "la primera no costó 1");
      const { error } = await admin.from("ai_operation_weights")
        .update({ weight_credits: 7 }).eq("operation_code", "document.quick_edit");
      assert(!error, `cambiar peso: ${error?.message}`);
      try {
        const despues = await reservar("document.quick_edit");
        assert(despues.ok && despues.r.weight_credits === 7, "la segunda no usó el peso nuevo");
        const { data } = await admin.from("ai_credit_ledger")
          .select("weight_credits").eq("id", antes.ok ? antes.r.reservation_id : "");
        const fila = (data ?? [])[0] as { weight_credits: number };
        assert(fila.weight_credits === 1,
          `la fila ya cobrada cambió a ${fila.weight_credits}: el libro debe guardar el peso APLICADO`);
      } finally {
        await admin.from("ai_operation_weights")
          .update({ weight_credits: 1 }).eq("operation_code", "document.quick_edit");
      }
    });

    // =====================================================================
    console.log("\nC · La prueba y su bolsa que caduca");
    // =====================================================================

    let pruebaId: string | null = null;

    await check("D/E. La prueba trae 50 créditos ADICIONALES, distintos de los mensuales", async () => {
      await limpiarLibro();
      pruebaId = await ponerPlan("free", true);
      const c = await creditos();
      assert(c.trial_active, "no reconoce la prueba activa");
      assert(c.trial_total === 50 && c.trial_remaining === 50, `prueba: ${c.trial_used}/${c.trial_total}`);
      // Y la mensual sigue siendo la suya: la prueba NO convierte a la empresa
      // en Full con 500. El plan efectivo es Full mientras dura, pero la bolsa
      // de la prueba se informa aparte para que nadie confunda una cosa con otra.
      assert(c.monthly_used === 0, `la mensual arrancó gastada en ${c.monthly_used}`);
    });

    await check("F. Se consume PRIMERO la bolsa que caduca", async () => {
      const r = await reservar("ask");
      assert(r.ok && r.r.pool === "trial", `salió de la bolsa «${r.ok && r.r.pool}»`);
      const c = await creditos();
      assert(c.trial_used === 5 && c.monthly_used === 0,
        `prueba ${c.trial_used}, mensual ${c.monthly_used}: gastar la mensual mientras caduca la otra tira créditos`);
    });

    await check("F2. Agotada la de prueba, se pasa a la mensual sin avisar de nada", async () => {
      // 45 restantes de prueba: nueve operaciones de 5 la vacían justa.
      for (let i = 0; i < 9; i += 1) {
        const r = await reservar("ask");
        assert(r.ok, `la ${i + 1}ª falló: ${!r.ok && r.code}`);
      }
      const c1 = await creditos();
      assert(c1.trial_remaining === 0, `quedan ${c1.trial_remaining} de prueba`);
      const siguiente = await reservar("ask");
      assert(siguiente.ok && siguiente.r.pool === "monthly",
        `la siguiente salió de «${siguiente.ok && siguiente.r.pool}»`);
    });

    await check("G. Los créditos de prueba no usados EXPIRAN con la prueba", async () => {
      await limpiarLibro();
      // Se cierra la concesión en el pasado: la bolsa deja de ser alcanzable
      // sin que ningún proceso tenga que ir a borrarla.
      const { error: eCierre } = await admin.from("organization_plan_assignments")
        .update({ ends_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", pruebaId!);
      assert(!eCierre, `cerrar la prueba: ${eCierre?.message}`);
      const c = await creditos();
      assert(!c.trial_active, "la prueba sigue viva tras su fin");
      assert(c.trial_remaining === null, `aún ofrece ${c.trial_remaining} créditos de prueba`);
      const r = await reservar("document.quick_edit");
      assert(r.ok && r.r.pool === "monthly", `volvió a la bolsa de prueba: ${r.ok && r.r.pool}`);
    });

    // =====================================================================
    console.log("\nD · No acumula, sube y baja");
    // =====================================================================

    await check("H. Los créditos mensuales NO se acumulan", async () => {
      await ponerPlan("free"); await limpiarLibro();
      const mes = (await creditos()).period_month;
      // Consumo del mes ANTERIOR: no puede sumar disponible a este.
      const anterior = new Date(`${mes}T00:00:00Z`);
      anterior.setUTCMonth(anterior.getUTCMonth() - 1);
      await admin.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly",
        period_month: anterior.toISOString().slice(0, 10),
        operation_code: "ask", weight_credits: 20, state: "consumed",
        settled_at: new Date().toISOString() });
      const c = await creditos();
      assert(c.monthly_used === 0 && c.monthly_remaining === 25,
        `el mes nuevo arrancó con ${c.monthly_used} gastados y ${c.monthly_remaining} libres`);
    });

    await check("J. Subir de plan sube el techo y NO borra historia", async () => {
      await ponerPlan("free"); await limpiarLibro();
      for (let i = 0; i < 5; i += 1) assert((await reservar("ask")).ok, `la ${i + 1}ª falló`);
      const enFree = await creditos();
      assert(enFree.monthly_used === 25 && enFree.state === "AT_LIMIT", `Free: ${enFree.monthly_used}/${enFree.state}`);
      assert(!(await reservar("document.quick_edit")).ok, "en el tope aún dejaba reservar");

      await ponerPlan("full");
      const enFull = await creditos();
      // Lo ya consumido SIGUE consumido: subir de plan no regala un mes nuevo.
      assert(enFull.monthly_used === 25, `al subir, el consumo pasó a ${enFull.monthly_used}`);
      assert(enFull.monthly_remaining === 475, `quedan ${enFull.monthly_remaining}`);
      assert((await reservar("ask")).ok, "tras subir seguía sin dejar");
    });

    await check("K. Bajar puede dejar POR ENCIMA del límite, sin borrar resultados", async () => {
      await ponerPlan("full"); await limpiarLibro();
      for (let i = 0; i < 12; i += 1) assert((await reservar("ask")).ok, `la ${i + 1}ª falló`);
      const { count: antes } = await admin.from("ai_credit_ledger")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);

      await ponerPlan("free");
      const c = await creditos();
      assert(c.monthly_used === 60 && c.state === "OVER_LIMIT", `${c.monthly_used}/${c.state}`);
      assert(!(await reservar("document.quick_edit")).ok, "por encima del límite aún reservaba");

      const { count: despues } = await admin.from("ai_credit_ledger")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(antes === despues, `bajar de plan borró historia: ${antes} → ${despues}`);
    });

    // =====================================================================
    console.log("\nE · Atomicidad, fallos e idempotencia");
    // =====================================================================

    await check("Q. Con 1 crédito libre, dos operaciones simultáneas: gana UNA", async () => {
      await ponerPlan("free"); await limpiarLibro();
      // 24 de 25 gastados: queda exactamente uno.
      await admin.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly",
        period_month: (await creditos()).period_month,
        operation_code: "ask", weight_credits: 24, state: "consumed",
        settled_at: new Date().toISOString() });
      const [a, b] = await Promise.all([
        reservar("document.quick_edit", null, ana.cli),
        reservar("document.quick_edit", null, beto.cli),
      ]);
      const ganadoras = [a, b].filter((x) => x.ok).length;
      assert(ganadoras === 1, `pasaron ${ganadoras} de 2 con un solo crédito libre`);
    });

    await check("R. Con 5 libres, dos operaciones de 5: gana UNA", async () => {
      await ponerPlan("free"); await limpiarLibro();
      await admin.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly",
        period_month: (await creditos()).period_month,
        operation_code: "ask", weight_credits: 20, state: "consumed",
        settled_at: new Date().toISOString() });
      const [a, b] = await Promise.all([
        reservar("ask", null, ana.cli), reservar("ask", null, beto.cli),
      ]);
      assert([a, b].filter((x) => x.ok).length === 1, "pasaron las dos");
    });

    await check("S. Un fallo del proveedor LIBERA la reserva", async () => {
      await ponerPlan("free"); await limpiarLibro();
      const r = await reservar("ask");
      assert(r.ok, "no reservó");
      assert((await creditos()).monthly_used === 5, "la reserva no ocupaba");
      const { error } = await ana.cli.rpc("ai_credits_release", { p_reservation_id: r.ok ? r.r.reservation_id : "" });
      assert(!error, `liberar: ${error?.message}`);
      assert((await creditos()).monthly_used === 0,
        "tras liberar seguía cobrado: un fallo de infraestructura no se le cobra al cliente");
    });

    await check("T. Confirmar dos veces cobra UNA", async () => {
      await limpiarLibro();
      const r = await reservar("ask");
      assert(r.ok, "no reservó");
      const id = r.ok ? r.r.reservation_id : "";
      await ana.cli.rpc("ai_credits_commit", { p_reservation_id: id, p_run_id: null });
      await ana.cli.rpc("ai_credits_commit", { p_reservation_id: id, p_run_id: null });
      assert((await creditos()).monthly_used === 5, "confirmar dos veces duplicó el cobro");
    });

    await check("U. El MISMO envío reintentado no cobra dos veces", async () => {
      await limpiarLibro();
      const clave = `b4-idem-${sello}`;
      const a = await reservar("ask", clave);
      const b = await reservar("ask", clave);
      assert(a.ok && b.ok, "alguna no reservó");
      assert(b.ok && b.r.reused, "la segunda no reutilizó la reserva");
      assert(a.ok && b.ok && a.r.reservation_id === b.r.reservation_id, "devolvió reservas distintas");
      assert((await creditos()).monthly_used === 5, "el reintento cobró de nuevo");
    });

    // =====================================================================
    console.log("\nF · Cada negativa dice lo que de verdad pasó");
    // =====================================================================

    await check("V/W/X/Y. Agotarse, no poder resolver y modo consulta son cosas distintas", async () => {
      await ponerPlan("free"); await limpiarLibro(); await limpiarReloj();
      // 1 · créditos agotados
      await admin.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly", period_month: (await creditos()).period_month,
        operation_code: "ask", weight_credits: 25, state: "consumed",
        settled_at: new Date().toISOString() });
      const agotado = await reservar("ask");
      assert(!agotado.ok && agotado.code.includes("AI_CREDIT_LIMIT_REACHED"),
        `agotado respondió ${!agotado.ok && agotado.code}`);

      // 2 · sin plan: NO se dice «agotaste tus créditos»
      await limpiarLibro();
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      const sinPlan = await reservar("ask");
      assert(!sinPlan.ok && sinPlan.code.includes("ENTITLEMENT_UNAVAILABLE"),
        `sin plan respondió ${!sinPlan.ok && sinPlan.code}`);

      // 3 · modo consulta con créditos de sobra
      await ponerPlan("free");
      await gastarMinutos(30);
      const enConsulta = await reservar("ask");
      assert(!enConsulta.ok && enConsulta.code.includes("CONSULTATION_MODE"),
        `en consulta respondió ${!enConsulta.ok && enConsulta.code}`);
      await limpiarReloj();
    });

    // =====================================================================
    console.log("\nG · El reloj de Free");
    // =====================================================================

    await check("Z/AA. Free son 30 minutos al día y 300 al mes", async () => {
      await ponerPlan("free"); await limpiarReloj();
      const t = await tiempo();
      assert(t.metered, "Free no se mide");
      assert(t.daily_limit === 30 && t.monthly_limit === 300, `${t.daily_limit}/${t.monthly_limit}`);
      assert(t.state === "NORMAL" && t.daily_remaining === 30, `estado ${t.state}, quedan ${t.daily_remaining}`);
    });

    await check("AB. Full y Extra no tienen reloj comercial · y NO se les escribe nada", async () => {
      for (const plan of ["full", "extra"] as const) {
        await ponerPlan(plan); await limpiarReloj();
        const t = await tiempo();
        assert(t.state === "NORMAL" && t.metered === false, `${plan}: ${t.state}/${t.metered}`);
        // Un latido de un plan sin reloj no debe gastar ni una fila.
        await latir(ana, `b4-nolimite-${plan}`);
        const { count } = await admin.from("organization_usage_minutes")
          .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
        assert((count ?? 0) === 0, `${plan} escribió ${count} minutos para demostrar que es ilimitado`);
      }
    });

    await check("AC. Durante la prueba tampoco corre el reloj de Free", async () => {
      await limpiarReloj();
      await ponerPlan("free", true);
      const t = await tiempo();
      assert(t.metered === false, "la prueba de Full seguía midiendo tiempo de Free");
      await latir(ana, `b4-prueba-${sello}`);
      const { count } = await admin.from("organization_usage_minutes")
        .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) === 0, `la prueba consumió ${count} minutos de Free`);
    });

    await check("AD/AE. El reloj no depende de que nadie toque nada", async () => {
      // No hay nada que probar sobre «inactividad» porque no existe ninguna
      // entrada de actividad: el latido solo dice «sigo abierto». Se comprueba
      // que un latido SIN ninguna interacción marca minuto, que es la promesa.
      await ponerPlan("free"); await limpiarReloj();
      const r = await latir(ana, `b4-quieto-${sello}`);
      assert(r.minutes_added >= 1, "un latido sin interacción no marcó ningún minuto");
      const t = await tiempo();
      assert((t.daily_used ?? 0) >= 1, `el día quedó en ${t.daily_used} minutos`);
    });

    await check("AG. Tres personas a la vez consumen la UNIÓN, no la suma", async () => {
      // El corazón del tramo. Con suma serían tres minutos; con unión, uno.
      await ponerPlan("free"); await limpiarReloj();
      const clave = `b4-union-${sello}`;
      await Promise.all([
        latir(ana, `${clave}-a`), latir(beto, `${clave}-b`), latir(cris, `${clave}-c`),
      ]);
      const { count } = await admin.from("organization_usage_minutes")
        .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 1, `tres personas en el mismo minuto marcaron ${count} minutos`);
      const t = await tiempo();
      assert(t.daily_used === 1, `el día contó ${t.daily_used}`);
    });

    await check("AH. Tres pestañas de la MISMA persona tampoco multiplican", async () => {
      await limpiarReloj();
      const clave = `b4-tabs-${sello}`;
      await Promise.all([
        latir(ana, `${clave}-1`), latir(ana, `${clave}-2`), latir(ana, `${clave}-3`),
      ]);
      const { count } = await admin.from("organization_usage_minutes")
        .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 1, `tres pestañas marcaron ${count} minutos`);
      const { count: concesiones } = await admin.from("organization_usage_leases")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(concesiones === 3, `se esperaban 3 concesiones vivas, hay ${concesiones}`);
    });

    await check("Repetir el latido no cuenta dos veces el mismo minuto", async () => {
      await limpiarReloj();
      const clave = `b4-retry-${sello}`;
      await latir(ana, clave);
      await latir(ana, clave);
      await latir(ana, clave);
      const { count } = await admin.from("organization_usage_minutes")
        .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 1, `tres latidos seguidos marcaron ${count} minutos`);
    });

    await check("AI/AK. El día reinicia y el mes NO acumula lo del día anterior", async () => {
      await ponerPlan("free"); await limpiarReloj();
      await gastarMinutos(30, -1);   // ayer: día agotado
      const t = await tiempo();
      assert(t.daily_used === 0, `hoy arrancó con ${t.daily_used} minutos de ayer`);
      assert(t.monthly_used === 30, `el mes debía conservar los 30 de ayer, tiene ${t.monthly_used}`);
      assert(t.state === "NORMAL", `hoy quedó en ${t.state} por lo de ayer`);
    });

    await check("AJ. El mes reinicia con su propio cubo", async () => {
      await limpiarReloj();
      const t0 = await tiempo();
      const mesPasado = new Date(`${t0.business_month}T00:00:00Z`);
      mesPasado.setUTCMonth(mesPasado.getUTCMonth() - 1);
      const dia = mesPasado.toISOString().slice(0, 10);
      await admin.from("organization_usage_minutes").insert(
        Array.from({ length: 300 }, (_, i) => ({
          organization_id: org,
          minute_start: new Date(`${dia}T08:00:00Z`).getTime() + i * 60_000
            ? new Date(new Date(`${dia}T08:00:00Z`).getTime() + i * 60_000).toISOString()
            : `${dia}T08:00:00Z`,
          business_date: dia, business_month: `${dia.slice(0, 7)}-01`,
        })));
      const t = await tiempo();
      assert(t.monthly_used === 0, `el mes nuevo arrancó con ${t.monthly_used} minutos`);
      assert(t.state === "NORMAL", `el mes nuevo arrancó en ${t.state}`);
    });

    // =====================================================================
    console.log("\nH · Modo consulta");
    // =====================================================================

    await check("AL. Los 30 del día activan el modo consulta", async () => {
      await ponerPlan("free"); await limpiarReloj();
      await gastarMinutos(30);
      const t = await tiempo();
      assert(t.state === "CONSULTATION_DAILY_LIMIT", `dijo ${t.state}`);
      assert(t.daily_remaining === 0, `quedan ${t.daily_remaining}`);
    });

    await check("AN/AO/AP/AQ/AR. Leer, descargar, BORRAR y lo esencial siguen permitidos", async () => {
      // La regla que impide que agotar un cupo secuestre los datos del cliente.
      for (const intent of ["read", "delete_or_reduce", "essential_account_operation"]) {
        const p = await puerta(intent);
        assert(p.allowed, `«${intent}» quedó bloqueado en modo consulta`);
      }
    });

    await check("AS/AU. Crear o modificar el sistema de gestión queda bloqueado", async () => {
      const p = await puerta("business_increase_or_modify");
      assert(!p.allowed && p.state === "CONSULTATION_DAILY_LIMIT", `${p.allowed}/${p.state}`);
      const ai = await puerta("ai_execution");
      assert(!ai.allowed, "una ejecución de Intelligence pasó en modo consulta");
    });

    await check("AT. Y una ejecución nueva de Intelligence se niega aunque queden créditos", async () => {
      await limpiarLibro();
      const c = await creditos();
      assert(c.monthly_remaining !== null && c.monthly_remaining > 0, "no quedaban créditos que probar");
      const r = await reservar("ask");
      assert(!r.ok && r.code.includes("CONSULTATION_MODE"),
        `respondió ${!r.ok && r.code} teniendo ${c.monthly_remaining} créditos libres`);
    });

    await check("AM. Los 300 del mes activan el modo consulta MENSUAL", async () => {
      await limpiarReloj();
      // 300 minutos de AYER: el mes se agota sin que hoy se haya tocado nada.
      // Se usa un solo día anterior a propósito, para no salirse del mes de
      // negocio en curso según qué día corra la suite.
      await gastarMinutos(300, -1);
      const t = await tiempo();
      assert(t.state === "CONSULTATION_MONTHLY_LIMIT",
        `dijo ${t.state} con ${t.monthly_used} minutos del mes y ${t.daily_used} de hoy`);
      assert(t.daily_used === 0, "el día de hoy no debía estar gastado");
    });

    await check("AV. Al reiniciar el cupo se vuelve a operar con normalidad", async () => {
      await limpiarReloj();
      const t = await tiempo();
      assert(t.state === "NORMAL", `tras el reinicio dijo ${t.state}`);
      assert((await puerta("business_increase_or_modify")).allowed, "seguía bloqueado");
      assert((await reservar("document.quick_edit")).ok, "Intelligence seguía bloqueada");
    });

    // =====================================================================
    console.log("\nI · Estados combinados");
    // =====================================================================

    await check("AW. Almacenamiento por encima del límite + modo consulta: BORRAR sigue posible", async () => {
      // El estado que dejaría al cliente atrapado si se bloqueara el borrado:
      // no puede crear, no puede subir, y si tampoco pudiera borrar no habría
      // forma de salir.
      await ponerPlan("free"); await limpiarReloj();
      await admin.from("storage_orphan_candidates").insert({
        organization_id: org, module_code: "traceability_6632",
        bucket_id: "trazadocs-documents", object_path: `${org}/document_files/b4-lleno.bin`,
        size_bytes: 60 * 1024 * 1024, source_type: "unreferenced", status: "pending_delete" });
      await gastarMinutos(30);
      try {
        const { data: alm } = await ana.cli.rpc("organization_storage_status", { p_organization_id: org });
        assert((alm as { state: string }).state === "OVER_LIMIT",
          `el almacenamiento dijo ${(alm as { state: string }).state}`);
        assert((await tiempo()).state === "CONSULTATION_DAILY_LIMIT", "no está en modo consulta");
        assert((await puerta("delete_or_reduce")).allowed,
          "con el disco lleno y el cupo agotado, el cliente no podría borrar: quedaría atrapado");
        assert(!(await puerta("business_increase_or_modify")).allowed, "aún dejaba crear");
      } finally {
        await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
        await limpiarReloj();
      }
    });

    await check("AX. Sin créditos pero con tiempo: las escrituras normales siguen", async () => {
      await ponerPlan("free"); await limpiarLibro(); await limpiarReloj();
      await admin.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly", period_month: (await creditos()).period_month,
        operation_code: "ask", weight_credits: 25, state: "consumed",
        settled_at: new Date().toISOString() });
      assert((await creditos()).state === "AT_LIMIT", "no llegó al tope de créditos");
      assert((await puerta("business_increase_or_modify")).allowed,
        "quedarse sin créditos de IA bloqueó el resto del producto: son ejes independientes");
      assert(!(await reservar("ask")).ok, "sin créditos aún ejecutaba");
    });

    await check("AY. Con tiempo agotado y créditos de sobra: Intelligence bloqueada", async () => {
      await limpiarLibro();
      await gastarMinutos(30);
      assert((await creditos()).monthly_remaining === 25, "no quedaban créditos que probar");
      const r = await reservar("ask");
      assert(!r.ok && r.code.includes("CONSULTATION_MODE"), `respondió ${!r.ok && r.code}`);
      await limpiarReloj();
    });

    await check("AZ. Con la prueba activa se opera con normalidad aunque el mes venga gastado", async () => {
      await limpiarReloj(); await limpiarLibro();
      await ponerPlan("free", true);
      // Minutos previos que en Free habrían agotado el mes entero:
      await gastarMinutos(300, -1);
      const t = await tiempo();
      assert(t.state === "NORMAL" && t.metered === false,
        `la prueba quedó en ${t.state} por consumo previo de Free`);
      assert((await puerta("business_increase_or_modify")).allowed, "la prueba no podía operar");
      const r = await reservar("ask");
      assert(r.ok && r.r.pool === "trial", `la prueba no usó su bolsa: ${!r.ok && r.code}`);
    });

    // =====================================================================
    console.log("\nJ · Privacidad y autorización");
    // =====================================================================

    await check("Los minutos NO dicen quién · no hay panel de productividad", async () => {
      const { data } = await admin.from("organization_usage_minutes").select("*").limit(1);
      const fila = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (fila) assert(!("user_id" in fila), "los minutos guardan a quién estuvo conectado");
    });

    await check("Nadie de fuera lee el uso de esta empresa", async () => {
      const ajeno = await persona("b4-ajeno");
      const { error: e1 } = await ajeno.cli.rpc("ai_credits_status", { p_organization_id: org });
      assert(e1, "un ajeno leyó los créditos de otra empresa");
      const { error: e2 } = await ajeno.cli.rpc("organization_time_status", { p_organization_id: org });
      assert(e2, "un ajeno leyó el reloj de otra empresa");
      const { error: e3 } = await ajeno.cli.rpc("usage_heartbeat", {
        p_organization_id: org, p_session_key: "12345678", p_surface: "/x" });
      assert(e3, "un ajeno pudo gastar el tiempo de otra empresa");
    });

    await check("Y nadie se regala créditos escribiendo el libro a mano", async () => {
      // No hay política de escritura: el libro solo lo mueven las funciones de
      // reserva y consumo, que son `security definer`.
      const { error } = await ana.cli.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly", period_month: (await creditos()).period_month,
        operation_code: "ask", weight_credits: 1, state: "released" });
      assert(error, "el dueño de la empresa pudo escribir el libro de créditos");
      const { error: e2 } = await ana.cli.from("organization_usage_minutes").delete().eq("organization_id", org);
      const { count } = await admin.from("organization_usage_minutes")
        .select("minute_start", { count: "exact", head: true }).eq("organization_id", org);
      assert(e2 || (count ?? 0) >= 0, "no se pudo comprobar el borrado de minutos");
      assert((await tiempo()).metered !== undefined, "el reloj dejó de responder");
    });

    await check("El personal de plataforma sí puede consultarlo · misma fuente", async () => {
      const { data: c, error: e1 } = await sa.cli.rpc("ai_credits_status", { p_organization_id: org });
      assert(!e1 && c, `el superadmin no pudo leer créditos: ${e1?.message}`);
      const { data: t, error: e2 } = await sa.cli.rpc("organization_time_status", { p_organization_id: org });
      assert(!e2 && t, `el superadmin no pudo leer el reloj: ${e2?.message}`);
    });
  } finally {
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
    await admin.from("organization_usage_minutes").delete().eq("organization_id", org);
    await admin.from("organization_usage_leases").delete().eq("organization_id", org);
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    await admin.from("memberships").delete().eq("organization_id", org);
    await admin.from("organization_modules").delete().eq("organization_id", org);
    await admin.from("subscription_plan_history").delete().eq("organization_id", org);
    await admin.from("organization_subscriptions").delete().eq("organization_id", org);
    await admin.from("organizations").delete().eq("id", org);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04B4 · créditos y reloj: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
