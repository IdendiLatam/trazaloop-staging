/**
 * Trazaloop v1.0.x · PRUEBAS DE REGRESIÓN DEL RELEASE
 * tests/release/v1-release.test.ts   ·   npm run test:release
 *
 * Pruebas PURAS y estáticas: leen archivos y lógica sin BD, sin red y sin
 * sesión (patrón del proyecto). NINGUNA de ellas toca staging ni
 * producción — deliberadamente, porque un test de release nunca debe
 * depender de un proyecto real.
 *
 * Blindan los 18 invariantes de la versión oficial:
 *   1. la versión pertenece a la línea comercial 1.0.x
 *   2. no quedan textos visibles de beta / lanzamiento controlado
 *   3. «Demo» sigue existiendo como plan comercial
 *   4. CPR conserva NTC 6632 · UNE-EN 15343
 *   5. Textiles sigue disponible bajo su kill switch
 *   6. Quality y Construcción siguen «Próximamente»
 *   7. la herramienta de limpieza es dry-run por defecto
 *   8. la herramienta exige confirmación escrita exacta
 *   9. la herramienta rechaza project refs no autorizados
 *  10. la verificación de producción es de SOLO LECTURA
 *  11. ningún script de release imprime claves
 *  12. no se modificaron las migraciones 0001–0102
 *  13. no existe migración 0103
 *  14. el cliente administrativo sigue siendo server-only
 *  15. SUPABASE_SECRET_KEY es la variable principal
 *  16. el respaldo heredado no llega al cliente
 *  17. los hints CPR y Textiles conservan enlaces HTTPS e internos seguros
 *  18. el login permanece general para Trazaloop
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  COMMERCIAL_MODULES,
  FUNCTIONAL_MODULE_CODES,
  CPR_MODULE_CODE,
  TEXTILES_MODULE_CODE,
  getCommercialModuleByKey,
  isFunctionalModuleCode,
} from "../../lib/modules/catalog";
import { CPR_SHELL_MODULE, TEXTILES_SHELL_MODULE } from "../../lib/modules/registry";
import {
  isTextilesFlagEnabled,
  resolveTextilesAvailability,
  TEXTILES_FLAG_ENV,
} from "../../lib/modules/textiles";
import { classifyHintUrl } from "../../lib/domain/hint-links";
import {
  isPublicRegistrationFlagEnabled,
  isPublicRegistrationValueValid,
  extractInvitationToken,
  PUBLIC_REGISTRATION_FLAG_ENV,
} from "../../lib/domain/public-registration";
import {
  hasAcceptedAllRequiredDocuments,
  pendingRequiredDocuments,
  hasConfirmedAllLegalCheckboxes,
} from "../../lib/domain/legal";
import {
  LEGAL_OPERATOR,
  LEGAL_PACKAGE_APPROVED,
  LEGAL_PACKAGE_APPROVAL_DATE,
  LEGAL_PACKAGE_DOCUMENTS,
  LEGAL_PACKAGE_DOCUMENT_DB_VERSION,
  LEGAL_PACKAGE_DRAFT_BANNER,
  LEGAL_PACKAGE_EFFECTIVE_DATE,
  LEGAL_PACKAGE_VERSION,
  LEGAL_TECH_PROVIDERS,
  ESSENTIAL_COOKIES_PURPOSES,
} from "../../lib/domain/legal-package";
import { APP_VERSION, APP_VERSION_LABEL } from "../../lib/version";
import {
  resolveDeploymentEnvironment,
  isProductionEnvironment,
  isStagingEnvironment,
  environmentBadgeLabel,
} from "../../lib/env";

// Migraciones autorizadas a partir de 0111. Cada sprint que añade una
// migración la declara aquí: es lo que impide que aparezca una migración
// no revisada sin que ninguna prueba se entere.
const QUALITY_01_ALLOWED = new Set([
  "0111_platform_role_privileges.sql",
  "0112_quality_process_foundation.sql",
  "0113_quality_documents_and_position_lifecycle.sql",
  // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
  // salidas, y snapshot de las aristas del mapa publicado.
  "0114_quality_relations_io_documents_and_map_edges.sql",
  // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
  // entorno remoto concede DML por defecto sobre cada tabla nueva.
  "0115_quality_map_edges_privilege_hardening.sql",
  // QUALITY-02: control documental — identidad, revisión inmutable, workflow
  // con revisores y aprobadores, decisiones append-only, bandeja transversal
  // de tareas y alertas, y la lista maestra como vista derivada.
  "0116_document_control_revisions_workflow_and_tasks.sql",
  // QUALITY-03: objetivos, indicadores con configuración versionada,
  // mediciones con linaje, eventos de desempeño y cierre de ciclo.
  "0117_quality_objectives_indicators_and_measurements.sql",
  "0118_quality_measurement_engine_privilege_hardening.sql",
  "0119_quality_temporal_eligibility_and_lifecycle.sql",
  "0120_quality_draft_process_deletion.sql",
  "0121_work_cases_and_actions_engine.sql",
]);
const MAX_DECLARED_MIGRATION = Math.max(...[...QUALITY_01_ALLOWED].map((f) => Number(f.slice(0, 4))));

// ---------------------------------------------------------------------------
let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

console.log("\nTrazaloop · regresión de release v1.0.x\n");

// ===========================================================================
console.log("§1 · Identidad de la versión\n");

check("1. package.json declara una versión de la línea 1.0.x", () => {
  const pkg = JSON.parse(read("package.json")) as { version: string };
  assert(
    /^1\.0\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version),
    `package.json declara ${pkg.version}, se esperaba una versión de la línea 1.0.x`
  );
});

check("1b. package-lock.json está sincronizado con package.json", () => {
  const pkg = JSON.parse(read("package.json")) as { version: string };
  const lock = JSON.parse(read("package-lock.json")) as {
    version: string;
    packages: Record<string, { version?: string }>;
  };
  assert(
    lock.version === pkg.version,
    `package-lock raíz declara ${lock.version}, package.json declara ${pkg.version}`
  );
  assert(
    lock.packages[""]?.version === pkg.version,
    `package-lock packages[""] declara ${lock.packages[""]?.version}, package.json declara ${pkg.version}`
  );
});

check("1c. La versión visible deriva de package.json (fuente única)", () => {
  const pkg = JSON.parse(read("package.json")) as { version: string };
  const expectedLabel = `Trazaloop v${pkg.version.split(".").slice(0, 2).join(".")}`;

  assert(
    APP_VERSION === pkg.version,
    `APP_VERSION es ${APP_VERSION}, package.json declara ${pkg.version}`
  );
  assert(
    APP_VERSION_LABEL === expectedLabel,
    `la etiqueta visible es «${APP_VERSION_LABEL}», se esperaba «${expectedLabel}»`
  );
  assert(
    !/pilot|beta|preliminar|prueba/i.test(APP_VERSION_LABEL),
    "la etiqueta visible no debe sugerir una versión no oficial"
  );
  const source = read("lib/version.ts");
  assert(
    source.includes('import pkg from "../package.json"'),
    "lib/version.ts debe seguir derivando la versión de package.json, no codificarla"
  );
});

check("1d. La etiqueta de versión se muestra de forma DISCRETA (pocos lugares)", () => {
  const uiFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name)) uiFiles.push(rel);
    }
  };
  walk("app");
  walk("components");
  const users = uiFiles.filter((f) => read(f).includes("APP_VERSION_LABEL"));
  assert(
    users.length <= 4,
    `APP_VERSION_LABEL aparece en ${users.length} archivos de UI (${users.join(", ")}). ` +
      "La versión debe mostrarse de forma discreta, no como mensaje promocional."
  );
});

// ===========================================================================
console.log("\n§2 · Ausencia de lenguaje de beta / versión no oficial\n");

const FORBIDDEN_VISIBLE = [
  /beta/i,
  /lanzamiento\s+controlado/i,
  /versi[oó]n\s+preliminar/i,
  /versi[oó]n\s+de\s+prueba/i,
  /n[uú]cleo\s+v0\.1/i,
];

/** Archivos de UI cuyos textos ve el usuario final. */
const USER_FACING_FILES = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/(auth)/layout.tsx",
  "app/(auth)/login/page.tsx",
  "app/(auth)/register/page.tsx",
  "app/legal/page.tsx",
  "app/legal/accept/page.tsx",
  "app/terms/page.tsx",
  "app/privacy/page.tsx",
  "app/(app)/(shell)/layout.tsx",
];

check("2. Ninguna página visible presenta Trazaloop como beta o versión preliminar", () => {
  for (const file of USER_FACING_FILES) {
    assert(exists(file), `no se encontró ${file}`);
    const source = read(file);
    for (const rx of FORBIDDEN_VISIBLE) {
      assert(
        !rx.test(source),
        `${file} todavía contiene lenguaje de versión no oficial (${rx})`
      );
    }
  }
});

check("2b. La portada no muestra ninguna insignia de beta", () => {
  const landing = read("app/page.tsx");
  assert(!/Beta\s*\/\s*lanzamiento/i.test(landing), "la portada conserva la insignia de beta");
  assert(
    landing.includes("Plataforma modular"),
    "la portada debe seguir presentando Trazaloop como plataforma modular"
  );
});

check("2c. Los metadatos HTML representan la plataforma completa, no solo CPR", () => {
  const layout = read("app/layout.tsx");
  assert(layout.includes("Plataforma modular"), "el título debe hablar de la plataforma");
  assert(
    !/NTC 6632|UNE-EN 15343/.test(layout),
    "la descripción global no debe reducirse a las normas de CPR"
  );
});

check("2d. No queda jerga interna de sprint en textos visibles de la app", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(entry.name)) {
        const source = read(rel);
        // Se ignoran los comentarios (histórico interno, categoría D) y se
        // busca solo en el texto que llega al usuario.
        const withoutComments = source
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (/\(Sprint \d|del Sprint \d|en este sprint/i.test(withoutComments)) {
          offenders.push(rel);
        }
      }
    }
  };
  walk("app");
  walk("components");
  assert(
    offenders.length === 0,
    `estos archivos muestran referencias a sprints en texto visible: ${offenders.join(", ")}`
  );
});

// ===========================================================================
console.log("\n§3 · Modelo comercial intacto (Demo / Full / Extra)\n");

check("3. «demo» sigue siendo un plan comercial y NO un estado experimental", () => {
  const plansMigration = read("supabase/migrations/0050_plans_and_usage.sql");
  assert(
    plansMigration.includes("check (code in ('demo', 'full', 'extra'))"),
    "plan_definitions debe seguir aceptando exactamente demo, full y extra"
  );
  assert(
    plansMigration.includes("('demo', 'Demo',"),
    "la fila del plan Demo debe seguir existiendo"
  );
  const access = read("lib/modules/access.ts");
  assert(
    access.includes('export type ModuleAccessMode = "demo" | "full" | "extra"'),
    "los access_mode deben seguir siendo demo | full | extra"
  );
});

check("3b. La Demo temporal de 48 h de las empresas nuevas sigue vigente", () => {
  const m = read("supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql");
  assert(
    m.includes("now() + interval '48 hours'"),
    "la provisión automática debe seguir concediendo Demo de 48 horas"
  );
  assert(m.includes("auto_demo_trial"), "debe conservarse el origen de asignación auto_demo_trial");
});

check("3c. Full y Extra comparten acceso funcional y difieren en almacenamiento", () => {
  const plansMigration = read("supabase/migrations/0050_plans_and_usage.sql");
  assert(
    plansMigration.includes("('full', 'documents_trazadocs', null, true)"),
    "Full debe seguir siendo ilimitado en recursos funcionales"
  );
  assert(
    /\('extra', 'storage_bytes'/.test(plansMigration) ||
      plansMigration.includes("mayor cuota de almacenamiento"),
    "Extra debe seguir diferenciándose por almacenamiento"
  );
});

check("3d. La portada ofrece la cuenta Demo como producto, no como prueba del software", () => {
  const landing = read("app/page.tsx");
  assert(landing.includes("Crear cuenta Demo"), "debe conservarse la llamada a crear cuenta Demo");
  assert(
    !/demo.{0,40}(beta|experimental|versi[oó]n de prueba)/i.test(landing),
    "Demo nunca debe presentarse como versión experimental del software"
  );
});

// ===========================================================================
console.log("\n§4 · Identidad de los módulos\n");

check("4. CPR conserva su identidad normativa NTC 6632 · UNE-EN 15343", () => {
  assert(
    CPR_SHELL_MODULE.headerBadge === "NTC 6632 · UNE-EN 15343",
    `el badge de CPR es «${CPR_SHELL_MODULE.headerBadge}»`
  );
  const cpr = getCommercialModuleByKey("cpr");
  assert(cpr !== null, "el módulo CPR debe existir en el catálogo");
  assert(cpr!.name === "Trazaloop PCR", `el nombre comercial es «${cpr!.name}» (PCR-01: denominación PCR)`);
  assert(
    cpr!.description.includes("NTC 6632") && cpr!.description.includes("UNE-EN 15343"),
    "la descripción de CPR debe conservar ambas normas"
  );
  assert(cpr!.status === "functional", "CPR debe seguir siendo funcional");
  assert(isFunctionalModuleCode(CPR_MODULE_CODE), "el code de CPR debe seguir siendo funcional");
});

check("5. Textiles sigue disponible y bajo su kill switch", () => {
  const tex = getCommercialModuleByKey("textiles");
  assert(tex !== null, "el módulo Textiles debe existir en el catálogo");
  assert(tex!.status === "functional", "Textiles debe seguir siendo funcional");
  assert(
    tex!.killSwitchEnv === TEXTILES_FLAG_ENV,
    `el kill switch de Textiles debe ser ${TEXTILES_FLAG_ENV}`
  );
  assert(TEXTILE_HEADER(), "Textiles debe conservar su propio badge, nunca normas de CPR");
  assert(
    isFunctionalModuleCode(TEXTILES_MODULE_CODE),
    "el code de Textiles debe seguir siendo funcional"
  );
});
function TEXTILE_HEADER() {
  return (
    TEXTILES_SHELL_MODULE.headerBadge === "Trazaloop Textiles" &&
    !/NTC 6632|UNE-EN 15343/.test(TEXTILES_SHELL_MODULE.headerBadge)
  );
}

check("5b. El kill switch de Textiles sigue APAGADO por defecto (fail-closed)", () => {
  assert(isTextilesFlagEnabled("true") === true, "«true» debe encender el módulo");
  assert(isTextilesFlagEnabled("1") === true, "«1» debe encender el módulo");
  for (const raw of [undefined, null, "", "false", "yes", "TRUE", "0"]) {
    assert(
      isTextilesFlagEnabled(raw) === false,
      `«${String(raw)}» no debía encender el módulo`
    );
  }
  assert(
    resolveTextilesAvailability({ flagRaw: "false", hasActiveOrg: true, modules: [] }) ===
      "flag_disabled",
    "con el flag apagado la disponibilidad debe ser flag_disabled"
  );
  assert(
    resolveTextilesAvailability({
      flagRaw: "true",
      hasActiveOrg: true,
      modules: [{ code: "textiles", enabled: true }],
    }) === "available",
    "con flag encendido y módulo habilitado debe estar disponible"
  );
});

check("6. Construcción sigue «Próximamente»; Quality es funcional pero no está lanzado", () => {
  const construccion = getCommercialModuleByKey("construccion");
  assert(construccion !== null, "el módulo construccion debe seguir en el catálogo");
  assert(construccion!.status === "coming_soon", "construccion debe seguir en coming_soon");
  assert(!isFunctionalModuleCode(construccion!.moduleCode), "construccion no debe poder asignarse");

  // QUALITY-01 pasó Quality a funcional en el CATÁLOGO. Que sea funcional no
  // significa que esté lanzado: su kill switch propio es lo que decide dónde se
  // enciende, y en Production está apagado. Por eso la portada (6b) lo sigue
  // presentando como «Próximamente» sin contradecir esto.
  const quality = getCommercialModuleByKey("quality");
  assert(quality !== null, "el módulo quality debe seguir en el catálogo");
  assert(quality!.status === "functional", "quality debe ser functional desde QUALITY-01");
  assert(quality!.killSwitchEnv === "QUALITY_MODULE_ENABLED", "quality debe tener su kill switch propio");

  assert(
    FUNCTIONAL_MODULE_CODES.length === 3,
    `se esperaban exactamente 3 módulos funcionales, hay ${FUNCTIONAL_MODULE_CODES.length}`
  );
  assert(COMMERCIAL_MODULES.length === 4, "el catálogo debe seguir teniendo 4 módulos comerciales");
});

check("6b. La portada sigue mostrando Quality y Construcción como Próximamente", () => {
  const landing = read("app/page.tsx");
  assert(landing.includes("Trazaloop Quality"), "falta la tarjeta de Quality");
  assert(landing.includes("Trazaloop Construcción"), "falta la tarjeta de Construcción");
  assert(landing.includes("Próximamente"), "debe conservarse la etiqueta Próximamente");
});

// ===========================================================================
console.log("\n§5 · Herramienta de limpieza de staging\n");

const CLEANUP = "scripts/release/v1/cleanup-staging.ts";

check("7. La limpieza es DRY-RUN por defecto", () => {
  assert(exists(CLEANUP), "no existe la herramienta de limpieza");
  const s = read(CLEANUP);
  assert(
    s.includes('const EXECUTE = argv.includes("--execute")'),
    "el modo de ejecución debe depender de un indicador explícito --execute"
  );
  assert(
    s.includes("if (!EXECUTE) {"),
    "debe existir una salida temprana que impida borrar sin --execute"
  );
  const executeIdx = s.indexOf("if (!EXECUTE) {");
  const firstDelete = s.indexOf("delete from public.");
  assert(
    executeIdx !== -1 && firstDelete !== -1 && executeIdx < firstDelete,
    "la salida del dry-run debe ocurrir ANTES de cualquier DELETE"
  );
});

check("8. La limpieza exige una confirmación escrita EXACTA", () => {
  const s = read(CLEANUP);
  assert(
    s.includes("const EXPECTED_CONFIRM = `BORRAR DATOS DE STAGING ${PROJECT_REF}`"),
    "la frase de confirmación debe incluir el project ref"
  );
  assert(
    s.includes("if (EXECUTE && CONFIRM !== EXPECTED_CONFIRM)"),
    "la comparación de la confirmación debe ser de igualdad exacta"
  );
});

check("9. La limpieza rechaza project refs no autorizados", () => {
  const s = read(CLEANUP);
  assert(
    s.includes("if (ALLOWLIST.length === 0)"),
    "sin allowlist aportada por el operador, la herramienta debe abortar"
  );
  assert(
    s.includes("if (!ALLOWLIST.includes(PROJECT_REF))"),
    "debe rechazarse cualquier project ref fuera de la allowlist"
  );
  assert(
    s.includes("if (urlRef !== PROJECT_REF)"),
    "el entorno debe apuntar realmente al proyecto declarado"
  );
});

check("9b. La limpieza protege a los superadministradores y falla cerrado", () => {
  const s = read(CLEANUP);
  assert(s.includes("KEEP_AUTH_EMAILS"), "debe existir la lista KEEP_AUTH_EMAILS");
  assert(
    s.includes("if (KEEP_EMAILS.length === 0)"),
    "una lista vacía de correos a conservar debe abortar la ejecución"
  );
  assert(
    s.includes("eliminaría a TODOS los superadministradores"),
    "debe abortar si ningún superadministrador sobreviviría"
  );
  assert(
    s.includes("unclassified.rows.length > 0"),
    "debe abortar ante tablas sin clasificar (fallar cerrado)"
  );
});

check("9c. La limpieza preserva los catálogos globales", () => {
  const s = read(CLEANUP);
  for (const t of [
    "modules",
    "plan_definitions",
    "plan_limits",
    "calculation_methodologies",
    "diagnostic_questions",
    "trazadoc_blueprints",
    "trazadoc_blueprint_sections",
    "legal_documents",
  ]) {
    assert(
      new RegExp(`"${t}"`).test(s),
      `${t} debe figurar entre las tablas globales preservadas`
    );
  }
  assert(
    s.includes("where organization_id is not null"),
    "del catálogo de fibras solo deben borrarse las personalizadas de empresas"
  );
});

check("9d. Storage se trata aparte y nunca se da por hecho el borrado físico", () => {
  const s = read(CLEANUP);
  assert(
    s.includes("supa.storage.from(bc.bucket).remove(chunk)"),
    "los objetos deben eliminarse por la API de Storage, no por SQL"
  );
  assert(
    !/delete\s+from\s+storage\.objects/i.test(s),
    "jamás debe borrarse metadata de storage.objects por SQL: no elimina el archivo"
  );
  assert(
    s.includes("const remaining = await listAllObjects(pg, bc.bucket)"),
    "tras borrar debe volver a listarse el bucket para verificar"
  );
});

check("9e. La herramienta documenta respaldo y recuperación", () => {
  const s = read(CLEANUP);
  assert(s.includes("RESPALDO Y RECUPERACIÓN"), "faltan las instrucciones de respaldo");
  assert(s.includes("pg_dump"), "debe indicarse cómo hacer la copia de seguridad");
  assert(
    s.includes("NO se recuperan desde el dump"),
    "debe advertirse que los archivos de Storage no están en el dump de PostgreSQL"
  );
});

// ===========================================================================
console.log("\n§6 · Verificación de producción y seguridad de los scripts\n");

const VERIFY_SQL = "scripts/release/v1/verify-empty-production.sql";

check("10. La verificación de producción es de SOLO LECTURA", () => {
  assert(exists(VERIFY_SQL), "no existe el verificador de producción vacía");
  const s = read(VERIFY_SQL);
  assert(
    s.includes("begin read only;"),
    "la transacción debe abrirse explícitamente como READ ONLY"
  );
  // Se ignoran comentarios y textos de mensaje al buscar DML.
  const code = s
    .replace(/^--.*$/gm, "")
    .replace(/'(?:[^']|'')*'/g, "''");
  for (const rx of [
    /\binsert\s+into\b/i,
    /\bupdate\s+\w+\s+set\b/i,
    /\bdelete\s+from\b/i,
    /\btruncate\b/i,
    /\bdrop\s+(table|schema|function)\b/i,
    /\bcreate\s+(table|schema)\b/i,
    /\balter\s+table\b/i,
  ]) {
    assert(!rx.test(code), `el verificador contiene una sentencia de escritura (${rx})`);
  }
});

