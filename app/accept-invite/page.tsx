// Ruta pública (sin shell): depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Debe funcionar SIN sesión también
// (para mostrar el mensaje de "inicia sesión primero"), así que no usa
// requireSession() (que redirige) sino una lectura directa y no bloqueante.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getInvitationPreviewAction } from "@/server/actions/team";
import { ROLE_LABEL, normalizeEmail, isExpired } from "@/lib/domain/team";
import { AcceptInviteForm } from "@/components/domain/team/accept-invite-form";
import { Wordmark } from "@/components/layout/logo";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 p-6">
      <Wordmark />
      <div>
        <p className="eyebrow">Invitación de equipo</p>
        <h1 className="text-2xl font-semibold tracking-tight">Aceptar invitación</h1>
      </div>
      {children}
    </div>
  );

  if (!token) {
    return shell(
      <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        El enlace no incluye un token de invitación válido.
      </p>
    );
  }

  // El destino a preservar en login/registro es ESTE mismo enlace (Partes
  // 4 y 5 de la corrección de onboarding): así, tras iniciar sesión o
  // crear la cuenta, la persona vuelve directo aquí en vez de terminar en
  // "crear empresa".
  const returnHere = `/accept-invite?token=${encodeURIComponent(token)}`;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return shell(
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Inicia sesión o crea una cuenta para ver los detalles de esta invitación.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(returnHere)}`}
            className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Iniciar sesión
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(returnHere)}`}
            className="rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium hover:border-loop"
          >
            Crear cuenta
          </Link>
        </div>
        <p className="text-xs text-ink-soft">
          Después de iniciar sesión, volverás automáticamente a esta invitación.
        </p>
      </div>
    );
  }

  const { data: preview, error } = await getInvitationPreviewAction(token);

  if (error || !preview) {
    return shell(
      <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        {error ?? "La invitación no existe o el enlace no es válido."}
      </p>
    );
  }

  // Ya fue aceptada (por ejemplo, se reabrió el enlace después de
  // aceptarla, o se aceptó en otra pestaña): se redirige con un mensaje
  // claro en vez de dejar a la persona en una pantalla sin salida.
  if (preview.status === "accepted") {
    redirect("/select-org?notice=invitation-already-accepted");
  }

  const emailMismatch = normalizeEmail(user.email ?? "") !== preview.email;
  const expired = preview.status === "expired" || isExpired(preview.expiresAt);
  const revoked = preview.status === "revoked";

  return shell(
    <div className="space-y-4">
      <div className="rounded-lg border border-hairline bg-surface p-4 text-sm">
        <p>
          Te invitaron a <strong>{preview.organizationName}</strong> como{" "}
          <strong>{ROLE_LABEL[preview.roleCode]}</strong>.
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Invitación para: <span className="code">{preview.email}</span> · expira el{" "}
          {new Date(preview.expiresAt).toLocaleDateString("es-CO")}
        </p>
      </div>

      {emailMismatch ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          Esta invitación fue enviada a otro correo. Inicia sesión con el correo invitado o
          solicita una nueva invitación.
        </p>
      ) : expired || revoked ? (
        <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink-soft">
          Esta invitación ya no está disponible ({expired ? "expiró" : "fue revocada"}). Pide a un
          administrador de la empresa que envíe una nueva.
        </p>
      ) : (
        <AcceptInviteForm token={token} />
      )}
    </div>
  );
}
