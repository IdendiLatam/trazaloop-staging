/**
 * Trazaloop · PROD-LAUNCH-01E · Tres fricciones antes del tráfico externo.
 *
 *
 * A · CONFIRMAR LA CUENTA TERMINABA FUERA
 *
 * `signUp` no enviaba `emailRedirectTo`, así que GoTrue usaba el Site URL y el
 * enlace del correo aterrizaba en la PORTADA PÚBLICA con un `?code=` que allí
 * no consume nadie. La cuenta quedaba confirmada; la persona, fuera. Y aunque
 * hubiera llegado al callback, este mandaba a `/login` —que no rebota a quien
 * ya tiene sesión— así que le pedía la contraseña otra vez el día que se
 * registra.
 *
 *
 * B · SE OFRECÍA UNA FUNCIÓN APAGADA
 *
 * Sin credencial de IA, «Trazaloop Intelligence» seguía en el menú de Quality
 * y llevaba a una pantalla que explicaba que no estaba configurada. Para quien
 * administra la plataforma eso es información; para quien acaba de pagar Full
 * es una promesa incumplida.
 *
 *
 * C · EL COMERCIO APARECÍA DESPUÉS DE IRSE
 *
 * El primer pago real mostró «IDENDI Latam» en la pasarela. Es correcto
 * —Trazaloop es un producto de IDENDI Latam— pero se veía por primera vez ya
 * fuera de Trazaloop y con la tarjeta en la mano.
 *
 * Correr: npm run test:pl01e
 */
import { readFileSync } from "node:fs";
import {
  QUALITY_COPILOT_GROUP, QUALITY_SHELL_MODULE, visibleNavGroups,
} from "../../lib/modules/registry";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/[^\n]*/g, "$1");

console.log("\nA · La confirmación de la cuenta acaba DENTRO");
// ===========================================================================

const AUTH = sinComentarios(leer("server/actions/auth.ts"));
const CALLBACK = sinComentarios(leer("app/auth/callback/route.ts"));

check("El correo de confirmación apunta al callback, no al Site URL", () => {
  const i = AUTH.indexOf("supabase.auth.signUp(");
  assert(i > 0, "desapareció el registro");
  const cuerpo = AUTH.slice(i, i + 500);
  assert(/emailRedirectTo/.test(cuerpo),
    "signUp sigue sin emailRedirectTo: el enlace vuelve al Site URL");
  assert(/\/auth\/callback/.test(cuerpo),
    "el destino no es /auth/callback, que es el único que canjea el código");
});

check("El origen sale del resolutor que YA existía, sin dominios a mano", () => {
  assert(/resolveAppOrigin\(\)/.test(AUTH),
    "no se reutiliza el resolutor de origen; hay una segunda lógica");
  assert(!/www\.trazaloop\.com/.test(AUTH),
    "hay un dominio escrito a mano: Staging y local dejarían de funcionar");
});

check("Y ese resolutor sirve para los tres entornos", () => {
  const helper = sinComentarios(leer("lib/auth/invitation-link.ts"));
  assert(/x-forwarded-host/.test(helper), "no mira el origen real de la petición");
  assert(/NEXT_PUBLIC_SITE_URL/.test(helper), "no tiene respaldo declarado");
  assert(/localhost/.test(helper), "no contempla el desarrollo local");
});

check("Confirmar la cuenta ya NO deja a nadie en el formulario de acceso", () => {
  assert(/postAuthDestinationPath/.test(CALLBACK),
    "el callback no calcula el destino post-acceso");
  assert(/getPostAuthDestinationAction/.test(CALLBACK),
    "el callback no usa la decisión canónica de destino");
  // La puerta legal es obligatoria y va ANTES del destino. Se comparan SITIOS
  // DE LLAMADA dentro del manejador, no líneas de import: los imports están
  // arriba del todo y su orden no dice nada sobre la ejecución.
  const cuerpo = CALLBACK.slice(CALLBACK.indexOf("export async function GET"));
  const legal = cuerpo.indexOf("hasAcceptedAll");
  const destino = cuerpo.indexOf("postAuthDestinationPath(");
  assert(legal > 0, "el callback no comprueba la aceptación legal");
  assert(destino > legal,
    "se calcula el destino antes de comprobar la aceptación legal");
});

check("La recuperación de contraseña NO cambió de comportamiento", () => {
  assert(/next === "\/reset-password"/.test(CALLBACK),
    "desapareció el reconocimiento del flujo de recuperación");
  assert(/redirect\(new URL\("\/reset-password", url\.origin\)\)/.test(CALLBACK),
    "la recuperación ya no lleva a poner la contraseña nueva");
  assert(/forgot-password/.test(CALLBACK),
    "un enlace de recuperación roto ya no vuelve a pedirse");
});

