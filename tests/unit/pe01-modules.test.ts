/**
 * Trazaloop · PE-01B · La puerta, sin base y sin DOM.
 *
 * Aquí van las decisiones: quién es el protagonista, en qué orden va el resto,
 * qué se dice de cada estado, y —lo que más pesa— que **un fallo operativo no es
 * un estado comercial**.
 *
 * Correr: npm run test:pe01-modules
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  ENTRY_COPY, HERO_MODULE_KEY, NO_ACTIVE_MODULES_BODY, NO_ACTIVE_MODULES_TITLE,
  PLATFORM_TAGLINE, RESOLUTION_FAILED_BODY, RESOLUTION_FAILED_TITLE, SPECIALIZED_ORDER,
  enterLabel, heroModule, isNavigable, overviewOf, presentationFor, specializedModules,
} from "../../lib/modules/entry";
import { COMMERCIAL_MODULES } from "../../lib/modules/catalog";
import { resolveModuleAccess, type DerivedModuleState } from "../../lib/modules/access";
import {
  DERIVED_STATE_HINT, DERIVED_STATE_LABEL, classifyDemoNotice, isEnterableState,
  moduleAccessDeniedMessage,
} from "../../lib/modules/messages";
import {
  PLATFORM_SURFACE_KEY, isPlatformSurface, moduleAwareHref, resolveShellModuleForPath,
  SHELL_MODULES, SHELL_MODULE_PARAM,
} from "../../lib/modules/registry";
import { MODULE_SELECTOR_PATH } from "../../lib/domain/team";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const PAGINA = leer("app/(app)/modules/page.tsx");
const TARJETAS = leer("components/domain/modules/module-entry.tsx");
const ENTRADA = leer("lib/modules/entry.ts");
const ACCESO = leer("lib/db/module-access.ts");
const SHELL = leer("app/(app)/(shell)/layout.tsx");
const PORTAL = leer("app/page.tsx");
/** Lo que de verdad se lee en pantalla: sin comentarios y sin atributos. */
const sinComentarios = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const PAGINA_CODIGO = sinComentarios(PAGINA);
const TARJETAS_CODIGO = sinComentarios(TARJETAS);
const ENTRADA_CODIGO = sinComentarios(ENTRADA);

const AHORA = new Date("2026-08-30T12:00:00Z");

console.log("\nPE-01B · La puerta de Trazaloop\n");

// ===========================================================================
console.log("A · Un solo catálogo, y el protagonista");
// ===========================================================================

