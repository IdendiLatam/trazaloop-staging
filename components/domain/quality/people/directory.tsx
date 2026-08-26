"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ASSIGNMENT_TYPE_LABEL, formatDate, PERSON_RELATIONSHIP_LABEL, PERSON_RELATIONSHIPS,
  PERSON_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { AssignmentRow, PersonRow } from "@/lib/db/quality-people";
import { createPersonAction } from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Directorio de personas.
 *
 * La pantalla insiste en una cosa desde el primer formulario: vincular una
 * cuenta de Trazaloop es OPCIONAL. La mayoría de una planta no entra nunca a
 * la plataforma, y hasta 0122 esa gente sencillamente no podía ser titular de
 * nada ni tener competencia registrada.
 */
export function PeopleDirectory({
  people, assignments, members, canManage, today,
}: {
  people: PersonRow[];
  assignments: AssignmentRow[];
  members: { profileId: string; name: string; email: string | null }[];
  canManage: boolean;
  today: string;
}) {
  const currentByPerson = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    if (!a.personId) continue;
    if (a.effectiveFrom > today) continue;
    if (a.effectiveTo !== null && a.effectiveTo < today) continue;
    const list = currentByPerson.get(a.personId) ?? [];
    list.push(a);
    currentByPerson.set(a.personId, list);
  }

  return (
    <div className="space-y-6">
      <DomainNote>
        Una <strong>persona</strong> no es un <strong>usuario</strong> ni un{" "}
        <strong>cargo</strong>. El cargo es la responsabilidad estable, la persona es
        quien lo ocupa entre fechas, y el usuario es una cuenta con contraseña. Una
        persona puede existir sin cuenta, y un cargo puede existir sin nadie que lo ocupe.
      </DomainNote>

      <Card
        title="Personas"
        description={`${people.length} registrada(s)`}
        action={<ExportPdfButton exportKey="quality.person.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Persona", "Código", "Vínculo", "Cargo(s) vigente(s)", "Estado", ""]}
          empty="Todavía no hay personas registradas."
          rows={people.map((p) => [
            <Link key="n" href={`/quality/people/${p.id}`} className="font-medium text-loop hover:underline">
              {p.fullName}
            </Link>,
            p.employeeCode ?? "—",
            PERSON_RELATIONSHIP_LABEL[p.relationship],
            (currentByPerson.get(p.id) ?? [])
              .map((a) => `${a.positionName} (${ASSIGNMENT_TYPE_LABEL[a.assignmentType]})`)
              .join(", ") || "—",
            <span key="s">
              {PERSON_STATUS_LABEL[p.status]}
              {p.leftOn ? ` · ${formatDate(p.leftOn)}` : ""}
            </span>,
            <span key="x" className="flex gap-2">
              <ExportPdfButton exportKey="quality.person.detail" id={p.id} label="Descargar PDF" />
              <ExportPdfButton
                exportKey="quality.person-competence.detail" id={p.id}
                label="Descargar PDF"
              />
            </span>,
          ])}
        />
      </Card>

      {canManage ? (
        <Card
          title="Registrar una persona"
          description="Solo lo que el sistema de gestión necesita."
        >
          <DomainNote>
            Aquí no se guardan salario, cuentas bancarias, información médica, religión,
            orientación sexual, información familiar ni historial disciplinario. No están
            pendientes: no pertenecen a un sistema de gestión de la calidad.
          </DomainNote>
          <ActionForm action={createPersonAction} submitLabel="Registrar persona">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre completo">
                <input name="full_name" required className={inputClass} />
              </Field>
              <Field label="Código interno" hint="Solo si tu empresa lo usa.">
                <input name="employee_code" className={inputClass} />
              </Field>
              <Field label="Correo laboral">
                <input name="work_email" type="email" className={inputClass} />
              </Field>
              <Field label="Vínculo">
                <select name="relationship" className={inputClass} defaultValue="employee">
                  {PERSON_RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>{PERSON_RELATIONSHIP_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha de vinculación">
                <input name="joined_on" type="date" className={inputClass} />
              </Field>
              <Field
                label="Cuenta de Trazaloop"
                hint="Opcional. Una persona sin cuenta es una persona igual."
              >
                <select name="profile_id" className={inputClass} defaultValue="">
                  <option value="">Sin cuenta</option>
                  {members.map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {m.name}{m.email ? ` · ${m.email}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notas">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
