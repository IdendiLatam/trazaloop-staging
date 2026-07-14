"use client";

import { useActionState } from "react";
import { acceptTeamInvitationAction, type TeamActionState } from "@/server/actions/team";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: TeamActionState = { error: null };

/** Botón de aceptar (Parte 5.2). En éxito, la acción redirige a /dashboard
 *  del lado del servidor (mismo patrón que createOrganizationAction), así
 *  que este componente solo necesita mostrar el error si algo falla. */
export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptTeamInvitationAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <ErrorAlert message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Aceptando…" : "Aceptar invitación"}
      </Button>
    </form>
  );
}
