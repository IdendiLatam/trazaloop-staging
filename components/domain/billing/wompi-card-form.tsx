"use client";

import { useEffect, useRef, useState } from "react";
import {
  submitCardTokenAction, readCheckoutStatusAction,
} from "@/server/actions/billing";
import type { WompiPublicConfig } from "@/lib/db/billing-checkout";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B2W4 · El formulario de tarjeta.
 *
 * LO ÚNICO QUE HAY QUE ENTENDER DE ESTE FICHERO
 *
 * Los datos de la tarjeta salen de aquí hacia WOMPI y no hacia Trazaloop. La
 * petición de tokenización se hace desde el navegador contra la API del
 * proveedor, con la llave PÚBLICA —que es pública a propósito y no permite
 * cobrar—. Lo que después se manda a nuestro servidor es el testigo que Wompi
 * devolvió, que ya no es una tarjeta.
 *
 * Por eso el formulario NO tiene `action`: si lo tuviera, los campos viajarían
 * a una acción de servidor en cuanto alguien pulsara Intro.
 *
 * Y por eso los campos viven en estado local y se borran en cuanto el testigo
 * existe: cuanto menos tiempo estén en memoria, mejor.
 */

type Estado =
  | { fase: "datos" }
  | { fase: "tokenizando" }
  | { fase: "cobrando" }
  | { fase: "esperando" }
  | { fase: "aprobado"; plan: string | null; hasta: string | null }
  | { fase: "rechazado" }
  | { fase: "error"; mensaje: string };

const campo =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink "
  + "placeholder:text-ink-soft/60 focus:border-loop";

/** Solo dígitos, y con el tope que ningún emisor supera. */
const soloDigitos = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

