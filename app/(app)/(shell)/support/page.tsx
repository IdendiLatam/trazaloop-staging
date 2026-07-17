// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { listSupportTicketsAction, type SupportFilters } from "@/server/actions/support";
import { TICKET_STATUSES, TICKET_STATUS_LABEL, TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_LABEL, FIRST_RESPONSE_TARGET_MESSAGE } from "@/lib/domain/support";
import { SupportTicketTable } from "@/components/domain/support/support-ticket-table";

export default async function SupportCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; priority?: string }>;
}) {
  const params = await searchParams;
  const filters: SupportFilters = {
    search: params.q,
    status: params.status,
    category: params.category,
    priority: params.priority,
  };
  const tickets = await listSupportTicketsAction(filters);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Sistema</p>
        <h1 className="text-2xl font-semibold tracking-tight">Centro de soporte</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Registra solicitudes de soporte y consulta el estado de tus tickets.
        </p>
        <p className="text-sm font-medium text-loop-deep">{FIRST_RESPONSE_TARGET_MESSAGE}</p>
        <div className="pt-2">
          <Link
            href="/support/new"
            className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Nuevo ticket
          </Link>
        </div>
      </header>

      <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-4">
        <label className="block sm:col-span-1">
          <span className="mb-1.5 block text-sm font-medium text-ink">Buscar</span>
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Asunto…"
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
          />
        </label>
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
        <div className="flex items-end gap-2 sm:col-span-4">
          <button type="submit" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop">
            Filtrar
          </button>
          <Link href="/support" className="text-sm text-ink-soft hover:underline">
            Limpiar filtros
          </Link>
        </div>
      </form>

      <SupportTicketTable tickets={tickets} />
    </div>
  );
}
