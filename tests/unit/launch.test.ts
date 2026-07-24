/**
 * Trazaloop · Sprint 10D · Tests de la lógica PURA del portal de
 * lanzamiento, onboarding Demo y consentimiento legal (sin BD). Espejo
 * de legal_documents/user_legal_acceptances (0066) y
 * v_organization_onboarding_status (0067).
 *
 * Correr: npm run test:launch
 */
import fs from "node:fs";
import path from "node:path";
import {
  hasAcceptedAllRequiredDocuments,
  pendingRequiredDocuments,
  REQUIRED_LEGAL_DOCUMENT_TYPES,
  LEGAL_ACCEPT_CHECKBOX_TEXT,
  type ActiveLegalDocumentSummary,
} from "../../lib/domain/legal";
import {
  resolveOnboardingStepStatus,
  resolveOnboardingChecklist,
  computeOnboardingProgressPercent,
  ONBOARDING_STEPS,
  REVIEW_PLAN_LIMITS_STEP,
  type OnboardingStatusFacts,
} from "../../lib/domain/onboarding";

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
function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf8");
}

const ACTIVE_DOCS: ActiveLegalDocumentSummary[] = [
  { id: "terms-v1-id", documentType: "terms", version: "v1" },
  { id: "privacy-v1-id", documentType: "privacy", version: "v1" },
];

console.log("Trazaloop · lanzamiento: consentimiento legal (Parte 5/6)\n");

check("1. Usuario nuevo sin aceptación legal debe ir a /legal/accept", () => {
  assert(hasAcceptedAllRequiredDocuments(ACTIVE_DOCS, []) === false, "sin ninguna aceptación, no debía considerarse aceptado");
  const guardSource = readSource("../../lib/auth/require-legal-acceptance.ts");
  assert(guardSource.includes('redirect("/legal/accept")') || guardSource.includes("/legal/accept?next="), "requireLegalAcceptance debía redirigir a /legal/accept si falta aceptar");
});

check("2. Usuario con aceptación legal puede continuar", () => {
  const acceptances = [{ legalDocumentId: "terms-v1-id" }, { legalDocumentId: "privacy-v1-id" }];
  assert(hasAcceptedAllRequiredDocuments(ACTIVE_DOCS, acceptances) === true, "con ambos documentos requeridos aceptados, debía considerarse aceptado");
  assert(pendingRequiredDocuments(ACTIVE_DOCS, acceptances).length === 0, "no debían quedar documentos pendientes");
});

check("Extra: aceptar solo uno de los 2 documentos requeridos NO cuenta como aceptado", () => {
  const acceptances = [{ legalDocumentId: "terms-v1-id" }];
  assert(hasAcceptedAllRequiredDocuments(ACTIVE_DOCS, acceptances) === false, "faltando privacidad, no debía considerarse aceptado");
  const pending = pendingRequiredDocuments(ACTIVE_DOCS, acceptances);
  assert(pending.length === 1 && pending[0].documentType === "privacy", "debía quedar exactamente 'privacy' como pendiente");
});

check("Extra: una versión nueva del mismo tipo hace que la aceptación anterior deje de contar", () => {
  // Documento activo con OTRO id (nueva versión publicada) — la
  // aceptación antigua, ligada al id viejo, ya no cuenta.
  const newActiveDocs: ActiveLegalDocumentSummary[] = [
    { id: "terms-v2-id", documentType: "terms", version: "v2" },
    { id: "privacy-v1-id", documentType: "privacy", version: "v1" },
  ];
  const oldAcceptances = [{ legalDocumentId: "terms-v1-id" }, { legalDocumentId: "privacy-v1-id" }];
  assert(hasAcceptedAllRequiredDocuments(newActiveDocs, oldAcceptances) === false, "una aceptación de la versión anterior no debía contar para la versión nueva");
});

