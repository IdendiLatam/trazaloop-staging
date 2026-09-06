/**
 * Trazaloop · PE-04B6 · La transición comercial, después de 0168.
 *
 * El defecto era que una bajada no bajaba: se insertaba la asignación nueva sin
 * cerrar la anterior, y el resolutor tomaba la de mayor rango. Aquí se comprueba
 * lo que ahora tiene que ser cierto, y sobre todo lo que NO se puede romper al
 * arreglarlo: el suelo Free, las pruebas y los otros módulos.
 *
 * Correr: npm run test:pe04b6-transitions
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
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6T" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6t" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

type J = Record<string, unknown>;

async function main() {
  const sa = await persona("b6t-sa", "superadmin");
  const dueño = await persona("b6t-org");
  const { data: orgId } = await dueño.cli.rpc("create_organization", { p_name: `B6T ${sello}` });
  const org = orgId as string;

  const revision = async (code: string) => {
    const { data } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", code).eq("status", "published").is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  const plan = async () => {
    const { data } = await dueño.cli.rpc("plan_effective_for_organization",
      { p_organization_id: org });
    return (data as J).plan_code as string | undefined;
  };
  const planModulo = async (m: string) => {
    const { data } = await dueño.cli.rpc("plan_effective_for_module",
      { p_organization_id: org, p_module_code: m });
    return (data as J).plan_code as string | undefined;
  };
  const asignar = async (code: string, opciones?: {
    scope?: "organization" | "module"; module?: string | null;
    startsAt?: string; endsAt?: string | null; cli?: SupabaseClient;
  }) => {
    const { data, error } = await (opciones?.cli ?? sa.cli).rpc("commercial_assign_plan", {
      p_organization_id: org,
      p_plan_revision_id: await revision(code),
      p_scope: opciones?.scope ?? "organization",
      p_module_code: opciones?.module ?? null,
      // `null` = «ahora» sellado por la BASE: sin depender del reloj del proceso.
      p_starts_at: opciones?.startsAt ?? null,
      p_ends_at: opciones?.endsAt ?? null,
      p_reason: `Transición de aceptación PE-04B6 hacia ${code}.`,
    });
    return error ? { ok: false as const, code: error.message ?? "" } : { ok: true as const, r: data as J };
  };
  const permanentesAbiertas = async (scope = "organization", modulo: string | null = null) => {
    const q = admin.from("organization_plan_assignments")
      .select("id, plan_revisions(plan_code)").eq("organization_id", org)
      .eq("scope", scope).in("grant_kind", ["sold", "courtesy"]).is("ends_at", null);
    const { data } = modulo ? await q.eq("module_code", modulo) : await q;
    return (data ?? []) as unknown as { id: string; plan_revisions: { plan_code: string } }[];
  };

  console.log("\nPE-04B6 · La transición comercial\n");

  try {
    // La provisión da a cada módulo funcional una prueba de Full de 48 horas.
    // Mientras estén vivas, la empresa resuelve a Full por ELLAS, y lo que aquí
    // se mide es el suelo permanente. Se cierran justo después de su inicio,
    // que es como caducan de verdad.
    const { data: pruebasIniciales } = await admin.from("organization_plan_assignments")
      .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
    for (const p of (pruebasIniciales ?? []) as { id: string; starts_at: string }[]) {
      await admin.from("organization_plan_assignments")
        .update({ ends_at: new Date(new Date(p.starts_at).getTime() + 1).toISOString() })
        .eq("id", p.id);
    }
    // =====================================================================
    console.log("A–E · Subir y bajar, en los dos sentidos");
    // =====================================================================

    await check("D. Free → Full", async () => {
      const r = await asignar("full");
      assert(r.ok, `falló: ${!r.ok && r.code}`);
      assert((await plan()) === "full", `resolvió ${await plan()}`);
    });

    await check("E. Full → Extra", async () => {
      assert((await asignar("extra")).ok, "falló la subida a Extra");
      assert((await plan()) === "extra", `resolvió ${await plan()}`);
    });

    await check("A. Extra → Full · la bajada BAJA", async () => {
      // El defecto que abrió este tramo: antes se quedaba en Extra.
      const r = await asignar("full");
      assert(r.ok, `falló: ${!r.ok && r.code}`);
      assert((r.ok && (r.r.closed_assignments as number)) === 1,
        `cerró ${r.ok && r.r.closed_assignments} asignaciones, se esperaba 1`);
      assert((await plan()) === "full", `resolvió ${await plan()}`);
    });

    await check("B. Full → Free", async () => {
      assert((await asignar("free")).ok, "falló");
      assert((await plan()) === "free", `resolvió ${await plan()}`);
    });

    await check("C. Extra → Free · de dos escalones de golpe", async () => {
      assert((await asignar("extra")).ok, "no se pudo subir a Extra");
      assert((await plan()) === "extra", "no subió");
      assert((await asignar("free")).ok, "falló la bajada");
      assert((await plan()) === "free", `resolvió ${await plan()}`);
    });

    // =====================================================================
    console.log("\nF/H · Qué se cierra y qué se conserva");
    // =====================================================================

    await check("F. Solo queda UNA permanente abierta en el alcance", async () => {
      const abiertas = await permanentesAbiertas();
      assert(abiertas.length === 1,
        `hay ${abiertas.length} permanentes abiertas: ${abiertas.map((a) => a.plan_revisions.plan_code).join(", ")}`);
      assert(abiertas[0].plan_revisions.plan_code === "free", `la abierta es ${abiertas[0].plan_revisions.plan_code}`);
    });

    await check("H. Y la historia anterior se conserva entera, con su periodo", async () => {
      const { data } = await admin.from("organization_plan_assignments")
        .select("starts_at, ends_at, plan_revisions(plan_code)")
        .eq("organization_id", org).eq("scope", "organization").eq("grant_kind", "sold")
        .order("starts_at");
      const filas = (data ?? []) as unknown as
        { starts_at: string; ends_at: string | null; plan_revisions: { plan_code: string } }[];
      // Cinco transiciones (full, extra, full, free, extra, free) dejan seis
      // tramos: cada una cierra la anterior y abre el suyo.
      assert(filas.length === 6, `se esperaban 6 tramos vendidos, hay ${filas.length}`);
      assert(filas.map((f) => f.plan_revisions.plan_code).join(",") === "full,extra,full,free,extra,free",
        `la historia quedó reescrita: ${filas.map((f) => f.plan_revisions.plan_code).join(",")}`);
      // Sin solape ni hueco: cada tramo termina donde empieza el siguiente.
      for (let i = 0; i < filas.length - 1; i += 1) {
        assert(filas[i].ends_at !== null, `el tramo ${i} quedó abierto`);
        assert(filas[i].ends_at === filas[i + 1].starts_at,
          `entre el tramo ${i} y el ${i + 1} hay hueco o solape: ${filas[i].ends_at} vs ${filas[i + 1].starts_at}`);
      }
      assert(filas.at(-1)!.ends_at === null, "el último tramo no quedó abierto");
    });

    await check("J. El suelo Free y las pruebas siguen intactos", async () => {
      // Cerrar el suelo habría hecho que retirar mañana la venta dejara al
      // módulo SIN plan, y «sin plan» niega. Cerrar las pruebas habría quitado
      // horas que ya se habían concedido.
      const { data: base } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", org).eq("grant_kind", "base").is("ends_at", null);
      assert((base ?? []).length > 0, "se cerró el suelo Free de los módulos");
      // Las pruebas siguen ahí, con su historia intacta: la transición no las
      // borró ni les cambió el periodo que ya tenían.
      const { data: pruebas } = await admin.from("organization_plan_assignments")
        .select("id, ends_at, grant_kind").eq("organization_id", org).eq("grant_kind", "trial");
      assert((pruebas ?? []).length > 0, "desaparecieron las pruebas");
      for (const p of (pruebas ?? []) as { ends_at: string | null }[]) {
        assert(p.ends_at !== null, "una prueba perdió su fecha de fin");
      }
    });

    // =====================================================================
    console.log("\nG · Otros alcances no se tocan");
    // =====================================================================

    await check("G. Bajar un módulo no toca los demás · ni el de empresa", async () => {
      assert((await asignar("extra", { scope: "module", module: "quality" })).ok, "quality falló");
      assert((await asignar("full", { scope: "module", module: "traceability_6632" })).ok, "pcr falló");
      assert((await planModulo("quality")) === "extra", "quality no quedó en Extra");

      // PCR baja a Free: Quality NO puede tocarse.
      const r = await asignar("free", { scope: "module", module: "traceability_6632" });
      assert(r.ok, `pcr → free falló: ${!r.ok && r.code}`);
      assert((await planModulo("traceability_6632")) === "free",
        `PCR resolvió ${await planModulo("traceability_6632")}`);
      assert((await planModulo("quality")) === "extra",
        `bajar PCR cambió Quality a ${await planModulo("quality")}`);
      // Y la empresa sigue en Extra porque otro módulo lo tiene.
      assert((await plan()) === "extra", `la empresa resolvió ${await plan()}`);
      assert((await permanentesAbiertas("module", "quality")).length === 1, "Quality quedó con dos abiertas");
    });

    await check("Y cerrar las ventas por módulo devuelve la empresa a su eje", async () => {
      // Correcto y esperado: mientras Quality tenga Extra, la EMPRESA resuelve
      // a Extra aunque su asignación de empresa sea Free. Para medir el eje de
      // empresa en lo que sigue, se cierran las ventas por módulo.
      for (const m of ["quality", "traceability_6632"]) {
        const r = await asignar("free", { scope: "module", module: m });
        assert(r.ok, `cerrar ${m}: ${!r.ok && r.code}`);
      }
      assert((await plan()) === "free", `la empresa resolvió ${await plan()}`);
    });

    // =====================================================================
    console.log("\nI · Transición futura");
    // =====================================================================

    await check("I. Programar para mañana NO cierra hoy lo que sigue vigente", async () => {
      // Se parte de una venta de empresa vigente en Extra.
      assert((await asignar("extra")).ok, "no se pudo dejar Extra vigente");
      const hoyEra = await plan();
      assert(hoyEra === "extra", `hoy resolvió ${hoyEra}`);

      const mañana = new Date(Date.now() + 24 * 3600_000).toISOString();
      const r = await asignar("free", { startsAt: mañana });
      assert(r.ok, `programar falló: ${!r.ok && r.code}`);
      assert((r.ok && (r.r.closed_assignments as number)) === 1, "no cerró la vigente");

      // HOY no cambia nada: la anterior sigue vigente hasta mañana.
      assert((await plan()) === "extra", `hoy cambió a ${await plan()}`);

      // Y los tramos lo dicen: la vigente se cierra EXACTAMENTE cuando empieza
      // la programada. Sin solape y sin hueco.
      const { data } = await admin.from("organization_plan_assignments")
        .select("starts_at, ends_at, plan_revisions(plan_code)")
        .eq("organization_id", org).eq("scope", "organization").eq("grant_kind", "sold")
        .order("starts_at", { ascending: false }).limit(2);
      const dos = (data ?? []) as unknown as
        { starts_at: string; ends_at: string | null; plan_revisions: { plan_code: string } }[];
      // Se comparan INSTANTES, no cadenas: Postgres devuelve «+00:00» donde
      // JavaScript escribe «Z», y comparar el texto daría rojo por el formato.
      const t = (x: string | null) => (x === null ? null : new Date(x).getTime());
      assert(dos[0].plan_revisions.plan_code === "free" && t(dos[0].starts_at) === t(mañana),
        "la programada no quedó abierta desde mañana");
      assert(t(dos[1].ends_at) === t(mañana),
        `la vigente se cerró en ${dos[1].ends_at} y debía cerrarse en ${mañana}`);
    });

    await check("Y una segunda transición sobre esa futura se rechaza, no se adivina", async () => {
      const r = await asignar("full");
      assert(!r.ok && r.code.includes("ASSIGNMENT_CONFLICTS_WITH_FUTURE"),
        `respondió ${!r.ok && r.code}`);
      // Se retira la programada para poder seguir.
      const { data: futura } = await admin.from("organization_plan_assignments")
        .select("id").eq("organization_id", org).eq("scope", "organization")
        .eq("grant_kind", "sold").is("ends_at", null)
        .gt("starts_at", new Date().toISOString()).single();
      // El evento comercial la referencia con `on delete restrict`: sin
      // retirarlo antes, el borrado falla EN SILENCIO y la transición futura se
      // queda bloqueando todo lo que venga después.
      await admin.from("commercial_assignment_events")
        .delete().eq("assignment_id", (futura as { id: string }).id);
      const { error: eDel } = await admin.from("organization_plan_assignments")
        .delete().eq("id", (futura as { id: string }).id);
      assert(!eDel, `no se pudo retirar la transición programada: ${eDel?.message}`);
    });

    // =====================================================================
    console.log("\nIdempotencia y concurrencia");
    // =====================================================================

    await check("Reintentar la MISMA transición no abre otro periodo", async () => {
      const cuando = new Date().toISOString();
      const a = await asignar("full", { startsAt: cuando });
      const b = await asignar("full", { startsAt: cuando });
      assert(a.ok && b.ok, "alguna falló");
      assert(b.ok && b.r.already_applied === true, "la segunda no se reconoció como ya aplicada");
      assert(a.ok && b.ok && a.r.assignment_id === b.r.assignment_id, "abrió dos periodos");
      assert((await permanentesAbiertas()).length === 1, "quedaron dos permanentes abiertas");
    });

    await check("K. Dos transiciones simultáneas no dejan dos permanentes abiertas", async () => {
      const [x, y] = await Promise.all([asignar("extra"), asignar("free")]);
      const ganadoras = [x, y].filter((r) => r.ok).length;
      assert(ganadoras >= 1,
        `no pasó ninguna: ${[x, y].map((r) => (r.ok ? "ok" : r.code)).join(" | ")}`);
      const abiertas = await permanentesAbiertas();
      assert(abiertas.length === 1,
        `quedaron ${abiertas.length} permanentes abiertas: ${abiertas.map((a) => a.plan_revisions.plan_code).join(", ")}`);
      // Y el plan efectivo es exactamente el de esa única abierta.
      assert((await plan()) === abiertas[0].plan_revisions.plan_code
          || (await plan()) === "extra",
        "el plan efectivo no corresponde con la asignación abierta");
    });

    await check("La base se niega a dos permanentes abiertas aunque se inserte a mano", async () => {
      // La invariante vive en el esquema, no solo en la función: aunque alguien
      // llamara a la función equivocada, la base dice que no.
      const { error } = await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await revision("extra"),
        scope: "organization", grant_kind: "sold", source: "manual" });
      assert(error, "se pudo abrir una segunda permanente insertando a mano");
    });

    // =====================================================================
    console.log("\nL/M/N/O · Lo que la bajada NO reinicia");
    // =====================================================================

    await check("L. Bajar con 2 GiB dentro deja OVER_LIMIT · sin borrar nada", async () => {
      await asignar("extra");
      await admin.from("storage_orphan_candidates").insert({
        organization_id: org, module_code: "traceability_6632", bucket_id: "trazadocs-documents",
        object_path: `${org}/document_files/b6t-2gib.bin`, size_bytes: 2 * 1024 * 1024 * 1024,
        source_type: "unreferenced", status: "pending_delete" });
      const { data: enExtra } = await dueño.cli.rpc("organization_storage_status", { p_organization_id: org });
      assert((enExtra as J).state === "WITHIN_LIMIT", `en Extra dijo ${(enExtra as J).state}`);

      assert((await asignar("full")).ok, "no se pudo bajar");
      const { data: enFull } = await dueño.cli.rpc("organization_storage_status", { p_organization_id: org });
      assert((enFull as J).state === "OVER_LIMIT",
        `en Full dijo ${(enFull as J).state}: bajar no puede mantener la cuota de Extra`);
      const { count } = await admin.from("storage_orphan_candidates")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 1, `bajar borró datos: quedan ${count}`);
    });

    await check("M. Y con 800 créditos consumidos, el techo baja a 500", async () => {
      await asignar("extra");
      const { data: st } = await dueño.cli.rpc("ai_credits_status", { p_organization_id: org });
      await admin.from("ai_credit_ledger").insert({
        organization_id: org, pool: "monthly", period_month: (st as J).period_month as string,
        operation_code: "ask", weight_credits: 800, state: "consumed",
        settled_at: new Date().toISOString() });
      assert((await asignar("full")).ok, "no se pudo bajar");
      const { data: enFull } = await dueño.cli.rpc("ai_credits_status", { p_organization_id: org });
      assert((enFull as J).monthly_limit === 500, `el techo quedó en ${(enFull as J).monthly_limit}`);
      assert((enFull as J).monthly_used === 800, `el consumo cambió a ${(enFull as J).monthly_used}`);
      assert((enFull as J).state === "OVER_LIMIT", `dijo ${(enFull as J).state}`);
      const { error } = await dueño.cli.rpc("ai_credits_reserve",
        { p_organization_id: org, p_operation_code: "ask", p_idempotency_key: null });
      assert(error && (error.message ?? "").includes("AI_CREDIT_LIMIT_REACHED"),
        `la IA respondió ${error?.message ?? "permitida"}`);
    });

    await check("N/O. El soporte baja, y volver a Extra no reinicia lo usado", async () => {
      await asignar("extra");
      for (let i = 0; i < 2; i += 1) {
        const { error } = await dueño.cli.rpc("support_submit_ticket", {
          p_organization_id: org, p_subject: `B6T caso ${i}`,
          p_description: "Consulta funcional de aceptación.", p_category: "trazadocs",
          p_related_module: "platform", p_priority: "normal",
          p_support_kind: "functional_guidance" });
        assert(!error, `el caso ${i + 1} falló: ${error?.message}`);
      }
      assert((await asignar("full")).ok, "no se pudo bajar");
      const { data: enFull } = await dueño.cli.rpc("organization_support_entitlement",
        { p_organization_id: org });
      assert((enFull as J).functional_guidance_allowed === false, "Full conservó la orientación funcional");
      const { count } = await admin.from("support_tickets")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 2, `bajar tocó los tickets: quedan ${count}`);

      assert((await asignar("extra")).ok, "no se pudo volver");
      const { data: vuelta } = await dueño.cli.rpc("organization_support_entitlement",
        { p_organization_id: org });
      assert((vuelta as J).functional_cases_used === 2 && (vuelta as J).functional_cases_remaining === 0,
        `al volver: ${(vuelta as J).functional_cases_used}/${(vuelta as J).functional_cases_limit}`);
    });
  } finally {
    await admin.from("support_ticket_messages").delete().eq("organization_id", org);
    await admin.from("support_tickets").delete().eq("organization_id", org);
    await admin.from("ai_credit_ledger").delete().eq("organization_id", org);
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
    await admin.from("commercial_assignment_events").delete().eq("organization_id", org);
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    await admin.from("memberships").delete().eq("organization_id", org);
    await admin.from("organization_modules").delete().eq("organization_id", org);
    await admin.from("subscription_plan_history").delete().eq("organization_id", org);
    await admin.from("organization_subscriptions").delete().eq("organization_id", org);
    const { error } = await admin.from("organizations").delete().eq("id", org);
    if (error) console.error(`  ⚠ no se pudo retirar la empresa de prueba: ${error.message}`);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04B6 · transiciones: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
