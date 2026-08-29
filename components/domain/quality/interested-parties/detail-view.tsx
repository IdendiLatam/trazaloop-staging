import Link from "next/link";
import {
  canMutate as puedeEscribir, historicalNotice,
} from "@/lib/domain/quality-interested-parties";
import type { PeripheralRefKind } from "@/lib/domain/quality-interested-parties";
import type {
  AssessmentRow, CustomerReuse, PeripheralRef, RequirementProcessRow,
  RequirementRow, ReviewRow, StrategyRow, SupplierReuse,
} from "@/lib/db/quality-interested-parties";
import { AssessmentSection } from "./assessment-section";
import { RequirementsSection } from "./requirements-section";
import { StrategiesSection } from "./strategies-section";
import { MonitoringSection } from "./monitoring-section";
import { ReviewsSection } from "./reviews-section";
import { HistorySection } from "./history-section";
import { HistoricalBadge, RelevanceBadge, SubjectKindBadge } from "./badges";

/**
 * QUALITY-12.3B3A · La ficha de una parte interesada.
 *
 * SECCIONES APILADAS, NO PESTAÑAS.
 *
 * Las pestañas esconden. Aquí lo que se necesita es leer de arriba abajo —qué
 * decidimos, qué pide, dónde se atiende, qué hacemos, cómo lo seguimos, qué se
 * revisó— y en móvil una fila de seis pestañas no cabe. Con secciones y un
 * índice que salta a cada una funciona igual en las dos anchuras, y el
 * navegador puede buscar dentro con Ctrl+F.
 *
 * EL MODO HISTÓRICO APAGA TODO
 *
 * Cuando se mira una fecha pasada, `canMutate` es falso para todas las
 * secciones a la vez: no hay una que respete el modo histórico y otra que se
 * despiste. La regla vive en el dominio, no aquí.
 */

const SECCIONES = [
  { id: "resumen", label: "Resumen" },
  { id: "requisitos", label: "Necesidades y requisitos" },
  { id: "estrategias", label: "Estrategias" },
  { id: "seguimiento", label: "Seguimiento" },
  { id: "revisiones", label: "Revisiones" },
  { id: "historia", label: "Historia" },
] as const;

export function InterestedPartyDetail({
  assessment, history, requirements, processLinks, strategies, allStrategies, reviews,
  processes, positions, refs, refLabels, customer, supplier,
  relKind, relQuery, relOptions, basePath, listPath, canManage, asOf,
}: {
  assessment: AssessmentRow;
  history: AssessmentRow[];
  requirements: RequirementRow[];
  processLinks: RequirementProcessRow[];
  /** Las que rigen: con las que se trabaja. */
  strategies: StrategyRow[];
  /** Las mismas más las cerradas, solo para la historia. Dos listas y no una
   *  con un filtro dentro: la sección de trabajo no debe tener que acordarse
   *  de excluir lo cerrado. */
  allStrategies: StrategyRow[];
  reviews: ReviewRow[];
  processes: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  refs: PeripheralRef[];
  refLabels: Map<string, string>;
  customer: CustomerReuse | null;
  supplier: SupplierReuse | null;
  relKind: PeripheralRefKind | null;
  relQuery: string;
  relOptions: { id: string; label: string }[];
  basePath: string;
  listPath: string;
  canManage: boolean;
  asOf: string | null;
}) {
  const editable = puedeEscribir({ canManage, asOf });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href={listPath} className="text-sm text-loop hover:underline">
          ← Partes interesadas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{assessment.subjectLabel}</h1>
        <div className="flex flex-wrap gap-1">
          <SubjectKindBadge kind={assessment.subjectKind} />
          <RelevanceBadge status={assessment.relevanceStatus} />
          {asOf ? <HistoricalBadge asOf={asOf} /> : null}
        </div>
        <p className="text-sm text-ink-soft">
          {assessment.categoryName ?? "Sin categoría"}
        </p>
      </header>

      {asOf ? (
        <p
          role="status"
          className="rounded-lg border border-amber/40 bg-amber/5 p-3 text-sm text-ink"
        >
          {historicalNotice(asOf)}{" "}
          <Link href={basePath} className="font-medium text-loop hover:underline">
            Volver al estado actual
          </Link>
        </p>
      ) : null}

      <nav aria-label="Secciones de la ficha" className="flex flex-wrap gap-1 border-b border-hairline pb-2">
        {SECCIONES.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <AssessmentSection
        assessment={assessment}
        canMutate={editable}
        historyCount={history.length}
      />

      <RequirementsSection
        assessmentId={assessment.id}
        requirements={requirements}
        processLinks={processLinks}
        processes={processes}
        canMutate={editable}
      />

      <StrategiesSection
        assessmentId={assessment.id}
        strategies={strategies}
        requirements={requirements}
        positions={positions}
        canMutate={editable}
      />

      <MonitoringSection
        assessmentId={assessment.id}
        strategies={strategies}
        refs={refs}
        refLabels={refLabels}
        customer={customer}
        supplier={supplier}
        relKind={relKind}
        relQuery={relQuery}
        relOptions={relOptions}
        basePath={basePath}
        canMutate={editable}
      />

      <ReviewsSection
        assessmentId={assessment.id}
        strategies={strategies}
        reviews={reviews}
        canMutate={editable}
      />

      <HistorySection
        history={history}
        requirements={requirements}
        strategies={allStrategies}
        reviews={reviews}
        asOf={asOf}
        basePath={basePath}
      />
    </div>
  );
}
