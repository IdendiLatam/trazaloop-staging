/**
 * Trazaloop · QUALITY-11 · §156 · Rendimiento del barrido, medido de verdad.
 *
 * No hay un número mágico que aprobar. Lo que se mide es la FORMA de la curva:
 *
 *   · 100 sujetos y 1 000 sujetos, con el mismo juego de reglas;
 *   · una regla y tres reglas, sobre el mismo censo;
 *   · y el segundo barrido idéntico, que no debe crear nada.
 *
 * Lo que se busca es el N+1 evidente: si evaluar diez veces más sujetos costara
 * cien veces más, o si añadir una regla multiplicara el coste de las demás,
 * habría una consulta por sujeto escondida en alguna parte.
 *
 * El proveedor de sujetos materializa CADA fuente en una consulta y el
 * evaluador solo lee el jsonb que trae: el coste esperado es una consulta por
 * regla, no una por sujeto.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality11-perf.");
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
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (o: number) => iso(new Date(Date.now() + o * 86_400_000));

async function newUser(label: string) {
  const email = `q11p-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "Medidora" },
  });
  if (error || !data.user) throw new Error(`usuario: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login: ${e.message}`);
  return { id: data.user.id, client };
}

type Medida = {
  escenario: string; sujetos: number; reglas: number;
  ms: number; motorMs: number; coincidencias: number;
  señales: number; avisos: number; tareas: number;
};
const medidas: Medida[] = [];

async function main() {
  console.log("\nQUALITY-11 · rendimiento\n");

  const u = await newUser("adm");
  await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q11p" });
  const { data: org } = await u.client.rpc("create_organization", { p_name: `Q11 PERF ${stamp}` });
  const A = org as string;
  const Q = u.client;

  const { data: cargo } = await Q.from("quality_positions")
    .insert({ organization_id: A, name: `Gerencia ${stamp}` }).select("id").single();
  const CARGO = cargo!.id as string;
  const { data: persona } = await Q.from("quality_people")
    .insert({ organization_id: A, full_name: `Titular ${stamp}`, profile_id: u.id })
    .select("id").single();
  await Q.from("quality_position_assignments").insert({
    organization_id: A, position_id: CARGO, person_id: persona!.id,
    effective_from: day(-380),
  });
  await Q.from("quality_automation_settings")
    .insert({ organization_id: A, is_enabled: true, business_timezone: "UTC" });

  /** Siembra `n` quejas vencidas: es el sujeto más barato de crear en volumen. */
  async function sembrar(n: number, desde: number) {
    const filas = Array.from({ length: n }, (_, i) => ({
      organization_id: A, feedback_kind: "complaint",
      title: `Queja ${desde + i} · ${stamp}`, received_on: day(-60),
      status: "open", owner_position_id: CARGO,
    }));
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await Q.from("quality_customer_feedback").insert(filas.slice(i, i + 200));
      assert(!error, `sembrar quejas: ${error?.message}`);
    }
  }

  async function nuevaRegla(sufijo: string, salidas: unknown[]) {
    const { data: regla, error: er } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `PERF-${sufijo}-${stamp}`.slice(0, 24),
      name: `Queja sin atender ${sufijo}`, category: "customer",
      source_code: "customer_feedback", owner_position_id: CARGO, status: "active",
    }).select("id").single();
    assert(!er && regla, `regla: ${er?.message}`);
    const { data: v } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      conditions: [{ field: "feedback_kind", operator: "equals", value: "complaint" },
                   { field: "status", operator: "in", value: ["open", "under_review"] },
                   { field: "received_on", operator: "days_after", value: 30 }],
      outputs: salidas, signal_title: `Queja sin atender ${sufijo}`,
    }).select("id").single();
    const { error } = await Q.rpc("quality_automation_publish_version", {
      p_version_id: v!.id, p_effective_from: day(-380), p_change_note: "Inicial",
    });
    assert(!error, `publicar: ${error?.message}`);
    return regla!.id as string;
  }

  async function medir(escenario: string, sujetos: number, reglas: number) {
    const t0 = Date.now();
    const { data: runId, error } = await Q.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    const ms = Date.now() - t0;
    assert(!error && runId, `barrido: ${error?.message}`);
    const { data: r } = await Q.from("quality_automation_runs")
      .select("matches, signals_created, alerts_created, tasks_created, failures, "
        + "started_at, finished_at, subjects_evaluated")
      .eq("id", runId as string).single<{
        matches: number; signals_created: number; alerts_created: number;
        tasks_created: number; failures: number; started_at: string;
        finished_at: string; subjects_evaluated: number;
      }>();
    const motorMs = new Date(r!.finished_at as string).getTime()
      - new Date(r!.started_at as string).getTime();
    const m: Medida = {
      escenario, sujetos: Number(r!.subjects_evaluated), reglas,
      ms, motorMs, coincidencias: Number(r!.matches),
      señales: Number(r!.signals_created), avisos: Number(r!.alerts_created),
      tareas: Number(r!.tasks_created),
    };
    medidas.push(m);
    assert(Number(r!.failures) === 0, `el barrido falló ${r!.failures} veces`);
    return m;
  }

    // La regla NO emite aviso a propósito: `quality_scan_customer_voice` —el
  // barrido heredado que corre dentro del mismo motor— ya avisa de las quejas
  // vencidas, y medir con las dos encendidas mezclaría dos cosas distintas
  // (§128). Aquí se miden señales y tareas, que son solo de esta regla.
  // La regla NO emite aviso a propósito: `quality_scan_customer_voice` —el
  // barrido heredado que corre dentro del mismo motor— ya avisa de las quejas
  // vencidas, y medir con las dos encendidas mezclaría dos cosas distintas
  // (§128). Aquí se miden señales y tareas, que son solo de esta regla.
  const SALIDAS = [
    { kind: "CREATE_SIGNAL" },
    { kind: "CREATE_TASK", recipient_kind: "rule_owner_position", due_in_days: 7 },
  ];

  let cien: Medida, mil: Medida, milTres: Medida;

  await check("A1. 100 sujetos · 1 regla · tres salidas", async () => {
    await sembrar(100, 0);
    await nuevaRegla("R1", SALIDAS);
    cien = await medir("100 sujetos · 1 regla", 100, 1);
    assert(cien.coincidencias === 100, `coincidencias: ${cien.coincidencias}`);
    assert(cien.señales === 100, `señales: ${cien.señales}`);
    assert(cien.tareas === 100, `tareas: ${cien.tareas}`);
  });

  await check("A2. el segundo barrido sobre los mismos 100 no crea NADA", async () => {
    const repetido = await medir("100 sujetos · repetido", 100, 1);
    assert(repetido.señales === 0 && repetido.tareas === 0,
      `el barrido repetido creó ${repetido.señales} señales y ${repetido.tareas} tareas`);
    // Los avisos del barrido heredado sí pueden aparecer en la PRIMERA pasada
    // —es su trabajo—, pero no deben repetirse en la segunda.
    const tercero = await medir("100 sujetos · tercero", 100, 1);
    assert(tercero.avisos === 0,
      `el tercer barrido consecutivo creó ${tercero.avisos} avisos: hay un duplicado`);
  });

  await check("B1. 1 000 sujetos · 1 regla · tres salidas", async () => {
    await sembrar(900, 100);
    mil = await medir("1000 sujetos · 1 regla", 1000, 1);
    assert(mil.sujetos === 1000, `el barrido vio ${mil.sujetos} sujetos`);
    assert(mil.señales === 900, `señales nuevas: ${mil.señales}`);
  });

  await check("B2. diez veces más sujetos NO cuesta cien veces más (sin N+1)", async () => {
    // El listón es deliberadamente generoso: lo que se busca es el orden de
    // magnitud, no un número de referencia. Un N+1 real dispara la razón muy
    // por encima de 30.
    const razon = mil.motorMs / Math.max(cien.motorMs, 1);
    console.log(`      · 100 sujetos: ${cien.motorMs} ms · 1000 sujetos: ${mil.motorMs} ms `
      + `· razón ×${razon.toFixed(1)}`);
    assert(razon < 30, `de 100 a 1 000 sujetos el coste se multiplicó por ${razon.toFixed(1)}`);
  });

  await check("C1. tres reglas sobre 1 000 sujetos escalan de forma LINEAL", async () => {
    await nuevaRegla("R2", [{ kind: "CREATE_SIGNAL" }]);
    await nuevaRegla("R3", [{ kind: "CREATE_SIGNAL" }]);
    milTres = await medir("1000 sujetos · 3 reglas", 1000, 3);
    assert(milTres.sujetos === 3000,
      `tres reglas sobre mil sujetos evaluaron ${milTres.sujetos} veces`);
    const razon = milTres.motorMs / Math.max(mil.motorMs, 1);
    console.log(`      · 1 regla: ${mil.motorMs} ms · 3 reglas: ${milTres.motorMs} ms `
      + `· razón ×${razon.toFixed(1)}`);
    assert(razon < 10, `añadir dos reglas multiplicó el coste por ${razon.toFixed(1)}`);
  });

  await check("C2. el barrido acotado no se queda a medias", async () => {
    const { data: r } = await Q.from("quality_automation_runs")
      .select("status").eq("organization_id", A).order("started_at", { ascending: false }).limit(1);
    assert(r![0].status === "success", `el último barrido acabó en «${r![0].status}»`);
  });

  console.log("\n  MEDIDAS");
  console.log("  " + "-".repeat(96));
  console.log("  " + ["escenario".padEnd(28), "sujetos".padStart(8), "reglas".padStart(7),
    "motor ms".padStart(9), "total ms".padStart(9), "coinc.".padStart(7),
    "señales".padStart(8), "avisos".padStart(7), "tareas".padStart(7)].join(" "));
  for (const m of medidas) {
    console.log("  " + [m.escenario.padEnd(28), String(m.sujetos).padStart(8),
      String(m.reglas).padStart(7), String(m.motorMs).padStart(9), String(m.ms).padStart(9),
      String(m.coincidencias).padStart(7), String(m.señales).padStart(8),
      String(m.avisos).padStart(7), String(m.tareas).padStart(7)].join(" "));
  }
  console.log("  " + "-".repeat(96));

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