check("A1. La puerta lee el catálogo canónico y NO escribe una segunda lista", () => {
  assert(ENTRADA.includes("COMMERCIAL_MODULES"), "la puerta no lee el catálogo canónico");
  assert(!/name: "Trazaloop/.test(PAGINA + TARJETAS),
    "la puerta escribe nombres de módulo a mano");
  assert(!/homePath: ["'`]/.test(PAGINA + TARJETAS + ENTRADA),
    "la puerta escribe rutas de módulo a mano");
});

check("A2. Quality es el protagonista, y lo es SIEMPRE", () => {
  assert(HERO_MODULE_KEY === "quality", `el protagonista es ${HERO_MODULE_KEY}`);
  assert(heroModule().name === "Trazaloop Quality", "el protagonista no es Quality");
  // La jerarquía es del producto: no depende de lo contratado, y por eso no hay
  // ni una condición sobre el estado al elegirlo.
  assert(!/heroModule\([^)]*state/.test(ENTRADA),
    "el protagonista depende del estado de acceso");
});

check("A3. Los tres especializados, en orden estable", () => {
  const s = specializedModules().map((m) => m.key);
  assert(s.join(",") === "cpr,textiles,construccion", `el orden es ${s.join(",")}`);
  assert(s.length + 1 === COMMERCIAL_MODULES.length,
    "la puerta no enseña todos los módulos del catálogo");
  assert(SPECIALIZED_ORDER[SPECIALIZED_ORDER.length - 1] === "construccion",
    "el módulo futuro no va al final");
});

check("A4. El orden NO se recoloca según lo contratado", () => {
  // La puerta vieja subía los entrables porque las cuatro tarjetas eran iguales
  // y la única útil caía bajo el pliegue. Con el protagonista arriba eso deja
  // de hacer falta, y una pantalla que se recoloca se aprende mal.
  assert(!/sortModulesForSelector/.test(PAGINA),
    "la puerta sigue reordenando las tarjetas por su estado");
});

// ===========================================================================
console.log("\nB · Un fallo NO es una decisión comercial · PE-D1");
// ===========================================================================

check("B1. La lectura de la asignación MIRA su error", () => {
  assert(/const \{ data, error \} = await supabase/.test(ACCESO),
    "la lectura sigue descartando el error");
  assert(/if \(error\) return \{ status: "unavailable" \}/.test(ACCESO),
    "un error de lectura no se distingue de la ausencia de fila");
  assert(!/if \(!data\) return null;/.test(ACCESO),
    "la función sigue devolviendo null para las dos cosas");
});

check("B2. Y hay TRES respuestas, no dos", () => {
  for (const r of ['status: "found"', 'status: "absent"', 'status: "unavailable"']) {
    assert(ACCESO.includes(r), `falta la respuesta ${r}`);
  }
});

check("B3. «No se pudo comprobar» NO se resuelve como «no lo tienes»", () => {
  const roto = resolveModuleAccess({
    isFunctional: true, killSwitchActive: true,
    assignment: null, assignmentUnavailable: true, now: AHORA,
  });
  assert(roto.derivedState === "unavailable",
    `un fallo llegó como ${roto.derivedState}`);
  assert(roto.reason === "unavailable", `el motivo llegó como ${roto.reason}`);
  assert(!roto.allowed, "un fallo concedió acceso: hay que fallar cerrado");

  const sinFila = resolveModuleAccess({
    isFunctional: true, killSwitchActive: true, assignment: null, now: AHORA,
  });
  assert(sinFila.derivedState === "not_assigned",
    "se leyó y no hay fila: eso SÍ es «no incluido»");
  assert((roto.derivedState as string) !== (sinFila.derivedState as string),
    "los dos casos siguen dando el mismo estado");
});

check("B4. Y se cuenta distinto, sin filtrar jerga", () => {
  const a = DERIVED_STATE_HINT.unavailable;
  const b = DERIVED_STATE_HINT.not_assigned;
  assert(a !== b, "las dos situaciones dicen lo mismo");
  assert(/no fue posible verificar/i.test(a), `el fallo dice «${a}»`);
  assert(!/asignad|incluid|contratad|plan/i.test(a),
    `el fallo afirma algo sobre el contrato: «${a}»`);
  assert(!/PGRST|error|SQL|null|excepci/i.test(a), `filtra jerga: «${a}»`);
  assert(/no forma parte del acceso/i.test(b), `«no incluido» dice «${b}»`);
});

check("B5. Un módulo que no se pudo leer no sostiene ningún aviso de prueba", () => {
  assert(classifyDemoNotice([{ state: "unavailable" }]) === "none",
    "un módulo ilegible produjo un aviso sobre pruebas");
  assert(classifyDemoNotice([{ state: "unavailable" }, { state: "demo_expired" }])
    === "all_expired", "el ilegible alteró la clasificación del vencido");
});

check("B6. El orden importa: primero «no se sabe», después «no hay»", () => {
  // Si «no hay asignación» se evaluara antes, un fallo se seguiría contando
  // como decisión comercial y el arreglo no serviría de nada.
  const i = ACCESO.indexOf("assignmentUnavailable");
  assert(i > 0, "la capa de datos no traslada el fallo a la regla");
  const regla = leer("lib/modules/access.ts");
  assert(regla.indexOf("input.assignmentUnavailable") < regla.indexOf("if (!assignment)"),
    "«no se sabe» se evalúa después de «no hay»");
});

check("B7. Una excepción de la capa de datos se trata igual que un error", () => {
  assert(/catch \{\s*lookup = \{ status: "unavailable" \}/.test(ACCESO),
    "una excepción de red seguiría cayendo como «no lo tienes»");
});

// ===========================================================================
console.log("\nC · La presentación de cada estado");
// ===========================================================================

check("C1. Cinco formas de presentar, y «no se sabe» es una de ellas", () => {
  assert(presentationFor("full") === "enterable", "el acceso activo no es entrable");
  assert(presentationFor("demo_active") === "enterable", "una prueba viva no es entrable");
  // PROD-LAUNCH-01C.4 · La quinta forma. Una prueba vencida ya NO se presenta
  // como bloqueada: se entra, a consultar lo que la empresa creó dentro. Es el
  // cambio deliberado de este tramo, no una etiqueta que se relajó — y por eso
  // se sigue exigiendo que NO se presente como entrable, que sería darle
  // permiso de escritura a quien viene a mirar.
  assert(presentationFor("demo_expired") === "read_only",
    `una prueba vencida se presenta como «${presentationFor("demo_expired")}»`);
  assert(presentationFor("not_assigned") === "blocked", "«no incluido» no está bloqueado");
  assert(presentationFor("coming_soon") === "future", "el futuro no se presenta como futuro");
  assert(presentationFor("unavailable") === "unavailable",
    "el fallo se presenta como un estado comercial");
});

check("C2. Solo es enlace lo que lleva a algún sitio", () => {
  assert(isNavigable("full", "/quality"), "un módulo activo con ruta no es navegable");
  assert(!isNavigable("full", null), "sin ruta no puede haber enlace");
  assert(isNavigable("demo_expired", "/quality"),
    "una prueba vencida no ofrece entrada: la información queda dentro sin puerta");
  assert(!isNavigable("not_assigned", "/quality"), "un módulo no incluido ofrece entrada");
  assert(!isNavigable("unavailable", "/quality"), "un módulo sin resolver ofrece entrada");
  assert(!isNavigable("coming_soon", null), "el futuro ofrece entrada");
  // Y en la tarjeta: enlace o artículo, nunca un ancla deshabilitada.
  assert(/<article/.test(TARJETAS), "no hay tarjeta no navegable");
  assert(!/disabled/.test(TARJETAS), "hay un control deshabilitado haciendo de enlace");
});

check("C3. El estado se dice con TEXTO, no solo con color", () => {
  assert(/DERIVED_STATE_LABEL\[state\]/.test(TARJETAS),
    "el distintivo de estado no lleva su etiqueta");
  for (const s of Object.keys(DERIVED_STATE_LABEL) as DerivedModuleState[]) {
    assert(DERIVED_STATE_LABEL[s].length > 3, `el estado ${s} no tiene etiqueta legible`);
    assert(DERIVED_STATE_HINT[s].length > 15, `el estado ${s} no se explica`);
  }
});

check("C4. Las etiquetas ya no confunden acceso con plan", () => {
  for (const [s, etiqueta] of Object.entries(DERIVED_STATE_LABEL)) {
    assert(!/^Plan /.test(etiqueta),
      `el estado ${s} se presenta como un plan: «${etiqueta}»`);
  }
  assert(DERIVED_STATE_LABEL.full === "Activo", `full dice «${DERIVED_STATE_LABEL.full}»`);
  assert(DERIVED_STATE_LABEL.not_assigned === "No incluido",
    `not_assigned dice «${DERIVED_STATE_LABEL.not_assigned}»`);
});

check("C5. «Próximamente» sigue siendo exclusivo de lo que no existe", () => {
  const conEtiqueta = Object.entries(DERIVED_STATE_LABEL)
    .filter(([, v]) => v === "Próximamente").map(([k]) => k);
  assert(conEtiqueta.length === 1 && conEtiqueta[0] === "coming_soon",
    `«Próximamente» etiqueta ${conEtiqueta.join(", ")}`);
});

check("C6. Y cada bloqueo dice qué pasa con los datos", () => {
  assert(/datos se conserv/i.test(DERIVED_STATE_HINT.demo_expired),
    "la prueba vencida no dice qué pasa con los datos");
  assert(/datos se conserv/i.test(DERIVED_STATE_HINT.disabled),
    "el acceso suspendido no dice qué pasa con los datos");
});

// ===========================================================================
console.log("\nD · Lo que se dice cuando no hay nada");
// ===========================================================================

check("D1. «No hay activos» y «no se pudo comprobar» son dos cosas", () => {
  assert((NO_ACTIVE_MODULES_TITLE as string) !== (RESOLUTION_FAILED_TITLE as string),
    "los dos dicen lo mismo");
  assert(/no tiene módulos activos/i.test(NO_ACTIVE_MODULES_TITLE),
    `«sin módulos» dice «${NO_ACTIVE_MODULES_TITLE}»`);
  assert(/no fue posible verificar/i.test(RESOLUTION_FAILED_TITLE),
    `«no se pudo» dice «${RESOLUTION_FAILED_TITLE}»`);
  assert(/no un cambio en lo que tienes contratado/i.test(RESOLUTION_FAILED_BODY),
    "no se aclara que el fallo no es un cambio comercial");
});

check("D2. Sin módulos NO se insinúa que la cuenta esté mal", () => {
  assert(/Tu cuenta funciona/i.test(NO_ACTIVE_MODULES_BODY),
    "no se dice que la cuenta sigue viva");
  assert(/datos se conservan/i.test(NO_ACTIVE_MODULES_BODY),
    "no se dice qué pasa con los datos");
  for (const p of ["error", "problema con tu cuenta", "suspendida", "inválida"]) {
    assert(!NO_ACTIVE_MODULES_BODY.toLowerCase().includes(p),
      `el texto suena a avería: «${p}»`);
  }
});

check("D3. El conjunto distingue los tres casos", () => {
  const nada = overviewOf(["not_assigned", "not_assigned", "demo_expired", "coming_soon"]);
  assert(!nada.hasEnterable && !nada.allUnavailable, "sin módulos se clasificó mal");
  const roto = overviewOf(["unavailable", "unavailable", "unavailable", "coming_soon"]);
  assert(roto.allUnavailable, "no se detecta que no se pudo comprobar NADA");
  assert(!roto.hasEnterable, "un conjunto ilegible dice tener módulos entrables");
  const mixto = overviewOf(["full", "unavailable", "not_assigned", "coming_soon"]);
  assert(mixto.hasEnterable && mixto.hasUnavailable && !mixto.allUnavailable,
    "un conjunto mixto se clasificó mal");
});

check("D4. Y la puerta pinta cada caso una sola vez", () => {
  assert(PAGINA.includes("RESOLUTION_FAILED_TITLE") && PAGINA.includes("NO_ACTIVE_MODULES_TITLE"),
    "la puerta no distingue los dos casos");
  const i = PAGINA.indexOf("allUnavailable");
  const j = PAGINA.indexOf("!resumen.hasEnterable");
  assert(i > 0 && j > i, "«no se pudo comprobar» debe evaluarse antes que «no hay nada»");
});

// ===========================================================================
console.log("\nE · Ningún módulo es el repuesto de otro");
// ===========================================================================

check("E1. Una ruta transversal NO resuelve ningún módulo · PE-D3", () => {
  for (const p of ["/team", "/settings/company", "/settings/profile", "/support", "", "/nada"]) {
    const k = resolveShellModuleForPath(p, null).key;
    assert(k === PLATFORM_SURFACE_KEY, `${p || "(vacía)"} resolvió ${k}`);
  }
  assert(isPlatformSurface(resolveShellModuleForPath("/team", null)),
    "la superficie neutra no se reconoce");
});

check("E2. Pero conserva el módulo cuando se sabe cuál", () => {
  assert(resolveShellModuleForPath("/team", "quality").key === "quality",
    "se pierde Quality al ir a una transversal");
  assert(resolveShellModuleForPath("/team", "textiles").key === "textiles",
    "se pierde Textiles");
  assert(resolveShellModuleForPath("/team", "cpr").key === "cpr", "se pierde PCR");
});

check("E3. Y la RUTA sigue mandando sobre el parámetro", () => {
  assert(resolveShellModuleForPath("/quality/processes", "textiles").key === "quality",
    "un parámetro robó una pantalla de Quality");
  assert(resolveShellModuleForPath("/dashboard", "quality").key === "cpr",
    "un parámetro robó una pantalla de PCR");
});

check("E4. La superficie neutra no tiene menú de nadie", () => {
  const neutra = resolveShellModuleForPath("/team", null);
  assert(neutra.groups.length === 0, "la superficie neutra enseña grupos de un módulo");
  assert(neutra.topLevel.length === 0, "la superficie neutra enseña entradas de un módulo");
  assert(neutra.name === "Trazaloop", `la superficie neutra se llama «${neutra.name}»`);
  assert(neutra.homePath === MODULE_SELECTOR_PATH, "la superficie neutra no lleva a la puerta");
});

check("E5. Y no se puede llevar como si fuera un módulo", () => {
  assert(moduleAwareHref("/team", PLATFORM_SURFACE_KEY) === "/team",
    "la superficie neutra decora los enlaces como un módulo");
  assert(moduleAwareHref("/team", "quality") === `/team?${SHELL_MODULE_PARAM}=quality`,
    "un módulo real dejó de decorar");
  assert(!SHELL_MODULES.some((m) => m.key === PLATFORM_SURFACE_KEY),
    "la superficie neutra entró en el registro de módulos");
});

check("E6. Cada ruta de un módulo la reclama SU módulo", () => {
  // Sin el valor por defecto, una ruta de PCR que falte en su lista de prefijos
  // se queda sin shell. Es lo que destapó `/onboarding`.
  for (const mod of SHELL_MODULES) {
    for (const l of [...mod.topLevel, ...mod.groups.flatMap((g) => g.items)]) {
      const duenno = resolveShellModuleForPath(l.href, null).key;
      assert(duenno === mod.key || duenno === PLATFORM_SURFACE_KEY,
        `el menú de ${mod.key} enlaza a ${l.href}, que pertenece a ${duenno}`);
    }
  }
});

check("E7. Quien no es de plataforma vuelve a la PUERTA · PE-D2", () => {
  const guard = leer("lib/auth/require-platform-staff.ts");
  assert(!/redirect\("\/dashboard"\)/.test(guard),
    "seguir mandando a la portada de PCR a quien no es staff");
  assert(/redirect\(MODULE_SELECTOR_PATH\)/.test(guard), "no vuelve a la puerta");
});

// ===========================================================================
console.log("\nF · El aviso de pruebas, en su sitio");
// ===========================================================================

check("F1. Sale del shell compartido", () => {
  assert(!/DemoTrialBanner/.test(SHELL),
    "el aviso de pruebas sigue en todas las pantallas de todos los módulos");
  assert(!/getDemoTrialSummary/.test(SHELL), "el shell sigue leyendo el resumen de pruebas");
});

check("F2. Y vive en la puerta, que es donde la pregunta es esa", () => {
  assert(/DemoTrialBanner/.test(PAGINA), "la puerta perdió el aviso de pruebas");
  assert(/showModulesLink=\{false\}/.test(PAGINA),
    "el aviso ofrece ir al selector estando ya en él");
});

check("F3. La clasificación por módulo NO se tocó", () => {
  assert(classifyDemoNotice([{ state: "demo_active" }, { state: "full" }]) === "active_partial",
    "una empresa con algo que no es prueba volvió a leerse como empresa en prueba");
  assert(classifyDemoNotice([{ state: "demo_expired" }, { state: "full" }]) === "partial",
    "un vencido con otro módulo vivo se clasificó como todo vencido");
});

// ===========================================================================
console.log("\nG · Copy y promesas");
// ===========================================================================

check("G1. Cada módulo tiene su frase, y ninguna promete cumplimiento", () => {
  for (const m of COMMERCIAL_MODULES) {
    const c = ENTRY_COPY[m.key];
    assert(c && c.length > 40, `${m.key} no tiene frase de puerta`);
    for (const p of ["ISO", "certificad", "conformidad", "cumple la norma", "garantiz"]) {
      assert(!new RegExp(p, "i").test(c), `la frase de ${m.key} promete «${p}»`);
    }
  }
});

check("G2. La de Quality es la congelada por el humano", () => {
  assert(ENTRY_COPY.quality.startsWith("Gestiona procesos, riesgos, objetivos, personas"),
    `la frase de Quality es «${ENTRY_COPY.quality}»`);
  assert(!/trazabilidad de cada decisión/i.test(ENTRY_COPY.quality),
    "se usa una promesa que el encargo retiró");
  assert(/conectado y trazable/.test(ENTRY_COPY.quality), "falta el cierre acordado");
});

check("G3. Sin jerga de plataforma en lo visible", () => {
  const visible = [PLATFORM_TAGLINE, ...Object.values(ENTRY_COPY),
                   NO_ACTIVE_MODULES_TITLE, NO_ACTIVE_MODULES_BODY,
                   RESOLUTION_FAILED_TITLE, RESOLUTION_FAILED_BODY,
                   ...Object.values(DERIVED_STATE_LABEL),
                   ...Object.values(DERIVED_STATE_HINT)].join(" ");
  for (const p of ["ERP", "QMS", "multi-tenant", "entitlement", "RLS", "tenant", "kill switch"]) {
    assert(!visible.toLowerCase().includes(p.toLowerCase()),
      `la puerta enseña jerga: «${p}»`);
  }
});

check("G4. Y el botón no expone la clave interna", () => {
  assert(enterLabel(heroModule()) === "Entrar a Quality",
    `el botón dice «${enterLabel(heroModule())}»`);
  for (const m of COMMERCIAL_MODULES) {
    assert(!enterLabel(m).includes(m.key) || m.key === "textiles",
      `el botón de ${m.key} expone su clave interna`);
  }
});

check("G5. El portal público ya no dice que Quality está por llegar", () => {
  // PE-02B3 · La portada dejó de escribir los nombres de los módulos y los lee
  // del catálogo, así que ya no se puede buscar «Trazaloop Quality» en su
  // código. La promesa es la misma y se comprueba en dos mitades: que el
  // protagonista se pinte como disponible, y que el único «Próximamente» sea el
  // del módulo que de verdad no existe. Que los nombres lleguen al HTML lo
  // comprueba el recorrido por HTTP.
  const hero = PORTAL.indexOf('id="modulo-principal"');
  assert(hero > 0, "el portal perdió el bloque del protagonista");
  const tarjeta = PORTAL.slice(hero - 500, hero + 700);
  assert(!/Próximamente/.test(tarjeta), "el portal anuncia el protagonista como futuro");
  assert(/Disponible/.test(tarjeta), "el portal no dice que el protagonista está disponible");
  assert(/ENTRY_COPY\[hero\.key\]/.test(PORTAL), "el portal no pinta la frase del catálogo");

  // Y el futuro sigue siendo futuro: el catálogo lo dice, y la portada lo pinta
  // a partir de ahí.
  const catalogo = leer("lib/modules/catalog.ts");
  const i = catalogo.indexOf('key: "construccion"');
  assert(i > 0, "el catálogo perdió Construcción");
  assert(/status: "coming_soon"/.test(catalogo.slice(i, i + 500)),
    "Construcción dejó de ser un módulo futuro en el catálogo");
  assert(/activo \? "Disponible" : "Próximamente"/.test(PORTAL),
    "la portada dejó de pintar el estado del catálogo");
});

// ===========================================================================
console.log("\nH · Fronteras");
// ===========================================================================

// ===========================================================================
console.log("\nI · En un móvil · matriz M");
// ===========================================================================

check("I1. La rejilla se pliega: una columna en la pantalla estrecha", () => {
  assert(/sm:grid-cols-2/.test(PAGINA_CODIGO) && /lg:grid-cols-3/.test(PAGINA_CODIGO),
    "la rejilla de módulos no declara su forma por tamaño de pantalla");
  assert(!/\bgrid-cols-[234]\b(?![^"]*sm:)/.test(PAGINA_CODIGO.replace(/(sm|md|lg|xl):grid-cols-\d/g, "")),
    "la rejilla arranca con varias columnas también en móvil");
});

check("I2. Y nada obliga a desplazarse en horizontal", () => {
  // Un ancho fijo en píxeles y un texto que no puede partirse son las dos
  // formas habituales de romper una pantalla estrecha.
  for (const [nombre, src] of [["la puerta", PAGINA_CODIGO], ["las tarjetas", TARJETAS_CODIGO]] as const) {
    assert(!/\bw-\[\d{3,}px\]/.test(src), `${nombre}: hay un ancho fijo en píxeles`);
    assert(!/min-w-\[\d{3,}px\]/.test(src), `${nombre}: hay un ancho mínimo en píxeles`);
    assert(!/overflow-x-(?:auto|scroll)/.test(src), `${nombre}: se desplaza en horizontal`);
  }
});

check("I3. El protagonista sigue siendo el primero en una sola columna", () => {
  // Sin rejilla, el orden del DOM ES el orden visual. Así que el héroe tiene
  // que pintarse antes, y no puede haber un reordenado que lo mueva.
  assert(PAGINA_CODIGO.indexOf("HeroModuleCard") < PAGINA_CODIGO.indexOf("SpecializedModuleCard"),
    "el protagonista se pinta después de los especializados");
  assert(!/\border-(?:first|last|none|\d+)\b/.test(PAGINA_CODIGO),
    "hay un reordenado visual que cambia lo que se ve primero en móvil");
});

check("H1. Entitlement no es autorización", () => {
  // `role="status"` es un atributo de accesibilidad, no una decisión de rol.
  const sinAria = PAGINA_CODIGO.replace(/role="[a-z]+"/g, "");
  assert(!/roleCode|isAdmin|hasRole|permiso/i.test(sinAria), "la puerta razona sobre roles");
  assert(/rol/.test(PAGINA), "la puerta no aclara que el rol decide lo de dentro");
});

check("H2. Ni precios, ni almacenamiento, ni cuotas", () => {
  const codigo = PAGINA_CODIGO + TARJETAS_CODIGO + ENTRADA_CODIGO;
  for (const p of ["precio", "€", "USD", "almacenamiento", "MB", "GB", "cuota",
                   "checkout", "pagar", "Ver planes"]) {
    assert(!codigo.includes(p), `la puerta adelanta algo comercial: «${p}»`);
  }
});

check("H3. Sin marcadores de lo que todavía no existe", () => {
  // La promesa de PE-01B era que la puerta no insinuara funciones inexistentes:
  // «un enlace a una página que no existe es peor que ningún enlace».
  //
  // La lista original nombraba «FAQ», «tutorial» y «vídeo» porque en aquel
  // momento ninguna de las tres existía. PE-02 construyó la ayuda y PE-03B3 el
  // tutorial de pantalla, así que nombrarlas hoy sería comprobar el calendario,
  // no la promesa.
  //
  // Lo que se comprueba ahora es lo que sí sigue siendo promesa: nada se
  // anuncia como futuro, y todo lo que la puerta ofrece existe de verdad.
  const codigo = PAGINA_CODIGO + TARJETAS_CODIGO;
  for (const p of ["Próximamente en Trazaloop", "muy pronto", "en desarrollo",
    "disponible pronto"]) {
    assert(!codigo.includes(p), `hay un marcador falso: «${p}»`);
  }
  // Y si ofrece el tutorial de pantalla, es porque el componente existe.
  if (/PageTutorialAction/.test(codigo)) {
    assert(existsSync("components/domain/tutorials/page-tutorial-action.tsx"),
      "la puerta ofrece un tutorial cuyo componente no existe");
  }
});

check("H4. Sin migración: PE-01B no añadió ninguna", () => {
  // La promesa es «PE-01B no tocó el esquema», y se comprueba diciendo eso:
  // que entre 0154 —la última de QUALITY-13— y hoy, ninguna migración lleva
  // el nombre de este tramo. Antes se comprobaba que la cabecera fuera 0154,
  // que es una fotografía: PE-02B1 la rompió sin cambiar nada de PE-01B.
  const migraciones = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  const mias = migraciones.filter((f) => /pe01|module_entry|modules_entry/i.test(f));
  assert(mias.length === 0, `PE-01B añadió migraciones: ${mias.join(", ")}`);
  assert(migraciones.some((f) => f.startsWith("0154")), "desapareció 0154");
});

check("H5. La entrada de PCR sigue existiendo, y es suya", () => {
  const cpr = COMMERCIAL_MODULES.find((m) => m.key === "cpr")!;
  assert(cpr.homePath === "/dashboard", "PCR perdió su entrada");
  assert(existsSync("app/(app)/(shell)/(cpr)/dashboard"), "la entrada de PCR no existe en disco");
  assert(resolveShellModuleForPath("/dashboard", null).key === "cpr",
    "la casa de PCR dejó de ser de PCR");
});

check("H6. Y todo módulo funcional declara una ruta que existe", () => {
  for (const m of COMMERCIAL_MODULES) {
    if (m.status !== "functional") {
      assert(m.homePath === null, `${m.key} es futuro y declara ruta`);
      continue;
    }
    assert(m.homePath, `${m.key} es funcional y no declara ruta`);
    assert(existsSync(`app/(app)/(shell)${m.homePath}`)
      || existsSync(`app/(app)/(shell)/(cpr)${m.homePath}`),
      `la ruta de ${m.key} no existe: ${m.homePath}`);
  }
});

check("H7. Un bloqueo se explica sin jerga también en las acciones", () => {
  const msg = moduleAccessDeniedMessage("Trazaloop Quality", "unavailable");
  assert(/no fue posible verificar/i.test(msg), `una acción bloqueada dice «${msg}»`);
  assert(!isEnterableState("unavailable"), "«no se sabe» concede entrada");
});

console.log(`\nPE-01B · puerta: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
