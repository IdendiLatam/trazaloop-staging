"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AGGREGATIONS, AGGREGATION_LABEL, METHODOLOGY_APPROACHES, METHODOLOGY_APPROACH_LABEL,
  METHODOLOGY_SCOPES, METHODOLOGY_SCOPE_LABEL, VERSION_STATUS_LABEL,
} from "@/lib/domain/risks";
import type { MethodologyRow } from "@/lib/db/risks";
import {
  createMethodologyAction, createVersionAction, publishVersionAction, type RiskActionState,
} from "@/server/actions/risks";
import { RiskMatrix } from "./risk-matrix";

const initial: RiskActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/**
 * QUALITY-05 · Metodología de valoración.
 *
 * Lo que esta pantalla tiene que dejar claro, porque es la parte del módulo
 * que más se malinterpreta:
 *
 * · La metodología es CONFIGURABLE: las escalas, la regla y las bandas las
 *   pone la empresa. Aquí no hay una matriz 5×5 escondida.
 * · Es VERSIONADA: publicar congela. Una versión nueva no recalcula nada de lo
 *   anterior — una evaluación de 2026 se sigue explicando con la v1 aunque hoy
 *   rija la v2.
 * · Riesgos y oportunidades tienen metodologías SEPARADAS (RO-15). Priorizar
 *   una oportunidad con escalas de daño no significa nada.
 */
