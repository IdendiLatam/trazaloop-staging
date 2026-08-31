/**
 * Trazaloop · PE-02B6.2 · Leer el texto legal, no enseñar su sintaxis.
 *
 * EL DEFECTO QUE CIERRA
 *
 * `/privacy`, `/terms` y la consola pintaban el documento con
 * `whitespace-pre-wrap`: texto plano, tal cual. Mientras el documento vigente
 * fueron cinco párrafos numerados sin formato, eso funcionó. La sucesora v1.1
 * está escrita en Markdown y tiene nueve tablas, así que publicarla habría
 * enseñado al cliente los `##`, los `**` y las tuberías de las tablas.
 *
 *
 * POR QUÉ SE ESCRIBE AQUÍ Y NO SE INSTALA
 *
 * La alternativa era `react-markdown` con `remark-gfm`, que arrastra unas
 * cuarenta dependencias transitivas. Este repositorio ya tomó la decisión
 * contraria en un caso más difícil: `lib/ai/providers/anthropic.ts` llama al
 * proveedor con `fetch` en lugar de instalar su SDK, y lo explica —«cargar una
 * cadena de suministro entera a cambio de ahorrar cuarenta líneas»—.
 *
 * Aquí el argumento es más fuerte todavía, porque lo que hay que interpretar
 * está cerrado y es pequeño: encabezados, párrafos, negrita, cursiva, listas,
 * enlaces, tablas, citas y separadores. Nada más aparece en un documento legal
 * y nada más se acepta.
 *
 *
 * POR QUÉ ES SEGURO, Y NO POR CONFIANZA
 *
 * No es que se limpie el HTML: **es que no se produce HTML**. Este módulo
 * devuelve un árbol de datos y el componente lo convierte en elementos de
 * React, donde todo el texto pasa por el escapado de React. No hay
 * `dangerouslySetInnerHTML` en ninguna parte, así que un `<script>` dentro del
 * documento no es un riesgo que haya que filtrar: es texto que se ve.
 *
 * Y no hay una sola expresión regular. Las estructuras se reconocen leyendo
 * caracteres. Es más largo y es lo correcto: una expresión regular sobre texto
 * que alguien escribe es el sitio donde aparecen los retrocesos catastróficos,
 * y aquí el texto lo escribe una persona en una consola.
 *
 *
 * LO QUE NO INTERPRETA, A PROPÓSITO
 *
 * El guion bajo NO abre cursiva. En Markdown estándar sí, y aquí no, porque en
 * este dominio los guiones bajos aparecen dentro de identificadores
 * —`organization_id`, `store_false`— y convertirlos en cursiva rompería el
 * texto sin que nadie lo hubiera pedido. La cursiva se escribe con asteriscos.
 */

/** Un trozo de texto con formato dentro de una línea. */
export type LegalInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: LegalInline[] }
  | { kind: "em"; children: LegalInline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; external: boolean; children: LegalInline[] };

/** Un bloque del documento. */
export type LegalBlock =
  | { kind: "heading"; level: 1 | 2 | 3; children: LegalInline[] }
  | { kind: "paragraph"; children: LegalInline[] }
  | { kind: "list"; ordered: boolean; start: number; items: LegalInline[][] }
  | { kind: "table"; head: LegalInline[][]; rows: LegalInline[][][] }
  | { kind: "quote"; blocks: LegalBlock[] }
  | { kind: "rule" };

/**
 * Los únicos esquemas que se convierten en enlace.
 *
 * `javascript:` y `data:` no están, y no es una omisión: un documento legal no
 * necesita ejecutar nada. Lo que no está en esta lista se queda como texto —no
 * se descarta, se lee—, que es la forma de fallar que no pierde información.
 */
const ESQUEMAS_PERMITIDOS = ["http://", "https://", "mailto:"];

/** ¿Este destino puede ser un enlace? */
export function isSafeLegalHref(href: string): boolean {
  const limpio = href.trim();
  if (limpio.length === 0) return false;
  // Relativo dentro del propio sitio: no hay esquema que valga.
  if (limpio.startsWith("/") || limpio.startsWith("#")) return true;
  const minuscula = limpio.toLowerCase();
  for (const esquema of ESQUEMAS_PERMITIDOS) {
    if (minuscula.startsWith(esquema)) return true;
  }
  return false;
}

/** ¿Sale del sitio? Decide `target` y `rel` en el componente. */
function esExterno(href: string): boolean {
  const minuscula = href.trim().toLowerCase();
  return minuscula.startsWith("http://") || minuscula.startsWith("https://")
    || minuscula.startsWith("mailto:");
}


// ============================================================================
// LÍNEAS · reconocer la forma sin expresiones regulares
// ============================================================================

function esEspacio(c: string): boolean {
  return c === " " || c === "\t";
}

