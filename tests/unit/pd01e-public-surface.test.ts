/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01E · La superficie pública, por fuera.
 *
 * Las guardas de base se prueban aparte contra Postgres. Aquí se comprueba lo
 * que vive en la aplicación: que el señuelo y el tiempo mínimo se resuelven en
 * SERVIDOR, que la página no se indexa, que el navegador no elige contra qué
 * campaña escribe, y que en ningún registro acaba un dato personal.
 *
 * Correr: npm run test:pd01e
 */
import { readFileSync } from "node:fs";
import {
  INTAKE_COOKIE, RENDER_COOKIE, MIN_INTERACTION_SECONDS,
} from "../../lib/domain/public-intake-cookies";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/[^\n]*/g, "$1");

const ACCION = sinComentarios(leer("server/actions/public-diagnostic-intake.ts"));
const PAGINA = sinComentarios(leer("app/diagnostic/[slug]/page.tsx"));
const FORM = sinComentarios(leer("components/domain/public-diagnostics/intake-form.tsx"));
const DATOS = sinComentarios(leer("lib/db/public-diagnostic-intake.ts"));
const SQL = leer("supabase/migrations/0198_public_diagnostic_intake.sql");

console.log("\nA · Señuelo y tiempo mínimo, en servidor");
// ===========================================================================

check("T. El señuelo bloquea, y la acción NO delata que lo vio", () => {
  assert(/formData\.get\("website"\)/.test(ACCION), "no hay campo trampa");
  const i = ACCION.indexOf('formData.get("website")');
  const bloque = ACCION.slice(i, i + 200);
  assert(/status: "created"/.test(bloque),
    "al señuelo se le responde distinto que a un envío bueno: es decirle qué cambiar");
  assert(!/honeypot|bot|spam/i.test(bloque.replace(/website/g, "")),
    "la respuesta al señuelo revela la detección");
});

check("El campo trampa está oculto y fuera de la tabulación", () => {
  assert(/name="website"/.test(FORM), "el formulario no lleva el campo trampa");
  assert(/tabIndex=\{-1\}/.test(FORM), "el campo trampa se puede tabular: lo tocaría una persona");
  assert(/aria-hidden="true"/.test(FORM), "el campo trampa lo anunciaría un lector de pantalla");
  assert(/left-\[-9999px\]/.test(FORM), "el campo trampa se ve");
});