check("10b. La verificación falla de forma inequívoca ante datos empresariales", () => {
  const s = read(VERIFY_SQL);
  assert(
    s.includes("NO-GO · SE ENCONTRARON DATOS EMPRESARIALES"),
    "debe emitir un veredicto inequívoco"
  );
  assert(
    s.includes("raise exception"),
    "debe terminar con error (exit != 0) y no solo imprimir un aviso"
  );
  assert(
    s.includes("column_name  = 'organization_id'") ||
      s.includes("column_name = 'organization_id'"),
    "las tablas deben derivarse del esquema real, no de una lista fija"
  );
});

// --- Compatibilidad con el SQL Editor de Supabase -------------------------
// El verificador se ejecuta pegándolo en el SQL Editor, que NO interpreta
// metacomandos de psql. Cualquier línea que empiece por barra invertida
// rompe la ejecución completa.
check("10c. El verificador NO contiene metacomandos de psql", () => {
  const s = read(VERIFY_SQL);
  const offenders = s
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /^\s*\\/.test(line));
  assert(
    offenders.length === 0,
    `el verificador contiene metacomandos psql en las líneas ${offenders
      .map((o) => o.n)
      .join(", ")}: no se ejecutaría en el SQL Editor de Supabase`
  );
  for (const meta of ["\\pset", "\\timing", "\\echo", "\\set", "\\quit", "\\q", "\\connect"]) {
    assert(!s.includes(meta), `el verificador aún menciona el metacomando ${meta}`);
  }
  assert(
    /SQL Editor/i.test(s),
    "el verificador debe declarar explícitamente su compatibilidad de ejecución"
  );
});

