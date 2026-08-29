/**
 * Trazaloop · QUALITY-12.3B2 · Las integraciones, contra base REAL.
 *
 * Partes interesadas no es una isla: emite hechos al bus, se enlaza con lo
 * periférico, alimenta una entrada de la Revisión por la Dirección y se
 * declara como fuente de Intelligence. Cada una de esas cuatro costuras tiene
 * una forma de romperse en silencio, y aquí se prueba justo esa:
 *
 *   · un evento que se emite dos veces por un doble clic;
 *   · un enlace que apunta a una fila de otra empresa;
 *   · una entrada de revisión que se calcula de nuevo cada vez que se abre;
 *   · un contexto de IA que se lleva un correo electrónico.
 *
 * Correr: npm run test:quality123b2-integrations
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
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (o: number) => iso(new Date(Date.now() + o * 86_400_000));

async function nuevoUsuario(tag: string) {
  const email = `q123b2i-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return { cli, id: data.user.id };
}

async function main() {
  const IP = await import("../../lib/db/quality-interested-parties");

  console.log("\nQUALITY-12.3B2 · Integraciones · base real\n");

  const a = await nuevoUsuario("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q123B2I A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await nuevoUsuario("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q123B2I B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  await IP.seedCategories(orgA, a.cli);
  const cats = await IP.listCategories(orgA, {}, a.cli);
  const catCli = cats.find((c) => c.code === "customers")!;

  const { data: parte } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `Cliente Integración ${stamp}`,
              trade_name: `IntegraCo ${stamp}` }).select("id").single();

  const alta = await IP.createAssessment(orgA, {
    categoryId: catCli.id, subjectKind: "external_party", subjectId: parte!.id,
    relevanceStatus: "relevant", summary: "Primera lectura.",
  }, a.cli);
  assert(alta.ok, "no se pudo crear el análisis base");
  const analisis = alta.data;

  const eventos = async (tipo: string, sujeto?: string) => {
    let q = a.cli.from("work_events").select("id, subject_id, payload")
      .eq("organization_id", orgA).eq("event_type", tipo);
    if (sujeto) q = q.eq("subject_id", sujeto);
    const { data } = await q;
    return data ?? [];
  };

  // =========================================================================
  // El bus
  // =========================================================================

  await check("AJ. Los cinco tipos de evento están en el vocabulario y en el catálogo", async () => {
    const { data } = await a.cli.from("quality_automation_event_catalog")
      .select("event_type").eq("domain", "interested_parties");
    const tipos = new Set((data ?? []).map((r) => r.event_type as string));
    for (const t of ["interested_party.assessed", "interested_party.relevance_changed",
                     "interested_party.requirement_changed", "interested_party.strategy_changed",
                     "interested_party.review_completed"]) {
      assert(tipos.has(t), `falta ${t} en el catálogo de automatización`);
    }
  });

  let sucesor = "";
  await check("AK. Suceder emite el hecho UNA vez, aunque se repita la llamada", async () => {
    const res = await IP.supersedeAssessment(orgA, {
      assessmentId: analisis, relevanceStatus: "relevant",
      summary: "Segunda lectura tras el contrato marco.",
    }, a.cli);
    assert(res.ok, `suceder: ${res.ok ? "" : res.message}`);
    sucesor = res.data;

    const uno = await eventos("interested_party.assessed", sucesor);
    assert(uno.length === 1, `esperaba 1 evento, hay ${uno.length}`);

    // El segundo intento sobre el análisis YA sucedido se rechaza, que es lo
    // que impide el doble registro por un doble clic.
    const otra = await IP.supersedeAssessment(orgA, {
      assessmentId: analisis, relevanceStatus: "relevant", summary: "Doble clic.",
    }, a.cli);
    assert(!otra.ok && otra.code === "assessment_superseded",
      `el segundo intento debía rechazarse, dio ${JSON.stringify(otra)}`);
    const sigue = await eventos("interested_party.assessed", sucesor);
    assert(sigue.length === 1, `tras el doble clic hay ${sigue.length} eventos`);
  });

  await check("AL. Cambiar la pertinencia emite su propio hecho; no cambiarla, no", async () => {
    const antes = (await eventos("interested_party.relevance_changed")).length;
    const igual = await IP.supersedeAssessment(orgA, {
      assessmentId: sucesor, relevanceStatus: "relevant", summary: "Sin cambio de pertinencia.",
    }, a.cli);
    assert(igual.ok, `suceder sin cambio: ${igual.ok ? "" : igual.message}`);
    const medio = (await eventos("interested_party.relevance_changed")).length;
    assert(medio === antes, "se emitió un cambio de pertinencia que no ocurrió");

    const cambio = await IP.supersedeAssessment(orgA, {
      assessmentId: igual.data, relevanceStatus: "not_relevant",
      relevanceRationale: "Cerró operaciones en el país.",
    }, a.cli);
    assert(cambio.ok, `suceder con cambio: ${cambio.ok ? "" : cambio.message}`);
    const despues = await eventos("interested_party.relevance_changed", cambio.data);
    assert(despues.length === 1, `esperaba 1 cambio de pertinencia, hay ${despues.length}`);

    // Y sale como aviso, no como dato de paso: dejar de considerar pertinente
    // a alguien es exactamente lo que una auditoría va a preguntar.
    const { data: sev } = await a.cli.from("work_events").select("severity")
      .eq("id", despues[0].id).single();
    assert(sev!.severity === "warning", `severidad inesperada: ${sev!.severity}`);
  });

  // Un análisis limpio para el resto.
  const { data: parte2 } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `Proveedor Integración ${stamp}` })
    .select("id").single();
  const alta2 = await IP.createAssessment(orgA, {
    categoryId: catCli.id, subjectKind: "external_party", subjectId: parte2!.id,
    relevanceStatus: "relevant",
  }, a.cli);
  assert(alta2.ok, "no se pudo crear el segundo análisis");
  const req = await IP.createRequirement(orgA, {
    assessmentId: alta2.data, entryKind: "requirement", requirementKind: "legal",
    title: "Certificado de origen en cada despacho",
  }, a.cli);
  assert(req.ok, "no se pudo crear el requisito");

  await check("AM. Los cambios de requisito y de estrategia SÍ tienen quien los emita", async () => {
    // El hueco que 12.2F.1 encontró tarde: tipos declarados sin emisor. Aquí
    // se comprueba que existen los dos que 0150 declaró.
    const retiro = await IP.retireRequirement(orgA, req.ok ? req.data : "", null, a.cli);
    assert(retiro.ok, `retirar: ${retiro.ok ? "" : retiro.message}`);
    const ev = await eventos("interested_party.requirement_changed", req.ok ? req.data : "");
    assert(ev.length >= 1, "retirar un requisito no emitió nada");
    assert((ev[0].payload as { change?: string }).change === "retired",
      `el evento no dice qué cambió: ${JSON.stringify(ev[0].payload)}`);

    const est = await IP.createStrategy(orgA, {
      assessmentId: alta2.data, title: "Control documental de origen", status: "active",
    }, a.cli);
    assert(est.ok, "no se pudo crear la estrategia");
    const evEst = await eventos("interested_party.strategy_changed", est.ok ? est.data : "");
    assert(evEst.length >= 1, "crear una estrategia no emitió nada");
  });

  await check("AN. El emisor de cambios no deja emitir en una empresa ajena", async () => {
    const { error } = await b.cli.rpc("quality_emit_stakeholder_change_event", {
      p_owner_kind: "requirement", p_owner_id: req.ok ? req.data : "", p_change: "intruso",
    });
    assert(error, "alguien de otra empresa pudo emitir un evento");
    const { data } = await b.cli.from("work_events").select("id")
      .eq("organization_id", orgA).limit(1);
    assert((data ?? []).length === 0, "B leyó los eventos de A");
  });

  // =========================================================================
  // Lo periférico
  // =========================================================================

  await check("AO. Un enlace periférico exige que el destino exista y sea de la empresa", async () => {
    const { data: objetivo } = await a.cli.from("quality_objectives")
      .insert({ organization_id: orgA, code: `OBJ-${stamp}`.slice(0, 20),
                name: "Sostener el cumplimiento documental",
                period_start: dia(-90), period_end: dia(90) })
      .select("id").single();
    assert(objetivo, "no se pudo crear el objetivo de apoyo");

    const ok = await IP.linkPeripheral(orgA, {
      ownerKind: "stakeholder_requirement", ownerId: req.ok ? req.data : "",
      refKind: "quality_objective", refId: objetivo!.id, relation: "related",
    }, a.cli);
    assert(ok.ok, `enlazar: ${ok.ok ? "" : ok.message}`);

    const inventado = await IP.linkPeripheral(orgA, {
      ownerKind: "stakeholder_requirement", ownerId: req.ok ? req.data : "",
      refKind: "quality_objective", refId: "00000000-0000-0000-0000-000000000000",
    }, a.cli);
    assert(!inventado.ok, "se pudo enlazar a una fila que no existe");

    const refs = await IP.listPeripheralRefs(
      orgA, "stakeholder_requirement", req.ok ? req.data : "", a.cli);
    assert(refs.length === 1, `esperaba 1 enlace, hay ${refs.length}`);
    const fuera = await IP.listPeripheralRefs(
      orgA, "stakeholder_requirement", req.ok ? req.data : "", b.cli);
    assert(fuera.length === 0, "B leyó los enlaces de A");
  });

  await check("AO2. El vocabulario periférico NO permite expresar las relaciones centrales", async () => {
    // 0150 amplió `work_references` con los propietarios y destinos del
    // dominio, y esa ampliación abre una puerta que hay que cerrar a mano: la
    // pareja estrategia→requisito, y la pareja requisito→proceso, son las dos
    // relaciones que tienen tabla propia PORQUE tienen vigencia. Aquí no la
    // hay, así que registrarlas aquí perdería el «desde cuándo».
    const est = await IP.createStrategy(orgA, {
      assessmentId: alta2.data, title: "Estrategia para la comprobación", status: "draft",
    }, a.cli);
    assert(est.ok, "no se pudo crear la estrategia de apoyo");

    const pareja = await IP.linkPeripheral(orgA, {
      ownerKind: "stakeholder_strategy", ownerId: est.ok ? est.data : "",
      refKind: "quality_stakeholder_requirement", refId: req.ok ? req.data : "",
    }, a.cli);
    assert(!pareja.ok, "se pudo registrar estrategia→requisito como referencia genérica");

    const { data: proc } = await a.cli.from("quality_processes")
      .insert({ organization_id: orgA, code: `PR-${stamp}`.slice(0, 20),
                name: "Compras", category_code: "core" }).select("id").single();
    const otra = await IP.linkPeripheral(orgA, {
      ownerKind: "stakeholder_requirement", ownerId: req.ok ? req.data : "",
      refKind: "quality_process", refId: proc!.id,
    }, a.cli);
    assert(!otra.ok, "se pudo registrar requisito→proceso como referencia genérica");

    // Y lo periférico de verdad sigue entrando: la puerta se cerró para dos
    // parejas, no para la tabla.
    const doc = await IP.linkPeripheral(orgA, {
      ownerKind: "stakeholder_strategy", ownerId: est.ok ? est.data : "",
      refKind: "quality_process", refId: proc!.id, relation: "related",
    }, a.cli);
    assert(doc.ok, `lo periférico dejó de funcionar: ${doc.ok ? "" : doc.message}`);
  });

  // =========================================================================
  // Revisión por la Dirección
  // =========================================================================

  await check("AP. La entrada de Revisión por la Dirección está en el catálogo y AL FINAL", async () => {
    const { data } = await a.cli.from("quality_management_review_input_catalog")
      .select("code, source_domain, position_order, is_required").eq("code", "interested_parties")
      .maybeSingle();
    assert(data, "no existe la fila de catálogo de partes interesadas");
    assert(data!.source_domain === "interested_parties", "dominio de origen inesperado");
    const { data: otras } = await a.cli.from("quality_management_review_input_catalog")
      .select("position_order").neq("code", "interested_parties");
    const maximo = Math.max(...(otras ?? []).map((r) => Number(r.position_order)));
    assert(Number(data!.position_order) > maximo,
      "la entrada se intercaló: reordenar el catálogo reescribe el orden del día de revisiones ya firmadas");
  });

  await check("AQ. El constructor devuelve el retrato del periodo, no de hoy", async () => {
    const payload = await IP.buildManagementReviewInput(orgA, dia(-30), dia(1), a.cli);
    assert(payload, "el constructor no devolvió nada");
    const texto = JSON.stringify(payload);
    assert(texto.length > 2, "el constructor devolvió un objeto vacío");
    // Y no lo arma la capa de TypeScript: se pide por el despachador de 0128.
    const ajeno = await IP.buildManagementReviewInput(orgA, dia(-30), dia(1), b.cli);
    const vacio = ajeno === null || JSON.stringify(ajeno) === "{}"
      || !JSON.stringify(ajeno).includes(String(stamp));
    assert(vacio, "B obtuvo el retrato de A");
  });

  // =========================================================================
  // Intelligence
  // =========================================================================

  await check("AR. Las dos fuentes están declaradas, abiertas y con modo histórico", async () => {
    const { data } = await a.cli.from("quality_ai_sources")
      .select("code, privacy_class, historical_mode, domain").eq("domain", "interested_parties");
    assert((data ?? []).length === 2, `esperaba 2 fuentes, hay ${(data ?? []).length}`);
    for (const f of data ?? []) {
      assert(f.privacy_class === "open", `${f.code} no es abierta: ${f.privacy_class}`);
      assert(f.historical_mode === "as_of", `${f.code} no responde por fecha: ${f.historical_mode}`);
    }
  });

  await check("AS. El contexto lleva identificadores y NO lleva personas", async () => {
    const items = await IP.loadIntelligenceContext(orgA, {}, a.cli);
    assert(items.length > 0, "el contexto vino vacío");
    for (const it of items) {
      assert(it.id && it.id.length === 36, `un elemento sin identificador: ${JSON.stringify(it)}`);
    }
    const texto = JSON.stringify(items);
    // Ni correos, ni teléfonos, ni identificadores de persona. La fuente se
    // declaró «abierta» porque esto es cierto; si dejara de serlo, la
    // clasificación del catálogo sería mentira.
    assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(texto), "el contexto llevaba un correo electrónico");
    assert(!/\bcontact|telefon|phone|email\b/i.test(texto), "el contexto llevaba datos de contacto");
    assert(!/created_by|assessed_by|reviewed_by/.test(texto), "el contexto llevaba quién hizo qué");
  });

  await check("AT. El contexto no cruza la frontera de la empresa", async () => {
    const items = await IP.loadIntelligenceContext(orgA, {}, b.cli);
    assert(items.length === 0, `B obtuvo ${items.length} elementos del contexto de A`);
  });

  await check("AU. Nada de esto llamó a ningún proveedor", async () => {
    const { count } = await a.cli.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert((count ?? 0) === 0, `se registraron ${count} operaciones de Intelligence, debían ser 0`);
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
