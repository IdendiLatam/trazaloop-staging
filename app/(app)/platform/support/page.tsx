// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Exige platform_staff activo.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { listPlatformSupportTicketsAction } from "@/server/actions/support";
import { TICKET_STATUSES, TICKET_STATUS_LABEL, TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_LABEL } from "@/lib/domain/support";
import { PlatformSupportTicketTable } from "@/components/domain/support/platform-support-ticket-table";

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; priority?: string; overdue?: string; org?: string }>;
}) {
  await requirePlatformStaff();
  const params = await searchParams;
  const tickets = await listPlatformSupportTicketsAction({
    status: params.status,
    category: params.category,
    priority: params.priority,
    overdueOnly: params.overdue === "1",
    organizationId: params.org,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets de soporte</h1>
        <p className="max-w-2xl text-sm text-ink-soft">Todos los tickets de todas las empresas.</p>
      </header>

      <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-5">
        {params.org ? <input type="hidden" name="org" value={params.org} /> : null}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Estado</span>
          <select name="status" defaultValue={params.status ?? ""} className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop">
            <option value="">Todos</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Categoría</span>
          <select name="category" defaultValue={params.category ?? ""} className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop">
            <option value="">Todas</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Prioridad</span>
          <select name="priority" defaultValue={params.priority ?? ""} className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop">
            <option value="">Todas</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TICKET_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} className="rounded border-hairline" />
          Solo vencidos
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop">
            Filtrar
          </button>
          <Link href="/platform/support" className="text-sm text-ink-soft hover:underline">
            Limpiar
          </Link>
        </div>
      </form>

      <PlatformSupportTicketTable tickets={tickets} />
    </div>
  );
}
