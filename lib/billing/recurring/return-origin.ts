/**
 * Trazaloop · MP-REC-01B.11 · A dónde vuelve el comprador tras autorizar.
 *
 *
 * LO QUE PASÓ, Y POR QUÉ ESTO EXISTE
 *
 * El primer cobro recurrente real se autorizó y se cobró —190 400 COP,
 * aprobado, acreditado— y el comprador aterrizó en un 404.
 *
 * El `back_url` de la preapproval llevaba el host del origen DECLARADO, que en
 * Preview guarda la URL inmutable de un despliegue de hace semanas. Ese
 * despliegue sigue vivo y sigue sirviendo la aplicación; lo único que le falta
 * es la ruta de vuelta, que es más nueva. Next.js respondió lo único que podía.
 *
 * El dinero no se perdió: la conciliación no depende del navegador, y por eso
 * se diseñó así. Pero el comprador vio un error justo después de pagar, que es
 * de las peores cosas que se le pueden enseñar a alguien.
 *
 *
 * LA REGLA
 *
 * La vuelta va al despliegue QUE ESTÁ ATENDIENDO la petición, no a un origen
 * declarado en una variable. Una variable con una URL de despliegue clavada
 * envejece en silencio: nunca deja de resolver, así que nada avisa; solo le
 * falta lo que se añadió después.
 *
 * Por eso el orden aquí es el contrario al del carril manual: primero la
 * cabecera de la petición, y solo si no hay ninguna se mira lo declarado —el
 * caso de un trabajo de servidor sin petición detrás, no el de alguien
 * contratando—.
 *
 * El carril manual NO se toca. Su ruta de vuelta existe desde hace meses en
 * cualquier despliegue, y cambiarle el origen sería mover algo que hoy funciona
 * en Producción para arreglar un problema que no tiene.
 */

export type ReturnOriginHeaders = {
  forwardedHost: string | null;
  forwardedProto: string | null;
  host: string | null;
};

export type ReturnOriginEnv = {
  NEXT_PUBLIC_SITE_URL?: string | null;
};

export function resolveRecurringReturnOrigin(
  h: ReturnOriginHeaders,
  env: ReturnOriginEnv = process.env as ReturnOriginEnv
): string {
  const host = (h.forwardedHost ?? h.host ?? "").trim();
  if (host !== "") {
    const proto = (h.forwardedProto ?? "").trim() || "https";
    return `${proto}://${host}`;
  }
  return (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
}
