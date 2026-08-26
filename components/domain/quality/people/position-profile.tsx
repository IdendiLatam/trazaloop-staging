"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  formatDate, POSITION_FUNCTION_KIND_LABEL, POSITION_FUNCTION_KINDS,
  POSITION_VERSION_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { PositionVersionRow } from "@/lib/db/quality-people";
import {
  addPositionFunctionAction, createPositionVersionAction, publishPositionVersionAction,
  setRequirementAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · El perfil de un cargo y su historia.
 *
 * §12 · Cambiar el perfil no reescribe el pasado. Publicar una versión nueva
 * cierra la anterior el día antes y la deja legible con sus requisitos: una
 * evaluación de 2025 se sigue leyendo contra lo que se exigía en 2025.
 */
export function PositionProfileView({
  position, versions, competencies, levels, processes, canManage, today,
}: {
  position: { id: string; name: string; code: string | null };
  versions: PositionVersionRow[];
  competencies: { id: string; name: string }[];
  levels: { value: number; label: string }[];
  processes: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  const draft = versions.find((v) => v.status === "draft") ?? null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/quality/people/structure"
          className="text-xs font-medium text-loop hover:underline"
        >
          ← Estructura de la empresa
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{position.name}</h1>
        <ExportPdfButton
          exportKey="quality.position-profile.detail" id={position.id} label="Descargar PDF"
        />
      </header>

      <DomainNote>
        El cargo es la responsabilidad estable. Su <strong>perfil</strong> —propósito,
        funciones, autoridad, requisitos— se versiona: cada versión tiene su vigencia y
        conserva lo que exigía mientras estuvo vigente.
      </DomainNote>

      {versions.map((v) => (
        <Card
          key={v.id}
          title={`Versión ${v.versionNumber} · ${POSITION_VERSION_STATUS_LABEL[v.status]}`}
          description={
            v.effectiveFrom
              ? `${formatDate(v.effectiveFrom)} → ${v.effectiveTo ? formatDate(v.effectiveTo) : "vigente"}`
              : "Sin publicar"
          }
        >
          {v.purpose ? <p className="text-xs text-ink">{v.purpose}</p> : null}
          <Table
            headers={["Tipo", "Función", "Proceso"]}
            empty="Esta versión no detalla funciones."
            rows={v.functions.map((f) => [
              POSITION_FUNCTION_KIND_LABEL[f.kind], f.description,
              f.processId ? processes.find((p) => p.id === f.processId)?.name ?? "—" : "—",
            ])}
          />
          <Table
            headers={["Competencia exigida", "Nivel", "Obligatoria"]}
            empty="Esta versión no exige competencias."
            rows={v.requirements.map((r) => [
              r.competencyName, String(r.requiredLevel), r.isMandatory ? "Sí" : "Deseable",
            ])}
          />
          {canManage && v.status === "draft" ? (
            <div className="space-y-4 border-t border-hairline pt-3">
              <ActionForm action={addPositionFunctionAction} submitLabel="Añadir función">
                <input type="hidden" name="version_id" value={v.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Tipo">
                    <select name="function_kind" className={inputClass} defaultValue="responsibility">
                      {POSITION_FUNCTION_KINDS.map((k) => (
                        <option key={k} value={k}>{POSITION_FUNCTION_KIND_LABEL[k]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Función">
                    <input name="description" required className={inputClass} />
                  </Field>
                  <Field label="Proceso relacionado">
                    <select name="process_id" className={inputClass} defaultValue="">
                      <option value="">Ninguno</option>
                      {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                </div>
              </ActionForm>

              <ActionForm action={setRequirementAction} submitLabel="Exigir competencia">
                <input type="hidden" name="position_version_id" value={v.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Competencia">
                    <select name="competency_id" required className={inputClass}>
                      <option value="">Elige</option>
                      {competencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Nivel exigido">
                    <select name="required_level" required className={inputClass}>
                      {levels.map((l) => (
                        <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="¿Obligatoria?">
                    <input type="checkbox" name="is_mandatory" defaultChecked className="mt-2" />
                  </Field>
                </div>
              </ActionForm>

              <ActionForm action={publishPositionVersionAction} submitLabel="Publicar este perfil">
                <input type="hidden" name="version_id" value={v.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Vigente desde">
                    <input
                      name="effective_from" type="date" defaultValue={today} className={inputClass}
                    />
                  </Field>
                  <Field label="Motivo del cambio">
                    <input name="change_note" className={inputClass} />
                  </Field>
                </div>
              </ActionForm>
            </div>
          ) : null}
        </Card>
      ))}

      {canManage && !draft ? (
        <Card
          title="Nuevo perfil"
          description="Se crea como borrador; publicarlo cierra el anterior sin borrarlo."
        >
          <ActionForm action={createPositionVersionAction} submitLabel="Crear borrador">
            <input type="hidden" name="position_id" value={position.id} />
            <Field label="Propósito del cargo">
              <textarea name="purpose" rows={2} className={inputClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Formación requerida">
                <input name="education" className={inputClass} />
              </Field>
              <Field label="Experiencia requerida">
                <input name="experience" className={inputClass} />
              </Field>
            </div>
            <Field label="Autoridad">
              <textarea name="authority" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
