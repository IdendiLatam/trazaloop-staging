/**
 * Trazaloop Quality · QUALITY-01.2 · Pruebas contra base REAL.
 *
 *   B · Relaciones entre procesos: una sola fila leída desde ambos extremos,
 *       creada desde cualquiera de los dos, con sus invariantes.
 *   C · Documentos de TrazaDocs en ENTRADAS y SALIDAS.
 *   D · Mapa: la versión publicada CONGELA sus relaciones.
 *   R · Revisiones: abrir arrastra los documentos; publicar reengancha.
 *   X · Aislamiento entre empresas en todo lo anterior.
 *
 * Todo corre con la SESIÓN REAL de cada usuario (RLS incluida). El cliente
 * administrativo se usa solo para crear usuarios y ajustar el plan comercial,
 * nunca para saltarse una comprobación que la prueba quiere hacer.
 *
 * Correr: npm run test:quality012-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality012-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

/** Misma guarda que QUALITY-01: nunca mezclar entornos en una prueba. */
function projectRefOf(value: string): string {
  if (/(127\.0\.0\.1|localhost)/.test(value)) return "local";
  const m =
    value.match(/(?:db\.|\/\/)([a-z0-9]{20})\.supabase\.co/) ??
    value.match(/postgres\.([a-z0-9]{20})(?::|@)/);
  return m ? m[1] : "desconocido";
}
if (DB_URL && projectRefOf(URL) !== projectRefOf(DB_URL)) {
  console.error(
    `\nABORTADO: la API apunta a «${projectRefOf(URL)}» y SUPABASE_DB_URL a «${projectRefOf(DB_URL)}».\n`
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string) {
  const email = `q012-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, email, client };
}

async function createOrg(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  return data as string;
}

/** Un proceso con una revisión en borrador y sus entradas y salidas. */
async function createProcess(
  client: SupabaseClient,
  orgId: string,
  name: string,
  categoryCode: string,
  io: { direction: "input" | "output"; name: string }[]
) {
  const { data: proc, error } = await client
    .from("quality_processes")
    .insert({ organization_id: orgId, name, category_code: categoryCode })
    .select("id")
    .single();
  assert(!error && proc, `crear proceso ${name}: ${error?.message}`);
  const processId = proc!.id as string;

  const { data: revisionId, error: revErr } = await client.rpc("quality_open_process_revision", {
    p_process_id: processId,
    p_change_note: null,
  });
  assert(!revErr && revisionId, `abrir revisión de ${name}: ${revErr?.message}`);

  const created: Record<string, string> = {};
  for (const [index, item] of io.entries()) {
    const { data, error: ioErr } = await client
      .from("quality_process_io")
      .insert({
        organization_id: orgId,
        revision_id: revisionId as string,
        process_id: processId,
        direction: item.direction,
        name: item.name,
        sort_order: index + 1,
      })
      .select("id")
      .single();
    assert(!ioErr && data, `crear ${item.direction} «${item.name}»: ${ioErr?.message}`);
    created[item.name] = data!.id as string;
  }
  return { processId, revisionId: revisionId as string, io: created };
}

async function createDocument(client: SupabaseClient, orgId: string, title: string, moduleKey: string) {
  const { data, error } = await client
    .from("trazadoc_documents")
    .insert({
      organization_id: orgId,
      source_type: "custom",
      title,
      category_code: "procedure",
      module_key: moduleKey,
    })
    .select("id")
    .single();
  assert(!error && data, `crear documento ${title}: ${error?.message}`);
  return data!.id as string;
}

async function main() {
  console.log("\nQUALITY-01.2 · relaciones, documentos de E/S y mapa\n");
  console.log(`  · entorno: ${projectRefOf(URL!)}\n`);

  const owner = await newUser("owner");
  const outsider = await newUser("outsider");

  const orgA = await createOrg(owner.client, `Q012 A ${stamp}`);
  const orgB = await createOrg(outsider.client, `Q012 B ${stamp}`);

  for (const org of [orgA, orgB]) {
    await admin.from("organization_modules")
      .update({ access_mode: "full", access_expires_at: null })
      .eq("organization_id", org).eq("module_code", "quality");
  }

  // Los tres procesos del encargo.
  const compras = await createProcess(owner.client, orgA, `Compras ${stamp}`, "core", [
    { direction: "input", name: "Necesidad de compra" },
    { direction: "output", name: "Materia prima aprobada" },
    { direction: "output", name: "Devoluciones" },
  ]);
  const produccion = await createProcess(owner.client, orgA, `Producción ${stamp}`, "core", [
    { direction: "input", name: "Materia prima" },
    { direction: "input", name: "Producto no conforme" },
    { direction: "output", name: "Producto terminado" },
  ]);
  const despachos = await createProcess(owner.client, orgA, `Despachos ${stamp}`, "core", [
    { direction: "input", name: "Producto para despacho" },
    { direction: "output", name: "Entrega confirmada" },
  ]);

  // ══════════════════════ B · Relaciones entre procesos ══════════════════════
  console.log("── B · Relaciones entre procesos ──────────────────────────\n");

  let relacionAB = "";

  await check("B1. Crear desde el extremo EMISOR (Compras entrega a Producción)", async () => {
    const { data, error } = await owner.client
      .from("quality_process_interactions")
      .insert({
        organization_id: orgA,
        source_process_id: compras.processId,
        source_output_id: compras.io["Materia prima aprobada"],
        target_process_id: produccion.processId,
        target_input_id: produccion.io["Materia prima"],
        information_item: "Materia prima aprobada",
      })
      .select("id")
      .single();
    assert(!error && data, `no se pudo crear: ${error?.message}`);
    relacionAB = data!.id as string;
  });

  await check("B2. Crear desde el extremo RECEPTOR produce la MISMA estructura", async () => {
    // «Despachos recibe de Producción»: quien lo registra es Despachos, pero la
    // fila que se escribe tiene a Producción como origen. Es la misma operación.
    const { data, error } = await owner.client
      .from("quality_process_interactions")
      .insert({
        organization_id: orgA,
        source_process_id: produccion.processId,
        source_output_id: produccion.io["Producto terminado"],
        target_process_id: despachos.processId,
        target_input_id: despachos.io["Producto para despacho"],
        information_item: "Producto terminado",
      })
      .select("source_process_id, target_process_id, source_output_id, target_input_id")
      .single();
    assert(!error && data, `no se pudo crear: ${error?.message}`);
    assert(data!.source_process_id === produccion.processId, "el origen debía ser Producción");
    assert(data!.target_process_id === despachos.processId, "el destino debía ser Despachos");
    assert(data!.source_output_id === produccion.io["Producto terminado"], "faltó la salida");
    assert(data!.target_input_id === despachos.io["Producto para despacho"], "faltó la entrada");
  });

  await check("B3. UNA sola fila: leída desde Compras es saliente y desde Producción, entrante", async () => {
    const { data } = await owner.client
      .from("quality_process_interactions")
      .select("id, source_process_id, target_process_id")
      .eq("organization_id", orgA);
    const rows = data ?? [];
    const entre = rows.filter(
      (r) =>
        (r.source_process_id === compras.processId && r.target_process_id === produccion.processId) ||
        (r.source_process_id === produccion.processId && r.target_process_id === compras.processId)
    );
    assert(entre.length === 1, `debía existir UNA relación entre ambos, hay ${entre.length}`);
    assert(entre[0].id === relacionAB, "no es la misma fila");

    const salientesDeCompras = rows.filter((r) => r.source_process_id === compras.processId);
    const entrantesAProduccion = rows.filter((r) => r.target_process_id === produccion.processId);
    assert(salientesDeCompras.some((r) => r.id === relacionAB), "no se lee como saliente de Compras");
    assert(entrantesAProduccion.some((r) => r.id === relacionAB), "no se lee como entrante de Producción");
  });

  await check("B4. Dos flujos DISTINTOS entre el mismo par son legítimos", async () => {
    // Compras devuelve producto no conforme a… perdón: Producción devuelve a
    // Compras. Es un flujo real y distinto, y la unicidad de 0112 lo impedía.
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      source_output_id: compras.io["Devoluciones"],
      target_process_id: produccion.processId,
      target_input_id: produccion.io["Producto no conforme"],
      information_item: "Devoluciones",
    });
    assert(!error, `un segundo flujo distinto debía admitirse: ${error?.message}`);
  });

  await check("B5. El DUPLICADO EXACTO se rechaza", async () => {
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      source_output_id: compras.io["Materia prima aprobada"],
      target_process_id: produccion.processId,
      target_input_id: produccion.io["Materia prima"],
      information_item: "Materia prima aprobada",
    });
    assert(error, "el duplicado exacto debía rechazarse");
    assert(error!.code === "23505", `esperaba unicidad, llegó ${error!.code}`);
  });

  await check("B6. La salida debe pertenecer al proceso ORIGEN", async () => {
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      source_output_id: produccion.io["Producto terminado"], // no es de Compras
      target_process_id: despachos.processId,
      target_input_id: despachos.io["Producto para despacho"],
      information_item: "Salida ajena",
    });
    assert(error, "una salida de otro proceso debía rechazarse");
    assert(/SALIDA del proceso origen/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("B7. La entrada debe pertenecer al proceso DESTINO", async () => {
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      source_output_id: compras.io["Materia prima aprobada"],
      target_process_id: despachos.processId,
      target_input_id: produccion.io["Materia prima"], // no es de Despachos
      information_item: "Entrada ajena",
    });
    assert(error, "una entrada de otro proceso debía rechazarse");
    assert(/ENTRADA del proceso destino/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("B8. Una salida NO puede usarse como entrada (ni al revés)", async () => {
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      source_output_id: compras.io["Necesidad de compra"], // es una ENTRADA
      target_process_id: despachos.processId,
      target_input_id: despachos.io["Producto para despacho"],
      information_item: "Dirección invertida",
    });
    assert(error, "usar una entrada como salida debía rechazarse");
  });

  await check("B9. La AUTORRELACIÓN se rechaza (decisión del modelo, no de la UI)", async () => {
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      target_process_id: compras.processId,
      information_item: "Consigo mismo",
    });
    assert(error, "un proceso no puede entregarse a sí mismo");
  });

  await check("B10. No se registran relaciones NUEVAS con un proceso retirado", async () => {
    const retirado = await createProcess(owner.client, orgA, `Obsoleto ${stamp}`, "support", [
      { direction: "output", name: "Salida antigua" },
    ]);
    const { error: retireErr } = await owner.client
      .from("quality_processes")
      .update({ status: "retired" })
      .eq("id", retirado.processId);
    assert(!retireErr, `no se pudo retirar: ${retireErr?.message}`);

    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: retirado.processId,
      source_output_id: retirado.io["Salida antigua"],
      target_process_id: produccion.processId,
      target_input_id: produccion.io["Materia prima"],
      information_item: "Desde un retirado",
    });
    assert(error, "debía rechazarse");
    assert(/retirado/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("B11. Las relaciones que YA existían con un proceso retirado se conservan", async () => {
    // Retirar no reescribe la historia: los mapas publicados siguen siendo
    // ciertos. Se retira Despachos, que ya tiene una relación entrante.
    const { error } = await owner.client
      .from("quality_processes")
      .update({ status: "retired" })
      .eq("id", despachos.processId);
    assert(!error, `no se pudo retirar: ${error?.message}`);
    const { data } = await owner.client
      .from("quality_process_interactions")
      .select("id")
      .eq("organization_id", orgA)
      .eq("target_process_id", despachos.processId);
    assert((data ?? []).length === 1, "la relación existente desapareció al retirar el proceso");
    // Se devuelve al servicio para el resto de la prueba.
    await owner.client.from("quality_processes").update({ status: "active" }).eq("id", despachos.processId);
  });

  await check("B12. Cross-tenant: otra empresa no ve ni crea relaciones ajenas", async () => {
    const { data } = await outsider.client
      .from("quality_process_interactions")
      .select("id")
      .eq("organization_id", orgA);
    assert((data ?? []).length === 0, "una empresa ajena está viendo relaciones que no son suyas");

    const { error } = await outsider.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: compras.processId,
      target_process_id: produccion.processId,
      information_item: "Intrusión",
    });
    assert(error, "una empresa ajena pudo escribir una relación");
  });

  // ═════════════ C · Documentos de TrazaDocs en entradas y salidas ═══════════
  console.log("\n── C · Documentos en entradas y salidas ───────────────────\n");

  const especificacion = await createDocument(owner.client, orgA, `Especificación MP ${stamp}`, "quality");
  const registroLote = await createDocument(owner.client, orgA, `Registro de lote ${stamp}`, "quality");
  const docAjeno = await createDocument(outsider.client, orgB, `Ajeno ${stamp}`, "quality");

  await check("C1. Una ENTRADA puede vincular un documento existente", async () => {
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: produccion.io["Materia prima"],
      document_id: especificacion,
      relation_type: "governs",
    });
    assert(!error, `no se pudo vincular: ${error?.message}`);
  });

  await check("C2. Una SALIDA puede vincular un documento existente", async () => {
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: produccion.io["Producto terminado"],
      document_id: registroLote,
      relation_type: "records",
    });
    assert(!error, `no se pudo vincular: ${error?.message}`);
  });

  await check("C3. No se duplica el documento: solo se crea la relación", async () => {
    const { count } = await owner.client
      .from("trazadoc_documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA)
      .eq("id", especificacion);
    assert(count === 1, `el documento se duplicó: hay ${count} filas`);
  });

  await check("C4. El MISMO documento puede definir dos entradas distintas", async () => {
    // Es lo que la unicidad de 0112 impedía: (proceso, documento, relación).
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: produccion.io["Producto no conforme"],
      document_id: especificacion,
      relation_type: "governs",
    });
    assert(!error, `debía admitirse: ${error?.message}`);
  });

  await check("C5. El duplicado EXACTO sobre la misma entrada se rechaza", async () => {
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: produccion.io["Materia prima"],
      document_id: especificacion,
      relation_type: "governs",
    });
    assert(error && error.code === "23505", `esperaba unicidad, llegó ${error?.code}`);
  });

  await check("C6. La entrada debe pertenecer a ESE proceso", async () => {
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: compras.io["Necesidad de compra"], // entrada de otro proceso
      document_id: especificacion,
      relation_type: "governs",
    });
    assert(error, "debía rechazarse");
    assert(/pertenecer a este proceso/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("C7. Un documento de OTRA empresa no puede vincularse", async () => {
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: produccion.io["Materia prima"],
      document_id: docAjeno,
      relation_type: "reference",
    });
    assert(error, "un documento de otra empresa jamás debe poder vincularse");
  });

  await check("C8. La relación a nivel de PROCESO sigue funcionando igual que en 0112", async () => {
    const { error } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      document_id: registroLote,
      relation_type: "governs",
    });
    assert(!error, `la relación de proceso se rompió: ${error?.message}`);
    const { error: dup } = await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      document_id: registroLote,
      relation_type: "governs",
    });
    assert(dup && dup.code === "23505", "dos relaciones idénticas de proceso debían chocar");
  });

  await check("C9. Desvincular NO borra el documento", async () => {
    const { data: link } = await owner.client
      .from("quality_process_documents")
      .select("id")
      .eq("organization_id", orgA)
      .eq("io_id", produccion.io["Producto terminado"])
      .maybeSingle();
    assert(link, "no se encontró la relación de la salida");
    const { error } = await owner.client
      .from("quality_process_documents")
      .delete()
      .eq("id", link!.id as string);
    assert(!error, `no se pudo desvincular: ${error?.message}`);

    const { count } = await owner.client
      .from("trazadoc_documents")
      .select("id", { count: "exact", head: true })
      .eq("id", registroLote);
    assert(count === 1, "desvincular se llevó por delante el documento");

    // Se vuelve a vincular para el resto de la prueba.
    await owner.client.from("quality_process_documents").insert({
      organization_id: orgA,
      process_id: produccion.processId,
      io_id: produccion.io["Producto terminado"],
      document_id: registroLote,
      relation_type: "records",
    });
  });

  await check("C10. Cross-tenant: otra empresa no ve las relaciones documentales", async () => {
    const { data } = await outsider.client
      .from("quality_process_documents")
      .select("id")
      .eq("organization_id", orgA);
    assert((data ?? []).length === 0, "una empresa ajena ve relaciones documentales que no son suyas");
  });

  // ═══════════════════════════ D · Mapa y snapshot ═══════════════════════════
  console.log("\n── D · El mapa y su versión publicada ─────────────────────\n");

  let mapId = "";
  let versionUno = "";

  await check("D1. Publicar el mapa CONGELA las relaciones vigentes", async () => {
    const { data: map, error: mapErr } = await owner.client
      .from("quality_process_maps")
      .insert({ organization_id: orgA, name: `Mapa ${stamp}`, is_default: true })
      .select("id")
      .single();
    assert(!mapErr && map, `crear mapa: ${mapErr?.message}`);
    mapId = map!.id as string;

    const { data: versionId, error: verErr } = await owner.client.rpc("quality_open_map_version", {
      p_map_id: mapId,
      p_change_note: null,
    });
    assert(!verErr && versionId, `abrir versión: ${verErr?.message}`);
    versionUno = versionId as string;

    for (const p of [compras, produccion, despachos]) {
      const { error } = await owner.client.from("quality_process_map_nodes").insert({
        organization_id: orgA,
        map_version_id: versionUno,
        process_id: p.processId,
        category_code: "core",
      });
      assert(!error, `colocar proceso: ${error?.message}`);
    }

    const { error: pubErr } = await owner.client.rpc("quality_publish_map_version", {
      p_version_id: versionUno,
      p_effective_from: null,
    });
    assert(!pubErr, `publicar: ${pubErr?.message}`);

    const { data: edges } = await owner.client
      .from("quality_process_map_edges")
      .select("source_process_id, target_process_id, source_output_name, target_input_name")
      .eq("map_version_id", versionUno);
    assert((edges ?? []).length === 3, `esperaba 3 aristas congeladas, hay ${(edges ?? []).length}`);

    const compraProduccion = (edges ?? []).find(
      (e) =>
        e.source_process_id === compras.processId &&
        e.target_process_id === produccion.processId &&
        e.source_output_name === "Materia prima aprobada"
    );
    assert(compraProduccion, "no se congeló Compras → Producción");
    assert(compraProduccion!.target_input_name === "Materia prima", "no se congeló la entrada de destino");
  });

  await check("D2. Cambiar una relación DESPUÉS no altera la versión publicada", async () => {
    const { error } = await owner.client
      .from("quality_process_interactions")
      .delete()
      .eq("id", relacionAB);
    assert(!error, `no se pudo borrar la relación: ${error?.message}`);

    const { data: edges } = await owner.client
      .from("quality_process_map_edges")
      .select("id, source_process_id, target_process_id, source_output_name, interaction_id")
      .eq("map_version_id", versionUno);
    assert((edges ?? []).length === 3, `la versión publicada cambió: ahora tiene ${(edges ?? []).length}`);
    const congelada = (edges ?? []).find(
      (e) => e.source_process_id === compras.processId && e.source_output_name === "Materia prima aprobada"
    );
    assert(congelada, "la arista borrada desapareció de la versión publicada");
    assert(congelada!.interaction_id === null,
      "la referencia a la relación borrada debía quedar en nulo, sin llevarse la arista");
  });

  await check("D3. Una versión NUEVA refleja el estado actual, sin tocar la anterior", async () => {
    const { data: versionDos, error } = await owner.client.rpc("quality_open_map_version", {
      p_map_id: mapId,
      p_change_note: "Tras retirar un flujo",
    });
    assert(!error && versionDos, `abrir segunda versión: ${error?.message}`);
    const { error: pubErr } = await owner.client.rpc("quality_publish_map_version", {
      p_version_id: versionDos as string,
      p_effective_from: null,
    });
    assert(!pubErr, `publicar segunda versión: ${pubErr?.message}`);

    const { data: nuevas } = await owner.client
      .from("quality_process_map_edges")
      .select("id")
      .eq("map_version_id", versionDos as string);
    assert((nuevas ?? []).length === 2, `la versión nueva debía tener 2 aristas, tiene ${(nuevas ?? []).length}`);

    const { data: viejas } = await owner.client
      .from("quality_process_map_edges")
      .select("id")
      .eq("map_version_id", versionUno);
    assert((viejas ?? []).length === 3, "publicar una versión nueva alteró la anterior");
  });

  await check("D4. Nadie puede escribir el snapshot a mano: solo lo escribe la RPC", async () => {
    const { error: ins } = await owner.client.from("quality_process_map_edges").insert({
      organization_id: orgA,
      map_version_id: versionUno,
      source_process_id: compras.processId,
      target_process_id: despachos.processId,
      source_output_name: "Inventado",
    });
    assert(ins, "una sesión de cliente pudo INSERTAR una arista publicada");

    const { data: edge } = await owner.client
      .from("quality_process_map_edges")
      .select("id")
      .eq("map_version_id", versionUno)
      .limit(1)
      .maybeSingle();
    assert(edge, "no había arista que intentar modificar");

    const { data: updated } = await owner.client
      .from("quality_process_map_edges")
      .update({ source_output_name: "Manipulado" })
      .eq("id", edge!.id as string)
      .select("id");
    assert((updated ?? []).length === 0, "una sesión de cliente pudo MODIFICAR una arista publicada");

    const { data: deleted } = await owner.client
      .from("quality_process_map_edges")
      .delete()
      .eq("id", edge!.id as string)
      .select("id");
    assert((deleted ?? []).length === 0, "una sesión de cliente pudo BORRAR una arista publicada");
  });

  await check("D5. Solo se congelan las relaciones cuyos DOS extremos están en el mapa", async () => {
    const suelto = await createProcess(owner.client, orgA, `Suelto ${stamp}`, "support", [
      { direction: "output", name: "Algo" },
    ]);
    const { error } = await owner.client.from("quality_process_interactions").insert({
      organization_id: orgA,
      source_process_id: suelto.processId,
      source_output_id: suelto.io["Algo"],
      target_process_id: produccion.processId,
      target_input_id: produccion.io["Materia prima"],
      information_item: "Desde fuera del mapa",
    });
    assert(!error, `crear la relación: ${error?.message}`);

    const { data: versionTres } = await owner.client.rpc("quality_open_map_version", {
      p_map_id: mapId, p_change_note: null,
    });
    await owner.client.rpc("quality_publish_map_version", {
      p_version_id: versionTres as string, p_effective_from: null,
    });
    const { data: edges } = await owner.client
      .from("quality_process_map_edges")
      .select("source_process_id")
      .eq("map_version_id", versionTres as string);
    assert(
      !(edges ?? []).some((e) => e.source_process_id === suelto.processId),
      "se congeló una flecha hacia un proceso que no está dibujado"
    );
  });

  await check("D6. Cross-tenant: otra empresa no lee el snapshot", async () => {
    const { data } = await outsider.client
      .from("quality_process_map_edges")
      .select("id")
      .eq("organization_id", orgA);
    assert((data ?? []).length === 0, "una empresa ajena lee el mapa publicado de otra");
  });

  // ═════════════════════ R · Revisiones y continuidad ════════════════════════
  console.log("\n── R · Revisiones: continuidad del modelo ─────────────────\n");

  await check("R1. Publicar la revisión y abrir otra COPIA entradas, salidas y sus documentos", async () => {
    const { error: pubErr } = await owner.client.rpc("quality_publish_process_revision", {
      p_revision_id: produccion.revisionId,
      p_effective_from: null,
    });
    assert(!pubErr, `publicar revisión: ${pubErr?.message}`);

    const { data: nuevaRevision, error } = await owner.client.rpc("quality_open_process_revision", {
      p_process_id: produccion.processId,
      p_change_note: "Segunda revisión",
    });
    assert(!error && nuevaRevision, `abrir revisión: ${error?.message}`);

    const { data: io } = await owner.client
      .from("quality_process_io")
      .select("id, direction, name")
      .eq("revision_id", nuevaRevision as string);
    assert((io ?? []).length === 3, `esperaba 3 entradas/salidas copiadas, hay ${(io ?? []).length}`);

    const materiaPrima = (io ?? []).find((r) => r.name === "Materia prima");
    assert(materiaPrima, "no se copió la entrada «Materia prima»");

    const { data: docs } = await owner.client
      .from("quality_process_documents")
      .select("document_id")
      .eq("io_id", materiaPrima!.id as string);
    assert((docs ?? []).length === 1, "los documentos de la entrada no se arrastraron a la revisión nueva");
    assert(docs![0].document_id === especificacion, "se arrastró un documento distinto");
  });

  await check("R2. Publicar reengancha las relaciones a las entradas y salidas VIGENTES", async () => {
    const { data: draft } = await owner.client
      .from("quality_process_revisions")
      .select("id")
      .eq("process_id", produccion.processId)
      .eq("status", "draft")
      .maybeSingle();
    assert(draft, "no había borrador que publicar");

    const { error } = await owner.client.rpc("quality_publish_process_revision", {
      p_revision_id: draft!.id as string,
      p_effective_from: null,
    });
    assert(!error, `publicar: ${error?.message}`);

    const { data: relacion } = await owner.client
      .from("quality_process_interactions")
      .select("target_input_id")
      .eq("organization_id", orgA)
      .eq("source_process_id", compras.processId)
      .eq("target_process_id", produccion.processId)
      // Hay dos flujos entre este par (B4): se pide el concreto, no «uno».
      .eq("information_item", "Devoluciones")
      .maybeSingle();
    assert(relacion, "se perdió la relación");

    const { data: io } = await owner.client
      .from("quality_process_io")
      .select("revision_id, name")
      .eq("id", relacion!.target_input_id as string)
      .maybeSingle();
    assert(io, "la relación quedó sin entrada");
    assert(io!.revision_id === draft!.id, "la relación sigue apuntando a la revisión antigua");
    assert(io!.name === "Producto no conforme", "reenganchó a la entrada equivocada");
  });

  // ═════════════════════ S · Privilegios del snapshot ═══════════════════════
  //
  // Estas dos comprobaciones necesitan SQL directo (los privilegios no se
  // consultan por PostgREST) y son justo las que descubrieron el defecto: en
  // local el entorno concedía Dxtm sobre cada tabla nueva y en un proyecto
  // remoto concede arwdDxtm — es decir, también DML. Conceder SELECT no quita
  // lo que ya venía dado; hay que revocarlo (0115).
  if (DB_URL) {
    console.log("\n── S · Privilegios (SQL directo) ──────────────────────────\n");
    const { Client } = await import("pg");
    const pg = new Client({ connectionString: DB_URL });
    await pg.connect();

    await check("S1. authenticated solo puede LEER el snapshot del mapa", async () => {
      const { rows } = await pg.query(
        `select privilege_type from information_schema.role_table_grants
          where table_name = 'quality_process_map_edges' and grantee = 'authenticated'`
      );
      const privileges = rows.map((r) => r.privilege_type).sort();
      assert(
        privileges.length === 1 && privileges[0] === "SELECT",
        `authenticated tiene ${privileges.join(", ") || "nada"} — debía tener solo SELECT`
      );
    });

    await check("S2. anon no conserva NINGÚN privilegio sobre el snapshot", async () => {
      const { rows } = await pg.query(
        `select privilege_type from information_schema.role_table_grants
          where table_name = 'quality_process_map_edges' and grantee = 'anon'`
      );
      assert(rows.length === 0, `anon tiene ${rows.map((r) => r.privilege_type).join(", ")}`);
    });

    await check("S3. El snapshot no tiene política de escritura de ningún tipo", async () => {
      const { rows } = await pg.query(
        `select polcmd from pg_policy where polrelid = 'public.quality_process_map_edges'::regclass`
      );
      assert(rows.length === 1, `esperaba una sola política, hay ${rows.length}`);
      assert(rows[0].polcmd === "r", `la única política debía ser de SELECT, es ${rows[0].polcmd}`);
    });

    await pg.end();
  } else {
    console.log("\n  · sin SUPABASE_DB_URL: se omiten las comprobaciones de privilegios (S1–S3)\n");
  }

  console.log(`\nQUALITY-01.2 base real: ${passed} ✔, ${failed} ✘\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
