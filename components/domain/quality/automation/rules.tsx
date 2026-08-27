"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, AutomationSubnav, Card, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/automation/shared";
import type {
  EventCatalogRow, RuleRow, SourceRow, TemplateRow,
} from "@/lib/db/quality-automation";
import {
  AUTOMATION_DOMAIN_LABEL, AUTONOMY_LEVEL_LABEL, AUTONOMY_LEVEL_MEANING,
  AUTONOMY_LEVELS, CONDITION_IS_NOT_A_DECISION, describeRule, formatDate,
  NO_LEVEL_DECIDES, OPERATOR_LABEL, OPERATOR_SEMANTICS, RULE_STATUS_LABEL,
  SEVERITIES, SEVERITY_IS_DECLARED, SEVERITY_LABEL, TRIGGER_KIND_LABEL,
  TRIGGER_KIND_MEANING, VERSION_IS_FROZEN,
  type AutomationDomain, type Operator,
} from "@/lib/domain/quality-automation";
import {
  createRuleAction, instantiateTemplateAction,
} from "@/server/actions/quality-automation";

export type Option = { id: string; label: string };

/**
 * Trazaloop Quality · QUALITY-11 · §73 · Las reglas.
 *
 * §125 · Las plantillas se ofrecen; ninguna se enciende sola. Encender
 * cincuenta reglas el primer día llena la bandeja de ruido, y a partir de ahí
 * el motor está encendido y apagado a la vez.
 */
