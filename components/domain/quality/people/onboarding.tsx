"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  CHECKLIST_MARK, describePending, KNOWLEDGE_ONBOARDING_LABEL, NO_READ_TRACKING_NOTICE,
  ONBOARDING_SOURCE_LABEL,
} from "@/lib/domain/quality-onboarding";
import {
  ASSIGNMENT_TYPE_LABEL, COMPETENCE_METHOD_LABEL, CRITICALITY_LABEL, formatDate,
  PERSON_RELATIONSHIP_LABEL, POSITION_FUNCTION_KIND_LABEL, POSITION_VERSION_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { OnboardingView } from "@/lib/db/quality-onboarding";
import { createNeedAction } from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06.1 · Onboarding del sistema de gestión.
 *
 * Todo lo que se ve aquí está DERIVADO de lo que QUALITY-06 ya guarda. No hay
 * tabla de onboarding, ni checklist almacenado, ni estado agregado inventado.
 *
 * Y hay una cosa que esta pantalla se niega a hacer: marcar documentos como
 * «leídos». Trazaloop no registra confirmación de lectura, así que una casilla
 * así sería una afirmación que el sistema no puede sostener — y un checklist
 * con casillas falsas se firma, se archiva y deja de servir.
 */
export function OnboardingView({
  view, canManage,
}: { view: OnboardingView; canManage: boolean }) {
  const { person, assignment, position, profile } = view;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/quality/people/${person.id}`}
          className="text-xs font-medium text-loop hover:underline"
        >
          ← {person.fullName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Onboarding de {person.fullName} para {position.name}
        </h1>
        <p className="text-sm text-ink-soft">
          {ASSIGNMENT_TYPE_LABEL[assignment.assignmentType]} desde el{" "}
          {formatDate(assignment.effectiveFrom)}
          {assignment.effectiveTo ? ` hasta el ${formatDate(assignment.effectiveTo)}` : ""} ·{" "}
          {PERSON_RELATIONSHIP_LABEL[person.relationship]} ·{" "}
          {person.hasAccount ? "con cuenta de Trazaloop" : "sin cuenta de Trazaloop"}
        </p>
        <ExportPdfButton
          exportKey="quality.onboarding.detail" id={assignment.id} label="Descargar PDF"
        />
      </header>

      <DomainNote>
        Esta pantalla no guarda nada: se construye con la asignación, el perfil del cargo
        que regía en su fecha, los procesos y documentos relacionados, los requisitos de
        competencia y lo que la persona había demostrado. Cambiar cualquiera de esos datos
        cambia lo que aquí se lee.
      </DomainNote>

      <Card title="Pendientes del sistema de gestión" description={describePending(view.pending)}>
        <ul className="space-y-1">
          {view.checklist.map((l, i) => (
            <li key={i} className="text-xs text-ink">
              <span className="mr-2 font-mono font-semibold">{CHECKLIST_MARK[l.state]}</span>
              {l.text}
              <span className="ml-2 text-ink-soft">· {l.origin}</span>
              {l.detail ? <span className="block pl-6 text-ink-soft">{l.detail}</span> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Perfil aplicable"
        description={
          profile
            ? `Versión ${profile.versionNumber} · ${POSITION_VERSION_STATUS_LABEL[profile.status]}`
            : "El cargo no tiene un perfil publicado"
        }
      >
        {profile ? (
          <>
            <p className="text-xs text-ink-soft">
              Vigente {profile.effectiveFrom ? `desde el ${formatDate(profile.effectiveFrom)}` : ""}
              {profile.effectiveTo ? ` hasta el ${formatDate(profile.effectiveTo)}` : ""}. Es el
              perfil que regía cuando esta persona asumió el cargo.
            </p>
            {profile.purpose ? <p className="text-xs text-ink">{profile.purpose}</p> : null}
            <Table
              headers={["Tipo", "Responsabilidad o autoridad", "Proceso"]}
              empty="Esta versión del perfil no detalla funciones."
              rows={view.functions.map((f) => [
                POSITION_FUNCTION_KIND_LABEL[f.kind], f.description, f.processName ?? "—",
              ])}
            />
            {view.currentProfile ? (
              <DomainNote>
                Hoy rige la <strong>versión {view.currentProfile.versionNumber}</strong> de este
                perfil. Lo que ves arriba es lo que se le pidió a esta persona al asumir el
                cargo, y no se reescribe: la expectativa vigente aparece aparte, en la tabla
                de competencias.
              </DomainNote>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-ink-soft">
            Sin perfil publicado no se puede decir qué se le exige a quien ocupa este cargo.
            Publícalo desde la ficha del cargo.
          </p>
        )}
      </Card>

      <Card title="Procesos relacionados">
        <Table
          headers={["Proceso", "Código", "Por qué aparece"]}
          empty="El cargo no es propietario de ningún proceso y su perfil no nombra ninguno."
          rows={view.processes.map((p) => [
            p.name, p.code ?? "—", ONBOARDING_SOURCE_LABEL[p.source],
          ])}
        />
      </Card>

      <Card title="Documentos que debe conocer">
        <Table
          headers={["Documento", "Código", "Por qué aparece", "Estado"]}
          empty="No hay documentos relacionados con el cargo ni con sus procesos."
          rows={view.documents.map((d) => [
            d.title, d.code ?? "—",
            d.via ? `${ONBOARDING_SOURCE_LABEL[d.source]} · ${d.via}` : ONBOARDING_SOURCE_LABEL[d.source],
            d.status,
          ])}
        />
        <DomainNote>{NO_READ_TRACKING_NOTICE}</DomainNote>
      </Card>

      <Card title="Competencias">
        <Table
          headers={["Competencia", "Requerido", "Demostrado", "Brecha", "Cómo se demostró", "Hoy se exige"]}
          empty="El perfil aplicable no exige competencias."
          rows={view.competencies.map((c) => [
            c.isMandatory ? c.name : `${c.name} (deseable)`,
            String(c.requiredLevel),
            c.demonstratedLevel === null ? "Sin evaluar" : String(c.demonstratedLevel),
            c.gap === 0 ? "Sin brecha" : String(c.gap),
            c.method ? `${COMPETENCE_METHOD_LABEL[c.method]} · ${formatDate(c.demonstratedOn)}` : "—",
            c.currentRequiredLevel === null ? "—" : String(c.currentRequiredLevel),
          ])}
        />
        <DomainNote>
          Una brecha es la diferencia entre lo que el perfil exigía y lo que la persona
          había demostrado en esa fecha. No declara incompetente a nadie, y no obliga a un
          curso: hay ocho formas más de cerrarla.
        </DomainNote>
      </Card>

      <Card title="Desarrollo">
        <Table
          headers={["Qué", "Tipo", "Estado", "Fecha objetivo"]}
          empty="No hay desarrollo abierto para esta persona ni para este cargo."
          rows={view.development.map((d) => [
            d.title,
            d.kind === "need" ? "Necesidad" : `Item del plan · ${d.developmentKind ?? "—"}`,
            d.status, d.targetDate ? formatDate(d.targetDate) : "—",
          ])}
        />
        {canManage && view.competencies.some((c) => c.gap > 0) ? (
          <>
            <DomainNote>
              Hay brechas sin desarrollo asociado. Crear la necesidad es una decisión humana:
              esta pantalla no la crea sola, y el tipo lo eliges tú.
            </DomainNote>
            <ActionForm action={createNeedAction} submitLabel="Crear necesidad de desarrollo">
              <input type="hidden" name="person_id" value={person.id} />
              <input type="hidden" name="position_id" value={position.id} />
              <input type="hidden" name="origin_kind" value="competency_gap" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Necesidad">
                  <input
                    name="title" required className={inputClass}
                    defaultValue={`Cerrar brecha de ${view.competencies.find((c) => c.gap > 0)?.name ?? ""}`}
                  />
                </Field>
                <Field label="Competencia">
                  <select name="competency_id" className={inputClass} defaultValue="">
                    <option value="">Ninguna en concreto</option>
                    {view.competencies.filter((c) => c.gap > 0).map((c) => (
                      <option key={c.competencyId} value={c.competencyId}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Por qué" hint="Se guarda con la necesidad.">
                <input name="origin_note" className={inputClass} />
              </Field>
            </ActionForm>
          </>
        ) : null}
      </Card>

      <Card title="Conocimiento relevante">
        <Table
          headers={["Conocimiento", "Proceso", "Criticidad", "Situación"]}
          empty="No hay conocimiento registrado en los procesos de este cargo."
          rows={view.knowledge.map((k) => [
            k.title, k.processName ?? "—", CRITICALITY_LABEL[k.criticality],
            k.transferTitle
              ? `${KNOWLEDGE_ONBOARDING_LABEL[k.state]} · ${k.transferTitle}`
              : KNOWLEDGE_ONBOARDING_LABEL[k.state],
          ])}
        />
        <DomainNote>
          «Debería recibirlo» describe una necesidad de la empresa, no un defecto de la
          persona: el conocimiento pertenece a la organización y alguien tiene que
          sostenerlo.
        </DomainNote>
      </Card>

      <Card title="Tareas abiertas">
        <Table
          headers={["Tarea", "A nombre de", "Vence"]}
          empty="Sin tareas abiertas del cargo ni de la persona."
          rows={view.tasks.map((t) => [
            t.title, t.assignedTo === "position" ? "El cargo" : "La persona",
            t.dueAt ? formatDate(t.dueAt) : "—",
          ])}
        />
        <DomainNote>
          Son las tareas que ya existen en «Mis tareas». Esta pantalla no crea una tarea por
          cada línea que muestra.
        </DomainNote>
      </Card>
    </div>
  );
}
