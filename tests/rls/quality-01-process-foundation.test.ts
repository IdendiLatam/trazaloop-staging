/**
 * Trazaloop Quality · QUALITY-01 · Pruebas de la fundación de Procesos.
 *
 * Cubre el vertical completo contra una base REAL (local o staging):
 * cargos, asignaciones con vigencia, procesos con revisiones inmutables,
 * entradas/salidas, interacciones, mapa versionado con publicación, relación
 * con TrazaDocs, autorización por rol y aislamiento multiempresa.
 *
 * Correr:  npm run test:quality01
 *
 * Variables (.env.local o exportadas):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL (opcional)
 *
 * El service_role se usa SOLO para crear usuarios de prueba; jamás forma parte
 * del flujo de la aplicación.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality01-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

/**
 * Guarda de ENTORNO. `dotenv` no pisa las variables ya exportadas, pero SÍ
 * rellena las que falten: al apuntar la API a staging y olvidar SUPABASE_DB_URL,
 * las comprobaciones por SQL directo se ejecutarían contra la base LOCAL sin
 * que nada lo delatara, y la prueba diría "verde en staging" sin haberlo mirado.
 *
 * Aquí se exige que ambas variables señalen al MISMO proyecto: o las dos a la
 * base local, o las dos al mismo ref remoto. En caso contrario se aborta.
 */
function projectRefOf(value: string): string {
  if (/(127\.0\.0\.1|localhost)/.test(value)) return "local";
  // Conexión directa (db.<ref>.supabase.co) o a través del pooler, donde el ref
  // viaja en el usuario: postgres.<ref>[:contraseña]@…
  const m =
    value.match(/(?:db\.|\/\/)([a-z0-9]{20})\.supabase\.co/) ??
    value.match(/postgres\.([a-z0-9]{20})(?::|@)/);
  return m ? m[1] : "desconocido";
}

if (DB_URL) {
  const apiRef = projectRefOf(URL);
  const dbRef = projectRefOf(DB_URL);
  if (apiRef !== dbRef) {
    console.error(
      `\nABORTADO: la API apunta a «${apiRef}» y SUPABASE_DB_URL a «${dbRef}».\n` +
        "Mezclar entornos daría un resultado en verde sin haber comprobado el destino real.\n" +
        "Exporta SUPABASE_DB_URL del mismo proyecto, o quítala para omitir las comprobaciones por SQL.\n"
    );
    process.exit(1);
  }
  console.log(`  · API y SQL directo apuntan al mismo proyecto: ${apiRef}`);
}

