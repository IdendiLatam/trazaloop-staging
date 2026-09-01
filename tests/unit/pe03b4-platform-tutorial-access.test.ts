/**
 * Trazaloop · PE-03B4 · GAP 1 · Llegar a «Tutoriales» sin saberse la dirección.
 *
 * La revisión humana encontró que al entrar a una empresa se perdía el acceso a
 * la administración de tutoriales. Esta suite vigila las dos mitades del
 * arreglo y, sobre todo, la frontera: que un usuario normal de una empresa NO
 * vea ninguna herramienta de plataforma.
 *
 * Correr: npm run test:pe03b4-access
 */
import { readFileSync } from "node:fs";

import { PLATFORM_GROUP } from "../../lib/modules/registry";

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

const LAYOUT_PLATAFORMA = leer("app/(app)/platform/layout.tsx");
const PANEL_PLATAFORMA = leer("app/(app)/platform/page.tsx");
const LAYOUT_SHELL = leer("app/(app)/(shell)/layout.tsx");
const ENLACE = leer("components/domain/tutorials/platform-tutorials-link.tsx");
const NAV = leer("components/layout/nav.tsx");
const ACCION_PANTALLA = leer("components/domain/tutorials/page-tutorial-action.tsx");

console.log("\nPE-03B4 · El acceso a Tutoriales\n");

// ===========================================================================
console.log("A · En la consola de plataforma");
// ===========================================================================

check("A1. El menú de la consola nombra «Tutoriales»", () => {
  const codigo = sinComentarios(LAYOUT_PLATAFORMA);
  assert(/href="\/platform\/tutorials"/.test(codigo),
    "el menú de la consola de plataforma no enlaza a los tutoriales");
  assert(/>\s*Tutoriales\s*</.test(codigo), "el enlace no se llama «Tutoriales»");
});

check("A2. Y está junto a las otras consolas de contenido", () => {
  const codigo = sinComentarios(LAYOUT_PLATAFORMA);
  for (const otra of ["/platform/faq", "/platform/help", "/platform/legal"]) {
    assert(codigo.includes(`href="${otra}"`), `falta ${otra} en el menú`);
  }
  // Y no al final del todo, después de «Cerrar sesión» o del perfil: entre sus
  // iguales. Se comprueba comparando posiciones, no leyendo el orden a ojo.
  const pos = (h: string) => codigo.indexOf(`href="${h}"`);
  assert(pos("/platform/tutorials") < pos("/settings/profile"),
    "«Tutoriales» quedó después de las entradas de cuenta");
});

check("A3. El panel enseña sus destinos, no obliga a recordarlos", () => {
  const codigo = sinComentarios(PANEL_PLATAFORMA);
  assert(codigo.includes('href: "/platform/tutorials"'),
    "el panel de plataforma no ofrece los tutoriales");
  for (const otra of ["/platform/faq", "/platform/help", "/platform/legal"]) {
    assert(codigo.includes(`href: "${otra}"`), `el panel no ofrece ${otra}`);
  }
});

// ===========================================================================
console.log("\nB · Dentro de una empresa");
// ===========================================================================

check("B1. La barra superior del shell ofrece el acceso", () => {
  const codigo = sinComentarios(LAYOUT_SHELL);
  assert(/<PlatformTutorialsLink\s/.test(codigo),
    "el shell no ofrece el acceso a la administración de tutoriales");
});

check("B2. Y sigue estando también en el menú lateral", () => {
  // No se quita de donde estaba: se suma un sitio donde se ve. Quien ya sabía
  // buscarlo ahí no tiene que aprender nada nuevo.
  const enlace = PLATFORM_GROUP.items.find((i) => i.href === "/platform/tutorials");
  assert(enlace, "«Tutoriales» desapareció del grupo Plataforma del menú");
  assert(enlace.label === "Tutoriales", `el menú lo llama «${enlace.label}»`);
});

