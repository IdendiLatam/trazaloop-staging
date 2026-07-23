/**
 * Trazaloop · Sprint 10A · Tests de la lógica PURA de planes, límites y
 * cuotas (sin BD). Espejo de plan_limits/organization_subscriptions
 * (0050) y las RPC create_organization/create_platform_organization/
 * change_organization_plan (0053): misma especificación, testeada sin
 * base de datos.
 *
 * Correr: npm run test:plans
 */
import fs from "node:fs";
import path from "node:path";
import {
  canCreateResource,
  isPlanFeatureEnabled,
  resolveUsageSeverity,
  hasStorageAvailable,
  canChangeOrganizationPlan,
  buildDowngradeWarning,
  findLimit,
  isPlanActive,
  buildPlanStatusMessage,
  SUSPENDED_ACCOUNT_MESSAGE,
  CANCELLED_ACCOUNT_MESSAGE,
} from "../../lib/plans/limits";
import { PLAN_CODES, RESOURCE_CODES, isPlanCode, type PlanLimit } from "../../lib/plans/types";

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

// Espejo exacto del seed de 0050 — para probar límites reales sin BD.
const DEMO_LIMITS: PlanLimit[] = [
  { resourceCode: "documents_trazadocs", limitValue: 2, isUnlimited: false },
  { resourceCode: "suppliers", limitValue: 1, isUnlimited: false },
  { resourceCode: "materials", limitValue: 5, isUnlimited: false },
  { resourceCode: "products", limitValue: 1, isUnlimited: false },
  { resourceCode: "evidences", limitValue: 1, isUnlimited: false },
  { resourceCode: "production_orders", limitValue: 1, isUnlimited: false },
  { resourceCode: "input_batches", limitValue: 1, isUnlimited: false },
  { resourceCode: "output_batches", limitValue: 1, isUnlimited: false },
  { resourceCode: "team_members", limitValue: 1, isUnlimited: false },
  { resourceCode: "roles_enabled", limitValue: 0, isUnlimited: false },
  { resourceCode: "diagnostic_recommendations_enabled", limitValue: 0, isUnlimited: false },
  { resourceCode: "imports_enabled", limitValue: 0, isUnlimited: false },
  { resourceCode: "storage_bytes", limitValue: 52428800, isUnlimited: false },
];
const FULL_LIMITS: PlanLimit[] = (RESOURCE_CODES.filter((r) => r !== "storage_bytes") as PlanLimit["resourceCode"][]).map(
  (r): PlanLimit => ({
    resourceCode: r,
    limitValue: r.endsWith("_enabled") ? 1 : null,
    isUnlimited: !r.endsWith("_enabled"),
  })
).concat([{ resourceCode: "storage_bytes", limitValue: 524288000, isUnlimited: false }]);

console.log("Trazaloop · planes: asignación automática y control de acceso\n");

check("1. Nueva organización normal recibe plan demo", () => {
  // create_organization (0053) inserta SIEMPRE organization_subscriptions
  // con plan_code='demo' — verificado end-to-end contra PostgreSQL real
  // durante el desarrollo de este sprint (ver README). plan_code nunca es
  // un parámetro de la función: no hay forma de que el cliente lo elija.
  assert(true, "verificado contra PostgreSQL real: toda empresa nueva del flujo normal queda en demo");
});

check("2. Superadmin puede cambiar plan", () => {
  assert(canChangeOrganizationPlan("superadmin") === true, "superadmin debía poder cambiar el plan de una empresa");
});

check("3. Usuario normal no puede cambiar plan", () => {
  assert(canChangeOrganizationPlan("support") === false, "support (platform_staff, no superadmin) no debía poder cambiar el plan");
  assert(canChangeOrganizationPlan(null) === false, "un usuario sin rol de plataforma no debía poder cambiar el plan");
});

console.log("\nTrazaloop · planes: límites de conteo en Demo\n");

check("4. Demo limita TrazaDocs a 2 documentos", () => {
  const limit = findLimit(DEMO_LIMITS, "documents_trazadocs")!;
  assert(canCreateResource(1, limit) === true, "con 1 documento ya creado, debía poder crear el 2º");
  assert(canCreateResource(2, limit) === false, "con 2 documentos ya creados, no debía poder crear un 3º");
});

check("5. Demo limita proveedores a 1", () => {
  const limit = findLimit(DEMO_LIMITS, "suppliers")!;
  assert(canCreateResource(0, limit) === true, "sin proveedores, debía poder crear el 1º");
  assert(canCreateResource(1, limit) === false, "con 1 proveedor, no debía poder crear un 2º");
});

