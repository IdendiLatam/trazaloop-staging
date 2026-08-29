/**
 * Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PREFLIGHT antes de Staging.
 *
 * POR QUÉ EXISTE ESTA SUITE
 *
 * Durante el desarrollo, la primera versión de 0144 usó `drop view … cascade`
 * y se llevó por delante seis vistas que dependían de la que estaba
 * reemplazando. En local se recuperaron con una reejecución limpia. En Staging
 * no habría reejecución limpia: habría seis vistas menos.
 *
 * Un comentario que dice «no uses cascade» no impide que alguien lo use. Esto
 * sí, y corre en `test:all`, así que no depende de que nadie se acuerde de
 * ejecutarlo antes de aplicar.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRACIONES = join(ROOT, "supabase/migrations");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

/** El SQL sin comentarios de línea. Lo que de verdad se va a ejecutar. */
function codigoDe(fichero: string): string {
  return read(`supabase/migrations/${fichero}`)
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

const TODAS = readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();
/** Las de este sprint. */
const DEL_SPRINT = TODAS.filter((f) => f >= "0142" && f < "0148");

console.log("\nPCR/TEXTILES · preflight de migraciones\n");

check("A1. Las seis migraciones del sprint están, y no hay una séptima", () => {
  // La 0147 se sumó por una decisión de producto posterior al cierre previsto:
  // consolidar el contenido reciclado en una sola metodología antes de que
  // exista tráfico. El guardián no se relaja —sigue habiendo una lista
  // cerrada— se amplía con la que se decidió añadir.
  assert(DEL_SPRINT.length === 6, `se esperaban 6, hay ${DEL_SPRINT.length}: ${DEL_SPRINT}`);
  for (const n of ["0142", "0143", "0144", "0145", "0146", "0147"]) {
    assert(DEL_SPRINT.some((f) => f.startsWith(n)), `falta ${n}`);
  }
  assert(!TODAS.some((f) => f.startsWith("0148")),
    "apareció una 0148: este sprint cierra en 0147");
});

check("A2. Las del sprint son contiguas y arrancan justo tras 0141", () => {
  // La numeración del repositorio entero NO es contigua —hay un hueco
  // histórico entre 0006 y 0015— y exigirlo sería inventar un invariante que
  // nunca existió. Lo que sí tiene que cumplirse es lo de este sprint.
  const numeros = DEL_SPRINT.map((f) => Number(f.slice(0, 4)));
  assert(numeros[0] === 142, `el sprint debía empezar en 0142, empieza en ${numeros[0]}`);
  for (let i = 1; i < numeros.length; i += 1) {
    assert(numeros[i] === numeros[i - 1] + 1,
      `hueco entre ${DEL_SPRINT[i - 1]} y ${DEL_SPRINT[i]}`);
  }
  assert(TODAS.some((f) => f.startsWith("0141")), "0141 debía seguir existiendo");
  // Y ningún número repetido en todo el repositorio.
  const todos = TODAS.map((f) => f.slice(0, 4));
  assert(new Set(todos).size === todos.length, "hay dos migraciones con el mismo número");
});

check("B1. NINGUNA migración del sprint ejecuta un DROP … CASCADE", () => {
  // La comprobación mira el CÓDIGO, no el fichero: 0144 menciona `cascade` en
  // un comentario, contando lo que pasó, y eso debe poder escribirse.
  for (const f of DEL_SPRINT) {
    const m = /drop\s+(view|table|function|type|schema|materialized\s+view)[^;]*\bcascade\b/i
      .exec(codigoDe(f));
    assert(m === null, `${f} ejecuta «${m?.[0]?.slice(0, 60)}»: en Staging eso borra dependientes`);
  }
});

check("B2. Y ninguna del repositorio entero, tampoco", () => {
  // Si alguna histórica lo tuviera, esta prueba no es el sitio para
  // arreglarlo, pero sí para saberlo.
  const culpables = TODAS.filter((f) =>
    /drop\s+(view|table)[^;]*\bcascade\b/i.test(codigoDe(f)));
  assert(culpables.length === 0, `migraciones con cascade: ${culpables.join(", ")}`);
});

check("B3. La única vista que se elimina lo hace SIN cascade", () => {
  // Sin `cascade`, si algo dependiera de ella el `drop` FALLA en vez de
  // destruir. Ese es el modo de fallo que se quiere.
  const drops: string[] = [];
  for (const f of DEL_SPRINT) {
    for (const m of codigoDe(f).matchAll(/drop\s+view[^;]+;/gi)) drops.push(`${f}: ${m[0]}`);
  }
  assert(drops.length === 1, `se esperaba UN drop view, hay ${drops.length}: ${drops}`);
  assert(/v_textile_input_lot_balance/.test(drops[0]), `drop inesperado: ${drops[0]}`);
  assert(!/cascade/i.test(drops[0]), "y sin cascade");
});

check("B4. La vista con dependientes se sustituye con `create or replace`", () => {
  const c = codigoDe("0144_recycled_content_v2.sql");
  assert(/create or replace view public\.v_latest_batch_recycled/.test(c),
    "v_latest_batch_recycled tiene seis dependientes: solo `replace` los conserva");
  assert(!/drop view[^;]*v_latest_batch_recycled/i.test(c),
    "no puede eliminarse: `replace` obliga a conservar el orden de columnas y eso es la garantía");
});


check("B5. Toda vista creada o recreada declara `security_invoker`", () => {
  // ESTA ES LA COMPROBACIÓN QUE FALTABA, Y COSTÓ UNA FUGA ENTRE INQUILINOS.
  //
  // `create or replace view` sin cláusula `with` NO conserva las opciones de
  // la vista: las RESTABLECE. Tres vistas de este sprint perdieron así el
  // `security_invoker` que ya tenían, y pasaron a ejecutarse con los permisos
  // de su propietario —`postgres`, con `bypassrls`—, saltándose la RLS de las
  // tablas base.
  //
  // El efecto, comprobado antes de arreglarlo: una empresa recién creada, con
  // cero lotes propios, veía los de todas las demás.
  //
  // Lo detectó el guion de validación post-migración contra la base local,
  // ANTES de aplicar nada en Staging. Esto lo detecta antes todavía.
  for (const f of DEL_SPRINT) {
    const c = codigoDe(f);
    for (const m of c.matchAll(/create\s+(or\s+replace\s+)?view\s+public\.(\w+)([\s\S]{0,200}?)\bas\b/gi)) {
      const vista = m[2];
      const entre = m[3];
      // Las vistas de PLATAFORMA son la excepción documentada (patrón de 0055
      // y 0141): no llevan security_invoker a propósito, porque platform_staff
      // no pertenece a ninguna empresa y filtran por is_platform_staff() dentro.
      if (/platform/.test(vista)) continue;
      assert(/security_invoker\s*=\s*true/i.test(entre),
        `${f}: la vista ${vista} no declara security_invoker y se saltaría la RLS`);
    }
  }
});

check("B6. Las vistas de saldo e inventario lo declaran, una por una", () => {
  // Nombradas a mano además del recorrido de arriba: son las que se rompieron,
  // y si alguien las mueve a otra migración esta comprobación tiene que seguir
  // encontrándolas.
  const AFECTADAS: Array<[string, string]> = [
    ["0143_textile_unit_codes_and_concurrency.sql", "v_textile_input_lot_balance"],
    ["0144_recycled_content_v2.sql", "v_latest_batch_recycled"],
    ["0145_textile_material_inventory.sql", "v_textile_material_inventory"],
    ["0146_output_batch_movements.sql", "v_output_batch_stock"],
  ];
  for (const [f, vista] of AFECTADAS) {
    const c = codigoDe(f);
    const i = c.indexOf(`view public.${vista}`);
    assert(i >= 0, `${f} debía crear ${vista}`);
    const cabecera = c.slice(i, c.indexOf(" as", i) + 3);
    // Se exige EN LA CREACIÓN y no en un `alter` posterior: un alter funciona,
    // pero deja la protección a un `create or replace` de distancia de
    // perderse otra vez, que es exactamente lo que pasó.
    assert(/security_invoker\s*=\s*true/i.test(cabecera),
      `${vista} no declara security_invoker en la creación, en ${f}`);
  }
});

check("C1. Ninguna migración del sprint modifica filas existentes", () => {
  for (const f of DEL_SPRINT) {
    const c = codigoDe(f);
    // El backfill de 0143 es la única excepción, y solo rellena una columna
    // NUEVA donde todavía está vacía.
    const updates = [...c.matchAll(/update\s+public\.(\w+)[\s\S]*?;/gi)];
    for (const u of updates) {
      const tabla = u[1];
      const esBackfill = /set unit_code = public\.textile_canonical_unit/.test(u[0])
        && /where unit_code is null/.test(u[0]);
      const esMetodologia = tabla === "calculation_methodologies";
      const esCorreccion = f.startsWith("0146");   // dentro de la RPC de corrección
      assert(esBackfill || esMetodologia || esCorreccion,
        `${f} actualiza public.${tabla} fuera del backfill: ${u[0].slice(0, 80)}`);
    }
    // 0147 · UNA excepción, y se nombra entera: retira del catálogo la fila de
    // la metodología de contenido reciclado versión 1, y SOLO cuando ningún
    // cálculo la apunta. La condición está en el propio SQL, así que en una
    // base con cálculos históricos la fila sobrevive y la integridad
    // referencial también. Cualquier otro `delete from public.` sigue
    // prohibido, incluido otro sobre esta misma tabla.
    const borrados = [...c.matchAll(/delete\s+from\s+public\.(\w+)[\s\S]*?;/gi)];
    for (const d of borrados) {
      const autorizado =
        f.startsWith("0147")
        && d[1] === "calculation_methodologies"
        && /version = 1/.test(d[0])
        && /not exists/.test(d[0])
        && /recycled_content_calculations/.test(d[0]);
      assert(autorizado, `${f} borra filas de public.${d[1]}: ${d[0].slice(0, 90)}`);
    }
    assert(!/\btruncate\b/i.test(c), `${f} trunca una tabla`);
  }
});

check("C2. Ninguna añade una columna NOT NULL sin valor por defecto", () => {
  // Sobre una tabla con filas, eso falla al aplicar. Y si no falla es peor:
  // significa que se rellenó con algo inventado.
  for (const f of DEL_SPRINT) {
    for (const m of codigoDe(f).matchAll(/add column[^,;]*/gi)) {
      const txt = m[0];
      if (!/not null/i.test(txt)) continue;
      assert(/default/i.test(txt), `${f}: «${txt.trim()}» es NOT NULL sin default`);
    }
  }
});

check("D1. Las cinco documentan su reversión", () => {
  for (const f of DEL_SPRINT) {
    assert(/REVERSI[ÓO]N/i.test(read(`supabase/migrations/${f}`)),
      `${f} no dice cómo se vuelve atrás`);
  }
});

check("D2. Las cinco están autorizadas en las listas blancas", () => {
  // Si falta una, test:all se pone en rojo por un motivo que no tiene nada que
  // ver con lo que se estaba haciendo. Mejor saberlo aquí.
  const guardas = ["tests/unit/pcr02-5-hardening.test.ts", "tests/release/v1-release.test.ts",
                   "tests/unit/rh01-release-hardening.test.ts"];
  for (const g of guardas) {
    const src = read(g);
    for (const f of DEL_SPRINT) {
      assert(src.includes(`"${f}"`), `${g} no autoriza ${f}`);
    }
  }
});

check("E1. deploy-safety sigue prohibiendo la bandera que desplegó a producción", () => {
  // Se comprueba el MECANISMO y no la cadena: escribirla aquí haría que este
  // fichero apareciera como culpable en la propia guarda que está verificando.
  const ds = read("tests/unit/deploy-safety.test.ts");
  assert(/FORMAS_PELIGROSAS/.test(ds), "la lista de formas peligrosas debía seguir ahí");
  assert(/RELATOS_DEL_INCIDENTE/.test(ds), "y la excepción acotada para quien lo relata");
  assert(/--target=preview/.test(ds), "y la exigencia de la forma afirmativa");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
