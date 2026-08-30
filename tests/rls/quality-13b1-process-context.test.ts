/**
 * Trazaloop · QUALITY-13B1 · El contexto de proceso, contra base REAL.
 *
 * Se monta un proceso con datos en los siete ejes y se le hace la pregunta que
 * hasta hoy no tenía respuesta: **qué está relacionado con este proceso**.
 *
 * Y se comprueban las tres cosas que hacen que la respuesta valga:
 *
 *   · el número de consultas **no crece** con el número de filas;
 *   · una sección que falla dice que falló, y NO devuelve cero;
 *   · lo derivado se deriva de algo cierto, o se devuelve vacío.
 *
 * Correr: npm run test:quality13b1-process-context
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
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const password = "Trazaloop-Test-1234";

async function persona(tag: string) {
  const email = `q13b1-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return cli;
}

/**
 * Un cliente que cuenta consultas.
 *
 * Envuelve `from()` y `rpc()`. Es la única forma honesta de comprobar que la
 * composición no hace N+1: contar consultas, no confiar en que el código
 * «parece» eficiente.
 */
function contador(cli: SupabaseClient) {
  const estado = { n: 0, tablas: [] as string[] };
  const proxy = new Proxy(cli, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (tabla: string) => {
          estado.n += 1; estado.tablas.push(tabla);
          return (target as SupabaseClient).from(tabla);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
  return { proxy, estado };
}

async function main() {
  const CTX = await import("../../lib/db/quality-process-context");
  const POS = await import("../../lib/db/quality-position-context");

  console.log("\nQUALITY-13B1 · Contexto de proceso · base real\n");

  const a = await persona("a");
  const { data: orgAId } = await a.rpc("create_organization", { p_name: `Q13B1 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await persona("b");
  const { data: orgBId } = await b.rpc("create_organization", { p_name: `Q13B1 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  // ---- El proceso con datos en los siete ejes ----------------------------
  const { data: cargo } = await a.from("quality_positions")
    .insert({ organization_id: orgA, name: "QA Q13 · Jefe de operaciones" })
    .select("id").single();
  const { data: proc } = await a.from("quality_processes")
    .insert({ organization_id: orgA, name: "QA Q13 · Despacho", category_code: "core",
              status: "active", owner_position_id: cargo!.id })
    .select("id").single();
  assert(proc, "no se pudo crear el proceso");
  const procId = proc!.id as string;

  const { data: riesgo } = await a.from("quality_risks")
    .insert({ organization_id: orgA, code: `QA13-R-${stamp}`.slice(0, 24),
              title: "QA Q13 · Retraso de despacho",
              event_description: "Los despachos se retrasan y el cliente lo nota.",
              owner_position_id: cargo!.id })
    .select("id").single();
  await a.from("quality_risk_processes")
    .insert({ organization_id: orgA, risk_id: riesgo!.id, process_id: procId });

  const { data: obj } = await a.from("quality_objectives")
    .insert({ organization_id: orgA, name: "QA Q13 · Cumplir el plazo",
              period_start: "2026-01-01", period_end: "2026-12-31",
              owner_position_id: cargo!.id })
    .select("id").single();
  await a.from("quality_objective_processes")
    .insert({ organization_id: orgA, objective_id: obj!.id, process_id: procId });

  // `scope_type` y `scope_process_id` van juntos: un CHECK los ata. Poner el
  // proceso sin declarar el ámbito se rechaza, y con razón.
  const { error: eInd } = await a.from("quality_indicators").insert({
    organization_id: orgA, name: "QA Q13 · Cumplimiento de plazo",
    scope_type: "process", scope_process_id: procId, admin_state: "active" });
  assert(!eInd, `no se pudo crear el indicador: ${eInd?.message}`);

  const { data: caso } = await a.from("work_cases")
    .insert({ organization_id: orgA, code: `QA13-C-${stamp}`.slice(0, 24),
              title: "QA Q13 · Retraso reiterado",
              case_type: "issue", origin_kind: "manual", detected_on: "2026-08-01" })
    .select("id").single();
  await a.from("work_case_processes")
    .insert({ organization_id: orgA, case_id: caso!.id, process_id: procId });

  // ---- Partes interesadas: un requisito atendido por este proceso --------
  await a.rpc("quality_seed_stakeholder_categories", { p_organization_id: orgA });
  const { data: cat } = await a.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", orgA).eq("code", "customers").single();
  const { data: parte } = await a.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `QA Q13 Cliente ${stamp}` })
    .select("id").single();
  const { data: analisis } = await a.from("quality_stakeholder_assessments")
    .insert({ organization_id: orgA, category_id: cat!.id, subject_kind: "external_party",
              external_party_id: parte!.id, relevance_status: "relevant" })
    .select("id").single();
  const { data: requisito } = await a.from("quality_stakeholder_requirements")
    .insert({ organization_id: orgA, assessment_id: analisis!.id, entry_kind: "requirement",
              requirement_kind: "contractual", title: "QA Q13 · SLA de 48 horas" })
    .select("id").single();
  await a.from("quality_stakeholder_requirement_processes")
    .insert({ organization_id: orgA, requirement_id: requisito!.id, process_id: procId });

  // =========================================================================
  await check("G. El contexto devuelve los dominios que de VERDAD se relacionan", async () => {
    const ctx = await CTX.loadProcessContext(orgA, procId, a);
    assert(ctx, "no se pudo componer el contexto");
    assert(ctx!.process.name.includes("Despacho"), "no trae el proceso");
    assert(ctx!.process.ownerPositionName?.includes("Jefe de operaciones"),
      "no resuelve el cargo propietario");

    const porClave = new Map(ctx!.sections.map((s) => [s.key, s]));
    for (const clave of ["requirements", "risks", "opportunities", "objectives",
                         "indicators", "documents", "audit_findings", "cases", "competencies"]) {
      assert(porClave.has(clave), `falta la sección ${clave}`);
      assert(porClave.get(clave)!.status === "ok",
        `la sección ${clave} llegó ${porClave.get(clave)!.status}`);
    }
    assert(porClave.get("risks")!.count === 1, "no ve el riesgo del proceso");
    assert(porClave.get("objectives")!.count === 1, "no ve el objetivo");
    assert(porClave.get("indicators")!.count === 1, "no ve el indicador");
    assert(porClave.get("cases")!.count === 1, "no ve el caso");
    assert(porClave.get("requirements")!.count === 1, "no ve el requisito de la parte interesada");
    // Vacío es vacío, y se distingue de «no se sabe».
    assert(porClave.get("documents")!.count === 0, "inventa documentos");
    assert(porClave.get("documents")!.status === "ok",
      "una sección vacía no debería marcarse como indisponible");
  });

  await check("G2. Cada fila lleva a su ficha, y ninguna sale de Quality", async () => {
    const ctx = await CTX.loadProcessContext(orgA, procId, a);
    const filas = ctx!.sections.flatMap((s) => s.items);
    assert(filas.length >= 4, `esperaba varias filas de muestra, hay ${filas.length}`);
    for (const f of filas) {
      assert(f.href.startsWith("/quality/"), `enlace fuera de Quality: ${f.href}`);
      assert(f.subjectId, "una fila sin identificador no se puede abrir");
    }
    const riesgoItem = ctx!.sections.find((s) => s.key === "risks")!.items[0];
    assert(riesgoItem.href.includes(riesgo!.id as string),
      "el riesgo enlaza al listado en vez de a su ficha");
  });

  await check("H. Otra empresa no obtiene NADA de ese proceso", async () => {
    const ctx = await CTX.loadProcessContext(orgA, procId, b);
    assert(ctx === null, "B compuso el contexto de un proceso de A");
    void orgB;
  });

  await check("I. Proveedor → proceso se DERIVA; no hay tabla que lo guarde", async () => {
    const { data: parteProv } = await a.from("quality_external_parties")
      .insert({ organization_id: orgA, legal_name: `QA Q13 Proveedor ${stamp}` })
      .select("id").single();
    const { data: perfil } = await a.from("quality_supplier_profiles")
      .insert({ organization_id: orgA, party_id: parteProv!.id }).select("id").single();

    // Sin nada que derivar: vacío, no invención.
    const vacio = await CTX.deriveSupplierProcesses(orgA, perfil!.id as string, a);
    assert(vacio.length === 0, `sin incidentes ni enlaces debía devolver vacío, dio ${vacio.length}`);

    // Con un incidente que se convirtió en caso, y ese caso declara procesos.
    const { data: alcance } = await a.from("quality_supplier_scopes")
      .insert({ organization_id: orgA, profile_id: perfil!.id, label: "QA Q13 · Empaque" })
      .select("id").single();
    await a.from("quality_supplier_incidents").insert({
      organization_id: orgA, profile_id: perfil!.id, scope_id: alcance!.id,
      title: "QA Q13 · Entrega tardía", case_id: caso!.id });

    const derivado = await CTX.deriveSupplierProcesses(orgA, perfil!.id as string, a);
    assert(derivado.length === 1, `esperaba 1 proceso derivado, dio ${derivado.length}`);
    assert(derivado[0].processId === procId, "derivó el proceso equivocado");
    assert(/caso/i.test(derivado[0].via), `no explica el camino: «${derivado[0].via}»`);
    assert(derivado[0].href.includes(procId), "el derivado no enlaza al proceso");

    // Y NO existe ninguna tabla que lo persista.
    const { error } = await a.from("quality_supplier_processes").select("*").limit(1);
    assert(error, "existe una tabla supplier_processes: QI-23 dice que no debe existir");
  });

  await check("J. Queja → proceso se deriva del caso, y sin caso no hay proceso", async () => {
    const { data: cliente } = await a.from("quality_external_parties")
      .insert({ organization_id: orgA, legal_name: `QA Q13 ClienteVoz ${stamp}` })
      .select("id").single();
    const { data: perfilCli } = await a.from("quality_customer_profiles")
      .insert({ organization_id: orgA, party_id: cliente!.id }).select("id").single();

    const { data: sinCaso } = await a.from("quality_customer_feedback")
      .insert({ organization_id: orgA, customer_id: perfilCli!.id,
                feedback_kind: "complaint", title: "QA Q13 · Queja sin caso" })
      .select("id").single();
    const nada = await CTX.deriveComplaintProcesses(orgA, sinCaso!.id as string, a);
    assert(nada.length === 0, "una queja sin caso no tiene proceso derivable");

    const { data: conCaso } = await a.from("quality_customer_feedback")
      .insert({ organization_id: orgA, customer_id: perfilCli!.id,
                feedback_kind: "complaint", title: "QA Q13 · Queja con caso",
                case_id: caso!.id })
      .select("id").single();
    const derivado = await CTX.deriveComplaintProcesses(orgA, conCaso!.id as string, a);
    assert(derivado.length === 1, `esperaba 1 proceso derivado, dio ${derivado.length}`);
    assert(derivado[0].processId === procId, "derivó el proceso equivocado");

    const { error } = await a.from("quality_complaint_processes").select("*").limit(1);
    assert(error, "existe una tabla complaint_processes: QI-23 dice que no debe existir");
  });

  await check("K. El cargo también tiene su contexto", async () => {
    const ctx = await POS.loadPositionContext(orgA, cargo!.id as string, a);
    assert(ctx, "no se pudo componer el contexto del cargo");
    assert(ctx!.position.name.includes("Jefe de operaciones"), "no trae el cargo");
    const porClave = new Map(ctx!.sections.map((s) => [s.key, s]));
    assert(porClave.get("processes")!.count === 1, "no ve el proceso que dirige");
    assert(porClave.get("risks")!.count === 1, "no ve el riesgo a su cargo");
    assert(porClave.get("objectives")!.count === 1, "no ve el objetivo a su cargo");
    for (const s of ctx!.sections) {
      assert(s.status === "ok", `la sección ${s.key} llegó ${s.status}`);
      assert(s.href.startsWith("/quality/"), `enlace fuera de Quality: ${s.href}`);
    }
    const ajeno = await POS.loadPositionContext(orgA, cargo!.id as string, b);
    assert(ajeno === null, "B leyó el contexto de un cargo de A");
  });

  await check("Q. Una sección que falla NO devuelve cero", async () => {
    // Se rompe una sola lectura: la de riesgos. Las demás tienen que seguir.
    const roto = new Proxy(a, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (tabla: string) => {
            if (tabla === "quality_risk_processes") {
              throw Object.assign(new Error("fallo simulado de red"), { code: "XX000" });
            }
            return (target as SupabaseClient).from(tabla);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as SupabaseClient;

    const ctx = await CTX.loadProcessContext(orgA, procId, roto);
    assert(ctx, "un fallo de una sección tumbó la composición entera");
    const riesgos = ctx!.sections.find((s) => s.key === "risks")!;
    assert(riesgos.status === "unavailable",
      `la sección rota llegó como ${riesgos.status}`);
    assert(riesgos.count === null, "un fallo se convirtió en 0: eso es mentir con formato de dato");
    assert(riesgos.reason && riesgos.reason.length > 10, "no dice por qué no hay dato");
    const objetivos = ctx!.sections.find((s) => s.key === "objectives")!;
    assert(objetivos.status === "ok" && objetivos.count === 1,
      "el fallo de una sección se llevó por delante a otra");
  });

  await check("R. Sin permiso NO es cero: es «no visible»", async () => {
    const denegado = new Proxy(a, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (tabla: string) => {
            if (tabla === "quality_audit_findings") {
              throw Object.assign(new Error("permission denied for table"), { code: "42501" });
            }
            return (target as SupabaseClient).from(tabla);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as SupabaseClient;

    const ctx = await CTX.loadProcessContext(orgA, procId, denegado);
    const hallazgos = ctx!.sections.find((s) => s.key === "audit_findings")!;
    assert(hallazgos.status === "not_visible",
      `una denegación llegó como ${hallazgos.status}`);
    assert(hallazgos.count === null, "una denegación se presentó como 0 elementos");
    assert(hallazgos.items.length === 0, "una denegación devolvió filas");
  });

  await check("S–T. El número de consultas NO crece con el de filas", async () => {
    const { proxy: p1, estado: e1 } = contador(a);
    await CTX.loadProcessContext(orgA, procId, p1);
    const conPocas = e1.n;

    // Cuarenta riesgos más en el mismo proceso.
    for (let i = 0; i < 40; i += 1) {
      const { data: r } = await a.from("quality_risks")
        .insert({ organization_id: orgA, code: `QA13-R${i}-${stamp}`.slice(0, 24),
                  title: `QA Q13 · Riesgo ${i}`,
                  event_description: "Riesgo de volumen para medir consultas." })
        .select("id").single();
      await a.from("quality_risk_processes")
        .insert({ organization_id: orgA, risk_id: r!.id, process_id: procId });
    }

    const { proxy: p2, estado: e2 } = contador(a);
    const ctx = await CTX.loadProcessContext(orgA, procId, p2);
    const conMuchas = e2.n;

    assert(ctx!.sections.find((s) => s.key === "risks")!.count === 41,
      "no cuenta los riesgos nuevos");
    assert(conMuchas === conPocas,
      `con 1 riesgo hizo ${conPocas} consultas y con 41 hizo ${conMuchas}: hay N+1`);
    assert(conMuchas <= 20,
      `${conMuchas} consultas para nueve secciones es demasiado`);
    // Y la muestra sigue acotada: no se trae la tabla entera para enseñarla.
    assert(ctx!.sections.find((s) => s.key === "risks")!.items.length <= 5,
      "la muestra crece con las filas");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
