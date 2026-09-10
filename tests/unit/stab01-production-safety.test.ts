import { readFileSync, readdirSync } from "node:fs";

/**
 * Trazaloop · STABILIZATION-01 · Que 0187 se pueda aplicar sobre Producción.
 *
 * Producción tiene organizaciones y personas reales desde el 7 de septiembre de
 * 2026. Esta migración corrige el tipo de retorno de una función que hoy falla
 * siempre; no debería tocar ni una fila, y eso hay que poder comprobarlo antes
 * de aplicarla, no confiarlo.
 *
 * Se mira el SQL sin comentarios y separando lo que se EJECUTA al aplicar de lo
 * que es cuerpo de función: la lección de MP0186, donde una guarda acusaba a la
 * migración de borrar periodos por un `delete` que vive dentro de una función y
 * corre en tiempo de producto.
 *
 * Correr: npm run test:stab01-safety
 */

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const ARCHIVO = "0187_plan_limits_return_type_fix.sql";
const crudo = readFileSync(`supabase/migrations/${ARCHIVO}`, "utf8");
const sql = crudo
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
  .toLowerCase();
const sqlAplicacion = sql.replace(/\$\$[\s\S]*?\$\$/g, " ");

console.log("\nSTABILIZATION-01 · seguridad de Producción\n");

check("1. Existe una sola 0187 y es la que se audita", () => {
  const todas = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  assert(todas.filter((f) => f.startsWith("0187")).length === 1, "hay más de una 0187");
  assert(todas.includes(ARCHIVO), `desapareció ${ARCHIVO}`);
});

check("2. Declara qué presupone y aborta si no se cumple", () => {
  assert(/raise exception '0187 presupone 0162 y 0166'/.test(sql),
    "no aborta si se aplica fuera de orden");
  assert(/plan_revision_limits[\s\S]*bigint/.test(sql),
    "no comprueba la premisa que le da sentido: que la columna sea bigint");
});

check("3. NO escribe ni una fila", () => {
  for (const verbo of [/\binsert\s+into\b/, /\bupdate\s+[a-z_.]+\s+set\b/,
                       /\bdelete\s+from\b/, /\btruncate\b/, /\bcopy\b/]) {
    assert(!verbo.test(sqlAplicacion), `la migración ejecuta ${verbo}`);
  }
});

check("4. No toca inquilinos, derechos, módulos ni autenticación", () => {
  for (const t of ["organizations", "memberships", "organization_plan_assignments",
                   "organization_modules", "organization_subscriptions", "profiles",
                   "plan_revisions", "plan_revision_limits", "billing_subscriptions"]) {
    assert(!new RegExp(`\\b(insert into|update|delete from|alter table)\\s+(public\\.)?${t}\\b`)
      .test(sqlAplicacion), `la migración escribe en ${t}`);
  }
  assert(!/\bauth\./.test(sqlAplicacion), "toca el esquema de autenticación");
});

check("5. No crea ni destruye estructura · solo redefine la función rota", () => {
  assert(!/create\s+table/.test(sqlAplicacion), "crea una tabla");
  assert(!/drop\s+table/.test(sqlAplicacion), "borra una tabla");
  assert(!/drop\s+column/.test(sqlAplicacion), "borra una columna");
  assert(!/add\s+column/.test(sqlAplicacion), "añade una columna");
  assert(!/create\s+(unique\s+)?index/.test(sqlAplicacion), "crea un índice");
  const drops = sql.match(/drop\s+[a-z]+/g) ?? [];
  assert(drops.every((d) => d.startsWith("drop function")),
    `hay DROP que no son de la función: ${drops.join(", ")}`);
});

check("6. La función vuelve con el tipo de la tabla, y con sus privilegios", () => {
  assert(/limit_value\s+bigint/.test(sql), "el retorno no pasó a bigint");
  assert(!/limit_value\s+integer/.test(sql), "quedó un integer en el retorno");
  assert(/security\s+definer/.test(sql) && /set\s+search_path\s+to\s+'public'/.test(sql),
    "la función perdió security definer o su search_path");
  assert(/revoke\s+all\s+on\s+function\s+public\.organization_plan_limits\(uuid\)\s+from\s+public,\s*anon/
    .test(sql), "no se vuelven a quitar los privilegios que 0166 quitaba");
  assert(/grant\s+execute\s+on\s+function\s+public\.organization_plan_limits\(uuid\)\s+to\s+authenticated/
    .test(sql), "no se vuelve a conceder la ejecución a authenticated");
});

check("7. Y no cambia su lógica · mismas comprobaciones de sesión y misma fuente", () => {
  assert(/auth_required/.test(sql) && /not_authorized/.test(sql),
    "desaparecieron las comprobaciones de sesión");
  assert(/plan_effective_for_organization\(p_organization_id, now\(\)\)/.test(sql),
    "cambió la fuente del plan");
  assert(/from public\.plan_revision_limits l/.test(sql), "cambió la tabla de límites");
});

check("8. Ninguna cifra comercial escrita a mano", () => {
  for (const n of ["52428800", "524288000", "5368709120", "25", "500", "2000", "30"]) {
    assert(!new RegExp(`\\b${n}\\b`).test(sqlAplicacion),
      `la migración lleva la cifra ${n} escrita a mano: las cuotas salen del catálogo`);
  }
});

console.log(`\nSTABILIZATION-01 · seguridad: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