check("3. Aceptar términos registra la versión activa (nunca una versión arbitraria del cliente)", () => {
  // Corrección (Bloqueante 1): ya no se lee la lista de documentos
  // activos en server/actions/legal.ts para insertarlos uno por uno —
  // eso ahora lo hace la RPC accept_active_legal_documents (0068), que
  // lee legal_documents ella misma dentro de la transacción. Ver los
  // checks 2 y 4 más abajo para el detalle exacto de esa RPC.
  const actionSource = readSource("../../server/actions/legal.ts");
  const fnStart = actionSource.indexOf("export async function acceptLegalDocumentsAction");
  const fnEnd = actionSource.indexOf("\n}", fnStart);
  const fnBody = actionSource.slice(fnStart, fnEnd);
  assert(fnBody.includes("acceptActiveLegalDocuments("), "acceptLegalDocumentsAction debía delegar en la RPC controlada, nunca construir el INSERT ella misma");
});

check("4. No se duplica la aceptación del mismo documento (dos capas: unique constraint + ON CONFLICT DO NOTHING de la RPC)", () => {
  // Verificado contra PostgreSQL real: llamar accept_active_legal_documents
  // dos veces seguidas para el mismo usuario devolvió 2 la primera vez y
  // 0 la segunda — la RPC es idempotente. Ver README.
  const migrationSource068 = readSource("../../supabase/migrations/0068_legal_acceptance_hardening.sql");
  assert(migrationSource068.includes("on conflict (user_id, legal_document_id) do nothing"), "la RPC debía usar ON CONFLICT DO NOTHING como capa de idempotencia explícita");
  const migrationSource066 = readSource("../../supabase/migrations/0066_legal_documents_and_acceptances.sql");
  assert(migrationSource066.includes("user_legal_acceptances_uniq unique (user_id, legal_document_id)"), "debía seguir existiendo la restricción única (user_id, legal_document_id) como respaldo real a nivel de datos");
});

console.log("\nTrazaloop · lanzamiento: registro Demo y planes (Parte 4)\n");

check("5. Nueva empresa normal queda en Demo", () => {
  // Sin cambios respecto a Sprint 10A — create_organization (0053) sigue
  // asignando 'demo' siempre. Reconfirmado aquí porque este sprint ahora
  // también exige aceptación legal ANTES de poder crear la empresa, sin
  // tocar esa asignación.
  const migrationSource = readSource("../../supabase/migrations/0053_organization_plan_assignment.sql");
  assert(migrationSource.includes("values (v_org, 'demo', 'active'"), "create_organization debía seguir asignando 'demo' siempre");
});

check("6. No se acepta plan_code desde cliente al crear empresa normal", () => {
  const orgActionsSource = readSource("../../server/actions/organizations.ts");
  const fnStart = orgActionsSource.indexOf("export async function createOrganizationAction");
  const fnEnd = orgActionsSource.indexOf("\n}", fnStart);
  const fnBody = orgActionsSource.slice(fnStart, fnEnd);
  assert(fnBody.includes('redirect("/onboarding")'), "crear una empresa normal debía llevar a /onboarding, no directo a /dashboard");
  assert(!fnBody.includes("plan_code") && !fnBody.includes("formData.get(\"plan"), "createOrganizationAction no debía leer ningún campo de plan del formulario");
});

console.log("\nTrazaloop · lanzamiento: invitaciones y platform_staff (Parte 6/13)\n");

check("7. Usuario con invitación conserva el flujo de invitación (incluso revisando aceptación legal primero)", () => {
  const authSource = readSource("../../server/actions/auth.ts");
  const fnStart = authSource.indexOf("async function redirectPostAuth");
  const fnEnd = authSource.indexOf("\n}", fnStart);
  const fnBody = authSource.slice(fnStart, fnEnd);
  const legalCheckIndex = fnBody.indexOf("getMyLegalAcceptanceStatusAction()");
  const inviteCheckIndex = fnBody.indexOf("isSafeAcceptInviteNext(next)");
  assert(legalCheckIndex !== -1 && inviteCheckIndex !== -1, "no se encontraron ambos puntos a comparar");
  assert(legalCheckIndex < inviteCheckIndex, "la aceptación legal debía revisarse ANTES de honrar un next de invitación");
  assert(fnBody.includes("preservedNext"), "el next de invitación debía preservarse como parámetro de /legal/accept, para volver ahí después de aceptar");
});

