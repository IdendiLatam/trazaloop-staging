import { Fragment } from "react";
import Link from "next/link";
import { parseHintText } from "@/lib/domain/hint-links";

/**
 * Trazaloop · Sprint T9G · Renderizador COMPARTIDO del texto de un hint
 * (TrazaDocs CPR, TrazaDocs Textiles y la vista previa del editor usan este
 * mismo componente — nunca dos parsers distintos).
 *
 * - El texto llega PLANO y se convierte en nodos React vía
 *   `parseHintText` (lib/domain/hint-links): React escapa todo el texto,
 *   de modo que HTML escrito por el editor jamás se interpreta ni ejecuta.
 * - Enlaces externos (solo https): `target="_blank"` +
 *   `rel="noopener noreferrer"`.
 * - Enlaces internos (rutas que empiezan por `/`): navegación normal dentro
 *   de Trazaloop, sin nueva pestaña.
 * - Prohibido aquí y en cualquier hint: dangerouslySetInnerHTML, iframes,
 *   imágenes remotas, scripts o HTML libre.
 */
export function HintText({ text }: { text: string }) {
  const tokens = parseHintText(text);
  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === "break") return <br key={index} />;
        if (token.type === "text") return <Fragment key={index}>{token.value}</Fragment>;
        if (token.external) {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-loop underline underline-offset-2 hover:text-loop-deep"
            >
              {token.label}
            </a>
          );
        }
        return (
          <Link
            key={index}
            href={token.href}
            className="font-medium text-loop underline underline-offset-2 hover:text-loop-deep"
          >
            {token.label}
          </Link>
        );
      })}
    </>
  );
}
