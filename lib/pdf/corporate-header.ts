import { fitWithin, type PdfImage } from "./image";
import { measureText, sanitizeForPdf, wrapText } from "./writer";
import type { PdfLayout } from "./layout";

/**
 * Trazaloop · EXPORT-01.2 · El encabezado corporativo.
 *
 * LA ÚNICA función que dibuja la identidad en la parte de arriba de un PDF de
 * Trazaloop. La usan los dos motores que existen —el del Print Model y el
 * documental heredado— para que un procedimiento controlado y una lista de
 * lotes se reconozcan como papeles de la misma empresa.
 *
 * TRES ELEMENTOS OBLIGATORIOS, SIEMPRE:
 *
 *   1. el LOGO de la empresa, cuando existe y se puede incrustar;
 *   2. el NOMBRE de la empresa;
 *   3. el NOMBRE DEL DOCUMENTO.
 *
 * Y en TODAS las páginas, no solo en la primera. Una hoja suelta de la página
 * siete de un listado tiene que poder identificarse encima de una mesa: quién
 * la emitió y qué es. Repetir el encabezado cuesta unos milímetros; no
 * repetirlo convierte cada página interior en un papel anónimo.
 *
 * El logo se registra UNA vez en el archivo y se referencia desde cada página
 * (§46): no viaja siete veces dentro del PDF ni se descarga siete veces.
 *
 * NADA de lo que dibuja viene del navegador. El nombre y el logo salen de la
 * empresa ya autorizada en servidor; el nombre del documento sale del registro
 * de exportaciones. Ver `EXPORT_01_2_CORPORATE_HEADER.md`.
 */

/** El nombre con el que se registra el logo en el archivo. Uno solo, para que
 *  el escritor lo comparta entre páginas. */
const LOGO_RESOURCE = "OrgLogo";

/** La caja del logo. Se respeta la proporción: un logo vertical y uno
 *  apaisado entran los dos sin deformarse (§33). */
export const LOGO_BOX = { width: 92, height: 30 } as const;

/** Cuánto ocupa el encabezado, para que el cuerpo empiece DEBAJO (§32). */
export const HEADER_HEIGHT = 52;

export type CorporateIdentity = {
  organizationName: string;
  legalName?: string | null;
  taxId?: string | null;
  /** Bytes ya decodificados en servidor. Nunca una URL. */
  logo?: PdfImage | null;
  /**
   * §10 · «No hay logo» y «hay logo y no sirve» son cosas distintas. Cuando es
   * `true`, el encabezado lo dice en una línea: el usuario no puede arreglar lo
   * que no sabe que está roto.
   */
  logoUnusable?: boolean;
};

export type CorporateHeaderOptions = {
  identity: CorporateIdentity;
  /** El nombre DOCUMENTAL, del registro: «Ficha de proceso», no el título. */
  documentName: string;
  /** Código legible del registro, si lo tiene. Va a la derecha. */
  code?: string | null;
  /** Línea de sistema, discreta: «Trazaloop Quality · riesgos». */
  systemLine?: string | null;
  /** El margen superior desde el que empieza a dibujar. */
  top: number;
};

/** El aviso de logo dañado. No dice dónde estaba el archivo ni por qué falló:
 *  eso son interioridades del almacenamiento. Dice lo que el usuario necesita
 *  para actuar. */
export const BROKEN_LOGO_NOTICE =
  "El logo configurado no se pudo mostrar. Vuelve a cargarlo en Datos de empresa.";

/**
 * Dibuja el encabezado y devuelve la Y donde puede empezar el cuerpo.
 *
 * Nunca devuelve menos que `top + HEADER_HEIGHT`, así que el cuerpo no puede
 * dibujarse encima aunque el nombre de la empresa sea corto.
 */