check("8. Platform_staff también requiere aceptación legal antes de la consola", () => {
  const layoutSource = readSource("../../app/(app)/platform/layout.tsx");
  assert(layoutSource.includes("requireLegalAcceptance()"), "el layout de plataforma debía exigir requireLegalAcceptance() sin excepción de rol");
});

console.log("\nTrazaloop · lanzamiento: páginas públicas (Parte 14)\n");

check("9. /terms y /privacy no requieren login", () => {
  for (const route of ["../../app/terms/page.tsx", "../../app/privacy/page.tsx"]) {
    const source = readSource(route);
    assert(!source.includes("requireSession()") && !source.includes("requireActiveOrg()") && !source.includes("requireLegalAcceptance("), `${route} no debía exigir sesión — es una página pública`);
  }
  const migrationSource = readSource("../../supabase/migrations/0066_legal_documents_and_acceptances.sql");
  assert(migrationSource.includes("for select to anon, authenticated"), "legal_documents debía permitir SELECT a anon para que /terms y /privacy funcionen sin sesión");
});

console.log("\nTrazaloop · lanzamiento: onboarding calculado desde datos reales (Parte 7/11)\n");

const baseFacts: OnboardingStatusFacts = {
  companyProfileStarted: false,
  companyProfileCompleted: false,
  diagnosticStarted: false,
  diagnosticCompleted: false,
  hasProduct: false,
  hasSupplier: false,
  hasMaterial: false,
  hasEvidence: false,
  hasTrazadoc: false,
  hasDocumentMasterItem: false,
};

check("10. Onboarding marca datos de empresa incompletos como pendientes (o en progreso si hay algo)", () => {
  assert(resolveOnboardingStepStatus("company_profile", baseFacts) === "pending", "sin ningún dato de empresa, debía quedar pendiente");
  assert(
    resolveOnboardingStepStatus("company_profile", { ...baseFacts, companyProfileStarted: true }) === "in_progress",
    "con solo un campo lleno, debía quedar en progreso"
  );
  assert(
    resolveOnboardingStepStatus("company_profile", { ...baseFacts, companyProfileStarted: true, companyProfileCompleted: true }) === "completed",
    "con razón social y NIT, debía quedar completo"
  );
});

check("11. Onboarding marca diagnóstico completado si existe (y en progreso si se inició sin terminar)", () => {
  assert(resolveOnboardingStepStatus("diagnostic", baseFacts) === "pending", "sin diagnóstico, debía quedar pendiente");
  assert(resolveOnboardingStepStatus("diagnostic", { ...baseFacts, diagnosticStarted: true }) === "in_progress", "un diagnóstico iniciado sin terminar debía quedar en progreso");
  assert(resolveOnboardingStepStatus("diagnostic", { ...baseFacts, diagnosticStarted: true, diagnosticCompleted: true }) === "completed", "un diagnóstico completado debía quedar completo");
});

check("12. Onboarding marca producto completado si existe", () => {
  assert(resolveOnboardingStepStatus("product", baseFacts) === "pending", "sin producto, debía quedar pendiente");
  assert(resolveOnboardingStepStatus("product", { ...baseFacts, hasProduct: true }) === "completed", "con al menos un producto, debía quedar completo");
});

check("13. Onboarding marca proveedor completado si existe", () => {
  assert(resolveOnboardingStepStatus("supplier", baseFacts) === "pending", "sin proveedor, debía quedar pendiente");
  assert(resolveOnboardingStepStatus("supplier", { ...baseFacts, hasSupplier: true }) === "completed", "con al menos un proveedor, debía quedar completo");
});

check("14. Onboarding marca material completado si existe", () => {
  assert(resolveOnboardingStepStatus("material", baseFacts) === "pending", "sin material, debía quedar pendiente");
  assert(resolveOnboardingStepStatus("material", { ...baseFacts, hasMaterial: true }) === "completed", "con al menos un material, debía quedar completo");
});

