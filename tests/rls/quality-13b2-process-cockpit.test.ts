/**
 * Trazaloop · QUALITY-13B2 · El mirador contra base REAL.
 *
 * Se monta un proceso con datos en TODOS los ejes —requisito de parte
 * interesada, riesgo, oportunidad, objetivo, indicador, documento, hallazgo,
 * caso, competencia, proveedor y queja— y se le hace al cargador del mirador la
 * pregunta que la pantalla le hará: **qué hay alrededor de este proceso**.
 *
 * LAS CUATRO COSAS QUE HACEN QUE LA RESPUESTA VALGA
 *
 *   · el recuento sale del dominio y **no crece el número de consultas** con el
 *     número de filas;
 *   · la parte interesada se **deriva** del requisito, y no hay ninguna tabla
 *     que la guarde;
 *   · proveedor y queja llegan por un camino cierto, y **cada uno lo dice**;
 *   · una sección que falla dice que falló y NO devuelve cero.
 *
 * Correr: npm run test:quality13b2-cockpit-db
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
  const email = `q13b2-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return cli;
}

/** Un cliente que cuenta consultas. La única forma honesta de comprobar que no
 *  hay N+1: contarlas, no confiar en que el código «parece» eficiente. */
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

/** Un cliente al que se le rompe UNA lectura. */
function roto(cli: SupabaseClient, tabla: string) {
  return new Proxy(cli, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (t: string) => {
          if (t === tabla) throw Object.assign(new Error("fallo simulado"), { code: "XX000" });
          return (target as SupabaseClient).from(t);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}

/** Un cliente al que la base le niega UNA tabla. */
function denegado(cli: SupabaseClient, tabla: string) {
  return new Proxy(cli, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (t: string) => {
          if (t === tabla) {
            throw Object.assign(new Error("permission denied"), { code: "42501" });
          }
          return (target as SupabaseClient).from(t);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}

async function main() {
  const COCKPIT = await import("../../lib/db/quality-process-cockpit");

  console.log("\nQUALITY-13B2 · Mirador de proceso · base real\n");

  const a = await persona("a");
  const { data: orgAId } = await a.rpc("create_organization", { p_name: `Q13B2 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await persona("b");
  const { data: orgBId } = await b.rpc("create_organization", { p_name: `Q13B2 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  const corto = (s: string) => s.slice(0, 24);

  // =========================================================================
  // El proceso, con datos en todos los ejes
  // =========================================================================
  const { data: cargo } = await a.from("quality_positions")
    .insert({ organization_id: orgA, name: "QA Q13B2 · Jefe de despacho" })
    .select("id").single();
  const { data: proc } = await a.from("quality_processes")
    .insert({ organization_id: orgA, name: "QA Q13B2 · Despacho", category_code: "core",
              status: "active", owner_position_id: cargo!.id })
    .select("id").single();
  assert(proc, "no se pudo crear el proceso");
  const procId = proc!.id as string;

  // — Riesgo y oportunidad —
  const { data: riesgo } = await a.from("quality_risks")
    .insert({ organization_id: orgA, code: corto(`QB2-R-${stamp}`),
              title: "QA Q13B2 · Retraso de despacho",
              event_description: "Los despachos se retrasan.", owner_position_id: cargo!.id,
              status: "active" })
    .select("id").single();
  await a.from("quality_risk_processes")
    .insert({ organization_id: orgA, risk_id: riesgo!.id, process_id: procId });

  const { data: oport } = await a.from("quality_opportunities")
    .insert({ organization_id: orgA, code: corto(`QB2-O-${stamp}`),
              title: "QA Q13B2 · Ruta directa", situation: "Hay una ruta más corta." })
    .select("id").single();
  await a.from("quality_opportunity_processes")
    .insert({ organization_id: orgA, opportunity_id: oport!.id, process_id: procId });

  // — Objetivo e indicador —
  const { data: obj } = await a.from("quality_objectives")
    .insert({ organization_id: orgA, name: "QA Q13B2 · Cumplir el plazo",
              period_start: "2026-01-01", period_end: "2026-12-31",
              owner_position_id: cargo!.id })
    .select("id").single();
  await a.from("quality_objective_processes")
    .insert({ organization_id: orgA, objective_id: obj!.id, process_id: procId });
  const { error: eInd } = await a.from("quality_indicators").insert({
    organization_id: orgA, name: "QA Q13B2 · Cumplimiento de plazo",
    scope_type: "process", scope_process_id: procId, admin_state: "active" });
  assert(!eInd, `indicador: ${eInd?.message}`);

  // — Documento —
  const { data: doc } = await a.from("trazadoc_documents")
    .insert({ organization_id: orgA, source_type: "custom", title: "QA Q13B2 · PR de despacho",
              code: corto(`QB2-D-${stamp}`), status: "approved", module_key: "quality" })
    .select("id").single();
  await a.from("quality_process_documents")
    .insert({ organization_id: orgA, process_id: procId, document_id: doc!.id,
              relation_type: "governs" });
  // Y uno de OTRO módulo: la vinculación lo permite, y su ficha no está aquí.
  const { data: docAjeno } = await a.from("trazadoc_documents")
    .insert({ organization_id: orgA, source_type: "custom", module_key: "cpr",
              title: "QA Q13B2 · Instructivo de PCR", status: "approved" })
    .select("id").single();
  await a.from("quality_process_documents")
    .insert({ organization_id: orgA, process_id: procId, document_id: docAjeno!.id,
              relation_type: "supports" });

  // — Auditoría y hallazgo —
  const { data: auditoria } = await a.from("quality_audits")
    .insert({ organization_id: orgA, code: corto(`QB2-A-${stamp}`),
              title: "QA Q13B2 · Auditoría interna" })
    .select("id").single();
  const { error: eHall } = await a.from("quality_audit_findings").insert({
    organization_id: orgA, audit_id: auditoria!.id, code: corto(`QB2-H-${stamp}`),
    statement: "QA Q13B2 · No se registra la verificación de salida",
    process_id: procId, evaluation_status: "pending" });
  assert(!eHall, `hallazgo: ${eHall?.message}`);

  // — Caso —
  const { data: caso } = await a.from("work_cases")
    .insert({ organization_id: orgA, code: corto(`QB2-C-${stamp}`),
              title: "QA Q13B2 · Retraso reiterado", case_type: "issue",
              origin_kind: "manual", detected_on: "2026-08-01" })
    .select("id").single();
  await a.from("work_case_processes")
    .insert({ organization_id: orgA, case_id: caso!.id, process_id: procId });

  // — Competencia requerida —
  const { data: comp } = await a.from("quality_competencies")
    .insert({ organization_id: orgA, name: "QA Q13B2 · Manejo de montacargas" })
    .select("id").single();
  const { error: eComp } = await a.from("quality_competency_requirements").insert({
    organization_id: orgA, competency_id: comp!.id, process_id: procId, required_level: 3 });
  assert(!eComp, `competencia: ${eComp?.message}`);

  // — Parte interesada, su requisito y el vínculo con el proceso —
  await a.rpc("quality_seed_stakeholder_categories", { p_organization_id: orgA });
  const { data: cat } = await a.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", orgA).eq("code", "customers").single();
  const { data: parte } = await a.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `QA Q13B2 Andina S.A. ${stamp}`,
              trade_name: `QA Q13B2 Andina ${stamp}` })
    .select("id").single();
  const { data: analisis } = await a.from("quality_stakeholder_assessments")
    .insert({ organization_id: orgA, category_id: cat!.id, subject_kind: "external_party",
              external_party_id: parte!.id, relevance_status: "relevant" })
    .select("id").single();
  const { data: requisito } = await a.from("quality_stakeholder_requirements")
    .insert({ organization_id: orgA, assessment_id: analisis!.id, entry_kind: "requirement",
              requirement_kind: "contractual", title: "QA Q13B2 · SLA de 48 horas",
              relevance_status: "relevant" })
    .select("id").single();
  await a.from("quality_stakeholder_requirement_processes")
    .insert({ organization_id: orgA, requirement_id: requisito!.id, process_id: procId,
              link_kind: "monitored_by" });

  // — Proveedor con un incidente convertido en caso —
  const { data: parteProv } = await a.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `QA Q13B2 Empaques ${stamp}` })
    .select("id").single();
  const { data: perfil } = await a.from("quality_supplier_profiles")
    .insert({ organization_id: orgA, party_id: parteProv!.id }).select("id").single();
  await a.from("quality_supplier_incidents").insert({
    organization_id: orgA, profile_id: perfil!.id,
    title: "QA Q13B2 · Entrega tardía", case_id: caso!.id });

  // — Queja con caso —
  const { data: parteCli } = await a.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `QA Q13B2 Cliente ${stamp}` })
    .select("id").single();
  const { data: perfilCli } = await a.from("quality_customer_profiles")
    .insert({ organization_id: orgA, party_id: parteCli!.id }).select("id").single();
  await a.from("quality_customer_feedback").insert({
    organization_id: orgA, customer_id: perfilCli!.id, feedback_kind: "complaint",
    title: "QA Q13B2 · El pedido llegó tarde", reporter_name: "QA Q13B2 Persona Anónima",
    case_id: caso!.id });

  // =========================================================================
  console.log("W · El mirador compone lo que la pantalla va a enseñar");
  // =========================================================================

  await check("W1. Las nueve secciones llegan y cada una ve lo suyo", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    assert(ctx, "no se pudo componer el mirador");
    const por = new Map(ctx!.sections.map((s) => [s.key, s]));
    const esperado: Record<string, number> = {
      requirements: 1, risks: 1, opportunities: 1, objectives: 1, indicators: 1,
      documents: 2, audit_findings: 1, cases: 1, competencies: 1,
    };
    for (const [k, n] of Object.entries(esperado)) {
      const s = por.get(k);
      assert(s, `falta la sección ${k}`);
      assert(s!.status === "ok", `la sección ${k} llegó ${s!.status}`);
      assert(s!.count === n, `la sección ${k} cuenta ${s!.count} en vez de ${n}`);
    }
    assert(ctx!.process.ownerPositionName?.includes("Jefe de despacho"),
      "no resuelve el cargo propietario");
  });

  await check("W2. Los recuentos de atención los pone el dominio", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const por = new Map(ctx!.sections.map((s) => [s.key, s]));
    assert(por.get("risks")!.attentionCount === 1, "no cuenta el riesgo activo");
    assert(por.get("audit_findings")!.attentionCount === 1, "no cuenta el hallazgo sin evaluar");
    assert(por.get("cases")!.attentionCount === 1, "no cuenta el caso abierto");
    // Y donde el dominio no determina, no se inventa.
    assert(por.get("indicators")!.attentionCount === null,
      "se inventó un recuento de atención para los indicadores");
    assert(por.get("documents")!.attentionCount === null,
      "se inventó un recuento de atención para los documentos");
  });

  await check("W2b. Un documento de OTRO módulo no recibe una ficha de Quality", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const docs = ctx!.sections.find((s) => s.key === "documents")!;
    const propio = docs.items.find((i) => i.subjectId === (doc!.id as string));
    const ajeno = docs.items.find((i) => i.subjectId === (docAjeno!.id as string));
    assert(propio && ajeno, "faltan documentos en la muestra");
    assert(propio!.linksToDetail !== false, "el documento de Quality perdió su ficha");
    assert(propio!.href.includes(doc!.id as string), "el documento propio no lleva a su ficha");
    assert(ajeno!.linksToDetail === false,
      "el documento de otro módulo promete una ficha en Quality que da 404");
    assert(!ajeno!.href.includes(docAjeno!.id as string),
      `se fabricó una URL de Quality para un documento ajeno: ${ajeno!.href}`);
    assert(/de PCR/i.test(ajeno!.label), `no se dice de qué módulo es: «${ajeno!.label}»`);
    assert(ajeno!.href.startsWith("/quality/"),
      "el documento ajeno enlaza fuera de Quality, a un módulo que la empresa puede no tener");
  });

  await check("W3. Cada fila lleva a su dominio, y ninguna sale de Quality", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const filas = ctx!.sections.flatMap((s) => s.items);
    assert(filas.length >= 8, `esperaba una fila por eje, hay ${filas.length}`);
    for (const f of filas) {
      assert(f.href.startsWith("/quality/"), `enlace fuera de Quality: ${f.href}`);
    }
    for (const s of ctx!.sections) {
      assert(s.href.startsWith("/quality/"), `sección ${s.key} enlaza fuera: ${s.href}`);
    }
  });

  // =========================================================================
  console.log("\nX · La parte interesada se deriva del requisito");
  // =========================================================================

  await check("X1. El requisito dice de quién viene y cómo se relaciona", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    assert(ctx!.requirements.length === 1,
      `esperaba 1 requisito enriquecido, hay ${ctx!.requirements.length}`);
    const r = ctx!.requirements[0];
    assert(r.requirementId === requisito!.id, "enriqueció el requisito equivocado");
    assert(r.partyLabel?.includes("Andina"), `no resuelve la parte: «${r.partyLabel}»`);
    // El nombre COMERCIAL manda sobre el legal, igual que en 12.3.
    assert(!r.partyLabel?.includes("S.A."),
      `usó el nombre legal teniendo el comercial: «${r.partyLabel}»`);
    assert(r.linkKind === "monitored_by", `perdió el tipo de vínculo: ${r.linkKind}`);
    assert(r.requirementKind === "contractual", "perdió la naturaleza del requisito");
  });

  await check("X2. Y NO existe ninguna tabla parte→proceso", async () => {
    for (const prohibida of ["quality_stakeholder_party_processes",
                             "quality_party_processes", "quality_supplier_processes",
                             "quality_complaint_processes"]) {
      const { error } = await a.from(prohibida).select("*").limit(1);
      assert(error, `existe la tabla ${prohibida}: la relación debía derivarse`);
    }
  });

  await check("X3. Un vínculo cerrado deja de enriquecerse", async () => {
    const { data: otroReq } = await a.from("quality_stakeholder_requirements")
      .insert({ organization_id: orgA, assessment_id: analisis!.id, entry_kind: "requirement",
                requirement_kind: "other", title: "QA Q13B2 · Requisito que dejó de aplicar" })
      .select("id").single();
    assert(otroReq, "no se pudo crear el segundo requisito");
    await a.from("quality_stakeholder_requirement_processes")
      .insert({ organization_id: orgA, requirement_id: otroReq!.id, process_id: procId,
                effective_from: "2025-01-01", effective_to: "2025-12-31" });
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const seccion = ctx!.sections.find((s) => s.key === "requirements")!;
    assert(seccion.count === 1,
      `el vínculo cerrado se cuenta como vigente: ${seccion.count}`);
    assert(!ctx!.requirements.some((r) => r.requirementId === otroReq!.id),
      "un vínculo cerrado se enriqueció como si rigiera hoy");
  });

  // =========================================================================
  console.log("\nY · Lo derivado, en la dirección del proceso");
  // =========================================================================

  await check("Y1. El proveedor llega por el caso, y lo dice", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const prov = ctx!.derived.find((d) => d.key === "derived_suppliers");
    assert(prov, "no se derivó ningún proveedor");
    assert(prov!.count === 1, `esperaba 1 proveedor, dio ${prov!.count}`);
    assert(prov!.items[0].label.includes("Empaques"), "derivó el proveedor equivocado");
    assert(/caso abierto desde un incidente/i.test(prov!.items[0].via),
      `no explica el camino: «${prov!.items[0].via}»`);
    assert(prov!.items[0].href.includes(perfil!.id as string), "no lleva a la ficha del proveedor");
    assert(/DERIVADA/.test(prov!.note), "no advierte de que la relación es derivada");
  });

  await check("Y2. La queja llega por su caso, y NO trae a quién", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const quejas = ctx!.derived.find((d) => d.key === "derived_complaints");
    assert(quejas, "no se derivó ninguna retroalimentación");
    assert(quejas!.count === 1, `esperaba 1 queja, dio ${quejas!.count}`);
    const it = quejas!.items[0];
    assert(it.label.includes("El pedido llegó tarde"), "derivó la queja equivocada");
    assert(/caso abierto desde esta retroalimentación/i.test(it.via), "no explica el camino");
    const todo = JSON.stringify(quejas);
    assert(!todo.includes("Persona Anónima"), "se filtró quién reportó la queja");
    assert(!todo.includes(perfilCli!.id as string), "se filtró el cliente de la queja");
  });

  await check("Y3. También llega por una referencia declarada a mano", async () => {
    const { data: parteOtro } = await a.from("quality_external_parties")
      .insert({ organization_id: orgA, legal_name: `QA Q13B2 Transportes ${stamp}` })
      .select("id").single();
    const { data: otroPerfil } = await a.from("quality_supplier_profiles")
      .insert({ organization_id: orgA, party_id: parteOtro!.id }).select("id").single();
    const { error } = await a.from("work_references").insert({
      organization_id: orgA, owner_kind: "supplier_profile", owner_id: otroPerfil!.id,
      ref_kind: "quality_process", ref_id: procId });
    assert(!error, `no se pudo declarar la referencia: ${error?.message}`);

    const derivados = await COCKPIT.deriveProcessSuppliers(orgA, procId, a);
    assert(derivados.length === 2, `esperaba 2 proveedores, dio ${derivados.length}`);
    const porRef = derivados.find((d) => d.id === otroPerfil!.id);
    assert(porRef, "el proveedor declarado por referencia no aparece");
    assert(/referencia declarada/i.test(porRef!.via),
      `no distingue el camino de la referencia: «${porRef!.via}»`);
  });

  await check("Y4. Un proceso sin nada derivable no enseña bloques vacíos", async () => {
    const { data: solo } = await a.from("quality_processes")
      .insert({ organization_id: orgA, name: "QA Q13B2 · Proceso aislado",
                category_code: "support", status: "active" })
      .select("id").single();
    const ctx = await COCKPIT.loadProcessCockpit(orgA, solo!.id as string, a);
    assert(ctx!.derived.length === 0,
      `un proceso sin proveedores ni quejas enseñó ${ctx!.derived.length} bloque(s) derivado(s)`);
    // Y las nueve secciones siguen ahí, vacías y en verde: vacío no es fallo.
    assert(ctx!.sections.length === 9, "faltan secciones en un proceso vacío");
    for (const s of ctx!.sections) {
      assert(s.status === "ok" && s.count === 0,
        `la sección ${s.key} de un proceso vacío llegó ${s.status}/${s.count}`);
    }
  });

  // =========================================================================
  console.log("\nZ · Permisos y aislamiento");
  // =========================================================================

  await check("Z1. Otra empresa no compone NADA de ese proceso", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, b);
    assert(ctx === null, "B compuso el mirador de un proceso de A");
    void orgB;
  });

  await check("Z2. Ni deriva sus proveedores ni sus quejas", async () => {
    assert((await COCKPIT.deriveProcessSuppliers(orgA, procId, b)).length === 0,
      "B derivó los proveedores de un proceso de A");
    assert((await COCKPIT.deriveProcessComplaints(orgA, procId, b)).length === 0,
      "B derivó las quejas de un proceso de A");
  });

  await check("Z3. Una sección DENEGADA no llega como cero", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId,
      denegado(a, "quality_risk_processes"));
    assert(ctx, "una denegación tumbó el mirador entero");
    const riesgos = ctx!.sections.find((s) => s.key === "risks")!;
    assert(riesgos.status === "not_visible", `llegó como ${riesgos.status}`);
    assert(riesgos.count === null, `llegó con recuento ${riesgos.count}`);
    assert(riesgos.attentionCount === null, "filtró un recuento de atención");
    assert(riesgos.items.length === 0, "filtró filas de un dominio denegado");
  });

  await check("Z4. Una sección ROTA no llega como cero, y las demás siguen", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, roto(a, "work_case_processes"));
    assert(ctx, "un fallo de una sección tumbó el mirador");
    const casos = ctx!.sections.find((s) => s.key === "cases")!;
    assert(casos.status === "unavailable", `llegó como ${casos.status}`);
    assert(casos.count === null, `llegó con recuento ${casos.count}`);
    const riesgos = ctx!.sections.find((s) => s.key === "risks")!;
    assert(riesgos.status === "ok" && riesgos.count === 1,
      "el fallo de casos se llevó por delante a los riesgos");
  });

  await check("Z5. Si no se pueden leer los casos, lo derivado lo DICE", async () => {
    // Los dos caminos derivados parten de los casos del proceso. Si esa lectura
    // falla, decir «ningún proveedor relacionado» sería mentir dos veces.
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, roto(a, "work_case_processes"));
    assert(ctx!.derived.length === 2,
      `esperaba las dos derivaciones marcadas, hay ${ctx!.derived.length}`);
    for (const d of ctx!.derived) {
      assert(d.status === "unavailable", `la derivación ${d.key} llegó ${d.status}`);
      assert(d.count === null, `la derivación ${d.key} llegó con recuento ${d.count}`);
      assert(d.items.length === 0, `la derivación ${d.key} enseñó filas que no pudo leer`);
    }
  });

  await check("Z6. El mirador no escribe NADA", async () => {
    const antes = await Promise.all(["quality_risk_processes", "work_case_processes",
                                    "work_references", "quality_stakeholder_requirement_processes"]
      .map((t) => a.from(t).select("*", { count: "exact", head: true })
        .eq("organization_id", orgA).then((r) => r.count ?? 0)));
    await COCKPIT.loadProcessCockpit(orgA, procId, a);
    const despues = await Promise.all(["quality_risk_processes", "work_case_processes",
                                       "work_references", "quality_stakeholder_requirement_processes"]
      .map((t) => a.from(t).select("*", { count: "exact", head: true })
        .eq("organization_id", orgA).then((r) => r.count ?? 0)));
    assert(JSON.stringify(antes) === JSON.stringify(despues),
      `mirar cambió los datos: ${antes} → ${despues}`);
  });

  // =========================================================================
  console.log("\nAA · El coste no crece con los datos");
  // =========================================================================

  await check("AA1. Un riesgo o cuarenta y uno cuestan lo mismo", async () => {
    const { proxy: p1, estado: e1 } = contador(a);
    await COCKPIT.loadProcessCockpit(orgA, procId, p1);

    const filas = Array.from({ length: 40 }, (_, i) => ({
      organization_id: orgA, code: corto(`QB2-M${i}-${stamp}`),
      title: `QA Q13B2 · Riesgo de volumen ${i}`,
      event_description: "Riesgo de relleno para medir el coste.",
      owner_position_id: cargo!.id,
    }));
    const { data: muchos, error } = await a.from("quality_risks").insert(filas).select("id");
    assert(!error, `no se pudieron crear los riesgos de volumen: ${error?.message}`);
    await a.from("quality_risk_processes").insert(
      (muchos ?? []).map((r) => ({
        organization_id: orgA, risk_id: r.id as string, process_id: procId })));

    const { proxy: p2, estado: e2 } = contador(a);
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, p2);
    assert(ctx!.sections.find((s) => s.key === "risks")!.count === 41,
      "no ve los cuarenta y un riesgos");
    assert(e1.n === e2.n,
      `con 1 riesgo hizo ${e1.n} consultas y con 41 hizo ${e2.n}`);
    assert(e2.n <= 40, `el mirador hace ${e2.n} consultas: demasiadas para nueve secciones`);
  });

  await check("AA2. Y la muestra sigue acotada", async () => {
    const ctx = await COCKPIT.loadProcessCockpit(orgA, procId, a);
    for (const s of ctx!.sections) {
      assert(s.items.length <= 5, `la sección ${s.key} trae ${s.items.length} filas`);
    }
    for (const d of ctx!.derived) {
      assert(d.items.length <= 5, `la derivación ${d.key} trae ${d.items.length} filas`);
    }
    assert(ctx!.requirements.length <= 5,
      `se enriquecieron ${ctx!.requirements.length} requisitos para enseñar cuatro`);
  });

  console.log(`\nQUALITY-13B2 · mirador (base real): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