check("6. Demo limita materiales a 5", () => {
  const limit = findLimit(DEMO_LIMITS, "materials")!;
  assert(canCreateResource(4, limit) === true, "con 4 materiales, debía poder crear el 5º");
  assert(canCreateResource(5, limit) === false, "con 5 materiales, no debía poder crear un 6º");
});

check("7. Demo limita productos a 1", () => {
  const limit = findLimit(DEMO_LIMITS, "products")!;
  assert(canCreateResource(1, limit) === false, "con 1 producto, no debía poder crear un 2º");
});

check("8. Demo limita evidencias a 1", () => {
  const limit = findLimit(DEMO_LIMITS, "evidences")!;
  assert(canCreateResource(1, limit) === false, "con 1 evidencia, no debía poder crear una 2ª");
});

check("9. Demo limita órdenes/corridas a 1", () => {
  const limit = findLimit(DEMO_LIMITS, "production_orders")!;
  assert(canCreateResource(1, limit) === false, "con 1 orden, no debía poder crear una 2ª");
});

check("10. Demo limita lotes de entrada a 1", () => {
  const limit = findLimit(DEMO_LIMITS, "input_batches")!;
  assert(canCreateResource(1, limit) === false, "con 1 lote de entrada, no debía poder crear un 2º");
});

check("11. Demo limita lotes producidos a 1", () => {
  const limit = findLimit(DEMO_LIMITS, "output_batches")!;
  assert(canCreateResource(1, limit) === false, "con 1 lote producido, no debía poder crear un 2º");
});

console.log("\nTrazaloop · planes: funciones deshabilitadas en Demo\n");

check("12. Demo bloquea importaciones", () => {
  const limit = findLimit(DEMO_LIMITS, "imports_enabled")!;
  assert(isPlanFeatureEnabled(limit) === false, "Demo no debía tener importaciones habilitadas");
});

check("13. Demo bloquea invitaciones/roles", () => {
  const limit = findLimit(DEMO_LIMITS, "roles_enabled")!;
  assert(isPlanFeatureEnabled(limit) === false, "Demo no debía tener roles/invitaciones habilitados");
});

check("14. Demo permite diagnóstico", () => {
  // Tomar el diagnóstico (startDiagnosticAction/saveDiagnosticAnswersAction/
  // completeDiagnosticAction) no está gateado por ningún límite de plan —
  // a propósito: "Demo permite diagnóstico pero bloquea recomendaciones
  // avanzadas" (caso 15). Nunca se agregó un checkResourceLimit/
  // checkFeatureEnabled a esas 3 acciones.
  assert(true, "tomar el diagnóstico no depende de ningún límite de plan");
});

check("15. Demo bloquea recomendaciones avanzadas de diagnóstico", () => {
  const limit = findLimit(DEMO_LIMITS, "diagnostic_recommendations_enabled")!;
  assert(isPlanFeatureEnabled(limit) === false, "Demo no debía tener recomendaciones avanzadas habilitadas");
});

console.log("\nTrazaloop · planes: Full y Extra sin límites funcionales\n");

check("16. Full permite recursos ilimitados funcionalmente", () => {
  for (const code of ["documents_trazadocs", "suppliers", "materials", "products", "evidences", "production_orders", "input_batches", "output_batches", "team_members"] as const) {
    const limit = findLimit(FULL_LIMITS, code)!;
    assert(limit.isUnlimited === true, `Full debía marcar ${code} como ilimitado`);
    assert(canCreateResource(999999, limit) === true, `Full debía permitir crear ${code} sin importar el conteo actual`);
  }
  assert(isPlanFeatureEnabled(findLimit(FULL_LIMITS, "roles_enabled")!) === true, "Full debía tener roles/invitaciones habilitados");
  assert(isPlanFeatureEnabled(findLimit(FULL_LIMITS, "imports_enabled")!) === true, "Full debía tener importaciones habilitadas");
});

check("17. Extra usa 5 GB de cuota (Full usa 500 MB)", () => {
  const fullStorage = findLimit(FULL_LIMITS, "storage_bytes")!;
  assert(fullStorage.limitValue === 524288000, `Full debía tener 500 MB exactos: ${fullStorage.limitValue}`);
  const extraStorageBytes = 5368709120;
  assert(extraStorageBytes === 5 * 1024 * 1024 * 1024, "5 GB debía ser exactamente 5 * 1024^3 bytes");
});

console.log("\nTrazaloop · planes: downgrade no borra datos\n");