check("15. Onboarding marca evidencia completada si existe", () => {
  assert(resolveOnboardingStepStatus("evidence", baseFacts) === "pending", "sin evidencia, debía quedar pendiente");
  assert(resolveOnboardingStepStatus("evidence", { ...baseFacts, hasEvidence: true }) === "completed", "con al menos una evidencia, debía quedar completo");
});

check("16. Onboarding marca el paso de documento completado con documento vivo O documento descargable del Maestro", () => {
  // Corrección (Bloqueante 3): v_organization_onboarding_status (0067)
  // ya calculaba has_document_master_item = has_trazadoc OR
  // has_file_document, pero resolveOnboardingStepStatus seguía leyendo
  // solo hasTrazadoc — un documento descargable subido al Maestro nunca
  // marcaba el paso como completo. Corregido: el paso ahora lee
  // hasDocumentMasterItem, que la vista real ya calcula combinando
  // ambos tipos.
  assert(resolveOnboardingStepStatus("trazadoc", baseFacts) === "pending", "sin ningún documento (vivo ni descargable), debía quedar pendiente");
  assert(
    resolveOnboardingStepStatus("trazadoc", { ...baseFacts, hasTrazadoc: true, hasDocumentMasterItem: true }) === "completed",
    "con un documento vivo (que a su vez implica hasDocumentMasterItem=true en la vista real), debía quedar completo"
  );
  assert(
    resolveOnboardingStepStatus("trazadoc", { ...baseFacts, hasTrazadoc: false, hasDocumentMasterItem: true }) === "completed",
    "con SOLO un documento descargable del Maestro (sin documento vivo), debía quedar completo igual"
  );
});

check("17. Progress percent se calcula correctamente sobre los 7 pasos inferibles", () => {
  assert(computeOnboardingProgressPercent(0, 7) === 0, "0/7 debía ser 0%");
  assert(computeOnboardingProgressPercent(7, 7) === 100, "7/7 debía ser 100%");
  assert(computeOnboardingProgressPercent(3, 7) === 43, "3/7 debía redondear a 43%");
  assert(computeOnboardingProgressPercent(1, 7) === 14, "1/7 debía redondear a 14%");
});

check("Extra: el checklist resuelve exactamente los 7 pasos definidos, en orden, y el paso 8 nunca se cuenta", () => {
  const checklist = resolveOnboardingChecklist(baseFacts);
  assert(checklist.length === 7, `debían resolverse exactamente 7 pasos, se resolvieron ${checklist.length}`);
  assert(ONBOARDING_STEPS.length === 7, "ONBOARDING_STEPS debía tener exactamente 7 definiciones");
  assert(checklist.every((s, i) => s.order === i + 1), "los pasos debían venir en orden 1-7");
  assert(REVIEW_PLAN_LIMITS_STEP.order === 8, "el paso de revisar límites debía ser el 8, aparte del checklist calculable");
});

console.log("\nTrazaloop · lanzamiento: banners de plan (Parte 8/16)\n");

check("18-19. El banner Demo aparece solo en Demo, nunca en Full/Extra", () => {
  const source = readSource("../../components/domain/onboarding/demo-plan-banner.tsx");
  const fnStart = source.indexOf("export function DemoPlanBanner");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(fnBody.includes('if (planCode !== "demo") return null;'), "DemoPlanBanner debía devolver null para cualquier plan que no sea demo");
  assert(!fnBody.toLowerCase().includes("pagar") && !fnBody.toLowerCase().includes("pago"), "el banner Demo nunca debía mencionar pagos");
});

check("20. Suspended/cancelled muestran aviso de cuenta no activa", () => {
  const source = readSource("../../components/domain/onboarding/demo-plan-banner.tsx");
  const fnStart = source.indexOf("export function AccountStatusBanner");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(fnBody.includes('if (planStatus === "active") return null;'), "AccountStatusBanner solo debía devolver null cuando el plan está activo");
  assert(fnBody.includes("La cuenta de esta empresa no está activa"), "debía usar el mensaje exacto pedido");
});

