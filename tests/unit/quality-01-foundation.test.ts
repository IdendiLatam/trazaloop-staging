/**
 * Trazaloop Quality · QUALITY-01 · Pruebas PURAS y estáticas de la fundación.
 *
 * Sin BD y sin red: reglas de dominio, kill switch, catálogo, convenciones de
 * la migración 0112 y fronteras de capa. Complementa a:
 *   · tests/rls/quality-01-process-foundation.test.ts  (BD real, 54 comprobaciones)
 *   · tests/e2e/quality-01-walkthrough.test.ts         (HTTP autenticado)
 *
 * Correr: npm run test:quality01
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  QUALITY_MODULE_KEY,
  QUALITY_FLAG_ENV,
  QUALITY_HOME_PATH,
  isQualityFlagEnabled,
  organizationHasQuality,
  canAccessQualityModule,
  resolveQualityAvailability,
} from "../../lib/modules/quality";
import {
  COMMERCIAL_MODULES,
  QUALITY_MODULE_CODE,
  getCommercialModuleByCode,
  isFunctionalModuleCode,
  isKillSwitchFlagEnabled,
  isModuleKillSwitchActive,
} from "../../lib/modules/catalog";
import {
  QUALITY_SHELL_MODULE,
  SHELL_MODULES,
  resolveShellModuleForPath,
} from "../../lib/modules/registry";
import {
  QUALITY_BASE_CATEGORY_CODES,
  QUALITY_CATEGORY_UI_ORDER,
  canEditRevision,
  canManagePositions,
  canPublishMap,
  canPublishQuality,
  findEffectiveAt,
  groupMapNodesByCategory,
  isEffectiveOn,
  qualityCategoryLabel,
  splitInteractions,
  validateIsoDate,
  validateOptionalUuid,
  validateQualityCode,
  validateQualityName,
  validateUuid,
} from "../../lib/domain/quality-processes";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Código sin comentarios: una prohibición se comprueba sobre lo que se
 *  EJECUTA, no sobre la prosa que explica precisamente esa prohibición. */
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ---------------------------------------------------------------------------
console.log("\nQUALITY-01 · kill switch y catálogo\n");

check("1. El kill switch está APAGADO por defecto y solo lo encienden true/1", () => {
  for (const on of ["true", "1"]) assert(isQualityFlagEnabled(on), `"${on}" debía encender`);
  for (const off of [undefined, null, "", "false", "0", "yes", "TRUE", "True", " true"]) {
    assert(!isQualityFlagEnabled(off), `${JSON.stringify(off)} NO debía encender`);
  }
});

check("2. La variable del kill switch NO se expone al navegador", () => {
  assert(!QUALITY_FLAG_ENV.startsWith("NEXT_PUBLIC_"), "el switch jamás lleva prefijo público");
  assert(QUALITY_FLAG_ENV === "QUALITY_MODULE_ENABLED", "el nombre del switch cambió");
  // Y no aparece en ningún componente de cliente: ocultar un botón no es la
  // barrera, y una variable así en el bundle sería informar de su existencia.
  for (const f of ["components/domain/quality/positions-manager.tsx",
                   "components/domain/quality/process-list.tsx",
                   "components/domain/quality/process-detail.tsx",
                   "components/domain/quality/map-view.tsx"]) {
    assert(!read(f).includes(QUALITY_FLAG_ENV), `${f} no debe conocer el kill switch`);
  }
});