// --- Estructura REAL del superadministrador -------------------------------
// public.platform_staff (0040) tiene role_code + status. NUNCA existió una
// columna booleana de superadmin: usarla producía un error de columna
// inexistente al ejecutar el script.
check("10d. El verificador usa role_code/status y NUNCA una columna booleana de superadmin", () => {
  const s = read(VERIFY_SQL);
  assert(!/is_superadmin/i.test(s), "el verificador no debe referirse a is_superadmin");
  assert(!/is_super_admin/i.test(s), "el verificador no debe referirse a is_super_admin");
  assert(
    /role_code\s*=\s*'superadmin'/.test(s),
    "el superadministrador debe identificarse por role_code = 'superadmin'"
  );
  assert(
    /status\s*=\s*'active'/.test(s),
    "el superadministrador debe exigir status = 'active'"
  );
  // Nunca por separado: las dos condiciones deben ir juntas en cada consulta.
  const superadminRefs = s.match(/role_code\s*=\s*'superadmin'[\s\S]{0,120}/g) ?? [];
  assert(superadminRefs.length > 0, "debe existir al menos una consulta de superadministrador");
  for (const ref of superadminRefs) {
    assert(
      /status\s*=\s*'active'/.test(ref) || /not\s*\(/.test(ref),
      `una consulta de superadmin no exige status = 'active': ${ref.slice(0, 90)}`
    );
  }
  // Y la migración real sigue siendo la fuente de verdad de esa estructura.
  const m = read("supabase/migrations/0040_platform_staff.sql");
  assert(
    m.includes("role_code  text not null") && m.includes("status     text not null"),
    "0040_platform_staff debe seguir definiendo role_code y status"
  );
  assert(
    !/is_superadmin/i.test(m),
    "la migración confirma que nunca existió una columna is_superadmin"
  );
});

// --- Clasificación de audit_log -------------------------------------------
// audit_log.organization_id es NULLABLE (0005). Contar la tabla entera
// producía un NO-GO FALSO: las filas globales las escriben las propias
// migraciones y la carga de datos globales.
check("10e. audit_log NO se cuenta incondicionalmente como tabla empresarial", () => {
  const s = read(VERIFY_SQL);
  // Debe estar excluida de la derivación genérica por organization_id…
  const exclusions = s.match(/table_name not in \('textile_fiber_types', 'audit_log'\)/g) ?? [];
  assert(
    exclusions.length >= 3,
    `audit_log debe excluirse del censo genérico en la sección 2, 2b y el veredicto (encontradas ${exclusions.length})`
  );
  // …y no debe quedar ninguna exclusión antigua que solo cubriera las fibras.
  assert(
    !/table_name\s+<>\s+'textile_fiber_types'/.test(s),
    "queda una exclusión antigua que trata audit_log como tabla empresarial completa"
  );
  // La migración confirma que la columna es NULLABLE (justifica el trato).
  const audit = read("supabase/migrations/0005_audit.sql");
  assert(
    /organization_id uuid references public\.organizations \(id\),/.test(audit),
    "0005_audit debe seguir declarando organization_id NULLABLE en audit_log"
  );
});

check("10f. La auditoría empresarial exige organization_id NO NULL", () => {
  const s = read(VERIFY_SQL);
  const filter = "nullif(to_jsonb(a)->>''organization_id'', '''') is not null";
  assert(
    s.includes(filter),
    "el censo empresarial de audit_log debe filtrar por organization_id NOT NULL"
  );
  // El filtro debe aplicarse tanto en el informe (sección 2) como en el
  // veredicto: si solo estuviera en uno, el NO-GO volvería a ser falso.
  assert(
    (s.match(new RegExp(filter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 3,
    "el filtro empresarial de audit_log debe usarse en la sección 2, 2b y el veredicto"
  );
});

check("10g. La auditoría global (organization_id NULL) está PERMITIDA", () => {
  const s = read(VERIFY_SQL);
  assert(
    s.includes("nullif(to_jsonb(a)->>'organization_id', '') is null"),
    "debe existir una comprobación explícita de la auditoría global"
  );
  assert(
    /organization_id NULL[^\n]*permitido|PERMITIDO/.test(s),
    "el script debe declarar por escrito que la auditoría global está permitida"
  );
  assert(
    /append-only/.test(s),
    "debe advertir que audit_log es append-only y que esas filas no se borran"
  );
  // Nunca debe existir un NO-GO que dispare por el TOTAL de audit_log.
  assert(
    !/audit_log[^\n]{0,60}NO-GO/.test(s.replace(/organization_id NOT NULL[\s\S]{0,80}/g, "")),
    "ningún NO-GO puede dispararse por el conteo total de audit_log"
  );
});

check("10h. El verificador calcula audit_log total, global y empresarial", () => {
  const s = read(VERIFY_SQL);
  for (const alias of ["audit_log_total", "audit_log_global", "audit_log_empresarial"]) {
    assert(s.includes(alias), `debe informar de ${alias}`);
  }
  for (const v of ["v_audit_total", "v_audit_global", "v_audit_business"]) {
    assert(s.includes(v), `el veredicto debe calcular ${v}`);
  }
  assert(
    /raise notice 'audit_log total/.test(s) &&
      /raise notice 'audit_log global/.test(s) &&
      /raise notice 'audit_log empresarial/.test(s),
    "las tres cifras deben emitirse por RAISE NOTICE (lo único que ve el SQL Editor)"
  );
});

// --- Momentos admitidos del superadministrador ----------------------------
check("10i. Se aceptan 0 superadministradores antes de crearlo y 1 después", () => {
  const s = read(VERIFY_SQL);
  assert(
    /esperado: 0 antes de crearlo, 1 después/.test(s),
    "el informe debe explicar que 0 es válido antes del paso formal de creación"
  );
  // 0 superadmins NO puede ser un NO-GO: el umbral de error es > 1.
  assert(
    /if v_superadmins > 1 then/.test(s),
    "solo MÁS de un superadministrador activo debe abortar"
  );
  assert(
    !/if v_superadmins\s*(=|<)\s*0\s*then[\s\S]{0,200}raise exception/.test(s),
    "cero superadministradores no debe producir NO-GO: aún no se ha creado"
  );
  assert(
    !/if v_superadmins\s*(<>|!=)\s*1\s*then[\s\S]{0,200}raise exception/.test(s),
    "exigir exactamente 1 superadministrador rompería la verificación previa a su creación"
  );
});

check("10j. Las cuentas de Auth ajenas al superadministrador producen NO-GO", () => {
  const s = read(VERIFY_SQL);
  assert(
    /if v_auth_non_super > 0 then[\s\S]{0,120}raise exception/.test(s),
    "una cuenta de Auth que no sea el superadministrador debe abortar con error"
  );
  assert(
    s.includes("NO-GO · HAY % CUENTA(S) DE AUTH QUE NO SON EL SUPERADMINISTRADOR"),
    "el mensaje de NO-GO por cuentas de Auth debe ser inequívoco"
  );
  // Incoherencias entre auth.users y platform_staff: también NO-GO.
  assert(
    /if v_staff_orphan > 0 then[\s\S]{0,120}raise exception/.test(s),
    "el personal de plataforma sin cuenta en auth.users debe abortar"
  );
  assert(
    /if v_auth_users <> v_superadmins then[\s\S]{0,160}raise exception/.test(s),
    "una incoherencia entre auth.users y los superadministradores activos debe abortar"
  );
  assert(
    /if v_superadmins > 1 then[\s\S]{0,160}raise exception/.test(s),
    "más de un superadministrador activo debe abortar"
  );
});

// --- Contrato de solo lectura, reforzado ----------------------------------
check("10k. El verificador conserva el contrato de SOLO LECTURA", () => {
  const s = read(VERIFY_SQL);
  const code = s.replace(/^\s*--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
  for (const rx of [
    /\binsert\b/i,
    /\bupdate\b/i,
    /\bdelete\b/i,
    /\btruncate\b/i,
    /\balter\b/i,
    /\bdrop\b/i,
    /\bcreate\s+(table|view|function|policy|index|schema|trigger)\b/i,
    /\bgrant\b/i,
    /\brevoke\b/i,
    /\bmerge\b/i,
    /\bcopy\b[\s\S]{0,40}\bfrom\b/i,
  ]) {
    assert(!rx.test(code), `el verificador contiene una sentencia prohibida (${rx})`);
  }
  // El bloque DO solo puede calcular: su EXECUTE dinámico debe ser un SELECT.
  const dynamic = s.match(/execute format\('([^']+)'/g) ?? [];
  assert(dynamic.length > 0, "debe existir el censo dinámico del veredicto");
  for (const d of dynamic) {
    assert(
      /execute format\('select /.test(d),
      `el EXECUTE dinámico debe ser un SELECT, no una escritura: ${d}`
    );
  }
  assert(s.includes("begin read only;"), "la transacción debe seguir abriéndose READ ONLY");
});

check("10l. El verificador no declara por sí solo que Production está lista", () => {
  const s = read(VERIFY_SQL);
  assert(
    /NO declara la producción lista para desplegar/i.test(s),
    "el veredicto positivo debe aclarar que la decisión de despliegue es humana"
  );
});

check("11. Ningún script de release imprime claves ni secretos", () => {
  const scripts = [
    "scripts/release/v1/precheck-env.ts",
    "scripts/release/v1/cleanup-staging.ts",
    "scripts/release/v1/verify-empty-production.sql",
    "scripts/release/v1/publish-legal-v2.sql",
  ];
  // Patrón: cualquier impresión que interpole una variable cuyo nombre
  // sugiera una clave.
  const LEAK = /(console\.log|console\.error|line|raise notice|\becho\b)[^\n]*\$\{?[^\n]*(SECRET|SERVICE_ROLE|ANON_KEY|PUBLISHABLE_KEY|PASSWORD|DB_URL|secretKey|SECRET_KEY)/i;
  for (const f of scripts) {
    assert(exists(f), `no existe ${f}`);
    const s = read(f);
    assert(!LEAK.test(s), `${f} podría estar imprimiendo el valor de una clave`);
  }
  const precheck = read("scripts/release/v1/precheck-env.ts");
  assert(
    precheck.includes("NUNCA\n * VALORES DE CLAVES") ||
      precheck.includes("NUNCA IMPRIME"),
    "el precheck debe declarar explícitamente que no imprime valores"
  );
  assert(
    precheck.includes("return typeof raw === \"string\" && raw.trim().length > 0"),
    "la comprobación debe ser de PRESENCIA (booleana), nunca devolver el valor"
  );
});

check("11b. El precheck distingue Development, Preview y Production", () => {
  const s = read("scripts/release/v1/precheck-env.ts");
  for (const env of ["development", "preview", "production"]) {
    assert(s.includes(`"${env}"`), `el precheck debe contemplar el entorno ${env}`);
  }
  assert(s.includes("VERCEL_ENV"), "debe deducir el entorno de VERCEL_ENV");
  assert(
    s.includes("expect-project-ref"),
    "debe permitir comprobar que la URL pertenece al proyecto esperado"
  );
  assert(
    s.includes("DEPLOYMENT NUEVO") || s.includes("Redeploy"),
    "debe explicar que los cambios de variables exigen un nuevo deployment"
  );
});

// ===========================================================================
console.log("\n§7 · Integridad de las migraciones\n");

check("12. Las migraciones 0001–0105 existen sin renumeraciones ni duplicados", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const numbers = files
    .map((f) => Number(f.slice(0, 4)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  assert(numbers[0] === 1, `la primera migración es ${numbers[0]}, se esperaba 0001`);
  // 0106–0108 son PCR-03 original; 0109 y 0110 son los hotfixes autorizados;
  // 0111 (privilegios de rol, Q0.3H) y 0112 (fundación de Quality) son las
  // únicas posteriores declaradas. La cola se compara contra esa declaración:
  // así una migración nueva no pasa inadvertida, pero añadirla es un cambio
  // consciente de una sola línea.
  assert(
    numbers[numbers.length - 1] === MAX_DECLARED_MIGRATION,
    `la última migración es ${numbers[numbers.length - 1]}, se esperaba ${MAX_DECLARED_MIGRATION} (fundación de Quality)`
  );
  // Nadie debe haber renumerado ni duplicado un prefijo.
  const dupes = numbers.filter((n, i) => i > 0 && n === numbers[i - 1]);
  assert(dupes.length === 0, `prefijos de migración duplicados: ${dupes.join(", ")}`);
});

check("13. Tras 0105: PCR-03 0106–0108 + hotfixes autorizados 0109 y 0110; no existe 0111 ni posterior", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const allowed = new Set([
    "0106_pcr031_evidence_governance.sql",
    "0107_pcr032_traceability_exercises.sql",
    "0108_pcr033_audit_dossiers.sql",
    "0109_pcr0341_evidence_status_case_hotfix.sql",
    // Hotfix 0110: calificación de pgcrypto en create_platform_organization.
    "0110_platform_org_pgcrypto_schema_fix.sql",
    // Q0.3H: privilegios de rol reproducibles desde migraciones (DR-22).
    "0111_platform_role_privileges.sql",
    // QUALITY-01: fundación de Procesos de Trazaloop Quality.
    "0112_quality_process_foundation.sql",
    // QUALITY-01.1: correcciones de aceptación (documentos y ciclo del cargo).
    "0113_quality_documents_and_position_lifecycle.sql",
    // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
    // salidas, y snapshot de las aristas del mapa publicado.
    "0114_quality_relations_io_documents_and_map_edges.sql",
    // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
    // entorno remoto concede DML por defecto sobre cada tabla nueva.
    "0115_quality_map_edges_privilege_hardening.sql",
    // QUALITY-02: control documental — identidad, revisión inmutable, workflow
    // con revisores y aprobadores, decisiones append-only, bandeja transversal
    // de tareas y alertas, y la lista maestra como vista derivada.
    "0116_document_control_revisions_workflow_and_tasks.sql",
    // QUALITY-03: objetivos, indicadores con configuración versionada,
    // mediciones con linaje, eventos de desempeño y cierre de ciclo.
    "0117_quality_objectives_indicators_and_measurements.sql",
    "0118_quality_measurement_engine_privilege_hardening.sql",
    "0119_quality_temporal_eligibility_and_lifecycle.sql",
    "0120_quality_draft_process_deletion.sql",
    "0121_work_cases_and_actions_engine.sql",
  ]);
  const later = files.filter((f) => Number(f.slice(0, 4)) >= 106);
  const intruders = later.filter((f) => !allowed.has(f));
  assert(intruders.length === 0, `posteriores no autorizadas: ${intruders.join(", ")}`);
  const beyond = files.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f));
  assert(beyond.length === 0, `no debe existir 0111 ni posterior: ${beyond.join(", ")}`);
});

check("13b. La actualización legal es un script operativo, NO una migración", () => {
  assert(
    exists("scripts/release/v1/publish-legal-v2.sql"),
    "debe existir el script operativo de publicación legal"
  );
  const s = read("scripts/release/v1/publish-legal-v2.sql");
  assert(
    s.includes("NO SE HA EJECUTADO"),
    "el script debe declarar que no se ha ejecutado"
  );
  assert(
    !/\balter\s+table\b|\bcreate\s+table\b|\bdrop\s+table\b/i.test(
      s.replace(/^--.*$/gm, "")
    ),
    "el script legal no debe contener DDL: no es una migración"
  );
  assert(
    /\bdelete\s+from\b/i.test(s.replace(/^--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''")) === false,
    "el script legal jamás debe borrar documentos: v1 se archiva, no se elimina"
  );
});

// ===========================================================================
console.log("\n§8 · Contrato de claves de Supabase\n");

check("14. El cliente administrativo sigue siendo server-only", () => {
  const s = read("lib/supabase/admin.ts");
  assert(
    s.trimStart().startsWith('import "server-only"'),
    "admin.ts debe seguir empezando por import \"server-only\""
  );
});

check("15. SUPABASE_SECRET_KEY es la variable PRINCIPAL del cliente administrativo", () => {
  const s = read("lib/supabase/admin.ts");
  const secretIdx = s.indexOf("SUPABASE_SECRET_KEY");
  const legacyIdx = s.indexOf("SUPABASE_SERVICE_ROLE_KEY");
  assert(secretIdx !== -1, "debe leerse SUPABASE_SECRET_KEY");
  assert(legacyIdx !== -1, "debe conservarse la compatibilidad con SUPABASE_SERVICE_ROLE_KEY");
  assert(
    secretIdx < legacyIdx,
    "SUPABASE_SECRET_KEY debe evaluarse ANTES que el nombre heredado"
  );
  assert(
    /SUPABASE_SECRET_KEY\s*\?\?\s*[\s\S]{0,40}SUPABASE_SERVICE_ROLE_KEY/.test(s),
    "el heredado debe ser solo un respaldo (??), nunca el principal"
  );
});

check("16. Ninguna clave secreta puede llegar al navegador", () => {
  // Ni el nombre secreto lleva prefijo público…
  for (const file of ["lib/supabase/admin.ts", "lib/supabase/browser.ts", "lib/supabase/server.ts"]) {
    const s = read(file);
    assert(
      !/NEXT_PUBLIC_SUPABASE_SECRET_KEY|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/.test(s),
      `${file} no debe exponer una clave secreta con prefijo NEXT_PUBLIC_`
    );
  }
  // …ni el cliente del navegador toca ninguna clave secreta.
  const browser = read("lib/supabase/browser.ts");
  assert(
    !/SUPABASE_SECRET_KEY|SERVICE_ROLE/.test(browser.replace(/\/\*[\s\S]*?\*\//g, "")),
    "browser.ts no debe referirse a ninguna clave secreta"
  );
  assert(
    browser.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    "browser.ts debe usar la clave pública publishable como principal"
  );
  assert(
    browser.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    "browser.ts debe conservar el respaldo heredado de la clave pública"
  );
  const pubIdx = browser.indexOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const anonIdx = browser.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  assert(pubIdx < anonIdx, "la publishable key debe ser la principal, la anon el respaldo");
});

check("16b. El cliente de servidor usa la misma jerarquía de clave pública", () => {
  const s = read("lib/supabase/server.ts");
  assert(
    s.trimStart().startsWith('import "server-only"'),
    "server.ts debe seguir siendo server-only"
  );
  const pubIdx = s.indexOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const anonIdx = s.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  assert(pubIdx !== -1 && anonIdx !== -1 && pubIdx < anonIdx, "misma jerarquía que en el navegador");
  // Se comparan solo las sentencias, no los comentarios: la documentación
  // sí puede nombrar la clave secreta para explicar por qué NO se usa aquí.
  const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(
    !/SUPABASE_SECRET_KEY|SERVICE_ROLE/.test(code),
    "el cliente de sesión jamás debe leer una clave secreta"
  );
});

// ===========================================================================
console.log("\n§9 · Enlaces seguros en hints\n");

check("17. El clasificador de enlaces de hints sigue aceptando HTTPS e internos", () => {
  const ext = classifyHintUrl("https://www.icontec.org");
  assert(ext.ok === true && ext.external === true, "HTTPS debe aceptarse como enlace externo");
  const internal = classifyHintUrl("/trazadocs");
  assert(
    internal.ok === true && internal.external === false,
    "una ruta interna de Trazaloop debe aceptarse como enlace interno"
  );
});

check("17b. El clasificador sigue rechazando esquemas peligrosos y HTTP plano", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "http://ejemplo.com",
  ]) {
    assert(
      classifyHintUrl(bad).ok === false,
      `«${bad}» debía rechazarse por el clasificador de hints`
    );
  }
  assert(
    classifyHintUrl("//evil.com").ok === false,
    "una URL protocol-relative debía rechazarse"
  );
});

check("17c. CPR y Textiles comparten el MISMO parser de hints (nunca dos)", () => {
  const cprRenderer = "components/ui/hint-text.tsx";
  assert(exists(cprRenderer), `no se encontró ${cprRenderer}`);
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && read(rel).includes("parseHintText")) {
        users.push(rel);
      }
    }
  };
  walk("components");
  walk("app");
  walk("lib");
  assert(
    users.some((f) => f.includes("hint-links")),
    "el parser compartido lib/domain/hint-links debe seguir siendo la única fuente"
  );
});

// ===========================================================================
console.log("\n§10 · Login general de la plataforma\n");

check("18. El login sigue siendo general para Trazaloop, no exclusivo de CPR", () => {
  const authLayout = read("app/(auth)/layout.tsx");
  assert(
    authLayout.includes("Plataforma modular de trazabilidad"),
    "el riel de autenticación debe comunicar la identidad modular"
  );
  assert(
    !/NTC 6632|UNE-EN 15343/.test(authLayout),
    "el login compartido no debe presentarse con las normas exclusivas de CPR"
  );
  assert(
    !/Trazaloop CPR/.test(authLayout),
    "el login compartido no debe presentarse como el módulo CPR"
  );
});

check("18b. La portada mantiene un único acceso para todos los módulos", () => {
  const landing = read("app/page.tsx");
  assert(
    landing.includes("Una sola cuenta de Trazaloop"),
    "debe conservarse el mensaje de acceso único"
  );
  assert(
    landing.includes("entryHref"),
    "las tarjetas de módulo deben apuntar al acceso compartido"
  );
});

// ===========================================================================
console.log("\n§11 · Detección de ambiente de despliegue\n");

check("19. VERCEL_ENV=production con dominio *.vercel.app → NO es staging", () => {
  const env = {
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://trazaloop-prod.vercel.app",
  };
  assert(resolveDeploymentEnvironment(env) === "production", "debe resolverse como production");
  assert(isProductionEnvironment(env) === true, "debe ser producción");
  assert(isStagingEnvironment(env) === false, "un *.vercel.app en Production NO es staging");
  assert(environmentBadgeLabel(env) === null, "producción no muestra distintivo");
});

check("20. VERCEL_ENV=preview → es staging", () => {
  const env = { VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://x.vercel.app" };
  assert(resolveDeploymentEnvironment(env) === "preview", "debe resolverse como preview");
  assert(isStagingEnvironment(env) === true, "preview es staging");
  assert(environmentBadgeLabel(env) === "Ambiente staging", "preview muestra «Ambiente staging»");
});

check("21. VERCEL_TARGET_ENV=production → NO es staging (tiene prioridad)", () => {
  // Aun si VERCEL_ENV dijera preview, el target env manda.
  const env = { VERCEL_TARGET_ENV: "production", VERCEL_ENV: "preview" };
  assert(resolveDeploymentEnvironment(env) === "production", "VERCEL_TARGET_ENV debe tener prioridad");
  assert(isProductionEnvironment(env) === true, "debe ser producción");
  assert(environmentBadgeLabel(env) === null, "producción no muestra distintivo");
});

check("22. Local sin variables Vercel → development, comportamiento explícito", () => {
  const env = {};
  assert(resolveDeploymentEnvironment(env) === "development", "sin señales Vercel → development");
  assert(isProductionEnvironment(env) === false, "local no es producción");
  assert(isStagingEnvironment(env) === true, "local NO es productivo (falla del lado seguro)");
  assert(environmentBadgeLabel(env) === "Entorno local", "local muestra «Entorno local»");
});

check("23. Un nombre con «staging» no prevalece sobre VERCEL_ENV=production", () => {
  const env = {
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://staging-lookalike.ejemplo.com",
  };
  assert(
    isProductionEnvironment(env) === true,
    "el nombre del dominio NUNCA debe anular el ambiente declarado por Vercel"
  );
  assert(isStagingEnvironment(env) === false, "sigue siendo producción pese a «staging» en la URL");
});

check("23b. Un VERCEL_TARGET_ENV personalizado (p. ej. qa) no es producción", () => {
  const env = { VERCEL_TARGET_ENV: "qa" };
  assert(resolveDeploymentEnvironment(env) === "preview", "un target personalizado se trata como preview");
  assert(isProductionEnvironment(env) === false, "solo «production» es producción (falla cerrado)");
});

check("23c. lib/env.ts no usa el nombre del dominio para decidir el ambiente", () => {
  const source = read("lib/env.ts");
  // La función productiva no debe volver a mirar vercel.app / staging en la URL.
  const prodFn = source.slice(source.indexOf("export function resolveDeploymentEnvironment"));
  assert(
    !/vercel\.app|SITE_URL/i.test(prodFn.slice(0, prodFn.indexOf("export function isProductionEnvironment"))),
    "resolveDeploymentEnvironment no debe depender del dominio ni de NEXT_PUBLIC_SITE_URL"
  );
  assert(
    source.includes("VERCEL_TARGET_ENV") && source.includes("VERCEL_ENV"),
    "debe decidir por VERCEL_TARGET_ENV / VERCEL_ENV"
  );
});

check("23d. El shell muestra el distintivo por environmentBadgeLabel, no por dominio", () => {
  const layout = read("app/(app)/(shell)/layout.tsx");
  assert(layout.includes("environmentBadgeLabel"), "el shell debe usar environmentBadgeLabel");
  assert(
    !/vercel\.app/.test(layout),
    "el shell no debe reintroducir la heurística de dominio (vercel.app)"
  );
});

// ===========================================================================
console.log("\n§12 · Contrato completo de variables de entorno\n");

check("24. El precheck verifica TODAS las variables obligatorias reales", () => {
  const s = read("scripts/release/v1/precheck-env.ts");
  for (const v of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "TEXTILES_MODULE_ENABLED",
    "ACTIVE_ORG_COOKIE_SECRET",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    // Debe estar en el array REQUIRED, no solo mencionada en un comentario.
    assert(
      new RegExp(`name:\\s*"${v}"`).test(s),
      `${v} debe formar parte del contrato REQUIRED del precheck`
    );
  }
});

check("24b. Publishable y Secret son principales; anon y service_role solo fallback", () => {
  const s = read("scripts/release/v1/precheck-env.ts");
  assert(
    /name:\s*"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",\s*\n\s*legacy:\s*"NEXT_PUBLIC_SUPABASE_ANON_KEY"/.test(s),
    "la anon key debe ser el legacy de la publishable, no al revés"
  );
  assert(
    /name:\s*"SUPABASE_SECRET_KEY",\s*\n\s*legacy:\s*"SUPABASE_SERVICE_ROLE_KEY"/.test(s),
    "service_role debe ser el legacy de secret, no al revés"
  );
});

check("24c. ACTIVE_ORG_COOKIE_SECRET y NEXT_PUBLIC_SITE_URL sí los consume el código", () => {
  // Se prueban como obligatorios PORQUE el producto los lee. Esta prueba
  // ancla ese hecho: si dejaran de usarse, habría que revisar el contrato.
  const cookie = read("lib/auth/active-organization.ts");
  assert(
    cookie.includes("process.env.ACTIVE_ORG_COOKIE_SECRET"),
    "ACTIVE_ORG_COOKIE_SECRET debe seguir siendo consumida por la firma de la cookie"
  );
  const authAction = read("server/actions/auth.ts");
  // QUALITY-01.1: el enlace de invitación pasó a construirse con el origen REAL
  // de la petición (lib/auth/invitation-link.ts), porque en Preview la variable
  // apunta a un despliegue concreto y el enlace señalaba a uno viejo. La
  // variable sigue consumida ahí, como respaldo — la exigencia se comprueba
  // sobre el constructor, que es quien la usa ahora.
  const inviteLink = read("lib/auth/invitation-link.ts");
  assert(
    read("server/actions/team.ts").includes("buildInvitationLink"),
    "la creación de invitaciones debe usar el constructor de enlaces"
  );
  assert(
    authAction.includes("NEXT_PUBLIC_SITE_URL") && inviteLink.includes("NEXT_PUBLIC_SITE_URL"),
    "NEXT_PUBLIC_SITE_URL debe seguir construyendo enlaces (reset, invitaciones)"
  );
});

check("24d. .env.example declara el contrato real y separa heredadas de automáticas", () => {
  const s = read(".env.example");
  for (const v of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "TEXTILES_MODULE_ENABLED",
    "ACTIVE_ORG_COOKIE_SECRET",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    assert(new RegExp(`^${v}=`, "m").test(s), `.env.example debe declarar ${v}`);
  }
  assert(/COMPATIBILIDAD HEREDADA/i.test(s), "debe marcar las heredadas como compatibilidad");
  assert(/AUTOM[ÁA]TICAS de Vercel/i.test(s), "debe documentar las variables automáticas de Vercel");
  assert(
    /VERCEL_TARGET_ENV/.test(s),
    ".env.example debe mencionar VERCEL_TARGET_ENV como señal de ambiente"
  );
});

check("24e. El proxy (middleware) usa la publishable key con fallback, nunca un secreto", () => {
  const s = read("proxy.ts");
  assert(
    s.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    "el middleware debe usar la publishable key como principal"
  );
  assert(
    s.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    "el middleware debe conservar el fallback heredado"
  );
  assert(
    !/SUPABASE_SECRET_KEY|SERVICE_ROLE/.test(s),
    "el middleware jamás debe usar una clave secreta"
  );
});

// ===========================================================================
console.log("\n§13 · Scripts legales: publicación y reversión\n");

const PUBLISH_SQL = "scripts/release/v1/publish-legal-v2.sql";
const ROLLBACK_SQL = "scripts/release/v1/rollback-legal-v2.sql";

/** Quita comentarios de línea SQL para analizar solo sentencias. */
const sqlCode = (s: string) => s.replace(/^\s*--.*$/gm, "");
/** Quita además los literales entre comillas simples. */
const sqlBare = (s: string) => sqlCode(s).replace(/'(?:[^']|'')*'/g, "''");
/**
 * Quita los documentos aprobados incrustados en literales entre comillas de
 * dólar ($terms$…$terms$ y $privacy$…$privacy$). Su prosa jurídica no es
 * código SQL y no debe analizarse como tal.
 */
const stripDocLiterals = (s: string) =>
  s
    .replace(/\$terms\$[\s\S]*?\$terms\$/g, "$terms$…$terms$")
    .replace(/\$privacy\$[\s\S]*?\$privacy\$/g, "$privacy$…$privacy$");

check("25. Existe el script de rollback legal", () => {
  assert(exists(ROLLBACK_SQL), "debe existir scripts/release/v1/rollback-legal-v2.sql");
  const s = read(ROLLBACK_SQL);
  assert(s.includes("NO SE HA EJECUTADO"), "el rollback debe declarar que no se ha ejecutado");
});

check("26. El estado v1 se valida por igualdad EXACTA, nunca con LIKE/ILIKE", () => {
  const s = read(PUBLISH_SQL);
  // Igualdad exacta de título y contenido contra los literales de 0066.
  assert(
    /and title\s+=\s+c_terms_v1_title/.test(s) && /and content\s+=\s+c_terms_v1_content/.test(s),
    "terms/v1 debe validarse por igualdad exacta de título y contenido"
  );
  assert(
    /and title\s+=\s+c_privacy_v1_title/.test(s) &&
      /and content\s+=\s+c_privacy_v1_content/.test(s),
    "privacy/v1 debe validarse por igualdad exacta de título y contenido"
  );
  // Prohibido cualquier LIKE/ILIKE que compare el CONTENIDO o TÍTULO de v1
  // contra un prefijo (el defecto corregido en esta pasada).
  assert(
    !/(content|title)\s+i?like\s+'(Esta es|Términos de uso de Trazaloop \(|Política de privacidad de Trazaloop \()/i.test(
      s
    ),
    "la validación de v1 no debe usar coincidencias parciales con LIKE/ILIKE"
  );
  assert(
    !/content\s+like\s+/i.test(sqlCode(s)),
    "no debe quedar ningún `content LIKE` en el script"
  );
});

check("26b. El script incorpora los literales exactos de la migración 0066", () => {
  const migration = read("supabase/migrations/0066_legal_documents_and_acceptances.sql");
  const s = read(PUBLISH_SQL);
  // Fragmentos textuales que deben coincidir carácter por carácter.
  const fragments = [
    "Términos de uso de Trazaloop (versión preliminar)",
    "Política de privacidad de Trazaloop (versión preliminar)",
    "Esta es una versión preliminar de los términos de uso de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.",
    "Esta es una versión preliminar de la política de privacidad de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.",
  ];
  for (const f of fragments) {
    assert(migration.includes(f), `la migración 0066 debía contener: ${f.slice(0, 50)}…`);
    assert(
      s.includes(f),
      `el script debe replicar literalmente el texto de 0066: ${f.slice(0, 50)}…`
    );
  }
  // Huella md5 declarada como diagnóstico reproducible.
  assert(
    /c_terms_v1_md5\s+constant text := '[0-9a-f]{32}'/.test(s) &&
      /c_privacy_v1_md5\s+constant text := '[0-9a-f]{32}'/.test(s),
    "deben declararse las huellas md5 del texto v1 esperado"
  );
});

check("27. Ninguno de los dos scripts contiene metacomandos de psql", () => {
  // Se declaran compatibles con el SQL Editor de Supabase: por tanto NO
  // pueden contener \pset, \echo, \timing, etc.
  for (const f of [PUBLISH_SQL, ROLLBACK_SQL]) {
    const s = read(f);
    const meta = s.match(/^\\\w+/gm);
    assert(
      meta === null,
      `${f} declara compatibilidad con SQL Editor pero contiene metacomandos psql: ${meta?.join(", ")}`
    );
    assert(
      /SQL Editor/i.test(s),
      `${f} debe declarar explícitamente su compatibilidad de ejecución`
    );
  }
});

check("28. Ambos scripts protegen contra ejecución concurrente", () => {
  for (const f of [PUBLISH_SQL, ROLLBACK_SQL]) {
    const s = read(f);
    assert(
      s.includes("pg_advisory_xact_lock"),
      `${f} debe tomar un advisory transaction lock (se libera solo al terminar la txn)`
    );
    assert(
      /for update/i.test(sqlCode(s)),
      `${f} debe bloquear explícitamente las filas relevantes`
    );
  }
  // Misma clave en ambos: deben excluirse mutuamente.
  const keyOf = (f: string) => read(f).match(/c_lock_key constant bigint := (\d+)/)?.[1];
  const k1 = keyOf(PUBLISH_SQL);
  const k2 = keyOf(ROLLBACK_SQL);
  assert(!!k1 && k1 === k2, `publicar y revertir deben compartir la clave de lock (${k1} vs ${k2})`);
});

check("29. Ambos scripts exigen ROW_COUNT exacto con GET DIAGNOSTICS", () => {
  for (const f of [PUBLISH_SQL, ROLLBACK_SQL]) {
    const s = read(f);
    assert(
      /get diagnostics\s+v_rows\s*=\s*row_count/i.test(s),
      `${f} debe usar GET DIAGNOSTICS … ROW_COUNT`
    );
    const exact = s.match(/if v_rows <> 2 then/g) ?? [];
    assert(
      exact.length >= 2,
      `${f} debe exigir exactamente 2 filas en cada paso de escritura (encontrados ${exact.length})`
    );
  }
});

check("30. La publicación censa filas v2 en CUALQUIER estado", () => {
  const s = read(PUBLISH_SQL);
  // El censo se hace por version='v2' sin filtrar por status.
  const censusIdx = s.indexOf("where version = 'v2'");
  assert(censusIdx !== -1, "debe existir un censo por version = 'v2'");
  const censusStmt = s.slice(s.lastIndexOf("select", censusIdx), censusIdx + 200);
  assert(
    !/and status\s*=\s*'active'\s*$/m.test(censusStmt.split("where version = 'v2'")[0]),
    "el censo no debe restringirse a filas activas"
  );
  assert(
    s.includes("ESTADO v2 INESPERADO"),
    "debe abortar explícitamente ante cualquier combinación v2 no admitida"
  );
  // Debe contemplar draft y archived en la explicación del fallo.
  assert(
    /draft/i.test(s) && /archivado/i.test(s),
    "debe contemplar expresamente los estados draft y archived"
  );
  assert(
    s.includes("legal_documents_one_active_per_type") &&
      s.includes("legal_documents_type_version_uniq"),
    "debe documentar las restricciones reales de 0066 en las que NO se apoya para detectar el error"
  );
});

check("31. Ambos scripts son transaccionales", () => {
  for (const f of [PUBLISH_SQL, ROLLBACK_SQL]) {
    const s = read(f);
    assert(/^begin;$/m.test(s), `${f} debe abrir una transacción explícita`);
    assert(/^commit;$/m.test(s), `${f} debe cerrar la transacción explícitamente`);
  }
});

check("32. El rollback no borra ni altera: sin DELETE, TRUNCATE, DROP ni ALTER", () => {
  const bare = sqlBare(read(ROLLBACK_SQL));
  for (const rx of [
    /\bdelete\s+from\b/i,
    /\btruncate\b/i,
    /\bdrop\s+\w+/i,
    /\balter\s+\w+/i,
  ]) {
    assert(!rx.test(bare), `el rollback no debe contener ${rx}`);
  }
  const s = read(ROLLBACK_SQL);
  assert(
    s.includes("set status = 'archived'") && s.includes("set status = 'active'"),
    "el rollback debe archivar v2 y reactivar v1 mediante UPDATE de estado"
  );
});

check("32b. El rollback exige las precondiciones exactas", () => {
  const s = read(ROLLBACK_SQL);
  assert(
    /v_v2_terms_active\s+<> 1/.test(s) && /v_v2_privacy_active <> 1/.test(s),
    "debe exigir exactamente 1 terms/v2 y 1 privacy/v2 activos"
  );
  assert(
    /v_v1_terms_arch\s+<> 1/.test(s) && /v_v1_privacy_arch\s+<> 1/.test(s),
    "debe exigir exactamente 1 terms/v1 y 1 privacy/v1 archivados"
  );
});

check("33. Los scripts legales NO se añadieron como migración", () => {
  const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  for (const name of ["publish-legal", "rollback-legal", "legal-v2", "legal_v2"]) {
    assert(
      !migrations.some((f) => f.toLowerCase().includes(name)),
      `ningún archivo de migración debe llamarse como el script operativo (${name})`
    );
  }
  // Y siguen sin existir migraciones nuevas.
  const beyond = migrations.filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 106);
  assert(beyond.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)).length === 0, `PCR-03 original termina en 0108; después solo son autorizadas 0109, 0110, 0111 y 0112; migraciones no declaradas: ${beyond.join(", ")}`);
});

