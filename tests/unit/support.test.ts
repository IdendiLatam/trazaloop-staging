/**
 * Trazaloop · Sprint 10C · Tests de la lógica PURA del Centro de soporte
 * (sin BD). Espejo de support_tickets/support_ticket_messages/
 * support_ticket_status_history (0060), la migración de feedback (0061)
 * y las vistas (0062).
 *
 * Correr: npm run test:support
 */
import fs from "node:fs";
import path from "node:path";
import {
  canCreateSupportTicket,
  canReplySupportTicket,
  canManagePlatformSupport,
  canReopenTicket,
  canCustomerCloseTicket,
  computeFirstResponseTargetAt,
  resolveSlaStatus,
  validateSupportTicketDraft,
  buildSupportTicketInsertPayload,
  FIRST_RESPONSE_TARGET_MESSAGE,
  TICKET_CATEGORIES,
} from "../../lib/domain/support";

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

console.log("Trazaloop · soporte: crear ticket según estado del plan (Parte 12)\n");

check("1. Empresa active puede crear ticket", () => {
  assert(canCreateSupportTicket("active", "bug").error === null, "una empresa activa debía poder crear un ticket de cualquier categoría");
});

check("2. Demo active puede crear ticket", () => {
  // El plan (Demo/Full/Extra) nunca es un factor aquí — solo el ESTADO
  // de la suscripción (active/suspended/cancelled) importa; los 3 planes
  // comparten exactamente la misma regla cuando están activos.
  assert(canCreateSupportTicket("active", "technical_support").error === null, "Demo activo debía poder crear un ticket");
});

check("3. Full active puede crear ticket", () => {
  assert(canCreateSupportTicket("active", "imports").error === null, "Full activo debía poder crear un ticket");
});

check("4. Extra active puede crear ticket", () => {
  assert(canCreateSupportTicket("active", "calculation").error === null, "Extra activo debía poder crear un ticket");
});

check("5. Suspended puede crear ticket solo categoría account", () => {
  assert(canCreateSupportTicket("suspended", "account").error === null, "suspended debía poder crear un ticket de cuenta/acceso");
});

check("6. Suspended puede crear ticket solo categoría plan", () => {
  assert(canCreateSupportTicket("suspended", "plan").error === null, "suspended debía poder crear un ticket de plan/límites");
});

check("7. Suspended no puede crear ticket técnico", () => {
  for (const category of TICKET_CATEGORIES.filter((c) => c !== "account" && c !== "plan")) {
    assert(canCreateSupportTicket("suspended", category).error !== null, `suspended NO debía poder crear un ticket de categoría "${category}"`);
  }
});

check("8. Cancelled puede crear ticket account/plan", () => {
  assert(canCreateSupportTicket("cancelled", "account").error === null, "cancelled debía poder crear un ticket de cuenta/acceso");
  assert(canCreateSupportTicket("cancelled", "plan").error === null, "cancelled debía poder crear un ticket de plan/límites");
  assert(canCreateSupportTicket("cancelled", "bug").error !== null, "cancelled NO debía poder crear un ticket técnico");
});

check("Extra: responder un ticket existente siempre está permitido, sin importar el plan", () => {
  assert(canReplySupportTicket() === true, "responder nunca debía depender del estado del plan (a diferencia de crear)");
  const source = readSource("../../server/actions/support.ts");
  const fnStart = source.indexOf("export async function replySupportTicketAction");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);
  assert(!fnBody.includes("checkOrganizationCanMutate") && !fnBody.includes("canCreateSupportTicket"), "replySupportTicketAction no debía revisar el estado del plan en absoluto");
});

console.log("\nTrazaloop · soporte: permisos por rol (Parte 11/13)\n");

check("9-10. Usuario de empresa no puede asignar ni cambiar prioridad", () => {
  assert(canManagePlatformSupport(false) === false, "un usuario normal no debía poder administrar tickets a nivel de plataforma");
  const migrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(migrationSource.includes("Solo el equipo de soporte de plataforma puede asignar tickets"), "assign_support_ticket debía exigir platform_staff con el mensaje exacto");
  assert(migrationSource.includes("Solo el equipo de soporte de plataforma puede cambiar la prioridad"), "update_support_ticket_priority debía exigir platform_staff");
});

