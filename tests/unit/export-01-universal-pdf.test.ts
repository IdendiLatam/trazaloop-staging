/**
 * Trazaloop · EXPORT-01 · Puras, estáticas y con PDF REALES.
 *
 * Tres cosas que estas comprobaciones defienden:
 *
 * 1. El CONTRATO del registro: claves únicas, permiso, cargador, tipo. Es lo
 *    que impide que una entidad exportable nueva quede a medio declarar.
 * 2. La SEGURIDAD del endpoint: solo claves registradas, solo filtros
 *    declarados, ninguna URL ni HTML del cliente.
 * 3. Los ARCHIVOS: no basta con un HTTP 200. Se generan PDF de verdad y se
 *    abren para comprobar magic, páginas, texto extraíble y acentos (§60).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPrintDocument } from "../../lib/export/render";
import { buildFilename, contentDisposition, pdfHeaders } from "../../lib/export/filename";
import { validateFilters } from "../../lib/export/filters";
import type { PrintDocument } from "../../lib/export/print-model";
import { ALLOWED_LOGO_TYPES } from "../../lib/domain/settings";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

/** Abre un PDF y devuelve lo que se puede comprobar sin depender de nada. */
function inspectPdf(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  const texts: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    texts.push(Buffer.from(m[1], "latin1").toString("latin1"));
  }
  return {
    magic: bytes.subarray(0, 5).toString("ascii"),
    endsWithEof: bytes.subarray(-6).toString("ascii").includes("%%EOF"),
    pages: (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
    texts,
    has: (needle: string) => texts.some((t) => t.includes(needle)),
  };
}

const ORG = { name: "Fábrica de Ñandúes S.A.S.", legalName: null, taxId: "900.111.222-3", logo: null };

function doc(overrides: Partial<PrintDocument> = {}): PrintDocument {
  return {
    documentName: "Ficha de riesgo",
    recordType: "Riesgo", title: "Interrupción de un proveedor crítico", code: "R-2026-001",
    organization: ORG, systemLine: "Trazaloop Quality · riesgos",
    orientation: "portrait", generatedAt: "2026-08-26T10:00:00.000Z",
    sections: [], ...overrides,
  };
}

console.log("\nEXPORT-01 · puras, estáticas y con PDF reales\n");

// ---------------------------------------------------------------------------
console.log("A · El contrato del registro");

// El registro importa adaptadores con `server-only`, así que no se puede cargar
// aquí. Se comprueba sobre el CÓDIGO, que es donde vive el contrato.
const REGISTRY = read("lib/export/registry.ts");
const ADAPTER_DIR = "lib/export/adapters";
const ADAPTERS = readdirSync(join(ROOT, ADAPTER_DIR))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: `${ADAPTER_DIR}/${f}`, source: read(`${ADAPTER_DIR}/${f}`) }));

/**
 * Extrae las claves de las DEFINICIONES, no las de los filtros.
 *
 * Un filtro también se declara con `key:`, así que buscarlo a secas contaba
 * «estado» o «vista» como si fueran exportaciones. El discriminante es la
 * FORMA de la clave: `modulo.entidad.tipo`, con dos puntos. Ningún filtro los
 * lleva, y la comprobación A3 exige esa forma, así que las dos reglas se
 * sostienen mutuamente.
 *
 * Se busca por forma y no por bloque `export const … : ExportDefinition`
 * porque varias definiciones se construyen con fábricas —el documento
 * controlado por módulo, los catálogos— y un analizador atado a la sintaxis
 * del bloque las perdía en silencio: contaba menos exportaciones de las que
 * hay, que es la peor forma de fallar para una prueba de cobertura.
 */
function declaredDefinitions(): { key: string; source: string; file: string }[] {
  const out: { key: string; source: string; file: string }[] = [];
  const KEY = /"([a-z0-9-]+\.[a-z0-9-]+\.(?:detail|list|historical))"/g;
  for (const a of ADAPTERS) {
    // Sin comentarios: un archivo puede NOMBRAR una clave para explicar algo, y
    // contar esa mención inflaría el registro con exportaciones inexistentes.
    const code = a.source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(KEY)) {
      if (out.some((d) => d.key === m[1])) continue;
      out.push({ key: m[1], source: a.source, file: a.file });
    }
  }
  return out;
}
const DEFS = declaredDefinitions();

