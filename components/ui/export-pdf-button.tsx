import Link from "next/link";

/**
 * Trazaloop · EXPORT-01 · El botón de descarga, uno para toda la plataforma.
 *
 * NOMENCLATURA (§75): siempre «Descargar PDF». Nunca «Imprimir», porque no
 * imprime: descarga un archivo. Nunca «Exportar» a secas, porque no dice a qué.
 * Una sola forma en toda la plataforma es lo que hace que nadie tenga que
 * buscarlo dos veces.
 *
 * Es un enlace, no un botón con JavaScript. Así funciona sin hidratar, se puede
 * abrir en otra pestaña, y el navegador gestiona la descarga como lo que es.
 *
 * Los filtros viajan como parámetros DECLARADOS por la exportación; el servidor
 * los valida y vuelve a consultar. El navegador nunca manda filas (§13).
 */
export function ExportPdfButton({
  exportKey,
  id,
  filters,
  label = "Descargar PDF",
  disabled = false,
  disabledReason,
}: {
  exportKey: string;
  id?: string | null;
  filters?: Record<string, string | null | undefined>;
  label?: string;
  /** §76 · Cuando no hay nada que exportar se explica, en vez de entregar un
   *  archivo vacío que parece un fallo. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft"
        title={disabledReason}
      >
        {label}
        {disabledReason ? <span className="ml-1 font-normal">· {disabledReason}</span> : null}
      </span>
    );
  }

  const params = new URLSearchParams();
  if (id) params.set("id", id);
  for (const [k, v] of Object.entries(filters ?? {})) {
    if (typeof v === "string" && v.length > 0) params.set(k, v);
  }
  const query = params.toString();

  return (
    <Link
      href={`/export/${exportKey}${query ? `?${query}` : ""}`}
      prefetch={false}
      className="inline-flex items-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-loop hover:text-loop-deep"
    >
      {label}
    </Link>
  );
}