function sinSangria(linea: string): string {
  let i = 0;
  while (i < linea.length && esEspacio(linea[i])) i += 1;
  return linea.slice(i);
}

function sangria(linea: string): number {
  let i = 0;
  while (i < linea.length && esEspacio(linea[i])) i += 1;
  return i;
}

function esVacia(linea: string): boolean {
  return sinSangria(linea).length === 0;
}

/** `#`, `##` o `###` seguidos de espacio. Más de tres se lee como texto. */
function nivelDeEncabezado(linea: string): 1 | 2 | 3 | 0 {
  const t = sinSangria(linea);
  let n = 0;
  while (n < t.length && t[n] === "#") n += 1;
  if (n < 1 || n > 3) return 0;
  if (n >= t.length || !esEspacio(t[n])) return 0;
  return n as 1 | 2 | 3;
}

/** Tres o más guiones, o asteriscos, solos en la línea. */
function esSeparador(linea: string): boolean {
  const t = sinSangria(linea).trimEnd();
  if (t.length < 3) return false;
  const c = t[0];
  if (c !== "-" && c !== "*") return false;
  for (const ch of t) if (ch !== c) return false;
  return true;
}

/** `- ` o `* ` al principio. Devuelve el contenido, o null. */
function contenidoDeViñeta(linea: string): string | null {
  const t = sinSangria(linea);
  if (t.length < 2) return null;
  if (t[0] !== "-" && t[0] !== "*") return null;
  if (!esEspacio(t[1])) return null;
  return t.slice(2).trim();
}

/** `12. ` al principio. Devuelve el número y el contenido, o null. */
function contenidoDeNumerada(linea: string): { numero: number; texto: string } | null {
  const t = sinSangria(linea);
  let i = 0;
  while (i < t.length && t[i] >= "0" && t[i] <= "9") i += 1;
  if (i === 0 || i > 9) return null;
  if (i >= t.length || (t[i] !== "." && t[i] !== ")")) return null;
  if (i + 1 >= t.length || !esEspacio(t[i + 1])) return null;
  return { numero: Number(t.slice(0, i)), texto: t.slice(i + 2).trim() };
}

/** `> ` o `>` al principio. Devuelve el contenido, o null. */
function contenidoDeCita(linea: string): string | null {
  const t = sinSangria(linea);
  if (t.length === 0 || t[0] !== ">") return null;
  return t.length > 1 && esEspacio(t[1]) ? t.slice(2) : t.slice(1);
}

/** Una línea de tabla empieza y —normalmente— acaba con tubería. */
function esFilaDeTabla(linea: string): boolean {
  const t = sinSangria(linea).trimEnd();
  return t.length > 1 && t[0] === "|";
}

/**
 * La línea que separa la cabecera del cuerpo: solo tuberías, guiones, dos
 * puntos y espacios, y al menos un guion.
 */
function esSeparadorDeTabla(linea: string): boolean {
  const t = sinSangria(linea).trimEnd();
  if (t.length === 0 || t[0] !== "|") return false;
  let guiones = 0;
  for (const c of t) {
    if (c === "-") guiones += 1;
    else if (c !== "|" && c !== ":" && !esEspacio(c)) return false;
  }
  return guiones > 0;
}

/** Parte una fila en celdas. La tubería escapada (`\|`) no parte. */
function celdas(linea: string): string[] {
  const t = sinSangria(linea).trimEnd();
  const salida: string[] = [];
  let actual = "";
  let i = 0;
  // Se salta la tubería inicial; la final deja una celda vacía que se descarta.
  if (t[0] === "|") i = 1;
  while (i < t.length) {
    const c = t[i];
    if (c === "\\" && i + 1 < t.length && t[i + 1] === "|") {
      actual += "|";
      i += 2;
      continue;
    }
    if (c === "|") {
      salida.push(actual.trim());
      actual = "";
      i += 1;
      continue;
    }
    actual += c;
    i += 1;
  }
  if (actual.trim().length > 0) salida.push(actual.trim());
  return salida;
}

/** ¿Esta línea abre un bloque nuevo? Sirve para saber dónde acaba un párrafo. */
function abreBloque(linea: string): boolean {
  return esVacia(linea)
    || nivelDeEncabezado(linea) !== 0
    || esSeparador(linea)
    || contenidoDeViñeta(linea) !== null
    || contenidoDeNumerada(linea) !== null
    || contenidoDeCita(linea) !== null
    || esFilaDeTabla(linea);
}


// ============================================================================
// LO DE DENTRO DE UNA LÍNEA · se lee carácter a carácter
// ============================================================================

/**
 * Convierte una línea en trozos con formato.
 *
 * Regla de oro: **un marcador que no cierra es texto**. Un asterisco suelto en
 * un documento legal no puede hacer desaparecer el resto del párrafo, y una
 * cursiva mal cerrada no es motivo para fallar.
 */
