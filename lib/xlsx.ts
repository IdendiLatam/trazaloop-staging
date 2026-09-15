import { deflateRawSync } from "node:zlib";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · Un .xlsx de verdad, sin dependencias.
 *
 *
 * POR QUÉ NO SE AÑADE UNA LIBRERÍA
 *
 * Este proyecto tiene once dependencias de ejecución y ha evitado añadir más
 * cuando podía resolverlo con lo que trae Node: no hay generador de PDF —se
 * imprime desde el navegador— y el CSV lo escribe un ayudante de cuarenta
 * líneas. Un `.xlsx` es un ZIP con unos cuantos XML dentro, y `node:zlib` ya
 * sabe comprimir. Traer un árbol de dependencias para eso sería aceptar riesgo
 * de suministro a cambio de nada.
 *
 * Lo que NO hace, dicho por delante: no pone estilos, ni anchos de columna, ni
 * fórmulas, ni formatos de número. Escribe valores. Para entregar datos a
 * quien va a filtrar y ordenar en Excel es exactamente lo que hace falta; el
 * día que el entregable tenga que ir con membrete, será otra cosa y se verá.
 *
 *
 * CÓMO SE COMPRUEBA QUE EL FICHERO ABRE
 *
 * No basta con que lo lea el mismo código que lo escribió. La prueba de este
 * tramo lo abre con `zipfile` y `ElementTree` de Python: otra implementación,
 * otro lenguaje, sin una línea compartida. Si el ZIP estuviera mal armado o el
 * XML mal formado, ahí se rompe.
 *
 *
 * TEXTO EN LÍNEA, NO TABLA DE CADENAS COMPARTIDAS
 *
 * OOXML permite guardar los textos en un `sharedStrings.xml` y referenciarlos.
 * Ahorra bytes cuando hay mucha repetición, y cuesta un índice que mantener
 * coherente. Aquí se escriben en línea: un fallo en ese índice produce un
 * fichero que abre y enseña el texto CAMBIADO de sitio, que es la peor forma
 * de estar mal.
 */

export type XlsxCell = string | number | boolean | null;
export type XlsxSheet = { name: string; rows: XlsxCell[][] };

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** Los caracteres de control que OOXML no admite harían el fichero ilegible. */
function limpiar(s: string): string {
  return s.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function escaparXml(s: string): string {
  return limpiar(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** A, B, … Z, AA, AB … Con 52 preguntas se pasa de la Z sin remedio. */
export function columnName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * El nombre de una hoja, como Excel lo admite.
 *
 * Máximo 31 caracteres y sin `: \ / ? * [ ]`. Un nombre inválido no da error
 * al escribir: da un fichero que Excel se niega a abrir.
 */
export function sheetName(raw: string): string {
  const limpio = limpiar(raw).replace(/[:\\/?*[\]]/g, " ").trim();
  return (limpio || "Hoja").slice(0, 31);
}

function celdaXml(valor: XlsxCell, ref: string): string {
  if (valor === null || valor === "") return "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${ref}"><v>${valor}</v></c>`;
  }
  if (typeof valor === "boolean") {
    return `<c r="${ref}" t="b"><v>${valor ? 1 : 0}</v></c>`;
  }
  const texto = escaparXml(String(valor));
  // `xml:space="preserve"` para que un valor con espacios al borde no se
  // recorte solo al abrirlo.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${texto}</t></is></c>`;
}

function hojaXml(rows: XlsxCell[][]): string {
  const filas = rows.map((fila, i) => {
    const celdas = fila.map((v, j) => celdaXml(v, `${columnName(j)}${i + 1}`)).join("");
    return `<row r="${i + 1}">${celdas}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${filas}</sheetData></worksheet>`;
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Entrada = { nombre: string; datos: Buffer };

/**
 * Un ZIP con lo justo: sin cifrado, sin zip64 y sin marca de tiempo real.
 *
 * La fecha va fija a 1980-01-01. Un `.xlsx` con la hora de generación cambia
 * de bytes en cada llamada, y eso convierte «el fichero es el mismo» en algo
 * que no se puede comprobar. Aquí interesa lo contrario: mismos datos, mismos
 * bytes.
 */
function zip(entradas: Entrada[]): Buffer {
  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let desplazamiento = 0;

  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, "utf8");
    const comprimido = deflateRawSync(e.datos, { level: 6 });
    const suma = crc32(e.datos);

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(0x04034b50, 0);
    cabecera.writeUInt16LE(20, 4);            // versión necesaria
    cabecera.writeUInt16LE(0x0800, 6);        // nombres en UTF-8
    cabecera.writeUInt16LE(8, 8);             // método: deflate
    cabecera.writeUInt16LE(0, 10);            // hora
    cabecera.writeUInt16LE(33, 12);           // fecha: 1980-01-01
    cabecera.writeUInt32LE(suma, 14);
    cabecera.writeUInt32LE(comprimido.length, 18);
    cabecera.writeUInt32LE(e.datos.length, 22);
    cabecera.writeUInt16LE(nombre.length, 26);
    cabecera.writeUInt16LE(0, 28);
    locales.push(cabecera, nombre, comprimido);

    const entradaCentral = Buffer.alloc(46);
    entradaCentral.writeUInt32LE(0x02014b50, 0);
    entradaCentral.writeUInt16LE(20, 4);      // versión que lo creó
    entradaCentral.writeUInt16LE(20, 6);
    entradaCentral.writeUInt16LE(0x0800, 8);
    entradaCentral.writeUInt16LE(8, 10);
    entradaCentral.writeUInt16LE(0, 12);
    entradaCentral.writeUInt16LE(33, 14);
    entradaCentral.writeUInt32LE(suma, 16);
    entradaCentral.writeUInt32LE(comprimido.length, 20);
    entradaCentral.writeUInt32LE(e.datos.length, 24);
    entradaCentral.writeUInt16LE(nombre.length, 28);
    entradaCentral.writeUInt32LE(desplazamiento, 42);
    central.push(entradaCentral, nombre);

    desplazamiento += cabecera.length + nombre.length + comprimido.length;
  }

  const cuerpoCentral = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cuerpoCentral.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);

  return Buffer.concat([...locales, cuerpoCentral, fin]);
}

// ---------------------------------------------------------------------------
// El libro
// ---------------------------------------------------------------------------

/** Un `.xlsx` con las hojas dadas, en su orden. */
export function buildXlsx(hojas: XlsxSheet[]): Buffer {
  if (hojas.length === 0) throw new Error("Un libro sin hojas no es un libro.");
  const nombres = hojas.map((h, i) => sheetName(h.name || `Hoja ${i + 1}`));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + hojas.map((_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      ).join("")
    + `</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
    + nombres.map((n, i) =>
        `<sheet name="${escaparXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
    + `</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + hojas.map((_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      ).join("")
    + `</Relationships>`;

  const partes: Entrada[] = [
    { nombre: "[Content_Types].xml", datos: Buffer.from(contentTypes, "utf8") },
    { nombre: "_rels/.rels", datos: Buffer.from(rels, "utf8") },
    { nombre: "xl/workbook.xml", datos: Buffer.from(workbook, "utf8") },
    { nombre: "xl/_rels/workbook.xml.rels", datos: Buffer.from(workbookRels, "utf8") },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: Buffer.from(hojaXml(h.rows), "utf8"),
    })),
  ];
  return zip(partes);
}
