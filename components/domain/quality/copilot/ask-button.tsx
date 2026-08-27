import Link from "next/link";

/**
 * Trazaloop Quality · QUALITY-12 · §48 · «Preguntar al Copilot», desde donde
 * estés.
 *
 * POR QUÉ ES UN ENLACE Y NO UN CHAT INCRUSTADO
 *
 * §48 pide un solo motor, no un chat distinto en cada módulo. Un enlace que
 * abre el Copilot con el contexto fijado consigue lo mismo sin duplicar la
 * pantalla, sin duplicar el estado y sin que dentro de un año haya siete
 * copias del mismo componente que se han ido separando.
 */
export function AskCopilotButton({
  type, id, label, text = "Preguntar al Copilot",
}: { type: string; id: string; label: string; text?: string }) {
  const href = `/quality/copilot?type=${encodeURIComponent(type)}`
    + `&id=${encodeURIComponent(id)}&label=${encodeURIComponent(label)}`;
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:border-loop"
    >
      {text}
    </Link>
  );
}
