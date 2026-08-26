/**
 * Trazaloop · EXPORT-01 · Nombres de archivo seguros.
 *
 * Un nombre de archivo viaja en una cabecera HTTP. Si se construye pegando el
 * título que escribió un usuario, se abren dos agujeros a la vez: inyección de
 * cabeceras —un salto de línea corta la respuesta y añade las cabeceras que
 * quiera el atacante— y travesía de rutas cuando el navegador lo guarda.
 *
 * Por eso el nombre no se compone en cada exportador: se compone AQUÍ, una vez.
 */

/** Quita acentos y deja algo que cualquier sistema de archivos acepte. */
function slug(input: string, maxLength = 48): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const trimmed = base.slice(0, maxLength).replace(/-+$/g, "");
  return trimmed.length > 0 ? trimmed : "registro";
}

/**
 * `Riesgo_Interrupcion-de-proveedor_R-2026-001.pdf`
 *
 * El tipo va primero porque es lo que ordena una carpeta de descargas: todos
 * los riesgos juntos, todos los procesos juntos.
 */
export function buildFilename(parts: {
  recordType: string;
  title: string;
  code?: string | null;
  /** Para listados: la fecha del reporte en vez de un código. */
  stamp?: string | null;
}): string {
  const chunks = [slug(parts.recordType, 24), slug(parts.title, 48)];
  if (parts.code) chunks.push(slug(parts.code, 24));
  else if (parts.stamp) chunks.push(slug(parts.stamp, 12));
  return `${chunks.join("_")}.pdf`;
}

/**
 * La cabecera `Content-Disposition`.
 *
 * Se envían las DOS formas: `filename` en ASCII para clientes antiguos y
 * `filename*` en UTF-8 (RFC 5987) para los demás. Y se vuelve a sanear aquí,
 * aunque `buildFilename` ya lo haya hecho: esta función es la última puerta
 * antes de la red, y las últimas puertas no confían en las anteriores.
 */
export function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "descarga.pdf";
  const utf8 = encodeURIComponent(filename).replace(/['()*]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return `attachment; filename="${safe}"; filename*=UTF-8''${utf8}`;
}

/**
 * Las cabeceras completas de una descarga.
 *
 * `no-store` no es exceso de celo: un PDF de Trazaloop lleva datos de UNA
 * empresa, y una caché compartida —un proxy corporativo, una CDN mal
 * configurada— podría servírselo a otra (§54, §73).
 */
export function pdfHeaders(filename: string, byteLength: number): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": contentDisposition(filename),
    "Content-Length": String(byteLength),
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
}
