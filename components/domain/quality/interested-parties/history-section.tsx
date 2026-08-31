import Link from "next/link";
import {
  ENTRY_KIND_LABEL, interestedPartiesHint, RELEVANCE_LABEL, REVIEW_VERDICT_LABEL,
  type EntryKind, type ReviewVerdict,
} from "@/lib/domain/quality-interested-parties";
import type { InterestedPartiesHelp } from "@/lib/domain/quality-interested-parties";
import type {
  AssessmentRow, RequirementRow, ReviewRow, StrategyRow,
} from "@/lib/db/quality-interested-parties";
import { SectionHint } from "@/components/ui/section-hint";
import { Badge, StrategyStatusBadge } from "./badges";

/**
 * QUALITY-12.3B3A · Historia, y cómo se mira una fecha.
 *
 * TRES ESTADOS QUE NO SE CONFUNDEN
 *
 *   Vigente    rige hoy.
 *   Sucedido   dejó de regir porque llegó otro que lo sustituye.
 *   Cerrado    dejó de regir y nadie lo sustituyó.
 *
 * Ninguno se ofrece para editar. Un histórico que se puede corregir deja de
 * responder «qué decíais entonces» y pasa a responder «qué decidís decir
 * ahora», que no es lo mismo y no sirve en una auditoría.
 *
 * El selector de fecha recarga la ficha entera en modo histórico: análisis,
 * requisitos, vínculos con procesos y estrategias de ESE día. No se mezcla con
 * lo de hoy, y en ese modo no hay un solo botón que escriba.
 */
export function HistorySection({
  history, requirements, strategies, reviews, asOf, basePath,
  help,
}: {
  history: AssessmentRow[];
  requirements: RequirementRow[];
  strategies: StrategyRow[];
  reviews: ReviewRow[];
  asOf: string | null;
  basePath: string;
  /** PE-02B4 · La ayuda administrada de la pantalla, ya cargada. */
  help?: InterestedPartiesHelp;
}) {
  const retirados = requirements.filter((r) => r.effectiveTo !== null);
  const cerradas = strategies.filter((s) => s.effectiveTo !== null);

  return (
    <section id="historia" className="space-y-4 scroll-mt-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Historia</h2>
        <SectionHint hint={interestedPartiesHint("history", help)} />
      </div>

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 rounded-lg border border-hairline bg-surface p-4">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink">Ver estado en fecha</span>
          <input
            type="date" name="fecha" defaultValue={asOf ?? ""}
            className="block rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
        >
          Ver ese día
        </button>
        {asOf ? (
          <Link href={basePath} className="px-1 py-2 text-sm font-medium text-loop hover:underline">
            Volver al estado actual
          </Link>
        ) : null}
        <p className="w-full text-xs text-ink-soft">
          Muestra qué regía ese día: el análisis vigente entonces, con sus requisitos y sus
          estrategias. Es una vista de solo lectura.
        </p>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Análisis</h3>
        <ol className="space-y-2">
          {history.map((a) => (
            <li key={a.id} className="rounded-lg border border-hairline bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  Desde el {a.effectiveFrom}
                  {a.effectiveTo ? ` hasta el ${a.effectiveTo}` : ""}
                </span>
                <Badge tone={a.effectiveTo === null ? "good" : "neutral"}>
                  {a.effectiveTo === null
                    ? "Vigente"
                    : a.status === "superseded" ? "Sucedido" : "Cerrado"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {RELEVANCE_LABEL[a.relevanceStatus]}
                {a.relevanceRationale ? ` · ${a.relevanceRationale}` : ""}
              </p>
              {a.summary ? <p className="mt-1 text-sm">{a.summary}</p> : null}
            </li>
          ))}
        </ol>
      </div>

      {retirados.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Necesidades, expectativas y requisitos retirados</h3>
          <ul className="space-y-1">
            {retirados.map((r) => (
              <li key={r.id} className="rounded-lg border border-hairline bg-surface p-2 text-sm">
                <span>{r.title}</span>
                <span className="ml-2 text-xs text-ink-soft">
                  {ENTRY_KIND_LABEL[r.entryKind as EntryKind]} · vigente del {r.effectiveFrom} al{" "}
                  {r.effectiveTo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cerradas.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Estrategias cerradas</h3>
          <ul className="space-y-1">
            {cerradas.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface p-2 text-sm"
              >
                <span>{s.title}</span>
                <span className="flex items-center gap-2 text-xs text-ink-soft">
                  <StrategyStatusBadge status={s.status} />
                  del {s.effectiveFrom} al {s.effectiveTo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviews.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Revisiones registradas</h3>
          <ul className="space-y-1">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-hairline bg-surface p-2 text-sm">
                <span>{r.reviewedOn}</span>
                <span className="ml-2 text-xs text-ink-soft">
                  {REVIEW_VERDICT_LABEL[r.verdict as ReviewVerdict] ?? r.verdict}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