check("3. TODO módulo con kill switch declarado se resuelve por su variable", () => {
  // Regresión de QUALITY-01: la resolución estaba escrita a mano y solo
  // contemplaba Textiles, de modo que Quality quedaba denegado en silencio
  // aunque su variable estuviera encendida. Ahora se resuelve por catálogo.
  for (const mod of COMMERCIAL_MODULES) {
    if (mod.killSwitchEnv === null) {
      assert(isModuleKillSwitchActive(mod, {}), `${mod.key} sin switch debía estar siempre activo`);
      continue;
    }
    assert(isModuleKillSwitchActive(mod, { [mod.killSwitchEnv]: "true" }), `${mod.key} debía encenderse con su variable`);
    assert(!isModuleKillSwitchActive(mod, { [mod.killSwitchEnv]: "false" }), `${mod.key} debía apagarse con su variable`);
    assert(!isModuleKillSwitchActive(mod, {}), `${mod.key} debía estar apagado sin su variable`);
    // Encender OTRA variable no debe encender este módulo.
    assert(!isModuleKillSwitchActive(mod, { OTRA_VARIABLE: "true" }), `${mod.key} se encendió con una variable ajena`);
  }
});

check("4. La regla del switch es la misma para todos los módulos", () => {
  for (const raw of ["true", "1", "false", "", undefined, "yes"]) {
    assert(isKillSwitchFlagEnabled(raw) === isQualityFlagEnabled(raw), `divergen para ${JSON.stringify(raw)}`);
  }
});

check("5. La capa de acceso ya no codifica a mano el nombre de cada variable", () => {
  const src = read("lib/db/module-access.ts");
  assert(src.includes("isModuleKillSwitchActive"), "debe delegar en el catálogo");
  assert(!/killSwitchEnv === "TEXTILES_MODULE_ENABLED"/.test(src), "quedó la comparación literal por nombre de variable");
  assert(!/killSwitchEnv === "QUALITY_MODULE_ENABLED"/.test(src), "no se debe volver a codificar módulo por módulo");
});

check("6. Quality es un módulo comercial funcional con su propio switch", () => {
  const mod = getCommercialModuleByCode(QUALITY_MODULE_CODE);
  assert(mod !== null, "quality debe estar en el catálogo comercial");
  assert(mod!.status === "functional", "quality debe ser functional");
  assert(mod!.killSwitchEnv === QUALITY_FLAG_ENV, "quality debe declarar su kill switch");
  assert(isFunctionalModuleCode(QUALITY_MODULE_CODE), "quality debe ser asignable");
  assert(QUALITY_MODULE_KEY === "quality" && QUALITY_MODULE_CODE === "quality", "la clave oficial es 'quality'");
});

check("7. La habilitación por empresa y la regla combinada", () => {
  const withQ = [{ code: "quality", enabled: true }];
  const disabled = [{ code: "quality", enabled: false }];
  assert(organizationHasQuality(withQ), "empresa con quality habilitado");
  assert(!organizationHasQuality(disabled), "quality deshabilitado no cuenta");
  assert(!organizationHasQuality([{ code: "textiles", enabled: true }]), "otro módulo no habilita quality");
  // El switch manda sobre la asignación, nunca al revés.
  assert(!canAccessQualityModule("false", withQ), "el switch apagado anula la asignación");
  assert(!canAccessQualityModule("true", disabled), "la asignación deshabilitada no se salva con el switch");
  assert(canAccessQualityModule("true", withQ), "switch + asignación debía permitir");
});

check("8. Los estados de la tarjeta del selector cubren los cuatro casos", () => {
  const withQ = [{ code: "quality", enabled: true }];
  assert(resolveQualityAvailability({ flagRaw: "false", hasActiveOrg: true, modules: withQ }) === "flag_disabled", "switch apagado");
  assert(resolveQualityAvailability({ flagRaw: "true", hasActiveOrg: false, modules: withQ }) === "no_active_org", "sin empresa activa");
  assert(resolveQualityAvailability({ flagRaw: "true", hasActiveOrg: true, modules: [] }) === "org_not_enabled", "empresa sin asignación");
  assert(resolveQualityAvailability({ flagRaw: "true", hasActiveOrg: true, modules: withQ }) === "available", "disponible");
});

// ---------------------------------------------------------------------------
console.log("\nQUALITY-01 · registro del shell\n");

