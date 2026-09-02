"use client";

import { useActionState, useState } from "react";
import {
  createDraftRevisionAction,
  publishRevisionAction,
  updateDraftLimitAction,
  updateDraftRevisionAction,
  type CommercialActionState,
} from "@/server/actions/commercial-console";
import type { PlanLimitRow, PlanRevisionRow } from "@/lib/db/commercial-console";
import {
  PLAN_DISPLAY_ORDER,
  RESOURCE_ORDER,
  describeRevisionChanges,
  formatLimit,
  formatPrice,
  resourceLabel,
} from "@/lib/domain/commercial-catalog";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: CommercialActionState = { error: null };

const ESTADO_LABEL: Record<string, string> = {
  draft: "Borrador",
  published: "Vigente",
  retired: "Retirada",
};

function limitesComoMapa(limits: PlanLimitRow[]) {
  return new Map(limits.map((l) => [l.resourceCode, { state: l.limitState, value: l.limitValue }]));
}

function FilaLimite({ code, limits }: { code: string; limits: PlanLimitRow[] }) {
  const l = limits.find((x) => x.resourceCode === code);
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-ink-soft">{resourceLabel(code)}</span>
      <span className="code text-right">
        {l ? formatLimit(code, l.limitState, l.limitValue) : "Sin configurar"}
      </span>
    </div>
  );
}