export function WompiCardForm({
  intentId, config, totalLabel,
}: {
  intentId: string;
  config: WompiPublicConfig;
  totalLabel: string;
}) {
  const [numero, setNumero] = useState("");
  const [cvc, setCvc] = useState("");
  const [mes, setMes] = useState("");
  const [anio, setAnio] = useState("");
  const [titular, setTitular] = useState("");
  const [aceptaServicio, setAceptaServicio] = useState(false);
  const [aceptaDatos, setAceptaDatos] = useState(false);
  const [estado, setEstado] = useState<Estado>({ fase: "datos" });
  const enMarcha = useRef(false);

  const trabajando = ["tokenizando", "cobrando", "esperando"].includes(estado.fase);
  const listo = numero.length >= 13 && cvc.length >= 3 && mes.length === 2
    && anio.length === 2 && titular.trim().length > 0
    && aceptaServicio && aceptaDatos;

  // Mientras el cobro está en el aire, lo que manda es el LIBRO. Se pregunta
  // por el estado canónico, no por lo que devolvió el proveedor.
  useEffect(() => {
    if (estado.fase !== "esperando") return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await readCheckoutStatusAction(intentId);
      if (!vivo || !r.ok) return;
      if (r.status.settled) {
        setEstado({ fase: "aprobado", plan: r.status.planCode,
                    hasta: r.status.currentPeriodEnd });
      } else if (["declined", "failed"].includes(r.status.paymentStatus ?? "")) {
        setEstado({ fase: "rechazado" });
      }
    }, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [estado.fase, intentId]);

  async function pagar() {
    // Doble pulsación: la puerta se cierra ANTES de tocar la red.
    if (enMarcha.current) return;
    enMarcha.current = true;
    setEstado({ fase: "tokenizando" });

    let testigo = "";
    try {
      // AQUÍ, y solo aquí, viajan los datos de la tarjeta: del navegador a
      // Wompi. Trazaloop no aparece en esta petición.
      const r = await fetch(`${config.apiBaseUrl}/tokens/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${config.publicKey}` },
        body: JSON.stringify({
          number: numero, cvc, exp_month: mes, exp_year: anio,
          card_holder: titular.trim(),
        }),
      });
      const cuerpo = (await r.json()) as { data?: { id?: string }; status?: string };
      testigo = cuerpo?.data?.id ?? "";
      if (!r.ok || !testigo) {
        enMarcha.current = false;
        setEstado({ fase: "error",
          mensaje: "No pudimos validar la tarjeta. No se cobró nada: revisa los datos." });
        return;
      }
    } catch {
      enMarcha.current = false;
      setEstado({ fase: "error",
        mensaje: "No pudimos contactar con la pasarela de pago. No se cobró nada." });
      return;
    }

    // El testigo existe: los datos de la tarjeta ya no hacen falta en memoria.
    setNumero(""); setCvc(""); setMes(""); setAnio(""); setTitular("");
    setEstado({ fase: "cobrando" });

    const r = await submitCardTokenAction({
      intentId, cardToken: testigo,
      acceptanceToken: config.acceptanceToken,
      personalAuthToken: config.personalAuthToken,
    });
    if (r.error) {
      enMarcha.current = false;
      setEstado({ fase: "error", mensaje: r.error });
      return;
    }
    // Salió. Que se haya cobrado lo dirá el libro, no esta respuesta.
    setEstado({ fase: "esperando" });
  }

  if (estado.fase === "aprobado") {
    return (
      <div className="space-y-3">
        <InfoAlert message={`Pago aprobado. Tu plan ${estado.plan ?? ""} está activo.`} />
        {estado.hasta ? (
          <p className="text-sm text-ink-soft">
            Siguiente renovación: {new Date(estado.hasta).toLocaleDateString("es-CO")}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {estado.fase === "error" ? <ErrorAlert message={estado.mensaje} /> : null}
      {estado.fase === "rechazado" ? (
        <ErrorAlert message="El pago fue rechazado. No se cobró nada: prueba con otra tarjeta." />
      ) : null}
      {estado.fase === "esperando" ? (
        <InfoAlert message="Procesando el pago. Esto puede tardar unos segundos; no cierres esta página." />
      ) : null}

      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Número de la tarjeta</span>
          <input
            className={campo} inputMode="numeric" autoComplete="cc-number"
            value={numero} disabled={trabajando} placeholder="4242 4242 4242 4242"
            onChange={(e) => setNumero(soloDigitos(e.target.value, 19))}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Mes</span>
            <input
              className={campo} inputMode="numeric" autoComplete="cc-exp-month"
              value={mes} disabled={trabajando} placeholder="08"
              onChange={(e) => setMes(soloDigitos(e.target.value, 2))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Año</span>
            <input
              className={campo} inputMode="numeric" autoComplete="cc-exp-year"
              value={anio} disabled={trabajando} placeholder="29"
              onChange={(e) => setAnio(soloDigitos(e.target.value, 2))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">CVC</span>
            <input
              className={campo} inputMode="numeric" autoComplete="cc-csc"
              value={cvc} disabled={trabajando} placeholder="123"
              onChange={(e) => setCvc(soloDigitos(e.target.value, 4))}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Nombre como aparece en la tarjeta</span>
          <input
            className={campo} autoComplete="cc-name" value={titular}
            disabled={trabajando}
            onChange={(e) => setTitular(e.target.value.slice(0, 60))}
          />
        </label>
      </div>

      {/* Los dos documentos que exige el proveedor. Ninguno viene marcado. */}
      <div className="space-y-2 rounded-md border border-hairline bg-canvas p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={aceptaServicio}
                 disabled={trabajando}
                 onChange={(e) => setAceptaServicio(e.target.checked)} />
          <span>
            Acepto los{" "}
            <a href={config.acceptancePermalink ?? "#"} target="_blank"
               rel="noreferrer noopener" className="underline">
              términos y condiciones del servicio de pago
            </a>.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={aceptaDatos}
                 disabled={trabajando}
                 onChange={(e) => setAceptaDatos(e.target.checked)} />
          <span>
            Autorizo el{" "}
            <a href={config.personalAuthPermalink ?? "#"} target="_blank"
               rel="noreferrer noopener" className="underline">
              tratamiento de mis datos personales
            </a>.
          </span>
        </label>
      </div>

      <Button type="button" onClick={pagar} disabled={!listo || trabajando}>
        {trabajando ? "Procesando…" : `Pagar ${totalLabel}`}
      </Button>

      <p className="text-xs text-ink-soft">
        Los datos de tu tarjeta viajan cifrados directamente a la pasarela de pago.
        Trazaloop no los recibe ni los guarda.
      </p>
    </div>
  );
}
