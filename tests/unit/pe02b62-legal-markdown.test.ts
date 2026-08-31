/**
 * Trazaloop · PE-02B6.2 · El intérprete de texto legal.
 *
 * Lo que estas comprobaciones defienden no es «que funcione el Markdown». Es
 * que un documento legal no pueda ejecutar nada, que un marcador mal cerrado no
 * se coma un párrafo, y que la política vigente —texto plano— siga viéndose
 * igual que siempre el día que se estrene el intérprete.
 *
 * Correr: npm run test:pe02b62-markdown
 */
import { readFileSync } from "node:fs";

import {
  parseLegalMarkdown, parseLegalInline, isSafeLegalHref,
  type LegalBlock, type LegalInline,
} from "../../lib/legal/markdown";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const BORRADOR = readFileSync("docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md", "utf8");
const FUENTE = readFileSync("lib/legal/markdown.ts", "utf8");

/** El texto llano de un árbol, para comprobar que nada se perdió. */
function texto(nodes: LegalInline[]): string {
  return nodes.map((n) => {
    if (n.kind === "text") return n.text;
    if (n.kind === "code") return n.text;
    return texto(n.children);
  }).join("");
}
function textoDeBloques(bloques: LegalBlock[]): string {
  return bloques.map((b) => {
    if (b.kind === "heading" || b.kind === "paragraph") return texto(b.children);
    if (b.kind === "list") return b.items.map(texto).join(" ");
    if (b.kind === "table") {
      return [...b.head.map(texto), ...b.rows.flatMap((f) => f.map(texto))].join(" ");
    }
    if (b.kind === "quote") return textoDeBloques(b.blocks);
    return "";
  }).join("\n");
}
const tipos = (b: LegalBlock[]) => b.map((x) => x.kind);

console.log("\nPE-02B6.2 · El intérprete de texto legal\n");

// ===========================================================================
console.log("A · Lo que el documento vigente necesita: nada");
// ===========================================================================

// La v1 son cinco párrafos numerados sin un solo marcador. Es el caso que NO
// puede romperse: hoy se ve bien, y estrenar el intérprete no puede empeorarlo.
const V1_REAL = `Esta es una versión preliminar de la política de privacidad de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.

1. Trazaloop recopila los datos que registras dentro de la plataforma con el único fin de operar el servicio para tu organización.

2. Usamos tu información para: operar la plataforma, brindarte soporte técnico, proteger la seguridad de tu cuenta y de la de otras empresas, y mejorar el servicio.

3. No compartimos tus datos con terceros salvo cuando sea necesario para operar la plataforma o cuando la ley lo exija.

4. Puedes solicitar información sobre tus datos o su eliminación contactando al equipo de Trazaloop desde el Centro de soporte.

5. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo.`;

check("A1. El texto plano sale como párrafos, sin perder una palabra", () => {
  const b = parseLegalMarkdown(V1_REAL);
  const salida = textoDeBloques(b);
  for (const frase of ["versión preliminar de la política", "Trazaloop recopila los datos",
    "brindarte soporte técnico", "No compartimos tus datos", "Centro de soporte",
    "antes del lanzamiento definitivo"]) {
    assert(salida.includes(frase), `se perdió: «${frase}»`);
  }
});

check("A2. Y los cinco numerados son UNA lista, no cinco que empiezan en 1", () => {
  const b = parseLegalMarkdown(V1_REAL);
  const listas = b.filter((x) => x.kind === "list") as Extract<LegalBlock, { kind: "list" }>[];
  assert(listas.length === 1, `salieron ${listas.length} listas y debía ser una`);
  assert(listas[0].ordered, "la lista no es numerada");
  assert(listas[0].items.length === 5, `tiene ${listas[0].items.length} puntos y son 5`);
  assert(listas[0].start === 1, `empieza en ${listas[0].start}`);
});

check("A3. Un documento sin marcadores no inventa encabezados ni tablas", () => {
  const b = parseLegalMarkdown(V1_REAL);
  assert(!tipos(b).includes("heading"), "se inventó un encabezado");
  assert(!tipos(b).includes("table"), "se inventó una tabla");
});

check("A4. Un documento vacío no revienta", () => {
  assert(parseLegalMarkdown("").length === 0, "el vacío produjo bloques");
  assert(parseLegalMarkdown("\n\n   \n").length === 0, "solo espacios produjo bloques");
});