check("34. La aprobación legal está declarada y el fail-closed sigue intacto", () => {
  const s = read(PUBLISH_SQL);
  assert(
    /c_legal_approval_confirmed constant boolean := true;/.test(s),
    "la aprobación legal del 27 de julio de 2026 debe estar declarada en true"
  );
  assert(
    !/c_legal_approval_confirmed constant boolean := false/.test(s),
    "no puede quedar ninguna declaración residual en false"
  );
  // El mecanismo fail-closed NO desaparece: si alguien la devuelve a false,
  // el script sigue abortando antes de escribir.
  assert(
    /if not c_legal_approval_confirmed then[\s\S]{0,200}raise exception/.test(s),
    "debe seguir abortando si se retira la aprobación"
  );
  assert(
    /27 de julio de 2026/.test(s),
    "el script debe llevar el comentario de aprobación del 27 de julio de 2026"
  );
});

check("35. El informe legal declara los bloqueos y los requisitos pendientes", () => {
  const doc = read("docs/releases/V1.0.0_LEGAL_REVIEW.md");
  assert(/NO-GO/.test(doc), "el informe debe mantener el estado NO-GO");
  assert(
    /pendiente de redacción y aprobación jurídica/i.test(doc),
    "debe declarar que la política de privacidad sigue pendiente"
  );
  // Los 13 requisitos pendientes.
  for (let i = 1; i <= 13; i++) {
    const id = `P-${String(i).padStart(2, "0")}`;
    assert(doc.includes(id), `el informe debe listar el requisito ${id}`);
  }
  // Las frases riesgosas marcadas.
  for (const id of ["L-3a", "L-3b", "L-3c", "L-3d", "L-3e"]) {
    assert(doc.includes(id), `el informe debe marcar la frase ${id} para revisión legal`);
  }
  assert(
    /sin perder los datos ya cargados/.test(doc),
    "debe citarse la promesa absoluta marcada (L-3a)"
  );
  assert(
    !/cumple la legislación colombiana|conforme a la ley colombiana/i.test(doc),
    "el informe NO debe afirmar cumplimiento normativo"
  );
});

// ===========================================================================
console.log("\n§14 · Paquete jurídico v1.0 aprobado y documentos auxiliares\n");

const LEGAL_DIR = "docs/legal";

/** Los SEIS documentos APROBADOS que componen el paquete jurídico v1.0.
 *  Aprobación comunicada por la dirección del proyecto el 27 de julio de
 *  2026. Ninguno conserva la marca de borrador. */
const LEGAL_PACKAGE_SIX = [
  "V1.0.0_TERMS_APPROVED.md",
  "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
  "V1.0.0_PRIVACY_NOTICE_APPROVED.md",
  "V1.0.0_REGISTRATION_AUTHORIZATION_APPROVED.md",
  "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md",
  "V1.0.0_COOKIE_POLICY_APPROVED.md",
];

/** Los TRES documentos auxiliares que NO se aprobaron y siguen fuera de
 *  alcance: la especificación de mercadeo, la política de conservación y la
 *  auditoría de huecos. Conservan la marca de borrador. */
const LEGAL_AUX_DRAFTS = [
  "V1.0.0_MARKETING_CONSENT_DRAFT.md",
  "V1.0.0_RETENTION_AND_DELETION_POLICY_DRAFT.md",
  "V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md",
];

/** Registro interno de la aprobación. Ni publicable ni jurídico. */
const LEGAL_APPROVAL_RECORD = "V1.0.0_APPROVAL_RECORD.md";

const LEGAL_DRAFTS = [...LEGAL_PACKAGE_SIX, ...LEGAL_AUX_DRAFTS];
const draft = (name: string) => read(`${LEGAL_DIR}/${name}`);
const allDrafts = () => LEGAL_DRAFTS.map(draft).join("\n\n");

check("36. Existen los seis aprobados, los tres auxiliares y el registro", () => {
  for (const name of LEGAL_DRAFTS) {
    assert(exists(`${LEGAL_DIR}/${name}`), `falta el documento ${LEGAL_DIR}/${name}`);
  }
  assert(LEGAL_PACKAGE_SIX.length === 6, "el paquete aprobado son seis documentos");
  assert(LEGAL_AUX_DRAFTS.length === 3, "deben quedar tres auxiliares fuera de alcance");
  assert(LEGAL_DRAFTS.length === 9, "nueve documentos en total en docs/legal");
  // Y los borradores antiguos ya no existen con su nombre de borrador.
  for (const viejo of [
    "V1.0.0_TERMS_DRAFT.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_DRAFT.md",
    "V1.0.0_PRIVACY_NOTICE_DRAFT.md",
    "V1.0.0_REGISTRATION_AUTHORIZATION_DRAFT.md",
    "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_DRAFT.md",
    "V1.0.0_COOKIE_POLICY_DRAFT.md",
  ]) {
    assert(!exists(`${LEGAL_DIR}/${viejo}`), `${viejo} debió renombrarse a _APPROVED`);
  }
  assert(exists(`${LEGAL_DIR}/${LEGAL_APPROVAL_RECORD}`), "falta el registro de aprobación");
});

check("37. Los seis aprobados NO llevan la marca de borrador; los tres auxiliares sí", () => {
  const BANNER = "BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR";
  for (const name of LEGAL_PACKAGE_SIX) {
    const s = draft(name);
    assert(!s.includes(BANNER), `${name} NO debe conservar «${BANNER}»`);
    assert(
      !/pendiente de (aprobación|redacción) jurídica/i.test(s),
      `${name} no puede seguir declarándose pendiente de aprobación`
    );
  }
  // Los auxiliares no adoptados siguen identificados como tales.
  for (const name of LEGAL_AUX_DRAFTS) {
    const s = draft(name);
    assert(s.includes(BANNER), `${name} debe conservar «${BANNER}»`);
    const head = s.split("\n").slice(0, 5).join("\n");
    assert(head.includes(BANNER), `${name} debe llevar el aviso en la parte SUPERIOR`);
  }
});

check("37b. Los seis aprobados declaran aprobación, vigencia, versión y canales", () => {
  for (const name of LEGAL_PACKAGE_SIX) {
    const s = draft(name);
    for (const [etiqueta, rx] of [
      ["fecha de aprobación", /\*\*Fecha de aprobación:\*\* 27 de julio de 2026/],
      ["fecha de entrada en vigor", /\*\*Fecha de entrada en vigor:\*\* 27 de julio de 2026/],
      ["versión comercial", /\*\*Versión comercial:\*\* 1\.0/],
      ["sitio", /\*\*Sitio:\*\* https:\/\/www\.trazaloop\.com/],
      [
        "responsable",
        /\*\*Responsable:\*\* CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL/,
      ],
      ["NIT", /\*\*NIT:\*\* 901835846-6/],
      ["canal legal", /\*\*Canal legal y de privacidad:\*\* contacto@idendi\.org/],
      ["canal de soporte", /\*\*Canal de soporte técnico:\*\* contacto@cirquiloconsultores\.com/],
    ] as const) {
      assert(rx.test(s), `${name} debe declarar ${etiqueta}`);
    }
    // La aprobación se atribuye a la dirección del proyecto, nunca a una
    // persona concreta: su identidad no consta en las instrucciones.
    assert(
      /aprobado por la dirección del proyecto el 27 de julio de 2026/i.test(
        s.replace(/\n>\s*/g, " ").replace(/\s+/g, " ")
      ),
      `${name} debe atribuir la aprobación a la dirección del proyecto`
    );
    assert(
      !/aprobado por (el|la) (abogad|doctor|dr\.|licenciad)/i.test(s),
      `${name} no puede atribuir la aprobación a un profesional concreto`
    );
  }
});

check("37c. El registro interno de aprobación es completo y sin datos sensibles", () => {
  const r = draft(LEGAL_APPROVAL_RECORD);
  assert(/Paquete jurídico de Trazaloop v1\.0/i.test(r), "debe nombrar el paquete aprobado");
  assert(/27 de julio de 2026/.test(r), "debe fijar la fecha de aprobación");
  assert(
    /comunicada por.{0,40}la dirección del proyecto/i.test(r.replace(/\s+/g, " ")),
    "debe declarar que la aprobación la comunicó la dirección del proyecto"
  );
  assert(
    /evidencia completa de la aprobación se conserva.{0,20}fuera de este repositorio/i.test(
      r.replace(/\s+/g, " ")
    ),
    "debe declarar que la evidencia se conserva fuera del repositorio"
  );
  // Alcance: los seis documentos, cada uno por su archivo aprobado.
  for (const name of LEGAL_PACKAGE_SIX) {
    assert(r.includes(name), `el registro debe inventariar ${name}`);
  }
  // Los auxiliares figuran como FUERA de alcance.
  for (const name of LEGAL_AUX_DRAFTS) {
    assert(r.includes(name), `el registro debe declarar fuera de alcance ${name}`);
  }
  // Sin firmas, documentos personales ni información confidencial.
  for (const rx of [
    /firma (manuscrita|electrónica|digital) de/i,
    /cédula (de ciudadanía )?n[úu]mero/i,
    /documento de identidad n[úu]mero/i,
    /confidencial:/i,
  ]) {
    assert(!rx.test(r), `el registro no puede contener ${rx}`);
  }
});

check("38. Ningún borrador declara cumplimiento legal", () => {
  const FORBIDDEN = [
    /cumple\s+(con\s+)?la\s+(legislación|ley|normativa)/i,
    /conforme\s+a\s+la\s+ley\s+colombiana/i,
    /da\s+cumplimiento\s+a\s+la\s+ley/i,
    /cumplimiento\s+garantizado/i,
    /jurídicamente\s+válido\s+y\s+definitivo/i,
  ];
  for (const name of LEGAL_DRAFTS) {
    const s = draft(name);
    for (const rx of FORBIDDEN) {
      assert(!rx.test(s), `${name} no debe declarar cumplimiento legal (${rx})`);
    }
  }
  // La política aprobada cita su marco normativo de referencia SIN
  // declarar cumplimiento: la aprobación no convierte el texto en un
  // certificado de conformidad.
  const policy = draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md");
  assert(
    /Marco normativo tomado como referencia/i.test(policy) &&
      /sin declarar cumplimiento/i.test(policy),
    "la política debe citar su marco de referencia sin declarar cumplimiento"
  );
});

check("39. El SMTP predeterminado de Supabase NO se presenta como apto para producción", () => {
  const gaps = draft("V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md");
  assert(
    /solo se admite para staging y pruebas/i.test(gaps) ||
      /solo.*staging.*pruebas/i.test(gaps),
    "los gaps deben restringir el SMTP de Supabase a staging y pruebas"
  );
  assert(
    /no es apto para producción/i.test(gaps),
    "debe declararse que el SMTP predeterminado no es apto para producción"
  );
  // Y debe figurar como bloqueador.
  assert(
    /B-01.*SMTP|SMTP.*producción.*🚫|Proveedor SMTP de producción/i.test(gaps),
    "el proveedor SMTP de producción debe figurar como bloqueador"
  );
  // Nadie debe afirmar lo contrario en los demás borradores.
  assert(
    !/SMTP.{0,60}(apto|suficiente|válido) para producción/i.test(allDrafts()),
    "ningún borrador debe presentar el SMTP temporal como apto para producción"
  );
});

check("40. El consentimiento de mercadeo es separado, opcional y desmarcado", () => {
  const m = draft("V1.0.0_MARKETING_CONSENT_DRAFT.md");
  assert(/casilla separada/i.test(m), "debe exigir casilla separada");
  assert(/opcional/i.test(m), "debe ser opcional");
  assert(/desmarcada por defecto/i.test(m), "debe estar desmarcada por defecto");
  assert(
    /no\s+necesaria\s+para\s+crear/i.test(m) || /No necesaria/i.test(m),
    "no debe ser necesaria para crear ni usar la cuenta"
  );
  assert(/revocable/i.test(m), "debe ser revocable");
  // Separación estricta de comunicaciones necesarias.
  for (const t of ["recuperación de contraseña", "invitaciones", "soporte", "seguridad"]) {
    assert(
      new RegExp(t, "i").test(m),
      `debe declarar la separación respecto de: ${t}`
    );
  }
  // Y NO debe mezclarse con la aceptación legal.
  assert(
    /independiente/i.test(m),
    "debe declararse independiente de la aceptación legal"
  );
});

check("41. GA4 no se clasifica como cookie necesaria", () => {
  const c = draft("V1.0.0_COOKIE_POLICY_APPROVED.md");
  assert(
    /GA4 y GTM \*\*NO son cookies estrictamente necesarias\*\*|NO son cookies estrictamente necesarias/i.test(c),
    "la política debe negar expresamente que GA4/GTM sean necesarias"
  );
  assert(
    /Analítica.*opcional.*DESACTIVADA por defecto/i.test(c),
    "la analítica debe ser opcional y estar desactivada por defecto"
  );
  // Search Console distinguido del rastreo por cookies.
  assert(
    /Google Search Console no es una cookie/i.test(c),
    "debe distinguirse Search Console de las etiquetas del navegador"
  );
  // Categorías exigidas.
  for (const cat of ["Necesarias", "Analítica", "Mercadeo"]) {
    assert(new RegExp(cat, "i").test(c), `falta la categoría ${cat}`);
  }
});

check("42. Se conserva el NO-GO jurídico y sus bloqueadores", () => {
  const gaps = draft("V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md");
  assert(/NO-GO/.test(gaps), "los gaps deben mantener el NO-GO");
  // Los trece bloqueadores exigidos.
  for (let i = 1; i <= 13; i++) {
    const id = `B-${String(i).padStart(2, "0")}`;
    assert(gaps.includes(id), `debe listarse el bloqueador ${id}`);
  }
  // Decisiones abiertas heredadas.
  assert(gaps.includes("L-2"), "la decisión L-2 debe seguir abierta");
  // El informe de release sigue en NO-GO.
  const review = read("docs/releases/V1.0.0_LEGAL_REVIEW.md");
  assert(/NO-GO/.test(review), "el informe de release debe conservar el NO-GO");
});