check("9. El módulo del shell reclama /quality y solo /quality", () => {
  assert(QUALITY_SHELL_MODULE.homePath === QUALITY_HOME_PATH, "la ruta de inicio debe coincidir");
  assert(resolveShellModuleForPath("/quality").key === "quality", "/quality activa Quality");
  assert(resolveShellModuleForPath("/quality/processes/abc").key === "quality", "una subruta activa Quality");
  // Coincidencia por prefijo ESTRICTA: nunca por subcadena.
  assert(resolveShellModuleForPath("/quality-x").key !== "quality", "/quality-x no debe activar Quality");
  assert(resolveShellModuleForPath("/textiles").key === "textiles", "no debe robar rutas de Textiles");
  assert(resolveShellModuleForPath("/dashboard").key === "cpr", "el módulo por defecto sigue siendo CPR");
});

check("10. La navegación de Quality apunta a rutas que existen", () => {
  const links = [...QUALITY_SHELL_MODULE.topLevel, ...QUALITY_SHELL_MODULE.groups.flatMap((g) => g.items)];
  assert(links.length >= 4, "el módulo debe ofrecer navegación");
  for (const link of links) {
    assert(link.href.startsWith("/quality"), `enlace fuera del módulo: ${link.href}`);
    const segment = link.href === "/quality" ? "" : link.href.slice("/quality/".length);
    const page = join(ROOT, "app/(app)/(shell)/quality", segment, "page.tsx");
    assert(existsSync(page), `el enlace ${link.href} no tiene página (${page})`);
  }
});

check("11. CPR sigue siendo el último del registro (módulo por defecto)", () => {
  assert(SHELL_MODULES[SHELL_MODULES.length - 1].key === "cpr", "CPR debe cerrar el registro");
  assert(SHELL_MODULES.some((m) => m.key === "quality"), "Quality debe estar registrado");
});

// ---------------------------------------------------------------------------
console.log("\nQUALITY-01 · dominio puro\n");

check("12. Las cuatro categorías base y su orden de lectura", () => {
  assert(QUALITY_BASE_CATEGORY_CODES.length === 4, "deben ser cuatro categorías base");
  assert(QUALITY_CATEGORY_UI_ORDER.join(",") === "strategic,core,support,system", "el orden de lectura cambió");
  assert(qualityCategoryLabel("core") === "Misionales", "etiqueta de misionales");
  assert(qualityCategoryLabel("inventada") === "inventada", "una categoría propia se muestra por su código");
  assert(qualityCategoryLabel(null) === "Sin categoría", "sin categoría debe tener texto");
});

check("13. Vigencia: el día de cierre pertenece YA a la versión siguiente", () => {
  const r1 = { effectiveFrom: "2026-02-01", effectiveTo: "2026-03-01" };
  const r2 = { effectiveFrom: "2026-03-01", effectiveTo: null };
  assert(isEffectiveOn(r1, "2026-02-15"), "el 15/02 regía la primera");
  assert(!isEffectiveOn(r1, "2026-03-01"), "el 01/03 la primera ya NO rige");
  assert(isEffectiveOn(r2, "2026-03-01"), "el 01/03 rige la segunda");
  assert(!isEffectiveOn(r2, "2026-02-28"), "la segunda no rige antes de empezar");
  // Nunca dos vigentes el mismo día: es lo que hace respondible "qué regía el X".
  for (const day of ["2026-02-01", "2026-02-28", "2026-03-01", "2027-01-01"]) {
    const vigentes = [r1, r2].filter((r) => isEffectiveOn(r, day));
    assert(vigentes.length === 1, `el ${day} había ${vigentes.length} versiones vigentes`);
  }
  assert(findEffectiveAt([r1, r2], "2026-02-15") === r1, "findEffectiveAt devolvió la equivocada");
  assert(findEffectiveAt([r1, r2], "2026-01-01") === null, "antes de la primera no rige ninguna");
});

check("14. Solo el borrador es editable", () => {
  assert(canEditRevision("draft"), "el borrador se edita");
  for (const s of ["published", "superseded", null, undefined, "", "DRAFT"]) {
    assert(!canEditRevision(s), `${JSON.stringify(s)} NO debía ser editable`);
  }
});