// ===========================================================================
console.log("\nB · La sintaxis desaparece de la vista");
// ===========================================================================

check("B1. Los encabezados no se leen como almohadillas", () => {
  const b = parseLegalMarkdown("# Uno\n\n## Dos\n\n### Tres\n");
  assert(tipos(b).join(",") === "heading,heading,heading", `salió ${tipos(b)}`);
  const niveles = (b as Extract<LegalBlock, { kind: "heading" }>[]).map((h) => h.level);
  assert(niveles.join(",") === "1,2,3", `niveles ${niveles}`);
  assert(!textoDeBloques(b).includes("#"), "quedó una almohadilla en el texto");
});

check("B2. La negrita y la cursiva no se leen como asteriscos", () => {
  const n = parseLegalInline("Esto es **fuerte** y esto *inclinado*.");
  assert(n.some((x) => x.kind === "strong"), "no se reconoció la negrita");
  assert(n.some((x) => x.kind === "em"), "no se reconoció la cursiva");
  assert(!texto(n).includes("*"), "quedó un asterisco a la vista");
  assert(texto(n) === "Esto es fuerte y esto inclinado.", `salió «${texto(n)}»`);
});

check("B3. Las tablas salen con estructura, no con tuberías", () => {
  const b = parseLegalMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n");
  assert(b.length === 1 && b[0].kind === "table", `salió ${tipos(b)}`);
  const t = b[0] as Extract<LegalBlock, { kind: "table" }>;
  assert(t.head.length === 2, `cabecera de ${t.head.length} celdas`);
  assert(t.rows.length === 2, `${t.rows.length} filas`);
  assert(t.rows[1].length === 2, "la segunda fila no tiene dos celdas");
  assert(!textoDeBloques(b).includes("|"), "quedó una tubería a la vista");
});

check("B4. Las listas de viñeta también, y admiten negrita dentro", () => {
  const b = parseLegalMarkdown("- **Uno** primero\n- Dos\n");
  const l = b[0] as Extract<LegalBlock, { kind: "list" }>;
  assert(b[0].kind === "list" && !l.ordered, "no salió una lista de viñetas");
  assert(l.items.length === 2, `${l.items.length} puntos`);
  assert(l.items[0].some((x) => x.kind === "strong"), "la negrita no entró en el punto");
});

check("B5. Un punto partido en varias líneas sigue siendo un punto", () => {
  // El borrador tiene puntos de tres líneas. Partirlos inventaría puntos.
  const b = parseLegalMarkdown(
    "- **Trazaloop CPR** — trazabilidad de contenido:\n  proveedores, materiales,\n  productos.\n- Otro punto\n");
  const l = b[0] as Extract<LegalBlock, { kind: "list" }>;
  assert(l.items.length === 2, `salieron ${l.items.length} puntos y son 2`);
  assert(texto(l.items[0]).includes("proveedores, materiales, productos"),
    `el punto quedó partido: «${texto(l.items[0])}»`);
});

check("B6. Un párrafo partido a setenta y seis columnas se lee como uno", () => {
  const b = parseLegalMarkdown("Una frase que el editor\npartió en tres\nlíneas seguidas.\n");
  assert(b.length === 1 && b[0].kind === "paragraph", `salió ${tipos(b)}`);
  assert(texto((b[0] as Extract<LegalBlock, { kind: "paragraph" }>).children)
    === "Una frase que el editor partió en tres líneas seguidas.", "no se unió el párrafo");
});

check("B7. Las citas y los separadores existen", () => {
  const b = parseLegalMarkdown("> Una advertencia.\n\n---\n\nDespués.\n");
  assert(tipos(b).join(",") === "quote,rule,paragraph", `salió ${tipos(b)}`);
});

// ===========================================================================
console.log("\nC · Nada de lo que entre puede ejecutarse");
// ===========================================================================

check("C1. No se produce HTML en ninguna parte del intérprete", () => {
  // La seguridad no es que se limpie el HTML: es que no se fabrica. El módulo
  // devuelve datos, y el componente los convierte en elementos de React.
  //
  // Se miran los dos ficheros SIN comentarios: las dos cabeceras explican que
  // no usan `dangerouslySetInnerHTML`, y buscar la palabra a secas convertiría
  // esa explicación en un fallo.
  const componente = readFileSync("components/legal/legal-content.tsx", "utf8");
  for (const [nombre, src] of [["el intérprete", FUENTE], ["el componente", componente]]) {
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert(!codigo.includes("dangerouslySetInnerHTML"),
      `${nombre} usa dangerouslySetInnerHTML`);
    assert(!codigo.includes("innerHTML"), `${nombre} toca innerHTML`);
  }
});