check("U. El tiempo mínimo lo firma y lo valida la BASE", () => {
  /*
    El primer diseño ponía una cookie durante el render. Tenía dos problemas y
    los dos eran reales: `Date.now()` en render es impuro —lo marcó el
    compilador— y escribir una cookie mientras se renderiza un componente de
    servidor no está soportado en Next; solo se puede desde una acción.

    Ahora la base emite un testigo firmado al resolver la campaña y lo valida
    al empezar. Un robot puede leerlo, pero no puede fabricar uno más viejo.
  */
  assert(/public_intake_issue_nonce/.test(SQL), "la base no emite testigo de formulario");
  assert(/public_intake_nonce_ok/.test(SQL), "la base no valida el testigo");
  assert(/v_edad >= 3/.test(SQL), "no hay mínimo de interacción");
  assert(/v_edad <= 3600/.test(SQL), "un testigo viejo vale para siempre");
  assert(/v_firma <> public\.public_intake_fingerprint\(v_ts\)/.test(SQL),
    "el testigo no se verifica contra su firma: sería falsificable");
  assert(/nonce: String\(formData\.get\("nonce"\)/.test(ACCION),
    "la acción no reenvía el testigo");
  assert(/name="nonce"/.test(FORM), "el formulario no lleva el testigo");
  // Y no se mide en el navegador, que no protegería de nada.
  assert(!/Date\.now\(\)/.test(FORM) && !/Date\.now\(\)/.test(PAGINA),
    "el tiempo se mide en el cliente o en el render");
  void MIN_INTERACTION_SECONDS;
});

console.log("\nB · Lo que el navegador NO puede elegir");
// ===========================================================================

check("La campaña se resuelve por slug, nunca por identificador enviado", () => {
  assert(!/campaign_id/.test(ACCION), "la acción acepta un identificador de campaña del cliente");
  assert(/p_slug: input\.slug/.test(DATOS), "no se envía el slug a la base");
  // Y la función lo vuelve a resolver por su cuenta.
  assert(/select \* into c from public\.public_diagnostic_campaigns where slug = p_slug/.test(SQL),
    "la base no resuelve la campaña por slug");
});

check("I. Ni la versión ni la huella del consentimiento llegan del formulario", () => {
  for (const prohibido of ["diagnostic_version_id", "consent_content_hash",
                           "consent_version", "resume_token"]) {
    assert(!new RegExp(`formData\\.get\\("${prohibido}`).test(ACCION),
      `la acción acepta «${prohibido}» del navegador`);
  }
  assert(/c\.diagnostic_version_id/.test(SQL), "la versión no sale de la campaña");
  assert(/d\.content_hash/.test(SQL), "la huella no se copia del documento real");
});

check("Ni el estado: una participación nace en curso", () => {
  assert(/'in_progress'/.test(SQL), "la participación no nace en curso");
  assert(!/formData\.get\("status/.test(ACCION), "el estado llega del navegador");
});

console.log("\nC · Consentimientos");
// ===========================================================================

check("J. El obligatorio no se puede omitir, y se comprueba en servidor", () => {
  assert(/formData\.get\("consent"\) !== "on"/.test(ACCION),
    "el consentimiento obligatorio no se comprueba en servidor");
  assert(/required/.test(FORM), "el formulario no lo marca obligatorio");
  const i = FORM.indexOf('name="consent"');
  assert(!/defaultChecked|checked/.test(FORM.slice(i - 120, i + 120)),
    "el consentimiento obligatorio viene premarcado");
});

check("K. Y el comercial va aparte, sin marcar y sin condicionar", () => {
  assert(/name="marketing"/.test(FORM), "no existe el consentimiento comercial");
  const i = FORM.indexOf('name="marketing"');
  assert(!/required|defaultChecked/.test(FORM.slice(i - 60, i + 140)),
    "el consentimiento comercial es obligatorio o viene marcado");
  assert(/marketing: formData\.get\("marketing"\) === "on"/.test(ACCION),
    "el comercial no se lee por separado");
});

console.log("\nD · Enumeración y continuidad");
// ===========================================================================

check("S. «Ya existe» dice lo mismo esté en curso o completada", () => {
  const estados = (SQL.match(/'status', 'existing'/g) ?? []).length;
  assert(estados === 1, "hay más de una respuesta para «ya existe»: se puede distinguir");
  assert(!/'already_completed'|'existing_in_progress'/.test(SQL),
    "la base distingue en curso de completada hacia fuera: eso permite enumerar");
  // Y no se entrega el testigo a quien solo conoce un correo.
  const i = SQL.indexOf("'status', 'existing'");
  assert(!/token/.test(SQL.slice(i - 200, i + 100)),
    "se entrega el testigo a quien solo escribió un correo");
});

check("La continuidad va en cookie HttpOnly, no en la URL", () => {
  assert(/httpOnly: true/.test(ACCION), "el testigo queda legible por JavaScript");
  assert(/sameSite: "lax"/.test(ACCION), "la cookie no acota el envío entre sitios");
  assert(/secure: process\.env\.NODE_ENV === "production"/.test(ACCION),
    "la cookie viaja sin cifrar en producción");
  // Comparar los dos nombres era vacío: son literales distintos y `tsc` lo
  // señaló —la comprobación no podía fallar nunca—. Lo que sí importa es que
  // ninguna de las dos salga del recorrido público.
  // Se busca el NOMBRE de la constante, no su valor: el código importa la
  // constante y el literal no aparece en el fuente. Buscar el valor daba un
  // falso rojo.
  assert(/INTAKE_COOKIE/.test(ACCION), "la cookie de continuidad ya no la usa nadie");
  assert(INTAKE_COOKIE.length > 0 && RENDER_COOKIE.length > 0, "cookie sin nombre");
  assert(/path: "\/diagnostic"/.test(ACCION),
    "la cookie de continuidad no está acotada a /diagnostic: viajaría en cada "
    + "petición de la aplicación autenticada");
  // El testigo NO se pone en la dirección: quedaría en el historial y en los
  // registros de cualquier proxy.
  assert(!/searchParams.*token|\?token=/.test(ACCION), "el testigo viaja por la URL");
});

console.log("\nE · Privacidad e indexación");
// ===========================================================================

check("AC. La página pública no se indexa", () => {
  assert(/robots: \{ index: false, follow: false \}/.test(PAGINA),
    "la página de campaña se indexaría: lleva el nombre de la entidad convocante");
});

check("PII_LOGGING: no se registra ningún dato personal", () => {
  for (const f of ["server/actions/public-diagnostic-intake.ts",
                   "lib/db/public-diagnostic-intake.ts",
                   "app/diagnostic/[slug]/page.tsx"]) {
    const src = sinComentarios(leer(f));
    assert(!/console\.(log|info|warn|error)/.test(src),
      `${f} escribe en el registro: por ahí acaban saliendo los datos personales`);
  }
  // Y la IP no se guarda: se manda a la base para pseudonimizarla allí.
  assert(/p_ip: input\.ip/.test(DATOS), "la IP no llega a la base para pseudonimizarse");
  assert(/hmac\(convert_to/.test(SQL), "la huella no usa HMAC con pimienta");
  assert(!/insert into public\.public_intake_attempts[\s\S]{0,200}p_ip\b/.test(SQL),
    "se guarda la IP en claro en la tabla de intentos");
});

check("La pimienta se genera sola y no sale de la base", () => {
  assert(/gen_random_bytes\(32\)/.test(SQL), "la pimienta no es aleatoria de 32 bytes");
  assert(/revoke all on table public\.public_intake_secret from anon, authenticated/.test(SQL),
    "la tabla de la pimienta queda alcanzable");
  assert(!/process\.env\.[A-Z_]*PEPPER|process\.env\.[A-Z_]*INTAKE/.test(ACCION),
    "la pimienta pasó a ser una variable de entorno que alguien tiene que configurar");
});

console.log("\nF · La superficie de funciones");
// ===========================================================================

check("Tres funciones concedidas, y revocadas primero", () => {
  const concesiones = (SQL.match(/grant execute on function/g) ?? []).length;
  assert(concesiones === 3, `se conceden ${concesiones} funciones al público`);
  const revocaciones = (SQL.match(/revoke all on function/g) ?? []).length;
  assert(revocaciones >= 3, "no se revoca antes de conceder");
  // Cada una fija su search_path.
  const definer = (SQL.match(/security definer/g) ?? []).length;
  const paths = (SQL.match(/set search_path to 'public'/g) ?? []).length;
  assert(paths >= definer, `${definer} funciones definer y solo ${paths} fijan search_path`);
});

check("Y ninguna tabla se abre al público", () => {
  assert(!/grant .*on table .* to anon/i.test(SQL), "la migración concede una tabla a anon");
  assert(!/for select to anon|for all to anon|to anon using/i.test(SQL),
    "la migración crea una política para anon");
});

console.log(`\nPUBLIC-DIAGNOSTICS-01E · superficie: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
