/**
 * Trazaloop · QUALITY-12.2F · Los límites contra base real.
 *
 * Aquí se prueba lo que no se puede probar leyendo el código: que el guardián
 * cuenta bien, que se puede saltar o no bajo concurrencia, que una empresa no
 * ve el consumo de otra y que un fallo del proveedor no se cobra como si
 * hubiera funcionado.
 *
 * Con el doble determinístico. Ninguna llamada al proveedor real.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
process.env.QUALITY_AI_PROVIDER = "fake";
process.env.QUALITY_AI_MODEL = "doble-determinista-1";
process.env.QUALITY_AI_API_KEY = "clave-de-prueba-que-no-sale-de-aqui-jamas";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality122f-rls.");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string) {
  const email = `q122f-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, client: client as unknown as SupabaseClient };
}

const MODULOS = { cpr: "traceability_6632", textiles: "textiles", quality: "quality" } as const;

async function main() {
  console.log("\nQUALITY-12.2F · límites y consumo contra base real\n");

  const jefa = await newUser("adm");
  const ajena = await newUser("out");
  for (const u of [jefa, ajena]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122f" });
  }
  const { data: a } = await jefa.client.rpc("create_organization", { p_name: `Q122F A ${stamp}` });
  const { data: b } = await ajena.client.rpc("create_organization", { p_name: `Q122F B ${stamp}` });
  const A = a as string, B = b as string;
  const J = jefa.client, O = ajena.client;

  const plan = async (org: string, modulo: string, modo: string) => {
    await admin.from("organization_modules").update({
      enabled: true, access_mode: modo,
      access_expires_at: modo === "demo" ? new Date(Date.now() + 86_400_000).toISOString() : null,
    }).eq("organization_id", org).eq("module_code", modulo);
  };
  for (const m of Object.values(MODULOS)) { await plan(A, m, "full"); await plan(B, m, "full"); }

  /** Un documento con su sección, para poder abrir operaciones de verdad. */
  let seq = 0;
  async function nuevoDocumento(org: string) {
    const { data: doc, error } = await admin.from("trazadoc_documents").insert({
      organization_id: org, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Doc ${org.slice(0, 6)} ${stamp} #${(seq += 1)}`,
      code: `F-${seq}-${stamp}`.slice(0, 24), revision_model: "controlled",
    }).select("id").single();
    if (error) throw new Error(`documento: ${error.message}`);
    await admin.from("trazadoc_document_sections").insert({
      organization_id: org, document_id: doc!.id, section_key: "responsibilities",
      title: "Responsabilidades", content: "Pendiente.", sort_order: 1, is_required: true,
    });
    return doc!.id as string;
  }

  const DOC_A = await nuevoDocumento(A);
  const DOC_B = await nuevoDocumento(B);

  /** Abre una operación por la puerta real, como lo haría la aplicación. */
  const abrir = async (cliente: SupabaseClient, org: string, doc: string) =>
    cliente.rpc("document_authoring_start_run", {
      p_organization_id: org, p_document_id: doc, p_module_key: "quality",
      p_section_key: "responsibilities", p_action: "improve_writing",
      p_provider: "fake", p_model: "doble-determinista-1",
      p_prompt_template: "document.quick_edit.improve_writing", p_prompt_version: 1,
      p_guidance_revision_id: null, p_daily_limit: 10000,
    });

  const limites = async (org: string, patch: Record<string, unknown>) => {
    await admin.from("intelligence_usage_limits")
      .upsert({ organization_id: org, ...patch }, { onConflict: "organization_id" });
  };

  const cerrarTodos = async (org: string) => {
    await admin.from("quality_ai_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("organization_id", org).eq("status", "running");
  };

  // =========================================================================
  console.log("A · LA VERDAD DEL PROVEEDOR");
  // =========================================================================

  await check("A1. sin llamada al proveedor, el consumo es cero", async () => {
    const { data } = await admin.from("v_intelligence_usage_runs")
      .select("provider_called, total_tokens, estimated_cost_usd")
      .eq("provider_called", false).limit(20);
    for (const r of data ?? []) {
      assert(Number(r.estimated_cost_usd) === 0,
        `una operación sin llamada costó ${r.estimated_cost_usd}`);
    }
  });

  await check("A2. el coste sale de la tarifa, no de una constante", async () => {
    const { data } = await admin.rpc("intelligence_run_cost_usd", {
      p_provider: "openai", p_model: "gpt-5.4-mini",
      p_at: new Date().toISOString(),
      p_input: 1000000, p_cached: 0, p_output: 0, p_reasoning: 0,
    });
    assert(Number(data) === 0.25, `un millón de entrada costó ${data}`);
  });

  await check("A3. un modelo sin tarifa devuelve nulo, no cero", async () => {
    const { data } = await admin.rpc("intelligence_run_cost_usd", {
      p_provider: "inventado", p_model: "modelo-x", p_at: new Date().toISOString(),
      p_input: 1000, p_cached: 0, p_output: 100, p_reasoning: 0,
    });
    assert(data === null, `devolvió ${data} en vez de nulo`);
  });

  await check("A4. la fórmula de SQL y la de TypeScript dan lo mismo", async () => {
    const { costMicros, toUsd } = await import("../../lib/domain/intelligence-cost");
    const casos = [[1073, 0, 618, 313], [727, 200, 171, 80], [0, 0, 0, 0], [5000, 5000, 900, 0]];
    for (const [i, c, o, r] of casos) {
      const { data } = await admin.rpc("intelligence_run_cost_usd", {
        p_provider: "openai", p_model: "gpt-5.4-mini", p_at: new Date().toISOString(),
        p_input: i, p_cached: c, p_output: o, p_reasoning: r,
      });
      const ts = toUsd(costMicros({
        inputTokens: i, cachedInputTokens: c, outputTokens: o, reasoningTokens: r,
      }, {
        provider: "openai", model: "gpt-5.4-mini", inputPerMillion: 0.25,
        cachedInputPerMillion: 0.025, outputPerMillion: 2.0,
        reasoningBilling: "within_output",
      }));
      assert(Math.abs(Number(data) - ts) < 1e-6,
        `[${i},${c},${o},${r}] SQL=${data} TS=${ts}`);
    }
  });

  // =========================================================================
  console.log("\nB · LOS LÍMITES");
  // =========================================================================

  await check("B1. por defecto no molestan a nadie", async () => {
    const { data } = await admin.rpc("intelligence_effective_limits", { p_organization_id: A });
    const l = (data as Record<string, unknown>[])[0];
    assert(Number(l.runs_per_month) === 10000, `techo mensual ${l.runs_per_month}`);
    assert(Number(l.runs_per_minute) === 60, `por minuto ${l.runs_per_minute}`);
    assert(Number(l.runs_per_hour) === 600, `por hora ${l.runs_per_hour}`);
    assert(Number(l.max_concurrent) === 8, `simultáneas ${l.max_concurrent}`);
  });

  await check("B2. el tope por minuto para el bucle accidental", async () => {
    await limites(A, { runs_per_minute: 3, runs_per_hour: 1000, runs_per_month: 1000 });
    await cerrarTodos(A);
    let bloqueado = 0, abierto = 0;
    for (let i = 0; i < 6; i += 1) {
      const { data } = await abrir(J, A, DOC_A);
      const p = data as { allowed: boolean; reason?: string };
      if (p.allowed) { abierto += 1; await cerrarTodos(A); }
      else { bloqueado += 1; assert(p.reason === "rate_limited_minute", `motivo ${p.reason}`); }
    }
    assert(abierto === 3 && bloqueado === 3,
      `abrió ${abierto} y bloqueó ${bloqueado}, se esperaba 3 y 3`);
  });

  await check("B3. el tope mensual, y dice cuánto llevas", async () => {
    const { count } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    await limites(A, { runs_per_minute: 1000, runs_per_hour: 1000, runs_per_month: count ?? 1 });
    await cerrarTodos(A);
    const { data } = await abrir(J, A, DOC_A);
    const p = data as { allowed: boolean; reason?: string; used?: number; limit?: number };
    assert(!p.allowed && p.reason === "monthly_cap", `motivo ${p.reason}`);
    assert(Number(p.used) >= Number(p.limit), `used=${p.used} limit=${p.limit}`);
  });

  await check("B4. el tope duro se puede desactivar, y entonces solo avisa", async () => {
    await limites(A, { hard_limit_enabled: false });
    await cerrarTodos(A);
    const { data } = await abrir(J, A, DOC_A);
    const p = data as { allowed: boolean; usage?: Record<string, unknown> };
    assert(p.allowed, "con el tope duro desactivado siguió bloqueando");
    assert(Number(p.usage?.percent) >= 100, "no informa de que está por encima del 100 %");
    await limites(A, { hard_limit_enabled: true, runs_per_month: 10000 });
  });

  await check("B5. las operaciones simultáneas tienen tope", async () => {
    await limites(A, { runs_per_minute: 1000, runs_per_hour: 1000, runs_per_month: 10000,
                       max_concurrent: 2 });
    await cerrarTodos(A);
    // Se abren dos y NO se cierran: quedan en vuelo.
    for (let i = 0; i < 2; i += 1) {
      const { data } = await abrir(J, A, DOC_A);
      assert((data as { allowed: boolean }).allowed, `la ${i + 1}.ª debería abrir`);
    }
    const { data } = await abrir(J, A, DOC_A);
    const p = data as { allowed: boolean; reason?: string };
    assert(!p.allowed && p.reason === "too_many_concurrent", `motivo ${p.reason}`);
    await cerrarTodos(A);
  });

  await check("B6. una operación colgada NO bloquea a la empresa para siempre", async () => {
    // Si un proceso muere sin cerrar su run, su fila se queda en `running`.
    // Sin ventana de caducidad, esa empresa quedaría bloqueada hasta que
    // alguien lo mirara a mano.
    await cerrarTodos(A);
    const { data: colgado } = await admin.from("quality_ai_runs").insert({
      organization_id: A, actor_id: jefa.id, use_case: "document.quick_edit",
      provider: "fake", model: "x", prompt_template: "t", prompt_version: 1,
      status: "running",
      started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }).select("id").single();
    await limites(A, { max_concurrent: 1 });
    const { data } = await abrir(J, A, DOC_A);
    assert((data as { allowed: boolean }).allowed,
      "un run colgado de hace una hora sigue contando como en vuelo");
    await admin.from("quality_ai_runs").delete().eq("id", colgado!.id);
    await cerrarTodos(A);
    await limites(A, { max_concurrent: 3 });
  });

  // =========================================================================
  console.log("\nC · ATOMICIDAD");
  // =========================================================================

  await check("C1. cincuenta peticiones a la vez NO se saltan el límite", async () => {
    // Es la prueba que justifica el bloqueo de aviso. Sin él, las cincuenta
    // leen el mismo recuento antes de que ninguna escriba.
    await cerrarTodos(A);
    // La ventana de un minuto arrastra los runs de las pruebas anteriores. Se
    // envejecen para que la comprobación mida lo que dice medir y no el
    // desorden que dejó lo de antes.
    await admin.from("quality_ai_runs")
      .update({ started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() })
      .eq("organization_id", A);
    await limites(A, { runs_per_minute: 5, runs_per_hour: 1000, runs_per_month: 10000,
                       max_concurrent: 50 });
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () => abrir(J, A, DOC_A)));
    const permitidas = resultados.filter(
      (r) => (r.data as { allowed: boolean } | null)?.allowed).length;
    assert(permitidas === 5,
      `se abrieron ${permitidas} operaciones con un límite de 5`);
    await cerrarTodos(A);
    await limites(A, { runs_per_minute: 1000 });
  });

  // =========================================================================
  console.log("\nD · EL DERECHO MANDA SOBRE EL PRESUPUESTO");
  // =========================================================================

  await check("D1. Demo no revisa aunque le sobre presupuesto", async () => {
    await limites(A, { runs_per_minute: 1000, runs_per_hour: 1000, runs_per_month: 99999 });
    await plan(A, MODULOS.quality, "demo");
    try {
      await cerrarTodos(A);
      const { data } = await abrir(J, A, DOC_A);
      const p = data as { allowed: boolean; reason?: string };
      assert(!p.allowed && p.reason === "demo",
        `Demo con presupuesto de sobra devolvió ${p.reason}`);
    } finally { await plan(A, MODULOS.quality, "full"); }
  });

  await check("D2. Full y Extra reciben exactamente los mismos límites", async () => {
    const leer = async () => {
      const { data } = await admin.rpc("intelligence_effective_limits", { p_organization_id: A });
      const l = (data as Record<string, unknown>[])[0];
      return JSON.stringify([l.runs_per_minute, l.runs_per_hour, l.runs_per_month,
                             l.max_concurrent]);
    };
    await plan(A, MODULOS.quality, "full");
    const conFull = await leer();
    await plan(A, MODULOS.quality, "extra");
    const conExtra = await leer();
    assert(conFull === conExtra, `Full ${conFull} · Extra ${conExtra}`);
    // Y funcionalmente igual.
    await cerrarTodos(A);
    const { data } = await abrir(J, A, DOC_A);
    assert((data as { allowed: boolean }).allowed, "Extra no pudo operar");
    await plan(A, MODULOS.quality, "full");
    await cerrarTodos(A);
  });

  // =========================================================================
  console.log("\nE · EXCEPCIONES");
  // =========================================================================

  await check("E1. una excepción amplía el techo sin tocar el plan", async () => {
    await limites(A, { runs_per_month: 1 });
    await admin.from("intelligence_limit_overrides").insert({
      organization_id: A, runs_per_month: 9999,
      reason: "Prueba automatizada de QUALITY-12.2F, ampliación temporal",
      created_by: jefa.id,
    });
    const { data } = await admin.rpc("intelligence_effective_limits", { p_organization_id: A });
    const l = (data as Record<string, unknown>[])[0];
    assert(Number(l.runs_per_month) === 9999, `techo efectivo ${l.runs_per_month}`);
    assert(l.override_id !== null, "no consta que haya una excepción activa");
  });

  await check("E2. una excepción caducada deja de aplicar", async () => {
    // Se revoca la vigente y se crea otra que YA nació caducada. No se «caduca
    // hacia atrás» una vigente: el CHECK lo impide, y con razón.
    await admin.from("intelligence_limit_overrides")
      .update({ revoked_at: new Date().toISOString(), revoked_by: jefa.id })
      .eq("organization_id", A);
    const { error } = await admin.from("intelligence_limit_overrides").insert({
      organization_id: A, runs_per_month: 9999,
      reason: "Excepción ya vencida, para comprobar que no aplica",
      effective_from: new Date(Date.now() - 2 * 86400000).toISOString(),
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      created_by: jefa.id,
    });
    assert(!error, `no se pudo crear la excepción vencida: ${error?.message}`);
    const { data } = await admin.rpc("intelligence_effective_limits", { p_organization_id: A });
    const l = (data as Record<string, unknown>[])[0];
    assert(Number(l.runs_per_month) === 1, `siguió aplicando: ${l.runs_per_month}`);
    assert(l.override_id === null, "una excepción vencida sigue constando como activa");
    await limites(A, { runs_per_month: 10000 });
  });

  await check("E3. un administrador de empresa NO puede subirse el techo", async () => {
    // Lo que importa no es qué valor tiene, sino que el intento no lo mueva.
    const { data: antes } = await admin.from("intelligence_usage_limits")
      .select("runs_per_month").eq("organization_id", A).single();
    await J.from("intelligence_usage_limits")
      .update({ runs_per_month: 999999 }).eq("organization_id", A);
    const { data: despues } = await admin.from("intelligence_usage_limits")
      .select("runs_per_month").eq("organization_id", A).single();
    assert(Number(antes!.runs_per_month) === Number(despues!.runs_per_month),
      `el techo pasó de ${antes!.runs_per_month} a ${despues!.runs_per_month}`);
  });

  await check("E4. pero SÍ puede verlo", async () => {
    const { data } = await J.from("intelligence_usage_limits")
      .select("runs_per_month").eq("organization_id", A).maybeSingle();
    assert(data !== null, "una empresa no puede ver sus propios límites");
  });

  await check("E5. y no puede crearse una excepción", async () => {
    const { error } = await J.from("intelligence_limit_overrides").insert({
      organization_id: A, runs_per_month: 999999, reason: "me lo subo yo mismo por aquí",
    });
    assert(error !== null, "un administrador de empresa se creó una excepción");
  });

  // =========================================================================
  console.log("\nF · AISLAMIENTO");
  // =========================================================================

  await check("F1. una empresa no ve el consumo de otra", async () => {
    await cerrarTodos(B);
    await abrir(O, B, DOC_B);
    const { data } = await J.from("v_intelligence_usage_by_use_case")
      .select("organization_id").eq("organization_id", B);
    assert((data ?? []).length === 0, "se filtró el consumo de otra empresa");
  });

  await check("F2. ni su estado de uso, ni con el id exacto", async () => {
    const { error } = await J.rpc("intelligence_usage_status", { p_organization_id: B });
    assert(error !== null, "se leyó el estado de consumo de otra empresa");
  });

  await check("F3. la vista de plataforma no la ve una empresa", async () => {
    const { data } = await J.from("v_intelligence_usage_platform").select("organization_id");
    assert((data ?? []).length === 0,
      `una empresa vio ${(data ?? []).length} filas de la consola de plataforma`);
  });

  await check("F4. ni la tarifa: no es asunto suyo", async () => {
    const { data } = await J.from("intelligence_model_pricing").select("provider");
    assert((data ?? []).length === 0, "una empresa puede leer nuestros costes");
  });

  await check("F5. su propio estado sí lo ve, y sin dinero dentro", async () => {
    const { data, error } = await J.rpc("intelligence_usage_status", { p_organization_id: A });
    assert(!error && data, `no pudo leer su estado: ${error?.message}`);
    const j = JSON.stringify(data);
    assert(!/usd|cost|price/i.test(j), `el estado incluye dinero: ${j.slice(0, 120)}`);
    assert(/runs_this_month/.test(j), "el estado no dice cuántas operaciones lleva");
  });

  // =========================================================================
  console.log("\nG · FALLOS Y REINTENTOS");
  // =========================================================================

  await check("G1. un fallo del proveedor no se cobra como una llamada buena", async () => {
    await cerrarTodos(A);
    const { data } = await abrir(J, A, DOC_A);
    const runId = (data as { run_id: string }).run_id;
    await admin.rpc("quality_ai_fail_run", {
      p_run_id: runId, p_status: "failed", p_error: "prueba",
    });
    const { data: fila } = await admin.from("v_intelligence_usage_runs")
      .select("estimated_cost_usd, total_tokens, provider_called").eq("run_id", runId).single();
    assert(Number(fila!.estimated_cost_usd) === 0,
      `un fallo costó ${fila!.estimated_cost_usd}`);
    assert(fila!.provider_called === false,
      "un fallo por tiempo de espera consta como llamada al proveedor");
  });

  await check("G2. pero SÍ cuenta como intento, sin esconderlo", async () => {
    const { data } = await admin.from("v_intelligence_usage_by_use_case")
      .select("runs, failed").eq("organization_id", A).eq("use_case", "document.quick_edit");
    const total = (data ?? []).reduce((a, r) => a + Number(r.failed ?? 0), 0);
    assert(total >= 1, "el fallo no aparece en el desglose");
  });

  await check("G3. un reintento humano es una operación nueva, no gratis", async () => {
    await cerrarTodos(A);
    const antes = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    await abrir(J, A, DOC_A);
    await cerrarTodos(A);
    await abrir(J, A, DOC_A);
    const despues = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    assert((despues.count ?? 0) === (antes.count ?? 0) + 2,
      "dos intentos no contaron como dos operaciones");
    await cerrarTodos(A);
  });

  // =========================================================================
  console.log("\nH · AVISOS");
  // =========================================================================

  await check("H1. cruzar el umbral blando emite un hecho, y no bloquea", async () => {
    await cerrarTodos(A);
    const { count } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    // Techo tal que lo ya consumido supere el 80 % sin llegar al 100 %.
    await limites(A, { runs_per_month: Math.ceil((count ?? 10) / 0.85),
                       runs_per_minute: 1000, soft_limit_percent: 80 });
    const { data } = await abrir(J, A, DOC_A);
    const p = data as { allowed: boolean; usage?: Record<string, unknown> };
    assert(p.allowed, "el umbral blando bloqueó");
    assert(p.usage?.soft_limit_reached === true,
      `el guardián no vio el umbral: ${JSON.stringify(p.usage)}`);
    const { data: ev } = await admin.from("work_events")
      .select("event_type, severity, payload")
      .eq("organization_id", A).eq("source_domain", "ai");
    assert((ev ?? []).some((e) => e.event_type === "ai.usage_threshold_reached"),
      `no se emitió el aviso: ${JSON.stringify(ev)}`);
    await cerrarTodos(A);
  });

  await check("H2. y no se repite por cada operación del mismo mes", async () => {
    for (let i = 0; i < 3; i += 1) { await abrir(J, A, DOC_A); await cerrarTodos(A); }
    const { data } = await admin.from("work_events")
      .select("id").eq("organization_id", A).eq("source_domain", "ai")
      .eq("event_type", "ai.usage_threshold_reached");
    assert((data ?? []).length === 1,
      `${(data ?? []).length} avisos idénticos: la deduplicación no funciona`);
    await limites(A, { runs_per_month: 10000 });
  });

  await check("H3. el aviso no lleva el texto de nadie", async () => {
    const { data } = await admin.from("work_events")
      .select("summary, payload").eq("organization_id", A).eq("source_domain", "ai");
    for (const e of data ?? []) {
      const j = JSON.stringify(e);
      assert(!/question|answer|user_text/i.test(j), `el aviso lleva contenido: ${j.slice(0, 100)}`);
    }
  });

  // =========================================================================
  console.log("\nI · RECONSTRUIBLE");
  // =========================================================================

  await check("I1. los agregados se pueden reconstruir desde los runs", async () => {
    // No hay contadores que mantener: las vistas se recalculan. Esto lo
    // comprueba sumando a mano y comparando.
    const { data: runs } = await admin.from("quality_ai_runs")
      .select("use_case, input_tokens, output_tokens").eq("organization_id", A);
    const aMano = new Map<string, { n: number; inp: number; out: number }>();
    for (const r of runs ?? []) {
      const k = String(r.use_case);
      const p = aMano.get(k) ?? { n: 0, inp: 0, out: 0 };
      aMano.set(k, { n: p.n + 1, inp: p.inp + Number(r.input_tokens ?? 0),
                     out: p.out + Number(r.output_tokens ?? 0) });
    }
    const { data: vista } = await admin.from("v_intelligence_usage_by_use_case")
      .select("use_case, runs, input_tokens, output_tokens").eq("organization_id", A);
    const deVista = new Map<string, { n: number; inp: number; out: number }>();
    for (const v of vista ?? []) {
      const k = String(v.use_case);
      const p = deVista.get(k) ?? { n: 0, inp: 0, out: 0 };
      deVista.set(k, { n: p.n + Number(v.runs), inp: p.inp + Number(v.input_tokens),
                       out: p.out + Number(v.output_tokens) });
    }
    for (const [k, m] of aMano) {
      const v = deVista.get(k);
      assert(v, `la vista no tiene ${k}`);
      assert(v!.n === m.n, `${k}: vista ${v!.n} runs, a mano ${m.n}`);
      assert(v!.inp === m.inp, `${k}: entrada vista ${v!.inp}, a mano ${m.inp}`);
    }
  });

  console.log(`\n${passed} conformes · ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
