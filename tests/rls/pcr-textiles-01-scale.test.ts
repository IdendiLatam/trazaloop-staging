/**
 * Trazaloop · PT-01 · ESCALA · contra base REAL con más de mil filas.
 *
 * POR QUÉ HACEN FALTA MIL DOSCIENTAS FILAS DE VERDAD
 *
 * El corte de PostgREST (`max_rows = 1000`) no se puede demostrar con diez
 * filas ni razonando sobre el fichero de configuración. Es un comportamiento
 * del servidor, y la única forma de probar que existe —y que el recorrido lo
 * salva— es cruzarlo.
 *
 * Y es el fallo que este sprint existe para cerrar: una respuesta CORRECTA y
 * TRUNCADA. Sin error, sin aviso, y en pantalla idéntica a un dato completo.
 *
 * La prueba crea su propia empresa, la llena, comprueba y la deja tal cual: no
 * toca ningún dato existente.
 *
 * Correr: npm run test:pcr-textiles-scale-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PAGE_SIZE, TRAVERSAL_CHUNK, pageRange, normalizePageQuery } from "@/lib/domain/pagination";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:pcr-textiles-scale-rls.");
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

/** Cuántas se crean. Justo por encima del tope para que el corte se note. */
const FILAS = 1200;
const CAP_POSTGREST = 1000;

/** El mismo recorrido que `lib/db/paged-read.ts`, con el cliente de la prueba. */
async function readAll<T>(
  build: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += TRAVERSAL_CHUNK) {
    const { data, error } = await build().range(from, from + TRAVERSAL_CHUNK - 1);
    if (error) return { rows, complete: false };
    const lote = data ?? [];
    rows.push(...lote);
    if (lote.length < TRAVERSAL_CHUNK) return { rows, complete: true };
  }
  return { rows, complete: false };
}

