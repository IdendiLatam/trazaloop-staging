// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
//
// Sprint 10C (Parte 16): el feedback deja de ser la experiencia
// principal — se reemplaza por el Centro de soporte. La ruta se
// conserva (no rompe enlaces internos existentes) pero ya no muestra el
// formulario/listado antiguo; implementation_feedback NUNCA se borra —
// cada fila con autor conocido ya quedó enlazada a un ticket real
// (source_type='implementation_feedback', migración 0061) y sigue
// consultable directamente en la base de datos si hace falta revisar
// historia.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";

export default async function ImplementationFeedbackPage() {
  await requireActiveOrg();

  return (
    <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
      <p className="eyebrow">Implementación</p>
      <h1 className="text-2xl font-semibold tracking-tight">El feedback ahora se gestiona desde el Centro de soporte.</h1>
      <p className="text-sm text-ink-soft">
        Registra solicitudes de soporte, haz seguimiento a su estado y consulta la conversación con
        el equipo de Trazaloop desde el nuevo Centro de soporte.
      </p>
      <div className="pt-2">
        <Link
          href="/support"
          className="inline-block rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
        >
          Ir al Centro de soporte
        </Link>
      </div>
    </div>
  );
}
