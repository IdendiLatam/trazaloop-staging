"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import {
  MONITORING_METHOD_LABEL, PERIPHERAL_REF_KINDS, PERIPHERAL_REF_LABEL,
  RELATION_LABEL, type MonitoringMethod, type PeripheralRefKind,
} from "@/lib/domain/quality-interested-parties";
import type {
  CustomerReuse, PeripheralRef, StrategyRow, SupplierReuse,
} from "@/lib/db/quality-interested-parties";
import {
  linkPeripheralAction, unlinkPeripheralAction, type IpActionState,
} from "@/server/actions/quality-interested-parties";
import { Badge } from "./badges";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · Seguimiento y contexto relacionado.
 *
 * DOS COSAS QUE NO SE COPIAN
 *
 * Si esta parte es un cliente o un proveedor, aquí se ENLAZA a Voz del cliente
 * y a Proveedores, con el dato justo para saber si hace falta ir. No se
 * reproducen sus métricas: dos sitios enseñando el mismo número acaban
 * enseñando números distintos, y entonces hay que decidir cuál miente.
 *
 * Y lo relacionado se dice en lenguaje de producto —«Relacionar indicador»—,
 * nunca con nombres de columna. `owner_kind` y `ref_kind` no son palabras de
 * nadie.
 *
 * LO QUE ESTA PANTALLA NO PERMITE RELACIONAR
 *
 * Ni requisito→proceso ni estrategia→requisito. Son las dos relaciones
 * centrales: tienen tabla propia porque tienen vigencia, y se registran en su
 * sección. La base también las rechaza aquí desde 0150, pero una interfaz que
 * ofrece algo que la base va a rechazar es una interfaz que miente.
 */