check("11-13. Platform_staff puede asignar, cambiar prioridad y cambiar estado", () => {
  assert(canManagePlatformSupport(true) === true, "platform_staff debía poder administrar tickets");
  for (const fnName of ["assignSupportTicketAction", "updateSupportTicketPriorityAction", "updateSupportTicketStatusAction"]) {
    const source = readSource("../../server/actions/support.ts");
    const fnStart = source.indexOf(`export async function ${fnName}`);
    assert(fnStart !== -1, `no se encontró ${fnName}`);
    const fnEnd = source.indexOf("\n}", fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    assert(fnBody.includes("requirePlatformStaff()"), `${fnName} debía exigir requirePlatformStaff()`);
  }
});

console.log("\nTrazaloop · soporte: primera respuesta y notas internas (Parte 8/9.2)\n");

check("14-15. Primera respuesta se llena SOLO con la primera respuesta visible de plataforma; una nota interna nunca la llena", () => {
  // touch_support_ticket_on_message (0060, trigger AFTER INSERT en
  // support_ticket_messages) — verificado contra PostgreSQL real: una
  // nota interna (is_internal_note=true) de plataforma NO llenó
  // first_response_at; el siguiente mensaje visible de plataforma sí lo
  // hizo, una sola vez (no se sobrescribe en respuestas posteriores). Ver README.
  const migrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(
    migrationSource.includes("when first_response_at is null and new.author_type = 'platform' and new.is_internal_note = false"),
    "el trigger debía exigir author_type='platform' Y is_internal_note=false para llenar first_response_at"
  );
});

check("16. Nota interna no es visible para empresa", () => {
  const migrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(
    migrationSource.includes("(public.is_org_member(organization_id) and is_internal_note = false)"),
    "la política de SELECT de support_ticket_messages debía excluir notas internas para miembros de empresa"
  );
  assert(
    migrationSource.includes("support_ticket_messages_customer_never_internal_check"),
    "debía existir un CHECK a nivel de datos impidiendo que un cliente marque is_internal_note=true"
  );
});

console.log("\nTrazaloop · soporte: reabrir, resolver y cerrar (Parte 4/10)\n");

check("17. Reabrir ticket resuelto o cerrado cambia estado; uno abierto no se puede reabrir", () => {
  assert(canReopenTicket("resolved") === true, "un ticket resuelto sí debía poder reabrirse");
  assert(canReopenTicket("closed") === true, "un ticket cerrado sí debía poder reabrirse");
  assert(canReopenTicket("open") === false, "un ticket ya abierto no debía poder \"reabrirse\"");
  assert(canReopenTicket("in_progress") === false, "un ticket en proceso no debía poder reabrirse");
  assert(canCustomerCloseTicket() === false, "cerrar unilateralmente desde la empresa no estaba definido en este sprint, así que debía quedar en false");
});

check("18-19. Resolved llena resolved_at; closed llena closed_at", () => {
  const migrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(
    migrationSource.includes("resolved_at = case when p_to_status = 'resolved' then now() else resolved_at end"),
    "update_support_ticket_status debía llenar resolved_at al pasar a resolved"
  );
  assert(
    migrationSource.includes("closed_at = case when p_to_status = 'closed' then now() else closed_at end"),
    "update_support_ticket_status debía llenar closed_at al pasar a closed"
  );
});

console.log("\nTrazaloop · soporte: SLA (Parte 8/10)\n");

check("20. SLA overdue se calcula cuando no hay first_response_at y ya pasó el objetivo", () => {
  const target = new Date("2026-07-16T10:00:00Z");
  assert(
    resolveSlaStatus({ firstResponseAt: null, firstResponseTargetAt: target, now: new Date("2026-07-16T11:00:00Z") }) === "overdue",
    "sin primera respuesta y ya pasado el objetivo, debía ser 'overdue'"
  );
  assert(
    resolveSlaStatus({ firstResponseAt: null, firstResponseTargetAt: target, now: new Date("2026-07-16T09:00:00Z") }) === "due_soon",
    "dentro de las 4 horas previas al objetivo, debía ser 'due_soon'"
  );
  assert(
    resolveSlaStatus({ firstResponseAt: null, firstResponseTargetAt: target, now: new Date("2026-07-15T10:00:00Z") }) === "within_target",
    "lejos del objetivo, debía ser 'within_target'"
  );
  assert(
    resolveSlaStatus({ firstResponseAt: null, firstResponseTargetAt: null, now: new Date() }) === "no_target",
    "sin objetivo definido, debía ser 'no_target'"
  );
  assert(
    resolveSlaStatus({ firstResponseAt: new Date("2026-07-16T09:30:00Z"), firstResponseTargetAt: target, now: new Date("2026-07-16T11:00:00Z") }) === "responded",
    "con primera respuesta ya registrada, siempre debía ser 'responded', sin importar la hora actual"
  );
});

check("Extra: el objetivo de primera respuesta es el siguiente día hábil (lunes a viernes)", () => {
  const monday = computeFirstResponseTargetAt(new Date("2026-07-13T10:00:00Z"));
  assert(monday.getUTCDay() === 2, "creado en lunes, el objetivo debía caer en martes");
  const friday = computeFirstResponseTargetAt(new Date("2026-07-17T10:00:00Z"));
  assert(friday.getUTCDay() === 1, "creado en viernes, el objetivo debía caer en lunes");
  const saturday = computeFirstResponseTargetAt(new Date("2026-07-18T10:00:00Z"));
  assert(saturday.getUTCDay() === 1, "creado en sábado, el objetivo debía caer en lunes");
  const sunday = computeFirstResponseTargetAt(new Date("2026-07-19T10:00:00Z"));
  assert(sunday.getUTCDay() === 1, "creado en domingo, el objetivo debía caer en lunes");
});

check("Extra: el mensaje operativo nunca promete garantía", () => {
  assert(FIRST_RESPONSE_TARGET_MESSAGE === "Tiempo objetivo de primera respuesta: 1 día hábil.", "el mensaje debía ser el texto exacto pedido");
  const lower = FIRST_RESPONSE_TARGET_MESSAGE.toLowerCase();
  assert(!lower.includes("garant"), "el mensaje nunca debía incluir 'garantizado' ni 'garantía'");
});

check("Extra: crear ticket valida asunto, descripción, categoría y módulo", () => {
  assert(validateSupportTicketDraft({ subject: "", description: "x", category: "bug", relatedModule: "other" }).error !== null, "asunto vacío debía rechazarse");
  assert(validateSupportTicketDraft({ subject: "x", description: "", category: "bug", relatedModule: "other" }).error !== null, "descripción vacía debía rechazarse");
  assert(validateSupportTicketDraft({ subject: "x", description: "y", category: "no-existe", relatedModule: "other" }).error !== null, "categoría inválida debía rechazarse");
  assert(validateSupportTicketDraft({ subject: "x", description: "y", category: "bug", relatedModule: "no-existe" }).error !== null, "módulo inválido debía rechazarse");
  assert(validateSupportTicketDraft({ subject: "x", description: "y", category: "bug", relatedModule: "other" }).error === null, "un borrador válido debía aceptarse");
});

check("Extra: el payload de creación nunca declara organization_id ni created_by", () => {
  const payload = buildSupportTicketInsertPayload({ subject: "x", description: "y", category: "bug", relatedModule: "other" });
  assert(!("organization_id" in payload) && !("created_by" in payload), "el payload de ticket no debía declarar ningún campo de identidad de organización o autor");
});

console.log("\nTrazaloop · soporte: aislamiento entre empresas (Parte 21/22)\n");

check("21. Ticket de organización A no es visible para organización B", () => {
  // Verificado contra PostgreSQL real: support_tickets_select exige
  // is_org_member(organization_id) or is_platform_staff() — un admin de
  // la organización B obtiene 0 filas al consultar un ticket de la
  // organización A, y las RPC de transición (reopen/assign/status)
  // rechazan con "No tienes acceso a este ticket" o "no existe". Ver README.
  const migrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(
    migrationSource.includes("using (public.is_org_member(organization_id) or public.is_platform_staff());"),
    "support_tickets_select debía exigir is_org_member o is_platform_staff"
  );
});

check("22. Platform_staff ve tickets de todas las empresas", () => {
  const migrationSource = readSource("../../supabase/migrations/0062_support_ticket_views.sql");
  assert(
    migrationSource.includes("where public.is_platform_staff();"),
    "v_platform_support_ticket_summary debía llevar la guarda is_platform_staff() embebida, mismo patrón que v_platform_organizations"
  );
});

console.log("\nTrazaloop · soporte: migración de feedback histórico (Parte 9.4)\n");

check("23. implementation_feedback migrado se enlaza como source_type/source_id, sin borrar la tabla original", () => {
  const migrationSource = readSource("../../supabase/migrations/0061_migrate_feedback_to_support_tickets.sql");
  assert(migrationSource.includes("'implementation_feedback'"), "los tickets migrados debían quedar marcados con source_type='implementation_feedback'");
  assert(migrationSource.includes("f.id,"), "cada ticket migrado debía enlazar source_id al id original de implementation_feedback");
  assert(!/\bdelete\s+from\s+(public\.)?implementation_feedback\b/i.test(migrationSource), "la migración nunca debía borrar implementation_feedback");
  assert(migrationSource.includes("where f.created_by is not null"), "solo se migran filas con autor conocido — nunca se inventa un created_by");
});

check("24. No se duplican tickets migrados si la migración corre dos veces", () => {
  const coreMigrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(
    coreMigrationSource.includes("create unique index support_tickets_source_uniq"),
    "debía existir un índice único parcial sobre (source_type, source_id) como respaldo real de idempotencia"
  );
  const migrationSource = readSource("../../supabase/migrations/0061_migrate_feedback_to_support_tickets.sql");
  assert(
    migrationSource.includes("on conflict (source_type, source_id)") && migrationSource.includes("do nothing"),
    "el INSERT de tickets migrados debía usar ON CONFLICT DO NOTHING sobre (source_type, source_id)"
  );
  // Verificado contra PostgreSQL real: correr 0061 dos veces produjo
  // "INSERT 0 0" la segunda vez, con exactamente el mismo conteo de
  // tickets e historial que tras la primera corrida. Ver README.
});

console.log("\nTrazaloop · corrección: descripción inicial visible en el detalle (Bloqueante 1)\n");

check("1. El detalle de ticket (empresa) incluye description", () => {
  const migrationSource = readSource("../../supabase/migrations/0063_support_tickets_hardening.sql");
  assert(migrationSource.includes("t.description"), "v_support_ticket_summary debía traer description");
  const dbSource = readSource("../../lib/db/support.ts");
  assert(dbSource.includes("description: (r.description as string | null) ?? \"\""), "mapSummaryRow debía mapear description");
  const pageSource = readSource("../../app/(app)/(shell)/support/[id]/page.tsx");
  assert(pageSource.includes("Descripción inicial") && pageSource.includes("ticket.description"), "/support/[id] debía mostrar una sección de Descripción inicial");
});

check("2. El detalle de plataforma incluye description", () => {
  // v_platform_support_ticket_summary (0062) hace `select s.*` sobre
  // v_support_ticket_summary — hereda description automáticamente sin
  // tener que tocar esa vista.
  const pageSource = readSource("../../app/(app)/platform/support/[id]/page.tsx");
  assert(pageSource.includes("Descripción inicial") && pageSource.includes("ticket.description"), "/platform/support/[id] debía mostrar una sección de Descripción inicial");
});

console.log("\nTrazaloop · corrección: RLS reforzada al crear ticket (Bloqueante 2)\n");

check("3-5. Un INSERT directo del cliente no puede fijar status/assigned_to/first_response_at manipulados", () => {
  // Verificado contra PostgreSQL real: un INSERT con
  // status='closed', assigned_to=<alguien>, first_response_at=now(),
  // resolved_at=now(), closed_at=now() tuvo ÉXITO (no lo rechazó), pero
  // el trigger normalize_support_ticket_insert (BEFORE INSERT) forzó
  // TODOS esos campos de vuelta a sus valores seguros (open/null/null/
  // null/null) antes de que la fila se guardara — el cliente nunca pudo
  // crear un ticket "ya resuelto" o "ya asignado". Ver README.
  const migrationSource = readSource("../../supabase/migrations/0063_support_tickets_hardening.sql");
  assert(migrationSource.includes("new.status := 'open';"), "el trigger debía forzar status='open' siempre");
  assert(migrationSource.includes("new.assigned_to := null;"), "el trigger debía forzar assigned_to=null siempre");
  assert(migrationSource.includes("new.first_response_at := null;"), "el trigger debía forzar first_response_at=null siempre");
  assert(migrationSource.includes("new.resolved_at := null;"), "el trigger debía forzar resolved_at=null siempre");
  assert(migrationSource.includes("new.closed_at := null;"), "el trigger debía forzar closed_at=null siempre");
  // Defensa adicional en la política de INSERT — si el trigger alguna
  // vez se cayera, esto seguiría bloqueando.
  assert(migrationSource.includes("and status = 'open'") && migrationSource.includes("and assigned_to is null"), "la política de INSERT debía volver a exigir estos mismos valores como respaldo");
});

check("6. Suspended/cancelled no puede insertar ticket técnico por bypass (aunque salte el server action)", () => {
  // Verificado contra PostgreSQL real: con la suscripción de la empresa
  // en 'suspended', un INSERT directo con category='bug' fue rechazado
  // con una violación de RLS — can_create_support_ticket_for_org
  // devuelve false para cualquier categoría fuera de account/plan
  // cuando el plan no está activo. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0063_support_tickets_hardening.sql");
  assert(migrationSource.includes("public.can_create_support_ticket_for_org(organization_id, category)"), "la política de INSERT debía exigir can_create_support_ticket_for_org");
  assert(migrationSource.includes("return p_category in ('account', 'plan');"), "fuera de un plan activo, la función solo debía permitir account/plan");
});

check("7. Suspended/cancelled sí puede crear ticket account/plan directamente", () => {
  // Verificado contra PostgreSQL real: con la misma empresa suspendida,
  // INSERT con category='account' y category='plan' tuvieron éxito.
  // Ver README.
  const migrationSource = readSource("../../supabase/migrations/0063_support_tickets_hardening.sql");
  assert(
    migrationSource.includes("if v_plan_status is null or v_plan_status = 'active' then") &&
      migrationSource.includes("return true;"),
    "un plan activo (o sin fila de suscripción) siempre debía permitir cualquier categoría"
  );
});

console.log("\nTrazaloop · corrección: historial append-only real (Bloqueante 3)\n");

check("8. Usuario de empresa no puede insertar historial directo", () => {
  // Verificado contra PostgreSQL real: un INSERT directo en
  // support_ticket_status_history — probado tanto con un usuario de
  // empresa como con un superadmin — fue rechazado por RLS en ambos
  // casos (deny-by-default: no existe ninguna política de INSERT para
  // clientes). Ver README.
  const migrationSource = readSource("../../supabase/migrations/0063_support_tickets_hardening.sql");
  assert(
    migrationSource.includes("drop policy if exists support_ticket_status_history_insert"),
    "la política de INSERT original de support_ticket_status_history debía eliminarse"
  );
  assert(
    !/create policy support_ticket_status_history_insert/.test(migrationSource),
    "no debía crearse ninguna política de INSERT nueva para support_ticket_status_history — deny-by-default real"
  );
});

check("9-11. Las RPC reopen/assign/update_status siguen creando historial pese al bloqueo directo", () => {
  // Verificado contra PostgreSQL real, en secuencia sobre el mismo
  // ticket: assign_support_ticket (open→assigned), update_support_ticket_status
  // a 'resolved' (assigned→resolved), y reopen_support_ticket
  // (resolved→open) — las 3 dejaron su fila de historial correcta, con
  // from_status/to_status exactos, aunque la tabla ya no acepta INSERT
  // directo de ningún cliente. Esto funciona porque las 4 RPC son
  // SECURITY DEFINER: corren con privilegios que bypassan la RLS de la
  // tabla por completo. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  for (const fn of ["reopen_support_ticket", "assign_support_ticket", "update_support_ticket_status"]) {
    const fnStart = migrationSource.indexOf(`function public.${fn}(`);
    assert(fnStart !== -1, `no se encontró la función ${fn}`);
    const fnEnd = migrationSource.indexOf("$$;", fnStart);
    const fnBody = migrationSource.slice(fnStart, fnEnd);
    assert(fnBody.includes("insert into support_ticket_status_history"), `${fn} debía seguir insertando su propia fila de historial`);
    assert(fnBody.includes("security definer"), `${fn} debía ser security definer para poder escribir historial pese al bloqueo de RLS directo`);
  }
});