let passed = 0;
let failed = 0;
function ok(n: string) { passed += 1; console.log(`  ✔ ${n}`); }
function fail(n: string, d?: unknown) { failed += 1; console.error(`  ✘ ${n}`, d ?? ""); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); ok(n); } catch (e) { fail(n, e instanceof Error ? e.message : e); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function newUser(label: string) {
  const email = `q01-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
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

async function main() {
  console.log("\nTrazaloop Quality · QUALITY-01 · fundación de procesos\n");

  const userA = await newUser("a");      // admin de A
  const userB = await newUser("b");      // admin de B (forastero para A)
  const userC = await newUser("c");      // consultant de A
  const userD = await newUser("d");      // quality de A

  const orgA = await createOrg(userA.client, `Q01 Org A ${Date.now()}`);
  const orgB = await createOrg(userB.client, `Q01 Org B ${Date.now()}`);

  for (const [uid, role] of [[userC.id, "consultant"], [userD.id, "quality"]] as const) {
    const { error } = await admin.from("memberships").insert({
      organization_id: orgA, user_id: uid, role_code: role, status: "active",
    });
    if (error) throw new Error(`fixture membership ${role}: ${error.message}`);
  }

  let positionId = "";
  let processId = "";
  let processId2 = "";
  let revisionId = "";
  let outputId = "";
  let inputId = "";
  let mapId = "";
  let mapVersionId = "";

  // ─────────────────────────── Módulo y catálogo ───────────────────────────

  await check("1. El módulo Quality es funcional y asignable (catálogo en BD)", async () => {
    const { data } = await userA.client.from("modules").select("code, is_available, is_functional").eq("code", "quality").maybeSingle();
    assert(data, "el módulo quality no está en el catálogo");
    assert(data!.is_functional === true, "quality debía quedar is_functional=true");
    assert(data!.is_available === true, "quality debía quedar is_available=true");
  });

  await check("2. Una empresa NO puede autoasignarse el módulo Quality", async () => {
    const { error } = await userA.client.rpc("set_organization_module_access", {
      p_organization_id: orgA, p_module_code: "quality", p_target_state: "full",
    });
    assert(error, "un admin de empresa pudo asignarse el módulo Quality");
  });

  await check("3. Las cuatro categorías maestras existen y son visibles", async () => {
    const { data } = await userA.client
      .from("quality_process_categories").select("code, name").is("organization_id", null);
    const codes = (data ?? []).map((c) => c.code).sort();
    assert(codes.length === 4, `esperaba 4 categorías base, hay ${codes.length}`);
    for (const c of ["core", "strategic", "support", "system"]) {
      assert(codes.includes(c), `falta la categoría ${c}`);
    }
  });

  await check("4. El catálogo base de categorías es de solo lectura", async () => {
    const { data: before } = await userA.client
      .from("quality_process_categories").select("id, name").eq("code", "core").is("organization_id", null).single();
    await userA.client.from("quality_process_categories").update({ name: "Alterado" }).eq("id", before!.id);
    const { data: after } = await userA.client
      .from("quality_process_categories").select("name").eq("id", before!.id).single();
    assert(after?.name === before!.name, "se pudo alterar una categoría del catálogo base");
  });

  // ─────────────────────────────── Cargos ──────────────────────────────────

  await check("5. Admin crea un cargo", async () => {
    const { data, error } = await userA.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Director de Calidad", code: "DIR-CAL", description: "Responsable del SGC" })
      .select("id").single();
    assert(!error && data, `no se pudo crear el cargo: ${error?.message}`);
    positionId = data!.id;
  });

  await check("6. Consultant NO puede crear cargos (solo admin/quality)", async () => {
    const { error } = await userC.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Cargo del consultor" });
    assert(error, "un consultant pudo crear un cargo");
  });

  await check("7. El nombre de cargo es único dentro de la empresa", async () => {
    const { error } = await userA.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "director de calidad" });
    assert(error, "se pudo duplicar el nombre de un cargo");
  });

  await check("8. Asignación de persona al cargo, con vigencia", async () => {
    const { data, error } = await userA.client.from("quality_position_assignments")
      .insert({ organization_id: orgA, position_id: positionId, profile_id: userD.id,
                assignment_type: "holder", effective_from: "2026-01-01" })
      .select("id, effective_from, effective_to").single();
    assert(!error && data, `no se pudo asignar: ${error?.message}`);
    assert(data!.effective_to === null, "la asignación vigente no debía tener fin");
  });

  await check("9. La persona asignada debe ser miembro de la empresa", async () => {
    const { error } = await userA.client.from("quality_position_assignments")
      .insert({ organization_id: orgA, position_id: positionId, profile_id: userB.id, assignment_type: "holder" });
    assert(error, "se pudo asignar a una persona de otra empresa");
  });

  await check("10. Un cargo tiene como máximo UN titular vigente", async () => {
    const { error } = await userA.client.from("quality_position_assignments")
      .insert({ organization_id: orgA, position_id: positionId, profile_id: userC.id, assignment_type: "holder" });
    assert(error, "se pudieron tener dos titulares vigentes del mismo cargo");
  });

  await check("11. La vista de titular actual resuelve quién ocupa el cargo", async () => {
    const { data } = await userA.client
      .from("v_quality_position_current_holder").select("position_name, profile_id").eq("position_id", positionId).maybeSingle();
    assert(data, "la vista no devolvió el cargo");
    assert(data!.profile_id === userD.id, "el titular resuelto no es el esperado");
  });

  // ────────────────────────────── Procesos ─────────────────────────────────

  await check("12. Consultant crea un proceso con propietario = CARGO", async () => {
    const { data, error } = await userC.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Gestión de la calidad", code: "P-SIS-01",
                category_code: "system", owner_position_id: positionId })
      .select("id, status, current_revision").single();
    assert(!error && data, `no se pudo crear el proceso: ${error?.message}`);
    assert(data!.status === "draft", "un proceso nace en borrador");
    processId = data!.id;
  });

  await check("13. El propietario del proceso NO puede ser un cargo de otra empresa", async () => {
    const { data: posB } = await userB.client.from("quality_positions")
      .insert({ organization_id: orgB, name: "Cargo de B" }).select("id").single();
    const { error } = await userA.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Proceso con dueño ajeno", category_code: "core", owner_position_id: posB!.id });
    assert(error, "un proceso pudo apuntar a un cargo de OTRA empresa");
  });

  await check("14. La categoría del proceso debe existir en el catálogo", async () => {
    const { error } = await userA.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Proceso categoría inventada", category_code: "inexistente" });
    assert(error, "se aceptó una categoría inexistente");
  });

  await check("15. Abrir revisión de proceso (RPC) es idempotente", async () => {
    const { data: r1, error: e1 } = await userC.client.rpc("quality_open_process_revision", { p_process_id: processId });
    assert(!e1 && r1, `no se pudo abrir la revisión: ${e1?.message}`);
    const { data: r2 } = await userC.client.rpc("quality_open_process_revision", { p_process_id: processId });
    assert(r1 === r2, "abrir dos veces creó dos borradores");
    revisionId = r1 as string;
  });

  await check("16. Editar propósito y alcance en el borrador", async () => {
    const { error } = await userC.client.from("quality_process_revisions")
      .update({ purpose: "Asegurar la eficacia del SGC", scope: "Toda la organización" })
      .eq("id", revisionId);
    assert(!error, `no se pudo editar el borrador: ${error?.message}`);
  });

  await check("17. Registrar entradas y salidas estructuradas", async () => {
    const { data: inp, error: e1 } = await userC.client.from("quality_process_io")
      .insert({ organization_id: orgA, revision_id: revisionId, process_id: processId,
                direction: "input", name: "Política de calidad", io_kind: "document", sort_order: 1 })
      .select("id").single();
    assert(!e1 && inp, `no se pudo crear la entrada: ${e1?.message}`);
    const { data: out, error: e2 } = await userC.client.from("quality_process_io")
      .insert({ organization_id: orgA, revision_id: revisionId, process_id: processId,
                direction: "output", name: "Informe de revisión", io_kind: "record", sort_order: 1 })
      .select("id").single();
    assert(!e2 && out, `no se pudo crear la salida: ${e2?.message}`);
    outputId = out!.id;
  });

  await check("18. Consultant NO puede publicar una revisión", async () => {
    const { error } = await userC.client.rpc("quality_publish_process_revision", { p_revision_id: revisionId });
    assert(error, "un consultant pudo publicar un proceso");
  });

  await check("19. Quality publica la revisión y el proceso queda activo", async () => {
    const { data, error } = await userD.client.rpc("quality_publish_process_revision", {
      p_revision_id: revisionId, p_effective_from: "2026-02-01",
    });
    assert(!error, `no se pudo publicar: ${error?.message}`);
    assert(data === 1, `la primera revisión debía ser la 1, fue ${data}`);
    const { data: proc } = await userA.client.from("quality_processes")
      .select("status, current_revision").eq("id", processId).single();
    assert(proc?.status === "active", "el proceso debía quedar activo tras publicar");
    assert(proc?.current_revision === 1, "current_revision no se actualizó");
  });

  await check("20. Una revisión PUBLICADA es inmutable", async () => {
    const { data: before } = await userA.client.from("quality_process_revisions")
      .select("purpose").eq("id", revisionId).single();
    await userD.client.from("quality_process_revisions").update({ purpose: "Alterado sin revisión" }).eq("id", revisionId);
    const { data: after } = await userA.client.from("quality_process_revisions")
      .select("purpose, status").eq("id", revisionId).single();
    assert(after?.purpose === before!.purpose, "se pudo editar el contenido de una revisión publicada");
    assert(after?.status === "published", "la revisión debía seguir publicada");
  });

  await check("21. Las entradas/salidas de una revisión publicada no se tocan", async () => {
    const { error } = await userD.client.from("quality_process_io")
      .insert({ organization_id: orgA, revision_id: revisionId, process_id: processId,
                direction: "input", name: "Entrada colada tras publicar" });
    assert(error, "se pudo añadir una entrada a una revisión publicada");
  });

  await check("22. Nueva revisión copia el contenido vigente y queda editable", async () => {
    const { data: r2, error } = await userD.client.rpc("quality_open_process_revision", {
      p_process_id: processId, p_change_note: "Ajuste de alcance",
    });
    assert(!error && r2, `no se pudo abrir la revisión 2: ${error?.message}`);
    const { data: rev } = await userA.client.from("quality_process_revisions")
      .select("revision_number, status, purpose").eq("id", r2 as string).single();
    assert(rev?.revision_number === 2, "la nueva revisión debía ser la 2");
    assert(rev?.status === "draft", "la nueva revisión debía nacer en borrador");
    assert(rev?.purpose === "Asegurar la eficacia del SGC", "no se copió el propósito vigente");
    const { data: io } = await userA.client.from("quality_process_io").select("id").eq("revision_id", r2 as string);
    assert((io ?? []).length === 2, "no se copiaron las entradas/salidas vigentes");
  });

  await check("23. Publicar la revisión 2 cierra la vigencia de la 1", async () => {
    const { data: draft } = await userA.client.from("quality_process_revisions")
      .select("id").eq("process_id", processId).eq("status", "draft").single();
    const { error } = await userD.client.rpc("quality_publish_process_revision", {
      p_revision_id: draft!.id, p_effective_from: "2026-03-01",
    });
    assert(!error, `no se pudo publicar la revisión 2: ${error?.message}`);
    const { data: r1 } = await userA.client.from("quality_process_revisions")
      .select("status, effective_to").eq("id", revisionId).single();
    assert(r1?.status === "superseded", "la revisión 1 debía quedar superada");
    assert(r1?.effective_to === "2026-03-01", "la revisión 1 debía cerrar su vigencia");
    const { data: vig } = await userA.client.from("quality_process_revisions")
      .select("revision_number").eq("process_id", processId).eq("status", "published").is("effective_to", null).single();
    assert(vig?.revision_number === 2, "la vigente debía ser la revisión 2");
  });

  await check("24. Se puede responder qué revisión regía en una fecha pasada", async () => {
    const { data } = await userA.client.from("quality_process_revisions")
      .select("revision_number, effective_from, effective_to")
      .eq("process_id", processId).lte("effective_from", "2026-02-15");
    const vigente = (data ?? []).filter(
      (r) => r.effective_to === null || r.effective_to > "2026-02-15"
    );
    assert(vigente.length === 1, `esperaba una única revisión vigente el 15/02, hay ${vigente.length}`);
    assert(vigente[0].revision_number === 1, "el 15/02 regía la revisión 1");
  });

  // ──────────────────────────── Interacciones ──────────────────────────────

  await check("25. Segundo proceso e interacción estructurada entre ambos", async () => {
    const { data: p2, error: e } = await userA.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Producción", code: "P-MIS-01",
                category_code: "core", owner_position_id: positionId })
      .select("id").single();
    assert(!e && p2, `no se pudo crear el segundo proceso: ${e?.message}`);
    processId2 = p2!.id;

    const revId2 = (await userA.client.rpc("quality_open_process_revision", { p_process_id: processId2 })).data as string;
    const { data: inp } = await userA.client.from("quality_process_io")
      .insert({ organization_id: orgA, revision_id: revId2, process_id: processId2,
                direction: "input", name: "Informe de revisión", io_kind: "record" })
      .select("id").single();
    inputId = inp!.id;

    const { error: e2 } = await userA.client.from("quality_process_interactions").insert({
      organization_id: orgA, source_process_id: processId, target_process_id: processId2,
      source_output_id: outputId, target_input_id: inputId,
      information_item: "Informe de revisión", description: "Alimenta la planificación de producción",
    });
    assert(!e2, `no se pudo crear la interacción: ${e2?.message}`);
  });

  await check("26. Una interacción no puede apuntarse a sí misma", async () => {
    const { error } = await userA.client.from("quality_process_interactions")
      .insert({ organization_id: orgA, source_process_id: processId, target_process_id: processId });
    assert(error, "un proceso pudo interactuar consigo mismo");
  });

  await check("27. La salida referenciada debe pertenecer al proceso origen", async () => {
    const { error } = await userA.client.from("quality_process_interactions").insert({
      organization_id: orgA, source_process_id: processId2, target_process_id: processId,
      source_output_id: outputId, information_item: "Salida ajena",
    });
    assert(error, "una interacción pudo referenciar la salida de otro proceso");
  });

  // ─────────────────────────── Mapa de procesos ────────────────────────────

  await check("28. Crear mapa y abrir su primera versión", async () => {
    const { data: map, error } = await userA.client.from("quality_process_maps")
      .insert({ organization_id: orgA, name: "Mapa de procesos", is_default: true })
      .select("id").single();
    assert(!error && map, `no se pudo crear el mapa: ${error?.message}`);
    mapId = map!.id;
    const { data: v, error: e2 } = await userA.client.rpc("quality_open_map_version", { p_map_id: mapId });
    assert(!e2 && v, `no se pudo abrir la versión: ${e2?.message}`);
    mapVersionId = v as string;
  });

  await check("29. Colocar procesos en el mapa por categoría", async () => {
    const { error } = await userA.client.from("quality_process_map_nodes").insert([
      { organization_id: orgA, map_version_id: mapVersionId, process_id: processId, category_code: "system", sort_order: 1 },
      { organization_id: orgA, map_version_id: mapVersionId, process_id: processId2, category_code: "core", sort_order: 1 },
    ]);
    assert(!error, `no se pudieron colocar los nodos: ${error?.message}`);
  });

  await check("30. Un proceso no se repite dentro de la misma versión del mapa", async () => {
    const { error } = await userA.client.from("quality_process_map_nodes")
      .insert({ organization_id: orgA, map_version_id: mapVersionId, process_id: processId, category_code: "core" });
    assert(error, "el mismo proceso se pudo colocar dos veces");
  });

  await check("31. Consultant NO puede publicar el mapa", async () => {
    const { error } = await userC.client.rpc("quality_publish_map_version", { p_version_id: mapVersionId });
    assert(error, "un consultant pudo publicar el mapa");
  });

  await check("32. Publicar el mapa lo convierte en la versión oficial", async () => {
    const { data, error } = await userD.client.rpc("quality_publish_map_version", {
      p_version_id: mapVersionId, p_effective_from: "2026-03-01",
    });
    assert(!error, `no se pudo publicar el mapa: ${error?.message}`);
    assert(data === 1, "la primera versión debía ser la 1");
    const { data: v } = await userA.client.from("quality_process_map_versions")
      .select("status, effective_to, published_at").eq("id", mapVersionId).single();
    assert(v?.status === "published" && v?.effective_to === null, "la versión no quedó vigente");
    assert(v?.published_at, "no se registró la fecha de publicación");
  });

  await check("33. Una versión PUBLICADA del mapa no se edita", async () => {
    const { data: before } = await userA.client.from("quality_process_map_versions")
      .select("change_note").eq("id", mapVersionId).single();
    await userD.client.from("quality_process_map_versions").update({ change_note: "Alterado" }).eq("id", mapVersionId);
    const { data: after } = await userA.client.from("quality_process_map_versions")
      .select("change_note").eq("id", mapVersionId).single();
    assert(after?.change_note === before!.change_note, "se pudo editar una versión publicada del mapa");
  });

  await check("34. Los nodos de una versión publicada no se modifican", async () => {
    const { error } = await userD.client.from("quality_process_map_nodes")
      .insert({ organization_id: orgA, map_version_id: mapVersionId, process_id: processId2, category_code: "support" });
    assert(error, "se pudo añadir un nodo a una versión publicada");
    const { count } = await userA.client.from("quality_process_map_nodes")
      .select("id", { count: "exact", head: true }).eq("map_version_id", mapVersionId);
    assert(count === 2, `la versión publicada debía conservar 2 nodos, tiene ${count}`);
  });

  await check("35. No se publica un mapa vacío", async () => {
    const { data: m2 } = await userA.client.from("quality_process_maps")
      .insert({ organization_id: orgA, name: "Mapa vacío" }).select("id").single();
    const { data: v2 } = await userA.client.rpc("quality_open_map_version", { p_map_id: m2!.id });
    const { error } = await userD.client.rpc("quality_publish_map_version", { p_version_id: v2 as string });
    assert(error, "se pudo publicar un mapa sin procesos");
  });

  await check("36. Nueva versión del mapa copia los nodos de la vigente", async () => {
    const { data: v2, error } = await userA.client.rpc("quality_open_map_version", {
      p_map_id: mapId, p_change_note: "Se añade apoyo",
    });
    assert(!error && v2, `no se pudo abrir la versión 2: ${error?.message}`);
    const { count } = await userA.client.from("quality_process_map_nodes")
      .select("id", { count: "exact", head: true }).eq("map_version_id", v2 as string);
    assert(count === 2, `la versión 2 debía heredar 2 nodos, tiene ${count}`);
  });

  // ───────────────────────────── TrazaDocs ─────────────────────────────────

  await check("37. Asociar un documento EXISTENTE de TrazaDocs al proceso", async () => {
    const { data: doc, error: e } = await userA.client.from("trazadoc_documents")
      .insert({ organization_id: orgA, title: "Procedimiento de revisión por la dirección", source_type: "custom" })
      .select("id").single();
    assert(!e && doc, `no se pudo crear el documento: ${e?.message}`);
    const { error: e2 } = await userA.client.from("quality_process_documents")
      .insert({ organization_id: orgA, process_id: processId, document_id: doc!.id, relation_type: "governs" });
    assert(!e2, `no se pudo asociar el documento: ${e2?.message}`);
    const { count } = await userA.client.from("quality_process_documents")
      .select("id", { count: "exact", head: true }).eq("process_id", processId);
    assert(count === 1, "la relación documento↔proceso no quedó registrada");
  });

  await check("38. No se puede asociar un documento de OTRA empresa", async () => {
    const { data: docB } = await userB.client.from("trazadoc_documents")
      .insert({ organization_id: orgB, title: "Documento de B", source_type: "custom" }).select("id").single();
    const { error } = await userA.client.from("quality_process_documents")
      .insert({ organization_id: orgA, process_id: processId, document_id: docB!.id });
    assert(error, "se pudo asociar un documento de otra empresa");
  });

  await check("39. Asociar el documento NO lo duplica", async () => {
    const { count } = await userA.client.from("trazadoc_documents")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 1, `Quality no debe crear documentos: hay ${count} en la empresa A`);
  });

  // ───────────────────────── Aislamiento multiempresa ──────────────────────

  await check("40. La empresa B no ve NADA de Quality de la empresa A", async () => {
    const tables = [
      "quality_positions", "quality_position_assignments", "quality_processes",
      "quality_process_revisions", "quality_process_io", "quality_process_interactions",
      "quality_process_maps", "quality_process_map_versions", "quality_process_map_nodes",
      "quality_process_documents",
    ];
    for (const t of tables) {
      const { data } = await userB.client.from(t).select("id").eq("organization_id", orgA);
      assert((data ?? []).length === 0, `B pudo leer ${t} de la empresa A`);
    }
  });

  await check("41. La empresa B no puede escribir en la empresa A", async () => {
    const { error: e1 } = await userB.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Cargo intruso" });
    assert(e1, "B pudo crear un cargo en la empresa A");
    const { error: e2 } = await userB.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Proceso intruso", category_code: "core" });
    assert(e2, "B pudo crear un proceso en la empresa A");
  });

  await check("42. B no puede publicar una revisión de A ni con la RPC", async () => {
    const { data: draft } = await userA.client.from("quality_process_revisions")
      .select("id").eq("process_id", processId2).eq("status", "draft").maybeSingle();
    if (draft) {
      const { error } = await userB.client.rpc("quality_publish_process_revision", { p_revision_id: draft.id });
      assert(error, "B pudo publicar una revisión de la empresa A");
    }
  });

  await check("43. La vista de titulares aísla por empresa", async () => {
    const { data } = await userB.client.from("v_quality_position_current_holder")
      .select("position_id").eq("organization_id", orgA);
    assert((data ?? []).length === 0, "B pudo ver los cargos de la empresa A");
  });

  // ───────── Capa de lectura: las MISMAS consultas de lib/db (PostgREST) ────
  //
  // Las relaciones de Quality usan FK COMPUESTAS (organization_id, id). Un
  // embed sin la pista del constraint puede quedar ambiguo o directamente ser
  // rechazado, y eso no lo detecta ni el typecheck ni el build: solo revienta
  // al abrir la pantalla. Estas comprobaciones ejecutan literalmente las
  // cadenas select de lib/db/quality-processes.ts.

  await check("44. Procesos con el cargo propietario incrustado (FK compuesta)", async () => {
    const { data, error } = await userA.client
      .from("quality_processes")
      .select(
        "id, code, name, category_code, status, current_revision, owner_position_id, quality_positions!quality_processes_owner_position_fk(name)"
      )
      .eq("organization_id", orgA)
      .order("name", { ascending: true });
    assert(!error, `PostgREST rechazó el embed del propietario: ${error?.message}`);
    const row = (data ?? []).find((r) => r.id === processId);
    assert(row, "no se encontró el proceso");
    const owner = row!.quality_positions as { name?: string } | null;
    assert(owner?.name === "Director de Calidad", "el cargo propietario no llegó incrustado");
  });

  await check("45. Interacciones con origen y destino incrustados (dos FK a la misma tabla)", async () => {
    const { data, error } = await userA.client
      .from("quality_process_interactions")
      .select(
        "id, source_process_id, target_process_id, information_item, description, source:quality_processes!quality_process_interactions_source_fk(name), target:quality_processes!quality_process_interactions_target_fk(name)"
      )
      .eq("organization_id", orgA)
      .or(`source_process_id.eq.${processId},target_process_id.eq.${processId}`)
      .order("sort_order", { ascending: true });
    assert(!error, `PostgREST rechazó el embed de la interacción: ${error?.message}`);
    assert((data ?? []).length === 1, `esperaba 1 interacción, hay ${(data ?? []).length}`);
    const r = data![0];
    assert((r.source as { name?: string } | null)?.name === "Gestión de la calidad", "el origen no llegó incrustado");
    assert((r.target as { name?: string } | null)?.name === "Producción", "el destino no llegó incrustado");
  });

  await check("46. Asignaciones con la persona incrustada (profile_id, no created_by)", async () => {
    const { data, error } = await userA.client
      .from("quality_position_assignments")
      .select(
        "id, position_id, profile_id, assignment_type, effective_from, effective_to, notes, profiles!quality_position_assignments_profile_id_fkey(full_name, email)"
      )
      .eq("organization_id", orgA)
      .eq("position_id", positionId)
      .order("effective_from", { ascending: false });
    assert(!error, `PostgREST rechazó el embed de la persona: ${error?.message}`);
    assert((data ?? []).length === 1, "esperaba una asignación");
    const p = data![0].profiles as { email?: string } | null;
    assert(p?.email === userD.email, "se incrustó el perfil equivocado (¿created_by en vez de profile_id?)");
  });

  await check("47. Documentos del proceso con el documento de TrazaDocs incrustado", async () => {
    const { data, error } = await userA.client
      .from("quality_process_documents")
      .select("id, document_id, relation_type, trazadoc_documents!quality_process_documents_document_fk(title, code, status)")
      .eq("organization_id", orgA)
      .eq("process_id", processId);
    assert(!error, `PostgREST rechazó el embed del documento: ${error?.message}`);
    assert((data ?? []).length === 1, "esperaba un documento asociado");
    const d = data![0].trazadoc_documents as { title?: string } | null;
    assert(d?.title === "Procedimiento de revisión por la dirección", "el documento no llegó incrustado");
  });

  await check("48. Nodos del mapa con proceso y cargo anidados (embed en dos niveles)", async () => {
    const { data, error } = await userA.client
      .from("quality_process_map_nodes")
      .select(
        "id, process_id, category_code, sort_order, quality_processes!quality_process_map_nodes_process_fk(name, code, status, owner_position_id, quality_positions!quality_processes_owner_position_fk(name))"
      )
      .eq("organization_id", orgA)
      .eq("map_version_id", mapVersionId)
      .order("sort_order", { ascending: true });
    assert(!error, `PostgREST rechazó el embed anidado del mapa: ${error?.message}`);
    assert((data ?? []).length === 2, `esperaba 2 nodos, hay ${(data ?? []).length}`);
    const proc = data!.find((n) => n.process_id === processId)!.quality_processes as {
      name?: string;
      quality_positions?: { name?: string } | null;
    } | null;
    assert(proc?.name === "Gestión de la calidad", "el proceso no llegó incrustado en el nodo");
    assert(proc?.quality_positions?.name === "Director de Calidad", "el cargo no llegó en el segundo nivel");
  });

  await check("48b. Lectura INVERSA: qué procesos usan un documento de TrazaDocs", async () => {
    const { data: doc } = await userA.client.from("trazadoc_documents")
      .select("id").eq("organization_id", orgA).limit(1).single();
    const { data, error } = await userA.client
      .from("quality_process_documents")
      .select("relation_type, process_id, quality_processes!quality_process_documents_process_fk(name, code, status)")
      .eq("organization_id", orgA)
      .eq("document_id", doc!.id);
    assert(!error, `PostgREST rechazó el embed inverso: ${error?.message}`);
    assert((data ?? []).length === 1, `esperaba 1 proceso usando el documento, hay ${(data ?? []).length}`);
    const p = data![0].quality_processes as { name?: string } | null;
    assert(p?.name === "Gestión de la calidad", "el proceso no llegó incrustado desde el documento");
    // Y la empresa B no ve esa relación aunque conozca el identificador.
    const { data: fromB } = await userB.client.from("quality_process_documents")
      .select("id").eq("document_id", doc!.id);
    assert((fromB ?? []).length === 0, "B pudo ver a qué procesos de A pertenece un documento");
  });

  await check("48c. Retirar un proceso conserva sus revisiones publicadas", async () => {
    const before = await userA.client.from("quality_process_revisions")
      .select("id", { count: "exact", head: true }).eq("process_id", processId);
    const { error } = await userD.client.from("quality_processes")
      .update({ status: "retired" }).eq("id", processId).eq("organization_id", orgA);
    assert(!error, `no se pudo retirar el proceso: ${error?.message}`);

    const { data: proc } = await userA.client.from("quality_processes")
      .select("status").eq("id", processId).single();
    assert(proc?.status === "retired", "el proceso debía quedar retirado");

    const after = await userA.client.from("quality_process_revisions")
      .select("id", { count: "exact", head: true }).eq("process_id", processId);
    assert(after.count === before.count, "retirar el proceso destruyó revisiones");

    // La vigente sigue siendo consultable: es la respuesta a "qué regía".
    const { data: vig } = await userA.client.from("quality_process_revisions")
      .select("revision_number").eq("process_id", processId)
      .eq("status", "published").is("effective_to", null).maybeSingle();
    assert(vig?.revision_number === 2, "la revisión vigente dejó de ser consultable tras retirar");

    // Y se puede devolver al servicio: retirar no es destruir.
    await userD.client.from("quality_processes")
      .update({ status: "active" }).eq("id", processId).eq("organization_id", orgA);
    const { data: back } = await userA.client.from("quality_processes")
      .select("status").eq("id", processId).single();
    assert(back?.status === "active", "no se pudo devolver el proceso al servicio");
  });

  await check("49. Miembros de la empresa con su perfil (desplegable de asignación)", async () => {
    const { data, error } = await userA.client
      .from("memberships")
      .select("user_id, profiles(full_name, email)")
      .eq("organization_id", orgA)
      .eq("status", "active");
    assert(!error, `PostgREST rechazó el embed del perfil: ${error?.message}`);
    assert((data ?? []).length === 3, `esperaba 3 miembros activos, hay ${(data ?? []).length}`);
    assert(
      data!.every((m) => (m.profiles as { email?: string } | null)?.email),
      "algún miembro llegó sin correo incrustado"
    );
  });

  // ───────────────────── Invariantes de esquema (SQL directo) ──────────────

  if (DB_URL) {
    const pg = new PgClient({ connectionString: DB_URL });
    await pg.connect();

    // Los CATÁLOGOS DE PLATAFORMA son la excepción declarada, y es una excepción
    // con forma: son iguales para todas las empresas, no llevan
    // `organization_id`, ninguna empresa los escribe y solo conceden `select`.
    // Exigirles RLS por empresa sería exigirles una empresa que no tienen. La
    // prueba 50b comprueba que sean exactamente eso y nada más.
    const CATALOGOS_DE_PLATAFORMA = [
      "quality_management_review_input_catalog",
      "quality_automation_sources",
      "quality_automation_source_fields",
      "quality_automation_rule_templates",
    ];
    const listaSql = CATALOGOS_DE_PLATAFORMA.map((t) => `'${t}'`).join(", ");

    await check("50. TODA tabla de Quality tiene RLS activa", async () => {
      const { rows } = await pg.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r' and c.relname like 'quality\\_%'
            and c.relname not in (${listaSql})
            and not c.relrowsecurity`
      );
      assert(rows.length === 0, `sin RLS: ${rows.map((r) => r.relname).join(", ")}`);
      const { rows: all } = await pg.query(
        `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'quality\\_%'`
      );
      // QUALITY-01.2 · La exigencia es que NINGUNA tabla de Quality se quede
      // sin RLS —lo comprueba la consulta anterior— y que las once de 0112
      // sigan estando. Fijar el número exacto convertía cada tabla nueva en un
      // fallo, que no es lo que esta prueba protege.
      assert(all[0].n >= 11, `faltan tablas de Quality: hay ${all[0].n}, esperaba al menos 11`);
    });

    await check("51. anon NO tiene ningún privilegio sobre Quality", async () => {
      const { rows } = await pg.query(
        `select count(*)::int as n from information_schema.role_table_grants
          where table_schema='public' and grantee='anon' and table_name like 'quality\\_%'`
      );
      assert(rows[0].n === 0, `anon tiene ${rows[0].n} privilegios sobre tablas de Quality`);
    });

    await check("52. Los roles cliente no tienen TRUNCATE/REFERENCES/TRIGGER en Quality", async () => {
      const { rows } = await pg.query(
        `select count(*)::int as n from information_schema.role_table_grants
          where table_schema='public' and grantee in ('anon','authenticated')
            and table_name like 'quality\\_%'
            and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`
      );
      assert(rows[0].n === 0, `hay ${rows[0].n} privilegios peligrosos concedidos`);
    });

    await check("50b. los catálogos de plataforma son globales y de SOLO LECTURA", async () => {
      // Existen, no tienen empresa, y nadie puede escribirlos. Si alguno
      // dejara de cumplirlo, la excepción de la prueba 50 se convertiría en un
      // agujero silencioso.
      for (const tabla of CATALOGOS_DE_PLATAFORMA) {
        const { rows: existe } = await pg.query(
          `select 1 from pg_tables where schemaname='public' and tablename=$1`, [tabla]
        );
        assert(existe.length === 1, `el catálogo ${tabla} no existe`);
        const { rows: escritura } = await pg.query(
          `select privilege_type from information_schema.role_table_grants
            where table_schema='public' and table_name=$1
              and grantee in ('anon','authenticated')
              and privilege_type <> 'SELECT'`, [tabla]
        );
        assert(escritura.length === 0,
          `${tabla} concede ${escritura.map((r) => r.privilege_type).join(", ")}`);
      }
    });

    await check("53. Toda tabla de Quality declara organization_id", async () => {
      const { rows } = await pg.query(
        `select t.tablename from pg_tables t
          where t.schemaname='public' and t.tablename like 'quality\\_%'
            and t.tablename not in (${listaSql})
            and not exists (select 1 from information_schema.columns c
                             where c.table_schema='public' and c.table_name=t.tablename
                               and c.column_name='organization_id')`
      );
      assert(rows.length === 0, `sin organization_id: ${rows.map((r) => r.tablename).join(", ")}`);
    });

    await check("54. Las relaciones críticas usan FK COMPUESTA por organización", async () => {
      const { rows } = await pg.query(
        `select conname from pg_constraint
          where contype='f' and conrelid::regclass::text like 'quality_%'
            and array_length(conkey,1) = 2`
      );
      assert(rows.length >= 8, `esperaba al menos 8 FK compuestas, hay ${rows.length}`);
    });

    await pg.end();
  } else {
    console.log("  · SUPABASE_DB_URL ausente: se omiten las verificaciones 50-54");
  }

  console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Error inesperado:", e);
  process.exit(1);
});
