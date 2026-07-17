"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { acceptLegalDocumentsAction, type LegalActionState } from "@/server/actions/legal";
import { LEGAL_ACCEPT_CHECKBOX_TEXT } from "@/lib/domain/legal";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: LegalActionState = { error: null };

/** Casilla + botón de aceptación (Parte 6). Al aceptar, redirige a
 *  `next` si venía uno válido, o a la ruta por defecto que decida el
 *  servidor de destino (calculada en la página, no aquí). */
export function AcceptLegalForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(acceptLegalDocumentsAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.push(redirectTo);
    }
  }, [state.success, redirectTo, router]);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5 rounded border-hairline" />
        <span>{LEGAL_ACCEPT_CHECKBOX_TEXT}</span>
      </label>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Aceptar y continuar"}
      </Button>
    </form>
  );
}
