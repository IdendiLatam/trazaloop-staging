import "server-only";

import {
  getAudit, getAuditDetail, listAgenda, listAudits, listAuditees, listCheckResults,
  listChecklists, listConflicts, listCriteria, listEvidence, listFindings, listMeetings,
  listNotes, listPrograms, listProgramRevisions, listReports, listReschedules,
  listSamples, listScopeItems, listTeam,
} from "@/lib/db/quality-audits";
import {
  AGENDA_ACTIVITY_LABEL, AUDIT_NATURE_LABEL, AUDIT_STATUS_LABEL, AUDIT_TYPE_LABEL,
  CANCEL_IS_NOT_DELETE, CHECK_IS_NOT_A_FINDING, CHECK_OUTCOME_LABEL,
  CHECKLIST_IS_OPTIONAL, CHECKLIST_VERSION_STATUS_LABEL,
  CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS, CONCLUSIONS_ARE_HUMAN, CONFLICT_KIND_LABEL,
  CONFORMITY_IS_LOCAL,
  CONFLICT_STATUS_LABEL, CRITERION_IS_NOT_A_QUESTION, CRITERION_KIND_LABEL,
  describeCoverage, describeFollowUp, describeSample, EVIDENCE_IS_NOT_A_FINDING,
  EVIDENCE_IS_REFERENCED, EVIDENCE_KIND_LABEL, FINDING_CLASSIFICATION_LABEL,
  FINDING_EVALUATION_STATUS_LABEL, FINDING_IS_NOT_NC, FINDING_SEVERITY_LABEL,
  formatDate, formatRange, INDEPENDENCE_IS_NOT_DECLARED, MEETING_KIND_LABEL,
  NOTE_IS_NOT_EVIDENCE, NOTE_KIND_LABEL, OBSERVATION_IS_NOT_NC,
  PROGRAM_IS_NOT_AN_AUDIT, PROGRAM_REVISION_KIND_LABEL, PROGRAM_STATUS_LABEL,
  RESCHEDULE_KEEPS_HISTORY, SAMPLE_IS_NOT_COVERAGE, SCOPE_ITEM_KIND_LABEL,
  TEAM_ROLE_LABEL, TRAZALOOP_DOES_NOT_CERTIFY, wasRescheduled,
} from "@/lib/domain/quality-audits";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, field, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-09 · Los papeles de Auditorías.
 *
 * TRES REGLAS QUE ATRAVIESAN LOS DOCE
 *
 * §39 · NINGUNO CERTIFICA NADA. No aparece «Certificado», ni «conforme a la
 * norma», ni «ISO compliant». Trazaloop administra auditorías; la certificación
 * la concede un organismo acreditado, que no es esto.
 *
 * §30 · NINGUNO LLAMA «NO CONFORMIDAD» A UN HALLAZGO. Ni siquiera al que el
 * auditor propuso como posible no conformidad: eso es una propuesta, y el papel
 * que la imprimiera como clasificación firme convertiría en hecho algo que
 * nadie decidió.
 *
 * §37 · NINGUNO DICE QUE CERRAR LA AUDITORÍA CIERRA LO QUE ABRIÓ. El informe y
 * el cierre imprimen, uno al lado del otro, lo que quedó abierto después.
 *
 * Y una cuarta, técnica: el INFORME se imprime desde su instantánea, no desde
 * el estado de hoy. Es lo único que hace que reimprimir un informe de hace dos
 * años devuelva lo que decía entonces.
 */

const SYSTEM = "Trazaloop Quality · auditorías";

/** §39 · La frase que va en todos, para que ninguno pueda leerse como más de
 *  lo que es. */
const NOT_A_CERTIFICATE = TRAZALOOP_DOES_NOT_CERTIFY;

function stamp(iso: string): string {
  return iso.slice(0, 10);
}

function auditBadges(a: { status: string; nature: string; rescheduleCount: number }) {
  return [
    ...(a.status === "cancelled"
      ? [{ text: "Cancelada", tone: "warn" as const }] : []),
    ...(a.nature === "extraordinary"
      ? [{ text: "Extraordinaria", tone: "info" as const }] : []),
    ...(a.rescheduleCount > 0
      ? [{ text: `Reprogramada ×${a.rescheduleCount}`, tone: "info" as const }] : []),
  ];
}

// ---------------------------------------------------------------------------
// 1 · Programa de auditorías
// ---------------------------------------------------------------------------

