"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readCheckoutStatusAction } from "@/server/actions/billing";
import { InfoAlert, ErrorAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B2W4 · «Este pago ya salió; esto es lo que se sabe».
 *
 * Es lo que ve quien recarga la página después de pagar. No vuelve a pedir la
 * tarjeta y no puede cobrar nada: solo pregunta al LIBRO cada pocos segundos.
 */
export function CheckoutWatcher(
  { intentId, backHref }: { intentId: string; backHref: string }
) {
  const [estado, setEstado] = useState<
    { fase: "esperando" } | { fase: "aprobado"; plan: string | null }
    | { fase: "rechazado" }>({ fase: "esperando" });

  useEffect(() => {
    if (estado.fase !== "esperando") return;
    let vivo = true;
    const preguntar = async () => {
      const r = await readCheckoutStatusAction(intentId);
      if (!vivo || !r.ok) return;
      if (r.status.settled) setEstado({ fase: "aprobado", plan: r.status.planCode });
      else if (["declined", "failed"].includes(r.status.paymentStatus ?? "")) {
        setEstado({ fase: "rechazado" });
      }
    };
    void preguntar();
    const t = setInterval(preguntar, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [estado.fase, intentId]);

  if (estado.fase === "aprobado") {
    return <InfoAlert message={`Pago aprobado. Tu plan ${estado.plan ?? ""} está activo.`} />;
  }
  if (estado.fase === "rechazado") {
    return (
      <div className="space-y-3">
        <ErrorAlert message="El pago fue rechazado. No se cobró nada." />
        <Link href={backHref} className="text-sm underline">
          Volver a Plan y facturación
        </Link>
      </div>
    );
  }
  return (
    <InfoAlert message="Ya enviamos este pago y estamos esperando la confirmación. No hace falta que vuelvas a introducir la tarjeta." />
  );
}
