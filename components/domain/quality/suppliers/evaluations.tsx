"use client";

import Link from "next/link";
import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  EVALUATION_KIND_LABEL, EVALUATION_KINDS, EVALUATION_STATUS_LABEL, EVALUATION_STATUSES,
  formatDate,
} from "@/lib/domain/quality-suppliers";
import type {
  ScopeOption, SupplierEvaluationRow, SupplierTemplateRow,
} from "@/lib/db/quality-suppliers";
import { createEvaluationAction } from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Evaluaciones.
 *
 * Selección, periódica, reevaluación y extraordinaria están en la misma lista
 * porque son el mismo acto en momentos distintos. Lo que cambia es POR QUÉ se
 * hace, y eso se dice en la columna «clase», no partiendo el dominio en cuatro
 * pantallas que se copiarían entre sí.
 */
export function SupplierEvaluations({
  evaluations, scopes, templates, canManage,
}: {
  evaluations: SupplierEvaluationRow[];
  scopes: ScopeOption[];
  templates: SupplierTemplateRow[];
  canManage: boolean;
}) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const etiqueta = new Map(scopes.map((s) => [s.scopeId, s.label]));
  const visibles = evaluations.filter((e) =>
    (kind === "" || e.kind === kind) && (status === "" || e.status === status));
  const publicadas = templates.flatMap((t) =>
    t.versions.filter((v) => v.status === "published").map((v) => ({ t, v })));

  return (
    <div className="space-y-6">
      <DomainNote>
        Una evaluación produce un <strong>resultado</strong>, no una homologación.
        Aprobar, condicionar o suspender es un acto aparte que hace una persona y que
        se registra en la ficha del proveedor.
      </DomainNote>

      <Card
        title="Evaluaciones"
        description={`${visibles.length} de ${evaluations.length}`}
        action={<ExportPdfButton exportKey="quality.supplier-evaluation.list" label="Descargar PDF" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Clase">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
              <option value="">Todas</option>
              {EVALUATION_KINDS.map((k) => (
                <option key={k} value={k}>{EVALUATION_KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {EVALUATION_STATUSES.map((s) => (
                <option key={s} value={s}>{EVALUATION_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Table
          headers={["Proveedor y alcance", "Clase", "Periodo", "Fecha", "Resultado", "Estado", ""]}
          empty="No hay evaluaciones que cumplan el filtro."
          rows={visibles.map((e) => [
            etiqueta.get(e.scopeId) ?? "Alcance",
            EVALUATION_KIND_LABEL[e.kind],
            e.periodLabel ?? "—",
            e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
            e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
            EVALUATION_STATUS_LABEL[e.status],
            <Link
              key="v" href={`/quality/suppliers/evaluations/${e.id}`}
              className="font-medium text-loop hover:underline"
            >
              Ver
            </Link>,
          ])}
        />
      </Card>

      {canManage && publicadas.length > 0 && scopes.length > 0 ? (
        <Card title="Abrir una evaluación">
          <ActionForm action={createEvaluationAction} submitLabel="Abrir">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Proveedor y alcance">
                <select name="scope_id" required className={inputClass}>
                  {scopes.map((s) => <option key={s.scopeId} value={s.scopeId}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Plantilla">
                <select name="version_id" required className={inputClass}>
                  {publicadas.map(({ t, v }) => (
                    <option key={v.id} value={v.id}>{t.name} v{v.versionNumber}</option>
                  ))}
                </select>
              </Field>
              <Field label="Clase">
                <select name="evaluation_kind" className={inputClass} defaultValue="periodic">
                  {EVALUATION_KINDS.map((k) => (
                    <option key={k} value={k}>{EVALUATION_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Periodo" hint="Por ejemplo: 2026-S1.">
                <input name="period_label" className={inputClass} />
              </Field>
              <Field label="Desde"><input name="period_start" type="date" className={inputClass} /></Field>
              <Field label="Hasta"><input name="period_end" type="date" className={inputClass} /></Field>
            </div>
            <Field
              label="Por qué se hace"
              hint="Obligatorio de hecho en las extraordinarias: una reevaluación fuera de ciclo sin motivo no se entiende después."
            >
              <input name="trigger_reason" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      <p className="text-xs text-ink-soft">
        Los criterios y los pesos se definen en{" "}
        <Link href="/quality/suppliers/templates" className="font-medium text-loop hover:underline">
          plantillas de evaluación
        </Link>.
      </p>
    </div>
  );
}