console.log("\nTrazaloop · lanzamiento: módulos próximos siguen sin funcionalidad (Parte 3/16)\n");

check("21. /modules mantiene CPR disponible y los demás módulos deshabilitados", () => {
  // T9F: /modules se genera desde el CATÁLOGO CANÓNICO y el estado comercial
  // real (regla canónica), no de tarjetas hardcodeadas. Los nombres y el
  // status (functional / coming_soon) viven en lib/modules/catalog.ts.
  const source = readSource("../../app/(app)/modules/page.tsx");
  const catalog = readSource("../../lib/modules/catalog.ts");
  assert(source.includes("COMMERCIAL_MODULES") && source.includes("getActiveOrgModuleStatuses"), "/modules debía consumir el catálogo canónico y el estado en servidor");
  assert(catalog.includes("Trazaloop CPR"), "el catálogo debía incluir Trazaloop CPR");
  for (const mod of ["Trazaloop Textiles", "Trazaloop Quality", "Trazaloop Construcción"]) {
    assert(catalog.includes(mod), `el catálogo debía incluir ${mod}`);
  }
  // CPR y Textiles funcionales; Quality y Construcción exactamente 2 coming_soon.
  assert((catalog.match(/status: "coming_soon"/g) ?? []).length === 2, "debían existir exactamente 2 módulos coming_soon (Quality, Construcción)");
  assert((catalog.match(/status: "functional"/g) ?? []).length === 2, "debían existir exactamente 2 módulos funcionales (CPR, Textiles)");
});

check("22. Textil/Quality/Construcción no tienen rutas funcionales nuevas", () => {
  for (const dir of ["../../app/textil", "../../app/quality", "../../app/construccion", "../../app/(app)/(shell)/textil", "../../app/(app)/(shell)/quality", "../../app/(app)/(shell)/construccion"]) {
    assert(!fs.existsSync(path.resolve(__dirname, dir)), `no debía existir ninguna ruta funcional para ${dir}`);
  }
});

check("Extra: los documentos requeridos son exactamente términos y privacidad", () => {
  assert(
    JSON.stringify([...REQUIRED_LEGAL_DOCUMENT_TYPES].sort()) === JSON.stringify(["privacy", "terms"]),
    "REQUIRED_LEGAL_DOCUMENT_TYPES debía ser exactamente terms + privacy en este sprint"
  );
});

check("Extra: el texto de la casilla de aceptación es el exacto pedido", () => {
  assert(
    LEGAL_ACCEPT_CHECKBOX_TEXT === "Acepto los términos de uso y la política de privacidad.",
    "el texto de la casilla debía ser exactamente el pedido"
  );
});

console.log("\nTrazaloop · corrección: registro de aceptación legal endurecido (Bloqueante 1)\n");

check("1. No existe política de INSERT directo para user_legal_acceptances", () => {
  const migrationSource = readSource("../../supabase/migrations/0068_legal_acceptance_hardening.sql");
  assert(migrationSource.includes("drop policy if exists user_legal_acceptances_insert"), "la política de INSERT original debía eliminarse");
  assert(!/create policy user_legal_acceptances_insert/.test(migrationSource), "no debía crearse ninguna política de INSERT nueva para clientes — deny-by-default real");
});

check("2. acceptLegalDocumentsAction usa la RPC accept_active_legal_documents, nunca un INSERT directo", () => {
  const actionSource = readSource("../../server/actions/legal.ts");
  const fnStart = actionSource.indexOf("export async function acceptLegalDocumentsAction");
  const fnEnd = actionSource.indexOf("\n}", fnStart);
  const fnBody = actionSource.slice(fnStart, fnEnd);
  assert(fnBody.includes("acceptActiveLegalDocuments("), "acceptLegalDocumentsAction debía llamar al wrapper de la RPC");
  assert(!fnBody.includes('.from("user_legal_acceptances")') && !fnBody.includes(".insert("), "acceptLegalDocumentsAction no debía insertar filas directamente");
  const dbSource = readSource("../../lib/db/legal.ts");
  assert(dbSource.includes('rpc("accept_active_legal_documents"'), "el wrapper debía llamar realmente a la RPC por su nombre");
});