check("15. Publicar es de admin/quality; editar admite consultant", () => {
  assert(canPublishQuality("admin") && canPublishQuality("quality"), "admin y quality publican");
  assert(!canPublishQuality("consultant"), "un consultant no publica");
  assert(!canPublishQuality(null) && !canPublishQuality("otro"), "un rol desconocido no publica");
  assert(canManagePositions("admin") && canManagePositions("quality"), "admin y quality gestionan cargos");
  assert(!canManagePositions("consultant"), "un consultant no gestiona cargos");
});

check("16. Un mapa vacío no se publica", () => {
  assert(!canPublishMap(0).ok, "un mapa sin procesos no debe publicarse");
  assert(canPublishMap(0).error !== null, "debe explicarse por qué");
  assert(canPublishMap(1).ok, "con un proceso ya se puede publicar");
});

check("17. El mapa agrupa por categoría en el orden de lectura, sin perder las propias", () => {
  const nodes = [
    { processId: "d", processName: "Compras", categoryCode: "support", sortOrder: 1 },
    { processId: "a", processName: "Dirección", categoryCode: "strategic", sortOrder: 1 },
    { processId: "c", processName: "Producción", categoryCode: "core", sortOrder: 2 },
    { processId: "b", processName: "Diseño", categoryCode: "core", sortOrder: 1 },
    { processId: "e", processName: "Innovación", categoryCode: "propia_empresa", sortOrder: 1 },
  ];
  const bands = groupMapNodesByCategory(nodes);
  assert(
    bands.map((b) => b.categoryCode).join(",") === "strategic,core,support,propia_empresa",
    `orden inesperado: ${bands.map((b) => b.categoryCode).join(",")}`
  );
  const core = bands.find((b) => b.categoryCode === "core")!;
  assert(core.nodes.map((n) => n.processName).join(",") === "Diseño,Producción", "los bloques deben ir por sort_order");
  // Una categoría propia de la empresa NO desaparece del mapa por no ser base.
  assert(bands.some((b) => b.categoryCode === "propia_empresa"), "se perdió una categoría propia");
  // Y no se inventan bandas vacías.
  assert(bands.every((b) => b.nodes.length > 0), "hay bandas sin procesos");
  assert(groupMapNodesByCategory([]).length === 0, "un mapa vacío no tiene bandas");
});

check("18. Las interacciones se leen desde ambos extremos", () => {
  const i = {
    id: "1", sourceProcessId: "p1", sourceProcessName: "A",
    targetProcessId: "p2", targetProcessName: "B",
    informationItem: "Informe", description: null,
  };
  const fromSource = splitInteractions("p1", [i]);
  assert(fromSource.outgoing.length === 1 && fromSource.incoming.length === 0, "desde el origen es una salida");
  const fromTarget = splitInteractions("p2", [i]);
  assert(fromTarget.incoming.length === 1 && fromTarget.outgoing.length === 0, "desde el destino es una entrada");
  const other = splitInteractions("p3", [i]);
  assert(other.incoming.length === 0 && other.outgoing.length === 0, "un tercero no la ve como suya");
});

check("19. Validación de entrada antes de tocar la BD", () => {
  assert(validateQualityName("  ").error !== null, "un nombre en blanco se rechaza");
  assert(validateQualityName("x".repeat(161)).error !== null, "un nombre larguísimo se rechaza");
  assert(validateQualityName("  Dirección  ").value === "Dirección", "el nombre se recorta");
  assert(validateQualityCode("").value === null && validateQualityCode("").error === null, "el código es opcional");
  assert(validateUuid("no-es-uuid").error !== null, "un identificador falso se rechaza");
  assert(validateUuid("3f219514-3c2d-48f2-a8b2-7f570896f899").error === null, "un uuid válido se acepta");
  assert(validateOptionalUuid("").value === null, "«sin asignar» es válido");
  assert(validateOptionalUuid("basura").error !== null, "basura no es «sin asignar»");
  assert(validateIsoDate("2026-13-01").error !== null, "un mes 13 se rechaza");
  assert(validateIsoDate("01/03/2026").error !== null, "otro formato de fecha se rechaza");
  assert(validateIsoDate("2026-03-01").value === "2026-03-01", "una fecha ISO se acepta");
  assert(validateIsoDate("").value === null && validateIsoDate("").error === null, "la fecha es opcional");
});

