"use client";

import { useActionState } from "react";
import {
  addPlatformStaffAction,
  updatePlatformStaffStatusAction,
  type PlatformActionState,
} from "@/server/actions/platform";
import { PLATFORM_ROLES, PLATFORM_ROLE_LABEL, PLATFORM_STAFF_STATUSES } from "@/lib/domain/platform";
import type { PlatformStaffRow } from "@/lib/db/platform";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const initial: PlatformActionState = { error: null };

const STATUS_LABEL: Record<string, string> = { active: "Activo", suspended: "Suspendido", revoked: "Revocado" };
const STATUS_TONE: Record<string, string> = {
  active: "border-loop/30 bg-loop/5 text-loop-deep",
  suspended: "border-amber/40 bg-amber/10 text-amber",
  revoked: "border-hairline bg-paper text-ink-soft",
};

const ROLE_OPTIONS = PLATFORM_ROLES.map((r) => ({ value: r, label: PLATFORM_ROLE_LABEL[r] }));

function StaffRowActions({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(updatePlatformStaffStatusAction, initial);
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <select
          name="status"
          defaultValue="active"
          disabled={pending}
          className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {PLATFORM_STAFF_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </form>
      {state.error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** Personal de plataforma (Parte 5, Parte 11). Solo visible/administrable
 *  por superadmin — un support activo, aunque vea /platform, no ve esta
 *  sección de administración de personal (canManage). */
export function PlatformStaffList({
  staff,
  canManage,
}: {
  staff: PlatformStaffRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {staff.length === 0 ? (
        <EmptyState title="Sin personal de plataforma adicional." description="" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Correo</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                {canManage ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-2">{s.fullName ?? "—"}</td>
                  <td className="code px-3 py-2 text-xs">{s.email}</td>
                  <td className="px-3 py-2 text-xs">{PLATFORM_ROLE_LABEL[s.roleCode]}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2 text-right">
                      <StaffRowActions id={s.id} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? <AddStaffForm /> : null}
    </div>
  );
}

function AddStaffForm() {
  const [state, formAction, pending] = useActionState(addPlatformStaffAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <ErrorAlert message={state.error} />
      <p className="text-xs text-ink-soft">
        La persona debe tener ya una cuenta en Trazaloop (haberse registrado alguna vez) para
        poder agregarla como personal de plataforma.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Correo" name="email" type="email" required />
        <SelectField label="Rol de plataforma" name="role_code" options={ROLE_OPTIONS} required />
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="!w-auto">
            {pending ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