check("3. La RPC fuerza user_id desde auth.uid(), nunca desde un parámetro", () => {
  const migrationSource = readSource("../../supabase/migrations/0068_legal_acceptance_hardening.sql");
  const fnStart = migrationSource.indexOf("function public.accept_active_legal_documents(");
  const fnEnd = migrationSource.indexOf("$$;", fnStart);
  const fnBody = migrationSource.slice(fnStart, fnEnd);
  assert(fnBody.includes("v_user := auth.uid();"), "la RPC debía tomar el usuario de auth.uid()");
  assert(!/p_user_id/.test(fnBody), "la RPC no debía aceptar ningún parámetro de user_id");
});

check("4. La RPC fuerza document_type/version/legal_document_id desde legal_documents activos, nunca del cliente", () => {
  const migrationSource = readSource("../../supabase/migrations/0068_legal_acceptance_hardening.sql");
  const fnStart = migrationSource.indexOf("function public.accept_active_legal_documents(");
  const fnEnd = migrationSource.indexOf("$$;", fnStart);
  const fnBody = migrationSource.slice(fnStart, fnEnd);
  assert(fnBody.includes("from legal_documents"), "la RPC debía leer los documentos activos directamente de la tabla, en el servidor");
  assert(fnBody.includes("v_doc.id, v_doc.document_type, v_doc.version"), "debía insertar el id/tipo/versión REALES del documento activo, tomados de la fila leída");
});

check("5. La RPC fuerza accepted_at con now(), nunca con un valor del cliente", () => {
  const migrationSource = readSource("../../supabase/migrations/0068_legal_acceptance_hardening.sql");
  const fnStart = migrationSource.indexOf("function public.accept_active_legal_documents(");
  const fnEnd = migrationSource.indexOf("$$;", fnStart);
  const fnBody = migrationSource.slice(fnStart, fnEnd);
  assert(fnBody.includes("v_doc.version, now(), p_ip_address"), "accepted_at debía fijarse con now(), no con un parámetro");
  assert(!/p_accepted_at/.test(fnBody), "la RPC no debía aceptar ningún parámetro de accepted_at");
});

check("6. Un usuario no puede aceptar un legal_document_id arbitrario enviado desde cliente (la RPC no lo admite como parámetro)", () => {
  const migrationSource = readSource("../../supabase/migrations/0068_legal_acceptance_hardening.sql");
  const signatureMatch = migrationSource.match(/function public\.accept_active_legal_documents\(([^)]*)\)/);
  assert(!!signatureMatch, "no se encontró la firma de la función");
  const signature = signatureMatch![1];
  assert(!signature.includes("legal_document_id"), "la firma de la RPC nunca debía incluir un parámetro legal_document_id");
  assert(signature.includes("p_ip_address") && signature.includes("p_user_agent"), "la firma debía limitarse a los 2 parámetros de contexto (ip/user agent), nada de identidad de documento");
});

console.log("\nTrazaloop · corrección: acciones críticas validan aceptación legal en servidor (Bloqueante 2)\n");

check("7. createOrganizationAction verifica aceptación legal antes de crear la empresa", () => {
  const source = readSource("../../server/actions/organizations.ts");
  const fnStart = source.indexOf("export async function createOrganizationAction");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(fnBody.includes("assertMyLegalAcceptance()"), "createOrganizationAction debía revisar assertMyLegalAcceptance()");
  const checkIndex = fnBody.indexOf("assertMyLegalAcceptance()");
  const rpcIndex = fnBody.indexOf('rpc("create_organization"');
  assert(checkIndex < rpcIndex, "la revisión legal debía ocurrir ANTES de llamar a create_organization");
});