export function MonitoringSection({
  assessmentId, strategies, refs, refLabels, customer, supplier,
  relKind, relQuery, relOptions, basePath, canMutate,
}: {
  assessmentId: string;
  strategies: StrategyRow[];
  refs: PeripheralRef[];
  refLabels: Map<string, string>;
  customer: CustomerReuse | null;
  supplier: SupplierReuse | null;
  relKind: PeripheralRefKind | null;
  relQuery: string;
  relOptions: { id: string; label: string }[];
  basePath: string;
  canMutate: boolean;
}) {
  const [enlace, enlaceAction] = useActionState(linkPeripheralAction, inicial);
  const [quitar, quitarAction] = useActionState(unlinkPeripheralAction, inicial);

  const metodos = [...new Set(
    strategies.map((s) => s.monitoringMethod).filter(Boolean) as string[]
  )];

  return (
    <section id="seguimiento" className="space-y-4 scroll-mt-20">
      <h2 className="text-lg font-semibold">Seguimiento</h2>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <p className="text-xs font-medium text-ink-soft">Cómo se sigue esta relación</p>
        {metodos.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">
            Ninguna estrategia vigente define todavía un método de seguimiento. No se presume
            ninguno: la mayoría de las partes interesadas no se miden con una encuesta.
          </p>
        ) : (
          <p className="mt-1 flex flex-wrap gap-1">
            {metodos.map((m) => (
              <Badge key={m} tone="info">
                {MONITORING_METHOD_LABEL[m as MonitoringMethod] ?? m}
              </Badge>
            ))}
          </p>
        )}
      </div>

      {customer || supplier ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Lo que ya sabemos en otros módulos</h3>
          <p className="text-xs text-ink-soft">
            Es la misma empresa, no una copia. Aquí solo se enlaza; los datos viven allí.
          </p>
          <ul className="space-y-2">
            {customer ? (
              <li className="rounded-lg border border-hairline bg-surface p-3 text-sm">
                <span className="font-medium">Voz del cliente</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Relación: {customer.relationshipStatus}
                  {customer.segment ? ` · ${customer.segment}` : ""}
                  {" · "}
                  {customer.openFeedback === 0
                    ? "sin retroalimentación abierta"
                    : `${customer.openFeedback} abiertas`}
                  {customer.lastFeedbackOn ? ` · última el ${customer.lastFeedbackOn}` : ""}
                </span>
                <Link
                  href={`/quality/customer-voice/customers/${customer.customerProfileId}`}
                  className="mt-1 inline-block text-xs font-medium text-loop hover:underline"
                >
                  Abrir en Voz del cliente
                </Link>
              </li>
            ) : null}
            {supplier ? (
              <li className="rounded-lg border border-hairline bg-surface p-3 text-sm">
                <span className="font-medium">Proveedores</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Relación: {supplier.relationshipStatus}
                  {supplier.lastEvaluatedOn
                    ? ` · última evaluación el ${supplier.lastEvaluatedOn}`
                    : " · sin evaluación cerrada"}
                  {supplier.lastResultBand ? ` · resultado ${supplier.lastResultBand}` : ""}
                  {supplier.nextReviewOn ? ` · próxima el ${supplier.nextReviewOn}` : ""}
                </span>
                <Link
                  href={`/quality/suppliers/${supplier.supplierProfileId}`}
                  className="mt-1 inline-block text-xs font-medium text-loop hover:underline"
                >
                  Abrir en Proveedores
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Relacionado</h3>
        <p className="text-xs text-ink-soft">
          Indicadores, objetivos, riesgos, acciones o documentos que tienen que ver con esta
          parte interesada. Son enlaces de contexto: cada cosa se sigue gestionando en su sitio.
        </p>

        <ErrorAlert message={enlace.error ?? quitar.error} />
        <SuccessAlert
          message={(enlace.success ? enlace.message : null) ?? (quitar.success ? quitar.message : null) ?? null}
        />

        {refs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-surface p-3 text-sm text-ink-soft">
            Nada relacionado todavía.
          </p>
        ) : (
          <ul className="space-y-1">
            {refs.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface p-2 text-sm"
              >
                <span>
                  <Badge tone="neutral">
                    {PERIPHERAL_REF_LABEL[r.refKind as PeripheralRefKind] ?? "Registro"}
                  </Badge>
                  <span className="ml-2">
                    {refLabels.get(`${r.refKind}:${r.refId}`) ?? "Sin nombre"}
                  </span>
                  <span className="ml-2 text-xs text-ink-soft">{RELATION_LABEL[r.relation]}</span>
                </span>
                {canMutate ? (
                  <form action={quitarAction}>
                    <input type="hidden" name="reference_id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded border border-hairline px-2 py-0.5 text-xs font-medium hover:border-loop"
                    >
                      Quitar
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canMutate ? (
          <details className="rounded-lg border border-hairline bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium text-loop">Relacionar</summary>

            <form method="get" action={basePath} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-ink">Qué quieres relacionar</span>
                <select name="rel" defaultValue={relKind ?? ""} className={inputClass}>
                  <option value="" disabled>Elige</option>
                  {PERIPHERAL_REF_KINDS.map((k) => (
                    <option key={k} value={k}>{PERIPHERAL_REF_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 space-y-1">
                <span className="block text-xs font-medium text-ink">Buscar</span>
                <input type="search" name="rel_q" defaultValue={relQuery} className={inputClass} />
              </label>
              <button
                type="submit"
                className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
              >
                Buscar
              </button>
            </form>

            {relKind ? (
              <form action={enlaceAction} className="mt-3 space-y-3 border-t border-hairline pt-3">
                <input type="hidden" name="owner_kind" value="stakeholder_assessment" />
                <input type="hidden" name="owner_id" value={assessmentId} />
                <input type="hidden" name="ref_kind" value={relKind} />
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">
                    {PERIPHERAL_REF_LABEL[relKind]}
                  </span>
                  <select name="ref_id" required className={inputClass} defaultValue="">
                    <option value="" disabled>
                      {relOptions.length === 0 ? "Sin resultados" : "Elige uno"}
                    </option>
                    {relOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Qué relación tiene</span>
                  <select name="relation" className={inputClass} defaultValue="related">
                    <option value="related">{RELATION_LABEL.related}</option>
                    <option value="origin">{RELATION_LABEL.origin}</option>
                    <option value="evidence">{RELATION_LABEL.evidence}</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Nota (opcional)</span>
                  <input type="text" name="note" className={inputClass} />
                </label>
                <button
                  type="submit"
                  disabled={relOptions.length === 0}
                  className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
                >
                  Relacionar
                </button>
              </form>
            ) : null}
          </details>
        ) : null}
      </div>
    </section>
  );
}