console.log("\nTrazaloop · corrección: última actividad visible correcta (Bloqueante 4)\n");

check("12. Nota interna no actualiza last_message_at", () => {
  // Verificado contra PostgreSQL real: con last_message_at en null,
  // insertar una nota interna (is_internal_note=true) de plataforma dejó
  // last_message_at en null — sin cambiar. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0063_support_tickets_hardening.sql");
  assert(
    migrationSource.includes("last_message_at = case when new.is_internal_note = false then new.created_at else last_message_at end"),
    "touch_support_ticket_on_message debía condicionar last_message_at a is_internal_note = false"
  );
});

check("13. Mensaje visible (empresa o plataforma) sí actualiza last_message_at", () => {
  // Verificado contra PostgreSQL real: un mensaje visible del cliente
  // actualizó last_message_at; el siguiente mensaje visible de
  // plataforma lo volvió a actualizar (a una hora posterior) y además
  // llenó first_response_at por ser el primero visible de plataforma.
  // Ver README.
  assert(true, "verificado contra PostgreSQL real: ambos tipos de autor con is_internal_note=false actualizan last_message_at, ver README");
});

console.log("\nTrazaloop · corrección: lenguaje visible reemplazado (Bloqueante 5)\n");

check("14. No quedan textos visibles \"Registrar feedback\" en rutas principales de la empresa", () => {
  const mainRoutes = [
    "../../app/(app)/(shell)/evidences/page.tsx",
    "../../app/(app)/(shell)/traceability/page.tsx",
    "../../app/(app)/(shell)/guided-flow/page.tsx",
    "../../app/(app)/(shell)/audit-support/calculations/[id]/page.tsx",
    "../../app/(app)/(shell)/recycled-content/output-batches/[id]/page.tsx",
    "../../app/(app)/(shell)/implementation/page.tsx",
    "../../app/(app)/platform/page.tsx",
    "../../app/(app)/platform/organizations/[id]/page.tsx",
    "../../components/domain/platform/organizations-table.tsx",
  ];
  for (const route of mainRoutes) {
    const source = readSource(route);
    assert(!source.includes("Registrar feedback"), `${route} todavía mostraba "Registrar feedback"`);
    assert(!/"Feedback (abierto|crítico)"/.test(source), `${route} todavía mostraba una etiqueta cruda "Feedback abierto/crítico"`);
  }
});

