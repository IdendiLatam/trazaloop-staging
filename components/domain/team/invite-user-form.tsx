"use client";

import { useActionState } from "react";
import { createTeamInvitationAction, type TeamActionState } from "@/server/actions/team";
import { TEAM_ROLES, ROLE_LABEL } from "@/lib/domain/team";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: TeamActionState = { error: null };

const ROLE_OPTIONS = TEAM_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** Formulario de invitación (Parte 5.1). Sin envío de correo real: se
 *  muestra un enlace copiable, como pide el brief. */
export function InviteUserForm() {
  const [state, formAction, pending] = useActionState(createTeamInvitationAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />

      {state.inviteLink ? (
        <div className="space-y-2 rounded-md border border-loop/30 bg-loop/5 p-3">
          <p className="text-sm font-medium text-loop-deep">
            Invitación creada. Copia el enlace y compártelo con la persona invitada.
          </p>
          <p className="text-xs text-ink-soft">
            Copia este enlace y envíalo al usuario invitado por el canal que prefieras.
          </p>
          <input
            readOnly
            value={state.inviteLink}
            onFocus={(e) => e.currentTarget.select()}
            className="code block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs"
          />
        </div>
      ) : null}

      <Field label="Correo del invitado" name="email" type="email" required />
      <SelectField label="Rol" name="role_code" options={ROLE_OPTIONS} required />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando invitación…" : "Invitar usuario"}
      </Button>
    </form>
  );
}