export function QualityMethodologyView({
  methodologies, canGovern,
}: {
  methodologies: MethodologyRow[];
  canGovern: boolean;
}) {
  const [createState, createAction, createPending] = useActionState(createMethodologyAction, initial);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Por qué esto se versiona</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Publicar una versión la congela: sus escalas y su regla dejan de poder editarse. No es
          rigidez, es lo que permite responder «¿por qué en marzo dijimos que era alto?» dos años
          después. Para cambiar los criterios se publica una versión nueva, y las evaluaciones ya
          hechas siguen explicándose con la que usaron.
        </p>
      </section>

      {canGovern ? (
        <details className="rounded-lg border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-loop">Crear una metodología</summary>
          <form action={createAction} className="mt-3 space-y-3">
            <h3 className="text-sm font-semibold">Crear una metodología</h3>
            <ErrorAlert message={createState.error} />
            {createState.success && createState.message ? (
              <p className="rounded-md border border-loop/30 bg-loop/5 p-2 text-xs text-ink">
                {createState.message}
              </p>
            ) : null}
            <Field label="Nombre">
              <input name="name" required minLength={3} className={inputClass}
                     placeholder="Ej.: Valoración de riesgos del SGC" />
            </Field>
            <Field label="Código">
              <input name="code" className={inputClass} placeholder="Ej.: MET-RIESGO" />
            </Field>
            <Field label="¿Para qué sirve?" hint="Riesgos y oportunidades no se valoran igual: cada una tiene la suya.">
              <select name="applies_to" className={inputClass} defaultValue="risk">
                {METHODOLOGY_SCOPES.map((s) => (
                  <option key={s} value={s}>{METHODOLOGY_SCOPE_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Enfoque">
              <select name="approach" className={inputClass} defaultValue="semi_quantitative">
                {METHODOLOGY_APPROACHES.map((a) => (
                  <option key={a} value={a}>{METHODOLOGY_APPROACH_LABEL[a]}</option>
                ))}
              </select>
            </Field>
            <Field label="Cómo se combinan los factores" hint="Determina el puntaje. Nadie escribe el nivel a mano.">
              <select name="aggregation" className={inputClass} defaultValue="product">
                {AGGREGATIONS.map((a) => (
                  <option key={a} value={a}>{AGGREGATION_LABEL[a]}</option>
                ))}
              </select>
            </Field>
            <Field label="Descripción">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
            <Button type="submit" disabled={createPending}>
              {createPending ? "Creando…" : "Crear como borrador"}
            </Button>
          </form>
        </details>
      ) : null}

      {methodologies.length === 0 ? (
        <EmptyState
          title="Todavía no hay ninguna metodología"
          description="Sin una metodología publicada se pueden identificar riesgos, pero no valorarlos: el nivel sale de sus escalas, no de una fórmula escrita en el programa."
        />
      ) : (
        <ul className="space-y-4">
          {methodologies.map((m) => (
            <li key={m.methodologyId} className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-soft">{m.code}</span>
                <h3 className="text-sm font-semibold">{m.name}</h3>
                <span className="rounded-full border border-loop/30 bg-loop/10 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
                  {METHODOLOGY_SCOPE_LABEL[m.appliesTo]}
                </span>
                <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-soft">
                  {METHODOLOGY_APPROACH_LABEL[m.approach]}
                </span>
              </div>
              {m.description ? <p className="mt-1 text-xs text-ink-soft">{m.description}</p> : null}

              <ul className="mt-3 space-y-3">
                {m.versions.map((v) => (
                  <li key={v.versionId} className="rounded-md border border-hairline p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Versión {v.versionNumber}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          v.status === "published"
                            ? "border-emerald/40 bg-emerald/10 text-emerald-deep"
                            : v.status === "draft"
                              ? "border-amber/40 bg-amber/10 text-amber-deep"
                              : "border-hairline bg-surface text-ink-soft"
                        }`}
                      >
                        {VERSION_STATUS_LABEL[v.status]}
                      </span>
                      <span className="text-xs text-ink-soft">
                        {AGGREGATION_LABEL[v.aggregation]}
                        {v.effectiveFrom ? ` · vigente desde ${v.effectiveFrom}` : ""}
                        {v.effectiveTo ? ` hasta ${v.effectiveTo}` : ""}
                      </span>
                    </div>
                    {v.changeNote ? <p className="mt-1 text-xs text-ink">{v.changeNote}</p> : null}

                    <div className="mt-2 space-y-1 text-xs text-ink-soft">
                      {v.scales.filter((s) => s.scaleKind === "dimension").map((s) => (
                        <p key={s.scaleId}>
                          <strong className="text-ink">{s.label}</strong>:{" "}
                          {s.levels.map((l) => `${l.label} (${l.value})`).join(" · ") || "sin niveles"}
                        </p>
                      ))}
                    </div>

                    {v.scales.some((s) => s.scaleKind === "result") ? (
                      <div className="mt-3">
                        <RiskMatrix version={v} />
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-deep">
                        Falta la escala de resultado: sin ella no se puede derivar un nivel.
                      </p>
                    )}

                    {canGovern && v.status === "draft" ? (
                      <PublishForm versionId={v.versionId} />
                    ) : null}
                    {v.status === "published" ? (
                      <p className="mt-2 text-xs text-ink-soft">
                        Publicada: sus escalas ya no se editan. Para cambiar criterios, crea una
                        versión nueva.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canGovern ? <NewVersionForm methodologyId={m.methodologyId} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PublishForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(publishVersionAction, initial);
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-hairline pt-3">
      <h4 className="text-xs font-semibold">Publicar esta versión</h4>
      <ErrorAlert message={state.error} />
      <input type="hidden" name="version_id" value={versionId} />
      <Field label="Vigente desde" hint="Si lo dejas vacío, desde hoy.">
        <input type="date" name="effective_from" className={inputClass} />
      </Field>
      <Field label="Qué cambia">
        <input name="change_note" className={inputClass} />
      </Field>
      <p className="text-xs text-ink-soft">
        Al publicar, esta versión queda congelada y la anterior pasa a sustituida. Las evaluaciones
        hechas con la anterior no cambian.
      </p>
      <Button type="submit" disabled={pending}>{pending ? "Publicando…" : "Publicar"}</Button>
    </form>
  );
}

function NewVersionForm({ methodologyId }: { methodologyId: string }) {
  const [state, action, pending] = useActionState(createVersionAction, initial);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-loop">Crear una versión nueva</summary>
      <form action={action} className="mt-2 space-y-2">
        <h4 className="text-xs font-semibold">Nueva versión</h4>
        <ErrorAlert message={state.error} />
        {state.success && state.message ? (
          <p className="rounded-md border border-loop/30 bg-loop/5 p-2 text-xs text-ink">{state.message}</p>
        ) : null}
        <input type="hidden" name="methodology_id" value={methodologyId} />
        <Field label="Qué se va a cambiar">
          <input name="change_note" className={inputClass} placeholder="Ej.: se sube el umbral de «alto»" />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear versión"}</Button>
      </form>
    </details>
  );
}
