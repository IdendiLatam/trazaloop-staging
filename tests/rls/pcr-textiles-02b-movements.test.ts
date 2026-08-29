/**
 * Trazaloop · PT-02B · Movimientos de producto terminado · contra base REAL.
 *
 * LA PREGUNTA QUE ESTO CIERRA
 *
 * Hasta este sprint, «disponible» de un lote producido era producido menos
 * reproceso interno. Un lote vendido entero figuraba disponible para siempre,
 * con la misma etiqueta que uno que sigue en el almacén.
 *
 * Correr: npm run test:pcr-textiles-02b-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { availableKg, stockStatement } from "@/lib/domain/output-movements";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const HOY = new Date().toISOString().slice(0, 10);

async function main() {
  console.log("\nPT-02B · Movimientos de producto terminado\n");

  const email = `pt02b-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: u } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA mov" } });
  assert(u.user, "usuario");
  const cli: SupabaseClient = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  assert(!(await cli.auth.signInWithPassword({ email, password })).error, "login");

  const { data: orgId } = await cli.rpc("create_organization", { p_name: `PT02B ${stamp}` });
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "traceability_6632");

  async function loteProducido(codigo: string, kg: number): Promise<string> {
    const { data: o } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-${codigo}-${stamp}`, order_date: HOY })
      .select("id").single();
    const { data: ob, error } = await cli.from("output_batches").insert({
      organization_id: org, production_order_id: o!.id, batch_code: `LS-${codigo}-${stamp}`,
      produced_date: HOY, produced_quantity_kg: kg }).select("id").single();
    assert(!error && ob, `lote ${codigo}: ${error?.message}`);
    return ob!.id as string;
  }

  async function saldo(id: string) {
    const { data } = await cli.from("v_output_batch_stock")
      .select("produced_kg, reprocessed_kg, dispatched_kg, lost_kg, internal_use_kg, adjustment_kg, available_kg, movements_count, physical_max_kg, is_inconsistent")
      .eq("output_batch_id", id).single();
    return data!;
  }

  async function mover(id: string, kind: string, qty: number, extra: Record<string, unknown> = {}) {
    return cli.from("output_batch_movements").insert({
      organization_id: org, output_batch_id: id, movement_kind: kind,
      quantity: qty, unit_code: "kg", ...extra });
  }

  // -------------------------------------------------------------------------
  await check("0. Un lote sin movimientos: todo disponible, y se DICE que no hay salidas", async () => {
    const b = await loteProducido("A", 100);
    const s = await saldo(b);
    assert(Number(s.available_kg) === 100, `debía quedar 100, quedó ${s.available_kg}`);
    assert(Number(s.movements_count) === 0, "no debía haber movimientos");
    // La distinción: el número coincide, el significado no.
    assert(/Sin movimientos registrados/.test(stockStatement(100, 0)),
      "sin movimientos, «100 kg disponibles» es una ausencia de datos, no una medición");
    assert(/Disponible: 100/.test(stockStatement(100, 1)), "con movimientos sí es una medición");
  });

  await check("A1. Un despacho baja el saldo", async () => {
    const b = await loteProducido("B", 100);
    const { error } = await mover(b, "dispatch", 40, { reference: "REM-001" });
    assert(!error, `despacho: ${error?.message}`);
    const s = await saldo(b);
    assert(Number(s.dispatched_kg) === 40, "debía registrarse el despacho");
    assert(Number(s.available_kg) === 60, `debían quedar 60, quedan ${s.available_kg}`);
    assert(Number(s.movements_count) === 1, "y contar como un movimiento");
  });

  await check("A2. No se puede despachar más de lo que hay", async () => {
    const b = await loteProducido("C", 50);
    await mover(b, "dispatch", 30);
    const { error } = await mover(b, "dispatch", 30);
    assert(error, "30 + 30 > 50: debía rechazarse");
    assert(/supera lo disponible/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
    const s = await saldo(b);
    assert(Number(s.available_kg) === 20, "el saldo no debía moverse");
  });

  await check("A3. El reproceso interno y las salidas se restan JUNTOS", async () => {
    const b = await loteProducido("D", 100);
    // Ese lote se reconsume en otra orden.
    const { data: o2 } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-D2-${stamp}`, order_date: HOY })
      .select("id").single();
    const { error: eR } = await cli.from("output_batch_consumption").insert({
      organization_id: org, production_order_id: o2!.id, output_batch_id: b, mass_kg: 30 });
    assert(!eR, `reproceso: ${eR?.message}`);
    await mover(b, "dispatch", 50);
    const s = await saldo(b);
    assert(Number(s.reprocessed_kg) === 30 && Number(s.dispatched_kg) === 50, "ambos registrados");
    assert(Number(s.available_kg) === 20, `100 − 30 − 50 = 20, dio ${s.available_kg}`);
    const { error } = await mover(b, "dispatch", 25);
    assert(error, "el reproceso también ocupa saldo: 25 > 20 debía rechazarse");
  });

  await check("A4. Merma y uso interno también restan", async () => {
    const b = await loteProducido("E", 100);
    await mover(b, "loss", 10, { reason: "daño en almacén" });
    await mover(b, "internal_use", 15, { reason: null });
    const s = await saldo(b);
    assert(Number(s.lost_kg) === 10 && Number(s.internal_use_kg) === 15, "ambos registrados");
    assert(Number(s.available_kg) === 75, `100 − 10 − 15 = 75, dio ${s.available_kg}`);
  });

  await check("A5. Una merma sin motivo se rechaza", async () => {
    const b = await loteProducido("F", 10);
    const { error } = await mover(b, "loss", 1);
    assert(error, "perder mercancía sin decir por qué no se registra");
    assert(/reason_required/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("A6. Solo un ajuste puede SUMAR, y solo para deshacer otro", async () => {
    const b = await loteProducido("G", 100);
    const { error } = await mover(b, "dispatch", 5, { direction: "in" });
    assert(error, "un despacho que entra sería un despacho al revés");
    // El disparador se adelanta al CHECK —los BEFORE corren antes— y da un
    // mensaje que se entiende sin conocer el esquema. El CHECK sigue detrás.
    assert(/Solo un ajuste por recuento puede sumar/.test(error!.message),
      `mensaje inesperado: ${error!.message}`);

    // PT-02B.1 · Este caso sumaba 5 kg sobre un lote de 100 y esperaba 105.
    // Ya no: un recuento no fabrica producto. Para que un ajuste pueda sumar
    // tiene que haber un ajuste anterior que lo justifique, y esa es
    // exactamente la única situación legítima.
    const { error: eArriba } = await mover(b, "adjustment", 5,
      { direction: "in", reason: "aparecieron 5 kg de la nada",
        counted_quantity: 105, theoretical_quantity_at_count: 100 });
    assert(eArriba, "un ajuste no puede dejar el saldo por encima de lo físicamente posible");

    const { error: eAbajo } = await mover(b, "adjustment", 5,
      { direction: "out", reason: "recuento físico: faltan 5 kg",
        counted_quantity: 95, theoretical_quantity_at_count: 100 });
    assert(!eAbajo, `el recuento a la baja sí: ${eAbajo?.message}`);
    assert(Number((await saldo(b)).available_kg) === 95, "debía bajar a 95");

    const { error: eVuelta } = await mover(b, "adjustment", 5,
      { direction: "in", reason: "segundo recuento: estaban en otra estiba",
        counted_quantity: 100, theoretical_quantity_at_count: 95 });
    assert(!eVuelta, `deshacer el ajuste anterior sí: ${eVuelta?.message}`);
    assert(Number((await saldo(b)).available_kg) === 100, "debía volver a 100");
  });

  await check("A7. La cantidad es SIEMPRE positiva", async () => {
    const b = await loteProducido("H", 10);
    const { error } = await mover(b, "dispatch", -5);
    assert(error, "una cantidad negativa se teclea mal sin que nada chirríe");
    assert(/quantity_valid/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("A8. Otra unidad se rechaza: no se convierte", async () => {
    const b = await loteProducido("I", 10);
    const { error } = await mover(b, "dispatch", 1, { unit_code: "unit" });
    assert(error, "los lotes producidos se miden en kg");
    assert(/no convierte unidades/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  // -------------------------------------------------------------------------
  // B · Corrección sin destrucción
  // -------------------------------------------------------------------------
  await check("B1. Corregir INSERTA y conserva el original", async () => {
    const b = await loteProducido("J", 100);
    await mover(b, "dispatch", 60, { reference: "REM-J" });
    const { data: orig } = await cli.from("output_batch_movements")
      .select("id, quantity, is_current").eq("output_batch_id", b).single();

    const { error } = await cli.rpc("correct_output_batch_movement", {
      p_movement_id: orig!.id, p_quantity: 40, p_reason: "se pesó mal en báscula" });
    assert(!error, `corregir: ${error?.message}`);

    const { data: todos } = await cli.from("output_batch_movements")
      .select("id, quantity, is_current, corrects_movement_id, superseded_by_movement_id, correction_reason")
      .eq("output_batch_id", b).order("created_at");
    assert(todos!.length === 2, `debían quedar DOS filas, hay ${todos!.length}`);

    const viejo = todos!.find((m) => m.id === orig!.id)!;
    const nuevo = todos!.find((m) => m.id !== orig!.id)!;
    assert(Number(viejo.quantity) === 60, "el original conserva su cantidad: el pasado no se edita");
    assert(viejo.is_current === false, "el original deja de ser vigente");
    assert(viejo.superseded_by_movement_id === nuevo.id, "y apunta a su corrección");
    assert(nuevo.corrects_movement_id === orig!.id, "la corrección apunta al original");
    assert(nuevo.correction_reason === "se pesó mal en báscula", "con su motivo");

    const s = await saldo(b);
    assert(Number(s.dispatched_kg) === 40, `solo debía contar el vigente, contó ${s.dispatched_kg}`);
    assert(Number(s.available_kg) === 60, `100 − 40 = 60, dio ${s.available_kg}`);
  });

  await check("B2. Una corrección sin motivo se rechaza", async () => {
    const b = await loteProducido("K", 10);
    await mover(b, "dispatch", 5);
    const { data: m } = await cli.from("output_batch_movements")
      .select("id").eq("output_batch_id", b).single();
    const { error } = await cli.rpc("correct_output_batch_movement", {
      p_movement_id: m!.id, p_quantity: 3, p_reason: "  " });
    assert(error, "una corrección sin motivo no explica nada");
  });

  await check("B3. No se corrige dos veces el mismo movimiento", async () => {
    const b = await loteProducido("L", 100);
    await mover(b, "dispatch", 50);
    const { data: m } = await cli.from("output_batch_movements")
      .select("id").eq("output_batch_id", b).single();
    await cli.rpc("correct_output_batch_movement", {
      p_movement_id: m!.id, p_quantity: 30, p_reason: "primera" });
    const { error } = await cli.rpc("correct_output_batch_movement", {
      p_movement_id: m!.id, p_quantity: 20, p_reason: "segunda" });
    assert(error, "hay que corregir el vigente, no el ya corregido");
    assert(/ya fue corregido/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("B4. Corregir a la BAJA no choca contra su propio original", async () => {
    // Si el original no se retirase antes de insertar el nuevo, la guarda
    // vería 100 + 60 y rechazaría una corrección perfectamente válida.
    const b = await loteProducido("M", 100);
    await mover(b, "dispatch", 100);
    const { data: m } = await cli.from("output_batch_movements")
      .select("id").eq("output_batch_id", b).single();
    const { error } = await cli.rpc("correct_output_batch_movement", {
      p_movement_id: m!.id, p_quantity: 90, p_reason: "sobraron 10 kg" });
    assert(!error, `debía poder corregirse a la baja: ${error?.message}`);
    const s = await saldo(b);
    assert(Number(s.available_kg) === 10, `debían quedar 10, dio ${s.available_kg}`);
  });

  await check("B5. Un movimiento NO se puede borrar, por DOS caminos distintos", async () => {
    const b = await loteProducido("N", 10);
    await mover(b, "dispatch", 5);
    const { data: m } = await cli.from("output_batch_movements")
      .select("id").eq("output_batch_id", b).single();

    // (1) Por la sesión de una persona: no hay política de DELETE, así que la
    // RLS no deja pasar la fila. Y aquí conviene ser exacto sobre CÓMO no
    // deja pasar: PostgREST no devuelve error — devuelve éxito habiendo
    // afectado a cero filas. Es la misma forma de fallar que costó un sprint
    // en QUALITY-12.2D, y por eso lo que se comprueba es que la fila SIGA,
    // no que haya habido un error.
    await cli.from("output_batch_movements").delete().eq("id", m!.id);
    const { count } = await cli.from("output_batch_movements")
      .select("id", { count: "exact", head: true }).eq("output_batch_id", b);
    assert(count === 1, "la RLS dejó borrar el movimiento");

    // (2) Con privilegios que SÍ alcanzan la fila: ahí es el disparador quien
    // lo impide, y ese sí habla. Las dos capas existen a propósito: una
    // política se relaja con un `alter` y el disparador obliga a pensarlo.
    const { error } = await admin.from("output_batch_movements").delete().eq("id", m!.id);
    assert(error, "el disparador debía bloquear el borrado privilegiado");
    assert(/no se elimina/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
    const { count: sigue } = await admin.from("output_batch_movements")
      .select("id", { count: "exact", head: true }).eq("output_batch_id", b);
    assert(sigue === 1, "y sigue ahí");
  });

  // -------------------------------------------------------------------------
  // C · Concurrencia y aislamiento
  // -------------------------------------------------------------------------
  await check("C1. Dos despachos simultáneos: como mucho uno compromete el saldo", async () => {
    const b = await loteProducido("O", 100);
    const a = new Client({ connectionString: DB_URL });
    const c = new Client({ connectionString: DB_URL });
    await a.connect(); await c.connect();
    try {
      await a.query("begin"); await c.query("begin");
      const ins = (x: Client) => x.query(
        `insert into output_batch_movements
           (organization_id, output_batch_id, movement_kind, quantity, unit_code, created_by)
         values ($1, $2, 'dispatch', 60, 'kg', $3)`, [org, b, u.user!.id]);
      await ins(a);
      const cPromesa = ins(c).then(() => "ok" as const).catch((e) => e as Error);
      await a.query("commit");
      const r = await cPromesa;
      assert(r !== "ok", "los dos pasaron: el lote quedó sobredespachado (120 de 100)");
      assert(/supera lo disponible/i.test((r as Error).message),
        `se esperaba el rechazo por saldo: ${(r as Error).message}`);
      await c.query("rollback");
    } finally {
      await a.end().catch(() => {}); await c.end().catch(() => {});
    }
    const s = await saldo(b);
    assert(Number(s.dispatched_kg) === 60, `debía quedar un solo despacho, hay ${s.dispatched_kg}`);
  });

  await check("C2. Otra empresa no ve ni registra movimientos de este lote", async () => {
    const b = await loteProducido("P", 100);
    await mover(b, "dispatch", 10);
    const otro = `pt02b-b-${stamp}@test.trazaloop.dev`;
    const { data: u2 } = await admin.auth.admin.createUser({
      email: otro, password, email_confirm: true, user_metadata: { full_name: "QA b" } });
    assert(u2.user, "segundo usuario");
    const c2 = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    await c2.auth.signInWithPassword({ email: otro, password });

    const { data: leidos } = await c2.from("output_batch_movements")
      .select("id").eq("output_batch_id", b);
    assert((leidos ?? []).length === 0, "no debía poder leer los movimientos de otra empresa");

    const { error } = await c2.from("output_batch_movements").insert({
      organization_id: org, output_batch_id: b, movement_kind: "dispatch",
      quantity: 1, unit_code: "kg" });
    assert(error, "ni escribir sobre ellos");

    const { data: vistos } = await c2.from("v_output_batch_stock")
      .select("output_batch_id").eq("output_batch_id", b);
    assert((vistos ?? []).length === 0, "ni ver su saldo");
  });

  await check("D1. La fórmula del dominio y la de la base coinciden", async () => {
    const b = await loteProducido("Q", 200);
    const { data: o2 } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-Q2-${stamp}`, order_date: HOY })
      .select("id").single();
    await cli.from("output_batch_consumption").insert({
      organization_id: org, production_order_id: o2!.id, output_batch_id: b, mass_kg: 20 });
    await mover(b, "dispatch", 50);
    await mover(b, "loss", 5, { reason: "rotura" });
    await mover(b, "internal_use", 10);
    await mover(b, "adjustment", 3, { direction: "out", reason: "recuento",
      counted_quantity: 112, theoretical_quantity_at_count: 115 });

    const s = await saldo(b);
    const dominio = availableKg({
      producedKg: Number(s.produced_kg), reprocessedKg: Number(s.reprocessed_kg),
      dispatchedKg: Number(s.dispatched_kg), lostKg: Number(s.lost_kg),
      internalUseKg: Number(s.internal_use_kg), adjustmentKg: Number(s.adjustment_kg),
    });
    assert(dominio === Number(s.available_kg),
      `el dominio dice ${dominio} y la base ${s.available_kg}`);
    assert(Number(s.available_kg) === 112, `200−20−50−5−10−3 = 112, dio ${s.available_kg}`);
  });


  // =========================================================================
  // PT-02B.1 · LO QUE EL DISCOVERY ENCONTRÓ ABIERTO
  // =========================================================================

  /** Un lote y una orden aparte para poder reprocesarlo. */
  async function loteConOrdenConsumidora(codigo: string, kg: number) {
    const b = await loteProducido(codigo, kg);
    const { data: o, error } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-${codigo}-R-${stamp}`, order_date: HOY })
      .select("id").single();
    assert(!error && o, `orden consumidora ${codigo}: ${error?.message}`);
    return { batch: b, orderId: o!.id as string };
  }

  await check("E. Un conteo por encima del máximo físico se rechaza", async () => {
    const b = await loteProducido("B1E1", 100);
    await mover(b, "dispatch", 40);
    // Techo físico: 100 − 40 = 60. Contar 70 no es material que aparece.
    const { error } = await mover(b, "adjustment", 10, {
      direction: "in", reason: "recuento",
      counted_quantity: 70, theoretical_quantity_at_count: 60 });
    assert(error, "el conteo por encima del techo físico debía rechazarse");
    assert(/físicamente posible/.test(error!.message), `mensaje inesperado: ${error!.message}`);
    assert(/Corrige primero/.test(error!.message),
      "el mensaje debe decir qué hacer: un ajuste no sustituye a corregir la fuente");
    const s = await saldo(b);
    assert(Number(s.available_kg) === 60, `el saldo no debía moverse, dio ${s.available_kg}`);
  });

  await check("E2. El conteo, el teórico y la diferencia tienen que cuadrar", async () => {
    const b = await loteProducido("B1E2", 100);
    const { error } = await mover(b, "adjustment", 10, {
      direction: "out", reason: "recuento incoherente",
      counted_quantity: 97, theoretical_quantity_at_count: 100 });
    assert(error, "97 sobre 100 son 3, no 10");
    assert(/count_matches_delta/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("F. Despachar todo y luego reprocesar: imposible", async () => {
    const { batch, orderId } = await loteConOrdenConsumidora("B1F", 100);
    await mover(batch, "dispatch", 100);
    assert(Number((await saldo(batch)).available_kg) === 0, "el despacho debía dejarlo en 0");
    const { error } = await cli.from("output_batch_consumption").insert({
      organization_id: org, production_order_id: orderId, output_batch_id: batch, mass_kg: 100 });
    assert(error, "reprocesar un lote ya despachado era la doble salida: debía rechazarse");
    assert(/supera el saldo disponible/.test(error!.message), `mensaje inesperado: ${error!.message}`);
    assert(Number((await saldo(batch)).available_kg) === 0, "y el saldo sigue en 0, no en −100");
  });

  await check("G. Reprocesar todo y luego despachar: imposible", async () => {
    const { batch, orderId } = await loteConOrdenConsumidora("B1G", 100);
    const { error: eR } = await cli.from("output_batch_consumption").insert({
      organization_id: org, production_order_id: orderId, output_batch_id: batch, mass_kg: 100 });
    assert(!eR, `reproceso: ${eR?.message}`);
    const { error } = await mover(batch, "dispatch", 100);
    assert(error, "el despacho debía rechazarse: no queda nada");
    assert(/supera lo disponible/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("H. Un despacho y un reproceso simultáneos no pueden comprometer el mismo saldo", async () => {
    // Los DOS caminos de salida toman el mismo candado sobre la fila del lote,
    // así que el cruce se serializa igual que dos despachos. Sin eso, cada uno
    // leería el mismo saldo previo y los dos pasarían.
    const { batch, orderId } = await loteConOrdenConsumidora("B1H", 100);
    const c1 = new Client({ connectionString: DB_URL });
    const c2 = new Client({ connectionString: DB_URL });
    await c1.connect(); await c2.connect();
    try {
      await c1.query("begin"); await c2.query("begin");
      await c1.query(
        `insert into output_batch_movements (organization_id, output_batch_id, movement_kind, direction, quantity, unit_code, created_by)
         values ($1,$2,'dispatch','out',80,'kg',$3)`, [org, batch, u.user!.id]);
      const reproceso = c2.query(
        `insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg, created_by)
         values ($1,$2,$3,80,$4)`, [org, orderId, batch, u.user!.id]);
      await c1.query("commit");
      let segundoFallo = false;
      try { await reproceso; await c2.query("commit"); }
      catch { segundoFallo = true; await c2.query("rollback").catch(() => {}); }
      assert(segundoFallo, "los dos comprometieron el mismo saldo: 80 + 80 > 100");
      const s = await saldo(batch);
      assert(Number(s.available_kg) >= 0, `saldo negativo tras el cruce: ${s.available_kg}`);
      assert(Number(s.available_kg) === 20, `debía quedar 20, quedó ${s.available_kg}`);
    } finally { await c1.end(); await c2.end(); }
  });

  await check("J. Anular deshace el efecto y conserva el original", async () => {
    const b = await loteProducido("B1J", 100);
    const { error: eMov } = await mover(b, "dispatch", 40);
    assert(!eMov, `despacho J: ${eMov?.message}`);
    const { data: mov } = await cli.from("output_batch_movements")
      .select("id").eq("output_batch_id", b).eq("is_current", true).single();
    assert(Number((await saldo(b)).available_kg) === 60, "antes de anular debía quedar 60");

    const { error } = await cli.rpc("correct_output_batch_movement", {
      p_movement_id: mov!.id, p_quantity: 0, p_reason: "el despacho nunca ocurrió" });
    assert(!error, `anular debía poder hacerse: ${error?.message}`);

    assert(Number((await saldo(b)).available_kg) === 100, "tras anular, el saldo vuelve a 100");

    const { data: filas } = await cli.from("output_batch_movements")
      .select("id, quantity, is_current, corrects_movement_id, correction_reason")
      .eq("output_batch_id", b).order("created_at");
    assert((filas ?? []).length === 2, `debían quedar 2 filas, hay ${filas?.length}`);
    const original = filas!.find((f) => f.id === mov!.id)!;
    const anulacion = filas!.find((f) => f.id !== mov!.id)!;
    assert(original.is_current === false && Number(original.quantity) === 40,
      "el original se conserva intacto y no vigente");
    assert(anulacion.is_current === true && Number(anulacion.quantity) === 0,
      "la anulación queda vigente y a cero");
    assert(anulacion.corrects_movement_id === mov!.id, "y apuntando al original");
    assert((anulacion.correction_reason ?? "").length > 0, "con su motivo");
  });

  await check("J2. Una fila a cero SIN linaje sigue siendo imposible", async () => {
    const b = await loteProducido("B1J2", 100);
    const { error } = await mover(b, "dispatch", 0);
    assert(error, "un movimiento de cero que no corrige nada no significa nada");
    assert(/quantity_valid/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("N. El agregado por producto es la suma de sus lotes", async () => {
    const { data: prod } = await cli.from("products")
      .insert({ organization_id: org, code: `P-${stamp}`, name: `Producto stock ${stamp}` })
      .select("id").single();
    const { data: o1 } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-B1N1-${stamp}`, order_date: HOY })
      .select("id").single();
    const { data: o2 } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-B1N2-${stamp}`, order_date: HOY })
      .select("id").single();
    const crear = async (orderId: string, code: string, kg: number) => {
      const { data } = await cli.from("output_batches").insert({
        organization_id: org, production_order_id: orderId, batch_code: code,
        produced_date: HOY, produced_quantity_kg: kg, product_id: prod!.id })
        .select("id").single();
      return data!.id as string;
    };
    const b1 = await crear(o1!.id, `LS-B1N1-${stamp}`, 100);
    const b2 = await crear(o2!.id, `LS-B1N2-${stamp}`, 50);
    await mover(b1, "dispatch", 40);
    await mover(b2, "loss", 5, { reason: "rotura" });

    const { data: lotes } = await cli.from("v_output_batch_stock")
      .select("available_kg, produced_kg").eq("product_id", prod!.id);
    const sumaLotes = (lotes ?? []).reduce((a, r) => a + Number(r.available_kg), 0);

    const { data: agg } = await cli.from("v_product_stock")
      .select("*").eq("product_id", prod!.id).single();
    assert(Number(agg!.available_kg) === sumaLotes,
      `el agregado dice ${agg!.available_kg} y los lotes suman ${sumaLotes}`);
    assert(Number(agg!.available_kg) === 105, `100−40 + 50−5 = 105, dio ${agg!.available_kg}`);
    assert(Number(agg!.batches_total) === 2 && Number(agg!.batches_with_balance) === 2,
      "conteos de lotes incorrectos");
    assert(Number(agg!.exits_kg) === 45, `salidas 40+5 = 45, dio ${agg!.exits_kg}`);
  });

  await check("O. El agregado lleva su unidad y no mezcla", async () => {
    const { data: filas } = await cli.from("v_product_stock")
      .select("unit_code").eq("organization_id", org);
    assert((filas ?? []).length > 0, "debía haber agregados");
    assert((filas ?? []).every((f) => f.unit_code === "kg"),
      "los lotes producidos de PCR se miden en kg y solo en kg");
    // Y la unidad es parte de la agrupación, no un adorno: si algún día entra
    // otra, cada una tendrá su fila en vez de sumarse con la anterior.
    const { data: cols } = await cli.from("v_product_stock").select("*").limit(1);
    assert(Object.prototype.hasOwnProperty.call((cols ?? [{}])[0] ?? {}, "unit_code"),
      "la vista debe exponer la unidad");
  });

  await check("Q2. Otra empresa no ve el inventario agregado de esta", async () => {
    const otro = `pt02b1-otro-${stamp}@test.trazaloop.dev`;
    const { data: u2 } = await admin.auth.admin.createUser({
      email: otro, password, email_confirm: true });
    assert(u2.user, "usuario ajeno");
    const c2 = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    await c2.auth.signInWithPassword({ email: otro, password });
    const { data: filas } = await c2.from("v_product_stock")
      .select("product_id").eq("organization_id", org);
    assert((filas ?? []).length === 0, "el inventario agregado filtró entre empresas");
  });


  await check("P6-E/F. Un recuento rechazado no escribe NADA y el saldo no se mueve", async () => {
    // La otra mitad del defecto de formulario: cuando el servidor rechaza, lo
    // que no puede pasar es que algo haya quedado escrito a medias.
    const b = await loteProducido("B1P6", 100);
    await mover(b, "adjustment", 3, {
      direction: "out", reason: "recuento físico",
      counted_quantity: 97, theoretical_quantity_at_count: 100 });
    assert(Number((await saldo(b)).available_kg) === 97, "el recuento válido debía dejarlo en 97");

    const antes = await cli.from("output_batch_movements")
      .select("id", { count: "exact", head: true }).eq("output_batch_id", b);

    // Contar 120 sobre un techo de 100: imposible.
    const { error } = await mover(b, "adjustment", 23, {
      direction: "in", reason: "recuento imposible",
      counted_quantity: 120, theoretical_quantity_at_count: 97 });
    assert(error, "contar por encima del techo físico debía rechazarse");
    assert(/físicamente posible/.test(error!.message), `mensaje inesperado: ${error!.message}`);

    const despues = await cli.from("output_batch_movements")
      .select("id", { count: "exact", head: true }).eq("output_batch_id", b);
    assert(antes.count === despues.count,
      `el rechazo escribió ${(despues.count ?? 0) - (antes.count ?? 0)} fila(s)`);

    const s2 = await saldo(b);
    assert(Number(s2.available_kg) === 97, `el saldo se movió a ${s2.available_kg}`);
    assert(Number(s2.physical_max_kg) === 100, `el techo se movió a ${s2.physical_max_kg}`);

    // Y el inventario agregado tampoco.
    const { data: agg } = await cli.from("v_product_stock")
      .select("available_kg").eq("organization_id", org).is("product_id", null).single();
    assert(agg !== null, "debía existir el agregado de los lotes sin producto");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
