/**
 * Trazaloop · PE-03B4 · El vídeo de bienvenida, leído en el código.
 *
 * Lo que se comprueba aquí son AUSENCIAS y ORDEN: que la bienvenida no se
 * ponga delante de una puerta obligatoria, que «Cerrar» no escriba nada, que
 * no haya reproducción automática, que no se haya escrito un segundo
 * reproductor y que no vuelva ningún tope de tamaño ni de duración.
 *
 * Ninguna de esas cosas se demuestra ejecutando: una ausencia se vigila
 * leyendo. Lo que sí se ejecuta —que la preferencia de A no la lea B— está en
 * `pe03b4-user-preferences`, contra la base real.
 *
 * Correr: npm run test:pe03b4-welcome
 */
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const BIENVENIDA = leer("components/domain/tutorials/welcome-video.tsx");
const ACCIONES = leer("server/actions/welcome.ts");
const PUERTA = leer("app/(app)/modules/page.tsx");
const REPRODUCTOR = leer("components/domain/tutorials/tutorial-player.tsx");
const ACCION_PANTALLA = leer("components/domain/tutorials/page-tutorial-action.tsx");
const MIGRACION = leer("supabase/migrations/0161_user_product_preferences.sql");
const PREFERENCIAS = leer("lib/db/user-preferences.ts");

console.log("\nPE-03B4 · La bienvenida\n");

// ===========================================================================
console.log("A · Cuándo aparece, y detrás de qué");
// ===========================================================================

check("A1. Se monta en la puerta, y en ninguna otra pantalla", () => {
  assert(/<WelcomeVideo\s/.test(sinComentarios(PUERTA)),
    "la puerta de módulos no monta la bienvenida");
  // Ni en el shell —que envuelve 147 pantallas— ni en la consola.
  for (const otro of ["app/(app)/(shell)/layout.tsx", "app/(app)/platform/layout.tsx"]) {
    assert(!/WelcomeVideo/.test(leer(otro)), `la bienvenida también se monta en ${otro}`);
  }
});

check("A2. Y NUNCA antes de la aceptación legal", () => {
  const codigo = sinComentarios(PUERTA);
  const legal = codigo.indexOf("requireLegalAcceptance");
  const bienvenida = codigo.indexOf("<WelcomeVideo");
  assert(legal > -1, "la puerta dejó de exigir la aceptación legal");
  assert(legal < bienvenida,
    "la bienvenida se pinta antes de comprobar la aceptación legal");
});

check("A3. Ni antes de tener empresa activa", () => {
  const codigo = sinComentarios(PUERTA);
  assert(/activeOrg\s*\?\s*<WelcomeVideo/.test(codigo),
    "la bienvenida se pinta sin comprobar que hay empresa activa");
});

check("A4. Y exige sesión, como todo lo demás", () => {
  assert(/requireSession\(\)/.test(sinComentarios(PUERTA)), "la puerta no exige sesión");
  const acciones = sinComentarios(ACCIONES);
  const cuantas = (acciones.match(/export async function/g) ?? []).length;
  const sesiones = (acciones.match(/await requireSession\(\)/g) ?? []).length;
  assert(sesiones === cuantas,
    `${cuantas} acciones y solo ${sesiones} exigen sesión`);
});

check("A5. Sin vídeo publicado no se abre nada", () => {
  const codigo = sinComentarios(BIENVENIDA);
  assert(/estado\.status !== "ready"\)\s*return null/.test(codigo),
    "la bienvenida pinta algo cuando no hay vídeo listo");
  // Y NO se usa la copia de «en actualización»: esa es la de los tutoriales de
  // pantalla, donde alguien pulsó un botón y merece una respuesta.
  assert(!/actualizaci/i.test(codigo),
    "la bienvenida usa la copia de «tutorial en actualización»");
});

// ===========================================================================
console.log("\nB · Cerrar no es «no volver a mostrar»");
// ===========================================================================

check("B1. «Cerrar» no escribe ninguna preferencia", () => {
  const codigo = sinComentarios(BIENVENIDA);
  const i = codigo.indexOf("const cerrarPorAhora");
  const j = codigo.indexOf("const noVolverAMostrar");
  assert(i > -1 && j > i, "no se distinguen las dos salidas");
  const cerrar = codigo.slice(i, j);
  assert(!/suppressWelcomeVideoAction|setUserPreference/.test(cerrar),
    "«Cerrar» guarda una preferencia permanente");
});