// ---------------------------------------------------------------------------
console.log("\nQUALITY-01 · fronteras de capa\n");

check("20. El dominio de Quality es PURO (sin BD, sin React, sin Next, sin env)", () => {
  const src = stripTs(read("lib/domain/quality-processes.ts"));
  for (const forbidden of ["@/lib/supabase", "server-only", "next/", "react", "process.env", "createClient"]) {
    assert(!src.includes(forbidden), `el dominio no debe conocer «${forbidden}»`);
  }
  assert(!/^import /m.test(src), "el dominio no debe importar nada: es lógica pura");
});

check("21. La capa de datos es server-only y NUNCA usa service_role", () => {
  const src = read("lib/db/quality-processes.ts");
  assert(src.startsWith('import "server-only";'), "la capa de datos debe ser server-only");
  assert(src.includes("createServerClient"), "debe usar el cliente con la sesión real");
  assert(!src.includes("createAdminClient"), "jamás service_role en el flujo de la aplicación");
  assert(!src.includes("SERVICE_ROLE"), "jamás una clave secreta aquí");
});

check("22. TODA server action pasa por la guarda del módulo antes de escribir", () => {
  const src = read("server/actions/quality-processes.ts");
  assert(src.startsWith('"use server";'), "debe declararse como server actions");
  assert(!src.includes("createAdminClient"), "jamás service_role en una action");
  assert(src.includes("requireQualityForAction") && src.includes("checkQualityCanMutate"),
    "la guarda debe combinar módulo y modo solo lectura");

  // Cada action exportada debe empezar por la guarda: sin ella escribiría con
  // la sesión del usuario pero sin comprobar módulo, empresa activa ni plan.
  const actions = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  assert(actions.length >= 15, `esperaba al menos 15 actions, hay ${actions.length}`);
  for (const name of actions) {
    const start = src.indexOf(`export async function ${name}(`);
    const body = src.slice(start, start + 1400);
    assert(/const g = await gate\(\);/.test(body), `la action ${name} no invoca la guarda`);
    assert(/if \(!g\.ok\) return/.test(body), `la action ${name} no corta cuando la guarda falla`);
  }
});

check("23. organization_id sale SIEMPRE de la sesión, jamás del cliente", () => {
  const src = stripTs(read("server/actions/quality-processes.ts"));
  // Todo insert usa la empresa de la guarda…
  const inserts = [...src.matchAll(/organization_id: ([^,\n]+)/g)].map((m) => m[1].trim());
  assert(inserts.length >= 8, `esperaba varios inserts con organización, hay ${inserts.length}`);
  for (const value of inserts) {
    assert(value === "g.ok.organizationId", `un insert tomó la organización de «${value}»`);
  }
  // …y toda lectura/edición filtra además por esa misma empresa: la RLS ya lo
  // impone, pero un .eq() explícito deja el alcance visible en el código.
  const scoped = [...src.matchAll(/\.eq\("organization_id", ([^)]+)\)/g)].map((m) => m[1].trim());
  assert(scoped.length >= 8, `esperaba varios filtros por organización, hay ${scoped.length}`);
  for (const value of scoped) {
    assert(value === "g.ok.organizationId", `un filtro tomó la organización de «${value}»`);
  }
  // …y ningún tipo de ENTRADA de las actions acepta el organization_id: si lo
  // aceptara, el cliente podría elegir en qué empresa escribe.
  for (const block of src.matchAll(/export type \w*Input = \{([\s\S]*?)\n\};/g)) {
    assert(!/organizationId/.test(block[1]), `un tipo de entrada acepta organizationId: ${block[0].slice(0, 60)}`);
  }
  for (const params of src.matchAll(/export async function \w+\(([\s\S]*?)\): Promise/g)) {
    assert(!/organizationId/.test(params[1]), `una action recibe organizationId por parámetro: ${params[0].slice(0, 80)}`);
  }
});

