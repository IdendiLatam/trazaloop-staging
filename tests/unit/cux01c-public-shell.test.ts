/**
 * Trazaloop · COMMERCIAL-UX-01C · La cáscara pública.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Dos cosas que se rompen calladas.
 *
 * La primera: que la navegación pública siga siendo UNA. El defecto que la
 * cáscara cierra es que había cuatro cabeceras escritas a mano, así que añadir
 * un enlace obligaba a acordarse de cuatro sitios. Si mañana alguien vuelve a
 * poner un `<header>` propio en una página pública, el problema regresa sin que
 * nadie lo note hasta que falte un camino.
 *
 * La segunda: que la portada siga siendo pública. Una cáscara que leyera la
 * sesión convertiría en privada, de un plumazo, cualquier página que la usara.
 * Nadie lo probaría porque «la portada siempre ha funcionado».
 *
 * Y la accesibilidad del menú, que no se nota mirando: un panel escondido con
 * CSS pero presente en el árbol deja el tabulador cayendo en enlaces que no se
 * ven, y es de los fallos más difíciles de detectar a ojo.
 *
 * Correr: npm run test:cux01c-shell
 */
import { readFileSync, existsSync } from "node:fs";
import {
  PUBLIC_NAV_ITEMS, PUBLIC_FOOTER_ITEMS,
} from "../../components/layout/public-shell";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const SHELL = "components/layout/public-shell.tsx";
const MOVIL = "components/layout/public-mobile-nav.tsx";
const PORTADA = "app/page.tsx";
const PLANES = "app/planes/page.tsx";

console.log("\n1 · UNA SOLA NAVEGACIÓN");

check("1A. «Planes y precios» apunta a /planes", () => {
  const planes = PUBLIC_NAV_ITEMS.find((i) => i.href === "/planes");
  assert(planes !== undefined, "no hay entrada de planes en la navegación pública");
  assert(/planes y precios/i.test(planes.label),
    `la entrada se llama «${planes.label}»`);
});

check("1B. Y están los destinos que el gate pide", () => {
  const hrefs = PUBLIC_NAV_ITEMS.map((i) => i.href);
  for (const destino of ["/", "/planes", "/faq"]) {
    assert(hrefs.includes(destino), `falta ${destino} en la navegación`);
  }
  // Y con el nombre de FUERA. PE-02B6 fijó los dos: dentro del producto la
  // entrada global es «Ayuda»; desde fuera es «Preguntas frecuentes», que es
  // por lo que la busca quien todavía no es cliente.
  const faq = PUBLIC_NAV_ITEMS.find((i) => i.href === "/faq");
  assert(faq?.label === "Preguntas frecuentes",
    `la navegación pública llama «${faq?.label}» a la FAQ`);
  // Iniciar sesión no está en la lista porque no es un destino de contenido:
  // es la acción de entrada, y va en su propio botón.
  const s = leer(SHELL);
  assert(/entryHref = "\/login"/.test(s), "no hay entrada a la plataforma por defecto");
});

check("1C. La ruta /planes existe · el enlace no lleva a un 404", () => {
  const p = leer(PLANES);
  assert(p.length > 0, "no existe la página de planes");
  assert(/export default (async )?function/.test(p),
    "la página de planes no exporta nada");
});

check("1D. El pie conserva los cuatro destinos legales", () => {
  const hrefs = PUBLIC_FOOTER_ITEMS.map((i) => i.href);
  for (const destino of ["/faq", "/legal", "/terms", "/privacy"]) {
    assert(hrefs.includes(destino), `el pie perdió ${destino}`);
  }
});

check("1E. La portada ya no lleva cabecera ni pie propios", () => {
  // Es el arreglo entero: si vuelve a tenerlos, vuelve el problema.
  const p = leer(PORTADA);
  assert(/PublicHeader/.test(p) && /PublicFooter/.test(p),
    "la portada no usa la cáscara común");
  assert(!/<header/.test(p), "la portada volvió a escribir su propia cabecera");
  assert(!/<footer/.test(p), "la portada volvió a escribir su propio pie");
});