check("B2. Y se recuerda solo para esta sesión", () => {
  const codigo = sinComentarios(BIENVENIDA);
  assert(/document\.cookie/.test(codigo), "no hay marca de sesión");
  // Una cookie de sesión no lleva caducidad: si la llevara, «por ahora» se
  // habría convertido en «durante N días», que es otra promesa.
  // Se buscan los ATRIBUTOS de cookie, no las palabras sueltas:
  // `expiresInSeconds` es el plazo de la URL firmada y no tiene nada que ver.
  assert(!/max-age\s*=/i.test(codigo) && !/\bexpires\s*=/i.test(codigo),
    "la marca de «por ahora» tiene fecha de caducidad: ya no es de sesión");
  // Y va marcada con la persona, para que la decisión de quien usó antes este
  // ordenador no se aplique a quien entra después.
  assert(/\$\{COOKIE\}=\$\{userId\}/.test(codigo),
    "la marca de sesión no distingue de quién es");
});

check("B3. «No volver a mostrar» sí escribe, y por la puerta canónica", () => {
  const codigo = sinComentarios(BIENVENIDA);
  assert(/No volver a mostrar/.test(codigo), "falta el botón «No volver a mostrar»");
  assert(/suppressWelcomeVideoAction\(\)/.test(codigo),
    "el botón no guarda la preferencia");
  const acciones = sinComentarios(ACCIONES);
  assert(/setUserPreference\("welcome_video_suppressed"\)/.test(acciones),
    "la acción no guarda la preferencia esperada");
});

check("B4. Publicar otra versión NO reinicia la preferencia", () => {
  // La preferencia no se guarda por versión: es una sola fila por persona, sin
  // ninguna referencia a la versión del vídeo. Si llevara `version_id`,
  // publicar la v2 la habría dejado sin efecto.
  const acciones = sinComentarios(ACCIONES);
  assert(!/version/i.test(acciones.slice(acciones.indexOf("suppressWelcomeVideoAction"))),
    "la supresión se guarda por versión");
  assert(!/version/i.test(sinComentarios(PREFERENCIAS)),
    "la capa de preferencias conoce las versiones del vídeo");
});

check("B5. Y no hay reinicio masivo por ninguna parte", () => {
  const migracion = MIGRACION.replace(/--.*$/gm, "");
  assert(!/for delete/i.test(migracion),
    "0161 tiene política de DELETE: la preferencia se puede deshacer");
  assert(!/grant\s+delete/i.test(migracion), "0161 concede DELETE");
  assert(/grant select, insert, update on public\.user_preferences to authenticated/
    .test(migracion), "los permisos de la tabla no son los esperados");
});

// ===========================================================================
console.log("\nC · El reproductor es el MISMO, no otro");
// ===========================================================================

check("C1. Existe un solo reproductor y los dos sitios lo usan", () => {
  assert(existsSync("components/domain/tutorials/tutorial-player.tsx"),
    "no existe el reproductor compartido");
  for (const [quien, codigo] of [["la bienvenida", BIENVENIDA],
    ["el tutorial de pantalla", ACCION_PANTALLA]] as [string, string][]) {
    assert(/<TutorialPlayer\s/.test(codigo), `${quien} no usa el reproductor compartido`);
    assert(/<TutorialDialogShell\s/.test(codigo), `${quien} no usa el diálogo compartido`);
    // Y no escribe su propio <video>.
    assert(!/<video\s/.test(codigo), `${quien} tiene su propio <video>`);
  }
});

check("C2. Sin reproducción automática", () => {
  const codigo = sinComentarios(REPRODUCTOR);
  assert(!/autoPlay|autoplay/.test(codigo), "el reproductor arranca solo");
  assert(/controls/.test(codigo), "el reproductor no tiene controles");
  assert(/preload="metadata"/.test(codigo), "el reproductor descarga más de lo que hace falta");
});

check("C3. Y la renovación sigue funcionando para la bienvenida", () => {
  assert(/renewWelcomePlaybackAction/.test(sinComentarios(BIENVENIDA)),
    "la bienvenida no renueva su autorización");
  const codigo = sinComentarios(REPRODUCTOR);
  assert(/setTimeout/.test(codigo) && /expiresInSeconds\s*[-*]/.test(codigo),
    "la renovación no se programa antes de vencer");
  assert(/loadedmetadata/.test(codigo),
    "se vuelve al segundo sin esperar a los metadatos");
});