check("43. El script contiene EXACTAMENTE los textos aprobados", () => {
  const s = read(PUBLISH_SQL);
  assert(
    /c_legal_approval_confirmed constant boolean := true;/.test(s),
    "c_legal_approval_confirmed debe estar en true tras la aprobación"
  );
  // Ninguna marca de borrador puede haberse colado.
  assert(
    !s.includes("BORRADOR PARA REVISIÓN JURÍDICA"),
    "no puede trasladarse ninguna marca de borrador al script"
  );

  // Igualdad CARÁCTER POR CARÁCTER con los documentos aprobados. Los textos
  // van en literales entre comillas de dólar, así que se extraen por sus
  // etiquetas y se comparan enteros.
  const entre = (tag: string) => {
    const abre = s.indexOf(`$${tag}$`);
    assert(abre !== -1, `falta el literal $${tag}$ en el script`);
    const ini = abre + tag.length + 2;
    const fin = s.indexOf(`$${tag}$`, ini);
    assert(fin !== -1, `el literal $${tag}$ no está cerrado`);
    return s.slice(ini, fin);
  };
  assert(
    entre("terms") === draft("V1.0.0_TERMS_APPROVED.md"),
    "c_terms_v2_content debe ser el texto EXACTO de V1.0.0_TERMS_APPROVED.md"
  );
  assert(
    entre("privacy") === draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md"),
    "c_privacy_v2_content debe ser el texto EXACTO de la política aprobada"
  );

  // Títulos visibles con la versión COMERCIAL 1.0.
  assert(
    /c_terms_v2_title constant text :=\s*\n\s*'Términos de uso de Trazaloop v1\.0';/.test(s),
    "el título de los términos debe indicar Trazaloop v1.0"
  );
  assert(
    /c_privacy_v2_title constant text :=\s*\n\s*'Política de privacidad y tratamiento de datos personales v1\.0';/.test(
      s
    ),
    "el título de la política debe indicar la versión comercial 1.0"
  );

  // La versión INTERNA sigue siendo v2: v1 ya existe desde la 0066.
  assert(
    LEGAL_PACKAGE_DOCUMENT_DB_VERSION === "v2",
    "la versión interna en legal_documents debe seguir siendo v2"
  );
  assert(
    /\('terms',\s+'v2',\s+c_terms_v2_title/.test(s) &&
      /\('privacy',\s+'v2',\s+c_privacy_v2_title/.test(s),
    "los INSERT deben seguir usando la versión interna v2"
  );
});

check("43b. La publicación no arrastra el DPA, el mercadeo ni la apertura del registro", () => {
  const s = read(PUBLISH_SQL);
  // Se analiza SOLO el andamiaje SQL: los documentos aprobados van dentro
  // de literales entre comillas de dólar y su prosa no es código.
  const sql = sqlBare(stripDocLiterals(s));

  // El anexo de tratamiento NO se inserta como documento activo.
  assert(
    !/data_processing/i.test(sql),
    "el script no debe insertar ningún documento de tipo data_processing"
  );
  // Ni consentimiento de mercadeo, ni kill switch de registro.
  assert(!/mercadeo|marketing/i.test(sql), "el script no puede introducir mercadeo");
  assert(
    !/PUBLIC_REGISTRATION_ENABLED/.test(sql),
    "el script de publicación jamás debe tocar el kill switch del registro"
  );
  // Ni DDL, ni borrados, ni cambios sobre aceptaciones históricas.
  for (const rx of [
    /\bdelete\s+from\b/i,
    /\btruncate\b/i,
    /\bdrop\b/i,
    /\balter\s+table\b/i,
    /\bcreate\s+(table|index|type|function)\b/i,
  ]) {
    assert(!rx.test(sql), `el script no puede contener ${rx}`);
  }
  assert(
    !/update\s+public\.user_legal_acceptances|insert\s+into\s+public\.user_legal_acceptances|delete[\s\S]{0,40}user_legal_acceptances/i.test(
      sql
    ),
    "el script no puede escribir sobre las aceptaciones históricas"
  );
  // Solo dos escrituras: archivar v1 y publicar v2.
  const escrituras = sql.match(/\b(update|insert into)\s+public\.legal_documents\b/gi) ?? [];
  assert(
    escrituras.length === 2,
    `solo se admiten 2 escrituras sobre legal_documents, hay ${escrituras.length}`
  );
});

check("44. Los borradores identifican los módulos CPR y Textiles", () => {
  for (const name of [
    "V1.0.0_TERMS_APPROVED.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
  ]) {
    const s = draft(name);
    assert(/Trazaloop CPR/.test(s), `${name} debe identificar Trazaloop CPR`);
    assert(/Trazaloop Textiles/.test(s), `${name} debe identificar Trazaloop Textiles`);
    assert(/NTC 6632/.test(s), `${name} debe mencionar NTC 6632`);
    assert(/UNE-EN 15343/.test(s), `${name} debe mencionar UNE-EN 15343`);
  }
  // Y no deben atribuir a Trazaloop facultades de certificación: la
  // cláusula «Qué NO es Trazaloop» debe enumerar todas las negaciones.
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  const negIdx = terms.indexOf("Qué NO es Trazaloop");
  assert(negIdx !== -1, "los términos deben incluir la cláusula «Qué NO es Trazaloop»");
  const negBlock = terms.slice(negIdx, terms.indexOf("###", negIdx + 10));
  for (const negacion of [
    "certifica productos",
    "certifica procesos",
    "reemplaza a organismos de certificación",
    "garantiza la conformidad",
    "garantiza la aceptación de una auditoría",
    "emite conceptos jurídicos",
    "garantiza resultados comerciales",
  ]) {
    assert(
      negBlock.includes(negacion),
      `la cláusula «Qué NO es Trazaloop» debe negar: ${negacion}`
    );
  }
  assert(
    /herramienta de gestión, soporte documental y[\s\S]{0,20}trazabilidad/.test(negBlock),
    "debe describirse como herramienta de gestión, soporte documental y trazabilidad"
  );
});

check("45. La conservación se expresa por CRITERIOS, no por calendarios inventados", () => {
  const r = draft("V1.0.0_RETENTION_AND_DELETION_POLICY_DRAFT.md");

  // Los cinco criterios exigidos.
  for (const criterio of [
    /mientras exista la relación contractual o la cuenta/i,
    /obligaciones legales/i,
    /auditoría/i,
    /defender reclamaciones|defensa de reclamaciones/i,
    /suprime, anonimiza o bloquea|supresión, anonimización o bloqueo/i,
    /canales de contacto/i,
    /copias de respaldo/i,
  ]) {
    assert(criterio.test(r), `la política debe expresar el criterio ${criterio}`);
  }

  // La promesa absoluta sigue documentada como RETIRADA.
  assert(
    /se retira|sustituye/i.test(r) && r.includes("sin perder los datos ya cargados"),
    "debe documentarse la retirada de la promesa «sin perder los datos ya cargados»"
  );

  // El calendario de días concretos se conserva SOLO como opción descartada.
  const anexoIdx = r.indexOf("Calendario propuesto y NO ADOPTADO");
  assert(anexoIdx !== -1, "el calendario debe vivir en un anexo marcado NO ADOPTADO");
  for (const plazo of ["30 días", "90 días", "120 días"]) {
    const first = r.indexOf(plazo);
    assert(
      first === -1 || first > anexoIdx,
      `«${plazo}» solo puede aparecer dentro del anexo no adoptado`
    );
  }
  assert(
    /NO se adopta, NO se aplica y NO[\s>]+se traslada/i.test(r),
    "debe declararse expresamente que el calendario no se adopta ni se traslada"
  );

  // Y no se promete ninguna automatización inexistente.
  assert(
    /eliminación automática integral/i.test(r) && /no afirma/i.test(r),
    "debe negarse expresamente la eliminación automática integral"
  );
});

check("45b. Ningún documento publicable promete calendarios ni automatismos", () => {
  const PUBLICABLES = [
    "V1.0.0_TERMS_APPROVED.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
    "V1.0.0_PRIVACY_NOTICE_APPROVED.md",
    "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md",
    "V1.0.0_COOKIE_POLICY_APPROVED.md",
  ];
  for (const name of PUBLICABLES) {
    const s = draft(name);
    assert(
      !/ventana de exportación de \d+ días|máximo técnico ordinario|hasta \d+ días/i.test(s),
      `${name} no debe fijar un calendario técnico que la plataforma no ejecuta`
    );
    assert(
      !/sin perder los datos ya cargados/.test(s),
      `${name} no debe conservar la promesa absoluta de conservación`
    );
    assert(
      !/exportación automática|eliminación automática/i.test(s.replace(/no\s+(existe|afirma|garantiza)[^.]{0,120}/gi, "")),
      `${name} no debe prometer exportación ni eliminación automática`
    );
  }
});

check("46. Se identifica al operador con razón social y NIT correctos", () => {
  const RAZON = "CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL";
  const NIT = "901835846-6";
  for (const name of [
    "V1.0.0_TERMS_APPROVED.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
    "V1.0.0_PRIVACY_NOTICE_APPROVED.md",
    "V1.0.0_COOKIE_POLICY_APPROVED.md",
    "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md",
  ]) {
    const s = draft(name);
    assert(s.includes(RAZON), `${name} debe identificar la razón social exacta`);
    assert(s.includes(NIT), `${name} debe incluir el NIT ${NIT}`);
  }
  // Datos de contacto oficiales, sin inventar otros.
  const policy = draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md");
  assert(policy.includes("contacto@idendi.org"), "correo de privacidad correcto");
  // La dirección oficial es «Carrera 43A #15 Sur – 15»; se tolera el
  // espacio tras la almohadilla por compatibilidad con la redacción previa.
  assert(/Carrera 43A\s*#\s*15 Sur – 15/.test(policy), "dirección correcta");
  assert(policy.includes("Medellín, Colombia"), "domicilio correcto");
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  assert(terms.includes("Jhorman Mena Ledezma"), "representante legal correcto");
  assert(terms.includes("+57 324 3268865"), "teléfono correcto");
  assert(terms.includes("https://www.trazaloop.com"), "dominio oficial correcto");
  assert(
    terms.includes("contacto@cirquiloconsultores.com"),
    "correo de soporte correcto"
  );
});

check("47. Cirquilo Consultores y el SMTP permanecen como pendientes", () => {
  const gaps = draft("V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md");
  assert(
    /Cirquilo Consultores/.test(gaps),
    "los gaps deben mencionar a Cirquilo Consultores"
  );
  assert(
    /identidad jurídica y NIT de Cirquilo Consultores/i.test(gaps),
    "debe declararse pendiente la identidad jurídica y el NIT de Cirquilo"
  );
  assert(
    /bloqueador contractual/i.test(gaps),
    "Cirquilo debe marcarse como bloqueador contractual"
  );
  // También en el anexo de encargados.
  const addendum = draft("V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md");
  assert(
    /PENDIENTES/i.test(addendum) && /Cirquilo/.test(addendum),
    "el anexo debe marcar a Cirquilo como pendiente"
  );
});

check("48. Los gaps clasifican cada requisito y contrastan con el código real", () => {
  const gaps = draft("V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md");
  for (const estado of [
    "IMPLEMENTADO",
    "PARCIAL",
    "AUSENTE",
    "REQUIERE DECISIÓN",
    "NO APLICA",
  ]) {
    assert(gaps.includes(estado), `los gaps deben usar la clasificación ${estado}`);
  }
  // Debe citar evidencia real del repositorio.
  for (const ev of [
    "user_legal_acceptances",
    "REQUIRED_LEGAL_DOCUMENT_TYPES",
    "tz-active-org",
    "audit_log",
    "cleanup-staging.ts",
  ]) {
    assert(gaps.includes(ev), `los gaps deben citar la evidencia real ${ev}`);
  }
  // Y reconocer lo que NO existe en el código.
  assert(
    /No hay código de pagos|no hay ningún código de GA4/i.test(gaps),
    "los gaps deben declarar expresamente lo que no existe en el código"
  );
});

check("49. Los borradores no se publicaron ni se cargaron en la base", () => {
  // Ningún borrador debe haberse convertido en migración.
  const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  for (const f of migrations) {
    assert(
      !/terms|privacy|cookie|marketing|retention|addendum/i.test(f),
      `ninguna migración debe corresponder a los borradores legales: ${f}`
    );
  }
  const beyond = migrations.filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 106);
  assert(beyond.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)).length === 0, `PCR-03 original termina en 0108; después solo son autorizadas 0109, 0110, 0111 y 0112; migraciones no declaradas: ${beyond.join(", ")}`);
  // Los borradores viven en docs/legal, no en supabase/.
  for (const name of LEGAL_DRAFTS) {
    assert(
      exists(`${LEGAL_DIR}/${name}`) && !exists(`supabase/${name}`),
      `${name} debe vivir solo en ${LEGAL_DIR}`
    );
  }
});

// ===========================================================================
console.log("\n§15 · Ruta A — alcance del lanzamiento esencial\n");

const ROUTE_A = "docs/releases/V1.0.0_ROUTE_A_SCOPE.md";
const READINESS = "docs/releases/V1.0.0_PRODUCTION_READINESS.md";
const SMOKE = "docs/releases/V1.0.0_SMOKE_TESTS.md";

/** Ficheros de UI (.tsx) con los comentarios eliminados. */
function uiSources(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name)) {
        out.push({
          file: rel,
          code: read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
        });
      }
    }
  };
  walk("app");
  walk("components");
  walk("lib");
  walk("server");
  return out;
}

check("50. Existe el documento de alcance de Ruta A", () => {
  assert(exists(ROUTE_A), `debe existir ${ROUTE_A}`);
  const s = read(ROUTE_A);
  for (const sec of [
    "Alcance INCLUIDO",
    "Alcance APLAZADO",
    "Contratación y pagos",
    "Demo sigue siendo un plan comercial",
  ]) {
    assert(s.includes(sec), `${ROUTE_A} debe incluir la sección «${sec}»`);
  }
});

check("51. Demo sigue siendo plan comercial en el alcance", () => {
  const s = read(ROUTE_A);
  assert(
    /Demo es un plan comercial real/.test(s),
    "el alcance debe declarar Demo como plan comercial real"
  );
  assert(
    /no una versión experimental/.test(s),
    "debe negarse expresamente que Demo sea una versión experimental"
  );
  // Full y Extra: mismas funciones, distinto almacenamiento.
  assert(
    /Full.*Extra.*cuota de almacenamiento/.test(s.replace(/\s+/g, " ")),
    "debe conservarse la diferencia Full/Extra por almacenamiento"
  );
});

check("52. CPR y Textiles siguen funcionales; Quality y Construcción Próximamente", () => {
  const s = read(ROUTE_A);
  assert(/Trazaloop CPR/.test(s) && /Trazaloop Textiles/.test(s), "ambos módulos en el alcance");
  assert(
    /Quality.*Próximamente|Próximamente.*Quality/.test(s.replace(/\n/g, " ")),
    "Quality debe seguir como Próximamente"
  );
  assert(
    /Construcción/.test(s),
    "Trazaloop Construcción debe figurar como Próximamente"
  );
  // El documento de alcance de v1.0.0 es historia y no se reescribe. Lo que sí
  // se comprueba contra el código de hoy es que Construcción siga sin lanzarse.
  assert(FUNCTIONAL_MODULE_CODES.length === 3, "CPR, Textiles y Quality son los funcionales");
  assert(
    getCommercialModuleByKey("construccion")?.status === "coming_soon",
    "construccion debe seguir en coming_soon"
  );
});

check("53. Mercado Pago no se presenta como integrado", () => {
  // En la interfaz: ninguna mención.
  for (const { file, code } of uiSources()) {
    assert(
      !/mercado\s*pago/i.test(code),
      `${file} no debe mencionar Mercado Pago: no está integrado en v1.0.0`
    );
  }
  // En el alcance: declarado aplazado.
  const s = read(ROUTE_A);
  assert(
    /Mercado Pago/.test(s) && /No existe código de pagos/.test(s),
    "el alcance debe declarar Mercado Pago como aplazado y sin código"
  );
  assert(
    /no procesa.{0,30}tarjetas/i.test(s.replace(/\s+/g, " ")),
    "debe declararse que Trazaloop no procesa tarjetas"
  );
});

check("54. No se promete renovación automática técnica", () => {
  for (const { file, code } of uiSources()) {
    assert(
      !/renovaci[oó]n autom|se renueva autom|renovar autom|renovaremos autom/i.test(code),
      `${file} no debe prometer renovación automática: no existe en v1.0.0`
    );
  }
  const s = read(ROUTE_A);
  assert(
    /No existe renovación automática/i.test(s),
    "el alcance debe negar expresamente la renovación automática"
  );
  assert(
    /No existe aviso automático/i.test(s),
    "el alcance debe negar los avisos automáticos de renovación"
  );
  // La activación es manual, por el superadministrador.
  assert(
    /activación de Full o Extra la realiza el \*\*superadministrador\*\*|Activación de Full o Extra/i.test(s),
    "debe declararse que la activación la realiza el superadministrador"
  );
});

check("55. GA4 y GTM no están activos en el código ni en las dependencias", () => {
  const FORBIDDEN = [
    /\bgtag\s*\(/,
    /googletagmanager\.com/i,
    /google-analytics\.com/i,
    /window\.dataLayer/,
    /\bGTM-[A-Z0-9]{4,}/,
  ];
  for (const { file, code } of uiSources()) {
    for (const rx of FORBIDDEN) {
      assert(!rx.test(code), `${file} contiene analítica activa (${rx}) — aplazada en v1.0.0`);
    }
  }
  // Ni dependencias de analítica/mercadeo.
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const bad = deps.filter((d) =>
    /analytic|gtag|gtm|segment|mixpanel|posthog|hotjar|mailchimp|sendgrid/i.test(d)
  );
  assert(bad.length === 0, `dependencias de analítica/mercadeo no permitidas: ${bad.join(", ")}`);
});

check("56. No existe consentimiento de mercadeo activo", () => {
  for (const { file, code } of uiSources()) {
    assert(
      !/consentimiento de mercadeo|acepto recibir|autorizo.{0,40}(novedades|ofertas|promocion)/i.test(code),
      `${file} no debe implementar consentimiento de mercadeo: aplazado en v1.0.0`
    );
  }
  const s = read(ROUTE_A);
  assert(
    /sin consentimiento de mercadeo/i.test(s),
    "el alcance debe declarar que no hay consentimiento de mercadeo"
  );
});

check("57. No se clasifica ninguna cookie analítica como necesaria", () => {
  const s = read(ROUTE_A);
  // Las cookies permitidas son solo las técnicas.
  assert(
    /tz-active-org/.test(s),
    "el alcance debe inventariar la cookie técnica tz-active-org"
  );
  assert(
    !/Google Analytics.{0,80}necesaria|GA4.{0,80}necesaria/i.test(s.replace(/\s+/g, " ")),
    "GA4 nunca puede clasificarse como cookie necesaria"
  );
  // La política de cookies mantiene la prohibición.
  const cookiePolicy = read("docs/legal/V1.0.0_COOKIE_POLICY_APPROVED.md");
  assert(
    /NO son cookies estrictamente necesarias/i.test(cookiePolicy),
    "la política de cookies debe seguir negando que GA4/GTM sean necesarias"
  );
  // Y el alcance explica por qué no hay banner.
  assert(
    /no existen\s*\n?\s*cookies opcionales|no existen cookies opcionales/i.test(s),
    "debe explicarse que no hay banner porque no hay cookies opcionales"
  );
});

check("58. Solo los tres auxiliares no adoptados siguen marcados como borradores", () => {
  const BANNER = "BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR";
  for (const name of LEGAL_AUX_DRAFTS) {
    assert(draft(name).includes(BANNER), `${name} debe seguir marcado como borrador`);
  }
  for (const name of LEGAL_PACKAGE_SIX) {
    assert(!draft(name).includes(BANNER), `${name} ya no puede estar marcado como borrador`);
  }
});

check("59. c_legal_approval_confirmed está en true por la aprobación del 27/07/2026", () => {
  const s = read(PUBLISH_SQL);
  assert(
    /c_legal_approval_confirmed constant boolean := true;/.test(s),
    "el script de publicación debe declarar la aprobación"
  );
  assert(
    /APROBACIÓN JURÍDICA · 27 DE JULIO DE 2026/.test(s),
    "el script debe llevar el encabezado de aprobación fechado"
  );
  // Sigue sin haberse ejecutado en ningún ambiente.
  assert(
    /NO SE HA EJECUTADO TODAVÍA/.test(s),
    "el script debe seguir declarando que no se ha ejecutado"
  );
});

check("60. El SMTP personalizado sigue siendo gate de usuarios externos", () => {
  const s = read(ROUTE_A);
  assert(
    /SMTP personalizado/i.test(s),
    "el alcance debe exigir SMTP personalizado"
  );
  for (const bloqueado of [
    "registro público",
    "confirmación de cuentas",
    "invitaciones externas",
    "recuperación de contraseña",
    "correos de seguridad",
  ]) {
    assert(
      new RegExp(bloqueado, "i").test(s),
      `el gate de SMTP debe cubrir: ${bloqueado}`
    );
  }
  // Production técnico puede prepararse ANTES del SMTP.
  const readiness = read(READINESS);
  assert(
    /Puede completarse SIN SMTP personalizado|puede prepararse ANTES del SMTP/i.test(readiness),
    "debe declararse que el hito A puede completarse sin SMTP personalizado"
  );
  assert(
    /solo puede usarse en staging y pruebas|solo sirve para staging|solo se admite para staging/i.test(
      readiness + s
    ),
    "el SMTP de Supabase debe seguir restringido a staging y pruebas"
  );
});

check("61. La documentación distingue despliegue técnico de apertura comercial", () => {
  for (const f of [ROUTE_A, READINESS]) {
    const s = read(f);
    assert(
      /despliegue técnico/i.test(s) && /apertura comercial/i.test(s),
      `${f} debe distinguir despliegue técnico de apertura comercial`
    );
  }
  const s = read(ROUTE_A);
  assert(/hito A/i.test(s) && /hito B/i.test(s), "el alcance debe nombrar ambos hitos");
  // El readiness separa los gates.
  const readiness = read(READINESS);
  assert(
    /GO TÉCNICO \(hito A\)/.test(readiness),
    "el readiness debe tener una lista GO técnica propia del hito A"
  );
  assert(
    /APERTURA COMERCIAL \(hito B\)/i.test(readiness),
    "el readiness debe tener los gates del hito B separados"
  );
});

check("62. El checklist de Production no exige funciones aplazadas", () => {
  const readiness = read(READINESS);
  // Extraer solo el bloque de GO técnico (hito A).
  const start = readiness.indexOf("### 14.1 GO TÉCNICO");
  const end = readiness.indexOf("### 14.3");
  assert(start !== -1 && end !== -1, "deben existir las secciones 14.1 y 14.3");
  const goTecnico = readiness.slice(start, end);
  for (const aplazada of [
    /mercado\s*pago/i,
    /google analytics/i,
    /tag manager/i,
    /banner de cookies/i,
    /consentimiento de mercadeo/i,
    /renovación automática/i,
    /exportación integral/i,
    /eliminación automatizada/i,
  ]) {
    assert(
      !aplazada.test(goTecnico),
      `el GO técnico no debe exigir una función aplazada (${aplazada})`
    );
  }
  // Y los smoke tests declaran el alcance.
  const smoke = read(SMOKE);
  assert(
    /Alcance Ruta A/i.test(smoke),
    "los smoke tests deben declarar el alcance de Ruta A"
  );
  assert(
    /No se prueba nada de lo aplazado/i.test(smoke),
    "los smoke tests deben declarar que no prueban lo aplazado"
  );
});

// v1.0.0 · sexta pasada: este check exigía que el alcance declarara el
// registro público ABIERTO y la corrección NO implementada. El riesgo se
// RESOLVIÓ con el kill switch PUBLIC_REGISTRATION_ENABLED, de modo que la
// aserción histórica ya no describe la realidad. No se elimina: se
// INVIERTE y se REFUERZA — ahora exige que el registro esté cerrado por
// configuración y que la barrera viva en el servidor. La protección es
// más estricta que antes.
check("63. El registro público está CERRADO por configuración, con barrera en servidor", () => {
  const s = read(ROUTE_A);
  assert(
    !/registro público está ABIERTO/i.test(s),
    "el alcance ya no debe declarar el registro como abierto: se implementó el kill switch"
  );
  assert(
    /RESUELTO con kill switch|PUBLIC_REGISTRATION_ENABLED/.test(s),
    "el alcance debe documentar el kill switch implementado"
  );
  assert(
    /Production técnico.{0,40}`false`|`false` \| Registro público cerrado/i.test(
      s.replace(/\s+/g, " ")
    ),
    "debe declararse que Production técnico va con el registro cerrado"
  );
  assert(
    /signUpAction/.test(s),
    "debe citarse la evidencia real del código (signUpAction)"
  );
  assert(
    /no es un mecanismo de autorización/i.test(s),
    "debe advertirse que el kill switch no es un mecanismo de autorización"
  );
  // Y la barrera existe de verdad en el servidor, no solo en la UI.
  const auth = read("server/actions/auth.ts");
  assert(
    auth.includes("resolveRegistrationGate"),
    "signUpAction debe consultar el guard del registro"
  );
  assert(
    auth.indexOf("resolveRegistrationGate") < auth.indexOf("supabase.auth.signUp"),
    "el guard debe evaluarse antes de crear la cuenta"
  );
});

check("64. Los pendientes jurídicos se clasifican en A / B / C", () => {
  const gaps = draft("V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md");
  assert(
    /Necesario para el \*\*despliegue técnico\*\*|Necesario para el.{0,20}despliegue técnico/i.test(gaps),
    "debe existir la clase A"
  );
  assert(
    /apertura comercial pública/i.test(gaps),
    "debe existir la clase B"
  );
  assert(/Aplazado/i.test(gaps), "debe existir la clase C");
  // Ningún hueco se borró: los 13 bloqueadores siguen.
  for (let i = 1; i <= 13; i++) {
    const id = `B-${String(i).padStart(2, "0")}`;
    assert(gaps.includes(id), `el bloqueador ${id} no debe eliminarse`);
  }
  // Y la regla de que aplazar no elimina el requisito.
  assert(
    /vuelve a ser\s*\n?\s*exigible|no lo elimina/i.test(gaps),
    "debe declararse que aplazar la función no elimina el requisito jurídico"
  );
});

// ===========================================================================
console.log("\n§16 · Kill switch del registro público\n");

const REG_PURE = "lib/domain/public-registration.ts";
const REG_SERVER = "lib/auth/public-registration.ts";
const AUTH_ACTIONS = "server/actions/auth.ts";
const REGISTER_PAGE = "app/(auth)/register/page.tsx";

check("65. La interpretación del flag es fail-closed", () => {
  // Habilitan.
  assert(isPublicRegistrationFlagEnabled("true") === true, "«true» debe habilitar");
  assert(isPublicRegistrationFlagEnabled("1") === true, "«1» debe habilitar");
  // Deshabilitan: ausencia, vacío, negativos y cualquier otro valor.
  for (const raw of [
    undefined,
    null,
    "",
    " ",
    "false",
    "0",
    "TRUE",
    "True",
    "yes",
    "si",
    "enabled",
    "2",
  ]) {
    assert(
      isPublicRegistrationFlagEnabled(raw) === false,
      `«${String(raw)}» NO debía habilitar el registro (fail-closed)`
    );
  }
});

check("65b. Los valores admitidos por el precheck están acotados", () => {
  for (const v of ["true", "false", "1", "0"]) {
    assert(isPublicRegistrationValueValid(v), `${v} debe ser un valor admitido`);
  }
  for (const v of [undefined, null, "", "yes", "TRUE", "2"]) {
    assert(
      !isPublicRegistrationValueValid(v),
      `«${String(v)}» no debe considerarse un valor admitido`
    );
  }
});

check("65c. La extracción del token de invitación es pura y sin autoridad", () => {
  assert(
    extractInvitationToken("/accept-invite?token=abc123") === "abc123",
    "debe extraer el token de un next válido"
  );
  // Nada que no sea una ruta interna de invitación produce token.
  for (const bad of [
    null,
    undefined,
    "",
    "/register",
    "/accept-invite",
    "//evil.com/accept-invite?token=abc",
    "https://evil.com/accept-invite?token=abc",
    "/accept-invite?otro=abc",
    "/accept-invite?token=",
  ]) {
    assert(
      extractInvitationToken(bad) === null,
      `«${String(bad)}» no debía producir token`
    );
  }
});

check("66. La variable es server-only y NO lleva prefijo NEXT_PUBLIC_", () => {
  assert(
    PUBLIC_REGISTRATION_FLAG_ENV === "PUBLIC_REGISTRATION_ENABLED",
    "el nombre oficial de la variable debe ser PUBLIC_REGISTRATION_ENABLED"
  );
  assert(
    !PUBLIC_REGISTRATION_FLAG_ENV.startsWith("NEXT_PUBLIC_"),
    "el kill switch jamás puede llevar prefijo NEXT_PUBLIC_"
  );
  // No debe existir en ningún sitio una variante pública.
  const walkAll: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name)) walkAll.push(rel);
    }
  };
  walk("app");
  walk("components");
  walk("lib");
  walk("server");
  for (const f of walkAll) {
    assert(
      !/NEXT_PUBLIC_PUBLIC_REGISTRATION|NEXT_PUBLIC_REGISTRATION/.test(read(f)),
      `${f} no debe exponer el kill switch como variable pública`
    );
  }
});