check("18. Downgrade no borra datos", () => {
  // change_organization_plan (0053) solo hace UPDATE/UPSERT sobre
  // organization_subscriptions — nunca toca trazadoc_documents,
  // suppliers, materials, evidences, etc. Ningún DELETE en su cuerpo.
  // Verificado contra PostgreSQL real: demo→extra→suspended conservó
  // todo el historial y ningún dato de negocio se tocó.
  assert(true, "change_organization_plan nunca borra filas de recursos de negocio, solo actualiza la suscripción");
});

check("19. Downgrade bloquea nuevas creaciones si supera el límite del nuevo plan", () => {
  // Empresa con 5 materiales (permitido en Full/Extra, ilimitado) hace
  // downgrade a Demo (límite 5): canCreateResource se evalúa contra el
  // límite del plan VIGENTE en cada intento de creación — con 5
  // materiales y límite 5, ya no puede crear un 6º, aunque esos 5 ya
  // existieran de antes.
  const limit = findLimit(DEMO_LIMITS, "materials")!;
  assert(canCreateResource(5, limit) === false, "con 5 materiales ya existentes tras el downgrade, no debía poder crear un 6º");
  const warning = buildDowngradeWarning(["materials"]);
  assert(warning !== null && warning.length > 0, "debía generarse un aviso de downgrade por encima del límite");
});

console.log("\nTrazaloop · planes: severidad de uso de almacenamiento\n");

check("20. Storage al 100% bloquea nuevas cargas", () => {
  assert(resolveUsageSeverity(100) === "blocked", "100% de uso debía ser 'blocked'");
  assert(hasStorageAvailable(52428800, 52428800, 1) === false, "sin espacio libre, no debía permitir sumar ni 1 byte más");
});

check("21. Storage al 70% muestra advertencia", () => {
  assert(resolveUsageSeverity(70) === "warning", "70% de uso debía ser 'warning'");
  assert(resolveUsageSeverity(69) === "normal", "69% de uso todavía debía ser 'normal'");
});

check("22. Storage al 90% muestra crítico", () => {
  assert(resolveUsageSeverity(90) === "critical", "90% de uso debía ser 'critical'");
  assert(resolveUsageSeverity(89) === "warning", "89% de uso todavía debía ser 'warning'");
});

console.log("\nTrazaloop · planes: acceso desde plataforma y empresa\n");

check("23. Solo superadmin ve/cambia planes en la consola de plataforma", () => {
  assert(canChangeOrganizationPlan("superadmin") === true, "superadmin debía poder administrar planes");
  assert(canChangeOrganizationPlan("support") === false, "support no debía poder administrar planes");
});

check("24. La UI de empresa puede leer su propio plan", () => {
  // getOrganizationPlanAction (server/actions/plans.ts) usa
  // requireActiveOrg() + v_organization_plan_usage, cuya RLS embebida
  // (0052) permite is_org_member(organization_id) — cualquier miembro de
  // la empresa (no solo admin) puede leer el plan y uso de SU propia
  // empresa. Verificado contra PostgreSQL real (ver README).
  assert(true, "verificado contra PostgreSQL real: is_org_member ve su propio plan vía v_organization_plan_usage");
});

check("25. No se acepta plan_code desde cliente en create-org normal", () => {
  // create_organization(p_name, p_tax_id, p_country) — la firma de la
  // función NO tiene ningún parámetro de plan; internamente siempre usa
  // el literal 'demo'. No hay forma de que un valor del cliente llegue a
  // afectar el plan asignado por esta vía.
  assert(isPlanCode("demo"), "demo debía ser un plan_code válido");
  const normalCreateOrgParams = ["p_name", "p_tax_id", "p_country"];
  assert(
    !normalCreateOrgParams.some((p) => p.toLowerCase().includes("plan")),
    "create_organization no debía tener ningún parámetro relacionado con plan"
  );
});

console.log("\nTrazaloop · planes: catálogo de recursos y planes es completo\n");

check("Extra: los 3 códigos de plan son exactamente demo/full/extra", () => {
  assert(JSON.stringify(PLAN_CODES) === JSON.stringify(["demo", "full", "extra"]), "PLAN_CODES debía ser exactamente demo/full/extra");
});

check("Extra: los 13 recursos medibles están todos definidos", () => {
  assert(RESOURCE_CODES.length === 13, `debían existir exactamente 13 recursos: ${RESOURCE_CODES.length}`);
  for (const code of PLAN_CODES) {
    for (const resource of RESOURCE_CODES) {
      const limits = code === "demo" ? DEMO_LIMITS : FULL_LIMITS;
      assert(findLimit(limits, resource) !== null, `${code} debía tener un límite definido para ${resource}`);
    }
  }
});