export function RulesScreen({
  rules, templates, sources, positions, canManage, eventCatalog = [],
}: {
  rules: RuleRow[];
  templates: TemplateRow[];
  sources: SourceRow[];
  positions: Option[];
  canManage: boolean;
  eventCatalog?: EventCatalogRow[];
}) {
  const porCategoria = new Map<string, RuleRow[]>();
  for (const r of rules) {
    const list = porCategoria.get(r.category) ?? [];
    list.push(r);
    porCategoria.set(r.category, list);
  }

  return (
    <div className="space-y-6">
      <AutomationSubnav current="rules" />

      <DomainNote>{CONDITION_IS_NOT_A_DECISION}</DomainNote>
      <DomainNote>{VERSION_IS_FROZEN}</DomainNote>

      <Card
        title="Reglas de la empresa"
        description="Agrupadas por dominio, para que no sean una lista plana."
        action={<ExportPdfButton exportKey="quality.automation-rule.list" label="Descargar PDF" />}
      >
        {rules.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Todavía no hay reglas. Abajo están las plantillas recomendadas: todas
            apagadas, para que enciendas solo las que te sirvan.
          </p>
        ) : null}
        {[...porCategoria.entries()].map(([cat, lista]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold text-ink">
              {AUTOMATION_DOMAIN_LABEL[cat as AutomationDomain] ?? cat}
            </h3>
            <Table
              headers={["Código", "Regla", "Observa", "Versión", "Autonomía", "Estado",
                        "Señales", "Última evaluación", ""]}
              empty="—"
              rows={lista.map((r) => [
                <a key="c" className="underline" href={`/quality/automation/rules/${r.id}`}>
                  {r.code}
                </a>,
                <span key="n">
                  {r.name}
                  {r.templateCode
                    ? <span className="block text-ink-soft">Desde plantilla</span>
                    : null}
                </span>,
                r.sourceLabel,
                r.currentVersionNumber !== null
                  ? <span key="v">
                      v{r.currentVersionNumber}
                      {r.draftVersionCount > 0
                        ? <span className="block text-ink-soft">
                            {r.draftVersionCount} borrador(es)
                          </span>
                        : null}
                    </span>
                  : "Sin publicar",
                r.autonomyLevel,
                <Pill key="s" tone={
                  r.isSuppressed ? "warn"
                    : r.status === "active" ? "good"
                      : r.status === "retired" ? "bad" : "neutral"
                }>
                  {r.isSuppressed ? "Silenciada" : RULE_STATUS_LABEL[r.status]}
                </Pill>,
                <span key="g">
                  {r.openSignalCount}
                  {r.criticalSignalCount > 0
                    ? <span className="block text-red-700 dark:text-red-400">
                        {r.criticalSignalCount} crítica(s)
                      </span>
                    : null}
                </span>,
                r.lastEvaluatedAt ? formatDate(r.lastEvaluatedAt) : "Nunca",
                <ExportPdfButton
                  key="x" exportKey="quality.automation-rule.detail" id={r.id}
                  label="Descargar PDF"
                />,
              ])}
            />
          </div>
        ))}
      </Card>

      {canManage ? (
        <Card
          title="Plantillas recomendadas"
          description="Todas apagadas. Instancia la que te sirva, ajústala y publícala."
        >
          <DomainNote>
            Ninguna plantilla se activa sola. Encender cincuenta reglas el primer
            día llena la bandeja de ruido, y a partir de ahí nadie la mira.
          </DomainNote>
          <Table
            headers={["Plantilla", "Cuándo mira", "Observa", "Por qué existe",
                      "Gravedad", ""]}
            empty="—"
            rows={templates.map((t) => [
              <span key="n">
                {t.name}
                <span className="block text-ink-soft">{t.description}</span>
                {t.supersedesObserver ? (
                  <span className="block text-ink-soft">
                    Al adoptarla, el aviso antiguo de este mismo asunto deja de
                    emitirse: una condición, un aviso.
                  </span>
                ) : null}
              </span>,
              <span key="t">
                {TRIGGER_KIND_LABEL[(t.triggerKind === "event" ? "event" : "schedule")]}
                {t.triggerKind === "event" && (t.eventTypes ?? []).length > 0 ? (
                  <span className="block text-ink-soft">
                    {(t.eventTypes ?? [])
                      .map((e) => eventCatalog.find((c) => c.eventType === e)?.label ?? e)
                      .join(" · ")}
                  </span>
                ) : null}
              </span>,
              sources.find((s) => s.code === t.sourceCode)?.label ?? t.sourceCode,
              t.rationale,
              SEVERITY_LABEL[t.severity],
              <ActionForm key="a" action={instantiateTemplateAction}
                submitLabel="Usar esta plantilla" className="inline">
                <input type="hidden" name="template_code" value={t.code} />
              </ActionForm>,
            ])}
          />
        </Card>
      ) : null}

      {canManage ? (
        <Card
          title="Crear una regla desde cero"
          description="Fuente, condiciones y salidas. No hay código, ni fórmulas, ni SQL."
        >
          <DomainNote>{NO_LEVEL_DECIDES}</DomainNote>
          <DomainNote>{SEVERITY_IS_DECLARED}</DomainNote>
          <RuleForm sources={sources} positions={positions}
            eventCatalog={eventCatalog} />
        </Card>
      ) : null}

      <Card title="Qué puede observar el motor" description="El catálogo cerrado de fuentes.">
        <Table
          headers={["Fuente", "Dominio", "Qué mira", "Campos observables"]}
          empty="—"
          rows={sources.map((s) => [
            s.label,
            AUTOMATION_DOMAIN_LABEL[s.domain] ?? s.domain,
            s.description,
            s.fields.map((f) => f.label).join(" · "),
          ])}
        />
        <DomainNote>
          Una regla solo puede elegir de esta lista. El navegador nunca manda una
          tabla, una columna ni una consulta: manda un código de campo, y el
          servidor comprueba que ese operador se pueda aplicar a ese campo antes
          de dejar publicar nada.
        </DomainNote>
      </Card>
    </div>
  );
}

/**
 * §167/§168 · El constructor, en lenguaje de negocio. «Cuando · Condición ·
 * Operador · Valor · Entonces». Nada de nodos ni de JSON.
 */
