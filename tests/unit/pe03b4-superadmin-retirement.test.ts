/**
 * Trazaloop · PE-03B4 · Parte 1 · La retirada de `qa-a`, y sus salvaguardas.
 *
 * QUÉ PUEDE COMPROBAR ESTA SUITE Y QUÉ NO
 *
 * El estado final vive en la base de Staging, y las credenciales de Staging no
 * están en el repositorio a propósito: las pone quien ejecuta. Así que esta
 * suite NO afirma que `qa-a` esté revocada — afirmarlo sin haberlo mirado sería
 * exactamente el error que este repositorio persigue.
 *
 * Lo que sí comprueba es todo lo que se puede comprobar sin credenciales: que
 * la operación está escrita, que es la canónica, y que lleva las salvaguardas
 * que la hacen segura. La verificación contra Staging la imprime el propio
 * guion al ejecutarse, y queda en el informe.
 *
 * Correr: npm run test:pe03b4-retirement
 */
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const RUTA = "scripts/pe03b4/retirar-qa-a.ts";
const GUION = existsSync(RUTA) ? readFileSync(RUTA, "utf8") : "";
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nPE-03B4 · La retirada de qa-a\n");

// ===========================================================================
console.log("A · La operación está escrita, y es la canónica");
// ===========================================================================

check("A1. Existe el guion de retirada", () => {
  assert(GUION.length > 0, `no existe ${RUTA}`);
});

check("A2. Cambia el ESTADO, no borra la fila", () => {
  const codigo = sinComentarios(GUION);
  assert(/\.update\(\{\s*status:\s*"revoked"\s*\}\)/.test(codigo),
    "no se revoca cambiando el estado");
  assert(!/from\("platform_staff"\)[\s\S]{0,80}\.delete\(\)/.test(codigo),
    "se borra la fila de personal: se perdería quién tuvo acceso y hasta cuándo");
});

check("A3. Y no toca nada más de esa persona", () => {
  const codigo = sinComentarios(GUION);
  assert(!/deleteUser/.test(codigo), "borra la identidad de Auth");
  assert(!/updateUserById|\bpassword\b|generateLink|resetPasswordForEmail/.test(codigo),
    "toca las credenciales o el correo de la cuenta");
  assert(!/role_code:/.test(codigo), "cambia el papel en vez de retirar el acceso");
  for (const ajeno of ["organizations", "memberships", "legal_", "faq_", "platform_tutorial"]) {
    assert(!new RegExp(`from\\("${ajeno}`).test(codigo),
      `el guion toca «${ajeno}»: la autoría histórica no se altera`);
  }
});

// ===========================================================================
console.log("\nB · No quedarse sin puerta");
// ===========================================================================

check("B1. Comprueba ANTES que el humano es superadministrador activo", () => {
  const codigo = sinComentarios(GUION);
  const comprobacion = codigo.indexOf('role_code !== "superadmin"');
  const revocacion = codigo.indexOf('status: "revoked"');
  assert(comprobacion > -1, "no se comprueba el papel del superadministrador humano");
  assert(revocacion > -1, "no se revoca nada");
  assert(comprobacion < revocacion,
    "se revoca antes de comprobar que hay otro superadministrador activo");
});

check("B2. Y aborta si no lo es", () => {
  const codigo = sinComentarios(GUION);
  const i = codigo.indexOf('role_code !== "superadmin"');
  const bloque = codigo.slice(i, i + 400);
  assert(/process\.exit\(1\)/.test(bloque),
    "si el humano no es superadministrador activo, el guion sigue igual");
});

check("B3. El correo del humano es el congelado", () => {
  assert(/idendilatam@gmail\.com/.test(GUION), "no se nombra al superadministrador humano");
  assert(/qa-a@trazaloop-staging\.local/.test(GUION), "no se nombra la cuenta a retirar");
});

// ===========================================================================
console.log("\nC · Solo Staging, y se comprueba");
// ===========================================================================

check("C1. Aborta si la URL no es la de Staging", () => {
  const codigo = sinComentarios(GUION);
  assert(/qchzkxbnbqeyuxinipln/.test(codigo), "no se nombra el proyecto de Staging");
  assert(/URL\.includes\(REF_STAGING\)/.test(codigo),
    "no se comprueba contra qué proyecto se va a escribir");
  const i = codigo.indexOf("REF_STAGING)");
  assert(/process\.exit\(2\)/.test(codigo.slice(i, i + 300)),
    "no aborta cuando la URL no es la de Staging");
});

check("C2. Las credenciales las pone quien ejecuta, no un fichero", () => {
  const codigo = sinComentarios(GUION);
  assert(/process\.env\.STAGING_SUPABASE_URL/.test(codigo),
    "no lee la URL del entorno");
  assert(!/dotenv|\.env\.local/.test(codigo),
    "el guion busca credenciales en un fichero del repositorio");
});

check("C3. Y hay una pasada en seco", () => {
  const codigo = sinComentarios(GUION);
  assert(/--dry-run/.test(codigo), "no se puede ver el estado sin escribir");
});

// ===========================================================================
console.log("\nD · Se comprueba contra la base, no contra el flujo");
// ===========================================================================

check("D1. Vuelve a leer después de escribir", () => {
  const codigo = sinComentarios(GUION);
  const revocacion = codigo.indexOf('status: "revoked"');
  const relectura = codigo.indexOf('.select("user_id, role_code, status")', revocacion);
  assert(relectura > revocacion,
    "no se vuelve a leer la base después de revocar");
});

check("D2. Y exige que quede UN solo superadministrador humano activo", () => {
  const codigo = sinComentarios(GUION);
  assert(/correosActivos\.length === 1/.test(codigo),
    "no se comprueba cuántos superadministradores activos quedan");
  assert(/correosActivos\[0\] === HUMANO/.test(codigo),
    "no se comprueba QUIÉN es el que queda");
  assert(/if \(!soloElHumano\) process\.exit\(1\)/.test(codigo),
    "el guion termina en verde aunque el estado final no sea el esperado");
});

check("D3. La cuenta de la sonda no entra en esto", () => {
  // El informe del incidente de PE-03 la dejó revocada y baneada. Este guion no
  // la toca: retirar a `qa-a` no es una excusa para pasar por otras cuentas.
  assert(!/probe|sonda/i.test(sinComentarios(GUION)),
    "el guion de retirada toca también la cuenta de la sonda");
});

console.log(`\nPE-03B4 · retirada: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