console.log("\n2 · LA CÁSCARA NO SABE DE SESIONES");

check("2A. No lee al usuario ni redirige", () => {
  // Si la leyera, cualquier página que la use heredaría una dependencia de
  // autenticación sin pedirla, y un error al leerla volvería privada una página
  // que no lo es.
  for (const f of [SHELL, MOVIL]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["createServerClient", "auth\\.getUser", "requireSession",
                             "requireActiveOrg", "redirect\\(", "createAdminClient"]) {
      assert(!new RegExp(prohibido).test(src),
        `${f} toca la sesión mediante ${prohibido}`);
    }
  }
});

check("2B. La portada sigue siendo pública", () => {
  // Lee la sesión de forma NO bloqueante: solo para decidir a dónde lleva
  // «Entrar». Nunca redirige por falta de sesión.
  const p = leer(PORTADA);
  assert(/auth\.getUser\(\)/.test(p), "la portada dejó de resolver el destino de entrada");
  assert(!/redirect\(/.test(p), "la portada redirige: dejó de ser pública");
});

check("2C. /planes tampoco pide sesión", () => {
  const p = leer(PLANES).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const prohibido of ["requireSession", "requireActiveOrg", "redirect\\(",
                           "auth\\.getUser"]) {
    assert(!new RegExp(prohibido).test(p), `/planes exige sesión vía ${prohibido}`);
  }
});

check("2D. Y no se ha introducido un middleware para esto", () => {
  // Dato que conviene dejar escrito: este repositorio NO tiene middleware. La
  // protección se decide ruta a ruta, con `requireSession` y `requireActiveOrg`
  // en los layouts de `(app)`. Lo público es público por no pedir nada, no por
  // figurar en una lista de exenciones.
  //
  // Añadir un middleware para una cáscara sería mover la puerta de la casa para
  // colgar un cuadro: pasaría a decidir el acceso de TODAS las rutas, incluidas
  // las que hoy se protegen solas y funcionan.
  assert(!existsSync("middleware.ts") && !existsSync("src/middleware.ts"),
    "apareció un middleware: este gate no necesitaba uno y ahora gobierna todo");
  const layout = leer("app/(app)/(shell)/layout.tsx");
  assert(/requireSession|requireActiveOrg/.test(layout),
    "la protección por ruta de la zona privada dejó de estar donde estaba");
});

console.log("\n3 · LA RUTA DE PLANES, YA CONSTRUIDA");

check("3A. Usa la cáscara pública, no una suya", () => {
  // En 01C esta sección vigilaba que el marcador de posición no se adelantara a
  // pintar catálogo. Con la página ya construida (01D) lo que queda por vigilar
  // desde aquí es lo que le toca a la cáscara: que /planes no se salga de ella.
  //
  // Lo de «ni una cifra escrita a mano» lo comprueba `cux01d`, que es quien
  // sabe distinguir un precio de un `border-loop/30`.
  const p = leer(PLANES);
  assert(/<PublicShell/.test(p), "/planes no usa la cáscara pública");
  assert(!/<header|<footer/.test(p),
    "/planes escribió su propia cabecera o su propio pie");
  assert(/currentPath="\/planes"/.test(p),
    "/planes no se marca como el destino actual en la navegación");
});

console.log("\n4 · ACCESIBILIDAD · LO QUE NO SE VE MIRANDO");

check("4A. Puntos de referencia semánticos", () => {
  const s = leer(SHELL);
  assert(/<header/.test(s), "no hay cabecera semántica");
  assert(/<main id="contenido"/.test(s), "no hay contenido principal con destino");
  assert(/<footer/.test(s), "no hay pie semántico");
  assert(/<nav aria-label="Principal"/.test(s),
    "la navegación principal no se distingue de las demás");
  assert(/<nav aria-label="Enlaces legales/.test(s),
    "el pie tiene una navegación sin nombre: un lector de pantalla oye dos «navegación»");
});