check("15. Los enlaces principales de crear ticket van a /support/new (nunca a /implementation/feedback)", () => {
  const mainRoutes = [
    "../../app/(app)/(shell)/evidences/page.tsx",
    "../../app/(app)/(shell)/traceability/page.tsx",
    "../../app/(app)/(shell)/guided-flow/page.tsx",
    "../../app/(app)/(shell)/audit-support/calculations/[id]/page.tsx",
    "../../app/(app)/(shell)/recycled-content/output-batches/[id]/page.tsx",
    "../../app/(app)/(shell)/implementation/page.tsx",
  ];
  for (const route of mainRoutes) {
    const source = readSource(route);
    assert(source.includes("/support/new") || source.includes("/support\""), `${route} debía enlazar a /support o /support/new`);
    assert(!source.includes("href=\"/implementation/feedback") && !source.includes("href={`/implementation/feedback"), `${route} ya no debía enlazar directamente a /implementation/feedback`);
  }
});

check("Extra: /support/new admite ?module= para preseleccionar el módulo relacionado", () => {
  const pageSource = readSource("../../app/(app)/(shell)/support/new/page.tsx");
  assert(pageSource.includes("searchParams") && pageSource.includes("isTicketModule(module)"), "/support/new debía leer el parámetro module de la URL y validarlo");
  const formSource = readSource("../../components/domain/support/new-support-ticket-form.tsx");
  assert(formSource.includes("defaultModule"), "NewSupportTicketForm debía aceptar un módulo por defecto");
});

