/**
 * Trazaloop · PT-03B · Unidades y concurrencia · contra base REAL.
 *
 * LA PARTE QUE NO SE PUEDE PROBAR DE OTRA FORMA
 *
 * El Design Freeze afirmó que faltaba el candado, y fue explícito en NO
 * afirmar que la carrera se produjera: leer `for update` en el fichero
 * demuestra la ausencia de una línea, no la existencia de un fallo.
 *
 * Esta suite lo cruza. Abre DOS conexiones de verdad, con DOS transacciones
 * simultáneas, cada una insertando un consumo que por separado cabe y juntos
 * no. Y comprueba las dos mitades:
 *
 *   · con el candado (hoy)  → como mucho una compromete el saldo;
 *   · sin el candado        → las dos pasan y el lote queda sobreconsumido.
 *
 * La segunda mitad se demuestra reproduciendo la guarda ANTIGUA sobre una
 * tabla de laboratorio, dentro de una transacción que se deshace. Sin eso, la
 * prueba diría «funciona» sin haber enseñado nunca qué es lo que falla.
 *
 * Se usa `pg` y no el cliente de Supabase porque hacen falta transacciones
 * explícitas y control de cuándo hace COMMIT cada una. PostgREST no da eso.
 *
 * Correr: npm run test:pcr-textiles-03b-rls
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import {
  canonicalUnit, unitsAreComparable, unitIsComputable, MEASUREMENT_UNITS,
} from "@/lib/domain/measurement-units";

loadEnv({ path: ".env.local" });

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/(127\.0\.0\.1|localhost)/.test(DB_URL)) {
  console.error("ABORTADO: esta suite escribe y se ejecuta SOLO contra la base local.");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const nuevo = () => new Client({ connectionString: DB_URL });

async function main() {
  console.log("\nPT-03B · Unidades y concurrencia (base real, transacciones de verdad)\n");

  const admin = nuevo();
  await admin.connect();

  // Fixture propio: empresa, proveedor, material, orden y lote de 100 kg.
  //
  // `created_by` es obligatorio y aquí no hay sesión: se reutiliza un perfil
  // existente. La suite no comprueba autoría ni RLS —de eso se ocupan las
  // otras—, sino el comportamiento TRANSACCIONAL de la guarda, que es lo que
  // solo se ve con dos conexiones de verdad.
  const { rows: perfiles } = await admin.query(`select id from public.profiles limit 1`);
  assert(perfiles.length > 0, "hace falta al menos un perfil para el fixture");
  const autor = perfiles[0].id as string;

  const { rows: [org] } = await admin.query(
    `insert into organizations (name, created_by) values ($1, $2) returning id`,
    [`PT03B ${stamp}`, autor]);
  const orgId = org.id as string;
  const { rows: [sup] } = await admin.query(
    `insert into textile_suppliers (organization_id, name, supplier_type)
     values ($1, $2, 'fabric_supplier') returning id`, [orgId, `Prov ${stamp}`]);
  const { rows: [mat] } = await admin.query(
    `insert into textile_materials (organization_id, name, material_type)
     values ($1, $2, 'main_fabric') returning id`, [orgId, `Mat ${stamp}`]);
  const { rows: [ref] } = await admin.query(
    `insert into textile_products (organization_id, name, category)
     values ($1, $2, 'shirt') returning id`, [orgId, `Prod ${stamp}`]);
  const { rows: [sku] } = await admin.query(
    `insert into textile_references (organization_id, product_id, sku)
     values ($1, $2, $3) returning id`, [orgId, ref.id, `SKU-${stamp}`]);
  const { rows: [ord] } = await admin.query(
    `insert into textile_production_orders (organization_id, order_code, reference_id, unit)
     values ($1, $2, $3, 'units') returning id`, [orgId, `OC-${stamp}`, sku.id]);
  const { rows: [lote] } = await admin.query(
    `insert into textile_input_lots
       (organization_id, lot_code, lot_type, material_id, supplier_id, quantity_received, unit, unit_code)
     values ($1, $2, 'material', $3, $4, 100, 'kg', 'kg') returning id`,
    [orgId, `LOTE-${stamp}`, mat.id, sup.id]);
  const loteId = lote.id as string;
  const ordenId = ord.id as string;

  await check("0. El fixture tiene un lote de 100 kg y nada consumido", async () => {
    const { rows } = await admin.query(
      `select quantity_received, quantity_consumed, quantity_remaining
         from v_textile_input_lot_balance where input_lot_id = $1`, [loteId]);
    assert(Number(rows[0].quantity_received) === 100, "recibido debía ser 100");
    assert(Number(rows[0].quantity_consumed) === 0, "consumido debía ser 0");
    assert(Number(rows[0].quantity_remaining) === 100, "saldo debía ser 100");
  });

  // -------------------------------------------------------------------------
  // A · LA CARRERA
  // -------------------------------------------------------------------------

  await check("A1. Dos consumos simultáneos de 60 kg: como mucho uno pasa", async () => {
    // 60 + 60 = 120 > 100. Por separado los dos caben.
    const a = nuevo(); const b = nuevo();
    await a.connect(); await b.connect();
    try {
      await a.query("begin"); await b.query("begin");

      const ins = (c: Client) => c.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 60, 'kg', 'kg', 'main_fabric')`,
        [orgId, ordenId, loteId]);

      // A inserta y NO confirma todavía: mantiene el candado del lote.
      await ins(a);

      // B intenta lo mismo. Con `for update` se BLOQUEA aquí hasta que A
      // resuelva; sin candado, leería el mismo total previo (0) y pasaría.
      const bPromesa = ins(b).then(() => "ok" as const).catch((e) => e as Error);

      await a.query("commit");
      const resultadoB = await bPromesa;

      assert(resultadoB !== "ok",
        "las dos inserciones pasaron: el lote quedó sobreconsumido (120 de 100)");
      assert(/Sobreconsumo bloqueado/.test((resultadoB as Error).message),
        `se esperaba el rechazo por sobreconsumo, llegó: ${(resultadoB as Error).message}`);
      await b.query("rollback");

      const { rows } = await admin.query(
        `select quantity_consumed, quantity_remaining
           from v_textile_input_lot_balance where input_lot_id = $1`, [loteId]);
      assert(Number(rows[0].quantity_consumed) === 60,
        `debía quedar 60 consumido, quedó ${rows[0].quantity_consumed}`);
      assert(Number(rows[0].quantity_remaining) === 40, "el saldo debía bajar a 40");
    } finally {
      await a.end().catch(() => {}); await b.end().catch(() => {});
    }
  });

  await check("A2. El rechazo llega con el errcode 23514, igual que en PCR", async () => {
    try {
      await admin.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 60, 'kg', 'kg', 'main_fabric')`,
        [orgId, ordenId, loteId]);
      assert(false, "debía rechazarse: quedan 40 kg y se piden 60");
    } catch (e) {
      const err = e as { code?: string; message: string };
      assert(err.code === "23514", `se esperaba 23514, llegó ${err.code}`);
    }
  });

  await check("A3. SIN candado las dos pasan: así es como falla lo que se arregló", async () => {
    // Se reproduce la guarda ANTIGUA sobre una tabla de laboratorio, dentro de
    // una transacción que se deshace. Es la mitad que demuestra QUÉ fallaba.
    const a = nuevo(); const b = nuevo();
    await a.connect(); await b.connect();
    try {
      await admin.query(`
        create table if not exists pt03b_lab_lote (id int primary key, recibido numeric);
        create table if not exists pt03b_lab_consumo (id serial primary key, lote int, cantidad numeric);
        truncate pt03b_lab_lote, pt03b_lab_consumo;
        insert into pt03b_lab_lote values (1, 100);
        create or replace function pt03b_lab_guarda() returns trigger
        language plpgsql as $lab$
        declare v_recibido numeric; v_consumido numeric;
        begin
          -- SIN for update: exactamente la guarda de 0072.
          select recibido into v_recibido from pt03b_lab_lote where id = new.lote;
          select coalesce(sum(cantidad), 0) into v_consumido
            from pt03b_lab_consumo where lote = new.lote;
          if v_consumido + new.cantidad > v_recibido then
            raise exception 'sobreconsumo';
          end if;
          return new;
        end $lab$;
        drop trigger if exists t on pt03b_lab_consumo;
        create trigger t before insert on pt03b_lab_consumo
          for each row execute function pt03b_lab_guarda();
      `);

      await a.query("begin"); await b.query("begin");
      await a.query("insert into pt03b_lab_consumo (lote, cantidad) values (1, 60)");
      await b.query("insert into pt03b_lab_consumo (lote, cantidad) values (1, 60)");
      await a.query("commit"); await b.query("commit");

      const { rows } = await admin.query("select coalesce(sum(cantidad),0) t from pt03b_lab_consumo");
      assert(Number(rows[0].t) === 120,
        `sin candado se esperaban las dos (120), hubo ${rows[0].t}: la carrera no se reprodujo`);
    } finally {
      await a.end().catch(() => {}); await b.end().catch(() => {});
      await admin.query(`
        drop trigger if exists t on pt03b_lab_consumo;
        drop table if exists pt03b_lab_consumo, pt03b_lab_lote;
        drop function if exists pt03b_lab_guarda();
      `).catch(() => {});
    }
  });

  // -------------------------------------------------------------------------
  // B · LAS UNIDADES
  // -------------------------------------------------------------------------

  await check("B1. Una unidad distinta ya NO salta la comprobación: la rechaza", async () => {
    // ANTES: `lower(trim(unit)) <> lower(trim(lot.unit))` hacía que la guarda
    // no comprobara nada y el consumo pasara sin restar. Quedan 40 kg.
    try {
      await admin.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 999, 'metros', 'm', 'main_fabric')`,
        [orgId, ordenId, loteId]);
      assert(false, "un consumo en otra unidad no puede aceptarse sin comprobar");
    } catch (e) {
      const err = e as { code?: string; message: string };
      assert(/no convierte unidades/i.test(err.message),
        `se esperaba el rechazo por unidades, llegó: ${err.message}`);
      assert(err.code === "23514", `se esperaba 23514, llegó ${err.code}`);
    }
  });

  await check("B2. «kilogramos» contra un lote en «kg» se normaliza y SÍ compara", async () => {
    // El texto difiere; el código canónico coincide. Antes esto desactivaba la
    // guarda; ahora se compara y, como no cabe, se rechaza por saldo.
    try {
      await admin.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 90, 'kilogramos', public.textile_canonical_unit('kilogramos'), 'main_fabric')`,
        [orgId, ordenId, loteId]);
      assert(false, "quedan 40 kg: 90 no cabe");
    } catch (e) {
      assert(/Sobreconsumo bloqueado/.test((e as Error).message),
        `debía rechazarse por SALDO, no por unidad: ${(e as Error).message}`);
    }
  });

  await check("B3. «Otra unidad» no participa en saldos", async () => {
    const { rows: [otro] } = await admin.query(
      `insert into textile_input_lots
         (organization_id, lot_code, lot_type, material_id, supplier_id, quantity_received, unit, unit_code)
       values ($1, $2, 'material', $3, $4, 50, 'conos', 'other') returning id`,
      [orgId, `LOTE-OTHER-${stamp}`, mat.id, sup.id]);
    try {
      await admin.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 10, 'conos', 'other', 'main_fabric')`,
        [orgId, ordenId, otro.id]);
      assert(false, "«other» no puede comprometer un saldo");
    } catch (e) {
      assert(/no participa en saldos/i.test((e as Error).message),
        `mensaje inesperado: ${(e as Error).message}`);
    }
  });

  await check("B4. Un lote sin unidad normalizada no puede comprometer saldo", async () => {
    const { rows: [sinU] } = await admin.query(
      `insert into textile_input_lots
         (organization_id, lot_code, lot_type, material_id, supplier_id, quantity_received, unit, unit_code)
       values ($1, $2, 'material', $3, $4, 50, null, null) returning id`,
      [orgId, `LOTE-SINU-${stamp}`, mat.id, sup.id]);
    try {
      await admin.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 10, 'kg', 'kg', 'main_fabric')`,
        [orgId, ordenId, sinU.id]);
      assert(false, "sin unidad comparable no se puede consumir");
    } catch (e) {
      assert(/unidad comparable/i.test((e as Error).message),
        `mensaje inesperado: ${(e as Error).message}`);
    }
  });

  await check("B5. Sin unit_code pero con el MISMO texto, se sigue comparando", async () => {
    // Compatibilidad: las filas legacy que ya coincidían por texto no dejan de
    // funcionar. Solo se rechaza cuando de verdad no hay forma de comparar.
    const { rows: [legacy] } = await admin.query(
      `insert into textile_input_lots
         (organization_id, lot_code, lot_type, material_id, supplier_id, quantity_received, unit, unit_code)
       values ($1, $2, 'material', $3, $4, 20, 'bobinas', null) returning id`,
      [orgId, `LOTE-LEG-${stamp}`, mat.id, sup.id]);
    await admin.query(
      `insert into textile_order_consumptions
         (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
       values ($1, $2, $3, 5, 'bobinas', null, 'main_fabric')`,
      [orgId, ordenId, legacy.id]);
    try {
      await admin.query(
        `insert into textile_order_consumptions
           (organization_id, order_id, input_lot_id, quantity_consumed, unit, unit_code, consumption_role)
         values ($1, $2, $3, 20, 'bobinas', null, 'main_fabric')`,
        [orgId, ordenId, legacy.id]);
      assert(false, "5 + 20 > 20: debía rechazarse por saldo");
    } catch (e) {
      assert(/Sobreconsumo bloqueado/.test((e as Error).message),
        `mensaje inesperado: ${(e as Error).message}`);
    }
  });

  await check("B6. El saldo dice cuántos consumos dejó fuera", async () => {
    const { rows } = await admin.query(
      `select quantity_consumed, other_unit_consumptions_count
         from v_textile_input_lot_balance where input_lot_id = $1`, [loteId]);
    assert(Number(rows[0].quantity_consumed) === 60, "solo debía restar los comparables");
    assert(Number(rows[0].other_unit_consumptions_count) >= 0,
      "el contador de no comparables debía existir");
  });

  // -------------------------------------------------------------------------
  // C · El backfill y el dominio dicen lo mismo
  // -------------------------------------------------------------------------

  await check("C1. El mapa SQL de alias coincide con el de TypeScript", async () => {
    const casos = ["kg", "Kilogramos", " KG ", "metros", "m²", "unidades", "rollos",
                   "pares", "docenas", "", "conos"];
    for (const raw of casos) {
      const { rows } = await admin.query("select public.textile_canonical_unit($1) as u", [raw]);
      const sql = rows[0].u as string | null;
      const ts = canonicalUnit(raw);
      assert(sql === ts, `«${raw}»: la base dice ${sql} y el dominio ${ts}`);
    }
  });

  await check("C2. Lo ambiguo NO se normaliza, ni aquí ni allí", async () => {
    assert(canonicalUnit("pares") === null, "«pares» podría ser una unidad o dos");
    assert(canonicalUnit("docenas") === null, "«docenas» no está en el catálogo");
    const { rows } = await admin.query("select public.textile_canonical_unit('pares') as u");
    assert(rows[0].u === null, "la base tampoco puede adivinarlo");
  });

  await check("C3. Comparabilidad: solo códigos iguales, conocidos y distintos de «other»", async () => {
    assert(unitsAreComparable("kg", "kg"), "dos kg se comparan");
    assert(!unitsAreComparable("kg", "g"), "kg y g NO se convierten");
    assert(!unitsAreComparable("other", "other"), "dos «other» pueden ser cosas distintas");
    assert(!unitsAreComparable(null, "kg"), "sin normalizar no se compara");
    assert(unitIsComputable("kg") && !unitIsComputable("other") && !unitIsComputable(null),
      "solo lo canónico y concreto entra en aritmética");
  });

  await check("C4. El CHECK de la base admite exactamente los códigos del dominio", async () => {
    const { rows } = await admin.query(
      `select pg_get_constraintdef(oid) d from pg_constraint
        where conname = 'textile_input_lots_unit_code_check'`);
    const def = rows[0].d as string;
    for (const u of MEASUREMENT_UNITS) {
      assert(def.includes(`'${u}'`), `el CHECK no admite ${u}`);
    }
    // Y no admite nada más: se prueba con un valor inventado.
    try {
      await admin.query(
        `insert into textile_input_lots
           (organization_id, lot_code, lot_type, material_id, supplier_id, quantity_received, unit_code)
         values ($1, $2, 'material', $3, $4, 1, 'furlongs')`,
        [orgId, `LOTE-BAD-${stamp}`, mat.id, sup.id]);
      assert(false, "un código fuera del catálogo debía rechazarse");
    } catch (e) {
      assert(/unit_code_check/.test((e as Error).message), `mensaje inesperado: ${(e as Error).message}`);
    }
  });

  await check("C5. El texto original NUNCA se pierde", async () => {
    const { rows } = await admin.query(
      `select unit, unit_code from textile_input_lots where organization_id = $1 and unit is not null`,
      [orgId]);
    assert(rows.length > 0, "debía haber filas con texto original");
    for (const r of rows) {
      assert(typeof r.unit === "string" && r.unit.length > 0,
        "el backfill borró el texto que escribió la persona");
    }
  });

  await admin.end();
  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
