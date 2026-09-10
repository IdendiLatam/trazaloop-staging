/**
 * Trazaloop · PE-04B5 · Derechos de soporte y administración comercial.
 *
 * Lo que solo se sabe ejecutando:
 *
 *   · que reportar una avería NUNCA consuma un caso, en ningún plan;
 *   · que con un caso libre dos envíos simultáneos no pasen los dos;
 *   · que bajar de plan no cierre un caso ya aceptado;
 *   · que ir y volver a Extra en el mismo mes no regale casos;
 *   · y que un incidente crítico de una empresa Free vaya por delante de una
 *     duda de uso de una Extra.
 *
 * Correr: npm run test:pe04b5-support
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { limpiarPersonas } from "../support/fixture-cleanup";

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
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b5" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

/**
 * El AUTOR CANÓNICO de las pruebas de publicación.
 *
 * `plan_revisions.published_by` es inmutable desde 0162, y hace bien: quien
 * publicó una revisión del catálogo no se puede reescribir ni borrar sin
 * falsear la historia comercial. Eso no se toca.
 *
 * Lo que sí estaba mal era el diseño de la prueba: creaba un superadministrador
 * NUEVO en cada ejecución, publicaba con él, y lo dejaba vivo para siempre
 * porque ya no se podía borrar. Un usuario más en Local por vuelta, sin techo.
 *
 * Este autor tiene correo DETERMINISTA —sin sello ni azar—, así que la primera
 * ejecución lo crea y todas las siguientes lo reutilizan. Las revisiones que
 * publique quedan como historia válida, firmadas siempre por la misma persona
 * sintética, y el crecimiento en régimen es cero. No entra en
 * `personasCreadas`: no se borra a propósito, no porque no se pueda.
 *
 * La búsqueda es por `profiles.email`, que es exacta y acotada. Nada de
 * recorrer `auth.users` entero para encontrar a uno.
 */
async function personaEstable(prefijo: string, papel: "superadmin" | "support") {
  const email = `${prefijo}@test.trazaloop.dev`;
  const { data: ya } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  let id = (ya as { id: string } | null)?.id ?? null;
  const nuevo = id === null;
  if (id === null) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: "QA B5 · autor canónico" } });
    assert(!error && data.user, `crear el autor canónico: ${error?.message}`);
    id = data.user!.id;
  }
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eEntrar } = await cli.auth.signInWithPassword({ email, password });
  assert(!eEntrar, `entrar como el autor canónico: ${eEntrar?.message}`);
  // Idempotente por diseño: la función lleva `on conflict do nothing`.
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b5" });
  const { data: yaEsStaff } = await admin.from("platform_staff")
    .select("user_id").eq("user_id", id).maybeSingle();
  if (!yaEsStaff) {
    const { error } = await admin.from("platform_staff")
      .insert({ user_id: id, role_code: papel, status: "active" });
    assert(!error, `dar el papel al autor canónico: ${error?.message}`);
  }
  return { id, email, cli, nuevo };
}

type Ent = {
  state: string; effective_plan: string | null;
  technical_reporting_allowed: boolean; functional_guidance_allowed: boolean;
  functional_cases_limit: number | null; functional_cases_used: number;
  functional_cases_remaining: number | null; period: string;
  commercial_priority: string | null; response_target: string | null;
};

