/**
 * Trazaloop Quality · QUALITY-01.1 · Pruebas puras y estáticas de los
 * hallazgos de la prueba humana.
 *
 *   B · Navegación: «Sistema» no puede sacar de Quality a PCR.
 *   G · Selector de módulos: Quality con acceso válido ofrece «Entrar».
 *   Más las fronteras de las piezas nuevas (documentos, enlace de invitación).
 *
 * Correr: npm run test:quality011
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  SHELL_MODULE_PARAM,
  SISTEMA_GROUP,
  QUALITY_SHELL_MODULE,
  CPR_SHELL_MODULE,
  TEXTILES_SHELL_MODULE,
  isShellModuleKey,
  moduleAwareHref,
  resolveShellModuleForPath,
} from "../../lib/modules/registry";
import {
  COMMERCIAL_MODULES,
  QUALITY_MODULE_CODE,
  getCommercialModuleByCode,
  isModuleKillSwitchActive,
  resolveModuleEntryHref,
} from "../../lib/modules/catalog";
import { resolveModuleAccess } from "../../lib/modules/access";
import { QUALITY_CATEGORY_LABEL, qualityCategoryLabel } from "../../lib/domain/quality-processes";
import { isEnterableState, DERIVED_STATE_LABEL } from "../../lib/modules/messages";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0113_quality_documents_and_position_lifecycle.sql";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nB · «Sistema» no puede sacar de Quality\n");

check("B1. Una ruta transversal CONSERVA el módulo desde el que se navega", () => {
  // El defecto: /team no lo reclama ningún módulo, CPR es el destino por
  // defecto, y la persona que entraba a «Equipo» desde Quality aparecía en el
  // shell de PCR sin haber pedido cambiar de módulo.
  for (const href of ["/team", "/settings/company", "/settings/profile", "/support"]) {
    assert(
      resolveShellModuleForPath(href).key === "cpr",
      `${href} no debería pertenecer a ningún módulo`
    );
    assert(
      resolveShellModuleForPath(href, "quality").key === "quality",
      `${href} debía conservar Quality`
    );
    assert(
      resolveShellModuleForPath(href, "textiles").key === "textiles",
      `${href} debía conservar Textiles`
    );
  }
});

check("B2. La RUTA manda sobre el parámetro: no se puede secuestrar un módulo", () => {
  assert(resolveShellModuleForPath("/textiles", "quality").key === "textiles",
    "un parámetro no debe robar una pantalla de Textiles");
  assert(resolveShellModuleForPath("/quality/processes", "textiles").key === "quality",
    "un parámetro no debe robar una pantalla de Quality");
  assert(resolveShellModuleForPath("/dashboard", "quality").key === "cpr",
    "el dashboard es de CPR: la ruta manda");
});

check("B3. Un valor de módulo inventado se ignora y se cae a CPR", () => {
  for (const raw of ["hacker", "", null, undefined, "QUALITY", "quality "]) {
    assert(!isShellModuleKey(raw), `${JSON.stringify(raw)} no debería ser una clave válida`);
    assert(resolveShellModuleForPath("/team", raw).key === "cpr",
      `${JSON.stringify(raw)} no debía activar ningún módulo`);
  }
  // Es un parámetro de PRESENTACIÓN: no concede acceso a nada. El guard de
  // cada namespace sigue siendo la barrera.
  assert(resolveShellModuleForPath("/team", "quality").key === "quality", "caso válido roto");
});

check("B4. Los enlaces transversales se decoran; los propios del módulo NO", () => {
  assert(moduleAwareHref("/team", "quality") === `/team?${SHELL_MODULE_PARAM}=quality`,
    "un enlace transversal debía llevar el módulo");
  assert(moduleAwareHref("/quality/processes", "quality") === "/quality/processes",
    "un enlace propio del módulo no debe decorarse");
  assert(moduleAwareHref("/textiles", "textiles") === "/textiles",
    "un enlace propio de Textiles no debe decorarse");
  // CPR es el destino por defecto: sus URLs quedan limpias y el
  // comportamiento anterior se conserva intacto.
  assert(moduleAwareHref("/team", "cpr") === "/team", "CPR no necesita marca");
  // Y si la URL ya trae parámetros, se añade sin romperla.
  assert(moduleAwareHref("/team?x=1", "quality") === `/team?x=1&${SHELL_MODULE_PARAM}=quality`,
    "el separador de parámetros es incorrecto");
});

check("B5. El grupo «Sistema» ya no incluye rutas exclusivas de un módulo", () => {
  // «Onboarding» vive bajo (cpr) y lo protege requireCprModule: en un menú
  // transversal era un enlace que, para una empresa sin PCR, devolvía al
  // selector de módulos.
  for (const item of SISTEMA_GROUP.items) {
    assert(
      resolveShellModuleForPath(item.href).key === "cpr" &&
        !item.href.startsWith("/textiles") &&
        !item.href.startsWith("/quality"),
      `${item.href} no es transversal`
    );
    const cprOnly = existsSync(join(ROOT, "app/(app)/(shell)/(cpr)", item.href.slice(1)));
    assert(!cprOnly, `${item.href} vive bajo (cpr): no puede estar en el grupo transversal`);
  }
  assert(!SISTEMA_GROUP.items.some((i) => i.href === "/onboarding"),
    "Onboarding debía salir del grupo transversal");
  assert(CPR_SHELL_MODULE.topLevel.some((i) => i.href === "/onboarding"),
    "Onboarding debía pasar a la navegación de CPR");
});

check("B6. La navegación y el encabezado resuelven el módulo con el parámetro", () => {
  const nav = stripTs(read("components/layout/nav.tsx"));
  assert(/useSearchParams/.test(nav), "la navegación debe leer el parámetro de módulo");
  assert(/moduleAwareHref/.test(nav), "los enlaces deben decorarse con el módulo activo");
  const badge = stripTs(read("components/layout/module-badge.tsx"));
  assert(/useSearchParams/.test(badge), "el encabezado debe conservar el módulo");
  assert(/SHELL_MODULE_PARAM/.test(badge), "el encabezado debe usar el parámetro canónico");
});

check("B7. Toda la navegación de Quality apunta dentro de Quality", () => {
  const links = [
    ...QUALITY_SHELL_MODULE.topLevel,
    ...QUALITY_SHELL_MODULE.groups.flatMap((g) => g.items),
  ];
  assert(links.length >= 5, `esperaba al menos 5 enlaces, hay ${links.length}`);
  for (const link of links) {
    assert(link.href.startsWith("/quality"), `enlace fuera del módulo: ${link.href}`);
    const segment = link.href === "/quality" ? "" : link.href.slice("/quality/".length);
    assert(existsSync(join(ROOT, "app/(app)/(shell)/quality", segment, "page.tsx")),
      `el enlace ${link.href} no tiene página`);
  }
  assert(QUALITY_SHELL_MODULE.groups.some((g) => g.items.some((i) => i.href === "/quality/documents")),
    "Documentos debe estar en la navegación de Quality");
});

check("B8. Ningún enlace de las pantallas de Quality sale a PCR", () => {
  const dir = join(ROOT, "components/domain/quality");
  const PERMITIDOS = ["/quality", "/trazadocs", "/modules"];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".tsx")) continue;
    const src = read(`components/domain/quality/${file}`);
    for (const m of src.matchAll(/href=\{?["'`](\/[^"'`$}]*)/g)) {
      const href = m[1];
      assert(
        PERMITIDOS.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`)),
        `${file} enlaza a ${href}, fuera de Quality`
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nG · Selector de módulos\n");

const QUALITY_MOD = getCommercialModuleByCode(QUALITY_MODULE_CODE)!;

check("G1. Quality FULL + habilitado + kill switch ON → «Entrar» a /quality", () => {
  const access = resolveModuleAccess({
    isFunctional: QUALITY_MOD.status === "functional",
    killSwitchActive: isModuleKillSwitchActive(QUALITY_MOD, { QUALITY_MODULE_ENABLED: "true" }),
    assignment: { enabled: true, accessMode: "full", accessExpiresAt: null },
    now: new Date("2026-08-20T12:00:00Z"),
  });
  assert(access.allowed && access.derivedState === "full", `estado inesperado: ${access.derivedState}`);
  assert(DERIVED_STATE_LABEL.full === "Plan Full", "la etiqueta visible cambió");
  assert(
    resolveModuleEntryHref({ mod: QUALITY_MOD, isEnterable: isEnterableState(access.derivedState) }) === "/quality",
    "la tarjeta no resuelve /quality"
  );
});

check("G2. Kill switch APAGADO → sin entrada", () => {
  const access = resolveModuleAccess({
    isFunctional: true,
    killSwitchActive: isModuleKillSwitchActive(QUALITY_MOD, {}),
    assignment: { enabled: true, accessMode: "full", accessExpiresAt: null },
    now: new Date("2026-08-20T12:00:00Z"),
  });
  assert(!access.allowed, "el switch apagado debía bloquear");
  assert(
    resolveModuleEntryHref({ mod: QUALITY_MOD, isEnterable: isEnterableState(access.derivedState) }) === null,
    "no debía haber enlace"
  );
});

check("G3. PCR y Textiles conservan su entrada", () => {
  assert(resolveModuleEntryHref({ mod: TEXTILES_SHELL_MODULE, isEnterable: true }) === "/textiles",
    "Textiles perdió su entrada");
  const cpr = getCommercialModuleByCode("traceability_6632")!;
  assert(resolveModuleEntryHref({ mod: cpr, isEnterable: true, runtimeHref: "/select-org" }) === "/select-org",
    "el destino de CPR resuelto en servidor debe respetarse");
});

check("G4. Todo módulo funcional declara ruta y su página existe", () => {
  const rutas: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const grupo = e.name.startsWith("(") && e.name.endsWith(")");
        walk(join(dir, e.name), grupo ? url : `${url}/${e.name}`);
      } else if (e.name === "page.tsx") rutas.push(url === "" ? "/" : url);
    }
  };
  walk(join(ROOT, "app"), "");
  for (const mod of COMMERCIAL_MODULES) {
    if (mod.status !== "functional") continue;
    assert(mod.homePath, `${mod.key} es funcional y debe declarar ruta`);
    assert(rutas.includes(mod.homePath!), `la ruta ${mod.homePath} de ${mod.key} no existe`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nDocumentos de Quality · fronteras\n");

check("E1. No se creó una segunda tabla de documentos", () => {
  // El principio no negociable: Quality tiene experiencia documental propia,
  // pero TrazaDocs sigue siendo el ÚNICO motor documental.
  const sql = stripSql(read(MIG));
  assert(!/create table\s+public\.quality_documents/.test(sql), "no debe existir quality_documents");
  assert(!/create table/i.test(sql), "0113 no debería crear ninguna tabla");
  assert(/trazadoc_documents_module_key_check/.test(sql), "debe ampliar el módulo de TrazaDocs");
  for (const m of ["cpr", "textiles", "quality"]) {
    assert(new RegExp(`'${m}'`).test(sql), `la restricción debe admitir ${m}`);
  }
});

check("E2. La capa de datos de Quality REUTILIZA el motor, no lo reimplementa", () => {
  const src = read("lib/db/quality-documents.ts");
  assert(src.startsWith('import "server-only";'), "debe ser server-only");
  assert(/from "@\/lib\/db\/trazadocs"/.test(src), "debe apoyarse en el motor TrazaDocs");
  assert(!src.includes("createAdminClient"), "jamás service_role");
  assert(/QUALITY_DOC_MODULE = "quality"/.test(src), "debe fijar el módulo en servidor");
});

check("E3. TODA action de documentos pasa por la guarda de Quality", () => {
  const src = stripTs(read("server/actions/quality-documents.ts"));
  assert(src.startsWith('"use server";'), "deben ser server actions");
  assert(!src.includes("createAdminClient"), "jamás service_role");
  assert(/requireQualityForAction/.test(src), "la guarda debe ser la de Quality");
  // Ninguna toca la guarda de CPR: una empresa quality-only debe poder operar.
  assert(!/requireCprModule|requireCprForAction/.test(src), "no debe depender de PCR");
  assert(!/requireTextiles/.test(src), "no debe depender de Textiles");

  const actions = [...src.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
  assert(actions.length >= 5, `esperaba al menos 5 actions, hay ${actions.length}`);
  for (const name of actions) {
    const start = src.indexOf(`export async function ${name}(`);
    const body = src.slice(start, start + 900);
    const propio = /const g = await gate\(\);/.test(body);
    const delegado = /return changeStatus\(/.test(body);
    assert(propio || delegado, `la action ${name} no invoca la guarda`);
  }
  // El módulo se fija en servidor; el cliente no lo envía nunca.
  assert(!/formData\.get\("module_key"\)/.test(src), "el módulo jamás viene del cliente");
  assert(/module_key: QUALITY_DOC_MODULE/.test(src), "el módulo debe fijarse en el insert");
});

check("E4. El editor de secciones se REUTILIZA, no se reescribe", () => {
  const detail = read("components/domain/quality/document-detail.tsx");
  assert(/from "@\/components\/domain\/trazadocs\/section-editor"/.test(detail),
    "debe reutilizar SectionEditor del motor");
  assert(/from "@\/components\/domain\/trazadocs\/document-status-badge"/.test(detail),
    "debe reutilizar el distintivo de estado");
  assert(!/<textarea/.test(detail), "no debe reimplementar el campo de edición de secciones");
});

check("E5. La lista separa documentos PROPIOS de VINCULADOS", () => {
  const view = read("components/domain/quality/documents-view.tsx");
  assert(/Documentos de Quality/.test(view), "falta la sección de documentos propios");
  assert(/Documentos vinculados/.test(view), "falta la sección de vinculados");
  assert(/Origen:/.test(view), "un documento vinculado debe mostrar su módulo de origen");
  // El texto de la pantalla se parte en varias líneas al escribirse en JSX.
  assert(/no se copian/i.test(view.replace(/\s+/g, " ")),
    "debe explicarse que vincular no duplica");
});

check("D1. Las etiquetas del dominio y los nombres de la BD dicen lo MISMO", () => {
  // Dos fuentes para el mismo nombre terminan divergiendo: el dominio decía
  // «De apoyo» y «De gestión del sistema» mientras la base decía «Apoyo» y
  // «Sistema», así que la misma categoría se llamaba distinto según la
  // pantalla. 0113 dejó las CONGELADAS en la base; aquí se comprueba que el
  // mapa del dominio coincida exactamente.
  const sql = stripSql(read(MIG));
  const esperado: Record<string, string> = {
    strategic: "Estratégicos", core: "Misionales", support: "Apoyo", system: "Sistema",
  };
  for (const [code, name] of Object.entries(esperado)) {
    assert(QUALITY_CATEGORY_LABEL[code] === name,
      `el dominio llama «${QUALITY_CATEGORY_LABEL[code]}» a ${code}, debía ser «${name}»`);
    assert(new RegExp(`set name = '${name}'[\\s\\S]{0,120}code = '${code}'`).test(sql),
      `0113 debe fijar el nombre «${name}» para ${code}`);
  }
  assert(qualityCategoryLabel("support") === "Apoyo", "la función de etiqueta no sigue el mapa");
});

check("D2. El trigger del catálogo base sigue bloqueando a los roles cliente", () => {
  const sql = stripSql(read(MIG));
  assert(/current_user in \('anon', 'authenticated'\)/.test(sql),
    "el trigger debe seguir bloqueando a los roles cliente");
  assert(/organization_id is null/.test(sql), "solo debe proteger el catálogo GLOBAL");
  // No se desactiva el trigger: eso abriría una ventana sin vigilancia.
  assert(!/disable trigger/i.test(sql), "no debe desactivarse el trigger para mantener los datos");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nInvitaciones · fronteras\n");

check("C1. El enlace de invitación se construye con el origen REAL", () => {
  const src = read("lib/auth/invitation-link.ts");
  assert(src.startsWith('import "server-only";'), "debe ser server-only");
  assert(/x-forwarded-host/.test(src), "debe preferir el origen de la petición");
  assert(/NEXT_PUBLIC_SITE_URL/.test(src), "debe conservar la variable como respaldo");
  // El orden importa, y se comprueba sobre el CÓDIGO: la prosa que lo explica
  // menciona la variable antes, y eso no dice nada sobre la precedencia real.
  const code = stripTs(src);
  assert(
    code.indexOf("x-forwarded-host") < code.indexOf("NEXT_PUBLIC_SITE_URL"),
    "la variable no puede tener prioridad sobre el origen real"
  );
  const action = stripTs(read("server/actions/team.ts"));
  assert(/buildInvitationLink/.test(action), "la action debe usar el constructor");
  assert(!/\$\{site\}\/accept-invite/.test(action), "quedó la construcción antigua del enlace");
});

check("C2. El enlace sigue disponible en cada invitación pendiente", () => {
  const list = read("components/domain/team/invitation-list.tsx");
  assert(/accept-invite\?token=/.test(list), "la lista debe mostrar el enlace con su token");
  assert(/appOrigin/.test(list), "el origen debe llegar resuelto desde el servidor");
  assert(/Copiar/.test(list), "debe poder copiarse");
  // Solo para invitaciones pendientes y solo para quien administra.
  assert(/inv\.status === "pending" && canManage/.test(list),
    "el enlace solo debe mostrarse en invitaciones pendientes y a quien administra");
  const page = read("app/(app)/(shell)/team/page.tsx");
  assert(/resolveAppOrigin/.test(page), "la página debe resolver el origen en servidor");
});

check("C3. Aceptar una invitación usa el plan VIGENTE, no la copia heredada", () => {
  const sql = stripSql(read(MIG));
  assert(/create or replace function public\.accept_team_invitation/.test(sql),
    "0113 debe reemplazar la función de aceptación");
  assert(/organization_effective_plan_code\(v_inv\.organization_id\)/.test(sql),
    "el plan debe salir del acceso por módulos");
  // La lectura del plan heredado desaparece; el ESTADO comercial sí sigue
  // viniendo de organization_subscriptions, que es donde vive.
  assert(!/select coalesce\(plan_code, 'demo'\)/.test(sql),
    "quedó la lectura del plan heredado");
  assert(/coalesce\(status, 'active'\)/.test(sql), "el estado comercial debe seguir comprobándose");
  // Y ya no se intenta persistir un estado que la excepción va a revertir.
  assert(!/update team_invitations set status = 'expired'/.test(sql),
    "no debe escribirse un estado que el raise deshace");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nMigración 0113 · convenciones\n");

check("M1. Append-only tras 0112 y sin privilegios implícitos", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const numbers = files.map((f) => Number(f.slice(0, 4))).sort((a, b) => a - b);
  // QUALITY-01.2 · La exigencia es que 0113 exista, que no se renumere nada y
  // que la cola NO retroceda — no que 113 sea para siempre la última: el
  // repositorio es append-only y cada sprint añade la suya (mismo criterio que
  // la prueba equivalente de QUALITY-01).
  assert(numbers.includes(113), "0113 debe existir");
  assert(Math.max(...numbers) >= 113, `la cola de migraciones retrocedió a ${Math.max(...numbers)}`);
  assert(new Set(numbers).size === numbers.length, "hay prefijos duplicados");

  const sql = stripSql(read(MIG));
  assert(!/grant all/i.test(sql), "jamás GRANT ALL");
  assert(!/alter default privileges/i.test(sql), "jamás ALTER DEFAULT PRIVILEGES");
  assert(/revoke all on table public\.quality_positions from anon;/.test(sql),
    "anon no debe conservar privilegios");
  assert(/revoke truncate, references, trigger on table/.test(sql),
    "deben revocarse los privilegios peligrosos");
});

check("M2. La política de DELETE de cargos exige rol, y las FK siguen protegiendo", () => {
  const sql = stripSql(read(MIG));
  assert(/create policy quality_positions_delete/.test(sql), "falta la política de borrado");
  assert(/has_org_role\(organization_id, array\['admin','quality'\]\)/.test(sql),
    "el borrado debe exigir admin o quality");
  // No se relaja ninguna FK: son ellas las que impiden borrar lo que tiene
  // historial. La política solo permite que la operación llegue a la base.
  assert(!/on delete cascade/i.test(sql), "0113 no debe cambiar ninguna clave foránea a cascade");
  assert(!/drop constraint if exists quality_processes_owner_position_fk/.test(sql),
    "0113 no debe tocar la FK que protege la propiedad de los procesos");
});

console.log(`\nQUALITY-01.1 unit/estático: ${passed} ✔, ${failed} ✘\n`);
process.exit(failed === 0 ? 0 : 1);
