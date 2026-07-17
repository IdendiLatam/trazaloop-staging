// Ruta protegida (requiere sesión, pero NUNCA requiere aceptación legal
// — sería una paradoja): depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getMyLegalAcceptanceStatusAction } from "@/server/actions/legal";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { isSafeAcceptInviteNext, postAuthDestinationPath } from "@/lib/domain/team";
import { LEGAL_DOCUMENT_TYPE_LABEL } from "@/lib/domain/legal";
import { AcceptLegalForm } from "@/components/domain/legal/accept-legal-form";
import { Wordmark } from "@/components/layout/logo";

export default async function LegalAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireSession();
  const { next } = await searchParams;
  const safeNext = isSafeAcceptInviteNext(next) ? next : null;

  const { hasAcceptedAll, pendingDocuments } = await getMyLegalAcceptanceStatusAction();

  // Sprint 10D (Parte 6): "si tiene invitación pendiente → continuar
  // invitación; si no → /modules" — misma lógica exacta que
  // redirectPostAuth (postAuthDestinationPath ya manda dashboard/
  // select-org/create-org a /modules, la entrada interna principal
  // desde Sprint 10A).
  const redirectTo = safeNext ?? postAuthDestinationPath(await getPostAuthDestinationAction());

  // Ya había aceptado (por ejemplo, volvió a esta URL con el botón
  // "atrás" del navegador): seguir directo, sin volver a mostrar el
  // formulario.
  if (hasAcceptedAll) {
    redirect(redirectTo);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 p-6">
      <Wordmark />
      <div>
        <p className="eyebrow">Antes de continuar</p>
        <h1 className="text-2xl font-semibold tracking-tight">Términos de uso y política de privacidad</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Trazaloop está en beta / lanzamiento controlado. Antes de continuar, necesitamos que
          aceptes los siguientes documentos.
        </p>
      </div>

      <ul className="space-y-1 text-sm">
        {pendingDocuments.map((doc) => (
          <li key={doc.id}>
            <Link href={doc.documentType === "terms" ? "/terms" : "/privacy"} className="text-loop hover:underline">
              {LEGAL_DOCUMENT_TYPE_LABEL[doc.documentType]} ({doc.version})
            </Link>
          </li>
        ))}
      </ul>

      <AcceptLegalForm redirectTo={redirectTo} />
    </div>
  );
}
