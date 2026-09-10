/**
 * Trazaloop · TEST-HYGIENE-03 · Que la higiene no se deshaga sola.
 *
 *
 * EL INVARIANTE QUE DEFIENDE ESTA SUITE
 *
 *   Una prueba local no puede depender de LEER UNA TABLA ENTERA para encontrar
 *   o retirar las filas que ella misma creó.
 *
 * No es una regla de estilo. Es la causa exacta de un fallo real, y el orden en
 * que ocurrió importa porque explica por qué una guarda textual no habría
 * servido de nada:
 *
 *   1. Diez suites limpiaban su tipo de cambio sintético trayéndose
 *      `commercial_fx_rates` entera con `.select("id, note")` y filtrando por
 *      nota en JavaScript. Funcionaba.
 *   2. La tabla creció hasta pasar de mil filas.
 *   3. PostgREST devuelve como mucho mil, y sin `order by` la fila recién
 *      insertada —la última— empezó a caer fuera de la página.
 *   4. La limpieza dejó de encontrar nada que retirar. Y la COMPROBACIÓN leía
 *      la misma página truncada, así que también decía que todo estaba bien.
 *   5. Quedaba una tasa sintética activa. La siguiente suite que sembrara la
 *      suya moría con FX_RATE_OVERLAPS sin explicar por qué.
 *
 * Nada de eso cambió en el código: cambió el tamaño de la tabla. Por eso la
 * guarda no busca una cadena concreta —eso solo prohíbe la forma exacta en que
 * falló una vez—, sino que exige que TODA lectura de la tabla lleve un filtro
 * puesto EN LA BASE. Una lectura acotada no se puede truncar por sorpresa.
 *
 * LO QUE SÍ ES LEGÍTIMO
 *
 * Hay pruebas cuyo asunto ES el barrido: comprobar la paginación, o recorrer
 * todo para demostrar que no se escapa nada. Para esas existe una excepción
 * EXPLÍCITA, que se escribe en el propio código y deja rastro:
 *
 *     // GUARDA-FX: barrido global deliberado · <por qué>
 *
 * Una excepción que hay que escribir y justificar es auditable. Una que se
 * concede sola no lo es.
 *
 * Correr: npm run test:th03-guards
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

/** Los ficheros de prueba, sin suponer una lista escrita a mano que caduca. */
function ficherosDePrueba(): { ruta: string; texto: string }[] {
  const salida: { ruta: string; texto: string }[] = [];
  for (const dir of ["tests/rls", "tests/unit", "tests/e2e", "tests/support", "tests/ui"]) {
    let entradas: string[];
    try { entradas = readdirSync(dir); } catch { continue; }
    for (const f of entradas) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const ruta = join(dir, f);
      salida.push({ ruta, texto: readFileSync(ruta, "utf8") });
    }
  }
  return salida;
}

/** Las tablas de QA que una suite crea y tiene que volver a encontrar. */
const TABLAS_VIGILADAS = ["commercial_fx_rates"];

/** Métodos que ACOTAN en el servidor. Basta uno para que la página sea suya. */
const FILTROS = [".eq(", ".neq(", ".in(", ".like(", ".ilike(", ".is(", ".gt(",
  ".gte(", ".lt(", ".lte(", ".match(", ".filter(", ".or(", ".contains(",
  ".limit(", ".range(", ".textSearch("];

const MARCA_EXCEPCION = "GUARDA-FX:";

type Lectura = { ruta: string; linea: number; sentencia: string; exenta: boolean };

/**
 * Recorta cada acceso a una tabla vigilada hasta el final de su sentencia y se
 * queda con los que LEEN. Se corta en el `;` de cierre porque una consulta de
 * supabase-js es una sola expresión encadenada, aunque ocupe varias líneas.
 */
function lecturasDe(tabla: string): Lectura[] {
  const encontradas: Lectura[] = [];
  for (const { ruta, texto } of ficherosDePrueba()) {
    const lineas = texto.split("\n");
    let desde = 0;
    for (;;) {
      const i = texto.indexOf(`from("${tabla}")`, desde);
      if (i === -1) break;
      desde = i + 1;
      const fin = texto.indexOf(";", i);
      const sentencia = texto.slice(i, fin === -1 ? texto.length : fin);
      // Leer es `.select(...)` a secas. `insert(...).select("id")` también lo
      // lleva, pero ahí `select` solo dice qué devolver de lo escrito: no hay
      // página que truncar porque no se está buscando nada.
      const escribe = [".insert(", ".update(", ".delete(", ".upsert("]
        .some((m) => sentencia.includes(m));
      if (escribe || !sentencia.includes(".select(")) continue;
      const linea = texto.slice(0, i).split("\n").length;
      // La excepción se declara en la línea de arriba o en la misma.
      const contexto = [lineas[linea - 2] ?? "", lineas[linea - 1] ?? ""].join("\n");
      encontradas.push({
        ruta, linea, sentencia,
        exenta: contexto.includes(MARCA_EXCEPCION),
      });
    }
  }
  return encontradas;
}