check("PKCE intacto: se sigue canjeando el código en servidor", () => {
  assert(/exchangeCodeForSession\(code\)/.test(CALLBACK),
    "ya no se canjea el código: eso rompe PKCE");
  assert(!/detectSessionInUrl|access_token|refresh_token/.test(CALLBACK),
    "el callback pasó a leer la sesión del fragmento: eso es el otro flujo");
});

check("Y NO se convirtió en un redirector abierto", () => {
  // El destino sale del servidor. De la URL solo se admite una lista cerrada
  // de UN elemento.
  assert(!/redirect\(new URL\(next/.test(CALLBACK),
    "el callback redirige a un destino que llega en la URL");
  const usos = (CALLBACK.match(/\bnext\b/g) ?? []).length;
  assert(usos <= 4, `«next» se usa ${usos} veces: la lista dejó de ser cerrada`);
});

console.log("\nB · Intelligence no se ofrece si no está");
// ===========================================================================

check("Sin credencial de IA, el grupo desaparece del menú", () => {
  const sinIa = visibleNavGroups(QUALITY_SHELL_MODULE, { aiAvailable: false });
  assert(!sinIa.includes(QUALITY_COPILOT_GROUP),
    "se sigue ofreciendo Intelligence sin credencial: se vende algo apagado");
  assert(sinIa.length === QUALITY_SHELL_MODULE.groups.length - 1,
    "se ocultó más de un grupo");
});

check("Con credencial, el menú es exactamente el de siempre", () => {
  const conIa = visibleNavGroups(QUALITY_SHELL_MODULE, { aiAvailable: true });
  assert(conIa.includes(QUALITY_COPILOT_GROUP), "Intelligence no aparece con credencial");
  assert(conIa.length === QUALITY_SHELL_MODULE.groups.length, "se perdió algún grupo");
  assert(JSON.stringify(conIa) === JSON.stringify(QUALITY_SHELL_MODULE.groups),
    "el orden del menú cambió");
});

check("Y los demás módulos no se tocan", () => {
  const otro = { groups: [{ title: "X", items: [] }] };
  assert(visibleNavGroups(otro, { aiAvailable: false }).length === 1,
    "se filtró un grupo de otro módulo");
});

check("La disponibilidad la resuelve el SERVIDOR, no la vista", () => {
  const nav = sinComentarios(leer("components/layout/nav.tsx"));
  assert(/aiAvailable/.test(nav), "el menú no recibe la disponibilidad");
  assert(!/process\.env/.test(nav),
    "el menú lee el entorno: es una pieza de cliente y no puede");
  const shell = sinComentarios(leer("app/(app)/(shell)/layout.tsx"));
  assert(/aiCredentialConfigured\(\)/.test(shell),
    "el shell no resuelve la disponibilidad de IA");
  assert(/aiAvailable=\{iaDisponible\}/.test(shell),
    "el shell no se la pasa al menú");
});

check("Por omisión se oculta: equivocarse hacia NO ofrecer", () => {
  const nav = leer("components/layout/nav.tsx");
  assert(/aiAvailable = false/.test(nav),
    "el valor por omisión ofrece la función: montar el menú sin el dato la anunciaría");
});

check("La ruta directa NO se queda abierta porque el enlace no se vea", () => {
  const pagina = sinComentarios(leer("app/(app)/(shell)/quality/copilot/page.tsx"));
  assert(/if \(!copilotConfigured\(\)\)/.test(pagina),
    "la pantalla no comprueba la configuración: ocultar el enlace sería maquillaje");
  assert(/redirect\("\/quality"\)/.test(pagina),
    "no hay salida controlada: se devuelve a Quality, no se rompe");
  assert(!/throw|notFound\(\)/.test(pagina.slice(0, pagina.indexOf("const sp"))),
    "la ruta responde con un error en vez de con una salida controlada");
});

check("Salvo para la administración de plataforma, que sí debe verla", () => {
  const pagina = sinComentarios(leer("app/(app)/(shell)/quality/copilot/page.tsx"));
  assert(/checkPlatformStatus/.test(pagina), "no se distingue a la administración");
  assert(/if \(!isStaff\) redirect/.test(pagina),
    "la excepción no está acotada a la administración");
});

console.log("\nC · Quién cobra se dice ANTES de salir a pagar");
// ===========================================================================

const PANEL = leer("components/domain/billing/redirect-checkout-panel.tsx");
const VISIBLE = sinComentarios(PANEL);
const FACTURACION = sinComentarios(leer("app/(app)/(shell)/settings/billing/page.tsx"));

check("La pantalla previa al pago declara de quién es Trazaloop", () => {
  assert(/Trazaloop es un producto de IDENDI Latam/.test(VISIBLE),
    "no se declara la relación producto ↔ empresa antes de pagar");
});

check("Y a nombre de quién se cobra", () => {
  assert(/procesado por[\s\S]{0,40}a nombre de IDENDI Latam/.test(VISIBLE),
    "no se dice a nombre de quién procesa la pasarela");
  assert(/\{providerName\}/.test(VISIBLE),
    "se escribió la pasarela a mano en vez de recibirla como dato");
});

check("Sin perder lo que ya decía sobre la tarjeta", () => {
  assert(/no recibe ni guarda los datos de tu tarjeta/.test(VISIBLE),
    "se perdió la aclaración de que Trazaloop no guarda la tarjeta");
  assert(/Pago seguro con/.test(VISIBLE), "se perdió el encabezado del pago");
});

check("Y sin convertirse en un aviso legal", () => {
  // Dos frases, no un párrafo de condiciones.
  //
  // Con LÍMITES DE PALABRA y solo sobre el TEXTO QUE SE PINTA. Sin lo primero,
  // «NIT» casaba dentro de `initPoint` —una variable— y la comprobación
  // acusaba a la pantalla de un aviso legal que no tenía.
  const copia = (VISIBLE.match(/>[^<>{}]{6,}</g) ?? []).join(" ");
  assert(copia.length > 80, "no se pudo extraer el texto visible de la pantalla");
  for (const pesado of ["términos y condiciones", "responsabilidad", "cláusula",
                        "NIT", "razón social"]) {
    assert(!new RegExp(`\\b${pesado}\\b`, "i").test(copia),
      `la pantalla de pago se llenó de aviso legal: «${pesado}»`);
  }
});

check("Y facturación tampoco escribe la pasarela a mano", () => {
  // Misma disciplina que el panel: el nombre llega como dato desde la
  // autoridad de proveedor. Escribirlo aquí metería una marca de pasarela en
  // un fichero de interfaz, y la frontera declarada es de servidor.
  assert(!/mercadopago|mercado pago/i.test(FACTURACION),
    "facturación nombra la pasarela a mano");
  assert(/resolvePurchaseRoutingFromEnv\(\)/.test(FACTURACION),
    "facturación no pregunta a la autoridad de proveedor");
  assert(/\$\{pasarela\}/.test(FACTURACION),
    "el nombre de la pasarela no se pinta como dato");
});

check("En facturación aparece UNA vez, en la cabecera y no por fila", () => {
  const apariciones = (FACTURACION.match(/IDENDI Latam/g) ?? []).length;
  assert(apariciones === 1,
    `«IDENDI Latam» aparece ${apariciones} veces en facturación`);
  const i = FACTURACION.indexOf("IDENDI Latam");
  const filas = FACTURACION.indexOf("historial.map(");
  assert(filas > 0 && i < filas, "la aclaración se pinta dentro de cada cobro");
});

check("Y nada promete que el comercio sea «Trazaloop»", () => {
  for (const f of ["components/domain/billing/redirect-checkout-panel.tsx",
                   "app/(app)/(shell)/settings/billing/page.tsx",
                   "app/(app)/(shell)/settings/billing/checkout/page.tsx"]) {
    const src = sinComentarios(leer(f));
    assert(!/a nombre de Trazaloop|cobra Trazaloop|comercio:? Trazaloop/i.test(src),
      `${f} promete que el comercio es Trazaloop`);
  }
});

console.log("\nD · Nada del carril de cobro se movió");
// ===========================================================================

check("Ni la pasarela, ni la verificación, ni la conciliación", () => {
  const ruta = sinComentarios(leer("lib/billing/purchase-routing.ts"));
  assert(/flow: "redirect"/.test(ruta), "cambió la forma del flujo");
  const verif = sinComentarios(leer("lib/billing/one-time/verification.ts"));
  assert(/LIVE_MODE_REQUIRED/.test(verif), "cambió la frontera de conciliación");
  const panel = sinComentarios(PANEL);
  assert(/startOneTimeCheckoutForQuoteAction\(quoteId\)/.test(panel),
    "cambió cómo se inicia el cobro");
});

console.log(`\nPROD-LAUNCH-01E · higiene de lanzamiento: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
