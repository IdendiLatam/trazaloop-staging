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
console.log("");
if (failures > 0) {
  console.error(`\n${failures} comprobación(es) de release FALLARON.\n`);
  process.exit(1);
}
console.log("Todas las comprobaciones de release v1.0.0 pasaron.\n");