check("B3. El acceso es PERSISTENTE: vive en el layout, no en una pantalla", () => {
  // Si estuviera en una página concreta, desaparecería al navegar — que es
  // exactamente lo que se observó y lo que hay que impedir.
  assert(LAYOUT_SHELL.includes("PlatformTutorialsLink"),
    "el acceso no está en el layout del shell");
});

// ===========================================================================
console.log("\nC · La frontera: quién lo ve y quién no");
// ===========================================================================

check("C1. Sin papel de plataforma, el enlace NO se pinta", () => {
  const codigo = sinComentarios(ENLACE);
  assert(/if\s*\(!isStaff\)\s*return null/.test(codigo),
    "el enlace no se retira para quien no es personal de plataforma");
  // Ni oculto por CSS ni deshabilitado: no existe. Se busca la clase de
  // Tailwind y el atributo, no la palabra suelta: `aria-hidden` está en el
  // punto decorativo y no tiene nada que ver.
  assert(!/\bclassName="[^"]*\bhidden\b/.test(codigo) && !/\bdisabled\b/.test(codigo)
    && !/opacity-0/.test(codigo),
    "el enlace se esconde en vez de no pintarse");
});

check("C2. Y quien decide es el servidor, no el navegador", () => {
  const codigo = sinComentarios(LAYOUT_SHELL);
  assert(/isStaff=\{platformStatus\.isStaff\}/.test(codigo),
    "la condición no viene de checkPlatformStatus en el servidor");
  assert(/checkPlatformStatus\(\)/.test(codigo), "el shell no consulta el estado de plataforma");
  // Y no se decide por un rol de empresa, que es otra cosa.
  assert(!/membership|owner|admin_empresa/i.test(codigo.split("PlatformTutorialsLink")[0] ?? ""),
    "la condición mezcla el papel de empresa con el de plataforma");
});

check("C3. El grupo «Plataforma» del menú sigue siendo condicional", () => {
  const codigo = sinComentarios(NAV);
  assert(/showPlatform\s*\?/.test(codigo),
    "el grupo Plataforma dejó de ser condicional");
});

check("C4. La consola sigue exigiendo personal de plataforma", () => {
  const codigo = sinComentarios(LAYOUT_PLATAFORMA);
  assert(/requirePlatformStaff\(\)/.test(codigo),
    "la consola de plataforma dejó de exigir el papel");
  // El enlace nuevo no es una puerta: si alguien llega por la dirección sin
  // papel, el guard sigue estando.
});

// ===========================================================================
console.log("\nD · Son dos cosas distintas y se llaman distinto");
// ===========================================================================

check("D1. «Ver video tutorial» es consumir; «Tutoriales» es administrar", () => {
  assert(/Ver video tutorial/.test(ACCION_PANTALLA),
    "el botón de consumir cambió de nombre");
  assert(!/Ver video tutorial/.test(sinComentarios(ENLACE)),
    "el enlace de administrar usa el nombre del de consumir");
  assert(/>\s*Tutoriales\s*</.test(sinComentarios(ENLACE)),
    "el enlace de administrar no se llama «Tutoriales»");
});

check("D2. Un superadministrador ve los dos, y se distinguen", () => {
  const codigo = sinComentarios(LAYOUT_SHELL);
  assert(/<PageTutorialAction\s*\/>/.test(codigo), "falta el botón de la pantalla");
  assert(/<PlatformTutorialsLink\s/.test(codigo), "falta el acceso de administración");
  // Se distinguen a la vista: el de administración va marcado como herramienta
  // interna, para que quien acompaña a un cliente sepa que el cliente no lo ve.
  assert(/amber/.test(ENLACE), "el acceso de administración no se marca como interno");
});

check("D3. Y el de administrar no aparece en la puerta de módulos", () => {
  // La puerta la ve cualquiera. El acceso de plataforma va en el shell, donde
  // el servidor ya calculó el papel.
  const puerta = sinComentarios(leer("app/(app)/modules/page.tsx"));
  assert(!/PlatformTutorialsLink/.test(puerta),
    "la puerta de módulos ofrece la administración de tutoriales");
});

console.log(`\nPE-03B4 · acceso: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