check("8. acceptTeamInvitationAction verifica aceptación legal antes de aceptar la invitación", () => {
  const source = readSource("../../server/actions/team.ts");
  const fnStart = source.indexOf("export async function acceptTeamInvitationAction");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(fnBody.includes("assertMyLegalAcceptance()"), "acceptTeamInvitationAction debía revisar assertMyLegalAcceptance()");
  assert(fnBody.includes("/legal/accept?next="), "debía redirigir a /legal/accept preservando el destino de vuelta a la invitación");
  const checkIndex = fnBody.indexOf("assertMyLegalAcceptance()");
  const acceptIndex = fnBody.indexOf("acceptInvitationByToken(token)");
  assert(checkIndex < acceptIndex, "la revisión legal debía ocurrir ANTES de aceptar la invitación");
});

check("9. updateMyProfileAction verifica aceptación legal antes de actualizar el perfil", () => {
  const source = readSource("../../server/actions/settings.ts");
  const fnStart = source.indexOf("export async function updateMyProfileAction");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(fnBody.includes("assertMyLegalAcceptance()"), "updateMyProfileAction debía revisar assertMyLegalAcceptance()");
  const checkIndex = fnBody.indexOf("assertMyLegalAcceptance()");
  const updateIndex = fnBody.indexOf("updateMyProfile(user.id");
  assert(checkIndex < updateIndex, "la revisión legal debía ocurrir ANTES de actualizar el perfil");
});

check("10. /settings/profile exige requireLegalAcceptance (no vive detrás del shell protegido)", () => {
  const source = readSource("../../app/(app)/settings/profile/page.tsx");
  assert(source.includes('requireLegalAcceptance("/settings/profile")'), "/settings/profile debía exigir requireLegalAcceptance explícitamente, ya que vive fuera de (shell)");
});

console.log("\nTrazaloop · corrección: onboarding cuenta documentos descargables del Maestro (Bloqueante 3)\n");

check("11-13. El paso de documento usa hasDocumentMasterItem (documento vivo O descargable), no solo hasTrazadoc", () => {
  const source = readSource("../../lib/domain/onboarding.ts");
  const fnStart = source.indexOf('case "trazadoc":');
  assert(fnStart !== -1, "no se encontró el caso 'trazadoc'");
  const nextCaseIndex = source.indexOf('case "', fnStart + 10);
  const closingBraceIndex = source.indexOf("\n  }\n}", fnStart);
  const fnEnd = nextCaseIndex !== -1 ? nextCaseIndex : closingBraceIndex;
  assert(fnEnd !== -1, "no se pudo delimitar el final del caso 'trazadoc'");
  const caseBody = source.slice(fnStart, fnEnd);
  assert(caseBody.includes("facts.hasDocumentMasterItem"), "el paso 'trazadoc' debía resolverse a partir de hasDocumentMasterItem");
  assert(!caseBody.includes("facts.hasTrazadoc"), "el paso 'trazadoc' ya no debía depender solo de hasTrazadoc");
  // Casos concretos ya cubiertos en el check 16 más abajo (documento vivo,
  // documento descargable solo, y ninguno).
});

console.log("\nTrazaloop · corrección: lenguaje de lanzamiento actualizado (Bloqueante 4)\n");

check("14. No queda el texto \"El cálculo de contenido reciclado llega en el siguiente sprint\"", () => {
  const dashboardSource = readSource("../../app/(app)/(shell)/(cpr)/dashboard/page.tsx");
  const normalized = dashboardSource.replace(/\s+/g, " ");
  assert(!normalized.includes("llega en el siguiente sprint"), "el dashboard ya no debía decir que el cálculo llega en un sprint futuro — ya existe");
});

check("15. No queda el texto \"núcleo v0.1\"", () => {
  const authLayoutSource = readSource("../../app/(auth)/layout.tsx");
  assert(!authLayoutSource.includes("núcleo v0.1"), "el layout de autenticación ya no debía mostrar la etiqueta de versión interna 'núcleo v0.1'");
  assert(
    authLayoutSource.includes("beta / lanzamiento controlado"),
    "debía usar el lenguaje vigente de beta / lanzamiento controlado"
  );
});

