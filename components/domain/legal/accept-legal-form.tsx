"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { acceptLegalDocumentsAction, type LegalActionState } from "@/server/actions/legal";
import {
  LEGAL_ACCEPT_TERMS_CHECKBOX_TEXT,
  LEGAL_ACCEPT_PRIVACY_CHECKBOX_TEXT,
} from "@/lib/domain/legal";
import { PRIVACY_NOTICE_SHORT } from "@/lib/domain/legal-package";
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
        <input
          type="checkbox"
          name="confirm_terms"
          required
          className="mt-0.5 rounded border-hairline"
        />
        <span>{LEGAL_ACCEPT_TERMS_CHECKBOX_TEXT}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirm_privacy"
          required
          className="mt-0.5 rounded border-hairline"
        />
        <span>{LEGAL_ACCEPT_PRIVACY_CHECKBOX_TEXT}</span>
      </label>
      <p className="text-xs text-ink-soft">{PRIVACY_NOTICE_SHORT}</p>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Aceptar y continuar"}
      </Button>
    </form>
  );
}