console.log("\nTEST-HYGIENE-03 · Guardas de higiene de fixtures\n");

// ===========================================================================
console.log("A · Ninguna prueba busca sus propias filas leyendo la tabla entera");
// ===========================================================================

for (const tabla of TABLAS_VIGILADAS) {
  check(`A1. Toda lectura de \`${tabla}\` va acotada en la base`, () => {
    const lecturas = lecturasDe(tabla);
    assert(lecturas.length > 0,
      `no se encontró ninguna lectura de ${tabla}: la guarda dejó de mirar donde debía`);
    const sinAcotar = lecturas.filter((l) =>
      !l.exenta && !FILTROS.some((f) => l.sentencia.includes(f)));
    assert(sinAcotar.length === 0,
      `leen ${tabla} sin filtrar en la base: `
      + sinAcotar.map((l) => `${l.ruta}:${l.linea}`).join(", ")
      + ` · PostgREST corta la respuesta y la fila buscada puede caer fuera. `
      + `Filtra en la base, o declara «${MARCA_EXCEPCION} …» si el barrido es el asunto de la prueba.`);
  });
}

check("A2. Y la excepción, cuando se use, obliga a decir por qué", () => {
  for (const { ruta, texto } of ficherosDePrueba()) {
    // Esta misma suite nombra la marca para poder buscarla; no se audita a sí
    // misma, o la definición contaría como una declaración.
    if (ruta.includes("th03-fixture-hygiene-guards")) continue;
    if (!texto.includes(MARCA_EXCEPCION)) continue;
    for (const linea of texto.split("\n")) {
      if (!linea.includes(MARCA_EXCEPCION)) continue;
      const razon = linea.slice(linea.indexOf(MARCA_EXCEPCION) + MARCA_EXCEPCION.length).trim();
      assert(razon.length >= 20,
        `${ruta}: se declara una excepción sin explicarla: «${razon}»`);
    }
  }
});

// ===========================================================================
console.log("\nB · El fixture canónico existe y se busca por igualdad");
// ===========================================================================

const AYUDANTE = readFileSync("tests/support/fixture-cleanup.ts", "utf8");

check("B1. `tasaCanonicaQA` se busca por una IGUALDAD de nota, no barriendo", () => {
  const i = AYUDANTE.indexOf("export async function tasaCanonicaQA");
  assert(i > 0, "el ayudante ya no expone `tasaCanonicaQA`");
  const cuerpo = AYUDANTE.slice(i, i + 1400);
  assert(/\.eq\("note", NOTA_TASA_QA\)/.test(cuerpo),
    "la búsqueda de la tasa canónica dejó de ser una igualdad por nota");
  assert(/maybeSingle\(\)/.test(cuerpo),
    "la búsqueda no exige una sola fila: dos canónicas pasarían inadvertidas");
});

check("B2. La nota canónica NO lleva sello ni azar · si no, no se reutiliza", () => {
  const m = /export const NOTA_TASA_QA = "([^"]+)"/.exec(AYUDANTE);
  assert(m !== null, "desapareció NOTA_TASA_QA");
  assert(!/\$\{|\d{10,}/.test(m[1]),
    `la nota canónica lleva algo variable y dejaría de ser la misma: «${m[1]}»`);
});

check("B3. Y las suites que solo CONSUMEN una tasa no abren la suya", () => {
  // Consumir es necesitar que exista un tipo de cambio para poder presupuestar.
  // Administrarlo —crearlo, retirarlo, programar una subida, cerrarlo por
  // vigencia— es otra cosa, y esas suites sí abren las suyas: es su asunto.
  const ADMINISTRAN = ["pe05b1-billing-foundation", "pe05b6d-plan-transitions",
    "pe05b6f-fx-and-history"];
  const culpables: string[] = [];
  for (const { ruta, texto } of ficherosDePrueba()) {
    if (!ruta.startsWith("tests/rls/")) continue;
    if (ADMINISTRAN.some((a) => ruta.includes(a))) continue;
    if (texto.includes('from("commercial_fx_rates").insert(')) culpables.push(ruta);
  }
  assert(culpables.length === 0,
    `abren su propia tasa en vez de reutilizar la canónica: ${culpables.join(", ")}`
    + " · cada una es una fila que 0182 no deja borrar nunca");
});

// ===========================================================================
console.log("\nC · El autor de las revisiones de plan es estable");
// ===========================================================================