check("24. El guard del namespace: 404 con el switch apagado, /modules si no está asignado", () => {
  const guard = read("lib/auth/require-quality-module.ts");
  assert(guard.startsWith('import "server-only";'), "el guard debe ser server-only");
  const fn = guard.slice(guard.indexOf("export async function requireQualityModule"));
  const killIdx = fn.indexOf("isQualityModuleEnabled()");
  const orgIdx = fn.indexOf("requireActiveOrg()");
  assert(killIdx > -1 && orgIdx > -1 && killIdx < orgIdx,
    "el kill switch debe evaluarse ANTES de exigir empresa activa: si no, un 404 se convertiría en redirección y delataría el módulo");
  assert(/notFound\(\)/.test(fn.slice(killIdx, orgIdx)), "con el switch apagado debe responder 404, no 403 ni redirección");
  assert(/redirect\("\/modules"\)/.test(fn), "un bloqueo comercial se explica en el selector");

  // Y el layout del namespace lo aplica, de modo que toda ruta presente o
  // futura bajo /quality queda protegida por defecto.
  assert(read("app/(app)/(shell)/quality/layout.tsx").includes("requireQualityModule()"),
    "el layout de /quality debe ejecutar el guard");
});

check("25. Ninguna página de Quality escapa del layout con guard", () => {
  const dir = join(ROOT, "app/(app)/(shell)/quality");
  const pages: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name === "page.tsx") pages.push(join(d, e.name));
    }
  };
  walk(dir);
  assert(pages.length >= 4, `esperaba al menos 4 páginas, hay ${pages.length}`);
  for (const p of pages) {
    const src = readFileSync(p, "utf8");
    assert(src.includes('export const dynamic = "force-dynamic"'),
      `${p} debe ser dinámica: depende de sesión y cookies`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nQUALITY-01 · convenciones de la migración 0112\n");

const MIG = "supabase/migrations/0112_quality_process_foundation.sql";

check("26. La migración es append-only y no toca ninguna anterior", () => {
  assert(existsSync(join(ROOT, MIG)), "falta la migración 0112");
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const numbers = files.map((f) => Number(f.slice(0, 4)));
  assert(Math.max(...numbers) === 112, `la última migración debe ser 112, es ${Math.max(...numbers)}`);
  assert(new Set(numbers).size === numbers.length, "hay prefijos de migración duplicados");
});

check("27. Privilegios EXPLÍCITOS: ni GRANT ALL, ni privilegios de DDL, ni anon", () => {
  const sql = stripSql(read(MIG));
  // La lección de Q0: nada depende del bootstrap permisivo de Supabase.
  assert(/grant select, insert, update, delete on table/.test(sql), "debe conceder DML enumerado");
  assert(!/grant all/i.test(sql), "jamás GRANT ALL");
  assert(!/alter default privileges/i.test(sql), "jamás ALTER DEFAULT PRIVILEGES");
  // TRUNCATE bypasea la RLS; REFERENCES y TRIGGER son DDL.
  assert(/revoke truncate, references, trigger on table/i.test(sql), "debe revocar TRUNCATE/REFERENCES/TRIGGER");
  assert(/from anon, authenticated;/.test(sql), "la revocación debe alcanzar a ambos roles cliente");
  assert(/revoke all on table[\s\S]*?from anon;/.test(sql), "anon no debe conservar NADA sobre Quality");
  assert(!/grant[^;]*to anon/i.test(sql), "ninguna superficie de Quality es pública");
});

check("28. Toda tabla nueva declara RLS y aislamiento por organización", () => {
  const sql = stripSql(read(MIG));
  const tables = [...sql.matchAll(/create table public\.(quality_\w+)/g)].map((m) => m[1]);
  assert(tables.length === 11, `esperaba 11 tablas, la migración crea ${tables.length}`);
  for (const t of tables) {
    assert(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t} sin RLS`);
    assert(new RegExp(`create table public\\.${t} \\([\\s\\S]*?organization_id`).test(sql), `${t} sin organization_id`);
  }

  // Las tablas de DATOS de la empresa declaran (organization_id, id) único: es
  // lo que permite que las FK sean COMPUESTAS y que una fila no pueda apuntar
  // a la de otra empresa ni por error ni a propósito.
  const CATALOG = "quality_process_categories";
  for (const t of tables.filter((t) => t !== CATALOG)) {
    assert(new RegExp(`constraint ${t}_org_id_uniq unique \\(organization_id, id\\)`).test(sql),
      `${t} sin la clave única que habilita las FK compuestas`);
  }
  // El catálogo de categorías es la excepción DELIBERADA: su organization_id es
  // nulo para las categorías base de Trazaloop, así que se aísla con dos
  // índices parciales (mismo patrón que las fibras textiles de 0093) y ninguna
  // FK compuesta apunta a él.
  assert(/organization_id uuid references public\.organizations/.test(
    sql.slice(sql.indexOf(`create table public.${CATALOG}`), sql.indexOf(`create table public.${CATALOG}`) + 600)
  ), `${CATALOG} debe permitir organization_id nulo (catálogo base)`);
  assert(new RegExp(`create unique index ${CATALOG}_global_code_uniq[\\s\\S]*?where organization_id is null`).test(sql),
    "el catálogo base debe ser único por código");
  assert(new RegExp(`create unique index ${CATALOG}_org_code_uniq[\\s\\S]*?where organization_id is not null`).test(sql),
    "las categorías propias deben ser únicas dentro de su empresa");
  assert(!new RegExp(`references public\\.${CATALOG}`).test(sql),
    "ninguna FK debe apuntar al catálogo: la categoría se valida por trigger, no por FK");
  // La vista se declara con security_invoker: si no, leería con los permisos
  // de quien la creó y saltaría la RLS del usuario.
  assert(/create view public\.v_quality_position_current_holder\s*\nwith \(security_invoker = true\)/.test(sql),
    "la vista debe declarar security_invoker = true");
});

check("29. Las RPC de publicación no son públicas y corren con la sesión real", () => {
  const sql = stripSql(read(MIG));
  for (const fn of ["quality_open_process_revision", "quality_publish_process_revision",
                    "quality_open_map_version", "quality_publish_map_version"]) {
    assert(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`).test(sql),
      `${fn} debe revocarse de public y anon`);
    assert(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`).test(sql),
      `${fn} solo debe ejecutarla un usuario autenticado`);
  }
  // Las RPC son SECURITY DEFINER porque tocan varias filas de forma atómica,
  // pero resuelven la identidad con auth.uid(): jamás suplantan a nadie.
  assert((sql.match(/security definer/g) ?? []).length >= 4, "las cuatro RPC deben ser SECURITY DEFINER");
  assert(/auth\.uid\(\)/.test(sql), "las RPC deben resolver la identidad real de la sesión");
  // service_role solo aparece concediendo privilegios de tabla, nunca dentro
  // de la lógica: la aplicación no usa esa clave para operar.
  const logic = sql.replace(/to authenticated, service_role;?/g, "");
  assert(!/service_role/.test(logic), "service_role no debe aparecer en la lógica de la migración");
});

check("30. El espejo en BD del catálogo: 0112 pone quality funcional", () => {
  const sql = read(MIG);
  assert(/update public\.modules[\s\S]{0,400}where code = 'quality'/.test(sql), "0112 debe actualizar el módulo quality");
  assert(/is_functional\s*=\s*true/.test(sql), "debe marcarlo funcional");
  assert(!/construccion/.test(sql), "0112 no debe tocar Construcción");
});

console.log(`\nQUALITY-01 unit/estático: ${passed} ✔, ${failed} ✘\n`);
process.exit(failed === 0 ? 0 : 1);