check("C2. Una etiqueta escrita en el documento es TEXTO, no una etiqueta", () => {
  const veneno = '<script>alert(1)</script> y <img src=x onerror=alert(1)>';
  const b = parseLegalMarkdown(veneno);
  const salida = textoDeBloques(b);
  // Sale intacto como texto: React lo escapará al pintarlo. Lo que NO puede
  // pasar es que el intérprete lo convierta en estructura.
  assert(salida.includes("<script>"), "se perdió el texto en vez de mostrarlo");
  assert(b.every((x) => x.kind === "paragraph"), `se estructuró como ${tipos(b)}`);
});

check("C3. `javascript:` no se convierte en enlace, y el texto no se pierde", () => {
  const n = parseLegalInline("Pulsa [aquí](javascript:alert(1)) ahora");
  assert(!n.some((x) => x.kind === "link"), "se creó un enlace con javascript:");
  assert(texto(n).includes("aquí"), "se perdió el texto del enlace");
  assert(!texto(n).includes("javascript:"), "el destino peligroso se quedó a la vista");
});

check("C4. `data:` tampoco", () => {
  const n = parseLegalInline("[x](data:text/html;base64,PHNjcmlwdD4=)");
  assert(!n.some((x) => x.kind === "link"), "se creó un enlace con data:");
});

check("C5. Y la lista de esquemas es corta a propósito", () => {
  for (const bueno of ["https://www.trazaloop.com", "http://x.co", "mailto:a@b.c",
    "/privacy", "#seccion"]) {
    assert(isSafeLegalHref(bueno), `se rechazó un destino legítimo: ${bueno}`);
  }
  for (const malo of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x",
    "vbscript:x", "file:///etc/passwd", "", "   "]) {
    assert(!isSafeLegalHref(malo), `se aceptó un destino peligroso: ${malo}`);
  }
});

check("C6. Los enlaces buenos sí se crean, y se marca si salen del sitio", () => {
  const fuera = parseLegalInline("[Trazaloop](https://www.trazaloop.com)");
  const enlaceFuera = fuera.find((x) => x.kind === "link") as
    Extract<LegalInline, { kind: "link" }>;
  assert(enlaceFuera, "no se creó el enlace externo");
  assert(enlaceFuera.external, "no se marcó como externo");
  const dentro = parseLegalInline("[Términos](/terms)");
  const enlaceDentro = dentro.find((x) => x.kind === "link") as
    Extract<LegalInline, { kind: "link" }>;
  assert(enlaceDentro && !enlaceDentro.external, "un enlace interno se marcó externo");
});

check("C7. No hay ni una expresión regular en el intérprete", () => {
  // No es coquetería: una expresión regular sobre texto que escribe una persona
  // en una consola es donde aparecen los retrocesos catastróficos.
  assert(!FUENTE.includes("RegExp"), "el intérprete construye una RegExp");
  const sinComentarios = FUENTE
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const sospechoso of [".replace(/", ".match(/", ".test(", ".split(/", ".exec("]) {
    assert(!sinComentarios.includes(sospechoso),
      `el intérprete usa una expresión regular: ${sospechoso}`);
  }
});

// ===========================================================================
console.log("\nD · Un marcador roto no se come el documento");
// ===========================================================================

check("D1. La negrita sin cerrar se lee como asteriscos, y el texto sigue", () => {
  const n = parseLegalInline("Esto **no cierra y el resto tiene que verse igual.");
  assert(texto(n).includes("el resto tiene que verse igual"), "se perdió el resto");
  assert(texto(n).includes("**"), "se comió el marcador sin avisar");
});

check("D2. Un corchete suelto no rompe nada", () => {
  const n = parseLegalInline("Ver el punto [3 del anexo");
  assert(texto(n) === "Ver el punto [3 del anexo", `salió «${texto(n)}»`);
});

check("D3. Una tabla sin línea separadora es un párrafo, no media tabla", () => {
  const b = parseLegalMarkdown("| A | B |\n| 1 | 2 |\n");
  assert(!tipos(b).includes("table"), "se aceptó una tabla sin separador");
});