export function parseLegalInline(texto: string): LegalInline[] {
  const salida: LegalInline[] = [];
  let acumulado = "";

  const soltarTexto = () => {
    if (acumulado.length > 0) {
      salida.push({ kind: "text", text: acumulado });
      acumulado = "";
    }
  };

  let i = 0;
  while (i < texto.length) {
    const c = texto[i];

    // La barra invertida deja pasar el siguiente carácter tal cual.
    if (c === "\\" && i + 1 < texto.length) {
      acumulado += texto[i + 1];
      i += 2;
      continue;
    }

    // Negrita: `**...**`
    if (c === "*" && texto[i + 1] === "*") {
      const cierre = buscarCierre(texto, i + 2, "**");
      if (cierre !== -1) {
        soltarTexto();
        salida.push({ kind: "strong", children: parseLegalInline(texto.slice(i + 2, cierre)) });
        i = cierre + 2;
        continue;
      }
      acumulado += "**";
      i += 2;
      continue;
    }

    // Cursiva: `*...*`. El guion bajo NO abre cursiva; ver la cabecera.
    if (c === "*") {
      const cierre = buscarCierre(texto, i + 1, "*");
      if (cierre !== -1 && cierre > i + 1) {
        soltarTexto();
        salida.push({ kind: "em", children: parseLegalInline(texto.slice(i + 1, cierre)) });
        i = cierre + 1;
        continue;
      }
      acumulado += "*";
      i += 1;
      continue;
    }

    // Literal: `` `...` ``
    if (c === "`") {
      const cierre = buscarCierre(texto, i + 1, "`");
      if (cierre !== -1) {
        soltarTexto();
        salida.push({ kind: "code", text: texto.slice(i + 1, cierre) });
        i = cierre + 1;
        continue;
      }
      acumulado += "`";
      i += 1;
      continue;
    }

    // Enlace: `[texto](destino)`
    if (c === "[") {
      const enlace = leerEnlace(texto, i);
      if (enlace) {
        soltarTexto();
        salida.push(enlace.nodo);
        i = enlace.siguiente;
        continue;
      }
      acumulado += "[";
      i += 1;
      continue;
    }

    acumulado += c;
    i += 1;
  }

  soltarTexto();
  return salida;
}

/** Busca el marcador de cierre, respetando la barra invertida. */
function buscarCierre(texto: string, desde: number, marcador: string): number {
  let i = desde;
  while (i < texto.length) {
    if (texto[i] === "\\") { i += 2; continue; }
    if (texto.startsWith(marcador, i)) return i;
    i += 1;
  }
  return -1;
}

/**
 * Lee `[texto](destino)` desde el corchete.
 *
 * Si el destino no es de un esquema permitido, **no se descarta el enlace: se
 * descarta el destino**. El texto sigue viéndose. Perder la frase por culpa de
 * una dirección mala sería peor que perder el clic.
 */
function leerEnlace(texto: string, inicio: number):
  { nodo: LegalInline; siguiente: number } | null {
  const cierreTexto = buscarCierre(texto, inicio + 1, "]");
  if (cierreTexto === -1) return null;
  if (texto[cierreTexto + 1] !== "(") return null;

  // El destino puede llevar paréntesis anidados; se cuentan.
  let profundidad = 1;
  let i = cierreTexto + 2;
  while (i < texto.length && profundidad > 0) {
    if (texto[i] === "\\") { i += 2; continue; }
    if (texto[i] === "(") profundidad += 1;
    else if (texto[i] === ")") profundidad -= 1;
    if (profundidad === 0) break;
    i += 1;
  }
  if (profundidad !== 0) return null;

  const etiqueta = texto.slice(inicio + 1, cierreTexto);
  const destino = texto.slice(cierreTexto + 2, i).trim();
  const hijos = parseLegalInline(etiqueta);

  if (!isSafeLegalHref(destino)) {
    return { nodo: { kind: "text", text: etiqueta }, siguiente: i + 1 };
  }
  return {
    nodo: { kind: "link", href: destino, external: esExterno(destino), children: hijos },
    siguiente: i + 1,
  };
}


// ============================================================================
// EL DOCUMENTO
// ============================================================================

/**
 * Convierte el texto de un documento legal en bloques.
 *
 * Sirve igual para Markdown y para texto plano: un documento sin marcadores
 * sale como una sucesión de párrafos, que es exactamente lo que hoy se ve. Por
 * eso la v1 vigente no hay que migrarla.
 */
export function parseLegalMarkdown(source: string): LegalBlock[] {
  // `split`/`join` en vez de una expresión regular, para que la afirmación de
  // la cabecera —aquí no hay ni una— sea comprobable y no un decir.
  const lineas = source.split("\r\n").join("\n").split("\r").join("\n").split("\n");
  return parseBloques(lineas);
}

