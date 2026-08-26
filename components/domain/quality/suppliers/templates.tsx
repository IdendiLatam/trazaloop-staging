"use client";

import {
  CRITERION_METHOD_LABEL, CRITERION_METHODS, formatDate, SCORING_RULE_LABEL, SCORING_RULES,
} from "@/lib/domain/quality-suppliers";
import type { SupplierRequirementRow, SupplierTemplateRow } from "@/lib/db/quality-suppliers";
import {
  addCriterionAction, createTemplateAction, createTemplateVersionAction,
  publishTemplateVersionAction,
} from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Plantillas de evaluación.
 *
 * Una plantilla se VERSIONA en lugar de editarse. La razón no es técnica: si se
 * cambia el peso de un criterio, todas las evaluaciones anteriores empezarían a
 * significar otra cosa sin que nadie las haya tocado, y la comparación entre
 * años dejaría de tener sentido.
 */
export function SupplierTemplates({
  templates, requirements, canManage, today,
}: {
  templates: SupplierTemplateRow[];
  requirements: SupplierRequirementRow[];
  canManage: boolean;
  today: string;
}) {
  return (
    <div className="space-y-6">
      <DomainNote>
        Publicar una versión nueva no reescribe las evaluaciones hechas con la anterior:
        cada una se sigue leyendo con los criterios y los pesos que tenía el día que se
        hizo.
      </DomainNote>

      {canManage ? (
        <Card title="Nueva plantilla" description="Nace con su primera versión en borrador.">
          <ActionForm action={createTemplateAction} submitLabel="Crear plantilla">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Código"><input name="code" className={inputClass} /></Field>
              <Field label="Forma de puntuar">
                <select name="scoring_rule" className={inputClass} defaultValue="weighted_average">
                  {SCORING_RULES.map((r) => (
                    <option key={r} value={r}>{SCORING_RULE_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descripción">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {templates.length === 0 ? (
        <p className="text-sm text-ink-soft">Todavía no hay plantillas de evaluación.</p>
      ) : null}

      {templates.map((t) => (
        <Card
          key={t.id}
          title={t.code ? `${t.code} · ${t.name}` : t.name}
          description={t.description ?? undefined}
        >
          {t.versions.map((v) => (
            <div key={v.id} className="space-y-2 rounded-md border border-hairline p-3">
              <p className="text-xs font-medium text-ink">
                Versión {v.versionNumber} · {v.status === "published" ? "Publicada"
                  : v.status === "draft" ? "Borrador" : "Sustituida"}
                {v.effectiveFrom ? ` · desde ${formatDate(v.effectiveFrom)}` : ""}
                {v.effectiveTo ? ` hasta ${formatDate(v.effectiveTo)}` : ""}
                {` · ${SCORING_RULE_LABEL[v.scoringRule]}`}
              </p>
              <Table
                headers={["Código", "Criterio", "Peso", "Máx.", "Cómo se mira", "Evidencia"]}
                empty="Esta versión no tiene criterios: sin ellos no se puede publicar."
                rows={v.criteria.map((c) => [
                  c.code, c.label, String(c.weight), String(c.maxPoints),
                  CRITERION_METHOD_LABEL[c.method], c.evidenceExpectation ?? "—",
                ])}
              />

              {canManage && v.status === "draft" ? (
                <>
                  <ActionForm action={addCriterionAction} submitLabel="Añadir criterio">
                    <input type="hidden" name="version_id" value={v.id} />
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Field label="Código"><input name="code" required className={inputClass} /></Field>
                      <Field label="Criterio"><input name="label" required className={inputClass} /></Field>
                      <Field label="Peso">
                        <input name="weight" type="number" step="0.1" min={0} defaultValue={1}
                          className={inputClass} />
                      </Field>
                      <Field label="Puntos máximos">
                        <input name="max_points" type="number" min={1} defaultValue={100}
                          className={inputClass} />
                      </Field>
                      <Field label="Cómo se mira">
                        <select name="evaluation_method" className={inputClass} defaultValue="observation">
                          {CRITERION_METHODS.map((m) => (
                            <option key={m} value={m}>{CRITERION_METHOD_LABEL[m]}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Requisito que verifica" hint="Opcional.">
                        <select name="requirement_id" className={inputClass} defaultValue="">
                          <option value="">Ninguno</option>
                          {requirements.map((r) => (
                            <option key={r.id} value={r.id}>{r.title}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Qué evidencia se espera">
                        <input name="evidence_expectation" className={inputClass} />
                      </Field>
                      <Field label="Orden">
                        <input name="position_order" type="number" min={1}
                          defaultValue={v.criteria.length + 1} className={inputClass} />
                      </Field>
                    </div>
                  </ActionForm>

                  <ActionForm
                    action={publishTemplateVersionAction} submitLabel="Publicar versión"
                    disabled={v.criteria.length === 0}
                  >
                    <input type="hidden" name="version_id" value={v.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="En vigor desde">
                        <input name="effective_from" type="date" defaultValue={today}
                          className={inputClass} />
                      </Field>
                      <Field label="Qué cambia">
                        <input name="change_note" className={inputClass} />
                      </Field>
                    </div>
                  </ActionForm>
                </>
              ) : null}
            </div>
          ))}

          {canManage && !t.versions.some((v) => v.status === "draft") ? (
            <ActionForm action={createTemplateVersionAction} submitLabel="Nueva versión">
              <input type="hidden" name="template_id" value={t.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Forma de puntuar">
                  <select name="scoring_rule" className={inputClass} defaultValue="weighted_average">
                    {SCORING_RULES.map((r) => (
                      <option key={r} value={r}>{SCORING_RULE_LABEL[r]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Por qué se versiona">
                  <input name="change_note" className={inputClass} />
                </Field>
              </div>
            </ActionForm>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