check("66b. El módulo que lee el entorno es server-only", () => {
  const s = read(REG_SERVER);
  assert(
    s.trimStart().startsWith('import "server-only"'),
    "lib/auth/public-registration.ts debe empezar por import \"server-only\""
  );
  // El módulo puro NO lee process.env: por eso puede testearse por importación.
  // Se comparan solo las sentencias: la documentación del módulo sí puede
  // nombrar process.env para explicar por qué NO lo usa.
  const pure = read(REG_PURE);
  const pureCode = pure.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(
    !/process\.env/.test(pureCode),
    "el módulo puro no debe leer process.env"
  );
  // Interpretación en UN solo lugar.
  assert(
    /raw === "true" \|\| raw === "1"/.test(pure),
    "la interpretación del flag debe vivir en el módulo puro"
  );
  const otros = ["app", "components", "server"].flatMap((dir) => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) out.push(rel);
      }
    };
    walk(dir);
    return out;
  });
  for (const f of otros) {
    assert(
      !/PUBLIC_REGISTRATION_ENABLED["'\]]?\s*===\s*["']true["']/.test(read(f)),
      `${f} no debe reinterpretar la variable: use el módulo canónico`
    );
  }
});

check("66c. Ningún Client Component importa el módulo server-only", () => {
  const clientFiles: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) {
        const s = read(rel);
        if (/^\s*["']use client["']/m.test(s)) clientFiles.push(rel);
      }
    }
  };
  walk("app");
  walk("components");
  for (const f of clientFiles) {
    const s = read(f);
    assert(
      !s.includes("@/lib/auth/public-registration"),
      `${f} es un Client Component y no puede importar el kill switch server-only`
    );
    assert(
      !s.includes("PUBLIC_REGISTRATION_ENABLED"),
      `${f} es un Client Component y no debe leer la variable`
    );
  }
});

check("67. El guard del servidor corre ANTES de auth.signUp", () => {
  const s = read(AUTH_ACTIONS);
  const gateIdx = s.indexOf("resolveRegistrationGate");
  const signUpIdx = s.indexOf("supabase.auth.signUp");
  assert(gateIdx !== -1, "signUpAction debe consultar resolveRegistrationGate");
  assert(signUpIdx !== -1, "debe seguir existiendo la llamada a auth.signUp");
  assert(
    gateIdx < signUpIdx,
    "el guard debe evaluarse ANTES de llamar a auth.signUp"
  );
  // Retorno temprano: si no se permite, no se sigue.
  assert(
    /if \(!gate\.allowed\) \{[\s\S]{0,120}return \{ error: REGISTRATION_CLOSED_MESSAGE \}/.test(s),
    "debe devolverse un error controlado y detenerse antes de crear nada"
  );
  // El cliente de Supabase se crea DESPUÉS del guard.
  const clientIdx = s.indexOf("const supabase = await createServerClient();", gateIdx);
  assert(
    clientIdx > gateIdx,
    "no debe crearse el cliente de Supabase antes de superar el guard"
  );
});

check("67b. El mensaje de rechazo es genérico y no revela configuración", () => {
  const s = read(REG_SERVER);
  assert(
    /REGISTRATION_CLOSED_MESSAGE =\s*\n?\s*"El registro público no está disponible en este momento\."/.test(s),
    "debe usarse el mensaje genérico acordado"
  );
  // No debe filtrar el nombre de la variable ni su valor al usuario.
  const msgIdx = s.indexOf("REGISTRATION_CLOSED_MESSAGE =");
  const msg = s.slice(msgIdx, msgIdx + 200);
  assert(
    !/PUBLIC_REGISTRATION_ENABLED|process\.env/.test(msg),
    "el mensaje no debe revelar la variable ni la configuración interna"
  );
});

check("68. La excepción de invitación se verifica en SERVIDOR, no por el cliente", () => {
  const s = read(REG_SERVER);
  // Se consulta la base de datos.
  assert(
    s.includes('.from("team_invitations")'),
    "la excepción debe verificarse contra team_invitations"
  );
  // Las cuatro condiciones exigidas.
  assert(s.includes('.eq("status", "pending")'), "debe exigir invitación pendiente (no consumida)");
  assert(s.includes('.eq("token", token)'), "debe exigir el token exacto");
  assert(
    /expiresAt\.getTime\(\) < Date\.now\(\)/.test(s),
    "debe exigir que la invitación siga vigente"
  );
  assert(
    /normalizeEmail\(String\(data\.email\)\) !== normalized/.test(s),
    "debe exigir que el correo coincida con el invitado"
  );
  // Fail-closed ante error.
  assert(
    /catch \{[\s\S]{0,200}return false/.test(s),
    "ante cualquier error la verificación debe devolver false"
  );
  // El parámetro `next` por sí solo no autoriza.
  const pure = read(REG_PURE);
  assert(
    /SIN autoridad|no autoriza nada/i.test(pure),
    "debe documentarse que el token de la URL no autoriza por sí mismo"
  );
});

check("69. /register no renderiza formulario con el registro cerrado", () => {
  const s = read(REGISTER_PAGE);
  // Es Server Component: sin "use client".
  assert(
    !/^\s*["']use client["']/m.test(s),
    "la página de registro debe ser un Server Component"
  );
  assert(
    s.includes("shouldRenderRegistrationForm"),
    "debe consultarse el kill switch antes de renderizar"
  );
  // Con el flag apagado, se devuelve la pantalla controlada.
  assert(
    /if \(showForm\) \{\s*\n\s*return <RegisterForm \/>;/.test(s),
    "el formulario solo debe renderizarse cuando corresponde"
  );
  assert(
    /Registro no disponible/.test(s),
    "debe mostrarse una pantalla controlada"
  );
  // Sin formulario funcional en la rama cerrada.
  const closedBranch = s.slice(s.indexOf("Registro no disponible"));
  assert(
    !/<form/.test(closedBranch) && !/<RegisterForm/.test(closedBranch),
    "la pantalla cerrada no debe contener ningún formulario"
  );
  // Enlace a login y canal comercial.
  assert(/href="\/login"/.test(closedBranch), "debe ofrecer enlace a /login");
  assert(
    /contacto@idendi\.org/.test(closedBranch),
    "puede ofrecer el canal comercial"
  );
});

check("69b. La pantalla cerrada no usa lenguaje prohibido ni promete fechas", () => {
  const s = read(REGISTER_PAGE);
  for (const rx of [/beta/i, /versi[oó]n de prueba/i, /lanzamiento controlado/i]) {
    assert(!rx.test(s), `la pantalla de registro no debe decir ${rx}`);
  }
  assert(
    !/pr[oó]ximamente estará|en \d+ (días|semanas|meses)|a partir del/i.test(s),
    "no debe prometerse una fecha de apertura"
  );
  assert(
    !/PUBLIC_REGISTRATION_ENABLED/.test(s),
    "no debe revelarse el nombre de la variable"
  );
});

check("69c. Con el registro abierto se conserva el formulario histórico", () => {
  const form = read("components/domain/auth/register-form.tsx");
  for (const campo of ['name="full_name"', 'name="email"', 'name="password"']) {
    assert(form.includes(campo), `el formulario debe conservar el campo ${campo}`);
  }
  assert(form.includes("signUpAction"), "debe seguir usando signUpAction");
  assert(form.includes("minLength={8}"), "debe conservarse el mínimo de 8 caracteres");
  // Y conserva el flujo de invitación.
  assert(
    form.includes("/accept-invite"),
    "debe conservarse el aviso de invitación pendiente"
  );
});

check("70. El login sigue funcionando y no depende del registro público", () => {
  const page = read("app/(auth)/login/page.tsx");
  const form = read("components/domain/auth/login-form.tsx");
  assert(form.includes("signInAction"), "el login debe seguir usando signInAction");
  // El kill switch solo decide el enlace secundario, nunca el formulario.
  assert(
    !/if \(.*registrationOpen.*\)[\s\S]{0,80}return null/.test(form),
    "el kill switch no puede impedir iniciar sesión"
  );
  assert(
    page.includes("isPublicRegistrationEnabled"),
    "la página de login lee el flag en servidor y lo pasa como prop"
  );
  // El formulario de login se renderiza siempre.
  assert(
    /return <LoginForm registrationOpen=/.test(page),
    "el formulario de login debe renderizarse siempre"
  );
});

check("70b. El superadministrador no depende del registro público", () => {
  // Sin bypass por correo fijo en ninguna parte.
  for (const f of [REG_SERVER, REG_PURE, AUTH_ACTIONS]) {
    const s = read(f);
    assert(
      !/@[a-z0-9.-]+\.(com|org|co)\b/i.test(s.replace(/contacto@idendi\.org/g, "")),
      `${f} no debe contener ningún correo fijo como bypass`
    );
    assert(
      !/is_superadmin|platform_staff|superadmin/i.test(s),
      `${f} no debe otorgar excepciones por superadministrador`
    );
  }
  // El guard solo se aplica a la creación de cuentas, no al inicio de sesión.
  const auth = read(AUTH_ACTIONS);
  const signInIdx = auth.indexOf("export async function signInAction");
  const signUpIdx = auth.indexOf("export async function signUpAction");
  const signInBody = auth.slice(signInIdx, signUpIdx);
  assert(
    !signInBody.includes("resolveRegistrationGate"),
    "signInAction NO debe consultar el kill switch: el login siempre funciona"
  );
});

check("71. Las invitaciones legítimas siguen funcionando", () => {
  // El enlace «Crear cuenta» de accept-invite se conserva sin condicionar.
  const invite = read("app/accept-invite/page.tsx");
  assert(
    /href=\{`\/register\?next=\$\{encodeURIComponent\(returnHere\)\}`\}/.test(invite),
    "accept-invite debe seguir ofreciendo crear cuenta con el token"
  );
  assert(
    !/registrationOpen|isPublicRegistrationEnabled/.test(invite),
    "el enlace de invitación no debe condicionarse al kill switch"
  );
  // La página de registro admite el caso de invitación.
  const s = read(REGISTER_PAGE);
  assert(
    /invitaci[oó]n/i.test(s),
    "la página de registro debe contemplar el caso de invitación"
  );
  // Y el login conserva la vía para invitados con el registro cerrado.
  const loginForm = read("components/domain/auth/login-form.tsx");
  assert(
    /Crear cuenta con tu invitación/.test(loginForm),
    "con el registro cerrado el login debe conservar la vía del invitado"
  );
});

check("72. La variable está en .env.example y en el precheck", () => {
  const env = read(".env.example");
  assert(
    /^PUBLIC_REGISTRATION_ENABLED=/m.test(env),
    ".env.example debe declarar PUBLIC_REGISTRATION_ENABLED"
  );
  assert(
    !/^NEXT_PUBLIC_PUBLIC_REGISTRATION/m.test(env),
    "nunca debe declararse como variable pública"
  );
  assert(
    /Production TÉCNICO.*false/.test(env.replace(/\s+/g, " ")),
    ".env.example debe indicar false para Production técnico"
  );

  const pre = read("scripts/release/v1/precheck-env.ts");
  assert(
    /name: "PUBLIC_REGISTRATION_ENABLED"/.test(pre),
    "el precheck debe incluir la variable en el contrato"
  );
  assert(
    /HABILITADO|DESHABILITADO/.test(pre),
    "el precheck puede imprimir el estado (el flag no es secreto)"
  );
});

check("72b. El precheck exige registro cerrado para el hito técnico", () => {
  const pre = read("scripts/release/v1/precheck-env.ts");
  assert(
    /ENVIRONMENT\.name === "production" && registrationOn/.test(pre),
    "el precheck debe detectar registro habilitado en Production"
  );
  const failIdx = pre.indexOf('ENVIRONMENT.name === "production" && registrationOn');
  const block = pre.slice(failIdx, failIdx + 700);
  assert(/fail\(/.test(block), "debe ser un FALLO, no una advertencia");
  assert(
    /expect-registration/.test(pre),
    "debe existir un argumento explícito para declarar el estado esperado"
  );
  // Y valores no admitidos también fallan.
  assert(
    /REGISTRATION_VALID_VALUES\.includes/.test(pre),
    "el precheck debe validar que el valor sea uno de los admitidos"
  );
});

check("73. La documentación cubre el kill switch", () => {
  const scope = read(ROUTE_A);
  const readiness = read(READINESS);
  const smoke = read(SMOKE);
  for (const [f, s] of [
    [ROUTE_A, scope],
    [READINESS, readiness],
    [SMOKE, smoke],
  ] as const) {
    assert(
      s.includes("PUBLIC_REGISTRATION_ENABLED"),
      `${f} debe documentar la variable`
    );
  }
  assert(
    /deployment nuevo|nuevo deployment|Redeploy/i.test(readiness),
    "debe recordarse que cambiar la variable exige un deployment nuevo"
  );
  assert(
    /invitad/i.test(scope),
    "el alcance debe explicar el trato de las personas invitadas"
  );
});

check("74. No se tocaron migraciones y la aprobación quedó declarada", () => {
  const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  const beyond = migrations.filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 106);
  assert(beyond.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)).length === 0, `PCR-03 original termina en 0108; después solo son autorizadas 0109, 0110, 0111 y 0112; migraciones no declaradas: ${beyond.join(", ")}`);
  assert(
    /c_legal_approval_confirmed constant boolean := true;/.test(read(PUBLISH_SQL)),
    "el script legal debe declarar la aprobación"
  );
  for (const name of LEGAL_AUX_DRAFTS) {
    assert(
      draft(name).includes("BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR"),
      `${name} debe seguir marcado como borrador`
    );
  }
});

// ===========================================================================
console.log("\n§17 · Página general «Acerca de Trazaloop»\n");

const ABOUT_PAGE = "app/legal/page.tsx";
/** Texto visible de la página, sin comentarios de código. */
const aboutText = () =>
  read(ABOUT_PAGE)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

check("75. La página general se presenta como plataforma modular", () => {
  const s = aboutText();
  assert(
    /plataforma modular de trazabilidad y gestión de\s+información técnica para empresas/.test(
      s.replace(/\s+/g, " ")
    ) || /plataforma modular/i.test(s),
    "la definición general debe presentar Trazaloop como plataforma modular"
  );
  assert(
    /dos módulos\s*\n?\s*funcionales/i.test(s.replace(/\s+/g, " ")),
    "debe declararse que integra dos módulos funcionales"
  );
  // Se conserva la estructura visual histórica.
  assert(read(ABOUT_PAGE).includes('<p className="eyebrow">Acerca de Trazaloop</p>'), "debe conservarse el eyebrow");
  assert(s.includes("Qué hace Trazaloop y qué no"), "debe conservarse el encabezado h1");
  assert(read(ABOUT_PAGE).includes("APP_VERSION_LABEL"), "debe conservarse el pie con la versión");
});

check("76. Se mencionan Trazaloop PCR y Trazaloop Textiles", () => {
  const s = aboutText();
  assert(/Trazaloop PCR/.test(s), "debe mencionarse Trazaloop PCR (PCR-01: denominación comercial)");
  assert(/Trazaloop Textiles/.test(s), "debe mencionarse Trazaloop Textiles");
  // Con contenido propio de cada módulo, no solo el nombre.
  assert(
    /composición de fibras/i.test(s) && /pasaportes técnicos textiles/i.test(s),
    "Textiles debe describirse con sus funciones propias"
  );
  assert(
    /contenido reciclado por lote producido/i.test(s),
    "PCR debe describirse con sus funciones propias"
  );
});

check("77. La definición general ya no limita Trazaloop a plásticos", () => {
  const s = aboutText();
  assert(
    !/empresas transformadoras de pl[aá]sticos/i.test(s),
    "la página general no debe definir Trazaloop como herramienta para empresas transformadoras de plásticos"
  );
  assert(
    !/herramienta de gestión de información técnica para\s+empresas transformadoras/i.test(
      s.replace(/\s+/g, " ")
    ),
    "no debe conservarse la definición antigua limitada a plásticos"
  );
  // El primer párrafo —la definición— no puede acotarse a un solo material.
  const firstIdx = s.indexOf("Trazaloop es una");
  assert(firstIdx !== -1, "debe existir la definición general");
  const firstPara = s.slice(firstIdx, firstIdx + 260);
  assert(
    !/pl[aá]stico/i.test(firstPara),
    "la definición general no debe acotarse a plásticos"
  );
});

check("78. Las normas permanecen asociadas EXCLUSIVAMENTE al módulo PCR", () => {
  const s = aboutText().replace(/\s+/g, " ");
  assert(/NTC 6632:2022/.test(s), "debe conservarse NTC 6632:2022");
  assert(/UNE-EN\s*15343:2008/.test(s), "debe conservarse UNE-EN 15343:2008");

  // Delimitar el párrafo de CPR y el de Textiles.
  const cprIdx = s.indexOf("Trazaloop PCR");
  const texIdx = s.indexOf("Trazaloop Textiles");
  assert(cprIdx !== -1 && texIdx !== -1 && cprIdx < texIdx, "PCR debe describirse antes que Textiles");
  const cprPara = s.slice(cprIdx, texIdx);
  const afterTex = s.slice(texIdx);

  // Las normas viven dentro del párrafo de CPR…
  assert(
    /NTC 6632:2022/.test(cprPara) && /UNE-EN\s*15343:2008/.test(cprPara),
    "las normas deben estar dentro de la descripción de CPR"
  );
  // …y NUNCA se atribuyen a Textiles ni a nada posterior.
  assert(
    !/NTC 6632|UNE-EN\s*15343/.test(afterTex),
    "las normas NO deben atribuirse a Trazaloop Textiles ni al texto posterior"
  );
});

check("79. No se afirma que Trazaloop emita certificaciones", () => {
  const s = aboutText();
  assert(
    /Trazaloop no emite certificaciones/.test(s),
    "debe conservarse la declaración de que no emite certificaciones"
  );
  // Ninguna afirmación positiva de certificar o garantizar cumplimiento.
  for (const rx of [
    /Trazaloop certifica/i,
    /certificamos/i,
    /garantiza(mos)? (el )?cumplimiento/i,
    /garantiza(mos)? la conformidad/i,
    /emite certificad/i,
  ]) {
    assert(!rx.test(s), `la página no debe afirmar ${rx}`);
  }
  assert(
    /no\s+certifica productos ni procesos/i.test(s.replace(/\s+/g, " ")),
    "debe negarse expresamente que certifique productos ni procesos"
  );
  assert(
    /no garantiza la aceptación de la información durante\s+una auditoría/i.test(
      s.replace(/\s+/g, " ")
    ),
    "debe negarse que garantice la aceptación en una auditoría"
  );
});

check("80. Se indica que no sustituye a los organismos de certificación", () => {
  const s = aboutText().replace(/\s+/g, " ");
  assert(
    /no sustituye a los organismos de\s*certificación/i.test(s),
    "debe declararse que no sustituye a los organismos de certificación"
  );
  // Y se conservan las tres declaraciones de responsabilidad.
  assert(
    /Los resultados dependen de la información ingresada/.test(s),
    "debe conservarse la declaración sobre la dependencia de los datos"
  );
  assert(
    /La responsabilidad de la información corresponde a cada empresa/.test(s),
    "debe conservarse la declaración de responsabilidad de la empresa"
  );
});

check("81. Quality y Construcción NO se presentan como funcionales", () => {
  const s = aboutText();
  // No deben aparecer en la página general como módulos activos.
  assert(
    !/Trazaloop Quality/i.test(s) && !/Trazaloop Construcción/i.test(s),
    "la página general no debe listar Quality ni Construcción entre los módulos funcionales"
  );
  // Construcción sigue en coming_soon (fuente canónica). Quality ya es
  // funcional en el catálogo, pero sigue sin anunciarse: no está lanzado.
  assert(
    getCommercialModuleByKey("construccion")?.status === "coming_soon",
    "construccion debe seguir en coming_soon"
  );
  assert(FUNCTIONAL_MODULE_CODES.length === 3, "CPR, Textiles y Quality son los funcionales");
  // La portada los mantiene como «Próximamente».
  const landing = read("app/page.tsx");
  assert(
    landing.includes("Trazaloop Quality") &&
      landing.includes("Trazaloop Construcción") &&
      landing.includes("Próximamente"),
    "la portada debe seguir mostrándolos como Próximamente"
  );
});

check("81b. Se conserva la terminología acordada", () => {
  const s = aboutText().replace(/\s+/g, " ");
  assert(
    /órdenes o corridas de producción/i.test(s),
    "debe conservarse «orden / corrida de producción»"
  );
  assert(
    /lote producido/i.test(s),
    "debe conservarse «lote producido»"
  );
  assert(
    /trazabilidad lote a lote/i.test(s),
    "debe conservarse «trazabilidad lote a lote»"
  );
});

check("81c. La página no se convirtió en documento jurídico", () => {
  const s = aboutText();
  for (const rx of [
    /cláusula/i,
    /términos y condiciones/i,
    /política de privacidad/i,
    /NIT\b/,
    /razón social/i,
    /jurisdicción/i,
    /ley aplicable/i,
  ]) {
    assert(!rx.test(s), `la página «Acerca de» no debe incluir contenido jurídico (${rx})`);
  }
});

check("82. No se modificaron migraciones y no existe 0103", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const numbers = files.map((f) => Number(f.slice(0, 4))).sort((a, b) => a - b);
  assert(numbers[0] === 1, "la primera migración debe seguir siendo 0001");
  // PCR-03 original ocupa 0106–0108; la cola autorizada la declara QUALITY_01_ALLOWED.
  assert(
    numbers[numbers.length - 1] === MAX_DECLARED_MIGRATION,
    `la última migración debe ser ${MAX_DECLARED_MIGRATION}, es ${numbers[numbers.length - 1]}`
  );
  const beyond = files.filter((f) => Number(f.slice(0, 4)) >= 106);
  assert(beyond.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)).length === 0, `PCR-03 original termina en 0108; después solo son autorizadas 0109, 0110, 0111 y 0112; migraciones no declaradas: ${beyond.join(", ")}`);
});