check("C4. El diálogo es accesible: modal, Escape, foco", () => {
  const codigo = sinComentarios(REPRODUCTOR);
  assert(/role="dialog"/.test(codigo) && /aria-modal="true"/.test(codigo),
    "el diálogo no se anuncia como modal");
  assert(/e\.key === "Escape"/.test(codigo), "Escape no cierra");
  assert(/devolverFoco/.test(codigo), "el foco no vuelve al cerrar");
  assert(/e\.key !== "Tab"/.test(codigo), "el foco no queda atrapado dentro");
});

// ===========================================================================
console.log("\nD · Fallar no bloquea Trazaloop");
// ===========================================================================

check("D1. La bienvenida no tiene estado de avería, y es deliberado", () => {
  const acciones = sinComentarios(ACCIONES);
  // Dos estados: o hay vídeo, o no se abre nada.
  assert(/status: "ready"/.test(acciones) && /status: "none"/.test(acciones),
    "los estados de la bienvenida no son los esperados");
  assert(!/"unavailable"/.test(acciones),
    "la bienvenida presenta averías, y eso la convierte en una puerta");
});

check("D2. Sin dato NO es cero: la duda no muestra el vídeo", () => {
  const acciones = sinComentarios(ACCIONES);
  assert(/suprimida !== false/.test(acciones),
    "una lectura fallida de la preferencia se trata como «no la suprimió»");
  const capa = sinComentarios(PREFERENCIAS);
  assert(/if \(error\) return null/.test(capa),
    "la capa de preferencias devuelve false cuando no pudo leer");
});

check("D3. Y la puerta se pinta aunque la bienvenida falle", () => {
  // El componente devuelve null en todos los caminos que no sean «hay vídeo».
  // No lanza, y la puerta no lo espera para renderizar.
  const codigo = sinComentarios(BIENVENIDA);
  assert(!/throw /.test(codigo), "la bienvenida lanza");
  assert(!/redirect\(/.test(codigo), "la bienvenida redirige");
});

// ===========================================================================
console.log("\nE · Ni tope de tamaño ni de duración, tampoco aquí");
// ===========================================================================

check("E1. B4 no reintrodujo ningún tope de producto", () => {
  const fuentes = [BIENVENIDA, ACCIONES, REPRODUCTOR, PREFERENCIAS, MIGRACION];
  for (const src of fuentes) {
    const codigo = sinComentarios(src);
    assert(!/\b(200|500)\s*\*\s*1024\s*\*\s*1024\b/.test(codigo), "hay un tope en megas");
    assert(!/MAX_(FILE|SIZE|DURATION|VIDEO)/.test(codigo), "hay una constante de tope");
    assert(!/duration_seconds\s*[<>]/.test(codigo), "se compara la duración con un máximo");
  }
});

check("E2. Y no hay ninguna validación de duración en la bienvenida", () => {
  const codigo = sinComentarios(BIENVENIDA) + sinComentarios(ACCIONES);
  assert(!/minutos|horas|duraci[oó]n m[aá]xima/i.test(codigo),
    "la bienvenida habla de una duración máxima");
});

// ===========================================================================
console.log("\nF · Ni un plan por el camino");
// ===========================================================================

check("F1. Ver la bienvenida no consulta ningún plan", () => {
  const codigo = sinComentarios(ACCIONES) + sinComentarios(BIENVENIDA);
  for (const rastro of ["plan_code", "access_mode", "entitlement", "organization_modules",
    "subscription"]) {
    assert(!new RegExp(rastro, "i").test(codigo),
      `la bienvenida consulta «${rastro}»`);
  }
});

check("F2. Y la preferencia no cuelga de ninguna empresa", () => {
  const migracion = MIGRACION.replace(/--.*$/gm, "");
  assert(!/organization_id/.test(migracion),
    "la tabla de preferencias tiene organization_id");
  assert(!/organization/i.test(sinComentarios(PREFERENCIAS)),
    "la capa de preferencias conoce las empresas");
});

console.log(`\nPE-03B4 · bienvenida: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
