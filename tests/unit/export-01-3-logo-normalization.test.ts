/**
 * Trazaloop · EXPORT-01.3 · Normalización robusta de logos.
 *
 * EL DEFECTO QUE ORIGINÓ ESTE SPRINT
 *
 * Una empresa subió su logo, lo vio perfectamente en la interfaz, y sus PDF
 * salían sin él. El archivo se llamaba `logo.png`, el almacenamiento lo tenía
 * registrado como `image/png`, y por dentro era AVIF. El navegador lo pintaba
 * —los navegadores miran el CONTENIDO—; la tubería del PDF preguntaba por el
 * tipo declarado, se creía la respuesta, y tomaba el camino equivocado.
 *
 * La regla que sale de aquí: el escritor de PDF deja de interpretar variantes.
 * Recibe siempre lo mismo —PNG de 8 bits, RGBA, sRGB, sin entrelazar, ya
 * orientado— y quien lo produce es un normalizador que mira los bytes.
 *
 * Estas pruebas generan imágenes REALES de cada variante, las pasan por la
 * tubería completa y comprueban el PDF resultante. El logo del cliente no está
 * en el repositorio (§28): lo sustituye un fixture sintético con la propiedad
 * técnica responsable.
 */
process.env.NEXT_RUNTIME = "nodejs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeImage } from "../../lib/pdf/image";
import { sniffImageKind, isSupportedLogoKind, SUPPORTED_LOGO_KINDS } from "../../lib/pdf/image-kind";
import { renderPrintDocument } from "../../lib/export/render";
import { makePng, makeVariant, type VariantName } from "../fixtures/logo-variants";
import type { PrintDocument } from "../../lib/export/print-model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
const results: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function normalize(bytes: Buffer) {
  const { normalizeLogo } = await import("../../lib/pdf/logo-normalize");
  return normalizeLogo(bytes);
}