function PublicarForm({ revision, cambios }: {
  revision: PlanRevisionRow;
  cambios: { label: string; before: string; after: string }[];
}) {
  const [state, action, pending] = useActionState(publishRevisionAction, initial);
  return (
    <form action={action} className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
      <input type="hidden" name="revision_id" value={revision.id} />
      <p className="text-sm font-semibold text-amber-900">
        Publicar esta revisión cambia las condiciones que se ofrecen desde ya.
      </p>
      {/* No se confirma sobre un JSON: se enseña, en palabras, qué cambia. */}
      {cambios.length > 0 ? (
        <ul className="space-y-1 text-sm text-amber-900">
          {cambios.map((c) => (
            <li key={c.label}>
              <strong>{c.label}:</strong> {c.before} → {c.after}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-amber-900">
          No hay diferencias con la revisión vigente. Publicarla solo abriría un periodo nuevo.
        </p>
      )}
      <p className="text-xs text-amber-900">
        Las empresas ya asignadas a la revisión anterior <strong>no se mueven</strong>: su
        asignación sigue apuntando a la suya. Cambiar a una empresa de plan es una transición
        aparte, con motivo.
      </p>
      <ErrorAlert message={state.error} />
      <label className="block text-sm">
        <span className="mb-1 block text-amber-900">Escribe «publicar» para confirmar</span>
        <input
          name="confirm"
          required
          className="w-40 rounded-md border border-hairline bg-surface px-2 py-1 text-sm"
        />
      </label>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Publicando…" : "Publicar revisión"}
      </Button>
    </form>
  );
}

function EditarBorrador({ revision, limits }: { revision: PlanRevisionRow; limits: PlanLimitRow[] }) {
  const [precio, accionPrecio, pendPrecio] = useActionState(updateDraftRevisionAction, initial);
  const [limite, accionLimite, pendLimite] = useActionState(updateDraftLimitAction, initial);
  const [recurso, setRecurso] = useState(RESOURCE_ORDER[0]);

  return (
    <div className="space-y-3 rounded-md border border-hairline p-3">
      <form action={accionPrecio} className="space-y-2">
        <input type="hidden" name="revision_id" value={revision.id} />
        <p className="text-sm font-medium text-ink">Precio (unidades menores, antes de impuestos)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input name="monthly_price_minor" type="number" min={0} placeholder="Mensual"
            defaultValue={revision.monthlyPriceMinor ?? ""}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
          <input name="annual_price_minor" type="number" min={0} placeholder="Anual"
            defaultValue={revision.annualPriceMinor ?? ""}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
          <Button type="submit" disabled={pendPrecio} className="!w-auto">Guardar precio</Button>
        </div>
        <ErrorAlert message={precio.error} />
      </form>

      <form action={accionLimite} className="space-y-2">
        <input type="hidden" name="revision_id" value={revision.id} />
        <p className="text-sm font-medium text-ink">Condición comercial</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <select name="resource_code" value={recurso} onChange={(e) => setRecurso(e.target.value)}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm">
            {RESOURCE_ORDER.map((c) => (
              <option key={c} value={c}>{resourceLabel(c)}</option>
            ))}
          </select>
          <select name="limit_state" defaultValue="finite"
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm">
            <option value="finite">Con límite</option>
            <option value="unlimited">Sin límite</option>
            <option value="not_configured">Sin configurar</option>
          </select>
          <input name="limit_value" type="number" min={0} placeholder="Valor"
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
          <Button type="submit" disabled={pendLimite} className="!w-auto">Guardar condición</Button>
        </div>
        <p className="text-xs text-ink-soft">
          «Sin configurar» no es «sin límite»: es que nadie lo ha decidido, y el producto lo trata
          como una negativa.
        </p>
        <ErrorAlert message={limite.error} />
      </form>

      <div className="border-t border-hairline pt-2">
        {RESOURCE_ORDER.map((c) => <FilaLimite key={c} code={c} limits={limits} />)}
      </div>
    </div>
  );
}

export function PlanCatalogConsole({ revisions, limitsByRevision, canManage }: {
  revisions: PlanRevisionRow[];
  limitsByRevision: Record<string, PlanLimitRow[]>;
  canManage: boolean;
}) {
  const [nuevo, accionNuevo, pendNuevo] = useActionState(createDraftRevisionAction, initial);

  return (
    <div className="space-y-8">
      {PLAN_DISPLAY_ORDER.map((planCode) => {
        const delPlan = revisions.filter((r) => r.planCode === planCode);
        const vigente = delPlan.find((r) => r.status === "published" && r.effectiveTo === null) ?? null;
        const borrador = delPlan.find((r) => r.status === "draft") ?? null;
        const historia = delPlan.filter((r) => r !== vigente && r !== borrador);

        return (
          <section key={planCode} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold capitalize tracking-tight">{planCode}</h2>
              {vigente ? (
                <span className="text-sm text-ink-soft">
                  Revisión {vigente.revisionNumber} · vigente desde{" "}
                  {(vigente.effectiveFrom ?? "").slice(0, 10)}
                </span>
              ) : (
                <span className="text-sm text-ink-soft">Sin revisión vigente</span>
              )}
            </div>

            {vigente ? (
              <div className="rounded-lg border border-hairline bg-surface p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-soft">Precio mensual</p>
                    <p className="text-lg font-semibold">
                      {formatPrice(vigente.monthlyPriceMinor, vigente.currency)}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-ink-soft">Precio anual</p>
                    <p className="text-lg font-semibold">
                      {formatPrice(vigente.annualPriceMinor, vigente.currency)}
                    </p>
                  </div>
                  <div>
                    {RESOURCE_ORDER.map((c) => (
                      <FilaLimite key={c} code={c} limits={limitsByRevision[vigente.id] ?? []} />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {canManage && borrador ? (
              <>
                <p className="text-sm font-medium text-ink">
                  Borrador · revisión {borrador.revisionNumber}
                </p>
                <EditarBorrador revision={borrador} limits={limitsByRevision[borrador.id] ?? []} />
                <PublicarForm
                  revision={borrador}
                  cambios={describeRevisionChanges(
                    vigente
                      ? {
                          monthly: vigente.monthlyPriceMinor,
                          annual: vigente.annualPriceMinor,
                          currency: vigente.currency,
                          limits: limitesComoMapa(limitsByRevision[vigente.id] ?? []),
                        }
                      : null,
                    {
                      monthly: borrador.monthlyPriceMinor,
                      annual: borrador.annualPriceMinor,
                      currency: borrador.currency,
                      limits: limitesComoMapa(limitsByRevision[borrador.id] ?? []),
                    }
                  )}
                />
              </>
            ) : null}

            {canManage && !borrador ? (
              <form action={accionNuevo} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="plan_code" value={planCode} />
                <label className="text-sm">
                  <span className="mb-1 block text-ink-soft">Nota interna (opcional)</span>
                  <input name="internal_notes"
                    className="w-72 rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
                </label>
                <Button type="submit" disabled={pendNuevo} className="!w-auto">
                  Crear revisión sucesora
                </Button>
              </form>
            ) : null}

            {historia.length > 0 ? (
              <details className="rounded-md border border-hairline bg-surface p-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  Historia de revisiones ({historia.length})
                </summary>
                <p className="mt-2 text-xs text-ink-soft">
                  Lo que se ofreció antes no se esconde: hubo empresas que contrataron bajo esas
                  condiciones.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {historia.map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        Revisión {r.revisionNumber} · {ESTADO_LABEL[r.status] ?? r.status}
                      </span>
                      <span className="code text-xs text-ink-soft">
                        {(r.effectiveFrom ?? "").slice(0, 10)} → {(r.effectiveTo ?? "").slice(0, 10) || "—"}
                        {" · "}
                        {formatPrice(r.monthlyPriceMinor, r.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}
      <ErrorAlert message={nuevo.error} />
    </div>
  );
}
