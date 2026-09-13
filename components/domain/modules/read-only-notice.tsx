import Link from "next/link";
import { ACTIVATE_FULL_HREF, ACTIVATE_FULL_LABEL } from "@/lib/modules/messages";

/**
 * Trazaloop · PROD-LAUNCH-01C.4 · «Estás consultando».
 *
 *
 * POR QUÉ ESTO EXISTE
 *
 * Desde este tramo se puede entrar a un módulo cuyo permiso venció. Eso es lo
 * correcto —la información es de la empresa— pero abre un fallo nuevo si no se
 * avisa: alguien entra, rellena un formulario largo, pulsa guardar y recibe un
 * error. El trabajo se pierde y la culpa parece suya.
 *
 * El aviso va ARRIBA y en todas las pantallas del módulo, no dentro de cada
 * formulario, porque la pregunta que responde —«¿puedo trabajar aquí?»— se
 * hace al llegar, no al guardar. El bloqueo real vive en el servidor; esto solo
 * hace que no sorprenda.
 *
 *
 * LO QUE NO DICE
 *
 * No dice «no tienes permiso» —lo tiene: es su empresa y su información— ni
 * «tu cuenta está bloqueada» —no lo está—. Dice qué se puede hacer ahora, que
 * es lo único accionable.
 */
export function ModuleReadOnlyNotice({ moduleName }: { moduleName: string }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="space-y-1">
        <p className="font-semibold text-ink">Estás consultando {moduleName}.</p>
        <p className="text-ink-soft">
          Tu acceso de prueba terminó, así que puedes consultar, descargar y borrar la
          información que ya creaste, pero no crear ni editar. Nada se ha perdido.
        </p>
      </div>
      <Link
        href={ACTIVATE_FULL_HREF}
        className="shrink-0 rounded-md bg-loop px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
      >
        {ACTIVATE_FULL_LABEL}
      </Link>
    </div>
  );
}