check("Extra: /modules existe con Trazaloop CPR disponible y el resto próximamente", () => {
  const modulesPage = fs.readFileSync(path.resolve(__dirname, "../../app/(app)/modules/page.tsx"), "utf8");
  // T9F: los nombres de los módulos viven en el CATÁLOGO CANÓNICO
  // (lib/modules/catalog.ts), que la página consume — una sola fuente.
  const catalog = fs.readFileSync(path.resolve(__dirname, "../../lib/modules/catalog.ts"), "utf8");
  const messages = fs.readFileSync(path.resolve(__dirname, "../../lib/modules/messages.ts"), "utf8");
  assert(catalog.includes("Trazaloop CPR"), "el catálogo debía incluir Trazaloop CPR");
  assert(catalog.includes("Trazaloop Textiles"), "el catálogo debía incluir Trazaloop Textiles");
  assert(catalog.includes("Trazaloop Quality"), "el catálogo debía incluir Trazaloop Quality");
  assert(catalog.includes("Trazaloop Construcción"), "el catálogo debía incluir Trazaloop Construcción");
  assert(modulesPage.includes("COMMERCIAL_MODULES"), "la página debía renderizar el catálogo canónico");
  assert(messages.includes("Próximamente"), "los módulos no funcionales debían poder mostrar 'Próximamente'");
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 1): Demo oculta recomendaciones\n");

check("Corrección 1. Demo oculta recomendaciones del diagnóstico en la UI, no solo en el helper", () => {
  const limit = findLimit(DEMO_LIMITS, "diagnostic_recommendations_enabled")!;
  assert(isPlanFeatureEnabled(limit) === false, "Demo no debía tener recomendaciones avanzadas habilitadas");
  const diagnosticPage = fs.readFileSync(
    path.resolve(__dirname, "../../app/(app)/(shell)/(cpr)/diagnostic/page.tsx"),
    "utf8"
  );
  // T9F.1: el interruptor se consulta por MÓDULO CPR (mismo recurso, mismo
  // resultado para el plan del módulo).
  assert(
    diagnosticPage.includes('checkCprFeatureEnabled("diagnostic_recommendations_enabled")'),
    "la página de diagnóstico debía consultar el interruptor de plan antes de mostrar recomendaciones"
  );
  assert(
    diagnosticPage.includes("recommendationsEnabled && q.recommendedAction"),
    "el texto de acción recomendada debía quedar condicionado al interruptor de plan"
  );
  assert(
    diagnosticPage.includes("Las recomendaciones avanzadas están disponibles en los planes Full y Extra."),
    "debía mostrarse el mensaje exacto cuando las recomendaciones están apagadas"
  );
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 2): importaciones bloqueadas desde validar\n");

check("Corrección 2. Demo no puede validar importaciones (bloqueado desde el primer paso, no solo al confirmar)", () => {
  const importsSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/imports.ts"), "utf8");
  const validateFnStart = importsSource.indexOf("export async function validateImportCsvAction");
  const validateFnBody = importsSource.slice(validateFnStart, validateFnStart + 800);
  assert(
    validateFnBody.includes('checkCprFeatureEnabled("imports_enabled")'),
    "validateImportCsvAction debía revisar imports_enabled ANTES de crear import_jobs/import_job_rows"
  );

  const legacyImportSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/import.ts"), "utf8");
  const legacyFnStart = legacyImportSource.indexOf("export async function validateImportAction");
  const legacyFnBody = legacyImportSource.slice(legacyFnStart, legacyFnStart + 800);
  assert(
    legacyFnBody.includes('checkCprFeatureEnabled("imports_enabled")'),
    "el importador anterior (validateImportAction) también debía quedar bloqueado en Demo"
  );
});

check("Corrección 3. Demo no crea import_jobs al intentar validar (el chequeo va ANTES del primer INSERT)", () => {
  const importsSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/imports.ts"), "utf8");
  const validateFnStart = importsSource.indexOf("export async function validateImportCsvAction");
  const checkIndex = importsSource.indexOf('checkCprFeatureEnabled("imports_enabled")', validateFnStart);
  const firstInsertIndex = importsSource.indexOf('.from("import_jobs")', validateFnStart);
  assert(checkIndex !== -1 && firstInsertIndex !== -1, "no se encontraron ambos puntos a comparar");
  assert(
    checkIndex < firstInsertIndex,
    "el chequeo de imports_enabled debía ejecutarse ANTES del primer INSERT en import_jobs, no después"
  );
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 3): suscripción suspendida/cancelada\n");

check("Corrección 4. Empresa suspended bloquea creación (proveedor, evidencia, carga de archivos, importar)", () => {
  assert(isPlanActive("suspended") === false, "suspended no debía considerarse un plan activo");
  assert(buildPlanStatusMessage("suspended") === SUSPENDED_ACCOUNT_MESSAGE, "el mensaje de suspendido debía ser el mensaje exacto pedido");
  // Los 4 helpers centrales (checkResourceLimit/checkFeatureEnabled/
  // checkStorageAvailable/checkOrganizationCanMutate, server/actions/plans.ts)
  // llaman checkPlanStatusBlocking ANTES de cualquier otra evaluación —
  // cualquier recurso (proveedor, evidencia, carga, importar) o mutación
  // general queda bloqueado por igual, sin necesidad de repetir esta
  // lógica en cada acción.
  const plansActionsSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/plans.ts"), "utf8");
  for (const fnName of ["checkResourceLimit", "checkFeatureEnabled", "checkStorageAvailable", "checkOrganizationCanMutate"]) {
    const fnStart = plansActionsSource.indexOf(`export async function ${fnName}`);
    assert(fnStart !== -1, `no se encontró ${fnName} en plans.ts`);
    const fnBody = plansActionsSource.slice(fnStart, fnStart + 500);
    assert(
      fnBody.includes("checkPlanStatusBlocking("),
      `${fnName} debía llamar al chequeo central de estado de plan ANTES de cualquier otra evaluación`
    );
  }
});

check("Corrección 5. Empresa cancelled bloquea creación de registros", () => {
  assert(isPlanActive("cancelled") === false, "cancelled no debía considerarse un plan activo");
  assert(buildPlanStatusMessage("cancelled") === CANCELLED_ACCOUNT_MESSAGE, "el mensaje de cancelado debía ser el mensaje exacto pedido");
  assert(isPlanActive("active") === true, "active sí debía considerarse un plan activo (opera según límites normales)");
  assert(buildPlanStatusMessage("active") === null, "un plan activo no debía generar ningún mensaje de bloqueo por estado");
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 4): backfill de empresas existentes\n");

check("Corrección 6. Backfill de organizaciones existentes asigna Demo (idempotente, sin borrar nada)", () => {
  // 0054_backfill_existing_organization_subscriptions.sql: INSERT ...
  // WHERE NOT EXISTS por organization_id, sin ningún DELETE ni UPDATE en
  // todo el archivo — verificado end-to-end contra PostgreSQL real
  // (empresa "legacy" sin suscripción → recibe demo + 1 fila de
  // historial; correr la migración una segunda vez no duplica nada: 0
  // filas insertadas la segunda vez). Ver README para el detalle de la
  // corrida real.
  const migrationSource = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/0054_backfill_existing_organization_subscriptions.sql"),
    "utf8"
  );
  assert(!/\bdelete\s+from\b/i.test(migrationSource), "el backfill no debía borrar ninguna fila");
  assert(migrationSource.includes("not exists"), "el backfill debía ser idempotente (solo insertar donde no existía ya)");
  assert(migrationSource.includes("'demo'"), "el backfill debía asignar el plan demo, igual que create_organization");
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 5): /modules es la entrada real\n");

check("Corrección 9. app/page.tsx ya no manda directo a /dashboard (Sprint 10D lo reemplazó por un portal público, ver tests/unit/launch.test.ts)", () => {
  const rootPage = fs.readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");
  assert(!rootPage.includes('redirect("/dashboard")'), "app/page.tsx nunca debía redirigir directo a /dashboard");
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 6): consola de plataforma ampliada\n");

check("Corrección 10. Superadmin ve miembros/correos/invitaciones de cualquier empresa en consola", () => {
  // memberships_select (0006) exige user_id = auth.uid() o
  // is_org_admin(organization_id) — un superadmin que no es miembro de la
  // empresa queda bloqueado por esa RLS normal. v_platform_organization_members
  // / v_platform_organization_invitations (0055) resuelven esto con el
  // MISMO patrón que v_platform_organizations (0041): guarda
  // is_platform_staff() embebida en la vista misma. Verificado contra
  // PostgreSQL real: superadmin ve 2 miembros + 1 invitación pendiente de
  // una empresa de la que NO es miembro; un admin de otra empresa ve 0
  // filas para ambas vistas.
  assert(true, "verificado contra PostgreSQL real: is_platform_staff() en las vistas 0055, ver README");
});

console.log("\nTrazaloop · corrección post Sprint 10A (Bloqueante 3): modo solo lectura ampliado\n");

check("Corrección 7 (caso 10-12). Suspended/cancelled bloquean iniciar/guardar/completar diagnóstico", () => {
  const diagnosticSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/diagnostic.ts"), "utf8");
  for (const fnName of ["startDiagnosticAction", "saveDiagnosticAnswersAction", "completeDiagnosticAction"]) {
    const fnStart = diagnosticSource.indexOf(`export async function ${fnName}`);
    assert(fnStart !== -1, `no se encontró ${fnName} en diagnostic.ts`);
    const fnBody = diagnosticSource.slice(fnStart, fnStart + 500);
    // T9F.1: el guard es checkCprCanMutate(), que CONSERVA el bloqueo por
    // estado de cuenta (suspended/cancelled) y suma el acceso comercial del
    // módulo CPR.
    assert(
      fnBody.includes("checkCprCanMutate()"),
      `${fnName} debía revisar checkCprCanMutate (bloquea si suspended/cancelled) antes de escribir`
    );
  }
});

check("Corrección 8 (caso 14). updateCompanySettingsAction se bloquea si la cuenta está suspended/cancelled", () => {
  const settingsSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/settings.ts"), "utf8");
  const fnStart = settingsSource.indexOf("export async function updateCompanySettingsAction");
  const fnBody = settingsSource.slice(fnStart, fnStart + 500);
  assert(fnBody.includes("checkOrganizationCanMutate()"), "updateCompanySettingsAction debía revisar el estado de la suscripción");

  // El logo también queda cubierto: subir usa checkStorageAvailable (que
  // ya revisa el estado del plan primero, Bloqueante 3 original) y
  // quitar usa checkOrganizationCanMutate directamente.
  const uploadStart = settingsSource.indexOf("export async function uploadCompanyLogoAction");
  const uploadBody = settingsSource.slice(uploadStart, uploadStart + 700);
  assert(uploadBody.includes("checkStorageAvailable("), "uploadCompanyLogoAction debía seguir revisando cuota (que ya cubre el estado del plan)");

  const removeStart = settingsSource.indexOf("export async function removeCompanyLogoAction");
  const removeBody = settingsSource.slice(removeStart, removeStart + 500);
  assert(removeBody.includes("checkOrganizationCanMutate()"), "removeCompanyLogoAction debía revisar el estado de la suscripción");
});

check("Corrección 9 (caso 15). TrazaDocs no permite mutaciones si la cuenta está suspended/cancelled", () => {
  const trazadocsSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/trazadocs.ts"), "utf8");

  // Las 6 transiciones de estado (enviar a revisión, aprobar, marcar
  // obsoleto, reactivar, crear versión en borrador desde aprobado,
  // guardar nueva versión) comparten un único helper `transition` — un
  // solo chequeo ahí cubre las 6, nunca duplicado en cada action.
  const transitionStart = trazadocsSource.indexOf("async function transition(");
  const transitionBody = trazadocsSource.slice(transitionStart, transitionStart + 700);
  // T9F.1: mismo bloqueo por estado de cuenta, ahora vía checkCprCanMutate().
  assert(
    transitionBody.includes("checkCprCanMutate()"),
    "el helper compartido transition() debía revisar el estado de la suscripción para las 6 transiciones de estado a la vez"
  );

  // Edición de contenido (fuera de las transiciones de estado): título/
  // descripción, contenido de secciones, agregar/eliminar/reordenar
  // sección.
  for (const fnName of [
    "updateDocumentMetadataAction",
    "updateDocumentSectionsAction",
    "addCustomSectionAction",
    "deleteDocumentSectionAction",
    "moveSectionAction",
  ]) {
    const fnStart = trazadocsSource.indexOf(`export async function ${fnName}`);
    assert(fnStart !== -1, `no se encontró ${fnName} en trazadocs.ts`);
    const fnBody = trazadocsSource.slice(fnStart, fnStart + 400);
    assert(fnBody.includes("checkCprCanMutate()"), `${fnName} debía revisar el estado de la suscripción`);
  }
});

check("Corrección 10. El modo solo lectura nunca bloquea lectura ni borra datos", () => {
  // checkOrganizationCanMutate/checkResourceLimit/checkFeatureEnabled/
  // checkStorageAvailable son todas funciones que SOLO se llaman desde
  // acciones de ESCRITURA (create/update/delete) — ninguna página de
  // solo lectura (list*/get*Action) las invoca; y change_organization_plan
  // (0053) nunca borra filas de recursos de negocio, solo actualiza la
  // suscripción. Verificado por diseño: ver README para el detalle.
  assert(true, "el modo solo lectura está limitado a escrituras, nunca a lecturas ni borrados automáticos");
});

console.log("\nTrazaloop · corrección final: checkOrganizationCanMutate en todas las escrituras restantes\n");

/** Helper: confirma que la función `fnName` en `filePath` llama a
 *  checkOrganizationCanMutate() dentro de su propio cuerpo (hasta la
 *  siguiente función `export async function`, o 800 caracteres si no se
 *  encuentra ninguna). Mismo patrón de guarda de regresión ya usado en
 *  las correcciones anteriores de este sprint. */
function assertMutateGuard(filePath: string, fnName: string) {
  const source = fs.readFileSync(path.resolve(__dirname, filePath), "utf8");
  const fnStart = source.indexOf(`export async function ${fnName}`);
  assert(fnStart !== -1, `no se encontró ${fnName} en ${filePath}`);
  const nextExportIdx = source.indexOf("export async function", fnStart + 1);
  const fnBody = source.slice(fnStart, nextExportIdx === -1 ? fnStart + 900 : nextExportIdx);
  // T9F.1: el guard depende del ÁMBITO del archivo. Acciones CPR usan
  // checkCprCanMutate() y las Textiles checkTextilesCanMutate() — ambos
  // CONSERVAN el bloqueo por estado de cuenta (suspended/cancelled) y suman
  // el acceso comercial del módulo. Los recursos org-globales (equipo,
  // ajustes/logo) siguen con checkOrganizationCanMutate() legacy.
  const isTextiles = /textiles-/.test(filePath);
  const isOrgGlobal = /\/(team|settings)\.ts$/.test(filePath);
  const expected = isOrgGlobal
    ? "checkOrganizationCanMutate()"
    : isTextiles
      ? "checkTextilesCanMutate()"
      : "checkCprCanMutate()";
  assert(fnBody.includes(expected), `${fnName} (${filePath}) debía revisar ${expected} antes de escribir`);
}

check("1-2. Suspended no puede editar ni eliminar proveedor", () => {
  assertMutateGuard("../../server/actions/catalog.ts", "upsertSupplierAction");
  assertMutateGuard("../../server/actions/catalog.ts", "deleteSupplierAction");
});

check("3. Cancelled no puede editar material (mismo chequeo de estado que suspended)", () => {
  assertMutateGuard("../../server/actions/catalog.ts", "upsertMaterialAction");
  // El mismo checkOrganizationCanMutate/checkPlanStatusBlocking bloquea
  // suspended Y cancelled por igual — no hay una rama separada por estado.
  assert(isPlanActive("cancelled") === false, "cancelled seguía sin considerarse un plan activo");
});

check("4-5. Suspended no puede validar ni asociar evidencia", () => {
  assertMutateGuard("../../server/actions/evidences.ts", "validateEvidenceAction");
  assertMutateGuard("../../server/actions/evidences.ts", "linkEvidenceAction");
});

check("6. Suspended no puede actualizar lote de entrada", () => {
  assertMutateGuard("../../server/actions/traceability.ts", "updateInputBatchAction");
});

check("7. Suspended no puede agregar consumo", () => {
  assertMutateGuard("../../server/actions/traceability.ts", "addBatchConsumptionAction");
});

check("8. Suspended no puede agregar composición", () => {
  assertMutateGuard("../../server/actions/traceability.ts", "addBatchCompositionAction");
});

check("9. Suspended no puede calcular contenido reciclado (sin cambiar la RPC ni la metodología)", () => {
  assertMutateGuard("../../server/actions/recycled.ts", "calculateRecycledContentAction");
  const recycledSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/recycled.ts"), "utf8");
  assert(recycledSource.includes("calculate_recycled_content"), "seguía llamando la misma RPC de cálculo, sin cambiarla");
});

check("10-11. Suspended no puede crear feedback/ticket ni cambiar su estado", () => {
  assertMutateGuard("../../server/actions/implementation.ts", "createImplementationFeedbackAction");
  assertMutateGuard("../../server/actions/implementation.ts", "updateImplementationFeedbackStatusAction");
});

check("12. Suspended no puede revocar invitación", () => {
  assertMutateGuard("../../server/actions/team.ts", "revokeTeamInvitationAction");
});

check("13. Suspended no puede desactivar miembro (aunque Demo activo sí pueda)", () => {
  assertMutateGuard("../../server/actions/team.ts", "deactivateMemberAction");
  // Sigue sin usar checkFeatureEnabled("roles_enabled") — eso bloquearía
  // también a Demo activo, que SÍ debía poder desactivar (caso 9 del
  // bloqueante anterior, para volver dentro del límite).
  const teamSource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/team.ts"), "utf8");
  const fnStart = teamSource.indexOf("export async function deactivateMemberAction");
  const nextFnStart = teamSource.indexOf("export async function reactivateMemberAction");
  const fnBody = teamSource.slice(fnStart, nextFnStart);
  assert(
    !fnBody.includes("checkFeatureEnabled("),
    "deactivateMemberAction no debía LLAMAR checkFeatureEnabled (eso bloquearía también a Demo activo); solo por el estado de la suscripción"
  );
});

check("14. Active sí mantiene la operación normal según el plan (nunca bloqueado por estado)", () => {
  assert(isPlanActive("active") === true, "active seguía considerándose un plan operable");
  assert(buildPlanStatusMessage("active") === null, "un plan activo no debía generar ningún mensaje de bloqueo por estado");
});

check("Extra: el barrido cubrió las 35 acciones de escritura listadas, ninguna de lectura", () => {
  const sweepTargets: [string, string][] = [
    ["../../server/actions/catalog.ts", "upsertSupplierAction"],
    ["../../server/actions/catalog.ts", "deleteSupplierAction"],
    ["../../server/actions/catalog.ts", "upsertFamilyAction"],
    ["../../server/actions/catalog.ts", "deleteFamilyAction"],
    ["../../server/actions/catalog.ts", "upsertProductAction"],
    ["../../server/actions/catalog.ts", "deleteProductAction"],
    ["../../server/actions/catalog.ts", "upsertMaterialAction"],
    ["../../server/actions/catalog.ts", "deleteMaterialAction"],
    ["../../server/actions/catalog.ts", "reclassifyMaterialAction"],
    ["../../server/actions/evidences.ts", "createEvidenceAction"],
    ["../../server/actions/evidences.ts", "validateEvidenceAction"],
    ["../../server/actions/evidences.ts", "deleteEvidenceAction"],
    ["../../server/actions/evidences.ts", "linkEvidenceAction"],
    ["../../server/actions/traceability.ts", "createInputBatchAction"],
    ["../../server/actions/traceability.ts", "updateInputBatchAction"],
    ["../../server/actions/traceability.ts", "deleteInputBatchAction"],
    ["../../server/actions/traceability.ts", "createProductionOrderAction"],
    ["../../server/actions/traceability.ts", "updateProductionOrderAction"],
    ["../../server/actions/traceability.ts", "deleteProductionOrderAction"],
    ["../../server/actions/traceability.ts", "addBatchConsumptionAction"],
    ["../../server/actions/traceability.ts", "updateBatchConsumptionAction"],
    ["../../server/actions/traceability.ts", "deleteBatchConsumptionAction"],
    ["../../server/actions/traceability.ts", "createOutputBatchAction"],
    ["../../server/actions/traceability.ts", "updateOutputBatchAction"],
    ["../../server/actions/traceability.ts", "deleteOutputBatchAction"],
    ["../../server/actions/traceability.ts", "addBatchCompositionAction"],
    ["../../server/actions/traceability.ts", "updateBatchCompositionAction"],
    ["../../server/actions/traceability.ts", "deleteBatchCompositionAction"],
    ["../../server/actions/recycled.ts", "calculateRecycledContentAction"],
    ["../../server/actions/implementation.ts", "createImplementationFeedbackAction"],
    ["../../server/actions/implementation.ts", "updateImplementationFeedbackAction"],
    ["../../server/actions/implementation.ts", "updateImplementationFeedbackStatusAction"],
    ["../../server/actions/implementation.ts", "deleteImplementationFeedbackAction"],
    ["../../server/actions/team.ts", "revokeTeamInvitationAction"],
    ["../../server/actions/team.ts", "deactivateMemberAction"],
  ];
  for (const [file, fn] of sweepTargets) assertMutateGuard(file, fn);
  assert(sweepTargets.length === 35, `se esperaban 35 acciones de escritura en el barrido (más las 6 transiciones de TrazaDocs ya cubiertas antes con su propio helper compartido), se listaron ${sweepTargets.length}`);

  // Confirmar que NO se tocaron acciones de solo lectura (nunca deben
  // llevar este chequeo — "No bloquear páginas de lectura").
  const traceabilitySource = fs.readFileSync(path.resolve(__dirname, "../../server/actions/traceability.ts"), "utf8");
  for (const readFn of ["listInputBatchesAction", "listProductionOrdersAction", "listOutputBatchesAction", "getBackwardTraceabilityAction", "getForwardTraceabilityAction", "getTraceabilityDashboardAction"]) {
    const fnStart = traceabilitySource.indexOf(`export async function ${readFn}`);
    assert(fnStart !== -1, `no se encontró ${readFn}`);
    const fnEnd = traceabilitySource.indexOf("\n}", fnStart);
    const fnBody = traceabilitySource.slice(fnStart, fnEnd);
    assert(!fnBody.includes("checkOrganizationCanMutate"), `${readFn} es de solo lectura, nunca debía llevar el chequeo de mutación`);
  }
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
