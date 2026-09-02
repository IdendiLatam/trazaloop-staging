"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { usageHeartbeatAction } from "@/server/actions/usage";
import { HEARTBEAT_SECONDS, isMeteredShellPath } from "@/lib/usage/metered-surfaces";

/**
 * Trazaloop · PE-04B4 · El reloj de uso.
 *
 * LO QUE ESTE COMPONENTE NO ESCUCHA
 *
 * Ni `mousemove`, ni `keydown`, ni `scroll`, ni `click`, ni
 * `visibilitychange`, ni ningún temporizador de inactividad. Y no es un olvido:
 * Free incluye TIEMPO DE USO DE LA PLATAFORMA, no «tiempo con alguien
 * moviendo el ratón». Quien deja abierta una pantalla de trabajo mientras
 * atiende una llamada de veinte minutos está usando su plan durante esos veinte
 * minutos, y eso es lo que se cobra.
 *
 * Una pestaña en segundo plano tampoco pausa nada: si el navegador sigue
 * latiendo, la pantalla sigue abierta. Cuando la pestaña se cierra, el
 * dispositivo se duerme o se cae la red, el latido para y —esto es lo
 * importante— el cobro para con él: los minutos se marcan EN el latido, así que
 * después del último no se cobra ni uno más.
 *
 * El servidor decide todo. Aquí solo se dice «sigo abierto».
 */
export function UsageClock() {
  const pathname = usePathname();
  const [aviso, setAviso] = useState<"daily" | "monthly" | null>(null);
  // Una clave por PESTAÑA. Solo sirve para que dos pestañas no se pisen la
  // concesión; no identifica nada más y no viaja a ningún otro sitio. Se crea
  // una sola vez y sobrevive a los renderizados: si cambiara, cada re-render
  // abriría una concesión nueva.
  const clave = useRef<string | null>(null);

  const ruta = pathname ?? "";
  const medida = isMeteredShellPath(ruta);

  useEffect(() => {
    if (!medida) return;
    let vivo = true;

    clave.current ??=
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const sesion = clave.current;

    const latir = async () => {
      try {
        const r = await usageHeartbeatAction(sesion, ruta);
        if (!vivo) return;
        if (!r.metered) { setAviso(null); return; }
        setAviso(
          r.state === "CONSULTATION_MONTHLY_LIMIT" ? "monthly"
          : r.state === "CONSULTATION_DAILY_LIMIT" ? "daily"
          : null
        );
      } catch {
        // Un latido perdido no rompe la pantalla ni cambia nada de lo que se ve.
        // La autoridad sigue siendo el servidor cuando se intente escribir.
      }
    };

    void latir();
    const id = setInterval(() => { void latir(); }, HEARTBEAT_SECONDS * 1000);
    return () => { vivo = false; clearInterval(id); };
  }, [medida, ruta]);

  if (aviso === null) return null;

  return (
    <div
      role="status"
      className="no-print border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <strong className="font-semibold">Modo consulta.</strong>{" "}
      {aviso === "daily"
        ? "Tu empresa agotó los 30 minutos de uso diarios incluidos en el plan Free."
        : "Tu empresa agotó los 300 minutos de uso mensuales incluidos en el plan Free."}{" "}
      Puedes seguir consultando, descargando y borrando tu información.{" "}
      {aviso === "daily" ? "El cupo vuelve mañana." : "El cupo vuelve el mes que viene."}
    </div>
  );
}