export function renderCorporateHeader(d: PdfLayout, opts: CorporateHeaderOptions): number {
  const { identity, documentName } = opts;
  const top = opts.top;
  const logo = identity.logo ?? null;

  let textLeft = d.left;
  if (logo) {
    const box = fitWithin(logo, LOGO_BOX.width, LOGO_BOX.height);
    // `addImage` es idempotente por nombre: se registra una vez y cada página
    // lo referencia. El archivo lleva un solo objeto de imagen.
    const resource = d.writer.addImage(LOGO_RESOURCE, logo);
    // Centrado vertical dentro de la caja, para que un logo bajo y ancho no
    // quede pegado al borde superior.
    const dy = (LOGO_BOX.height - box.height) / 2;
    d.writer.image(resource, d.left, top + dy, box.width, box.height);
    textLeft = d.left + LOGO_BOX.width + 14;
  }

  // Ancho disponible para el texto de identidad, dejando sitio al código de la
  // derecha para que no se solapen (§34).
  const codigo = (opts.code ?? "").trim();
  const anchoCodigo = codigo.length > 0 ? measureText(codigo, "bold", 9) + 18 : 0;
  const anchoTexto = Math.max(120, d.right - textLeft - anchoCodigo);

  // 1 · NOMBRE DE LA EMPRESA. Se ajusta en dos renglones como mucho; si aún no
  // cabe, se reduce el cuerpo antes que salirse del margen o pisar el nombre
  // del documento.
  const nombre = sanitizeForPdf(identity.organizationName).trim() || "Empresa";
  let tamNombre = 10.5;
  let lineasNombre = wrapText(nombre, "bold", tamNombre, anchoTexto);
  while (lineasNombre.length > 2 && tamNombre > 7.5) {
    tamNombre -= 0.75;
    lineasNombre = wrapText(nombre, "bold", tamNombre, anchoTexto);
  }
  lineasNombre = lineasNombre.slice(0, 2);

  let y = top;
  for (const linea of lineasNombre) {
    d.writer.text(textLeft, y + tamNombre, linea, "bold", tamNombre, 0);
    y += tamNombre + 2.5;
  }

  // 2 · NOMBRE DEL DOCUMENTO. En versalitas, que es como se lee un membrete.
  const nombreDoc = sanitizeForPdf(documentName).trim().toUpperCase() || "DOCUMENTO";
  let tamDoc = 8.5;
  let lineasDoc = wrapText(nombreDoc, "bold", tamDoc, anchoTexto);
  while (lineasDoc.length > 2 && tamDoc > 6.5) {
    tamDoc -= 0.5;
    lineasDoc = wrapText(nombreDoc, "bold", tamDoc, anchoTexto);
  }
  // §35 · Si aun así no cabe, NO se recorta en silencio: se deja en dos
  // renglones y el segundo termina con puntos suspensivos, que es una señal
  // visible de que hay más nombre del que se ve.
  if (lineasDoc.length > 2) {
    lineasDoc = lineasDoc.slice(0, 2);
    lineasDoc[1] = `${lineasDoc[1].replace(/\s+\S*$/, "")}…`;
  }
  for (const linea of lineasDoc) {
    d.writer.text(textLeft, y + tamDoc, linea, "bold", tamDoc, 0.42);
    y += tamDoc + 2;
  }

  // Complementos discretos: razón social y NIT, y la línea de sistema.
  const complemento = [
    identity.legalName && identity.legalName !== identity.organizationName ? identity.legalName : null,
    identity.taxId ? `NIT ${identity.taxId}` : null,
    opts.systemLine ?? null,
  ].filter(Boolean).join(" · ");
  if (complemento.length > 0) {
    const [linea] = wrapText(sanitizeForPdf(complemento), "regular", 6.5, anchoTexto);
    if (linea) {
      d.writer.text(textLeft, y + 6.5, linea, "regular", 6.5, 0.55);
      y += 9;
    }
  }

  // §10 · El aviso de logo dañado, discreto pero presente en cada página.
  if (identity.logoUnusable) {
    d.writer.text(textLeft, y + 6.5, BROKEN_LOGO_NOTICE, "regular", 6.5, 0.45);
    y += 9;
  }

  // El código, a la derecha, alineado con la primera línea.
  if (codigo.length > 0) {
    const w = measureText(codigo, "bold", 9);
    d.writer.text(d.right - w, top + 10.5, sanitizeForPdf(codigo), "bold", 9, 0.15);
  }

  const alturaLogo = logo ? LOGO_BOX.height : 0;
  const fin = Math.max(y, top + alturaLogo, top + HEADER_HEIGHT - 12);
  d.writer.line(d.left, fin + 6, d.right, fin + 6, 0.7, 0.82);
  return fin + 16;
}
