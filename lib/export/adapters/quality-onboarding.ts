import "server-only";

import { getOnboarding } from "@/lib/db/quality-onboarding";
import {
  CHECKLIST_MARK, describePending, KNOWLEDGE_ONBOARDING_LABEL, NO_READ_TRACKING_NOTICE,
  ONBOARDING_SOURCE_LABEL,
} from "@/lib/domain/quality-onboarding";
import {
  ASSIGNMENT_TYPE_LABEL, COMPETENCE_METHOD_LABEL, CRITICALITY_LABEL, formatDate,
  PERSON_RELATIONSHIP_LABEL, POSITION_FUNCTION_KIND_LABEL, POSITION_VERSION_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { field, fields, note, paragraph, requiredField, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-06.1 · El PDF del onboarding.
 *
 * Es un documento derivado: no existe ninguna tabla de onboarding, así que este
 * papel es una fotografía de lo que el sistema sabía en el momento de
 * generarlo. Lo dice, porque un documento que no dice de cuándo es acaba
 * archivado como si fuera permanente.
 *
 * Y no lleva ninguna casilla de «documento leído». Trazaloop no registra
 * confirmación de lectura; una casilla así en un papel firmado sería una
 * afirmación falsa con formato de prueba.
 */

const SYSTEM = "Trazaloop Quality · personas y competencia";
const FOOTER =
  "Este PDF es una representación de lo registrado en Trazaloop en el momento indicado. "
  + "La fuente sigue siendo el sistema.";
const PRIVACY_NOTE =
  "Contiene información de personas. Compártelo solo con quien tenga que verlo: "
  + "un PDF no lleva consigo los permisos que lo produjeron.";

export const qualityOnboardingDetail: ExportDefinition = {
  key: "quality.onboarding.detail",
  module: "quality",
  entity: "Onboarding",
  recordType: "Onboarding",
  documentName: "Onboarding del sistema de gestión",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El onboarding se compone en el momento de la descarga a partir de la asignación, del "
    + "perfil que regía en su fecha y del estado actual del desarrollo, del conocimiento y "
    + "de las tareas. Las tres últimas fuentes no conservan versión por fecha, así que el "
    + "documento retrata cómo está hoy lo que quedaba pendiente.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    // El identificador es el de la ASIGNACIÓN: un onboarding es de una persona
    // EN un cargo y entre unas fechas, no de una persona a secas.
    const v = await getOnboarding(req.organizationId, req.id);
    if (!v) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Onboarding", title: `${v.person.fullName} · ${v.position.name}`,
        code: v.person.employeeCode, stamp: v.assignment.effectiveFrom,
      },
      document: {
        recordType: "Onboarding",
        title: `${v.person.fullName} · ${v.position.name}`,
        code: v.position.code,
        subtitle: `${ASSIGNMENT_TYPE_LABEL[v.assignment.assignmentType]} desde el `
          + formatDate(v.assignment.effectiveFrom),
        badges: [
          { text: PERSON_RELATIONSHIP_LABEL[v.person.relationship], tone: "info" },
          {
            text: v.person.hasAccount ? "Con cuenta de Trazaloop" : "Sin cuenta de Trazaloop",
            tone: "neutral",
          },
          ...(v.position.isCritical ? [{ text: "Cargo crítico", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE), note(
            "Este documento se construye con lo que el sistema de gestión ya registra: la "
            + "asignación, el perfil del cargo vigente en su fecha, los procesos y documentos "
            + "relacionados, los requisitos de competencia y lo que la persona había "
            + "demostrado. No hay ningún dato propio del onboarding."
          )),
          section("Quién y a qué cargo", fields([
            requiredField("Persona", v.person.fullName),
            field("Código interno", v.person.employeeCode),
            requiredField("Cargo", v.position.name),
            requiredField("Vínculo", ASSIGNMENT_TYPE_LABEL[v.assignment.assignmentType]),
            requiredField("Fecha efectiva", formatDate(v.assignment.effectiveFrom)),
            field("Hasta", v.assignment.effectiveTo ? formatDate(v.assignment.effectiveTo) : null),
          ])),
          section("Perfil aplicable", v.profile
            ? fields([
                requiredField("Versión", String(v.profile.versionNumber)),
                requiredField("Estado", POSITION_VERSION_STATUS_LABEL[v.profile.status]),
                requiredField("Vigencia",
                  v.profile.effectiveFrom
                    ? `${formatDate(v.profile.effectiveFrom)} → ${v.profile.effectiveTo ? formatDate(v.profile.effectiveTo) : "vigente"}`
                    : "—"),
                field("Formación requerida", v.profile.education),
                field("Experiencia requerida", v.profile.experience),
              ])
            : paragraph("El cargo no tiene un perfil publicado.", true),
            v.profile ? paragraph(v.profile.purpose) : null,
            v.currentProfile
              ? note(
                  `Hoy rige la versión ${v.currentProfile.versionNumber} de este perfil. Lo `
                  + "que este documento imprime es lo que se le pidió a esta persona al asumir "
                  + "el cargo; la expectativa vigente aparece en la columna «Hoy se exige»."
                )
              : null,
          ),
          section("Responsabilidades del perfil", table(
            [
              { header: "Tipo", width: 2 },
              { header: "Responsabilidad o autoridad", width: 6 },
              { header: "Proceso", width: 3 },
            ],
            v.functions.map((f) => [
              POSITION_FUNCTION_KIND_LABEL[f.kind], f.description, f.processName ?? "—",
            ]),
            "Esta versión del perfil no detalla funciones."
          )),
          section("Procesos relacionados", table(
            [
              { header: "Proceso", width: 5 },
              { header: "Código", width: 2 },
              { header: "Por qué aparece", width: 4 },
            ],
            v.processes.map((p) => [p.name, p.code ?? "—", ONBOARDING_SOURCE_LABEL[p.source]]),
            "El cargo no es propietario de ningún proceso y su perfil no nombra ninguno."
          )),
          section("Documentos que debe conocer", table(
            [
              { header: "Documento", width: 5 },
              { header: "Código", width: 2 },
              { header: "Por qué aparece", width: 4 },
            ],
            v.documents.map((d) => [
              d.title, d.code ?? "—",
              d.via ? `${ONBOARDING_SOURCE_LABEL[d.source]} · ${d.via}` : ONBOARDING_SOURCE_LABEL[d.source],
            ]),
            "No hay documentos relacionados con el cargo ni con sus procesos."
          ), note(NO_READ_TRACKING_NOTICE)),
          section("Competencias", table(
            [
              { header: "Competencia", width: 4 },
              { header: "Requerido", width: 1, align: "right" },
              { header: "Demostrado", width: 1, align: "right" },
              { header: "Brecha", width: 1, align: "right" },
              { header: "Cómo se demostró", width: 3 },
              { header: "Hoy se exige", width: 1, align: "right" },
            ],
            v.competencies.map((c) => [
              c.isMandatory ? c.name : `${c.name} (deseable)`,
              String(c.requiredLevel),
              c.demonstratedLevel === null ? "Sin evaluar" : String(c.demonstratedLevel),
              c.gap === 0 ? "Sin brecha" : String(c.gap),
              c.method
                ? `${COMPETENCE_METHOD_LABEL[c.method]} · ${formatDate(c.demonstratedOn)}`
                : "—",
              c.currentRequiredLevel === null ? "—" : String(c.currentRequiredLevel),
            ]),
            "El perfil aplicable no exige competencias."
          ), note(
            "Una brecha es la diferencia entre lo que el perfil exigía y lo que la persona "
            + "había demostrado en esa fecha. No declara incompetente a nadie y no obliga a "
            + "un curso."
          )),
          section("Desarrollo", table(
            [
              { header: "Qué", width: 5 },
              { header: "Tipo", width: 3 },
              { header: "Estado", width: 2 },
              { header: "Fecha objetivo", width: 2 },
            ],
            v.development.map((d) => [
              d.title,
              d.kind === "need" ? "Necesidad" : `Item del plan · ${d.developmentKind ?? "—"}`,
              d.status, d.targetDate ? formatDate(d.targetDate) : "—",
            ]),
            "No hay desarrollo abierto para esta persona ni para este cargo."
          )),
          section("Conocimiento relevante", table(
            [
              { header: "Conocimiento", width: 4 },
              { header: "Proceso", width: 3 },
              { header: "Criticidad", width: 2 },
              { header: "Situación", width: 3 },
            ],
            v.knowledge.map((k) => [
              k.title, k.processName ?? "—", CRITICALITY_LABEL[k.criticality],
              k.transferTitle
                ? `${KNOWLEDGE_ONBOARDING_LABEL[k.state]} · ${k.transferTitle}`
                : KNOWLEDGE_ONBOARDING_LABEL[k.state],
            ]),
            "No hay conocimiento registrado en los procesos de este cargo."
          )),
          section("Tareas abiertas", table(
            [
              { header: "Tarea", width: 6 },
              { header: "A nombre de", width: 3 },
              { header: "Vence", width: 2 },
            ],
            v.tasks.map((t) => [
              t.title, t.assignedTo === "position" ? "El cargo" : "La persona",
              t.dueAt ? formatDate(t.dueAt) : "—",
            ]),
            "Sin tareas abiertas del cargo ni de la persona."
          )),
          section("Pendientes del sistema de gestión",
            paragraph(describePending(v.pending)),
            table(
              [
                { header: "", width: 1 },
                { header: "Qué", width: 6 },
                { header: "De dónde sale", width: 4 },
              ],
              v.checklist.map((l) => [
                CHECKLIST_MARK[l.state], l.text, l.origin,
              ]),
              "—"
            ),
            note(
              "No se declara el onboarding «completo» ni «incompleto»: no existe una regla "
              + "formal de completitud, y afirmarla sería inventarla. Se enumera lo que queda "
              + "y de dónde sale cada línea."
            )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};
