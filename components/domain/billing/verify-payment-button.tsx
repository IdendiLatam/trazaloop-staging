"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyOneTimeCheckoutAction } from "@/server/actions/billing";
import { InfoAlert, ErrorAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PROD-LAUNCH-01B · «Ya realicé el pago — Verificar».
 *
 *
 * PARA QUÉ EXISTE ESTE BOTÓN
 *
 * Para los tres casos en los que nadie nos cuenta que se pagó:
 *
 *   · la persona cierra la ventana de la pasarela antes de volver;
 *   · la vuelta se pierde —red, móvil, pestaña cerrada—;
 *   · el aviso del proveedor no llega. Eso no es hipotético: hubo un cobro
 *     real de 190 400 pesos del que no llegó ninguna notificación.
 *
 * Sin este botón, en los tres el cliente se queda pagando y sin plan, y la
 * única salida es escribir a soporte.
 *
 *
 * NO ACTIVA NADA POR SÍ MISMO
 *
 * Pulsa una acción de servidor que le pregunta al PROVEEDOR. Este componente
 * no sabe si hay pago, no puede decidirlo y no manda ningún importe. Lo único
 * que viaja es el identificador del cobro, y el servidor comprueba además que
 * sea de la empresa activa.
 *
 *
 * SE PUEDE PULSAR TODAS LAS VECES QUE HAGA FALTA
 *
 * La activación es idempotente en tres capas —el cobro se reutiliza, un pago
 * no puede asentar dos cobros, y asentar dos veces devuelve «ya estaba»—, así
 * que pulsarlo siete veces seguidas no cobra siete meses. Por eso el botón no
 * se esconde después del primer intento: esconderlo obligaría a recargar.
 */
export function VerifyPaymentButton({ checkoutId }: { checkoutId: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [aviso, setAviso] = useState<
    { tipo: "info" | "error"; texto: string } | null>(null);

  const comprobar = () => {
    setAviso(null);
    empezar(async () => {
      const r = await verifyOneTimeCheckoutAction(checkoutId);
      if (r.state === "activated") {
        // No se dibuja aquí el «ya está»: se recarga para que lo diga el
        // estado canónico. Una pantalla que se felicita a sí misma puede
        // felicitarse por algo que no ocurrió.
        router.refresh();
        return;
      }
      setAviso({
        tipo: r.state === "pending" ? "info" : "error",
        texto: r.message,
      });
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={comprobar}
        disabled={pendiente}
        className="inline-flex w-fit items-center rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pendiente ? "Comprobando…" : "Ya realicé el pago — Verificar"}
      </button>
      {aviso?.tipo === "info" ? <InfoAlert message={aviso.texto} /> : null}
      {aviso?.tipo === "error" ? <ErrorAlert message={aviso.texto} /> : null}
    </div>
  );
}