check("4B. Salto al contenido, primero y enfocable", () => {
  const s = leer(SHELL);
  assert(/href="#contenido"/.test(s), "no hay salto al contenido");
  assert(/sr-only focus:not-sr-only/.test(s),
    "el salto es invisible también al enfocarlo, que es cuando tiene que verse");
  assert(s.indexOf('href="#contenido"') < s.indexOf("<PublicHeader"),
    "el salto va después de la cabecera: hay que recorrerla entera para usarlo");
});

check("4C. La página actual se anuncia", () => {
  const s = leer(SHELL);
  assert(/aria-current=\{i\.current \? "page" : undefined\}/.test(s),
    "no se marca el destino actual");
});

check("4D. El foco se ve siempre", () => {
  // Sin foco visible, quien navega con teclado no sabe dónde está.
  for (const f of [SHELL, MOVIL, PLANES]) {
    const src = leer(f);
    const enlaces = (src.match(/<Link|<a\s/g) ?? []).length;
    const focos = (src.match(/focus-visible:outline/g) ?? []).length;
    assert(focos >= enlaces - 1,
      `${f} tiene ${enlaces} enlaces y solo ${focos} con foco visible`);
  }
});

check("4E. El botón del menú dice qué controla y en qué estado está", () => {
  const m = leer(MOVIL);
  assert(/aria-expanded=\{abierto\}/.test(m),
    "quien no ve la pantalla pulsa el botón y no sabe si pasó algo");
  assert(/aria-controls="menu-publico"/.test(m), "el botón no dice qué controla");
  assert(/id="menu-publico"/.test(m), "no existe el panel que el botón dice controlar");
  assert(/aria-label=\{abierto \? "Cerrar el menú" : "Abrir el menú"\}/.test(m),
    "el botón se anuncia igual abierto que cerrado");
});

check("4F. Escape cierra y el foco vuelve al botón", () => {
  // Escape es lo que todo el mundo intenta primero. Y si el foco no vuelve, se
  // va al principio del documento y hay que recorrer la página otra vez.
  const m = leer(MOVIL);
  assert(/e\.key === "Escape"/.test(m), "Escape no cierra el menú");
  assert(/boton\.current\?\.focus\(\)/.test(m),
    "al cerrar con Escape el foco se pierde");
  assert(/removeEventListener\("keydown"/.test(m),
    "el escuchador de teclado no se retira: se acumulan uno por apertura");
});

check("4G. El panel se DESMONTA, no se esconde", () => {
  // Un enlace invisible pero enfocable deja el tabulador cayendo en sitios que
  // no se ven. Es el fallo de accesibilidad más difícil de notar a ojo.
  const m = leer(MOVIL);
  assert(/\{abierto \? \(/.test(m),
    "el panel del menú vive en el árbol aunque esté cerrado");
  assert(!/hidden.*menu-publico|menu-publico.*\bhidden\b/.test(m),
    "el panel se oculta con CSS en vez de desmontarse");
});

check("4H. Al navegar, el menú se cierra", () => {
  const m = leer(MOVIL);
  const enlaces = m.split("<Link").slice(1);
  for (const e of enlaces) {
    assert(/onClick=\{cerrar\}/.test(e.slice(0, 400)),
      "un enlace del menú móvil deja el panel abierto encima del destino");
  }
});

check("4I. Tres tamaños · y la navegación no se duplica en ninguno", () => {
  const s = leer(SHELL);
  assert(/hidden items-center gap-1 md:flex/.test(s),
    "la navegación de escritorio no se esconde en móvil");
  const m = leer(MOVIL);
  assert(/className="md:hidden"/.test(m),
    "el menú móvil no se esconde en escritorio: saldrían los dos a la vez");
});

check("4J. Nada fuerza scroll horizontal", () => {
  const s = leer(SHELL);
  assert(/flex-wrap/.test(s),
    "el pie no envuelve: con cuatro enlaces en un móvil estrecho se desborda");
  assert(!/w-\[\d|min-w-\[\d/.test(s),
    "hay un ancho fijo en píxeles que puede desbordar una pantalla pequeña");
});

console.log(`\nCOMMERCIAL-UX-01C · cáscara pública: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
