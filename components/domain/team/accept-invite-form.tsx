"use client";

import { useActionState } from "react";
import { acceptTeamInvitationAction, type TeamActionState } from "@/server/actions/team";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: TeamActionState = { error: null };

/**
 * Botón de aceptar (Parte 5.2). En éxito, la acción redirige del lado del
 * servidor (mismo patrón que createOrganizationAction), así que este
 * componente solo necesita mostrar el error si algo falla.
 *
 * QUALITY-01.2: el destino ya no es la portada de PCR sino el selector de
 * módulos. `returnTo` es una PISTA del enlace de invitación —el módulo desde
 * el que se invitó— y el servidor la acepta únicamente si es la ruta de inicio
 * de un módulo al que la empresa puede entrar. No concede nada.
 */
export function AcceptInviteForm({ token, returnTo }: { token: string; returnTo?: string | null }) {
  const [state, formAction, pending] = useActionState(acceptTeamInvitationAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <ErrorAlert message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Aceptando…" : "Aceptar invitación"}
      </Button>
    </form>
  );
}
