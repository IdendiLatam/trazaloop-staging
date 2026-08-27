"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, Card, Counter, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/automation/shared";
import type {
  RuleRow, SignalRow, SourceRow, VersionRow,
} from "@/lib/db/quality-automation";
import {
  AUTONOMY_LEVEL_LABEL, AUTONOMY_LEVEL_MEANING, AUTOMATION_DOMAIN_LABEL,
  DEACTIVATION_KEEPS_HISTORY, describeCondition, formatDate, formatDateTime,
  NO_LEVEL_DECIDES, OUTPUT_KIND_LABEL, PUBLISHED_IS_NOT_ACTIVE,
  RECIPIENT_IS_STRUCTURAL, RULE_STATUS_LABEL, SEVERITIES, SEVERITY_LABEL,
  SIGNAL_STATUS_LABEL, SIMULATION_CREATES_NOTHING, VERSION_IS_FROZEN,
  VERSION_STATUS_LABEL,
} from "@/lib/domain/quality-automation";
import {
  createVersionAction, deleteRuleAction, publishVersionAction,
  runAutomationAction, setRuleStatusAction, simulateVersionAction,
  suppressAction, updateDraftVersionAction, updateRuleAction,
} from "@/server/actions/quality-automation";
import type { Option } from "@/components/domain/quality/automation/rules";