export const qualityAuditProgramDetail: ExportDefinition = {
  key: "quality.audit-program.detail",
  module: "quality",
  entity: "Programa de auditorías",
  recordType: "Programa de auditorías",
  documentName: "Programa de auditorías",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El programa se imprime como está hoy, con sus revisiones listadas. Cada revisión "
    + "guarda su propia foto y es lo que permite ver qué decía el programa antes.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const programs = await listPrograms(req.organizationId);
    const program = programs.find((p) => p.id === req.id);
    if (!program) return null;

    const [audits, revisions, org] = await Promise.all([
      listAudits(req.organizationId, { programId: program.id }),
      listProgramRevisions(req.organizationId, program.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Programa de auditorías", title: program.name,
        code: program.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Programa de auditorías",
        title: program.name,
        code: program.code,
        subtitle: `${formatDate(program.periodStart)} — ${formatDate(program.periodEnd)}`,
        badges: [{ text: PROGRAM_STATUS_LABEL[program.status], tone: "info" as const }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PROGRAM_IS_NOT_AN_AUDIT), note(NOT_A_CERTIFICATE),
            currentStateNote(req.generatedAt)),
          section("El programa", fields([
            requiredField("Nombre", program.name),
            field("Código", program.code),
            requiredField("Periodo", program.periodLabel),
            requiredField("Desde", formatDate(program.periodStart)),
            requiredField("Hasta", formatDate(program.periodEnd)),
            requiredField("Estado", PROGRAM_STATUS_LABEL[program.status]),
            field("Aprobado el", program.approvedOn ? formatDate(program.approvedOn) : null),
            requiredField("Responsable", program.ownerPositionName ?? "Sin asignar"),
          ])),
          section("Para qué existe", paragraph(program.purpose)),
          section("Cómo se priorizó", paragraph(program.prioritizationNote), note(
            "El criterio de priorización lo escribió una persona. El sistema reúne "
            + "riesgos, desempeño y hallazgos anteriores para informarla, y se detiene ahí."
          )),
          section("Cobertura", fields([
            requiredField("Auditorías planificadas", String(program.plannedAudits)),
            requiredField("Ejecutadas", String(program.executedAudits)),
            requiredField("Cerradas", String(program.closedAudits)),
            requiredField("Canceladas", String(program.cancelledAudits)),
            requiredField("Pendientes", String(program.pendingAudits)),
            requiredField("Reprogramadas", String(program.rescheduledAudits)),
            requiredField("Cobertura",
              program.coveragePct === null ? "Sin auditorías" : `${program.coveragePct}%`),
            requiredField("Procesos con auditoría",
              `${program.processesAudited} de ${program.processesInScope}`),
          ]), note(
            "Las auditorías canceladas siguen contando como planificadas no ejecutadas. "
            + "Descontarlas subiría la cobertura sin que nadie hubiera auditado nada."
          )),
          section("Auditorías del programa", table(
            [
              { header: "Código", width: 2 },
              { header: "Auditoría", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Fechas", width: 3 },
              { header: "Estado", width: 2 },
              { header: "Hallazgos", width: 2 },
            ],
            audits.map((a) => [
              a.code, a.title, AUDIT_TYPE_LABEL[a.auditType],
              formatRange(a.scheduledFrom, a.scheduledTo),
              AUDIT_STATUS_LABEL[a.status],
              String(a.findingCount),
            ]),
            "El programa todavía no tiene auditorías."
          )),
          section("Revisiones", table(
            [
              { header: "Rev.", width: 1 },
              { header: "Qué pasó", width: 3 },
              { header: "Nota", width: 5 },
              { header: "Desde", width: 2 },
            ],
            revisions.map((r) => [
              String(r.revisionNumber),
              PROGRAM_REVISION_KIND_LABEL[r.changeKind],
              r.changeNote ?? "—",
              formatDate(r.effectiveFrom),
            ]),
            "Sin revisiones registradas."
          ), note(
            "Un programa cambia durante el año, y eso es normal. Lo que no puede "
            + "cambiar es la versión anterior: cada revisión guarda su foto."
          )),
          section("Cierre", paragraph(program.closureNote)),
        ],
      },
    };
  },
};

