"use client";

import { useActionState, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  setOrganizationModuleAccessAction,
  type ModuleAccessActionState,
} from "@/server/actions/platform-modules";
import type { PlatformModuleRow } from "@/lib/db/module-access";
import { DERIVED_STATE_LABEL } from "@/lib/modules/messages";

/**
 * Trazaloop · Sprint T9F · "Módulos y planes de la empresa" (consola de
 * superadministrador). Muestra el estado comercial de cada módulo y permite
 * cambiarlo (Deshabilitado / Demo permanente / Full / Extra) con confirmación
 * accesible. Los módulos "Próximamente" se muestran sin controles. La
 * autorización real vive en la Server Action + la RPC SQL.
 */

type TargetState = "disabled" | "demo_permanent" | "full" | "extra";

const TARGET_OPTIONS: { value: TargetState; label: string; help: string; confirm: string }[] = [
  {
    value: "demo_permanent",
    label: "Demo permanente",
    help: "Acceso limitado sin fecha de vencimiento.",
    confirm:
      "La empresa conservará acceso al módulo en modo Demo sin fecha de vencimiento. Se mantendrán las limitaciones del plan Demo.",
  },
  {
    value: "full",
    label: "Full",
    help: "Acceso funcional completo con almacenamiento estándar.",
    confirm:
      "La empresa tendrá acceso completo al módulo con la capacidad de almacenamiento del plan Full.",
  },
  {
    value: "extra",
    label: "Extra",
    help: "Acceso funcional completo con almacenamiento ampliado.",
    confirm:
      "La empresa tendrá acceso completo al módulo con capacidad ampliada de almacenamiento.",
  },
  {
    value: "disabled",
    label: "Deshabilitado",
    help: "Sin acceso al módulo. Los datos se conservarán.",
    confirm:
      "La empresa perderá el acceso al módulo, pero sus datos se conservarán. El acceso podrá habilitarse nuevamente.",
  },
];

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(bytes % (1024 * 1024 * 1024) === 0 ? 0 : 1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OrganizationModulesSection({
  organizationId,
  modules,
  canManage,
}: {
  organizationId: string;
  modules: PlatformModuleRow[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<ModuleAccessActionState, FormData>(
    setOrganizationModuleAccessAction,
    { error: null, ok: false }
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingChange, setPendingChange] = useState<{
    moduleCode: string;
    moduleName: string;
    target: TargetState;
  } | null>(null);

  const confirmOption = pendingChange
    ? TARGET_OPTIONS.find((o) => o.value === pendingChange.target) ?? null
    : null;

  return (
    <section className="space-y-3" aria-labelledby="org-modules-heading">
      <h2 id="org-modules-heading" className="text-lg font-semibold">
        Módulos y planes de la empresa
      </h2>

      {state.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" aria-live="polite" className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm text-loop-deep">
          Estado del módulo actualizado.
        </p>
      )}

      {/* Form oculto reutilizado por el diálogo de confirmación. */}
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="organization_id" value={organizationId} />
        <input type="hidden" name="module_code" value={pendingChange?.moduleCode ?? ""} />
        <input type="hidden" name="target_state" value={pendingChange?.target ?? ""} />
      </form>

      <ul className="space-y-3">
        {modules.map((m) => (
          <li key={m.moduleCode} className="rounded-lg border border-hairline bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{m.name}</span>
                  <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
                    {DERIVED_STATE_LABEL[m.access.derivedState]}
                  </span>
                </div>
                <p className="text-sm text-ink-soft">{m.description}</p>
                {m.status === "coming_soon" ? (
                  <p className="text-xs text-ink-soft">
                    Estado global: Próximamente · No disponible para asignación.
                  </p>
                ) : (
                  <dl className="grid gap-x-6 gap-y-0.5 text-xs text-ink-soft sm:grid-cols-2">
                    <div>
                      <dt className="inline font-medium">access_mode:</dt>{" "}
                      <dd className="inline">{m.accessMode ?? "sin asignar"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">enabled:</dt>{" "}
                      <dd className="inline">{m.enabled === null ? "—" : m.enabled ? "sí" : "no"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Vigencia:</dt>{" "}
                      <dd className="inline">
                        {m.accessExpiresAt ? `finaliza el ${formatDate(m.accessExpiresAt)}` : "sin vencimiento"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Cuota:</dt>{" "}
                      <dd className="inline">{formatBytes(m.storageLimitBytes)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Almacenamiento utilizado:</dt>{" "}
                      <dd className="inline">
                        {m.storageUsedBytes === null
                          ? "—"
                          : `${(m.storageUsedBytes / 1048576).toFixed(m.storageUsedBytes > 0 && m.storageUsedBytes < 1048576 ? 2 : 1)} MB`}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Inicio:</dt>{" "}
                      <dd className="inline">{formatDate(m.accessStartedAt)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Última modificación:</dt>{" "}
                      <dd className="inline">
                        {formatDate(m.updatedAt)}
                        {m.updatedByName ? ` · ${m.updatedByName}` : ""}
                      </dd>
                    </div>
                    {!m.killSwitchActive && (
                      <div className="sm:col-span-2 text-amber">
                        El interruptor global de este módulo está apagado: el acceso está bloqueado para
                        todas las empresas hasta que se reactive.
                      </div>
                    )}
                  </dl>
                )}
              </div>

              {m.status === "functional" && canManage && (
                <div className="flex flex-wrap gap-2">
                  {TARGET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setPendingChange({ moduleCode: m.moduleCode, moduleName: m.name, target: opt.value })
                      }
                      className="rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:border-loop disabled:cursor-not-allowed disabled:opacity-60"
                      title={opt.help}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {m.status === "coming_soon" && (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-xs text-ink-soft"
                  title="Este módulo estará disponible próximamente."
                >
                  No disponible
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingChange !== null && confirmOption !== null}
        title={pendingChange ? `${confirmOption?.label} · ${pendingChange.moduleName}` : ""}
        description={confirmOption?.confirm ?? ""}
        confirmLabel={confirmOption?.label ?? "Confirmar"}
        destructive={pendingChange?.target === "disabled"}
        pending={pending}
        onConfirm={() => {
          formRef.current?.requestSubmit();
          // Cierre optimista: los botones de la fila se deshabilitan mientras
          // `pending`, y el resultado se comunica con el banner de estado.
          setPendingChange(null);
        }}
        onCancel={() => setPendingChange(null)}
      />
    </section>
  );
}
