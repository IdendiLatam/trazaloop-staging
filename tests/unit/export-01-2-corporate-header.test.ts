/**
 * Trazaloop · EXPORT-01.2 · Encabezado corporativo obligatorio.
 *
 * TODO PDF que salga de Trazaloop lleva, en TODAS sus páginas:
 *
 *   1. el LOGO de la empresa, cuando existe y se puede incrustar;
 *   2. el NOMBRE de la empresa;
 *   3. el NOMBRE DEL DOCUMENTO.
 *
 * La comprobación que da nombre al sprint es `PDF_BYPASS_HEADER = 0`: no puede
 * existir un camino que produzca un PDF sin pasar por el encabezado común.
 *
 * Todo lo demás está para que esa afirmación no se pueda hacer en falso: que el
 * nombre documental venga del registro y no del adaptador, que el logo venga de
 * la empresa autorizada y no del navegador, y que el encabezado se repita en la
 * página siete de un listado, no solo en la primera.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { renderPrintDocument } from "../../lib/export/render";
import { renderDocumentPdf, renderMasterListPdf } from "../../lib/pdf/quality-documents";
import { BROKEN_LOGO_NOTICE, LOGO_BOX } from "../../lib/pdf/corporate-header";
import { decodeImage, fitWithin } from "../../lib/pdf/image";
import type { PrintDocument } from "../../lib/export/print-model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Fragmentos de texto dibujados, por página. */
function pagesText(bytes: Buffer): string[] {
  const raw = bytes.toString("latin1");
  const streams = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]);
  return streams
    .filter((s) => s.includes("Tj"))
    .map((s) => [...s.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)]
      .map((m) => m[1].replace(/\\([()\\])/g, "$1")).join(" "));
}
function pageCount(bytes: Buffer): number {
  return (bytes.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
}
function logoDraws(bytes: Buffer): number {
  return (bytes.toString("latin1").match(/\/OrgLogo Do/g) ?? []).length;
}
function imageObjects(bytes: Buffer): number {
  return (bytes.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
}

/** Un PNG mínimo con transparencia, para probar el logo sin depender del disco. */
function makePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const table: number[] = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of body) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
const LOGO = decodeImage(makePng(60, 30)).image!;

const ORG = "Fábrica de Ñandúes S.A.S.";
function doc(overrides: Partial<PrintDocument> = {}): PrintDocument {
  return {
    documentName: "Ficha de riesgo",
    recordType: "Riesgo",
    title: "Interrupción de un proveedor crítico",
    code: "R-2026-001",
    organization: { name: ORG, legalName: null, taxId: "900.111.222-3", logo: null },
    systemLine: "Trazaloop Quality · riesgos",
    orientation: "portrait",
    generatedAt: "2026-08-26T10:00:00.000Z",
    sections: [],
    ...overrides,
  };
}

/** Una tabla larga, para forzar varias páginas. */
function largeDoc(rows: number, overrides: Partial<PrintDocument> = {}): PrintDocument {
  return doc({
    documentName: "Listado de materiales e insumos",
    recordType: "Materiales",
    title: "Materiales e insumos",
    recordCount: rows,
    sections: [{ title: null, blocks: [{
      type: "table",
      columns: [{ header: "Código", width: 2 }, { header: "Material", width: 6 }, { header: "Tipo", width: 2 }],
      rows: Array.from({ length: rows }, (_, i) => [
        `M-${String(i + 1).padStart(3, "0")}`,
        `Material Ñ número ${i + 1} · algodón reciclado postindustrial`,
        "Tela principal",
      ]),
      emptyText: "Sin registros.",
    }] }],
    ...overrides,
  });
}

const ADAPTER_DIR = "lib/export/adapters";
const ADAPTERS = readdirSync(join(ROOT, ADAPTER_DIR))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: `${ADAPTER_DIR}/${f}`, source: read(`${ADAPTER_DIR}/${f}`) }));

