// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { NewSupportTicketForm } from "@/components/domain/support/new-support-ticket-form";
import { isTicketModule, isTicketCategory } from "@/lib/domain/support";

export default async function NewSupportTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; category?: string }>;
}) {
  const { module, category } = await searchParams;
  const defaultModule = isTicketModule(module) ? module : "other";
  const defaultCategory = isTicketCategory(category) ? category : "technical_support";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/support" className="hover:underline">
            Centro de soporte
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo ticket</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Cuéntanos qué necesitas — problemas técnicos, dudas de uso o solicitudes sobre tu plan.
        </p>
      </header>

      <NewSupportTicketForm defaultModule={defaultModule} defaultCategory={defaultCategory} />
    </div>
  );
}