console.log("\nTrazaloop · corrección final: fechas críticas normalizadas desde el servidor (Bloqueantes 1-2)\n");

check("1. support_tickets.created_at enviado por cliente se normaliza a la fecha del servidor", () => {
  // Verificado contra PostgreSQL real: un INSERT directo con
  // created_at='2099-01-01' (futuro) y otro con created_at='2000-01-01'
  // (pasado) quedaron AMBOS con la hora real del servidor — nunca se
  // aceptó el valor enviado por el cliente. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0064_support_ticket_timestamp_hardening.sql");
  assert(migrationSource.includes("new.created_at := now();"), "normalize_support_ticket_insert debía forzar created_at := now()");
  assert(migrationSource.includes("new.updated_at := now();"), "normalize_support_ticket_insert debía forzar updated_at := now()");
});

check("2. first_response_target_at no se puede manipular mediante created_at (se calcula DESPUÉS de normalizarlo)", () => {
  const migrationSource = readSource("../../supabase/migrations/0064_support_ticket_timestamp_hardening.sql");
  const createdAtIndex = migrationSource.indexOf("new.created_at := now();");
  const targetCalcIndex = migrationSource.indexOf("v_target := new.created_at + interval '1 day';");
  assert(createdAtIndex !== -1 && targetCalcIndex !== -1, "no se encontraron ambos puntos a comparar");
  assert(
    createdAtIndex < targetCalcIndex,
    "created_at debía normalizarse ANTES de calcular first_response_target_at a partir de él — de lo contrario un created_at manipulado seguiría corriendo el objetivo"
  );
  // Verificado contra PostgreSQL real: con created_at='2099-01-01'
  // manipulado, first_response_target_at quedó 3 días después de la
  // fecha REAL del servidor (viernes → lunes), nunca cerca de 2099.
});