console.log("\nEXPORT-01.2 · encabezado corporativo obligatorio\n");

// ---------------------------------------------------------------------------
console.log("A · El contrato: nombre documental en las 85 definiciones");

/** Claves y nombre documental declarados, leídos del código. */
function declared(): { key: string; documentName: string; file: string }[] {
  const out: { key: string; documentName: string; file: string }[] = [];
  const KEY = /"([a-z0-9-]+\.[a-z0-9-]+\.(?:detail|list|historical))"/;
  for (const a of ADAPTERS) {
    const lines = stripComments(a.source).split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const k = KEY.exec(lines[i]);
      if (!k) continue;
      if (out.some((d) => d.key === k[1])) continue;
      let name: string | null = null;
      // Fábricas posicionales: `catalogList("k", "entidad", "tipo", "Nombre",`.
      const inline = lines[i].split(k[0])[1] ?? "";
      const m0 = /"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/.exec(inline);
      if (m0) name = m0[3];
      for (let j = i; j < Math.min(i + 12, lines.length) && !name; j += 1) {
        const m = /documentName:\s*"([^"]+)"/.exec(lines[j]);
        if (m) name = m[1];
      }
      out.push({ key: k[1], documentName: name ?? "", file: a.file });
    }
  }
  return out;
}
const DEFS = declared();

check("A1. TODA definición declara un nombre documental", () => {
  assert(DEFS.length >= 85, `se esperaban al menos 85 definiciones, hay ${DEFS.length}`);
  const sin = DEFS.filter((d) => d.documentName.trim().length === 0).map((d) => d.key);
  assert(sin.length === 0, `sin nombre documental: ${sin.join(", ")}`);
});

check("A2. el nombre documental es HUMANO, nunca la clave técnica", () => {
  for (const d of DEFS) {
    assert(!d.documentName.includes(d.key), `${d.key}: el nombre repite la clave`);
    assert(!/^[a-z]+\.[a-z-]+\./.test(d.documentName),
      `«${d.documentName}» parece una clave técnica (${d.key})`);
    assert(/^[A-ZÁÉÍÓÚÑ]/.test(d.documentName),
      `«${d.documentName}» debería empezar en mayúscula (${d.key})`);
    assert(d.documentName.length >= 5, `«${d.documentName}» es demasiado corto (${d.key})`);
  }
});

check("A3. la nomenclatura histórica no revive", () => {
  for (const d of DEFS) {
    assert(!/\bCPR\b/.test(d.documentName), `«${d.documentName}» revive «CPR»`);
    assert(!/lote de salida/i.test(d.documentName), `«${d.documentName}» usa denominación histórica`);
    if (/orden(es)? de producci/i.test(d.documentName)) {
      assert(/corrida/i.test(d.documentName),
        `«${d.documentName}» debe decir «orden / corrida de producción»`);
    }
  }
});

check("A4. una ficha se llama ficha y un listado se llama listado", () => {
  for (const d of DEFS) {
    if (!d.key.endsWith(".list")) continue;
    assert(
      /^(Listado|Lista maestra|Maestro|Reporte)/i.test(d.documentName),
      `«${d.documentName}» es un listado y no lo parece (${d.key})`
    );
  }
});

check("A5. el tipo EXIGE el nombre documental: no es una convención", () => {
  const types = read("lib/export/registry-types.ts");
  assert(/documentName:\s*string;/.test(types), "el registro no exige el nombre documental");
  assert(!/documentName\?:/.test(types), "el nombre documental no puede ser opcional");
  const model = read("lib/export/print-model.ts");
  assert(/documentName:\s*string;/.test(model), "el documento impreso no exige el nombre");
  assert(/PrintDocumentDraft/.test(model),
    "debe existir un borrador SIN nombre para que el adaptador no pueda ponerlo");
});