function parseBloques(lineas: string[]): LegalBlock[] {
  const bloques: LegalBlock[] = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];

    if (esVacia(linea)) { i += 1; continue; }

    if (esSeparador(linea)) {
      bloques.push({ kind: "rule" });
      i += 1;
      continue;
    }

    const nivel = nivelDeEncabezado(linea);
    if (nivel !== 0) {
      const t = sinSangria(linea).slice(nivel + 1).trim();
      bloques.push({ kind: "heading", level: nivel, children: parseLegalInline(t) });
      i += 1;
      continue;
    }

    if (contenidoDeCita(linea) !== null) {
      const dentro: string[] = [];
      while (i < lineas.length && contenidoDeCita(lineas[i]) !== null) {
        dentro.push(contenidoDeCita(lineas[i]) as string);
        i += 1;
      }
      bloques.push({ kind: "quote", blocks: parseBloques(dentro) });
      continue;
    }

    if (esFilaDeTabla(linea) && i + 1 < lineas.length && esSeparadorDeTabla(lineas[i + 1])) {
      const cabecera = celdas(linea).map(parseLegalInline);
      i += 2;
      const filas: LegalInline[][][] = [];
      while (i < lineas.length && esFilaDeTabla(lineas[i]) && !esSeparadorDeTabla(lineas[i])) {
        filas.push(celdas(lineas[i]).map(parseLegalInline));
        i += 1;
      }
      bloques.push({ kind: "table", head: cabecera, rows: filas });
      continue;
    }

    const ordenada = contenidoDeNumerada(linea) !== null;
    if (ordenada || contenidoDeViñeta(linea) !== null) {
      const resultado = leerLista(lineas, i, ordenada);
      bloques.push(resultado.bloque);
      i = resultado.siguiente;
      continue;
    }

    // Párrafo: las líneas siguen hasta que otra cosa empieza. Se unen con un
    // espacio porque el documento viene partido a setenta y seis columnas y
    // respetar esos cortes lo dejaría con la forma del editor, no la del texto.
    const partes: string[] = [sinSangria(linea).trim()];
    i += 1;
    while (i < lineas.length && !abreBloque(lineas[i])) {
      partes.push(sinSangria(lineas[i]).trim());
      i += 1;
    }
    bloques.push({ kind: "paragraph", children: parseLegalInline(partes.join(" ")) });
  }

  return bloques;
}

/**
 * Lee una lista entera, incluidas las continuaciones.
 *
 * Dos detalles que importan más de lo que parecen:
 *
 *  · Una línea en blanco NO cierra la lista si lo siguiente es otro punto del
 *    mismo tipo. Sin esto, la política vigente —cinco párrafos numerados
 *    separados por líneas en blanco— saldría como cinco listas que empiezan
 *    todas en «1.».
 *
 *  · Una línea sangrada continúa el punto anterior. El borrador tiene puntos
 *    de tres líneas, y partirlos sería inventar cinco puntos donde hay uno.
 */
function leerLista(lineas: string[], desde: number, ordenada: boolean):
  { bloque: LegalBlock; siguiente: number } {
  const items: LegalInline[][] = [];
  let inicio = 1;
  let primera = true;
  let i = desde;

  const contenido = (linea: string): string | null => {
    if (ordenada) {
      const n = contenidoDeNumerada(linea);
      return n === null ? null : n.texto;
    }
    return contenidoDeViñeta(linea);
  };

  while (i < lineas.length) {
    const texto = contenido(lineas[i]);
    if (texto === null) break;

    if (primera && ordenada) {
      const n = contenidoDeNumerada(lineas[i]);
      if (n) inicio = n.numero;
    }
    primera = false;

    const partes: string[] = [texto];
    i += 1;
    // Continuaciones: sangradas y sin abrir un bloque propio.
    while (i < lineas.length && !esVacia(lineas[i]) && sangria(lineas[i]) > 0
           && contenido(lineas[i]) === null && nivelDeEncabezado(lineas[i]) === 0
           && !esFilaDeTabla(lineas[i]) && contenidoDeCita(lineas[i]) === null) {
      partes.push(sinSangria(lineas[i]).trim());
      i += 1;
    }
    items.push(parseLegalInline(partes.join(" ")));

    // Se saltan líneas en blanco solo si detrás viene otro punto de la lista.
    let j = i;
    while (j < lineas.length && esVacia(lineas[j])) j += 1;
    if (j < lineas.length && contenido(lineas[j]) !== null) { i = j; continue; }
    break;
  }

  return { bloque: { kind: "list", ordered: ordenada, start: inicio, items }, siguiente: i };
}