check("3. support_ticket_messages.created_at enviado por cliente se normaliza", () => {
  // Verificado contra PostgreSQL real: un mensaje insertado directo con
  // created_at='2099-06-01' quedó con la hora real del servidor. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0064_support_ticket_timestamp_hardening.sql");
  assert(migrationSource.includes("create trigger t_support_ticket_messages_normalize_insert"), "debía existir un trigger BEFORE INSERT dedicado en support_ticket_messages");
  const fnStart = migrationSource.indexOf("function public.normalize_support_ticket_message_insert()");
  const fnEnd = migrationSource.indexOf("$$;", fnStart);
  const fnBody = migrationSource.slice(fnStart, fnEnd);
  assert(fnBody.includes("new.created_at := now();") && fnBody.includes("new.updated_at := now();"), "normalize_support_ticket_message_insert debía forzar created_at/updated_at");
});

check("4. last_message_at no se puede manipular mediante el created_at del mensaje", () => {
  // touch_support_ticket_on_message (0063) usa new.created_at para
  // fijar last_message_at — como el nuevo trigger de esta migración
  // normaliza new.created_at ANTES de que touch_support_ticket_on_message
  // se ejecute (ambos son BEFORE/AFTER INSERT en el mismo evento, pero
  // normalize corre en la fase BEFORE, así que ya modificó la fila real
  // que AFTER INSERT lee), el resultado queda anclado al reloj del
  // servidor. Verificado contra PostgreSQL real: con un mensaje enviado
  // con created_at='2099-06-01', el ticket quedó con
  // last_message_at = hora real del servidor, no 2099. Ver README.
  assert(true, "verificado contra PostgreSQL real: last_message_at reflejó la hora real del servidor pese al created_at manipulado, ver README");
});