async function main() {
  console.log(`\nPT-01 · Escala: ${FILAS} filas contra PostgREST real\n`);

  const email = `pt01scale-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: u, error: eu } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA escala" },
  });
  assert(!eu && u.user, `usuario: ${eu?.message}`);
  const client: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  assert(!(await client.auth.signInWithPassword({ email, password })).error, "login");

  const { data: orgId, error: eo } = await client.rpc("create_organization", { p_name: `PT01 escala ${stamp}` });
  assert(!eo && orgId, `create_organization: ${eo?.message}`);
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "textiles");

  // Nombres con índice acolchado: el orden alfabético coincide con el numérico,
  // así que «dónde cae» una fila es predecible y la prueba puede apuntar a una
  // concreta MÁS ALLÁ del corte.
  const nombre = (i: number) => `Proveedor ${String(i).padStart(5, "0")} ${stamp}`;
  const lote = Array.from({ length: FILAS }, (_, i) => ({
    organization_id: org, name: nombre(i), supplier_type: "fabric_supplier",
  }));
  for (let i = 0; i < lote.length; i += 200) {
    const { error } = await client.from("textile_suppliers").insert(lote.slice(i, i + 200));
    assert(!error, `insertando ${i}: ${error?.message}`);
  }

  await check(`0. El fixture tiene ${FILAS} filas`, async () => {
    const { count } = await client.from("textile_suppliers")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert(count === FILAS, `se esperaban ${FILAS}, hay ${count}`);
  });

  await check(`A1. Sin .range(), PostgREST corta en ${CAP_POSTGREST} y no lo dice`, async () => {
    const { data, error } = await client.from("textile_suppliers")
      .select("id, name").eq("organization_id", org).order("name");
    // Lo importante no es el número: es que NO HAY ERROR.
    assert(!error, `debía tener éxito, y ahí está el problema: ${error?.message}`);
    assert((data ?? []).length === CAP_POSTGREST,
      `se esperaba el corte en ${CAP_POSTGREST}, devolvió ${(data ?? []).length}`);
  });

  await check("A2. El recorrido por lotes sí devuelve todas", async () => {
    const { rows, complete } = await readAll<{ id: string; name: string }>(() =>
      client.from("textile_suppliers").select("id, name")
        .eq("organization_id", org).order("name").order("id")
    );
    assert(complete, "el recorrido debía declararse completo");
    assert(rows.length === FILAS, `devolvió ${rows.length} de ${FILAS}`);
    assert(new Set(rows.map((r) => r.id)).size === FILAS, "el recorrido repitió filas");
  });

  await check("A3. Las páginas cubren el conjunto sin repetir ni saltarse nada", async () => {
    // Es lo que un orden ambiguo rompe en silencio: dos páginas consecutivas
    // que repiten una fila y omiten otra, con el total correcto.
    const vistos = new Set<string>();
    const { pageSize } = normalizePageQuery({});
    for (let p = 1; p <= Math.ceil(FILAS / pageSize); p += 1) {
      const { from, to } = pageRange(p, pageSize);
      const { data } = await client.from("textile_suppliers").select("id")
        .eq("organization_id", org).order("name").order("id").range(from, to);
      for (const r of data ?? []) {
        assert(!vistos.has(r.id as string), `la fila ${r.id} salió en dos páginas`);
        vistos.add(r.id as string);
      }
    }
    assert(vistos.size === FILAS, `las páginas cubrieron ${vistos.size} de ${FILAS}`);
    assert(pageSize === DEFAULT_PAGE_SIZE, "el tamaño de página debía venir de la primitiva compartida");
  });

  await check("B1. La búsqueda encuentra una fila MÁS ALLÁ del corte", async () => {
    // La fila 1150 es invisible para cualquier lectura sin cota. Si la
    // búsqueda va en el servidor, aparece; si fuera en memoria sobre lo ya
    // leído, no existiría.
    const objetivo = nombre(1150);
    const { data, count } = await client.from("textile_suppliers")
      .select("id, name", { count: "exact" })
      .eq("organization_id", org)
      .ilike("name", `%${String(1150).padStart(5, "0")}%`)
      .order("name").range(0, DEFAULT_PAGE_SIZE - 1);
    assert(count === 1, `se esperaba exactamente una coincidencia, hubo ${count}`);
    assert((data ?? [])[0]?.name === objetivo, "no encontró la fila de más allá del corte");
  });

  await check("B2. El total del conjunto filtrado es el real, no el de la página", async () => {
    const { data, count } = await client.from("textile_suppliers")
      .select("id", { count: "exact" }).eq("organization_id", org)
      .order("name").range(0, DEFAULT_PAGE_SIZE - 1);
    assert((data ?? []).length === DEFAULT_PAGE_SIZE, "la página debía traer su tamaño");
    assert(count === FILAS, `el total debía ser ${FILAS}, es ${count}`);
  });

  await check("C1. Otra empresa no ve ni una de estas filas", async () => {
    const otro = `pt01scale-b-${stamp}@test.trazaloop.dev`;
    const { data: u2 } = await admin.auth.admin.createUser({
      email: otro, password, email_confirm: true, user_metadata: { full_name: "QA b" },
    });
    assert(u2.user, "segundo usuario");
    const c2 = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    assert(!(await c2.auth.signInWithPassword({ email: otro, password })).error, "login b");
    const { rows } = await readAll<{ id: string }>(() =>
      c2.from("textile_suppliers").select("id").eq("organization_id", org).order("id")
    );
    assert(rows.length === 0, `el recorrido cruzó el inquilino: devolvió ${rows.length} filas`);
  });

  await check("C2. NINGUNA vista de saldo o inventario cruza el inquilino", async () => {
    // Esta comprobación existe porque la fuga ocurrió. Tres vistas de este
    // sprint perdieron su `security_invoker` al recrearse —`create or replace`
    // sin la cláusula RESTABLECE las opciones— y pasaron a ejecutarse con los
    // permisos de su propietario, que tiene `bypassrls`.
    //
    // Leer el SQL lo detecta antes; esto lo detecta aunque el SQL cambie de
    // forma. Una empresa recién creada no puede ver NADA de las demás.
    const otro = `pt01scale-c-${stamp}@test.trazaloop.dev`;
    const { data: u3 } = await admin.auth.admin.createUser({
      email: otro, password, email_confirm: true, user_metadata: { full_name: "QA c" },
    });
    assert(u3.user, "tercer usuario");
    const c3 = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    assert(!(await c3.auth.signInWithPassword({ email: otro, password })).error, "login c");
    // Con su propia empresa vacía: si viera algo, sería de otra.
    assert(!(await c3.rpc("create_organization", { p_name: `PT01 vacía ${stamp}` })).error, "empresa");

    const VISTAS = [
      "v_textile_input_lot_balance", "v_textile_material_inventory",
      "v_latest_batch_recycled", "v_output_batch_stock",
      "v_material_inventory", "v_input_batch_inventory",
    ];
    for (const v of VISTAS) {
      const { data } = await c3.from(v).select("*").limit(5);
      assert((data ?? []).length === 0,
        `${v} devolvió ${(data ?? []).length} filas a una empresa vacía: fuga entre inquilinos`);
    }
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
