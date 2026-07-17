import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getMyLegalAcceptanceStatusAction } from "@/server/actions/legal";

/**
 * Exige sesión + aceptación de los documentos legales activos requeridos
 * (términos + privacidad) — Sprint 10D, Parte 6: "No permitir bypass por
 * navegación directa a /dashboard". Se usa en los layouts protegidos
 * ((shell), platform) y en las páginas de entrada que no comparten esos
 * layouts (/modules, /select-org, /accept-invite) — nunca en /terms,
 * /privacy, /login, /register, /logout, que deben seguir siendo
 * alcanzables sin haber aceptado nada todavía.
 *
 * platform_staff TAMBIÉN debe aceptar antes de entrar a la consola
 * (Parte 5) — esta función no distingue entre empresa y plataforma, así
 * que ambos layouts la usan igual.
 */
export async function requireLegalAcceptance(next?: string): Promise<void> {
  await requireSession();
  const { hasAcceptedAll } = await getMyLegalAcceptanceStatusAction();
  if (!hasAcceptedAll) {
    redirect(next ? `/legal/accept?next=${encodeURIComponent(next)}` : "/legal/accept");
  }
}
