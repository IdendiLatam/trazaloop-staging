export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-12.3B3A · Ficha de una parte interesada.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  customerViewOf, getAssessment, getStakeholderDetail, listPeripheralRefs,
  listStrategies, resolvePeripheralLabels, searchPeripheralOptions, supplierViewOf,
} from "@/lib/db/quality-interested-parties";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import {
  canManageInterestedParties, historicalNotice, PERIPHERAL_REF_KINDS,
  type PeripheralRefKind,
} from "@/lib/domain/quality-interested-parties";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { AskCopilotButton } from "@/components/domain/quality/copilot/ask-button";
import { InterestedPartyDetail } from "@/components/domain/quality/interested-parties/detail-view";
import { HistorySection } from "@/components/domain/quality/interested-parties/history-section";

export const metadata = { title: "Parte interesada" };

const LISTA = "/quality/context/interested-parties";

/** Una fecha de la URL solo se acepta si es una fecha. Lo que no lo sea se
 *  ignora: preferimos enseñar el estado actual a fallar por un parámetro. */
function fechaValida(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export default async function InterestedPartyDetailPage({
  params, searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { assessmentId } = await params;
  const org = await requireQualityModule();
  const sp = await searchParams;
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  // El identificador de la URL sirve para saber DE QUIÉN hablamos; a partir de
  // ahí todo se resuelve por sujeto, para que el modo histórico pueda devolver
  // un análisis distinto del de la dirección sin romper el enlace.
  const ancla = await getAssessment(org.organizationId, assessmentId);
  if (!ancla) notFound();

  const asOf = fechaValida(uno("fecha"));
  const base = `${LISTA}/${assessmentId}`;
  const canManage = canManageInterestedParties(org.roleCode);

  const relKind = PERIPHERAL_REF_KINDS.includes(uno("rel") as PeripheralRefKind)
    ? (uno("rel") as PeripheralRefKind) : null;
  const relQuery = uno("rel_q") ?? "";

  const detalle = await getStakeholderDetail(
    org.organizationId,
    { kind: ancla.subjectKind, id: ancla.subjectId, categoryId: ancla.categoryId },
    { asOf: asOf ?? undefined },
  );

  if (!detalle.assessment) {
    return (
      <div className="max-w-3xl space-y-6">
        <Link href={base} className="text-sm text-loop hover:underline">
          ← {ancla.subjectLabel}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ancla.subjectLabel}</h1>
        <p className="rounded-lg border border-amber/40 bg-amber/5 p-3 text-sm text-ink">
          {asOf
            ? `${historicalNotice(asOf)} Ese día esta parte interesada todavía no tenía ningún análisis vigente.`
            : "Esta parte interesada no tiene ningún análisis vigente."}
        </p>
        <HistorySection
          history={detalle.history}
          requirements={[]}
          strategies={[]}
          reviews={[]}
          asOf={asOf}
          basePath={base}
        />
      </div>
    );
  }

  const vigente = detalle.assessment;

  const [cerradas, refs, processes, positions, customer, supplier, relOptions] =
    await Promise.all([
      listStrategies(org.organizationId, vigente.id, { includeEnded: true }),
      listPeripheralRefs(org.organizationId, "stakeholder_assessment", vigente.id),
      listQualityProcesses(org.organizationId),
      listQualityPositions(org.organizationId),
      vigente.subjectKind === "external_party"
        ? customerViewOf(org.organizationId, vigente.subjectId)
        : Promise.resolve(null),
      vigente.subjectKind === "external_party"
        ? supplierViewOf(org.organizationId, vigente.subjectId)
        : Promise.resolve(null),
      relKind && canManage && !asOf
        ? searchPeripheralOptions(org.organizationId, relKind, relQuery)
        : Promise.resolve([]),
    ]);

  const refLabels = await resolvePeripheralLabels(org.organizationId, refs);

  return (
    <div className="max-w-5xl space-y-4">
      {/* Las dos puertas de salida del dominio, arriba y juntas: preguntar a
          Intelligence sobre ESTA parte, y llevarse el papel. En modo histórico
          el PDF respeta la fecha que se está mirando; imprimir el estado de hoy
          bajo un encabezado del pasado sería firmar algo falso. */}
      <div className="flex flex-wrap items-center gap-2">
        <AskCopilotButton
          type="quality_stakeholder_assessment"
          id={vigente.id}
          label={`Parte interesada: ${vigente.subjectLabel}`}
        />
        {asOf ? (
          <ExportPdfButton
            exportKey="quality.interested-party.historical"
            filters={{ date: asOf }}
            label={`Descargar PDF del estado al ${asOf}`}
          />
        ) : (
          <ExportPdfButton
            exportKey="quality.interested-party.detail"
            id={vigente.id}
            label="Descargar PDF"
          />
        )}
      </div>

      <InterestedPartyDetail
        assessment={vigente}
        history={detalle.history}
        requirements={detalle.requirements}
        processLinks={detalle.processLinks}
        strategies={detalle.strategies}
        allStrategies={asOf ? detalle.strategies : cerradas}
        reviews={detalle.reviews}
        processes={processes.filter((p) => p.status !== "retired").map((p) => ({ id: p.id, name: p.name }))}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        refs={refs}
        refLabels={refLabels}
        customer={customer}
        supplier={supplier}
        relKind={relKind}
        relQuery={relQuery}
        relOptions={relOptions}
        basePath={base}
        listPath={LISTA}
        canManage={canManage}
        asOf={asOf}
      />
    </div>
  );
}
