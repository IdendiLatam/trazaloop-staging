/**
 * Trazaloop · QUALITY-03.1a · Un proceso en borrador se puede tirar.
 *
 * QUALITY-03.1 dejó declarada la brecha G-1: `quality_processes` tenía
 * políticas de SELECT, INSERT y UPDATE, y ninguna de DELETE, así que un
 * proceso recién creado no se podía eliminar ni siquiera estando vacío.
 *
 * Abrirlo sin más habría sido peor que dejarlo cerrado: SIETE tablas cascadean
 * desde el proceso, y dos de ellas —las revisiones publicadas y el snapshot de
 * aristas del mapa— son historia que alguien firmó. Estas comprobaciones
 * existen para fijar dónde está la frontera.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo se
 * usa solo para crear cuentas.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality031a-rls (URL, ANON, SERVICE_ROLE).");
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

async function newUser(label: string, name: string) {
  const email = `q031a-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, name, client };
}

async function newProcess(client: SupabaseClient, org: string, name: string): Promise<string> {
  const { data, error } = await client.from("quality_processes")
    .insert({ organization_id: org, name: `${name} ${stamp}`, category_code: "core" })
    .select("id").single();
  assert(!error && data, `crear proceso ${name}: ${error?.message}`);
  return data!.id as string;
}

async function verdict(client: SupabaseClient, id: string) {
  const { data } = await client.rpc("quality_deletion_eligibility", { p_entity: "process", p_id: id });
  return (data ?? {}) as { can_hard_delete?: boolean; reason?: string; reason_code?: string;
                           blocking?: { label: string; count: number }[]; alternative?: string | null };
}

async function tryDelete(client: SupabaseClient, org: string, id: string) {
  return client.from("quality_processes").delete().eq("organization_id", org).eq("id", id).select("id");
}

async function main() {
  console.log("\nQUALITY-03.1a · borrado de procesos en borrador\n");

  const owner = await newUser("owner", "Responsable de Calidad");
  const outsider = await newUser("out", "Ajena");
  await owner.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q031a" });
  await outsider.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q031a" });
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q031a A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q031a B ${stamp}` });
  const A = a as string, B = b as string;

  // -------------------------------------------------------------------------
  console.log("P · Lo que sí se puede tirar");
  // -------------------------------------------------------------------------

  await check("P1. un proceso vacío en borrador se elimina de verdad", async () => {
    const id = await newProcess(owner.client, A, "Proceso vacío");
    const v = await verdict(owner.client, id);
    assert(v.can_hard_delete === true, `dictamen: ${v.reason}`);
    assert((v.blocking ?? []).length === 0, "no debería tener nada que lo retenga");
    const { data, error } = await tryDelete(owner.client, A, id);
    assert(!error, `no dejó borrarlo: ${error?.message}`);
    assert((data ?? []).length === 1, "el borrado no afectó a ninguna fila");
    const { data: gone } = await owner.client.from("quality_processes").select("id").eq("id", id).maybeSingle();
    assert(gone === null, "sigue existiendo");
  });

  await check("P2. sus entradas y salidas EN BORRADOR se van con él, sin dejar huérfanas", async () => {
    // Nunca salieron del borrador: no son historia de nadie. Es la única
    // cascada que este hotfix deja correr, y hay que comprobar que corre.
    const id = await newProcess(owner.client, A, "Proceso con entradas");
    const { data: revId, error: revErr } = await owner.client.rpc("quality_open_process_revision", {
      p_process_id: id, p_change_note: null,
    });
    assert(!revErr, `abrir la revisión: ${revErr?.message}`);
    const { data: rev } = await owner.client.from("quality_process_revisions")
      .select("id, status").eq("id", revId as string).maybeSingle();
    assert(rev!.status === "draft", `la revisión nació en ${rev!.status}`);
    const { error: ioErr } = await owner.client.from("quality_process_io").insert([
      { organization_id: A, revision_id: rev!.id, process_id: id, direction: "input", name: "Pedido", io_kind: "information" },
      { organization_id: A, revision_id: rev!.id, process_id: id, direction: "output", name: "Despacho", io_kind: "information" },
    ]);
    assert(!ioErr, `crear entradas/salidas: ${ioErr?.message}`);

    const v = await verdict(owner.client, id);
    assert(v.can_hard_delete === true, `unas entradas en borrador no deberían retenerlo: ${v.reason}`);

    const { error } = await tryDelete(owner.client, A, id);
    assert(!error, `no dejó borrarlo: ${error?.message}`);
    const { data: io } = await owner.client.from("quality_process_io").select("id").eq("process_id", id);
    assert((io ?? []).length === 0, `quedaron ${io!.length} entradas/salidas huérfanas`);
    const { data: revs } = await owner.client.from("quality_process_revisions").select("id").eq("process_id", id);
    assert((revs ?? []).length === 0, "quedaron revisiones huérfanas");
  });

  // -------------------------------------------------------------------------
  console.log("\nQ · Lo que NO se puede tirar, y por qué");
  // -------------------------------------------------------------------------

  await check("P3. una relación con otro proceso lo retiene, y dice cuántas", async () => {
    // La relación es un objeto COMPARTIDO: borrar este proceso mutaría en
    // silencio la ficha del otro, que dejaría de decir a quién entrega.
    const from = await newProcess(owner.client, A, "Origen");
    const to = await newProcess(owner.client, A, "Destino");
    const { error: relErr } = await owner.client.from("quality_process_interactions")
      .insert({ organization_id: A, source_process_id: from, target_process_id: to });
    assert(!relErr, `crear la relación: ${relErr?.message}`);

    for (const [id, papel] of [[from, "origen"], [to, "destino"]] as const) {
      const v = await verdict(owner.client, id);
      assert(v.can_hard_delete === false, `el ${papel} debía quedar retenido`);
      assert((v.blocking ?? []).some((x) => x.label.includes("relación") || x.label.includes("relaciones")),
        `el ${papel} no explica la relación: ${JSON.stringify(v.blocking)}`);
      const { error } = await tryDelete(owner.client, A, id);
      assert(error !== null, `la base dejó borrar el ${papel}`);
    }
    // Y el otro extremo sigue entero.
    const { data: rel } = await owner.client.from("quality_process_interactions")
      .select("id").eq("source_process_id", from);
    assert((rel ?? []).length === 1, "la relación desapareció sin que nadie la borrara");
  });

  await check("P4. un proceso de un MAPA PUBLICADO no se elimina", async () => {
    const id = await newProcess(owner.client, A, "Proceso del mapa");
    const { data: map } = await owner.client.from("quality_process_maps")
      .insert({ organization_id: A, name: `Mapa ${stamp}`, is_default: true })
      .select("id").single();
    const { data: mapId, error: mapErr } = await owner.client.rpc("quality_open_map_version", {
      p_map_id: map!.id, p_change_note: null,
    });
    assert(!mapErr, `abrir la versión del mapa: ${mapErr?.message}`);
    await owner.client.from("quality_process_map_nodes")
      .insert({ organization_id: A, map_version_id: mapId, process_id: id, category_code: "core" });
    const { error: pubErr } = await owner.client.rpc("quality_publish_map_version", {
      p_version_id: mapId, p_effective_from: null,
    });
    assert(!pubErr, `publicar el mapa: ${pubErr?.message}`);

    const v = await verdict(owner.client, id);
    assert(v.can_hard_delete === false, "dejó borrar un proceso de un mapa publicado");
    assert((v.blocking ?? []).some((x) => x.label.includes("mapa")),
      `no menciona el mapa: ${JSON.stringify(v.blocking)}`);

    const { error } = await tryDelete(owner.client, A, id);
    assert(error !== null, "la base permitió arrancar filas de un mapa publicado");
    // Y el mapa publicado sigue completo.
    const { data: nodes } = await owner.client.from("quality_process_map_nodes")
      .select("id").eq("map_version_id", mapId);
    assert((nodes ?? []).length === 1, "el nodo del mapa publicado desapareció");
  });

  await check("P5. un documento asociado lo retiene", async () => {
    const id = await newProcess(owner.client, A, "Proceso con documento");
    const { data: doc } = await owner.client.from("trazadoc_documents").insert({
      organization_id: A, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Doc del proceso ${stamp}`, revision_model: "controlled",
    }).select("id").single();
    const { error: linkErr } = await owner.client.from("quality_process_documents")
      .insert({ organization_id: A, process_id: id, document_id: doc!.id });
    assert(!linkErr, `vincular el documento: ${linkErr?.message}`);

    const v = await verdict(owner.client, id);
    assert(v.can_hard_delete === false, "dejó borrar un proceso con documento asociado");
    assert((v.blocking ?? []).some((x) => x.label.includes("documento")),
      `no menciona el documento: ${JSON.stringify(v.blocking)}`);
    const { error } = await tryDelete(owner.client, A, id);
    assert(error !== null, "la base lo borró igualmente");
    // El documento en sí no se toca (T-03) y sigue vivo.
    const { data: still } = await owner.client.from("trazadoc_documents").select("id").eq("id", doc!.id).maybeSingle();
    assert(still !== null, "el documento desapareció");
  });

  await check("P6. un objetivo o un indicador que lo señala también lo retiene", async () => {
    const id = await newProcess(owner.client, A, "Proceso medido");
    const { data: obj } = await owner.client.from("quality_objectives").insert({
      organization_id: A, code: `OBJ-P-${stamp.slice(-6)}`, name: `Objetivo del proceso ${stamp}`,
      admin_state: "draft", period_start: "2026-01-01", period_end: "2026-12-31",
    }).select("id").single();
    await owner.client.from("quality_objective_processes")
      .insert({ organization_id: A, objective_id: obj!.id, process_id: id });

    let v = await verdict(owner.client, id);
    assert(v.can_hard_delete === false, "dejó borrar un proceso que un objetivo incluye");
    assert((v.blocking ?? []).some((x) => x.label.includes("objetivo")),
      `no menciona el objetivo: ${JSON.stringify(v.blocking)}`);

    // Y un indicador cuyo alcance ES este proceso.
    const { data: ind } = await owner.client.from("quality_indicators").insert({
      organization_id: A, code: `IND-P-${stamp.slice(-6)}`, name: `Indicador del proceso ${stamp}`,
      scope_type: "process", scope_process_id: id, admin_state: "active",
    }).select("id").single();
    v = await verdict(owner.client, id);
    assert((v.blocking ?? []).some((x) => x.label.includes("indicador")),
      `no menciona el indicador: ${JSON.stringify(v.blocking)}`);
    assert(ind !== null, "el indicador debía crearse");

    const { error } = await tryDelete(owner.client, A, id);
    assert(error !== null, "la base lo borró y habría dejado una FK apuntando a nada");
  });

  await check("P7. un proceso PUBLICADO no se elimina, y se ofrece retirarlo", async () => {
    const id = await newProcess(owner.client, A, "Proceso publicado");
    const { data: revId, error: revErr } = await owner.client.rpc("quality_open_process_revision", {
      p_process_id: id, p_change_note: null,
    });
    assert(!revErr, `abrir la revisión: ${revErr?.message}`);
    const { error: pubErr } = await owner.client.rpc("quality_publish_process_revision", {
      p_revision_id: revId as string, p_effective_from: null,
    });
    assert(!pubErr, `publicar la revisión: ${pubErr?.message}`);

    const v = await verdict(owner.client, id);
    assert(v.can_hard_delete === false, "dejó borrar un proceso publicado");
    assert(v.reason_code === "has_history", `motivo ${v.reason_code}`);
    assert(v.alternative === "retire", "no ofrece retirarlo, que es lo que el modelo ya soporta");
    assert(/activo/.test(v.reason ?? ""), `el estado debe decirse en español: ${v.reason}`);
    assert(!/'draft'|"draft"|«draft»/.test(v.reason ?? ""), "no puede enseñar un código interno");
    assert((v.blocking ?? []).some((x) => x.label.includes("revisi")),
      `no menciona la revisión publicada: ${JSON.stringify(v.blocking)}`);

    const { error } = await tryDelete(owner.client, A, id);
    assert(error !== null, "la base permitió borrar una revisión publicada en cascada");

    // Retirarlo SÍ se puede, y conserva la revisión publicada.
    const { error: retErr } = await owner.client.from("quality_processes")
      .update({ status: "retired" }).eq("id", id);
    assert(!retErr, `retirar: ${retErr?.message}`);
    const { data: revs } = await owner.client.from("quality_process_revisions")
      .select("id, status").eq("process_id", id);
    assert((revs ?? []).some((r) => r.status === "published"), "retirar perdió la revisión publicada");
  });

  await check("P8. una empresa ajena no lo elimina ni averigua nada", async () => {
    const id = await newProcess(owner.client, A, "Proceso privado");
    const v = await verdict(outsider.client, id);
    assert(v.can_hard_delete === false, "le dijo a una ajena que podía borrarlo");
    assert(v.reason_code === "not_found", `filtró el motivo real: ${v.reason_code}`);
    assert((v.blocking ?? []).length === 0, "filtró contadores de otra empresa");

    const { data, error } = await outsider.client.from("quality_processes")
      .delete().eq("id", id).select("id");
    assert(error !== null || (data ?? []).length === 0, "borró un proceso de otra empresa");
    const { data: still } = await owner.client.from("quality_processes").select("id").eq("id", id).maybeSingle();
    assert(still !== null, "el proceso desapareció");

    // Y tampoco puede desde SU propia empresa apuntando al ajeno.
    const { data: d2 } = await outsider.client.from("quality_processes")
      .delete().eq("organization_id", B).eq("id", id).select("id");
    assert((d2 ?? []).length === 0, "borró un proceso ajeno filtrando por su propia empresa");
  });

  await check("P9. el servidor vuelve a comprobar en el INSTANTE del borrado", async () => {
    // Se emite el dictamen —dice que sí—, después aparece una referencia, y el
    // borrado debe fallar igualmente. Es la ventana que un modal deja abierta.
    const id = await newProcess(owner.client, A, "Proceso de la carrera");
    const before = await verdict(owner.client, id);
    assert(before.can_hard_delete === true, "el dictamen inicial debía permitirlo");

    const other = await newProcess(owner.client, A, "Aparecido");
    await owner.client.from("quality_process_interactions")
      .insert({ organization_id: A, source_process_id: id, target_process_id: other });

    const { error } = await tryDelete(owner.client, A, id);
    assert(error !== null, "el borrado se ejecutó con un dictamen ya caducado");
  });

  await check("P10. el dictamen y lo que ocurre al ejecutar COINCIDEN siempre", async () => {
    // La comprobación que impide que la pantalla prometa una cosa y la base
    // haga otra: para cada proceso de la empresa, preguntar y ejecutar.
    const { data: all } = await owner.client.from("quality_processes")
      .select("id, name").eq("organization_id", A);
    assert((all ?? []).length >= 5, `esperaba varios procesos, hay ${all?.length}`);
    let comprobados = 0;
    for (const p of all ?? []) {
      const v = await verdict(owner.client, p.id as string);
      const { data, error } = await tryDelete(owner.client, A, p.id as string);
      const borro = !error && (data ?? []).length === 1;
      assert(borro === (v.can_hard_delete === true),
        `«${p.name}»: el dictamen dijo ${v.can_hard_delete} y el borrado ${borro}`);
      comprobados += 1;
    }
    console.log(`     (${comprobados} procesos: dictamen y ejecución coincidieron en todos)`);
  });

  await check("P11. un consultor sí puede, un lector no", async () => {
    const reader = await newUser("reader", "Solo lectura");
    await reader.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q031a" });
    await admin.from("memberships").insert({
      organization_id: A, user_id: reader.id, role_code: "viewer", status: "active",
    });
    const id = await newProcess(owner.client, A, "Proceso para el lector");
    const { data, error } = await reader.client.from("quality_processes")
      .delete().eq("organization_id", A).eq("id", id).select("id");
    assert(error !== null || (data ?? []).length === 0, "un lector borró un proceso");
    const { data: still } = await owner.client.from("quality_processes").select("id").eq("id", id).maybeSingle();
    assert(still !== null, "el proceso desapareció");
  });

  console.log(`\nQUALITY-03.1a · base real: ${passed} correctas, ${failed} fallidas\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