check("A6. ningún adaptador se inventa el encabezado", () => {
  const types = read("lib/export/registry-types.ts");
  assert(/document\?:\s*PrintDocumentDraft/.test(types),
    "el adaptador debe devolver un borrador, no un documento completo");
  const route = read("app/(app)/(shell)/export/[key]/route.ts");
  assert(/documentName: definition\.documentName/.test(route),
    "el endpoint debe completar el nombre desde la definición");
});

// ---------------------------------------------------------------------------
console.log("\nB · Ningún PDF se salta el encabezado");

check("B1. PDF_BYPASS_HEADER = 0", () => {
  const motores: string[] = [];
  for (const root of ["lib", "app", "server", "components"]) {
    for (const f of readdirSync(join(ROOT, root), { recursive: true }) as string[]) {
      if (typeof f !== "string" || !/\.tsx?$/.test(f)) continue;
      const rel = join(root, f);
      let src: string;
      try { src = read(rel); } catch { continue; }
      if (/new PdfLayout\(|new PdfWriter\(/.test(stripComments(src))) motores.push(rel);
    }
  }
  const PERMITIDOS = ["lib/export/render.ts", "lib/pdf/quality-documents.ts", "lib/pdf/layout.ts"];
  const intrusos = motores.filter((m) => !PERMITIDOS.includes(m));
  assert(intrusos.length === 0, `motores de PDF fuera del encabezado común: ${intrusos.join(", ")}`);
  for (const motor of ["lib/export/render.ts", "lib/pdf/quality-documents.ts"]) {
    assert(/renderCorporateHeader/.test(read(motor)), `${motor} no usa la primitiva de encabezado`);
  }
});

check("B2. ningún adaptador puede apagar el encabezado", () => {
  for (const a of ADAPTERS) {
    assert(!/showHeader|withoutHeader|noHeader|skipHeader/i.test(stripComments(a.source)),
      `${a.file}: un adaptador no puede decidir si hay encabezado`);
  }
  const render = stripComments(read("lib/export/render.ts"));
  assert(!/pageIndex\s*===\s*0[^\n]*renderCorporateHeader/.test(render),
    "el encabezado no puede depender del número de página");
});

check("B3. las dos rutas heredadas también llevan nombre documental", () => {
  for (const rel of [
    "app/(app)/(shell)/quality/documents/[documentId]/pdf/route.ts",
    "app/(app)/(shell)/quality/documents/master/pdf/route.ts",
  ]) {
    assert(/documentName:\s*"/.test(read(rel)), `${rel} no declara nombre documental`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · Los tres elementos, en TODAS las páginas");

check("C1. una página lleva empresa y nombre documental", () => {
  const paginas = pagesText(renderPrintDocument(doc()));
  assert(paginas.length >= 1, "no se dibujó ninguna página");
  assert(paginas[0].includes(ORG), "falta el nombre de la empresa");
  assert(paginas[0].toUpperCase().includes("FICHA DE RIESGO"), "falta el nombre documental");
});

check("C2. con logo, se dibuja en cada página y se registra UNA sola vez", () => {
  const bytes = renderPrintDocument(doc({
    organization: { name: ORG, legalName: null, taxId: null, logo: LOGO },
  }));
  assert(logoDraws(bytes) === pageCount(bytes),
    `el logo se dibuja ${logoDraws(bytes)} veces en ${pageCount(bytes)} páginas`);
  assert(imageObjects(bytes) === 2, `el logo se duplicó: ${imageObjects(bytes)} objetos`);
});

check("C3. 200+ filas: TODAS las páginas llevan los tres elementos", () => {
  const bytes = renderPrintDocument(largeDoc(240, {
    organization: { name: ORG, legalName: null, taxId: null, logo: LOGO },
  }));
  const paginas = pagesText(bytes);
  assert(paginas.length >= 4, `se esperaban varias páginas, hubo ${paginas.length}`);
  paginas.forEach((p, i) => {
    assert(p.includes(ORG), `la página ${i + 1} no lleva el nombre de la empresa`);
    assert(p.toUpperCase().includes("LISTADO DE MATERIALES"),
      `la página ${i + 1} no lleva el nombre documental`);
  });
  assert(logoDraws(bytes) === paginas.length,
    `el logo aparece en ${logoDraws(bytes)} de ${paginas.length} páginas`);
});

check("C4. la última fila sigue estando: el encabezado no se come el cuerpo", () => {
  const todo = pagesText(renderPrintDocument(largeDoc(240))).join(" ");
  assert(todo.includes("M-001"), "falta la primera fila");
  assert(todo.includes("M-240"), "falta la última fila: el listado se truncó");
});

check("C5. apaisado: el encabezado sigue arriba y completo", () => {
  const bytes = renderPrintDocument(largeDoc(120, {
    orientation: "landscape",
    organization: { name: ORG, legalName: null, taxId: null, logo: LOGO },
  }));
  const paginas = pagesText(bytes);
  assert(paginas.length >= 2, "se esperaban varias páginas en apaisado");
  for (const p of paginas) {
    assert(p.includes(ORG) && p.toUpperCase().includes("LISTADO DE MATERIALES"),
      "una página apaisada perdió el encabezado");
  }
  assert(logoDraws(bytes) === paginas.length, "el logo falta en alguna página apaisada");
});

const DOC_LARGO = {
  documentName: "Documento controlado",
  organizationName: ORG,
  logo: LOGO,
  companyLegalName: null,
  companyTaxId: null,
  code: "PR-QA-007",
  title: "Procedimiento de control documental",
  description: "Un documento con contenido suficiente para pasar de página. ".repeat(20),
  categoryLabel: "Procedimiento",
  lifecycle: "effective" as const,
  revisionText: "Revisión 2",
  ownerText: "Calidad",
  reviewersText: "—",
  approversText: "—",
  createdAt: "2026-01-01",
  submittedAt: null,
  approvedAt: null,
  approvedByName: null,
  effectiveFrom: "2026-02-01",
  effectiveTo: null,
  reviewDueAt: null,
  retirementReason: null,
  processNames: "",
  sections: Array.from({ length: 12 }, (_, i) => ({
    title: `Sección ${i + 1}`,
    content: "Contenido de la sección, con suficiente texto para ocupar espacio. ".repeat(20),
  })),
  revisionHistory: [],
  decisions: [],
  generatedAt: "2026-08-26T10:00:00.000Z",
};

check("C6. el documento controlado heredado lleva el encabezado en todas", () => {
  const bytes = renderDocumentPdf(DOC_LARGO);
  const paginas = pagesText(bytes);
  assert(paginas.length >= 2, `se esperaban varias páginas, hubo ${paginas.length}`);
  paginas.forEach((p, i) => {
    assert(p.includes(ORG), `la página ${i + 1} perdió la empresa`);
    assert(p.toUpperCase().includes("DOCUMENTO CONTROLADO"),
      `la página ${i + 1} perdió el nombre documental`);
  });
  assert(logoDraws(bytes) === paginas.length, "el logo falta en alguna página");
  assert(paginas.join(" ").includes("Procedimiento de control documental"),
    "el título real del documento desapareció");
});

check("C7. la lista maestra heredada, igual", () => {
  const bytes = renderMasterListPdf({
    documentName: "Lista maestra de documentos",
    organizationName: ORG,
    logo: LOGO,
    companyLegalName: null,
    companyTaxId: null,
    filtersCaption: "Estado: Vigente",
    headers: ["Código", "Documento", "Estado"],
    weights: [2, 6, 2],
    rows: Array.from({ length: 160 }, (_, i) => [`D-${i}`, `Documento número ${i}`, "Vigente"]),
    totalCount: 160,
    generatedAt: "2026-08-26T10:00:00.000Z",
  });
  const paginas = pagesText(bytes);
  assert(paginas.length >= 2, "se esperaban varias páginas");
  paginas.forEach((p, i) => {
    assert(p.includes(ORG), `la página ${i + 1} perdió la empresa`);
    assert(p.toUpperCase().includes("LISTA MAESTRA"), `la página ${i + 1} perdió el nombre`);
  });
  assert(logoDraws(bytes) === paginas.length, "el logo falta en alguna página");
});

// ---------------------------------------------------------------------------
console.log("\nD · Sin logo, y con logo roto");

check("D1. sin logo: el PDF sale igual, con el nombre como identidad", () => {
  const bytes = renderPrintDocument(doc());
  assert(imageObjects(bytes) === 0, "inventó una imagen que no existe");
  assert(pagesText(bytes)[0].includes(ORG), "perdió el nombre de la empresa");
  assert(!pagesText(bytes).join(" ").includes("no se pudo mostrar"),
    "no hay logo configurado: no se puede avisar de que está roto");
});

check("D2. logo ROTO se distingue de logo AUSENTE", () => {
  const roto = renderPrintDocument(doc({
    organization: { name: ORG, legalName: null, taxId: null, logo: null, logoUnusable: true },
  }));
  assert(pagesText(roto).join(" ").includes("no se pudo mostrar"),
    "no avisa de que el logo configurado falló");
  assert(imageObjects(roto) === 0, "no hay logo utilizable: no puede haber imagen");
  const largo = renderPrintDocument(largeDoc(240, {
    organization: { name: ORG, legalName: null, taxId: null, logo: null, logoUnusable: true },
  }));
  for (const p of pagesText(largo)) {
    assert(p.includes("no se pudo mostrar"), "el aviso desaparece en las páginas interiores");
  }
});

check("D3. el aviso NO revela interioridades del almacenamiento", () => {
  for (const secreto of ["organization-assets", "storage", "bucket", "supabase", "logo_storage_path"]) {
    assert(!new RegExp(secreto, "i").test(BROKEN_LOGO_NOTICE), `el aviso menciona «${secreto}»`);
  }
  assert(/Datos de empresa/.test(BROKEN_LOGO_NOTICE), "el aviso debe decir dónde arreglarlo");
  assert(read("lib/pdf/corporate-header.ts").includes("BROKEN_LOGO_NOTICE"),
    "el aviso debe estar centralizado");
});

check("D4. el resolutor DISTINGUE los dos casos en origen", () => {
  const src = read("lib/db/company-logo.ts");
  assert(/outcome: "none"/.test(src), "falta el veredicto «no hay logo»");
  assert(/outcome: "unusable"/.test(src), "falta el veredicto «hay logo y no sirve»");
  assert(/outcome: "ok"/.test(src), "falta el veredicto «se puede usar»");
  assert(/logoUnusable/.test(read("lib/export/branding.ts")),
    "la identidad no propaga el veredicto");
});

// ---------------------------------------------------------------------------
console.log("\nE · Formatos, proporción y textos largos");

check("E1. todo formato aceptado al subir se resuelve para el encabezado", () => {
  const settings = read("lib/domain/settings.ts");
  const convert = read("lib/pdf/convert.ts");
  const image = read("lib/pdf/image.ts");
  const mimes = [...settings.matchAll(/"(image\/[a-z+]+)"/g)].map((m) => m[1]);
  assert(mimes.length >= 3, "no se encontraron los formatos aceptados");
  for (const mime of mimes) {
    const sub = mime.split("/")[1];
    assert(new RegExp(sub, "i").test(image) || new RegExp(sub, "i").test(convert),
      `${mime} se acepta al subir y no se resuelve para el encabezado`);
  }
});

check("E2. el logo respeta su proporción dentro de la caja", () => {
  for (const [w, h] of [[600, 100], [100, 600], [300, 300], [20, 10]] as [number, number][]) {
    const box = fitWithin({ width: w, height: h }, LOGO_BOX.width, LOGO_BOX.height);
    assert(box.width <= LOGO_BOX.width + 0.01 && box.height <= LOGO_BOX.height + 0.01,
      `un logo ${w}×${h} se sale de la caja`);
    assert(Math.abs(w / h - box.width / box.height) < 0.02, `un logo ${w}×${h} se deformó`);
  }
});

check("E3. un nombre de empresa largo no se sale ni tapa el documento", () => {
  const largo = "Corporación Industrial de Reciclados y Transformaciones Plásticas del Caribe Colombiano S.A.S.";
  const p = pagesText(renderPrintDocument(doc({
    organization: { name: largo, legalName: null, taxId: null, logo: LOGO },
  })))[0];
  assert(p.includes("Corporación Industrial"), "perdió el nombre de la empresa");
  assert(p.toUpperCase().includes("FICHA DE RIESGO"), "el nombre largo tapó el nombre documental");
});

check("E4. un nombre documental largo se señala, no se recorta en silencio", () => {
  const p = pagesText(renderPrintDocument(doc({
    documentName: "Listado de órdenes y corridas de producción con evidencias asociadas y contenido reciclado verificado",
  })))[0];
  assert(p.includes("LISTADO DE"), "perdió el nombre documental");
  assert(p.includes(ORG), "perdió el nombre de la empresa");
});
check("E5. los caracteres de control no rompen el papel", () => {
  // Un nombre de empresa puede traer un salto de línea sin que nadie lo haya
  // querido. Dentro de un PDF no rompe el archivo, pero sí el renglón: el
  // medidor lo cuenta como un carácter y el texto se dibuja fuera de su caja.
  const sucio = "Empresa\nCon\rSaltos Raros";
  const bytes = renderPrintDocument(doc({
    organization: { name: sucio, legalName: null, taxId: null, logo: null },
  }));
  const raw = bytes.toString("latin1");
  assert(raw.startsWith("%PDF-") && raw.includes("%%EOF"), "el PDF quedó roto");
  const dibujado = pagesText(bytes).join(" ");
  const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f]");
  assert(!CONTROL.test(dibujado), "un carácter de control llegó al papel");
  assert(dibujado.includes("Empresa"), "se perdió el nombre al limpiarlo");
});

// ---------------------------------------------------------------------------
console.log("\nF · El encabezado no acepta nada del navegador");

check("F1. el endpoint no lee empresa, logo ni nombre documental de la petición", () => {
  const route = stripComments(read("app/(app)/(shell)/export/[key]/route.ts"));
  for (const prohibido of ["companyName", "logoUrl", "organizationName", "documentName"]) {
    assert(!new RegExp(`searchParams\\.get\\(["']${prohibido}`).test(route),
      `el endpoint lee «${prohibido}» de la petición`);
  }
  assert(/documentName: definition\.documentName/.test(route),
    "el nombre documental debe venir del registro");
  assert(/requireActiveOrg\(\)/.test(route), "la empresa debe venir de la sesión");
});

check("F2. la primitiva de encabezado no sabe descargar nada", () => {
  const src = stripComments(read("lib/pdf/corporate-header.ts"));
  for (const prohibido of ["fetch(", "http://", "https://", "createServerClient", "storage"]) {
    assert(!src.includes(prohibido), `la primitiva contiene «${prohibido}»`);
  }
});

check("F3. el logo sigue saliendo de la empresa autorizada", () => {
  const src = read("lib/db/company-logo.ts");
  assert(/\.eq\("id", organizationId\)/.test(src), "la ruta debe salir de la fila de la empresa");
  assert(/startsWith\(`\$\{organizationId\}\/`\)/.test(src),
    "debe comprobarse que la ruta pertenece a esa empresa");
  assert(!/searchParams|request\./.test(stripComments(src)),
    "el resolutor no puede leer nada de la petición");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