check("C1. `pe04b5` publica con un autor de correo determinista", () => {
  const b5 = readFileSync("tests/rls/pe04b5-support-entitlements.test.ts", "utf8");
  assert(/async function personaEstable/.test(b5),
    "pe04b5 dejó de tener un autor canónico: volvería a crear uno por vuelta");
  const i = b5.indexOf("async function personaEstable");
  const cuerpo = b5.slice(i, i + 900);
  assert(/const email = `\$\{prefijo\}@test\.trazaloop\.dev`/.test(cuerpo),
    "el correo del autor canónico dejó de ser determinista");
  assert(!/personasCreadas\.push/.test(cuerpo),
    "el autor canónico entró en la lista de personas a borrar: se intentará borrar cada vuelta");
  assert(/const sa = await personaEstable\(/.test(b5),
    "quien publica las revisiones ya no es el autor canónico");
});

// ===========================================================================
console.log("\nD · La limpieza es la MISMA en Local y en remoto");
// ===========================================================================
/**
 * TEST-HYGIENE-04 · `stab03` llevaba una copia a mano del barrido por claves
 * ajenas, con `catch {}` en cada borrado. Contra Local pasaba; contra Staging
 * dejó dos organizaciones y dos usuarios y NO dijo por qué. Dos copias del
 * mismo algoritmo divergen en cuanto una se toca, y la que se traga los errores
 * no se puede diagnosticar: hubo que barrer a mano un entorno compartido.
 *
 * El ayudante común es un solo código, corre igual en los dos sitios y DEVUELVE
 * lo que no pudo hacer.
 */

/**
 * TEST-HYGIENE-05 · La lista de deuda está VACÍA y así se queda.
 *
 * Hubo tres suites con su propia copia del barrido —`mp0186`, `stab01` y
 * `stab04-apply`—, declaradas aquí mientras se convertían. Ya no existen. La
 * lista se conserva vacía a propósito: si alguien vuelve a necesitar una
 * excepción tendrá que escribirla, y escribirla es lo que la hace auditable.
 */
const COPIAS_PENDIENTES: string[] = [];

check("D1. Ninguna suite se escribe su propio barrido por claves ajenas", () => {
  const propias: string[] = [];
  for (const { ruta, texto } of ficherosDePrueba()) {
    if (!ruta.startsWith("tests/rls/")) continue;
    if (COPIAS_PENDIENTES.includes(ruta)) continue;
    // La firma de un barrido propio: consultar el catálogo de claves ajenas
    // para construir una lista de tablas que borrar.
    const barre = /pg_constraint/.test(texto)
      && /relname\s*=\s*'organizations'/.test(texto)
      && /delete from public\.\$\{/.test(texto);
    if (barre) propias.push(ruta);
  }
  assert(propias.length === 0,
    `se escriben su propio barrido en vez de usar el ayudante: ${propias.join(", ")}`
    + " · dos copias del mismo algoritmo divergen, y la de la suite se traga los errores");
});

check("D2. Y no queda ninguna deuda declarada", () => {
  assert(COPIAS_PENDIENTES.length === 0,
    `siguen declaradas ${COPIAS_PENDIENTES.length} copias sin convertir: `
    + COPIAS_PENDIENTES.join(", "));
  // Y las tres que hubo usan de verdad el ayudante, no solo dejaron de barrer.
  for (const ruta of ["tests/rls/mp0186-provider-reconciliation.test.ts",
                      "tests/rls/stab01-commercial-state.test.ts",
                      "tests/rls/stab04-positions-apply.test.ts",
                      "tests/rls/stab03-stakeholder-identity.test.ts"]) {
    const texto = ficherosDePrueba().find((f) => f.ruta === ruta)?.texto ?? "";
    assert(texto !== "", `desapareció ${ruta}`);
    assert(/limpiarFixtures\(/.test(texto),
      `${ruta} ya no limpia por el ayudante común`);
    assert(/residuo\.problemas/.test(texto),
      `${ruta} no comprueba lo que la limpieza informó`);
  }
});

check("D3. Apartar el disparador de ciclos va acotado, protegido y comprobado", () => {
  const i = AYUDANTE.indexOf("disable trigger billing_provider_cycle_is_append_only_trg");
  assert(i > 0, "el ayudante ya no aparta el disparador de ciclos");
  const antes = AYUDANTE.slice(Math.max(0, i - 1200), i);
  const despues = AYUDANTE.slice(i, i + 2600);
  assert(/savepoint t/.test(antes),
    "el `alter table … disable trigger` no va dentro de un punto de retorno: "
    + "si falla, aborta la transacción entera y la limpieza deja de borrar en silencio");
  assert(/where organization_id = any\(\$1::uuid\[\]\)[\s\S]{0,120}limit 1/.test(antes),
    "se aparta el disparador sin comprobar antes que ESTE fixture tenga ciclos");
  assert(/enable trigger billing_provider_cycle_is_append_only_trg/.test(despues),
    "no se vuelve a poner");
  assert(/tgenabled/.test(despues),
    "no se COMPRUEBA que el disparador quedó activo al terminar");
});

check("D4. El ayudante no se traga ningún error sin registrarlo", () => {
  // `catch {}` vacío es la firma exacta del defecto que costó tres tramos.
  const vacios = AYUDANTE.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/g) ?? [];
  assert(vacios.length === 0,
    `el ayudante tiene ${vacios.length} capturas de error vacías`);
});

console.log(`\nTEST-HYGIENE-03 · guardas: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