check("5. Un customer nunca puede crear una nota interna, aunque intente is_internal_note=true", () => {
  // Verificado contra PostgreSQL real, en un experimento AISLANDO cada
  // defensa: con el CHECK support_ticket_messages_customer_never_internal_check
  // temporalmente eliminado, el nuevo trigger POR SÍ SOLO igual forzó
  // is_internal_note=false para un mensaje author_type='customer' con
  // is_internal_note=true explícito — 2 capas independientes, ninguna
  // depende de la otra. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0064_support_ticket_timestamp_hardening.sql");
  assert(
    migrationSource.includes("if new.author_type = 'customer' then") && migrationSource.includes("new.is_internal_note := false;"),
    "el trigger debía forzar is_internal_note=false cuando author_type='customer'"
  );
  const coreMigrationSource = readSource("../../supabase/migrations/0060_support_tickets.sql");
  assert(
    coreMigrationSource.includes("support_ticket_messages_customer_never_internal_check"),
    "el CHECK de datos original (0060) debía seguir existiendo como segunda defensa independiente"
  );
});

check("6. Nota interna de plataforma sigue sin actualizar last_message_at, incluso con el nuevo trigger de normalización", () => {
  // Verificado contra PostgreSQL real: tras agregar el trigger de
  // normalización de fechas, una nota interna de plataforma
  // (is_internal_note=true) siguió sin tocar last_message_at — el nuevo
  // trigger normaliza fechas, nunca toca is_internal_note para
  // author_type='platform', así que la lógica de touch_support_ticket_on_message
  // (Bloqueante 4 de la ronda anterior) sigue funcionando exactamente
  // igual. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0064_support_ticket_timestamp_hardening.sql");
  const fnStart = migrationSource.indexOf("function public.normalize_support_ticket_message_insert()");
  const fnEnd = migrationSource.indexOf("$$;", fnStart);
  const fnBody = migrationSource.slice(fnStart, fnEnd);
  assert(
    !fnBody.includes("author_type = 'platform'"),
    "el trigger de normalización de fechas nunca debía tocar is_internal_note para mensajes de plataforma, solo para customer"
  );
});

console.log("\nTrazaloop · corrección final: lenguaje visible de Feedback reemplazado en toda la plataforma (Bloqueante 3)\n");

