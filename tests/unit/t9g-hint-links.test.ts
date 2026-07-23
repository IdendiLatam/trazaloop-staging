/**
 * Trazaloop · Sprint T9G · Tests de SEGURIDAD DE ENLACES en hints (§17).
 * Ejercitan el parser PURO compartido (lib/domain/hint-links) que usan el
 * hint del usuario final (CPR y Textiles) y la vista previa del editor —
 * el mismo módulo, nunca dos parsers.
 *
 * Correr: npm run test:t9g-links
 */
import fs from "node:fs";
import path from "node:path";
import {
  parseHintText,
  classifyHintUrl,
  hasHintContent,
  HINT_LINK_HELP_TEXT,
  type HintToken,
} from "../../lib/domain/hint-links";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function links(tokens: HintToken[]) {
  return tokens.filter((t): t is Extract<HintToken, { type: "link" }> => t.type === "link");
}
function plainText(tokens: HintToken[]): string {
  return tokens
    .map((t) => (t.type === "text" ? t.value : t.type === "link" ? t.label : "\n"))
    .join("");
}
function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
}

console.log("Trazaloop · T9G: enlaces seguros en hints (parser compartido)\n");

check("1. Texto sin enlaces se conserva íntegro como texto plano", () => {
  const tokens = parseHintText("Describe el objetivo del documento.");
  assert(links(tokens).length === 0, "no debía producir enlaces");
  assert(plainText(tokens) === "Describe el objetivo del documento.", "el texto debía conservarse");
});

check("2. Enlace HTTPS válido produce un enlace externo", () => {
  const tokens = parseHintText("Consulta [la norma](https://ejemplo.com) antes de diligenciar.");
  const ls = links(tokens);
  assert(ls.length === 1, "debía producir exactamente un enlace");
  assert(ls[0].href === "https://ejemplo.com", `href inesperado: ${ls[0].href}`);
  assert(ls[0].external === true, "https debía clasificarse como externo");
  assert(ls[0].label === "la norma", "la etiqueta debía conservarse");
});

check("3. Enlace interno válido (/settings) produce un enlace interno", () => {
  const tokens = parseHintText("[Ir a configuración](/settings)");
  const ls = links(tokens);
  assert(ls.length === 1, "debía producir un enlace");
  assert(ls[0].href === "/settings", `href inesperado: ${ls[0].href}`);
  assert(ls[0].external === false, "una ruta interna no es externa");
});

check("4. Varios enlaces en un mismo hint se producen todos", () => {
  const tokens = parseHintText(
    "Mira [la guía](https://ejemplo.com/guia) y luego [tus evidencias](/evidences) aquí."
  );
  const ls = links(tokens);
  assert(ls.length === 2, `debían producirse 2 enlaces, hubo ${ls.length}`);
  assert(ls[0].external && !ls[1].external, "externo e interno debían distinguirse");
});

check("5. Los saltos de línea se conservan como tokens break", () => {
  const tokens = parseHintText("Primera línea\nSegunda línea");
  assert(tokens.some((t) => t.type === "break"), "debía existir un token break");
  assert(plainText(tokens).includes("Primera línea"), "línea 1 conservada");
  assert(plainText(tokens).includes("Segunda línea"), "línea 2 conservada");
});

check("6. URL con parámetros de consulta es válida", () => {
  const ls = links(parseHintText("[Buscar](https://ejemplo.com/busqueda?q=norma&page=2)"));
  assert(ls.length === 1, "debía producir un enlace");
  assert(ls[0].href.includes("?q=norma&page=2"), "los parámetros debían conservarse");
});

check("7. URL con fragmento (#seccion) es válida", () => {
  const ls = links(parseHintText("[Sección 3](https://ejemplo.com/doc#seccion-3)"));
  assert(ls.length === 1, "debía producir un enlace");
  assert(ls[0].href.endsWith("#seccion-3"), "el fragmento debía conservarse");
});

check("8. javascript: NO produce enlace y el texto se conserva", () => {
  const tokens = parseHintText("[Haz clic](javascript:alert(1))");
  assert(links(tokens).length === 0, "javascript: jamás produce enlace");
  assert(plainText(tokens).includes("javascript:alert(1"), "el texto crudo debía conservarse como texto");
});

check("9. data: NO produce enlace", () => {
  const tokens = parseHintText("[Abrir](data:text/html;base64,PHNjcmlwdD4)");
  assert(links(tokens).length === 0, "data: jamás produce enlace");
});

check("10. file: NO produce enlace", () => {
  const tokens = parseHintText("[Archivo local](file:///etc/passwd)");
  assert(links(tokens).length === 0, "file: jamás produce enlace");
});

check("11. vbscript: NO produce enlace", () => {
  const tokens = parseHintText("[Ejecutar](vbscript:msgbox)");
  assert(links(tokens).length === 0, "vbscript: jamás produce enlace");
});