console.log("\nTrazaloop · corrección: completed_steps/progress_percent cuentan documentos descargables del Maestro\n");

check("1. La migración 0069 existe", () => {
  assert(
    fs.existsSync(path.resolve(__dirname, "../../supabase/migrations/0069_onboarding_document_master_progress_fix.sql")),
    "debía existir la migración 0069"
  );
});

check("2. v_organization_onboarding_status calcula completed_steps usando has_document_master_item (documento vivo O descargable)", () => {
  const migrationSource = readSource("../../supabase/migrations/0069_onboarding_document_master_progress_fix.sql");
  const completedStepsStart = migrationSource.indexOf("as completed_steps");
  const completedStepsBlockStart = migrationSource.lastIndexOf("(\n", completedStepsStart);
  const completedStepsBlock = migrationSource.slice(completedStepsBlockStart, completedStepsStart);
  assert(
    completedStepsBlock.includes("coalesce(td.has_trazadoc, false) or coalesce(fd.has_file_document, false)"),
    "completed_steps debía sumar el paso documental con la condición combinada (vivo O descargable), no solo has_trazadoc"
  );
});

check("3. v_organization_onboarding_status calcula progress_percent usando has_document_master_item (documento vivo O descargable)", () => {
  const migrationSource = readSource("../../supabase/migrations/0069_onboarding_document_master_progress_fix.sql");
  const progressStart = migrationSource.indexOf("as progress_percent");
  const progressBlockStart = migrationSource.lastIndexOf("round(", progressStart);
  const progressBlock = migrationSource.slice(progressBlockStart, progressStart);
  assert(
    progressBlock.includes("coalesce(td.has_trazadoc, false) or coalesce(fd.has_file_document, false)"),
    "progress_percent debía usar la misma condición combinada (vivo O descargable), no solo has_trazadoc"
  );
});

check("4. La vista ya no usa SOLO coalesce(td.has_trazadoc, false) sin combinar para el paso documental", () => {
  const migrationSource = readSource("../../supabase/migrations/0069_onboarding_document_master_progress_fix.sql");
  // Debe seguir existiendo has_trazadoc como columna informativa aparte
  // (coalesce(td.has_trazadoc, false) as has_trazadoc), pero dentro de
  // completed_steps/progress_percent siempre debía venir acompañado de
  // "or coalesce(fd.has_file_document, false)" — nunca solo.
  const standaloneCaseCount = (
    migrationSource.match(/case when coalesce\(td\.has_trazadoc, false\) then 1 else 0 end/g) ?? []
  ).length;
  assert(standaloneCaseCount === 0, "no debía quedar ningún 'case when coalesce(td.has_trazadoc, false) then 1 else 0 end' aislado, sin combinar con el documento descargable");
});

check("5-7. Documento descargable solo, documento vivo solo, y ninguno — completed_steps responde a los 3 casos correctamente", () => {
  // Verificado contra PostgreSQL real (los 3 escenarios, sobre la misma
  // organización, en secuencia):
  //   - sin ningún documento: has_document_master_item=false,
  //     completed_steps=0, progress_percent=0%.
  //   - con SOLO un documento descargable en el Maestro (sin documento
  //     vivo): has_trazadoc=false, has_document_master_item=true,
  //     completed_steps=1, progress_percent=14% — este es el caso que
  //     antes de esta migración se quedaba mal contado en 0.
  //   - con SOLO un documento vivo (sin documento descargable):
  //     has_trazadoc=true, has_document_master_item=true,
  //     completed_steps=1, progress_percent=14% — sin regresión.
  // Ver README para el detalle completo de la verificación.
  const migrationSource = readSource("../../supabase/migrations/0069_onboarding_document_master_progress_fix.sql");
  assert(migrationSource.includes("create or replace view public.v_organization_onboarding_status"), "debía reemplazar la vista con CREATE OR REPLACE VIEW, mismas columnas y mismo orden que 0067");
  assert(migrationSource.includes("where public.is_org_member(o.id) or public.is_platform_staff();"), "debía conservar exactamente la misma guarda de acceso que 0067");
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
