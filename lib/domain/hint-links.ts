/**
 * Trazaloop · Sprint T9G · Enlaces SEGUROS dentro de los tips/hints de
 * TrazaDocs (CPR y Textiles). Lógica PURA (sin React, sin BD) para que la
 * vista previa del editor, el hint del usuario final y las pruebas usen
 * EXACTAMENTE el mismo parser — nunca dos implementaciones distintas.
 *
 * Formato admitido en el texto plano del hint:
 *
 *   [Texto del enlace](https://ejemplo.com)
 *   [Ir a configuración](/settings)
 *
 * Seguridad (T9G §12):
 * - Solo `https:` para enlaces externos y rutas internas que comienzan por
 *   `/` (pero NUNCA por `//`, que sería protocol-relative).
 * - `javascript:`, `data:`, `file:`, `vbscript:`, `ftp:`, `http:`, `mailto:`
 *   y cualquier otro protocolo NO producen enlace: el texto se conserva tal
 *   cual, como texto plano.
 * - El HTML nunca se interpreta: el renderizador produce nodos React a
 *   partir de tokens (React escapa el texto); jamás dangerouslySetInnerHTML.
 * - La validación NO depende de una sola expresión regular: la regex solo
 *   tokeniza candidatos `[texto](url)`; la decisión de seguridad la toma
 *   `classifyHintUrl` con el constructor `URL` + allowlist explícita de
 *   protocolo + verificación de caracteres de control.
 */

export type HintToken =
  | { type: "text"; value: string }
  | { type: "break" }
  | { type: "link"; label: string; href: string; external: boolean };

export type HintUrlClassification =
  | { ok: true; href: string; external: boolean }
  | { ok: false };

/** Ayuda breve mostrada junto al editor de hints (T9G §14). */
export const HINT_LINK_HELP_TEXT =
  "Puedes agregar enlaces usando el formato: [Texto del enlace](https://ejemplo.com)";

/** Caracteres que jamás se aceptan dentro de una URL de hint: controles
 *  ASCII (incluye tab/salto de línea), espacios, comillas y ángulos (evita
 *  cualquier intento de romper atributos o incrustar HTML). */
function hasForbiddenUrlCharacters(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true; // controles + espacio
  }
  return /["'<>\\`]/.test(raw);
}

/**
 * Clasifica una URL escrita en un hint.
 * - Ruta interna: comienza por `/` y NO por `//` → enlace interno.
 * - Absoluta: debe parsear con `new URL` y su protocolo debe ser
 *   exactamente `https:` → enlace externo.
 * - Todo lo demás (javascript:, data:, file:, vbscript:, ftp:, http:,
 *   `//dominio.com`, texto arbitrario) → NO es enlace.
 */
export function classifyHintUrl(rawUrl: string): HintUrlClassification {
  const raw = rawUrl.trim();
  if (raw.length === 0) return { ok: false };
  if (hasForbiddenUrlCharacters(raw)) return { ok: false };

  // Ruta interna de Trazaloop: `/algo`, nunca protocol-relative `//host`.
  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return { ok: false };
    return { ok: true, href: raw, external: false };
  }

  // Absolutas: la barrera es el constructor URL + allowlist de protocolo.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false };
  }
  if (parsed.protocol !== "https:") return { ok: false };
  if (parsed.hostname.length === 0) return { ok: false };
  return { ok: true, href: raw, external: true };
}

/** Tokenizador de candidatos `[texto](url)` dentro de UNA línea. La regex
 *  solo localiza la sintaxis Markdown; la seguridad vive en
 *  `classifyHintUrl`. Markdown incompleto (corchetes sin cerrar, paréntesis
 *  sueltos) simplemente no coincide y se conserva como texto. */
const LINK_CANDIDATE = /\[([^\[\]\n]*)\]\(([^()\n]*)\)/g;

function tokenizeLine(line: string, out: HintToken[]): void {
  let cursor = 0;
  LINK_CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_CANDIDATE.exec(line)) !== null) {
    const [full, label, url] = match;
    if (match.index > cursor) {
      out.push({ type: "text", value: line.slice(cursor, match.index) });
    }
    const classified = classifyHintUrl(url);
    const cleanLabel = label.trim();
    if (classified.ok && cleanLabel.length > 0) {
      out.push({
        type: "link",
        label: cleanLabel,
        href: classified.href,
        external: classified.external,
      });
    } else {
      // URL inválida o etiqueta vacía: el texto original se conserva como
      // texto plano — nunca se crea un enlace ni se pierde contenido.
      out.push({ type: "text", value: full });
    }
    cursor = match.index + full.length;
  }
  if (cursor < line.length) {
    out.push({ type: "text", value: line.slice(cursor) });
  }
}

/**
 * Convierte el texto plano de un hint en tokens seguros. Conserva saltos de
 * línea (token `break`), el texto antes y después de cada enlace, y varios
 * enlaces por hint. Nunca lanza: cualquier entrada extraña termina como
 * texto plano.
 */
export function parseHintText(text: string): HintToken[] {
  const tokens: HintToken[] = [];
  const lines = String(text ?? "").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) tokens.push({ type: "break" });
    if (line.length > 0) tokenizeLine(line, tokens);
  });
  return tokens;
}

/** ¿El hint tiene contenido real que amerite mostrar el botón "i"? */
export function hasHintContent(hint: string | null | undefined): boolean {
  return typeof hint === "string" && hint.trim().length > 0;
}