/** Trazaloop Quality · QUALITY-11 · La regla entera en una pantalla. */
export function RuleFile({
  rule, versions, source, signals, summary, positions, canManage, canPublish,
}: {
  rule: RuleRow;
  versions: VersionRow[];
  source: SourceRow | null;
  signals: SignalRow[];
  summary: string | null;
  positions: Option[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const borrador = versions.find((v) => v.status === "draft") ?? null;
  const publicada = versions.find((v) => v.status === "published") ?? null;
  const etiquetas = Object.fromEntries(
    (source?.fields ?? []).map((f) => [f.field, f.label])
  );

  return (
    <div className="space-y-6">
      <Card
        title={`${rule.code} · ${rule.name}`}
        description={rule.description ?? undefined}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={
              rule.isSuppressed ? "warn"
                : rule.status === "active" ? "good"
                  : rule.status === "retired" ? "bad" : "neutral"
            }>
              {rule.isSuppressed ? "Silenciada" : RULE_STATUS_LABEL[rule.status]}
            </Pill>
            <ExportPdfButton
              exportKey="quality.automation-rule.detail" id={rule.id}
              label="Descargar PDF"
            />
          </span>
        }
      >
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <Fact label="Observa" value={rule.sourceLabel} />
          <Fact label="Dominio"
            value={AUTOMATION_DOMAIN_LABEL[rule.category] ?? rule.category} />
          <Fact label="Autonomía" value={AUTONOMY_LEVEL_LABEL[rule.autonomyLevel]} />
          <Fact label="Cargo responsable" value={rule.ownerPositionName ?? "Sin asignar"} />
          <Fact label="Versión vigente"
            value={rule.currentVersionNumber !== null
              ? `v${rule.currentVersionNumber} desde ${formatDate(rule.currentEffectiveFrom)}`
              : "Sin publicar"} />
          <Fact label="Última evaluación"
            value={rule.lastEvaluatedAt ? formatDateTime(rule.lastEvaluatedAt) : "Nunca"} />
        </div>

        <DomainNote>{AUTONOMY_LEVEL_MEANING[rule.autonomyLevel]}</DomainNote>
        <DomainNote>{NO_LEVEL_DECIDES}</DomainNote>

        {/* §169 · El resumen legible, generado desde el árbol de la regla. */}
        {summary ? (
          <div className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2">
            <p className="text-xs font-medium text-ink">Qué hace esta regla</p>
            <p className="text-xs text-ink">{summary}</p>
            <p className="text-xs text-ink-soft">
              Esta frase la compone la propia regla: la misma regla produce
              siempre la misma frase. No hay ningún modelo detrás.
            </p>
          </div>
        ) : null}

        {canManage && !rule.isPlatform ? (
          <details className="rounded-md border border-hairline px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-ink">
              Editar nombre y responsable
            </summary>
            <div className="pt-3">
              <ActionForm action={updateRuleAction} submitLabel="Guardar">
                <input type="hidden" name="rule_id" value={rule.id} />
                <Field label="Nombre">
                  <input name="name" defaultValue={rule.name} required className={inputClass} />
                </Field>
                <Field label="Descripción">
                  <textarea name="description" rows={2} className={inputClass}
                    defaultValue={rule.description ?? ""} />
                </Field>
                <Field label="Cargo responsable">
                  <select name="owner_position_id" className={inputClass}
                    defaultValue={rule.ownerPositionId ?? ""}>
                    <option value="">Sin asignar</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </Card>

      <Card title="Versiones" description="La publicada no se edita: se crea la siguiente.">
        <DomainNote>{VERSION_IS_FROZEN}</DomainNote>
        <DomainNote>{PUBLISHED_IS_NOT_ACTIVE}</DomainNote>
        <Table
          headers={["Versión", "Estado", "Condiciones", "Salidas", "Gravedad",
                    "Vigente desde", "Hasta", "Nota"]}
          empty="Esta regla no tiene versiones."
          rows={versions.map((v) => [
            `v${v.versionNumber}`,
            VERSION_STATUS_LABEL[v.status],
            <ul key="c" className="space-y-0.5">
              {v.conditions.map((c, i) => (
                <li key={i} className="text-ink">
                  · {describeCondition(c, etiquetas[c.field])}
                </li>
              ))}
            </ul>,
            <ul key="o" className="space-y-0.5">
              {v.outputs.map((o, i) => (
                <li key={i} className="text-ink">· {OUTPUT_KIND_LABEL[o.kind]}</li>
              ))}
            </ul>,
            SEVERITY_LABEL[v.severity],
            formatDate(v.effectiveFrom),
            v.effectiveTo ? formatDate(v.effectiveTo) : "—",
            v.changeNote ?? "—",
          ])}
        />
      </Card>

      {canManage && borrador ? (
        <Card
          title={`Borrador · versión ${borrador.versionNumber}`}
          description="Simúlalo antes de publicarlo."
        >
          <DomainNote>{SIMULATION_CREATES_NOTHING}</DomainNote>
          <ActionForm action={updateDraftVersionAction} submitLabel="Guardar borrador">
            <input type="hidden" name="version_id" value={borrador.id} />
            <input type="hidden" name="rule_id" value={rule.id} />
            <ConditionFields conditions={borrador.conditions} source={source} />
            <OutputFields version={borrador} positions={positions} />
          </ActionForm>

          <ActionForm action={simulateVersionAction} submitLabel="Simular con los datos de hoy">
            <input type="hidden" name="version_id" value={borrador.id} />
          </ActionForm>

          {canPublish ? (
            <ActionForm action={publishVersionAction} submitLabel="Publicar esta versión">
              <input type="hidden" name="version_id" value={borrador.id} />
              <input type="hidden" name="rule_id" value={rule.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vigente desde"
                  hint="Puedes publicarla hoy y que empiece a observar más adelante.">
                  <input type="date" name="effective_from" className={inputClass} />
                </Field>
                <Field label="Qué cambia">
                  <input name="change_note" className={inputClass} />
                </Field>
              </div>
            </ActionForm>
          ) : (
            <DomainNote>
              Diseñar la regla lo puede hacer cualquiera que conduzca el dominio.
              Encenderla es de la empresa: eso lo hace quien responde por ella.
            </DomainNote>
          )}
        </Card>
      ) : null}

      {canManage && !borrador && publicada ? (
        <Card
          title="Cambiar la lógica"
          description="Editar una regla publicada es crear la versión siguiente."
        >
          <ActionForm action={createVersionAction} submitLabel="Crear versión nueva">
            <input type="hidden" name="rule_id" value={rule.id} />
            <ConditionFields conditions={publicada.conditions} source={source} />
            <OutputFields version={publicada} positions={positions} />
            <Field label="Qué cambia">
              <input name="change_note" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      <Card
        title="Señales de esta regla"
        description="Cada una explica con qué versión se emitió."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Counter label="Abiertas" value={rule.openSignalCount}
            tone={rule.openSignalCount > 0 ? "warn" : undefined} />
          <Counter label="Críticas" value={rule.criticalSignalCount}
            tone={rule.criticalSignalCount > 0 ? "bad" : undefined} />
          <Counter label="Total" value={signals.length} />
        </div>
        <Table
          headers={["Señal", "Objeto", "Versión", "Detectada", "Veces", "Estado"]}
          empty="Esta regla no ha emitido ninguna señal todavía."
          rows={signals.slice(0, 20).map((s) => [
            <a key="t" className="underline" href={`/quality/automation/signals/${s.id}`}>
              {s.title}
            </a>,
            s.subjectLabel ?? "—",
            s.ruleVersionNumber !== null ? `v${s.ruleVersionNumber}` : "—",
            formatDate(s.firstDetectedAt),
            s.detectionCount,
            SIGNAL_STATUS_LABEL[s.status],
          ])}
        />
      </Card>

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Ejecutar solo esta regla">
            <ActionForm action={runAutomationAction} submitLabel="Ejecutar ahora">
              <input type="hidden" name="rule_id" value={rule.id} />
            </ActionForm>
          </Card>
          <Card title="Silenciar temporalmente"
            description="Evita el ruido sin borrar nada.">
            <ActionForm action={suppressAction} submitLabel="Silenciar la regla">
              <input type="hidden" name="scope" value="rule" />
              <input type="hidden" name="target_id" value={rule.id} />
              <Field label="Por qué">
                <input name="reason" className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input type="date" name="until" className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      ) : null}

      {canManage && !rule.isPlatform ? (
        <Card title="Estado de la regla">
          <DomainNote>{DEACTIVATION_KEEPS_HISTORY}</DomainNote>
          <ActionForm action={setRuleStatusAction} submitLabel="Guardar estado">
            <input type="hidden" name="rule_id" value={rule.id} />
            <Field label="Estado">
              <select name="status" className={inputClass} defaultValue={rule.status}>
                <option value="draft">Borrador</option>
                {canPublish ? <option value="active">Activa</option> : null}
                <option value="inactive">Desactivada</option>
                <option value="retired">Retirada</option>
              </select>
            </Field>
            <Field label="Motivo" hint="Obligatorio al retirar.">
              <input name="reason" className={inputClass} />
            </Field>
          </ActionForm>

          <ActionForm action={deleteRuleAction} submitLabel="Eliminar la regla">
            <input type="hidden" name="rule_id" value={rule.id} />
            <p className="text-xs text-ink-soft">
              Solo se puede eliminar un borrador que nunca se publicó ni se
              ejecutó. Con historia, la vía es desactivarla o retirarla.
            </p>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-soft">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}

function ConditionFields({
  conditions, source,
}: { conditions: { field: string; operator: string; value?: unknown }[];
     source: SourceRow | null }) {
  const filas = [0, 1, 2];
  return (
    <div className="space-y-2 rounded-md border border-hairline bg-canvas px-3 py-2">
      <p className="text-xs font-medium text-ink">CONDICIÓN · se cumplen todas</p>
      {filas.map((i) => {
        const c = conditions[i];
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <select name="condition_field" className={inputClass}
              defaultValue={c?.field ?? ""}>
              <option value="">— sin condición —</option>
              {(source?.fields ?? []).map((f) => (
                <option key={f.field} value={f.field}>{f.label}</option>
              ))}
            </select>
            <select name="condition_operator" className={inputClass}
              defaultValue={c?.operator ?? "equals"}>
              {(source?.fields ?? [])
                .flatMap((f) => f.allowedOperators)
                .filter((o, idx, arr) => arr.indexOf(o) === idx)
                .map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input name="condition_value" className={inputClass}
              defaultValue={c?.value === undefined ? ""
                : Array.isArray(c.value) ? c.value.join(", ") : String(c.value)} />
          </div>
        );
      })}
    </div>
  );
}

function OutputFields({
  version, positions,
}: { version: VersionRow; positions: Option[] }) {
  const alerta = version.outputs.some((o) => o.kind === "CREATE_ALERT");
  const tarea = version.outputs.find((o) => o.kind === "CREATE_TASK");
  const destinatario = version.outputs.find((o) => o.recipientKind)?.recipientKind
    ?? "subject_owner_position";
  return (
    <div className="space-y-2 rounded-md border border-hairline bg-canvas px-3 py-2">
      <p className="text-xs font-medium text-ink">ENTONCES</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Qué dirá la señal">
          <input name="signal_title" required className={inputClass}
            defaultValue={version.signalTitle} />
        </Field>
        <Field label="Gravedad">
          <select name="severity" className={inputClass} defaultValue={version.severity}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Avisar a un cargo">
        <input type="checkbox" name="output_alert" defaultChecked={alerta}
          className="mr-2 align-middle" />
      </Field>
      <Field label="Crear una tarea">
        <input type="checkbox" name="output_task" defaultChecked={tarea !== undefined}
          className="mr-2 align-middle" />
      </Field>
      <DomainNote>{RECIPIENT_IS_STRUCTURAL}</DomainNote>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Destinatario">
          <select name="recipient_kind" className={inputClass} defaultValue={destinatario}>
            <option value="subject_owner_position">El cargo responsable del objeto</option>
            <option value="rule_owner_position">El cargo responsable de la regla</option>
            <option value="specific_position">Un cargo concreto</option>
          </select>
        </Field>
        <Field label="Cargo concreto">
          <select name="recipient_position_id" className={inputClass} defaultValue="">
            <option value="">—</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Plazo de la tarea (días)">
          <input type="number" name="due_in_days" min={1} className={inputClass}
            defaultValue={tarea?.dueInDays ?? ""} />
        </Field>
      </div>
      <Field label="Título de la tarea">
        <input name="task_title" className={inputClass} defaultValue={tarea?.taskTitle ?? ""} />
      </Field>
    </div>
  );
}
