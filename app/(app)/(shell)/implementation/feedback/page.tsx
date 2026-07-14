// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listImplementationFeedbackAction } from "@/server/actions/implementation";
import {
  MODULE_LABEL,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  FEEDBACK_MODULES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  isFeedbackModuleGuard,
  isFeedbackCategoryGuard,
  isFeedbackSeverityGuard,
  isFeedbackStatusGuard,
  isFeedbackRelatedEntityTypeGuard,
  type FeedbackModule,
  type FeedbackRelatedEntityType,
} from "@/lib/db/implementation";
import { FeedbackForm } from "@/components/domain/implementation/feedback-form";
import { FeedbackItem } from "@/components/domain/implementation/feedback-item";
import { EmptyState } from "@/components/ui/empty-state";

type SearchParams = {
  module?: string;
  category?: string;
  severity?: string;
  status?: string;
  related_entity_type?: string;
  related_entity_id?: string;
};

export default async function ImplementationFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await requireSession();
  const org = await requireActiveOrg();
  const sp = await searchParams;

  const filters = {
    module: isFeedbackModuleGuard(sp.module) ? sp.module : undefined,
    category: isFeedbackCategoryGuard(sp.category) ? sp.category : undefined,
    severity: isFeedbackSeverityGuard(sp.severity) ? sp.severity : undefined,
    status: isFeedbackStatusGuard(sp.status) ? sp.status : undefined,
  };

  const feedback = await listImplementationFeedbackAction(filters);
  const canManageAny = org.roleCode === "admin" || org.roleCode === "quality";
  const canDelete = org.roleCode === "admin" || org.roleCode === "quality";

  const defaultModule: FeedbackModule | undefined = isFeedbackModuleGuard(sp.module)
    ? sp.module
    : undefined;
  const defaultRelatedEntityType: FeedbackRelatedEntityType | undefined =
    isFeedbackRelatedEntityTypeGuard(sp.related_entity_type) ? sp.related_entity_type : undefined;
  const defaultRelatedEntityId = sp.related_entity_id || undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Implementación</p>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback de la prueba real</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Registra errores, dudas o mejoras encontradas durante la prueba real
          con la empresa. No es un módulo de auditoría formal ni de planes de
          acción: es la bitácora de la implementación.
        </p>
        <Link href="/implementation" className="inline-block pt-1 text-sm text-loop hover:underline">
          ← Volver a Implementación
        </Link>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Registrar feedback</h2>
        <FeedbackForm
          defaultModule={defaultModule}
          defaultRelatedEntityType={defaultRelatedEntityType}
          defaultRelatedEntityId={defaultRelatedEntityId}
        />
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Filtrar</h2>
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-surface p-4">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-ink-soft">Módulo</span>
            <select name="module" defaultValue={sp.module ?? ""} className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {FEEDBACK_MODULES.map((m) => (
                <option key={m} value={m}>{MODULE_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-ink-soft">Categoría</span>
            <select name="category" defaultValue={sp.category ?? ""} className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
              <option value="">Todas</option>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-ink-soft">Severidad</span>
            <select name="severity" defaultValue={sp.severity ?? ""} className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
              <option value="">Todas</option>
              {FEEDBACK_SEVERITIES.map((s) => (
                <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-ink-soft">Estado</span>
            <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop">
            Filtrar
          </button>
          <Link href="/implementation/feedback" className="text-sm text-loop hover:underline">
            Limpiar filtros
          </Link>
        </form>
      </section>

      <section className="rounded-lg border border-hairline bg-surface">
        <h2 className="eyebrow border-b border-hairline px-4 py-3">
          Feedback registrado ({feedback.length})
        </h2>
        {feedback.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Todavía no hay feedback registrado."
              description="Usa el formulario de arriba para registrar el primer hallazgo, duda o mejora de la prueba real."
            />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {feedback.map((f) => (
              <FeedbackItem
                key={f.id}
                feedback={f}
                canManage={canManageAny || f.createdBy === user.id}
                canDelete={canDelete}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
