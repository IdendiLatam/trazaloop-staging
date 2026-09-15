"use client";

import { useActionState } from "react";
import {
  beginPublicDiagnosticAction, type IntakeState,
} from "@/server/actions/public-diagnostic-intake";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01E · Identificarse para empezar.
 *
 * Cuatro datos y dos casillas. No se pide contraseña, ni cuenta, ni NIT, ni
 * cargo: nada de eso hace falta para diagnosticar una empresa, y cada campo de
 * más en un formulario público es gente que lo abandona.
 *
 * El campo `website` es una trampa: va fuera de la pantalla y sin foco posible,
 * así que una persona no lo ve ni lo tabula. Si llega relleno, el servidor
 * responde exactamente lo mismo que a un envío bueno.
 */

const inicial: IntakeState = { status: "idle", message: null };

const campo = "w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm";
const etiqueta = "block text-sm font-medium";

export function PublicIntakeForm({
  slug, nonce, consentTitle, consentVersion,
}: {
  slug: string;
  /**
   * Testigo firmado por la base al pintar esta página. Un robot puede LEERLO
   * —está en el HTML— pero no puede fabricar uno con fecha anterior, así que
   * para saltarse el mínimo de tres segundos tendría que pedir la página y
   * esperar. Ese es exactamente el coste que se le quiere imponer.
   */
  nonce: string | null;
  consentTitle: string | null;
  consentVersion: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(beginPublicDiagnosticAction, inicial);

  /*
    PUBLIC-DIAGNOSTICS-01F · El mismo panel para todos, y un enlace.

    Se podría saltar directamente al cuestionario, pero entonces un envío
    correcto y uno detectado por el señuelo dejarían de responder igual, y esa
    indistinguibilidad es justo lo que 01E construyó. Aquí se responde lo mismo
    y quien de verdad tiene el testigo continúa con un clic; quien no lo tiene
    vuelve solo a esta puerta.
  */
  if (estado.status === "created") {
    return (
      <section role="status" className="rounded-lg border border-loop/30 bg-loop/5 p-4">
        <h2 className="text-sm font-semibold">Listo, ya puedes empezar</h2>
        <p className="pt-1 text-sm text-ink-soft">
          Guardamos tus datos y tu autorización. Puedes responder en varios ratos:
          tu avance se guarda y podrás volver desde este mismo navegador.
        </p>
        <a href={`/diagnostic/${slug}/assessment`}
           className="mt-3 inline-block rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          Comenzar el diagnóstico
        </a>
      </section>
    );
  }

  return (
    <form action={accion} className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="nonce" value={nonce ?? ""} />

      {/* Trampa. Fuera de pantalla, sin tabulación y anunciada como oculta. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="website">No rellenes este campo</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <h2 className="text-sm font-semibold">Tus datos</h2>

      <div>
        <label className={etiqueta} htmlFor="name">Nombre y apellido</label>
        <input id="name" name="name" required maxLength={160} autoComplete="name"
               className={campo} />
      </div>
      <div>
        <label className={etiqueta} htmlFor="company">Empresa</label>
        <input id="company" name="company" required maxLength={200}
               autoComplete="organization" className={campo} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta} htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" required maxLength={254}
                 autoComplete="email" className={campo} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="phone">Teléfono</label>
          <input id="phone" name="phone" type="tel" required maxLength={40}
                 autoComplete="tel" className={campo} />
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-hairline bg-paper p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-1" />
          <span>
            Autorizo el tratamiento de mis datos personales para gestionar y analizar
            este diagnóstico
            {consentTitle
              ? <>, de acuerdo con <strong className="font-medium">{consentTitle}</strong>
                  {consentVersion ? ` (v${consentVersion})` : ""}</>
              : null}.
          </span>
        </label>
        {/* Separada, sin marcar y sin condicionar la participación. */}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="marketing" className="mt-1" />
          <span>Deseo recibir información sobre Trazaloop y sus servicios.</span>
        </label>
      </div>

      {estado.message ? (
        <p role="alert" className="rounded-md border border-amber/40 bg-amber/10 p-3 text-sm text-ink">
          {estado.message}
        </p>
      ) : null}

      <button type="submit" disabled={pendiente}
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {pendiente ? "Preparando…" : "Comenzar diagnóstico"}
      </button>
    </form>
  );
}
