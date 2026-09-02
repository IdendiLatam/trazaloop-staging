"use client";

import { useActionState } from "react";
import { assignPlanAction, type CommercialActionState } from "@/server/actions/commercial-console";
import type { AssignmentRow, CommercialEventRow, PlanRevisionRow } from "@/lib/db/commercial-console";
import type { SupportEntitlement } from "@/lib/db/support-entitlements";
import type { OrganizationStorageStatus } from "@/lib/db/organization-storage";
import type { AiCreditStatus } from "@/lib/db/organization-usage";
import { formatPrice } from "@/lib/domain/commercial-catalog";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: CommercialActionState = { error: null };

const GRANT_LABEL: Record<string, string> = {
  base: "Base",
  trial: "Prueba",
  sold: "Vendido",
  courtesy: "Cortesía",
};

/**
 * Trazaloop · PE-04B5 · Lo comercial de una empresa, sin colapsar la verdad.
 *
 * CONFIGURADO y EFECTIVO son cosas distintas y se enseñan por separado. Una
 * empresa con base Free y una prueba de Full activa está CONFIGURADA como
 * «Free + prueba Full» y resuelve EFECTIVAMENTE a Full. Meter las dos en un
 * solo campo obliga a elegir cuál mentir.
 */
export function OrganizationCommercialPanel({
  organizationId,
  effectivePlan,
  assignments,
  events,
  support,
  storage,
  ai,
  revisions,
  functionalModules,
  canManage,
}: {
  organizationId: string;
  effectivePlan: string | null;
  assignments: AssignmentRow[];
  events: CommercialEventRow[];
  support: SupportEntitlement | null;
  storage: OrganizationStorageStatus | null;
  ai: AiCreditStatus | null;
  revisions: PlanRevisionRow[];
  functionalModules: { code: string; name: string }[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(assignPlanAction, initial);
  const vigentes = revisions.filter((r) => r.status === "published" && r.effectiveTo === null);
  const ahora = new Date().toISOString();
  const activas = assignments.filter((a) => a.startsAt <= ahora && (a.endsAt === null || a.endsAt > ahora));
  const prueba = activas.find((a) => a.grantKind === "trial") ?? null;

  return (
    <div className="space-y-6">
      {/* ---- Configurado vs efectivo -------------------------------------- */}
      <section className="space-y-3">
        <h2 className="eyebrow">Estado comercial</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Plan efectivo</p>
            <p className="text-xl font-semibold capitalize">
              {effectivePlan ?? "No se pudo determinar"}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Lo que el servidor aplica ahora mismo. Sale del catálogo canónico, no de la
              suscripción heredada.
            </p>
            {prueba ? (
              <p className="mt-2 text-xs text-amber-700">
                Prueba activa hasta {(prueba.endsAt ?? "").slice(0, 10)}. Al terminar, la empresa
                vuelve a su base sin que nadie tenga que hacer nada.
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Asignaciones configuradas</p>
            {activas.length === 0 ? (
              <p className="text-sm text-ink-soft">Ninguna vigente.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {activas.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2">
                    <span className="capitalize">
                      {a.planCode} · rev. {a.revisionNumber}
                      {a.scope === "module" ? ` · ${a.moduleCode}` : " · empresa"}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {GRANT_LABEL[a.grantKind] ?? a.grantKind} · {a.source}
                      {a.endsAt ? ` · hasta ${a.endsAt.slice(0, 10)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ---- Soporte ------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="eyebrow">Soporte</h2>
        <div className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          {support === null || support.state === "UNAVAILABLE" ? (
            <p className="text-ink-soft">No se pudo resolver el derecho de soporte.</p>
          ) : (
            <>
              <p>
                Reporte técnico: <strong>disponible</strong> · no consume casos.
              </p>
              <p>
                Orientación funcional:{" "}
                {support.functionalGuidanceAllowed ? (
                  <strong>
                    {support.functionalCasesUsed ?? 0} de {support.functionalCasesLimit ?? 0} usados
                    este mes ({support.functionalCasesRemaining ?? 0} disponibles)
                  </strong>
                ) : (
                  <strong>no incluida en su plan</strong>
                )}
              </p>
              {support.functionalGuidanceAllowed ? (
                <p className="mt-1 text-xs text-ink-soft">
                  Prioridad comercial: {support.commercialPriority === "prioritized" ? "prioritaria" : "normal"} ·
                  objetivo de primera respuesta: 1 día hábil. Un incidente técnico crítico de
                  cualquier plan va por delante.
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* ---- Consumo ------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="eyebrow">Consumo frente a lo contratado</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-hairline bg-surface p-3">
            <dt className="text-xs text-ink-soft">Almacenamiento</dt>
            <dd className="text-sm font-semibold">
              {storage ? `${storage.state} · ${storage.usedBytes} de ${storage.quotaBytes ?? "—"} bytes` : "No disponible"}
            </dd>
          </div>
          <div className="rounded-lg border border-hairline bg-surface p-3">
            <dt className="text-xs text-ink-soft">Créditos de Intelligence</dt>
            <dd className="text-sm font-semibold">
              {ai ? `${ai.monthlyUsed} de ${ai.monthlyLimit ?? "—"}` : "No disponible"}
              {ai?.trialActive ? ` · prueba ${ai.trialUsed ?? 0}/${ai.trialTotal ?? 0}` : ""}
            </dd>
            {/*
              Diagnóstico: durante una prueba el plan del producto y el plan del
              que sale la bolsa mensual NO son el mismo, y esa diferencia es
              justo la que hay que poder ver desde aquí. Solo se muestra cuando
              difieren: si coinciden, decirlo sería ruido.
            */}
            {ai?.monthlyPlanCode && ai.monthlyPlanCode !== ai.planCode ? (
              <dd className="mt-1 text-xs text-ink-soft">
                Bolsa mensual del plan <strong>{ai.monthlyPlanCode}</strong>; el plan
                efectivo es <strong>{ai.planCode}</strong> por la prueba, que no la eleva.
              </dd>
            ) : null}
          </div>
          <div className="rounded-lg border border-hairline bg-surface p-3">
            <dt className="text-xs text-ink-soft">Periodo</dt>
            <dd className="text-sm font-semibold">{ai?.periodMonth ?? support?.period ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {/* ---- Transición comercial ------------------------------------------ */}
      {canManage ? (
        <section className="space-y-2">
          <h2 className="eyebrow">Transición comercial</h2>
          <form action={action} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
            <input type="hidden" name="organization_id" value={organizationId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-ink-soft">Revisión a asignar</span>
                <select name="plan_revision_id" required
                  className="w-full rounded-md border border-hairline bg-surface px-2 py-1 text-sm">
                  {vigentes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.planCode} · rev. {r.revisionNumber} · {formatPrice(r.monthlyPriceMinor, r.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink-soft">Alcance</span>
                <select name="scope" defaultValue="organization"
                  className="w-full rounded-md border border-hairline bg-surface px-2 py-1 text-sm">
                  <option value="organization">Toda la empresa</option>
                  <option value="module">Un módulo</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink-soft">Módulo (si el alcance es de módulo)</span>
                <select name="module_code"
                  className="w-full rounded-md border border-hairline bg-surface px-2 py-1 text-sm">
                  <option value="">—</option>
                  {/* Solo módulos FUNCIONALES: `core` no es un entitlement
                      comercial, y si lo fuera toda empresa resolvería a ese
                      plan y el nivel dejaría de significar nada. */}
                  {functionalModules.map((m) => (
                    <option key={m.code} value={m.code}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink-soft">Fin (opcional)</span>
                <input name="ends_at" type="date"
                  className="w-full rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">Motivo (obligatorio)</span>
              <textarea name="reason" required rows={2}
                placeholder="Por qué se hace este cambio. Queda en la historia comercial de la empresa."
                className="w-full rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
            </label>

            {/* Impacto, ANTES de confirmar. Y sin bloquear: una empresa puede
                quedar legítimamente por encima de su nueva cuota. */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Antes de cambiar</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>
                  Almacenamiento actual: {storage ? `${storage.usedBytes} bytes` : "no disponible"}. Si la
                  nueva cuota es menor, la empresa quedará por encima del límite.
                </li>
                <li>
                  Créditos de Intelligence ya consumidos este mes: {ai?.monthlyUsed ?? "—"}. Lo
                  consumido sigue consumido; bajar de plan no regala un mes nuevo.
                </li>
                <li>
                  Bajar a Free vuelve a aplicar el reloj de uso (30 min al día, 300 al mes) y, al
                  agotarse, el modo consulta.
                </li>
                <li>
                  Los casos de orientación funcional ya usados este mes <strong>no se reinician</strong>.
                </li>
              </ul>
              <p className="mt-2 font-semibold">NO SE BORRARÁ NINGÚN DATO.</p>
            </div>

            <ErrorAlert message={state.error} />
            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">Escribe «cambiar» para confirmar</span>
              <input name="confirm" required
                className="w-40 rounded-md border border-hairline bg-surface px-2 py-1 text-sm" />
            </label>
            <Button type="submit" disabled={pending} className="!w-auto">
              {pending ? "Aplicando…" : "Aplicar transición"}
            </Button>
          </form>
        </section>
      ) : null}

      {/* ---- Historia ------------------------------------------------------ */}
      {events.length > 0 ? (
        <section className="space-y-2">
          <h2 className="eyebrow">Historia comercial</h2>
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border border-hairline bg-surface p-3">
                <p>
                  <span className="capitalize">{e.previousPlanCode ?? "sin plan"}</span> →{" "}
                  <strong className="capitalize">{e.newPlanCode}</strong>
                  {e.moduleCode ? ` · ${e.moduleCode}` : " · empresa"} ·{" "}
                  {e.effectiveFrom.slice(0, 10)}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{e.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
