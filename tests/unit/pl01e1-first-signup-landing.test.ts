/**
 * Trazaloop · PROD-LAUNCH-01E.1 · Una empresa nueva elige módulo antes que nada.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * El primer registro real, ya con el correo de confirmación arreglado, entró
 * autenticado y aterrizó **dentro de PCR** — con su barra lateral y su
 * distintivo de módulo— antes de que la empresa hubiera elegido nada. Ni
 * siquiera había visto que Trazaloop tiene tres módulos.
 *
 *
 * LA CAUSA, QUE NO ERA UNA REGLA DE «MÓDULO POR OMISIÓN»
 *
 * Al crear la empresa se redirigía a `/onboarding`, y esa ruta vive dentro del
 * grupo `(cpr)`. La razón original (Sprint 10D) era buena —«nadie empieza
 * confundido sin saber qué hacer primero»— y se escribió cuando PCR era el
 * ÚNICO módulo: entonces esa ruta era el producto. Hoy es la puesta en marcha
 * DE PCR.
 *
 * No hubo que inventar regla: QUALITY-01.2 ya había movido *seleccionar*
 * empresa a `MODULE_SELECTOR_PATH` por ser una operación transversal. Crear
 * una lo es más todavía. Esta batería defiende que las cuatro entradas
 * transversales terminen en el mismo sitio, y que las que tienen intención
 * propia no se muevan.
 *
 * Correr: npm run test:pl01e1
 */
import { readFileSync } from "node:fs";
import {
  MODULE_SELECTOR_PATH, postAuthDestinationPath, resolvePostAuthDestination,
  resolveAcceptInviteDestination, isSafeAcceptInviteNext,
} from "../../lib/domain/team";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");

const ORGS = sinComentarios(leer("server/actions/organizations.ts"));

console.log("\nA · La empresa recién creada va al selector de módulos");
// ===========================================================================

check("Crear empresa termina en la selección de módulos", () => {
  const i = ORGS.indexOf("export async function createOrganizationAction");
  assert(i > 0, "desapareció la creación de empresa");
  const cuerpo = ORGS.slice(i, ORGS.indexOf("export async function", i + 10));
  assert(/redirect\(MODULE_SELECTOR_PATH\)/.test(cuerpo),
    "crear una empresa no lleva al selector de módulos");
  assert(!/redirect\("\/onboarding"\)/.test(cuerpo),
    "sigue entrando en la puesta en marcha de PCR sin haber elegido módulo");
});

check("Y NUNCA entra en un módulo concreto solo porque exista", () => {
  const i = ORGS.indexOf("export async function createOrganizationAction");
  const cuerpo = ORGS.slice(i, ORGS.indexOf("export async function", i + 10));
  for (const modulo of ["/dashboard", "/onboarding", "/quality", "/textiles",
                        "/traceability", "traceability_6632", "/catalog"]) {
    assert(!cuerpo.includes(`redirect("${modulo}`),
      `crear empresa entra directamente en «${modulo}»`);
  }
});

check("Se usa la constante canónica, no la cadena a mano", () => {
  assert(MODULE_SELECTOR_PATH === "/modules",
    `la ruta canónica del selector es «${MODULE_SELECTOR_PATH}»`);
  const i = ORGS.indexOf("export async function createOrganizationAction");
  const cuerpo = ORGS.slice(i, ORGS.indexOf("export async function", i + 10));
  assert(!/redirect\("\/modules"\)/.test(cuerpo),
    "se escribió «/modules» a mano en vez de usar la constante");
});

console.log("\nB · Las cuatro entradas transversales coinciden");
// ===========================================================================

check("Login, selección, creación y aceptación de invitación", () => {
  // Login: el destino canónico de quien no tiene empresa resuelta.
  assert(postAuthDestinationPath({ kind: "create-org" }) === MODULE_SELECTOR_PATH,
    "tras el login, quien no tiene empresa no va al selector");
  assert(postAuthDestinationPath({ kind: "select-org" }) === MODULE_SELECTOR_PATH,
    "tras el login, quien tiene varias no va al selector");
  // Aceptar invitación: sin destino declarado, el selector.
  assert(resolveAcceptInviteDestination({ enterableModuleHomePaths: [] })
    === MODULE_SELECTOR_PATH, "aceptar una invitación no lleva al selector");
  // Seleccionar empresa existente (QUALITY-01.2, ya estaba).
  const i = ORGS.indexOf("export async function selectActiveOrganizationAction");
  const cuerpo = ORGS.slice(i);
  assert(/redirect\(MODULE_SELECTOR_PATH\)/.test(cuerpo),
    "seleccionar empresa dejó de llevar al selector");
});

console.log("\nC · Lo que NO se toca");
// ===========================================================================

const CALLBACK = sinComentarios(leer("app/auth/callback/route.ts"));

check("El login de quien YA tiene empresa no cambia", () => {
  // Con empresa activa resuelta, el destino sigue siendo el de siempre: no se
  // obliga a nadie a pasar por el selector en cada acceso.
  const d = resolvePostAuthDestination({
    hasResolvedActiveOrg: true, membershipCount: 1, pendingInvitationTokens: [] });
  assert(d.kind === "dashboard", `resolvió «${d.kind}»`);
  const unaSola = resolvePostAuthDestination({
    hasResolvedActiveOrg: false, membershipCount: 1, pendingInvitationTokens: [] });
  assert(unaSola.kind === "dashboard",
    "quien tiene una sola empresa dejó de entrar directo");
});

check("La recuperación de contraseña sigue igual", () => {
  assert(/next === "\/reset-password"/.test(CALLBACK),
    "desapareció el reconocimiento de la recuperación");
  assert(/redirect\(new URL\("\/reset-password", url\.origin\)\)/.test(CALLBACK),
    "la recuperación ya no lleva a poner la contraseña nueva");
  assert(/forgot-password/.test(CALLBACK),
    "un enlace roto ya no vuelve a pedirse");
});

check("Y el flujo de invitación conserva su intención propia", () => {
  assert(isSafeAcceptInviteNext("/accept-invite?token=abc"),
    "dejó de admitirse el destino de invitación");
  assert(!isSafeAcceptInviteNext("//malicioso.example"),
    "se admite un destino externo");
  const d = resolvePostAuthDestination({
    hasResolvedActiveOrg: false, membershipCount: 0, pendingInvitationTokens: ["t1"] });
  assert(d.kind === "accept-invite",
    "una invitación pendiente dejó de tener destino propio");
  assert(postAuthDestinationPath(d).startsWith("/accept-invite"),
    "la invitación ya no lleva a aceptarla");
  // Y un `returnTo` a un módulo entrable se respeta: esa intención es suya.
  assert(resolveAcceptInviteDestination({
    returnTo: "/quality", enterableModuleHomePaths: ["/quality"] }) === "/quality",
    "aceptar una invitación perdió su destino declarado");
});

check("La puesta en marcha de PCR sigue alcanzable desde PCR", () => {
  const registro = leer("lib/modules/registry.ts");
  assert(/href: "\/onboarding"/.test(registro),
    "se perdió la entrada a la puesta en marcha en la navegación de PCR");
});

console.log(`\nPROD-LAUNCH-01E.1 · primer aterrizaje: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
