"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  formatDate, REQUIREMENT_ENFORCEMENT_HINT, REQUIREMENT_ENFORCEMENT_LABEL,
  REQUIREMENT_ENFORCEMENTS, REQUIREMENT_KIND_LABEL, REQUIREMENT_KINDS,
} from "@/lib/domain/quality-suppliers";
import type {
  RequirementAssignmentRow, ScopeOption, SupplierCategoryRow, SupplierRequirementRow,
} from "@/lib/db/quality-suppliers";
import {
  assignRequirementAction, createCategoryAction, createRequirementAction,
  endRequirementAssignmentAction,
} from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Categorías y requisitos.
 *
 * Las dos cosas viven en la misma pantalla porque en la práctica son la misma
 * conversación: se decide qué familias de suministro existen y qué se le exige
 * a cada una. Separarlas en dos menús obligaría a ir y volver para responder
 * una sola pregunta.
 */
export function SupplierCatalog({
  categories, requirements, assignments, scopes, canManage, today,
}: {
  categories: SupplierCategoryRow[];
  requirements: SupplierRequirementRow[];
  assignments: RequirementAssignmentRow[];
  scopes: ScopeOption[];
  canManage: boolean;
  today: string;
}) {
  return (
    <div className="space-y-6">
      <Card
        title="Categorías"
        description="Familias de suministro. La categoría clasifica QUÉ se compra; no dice cuánto importa ni si está aprobado."
        action={<ExportPdfButton exportKey="quality.supplier-category.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Categoría", "Código", "Descripción", "Activa"]}
          empty="Todavía no hay categorías."
          rows={categories.map((c) => [
            c.name, c.code ?? "—", c.description ?? "—", c.isActive ? "Sí" : "No",
          ])}
        />
        <DomainNote>
          Una categoría no es una criticidad. «Materia prima» agrupa; que dependas mucho
          o poco de quien te la vende se clasifica aparte, proveedor por proveedor.
        </DomainNote>
        {canManage ? (
          <ActionForm action={createCategoryAction} submitLabel="Crear categoría">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Código"><input name="code" className={inputClass} /></Field>
              <Field label="Descripción"><input name="description" className={inputClass} /></Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Requisitos"
        description="Lo que se le exige a un proveedor por pertenecer a una categoría o por un alcance concreto."
        action={<ExportPdfButton exportKey="quality.supplier-requirement.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Requisito", "Tipo", "Exigencia", "Qué significa"]}
          empty="Todavía no hay requisitos definidos."
          rows={requirements.map((r) => [
            r.code ? `${r.code} · ${r.title}` : r.title,
            REQUIREMENT_KIND_LABEL[r.kind],
            REQUIREMENT_ENFORCEMENT_LABEL[r.enforcement],
            REQUIREMENT_ENFORCEMENT_HINT[r.enforcement],
          ])}
        />
        <DomainNote>
          Un requisito describe una exigencia; no la ejecuta. Ni siquiera un requisito
          <strong> bloqueante</strong> suspende a nadie por su cuenta: lo que hace es
          impedir que la aprobación se decida sin mirarlo.
        </DomainNote>
        {canManage ? (
          <ActionForm action={createRequirementAction} submitLabel="Crear requisito">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Requisito"><input name="title" required className={inputClass} /></Field>
              <Field label="Código"><input name="code" className={inputClass} /></Field>
              <Field label="Tipo">
                <select name="requirement_kind" className={inputClass} defaultValue="documentary">
                  {REQUIREMENT_KINDS.map((k) => (
                    <option key={k} value={k}>{REQUIREMENT_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Exigencia">
                <select name="enforcement" className={inputClass} defaultValue="required">
                  {REQUIREMENT_ENFORCEMENTS.map((e) => (
                    <option key={e} value={e}>{REQUIREMENT_ENFORCEMENT_LABEL[e]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descripción">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="A quién se le aplica">
        <Table
          headers={["Requisito", "Se aplica a", "Desde", "Hasta", ""]}
          empty="Ningún requisito está asignado todavía."
          rows={assignments.map((a) => [
            a.requirementTitle,
            a.categoryName
              ? `Categoría · ${a.categoryName}`
              : `Alcance · ${a.scopeLabel ?? "—"}`,
            formatDate(a.effectiveFrom),
            a.effectiveTo ? formatDate(a.effectiveTo) : "Vigente",
            canManage && !a.effectiveTo ? (
              <ActionForm
                key="e" action={endRequirementAssignmentAction} submitLabel="Retirar"
                className="flex items-end gap-2"
              >
                <input type="hidden" name="assignment_id" value={a.id} />
                <input type="hidden" name="effective_to" value={today} />
              </ActionForm>
            ) : "",
          ])}
        />
        <DomainNote>
          Retirar un requisito lo retira <strong>desde hoy</strong>. Lo evaluado antes se
          sigue leyendo contra lo que se exigía entonces: cambiar la regla no cambia el
          pasado.
        </DomainNote>
        {canManage && requirements.length > 0 ? (
          <ActionForm action={assignRequirementAction} submitLabel="Asignar requisito">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Requisito">
                <select name="requirement_id" required className={inputClass}>
                  {requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </Field>
              <Field label="Desde">
                <input name="effective_from" type="date" defaultValue={today} className={inputClass} />
              </Field>
              <Field label="A una categoría" hint="Elige categoría O alcance, no las dos.">
                <select name="category_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="O a un alcance concreto">
                <select name="scope_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {scopes.map((s) => <option key={s.scopeId} value={s.scopeId}>{s.label}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>
    </div>
  );
}