export function RuleForm({
  sources, positions, defaultSourceCode, eventCatalog = [],
}: {
  sources: SourceRow[]; positions: Option[]; defaultSourceCode?: string;
  eventCatalog?: EventCatalogRow[];
}) {
  const fuente = sources.find((s) => s.code === defaultSourceCode) ?? sources[0];
  return (
    <ActionForm action={createRuleAction} submitLabel="Crear regla (borrador)">
      {/* QUALITY-11.1 · §35 · CUANDO OCURRE · SI · ENTONCES. Las dos formas de
          mirar, dichas como se dicen, sin una palabra técnica. */}
      <div className="space-y-2 rounded-md border border-hairline bg-canvas px-3 py-2">
        <p className="text-xs font-medium text-ink">CUÁNDO MIRA</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["schedule", "event"] as const).map((k) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <input type="radio" name="trigger_kind" value={k}
                defaultChecked={k === "schedule"} className="mt-1" />
              <span>
                {TRIGGER_KIND_LABEL[k]}
                <span className="block text-xs text-ink-soft">
                  {TRIGGER_KIND_MEANING[k]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {eventCatalog.length > 0 ? (
          <div className="space-y-1 pt-1">
            <p className="text-xs font-medium text-ink">
              CUANDO OCURRE · marca los hechos a los que reacciona
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {eventCatalog.map((e) => (
                <label key={e.eventType} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="event_type" value={e.eventType}
                    className="mt-1" />
                  <span>
                    {e.label}
                    <span className="block text-xs text-ink-soft">
                      {AUTOMATION_DOMAIN_LABEL[e.domain]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-soft">
              Solo cuentan si eliges «Cuando ocurre un hecho», y solo se puede
              publicar si el hecho habla del mismo objeto que la regla observa.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Código">
          <input name="code" required className={inputClass} placeholder="AUT-001" />
        </Field>
        <Field label="Nombre">
          <input name="name" required className={inputClass}
            placeholder="Proveedor crítico con reevaluación vencida" />
        </Field>
        <Field label="CUÁNDO · qué observa" hint="Del catálogo cerrado de fuentes.">
          <select name="source_code" className={inputClass}
            defaultValue={fuente?.code ?? ""}>
            {sources.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Dominio">
          <select name="category" className={inputClass}
            defaultValue={fuente?.domain ?? "indicators"}>
            {Object.entries(AUTOMATION_DOMAIN_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Descripción">
        <textarea name="description" rows={2} className={inputClass} />
      </Field>

      {/* CONDICIONES · hasta tres, con Y entre ellas */}
      <div className="space-y-2 rounded-md border border-hairline bg-canvas px-3 py-2">
        <p className="text-xs font-medium text-ink">CONDICIÓN · se cumplen todas</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <select name="condition_field" className={inputClass} defaultValue="">
              <option value="">— sin condición —</option>
              {sources.flatMap((s) =>
                s.fields.map((f) => (
                  <option key={`${s.code}.${f.field}`} value={f.field}>
                    {s.label} · {f.label}
                  </option>
                ))
              )}
            </select>
            <select name="condition_operator" className={inputClass} defaultValue="equals">
              {(Object.keys(OPERATOR_LABEL) as Operator[]).map((o) => (
                <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>
              ))}
            </select>
            <input name="condition_value" className={inputClass}
              placeholder="valor · para listas, separa con comas" />
          </div>
        ))}
        <details>
          <summary className="cursor-pointer text-xs text-ink-soft">
            Qué significa cada operador
          </summary>
          <ul className="space-y-0.5 pt-1">
            {(Object.keys(OPERATOR_SEMANTICS) as Operator[]).map((o) => (
              <li key={o} className="text-xs text-ink-soft">
                <strong>{OPERATOR_LABEL[o]}</strong>: {OPERATOR_SEMANTICS[o]}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {/* SALIDAS */}
      <div className="space-y-2 rounded-md border border-hairline bg-canvas px-3 py-2">
        <p className="text-xs font-medium text-ink">ENTONCES</p>
        <p className="text-xs text-ink-soft">
          Siempre se emite una señal. Lo demás es opcional.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Qué dirá la señal">
            <input name="signal_title" required className={inputClass}
              placeholder="Proveedor crítico con reevaluación vencida" />
          </Field>
          <Field label="Gravedad">
            <select name="severity" className={inputClass} defaultValue="warning">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Avisar a un cargo">
          <input type="checkbox" name="output_alert" defaultChecked
            className="mr-2 align-middle" />
        </Field>
        <Field label="Crear una tarea"
          hint="Avisar no es asignar trabajo: marca esto solo si de verdad hay que hacer algo.">
          <input type="checkbox" name="output_task" className="mr-2 align-middle" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Destinatario">
            <select name="recipient_kind" className={inputClass}
              defaultValue="subject_owner_position">
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
            <input type="number" name="due_in_days" min={1} className={inputClass} />
          </Field>
        </div>
        <Field label="Título de la tarea">
          <input name="task_title" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nivel de autonomía"
          hint={AUTONOMY_LEVEL_MEANING.A}>
          <select name="autonomy_level" className={inputClass} defaultValue="A">
            {AUTONOMY_LEVELS.map((l) => (
              <option key={l} value={l}>{AUTONOMY_LEVEL_LABEL[l]}</option>
            ))}
          </select>
        </Field>
        <Field label="Cargo responsable de la regla">
          <select name="owner_position_id" className={inputClass} defaultValue="">
            <option value="">Sin asignar</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>
    </ActionForm>
  );
}