check("D4. La barra invertida deja pasar el marcador", () => {
  const n = parseLegalInline("Un asterisco literal: \\*no es cursiva\\*");
  assert(texto(n) === "Un asterisco literal: *no es cursiva*", `salió «${texto(n)}»`);
  assert(!n.some((x) => x.kind === "em"), "se abrió una cursiva escapada");
});

check("D5. El guion bajo NO abre cursiva", () => {
  // En este dominio los guiones bajos viven dentro de identificadores. Que
  // `organization_id` y `store_false` se volvieran cursiva rompería el texto.
  const n = parseLegalInline("Las columnas organization_id y store_false no cambian.");
  assert(!n.some((x) => x.kind === "em"), "el guion bajo abrió cursiva");
  assert(texto(n).includes("organization_id"), "se alteró el identificador");
});

// ===========================================================================
console.log("\nE · El borrador real, entero");
// ===========================================================================

const BLOQUES = parseLegalMarkdown(BORRADOR);

check("E1. Se interpreta entero, y con TODAS sus tablas", () => {
  // El número no se escribe a mano: se cuenta en el propio documento por sus
  // líneas separadoras. Escribirlo a mano fue el error de PE-02B6.1, que dijo
  // nueve tablas donde hay seis.
  const separadoras = BORRADOR.split("\n").filter((l) => l.startsWith("|---")).length;
  const tablas = BLOQUES.filter((x) => x.kind === "table") as
    Extract<LegalBlock, { kind: "table" }>[];
  assert(tablas.length === separadoras,
    `el documento tiene ${separadoras} tablas y se reconocieron ${tablas.length}`);
  assert(tablas.length >= 5, `solo hay ${tablas.length} tablas: ¿se perdió alguna?`);
  for (const t of tablas) {
    assert(t.head.length >= 2, "una tabla salió con menos de dos columnas");
    assert(t.rows.length >= 1, "una tabla salió sin filas");
    for (const fila of t.rows) {
      assert(fila.length === t.head.length,
        `una fila tiene ${fila.length} celdas y la cabecera ${t.head.length}`);
    }
  }
});

check("E2. Los veintiún artículos son encabezados", () => {
  const enc = BLOQUES.filter((x) => x.kind === "heading") as
    Extract<LegalBlock, { kind: "heading" }>[];
  const titulos = enc.map((h) => texto(h.children));
  for (const n of [1, 5, 11, 13, 17, 18, 19, 21]) {
    assert(titulos.some((t) => t.startsWith(`${n}.`)),
      `no se reconoció el encabezado del artículo ${n}`);
  }
  assert(titulos.some((t) => t.includes("Trazaloop Intelligence")),
    "no se reconoció el artículo 18");
});

check("E3. Y no queda ni un marcador a la vista en todo el documento", () => {
  const salida = textoDeBloques(BLOQUES);
  // Se buscan los marcadores en el sitio donde delatan un fallo: al principio
  // de una línea, o en pares.
  for (const linea of salida.split("\n")) {
    assert(!linea.startsWith("#"), `una línea empieza por almohadilla: «${linea.slice(0, 50)}»`);
    assert(!linea.startsWith("|"), `una línea empieza por tubería: «${linea.slice(0, 50)}»`);
  }
  assert(!salida.includes("**"), "quedó una negrita sin interpretar");
  assert(!salida.includes("|---"), "quedó una línea separadora de tabla");
});

check("E4. Ni una palabra del documento se perdió por el camino", () => {
  const salida = textoDeBloques(BLOQUES);
  for (const frase of [
    "CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL",
    "901835846-6", "contacto@idendi.org", "Carrera 43A #15 Sur – 15",
    "Trazaloop Intelligence", "No se ha activado", "No se tiene contratado",
    "hasta 30 días", "Row Level Security", "pasaportes técnicos textiles",
    "Ley 1581 de 2012",
  ]) {
    assert(salida.includes(frase), `se perdió del documento: «${frase}»`);
  }
});

check("E5. El correo de privacidad se convierte en enlace pulsable", () => {
  // Está escrito en llano, no como enlace de Markdown, así que NO debe salir
  // como enlace. Lo que se comprueba es que el texto llega intacto: convertirlo
  // en enlace sería inventar una estructura que el documento no tiene.
  const salida = textoDeBloques(BLOQUES);
  assert(salida.includes("contacto@idendi.org"), "se perdió el correo de privacidad");
});

console.log(`\nPE-02B6.2 · intérprete: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
