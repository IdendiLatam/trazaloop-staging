/**
 * Trazaloop · PE-05B2 · §0 · Comprobación previa a tocar pagos.
 *
 * La verdad comercial congelada dice que una empresa EN PRUEBA dispone de
 * 50 créditos de prueba + los 25 mensuales de Free. NO de los 500 de Full.
 *
 * Esto no se resuelve leyendo el SQL: la bolsa mensual sale del PLAN EFECTIVO,
 * y durante la prueba el plan efectivo es Full por diseño. Lo único que dice
 * qué recibe de verdad el cliente es ejecutarlo contra la base.
 *
 * El guion recorre el camino REAL del producto —crear empresa, habilitar un
 * módulo funcional, que es lo que concede la prueba— y luego gasta créditos
 * como los gastaría una persona. Al terminar retira lo que creó.
 *
 * Correr: npx tsx scripts/pe05b2/preflight-trial-ai.ts
 * Sale 0 si el runtime coincide con la verdad comercial, 1 si no.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";

const FREE_MENSUAL = 25;
const PRUEBA_TOTAL = 50;

type Creditos = {
  state: string; plan_code: string | null;
  monthly_limit: number | null; monthly_used: number; monthly_remaining: number | null;
  trial_active: boolean; trial_total: number | null; trial_remaining: number | null;
};

async function main() {
  let fallos = 0;
  const email = `qa-b2-preflight-${sello}@test.trazaloop.dev`;
  const { data: u, error: eu } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B2 preflight" } });
  if (eu || !u.user) throw new Error(`crear persona: ${eu?.message}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b2-preflight" });

  const { data: orgId, error: eo } = await cli.rpc("create_organization", { p_name: `QA B2PREFLIGHT ${sello}` });
  if (eo) throw new Error(`create_organization: ${eo.message}`);
  const org = orgId as string;

  // Camino real: habilitar un módulo funcional es lo que concede la prueba.
  const { error: ep } = await admin.rpc("commercial_provision_new_module", {
    p_organization_id: org, p_module_code: "quality" });
  if (ep) throw new Error(`provisión: ${ep.message}`);

  const creditos = async (): Promise<Creditos> => {
    const { data, error } = await cli.rpc("ai_credits_status", { p_organization_id: org });
    if (error) throw new Error(`ai_credits_status: ${error.message}`);
    return data as unknown as Creditos;
  };
  const reservar = async (op: string) => {
    const { error } = await cli.rpc("ai_credits_reserve", {
      p_organization_id: org, p_operation_code: op, p_idempotency_key: null });
    return error ? { ok: false as const, code: error.message } : { ok: true as const };
  };

  try {
    const { data: plan } = await cli.rpc("plan_effective_for_organization", { p_organization_id: org });
    console.log(`\nPlan efectivo durante la prueba: ${JSON.stringify(plan)}`);

    // -- 1. Las dos bolsas, tal y como las ve el cliente ---------------------
    const c0 = await creditos();
    console.log(`\n1 · Bolsas al empezar la prueba`);
    console.log(`   prueba:  ${c0.trial_total}   (esperado ${PRUEBA_TOTAL})`);
    console.log(`   mensual: ${c0.monthly_limit}  (esperado ${FREE_MENSUAL})`);
    if (c0.trial_total !== PRUEBA_TOTAL) {
      fallos += 1; console.log(`   ✘ la bolsa de la prueba no es ${PRUEBA_TOTAL}`);
    }
    if (c0.monthly_limit !== FREE_MENSUAL) {
      fallos += 1;
      console.log(`   ✘ REGRESIÓN · la mensual durante la prueba es ${c0.monthly_limit}: la prueba`);
      console.log(`     está entregando la bolsa de Full, que la verdad comercial excluye`);
    }

    // -- 2. Cuánto puede gastar de verdad -----------------------------------
    // «ask» pesa 5. Cincuenta operaciones son 250 créditos: muy por encima de
    // los 75 que la verdad comercial concede a una empresa en prueba.
    let aceptadas = 0, rechazadas = 0;
    for (let i = 0; i < 50; i += 1) {
      if ((await reservar("ask")).ok) aceptadas += 1; else rechazadas += 1;
    }
    const c1 = await creditos();
    const gastado = (c1.trial_total ?? 0) - (c1.trial_remaining ?? 0) + c1.monthly_used;
    console.log(`\n2 · Cincuenta operaciones de peso 5 durante la prueba`);
    console.log(`   aceptadas: ${aceptadas}   rechazadas: ${rechazadas}`);
    console.log(`   consumido: ${gastado} créditos   (el techo comercial son ${PRUEBA_TOTAL + FREE_MENSUAL})`);
    if (gastado > PRUEBA_TOTAL + FREE_MENSUAL) {
      fallos += 1;
      console.log(`   ✘ REGRESIÓN · se dejó gastar ${gastado - PRUEBA_TOTAL - FREE_MENSUAL} créditos de más`);
    }

    // -- 3. Y qué queda cuando la prueba caduca -----------------------------
    // Se cierra la concesión como la cerraría el paso del tiempo. `ends_at` se
    // pone justo después de `starts_at` porque el modelo exige que un periodo
    // termine después de empezar.
    const { data: filas } = await admin.from("organization_plan_assignments")
      .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
    for (const f of (filas ?? []) as { id: string; starts_at: string }[]) {
      const { error } = await admin.from("organization_plan_assignments")
        .update({ ends_at: new Date(new Date(f.starts_at).getTime() + 1).toISOString() })
        .eq("id", f.id);
      if (error) throw new Error(`cerrar la prueba: ${error.message}`);
    }
    const c2 = await creditos();
    const siguiente = await reservar("document.quick_edit");
    console.log(`\n3 · Cerrada la prueba, la empresa vuelve a Free`);
    console.log(`   mensual: ${c2.monthly_used}/${c2.monthly_limit} → ${c2.state}`);
    console.log(`   una operación nueva: ${siguiente.ok ? "permitida" : siguiente.code}`);
    if (c2.state === "OVER_LIMIT") {
      fallos += 1;
      console.log(`   ✘ REGRESIÓN · el mes queda por encima del cupo de un plan que nadie excedió:`);
      console.log(`     lo gastado durante la prueba se cargó al mes en curso contra el tope de Full`);
      console.log(`     y ahora se mide contra el de Free. Intelligence queda muerta hasta que`);
      console.log(`     cambie el mes, sin que el cliente haya hecho nada mal.`);
    }
  } finally {
    // Se retira lo creado: ninguna empresa sintética sobrevive a la prueba.
    // El orden importa: media docena de claves ajenas son `on delete restrict`,
    // y un borrado que falla lo hace DEVOLVIENDO UN ERROR, no lanzándolo. Si no
    // se mira, la empresa sintética sobrevive en silencio.
    for (const tabla of ["ai_credit_ledger", "organization_usage_minutes",
      "organization_usage_leases", "commercial_assignment_events",
      "organization_plan_assignments", "subscription_plan_history",
      "organization_subscriptions", "organization_modules", "memberships"]) {
      const { error } = await admin.from(tabla).delete().eq("organization_id", org);
      if (error) console.log(`(residuo) ${tabla}: ${error.message}`);
    }
    const { error: eb } = await admin.from("organizations").delete().eq("id", org);
    if (eb) console.log(`\n(residuo) la empresa ${org} no se pudo retirar: ${eb.message}`);
    // Y la persona. `deleteUser` cascadea `profiles`, pero la aceptación legal
    // apunta a `profiles` con `restrict`: sin retirarla antes, el borrado falla
    // devolviendo un error que nadie mira y la persona sintética se queda.
    await admin.from("user_legal_acceptances").delete().eq("user_id", u.user.id);
    const { error: eus } = await admin.auth.admin.deleteUser(u.user.id);
    if (eus) console.log(`(residuo) la persona ${u.user.id} no se pudo retirar: ${eus.message}`);
  }

  console.log(fallos === 0
    ? `\nPE-05B2 §0 · el runtime coincide con la verdad comercial.\n`
    : `\nPE-05B2 §0 · ${fallos} discrepancias con la verdad comercial congelada.\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