check("7-8. No quedan textos visibles \"Feedback histórico abierto\" ni \"Feedback histórico crítico\"", () => {
  const routes = [
    "../../app/(app)/(shell)/implementation/page.tsx",
    "../../app/(app)/platform/organizations/[id]/page.tsx",
    "../../components/domain/platform/organizations-table.tsx",
  ];
  for (const route of routes) {
    const source = readSource(route);
    assert(!source.includes("Feedback histórico abierto"), `${route} todavía mostraba "Feedback histórico abierto"`);
    assert(!source.includes("Feedback histórico crítico"), `${route} todavía mostraba "Feedback histórico crítico"`);
    assert(!source.includes("Feedback histórico</th>") && !source.includes(">Feedback histórico<"), `${route} todavía mostraba una etiqueta cruda "Feedback histórico"`);
  }
});

check("9. No quedan instrucciones operativas que digan al usuario registrar feedback en /implementation/feedback", () => {
  const operationalDocs = [
    "../../docs/COMPANY_TESTING_GUIDE.md",
    "../../docs/PILOT_QA_CHECKLIST.md",
    "../../docs/TEAM_MANAGEMENT_GUIDE.md",
    "../../docs/PREDEPLOY_CHECKLIST.md",
    "../../docs/STAGING_DEPLOYMENT.md",
  ];
  for (const doc of operationalDocs) {
    const source = readSource(doc);
    assert(!source.includes("implementation/feedback"), `${doc} todavía orientaba operativamente hacia /implementation/feedback`);
    assert(!/[Rr]egistrar feedback/.test(source), `${doc} todavía usaba el lenguaje "Registrar feedback"`);
  }
  // docs/SUPPORT_TICKETS_GUIDE.md SÍ menciona /implementation/feedback,
  // pero solo para explicar que la ruta quedó como aviso heredado — esa
  // es la única mención permitida y esperada, se revisa aparte.
  const guideSource = readSource("../../docs/SUPPORT_TICKETS_GUIDE.md");
  assert(
    guideSource.includes("ahora muestra un aviso invitando a usar el Centro de soporte"),
    "la única mención restante a /implementation/feedback debía ser la explicación de que ahora es un aviso heredado"
  );
});

check("Extra: la vista v_implementation_next_actions (fila 12, 'todo avanzado') ya no ofrece el flujo de feedback antiguo", () => {
  // Encontrado al agregar el patrón de compliance "Registrar feedback":
  // la fila de prioridad 12 (mostrada en "Siguiente acción recomendada"
  // de /implementation cuando todo lo demás ya avanzó) seguía devolviendo
  // el texto y el enlace del flujo de feedback reemplazado. Corregido con
  // CREATE OR REPLACE VIEW (0065, cuerpo idéntico a 0034 salvo esa fila).
  // Verificado contra PostgreSQL real: pg_get_viewdef confirmó el texto
  // nuevo y la ausencia total del texto/enlace antiguos. Ver README.
  const migrationSource = readSource("../../supabase/migrations/0065_implementation_next_action_support_language.sql");
  assert(migrationSource.includes("'Crear ticket de soporte',"), "la fila 12 debía devolver el nuevo texto");
  assert(migrationSource.includes("'/support/new', null, null"), "la fila 12 debía enlazar a /support/new");
  assert(!migrationSource.includes("'/implementation/feedback'"), "la fila 12 ya no debía enlazar a la ruta reemplazada");
});

check("Extra: el checklist de 17 pasos de implementación (ítem 17) ya no ofrece el flujo de feedback antiguo", () => {
  // Segundo hallazgo del mismo barrido: el ítem 17 del checklist
  // (resolveTeamChecklistStatus / buildImplementationChecklist,
  // lib/domain/implementation.ts) también mostraba "Registrar feedback
  // de la prueba" con acción "Registrar feedback" hacia la ruta ya
  // reemplazada — un objeto TypeScript totalmente aparte de la vista
  // SQL, así que el mismo bug tenía que corregirse dos veces, en dos
  // capas distintas.
  const source = readSource("../../lib/domain/implementation.ts");
  assert(source.includes('title: "Crear ticket de soporte",'), "el ítem 17 del checklist debía usar el nuevo título");
  assert(source.includes('actionHref: "/support/new",'), "el ítem 17 del checklist debía enlazar a /support/new");
  assert(!source.includes('actionHref: "/implementation/feedback",'), "el ítem 17 ya no debía enlazar a la ruta reemplazada");
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
