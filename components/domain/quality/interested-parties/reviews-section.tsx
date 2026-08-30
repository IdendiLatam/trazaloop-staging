"use client";

import { useActionState, useState } from "react";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  interestedPartiesHint, REVIEW_VERDICT_LABEL, type ReviewVerdict,
} from "@/lib/domain/quality-interested-parties";
import type { ReviewRow, StrategyRow } from "@/lib/db/quality-interested-parties";
import { recordReviewAction, type IpActionState } from "@/server/actions/quality-interested-parties";
import { SectionHint } from "@/components/ui/section-hint";
import { Badge } from "./badges";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · Revisiones.
 *
 * LA REVISIÓN QUE NO CAMBIA NADA TAMBIÉN SE REGISTRA.
 *
 * Es la mitad de esta pantalla. Sin ella, un análisis de hace dos años y uno
 * comprobado el mes pasado sin novedades se ven idénticos, y no lo son: uno
 * está desatendido y el otro verificado. Registrar «sin cambios» NO fabrica un
 * análisis nuevo: deja constancia de que se miró.
 *
 * Cuando sí hay que cambiar algo, la revisión lo dice y el cambio se hace
 * donde corresponde —sustituyendo el análisis, o tocando la estrategia—. La
 * revisión es el acta, no el cambio.
 */
export function ReviewsSection({
  assessmentId, strategies, reviews, canMutate,
}: {
  assessmentId: string;
  strategies: StrategyRow[];
  reviews: ReviewRow[];
  canMutate: boolean;
}) {
  const [estado, accion] = useActionState(recordReviewAction, inicial);
  const [veredicto, setVeredicto] = useState<ReviewVerdict>("no_changes");
  const tituloEstrategia = new Map(strategies.map((s) => [s.id, s.title]));

  return (
    <section id="revisiones" className="space-y-4 scroll-mt-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Revisiones</h2>
        <SectionHint hint={interestedPartiesHint("review")} />
      </div>
      <p className="text-sm text-ink-soft">
        Cuándo se volvió a mirar esta parte, qué se concluyó y cuándo toca la próxima.
      </p>

      {reviews.length === 0 ? (
        <EmptyState
          title="Todavía no se ha registrado ninguna revisión."
          description={
            canMutate
              ? "Revisar y concluir que no hay cambios también cuenta: deja constancia de que se "
                + "miró, que es distinto de no haberlo hecho."
              : "Cuando se registre una, aparecerá aquí."
          }
        />
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-hairline bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{r.reviewedOn}</span>
                <Badge tone={r.verdict === "escalated" ? "warn" : "neutral"}>
                  {REVIEW_VERDICT_LABEL[r.verdict as ReviewVerdict] ?? r.verdict}
                </Badge>
              </div>
              {r.strategyId ? (
                <p className="mt-1 text-xs text-ink-soft">
                  Sobre la estrategia: {tituloEstrategia.get(r.strategyId) ?? "—"}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-soft">Sobre el análisis de la parte.</p>
              )}
              {r.note ? <p className="mt-1 whitespace-pre-wrap text-sm">{r.note}</p> : null}
              {r.nextReviewOn ? (
                <p className="mt-1 text-xs text-ink-soft">Próxima revisión: {r.nextReviewOn}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canMutate ? (
        <details className="rounded-lg border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-loop">
            Registrar revisión
          </summary>
          <form action={accion} className="mt-3 space-y-3">
            <ErrorAlert message={estado.error} />
            <SuccessAlert message={estado.success ? estado.message ?? null : null} />

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">¿Qué se revisó?</span>
              <select name="strategy_id" className={inputClass} defaultValue="">
                <option value="">El análisis de la parte</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
            <input
              type="hidden" name="assessment_id"
              value={assessmentId}
            />

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-ink">Resultado</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" name="verdict" value="no_changes" className="mt-1"
                  checked={veredicto === "no_changes"}
                  onChange={() => setVeredicto("no_changes")}
                />
                <span>
                  <span className="font-medium">Revisado, sin cambios</span>
                  <span className="block text-xs text-ink-soft">
                    Se miró y sigue vigente tal cual. No se crea un análisis nuevo.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" name="verdict" value="changes_applied" className="mt-1"
                  checked={veredicto === "changes_applied"}
                  onChange={() => setVeredicto("changes_applied")}
                />
                <span>
                  <span className="font-medium">Se requieren cambios</span>
                  <span className="block text-xs text-ink-soft">
                    Queda el acta. El cambio se hace donde toque: sustituyendo el análisis o
                    ajustando la estrategia.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" name="verdict" value="escalated" className="mt-1"
                  checked={veredicto === "escalated"}
                  onChange={() => setVeredicto("escalated")}
                />
                <span>
                  <span className="font-medium">Escalado</span>
                  <span className="block text-xs text-ink-soft">
                    Excede lo que se puede resolver aquí. Hay que decir qué se escala y por qué.
                  </span>
                </span>
              </label>
            </fieldset>

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">
                Notas{veredicto === "escalated" ? " (obligatorias)" : " (opcional)"}
              </span>
              <textarea name="note" rows={2} className={inputClass}
                required={veredicto === "escalated"} />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Fecha de la revisión</span>
                <input type="date" name="reviewed_on" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">
                  Próxima revisión (opcional)
                </span>
                <input type="date" name="next_review_on" className={inputClass} />
                <span className="block text-xs text-ink-soft">
                  Si no la fijas, no se presume ninguna: la cadencia la decide la empresa.
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Registrar revisión
            </button>
          </form>
        </details>
      ) : null}
    </section>
  );
}