check("12. URL protocol-relative //dominio.com NO produce enlace", () => {
  const tokens = parseHintText("[Sitio](//dominio.com/ruta)");
  assert(links(tokens).length === 0, "//dominio.com jamás produce enlace");
  assert(classifyHintUrl("//dominio.com").ok === false, "classifyHintUrl debía rechazarla");
});

check("13. <script> escrito en el hint queda como texto plano (nunca se interpreta)", () => {
  const tokens = parseHintText('Cuidado <script>alert("x")</script> aquí.');
  assert(links(tokens).length === 0, "no debía producir enlaces");
  const text = plainText(tokens);
  assert(text.includes("<script>"), "el texto debía conservarse literal, como texto plano");
  // El renderizador jamás usa HTML crudo: verificado también en la fuente.
  const source = read("components/ui/hint-text.tsx");
  assert(!source.includes("dangerouslySetInnerHTML="), "HintText jamás usa el atributo dangerouslySetInnerHTML");
});

check("14. <a href=...> escrito en el hint NO se interpreta como HTML", () => {
  const tokens = parseHintText('<a href="https://malo.com">clic</a>');
  assert(links(tokens).length === 0, "el HTML embebido jamás produce enlaces");
  assert(plainText(tokens).includes('<a href='), "debía conservarse como texto plano");
});

check("15. El enlace externo del renderizador usa rel=noopener noreferrer", () => {
  const source = read("components/ui/hint-text.tsx");
  assert(source.includes('rel="noopener noreferrer"'), "faltó rel=noopener noreferrer");
});

check("16. El enlace externo del renderizador abre en nueva pestaña (target=_blank)", () => {
  const source = read("components/ui/hint-text.tsx");
  assert(source.includes('target="_blank"'), "faltó target=_blank en el enlace externo");
});

check("17. El enlace interno NO fuerza nueva pestaña (Link de Next sin target)", () => {
  const source = read("components/ui/hint-text.tsx");
  const internalBlock = source.slice(source.lastIndexOf("<Link"));
  assert(!internalBlock.includes("target="), "el enlace interno no debía llevar target");
  assert(source.includes('import Link from "next/link"'), "el interno debía usar next/link");
});

check("18. Markdown malformado no rompe el parser y se conserva como texto", () => {
  const cases = ["[sin cerrar](https://ejemplo.com", "[etiqueta] (con espacio)", "](invertido)[", "[]()", "[solo corchetes]"];
  for (const c of cases) {
    const tokens = parseHintText(c);
    assert(Array.isArray(tokens), `parseHintText lanzó con: ${c}`);
    assert(links(tokens).length === 0, `no debía producir enlaces con: ${c}`);
    assert(plainText(tokens) === c, `el texto debía conservarse literal con: ${c}`);
  }
});

check("19. El texto anterior y posterior al enlace se conserva", () => {
  const tokens = parseHintText("Antes [enlace](https://ejemplo.com) después.");
  const text = plainText(tokens);
  assert(text.startsWith("Antes "), "el texto anterior debía conservarse");
  assert(text.endsWith(" después."), "el texto posterior debía conservarse");
  assert(links(tokens).length === 1, "el enlace debía producirse");
});

check("20. Una URL inválida se muestra como texto seguro, sin crear enlace", () => {
  const tokens = parseHintText("[Texto](no-es-una-url)");
  assert(links(tokens).length === 0, "no debía producir enlace");
  assert(plainText(tokens) === "[Texto](no-es-una-url)", "el contenido no debía perderse ni romperse");
});

console.log("\nTrazaloop · T9G: barreras adicionales del clasificador\n");

check("21. classifyHintUrl: allowlist explícita — http:, mailto: y ftp: rechazados", () => {
  for (const raw of ["http://ejemplo.com", "mailto:x@y.com", "ftp://ejemplo.com/archivo"]) {
    assert(classifyHintUrl(raw).ok === false, `${raw} debía rechazarse`);
  }
});

check("22. classifyHintUrl: caracteres de control, comillas y ángulos rechazados", () => {
  for (const raw of ["https://ejemplo.com/\u0000", 'https://ejemplo.com/"x', "https://ejemplo.com/<x>", "https://ejemplo.com/a b"]) {
    assert(classifyHintUrl(raw).ok === false, `URL con caracteres prohibidos aceptada: ${JSON.stringify(raw)}`);
  }
});

check("23. hasHintContent: vacío, espacios o null no ameritan botón «i»", () => {
  assert(hasHintContent("Contenido real") === true, "contenido real debía aceptarse");
  assert(hasHintContent("") === false, "cadena vacía no tiene contenido");
  assert(hasHintContent("   \n  ") === false, "solo espacios no tiene contenido");
  assert(hasHintContent(null) === false, "null no tiene contenido");
});

check("24. La ayuda del editor documenta el formato de enlaces", () => {
  assert(
    HINT_LINK_HELP_TEXT.includes("[Texto del enlace](https://ejemplo.com)"),
    "la ayuda debía mostrar el formato exacto"
  );
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