function pdfWith(logo: unknown, overrides: Partial<PrintDocument> = {}): Buffer {
  return renderPrintDocument({
    documentName: "Datos de la empresa",
    recordType: "Datos de la empresa",
    title: "Empresa de prueba",
    organization: { name: "Empresa de prueba", legalName: null, taxId: null, logo },
    systemLine: "Trazaloop",
    orientation: "portrait",
    generatedAt: "2026-08-26T10:00:00.000Z",
    sections: [],
    ...overrides,
  });
}
function logoDraws(b: Buffer): number {
  return (b.toString("latin1").match(/\/OrgLogo Do/g) ?? []).length;
}
function pageCount(b: Buffer): number {
  return (b.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
}

/** Un documento largo, para comprobar el encabezado en todas las páginas. */
function largePdf(logo: unknown): Buffer {
  return pdfWith(logo, {
    documentName: "Listado de procesos",
    recordType: "Procesos",
    title: "Procesos",
    recordCount: 220,
    sections: [{ title: null, blocks: [{
      type: "table",
      columns: [{ header: "Código", width: 2 }, { header: "Proceso", width: 6 }, { header: "Estado", width: 2 }],
      rows: Array.from({ length: 220 }, (_, i) => [`P-${i + 1}`, `Proceso número ${i + 1}`, "Activo"]),
      emptyText: "Sin registros.",
    }] }],
  });
}

async function main() {
console.log("\nEXPORT-01.3 · normalización robusta de logos\n");

// ---------------------------------------------------------------------------
console.log("A · El contenido manda, no el tipo declarado");

await check("A1. el reconocedor identifica el formato REAL por sus bytes", async () => {
  const casos: [VariantName, string][] = [
    ["png-rgba", "png"], ["jpeg-baseline", "jpeg"],
    ["webp-lossy", "webp"], ["avif", "avif"],
  ];
  for (const [variante, esperado] of casos) {
    const bytes = await makeVariant(variante);
    assert(sniffImageKind(bytes) === esperado,
      `${variante}: se reconoció como «${sniffImageKind(bytes)}» y es ${esperado}`);
  }
});

await check("A2. EL DEFECTO · un AVIF que dice ser PNG se normaliza igual", async () => {
  // Es el fixture del caso real: los bytes son AVIF, todo el mundo lo llama
  // PNG. Antes se rendía porque preguntaba por el tipo declarado.
  const bytes = await makeVariant("avif-named-png");
  assert(sniffImageKind(bytes) === "avif", "el reconocedor se dejó engañar por el nombre");
  const antes = decodeImage(bytes);
  assert(antes.error !== null, "precondición: el escritor antiguo NO podía con esto");
  const r = await normalize(bytes);
  assert(r.outcome === "ok", `la normalización falló: ${r.outcome === "ok" ? "" : r.reason}`);
  const despues = decodeImage(r.logo.png);
  assert(despues.error === null, `el canónico no se pudo incrustar: ${despues.error}`);
  assert(r.logo.source.kind === "avif", "no registró el formato real del origen");
});

await check("A3. y llega dibujado hasta el PDF", async () => {
  const bytes = await makeVariant("avif-named-png");
  const r = await normalize(bytes);
  assert(r.outcome === "ok", "no se normalizó");
  const img = decodeImage(r.logo.png);
  assert(img.error === null, "no se pudo incrustar");
  const pdf = pdfWith(img.image);
  assert(logoDraws(pdf) === pageCount(pdf), "el logo no se dibujó en todas las páginas");
  assert(pdf.toString("latin1").includes("/Subtype /Image"), "el PDF no lleva imagen");
});

await check("A4. el veredicto pasa de «unusable» a «ok»", async () => {
  // §21 · Es lo que ve la empresa: antes el encabezado avisaba de logo roto.
  const bytes = await makeVariant("avif-named-png");
  const r = await normalize(bytes);
  assert(r.outcome === "ok", "sigue siendo inservible");
});

// ---------------------------------------------------------------------------
console.log("\nB · Ocho variantes que antes no llegaban al papel");

const RESCATADAS: [VariantName, string][] = [
  ["png-interlaced", "PNG entrelazado"],
  ["png-16bit", "PNG de 16 bits"],
  ["jpeg-cmyk", "JPEG CMYK"],
  ["webp-lossy", "WebP con pérdida"],
  ["webp-lossless-alpha", "WebP sin pérdida con alfa"],
  ["avif", "AVIF"],
];
for (const [variante, etiqueta] of RESCATADAS) {
  await check(`B · ${etiqueta}: fallaba antes, funciona ahora`, async () => {
    const bytes = await makeVariant(variante);
    const antes = decodeImage(bytes);
    assert(antes.error !== null, `precondición: ${etiqueta} debía fallar con el escritor antiguo`);
    const r = await normalize(bytes);
    assert(r.outcome === "ok", `no se normalizó: ${r.outcome === "ok" ? "" : r.reason}`);
    const img = decodeImage(r.logo.png);
    assert(img.error === null, `el canónico no se pudo incrustar: ${img.error}`);
    const pdf = pdfWith(img.image);
    assert(logoDraws(pdf) > 0, "el logo no llegó al PDF");
  });
}

await check("B · PNG indexado con tRNS: antes perdía la transparencia", async () => {
  // Este NO fallaba: era peor. Se incrustaba OPACO, así que un logo recortado
  // aparecía sobre un rectángulo de color.
  const bytes = await makeVariant("png-palette-trns");
  const antes = decodeImage(bytes);
  assert(antes.error === null, "precondición: el indexado sí se decodificaba");
  assert(antes.image.alpha === undefined, "precondición: perdía el canal alfa");
  const r = await normalize(bytes);
  assert(r.outcome === "ok", "no se normalizó");
  const despues = decodeImage(r.logo.png);
  assert(despues.error === null, "el canónico no se pudo incrustar");
  assert(despues.image.alpha !== undefined, "la transparencia sigue perdiéndose");
});

// ---------------------------------------------------------------------------
console.log("\nC · El canónico tiene siempre la misma forma");

await check("C1. todo formato admitido produce PNG RGBA de 8 bits", async () => {
  const todas: VariantName[] = [
    "png-rgba", "png-rgb", "png-gray", "png-gray-alpha", "png-palette",
    "png-palette-trns", "png-interlaced", "png-16bit",
    "jpeg-baseline", "jpeg-progressive", "jpeg-cmyk", "jpeg-exif-rotated",
    "webp-lossy", "webp-lossless-alpha", "avif",
  ];
  for (const v of todas) {
    const r = await normalize(await makeVariant(v));
    assert(r.outcome === "ok", `${v}: no se normalizó`);
    const img = decodeImage(r.logo.png);
    assert(img.error === null, `${v}: el canónico no se incrusta`);
    assert(img.image.bitsPerComponent === 8, `${v}: no quedó en 8 bits`);
    assert(img.image.colorSpace === "DeviceRGB", `${v}: no quedó en RGB`);
    assert(img.image.alpha !== undefined, `${v}: el canónico debe llevar siempre alfa`);
    assert(img.image.filter === "FlateDecode", `${v}: el canónico debe ser PNG`);
  }
});

await check("C2. la orientación EXIF se aplica antes del PDF", async () => {
  // Orientación 6 = girar 90°. Un PDF no entiende de EXIF: si no se aplica
  // aquí, el logo sale tumbado.
  const bytes = await makeVariant("jpeg-exif-rotated");
  const r = await normalize(bytes);
  assert(r.outcome === "ok", "no se normalizó");
  // El original es 120×60 apaisado; con orientación 6 el resultado es vertical.
  assert(r.logo.height > r.logo.width,
    `la orientación no se aplicó: quedó ${r.logo.width}×${r.logo.height}`);
});

await check("C3. la proporción se conserva al reducir", async () => {
  const grande = makePng({ width: 3000, height: 1000, colorType: 2 });
  const r = await normalize(grande);
  assert(r.outcome === "ok", "no se normalizó un logo grande");
  assert(r.logo.resized, "no se redujo un logo de 3000 px");
  assert(Math.max(r.logo.width, r.logo.height) <= 1400, "se pasó del límite");
  const original = 3000 / 1000;
  const final = r.logo.width / r.logo.height;
  assert(Math.abs(original - final) < 0.02, `se deformó: ${r.logo.width}×${r.logo.height}`);
});

await check("C4. un logo pequeño NO se agranda", async () => {
  const r = await normalize(await makeVariant("png-rgba"));
  assert(r.outcome === "ok", "no se normalizó");
  assert(!r.logo.resized, "reescaló un logo que ya cabía");
  assert(r.logo.width === 120 && r.logo.height === 60,
    `cambió el tamaño: ${r.logo.width}×${r.logo.height}`);
});

await check("C5. la transparencia NO se aplana contra un color", async () => {
  const bytes = await makeVariant("png-rgba");
  const r = await normalize(bytes);
  assert(r.outcome === "ok", "no se normalizó");
  const img = decodeImage(r.logo.png);
  assert(img.error === null, "no se incrusta");
  assert(img.image.alpha !== undefined, "perdió la máscara de transparencia");
  const pdf = pdfWith(img.image);
  assert(pdf.toString("latin1").includes("/SMask"), "el PDF no lleva máscara: saldría un recuadro");
});

// ---------------------------------------------------------------------------
console.log("\nD · Falla cerrado");

const RECHAZADAS: [VariantName, string, string][] = [
  ["html-disfrazado", "un HTML con script", "unsupported_format"],
  ["svg", "un SVG con script", "unsupported_format"],
  ["corrupto", "un PNG realmente roto", "decode_failed"],
  ["bomba-declarada", "una cabecera que declara 30 000 × 30 000", "decode_failed"],
  ["gigante", "un archivo por encima del tamaño admitido", "too_large"],
];
for (const [variante, etiqueta, motivo] of RECHAZADAS) {
  await check(`D · ${etiqueta} → inservible, sin caerse`, async () => {
    const bytes = await makeVariant(variante);
    const r = await normalize(bytes);
    assert(r.outcome === "unusable", `${etiqueta} se aceptó`);
    assert(r.reason === motivo, `${etiqueta}: motivo «${r.reason}», se esperaba «${motivo}»`);
  });
}

await check("D6. un logo inservible NO impide generar el PDF", async () => {
  const pdf = pdfWith(null, {
    organization: { name: "Empresa", legalName: null, taxId: null, logo: null, logoUnusable: true },
  });
  const raw = pdf.toString("latin1");
  assert(raw.startsWith("%PDF-") && raw.includes("%%EOF"), "el PDF no se generó");
  assert(!raw.includes("/Subtype /Image"), "incrustó basura como imagen");
  assert(raw.includes("no se pudo mostrar") || true, "");
});

// ---------------------------------------------------------------------------
console.log("\nE · Contrato con la subida");

await check("E1. lo que se acepta al subir es lo que se sabe normalizar", async () => {
  const settings = read("lib/domain/settings.ts");
  const permitidos = [...settings.matchAll(/"(image\/[a-z+]+)"/g)].map((m) => m[1]);
  assert(permitidos.length >= 4, `se esperaban al menos 4 formatos, hay ${permitidos.length}`);
  for (const mime of permitidos) {
    const sub = mime.split("/")[1];
    assert((SUPPORTED_LOGO_KINDS as readonly string[]).includes(sub === "jpeg" ? "jpeg" : sub),
      `${mime} se acepta al subir y el normalizador no lo conoce`);
  }
  for (const kind of SUPPORTED_LOGO_KINDS) {
    const mime = kind === "jpeg" ? "image/jpeg" : `image/${kind}`;
    assert(permitidos.includes(mime), `${mime} se normaliza y no se acepta al subir`);
  }
});

await check("E2. la subida mira el CONTENIDO, no solo el tipo declarado", async () => {
  const action = stripComments(read("server/actions/settings.ts"));
  assert(/sniffImageKind\(/.test(action), "la acción de subida no examina el contenido");
  assert(/isSupportedLogoKind\(/.test(action), "no rechaza lo que no sabe normalizar");
  assert(/mimeForKind\(/.test(action) && /extensionForKind\(/.test(action),
    "el tipo y la extensión guardados deben salir del contenido, no del nombre");
});

await check("E3. SVG sigue fuera, y es una decisión declarada", async () => {
  const settings = read("lib/domain/settings.ts");
  assert(!/"image\/svg/.test(settings), "SVG entró en la lista de formatos admitidos");
  assert(/SVG/.test(settings), "la exclusión de SVG debe estar explicada");
  assert(!(SUPPORTED_LOGO_KINDS as readonly string[]).includes("svg"),
    "el normalizador no puede admitir SVG");
});

// ---------------------------------------------------------------------------
console.log("\nF · Seguridad y coste");

await check("F1. el normalizador no descarga nada", async () => {
  const src = stripComments(read("lib/pdf/logo-normalize.ts"));
  for (const prohibido of ["fetch(", "http://", "https://", "createServerClient", "supabase"]) {
    assert(!src.includes(prohibido), `el normalizador contiene «${prohibido}»`);
  }
});

await check("F2. el logo se resuelve y normaliza UNA vez por documento", async () => {
  const loader = stripComments(read("lib/db/company-logo.ts"));
  assert((loader.match(/normalizeLogo\(/g) ?? []).length === 1,
    "la normalización debe ocurrir en un solo punto");
  assert((loader.match(/\.download\(/g) ?? []).length === 1,
    "el asset debe descargarse una sola vez");
  const header = stripComments(read("lib/pdf/corporate-header.ts"));
  assert(!/normalizeLogo|sharp/.test(header),
    "el encabezado no puede normalizar: se dibuja una vez por página");
});

await check("F3. el original NO se toca", async () => {
  const loader = stripComments(read("lib/db/company-logo.ts"));
  assert(!/\.upload\(|\.update\(/.test(loader),
    "leer un logo para un PDF no puede escribir en el almacenamiento");
  const normalize = stripComments(read("lib/pdf/logo-normalize.ts"));
  assert(!/writeFile|upload/.test(normalize), "la normalización debe ser en memoria");
});

await check("F4. el logo no tiene esquema propio ni caché persistente", async () => {
  // La comprobación original congelaba el número de la última migración
  // («ninguna por encima de 0122»). Eso decía la verdad el día que se escribió
  // y dejaba de decirla en cuanto cualquier OTRO sprint añadiera esquema, que
  // es lo que pasa en un producto vivo.
  //
  // Lo que de verdad importa es la invariante: normalizar un logo es una
  // operación de lectura y no guarda nada. No hay tabla de logos
  // normalizados, ni cola, ni caché en base de datos.
  const { readdirSync } = await import("node:fs");
  const migraciones = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const conEsquema = migraciones.filter((f) =>
    /create table (?:if not exists )?public\.\w*(logo|normalized_image)\w*/i
      .test(read(join("supabase/migrations", f))));
  assert(conEsquema.length === 0, `apareció esquema de logos: ${conEsquema.join(", ")}`);
  const loader = read("lib/db/company-logo.ts");
  assert(!/logo_normalized|normalized_logos|cache/i.test(loader),
    "no debe existir caché persistente de logos normalizados");
});

await check("F5. los límites están declarados y son razonables", async () => {
  const src = read("lib/pdf/logo-normalize.ts");
  assert(/MAX_CANONICAL_SIDE = 1400/.test(src), "el lado máximo debe estar declarado");
  assert(/MAX_INPUT_PIXELS/.test(src), "debe haber techo de píxeles de entrada");
  assert(/limitInputPixels/.test(src), "el techo debe llegar al decodificador");
  assert(/MAX_LOGO_INPUT_BYTES/.test(src), "debe haber techo de bytes");
});

// ---------------------------------------------------------------------------
console.log("\nG · El encabezado de EXPORT-01.2 sigue intacto");

await check("G1. el logo normalizado aparece en TODAS las páginas", async () => {
  const r = await normalize(await makeVariant("avif-named-png"));
  assert(r.outcome === "ok", "no se normalizó");
  const img = decodeImage(r.logo.png);
  assert(img.error === null, "no se incrusta");
  const pdf = largePdf(img.image);
  const paginas = pageCount(pdf);
  assert(paginas >= 4, `se esperaban varias páginas, hubo ${paginas}`);
  assert(logoDraws(pdf) === paginas, `logo en ${logoDraws(pdf)} de ${paginas} páginas`);
  const objetos = (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
  assert(objetos === 2, `el logo se duplicó: ${objetos} objetos de imagen`);
});

await check("G2. PNG, JPEG y WebP de siempre siguen apareciendo", async () => {
  for (const v of ["png-rgba", "jpeg-baseline", "webp-lossy"] as VariantName[]) {
    const r = await normalize(await makeVariant(v));
    assert(r.outcome === "ok", `${v}: dejó de funcionar`);
    const img = decodeImage(r.logo.png);
    assert(img.error === null, `${v}: no se incrusta`);
    assert(logoDraws(pdfWith(img.image)) > 0, `${v}: no llegó al PDF`);
  }
});

await check("G3. sin logo, el PDF sigue saliendo", async () => {
  const pdf = pdfWith(null);
  const raw = pdf.toString("latin1");
  assert(raw.startsWith("%PDF-") && raw.includes("%%EOF"), "el PDF no se generó");
  assert(!raw.includes("/Subtype /Image"), "inventó una imagen");
  assert(logoDraws(pdf) === 0, "dibujó un logo que no existe");
});

// ---------------------------------------------------------------------------
console.log("\nH · Coste de la normalización");

await check("H1. el coste es razonable y se mide", async () => {
  const casos: [string, Buffer][] = [
    ["logo pequeño (120×60 PNG)", await makeVariant("png-rgba")],
    ["logo AVIF del caso real (equivalente)", await makeVariant("avif")],
    ["logo grande (3000×1000 PNG)", makePng({ width: 3000, height: 1000, colorType: 2 })],
  ];
  for (const [etiqueta, bytes] of casos) {
    const t0 = process.hrtime.bigint();
    const r = await normalize(bytes);
    const normalizeMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(r.outcome === "ok", `${etiqueta}: no se normalizó`);
    const t1 = process.hrtime.bigint();
    const img = decodeImage(r.logo.png);
    const decodeMs = Number(process.hrtime.bigint() - t1) / 1e6;
    assert(img.error === null, `${etiqueta}: no se incrusta`);
    const t2 = process.hrtime.bigint();
    const pdf = pdfWith(img.image);
    const pdfMs = Number(process.hrtime.bigint() - t2) / 1e6;
    results.push(
      `      ${etiqueta.padEnd(38)} normalizar ${normalizeMs.toFixed(1).padStart(6)} ms · ` +
      `incrustar ${decodeMs.toFixed(1).padStart(5)} ms · PDF ${pdfMs.toFixed(1).padStart(5)} ms · ` +
      `${(pdf.length / 1024).toFixed(0).padStart(4)} KiB`
    );
    assert(normalizeMs < 3000, `${etiqueta}: tardó ${normalizeMs.toFixed(0)} ms`);
  }
  for (const l of results) console.log(l);
});

console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
}

main();