check("A1. hay exportaciones declaradas en los cuatro módulos", () => {
  assert(DEFS.length >= 25, `se esperaban muchas definiciones, hay ${DEFS.length}`);
  for (const mod of ["quality", "cpr", "textiles"]) {
    assert(DEFS.some((d) => d.key.startsWith(mod + ".")), `ningún exportador de ${mod}`);
  }
});

check("A2. las claves son únicas", () => {
  const seen = new Map<string, number>();
  for (const d of DEFS) seen.set(d.key, (seen.get(d.key) ?? 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  assert(dupes.length === 0, `claves repetidas: ${dupes.join(", ")}`);
});

check("A3. la clave nombra módulo, entidad y tipo", () => {
  for (const d of DEFS) {
    const parts = d.key.split(".");
    assert(parts.length === 3, `«${d.key}» no tiene la forma modulo.entidad.tipo`);
    assert(["detail", "list", "historical"].includes(parts[2]),
      `«${d.key}» no termina en detail, list ni historical`);
  }
});

check("A4. toda definición declara módulo, entidad, tipo de registro, permiso y orientación", () => {
  for (const a of ADAPTERS) {
    const blocks = a.source.split(/export const \w+: ExportDefinition = \{/).slice(1);
    for (const b of blocks) {
      const head = b.slice(0, b.indexOf("async load"));
      for (const req of ["module:", "entity:", "recordType:", "kind:", "permission:", "orientation:"]) {
        assert(head.includes(req), `en ${a.file} falta ${req} en una definición`);
      }
    }
  }
});

check("A5. cada definición tiene su cargador", () => {
  for (const a of ADAPTERS) {
    const keys = (a.source.match(/key:\s*"[^"]+"/g) ?? []).length;
    const loads = (a.source.match(/async load\(/g) ?? []).length;
    // `catalogList` genera varias definiciones desde una sola fábrica.
    const factories = (a.source.match(/function catalogList\(/g) ?? []).length;
    assert(loads >= 1 || factories >= 1, `${a.file} declara claves sin cargador`);
  }
});

check("A6. el registro incluye TODAS las definiciones declaradas", () => {
  for (const d of DEFS) {
    // El nombre de la constante exportada tiene que aparecer en el registro.
    const nameMatch = d.source.slice(0, d.source.indexOf(`key: "${d.key}"`))
      .match(/export const (\w+)(?::\s*ExportDefinition)?\s*=\s*[^;]*$/);
    if (!nameMatch) continue;
    assert(REGISTRY.includes(nameMatch[1]),
      `«${d.key}» está declarada pero no entra en el registro`);
  }
});

check("A7. el registro es CERRADO: nada se resuelve por cadena libre", () => {
  assert(!/from\s*\(\s*\w+\s*\)/.test(REGISTRY), "el registro no puede construir consultas");
  assert(/BY_KEY\.get\(key\)\s*\?\?\s*null/.test(REGISTRY),
    "buscar una clave inexistente debe devolver null, no lanzar");
});

check("A8. solo los dos artefactos heredados usan el escape de buffer", () => {
  const usingBuffer = ADAPTERS.filter((a) => /\bbuffer,/.test(a.source)).map((a) => a.file);
  assert(usingBuffer.length === 1 && usingBuffer[0].includes("quality-documents"),
    `el escape debe limitarse al documento y la lista maestra: ${usingBuffer.join(", ")}`);
});

// ---------------------------------------------------------------------------
console.log("\nB · El endpoint no acepta nada que no haya declarado");

const ROUTE = read("app/(app)/(shell)/export/[key]/route.ts");

check("B1. la empresa sale de la SESIÓN, nunca de la petición", () => {
  assert(/requireActiveOrg\(\)/.test(ROUTE), "debe resolver la empresa activa");
  assert(!/searchParams\.get\(\s*["']organization/.test(ROUTE),
    "jamás puede leer un organization_id de la URL");
  assert(/organizationId: org\.organizationId/.test(ROUTE),
    "la consulta debe llevar la empresa de la sesión");
});

check("B2. una clave inventada responde 404 sin decir nada", () => {
  assert(/if \(!definition\)/.test(ROUTE), "falta la comprobación de la clave");
  assert(/No se encontró lo que pediste/.test(ROUTE),
    "el mensaje no debe distinguir «no existe» de «no es tuyo»");
});

check("B3. entitlement y autorización son capas DISTINTAS", () => {
  assert(/resolveModuleAccessForOrg/.test(ROUTE), "falta el entitlement del módulo");
  assert(/roleAllows\(/.test(ROUTE), "falta la comprobación de rol");
  const ent = ROUTE.indexOf("resolveModuleAccessForOrg");
  const load = ROUTE.indexOf("definition.load");
  assert(ent > 0 && ent < load, "el entitlement debe comprobarse ANTES de cargar");
});

check("B4. no hay ninguna superficie de URL, HTML ni SQL", () => {
  for (const forbidden of ["logoUrl", "logo_url", "fetch(", "innerHTML", "dangerouslySet"]) {
    assert(!ROUTE.includes(forbidden), `el endpoint no puede contener «${forbidden}»`);
  }
  const all = ADAPTERS.map((a) => a.source).join("\n");
  assert(!/fetch\(\s*(req|request|url|input)/i.test(all),
    "ningún adaptador puede descargar una URL que venga de la petición");
});

check("B5. un fallo al cargar no filtra el motivo", () => {
  assert(/catch \{[\s\S]{0,200}No fue posible generar el documento/.test(ROUTE),
    "el error debe ser genérico");
});

// ---------------------------------------------------------------------------
console.log("\nC · Filtros: el servidor reconstruye, el navegador no manda filas");

const SPEC = {
  filters: [
    { key: "vista", label: "Vista", kind: "enum" as const, values: ["activos", "todos"] },
    { key: "proceso", label: "Proceso", kind: "uuid" as const },
    { key: "desde", label: "Desde", kind: "date" as const },
    { key: "buscar", label: "Buscar", kind: "text" as const },
  ],
};

check("C1. un valor fuera del catálogo se descarta", () => {
  assert(validateFilters(SPEC, { vista: "activos" }).vista === "activos", "el válido pasa");
  assert(validateFilters(SPEC, { vista: "todo-lo-de-otra-empresa" }).vista === undefined,
    "el inventado NO pasa");
});

check("C2. un identificador con forma rara se descarta", () => {
  const ok = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  assert(validateFilters(SPEC, { proceso: ok }).proceso === ok, "un uuid válido pasa");
  for (const bad of ["1 OR 1=1", "../../etc/passwd", "'; drop table x; --", "abc"]) {
    assert(validateFilters(SPEC, { proceso: bad }).proceso === undefined, `«${bad}» no puede pasar`);
  }
});

check("C3. una clave no declarada nunca llega al cargador", () => {
  const out = validateFilters(SPEC, { tabla: "organizations", sql: "select *", vista: "todos" });
  assert(out.tabla === undefined && out.sql === undefined, "solo pasan las declaradas");
  assert(out.vista === "todos", "y las declaradas sí");
});

check("C4. el texto se limpia de caracteres de control y se limita", () => {
  const out = validateFilters(SPEC, { buscar: "hola\r\nContent-Type: text/html" });
  assert(!out.buscar.includes("\n") && !out.buscar.includes("\r"),
    "un salto de línea en un filtro es inyección de cabeceras");
  const long = validateFilters(SPEC, { buscar: "a".repeat(500) });
  assert(long.buscar.length <= 120, "la longitud se limita");
});

check("C5. una fecha mal formada se descarta", () => {
  assert(validateFilters(SPEC, { desde: "2026-08-26" }).desde === "2026-08-26", "la válida pasa");
  assert(validateFilters(SPEC, { desde: "ayer" }).desde === undefined, "la inventada no");
});

// ---------------------------------------------------------------------------
console.log("\nD · Nombres de archivo y cabeceras");

check("D1. el nombre no puede escaparse de su carpeta", () => {
  const f = buildFilename({ recordType: "Riesgo", title: "../../etc/passwd", code: "R-1" });
  assert(!f.includes("/") && !f.includes(".."), `nombre peligroso: ${f}`);
  assert(f.endsWith(".pdf"), "debe terminar en .pdf");
});

check("D2. los acentos se transliteran y el nombre sigue siendo legible", () => {
  const f = buildFilename({ recordType: "Riesgo", title: "Interrupción de proveedor", code: "R-2026-001" });
  assert(f === "Riesgo_Interrupcion-de-proveedor_R-2026-001.pdf", `nombre inesperado: ${f}`);
});

check("D3. un título vacío no produce un nombre roto", () => {
  const f = buildFilename({ recordType: "Riesgo", title: "····", code: null });
  assert(f.endsWith(".pdf") && f.length > 5, `nombre roto: ${f}`);
});

check("D4. Content-Disposition lleva las dos formas y ninguna con saltos", () => {
  const cd = contentDisposition("Riesgo_Ñandú\r\nX-Inyectada: 1.pdf");
  assert(!cd.includes("\n") && !cd.includes("\r"), "no puede llevar saltos de línea");
  assert(cd.includes('filename="') && cd.includes("filename*=UTF-8''"),
    "faltan las dos formas del nombre");
  assert(cd.startsWith("attachment;"), "debe ser descarga, no visualización");
});

check("D5. un PDF privado no puede quedar en una caché compartida", () => {
  const h = pdfHeaders("x.pdf", 10) as Record<string, string>;
  assert(h["Content-Type"] === "application/pdf", "tipo incorrecto");
  assert(/no-store/.test(h["Cache-Control"]), "debe llevar no-store");
  assert(/private/.test(h["Cache-Control"]), "y ser privado");
  assert(h["X-Content-Type-Options"] === "nosniff", "falta nosniff");
});

// ---------------------------------------------------------------------------
console.log("\nE · Archivos PDF reales");

check("E1. un documento mínimo produce un PDF válido", () => {
  const p = inspectPdf(renderPrintDocument(doc()));
  assert(p.magic === "%PDF-", `magic inesperado: ${p.magic}`);
  assert(p.endsWithEof, "el archivo debe cerrar con %%EOF");
  assert(p.pages >= 1, "al menos una página");
});

check("E2. el encabezado lleva empresa, tipo de registro y código", () => {
  const p = inspectPdf(renderPrintDocument(doc()));
  assert(p.has("Fábrica de Ñandúes S.A.S."), "falta el nombre de la empresa");
  assert(p.has("RIESGO"), "falta el tipo de registro");
  assert(p.has("R-2026-001"), "falta el código");
  assert(p.has("Trazaloop"), "falta la línea de sistema o el pie");
});

check("E3. sin logo el PDF sigue saliendo, con el nombre como identidad", () => {
  const p = inspectPdf(renderPrintDocument(doc({ organization: { ...ORG, logo: null } })));
  assert(p.magic === "%PDF-", "un PDF sin logo debe seguir siendo válido");
  assert(p.has("Fábrica de Ñandúes S.A.S."), "el nombre hace de identidad");
});

check("E4. el español se imprime completo: acentos, ñ y signos", () => {
  const p = inspectPdf(renderPrintDocument(doc({
    sections: [{ title: "Prueba", blocks: [
      { type: "paragraph", text: "áéíóúüñÑ ¿Qué? ¡Sí! «comillas» — guion largo" },
    ] }],
  })));
  for (const needle of ["áéíóú", "ñÑ", "¿Qué?", "¡Sí!", "«comillas»"]) {
    assert(p.has(needle), `no se imprimió «${needle}»`);
  }
});

check("E4b. un listado DECLARA sus filtros y cuántos registros trae", () => {
  // §44 · Sin esto un reporte de «12 riesgos» parece completo y no lo es:
  // quien lo recibe no puede reproducirlo ni discutirlo. El modelo llevaba los
  // filtros desde el principio; el renderizador no los pintaba.
  const p = inspectPdf(renderPrintDocument(doc({
    recordType: "Riesgos", title: "Registro de riesgos",
    appliedFilters: [{ label: "Vista", value: "Activos" }, { label: "Proceso", value: "Compras" }],
    recordCount: 12,
    sections: [{ blocks: [{ type: "table", columns: [{ header: "A", width: 1 }], rows: [["x"]] }] }],
  })));
  assert(p.has("Vista: Activos"), "el filtro aplicado tiene que verse");
  assert(p.has("Proceso: Compras"), "y todos los filtros, no solo el primero");
  assert(p.has("12 registros"), "y cuántas filas trae");
});

check("E4c. un listado sin filtros lo dice, y un solo registro concuerda", () => {
  const sin = inspectPdf(renderPrintDocument(doc({ recordCount: 0, sections: [] })));
  assert(sin.has("Sin filtros aplicados"), "hay que decir que no se filtró");
  assert(sin.has("0 registros"), "y que no hay ninguno");
  const uno = inspectPdf(renderPrintDocument(doc({ recordCount: 1, sections: [] })));
  assert(uno.has("1 registro") && !uno.has("1 registros"), "concordancia en singular");
});

check("E5. 0 filas produce un reporte válido que lo dice", () => {
  const p = inspectPdf(renderPrintDocument(doc({
    recordCount: 0,
    sections: [{ title: "Riesgos", blocks: [
      { type: "table", columns: [{ header: "Código", width: 1 }], rows: [],
        emptyText: "No hay riesgos con ese filtro." },
    ] }],
  })));
  assert(p.magic === "%PDF-", "debe ser un PDF válido");
  assert(p.has("No hay riesgos con ese filtro."), "debe decir que está vacío");
});

check("E6. 1 fila y 200+ filas paginan correctamente", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => [`R-${i}`, `Riesgo ${i}`, "Alto"]);
  const cols = [{ header: "Código", width: 2 }, { header: "Riesgo", width: 6 }, { header: "Nivel", width: 2 }];
  const one = inspectPdf(renderPrintDocument(doc({
    sections: [{ blocks: [{ type: "table", columns: cols, rows: rows(1) }] }] })));
  assert(one.pages === 1, `una fila cabe en una página, dio ${one.pages}`);

  const many = inspectPdf(renderPrintDocument(doc({
    sections: [{ blocks: [{ type: "table", columns: cols, rows: rows(220) }] }] })));
  assert(many.pages >= 4, `220 filas deben ocupar varias páginas, dio ${many.pages}`);
  assert(many.has("Riesgo 219"), "la última fila tiene que estar");
  // El encabezado se repite en cada página: sin eso, a partir de la segunda
  // nadie sabe qué columna está leyendo.
  const headerCount = many.texts.filter((t) => t === "Código").length;
  assert(headerCount >= many.pages - 1,
    `el encabezado debe repetirse por página (${headerCount} veces en ${many.pages})`);
});

check("E7. «Página N de M» aparece y el total es correcto", () => {
  const rows = Array.from({ length: 150 }, (_, i) => [`R-${i}`, "x"]);
  const p = inspectPdf(renderPrintDocument(doc({
    sections: [{ blocks: [{ type: "table", columns: [{ header: "A", width: 1 }, { header: "B", width: 1 }], rows }] }] })));
  assert(p.has(`Página 1 de ${p.pages}`), "falta la numeración en la primera página");
  assert(p.has(`Página ${p.pages} de ${p.pages}`), "falta en la última");
});

check("E8. el texto largo se ajusta y no se pierde", () => {
  const largo = "Una descripción deliberadamente larguísima ".repeat(40);
  const p = inspectPdf(renderPrintDocument(doc({
    sections: [{ blocks: [{ type: "fields", items: [{ label: "Causa", value: largo, wide: true }] }] }] })));
  assert(p.magic === "%PDF-", "debe seguir siendo válido");
  assert(p.has("larguísima"), "el contenido no puede desaparecer");
  assert(p.pages >= 1, "debe caber");
});

check("E9. apaisado produce una página más ancha que alta", () => {
  const portrait = renderPrintDocument(doc({ orientation: "portrait" })).toString("latin1");
  const land = renderPrintDocument(doc({ orientation: "landscape" })).toString("latin1");
  assert(/MediaBox\s*\[\s*0\s+0\s+595/.test(portrait), "vertical debe ser A4 vertical");
  assert(/MediaBox\s*\[\s*0\s+0\s+841/.test(land), "apaisado debe ser A4 apaisado");
});

check("E10. la matriz se dibuja con las bandas que le pasan, no con una 5×5 fija", () => {
  const p = inspectPdf(renderPrintDocument(doc({
    orientation: "landscape",
    sections: [{ title: "Matriz", blocks: [{ type: "matrix", matrix: {
      rowsLabel: "Impacto", colsLabel: "Probabilidad",
      rowHeaders: ["Grave", "Leve"], colHeaders: ["Rara", "Casi segura"],
      cells: [
        [{ label: "Medio", score: "5" }, { label: "Extremo", score: "25", current: true }],
        [{ label: "Bajo", score: "1" }, { label: "Medio", score: "5" }],
      ],
      legend: [{ label: "Bajo", detail: "1–4 · aceptable" }],
    } }] }],
  })));
  for (const needle of ["Impacto", "Probabilidad", "Casi segura", "Extremo", "evaluación vigente", "aceptable"]) {
    assert(p.has(needle), `la matriz no imprimió «${needle}»`);
  }
});

check("E11. una referencia histórica se distingue de una viva EN PALABRAS", () => {
  const p = inspectPdf(renderPrintDocument(doc({
    sections: [{ blocks: [{ type: "references", items: [
      { kind: "live", label: "Indicador", value: "IND-001" },
      { kind: "snapshot", label: "Evaluación", value: "Alto", context: "Residual del 26/08 · puntaje 12" },
    ] }] }],
  })));
  assert(p.has("REFERENCIA VIVA"), "la viva debe decirlo");
  assert(p.has("COMO ESTABA ENTONCES"), "la histórica debe decirlo");
  assert(p.has("Residual del 26/08 · puntaje 12"), "y llevar su contexto");
});

check("E12. el mapa dibuja nodos, categorías y relaciones", () => {
  const p = inspectPdf(renderPrintDocument(doc({
    orientation: "landscape",
    sections: [{ blocks: [{ type: "graph", graph: {
      groups: [{ title: "Misionales", nodes: [
        { id: "a", label: "Compras" }, { id: "b", label: "Producción" }] }],
      edges: [{ from: "a", to: "b", label: "Materia prima aprobada" }],
    } }] }],
  })));
  assert(p.has("MISIONALES"), "falta la categoría");
  assert(p.has("Compras") && p.has("Producción"), "faltan los nodos");
  assert(p.has("Materia prima aprobada"), "falta la relación");
  assert(p.has("Desde") && p.has("Hacia"), "la relación debe tener dirección legible");
});

// ---------------------------------------------------------------------------
console.log("\nF · Identidad de empresa y formatos de imagen");

check("F1. todo formato de logo que la plataforma acepta se puede incrustar", () => {
  // EXPORT-01.3 · La resolución dejó de ser «convertir lo que el escritor no
  // entiende» y pasó a ser «normalizar SIEMPRE». La invariante es la misma y
  // más fuerte: lo que se acepta al subir tiene que poder normalizarse.
  const settings = read("lib/domain/settings.ts");
  const kinds = read("lib/pdf/image-kind.ts");
  const mimes = [...settings.matchAll(/"(image\/[a-z+]+)"/g)].map((m) => m[1]);
  assert(mimes.length >= 3, "no se encontraron los formatos aceptados");
  for (const mime of mimes) {
    const sub = mime.split("/")[1];
    assert(new RegExp(`"${sub}"`).test(kinds),
      `${mime} se acepta al subir pero el normalizador no lo reconoce`);
  }
  assert(/SUPPORTED_LOGO_KINDS/.test(kinds), "debe existir la lista pública de formatos");
});

check("F2. el logo NUNCA llega desde la petición", () => {
  const branding = read("lib/export/branding.ts");
  // EXPORT-01.2 · El resolutor pasó a devolver un VEREDICTO para distinguir
  // «no hay logo» de «hay logo y no sirve». Sigue siendo el mismo resolutor
  // seguro y sigue partiendo del identificador ya validado en servidor.
  assert(/loadCompanyLogo\(organizationId\)/.test(branding),
    "debe reutilizar el resolutor seguro, no descargar una URL");
  assert(!/http/.test(branding.replace(/\/\*[\s\S]*?\*\//g, "")),
    "no puede haber ninguna URL en el resolutor de identidad");
});

check("F3. si el logo falla, el PDF se genera igual", () => {
  const branding = read("lib/export/branding.ts");
  assert(/\.catch\(/.test(branding),
    "un fallo de logo no puede romper la descarga");
});

// ---------------------------------------------------------------------------
console.log("\nG · Lo que NO se hizo, y es deliberado");

check("G1. el PDF se genera en SERVIDOR, no en el navegador", () => {
  const all = ADAPTERS.map((a) => a.source).join("\n") + ROUTE + read("lib/export/render.ts");
  for (const forbidden of ["jspdf", "html2canvas", "puppeteer", "playwright", "window.print"]) {
    assert(!all.toLowerCase().includes(forbidden), `no puede usarse ${forbidden}`);
  }
  for (const a of ADAPTERS) {
    assert(a.source.startsWith('import "server-only";'),
      `${a.file} debe ser server-only`);
  }
});

check("G2. no se guarda ningún PDF en Storage por defecto", () => {
  const all = ADAPTERS.map((a) => a.source).join("\n") + ROUTE;
  assert(!/storage\.from\([^)]*\)\.upload/.test(all),
    "EXPORT-01 genera bajo demanda; no crea copias (§26)");
});

check("G3. el botón se llama igual en toda la plataforma", () => {
  const btn = read("components/ui/export-pdf-button.tsx");
  assert(/label = "Descargar PDF"/.test(btn), "la nomenclatura por defecto es «Descargar PDF»");
  // Sin comentarios: el archivo NOMBRA la palabra prohibida para explicar por
  // qué no se usa, y greparla en crudo convertía esa explicación en un fallo.
  const code = btn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/Imprimir/.test(code), "ningún botón puede decir «Imprimir»: descarga un archivo");
  // Y ninguna pantalla puede llamarlo de otra forma.
  for (const f of readdirSync(join(ROOT, "app/(app)/(shell)/quality"), { recursive: true }) as string[]) {
    if (typeof f !== "string" || !f.endsWith("page.tsx")) continue;
    const src = read(join("app/(app)/(shell)/quality", f));
    if (!src.includes("ExportPdfButton")) continue;
    const labels = [...src.matchAll(/label="([^"]*)"/g)].map((m) => m[1]);
    for (const l of labels) {
      assert(l.startsWith("Descargar PDF"), `«${l}» rompe la nomenclatura en ${f}`);
    }
  }
});

check("G4. EXPORT-01 no añadió ninguna migración", () => {
  const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const beyond = migrations.filter((f) => Number(f.slice(0, 4)) > 122);
  assert(beyond.length === 0, `exportar es lectura: no necesita esquema (${beyond.join(", ")})`);
});

// ---------------------------------------------------------------------------
// H · ALCANZABILIDAD — una exportación que nadie puede pulsar no existe
// ---------------------------------------------------------------------------
console.log("\nH · Alcanzabilidad: una exportación que nadie puede pulsar no existe");


/** Recorre app/ y components/ buscando dónde se ofrece cada clave. */
function wiredKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const root of ["app", "components"]) {
    for (const f of readdirSync(join(ROOT, root), { recursive: true }) as string[]) {
      if (typeof f !== "string" || !f.endsWith(".tsx")) continue;
      const rel = join(root, f);
      let src: string;
      try { src = read(rel); } catch { continue; }
      // Se busca la CLAVE por su forma, no el nombre del prop: algunas
      // pantallas la pasan como `exportKey`, otras a través de un componente
      // que la recibe con otro nombre (`rowExportKey`). Atarse al nombre del
      // prop hacía que una exportación perfectamente alcanzable apareciera
      // como huérfana.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (!/ExportPdfButton|ExportKey|exportKey/.test(code)) continue;
      for (const m of code.matchAll(/"([a-z0-9-]+\.[a-z0-9-]+\.(?:detail|list|historical))"/g)) {
        const list = found.get(m[1]) ?? [];
        if (!list.includes(rel)) list.push(rel);
        found.set(m[1], list);
      }
    }
  }
  return found;
}

const WIRED = wiredKeys();

check("H1. TODA exportación del registro se ofrece en alguna pantalla", () => {
  // El registro puede estar impecable y la funcionalidad seguir siendo
  // inalcanzable: si nadie pone el botón, la entidad no se exporta. Esta
  // comprobación es la que impide que una definición quede escrita y muerta.
  const huerfanas = DEFS.map((d) => d.key).filter((k) => !WIRED.has(k));
  assert(
    huerfanas.length === 0,
    `sin botón en ninguna pantalla: ${huerfanas.join(", ")}`
  );
});

check("H2. ningún botón nombra una clave que el registro no conoce", () => {
  const conocidas = new Set(DEFS.map((d) => d.key));
  const inventadas = [...WIRED.keys()].filter((k) => !conocidas.has(k));
  assert(
    inventadas.length === 0,
    `el botón llevaría a un 404: ${inventadas.join(", ")}`
  );
});

check("H3. los cuatro módulos ofrecen la descarga, no solo Quality", () => {
  const modulos = new Set(DEFS.filter((d) => WIRED.has(d.key)).map((d) => d.key.split(".")[0]));
  for (const m of ["quality", "cpr", "textiles"]) {
    assert(modulos.has(m), `${m} declaró exportaciones pero no ofrece ninguna`);
  }
});

check("H4. la nomenclatura es la misma en TODA la plataforma", () => {
  for (const files of WIRED.values()) {
    for (const rel of files) {
      const labels = [...read(rel).matchAll(/label="([^"]*)"/g)].map((m) => m[1]);
      for (const l of labels) {
        // `label` también lo usan otros componentes de la pantalla; solo se
        // exige la forma cuando el archivo lo aplica a una descarga.
        if (!/PDF/i.test(l)) continue;
        assert(l.startsWith("Descargar PDF"), `«${l}» rompe la nomenclatura en ${rel}`);
      }
    }
  }
});

check("H5. la Lista Maestra filtra por los MISMOS nombres que la pantalla", () => {
  // El fallo silencioso más caro de una exportación filtrada: el usuario
  // filtra, descarga, y recibe la lista completa sin que nada se lo advierta.
  // Ocurre en cuanto la definición inventa nombres de filtro propios.
  const lector = read("lib/db/quality-master-list.ts");
  const dePantalla = [...lector.matchAll(/one\("([a-z]+)"\)/g)].map((m) => m[1]);
  assert(dePantalla.length >= 5, "no se pudieron leer los filtros de la pantalla");
  const def = read("lib/export/adapters/quality-documents.ts");
  const bloque = def.slice(def.indexOf("quality.master-list.list"));
  const declarados = new Set(
    [...bloque.slice(0, bloque.indexOf("async load")).matchAll(/key: "([a-z]+)"/g)].map((m) => m[1])
  );
  for (const f of dePantalla) {
    assert(declarados.has(f), `el filtro «${f}» de la pantalla se perdería al exportar`);
  }
});

check("H6. la descarga del documento controlado pasa por el endpoint único", () => {
  // §27 conserva el ARTEFACTO; EXPORT-01 unifica la PUERTA. Si una pantalla
  // siguiera enlazando su ruta propia, habría dos políticas de cabeceras y de
  // nombres para el mismo PDF.
  for (const rel of [
    "components/domain/quality/document-control-detail.tsx",
    "components/domain/quality/master-list-view.tsx",
  ]) {
    const src = read(rel);
    assert(!/href=\{`\/quality\/documents\/[^`]*\/pdf/.test(src), `${rel} enlaza la ruta antigua`);
    assert(src.includes("ExportPdfButton"), `${rel} debe usar el botón común`);
  }
});

// ---------------------------------------------------------------------------
// I · EL INVENTARIO NO PUEDE ENVEJECER EN SILENCIO
// ---------------------------------------------------------------------------
console.log("\nI · Nada desaparece en silencio");

check("I0. un bloque desconocido FALLA en vez de desaparecer del papel", () => {
  // Descubierto al escribir un banco de pruebas con el discriminante mal
  // escrito: el PDF salió válido, con encabezado y pie… y sin la tabla. Un
  // documento incompleto que parece completo es peor que un error.
  let lanzo = false;
  try {
    renderPrintDocument(doc({
      sections: [{ title: null, blocks: [{ type: "inventado" } as never] }],
    }));
  } catch { lanzo = true; }
  assert(lanzo, "el renderizador se tragó un bloque desconocido en silencio");
});

check("I1. la matriz de cobertura nombra TODAS las claves del registro", () => {
  // Un documento de cobertura que se queda atrás es peor que no tenerlo: se
  // consulta creyendo que dice la verdad.
  const matriz = read("docs/export/export-01/EXPORT_01_PDF_COVERAGE_MATRIX.md");
  const faltan = DEFS.map((d) => d.key).filter((k) => !matriz.includes(k));
  assert(faltan.length === 0, `la matriz no menciona: ${faltan.join(", ")}`);
});

check("I2. la matriz no inventa claves que el registro no tiene", () => {
  const conocidas = new Set(DEFS.map((d) => d.key));
  const matriz = read("docs/export/export-01/EXPORT_01_PDF_COVERAGE_MATRIX.md");
  const citadas = new Set([...matriz.matchAll(/`([a-z]+\.[a-z-]+\.[a-z-]+)`/g)].map((m) => m[1]));
  const sobran = [...citadas].filter((k) => !conocidas.has(k));
  assert(sobran.length === 0, `la matriz promete lo que no existe: ${sobran.join(", ")}`);
});

check("I3. el recuento del inventario concuerda con el registro", () => {
  const inv = read("docs/export/export-01/EXPORT_01_INVENTORY.md");
  const m = /Exportadores en el registro \| \*\*(\d+)\*\*/.exec(inv);
  assert(m, "el inventario no declara cuántos exportadores hay");
  assert(
    Number(m[1]) === DEFS.length,
    `el inventario dice ${m[1]} y el registro tiene ${DEFS.length}`
  );
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