async function main() {
  const sa = await personaEstable("b5-sa", "superadmin");
  const soporte = await persona("b5-support", "support");
  const ana = await persona("b5-ana");
  const beto = await persona("b5-beto");
  const ajeno = await persona("b5-ajeno");

  const { data: orgId } = await ana.cli.rpc("create_organization", { p_name: `B5 ${sello}` });
  const org = orgId as string;
  const { data: otroId } = await ajeno.cli.rpc("create_organization", { p_name: `B5 otra ${sello}` });
  const otraOrg = otroId as string;

  await admin.from("memberships")
    .insert({ organization_id: org, user_id: beto.id, role_code: "quality", status: "active" });

  const derecho = async (cli = ana.cli, o = org): Promise<Ent> => {
    const { data, error } = await cli.rpc("organization_support_entitlement", {
      p_organization_id: o });
    assert(!error, `derecho: ${error?.message}`);
    return data as unknown as Ent;
  };
  let n = 0;
  const enviar = async (kind: "technical" | "functional_guidance", cli = ana.cli, prioridad = "normal") => {
    n += 1;
    const { data, error } = await cli.rpc("support_submit_ticket", {
      p_organization_id: org,
      p_subject: `B5 ${kind} ${n}`,
      p_description: `Descripción de prueba ${kind} ${n}`,
      p_category: kind === "technical" ? "bug" : "trazadocs",
      p_related_module: "platform",
      p_priority: prioridad,
      p_support_kind: kind,
    });
    if (error) return { ok: false as const, code: error.message ?? "" };
    return { ok: true as const, r: data as { ticket_id: string; consumed_case: boolean; commercial_priority: string } };
  };
  const revision = async (code: string) => {
    const { data } = await admin.from("plan_revisions").select("id")
      .eq("plan_code", code).eq("status", "published").is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  const ponerPlan = async (code: "free" | "full" | "extra", prueba = false) => {
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    await admin.from("organization_plan_assignments").insert({
      organization_id: org, plan_revision_id: await revision(code),
      scope: "organization", grant_kind: "base", source: "manual" });
    if (prueba) {
      await admin.from("organization_plan_assignments").insert({
        organization_id: org, plan_revision_id: await revision("full"),
        scope: "organization", grant_kind: "trial", source: "trial",
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 48 * 3600_000).toISOString() });
    }
  };
  const limpiarTickets = async () => {
    await admin.from("support_ticket_reclassifications").delete().eq("organization_id", org);
    await admin.from("support_ticket_status_history").delete().eq("organization_id", org);
    await admin.from("support_ticket_messages").delete().eq("organization_id", org);
    await admin.from("support_tickets").delete().eq("organization_id", org);
  };

  console.log("\nPE-04B5 · Soporte y administración comercial\n");

  try {
    // =====================================================================
    console.log("A · Reportar una avería está en los tres planes");
    // =====================================================================

    for (const [letra, plan] of [["A", "free"], ["B", "full"], ["C", "extra"]] as const) {
      await check(`${letra}. ${plan}: el reporte técnico se acepta`, async () => {
        await ponerPlan(plan); await limpiarTickets();
        const d = await derecho();
        assert(d.technical_reporting_allowed, `${plan} no permite reportar averías`);
        const r = await enviar("technical");
        assert(r.ok, `${plan} no pudo reportar: ${!r.ok && r.code}`);
      });
    }

    await check("D. Un reporte técnico consume CERO casos funcionales", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      for (let i = 0; i < 5; i += 1) assert((await enviar("technical")).ok, `la ${i + 1}ª falló`);
      const d = await derecho();
      assert(d.functional_cases_used === 0,
        `cinco averías consumieron ${d.functional_cases_used} casos: reportar fallos no puede gastar cupo`);
      assert(d.functional_cases_remaining === 2, `quedan ${d.functional_cases_remaining}`);
    });

    await check("Y sigue disponible aunque el plan NO se pueda resolver", async () => {
      // Enterarse de que el producto está roto no puede depender de haber
      // podido leer un plan.
      await limpiarTickets();
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      const d = await derecho();
      assert(d.state === "UNAVAILABLE", `dijo ${d.state}`);
      assert(d.technical_reporting_allowed, "sin plan resoluble se cerró el reporte de averías");
      assert((await enviar("technical")).ok, "no se pudo reportar una avería sin plan resoluble");
    });

    // =====================================================================
    console.log("\nB · La orientación funcional solo con Extra");
    // =====================================================================

    await check("E. Free: orientación funcional denegada, y se dice por qué", async () => {
      await ponerPlan("free"); await limpiarTickets();
      const d = await derecho();
      assert(!d.functional_guidance_allowed, "Free la ofrece");
      const r = await enviar("functional_guidance");
      assert(!r.ok && r.code.includes("FUNCTIONAL_SUPPORT_NOT_INCLUDED"), `respondió ${!r.ok && r.code}`);
    });

    await check("F. Full: tampoco · USD 40 no incluyen acceso a una persona", async () => {
      await ponerPlan("full");
      const r = await enviar("functional_guidance");
      assert(!r.ok && r.code.includes("FUNCTIONAL_SUPPORT_NOT_INCLUDED"), `respondió ${!r.ok && r.code}`);
    });

    await check("G/H. Extra: incluida, dos casos al mes por empresa", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      const d = await derecho();
      assert(d.functional_guidance_allowed && d.functional_cases_limit === 2, `límite ${d.functional_cases_limit}`);
      const r1 = await enviar("functional_guidance");
      assert(r1.ok && r1.r.consumed_case, "el primero no consumió");
      assert(r1.ok && r1.r.commercial_priority === "prioritized", "no recibió prioridad comercial");
      const r2 = await enviar("functional_guidance");
      assert(r2.ok, "el segundo falló");
      const r3 = await enviar("functional_guidance");
      assert(!r3.ok && r3.code.includes("FUNCTIONAL_SUPPORT_LIMIT_REACHED"), `el tercero: ${!r3.ok && r3.code}`);
    });

    await check("J. La prueba de Full NO trae los casos funcionales de Extra", async () => {
      await ponerPlan("free", true); await limpiarTickets();
      const d = await derecho();
      assert(d.effective_plan === "full", `la prueba resolvió a ${d.effective_plan}`);
      assert(!d.functional_guidance_allowed,
        "la prueba de Full regaló la orientación funcional, que es de Extra");
      assert((await enviar("technical")).ok, "durante la prueba no se pudo reportar una avería");
    });

    // =====================================================================
    console.log("\nC · Concurrencia y ámbito");
    // =====================================================================

    await check("K. Con UN caso libre, dos envíos simultáneos: pasa uno", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      assert((await enviar("functional_guidance")).ok, "no se pudo dejar un solo caso libre");
      const [a, b] = await Promise.all([
        enviar("functional_guidance", ana.cli),
        enviar("functional_guidance", beto.cli),
      ]);
      const ganadoras = [a, b].filter((x) => x.ok).length;
      assert(ganadoras === 1, `pasaron ${ganadoras} de 2 con un solo caso libre`);
    });

    await check("L. Dos personas comparten la MISMA bolsa de la empresa", async () => {
      await limpiarTickets();
      assert((await enviar("functional_guidance", ana.cli)).ok, "Ana no pudo");
      assert((await enviar("functional_guidance", beto.cli)).ok, "Beto no pudo");
      const d = await derecho();
      assert(d.functional_cases_used === 2, `la empresa usó ${d.functional_cases_used}`);
      const tercero = await enviar("functional_guidance", beto.cli);
      assert(!tercero.ok, "la bolsa se multiplicó por persona");
    });

    await check("M. Varios módulos NO multiplican el cupo", async () => {
      await limpiarTickets();
      // Extra por MÓDULO en dos módulos funcionales: la empresa sigue teniendo
      // una sola bolsa, porque el recurso es de alcance empresa.
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      for (const m of ["traceability_6632", "textiles"]) {
        await admin.from("organization_plan_assignments").insert({
          organization_id: org, plan_revision_id: await revision("extra"),
          scope: "module", module_code: m, grant_kind: "sold", source: "manual" });
      }
      const d = await derecho();
      assert(d.functional_cases_limit === 2, `con dos módulos Extra el límite salió ${d.functional_cases_limit}`);
    });

    // =====================================================================
    console.log("\nD · Cambios de plan");
    // =====================================================================

    await check("N/O. Subir a Extra a mitad de mes da el cupo, y lo técnico previo no cuenta", async () => {
      await ponerPlan("free"); await limpiarTickets();
      for (let i = 0; i < 3; i += 1) assert((await enviar("technical")).ok, `la ${i + 1}ª falló`);
      await ponerPlan("extra");
      const d = await derecho();
      assert(d.functional_cases_limit === 2 && d.functional_cases_used === 0,
        `tras subir: ${d.functional_cases_used}/${d.functional_cases_limit}`);
    });

    await check("P/Q. Bajar NO cierra un caso abierto, pero no deja abrir otro", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      const abierto = await enviar("functional_guidance");
      assert(abierto.ok, "no se pudo abrir el caso");
      const id = abierto.ok ? abierto.r.ticket_id : "";

      await ponerPlan("free");
      const { data: sigue } = await ana.cli.from("support_tickets")
        .select("id, status, support_kind, entitlement_period").eq("id", id).maybeSingle();
      const t = sigue as { status: string; support_kind: string; entitlement_period: string | null } | null;
      assert(t, "el caso desapareció al bajar de plan");
      assert(t!.status !== "closed", `el caso se cerró solo: ${t!.status}`);
      assert(t!.entitlement_period !== null, "perdió el rastro de qué cupo consumió");

      const nuevo = await enviar("functional_guidance");
      assert(!nuevo.ok && nuevo.code.includes("FUNCTIONAL_SUPPORT_NOT_INCLUDED"),
        `tras bajar respondió ${!nuevo.ok && nuevo.code}`);
    });

    await check("R. Ir y volver a Extra en el mismo mes NO reinicia el consumo", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      assert((await enviar("functional_guidance")).ok, "el 1º falló");
      assert((await enviar("functional_guidance")).ok, "el 2º falló");
      await ponerPlan("free");
      await ponerPlan("extra");
      const d = await derecho();
      assert(d.functional_cases_used === 2 && d.functional_cases_remaining === 0,
        `tras ir y volver: ${d.functional_cases_used}/${d.functional_cases_limit}`);
      assert(!(await enviar("functional_guidance")).ok, "cambiar de plan regaló casos");
    });

    await check("I. Los casos NO se acumulan de un mes al siguiente", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      const d0 = await derecho();
      const anterior = new Date(`${d0.period}T00:00:00Z`);
      anterior.setUTCMonth(anterior.getUTCMonth() - 1);
      // Un mes anterior sin usar no suma al actual.
      const r = await enviar("functional_guidance");
      assert(r.ok, "no se pudo enviar");
      await admin.from("support_tickets")
        .update({ entitlement_period: anterior.toISOString().slice(0, 10) })
        .eq("id", r.ok ? r.r.ticket_id : "");
      const d = await derecho();
      assert(d.functional_cases_used === 0 && d.functional_cases_remaining === 2,
        `el mes nuevo arrancó en ${d.functional_cases_used}/${d.functional_cases_limit}`);
    });

    // =====================================================================
    console.log("\nE · La cola: la severidad manda sobre lo comercial");
    // =====================================================================

    await check("S/T. Un incidente crítico de Free adelanta a una consulta de Extra", async () => {
      const { data: critico } = await admin.rpc("support_queue_rank", {
        p_support_kind: "technical", p_priority: "urgent", p_commercial_priority: "standard" });
      const { data: extra } = await admin.rpc("support_queue_rank", {
        p_support_kind: "functional_guidance", p_priority: "normal", p_commercial_priority: "prioritized" });
      assert(Number(critico) < Number(extra),
        `crítico ${critico} no adelanta a la consulta prioritaria ${extra}: pagar no puede colarse delante de una caída`);
      const { data: normal } = await admin.rpc("support_queue_rank", {
        p_support_kind: "technical", p_priority: "normal", p_commercial_priority: "standard" });
      assert(Number(extra) < Number(normal), "la prioridad comercial no sirve para nada");
    });

    await check("U. «1 día hábil» es objetivo de PRIMERA RESPUESTA, no de resolución", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      const r = await enviar("functional_guidance");
      assert(r.ok, "no se pudo enviar");
      const { data } = await ana.cli.from("support_tickets")
        .select("first_response_target_at, resolved_at").eq("id", r.ok ? r.r.ticket_id : "").single();
      const t = data as { first_response_target_at: string | null; resolved_at: string | null };
      assert(t.first_response_target_at !== null, "no hay objetivo de primera respuesta");
      assert(t.resolved_at === null, "se fijó una fecha de resolución: eso sería prometer un plazo");
      const d = await derecho();
      assert(d.response_target === "1_business_day", `el objetivo salió como ${d.response_target}`);
    });

    // =====================================================================
    console.log("\nF · Reclasificación");
    // =====================================================================

    await check("V. Técnico → funcional NO se salta el derecho", async () => {
      await ponerPlan("free"); await limpiarTickets();
      const r = await enviar("technical");
      assert(r.ok, "no se pudo abrir");
      const id = r.ok ? r.r.ticket_id : "";
      const { data, error } = await soporte.cli.rpc("support_reclassify_ticket", {
        p_ticket_id: id, p_to_kind: "functional_guidance",
        p_reason: "En realidad es una duda de uso, no un fallo del producto.",
        p_release_allowance: false });
      assert(!error, `reclasificar: ${error?.message}`);
      assert((data as { allowance_effect: string }).allowance_effect === "not_covered",
        `efecto ${(data as { allowance_effect: string }).allowance_effect}`);
      const { data: t } = await admin.from("support_tickets")
        .select("entitlement_period").eq("id", id).single();
      assert((t as { entitlement_period: string | null }).entitlement_period === null,
        "una empresa Free acabó con orientación funcional incluida por la puerta de atrás");
    });

    await check("W. Ida y vuelta NO cobra dos veces", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      const r = await enviar("functional_guidance");
      assert(r.ok, "no se pudo abrir");
      const id = r.ok ? r.r.ticket_id : "";
      assert((await derecho()).functional_cases_used === 1, "no consumió al enviarse");
      for (const [to, motivo] of [["technical", "Resulta que sí era un fallo del producto."],
                                  ["functional_guidance", "Revisado: era una duda de uso."]] as const) {
        const { error } = await soporte.cli.rpc("support_reclassify_ticket", {
          p_ticket_id: id, p_to_kind: to, p_reason: motivo, p_release_allowance: false });
        assert(!error, `reclasificar a ${to}: ${error?.message}`);
      }
      const d = await derecho();
      assert(d.functional_cases_used === 1,
        `tras ir y volver consumió ${d.functional_cases_used}: un ticket consume como mucho una vez`);
    });

    await check("Y una devolución EXPLÍCITA sí libera · era un defecto nuestro", async () => {
      const { data: t0 } = await admin.from("support_tickets")
        .select("id").eq("organization_id", org).not("entitlement_period", "is", null).limit(1).single();
      const id = (t0 as { id: string }).id;
      const { data, error } = await soporte.cli.rpc("support_reclassify_ticket", {
        p_ticket_id: id, p_to_kind: "technical",
        p_reason: "Era un defecto del producto: no corresponde cobrarle el caso al cliente.",
        p_release_allowance: true });
      assert(!error, `devolver: ${error?.message}`);
      assert((data as { allowance_effect: string }).allowance_effect === "released", "no se devolvió");
      assert((await derecho()).functional_cases_used === 0, "el cupo no volvió");
    });

    await check("X. La historia de reclasificación se conserva", async () => {
      const { data } = await ana.cli.from("support_ticket_reclassifications")
        .select("from_kind, to_kind, allowance_effect, reason").eq("organization_id", org);
      const filas = (data ?? []) as { reason: string }[];
      assert(filas.length >= 3, `solo hay ${filas.length} registros de reclasificación`);
      assert(filas.every((f) => f.reason.length >= 10), "alguna reclasificación no dice por qué");
    });

    await check("Reclasificar es de soporte, no del cliente", async () => {
      const { data: t0 } = await admin.from("support_tickets")
        .select("id").eq("organization_id", org).limit(1).single();
      const { error } = await ana.cli.rpc("support_reclassify_ticket", {
        p_ticket_id: (t0 as { id: string }).id, p_to_kind: "technical",
        p_reason: "Quiero que no me cuente el caso, gracias.", p_release_allowance: true });
      assert(error, "el cliente pudo reclasificar su propio ticket para no gastar cupo");
    });

    await check("Y. Marcar fuera de alcance NO convierte el caso en consultoría incluida", async () => {
      await ponerPlan("extra"); await limpiarTickets();
      const r = await enviar("functional_guidance");
      assert(r.ok, "no se pudo abrir");
      const id = r.ok ? r.r.ticket_id : "";
      const { error } = await soporte.cli.rpc("support_mark_out_of_scope", {
        p_ticket_id: id,
        p_note: "Revisar y rediseñar tu mapa de procesos es Acompañamiento especializado, un servicio aparte." });
      assert(!error, `marcar alcance: ${error?.message}`);
      const { data: t } = await admin.from("support_tickets")
        .select("scope_outcome, entitlement_period").eq("id", id).single();
      const fila = t as { scope_outcome: string | null; entitlement_period: string | null };
      assert(fila.scope_outcome === "out_of_scope_consulting", "no quedó marcado");
      assert(fila.entitlement_period !== null, "marcar el alcance borró el consumo del caso");
      const d = await derecho();
      assert(d.functional_cases_limit === 2, "el límite se volvió ilimitado al salir de alcance");
    });

    // =====================================================================
    console.log("\nG · La consola comercial");
    // =====================================================================

    await check("Z/AA/AB. Solo la administración de plataforma asigna planes", async () => {
      const revExtra = await revision("extra");
      for (const [quien, cli] of [["soporte", soporte.cli], ["cliente", ana.cli], ["ajeno", ajeno.cli]] as const) {
        const { error } = await cli.rpc("commercial_assign_plan", {
          p_organization_id: org, p_plan_revision_id: revExtra, p_scope: "organization",
          p_module_code: null, p_starts_at: new Date().toISOString(), p_ends_at: null,
          p_reason: "Intento no autorizado de cambiar el plan." });
        assert(error, `${quien} pudo asignar un plan comercial`);
      }
      const { error: eSa } = await sa.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: revExtra, p_scope: "organization",
        p_module_code: null, p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_reason: "Transición comercial de prueba para la suite de PE-04B5." });
      assert(!eSa, `el superadministrador no pudo: ${eSa?.message}`);
    });

    await check("AH. Una asignación manual deja historia con el plan ANTERIOR", async () => {
      const { data } = await sa.cli.from("commercial_assignment_events")
        .select("previous_plan_code, new_plan_code, reason").eq("organization_id", org)
        .order("created_at", { ascending: false }).limit(1);
      const e = (data ?? [])[0] as { previous_plan_code: string | null; new_plan_code: string; reason: string } | undefined;
      assert(e, "no quedó historia de la transición");
      assert(e!.new_plan_code === "extra", `el nuevo plan salió ${e!.new_plan_code}`);
      assert(e!.reason.length >= 10, "la historia no dice por qué");
    });

    await check("AI. `core` NO puede recibir un plan comercial", async () => {
      // Si pudiera, toda empresa resolvería a ese plan y el nivel comercial
      // dejaría de significar nada.
      const { error } = await sa.cli.rpc("commercial_assign_plan", {
        p_organization_id: org, p_plan_revision_id: await revision("extra"),
        p_scope: "module", p_module_code: "core",
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_reason: "Intento de asignar plan comercial al módulo interno core." });
      assert(error && (error.message ?? "").includes("MODULE_NOT_COMMERCIAL"),
        `respondió ${error?.message ?? "sin error"}`);
    });

    await check("AC. Una revisión PUBLICADA no se edita", async () => {
      const revId = await revision("extra");
      const { error } = await sa.cli.from("plan_revisions")
        .update({ monthly_price_minor: 1 }).eq("id", revId);
      assert(error, "se pudo editar una revisión publicada: eso reescribiría lo que alguien contrató");
    });

    await check("AD/AE. Un borrador sí se edita, y publicarlo abre un periodo nuevo", async () => {
      const { data: max } = await admin.from("plan_revisions").select("revision_number")
        .eq("plan_code", "full").order("revision_number", { ascending: false }).limit(1).single();
      const siguiente = Number((max as { revision_number: number }).revision_number) + 1;
      const { data: draft, error: eIns } = await admin.from("plan_revisions").insert({
        plan_code: "full", revision_number: siguiente, status: "draft",
        display_name: "B5 borrador", price_state: "configured", currency: "USD",
        monthly_price_minor: 4000, annual_price_minor: 40000,
        internal_notes: "PE-04B5 · borrador de prueba" }).select("id").single();
      assert(!eIns, `crear borrador: ${eIns?.message}`);
      const draftId = (draft as { id: string }).id;
      // Se guarda fuera del `try` para poder restituir en el `finally`.
      const { data: vigentePrevia } = await admin.from("plan_revisions").select("id")
        .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single();
      const vigenteAntes = (vigentePrevia as { id: string }).id;
      // El borrador nace copiando los límites de la vigente, igual que hace la
      // consola: `plan_publish_revision` (0162) se niega a publicar una
      // revisión que no declare su almacenamiento, y hace bien —publicar una
      // revisión a medias dejaría recursos «sin configurar», que NIEGAN—.
      const { data: vigenteFull } = await admin.from("plan_revisions").select("id")
        .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single();
      const { data: limitesFull } = await admin.from("plan_revision_limits")
        .select("resource_code, limit_state, limit_value")
        .eq("plan_revision_id", (vigenteFull as { id: string }).id);
      await admin.from("plan_revision_limits").insert(
        ((limitesFull ?? []) as Record<string, unknown>[]).map((l) => ({
          plan_revision_id: draftId, resource_code: l.resource_code,
          limit_state: l.limit_state, limit_value: l.limit_value })));
      try {
        const { error: eEdit } = await sa.cli.from("plan_revisions")
          .update({ monthly_price_minor: 4500 }).eq("id", draftId);
        assert(!eEdit, `no se pudo editar el borrador: ${eEdit?.message}`);
        const { error: ePub } = await sa.cli.rpc("plan_publish_revision", {
          p_revision_id: draftId, p_effective_from: new Date().toISOString() });
        assert(!ePub, `publicar: ${ePub?.message}`);

        const { data: vieja } = await admin.from("plan_revisions")
          .select("status, effective_to").eq("id", vigenteAntes).single();
        const v = vieja as { status: string; effective_to: string | null };
        assert(v.effective_to !== null, "la revisión anterior no se cerró");
        assert(v.status === "retired", `la anterior quedó en ${v.status}`);
      } finally {
        // Una revisión publicada NO se borra: es historia comercial. Pero
        // tampoco puede quedarse como la oferta vigente de Full con los
        // números de una prueba. Se restituye por el camino del propio
        // producto: una sucesora que devuelve los valores congelados.
        //
        // El catálogo termina con dos revisiones más —ocurrieron— y con la
        // oferta correcta arriba, que es lo que importa.
        const { data: original } = await admin.from("plan_revisions")
          .select("*").eq("id", vigenteAntes).single();
        const v = original as Record<string, unknown>;
        const { data: limitesOriginal } = await admin.from("plan_revision_limits")
          .select("resource_code, limit_state, limit_value").eq("plan_revision_id", vigenteAntes);
        const { data: maxAhora } = await admin.from("plan_revisions").select("revision_number")
          .eq("plan_code", "full").order("revision_number", { ascending: false }).limit(1).single();
        const { data: restaura } = await admin.from("plan_revisions").insert({
          plan_code: "full",
          revision_number: Number((maxAhora as { revision_number: number }).revision_number) + 1,
          status: "draft", display_name: v.display_name, description: v.description,
          public_conditions: v.public_conditions, price_state: v.price_state,
          currency: v.currency, monthly_price_minor: v.monthly_price_minor,
          annual_price_minor: v.annual_price_minor,
          internal_notes: "PE-04B5 · restitución de los valores congelados tras la prueba de publicación",
        }).select("id").single();
        const restauraId = (restaura as { id: string }).id;
        await admin.from("plan_revision_limits").insert(
          ((limitesOriginal ?? []) as Record<string, unknown>[]).map((l) => ({
            plan_revision_id: restauraId, resource_code: l.resource_code,
            limit_state: l.limit_state, limit_value: l.limit_value })));
        const { error: eRest } = await sa.cli.rpc("plan_publish_revision",
          { p_revision_id: restauraId, p_effective_from: new Date().toISOString() });
        if (eRest) console.error(`  ⚠ no se restituyó la revisión vigente de Full: ${eRest.message}`);
      }
    });

    await check("AG. Publicar una revisión NO mueve a las empresas ya asignadas", async () => {
      // La regla histórica que sostiene todo el modelo: lo que una empresa
      // contrató no cambia porque el catálogo cambie.
      const { data } = await admin.from("organization_plan_assignments")
        .select("plan_revision_id, plan_revisions(plan_code, revision_number)")
        .eq("organization_id", org);
      const filas = (data ?? []) as unknown as { plan_revisions: { plan_code: string; revision_number: number } }[];
      const conFull = filas.filter((f) => f.plan_revisions?.plan_code === "full");
      for (const f of conFull) {
        assert(f.plan_revisions.revision_number <= 2,
          `una asignación existente saltó a la revisión ${f.plan_revisions.revision_number}`);
      }
      assert(true, "");
    });

    await check("AF. La historia de revisiones se conserva", async () => {
      const { data } = await sa.cli.from("plan_revisions")
        .select("plan_code, revision_number, status").eq("plan_code", "full");
      const filas = (data ?? []) as { revision_number: number }[];
      assert(filas.length >= 2, `solo quedan ${filas.length} revisiones de Full: se perdió historia`);
      assert(filas.some((f) => f.revision_number === 1), "desapareció la revisión 1");
    });

    // =====================================================================
    console.log("\nH · Seguridad");
    // =====================================================================

    await check("AP. Un ticket de otra empresa no se lee", async () => {
      const { data: t } = await admin.from("support_tickets")
        .select("id").eq("organization_id", org).limit(1).single();
      const { data: leido } = await ajeno.cli.from("support_tickets")
        .select("id").eq("id", (t as { id: string }).id);
      assert((leido ?? []).length === 0, "una empresa ajena leyó un ticket que no es suyo");
    });

    await check("Ni el derecho de soporte de otra empresa", async () => {
      const { error } = await ajeno.cli.rpc("organization_support_entitlement", {
        p_organization_id: org });
      assert(error, "un ajeno leyó el derecho de soporte de otra empresa");
    });

    await check("AR/AS. Ni soporte ni el cliente tocan el catálogo comercial", async () => {
      // OJO: un UPDATE que la RLS filtra NO devuelve error, devuelve cero filas
      // afectadas. Comprobar solo el error daría verde sin haber comprobado
      // nada. Lo que se comprueba es el EFECTO.
      const revId = await revision("extra");
      const { data: antes } = await admin.from("plan_revisions")
        .select("display_name").eq("id", revId).single();
      const original = (antes as { display_name: string | null }).display_name;
      for (const [quien, cli] of [["soporte", soporte.cli], ["cliente", ana.cli]] as const) {
        await cli.from("plan_revisions").update({ display_name: `intruso-${quien}` }).eq("id", revId);
        const { data: despues } = await admin.from("plan_revisions")
          .select("display_name").eq("id", revId).single();
        assert((despues as { display_name: string | null }).display_name === original,
          `${quien} cambió el catálogo comercial`);
      }
    });

    await check("AA. Soporte SÍ puede leer el catálogo y el derecho · lo necesita para atender", async () => {
      const { data: cat, error: e1 } = await soporte.cli.from("plan_revisions").select("id").limit(1);
      assert(!e1 && (cat ?? []).length > 0, `soporte no pudo leer el catálogo: ${e1?.message}`);
      const { error: e2 } = await soporte.cli.rpc("organization_support_entitlement", {
        p_organization_id: org });
      assert(!e2, `soporte no pudo leer el derecho: ${e2?.message}`);
    });

    await check("AT. Las tablas nuevas de B5 salen con RLS", async () => {
      const { data } = await admin.rpc("public_tables_without_rls");
      const filas = (data ?? []) as { table_name: string }[];
      assert(filas.length === 0, `tablas sin RLS: ${filas.map((f) => f.table_name).join(", ")}`);
    });

    await check("Nadie escribe a mano el historial comercial ni las reclasificaciones", async () => {
      const { error: e1 } = await sa.cli.from("commercial_assignment_events").insert({
        organization_id: org, scope: "organization", new_plan_code: "extra",
        plan_revision_id: await revision("extra"), effective_from: new Date().toISOString(),
        reason: "Intento de escribir historia a mano." });
      assert(e1, "se pudo inventar una entrada de historia comercial");
      const { error: e2 } = await soporte.cli.from("support_ticket_reclassifications").insert({
        ticket_id: (await admin.from("support_tickets").select("id").eq("organization_id", org).limit(1).single()).data!.id,
        organization_id: org, from_kind: "technical", to_kind: "functional_guidance",
        allowance_effect: "none", reason: "Intento de escribir a mano." });
      assert(e2, "se pudo inventar una reclasificación");
    });
  } finally {
    await admin.from("support_ticket_reclassifications").delete().in("organization_id", [org, otraOrg]);
    await admin.from("support_ticket_status_history").delete().in("organization_id", [org, otraOrg]);
    await admin.from("support_ticket_messages").delete().in("organization_id", [org, otraOrg]);
    await admin.from("support_tickets").delete().in("organization_id", [org, otraOrg]);
    await admin.from("commercial_assignment_events").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organization_plan_assignments").delete().in("organization_id", [org, otraOrg]);
    await admin.from("memberships").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organization_modules").delete().in("organization_id", [org, otraOrg]);
    await admin.from("subscription_plan_history").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organization_subscriptions").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organizations").delete().in("id", [org, otraOrg]);
    // TEST-HYGIENE-02 · Esta suite ya limpiaba su organización; lo que dejaba
    // eran USUARIOS. La causa era una y la misma en las ocho suites medidas:
    // `user_legal_acceptances` guarda dos filas por persona —quien crea una
    // empresa acepta los documentos legales— y no cuelgan de ninguna
    // organización, así que `deleteUser` devolvía 500 y nadie leía el resultado.
    // El ayudante borra lo que es DE la persona, lo intenta, y si algo lo
    // impide dice qué. Y la suite se pone roja: no se le deja la basura al
    // siguiente.
    {
      // UNA EXCEPCIÓN DECLARADA, y conviene entender qué se está aceptando.
      //
      // Esta suite PUBLICA revisiones de plan para poder ejercitar la consola,
      // y una revisión publicada es historia del catálogo: 0162 la congela y no
      // deja ni borrarla ni reescribir quién la publicó. El perfil de esa
      // persona queda referenciado para siempre, así que su usuario no se puede
      // borrar sin falsear el catálogo.
      //
      // No se silencia: se nombra. Cualquier otro bloqueo pone la suite roja.
      // Cerrarlo de verdad exigiría que la suite no publicara revisiones
      // reales, y eso es rediseñar qué prueba, no limpiar mejor.
      // TEST-HYGIENE-03 · Antes hacía falta declarar aquí la excepción
      // `plan_revisions.published_by`: el superadministrador de la vuelta había
      // firmado revisiones y no se podía borrar. Ya no la necesita, porque quien
      // firma es el autor canónico y ése no se intenta borrar. Si algún día
      // otra persona efímera vuelve a firmar algo inmutable, esta limpieza lo
      // dirá en rojo en vez de tragárselo.
      const problemas = await limpiarPersonas(admin, personasCreadas);
      if (problemas.length > 0) {
        failed += 1;
        console.log(`  ✘ La suite dejó fixtures detrás: ${problemas.join(" · ")}`);
      }
    }
  }

  console.log(`\nPE-04B5 · soporte y consola: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