// ===========================================================================
console.log("\n§18 · Paquete jurídico v1.0 preparado para revisión\n");

/** Los borradores van justificados a 78 columnas: cualquier frase puede
 *  venir partida por un salto de línea. Se comparan en una sola línea. */
const flat = (s: string) => s.replace(/\s+/g, " ");
/** Los seis documentos, tal como los verá el área jurídica. */
const PKG = () => LEGAL_PACKAGE_SIX.map(draft).join("\n\n");
/** Solo los textos destinados a publicarse (sin la auditoría interna). */
const PUBLICABLE_TEXT = () =>
  [
    "V1.0.0_TERMS_APPROVED.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
    "V1.0.0_PRIVACY_NOTICE_APPROVED.md",
    "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md",
    "V1.0.0_COOKIE_POLICY_APPROVED.md",
  ]
    .map(draft)
    .join("\n\n");

check("83. Los textos cubren Trazaloop CPR y Trazaloop Textiles", () => {
  for (const name of ["V1.0.0_TERMS_APPROVED.md", "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md"]) {
    const s = draft(name);
    assert(/Trazaloop CPR/.test(s), `${name} debe cubrir Trazaloop CPR`);
    assert(/Trazaloop Textiles/.test(s), `${name} debe cubrir Trazaloop Textiles`);
  }
  // Los objetos propios de cada módulo aparecen en los términos.
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  for (const objeto of [
    "órdenes o corridas de producción",
    "lotes de entrada",
    "TrazaDocs",
    "composiciones",
    "circularidad",
    "pasaportes técnicos textiles",
  ]) {
    assert(terms.includes(objeto), `los términos deben cubrir: ${objeto}`);
  }
  // Las normas quedan atadas EXCLUSIVAMENTE a CPR.
  assert(
    /NTC 6632:2022/.test(terms) && /UNE-EN 15343:2008/.test(terms),
    "los términos deben citar las normas con su año"
  );
  assert(
    /únicamente\*{0,2} en el módulo Trazaloop CPR/i.test(terms),
    "las normas deben limitarse expresamente al módulo CPR"
  );
});

check("84. Los textos NO limitan Trazaloop al plástico ni a un solo módulo", () => {
  const s = PUBLICABLE_TEXT();
  assert(
    !/plataforma (de|para) (la )?trazabilidad de pl[áa]stic/i.test(s),
    "Trazaloop no puede definirse como plataforma de plásticos"
  );
  assert(
    !/Trazaloop es una plataforma para .{0,80}reciclad/i.test(s.replace(/\s+/g, " ")),
    "la definición general no puede reducirse al contenido reciclado"
  );
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  assert(
    /plataforma SaaS modular para empresas/i.test(terms),
    "los términos deben definir Trazaloop como plataforma SaaS modular"
  );
  // Y los módulos futuros no se presentan como operativos.
  assert(
    /no está disponible/i.test(terms),
    "los módulos futuros deben declararse no disponibles"
  );
});

check("85. Ningún texto promete certificación", () => {
  const s = flat(PKG());
  for (const rx of [
    /garantizamos (la|una) certificaci/i,
    /asegura(mos)? (la|una) certificaci/i,
    /obtendrás (la|una) certificaci/i,
    /permite certificar/i,
    /Trazaloop certifica/i,
    /avala(mos)? (productos|procesos)/i,
  ]) {
    assert(!rx.test(s), `ningún documento puede prometer certificación (${rx})`);
  }
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  for (const negacion of [
    "certifica productos",
    "certifica procesos",
    "garantiza la obtención, renovación o ampliación de una certificación",
  ]) {
    assert(terms.includes(negacion), `los términos deben negar: ${negacion}`);
  }
  const policy = draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md");
  assert(
    /no certifica/i.test(policy) && /no garantiza/i.test(policy),
    "la política también debe negar la certificación"
  );
});

check("86. Demo, Full y Extra se describen como en el producto", () => {
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  for (const estado of ["Demo", "Full", "Extra"]) {
    assert(new RegExp(`\\*\\*${estado}\\*\\*`).test(terms), `falta el estado ${estado}`);
  }
  assert(
    /límites funcionales y de capacidad/i.test(terms),
    "Demo debe describirse con límites funcionales y de capacidad"
  );
  assert(
    /acceso funcional completo/i.test(terms),
    "Full debe describirse como acceso funcional completo"
  );
  assert(
    /puede ser diferente por módulo/i.test(terms),
    "debe declararse que el acceso puede diferir por módulo"
  );
});

check("87. Full y Extra se diferencian por almacenamiento, no por funciones", () => {
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  assert(
    /Full y Extra no se diferencian funcionalmente/i.test(terms),
    "debe declararse que Full y Extra no difieren funcionalmente"
  );
  assert(
    /mayor capacidad de almacenamiento/i.test(terms),
    "Extra debe describirse por su mayor capacidad de almacenamiento"
  );
  // Y coincide con la regla canónica del código.
  const access = read("lib/modules/access.ts");
  assert(
    /EXACTAMENTE las mismas funcionalidades/i.test(access),
    "el código debe seguir declarando la paridad funcional de Full y Extra"
  );
});

check("88. El Demo temporal se describe como de 2 días", () => {
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  assert(
    /Demo temporal durante 2 días/i.test(terms),
    "los términos deben fijar el Demo temporal en 2 días"
  );
  // Y coincide con la migración que lo provisiona.
  const m = read("supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql");
  assert(
    /interval '48 hours'/.test(m),
    "la provisión automática debe seguir siendo de 48 horas"
  );
  // Y con el mensaje que ve la persona usuaria.
  assert(
    /durante 2 días/.test(read("lib/modules/messages.ts")),
    "el aviso de la interfaz debe seguir hablando de 2 días"
  );
});

check("89. No se promete pago integrado ni renovación automática", () => {
  const s = flat(PUBLICABLE_TEXT());
  assert(!/mercado\s*pago/i.test(s), "ningún documento puede nombrar una pasarela de pagos");
  for (const rx of [
    /se renuevan? autom/i,
    /renovaremos autom/i,
    /los planes se renuevan/i,
    /aviso de renovación con \d+/i,
    /pasarela inicial/i,
  ]) {
    assert(!rx.test(s), `ningún documento puede prometer pagos o renovación automática (${rx})`);
  }
  const terms = flat(draft("V1.0.0_TERMS_APPROVED.md"));
  assert(
    /no existe pago integrado, pasarela de pagos, renovación automática ni facturación automática/i.test(terms),
    "los términos deben negar expresamente pagos, renovación y facturación automáticas"
  );
  assert(
    /se gestionan de forma manual, por fuera de la plataforma/i.test(terms),
    "debe declararse que la contratación se gestiona por fuera de la plataforma"
  );
});

check("90. Se identifican operador, NIT y canales en todo el paquete", () => {
  const RAZON = "CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL";
  const NIT = "901835846-6";
  for (const name of LEGAL_PACKAGE_SIX) {
    const s = draft(name);
    assert(s.includes(RAZON), `${name} debe identificar la razón social`);
    assert(s.includes(NIT), `${name} debe incluir el NIT`);
    assert(s.includes("contacto@idendi.org"), `${name} debe indicar el canal de privacidad`);
  }
  const terms = draft("V1.0.0_TERMS_APPROVED.md");
  for (const dato of [
    "Jhorman Mena Ledezma",
    "Director General",
    "Medellín, Colombia",
    "+57 324 3268865",
    "contacto@cirquiloconsultores.com",
    "https://www.trazaloop.com",
  ]) {
    assert(terms.includes(dato), `los términos deben incluir ${dato}`);
  }
  // Y el módulo de dominio dice exactamente lo mismo.
  assert(LEGAL_OPERATOR.legalName === RAZON, "lib debe declarar la misma razón social");
  assert(LEGAL_OPERATOR.taxId === NIT, "lib debe declarar el mismo NIT");
  assert(
    LEGAL_OPERATOR.supportEmail === "contacto@cirquiloconsultores.com",
    "lib debe declarar el correo de soporte correcto"
  );
});

