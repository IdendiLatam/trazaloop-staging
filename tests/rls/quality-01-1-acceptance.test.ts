/**
 * Trazaloop Quality · QUALITY-01.1 · Pruebas de los hallazgos de la prueba humana.
 *
 * Contra base REAL. Cubre los grupos A–G del encargo:
 *   A · Cargo: crear, editar, eliminar sin uso, desactivar en uso, cross-tenant.
 *   C · Invitaciones: token, aceptación, inválido, expirado, reutilizado,
 *       usuario nuevo y existente, cross-tenant.
 *   D · Categorías: las cuatro por defecto, empresa existente, empresa nueva,
 *       empresa que solo tiene Quality, y RLS.
 *   E · Documentos de Quality en una empresa QUALITY-ONLY.
 *   F · Vinculación de un documento de TrazaDocs que ya existe.
 *
 * Los grupos B (navegación) y G (selector de módulos) son lógica pura y de
 * interfaz: viven en tests/unit/quality-01-1-acceptance.test.ts y en el
 * recorrido HTTP.
 *
 * Correr: npm run test:quality011-rls
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
  console.error("Faltan variables para test:quality011-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

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

async function newUser(label: string) {
  const email = `q011-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, email, password, client };
}

async function createOrg(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  return data as string;
}

/** Invitación creada por la vía real de la aplicación (RLS del invitante). */
async function createInvitation(client: SupabaseClient, orgId: string, email: string, role: string) {
  const token = `q011-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const { data, error } = await client
    .from("team_invitations")
    .insert({
      organization_id: orgId, email: email.toLowerCase(), role_code: role,
      token, status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
    .select("id, token")
    .single();
  if (error || !data) throw new Error(`crear invitación: ${error?.message}`);
  return { id: data.id as string, token: data.token as string };
}

async function main() {
  console.log("\nQUALITY-01.1 · hallazgos de la prueba humana\n");
  if (DB_URL) console.log(`  · API y SQL directo apuntan al mismo proyecto: ${projectRefOf(URL!)}\n`);

  const admin1 = await newUser("admin1");
  const outsider = await newUser("outsider");
  const orgA = await createOrg(admin1.client, `Q011 A ${Date.now()}`);
  // La empresa B existe para que el forastero tenga la suya: sin empresa
  // activa propia, sus intentos fallarían por un motivo distinto del que se
  // quiere comprobar.
  await createOrg(outsider.client, `Q011 B ${Date.now()}`);

  // Las invitaciones exigen plan Full o Extra. Una empresa recién creada nace
  // en Demo, así que se le sube el modo de acceso de un módulo: es lo que
  // resuelve organization_effective_plan_code, y por tanto lo que decide.
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "traceability_6632");

  // ══════════════════════════════ GRUPO D · Categorías ══════════════════════
  console.log("── D · Categorías de procesos ─────────────────────────────\n");

  const BASE = ["strategic", "core", "support", "system"];

  await check("D1. La empresa ve las CUATRO categorías por defecto", async () => {
    const { data, error } = await admin1.client
      .from("quality_process_categories")
      .select("code, name, sort_order, is_active, organization_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    assert(!error, `la consulta falló: ${error?.message}`);
    const base = (data ?? []).filter((c) => c.organization_id === null);
    assert(base.length === 4, `esperaba 4 categorías base, hay ${base.length}`);
    for (const code of BASE) {
      assert(base.some((c) => c.code === code), `falta la categoría ${code}`);
    }
    // Con nombre, orden y estado: el modelo es estructurado, no cuatro
    // cadenas escritas a mano en un componente.
    assert(base.every((c) => typeof c.name === "string" && c.name.length > 0), "alguna categoría sin nombre");
    assert(base.every((c) => typeof c.sort_order === "number"), "alguna categoría sin orden");
  });

  await check("D2. La consulta que usa la aplicación devuelve las cuatro (columna sort_order)", async () => {
    // Es la consulta literal de listQualityCategories. Pedía `display_order`,
    // que no existe: PostgREST devolvía error, la función lo tragaba con una
    // lista vacía y el selector salía en blanco.
    const { data, error } = await admin1.client
      .from("quality_process_categories")
      .select("code, name, description, sort_order, organization_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    assert(!error, `la consulta de la aplicación falla: ${error?.message}`);
    assert((data ?? []).length >= 4, `el selector recibiría ${(data ?? []).length} opciones`);

    // Y la columna que fallaba sigue sin existir: si alguien la reintroduce,
    // esta comprobación lo dice en lugar de dejar el selector vacío.
    const { error: bad } = await admin1.client
      .from("quality_process_categories").select("display_order").limit(1);
    assert(bad, "display_order no debería existir; si existe, revisa el modelo");
  });

  await check("D3. Una empresa NUEVA recibe las cuatro sin aprovisionar nada", async () => {
    const fresh = await newUser("fresh");
    const orgFresh = await createOrg(fresh.client, `Q011 Nueva ${Date.now()}`);
    assert(orgFresh, "no se creó la empresa");
    const { data } = await fresh.client
      .from("quality_process_categories").select("code").is("organization_id", null);
    assert((data ?? []).length === 4, `la empresa nueva ve ${(data ?? []).length} categorías`);
  });

  await check("D4. Con categorías disponibles, el proceso SÍ se puede crear", async () => {
    const { data, error } = await admin1.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Proceso con categoría", category_code: "system" })
      .select("id, category_code").single();
    assert(!error && data, `no se pudo crear el proceso: ${error?.message}`);
    assert(data!.category_code === "system", "la categoría no quedó guardada");
    await admin1.client.from("quality_processes").delete().eq("id", data!.id);
  });

  await check("D4b. El catálogo base sigue siendo INTOCABLE desde un cliente", async () => {
    // 0113 afinó el trigger para poder mantener los nombres desde una
    // migración. Lo que protegía debe seguir protegido: una sesión de empresa
    // no puede alterar ni borrar una categoría global.
    const { data: before } = await admin1.client
      .from("quality_process_categories").select("id, name").eq("code", "support").is("organization_id", null).single();

    await admin1.client.from("quality_process_categories")
      .update({ name: "Alterado desde el cliente" }).eq("id", before!.id);
    const { data: after } = await admin1.client
      .from("quality_process_categories").select("name").eq("id", before!.id).single();
    assert(after?.name === before!.name, "un cliente pudo renombrar una categoría del catálogo base");

    await admin1.client.from("quality_process_categories").delete().eq("id", before!.id);
    const { data: still } = await admin1.client
      .from("quality_process_categories").select("id").eq("id", before!.id);
    assert((still ?? []).length === 1, "un cliente pudo borrar una categoría del catálogo base");
  });

  await check("D4c. Los nombres son los CONGELADOS, en español correcto", async () => {
    const { data } = await admin1.client
      .from("quality_process_categories").select("code, name").is("organization_id", null);
    const porCodigo = new Map((data ?? []).map((c) => [c.code as string, c.name as string]));
    const esperado: Record<string, string> = {
      strategic: "Estratégicos", core: "Misionales", support: "Apoyo", system: "Sistema",
    };
    for (const [code, name] of Object.entries(esperado)) {
      assert(porCodigo.get(code) === name, `${code} se llama «${porCodigo.get(code)}», debía ser «${name}»`);
    }
  });

  await check("D5. Una empresa puede añadir su PROPIA categoría sin tocar las base", async () => {
    const { error } = await admin1.client.from("quality_process_categories")
      .insert({ organization_id: orgA, code: "propia", name: "Categoría propia", sort_order: 10 });
    assert(!error, `no se pudo crear una categoría propia: ${error?.message}`);
    const { data } = await admin1.client
      .from("quality_process_categories").select("code, organization_id").eq("is_active", true);
    assert((data ?? []).length === 5, `esperaba 4 base + 1 propia, hay ${(data ?? []).length}`);
    // Y la empresa B no la ve.
    const { data: fromB } = await outsider.client
      .from("quality_process_categories").select("code").eq("organization_id", orgA);
    assert((fromB ?? []).length === 0, "otra empresa vio una categoría ajena");
  });

  // ══════════════════════════════ GRUPO A · Cargos ══════════════════════════
  console.log("\n── A · Ciclo de vida del cargo ────────────────────────────\n");

  let unusedPosition = "";
  let usedPosition = "";
  let ownedProcess = "";

  await check("A1. Crear cargo", async () => {
    const { data, error } = await admin1.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Cargo sin usar", code: "SIN-USO" })
      .select("id").single();
    assert(!error && data, `no se pudo crear: ${error?.message}`);
    unusedPosition = data!.id;
  });

  await check("A2. Editar cargo: nombre, código, área y descripción", async () => {
    const { error } = await admin1.client.from("quality_positions")
      .update({ name: "Cargo renombrado", code: "REN-01", org_unit: "Operaciones", description: "Descripción nueva" })
      .eq("id", unusedPosition).eq("organization_id", orgA);
    assert(!error, `no se pudo editar: ${error?.message}`);
    const { data } = await admin1.client.from("quality_positions")
      .select("name, code, org_unit, description").eq("id", unusedPosition).single();
    assert(data?.name === "Cargo renombrado", "el nombre no se guardó");
    assert(data?.code === "REN-01" && data?.org_unit === "Operaciones", "código o área no se guardaron");
  });

  await check("A3. Un cargo SIN uso se puede eliminar de verdad", async () => {
    const { error } = await admin1.client.from("quality_positions")
      .delete().eq("id", unusedPosition).eq("organization_id", orgA);
    assert(!error, `no se pudo eliminar: ${error?.message}`);
    const { data } = await admin1.client.from("quality_positions").select("id").eq("id", unusedPosition);
    assert((data ?? []).length === 0, "el cargo sigue existiendo");
  });

  await check("A4. Un cargo EN USO no se puede eliminar: la BD lo impide", async () => {
    const { data: pos } = await admin1.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Cargo en uso" }).select("id").single();
    usedPosition = pos!.id;
    const { data: proc } = await admin1.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Proceso con dueño", category_code: "core", owner_position_id: usedPosition })
      .select("id").single();
    ownedProcess = proc!.id;

    const { error } = await admin1.client.from("quality_positions")
      .delete().eq("id", usedPosition).eq("organization_id", orgA);
    assert(error, "se pudo borrar un cargo que tiene un proceso a su nombre");
    // Desde QUALITY-03.1 hay DOS barreras y la primera en responder es el
    // disparador de 0119 (P0001), que además explica en español qué retiene al
    // cargo; detrás sigue la clave foránea de 0112 (23503). Lo que esta prueba
    // exige es que la BASE se niegue, no cuál de las dos llegó primero.
    assert(["23503", "P0001"].includes(error!.code ?? ""),
      `esperaba que la base rechazara el borrado, fue ${error!.code}`);
    assert((error!.message ?? "").length > 0, "el rechazo debe traer un motivo");
  });

  await check("A5. Desactivar el cargo en uso conserva el proceso y su propietario", async () => {
    const { error } = await admin1.client.from("quality_positions")
      .update({ is_active: false }).eq("id", usedPosition).eq("organization_id", orgA);
    assert(!error, `no se pudo desactivar: ${error?.message}`);
    const { data: proc } = await admin1.client.from("quality_processes")
      .select("owner_position_id").eq("id", ownedProcess).single();
    assert(proc?.owner_position_id === usedPosition, "el proceso perdió su cargo propietario");
    const { data: pos } = await admin1.client.from("quality_positions")
      .select("is_active, name").eq("id", usedPosition).single();
    assert(pos?.is_active === false, "el cargo no quedó desactivado");
    assert(pos?.name === "Cargo en uso", "el cargo perdió sus datos al desactivarse");
  });

  await check("A6. Una asignación también impide el borrado", async () => {
    const { data: pos } = await admin1.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Cargo solo con asignación" }).select("id").single();
    await admin1.client.from("quality_position_assignments")
      .insert({ organization_id: orgA, position_id: pos!.id, profile_id: admin1.id, assignment_type: "holder" });
    const { error } = await admin1.client.from("quality_positions")
      .delete().eq("id", pos!.id).eq("organization_id", orgA);
    assert(["23503", "P0001"].includes(error?.code ?? ""),
      `esperaba que la base rechazara el borrado, fue ${error?.code ?? "ningún error"}`);
  });

  await check("A7. Cross-tenant: B no edita ni elimina un cargo de A", async () => {
    const { data: before } = await admin1.client.from("quality_positions")
      .select("name").eq("id", usedPosition).single();
    await outsider.client.from("quality_positions").update({ name: "Secuestrado" }).eq("id", usedPosition);
    const { data: after } = await admin1.client.from("quality_positions")
      .select("name").eq("id", usedPosition).single();
    assert(after?.name === before!.name, "otra empresa pudo renombrar un cargo ajeno");

    await outsider.client.from("quality_positions").delete().eq("id", usedPosition);
    const { data: still } = await admin1.client.from("quality_positions").select("id").eq("id", usedPosition);
    assert((still ?? []).length === 1, "otra empresa pudo borrar un cargo ajeno");
  });

  await check("A8. Un consultant no puede eliminar cargos", async () => {
    const consultant = await newUser("consultant");
    await admin.from("memberships").insert({
      organization_id: orgA, user_id: consultant.id, role_code: "consultant", status: "active",
    });
    const { data: pos } = await admin1.client.from("quality_positions")
      .insert({ organization_id: orgA, name: "Cargo que el consultor no borra" }).select("id").single();
    await consultant.client.from("quality_positions").delete().eq("id", pos!.id);
    const { data } = await admin1.client.from("quality_positions").select("id").eq("id", pos!.id);
    assert((data ?? []).length === 1, "un consultant pudo borrar un cargo");
  });

  // ══════════════════════════════ GRUPO C · Invitaciones ════════════════════
  console.log("\n── C · Invitaciones de equipo ─────────────────────────────\n");

  await check("C1. La invitación se crea CON token persistido y recuperable", async () => {
    const invited = `q011-invited-${Date.now()}@test.trazaloop.dev`;
    const inv = await createInvitation(admin1.client, orgA, invited, "quality");
    assert(inv.token && inv.token.length > 10, "el token no se generó");

    // Lo que faltaba: poder RECUPERAR el token después, para volver a compartir
    // el enlace. Si la lectura no lo devolviera, el enlace solo existiría en el
    // instante de crearlo — que es justo lo que ocurría.
    const { data, error } = await admin1.client
      .from("team_invitations").select("id, email, token, status")
      .eq("organization_id", orgA).eq("id", inv.id).single();
    assert(!error && data, `no se pudo releer la invitación: ${error?.message}`);
    assert(data!.token === inv.token, "el token releído no coincide");
    assert(data!.status === "pending", "la invitación no quedó pendiente");
  });

  await check("C2. Persona SIN cuenta previa: se registra y acepta", async () => {
    const email = `q011-nuevo-${Date.now()}@test.trazaloop.dev`;
    const inv = await createInvitation(admin1.client, orgA, email, "consultant");

    const { data: created } = await admin.auth.admin.createUser({
      email, password: "Trazaloop-Test-1234", email_confirm: true,
    });
    const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    await client.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });

    const { error } = await client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(!error, `no se pudo aceptar: ${error?.message}`);
    const { data: mem } = await admin.from("memberships")
      .select("role_code, status").eq("organization_id", orgA).eq("user_id", created.user!.id).single();
    assert(mem?.role_code === "consultant" && mem?.status === "active", "no quedó como miembro activo");
  });

  await check("C3. Persona CON cuenta existente: acepta y entra a la empresa", async () => {
    const existing = await newUser("existente");
    const inv = await createInvitation(admin1.client, orgA, existing.email, "quality");
    const { error } = await existing.client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(!error, `no se pudo aceptar: ${error?.message}`);
    const { data } = await admin.from("memberships")
      .select("role_code").eq("organization_id", orgA).eq("user_id", existing.id).single();
    assert(data?.role_code === "quality", "no quedó con el rol invitado");
  });

  await check("C4. Token INVÁLIDO se rechaza", async () => {
    const someone = await newUser("invalido");
    const { error } = await someone.client.rpc("accept_team_invitation", { p_token: "token-que-no-existe" });
    assert(error, "un token inexistente fue aceptado");
    assert(/no existe/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("C5. Token EXPIRADO se rechaza, y la caducidad se deriva de la fecha", async () => {
    const someone = await newUser("expirado");
    const inv = await createInvitation(admin1.client, orgA, someone.email, "consultant");
    const expiresAt = new Date(Date.now() - 3600 * 1000).toISOString();
    await admin.from("team_invitations").update({ expires_at: expiresAt }).eq("id", inv.id);

    const { error } = await someone.client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(error && /expir/i.test(error.message), `esperaba expiración, fue: ${error?.message}`);

    // La caducidad es la FECHA, no la columna de estado: una excepción deshace
    // la transacción entera, así que ningún `update` previo al `raise` puede
    // persistir. 0113 quitó ese update engañoso; la interfaz deriva el estado
    // de expires_at, que es el dato real.
    const { data } = await admin.from("team_invitations")
      .select("status, expires_at").eq("id", inv.id).single();
    assert(new Date(data!.expires_at as string) < new Date(), "la fecha de caducidad no quedó en el pasado");
    assert(data?.status === "pending", "el estado almacenado no debería haber cambiado");

    // Y nadie entró en la empresa.
    const { data: mem } = await admin.from("memberships")
      .select("id").eq("organization_id", orgA).eq("user_id", someone.id);
    assert((mem ?? []).length === 0, "una invitación expirada creó membresía");
  });

  await check("C6. Token YA UTILIZADO no se puede reutilizar", async () => {
    const first = await newUser("primero");
    const inv = await createInvitation(admin1.client, orgA, first.email, "consultant");
    const { error: e1 } = await first.client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(!e1, `la primera aceptación falló: ${e1?.message}`);
    const { error: e2 } = await first.client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(e2 && /ya fue aceptada/i.test(e2.message), `esperaba "ya fue aceptada", fue: ${e2?.message}`);
  });

  await check("C7. Token REVOCADO se rechaza", async () => {
    const someone = await newUser("revocado");
    const inv = await createInvitation(admin1.client, orgA, someone.email, "consultant");
    await admin1.client.from("team_invitations").update({ status: "revoked" }).eq("id", inv.id);
    const { error } = await someone.client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(error && /revocada/i.test(error.message), `esperaba revocada, fue: ${error?.message}`);
  });

  await check("C8. Otro correo NO puede usar el token de una invitación ajena", async () => {
    const target = `q011-destinatario-${Date.now()}@test.trazaloop.dev`;
    const inv = await createInvitation(admin1.client, orgA, target, "consultant");
    const intruder = await newUser("intruso");
    const { error } = await intruder.client.rpc("accept_team_invitation", { p_token: inv.token });
    assert(error && /otro correo/i.test(error.message), `esperaba rechazo por correo, fue: ${error?.message}`);
    const { data } = await admin.from("memberships")
      .select("id").eq("organization_id", orgA).eq("user_id", intruder.id);
    assert((data ?? []).length === 0, "el intruso entró en la empresa");
  });

  await check("C9. Cross-tenant: B no ve ni revoca las invitaciones de A", async () => {
    const email = `q011-cross-${Date.now()}@test.trazaloop.dev`;
    const inv = await createInvitation(admin1.client, orgA, email, "consultant");

    const { data: seen } = await outsider.client
      .from("team_invitations").select("id, token").eq("organization_id", orgA);
    assert((seen ?? []).length === 0, "otra empresa pudo LEER invitaciones ajenas (y sus tokens)");

    await outsider.client.from("team_invitations").update({ status: "revoked" }).eq("id", inv.id);
    const { data } = await admin.from("team_invitations").select("status").eq("id", inv.id).single();
    assert(data?.status === "pending", "otra empresa pudo revocar una invitación ajena");
  });

  await check("C10. B no puede crear invitaciones DENTRO de la empresa A", async () => {
    const { error } = await outsider.client.from("team_invitations").insert({
      organization_id: orgA, email: `q011-x-${Date.now()}@test.trazaloop.dev`,
      role_code: "admin", token: `q011-intruso-${Date.now()}`, status: "pending",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    assert(error, "otra empresa pudo crear una invitación en A");
  });

  // ══════════════ GRUPOS E y F · Documentos en empresa QUALITY-ONLY ═════════
  console.log("\n── E/F · Documentos de Quality (empresa quality-only) ─────\n");

  const qOnly = await newUser("qonly");
  const orgQ = await createOrg(qOnly.client, `Q011 Solo Quality ${Date.now()}`);
  let qualityDocId = "";
  let cprDocId = "";
  let qProcessId = "";

  await check("E0. La empresa queda con SOLO Quality: PCR y Textiles no asignados", async () => {
    // Se deshabilitan los otros módulos para reproducir el caso de la decisión
    // de producto: alguien que contrata únicamente Trazaloop Quality.
    const { error } = await admin.from("organization_modules")
      .update({ enabled: false })
      .eq("organization_id", orgQ)
      .in("module_code", ["traceability_6632", "textiles"]);
    assert(!error, `no se pudieron deshabilitar los otros módulos: ${error?.message}`);
    const { data } = await admin.from("organization_modules")
      .select("module_code, enabled").eq("organization_id", orgQ);
    const quality = (data ?? []).find((m) => m.module_code === "quality");
    assert(quality?.enabled === true, "Quality debía seguir habilitado");
    for (const code of ["traceability_6632", "textiles"]) {
      assert((data ?? []).find((m) => m.module_code === code)?.enabled === false, `${code} debía quedar deshabilitado`);
    }
  });

  await check("E1. Crea un documento PROPIO de Quality sin tocar PCR ni Textiles", async () => {
    const { data, error } = await qOnly.client.from("trazadoc_documents")
      .insert({
        organization_id: orgQ, title: "Procedimiento de auditoría interna",
        source_type: "custom", module_key: "quality", category_code: "procedure",
      })
      .select("id, module_key, status").single();
    assert(!error && data, `no se pudo crear el documento: ${error?.message}`);
    assert(data!.module_key === "quality", `el módulo quedó en ${data!.module_key}`);
    assert(data!.status === "draft", "el documento debía nacer en borrador");
    qualityDocId = data!.id;
  });

  await check("E2. Le añade secciones y las edita (motor TrazaDocs)", async () => {
    const { error } = await qOnly.client.from("trazadoc_document_sections").insert([
      { organization_id: orgQ, document_id: qualityDocId, section_key: "purpose",
        title: "Objetivo", content: "", sort_order: 1, is_required: true },
      { organization_id: orgQ, document_id: qualityDocId, section_key: "scope",
        title: "Alcance", content: "", sort_order: 2, is_required: true },
    ]);
    assert(!error, `no se pudieron crear secciones: ${error?.message}`);

    const { error: e2 } = await qOnly.client.from("trazadoc_document_sections")
      .update({ content: "Verificar la eficacia del sistema de gestión." })
      .eq("document_id", qualityDocId).eq("section_key", "purpose");
    assert(!e2, `no se pudo editar la sección: ${e2?.message}`);

    const { data } = await qOnly.client.from("trazadoc_document_sections")
      .select("content").eq("document_id", qualityDocId).eq("section_key", "purpose").single();
    assert(data?.content?.startsWith("Verificar"), "el contenido no se guardó");
  });

  await check("E3. El documento se CONSULTA filtrando por módulo quality", async () => {
    const { data, error } = await qOnly.client
      .from("v_trazadoc_document_summary")
      .select("document_id, title, status, module_key")
      .eq("organization_id", orgQ).eq("module_key", "quality");
    assert(!error, `la vista falló: ${error?.message}`);
    assert((data ?? []).length === 1, `esperaba 1 documento de Quality, hay ${(data ?? []).length}`);
    assert(data![0].title === "Procedimiento de auditoría interna", "no es el documento esperado");
  });

  await check("E4. El módulo de un documento es INMUTABLE: no cruza a PCR", async () => {
    const { error } = await qOnly.client.from("trazadoc_documents")
      .update({ module_key: "cpr" }).eq("id", qualityDocId);
    assert(error, "se pudo cambiar el módulo de un documento");
    const { data } = await qOnly.client.from("trazadoc_documents")
      .select("module_key").eq("id", qualityDocId).single();
    assert(data?.module_key === "quality", "el documento cambió de módulo");
  });

  await check("E5. Se asocia a un proceso de Quality de la misma empresa", async () => {
    const { data: proc } = await qOnly.client.from("quality_processes")
      .insert({ organization_id: orgQ, name: "Auditorías internas", category_code: "system" })
      .select("id").single();
    qProcessId = proc!.id;
    const { error } = await qOnly.client.from("quality_process_documents")
      .insert({ organization_id: orgQ, process_id: qProcessId, document_id: qualityDocId, relation_type: "governs" });
    assert(!error, `no se pudo asociar: ${error?.message}`);
  });

  await check("F0. Una empresa SIN PCR no puede siquiera crear documentos de PCR", async () => {
    // No es un fallo: es la separación por módulo funcionando. Se comprueba
    // aquí porque explica por qué el caso de vinculación entre módulos se
    // prueba en una empresa que SÍ tiene ambos.
    const { error } = await qOnly.client.from("trazadoc_documents").insert({
      organization_id: orgQ, title: "Documento de PCR imposible",
      source_type: "custom", module_key: "cpr", category_code: "procedure",
    });
    assert(error, "una empresa sin PCR pudo crear un documento de PCR");
    assert(/MODULE_ACCESS_BLOCKED/.test(error!.message), `motivo inesperado: ${error!.message}`);
  });

  await check("F1. En una empresa con ambos módulos, Quality vincula un documento de PCR", async () => {
    const { data: doc, error } = await admin1.client.from("trazadoc_documents")
      .insert({
        organization_id: orgA, title: "Procedimiento de recepción de materias primas",
        source_type: "custom", module_key: "cpr", category_code: "procedure",
      })
      .select("id, module_key").single();
    assert(!error && doc, `no se pudo crear el documento de PCR: ${error?.message}`);
    assert(doc!.module_key === "cpr", "el documento no quedó en PCR");
    cprDocId = doc!.id;

    // Se vincula a un proceso de Quality de la MISMA empresa: no se copia, se
    // referencia. El documento sigue siendo de PCR.
    const { error: e2 } = await admin1.client.from("quality_process_documents")
      .insert({ organization_id: orgA, process_id: ownedProcess, document_id: cprDocId, relation_type: "supports" });
    assert(!e2, `no se pudo vincular el documento de PCR: ${e2?.message}`);
  });

  await check("F2. Vincular NO duplica: sigue existiendo un solo documento", async () => {
    const { count } = await admin1.client.from("trazadoc_documents")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA).eq("title", "Procedimiento de recepción de materias primas");
    assert(count === 1, `vincular duplicó el documento: hay ${count} copias`);
    const { data } = await admin1.client.from("trazadoc_documents")
      .select("module_key").eq("id", cprDocId).single();
    assert(data?.module_key === "cpr", "vincular cambió el módulo del documento de origen");
  });

  await check("F3. La lectura distingue documentos PROPIOS de Quality y VINCULADOS", async () => {
    // En la empresa quality-only, el documento propio.
    const { data: propios } = await qOnly.client.from("trazadoc_documents")
      .select("id").eq("organization_id", orgQ).eq("module_key", "quality");
    assert((propios ?? []).length === 1, "debía haber un solo documento propio de Quality");

    // En la empresa con ambos módulos, la relación conserva el ORIGEN, que es
    // lo que permite mostrarlo como «vinculado» y no como propio.
    const { data: vinculados, error } = await admin1.client
      .from("quality_process_documents")
      .select("document_id, trazadoc_documents!quality_process_documents_document_fk(title, module_key)")
      .eq("organization_id", orgA);
    assert(!error, `el embed falló: ${error?.message}`);
    assert((vinculados ?? []).length === 1, `esperaba 1 relación, hay ${(vinculados ?? []).length}`);
    const origen = (vinculados![0].trazadoc_documents as { module_key?: string } | null)?.module_key;
    assert(origen === "cpr", `el origen debía ser cpr, es ${origen}`);
  });

  await check("F4. Cross-tenant: A no puede vincular un documento de la empresa Quality", async () => {
    const { error } = await admin1.client.from("quality_process_documents")
      .insert({ organization_id: orgA, process_id: ownedProcess, document_id: qualityDocId, relation_type: "governs" });
    assert(error, "se pudo vincular un documento de otra empresa");
    const { data } = await admin1.client.from("trazadoc_documents").select("id").eq("id", qualityDocId);
    assert((data ?? []).length === 0, "otra empresa pudo LEER el documento");
  });

  await check("F5. Cross-tenant: la empresa Quality no ve documentos de A", async () => {
    const { data: doc } = await admin1.client.from("trazadoc_documents")
      .insert({ organization_id: orgA, title: "Documento privado de A", source_type: "custom" })
      .select("id").single();
    const { data } = await qOnly.client.from("trazadoc_documents").select("id").eq("id", doc!.id);
    assert((data ?? []).length === 0, "la empresa Quality vio un documento ajeno");
  });

  // ───────────────────── Invariantes por SQL directo ────────────────────────

  if (DB_URL) {
    const pg = new PgClient({ connectionString: DB_URL });
    await pg.connect();

    await check("S1. La restricción de módulo de TrazaDocs admite los tres", async () => {
      const { rows } = await pg.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
          where conname = 'trazadoc_documents_module_key_check'`
      );
      assert(rows.length === 1, "no existe la restricción de módulo");
      for (const m of ["cpr", "textiles", "quality"]) {
        assert(rows[0].def.includes(`'${m}'`), `la restricción no admite ${m}`);
      }
    });

    await check("S2. quality_positions admite DELETE solo para admin/quality", async () => {
      const { rows } = await pg.query(
        `select cmd, qual from pg_policies
          where schemaname='public' and tablename='quality_positions' and cmd='DELETE'`
      );
      assert(rows.length === 1, `esperaba una política de DELETE, hay ${rows.length}`);
      assert(/has_org_role/.test(rows[0].qual), "la política no comprueba el rol");
      assert(/admin/.test(rows[0].qual) && /quality/.test(rows[0].qual), "roles inesperados en la política");
    });

    await check("S3. Las FK que protegen el historial siguen en RESTRICT", async () => {
      const { rows } = await pg.query(
        `select conname, confdeltype::text as del from pg_constraint
          where conname in ('quality_processes_owner_position_fk',
                            'quality_position_assignments_position_fk')`
      );
      assert(rows.length === 2, `faltan claves foráneas: ${rows.length}`);
      for (const r of rows) {
        assert(r.del === "r", `${r.conname} debía ser RESTRICT, es ${r.del}`);
      }
    });

    await check("S4. anon sigue sin privilegios sobre Quality tras 0113", async () => {
      const { rows } = await pg.query(
        `select count(*)::int as n from information_schema.role_table_grants
          where table_schema='public' and grantee='anon' and table_name like 'quality\\_%'`
      );
      assert(rows[0].n === 0, `anon tiene ${rows[0].n} privilegios`);
    });

    await pg.end();
  } else {
    console.log("  · SUPABASE_DB_URL ausente: se omiten S1–S4");
  }

  console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Error inesperado:", e); process.exit(1); });
