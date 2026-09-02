// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { NewSupportTicketForm } from "@/components/domain/support/new-support-ticket-form";
import { getSupportEntitlementAction } from "@/server/actions/support";
import { isTicketModule, isTicketCategory } from "@/lib/domain/support";
import {
  activeShellModuleFrom,
  moduleAwareHref,
} from "@/lib/modules/registry";

export default async function NewSupportTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // `module` como nombre de variable está prohibido en Next (colisiona con el
  // objeto de módulo de CommonJS); antes llegaba desestructurado y no se veía.
  const moduleParam = one(params.module);
  const category = one(params.category);
  // PT-03A · Pantalla transversal: el enlace de vuelta conserva el módulo
  // desde el que se llegó, en vez de devolver el shell a PCR.
  const activeModule = activeShellModuleFrom("/support/new", params);
  const defaultModule = isTicketModule(moduleParam) ? moduleParam : "other";
  const defaultCategory = isTicketCategory(category) ? category : "technical_support";

  // PE-04B5 · Lo que el plan incluye se resuelve en SERVIDOR y se le dice a la
  // pantalla. La interfaz nunca decide un derecho comercial: solo lo refleja.
  const entitlement = await getSupportEntitlementAction();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href={moduleAwareHref("/support", activeModule.key)} className="hover:underline">
            Centro de soporte
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo ticket</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Cuéntanos qué necesitas — problemas técnicos, dudas de uso o solicitudes sobre tu plan.
        </p>
      </header>

      <NewSupportTicketForm defaultModule={defaultModule} defaultCategory={defaultCategory} moduleKey={activeModule.key} entitlement={entitlement} />
    </div>
  );
}