export const qualityAuditProgramList: ExportDefinition = {
  key: "quality.audit-program.list",
  module: "quality",
  entity: "Listado de programas de auditoría",
  recordType: "Programas de auditoría",
  documentName: "Listado de programas de auditoría",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata la situación de hoy. Lo fechado son las revisiones de cada "
    + "programa, que llevan su propia foto.",
  async load(req): Promise<ExportResult | null> {
    const [programs, org] = await Promise.all([
      listPrograms(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Programas de auditoría", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Programas de auditoría",
        title: "Listado de programas de auditoría",
        code: null,
        subtitle: `${programs.length} programa(s)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PROGRAM_IS_NOT_AN_AUDIT), currentStateNote(req.generatedAt)),
          section("Programas", table(
            [
              { header: "Programa", width: 4 },
              { header: "Código", width: 2 },
              { header: "Periodo", width: 3 },
              { header: "Estado", width: 2 },
              { header: "Cobertura", width: 5 },
              { header: "Procesos", width: 2 },
            ],
            programs.map((p) => [
              p.name, p.code ?? "—",
              `${formatDate(p.periodStart)} — ${formatDate(p.periodEnd)}`,
              PROGRAM_STATUS_LABEL[p.status],
              describeCoverage({
                planned: p.plannedAudits, executed: p.executedAudits,
                cancelled: p.cancelledAudits, pending: p.pendingAudits,
              }),
              `${p.processesAudited}/${p.processesInScope}`,
            ]),
            "Todavía no hay ningún programa."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2 · Auditoría: ficha y listado
// ---------------------------------------------------------------------------

export const qualityAuditDetail: ExportDefinition = {
  key: "quality.audit.detail",
  module: "quality",
  entity: "Auditoría",
  recordType: "Auditoría",
  documentName: "Ficha de auditoría",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha imprime la auditoría como está hoy. El documento del PASADO es su "
    + "informe emitido, que se imprime desde su propia instantánea.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const audit = await getAudit(req.organizationId, req.id);
    if (!audit) return null;

    const [detail, reschedules, scope, criteria, team, conflicts, findings, org] =
      await Promise.all([
        getAuditDetail(req.organizationId, audit.id),
        listReschedules(req.organizationId, audit.id),
        listScopeItems(req.organizationId, audit.id),
        listCriteria(req.organizationId, audit.id),
        listTeam(req.organizationId, audit.id),
        listConflicts(req.organizationId, audit.id),
        listFindings(req.organizationId, { auditId: audit.id }),
        organizationIdentity(req.organizationId),
      ]);

    return {
      filenameParts: {
        recordType: "Auditoría", title: audit.title,
        code: audit.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Auditoría",
        title: audit.title,
        code: audit.code,
        subtitle: `${AUDIT_TYPE_LABEL[audit.auditType]} · ${AUDIT_STATUS_LABEL[audit.status]}`,
        badges: auditBadges(audit),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_A_CERTIFICATE), currentStateNote(req.generatedAt)),
          section("La auditoría", fields([
            requiredField("Código", audit.code),
            requiredField("Título", audit.title),
            requiredField("Tipo", AUDIT_TYPE_LABEL[audit.auditType]),
            requiredField("Naturaleza", AUDIT_NATURE_LABEL[audit.nature]),
            requiredField("Estado", AUDIT_STATUS_LABEL[audit.status]),
            field("Programa", audit.programName ?? "Fuera de programa"),
            requiredField("Fecha original", formatRange(audit.plannedFrom, audit.plannedTo)),
            requiredField("Fecha vigente", formatRange(audit.scheduledFrom, audit.scheduledTo)),
            requiredField("Ejecutada", formatRange(audit.executedFrom, audit.executedTo)),
            requiredField("Responsable", audit.ownerPositionName ?? "Sin asignar"),
          ])),
          section("Objetivo", paragraph(detail?.objective ?? null)),
          ...(wasRescheduled(audit)
            ? [section("Reprogramaciones", table(
                [
                  { header: "De", width: 3 },
                  { header: "A", width: 3 },
                  { header: "Motivo", width: 5 },
                  { header: "Cuándo", width: 2 },
                ],
                reschedules.map((r) => [
                  formatRange(r.fromStart, r.fromEnd),
                  formatRange(r.toStart, r.toEnd),
                  r.reason, formatDate(r.decidedAt.slice(0, 10)),
                ]),
                "—"
              ), note(RESCHEDULE_KEEPS_HISTORY))]
            : []),
          ...(audit.status === "cancelled"
            ? [section("Cancelación", paragraph(detail?.cancelReason ?? null),
                note(CANCEL_IS_NOT_DELETE))]
            : []),
          section("Alcance", table(
            [
              { header: "Qué", width: 3 },
              { header: "Referencia", width: 5 },
              { header: "Nota", width: 4 },
            ],
            scope.map((s) => [
              SCOPE_ITEM_KIND_LABEL[s.itemKind],
              s.processName ?? s.documentTitle ?? s.partyName
                ?? (s.requirementCode ? `${s.requirementCode} · ${s.requirementTitle}` : "—"),
              s.note ?? "—",
            ]),
            "El alcance no se definió."
          )),
          section("Criterios", table(
            [
              { header: "Tipo", width: 3 },
              { header: "Criterio", width: 6 },
              { header: "Revisión", width: 3 },
            ],
            criteria.map((c) => [
              CRITERION_KIND_LABEL[c.criterionKind],
              c.requirementCode
                ? `${c.requirementCode} · ${c.requirementTitle}`
                : c.documentTitle ?? c.customText ?? "—",
              c.documentRevisionNumber !== null
                ? `Revisión ${c.documentRevisionNumber}` : "—",
            ]),
            "No se definieron criterios."
          ), note(CRITERION_IS_NOT_A_QUESTION)),
          section("Equipo auditor", table(
            [
              { header: "Persona", width: 5 },
              { header: "Papel", width: 3 },
              { header: "Cuenta", width: 3 },
            ],
            team.map((m) => [
              m.personName, TEAM_ROLE_LABEL[m.teamRole],
              m.hasAccount ? "Con cuenta" : "Sin cuenta",
            ]),
            "Sin equipo asignado."
          )),
          section("Independencia", table(
            [
              { header: "Persona", width: 3 },
              { header: "Conflicto", width: 3 },
              { header: "Detalle", width: 4 },
              { header: "Decisión", width: 3 },
            ],
            conflicts.map((c) => [
              c.personName, CONFLICT_KIND_LABEL[c.conflictKind], c.detail,
              CONFLICT_STATUS_LABEL[c.status],
            ]),
            "No se registraron conflictos."
          ), note(INDEPENDENCE_IS_NOT_DECLARED)),
          section("Hallazgos", table(
            [
              { header: "Código", width: 2 },
              { header: "Enunciado", width: 6 },
              { header: "Clasificación propuesta", width: 3 },
              { header: "Evaluación", width: 3 },
            ],
            findings.map((f) => [
              f.code, f.statement,
              FINDING_CLASSIFICATION_LABEL[f.proposedClassification],
              FINDING_EVALUATION_STATUS_LABEL[f.evaluationStatus],
            ]),
            "No se levantaron hallazgos."
          ), note(FINDING_IS_NOT_NC)),
          section("Conclusiones", paragraph(detail?.conclusions ?? null),
            note(CONCLUSIONS_ARE_HUMAN)),
          section("Después de la auditoría", fields([
            requiredField("Casos abiertos que salieron de aquí", String(audit.openCases)),
            requiredField("Acciones abiertas", String(audit.openActions)),
          ]), note(CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS)),
        ],
      },
    };
  },
};

export const qualityAuditList: ExportDefinition = {
  key: "quality.audit.list",
  module: "quality",
  entity: "Listado de auditorías",
  recordType: "Auditorías",
  documentName: "Listado de auditorías",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata la situación de hoy. Lo fechado son los informes emitidos, "
    + "que llevan su propia instantánea.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["draft", "planned", "in_progress", "executed", "reported", "closed", "cancelled"],
    },
    {
      key: "auditType", label: "Tipo", kind: "enum",
      values: ["internal", "second_party", "external_received", "other"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [audits, org] = await Promise.all([
      listAudits(req.organizationId, {
        status: req.filters.status, auditType: req.filters.auditType,
      }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Auditorías", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Auditorías",
        title: "Listado de auditorías",
        code: null,
        subtitle: `${audits.length} auditoría(s)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_A_CERTIFICATE), note(RESCHEDULE_KEEPS_HISTORY),
            currentStateNote(req.generatedAt)),
          section("Auditorías", table(
            [
              { header: "Código", width: 2 },
              { header: "Auditoría", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Programa", width: 3 },
              { header: "Fecha original", width: 3 },
              { header: "Fecha vigente", width: 3 },
              { header: "Estado", width: 2 },
              { header: "Hallazgos", width: 3 },
            ],
            audits.map((a) => [
              a.code, a.title, AUDIT_TYPE_LABEL[a.auditType],
              a.programName ?? "Fuera de programa",
              formatRange(a.plannedFrom, a.plannedTo),
              formatRange(a.scheduledFrom, a.scheduledTo),
              AUDIT_STATUS_LABEL[a.status],
              `${a.findingCount} · ${a.findingsPending} sin evaluar`,
            ]),
            "Todavía no hay auditorías."
          )),
          section(null, note(
            "La columna «Hallazgos» NO cuenta no conformidades. Cuenta lo que los "
            + "auditores levantaron y cuántos siguen sin evaluar."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3 · Plan de auditoría
// ---------------------------------------------------------------------------

export const qualityAuditPlanDetail: ExportDefinition = {
  key: "quality.audit-plan.detail",
  module: "quality",
  entity: "Plan de auditoría",
  recordType: "Plan de auditoría",
  documentName: "Plan de auditoría",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El plan se imprime como está hoy. Lo que se planificó ORIGINALMENTE se lee en "
    + "la fecha original y en las reprogramaciones, que sí se conservan.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const audit = await getAudit(req.organizationId, req.id);
    if (!audit) return null;

    const [detail, scope, criteria, team, conflicts, auditees, org] = await Promise.all([
      getAuditDetail(req.organizationId, audit.id),
      listScopeItems(req.organizationId, audit.id),
      listCriteria(req.organizationId, audit.id),
      listTeam(req.organizationId, audit.id),
      listConflicts(req.organizationId, audit.id),
      listAuditees(req.organizationId, audit.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Plan de auditoría", title: audit.title,
        code: audit.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Plan de auditoría",
        title: audit.title,
        code: audit.code,
        subtitle: formatRange(audit.scheduledFrom, audit.scheduledTo),
        badges: auditBadges(audit),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_A_CERTIFICATE), note(
            "Este plan es lo que se piensa auditar. Lo que se auditó de verdad se lee "
            + "en el registro de ejecución y en el informe."
          ), currentStateNote(req.generatedAt)),
          section("Datos del plan", fields([
            requiredField("Auditoría", `${audit.code} · ${audit.title}`),
            requiredField("Tipo", AUDIT_TYPE_LABEL[audit.auditType]),
            requiredField("Naturaleza", AUDIT_NATURE_LABEL[audit.nature]),
            requiredField("Fechas previstas", formatRange(audit.scheduledFrom, audit.scheduledTo)),
            requiredField("Responsable", audit.ownerPositionName ?? "Sin asignar"),
            requiredField("Auditor líder", audit.leadAuditor ?? "Sin líder designado"),
          ])),
          section("Objetivo", paragraph(detail?.objective ?? null)),
          section("Por qué esta auditoría y por qué ahora",
            paragraph(detail?.priorityNote ?? null), note(
              "Lo escribió una persona. El sistema reúne el contexto —riesgos, "
              + "desempeño, casos, hallazgos anteriores— y no programa nada solo."
            )),
          section("Alcance", table(
            [
              { header: "Qué", width: 3 },
              { header: "Referencia", width: 5 },
              { header: "Revisión en la fecha", width: 2 },
              { header: "Nota", width: 3 },
            ],
            scope.map((s) => [
              SCOPE_ITEM_KIND_LABEL[s.itemKind],
              s.processName ?? s.documentTitle ?? s.partyName
                ?? (s.requirementCode ? `${s.requirementCode} · ${s.requirementTitle}` : "—"),
              s.processRevisionNumber !== null ? `Revisión ${s.processRevisionNumber}` : "—",
              s.note ?? "—",
            ]),
            "El alcance no se definió."
          )),
          section("Criterios", table(
            [
              { header: "Tipo", width: 3 },
              { header: "Criterio", width: 6 },
              { header: "Revisión", width: 3 },
            ],
            criteria.map((c) => [
              CRITERION_KIND_LABEL[c.criterionKind],
              c.requirementCode
                ? `${c.requirementCode} · ${c.requirementTitle}`
                : c.documentTitle ?? c.customText ?? "—",
              c.documentRevisionNumber !== null
                ? `Revisión ${c.documentRevisionNumber}` : "Vigente en la fecha auditada",
            ]),
            "No se definieron criterios."
          ), note(CRITERION_IS_NOT_A_QUESTION)),
          section("Equipo auditor", table(
            [
              { header: "Persona", width: 5 },
              { header: "Papel", width: 3 },
              { header: "Nota", width: 4 },
            ],
            team.map((m) => [m.personName, TEAM_ROLE_LABEL[m.teamRole], m.note ?? "—"]),
            "Sin equipo asignado."
          )),
          section("Independencia comprobada", table(
            [
              { header: "Persona", width: 3 },
              { header: "Conflicto", width: 3 },
              { header: "Detalle", width: 4 },
              { header: "Decisión", width: 2 },
              { header: "Mitigación", width: 3 },
            ],
            conflicts.map((c) => [
              c.personName, CONFLICT_KIND_LABEL[c.conflictKind], c.detail,
              CONFLICT_STATUS_LABEL[c.status], c.mitigation ?? "—",
            ]),
            "No se registraron conflictos."
          ), note(INDEPENDENCE_IS_NOT_DECLARED)),
          section("Auditados", table(
            [
              { header: "Quién", width: 5 },
              { header: "Papel", width: 4 },
              { header: "Proceso", width: 3 },
            ],
            auditees.map((x) => [
              x.personName ?? x.externalName ?? "—",
              x.roleNote ?? "—", x.processName ?? "—",
            ]),
            "Sin auditados registrados."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 4 · Agenda
// ---------------------------------------------------------------------------

export const qualityAuditAgendaDetail: ExportDefinition = {
  key: "quality.audit-agenda.detail",
  module: "quality",
  entity: "Agenda de auditoría",
  recordType: "Agenda de auditoría",
  documentName: "Agenda de auditoría",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La agenda se imprime como está hoy. Lo que ocurrió de verdad se lee en el "
    + "registro de ejecución, que es otra capa y se conserva aparte.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const audit = await getAudit(req.organizationId, req.id);
    if (!audit) return null;

    const [agenda, auditees, meetings, org] = await Promise.all([
      listAgenda(req.organizationId, audit.id),
      listAuditees(req.organizationId, audit.id),
      listMeetings(req.organizationId, audit.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Agenda de auditoría", title: audit.title,
        code: audit.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Agenda de auditoría",
        title: audit.title,
        code: audit.code,
        subtitle: formatRange(audit.scheduledFrom, audit.scheduledTo),
        badges: auditBadges(audit),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "La agenda dice qué se piensa mirar y cuándo. Si el día de la auditoría "
            + "se mira otra cosa, la agenda no queda invalidada: planificó, y la "
            + "ejecución registró."
          ), currentStateNote(req.generatedAt)),
          section("Actividades", table(
            [
              { header: "#", width: 1 },
              { header: "Actividad", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Día", width: 2 },
              { header: "Horario", width: 2 },
              { header: "Proceso", width: 3 },
              { header: "Responsable", width: 3 },
            ],
            agenda.map((g) => [
              String(g.order), g.title,
              AGENDA_ACTIVITY_LABEL[g.activityKind as keyof typeof AGENDA_ACTIVITY_LABEL]
                ?? g.activityKind,
              formatDate(g.scheduledOn),
              [g.startsAtLabel, g.endsAtLabel].filter(Boolean).join(" — ") || "—",
              g.processName ?? "—", g.responsibleName ?? "—",
            ]),
            "La agenda está vacía."
          )),
          section("Auditados convocados", table(
            [
              { header: "Quién", width: 5 },
              { header: "Papel", width: 4 },
              { header: "Proceso", width: 3 },
            ],
            auditees.map((x) => [
              x.personName ?? x.externalName ?? "—",
              x.roleNote ?? "—", x.processName ?? "—",
            ]),
            "Sin auditados registrados."
          )),
          section("Reuniones celebradas", table(
            [
              { header: "Tipo", width: 2 },
              { header: "Día", width: 2 },
              { header: "Participantes", width: 4 },
              { header: "Notas", width: 4 },
            ],
            meetings.map((m) => [
              MEETING_KIND_LABEL[m.meetingKind], formatDate(m.heldOn),
              m.participants.join(", ") || "—", m.notes ?? "—",
            ]),
            "Todavía no se celebró ninguna."
          ), note(
            "En la reunión de cierre el equipo auditor PRESENTA los hallazgos. "
            + "Presentarlos no los convierte en no conformidades."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 5 · Checklist
// ---------------------------------------------------------------------------

export const qualityAuditChecklistDetail: ExportDefinition = {
  key: "quality.audit-checklist.detail",
  module: "quality",
  entity: "Checklist de auditoría",
  recordType: "Checklist de auditoría",
  documentName: "Checklist de auditoría",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const checklists = await listChecklists(req.organizationId);
    const checklist = checklists.find((c) => c.id === req.id);
    if (!checklist) return null;

    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Checklist de auditoría", title: checklist.name,
        code: checklist.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Checklist de auditoría",
        title: checklist.name,
        code: checklist.code,
        subtitle: `${checklist.versions.length} versión(es)`,
        badges: checklist.isActive
          ? [] : [{ text: "Retirado", tone: "warn" as const }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(CHECKLIST_IS_OPTIONAL), note(CRITERION_IS_NOT_A_QUESTION),
            note(CHECK_IS_NOT_A_FINDING)),
          section("El checklist", fields([
            requiredField("Nombre", checklist.name),
            field("Código", checklist.code),
            requiredField("Estado", checklist.isActive ? "Activo" : "Retirado"),
          ])),
          section("Descripción", paragraph(checklist.description)),
          ...checklist.versions.map((v) =>
            section(`Versión ${v.versionNumber} · ${CHECKLIST_VERSION_STATUS_LABEL[v.status]}`,
              fields([
                requiredField("Estado", CHECKLIST_VERSION_STATUS_LABEL[v.status]),
                requiredField("Vigente desde", formatDate(v.effectiveFrom)),
                field("Vigente hasta", v.effectiveTo ? formatDate(v.effectiveTo) : null),
                field("Qué cambió", v.changeNote),
              ]),
              table(
                [
                  { header: "#", width: 1 },
                  { header: "Pregunta", width: 6 },
                  { header: "Guía", width: 4 },
                  { header: "Clave estable", width: 3 },
                ],
                v.items.map((i) => [
                  String(i.order), i.prompt, i.guidance ?? "—", i.stableKey,
                ]),
                "La versión no tiene preguntas."
              ))
          ),
          section(null, note(
            "Una versión publicada no se edita nunca. Es lo único que permite volver "
            + "a una auditoría de hace dos años y leer las preguntas que se contestaron."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 6 · Registro de ejecución
// ---------------------------------------------------------------------------

export const qualityAuditExecutionDetail: ExportDefinition = {
  key: "quality.audit-execution.detail",
  module: "quality",
  entity: "Registro de ejecución de auditoría",
  recordType: "Registro de ejecución",
  documentName: "Registro de ejecución de auditoría",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El registro se imprime como está hoy. El documento congelado de la auditoría es "
    + "su informe, que sí guarda su propia instantánea.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const audit = await getAudit(req.organizationId, req.id);
    if (!audit) return null;

    const [detail, notes, samples, evidence, checkRun, meetings, org] = await Promise.all([
      getAuditDetail(req.organizationId, audit.id),
      listNotes(req.organizationId, audit.id),
      listSamples(req.organizationId, audit.id),
      listEvidence(req.organizationId, audit.id),
      listCheckResults(req.organizationId, audit.id),
      listMeetings(req.organizationId, audit.id),
      organizationIdentity(req.organizationId),
    ]);

    // §29 · Las notas restringidas ya vienen filtradas por la base según quién
    // pide. El papel no las recupera por su cuenta: un PDF no concede
    // privilegios que la sesión no tiene.
    const restrictedHidden = notes.some((n) => n.isRestricted);

    return {
      filenameParts: {
        recordType: "Registro de ejecución", title: audit.title,
        code: audit.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Registro de ejecución",
        title: audit.title,
        code: audit.code,
        subtitle: formatRange(audit.executedFrom, audit.executedTo),
        badges: auditBadges(audit),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_A_CERTIFICATE), note(EVIDENCE_IS_NOT_A_FINDING),
            currentStateNote(req.generatedAt)),
          section("La ejecución", fields([
            requiredField("Auditoría", `${audit.code} · ${audit.title}`),
            requiredField("Ejecutada", formatRange(audit.executedFrom, audit.executedTo)),
            requiredField("Estado", AUDIT_STATUS_LABEL[audit.status]),
            requiredField("Auditor líder", audit.leadAuditor ?? "Sin líder designado"),
          ])),
          section("Reuniones", table(
            [
              { header: "Tipo", width: 2 },
              { header: "Día", width: 2 },
              { header: "Participantes", width: 4 },
              { header: "Notas", width: 4 },
            ],
            meetings.map((m) => [
              MEETING_KIND_LABEL[m.meetingKind], formatDate(m.heldOn),
              m.participants.join(", ") || "—", m.notes ?? "—",
            ]),
            "Sin reuniones registradas."
          )),
          section("Muestras", table(
            [
              { header: "Muestra", width: 5 },
              { header: "Qué se revisó", width: 5 },
              { header: "Método", width: 3 },
            ],
            samples.map((s) => [s.description, describeSample(s), s.selectionMethod ?? "—"]),
            "No se registraron muestras."
          ), note(SAMPLE_IS_NOT_COVERAGE)),
          section("Evidencia", table(
            [
              { header: "Día", width: 2 },
              { header: "Tipo", width: 3 },
              { header: "Descripción", width: 5 },
              { header: "Referencia", width: 3 },
            ],
            evidence.map((e) => [
              formatDate(e.collectedOn), EVIDENCE_KIND_LABEL[e.evidenceKind],
              e.description,
              e.documentTitle
                ? `${e.documentTitle}${e.documentRevisionLabel ? ` · rev. ${e.documentRevisionLabel}` : ""}`
                : "—",
            ]),
            "No se registró evidencia."
          ), note(EVIDENCE_IS_REFERENCED)),
          ...(checkRun
            ? [section(`Checklist · ${checkRun.checklistName} versión ${checkRun.versionNumber}`,
                table(
                  [
                    { header: "#", width: 1 },
                    { header: "Pregunta", width: 6 },
                    { header: "Respuesta", width: 3 },
                    { header: "Nota", width: 3 },
                  ],
                  checkRun.results.map((r) => [
                    String(r.order), r.prompt, CHECK_OUTCOME_LABEL[r.outcome], r.note ?? "—",
                  ]),
                  "La versión no tiene preguntas."
                ), note(CHECK_IS_NOT_A_FINDING))]
            : [section("Checklist", paragraph(
                "No se usó ningún checklist. Eso no invalida la auditoría: el checklist "
                + "es una ayuda, no la auditoría.", true))]),
          section("Notas de trabajo", table(
            [
              { header: "Día", width: 2 },
              { header: "Tipo", width: 3 },
              { header: "Nota", width: 8 },
            ],
            notes.map((n) => [formatDate(n.recordedOn), NOTE_KIND_LABEL[n.noteKind], n.body]),
            "Sin notas de trabajo."
          ), note(NOTE_IS_NOT_EVIDENCE),
            restrictedHidden
              ? note("Algunas de estas notas están marcadas como restringidas al equipo "
                + "auditor. Este documento imprime SOLO lo que tu sesión puede leer.")
              : null),
          section("Conclusiones", paragraph(detail?.conclusions ?? null),
            note(CONCLUSIONS_ARE_HUMAN)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 7 · Hallazgos
// ---------------------------------------------------------------------------

export const qualityAuditFindingDetail: ExportDefinition = {
  key: "quality.audit-finding.detail",
  module: "quality",
  entity: "Hallazgo de auditoría",
  recordType: "Hallazgo de auditoría",
  documentName: "Hallazgo de auditoría",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El hallazgo se imprime con su evaluación de hoy. Lo que se dijo de él cuando se "
    + "emitió el informe está en el informe, que guarda su instantánea.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const all = await listFindings(req.organizationId);
    const finding = all.find((f) => f.id === req.id);
    if (!finding) return null;

    const [audit, evidence, criteria, org] = await Promise.all([
      getAudit(req.organizationId, finding.auditId),
      listEvidence(req.organizationId, finding.auditId),
      listCriteria(req.organizationId, finding.auditId),
      organizationIdentity(req.organizationId),
    ]);
    const linked = evidence.filter((e) => finding.evidenceIds.includes(e.id));
    const criterion = criteria.find((c) => c.id === finding.criterionId) ?? null;

    return {
      filenameParts: {
        recordType: "Hallazgo de auditoría", title: finding.statement.slice(0, 60),
        code: finding.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Hallazgo de auditoría",
        title: finding.statement.slice(0, 120),
        code: finding.code,
        subtitle: audit ? `${audit.code} · ${audit.title}` : null,
        badges: [
          { text: FINDING_CLASSIFICATION_LABEL[finding.proposedClassification], tone: "info" as const },
          ...(finding.evaluationStatus === "pending"
            ? [{ text: "Sin evaluar", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(FINDING_IS_NOT_NC), note(OBSERVATION_IS_NOT_NC),
            note(CONFORMITY_IS_LOCAL), currentStateNote(req.generatedAt)),
          section("El hallazgo", fields([
            requiredField("Código", finding.code),
            requiredField("Auditoría", audit ? `${audit.code} · ${audit.title}` : "—"),
            requiredField("Levantado el", formatDate(finding.raisedOn)),
            field("Proceso", finding.processName),
            field("Dónde", finding.locationText),
          ])),
          section("Qué se encontró", paragraph(finding.statement), paragraph(finding.detail)),
          section("Contra qué criterio", paragraph(
            criterion
              ? (criterion.requirementCode
                  ? `${criterion.requirementCode} · ${criterion.requirementTitle}`
                  : criterion.documentTitle ?? criterion.customText ?? "—")
              : "No se ató a un criterio concreto."
          )),
          section("Lo que PROPUSO el auditor", fields([
            requiredField("Clasificación propuesta",
              FINDING_CLASSIFICATION_LABEL[finding.proposedClassification]),
            requiredField("Gravedad propuesta",
              finding.proposedSeverity
                ? FINDING_SEVERITY_LABEL[finding.proposedSeverity] : "Sin gravedad"),
          ]), note(
            "Es una PROPUESTA del auditor, no una clasificación firme. Aunque diga "
            + "«posible no conformidad», ninguna no conformidad se creó al registrarla."
          )),
          section("Lo que se DECIDIÓ", fields([
            requiredField("Evaluación",
              FINDING_EVALUATION_STATUS_LABEL[finding.evaluationStatus]),
            field("Cuándo", finding.evaluatedAt ? formatDate(finding.evaluatedAt.slice(0, 10)) : null),
            field("Caso abierto", finding.caseCode),
            field("Clasificación formal del caso", finding.caseClassification),
          ]), paragraph(finding.evaluationNote), note(
            "La clasificación FORMAL —si el hecho es o no una no conformidad— vive en "
            + "el caso, no aquí. Este documento imprime la del caso cuando existe."
          )),
          section("Evidencia que lo sostiene", table(
            [
              { header: "Tipo", width: 3 },
              { header: "Descripción", width: 6 },
              { header: "Referencia", width: 3 },
            ],
            linked.map((e) => [
              EVIDENCE_KIND_LABEL[e.evidenceKind], e.description,
              e.documentTitle ?? "—",
            ]),
            "No se ató evidencia a este hallazgo."
          ), note(EVIDENCE_IS_NOT_A_FINDING)),
        ],
      },
    };
  },
};

export const qualityAuditFindingList: ExportDefinition = {
  key: "quality.audit-finding.list",
  module: "quality",
  entity: "Listado de hallazgos de auditoría",
  recordType: "Hallazgos de auditoría",
  documentName: "Listado de hallazgos de auditoría",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata la situación de hoy. Lo fechado es cada informe emitido, que "
    + "conserva los hallazgos tal como estaban al emitirlo.",
  filters: [
    {
      key: "status", label: "Evaluación", kind: "enum",
      values: ["pending", "evaluated", "dismissed", "escalated"],
    },
    { key: "auditId", label: "Auditoría", kind: "uuid" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [findings, audits, org] = await Promise.all([
      listFindings(req.organizationId, {
        status: req.filters.status, auditId: req.filters.auditId,
      }),
      listAudits(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const byId = new Map(audits.map((a) => [a.id, a]));

    return {
      filenameParts: {
        recordType: "Hallazgos de auditoría", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Hallazgos de auditoría",
        title: "Listado de hallazgos de auditoría",
        code: null,
        subtitle: `${findings.length} hallazgo(s)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(FINDING_IS_NOT_NC), note(OBSERVATION_IS_NOT_NC),
            currentStateNote(req.generatedAt)),
          section("Hallazgos", table(
            [
              { header: "Auditoría", width: 2 },
              { header: "Código", width: 2 },
              { header: "Enunciado", width: 6 },
              { header: "Proceso", width: 3 },
              { header: "Clasificación propuesta", width: 3 },
              { header: "Gravedad", width: 2 },
              { header: "Evaluación", width: 2 },
              { header: "Caso", width: 2 },
            ],
            findings.map((f) => [
              byId.get(f.auditId)?.code ?? "—",
              f.code, f.statement, f.processName ?? "—",
              FINDING_CLASSIFICATION_LABEL[f.proposedClassification],
              f.proposedSeverity ? FINDING_SEVERITY_LABEL[f.proposedSeverity] : "—",
              FINDING_EVALUATION_STATUS_LABEL[f.evaluationStatus],
              f.caseCode ?? "Sin caso",
            ]),
            "Todavía no hay hallazgos."
          )),
          section(null, note(
            "Este listado NO es un listado de no conformidades. La columna "
            + "«Clasificación propuesta» dice lo que propuso el auditor; la "
            + "clasificación formal, cuando existe, vive en el caso."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 8 · Informe de auditoría · DESDE LA INSTANTÁNEA
// ---------------------------------------------------------------------------

type Snap = Record<string, unknown>;
function arr(o: Snap, key: string): Snap[] {
  const v = o[key];
  return Array.isArray(v) ? (v as Snap[]) : [];
}
function obj(o: Snap, key: string): Snap {
  const v = o[key];
  return v !== null && typeof v === "object" ? (v as Snap) : {};
}
function str(o: Snap, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * §41 · El informe se imprime desde `snapshot`, no desde el estado de hoy.
 *
 * Si el equipo auditor cambia mañana, o el documento que sirvió de criterio
 * saca una revisión nueva, este papel sigue diciendo lo que decía: el equipo de
 * entonces y la revisión de entonces. Leer el estado actual y presentarlo bajo
 * el encabezado de un informe emitido en 2024 sería fabricar un pasado.
 */
export const qualityAuditReportDetail: ExportDefinition = {
  key: "quality.audit-report.detail",
  module: "quality",
  entity: "Informe de auditoría",
  recordType: "Informe de auditoría",
  documentName: "Informe de auditoría",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;

    // El informe se busca por su id; la auditoría sale de la instantánea, no
    // al revés. Es la instantánea la que manda en este documento.
    const audits = await listAudits(req.organizationId);
    let report: Awaited<ReturnType<typeof listReports>>[number] | null = null;
    let auditId: string | null = null;
    for (const a of audits) {
      const list = await listReports(req.organizationId, a.id);
      const found = list.find((r) => r.id === req.id);
      if (found) { report = found; auditId = a.id; break; }
    }
    if (!report || !auditId) return null;

    const [audit, org] = await Promise.all([
      getAudit(req.organizationId, auditId),
      organizationIdentity(req.organizationId),
    ]);

    const snap = report.snapshot as Snap;
    const sa = obj(snap, "audit");
    const followup = obj(snap, "followup");
    const openCases = Number(followup.open_cases ?? 0);
    const openActions = Number(followup.open_actions ?? 0);

    return {
      filenameParts: {
        recordType: "Informe de auditoría",
        title: str(sa, "title") ?? audit?.title ?? "Auditoría",
        code: str(sa, "code"), stamp: report.issuedOn,
      },
      document: {
        recordType: "Informe de auditoría",
        title: str(sa, "title") ?? "Auditoría",
        code: str(sa, "code"),
        subtitle: `Versión ${report.versionNumber} · emitido el ${formatDate(report.issuedOn)}`,
        badges: [
          { text: `Versión ${report.versionNumber}`, tone: "info" as const },
          ...(report.supersedesId
            ? [{ text: "Corrige una versión anterior", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_A_CERTIFICATE), note(
            "Este informe se imprime desde la FOTO tomada al emitirlo. Si el equipo "
            + "auditor cambió después, o el documento que sirvió de criterio sacó una "
            + "revisión nueva, este papel sigue diciendo lo que decía entonces."
          )),
          section("La auditoría", fields([
            requiredField("Código", str(sa, "code") ?? "—"),
            requiredField("Título", str(sa, "title") ?? "—"),
            requiredField("Tipo",
              AUDIT_TYPE_LABEL[(str(sa, "type") ?? "internal") as keyof typeof AUDIT_TYPE_LABEL]
              ?? "—"),
            requiredField("Naturaleza",
              AUDIT_NATURE_LABEL[(str(sa, "nature") ?? "planned") as keyof typeof AUDIT_NATURE_LABEL]
              ?? "—"),
            requiredField("Fecha original",
              formatRange(str(sa, "planned_from"), str(sa, "planned_to"))),
            requiredField("Fecha vigente al emitir",
              formatRange(str(sa, "scheduled_from"), str(sa, "scheduled_to"))),
            requiredField("Ejecutada",
              formatRange(str(sa, "executed_from"), str(sa, "executed_to"))),
            requiredField("Informe emitido el", formatDate(report.issuedOn)),
          ])),
          section("Objetivo", paragraph(str(sa, "objective"))),
          section("Equipo auditor de entonces", table(
            [
              { header: "Persona", width: 5 },
              { header: "Papel", width: 3 },
              { header: "Nota", width: 4 },
            ],
            arr(snap, "team").map((t) => [
              str(t, "person") ?? "—",
              TEAM_ROLE_LABEL[(str(t, "role") ?? "auditor") as keyof typeof TEAM_ROLE_LABEL]
                ?? str(t, "role") ?? "—",
              str(t, "note") ?? "—",
            ]),
            "Sin equipo registrado."
          )),
          section("Alcance auditado", table(
            [
              { header: "Qué", width: 3 },
              { header: "Referencia", width: 5 },
              { header: "Revisión", width: 2 },
              { header: "Nota", width: 3 },
            ],
            arr(snap, "scope").map((s) => [
              SCOPE_ITEM_KIND_LABEL[(str(s, "kind") ?? "other") as keyof typeof SCOPE_ITEM_KIND_LABEL]
                ?? str(s, "kind") ?? "—",
              str(s, "process") ?? str(s, "document") ?? "—",
              s.process_revision !== null && s.process_revision !== undefined
                ? `Revisión ${s.process_revision}` : "—",
              str(s, "note") ?? "—",
            ]),
            "El alcance no se registró."
          )),
          section("Criterios de entonces", table(
            [
              { header: "Tipo", width: 3 },
              { header: "Criterio", width: 6 },
              { header: "Revisión auditada", width: 3 },
            ],
            arr(snap, "criteria").map((c) => [
              CRITERION_KIND_LABEL[(str(c, "kind") ?? "other") as keyof typeof CRITERION_KIND_LABEL]
                ?? str(c, "kind") ?? "—",
              str(c, "requirement_code")
                ? `${str(c, "requirement_code")} · ${str(c, "requirement_title") ?? ""}`
                : str(c, "document") ?? str(c, "custom_text") ?? "—",
              str(c, "document_revision")
                ?? (c.document_revision_number ? `Revisión ${c.document_revision_number}` : "—"),
            ]),
            "No se registraron criterios."
          ), note(
            "La revisión que aparece aquí es la que se auditó. Si el documento cambió "
            + "después, el hallazgo sigue siendo cierto contra la revisión de entonces."
          )),
          section("Muestras", table(
            [
              { header: "Muestra", width: 6 },
              { header: "Revisado", width: 3 },
              { header: "Método", width: 3 },
            ],
            arr(snap, "samples").map((s) => [
              str(s, "description") ?? "—",
              s.population_size
                ? `${s.sample_size} de ${s.population_size}`
                : `${s.sample_size}`,
              str(s, "method") ?? "—",
            ]),
            "No se registraron muestras."
          ), note(SAMPLE_IS_NOT_COVERAGE)),
          section("Hallazgos", table(
            [
              { header: "Código", width: 2 },
              { header: "Enunciado", width: 6 },
              { header: "Proceso", width: 2 },
              { header: "Clasificación propuesta", width: 3 },
              { header: "Evaluación", width: 2 },
              { header: "Caso", width: 2 },
            ],
            arr(snap, "findings").map((f) => [
              str(f, "code") ?? "—", str(f, "statement") ?? "—",
              str(f, "process") ?? "—",
              FINDING_CLASSIFICATION_LABEL[
                (str(f, "proposed_classification") ?? "not_conclusive") as keyof typeof FINDING_CLASSIFICATION_LABEL]
                ?? "—",
              FINDING_EVALUATION_STATUS_LABEL[
                (str(f, "evaluation_status") ?? "pending") as keyof typeof FINDING_EVALUATION_STATUS_LABEL]
                ?? "—",
              str(f, "case_code") ?? "Sin caso",
            ]),
            "No se levantaron hallazgos."
          ), note(FINDING_IS_NOT_NC)),
          section("Conclusiones", paragraph(str(sa, "conclusions")),
            note(CONCLUSIONS_ARE_HUMAN)),
          section("Resumen del informe", paragraph(report.summary)),
          section("Qué quedaba abierto al emitirlo", fields([
            requiredField("Casos abiertos", String(openCases)),
            requiredField("Acciones abiertas", String(openActions)),
            requiredField("Hallazgos sin evaluar", String(followup.findings_pending ?? 0)),
          ]), note(CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS)),
          ...(report.supersedesId
            ? [section("Corrección", paragraph(
                "Este informe corrige a una versión anterior, que NO se borró: las dos "
                + "se conservan, y quien recibió la primera puede comprobar qué cambió.",
                true))]
            : []),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 9 · Seguimiento
// ---------------------------------------------------------------------------

export const qualityAuditFollowupList: ExportDefinition = {
  key: "quality.audit-followup.list",
  module: "quality",
  entity: "Seguimiento de auditorías",
  recordType: "Seguimiento de auditorías",
  documentName: "Reporte de seguimiento de auditorías",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El seguimiento es, por definición, la situación de hoy: qué sigue abierto ahora. "
    + "Lo que quedaba abierto en un momento dado se lee en el informe de esa fecha.",
  async load(req): Promise<ExportResult | null> {
    const [audits, org] = await Promise.all([
      listAudits(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const relevant = audits.filter(
      (a) => a.status === "reported" || a.status === "closed" || a.findingCount > 0
    );

    return {
      filenameParts: {
        recordType: "Seguimiento de auditorías", title: "Reporte",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Seguimiento de auditorías",
        title: "Reporte de seguimiento de auditorías",
        code: null,
        subtitle: `${relevant.length} auditoría(s) con seguimiento`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS), note(NOT_A_CERTIFICATE),
            currentStateNote(req.generatedAt)),
          section("Qué quedó abierto", table(
            [
              { header: "Código", width: 2 },
              { header: "Auditoría", width: 4 },
              { header: "Estado", width: 2 },
              { header: "Cerrada el", width: 2 },
              { header: "Hallazgos", width: 2 },
              { header: "Sin evaluar", width: 2 },
              { header: "Escalados", width: 2 },
              { header: "Situación", width: 5 },
            ],
            relevant.map((a) => [
              a.code, a.title, AUDIT_STATUS_LABEL[a.status],
              a.closedAt ? formatDate(a.closedAt.slice(0, 10)) : "—",
              String(a.findingCount), String(a.findingsPending),
              String(a.findingsEscalated),
              describeFollowUp({ openCases: a.openCases, openActions: a.openActions }),
            ]),
            "Ninguna auditoría tiene seguimiento pendiente."
          )),
          section(null, note(
            "Una auditoría cerrada con acciones abiertas es una situación NORMAL, no "
            + "un error. Exigir que todas las acciones estén cerradas para poder cerrar "
            + "la auditoría produce auditorías abiertas durante años por una acción de "
            + "nadie."
          )),
        ],
      },
    };
  },
};