check("91. Se cubren Supabase, Vercel y Resend, sin ubicación garantizada", () => {
  for (const name of [
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
    "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md",
  ]) {
    const s = flat(draft(name));
    for (const p of ["Supabase", "Vercel", "Resend"]) {
      assert(s.includes(p), `${name} debe declarar el proveedor ${p}`);
    }
    assert(
      /transmisión internacional|transferencia internacional|tratarse fuera/i.test(s),
      `${name} debe explicar el tratamiento internacional`
    );
    assert(
      /medidas contractuales, técnicas y legales/i.test(s),
      `${name} debe sujetar el tratamiento internacional a medidas aplicables`
    );
  }
  // No se afirma una ubicación única o permanente.
  const s = flat(PUBLICABLE_TEXT());
  assert(
    !/(alojad|almacenad|ubicad)[oa]s? (siempre|únicamente|exclusivamente) en/i.test(s),
    "no puede afirmarse una ubicación única de la infraestructura"
  );
  const policy = flat(draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md"));
  assert(
    /no afirma\*{0,2} que la información se aloje de forma única o permanente/i.test(policy),
    "la política debe negar expresamente una ubicación única o permanente"
  );
  // Y el módulo de dominio lista los mismos tres proveedores.
  assert(
    LEGAL_TECH_PROVIDERS.map((p) => p.name).join(",") === "Supabase,Vercel,Resend",
    "lib debe listar exactamente Supabase, Vercel y Resend"
  );
});

check("92. Se cubren los derechos de los titulares y su procedimiento", () => {
  const policy = flat(draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md"));
  for (const derecho of [
    "Conocer",
    "Actualizar",
    "Rectificar",
    "Suprimir",
    "Revocar la autorización",
    "Solicitar prueba de la autorización",
    "Presentar quejas",
  ]) {
    assert(policy.includes(derecho), `falta el derecho: ${derecho}`);
  }
  // Procedimiento real, con canal e identificación.
  assert(
    /verificar la identidad/i.test(policy),
    "el procedimiento debe contemplar la verificación de identidad"
  );
  assert(
    /remitirá la solicitud a dicha empresa/i.test(policy),
    "debe explicarse la remisión al responsable cuando el dato lo registró un cliente"
  );
  // Sin inventar plazos distintos de los legales.
  assert(
    /No se ofrecen plazos ni niveles de servicio distintos de los legales/i.test(policy),
    "no pueden ofrecerse plazos distintos de los legales"
  );
  assert(
    !/responderemos en \d+ (días|horas)|plazo máximo de \d+ días hábiles/i.test(policy),
    "la política no debe inventar plazos concretos de respuesta"
  );
});

check("93. Se cubren las cookies estrictamente necesarias, sin banner", () => {
  const c = draft("V1.0.0_COOKIE_POLICY_APPROVED.md");
  for (const fin of [
    "autenticación",
    "sesión",
    "selección de empresa activa",
    "seguridad",
    "funcionamiento técnico",
  ]) {
    assert(c.includes(fin), `el aviso de cookies debe cubrir: ${fin}`);
  }
  assert(
    /no hay cookies opcionales/i.test(c),
    "debe declararse que no hay cookies opcionales"
  );
  assert(
    /no existe ni se requiere un banner/i.test(c),
    "debe explicarse por qué no hay banner de consentimiento"
  );
  // Y el módulo de dominio declara las mismas cinco finalidades.
  assert(
    ESSENTIAL_COOKIES_PURPOSES.length === 5,
    "lib debe declarar las cinco finalidades esenciales"
  );
  for (const fin of ESSENTIAL_COOKIES_PURPOSES) {
    assert(c.includes(fin), `lib y el aviso deben coincidir en: ${fin}`);
  }
});

check("94. No existe consentimiento de mercadeo en el paquete ni en el código", () => {
  // Ningún documento del paquete recoge autorización de mercadeo.
  for (const name of LEGAL_PACKAGE_SIX) {
    const s = flat(draft(name)).replace(
      /\bno\w*\s+(se\s+)?(solicita\w*|hay|existe\w*|se\s+añade|realiza\w*|usamos)[^.]{0,180}/gi,
      ""
    );
    assert(
      !/casilla de mercadeo|autorización de mercadeo|autorizo.{0,60}(novedades|ofertas)/i.test(s),
      `${name} no debe recoger consentimiento de mercadeo`
    );
  }
  const policy = flat(draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md"));
  assert(
    /No se solicita autorización de mercadeo/i.test(policy),
    "la política debe declarar que no se solicita autorización de mercadeo"
  );
  // La especificación de mercadeo queda fuera del alcance.
  const m = draft("V1.0.0_MARKETING_CONSENT_DRAFT.md");
  assert(
    /FUERA DEL ALCANCE DE LA v1\.0\.0/i.test(m),
    "la especificación de mercadeo debe declararse fuera de alcance"
  );
  // Y el formulario de aceptación solo tiene las dos casillas obligatorias.
  const form = read("components/domain/legal/accept-legal-form.tsx");
  const inputs = form.match(/name="[^"]+"/g) ?? [];
  assert(
    inputs.length === 2 &&
      inputs.includes('name="confirm_terms"') &&
      inputs.includes('name="confirm_privacy"'),
    `el muro de aceptación debe tener exactamente dos casillas: ${inputs.join(", ")}`
  );
});

check("95. El paquete v1.0 está aprobado y su espejo en código coincide", () => {
  const BANNER = "BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR";
  // Los seis aprobados, sin marca de borrador.
  for (const name of LEGAL_PACKAGE_SIX) {
    assert(!draft(name).includes(BANNER), `${name} no puede llevar la marca de borrador`);
  }
  // Los tres auxiliares, con la marca arriba.
  for (const name of LEGAL_AUX_DRAFTS) {
    const s = draft(name);
    assert(
      s.split("\n").slice(0, 5).join("\n").includes(BANNER),
      `${name} debe llevar el aviso arriba`
    );
  }
  // El espejo en código.
  assert(LEGAL_PACKAGE_APPROVED === true, "LEGAL_PACKAGE_APPROVED debe estar en true");
  assert(
    /export const LEGAL_PACKAGE_APPROVED = true/.test(read("lib/domain/legal-package.ts")),
    "la constante debe estar declarada en true de forma literal"
  );
  assert(
    LEGAL_PACKAGE_DRAFT_BANNER === BANNER,
    "el aviso del módulo de dominio debe ser idéntico al de los auxiliares"
  );
  // Versión y fechas.
  assert(LEGAL_PACKAGE_VERSION === "1.0", "la versión comercial debe ser 1.0");
  assert(
    LEGAL_PACKAGE_APPROVAL_DATE === "27 de julio de 2026",
    "la fecha de aprobación debe ser el 27 de julio de 2026"
  );
  assert(
    LEGAL_PACKAGE_EFFECTIVE_DATE === "27 de julio de 2026",
    "la entrada en vigor debe ser el 27 de julio de 2026"
  );
  // Y los seis documentos están inventariados en el código, ya renombrados.
  assert(LEGAL_PACKAGE_DOCUMENTS.length === 6, "el paquete son seis documentos");
  for (const d of LEGAL_PACKAGE_DOCUMENTS) {
    assert(exists(d.source), `no existe el archivo fuente ${d.source}`);
    assert(/_APPROVED\.md$/.test(d.source), `${d.source} debe apuntar al documento aprobado`);
  }
  // Ninguna referencia residual a un borrador del paquete.
  assert(
    !/_DRAFT\.md/.test(read("lib/domain/legal-package.ts")),
    "el módulo no puede seguir apuntando a borradores"
  );
});

check("96. La página del paquete lo presenta vigente sin duplicar el articulado", () => {
  const page = read("app/legal/paquete/page.tsx");
  // Ya no hay aviso de borrador.
  assert(
    !page.includes("LEGAL_PACKAGE_DRAFT_BANNER"),
    "la página no debe mostrar el aviso de borrador"
  );
  assert(
    !/!LEGAL_PACKAGE_APPROVED/.test(page),
    "la página no debe seguir condicionando el contenido a la falta de aprobación"
  );
  // Presenta el paquete como vigente, con su versión y su fecha.
  assert(
    /LEGAL_PACKAGE_EFFECTIVE_DATE/.test(page) && /LEGAL_PACKAGE_VERSION/.test(page),
    "la página debe declarar versión y fecha de entrada en vigor"
  );
  assert(/vigente/i.test(page), "la página debe declarar el paquete vigente");
  // Da acceso a los seis: enlaces a /terms y /privacy, y textos servidos.
  assert(
    page.includes('href="/terms"') && page.includes('href="/privacy"'),
    "la página debe enlazar los dos documentos versionados"
  );
  for (const constante of [
    "PRIVACY_NOTICE_FULL",
    "REGISTRATION_AUTHORIZATION_TEXT",
    "ESSENTIAL_COOKIES_INVENTORY",
    "LEGAL_PACKAGE_DOCUMENTS",
  ]) {
    assert(page.includes(constante), `la página debe servir ${constante}`);
  }
  // Conserva operador, proveedores y cookies esenciales.
  assert(page.includes("LEGAL_OPERATOR"), "debe conservar los datos del operador");
  assert(page.includes("LEGAL_TECH_PROVIDERS"), "debe conservar Supabase, Vercel y Resend");
  assert(
    page.includes("ESSENTIAL_COOKIES_PURPOSES"),
    "debe conservar las finalidades de las cookies esenciales"
  );
  // No puede incrustar una segunda copia del articulado ni leer la base.
  assert(
    !/Cláusula|CLÁUSULA|## \d+\./.test(page),
    "la página no debe incrustar articulado jurídico"
  );
  assert(
    !/legal_documents/.test(page.replace(/^\s*\/\/.*$/gm, "")),
    "la página del paquete no debe leer ni escribir documentos versionados"
  );
  // Ni presentar los auxiliares no adoptados como políticas vigentes: no
  // se nombran, no se enlazan y no aparecen en el inventario del código.
  for (const aux of LEGAL_AUX_DRAFTS) {
    assert(!page.includes(aux), `la página no debe referirse a ${aux}`);
  }
  const visible = page.replace(/^\s*\/\/.*$/gm, "");
  assert(
    !/consentimiento de mercadeo|autorización de mercadeo|política de conservación/i.test(visible),
    "la página no debe presentar los documentos auxiliares como políticas vigentes"
  );
  // La única mención admisible al mercadeo es su NEGACIÓN.
  const menciones = visible.match(/[^.]*mercadeo[^.]*/gi) ?? [];
  for (const m of menciones) {
    assert(/\bno\b/i.test(m), `toda mención al mercadeo debe ser una negación: ${m.trim()}`);
  }
});

check("97. /terms y /privacy siguen leyendo los documentos activos de la base", () => {
  for (const [ruta, tipo] of [
    ["app/terms/page.tsx", "terms"],
    ["app/privacy/page.tsx", "privacy"],
  ] as const) {
    const p = read(ruta);
    assert(
      new RegExp(`getActiveLegalDocumentByType\\("${tipo}"\\)`).test(p),
      `${ruta} debe leer el documento activo de tipo ${tipo}`
    );
    assert(/doc\.content/.test(p), `${ruta} debe renderizar el contenido de la base`);
    assert(/doc\.version/.test(p), `${ruta} debe mostrar la versión del documento`);
    // Nada de una segunda copia incrustada del texto legal.
    assert(
      !/CORPORACIÓN INSTITUTO|901835846-6|## \d+\./.test(p),
      `${ruta} no puede incrustar una segunda copia del texto legal`
    );
  }
  // Y la lectura sigue pasando por la capa de datos, no por el módulo de
  // dominio del paquete.
  assert(
    /getActiveLegalDocumentByType/.test(read("lib/db/legal.ts")),
    "la lectura debe seguir viviendo en lib/db/legal.ts"
  );
});

check("97b. El bloqueo fail-closed sigue evaluándose antes de cualquier escritura", () => {
  const s = read(PUBLISH_SQL);
  const bloqueo = s.indexOf("if not c_legal_approval_confirmed then");
  const primeraEscritura = Math.min(
    ...["update public.legal_documents", "insert into public.legal_documents"]
      .map((k) => s.indexOf(k))
      .filter((i) => i !== -1)
  );
  assert(
    bloqueo !== -1 && bloqueo < primeraEscritura,
    "el bloqueo debe evaluarse antes de la primera escritura"
  );
  // Y la validación exacta del contenido vigente v1 sigue intacta.
  assert(
    /and content       = c_terms_v1_content/.test(s) &&
      /and content       = c_privacy_v1_content/.test(s),
    "debe conservarse la comparación exacta con el texto vigente de la 0066"
  );
  assert(
    /c_terms_v1_md5   constant text := '7e30e6abb716d7d472b1b2d27e660a37'/.test(s) &&
      /c_privacy_v1_md5 constant text := '9f3719ca5e83a6566ad8743d101e7d3f'/.test(s),
    "deben conservarse las huellas md5 de diagnóstico del estado v1"
  );
  // Advisory lock, transacción y conteos exactos.
  assert(/pg_advisory_xact_lock\(c_lock_key\)/.test(s), "debe conservarse el advisory lock");
  assert(/c_lock_key constant bigint := 1000010001/.test(s), "la clave del lock no puede cambiar");
  assert(/^\s*begin;/im.test(s) && /commit;\s*$/m.test(s.trim()), "debe seguir siendo transaccional");
  assert(
    (s.match(/get diagnostics v_rows = row_count;/g) ?? []).length === 2,
    "deben conservarse los dos conteos exactos"
  );
  assert(
    /if v_rows <> 2 then/.test(s),
    "los conteos deben seguir exigiendo exactamente 2 filas"
  );
  assert(
    (s.match(/VERIFICACIÓN FALLIDA/g) ?? []).length >= 6,
    "deben conservarse las verificaciones finales dentro de la transacción"
  );
});

check("98. Los scripts de publicación y reversión siguen siendo seguros", () => {
  for (const f of [PUBLISH_SQL, ROLLBACK_SQL]) {
    const bare = sqlBare(stripDocLiterals(read(f)));
    for (const rx of [/\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+table\b/i, /\balter\s+table\b/i]) {
      assert(!rx.test(bare), `${f} no debe contener ${rx}`);
    }
    assert(/^\s*begin;/im.test(bare) && /commit;\s*$/im.test(bare.trim()), `${f} debe ser transaccional`);
    assert(/pg_advisory_xact_lock/.test(bare), `${f} debe tomar el advisory lock`);
  }
  // La reversión no depende del texto publicado: sigue siendo aplicable
  // aunque el contenido de v2 haya cambiado con la aprobación jurídica.
  const rb = read(ROLLBACK_SQL);
  assert(
    !/c_terms_v2_content|c_privacy_v2_content/.test(rb),
    "el rollback no debe depender del texto concreto de v2"
  );
  assert(
    /status = 'archived'/.test(rb) && /status = 'active'/.test(rb),
    "el rollback debe archivar v2 y reactivar v1"
  );
  // Misma clave de lock que la publicación: ambos se excluyen mutuamente.
  assert(
    /c_lock_key constant bigint := 1000010001/.test(rb),
    "el rollback debe usar la MISMA clave de advisory lock que la publicación"
  );
  // Precondiciones exactas y conteos, sin pérdida de historial.
  assert(
    /v_v2_terms_active   <> 1[\s\S]{0,200}raise exception/.test(rb),
    "el rollback debe abortar si no se cumplen sus precondiciones"
  );
  assert(
    (rb.match(/get diagnostics v_rows = row_count;/g) ?? []).length === 2,
    "el rollback debe conservar sus dos conteos exactos"
  );
  assert(
    /La reversión NUNCA debe perder historial/.test(rb),
    "el rollback debe verificar que siguen existiendo las cuatro filas"
  );
  // Y jamás toca las aceptaciones históricas.
  assert(
    !/user_legal_acceptances/.test(sqlBare(rb)),
    "el rollback no puede escribir sobre las aceptaciones históricas"
  );
});

check("99. La aceptación queda versionada y con evidencia suficiente", () => {
  // La comparación es por documento (id), no por tipo: una versión nueva
  // invalida la aceptación anterior sin borrarla.
  const activosV1 = [{ id: "doc-t-v1", documentType: "terms" as const, version: "v1" }];
  const activosV2 = [{ id: "doc-t-v2", documentType: "terms" as const, version: "v2" }];
  const aceptado = [{ legalDocumentId: "doc-t-v1" }];
  assert(
    hasAcceptedAllRequiredDocuments(activosV1, aceptado),
    "quien aceptó la versión vigente debe estar al día"
  );
  assert(
    !hasAcceptedAllRequiredDocuments(activosV2, aceptado),
    "al publicarse una versión nueva, la aceptación anterior deja de contar"
  );
  assert(
    pendingRequiredDocuments(activosV2, aceptado).length === 1,
    "la versión nueva debe aparecer como pendiente"
  );
  // Evidencia conservada por la migración histórica.
  const m = read("supabase/migrations/0066_legal_documents_and_acceptances.sql");
  for (const campo of ["legal_document_id", "document_type", "version", "accepted_at", "ip_address", "user_agent"]) {
    assert(m.includes(campo), `la evidencia debe conservar ${campo}`);
  }
  assert(
    /Sin UPDATE\/DELETE/i.test(m),
    "las aceptaciones deben seguir siendo inmutables"
  );
  // Sin prometer firma digital certificada.
  assert(
    !/firma digital certificada/i.test(PUBLICABLE_TEXT().replace(/no (constituye|es)[^.]{0,120}/gi, "")),
    "no puede afirmarse que exista firma digital certificada"
  );
});

check("100. Las dos casillas se revalidan en servidor", () => {
  const action = read("server/actions/legal.ts");
  assert(
    /confirm_terms/.test(action) && /confirm_privacy/.test(action),
    "el servidor debe leer las dos casillas"
  );
  assert(
    /hasConfirmedAllLegalCheckboxes/.test(action),
    "el servidor debe usar la validación pura de las casillas"
  );
  // La función pura falla cerrado.
  assert(!hasConfirmedAllLegalCheckboxes({}), "sin casillas debe rechazar");
  assert(
    !hasConfirmedAllLegalCheckboxes({ confirm_terms: "on" }),
    "con una sola casilla debe rechazar"
  );
  assert(
    hasConfirmedAllLegalCheckboxes({ confirm_terms: "on", confirm_privacy: "on" }),
    "con las dos casillas debe aceptar"
  );
  // La aceptación sigue delegando en la RPC, que decide los documentos.
  assert(
    /accept_active_legal_documents/.test(read("lib/db/legal.ts")),
    "la escritura debe seguir pasando por la RPC SECURITY DEFINER"
  );
});

check("101. Los documentos preliminares anteriores no se publican como definitivos", () => {
  // Lo vigente en la base sigue siendo v1, sembrado por la migración 0066.
  const m = read("supabase/migrations/0066_legal_documents_and_acceptances.sql");
  assert(
    m.includes("Términos de uso de Trazaloop (versión preliminar)"),
    "la migración histórica no debe modificarse"
  );
  // Y el hueco está declarado como tal, no dado por resuelto.
  const gaps = draft("V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md");
  assert(
    /sigue siendo el preliminar limitado a CPR/i.test(gaps),
    "los gaps deben reconocer que lo vigente sigue limitado a CPR"
  );
  // Los seis aprobados SÍ se presentan como vigentes, con fecha y versión.
  for (const name of LEGAL_PACKAGE_SIX) {
    const s = draft(name);
    assert(/\*\*Estado:\*\* VIGENTE/.test(s), `${name} debe declararse VIGENTE`);
    assert(
      !/pendiente de (aprobación|redacción) jurídica/i.test(s),
      `${name} no puede seguir declarándose pendiente de aprobación`
    );
  }
  // Pero ninguno afirma estar YA cargado en la base: la publicación es un
  // paso posterior que este cambio no ejecuta.
  for (const name of LEGAL_PACKAGE_SIX) {
    assert(
      !/ya publicado en la base|cargado en `legal_documents`/i.test(draft(name)),
      `${name} no puede afirmar que ya está publicado en la base de datos`
    );
  }
  // Y no se coló contenido jurídico en ninguna migración.
  for (const f of fs.readdirSync(path.join(ROOT, "supabase", "migrations"))) {
    const s = read(`supabase/migrations/${f}`);
    assert(
      !s.includes("BORRADOR PARA REVISIÓN JURÍDICA") && !s.includes("901835846-6"),
      `${f} no debe contener contenido del paquete jurídico`
    );
  }
});

check("102. El registro público sigue cerrado y el aviso no lo abre", () => {
  // Fail-closed: sin variable, cerrado.
  assert(!isPublicRegistrationFlagEnabled(undefined), "sin valor, el registro debe estar cerrado");
  assert(!isPublicRegistrationFlagEnabled("false"), "con false, cerrado");
  // La página sigue consultando el guard antes de renderizar el formulario.
  const page = read("app/(auth)/register/page.tsx");
  assert(
    /shouldRenderRegistrationForm/.test(page),
    "el registro debe seguir decidiéndose en servidor"
  );
  // El aviso de privacidad se añadió DENTRO del formulario, no fuera del guard.
  const form = read("components/domain/auth/register-form.tsx");
  assert(
    form.includes("PRIVACY_NOTICE_SHORT"),
    "el formulario debe mostrar el aviso de privacidad"
  );
  assert(
    !/PUBLIC_REGISTRATION_ENABLED|process\.env/.test(form),
    "el formulario de cliente no puede leer el kill switch"
  );
  assert(
    /^PUBLIC_REGISTRATION_ENABLED=$/m.test(read(".env.example")),
    ".env.example no debe traer el registro habilitado por defecto"
  );
});

check("103. No se modificaron migraciones y no existe 0103", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const numbers = files.map((f) => Number(f.slice(0, 4))).sort((a, b) => a - b);
  assert(numbers[0] === 1, "la primera migración debe seguir siendo 0001");
  // PCR-03 original ocupa 0106–0108; la cola autorizada la declara QUALITY_01_ALLOWED.
  assert(
    numbers[numbers.length - 1] === MAX_DECLARED_MIGRATION,
    `la última migración debe ser ${MAX_DECLARED_MIGRATION}, es ${numbers[numbers.length - 1]}`
  );
  assert(
    files.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)).length === 0,
    "PCR-03 original termina en 0108; 0109 y el hotfix pgcrypto 0110 son los autorizados; no debe existir 0111 ni posterior"
  );
  // Y el paquete jurídico no introdujo ninguna tabla ni columna nueva.
  assert(
    !exists("supabase/migrations/0103_legal_package.sql"),
    "el paquete jurídico no puede convertirse en migración"
  );
});

check("104. Los SHA-256 declarados coinciden con los ocho archivos reales", () => {
  const RELEASE_DOC = "docs/releases/V1.0.0_LEGAL_PACKAGE_V1.md";
  assert(exists(RELEASE_DOC), `debe existir ${RELEASE_DOC}`);
  const doc = read(RELEASE_DOC);

  const HASHED = [
    ...LEGAL_PACKAGE_SIX.map((n) => `${LEGAL_DIR}/${n}`),
    PUBLISH_SQL,
    ROLLBACK_SQL,
  ];
  assert(HASHED.length === 8, "deben publicarse los hashes de ocho archivos");

  for (const rel of HASHED) {
    const real = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(ROOT, rel)))
      .digest("hex");
    // La tabla del documento asocia cada ruta con su hash en la misma fila.
    const fila = doc
      .split("\n")
      .find((l) => l.includes(`\`${rel}\``) && /\b[0-9a-f]{64}\b/.test(l));
    assert(fila !== undefined, `${RELEASE_DOC} debe publicar el SHA-256 de ${rel}`);
    const declarado = (fila as string).match(/\b[0-9a-f]{64}\b/)?.[0];
    assert(
      declarado === real,
      `SHA-256 de ${rel}: declarado ${declarado ?? "(ninguno)"}, real ${real}`
    );
  }

  // Y el documento refleja el estado aprobado, no el de revisión.
  assert(
    /c_legal_approval_confirmed = true/.test(doc) && /LEGAL_PACKAGE_APPROVED = true/.test(doc),
    "el documento de entrega debe declarar los dos interruptores en true"
  );
  assert(
    /27 de julio de 2026/.test(doc),
    "el documento de entrega debe fechar la aprobación"
  );
  assert(
    /registro público.{0,40}cerrado|PUBLIC_REGISTRATION_ENABLED.{0,30}sin cambios/i.test(
      doc.replace(/\s+/g, " ")
    ),
    "el documento debe recordar que el registro sigue cerrado"
  );
});

// ===========================================================================
console.log("");
if (failures > 0) {
  console.error(`\n${failures} comprobación(es) de release FALLARON.\n`);
  process.exit(1);
}
console.log("Todas las comprobaciones de release v1.0.x pasaron.\n");
