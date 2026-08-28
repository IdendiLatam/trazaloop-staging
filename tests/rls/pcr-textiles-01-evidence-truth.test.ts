/**
 * Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PT-01 · contra base REAL.
 *
 * LO QUE SE COMPRUEBA, Y POR QUÉ CONTRA LA BASE Y NO EN UNIDAD
 *
 * Las cuatro condiciones de PT-F05 viven en `evidence_link_confirm`, y viven
 * ahí precisamente porque una comprobación que solo existe en TypeScript se
 * salta escribiendo en la tabla. Comprobarla en unidad demostraría que la
 * función se llama; lo que hace falta demostrar es que NO se puede rodear.
 *
 * Por eso todo corre con la sesión real de cada persona, con RLS puesta. El
 * cliente administrativo solo crea usuarios.
 *
 * Correr: npm run test:pcr-textiles-01-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:pcr-textiles-01-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

/** Nunca mezclar entornos en una prueba que escribe. */
function projectRefOf(value: string): string {
  if (/(127\.0\.0\.1|localhost)/.test(value)) return "local";
  const m =
    value.match(/(?:db\.|\/\/)([a-z0-9]{20})\.supabase\.co/) ??
    value.match(/postgres\.([a-z0-9]{20})(?::|@)/);
  return m ? m[1] : "desconocido";
}
if (DB_URL && projectRefOf(URL) !== projectRefOf(DB_URL)) {
  console.error(`\nABORTADO: API en «${projectRefOf(URL)}» y DB en «${projectRefOf(DB_URL)}».\n`);
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
  const email = `pt01-${label}-${stamp}@test.trazaloop.dev`;
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

/** Una evidencia con estado y vigencia a medida. */
async function newEvidence(
  client: SupabaseClient, orgId: string, name: string,
  opts: { status?: string; validUntil?: string | null; archived?: boolean } = {}
): Promise<string> {
  const { data, error } = await client
    .from("evidences")
    .insert({
      organization_id: orgId, name, evidence_type: "origin_supplier",
      valid_until: opts.validUntil ?? null,
    })
    .select("id").single();
  assert(!error && data, `crear evidencia ${name}: ${error?.message}`);
  const id = data!.id as string;
  // El estado se fija por separado: `guard_evidence_review` solo deja pasar
  // la transición como REVISIÓN, y sella reviewed_at/by por su cuenta.
  if (opts.status && opts.status !== "pending") {
    const patch: Record<string, unknown> = { status: opts.status };
    if (opts.status === "rejected") patch.review_comment = "prueba";
    const { error: e } = await client.from("evidences").update(patch).eq("id", id);
    assert(!e, `fijar estado ${opts.status}: ${e?.message}`);
  }
  if (opts.archived) {
    const { error: e } = await client
      .from("evidences").update({ archived_at: new Date().toISOString() }).eq("id", id);
    assert(!e, `archivar: ${e?.message}`);
  }
  return id;
}

async function newInputBatch(
  client: SupabaseClient, orgId: string, supplierId: string, materialId: string,
  code: string, receivedDate: string
): Promise<string> {
  const { data, error } = await client
    .from("input_batches")
    .insert({
      organization_id: orgId, supplier_id: supplierId, material_id: materialId,
      batch_code: code, received_date: receivedDate, quantity_kg: 100,
    })
    .select("id").single();
  assert(!error && data, `crear lote ${code}: ${error?.message}`);
  return data!.id as string;
}

async function confirmar(
  client: SupabaseClient, evidenceId: string, targetType: string, targetId: string,
  opts: { role?: string | null; confirmed?: boolean } = {}
) {
  return client.rpc("evidence_link_confirm", {
    p_evidence_id: evidenceId,
    p_target_type: targetType,
    p_target_id: targetId,
    p_link_role: opts.role ?? null,
    p_confirmed: opts.confirmed ?? true,
  });
}

async function contarEnlaces(client: SupabaseClient, evidenceId: string): Promise<number> {
  const { count } = await client
    .from("evidence_links").select("id", { count: "exact", head: true })
    .eq("evidence_id", evidenceId);
  return count ?? 0;
}

const HOY = new Date().toISOString().slice(0, 10);

async function main() {
  console.log("\nPT-01 · Integridad histórica de la evidencia (base real)\n");

  const a = await newUser("a");
  const b = await newUser("b");
  const orgA = await createOrg(a.client, `PT01 A ${stamp}`);
  const orgB = await createOrg(b.client, `PT01 B ${stamp}`);

  // El plan Demo limita los recursos y la prueba necesita varios lotes. Se
  // sube a `full` con el cliente administrativo — eso es plan comercial, no
  // una comprobación que la prueba quiera esquivar.
  for (const org of [orgA, orgB]) {
    await admin.from("organization_modules")
      .update({ access_mode: "full", access_expires_at: null })
      .eq("organization_id", org).eq("module_code", "traceability_6632");
  }

  const { data: sup } = await a.client.from("suppliers")
    .insert({ organization_id: orgA, name: `Prov ${stamp}` }).select("id").single();
  const { data: mat } = await a.client.from("materials")
    .insert({ organization_id: orgA, name: `Mat ${stamp}`, classification_code: "postconsumer_valid" })
    .select("id").single();
  assert(sup && mat, "fixture: proveedor y material");

  // Un lote recibido HACE UN AÑO. Es la fecha contra la que se juzga todo.
  const HACE_UN_ANNO = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const loteViejo = await newInputBatch(a.client, orgA, sup!.id, mat!.id, `L-VIEJO-${stamp}`, HACE_UN_ANNO);
  const loteHoy   = await newInputBatch(a.client, orgA, sup!.id, mat!.id, `L-HOY-${stamp}`, HOY);

  // -------------------------------------------------------------------------
  // 0 · El fixture es sano. Si esta falla, las demás no significan nada.
  // -------------------------------------------------------------------------
  await check("0. El fixture quedó como se pidió", async () => {
    const { data } = await a.client.from("input_batches")
      .select("id, received_date").eq("id", loteViejo).single();
    assert(data?.received_date === HACE_UN_ANNO,
      `el lote viejo debía tener received_date=${HACE_UN_ANNO}, tiene ${data?.received_date}`);
  });

  // -------------------------------------------------------------------------
  // A · Las cuatro condiciones de PT-F05
  // -------------------------------------------------------------------------
  await check("A1. Sin confirmación humana no se escribe nada", async () => {
    const ev = await newEvidence(a.client, orgA, `A1 ${stamp}`, { status: "valid" });
    const { error } = await confirmar(a.client, ev, "input_batch", loteHoy, { confirmed: false });
    assert(error, "la base debía rechazar sin confirmación");
    assert(/confirmacion|confirmación/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
    assert((await contarEnlaces(a.client, ev)) === 0, "cancelar no puede dejar filas");
  });

  await check("A2. Una evidencia pendiente no se puede asociar", async () => {
    const ev = await newEvidence(a.client, orgA, `A2 ${stamp}`);   // pending
    const { error } = await confirmar(a.client, ev, "input_batch", loteHoy);
    assert(error, "una pendiente no debía poder asociarse");
    assert(/aceptada internamente/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
    assert((await contarEnlaces(a.client, ev)) === 0, "no debía quedar fila");
  });

  await check("A3. Una evidencia rechazada tampoco", async () => {
    const ev = await newEvidence(a.client, orgA, `A3 ${stamp}`, { status: "rejected" });
    const { error } = await confirmar(a.client, ev, "input_batch", loteHoy);
    assert(error, "una rechazada no debía poder asociarse");
    assert((await contarEnlaces(a.client, ev)) === 0, "no debía quedar fila");
  });

  await check("A4. Una evidencia archivada tampoco", async () => {
    const ev = await newEvidence(a.client, orgA, `A4 ${stamp}`, { status: "valid", archived: true });
    const { error } = await confirmar(a.client, ev, "input_batch", loteHoy);
    assert(error, "una archivada no debía poder asociarse");
    assert(/archivada/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("A5. Entre empresas, bloqueado", async () => {
    const evA = await newEvidence(a.client, orgA, `A5 ${stamp}`, { status: "valid" });
    // B intenta colgar una evidencia de A de un lote suyo. Ni siquiera puede
    // leerla: la RPC resuelve la organización desde la evidencia y comprueba
    // que quien confirma sea miembro de ESA empresa.
    const { error } = await confirmar(b.client, evA, "input_batch", loteHoy);
    assert(error, "una empresa no puede confirmar evidencias de otra");
    void orgB;
  });

  // -------------------------------------------------------------------------
  // B · La vigencia se juzga contra la fecha del lote (PT-F02/F03)
  // -------------------------------------------------------------------------
  await check("B1. Vencida HOY pero vigente cuando llegó el lote: SE ASOCIA", async () => {
    // Vigencia terminada hace seis meses; el lote llegó hace un año.
    const haceSeisMeses = new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10);
    const ev = await newEvidence(a.client, orgA, `B1 ${stamp}`,
      { status: "valid", validUntil: haceSeisMeses });
    const { error } = await confirmar(a.client, ev, "input_batch", loteViejo);
    assert(!error, `debía asociarse: ${error?.message}`);
    const { data } = await a.client.from("evidence_links")
      .select("reference_date, applicability_basis").eq("evidence_id", ev).single();
    assert(data?.reference_date === HACE_UN_ANNO,
      `la fecha congelada debía ser la del lote (${HACE_UN_ANNO}), es ${data?.reference_date}`);
    assert(data?.applicability_basis === "operation_date",
      `el motivo debía ser operation_date, es ${data?.applicability_basis}`);
  });

  await check("B2. Ya había vencido cuando llegó el lote: se rechaza", async () => {
    // La vigencia terminó hace DOS años; el lote llegó hace uno.
    const haceDosAnnos = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
    const ev = await newEvidence(a.client, orgA, `B2 ${stamp}`,
      { status: "valid", validUntil: haceDosAnnos });
    const { error } = await confirmar(a.client, ev, "input_batch", loteViejo);
    assert(error, "no amparaba esa operación y debía rechazarse");
    assert(/vigente en la fecha de la operacion/i.test(error!.message),
      `mensaje inesperado: ${error!.message}`);
  });

  await check("B2b. El caso simétrico NO se puede probar: PCR no tiene valid_from", async () => {
    // Una evidencia vigente hoy que TODAVÍA no lo estaba cuando llegó el lote
    // exigiría `valid_from`, y `evidences` no lo tiene — `textile_evidences`
    // sí. La regla de aplicabilidad ya lo contempla para el día que exista;
    // hoy la condición es trivialmente cierta y esto lo deja dicho en vez de
    // fingir una comprobación que no comprueba nada.
    const { data } = await admin.rpc("evidence_target_reference_date", {
      p_target_type: "input_batch", p_target_id: loteViejo,
    });
    assert(data === HACE_UN_ANNO, `la fecha del destino debía ser ${HACE_UN_ANNO}, es ${data}`);
    const { data: cols } = await admin
      .from("evidences").select("*").limit(1);
    if ((cols ?? []).length > 0) {
      assert(!("valid_from" in (cols![0] as Record<string, unknown>)),
        "apareció valid_from en evidences: reactiva la comprobación simétrica");
    }
  });

  await check("B3. `valid_until` es INCLUSIVO: el propio día cuenta", async () => {
    const ev = await newEvidence(a.client, orgA, `B3 ${stamp}`,
      { status: "valid", validUntil: HACE_UN_ANNO });   // vence EL día del lote
    const { error } = await confirmar(a.client, ev, "input_batch", loteViejo);
    assert(!error, `el día de vencimiento debía contar: ${error?.message}`);
  });

  await check("B4. Sin vencimiento declarado no es lo mismo que vencida", async () => {
    const ev = await newEvidence(a.client, orgA, `B4 ${stamp}`,
      { status: "valid", validUntil: null });
    const { error } = await confirmar(a.client, ev, "input_batch", loteViejo);
    assert(!error, `null significa «sin vencimiento», no «vencida»: ${error?.message}`);
  });

  await check("B5. Destino de catálogo: se juzga contra hoy, y queda dicho", async () => {
    const ev = await newEvidence(a.client, orgA, `B5 ${stamp}`, { status: "valid" });
    const { error } = await confirmar(a.client, ev, "supplier", sup!.id);
    assert(!error, `un proveedor no tiene fecha propia: ${error?.message}`);
    const { data } = await a.client.from("evidence_links")
      .select("reference_date, applicability_basis").eq("evidence_id", ev).single();
    assert(data?.applicability_basis === "catalog_current",
      `debía anotarse catalog_current, es ${data?.applicability_basis}`);
    assert(data?.reference_date === HOY, `debía congelar hoy, es ${data?.reference_date}`);
  });

  // -------------------------------------------------------------------------
  // C · El snapshot es historia, no un espejo (PT-F06, PT-H01)
  // -------------------------------------------------------------------------
  await check("C1. El snapshot guarda el estado y la vigencia del momento", async () => {
    const dentroDeUnAnno = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
    const ev = await newEvidence(a.client, orgA, `C1 ${stamp}`,
      { status: "valid", validUntil: dentroDeUnAnno });
    const { error } = await confirmar(a.client, ev, "input_batch", loteHoy);
    assert(!error, `${error?.message}`);
    const { data } = await a.client.from("evidence_links")
      .select("evidence_status_at_confirmation, evidence_valid_until_at_confirmation, confirmed_at, confirmed_by")
      .eq("evidence_id", ev).single();
    assert(data?.evidence_status_at_confirmation === "valid", "debía congelar el estado");
    assert(data?.evidence_valid_until_at_confirmation === dentroDeUnAnno, "debía congelar la vigencia");
    assert(data?.confirmed_at, "debía registrar cuándo");
    assert(data?.confirmed_by === a.id, "debía registrar quién");
  });

  await check("C2. Rechazar la evidencia DESPUÉS no reescribe el snapshot", async () => {
    // PT-H01 · El pasado no se edita. La evidencia cambia; lo que se registró
    // que era cierto cuando se asoció, no.
    const ev = await newEvidence(a.client, orgA, `C2 ${stamp}`, { status: "valid" });
    assert(!(await confirmar(a.client, ev, "input_batch", loteHoy)).error, "asociar");
    const antes = await a.client.from("evidence_links")
      .select("evidence_status_at_confirmation, reference_date").eq("evidence_id", ev).single();

    const { error: eRech } = await a.client.from("evidences")
      .update({ status: "rejected", review_comment: "resultó incorrecta" }).eq("id", ev);
    assert(!eRech, `rechazar después: ${eRech?.message}`);

    const despues = await a.client.from("evidence_links")
      .select("evidence_status_at_confirmation, reference_date").eq("evidence_id", ev).single();
    assert(despues.data?.evidence_status_at_confirmation === antes.data?.evidence_status_at_confirmation,
      "el estado congelado cambió: el pasado se reescribió");
    assert(despues.data?.reference_date === antes.data?.reference_date,
      "la fecha congelada cambió");
    assert(antes.data?.evidence_status_at_confirmation === "valid",
      "y lo congelado debía ser 'valid', que es lo que era entonces");
  });

  await check("C3. Reconfirmar no reescribe el snapshot original", async () => {
    const ev = await newEvidence(a.client, orgA, `C3 ${stamp}`, { status: "valid" });
    assert(!(await confirmar(a.client, ev, "input_batch", loteHoy)).error, "primera");
    const primera = await a.client.from("evidence_links")
      .select("id, confirmed_at").eq("evidence_id", ev).single();
    const { error } = await confirmar(a.client, ev, "input_batch", loteHoy);
    assert(!error, `reconfirmar no debía fallar: ${error?.message}`);
    const segunda = await a.client.from("evidence_links")
      .select("id, confirmed_at").eq("evidence_id", ev).single();
    assert(segunda.data?.id === primera.data?.id, "debía devolver el mismo enlace");
    assert(segunda.data?.confirmed_at === primera.data?.confirmed_at,
      "reconfirmar reescribió la marca original");
    assert((await contarEnlaces(a.client, ev)) === 1, "no debía duplicar");
  });

  // -------------------------------------------------------------------------
  // D · La puerta de atrás está cerrada
  // -------------------------------------------------------------------------
  await check("D1. El INSERT directo en evidence_links está denegado", async () => {
    // Sin esto, todo lo anterior sería una sugerencia.
    const ev = await newEvidence(a.client, orgA, `D1 ${stamp}`, { status: "pending" });
    const { error } = await a.client.from("evidence_links").insert({
      organization_id: orgA, evidence_id: ev,
      target_type: "input_batch", target_id: loteHoy, link_role: "por la puerta de atrás",
    });
    assert(error, "debía denegarse: no hay política de insert");
    assert((await contarEnlaces(a.client, ev)) === 0, "y no debía quedar fila");
  });

  await check("D2. Un destino no soportado se rechaza nombrando los que sí", async () => {
    const ev = await newEvidence(a.client, orgA, `D2 ${stamp}`, { status: "valid" });
    const { error } = await confirmar(a.client, ev, "document", loteHoy);
    assert(error, "'document' está en el enum pero el disparador no lo resuelve");
    assert(/no admite enlaces de evidencia/i.test(error!.message),
      `el mensaje debía nombrar los admitidos: ${error!.message}`);
  });

  await check("D3. Las filas legacy se quedan sin snapshot, no se inventan", async () => {
    // Se simula una fila anterior a 0142 con el cliente administrativo, que es
    // la única forma que queda de escribir sin pasar por la confirmación.
    const ev = await newEvidence(a.client, orgA, `D3 ${stamp}`, { status: "valid" });
    const { error } = await admin.from("evidence_links").insert({
      organization_id: orgA, evidence_id: ev,
      target_type: "input_batch", target_id: loteHoy, link_role: "legacy",
    });
    assert(!error, `el administrador sí puede (simula el pasado): ${error?.message}`);
    const { data } = await a.client.from("evidence_links")
      .select("confirmed_at, reference_date, applicability_basis").eq("evidence_id", ev).single();
    assert(data?.confirmed_at === null, "una fila legacy no puede fingir confirmación");
    assert(data?.reference_date === null, "ni fecha de referencia");
    assert(data?.applicability_basis === null, "ni motivo");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
