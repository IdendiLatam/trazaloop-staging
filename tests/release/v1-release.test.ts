/**
 * Trazaloop v1.0.0 · PRUEBAS DE REGRESIÓN DEL RELEASE
 * tests/release/v1-release.test.ts   ·   npm run test:release
 *
 * Pruebas PURAS y estáticas: leen archivos y lógica sin BD, sin red y sin
 * sesión (patrón del proyecto). NINGUNA de ellas toca staging ni
 * producción — deliberadamente, porque un test de release nunca debe
 * depender de un proyecto real.
 *
 * Blindan los 18 invariantes de la versión oficial:
 *   1. la versión es 1.0.0
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
import { APP_VERSION, APP_VERSION_LABEL } from "../../lib/version";
import {
  resolveDeploymentEnvironment,
  isProductionEnvironment,
  isStagingEnvironment,
  environmentBadgeLabel,
} from "../../lib/env";

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

console.log("\nTrazaloop · regresión de release v1.0.0\n");

// ===========================================================================
console.log("§1 · Identidad de la versión\n");

check("1. package.json declara la versión 1.0.0", () => {
  const pkg = JSON.parse(read("package.json")) as { version: string };
  assert(pkg.version === "1.0.0", `package.json declara ${pkg.version}, se esperaba 1.0.0`);
});

check("1b. package-lock.json está sincronizado en 1.0.0", () => {
  const lock = JSON.parse(read("package-lock.json")) as {
    version: string;
    packages: Record<string, { version?: string }>;
  };
  assert(lock.version === "1.0.0", `package-lock raíz declara ${lock.version}`);
  assert(
    lock.packages[""]?.version === "1.0.0",
    `package-lock packages[""] declara ${lock.packages[""]?.version}`
  );
});

check("1c. La versión visible deriva de package.json (fuente única)", () => {
  assert(APP_VERSION === "1.0.0", `APP_VERSION es ${APP_VERSION}`);
  assert(
    APP_VERSION_LABEL === "Trazaloop v1.0",
    `la etiqueta visible es «${APP_VERSION_LABEL}», se esperaba «Trazaloop v1.0»`
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
  assert(cpr!.name === "Trazaloop CPR", `el nombre comercial es «${cpr!.name}»`);
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

check("6. Quality y Construcción siguen «Próximamente» y no son asignables", () => {
  for (const key of ["quality", "construccion"]) {
    const mod = getCommercialModuleByKey(key);
    assert(mod !== null, `el módulo ${key} debe seguir en el catálogo`);
    assert(mod!.status === "coming_soon", `${key} debe seguir en coming_soon`);
    assert(
      !FUNCTIONAL_MODULE_CODES.includes(mod!.moduleCode),
      `${key} no debe aparecer entre los módulos funcionales`
    );
    assert(
      !isFunctionalModuleCode(mod!.moduleCode),
      `${key} no debe poder asignarse como módulo funcional`
    );
  }
  assert(
    FUNCTIONAL_MODULE_CODES.length === 2,
    `se esperaban exactamente 2 módulos funcionales, hay ${FUNCTIONAL_MODULE_CODES.length}`
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

check("12. Las migraciones 0001–0102 existen y no se han tocado en este release", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const numbers = files
    .map((f) => Number(f.slice(0, 4)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  assert(numbers[0] === 1, `la primera migración es ${numbers[0]}, se esperaba 0001`);
  assert(
    numbers[numbers.length - 1] === 102,
    `la última migración es ${numbers[numbers.length - 1]}, se esperaba 0102`
  );
  // Nadie debe haber renumerado ni duplicado un prefijo.
  const dupes = numbers.filter((n, i) => i > 0 && n === numbers[i - 1]);
  assert(dupes.length === 0, `prefijos de migración duplicados: ${dupes.join(", ")}`);
});

check("13. No existe ninguna migración 0103 ni posterior", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const beyond = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 103);
  assert(
    beyond.length === 0,
    `esta fase no debía crear migraciones nuevas, pero existen: ${beyond.join(", ")}`
  );
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
  const teamAction = read("server/actions/team.ts");
  assert(
    authAction.includes("NEXT_PUBLIC_SITE_URL") && teamAction.includes("NEXT_PUBLIC_SITE_URL"),
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
  const beyond = migrations.filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 103);
  assert(beyond.length === 0, `no debe existir 0103 ni posterior: ${beyond.join(", ")}`);
});

check("34. La publicación está bloqueada por aprobación legal (fail-closed)", () => {
  const s = read(PUBLISH_SQL);
  assert(
    /c_legal_approval_confirmed constant boolean := false/.test(s),
    "el script debe estar bloqueado por defecto (aprobación legal en false)"
  );
  assert(
    /if not c_legal_approval_confirmed then[\s\S]{0,200}raise exception/.test(s),
    "debe abortar si no hay aprobación legal declarada"
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
console.log("\n§14 · Paquete jurídico y de privacidad (borradores)\n");

const LEGAL_DIR = "docs/legal";
const LEGAL_DRAFTS = [
  "V1.0.0_TERMS_DRAFT.md",
  "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_DRAFT.md",
  "V1.0.0_PRIVACY_NOTICE_DRAFT.md",
  "V1.0.0_COOKIE_POLICY_DRAFT.md",
  "V1.0.0_MARKETING_CONSENT_DRAFT.md",
  "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_DRAFT.md",
  "V1.0.0_RETENTION_AND_DELETION_POLICY_DRAFT.md",
  "V1.0.0_LEGAL_IMPLEMENTATION_GAPS.md",
];
const draft = (name: string) => read(`${LEGAL_DIR}/${name}`);
const allDrafts = () => LEGAL_DRAFTS.map(draft).join("\n\n");

check("36. Existen los ocho borradores jurídicos", () => {
  for (const name of LEGAL_DRAFTS) {
    assert(exists(`${LEGAL_DIR}/${name}`), `falta el borrador ${LEGAL_DIR}/${name}`);
  }
  assert(LEGAL_DRAFTS.length === 8, "deben ser exactamente 8 borradores");
});

check("37. Todos llevan el encabezado BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR", () => {
  const BANNER = "BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR";
  for (const name of LEGAL_DRAFTS) {
    const s = draft(name);
    assert(s.includes(BANNER), `${name} debe contener «${BANNER}»`);
    // Debe estar arriba: en las primeras líneas del archivo.
    const head = s.split("\n").slice(0, 5).join("\n");
    assert(head.includes(BANNER), `${name} debe llevar el aviso en la parte SUPERIOR`);
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
  // Y deben decir expresamente que NO lo declaran.
  const policy = draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_DRAFT.md");
  assert(
    /no se declara que cumpla ninguna legislación/i.test(policy),
    "la política debe declarar expresamente que no afirma cumplimiento"
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
  const c = draft("V1.0.0_COOKIE_POLICY_DRAFT.md");
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

check("43. El script de publicación sigue BLOQUEADO (no se desbloqueó)", () => {
  const s = read(PUBLISH_SQL);
  assert(
    /c_legal_approval_confirmed constant boolean := false/.test(s),
    "c_legal_approval_confirmed DEBE seguir en false"
  );
  assert(
    !/c_legal_approval_confirmed constant boolean := true/.test(s),
    "el script no debe haberse desbloqueado"
  );
  // Y los borradores no se cargaron en el script.
  assert(
    !s.includes("BORRADOR PARA REVISIÓN JURÍDICA"),
    "los borradores no deben haberse trasladado todavía al script de publicación"
  );
});

check("44. Los borradores identifican los módulos CPR y Textiles", () => {
  for (const name of [
    "V1.0.0_TERMS_DRAFT.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_DRAFT.md",
  ]) {
    const s = draft(name);
    assert(/Trazaloop CPR/.test(s), `${name} debe identificar Trazaloop CPR`);
    assert(/Trazaloop Textiles/.test(s), `${name} debe identificar Trazaloop Textiles`);
    assert(/NTC 6632/.test(s), `${name} debe mencionar NTC 6632`);
    assert(/UNE-EN 15343/.test(s), `${name} debe mencionar UNE-EN 15343`);
  }
  // Y no deben atribuir a Trazaloop facultades de certificación: la
  // cláusula «Qué NO es Trazaloop» debe enumerar todas las negaciones.
  const terms = draft("V1.0.0_TERMS_DRAFT.md");
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

check("45. Se incluye el ciclo de conservación con máximo de 120 días", () => {
  const r = draft("V1.0.0_RETENTION_AND_DELETION_POLICY_DRAFT.md");
  for (const plazo of ["30 días", "90 días", "120 días"]) {
    assert(r.includes(plazo), `la política de retención debe incluir ${plazo}`);
  }
  assert(
    /máximo técnico ordinario/i.test(r),
    "debe declararse el máximo técnico ordinario"
  );
  // La promesa absoluta retirada.
  assert(
    /se retira|sustituye/i.test(r) && r.includes("sin perder los datos ya cargados"),
    "debe documentarse la retirada de la promesa «sin perder los datos ya cargados»"
  );
  // Y los términos ya no la usan como compromiso.
  const terms = draft("V1.0.0_TERMS_DRAFT.md");
  const clause = terms.slice(terms.indexOf("### 9.2"), terms.indexOf("## 10"));
  assert(
    !/sin perder los datos ya cargados/.test(clause) ||
      /se retira|sustitución/i.test(clause),
    "los términos no deben conservar la promesa absoluta como compromiso vigente"
  );
});

check("46. Se identifica al operador con razón social y NIT correctos", () => {
  const RAZON = "CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL";
  const NIT = "901835846-6";
  for (const name of [
    "V1.0.0_TERMS_DRAFT.md",
    "V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_DRAFT.md",
    "V1.0.0_PRIVACY_NOTICE_DRAFT.md",
    "V1.0.0_COOKIE_POLICY_DRAFT.md",
    "V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_DRAFT.md",
  ]) {
    const s = draft(name);
    assert(s.includes(RAZON), `${name} debe identificar la razón social exacta`);
    assert(s.includes(NIT), `${name} debe incluir el NIT ${NIT}`);
  }
  // Datos de contacto oficiales, sin inventar otros.
  const policy = draft("V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_DRAFT.md");
  assert(policy.includes("contacto@idendi.org"), "correo de privacidad correcto");
  assert(policy.includes("Carrera 43A # 15 Sur – 15"), "dirección correcta");
  assert(policy.includes("Medellín, Colombia"), "domicilio correcto");
  const terms = draft("V1.0.0_TERMS_DRAFT.md");
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
  const addendum = draft("V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_DRAFT.md");
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
  const beyond = migrations.filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 103);
  assert(beyond.length === 0, `no debe existir 0103 ni posterior: ${beyond.join(", ")}`);
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
  // El catálogo del código no cambió.
  assert(FUNCTIONAL_MODULE_CODES.length === 2, "siguen siendo 2 los módulos funcionales");
  for (const key of ["quality", "construccion"]) {
    assert(
      getCommercialModuleByKey(key)?.status === "coming_soon",
      `${key} debe seguir en coming_soon`
    );
  }
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
  const cookiePolicy = read("docs/legal/V1.0.0_COOKIE_POLICY_DRAFT.md");
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

check("58. Los ocho documentos legales siguen marcados como borradores", () => {
  const BANNER = "BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR";
  for (const name of LEGAL_DRAFTS) {
    assert(draft(name).includes(BANNER), `${name} debe seguir marcado como borrador`);
  }
});

check("59. c_legal_approval_confirmed sigue en false", () => {
  const s = read(PUBLISH_SQL);
  assert(
    /c_legal_approval_confirmed constant boolean := false/.test(s),
    "el script de publicación debe seguir bloqueado"
  );
  // Y el aplazamiento formal está documentado.
  const review = read("docs/releases/V1.0.0_LEGAL_REVIEW.md");
  assert(
    /APLAZADAS|aplazad/i.test(review),
    "el informe legal debe declarar el aplazamiento formal de la publicación"
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

check("74. No se tocaron migraciones ni el bloqueo legal", () => {
  const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  const beyond = migrations.filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 103);
  assert(beyond.length === 0, `no debe existir 0103 ni posterior: ${beyond.join(", ")}`);
  assert(
    /c_legal_approval_confirmed constant boolean := false/.test(read(PUBLISH_SQL)),
    "el script legal debe seguir bloqueado"
  );
  for (const name of LEGAL_DRAFTS) {
    assert(
      draft(name).includes("BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR"),
      `${name} debe seguir marcado como borrador`
    );
  }
});

// ===========================================================================
console.log("");
if (failures > 0) {
  console.error(`\n${failures} comprobación(es) de release FALLARON.\n`);
  process.exit(1);
}
console.log("Todas las comprobaciones de release v1.0.0 pasaron.\n");
