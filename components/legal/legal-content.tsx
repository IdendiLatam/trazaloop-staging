import { Fragment } from "react";

import {
  parseLegalMarkdown,
  type LegalBlock,
  type LegalInline,
} from "@/lib/legal/markdown";

/**
 * Trazaloop · PE-02B6.2 · El documento legal, tal como debe leerse.
 *
 * Convierte el árbol de `lib/legal/markdown` en elementos de React. No produce
 * HTML en ningún punto —no hay `dangerouslySetInnerHTML` aquí ni en el módulo
 * que lo alimenta—, así que todo el texto pasa por el escapado de React. Un
 * `<script>` escrito dentro de un documento se ve; no se ejecuta.
 *
 * Es un componente de servidor puro: no tiene estado y no necesita el
 * navegador. Se usa en `/privacy`, en `/terms` y en la consola de plataforma,
 * para que las tres vean exactamente lo mismo. Que la consola enseñe algo
 * distinto de lo que verá el cliente es justo el fallo que hace que se apruebe
 * una cosa y se publique otra.
 *
 * NO CAMBIA NADA DEL DOCUMENTO. Recibe `content` y pinta; no lo guarda, no lo
 * normaliza y no toca la aceptación. Pintar y versionar son cosas distintas.
 */

function Inlines({ nodes }: { nodes: LegalInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${n.kind}-${i}`;
        if (n.kind === "text") return <Fragment key={key}>{n.text}</Fragment>;
        if (n.kind === "strong") {
          return (
            <strong key={key} className="font-semibold text-ink">
              <Inlines nodes={n.children} />
            </strong>
          );
        }
        if (n.kind === "em") {
          return (
            <em key={key} className="italic">
              <Inlines nodes={n.children} />
            </em>
          );
        }
        if (n.kind === "code") {
          return (
            <code
              key={key}
              className="rounded bg-paper px-1 py-0.5 font-mono text-[0.9em] text-ink"
            >
              {n.text}
            </code>
          );
        }
        return (
          <a
            key={key}
            href={n.href}
            className="text-loop underline underline-offset-2 hover:no-underline"
            // Solo para los que salen del sitio. `noopener` evita que la
            // pestaña nueva pueda tocar la que la abrió.
            {...(n.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <Inlines nodes={n.children} />
          </a>
        );
      })}
    </>
  );
}

/**
 * A qué etiqueta va cada nivel del documento.
 *
 * No es una tabla fija, y esa es la parte importante. La página ya pinta el
 * título del documento como `<h1>`, así que el cuerpo tiene que empezar en
 * `<h2>` — pero un documento puede usar `#` para sus artículos y otro `##`, y
 * quien redacta en la consola no tiene por qué saber cuál toca.
 *
 * Se toma el nivel más alto que el documento realmente usa y se lleva a `<h2>`;
 * los demás bajan a partir de ahí. Así ningún documento salta de `<h1>` a
 * `<h3>`, que es lo que hace que un lector de pantalla pierda el hilo.
 */
function nivelMinimo(bloques: LegalBlock[]): number {
  let minimo = 3;
  for (const b of bloques) {
    if (b.kind === "heading" && b.level < minimo) minimo = b.level;
  }
  return minimo;
}

function Bloque({ block, base }: { block: LegalBlock; base: number }) {
  if (block.kind === "heading") {
    const relativo = Math.min(block.level - base, 2);
    if (relativo <= 0) {
      return (
        <h2 className="mt-10 text-xl font-semibold tracking-tight text-ink first:mt-0">
          <Inlines nodes={block.children} />
        </h2>
      );
    }
    if (relativo === 1) {
      return (
        <h3 className="mt-8 text-base font-semibold text-ink first:mt-0">
          <Inlines nodes={block.children} />
        </h3>
      );
    }
    return (
      <h4 className="mt-6 text-sm font-semibold text-ink first:mt-0">
        <Inlines nodes={block.children} />
      </h4>
    );
  }

  if (block.kind === "paragraph") {
    return (
      <p className="mt-4 text-sm leading-relaxed text-ink first:mt-0">
        <Inlines nodes={block.children} />
      </p>
    );
  }

  if (block.kind === "list") {
    const clase = "mt-4 space-y-2 pl-5 text-sm leading-relaxed text-ink first:mt-0";
    if (block.ordered) {
      return (
        <ol start={block.start} className={`list-decimal ${clase}`}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <Inlines nodes={item} />
            </li>
          ))}
        </ol>
      );
    }
    return (
      <ul className={`list-disc ${clase}`}>
        {block.items.map((item, i) => (
          <li key={i} className="pl-1">
            <Inlines nodes={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === "table") {
    return (
      // El desbordamiento se queda DENTRO de este contenedor. Sin él, una tabla
      // de cuatro columnas empuja la página entera en un teléfono y todo el
      // documento se lee de lado.
      <div className="mt-4 overflow-x-auto first:mt-0">
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline">
              {block.head.map((celda, i) => (
                <th key={i} scope="col" className="px-3 py-2 font-semibold text-ink">
                  <Inlines nodes={celda} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((fila, i) => (
              <tr key={i} className="border-b border-hairline last:border-0">
                {fila.map((celda, j) => (
                  <td key={j} className="px-3 py-2 align-top text-ink">
                    <Inlines nodes={celda} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.kind === "quote") {
    return (
      <blockquote className="mt-4 border-l-2 border-loop pl-4 text-ink-soft first:mt-0">
        {block.blocks.map((b, i) => (
          <Bloque key={i} block={b} base={base} />
        ))}
      </blockquote>
    );
  }

  return <hr className="mt-8 border-hairline" />;
}

/**
 * Pinta un documento legal.
 *
 * Sirve igual para el texto plano de la v1 vigente que para el Markdown de la
 * sucesora: un documento sin marcadores sale como una sucesión de párrafos.
 * Por eso no hay que migrar nada para estrenar esto.
 */
export function LegalContent({ content }: { content: string }) {
  const bloques = parseLegalMarkdown(content);
  const base = nivelMinimo(bloques);
  return (
    <div className="text-sm leading-relaxed text-ink">
      {bloques.map((b, i) => (
        <Bloque key={i} block={b} base={base} />
      ))}
    </div>
  );
}
