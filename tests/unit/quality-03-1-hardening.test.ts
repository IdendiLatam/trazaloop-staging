/**
 * Trazaloop · QUALITY-03.1 · Pruebas puras y estáticas.
 *
 * Tres hallazgos humanos, tres familias de comprobaciones:
 *
 *   P · el PDF lleva el logo de la empresa, y sigue saliendo cuando no lo hay;
 *   D · el ciclo de vida distingue lo desechable de lo histórico, y lo explica;
 *   M · la migración 0119 hace lo que dice y no toca lo que no debe.
 *
 * Aquí no hay base de datos. Lo que se comprueba es que las piezas puras
 * hagan lo suyo y que el SQL y el TypeScript no puedan divergir.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { decodeImage, fitWithin, MAX_LOGO_BYTES } from "../../lib/pdf/image";
import { PdfWriter, A4_PORTRAIT } from "../../lib/pdf/writer";
import { renderDocumentPdf, renderMasterListPdf } from "../../lib/pdf/quality-documents";
import {
  parseEligibility, describeBlocking, deletionBlockedMessage,
  hardDeleteConfirmation, DISPOSABLE_HINT, HISTORICAL_THRESHOLD,
  LIFECYCLE_ENTITIES, ENTITY_LABEL,
} from "../../lib/domain/lifecycle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0119_quality_temporal_eligibility_and_lifecycle.sql";
const MIG_A = "supabase/migrations/0120_quality_draft_process_deletion.sql";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ---------------------------------------------------------------------------
// Un PNG de verdad, construido a mano: cuatro píxeles rojos opacos arriba y
// cuatro azules semitransparentes abajo. Sirve para comprobar que el canal
// alfa sobrevive hasta el PDF.
// ---------------------------------------------------------------------------
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c;
}
function pngChunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const t = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, body])) >>> 0);
  return Buffer.concat([len, t, body, crc]);
}
function makePng(width = 4, height = 2, alpha = true): Buffer {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc(height * (1 + width * ch));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * ch)] = 0; // filtro None
    for (let x = 0; x < width; x += 1) {
      const o = y * (1 + width * ch) + 1 + x * ch;
      if (y === 0) { raw[o] = 255; raw[o + 1] = 0; raw[o + 2] = 0; }
      else { raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 255; }
      if (alpha) raw[o + 3] = y === 0 ? 255 : 128;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Un JPEG mínimo pero estructuralmente válido: SOI, un SOF0 que declara el
 *  tamaño, y EOI. Basta para comprobar la lectura de dimensiones. */
function makeJpeg(width = 60, height = 20): Buffer {
  const sof = Buffer.alloc(12);
  sof[0] = 0xff; sof[1] = 0xc0;
  sof.writeUInt16BE(11, 2);   // longitud del segmento
  sof[4] = 8;                  // precisión
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;                  // componentes → YCbCr
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}

const DOC_MODEL = {
  organizationName: "Reciclados del Caribe S.A.S.",
  companyLegalName: "Reciclados del Caribe S.A.S.",
  companyTaxId: "900123456-7",
  code: "PR-QA-007",
  title: "Control de documentos",
  description: "Cómo se controlan los documentos del sistema de gestión.",
  categoryLabel: "Procedimiento",
  lifecycle: "effective" as const,
  revisionText: "Revisión 2",
  ownerText: "Coordinador de Calidad",
  reviewersText: "Ana Ruiz", approversText: "Luis Pérez",
  createdAt: "2026-01-10", submittedAt: "2026-02-01",
  approvedAt: "2026-02-05", approvedByName: "Luis Pérez",
  effectiveFrom: "2026-02-10", effectiveTo: null, reviewDueAt: "2027-02-10",
  retirementReason: null, processNames: "Compras, Producción",
  sections: [{ title: "Objeto", content: "Definir el control documental." }],
  revisionHistory: [{ label: "Revisión 1", state: "Sustituida", approvedAt: "2026-01-20",
                      effectiveFrom: "2026-01-25", effectiveTo: "2026-02-09", changeNote: null }],
  decisions: [{ label: "Aprobado", byName: "Luis Pérez", at: "2026-02-05", reason: null, round: 1 }],
  generatedAt: "2026-08-23T12:00:00.000Z",
};

const MASTER_MODEL = {
  organizationName: "Reciclados del Caribe S.A.S.",
  companyLegalName: "Reciclados del Caribe S.A.S.",
  companyTaxId: "900123456-7",
  filtersCaption: "Todos los documentos",
  headers: ["Código", "Título", "Estado"],
  weights: [11, 30, 12],
  rows: [["PR-QA-007", "Control de documentos", "Vigente"]],
  totalCount: 1,
  generatedAt: "2026-08-23T12:00:00.000Z",
};

console.log("\nQUALITY-03.1 · puras y estáticas\n");
console.log("P · Identidad de empresa en el PDF");

check("P1. un PNG con transparencia llega al PDF con su máscara", () => {
  const d = decodeImage(makePng());
  assert(d.error === null, `no decodificó: ${d.error}`);
  assert(d.image!.colorSpace === "DeviceRGB", `espacio ${d.image!.colorSpace}`);
  assert(d.image!.alpha !== undefined, "perdió el canal alfa");
  assert(d.image!.filter === "FlateDecode", "un PNG debe viajar como FlateDecode");
});

check("P2. un PNG sin alfa no inventa una máscara", () => {
  const d = decodeImage(makePng(4, 2, false));
  assert(d.error === null, `no decodificó: ${d.error}`);
  assert(d.image!.alpha === undefined, "creó una máscara que el original no tenía");
});

check("P3. un JPEG se incrusta TAL CUAL, sin recomprimir", () => {
  const jpeg = makeJpeg(60, 20);
  const d = decodeImage(jpeg);
  assert(d.error === null, `no decodificó: ${d.error}`);
  assert(d.image!.filter === "DCTDecode", "un JPEG debe viajar como DCTDecode");
  assert(d.image!.width === 60 && d.image!.height === 20,
    `tamaño ${d.image!.width}x${d.image!.height}`);
  assert(d.image!.data.equals(jpeg), "recomprimió un JPEG que ya estaba comprimido");
});

check("P4. lo que no se puede incrustar se rechaza SIN romper", () => {
  // WebP es un formato que Trazaloop admite subir y que el PDF no sabe leer.
  const webp = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WEBPVP8 ", "latin1")]);
  assert(decodeImage(webp).error !== null, "aceptó un WebP que no puede incrustar");
  assert(decodeImage(Buffer.alloc(0)).error !== null, "aceptó un archivo vacío");
  assert(decodeImage(Buffer.from("no soy una imagen", "utf8")).error !== null, "aceptó basura");
  // Y ninguno lanza: devuelven un error legible.
  for (const b of [webp, Buffer.alloc(0)]) {
    assert(typeof decodeImage(b).error === "string", "el error debe ser un mensaje, no una excepción");
  }
});

check("P5. hay un tope de tamaño y de píxeles", () => {
  const huge = Buffer.alloc(MAX_LOGO_BYTES + 1);
  huge[0] = 0x89; huge[1] = 0x50;
  assert(decodeImage(huge).error !== null, "aceptó un archivo por encima del tope");
  // Un PNG que declara 30000 px de lado se rechaza ANTES de descomprimirlo.
  const bomb = makePng(4, 2);
  bomb.writeUInt32BE(30000, 16); // ancho en el IHDR
  assert(decodeImage(bomb).error !== null, "aceptó un PNG con dimensiones absurdas");
});

check("P6. el logo se encaja sin deformarse y nunca se agranda", () => {
  const wide = fitWithin({ width: 400, height: 100 }, 120, 40);
  assert(Math.abs(wide.width / wide.height - 4) < 0.01, "cambió la proporción");
  assert(wide.width <= 120 && wide.height <= 40, "se salió de la caja");
  const tiny = fitWithin({ width: 10, height: 5 }, 120, 40);
  assert(tiny.width === 10 && tiny.height === 5, "agrandó un logo pequeño hasta pixelarlo");
});

check("P7. el PDF del DOCUMENTO incrusta el logo de verdad", () => {
  const image = decodeImage(makePng(40, 20)).image!;
  const pdf = renderDocumentPdf({ ...DOC_MODEL, logo: image });
  const text = pdf.toString("latin1");
  assert(text.startsWith("%PDF-1.7"), "no es un PDF");
  assert(text.includes("/Subtype /Image"), "no hay ningún objeto de imagen");
  assert(text.includes("/SMask"), "perdió la transparencia del logo");
  assert(/\/XObject << \/Logo \d+ 0 R >>/.test(text), "la página no referencia el logo");
  assert(text.includes("/Logo Do"), "el logo no se llega a dibujar");
  assert(text.includes("%%EOF"), "el archivo quedó truncado");
});

check("P8. y sigue llevando la identidad documental completa", () => {
  const pdf = renderDocumentPdf({ ...DOC_MODEL, logo: decodeImage(makePng(40, 20)).image! });
  const text = pdf.toString("latin1");
  for (const needle of ["Reciclados del Caribe", "PR-QA-007", "Control de documentos", "Revisi"]) {
    assert(text.includes(needle), `falta «${needle}» en el PDF`);
  }
});

check("P9. sin logo, el PDF sale igual con el nombre de la empresa", () => {
  const pdf = renderDocumentPdf({ ...DOC_MODEL, logo: null });
  const text = pdf.toString("latin1");
  assert(text.startsWith("%PDF-1.7") && text.includes("%%EOF"), "el PDF no se generó");
  assert(!text.includes("/Subtype /Image"), "incrustó una imagen que no existe");
  assert(text.includes("Reciclados del Caribe"), "perdió el nombre de la empresa");
  // Y no queda un hueco donde iría el logo: sin imagen no se reserva espacio.
  const withLogo = renderDocumentPdf({ ...DOC_MODEL, logo: decodeImage(makePng(40, 20)).image! });
  assert(pdf.length < withLogo.length, "el PDF sin logo no debería pesar más");
});

check("P10. la Lista Maestra comparte la MISMA identidad", () => {
  const image = decodeImage(makePng(40, 20)).image!;
  const pdf = renderMasterListPdf({ ...MASTER_MODEL, logo: image });
  const text = pdf.toString("latin1");
  assert(text.includes("/Subtype /Image"), "la Lista Maestra no lleva logo");
  assert(text.includes("/Logo Do"), "el logo no se dibuja en la Lista Maestra");
  assert(text.includes("Reciclados del Caribe"), "falta el nombre de la empresa");
  const sinLogo = renderMasterListPdf({ ...MASTER_MODEL, logo: null });
  assert(!sinLogo.toString("latin1").includes("/Subtype /Image"), "inventó un logo");
  assert(sinLogo.toString("latin1").includes("%%EOF"), "sin logo no llegó a cerrarse");
});

check("P11. el logo viaja UNA vez aunque aparezca en varias páginas", () => {
  const image = decodeImage(makePng(40, 20)).image!;
  const w = new PdfWriter("Varias páginas");
  w.addImage("Logo", image);
  for (let i = 0; i < 3; i += 1) { w.addPage(A4_PORTRAIT); w.image("Logo", 40, 40, 60, 30); }
  const text = w.build().toString("latin1");
  const objetos = (text.match(/\/Subtype \/Image/g) ?? []).length;
  // Uno para el color y otro para la máscara; NO tres copias del mismo logo.
  assert(objetos === 2, `el logo se duplicó: ${objetos} objetos de imagen`);
  assert((text.match(/\/Logo Do/g) ?? []).length === 3, "no se dibujó en las tres páginas");
});

check("P12. el generador NO acepta una URL: solo bytes ya obtenidos", () => {
  const src = read("lib/db/company-logo.ts");
  assert(!/fetch\(|axios|https?:\/\//.test(src.replace(/^\s*\*.*$/gm, "").replace(/\/\/.*$/gm, "")),
    "la resolución del logo hace peticiones a direcciones externas");
  assert(/\.eq\("id", organizationId\)/.test(src),
    "la ruta del logo debe salir de la fila de la empresa autorizada");
  assert(/startsWith\(`\$\{organizationId\}\/`\)/.test(src),
    "falta el segundo cinturón: la ruta debe pertenecer a esa empresa");
  const pdfSrc = read("lib/pdf/quality-documents.ts") + read("lib/pdf/image.ts");
  assert(!/fetch\(/.test(pdfSrc), "el generador de PDF no puede descargar nada");
});

console.log("\nD · Ciclo de vida: leer el dictamen y contarlo bien");

check("D1. un dictamen ilegible se interpreta como NO se borra", () => {
  for (const raw of [null, undefined, 42, "sí", {}, { can_hard_delete: "true" }]) {
    assert(parseEligibility(raw).canHardDelete === false,
      `«${JSON.stringify(raw)}» se leyó como permiso para borrar`);
  }
});

check("D2. un dictamen válido se lee entero", () => {
  const e = parseEligibility({
    can_hard_delete: false, reason_code: "has_history",
    reason: "Ya produjo resultados.",
    blocking: [{ label: "mediciones registradas", count: 4 }, { label: "meta histórica", count: 1 }],
    alternative: "retire", alternative_label: "Retirarlo conservando su histórico",
  });
  assert(e.canHardDelete === false && e.reasonCode === "has_history", "no leyó el veredicto");
  assert(e.blocking.length === 2 && e.blocking[0].count === 4, "no leyó los bloqueos");
  assert(e.alternative === "retire", "no leyó la alternativa");
});

check("D3. las entradas mal formadas del bloqueo se descartan, no rompen", () => {
  const e = parseEligibility({
    can_hard_delete: false, reason: "x",
    blocking: [{ label: "mediciones", count: 2 }, { label: 3 }, null, "texto", { count: 9 }],
  });
  assert(e.blocking.length === 1, `coló basura: ${JSON.stringify(e.blocking)}`);
});

check("D4. el motivo se cuenta como lo diría una persona", () => {
  assert(describeBlocking([{ label: "mediciones registradas", count: 4 }]) === "4 mediciones registradas",
    "una sola razón no debe llevar conjunción");
  assert(
    describeBlocking([
      { label: "mediciones registradas", count: 4 },
      { label: "meta histórica", count: 1 },
    ]) === "4 mediciones registradas y 1 meta histórica",
    "dos razones se unen con «y»");
  assert(
    describeBlocking([
      { label: "a", count: 1 }, { label: "b", count: 2 }, { label: "c", count: 3 },
    ]) === "1 a, 2 b y 3 c",
    "tres razones llevan comas y una «y» final");
  assert(describeBlocking([]) === "", "sin razones no hay texto");
});

check("D5. el mensaje de bloqueo dice el porqué CON números y la salida", () => {
  const msg = deletionBlockedMessage(parseEligibility({
    can_hard_delete: false, reason_code: "has_history",
    reason: "Este indicador ya produjo resultados y su histórico debe conservarse.",
    blocking: [{ label: "mediciones registradas", count: 4 }],
    alternative: "retire", alternative_label: "Retirarlo conservando su histórico",
  }));
  assert(msg.includes("4 mediciones registradas"), "no dice cuántas");
  assert(/[Rr]etirarlo/.test(msg), "no ofrece la alternativa");
  assert(msg !== "No se puede eliminar.", "no puede ser un mensaje genérico");
});

check("D6. la confirmación de un borrado real NOMBRA el objeto", () => {
  const msg = hardDeleteConfirmation("indicator", "Reclamos por mes");
  assert(msg.includes("Reclamos por mes"), "no nombra el objeto");
  assert(msg.includes("indicador"), "no dice qué tipo de objeto es");
  assert(/no se puede deshacer/i.test(msg), "no advierte que es irreversible");
});

check("D7. la ayuda de un objeto desechable NO promete que nunca podrá borrarse", () => {
  for (const entity of LIFECYCLE_ENTITIES) {
    const hint = DISPOSABLE_HINT[entity];
    assert(/[Pp]odrás eliminar/.test(hint), `${entity}: la ayuda no dice que TODAVÍA puede eliminarse`);
    assert(!/nunca/i.test(hint), `${entity}: dice «nunca» sobre algo que sí es posible ahora`);
    assert(/mientras/.test(hint), `${entity}: no dice hasta cuándo`);
  }
});

check("D8. los avisos de frontera histórica se dan ANTES de cruzarla", () => {
  for (const [key, text] of Object.entries(HISTORICAL_THRESHOLD)) {
    assert(text.length > 40, `${key}: el aviso es demasiado corto para explicar nada`);
    assert(/histor|histó|conserv|fij/i.test(text), `${key}: no explica qué queda registrado`);
  }
  assert(/ya no podrá eliminarse/.test(HISTORICAL_THRESHOLD.submit_document),
    "enviar a revisión debe avisar de que se pierde la eliminación");
  assert(/original se conserva/.test(HISTORICAL_THRESHOLD.record_measurement),
    "medir debe explicar que una corrección conserva el original");
});

check("D9. cada entidad tiene nombre en español y ayuda propia", () => {
  for (const entity of LIFECYCLE_ENTITIES) {
    assert(ENTITY_LABEL[entity]?.length > 0, `${entity} sin nombre visible`);
    assert(DISPOSABLE_HINT[entity]?.length > 0, `${entity} sin ayuda`);
  }
  const hints = LIFECYCLE_ENTITIES.map((e) => DISPOSABLE_HINT[e]);
  assert(new Set(hints).size === hints.length, "dos entidades comparten la misma ayuda genérica");
});

check("D10. la pantalla NO decide: el dictamen llega resuelto del servidor", () => {
  const panel = read("components/domain/quality/lifecycle-panel.tsx");
  assert(!/measurement|revision|decision|count\s*>/i.test(panel.replace(/^\s*\*.*$/gm, "").replace(/\/\/.*$/gm, "")),
    "el panel está contando historia por su cuenta");
  assert(/eligibility\.canHardDelete/.test(panel), "el panel debe obedecer al dictamen");

  // Y la página del documento dejó de recalcular la regla por su lado.
  const page = read("app/(app)/(shell)/quality/documents/[documentId]/page.tsx");
  assert(/getDeletionEligibility\("document"/.test(page), "el documento no consulta el dictamen del servidor");
  assert(!/hardDeleteBlockReason\(/.test(page), "sigue existiendo una segunda copia de la regla en la página");
});

check("D11. la eliminación pasa por el servidor, nunca por el navegador", () => {
  const actions = read("server/actions/quality-indicators.ts");
  assert(/export async function deleteIndicatorAction/.test(actions), "falta la acción de servidor");
  assert(/export async function deleteObjectiveAction/.test(actions), "falta la acción del objetivo");
  const db = read("lib/db/quality-indicators.ts");
  assert(/\.select\("id"\)/.test(db) && /length === 0/.test(db),
    "un borrado que no afecta a ninguna fila no puede reportarse como éxito");
});

console.log("\nM · Migración 0119");

check("M1. es append-only y no toca lo anterior", () => {
  const sql = read(MIG);
  assert(!/drop table (?!if exists public\.NOTHING)/i.test(stripSql(sql).replace(/drop trigger[^\n]*/gi, "")),
    "0119 no puede destruir tablas");
  const previous = readFileSync(join(ROOT, "supabase/migrations/0117_quality_objectives_indicators_and_measurements.sql"), "utf8");
  assert(previous.length > 0, "0117 debe seguir intacta en el repositorio");
  assert(!/alter table public\.quality_measurements\s+drop/i.test(sql), "no puede alterar el histórico");
});

check("M2. la elegibilidad temporal se define UNA sola vez", () => {
  const sql = stripSql(read(MIG));
  assert(/create or replace function public\.quality_period_is_eligible\(/.test(sql),
    "falta la función de elegibilidad");
  // Y tanto la vista como el barrido la CONSULTAN en vez de reimplementarla:
  // reimplementarla es exactamente como nació el defecto de julio.
  const usos = (sql.match(/quality_period_is_eligible\(/g) ?? []).length;
  assert(usos >= 4, `solo se usa ${usos} veces: la vista y el barrido deben consultarla`);
  assert(/quality_config_for_period\(p_indicator_id, p_period_start, p_period_end\) is not null/.test(sql),
    "la elegibilidad debe apoyarse en la MISMA regla que valida el motor");
});

check("M3. la vista ya no puede fabricar un periodo anterior a la vigencia", () => {
  const sql = stripSql(read(MIG));
  const vista = sql.slice(sql.indexOf("create or replace view public.v_quality_indicator_status"));
  assert(/from public\.quality_previous_period[\s\S]{0,200}where public\.quality_period_is_eligible/.test(vista),
    "el periodo pendiente no está condicionado a la elegibilidad");
  assert(/from public\.quality_period_bounds[\s\S]{0,200}where public\.quality_period_is_eligible/.test(vista),
    "el periodo en curso tampoco puede existir antes de la vigencia");
  assert(/due\.period_start is not null/.test(vista),
    "sin periodo exigible no puede haber medición pendiente");
});

check("M4. el barrido conserva su comportamiento y solo cambia la guarda", () => {
  const original = readFileSync(join(ROOT, "supabase/migrations/0117_quality_objectives_indicators_and_measurements.sql"), "utf8");
  const nuevo = read(MIG);
  const cuerpo = (src: string) => {
    const i = src.indexOf("create or replace function public.quality_scan_pending_measurements(");
    const j = src.indexOf("$$;", src.indexOf("$$", i + 10)) + 3;
    return src.slice(i, j).split("\n");
  };
  const a = cuerpo(original), b = cuerpo(nuevo);
  assert(a.length === b.length, `el barrido cambió de tamaño: ${a.length} → ${b.length} líneas`);
  const distintas = a.map((l, i) => (l === b[i] ? null : i)).filter((i) => i !== null);
  assert(distintas.length === 1, `difieren ${distintas.length} líneas del original, se esperaba 1`);
  assert(/quality_period_is_eligible/.test(b[distintas[0] as number]),
    "la única línea que cambia debe ser la de elegibilidad");
});

check("M5. la frontera histórica de un indicador NO es tener configuración", () => {
  const sql = stripSql(read(MIG));
  const fn = sql.slice(sql.indexOf("function public.quality_indicator_deletion_verdict"));
  // Crear un indicador publica su primera configuración en el mismo gesto: si
  // esa contara, ningún indicador sería nunca eliminable.
  assert(/v_n > 1/.test(fn), "la primera configuración no puede bloquear el borrado");
  for (const tabla of ["quality_measurements", "quality_calculation_runs", "work_events"]) {
    assert(fn.includes(tabla), `la frontera debe mirar ${tabla}`);
  }
});

check("M6. el dictamen y la puerta usan la MISMA función", () => {
  const sql = stripSql(read(MIG));
  assert(/create or replace function public\.quality_guard_hard_delete\(\)/.test(sql), "falta el disparador");
  for (const ent of ["indicator", "objective", "position", "document"]) {
    const verdict = ent === "document" ? "trazadoc_document_deletion_verdict" : `quality_${ent}_deletion_verdict`;
    // El SQL alinea los `then` con espacios, así que el separador es flexible.
    assert(new RegExp(`when '${ent}'\\s+then ${verdict}\\(old\\.id\\)`).test(sql),
      `el disparador no consulta el dictamen de ${ent}`);
    assert(new RegExp(`when '${ent}'\\s+then ${verdict}\\(p_id\\)`).test(sql),
      `el despachador público no consulta el mismo dictamen de ${ent}`);
  }
  assert(/before delete on public\.quality_indicators/.test(sql), "el indicador no tiene puerta");
  assert(/before delete on public\.trazadoc_documents/.test(sql), "el documento no tiene puerta");
});

check("M7. el despachador público enmascara por completo lo ajeno", () => {
  const sql = stripSql(read(MIG));
  const fn = sql.slice(sql.indexOf("function public.quality_deletion_eligibility(p_entity"));
  assert(/if auth\.uid\(\) is null then return v_none/.test(fn), "sin sesión debe negar");
  assert(/not is_org_member\(v_org\) then return v_none/.test(fn), "no enmascara lo de otra empresa");
  assert(/'reason_code', 'not_found'/.test(fn),
    "para lo ajeno la respuesta debe ser la misma que para algo inexistente");
});

check("M8. D-04 · el código documental se reserva y no se recicla", () => {
  const sql = stripSql(read(MIG));
  assert(/create table public\.trazadoc_document_codes/.test(sql), "falta la reserva de códigos");
  assert(/primary key \(organization_id, code_key\)/.test(sql),
    "la reserva debe ser única POR EMPRESA, no global");
  assert(/no puede reutilizarse/.test(read(MIG)), "el rechazo debe explicarse en español");
  assert(/after delete on public\.trazadoc_documents/.test(sql),
    "eliminar un borrador debe dejar la lápida, no liberar el código");
  assert(/set document_id = null, released_at = now\(\)/.test(sql),
    "la lápida conserva la identidad sin conservar un documento fantasma");
  // Y no se conserva un documento fantasma visible.
  assert(!/insert into trazadoc_documents/i.test(sql), "no puede crear documentos fantasma");
});

check("M9. el privilegio que el entorno concede de más queda retirado", () => {
  const sql = stripSql(read(MIG));
  // Misma lección que 0115 y 0118: sin política, un DELETE afecta a 0 filas y
  // devuelve 204. Retirado el privilegio, falla con 42501, que es la verdad.
  for (const tabla of ["trazadoc_document_decisions", "trazadoc_document_revisions",
                       "quality_process_revisions", "quality_process_map_versions"]) {
    assert(new RegExp(`revoke[^;]*${tabla}[^;]*from authenticated`, "s").test(sql),
      `${tabla} conserva el privilegio de borrado que el entorno concede`);
  }
});

check("M11. QUALITY-03.1a · el proceso entra en el MISMO patrón, sin uno propio", () => {
  // La brecha G-1 se cierra reutilizando el dictamen, no inventando una
  // segunda forma de decidir. Si algún día divergen, esto se pone rojo.
  const sql = stripSql(read(MIG_A));
  assert(/create or replace function public\.quality_process_deletion_verdict\(/.test(sql),
    "falta el dictamen del proceso");
  assert(/when 'process'\s+then quality_process_deletion_verdict\(p_id\)/.test(sql),
    "el despachador público no conoce el proceso");
  assert(/when 'process'\s+then quality_process_deletion_verdict\(old\.id\)/.test(sql),
    "el disparador no consulta el dictamen del proceso");
  assert(/before delete on public\.quality_processes/.test(sql), "el proceso no tiene puerta");
  // Y las cuatro entidades de 0119 siguen en el despachador: reemplazar un
  // `case` es fácil de hacer perdiendo una rama por el camino.
  for (const ent of ["indicator", "objective", "position", "document"]) {
    assert(new RegExp(`when '${ent}'\\s+then`).test(sql), `el despachador perdió ${ent}`);
  }
});

check("M12. QUALITY-03.1a · la política nueva y la puerta son cosas distintas", () => {
  const sql = stripSql(read(MIG_A));
  // Sin política nadie borra; sin disparador el borrado se llevaría por
  // delante un mapa publicado. Hacen falta las dos.
  assert(/create policy quality_processes_delete on public\.quality_processes/.test(sql),
    "falta la política de DELETE que no existía");
  assert(/array\['admin','quality','consultant'\]/.test(sql),
    "la política debe usar los mismos roles que ya crean y editan procesos");
  assert(/grant delete on table public\.quality_processes to authenticated/.test(sql),
    "0119 había retirado el privilegio: hay que devolverlo ahora que sí hay política");
});

check("M13. QUALITY-03.1a · la frontera mira las referencias REALES, no solo el estado", () => {
  const sql = stripSql(read(MIG_A));
  const fn = sql.slice(sql.indexOf("function public.quality_process_deletion_verdict"));
  // El encargo lo pide explícitamente: `status === 'draft'` no basta.
  for (const tabla of ["quality_process_revisions", "quality_process_map_nodes",
                       "quality_process_map_edges", "quality_process_interactions",
                       "quality_process_documents", "quality_objective_processes",
                       "quality_indicators"]) {
    assert(fn.includes(tabla), `la frontera no mira ${tabla}`);
  }
  // Y no destruye nada por el camino.
  assert(!/^\s*(drop table|delete from|truncate)/im.test(sql),
    "0120 solo añade: no borra ni destruye");
});

check("M14. QUALITY-03.1a · el proceso tiene ayuda propia y estado en español", () => {
  assert(LIFECYCLE_ENTITIES.includes("process" as never), "el proceso no está en el patrón");
  assert(ENTITY_LABEL.process === "proceso", "sin nombre visible");
  assert(/[Pp]odrás eliminar/.test(DISPOSABLE_HINT.process), "la ayuda no dice que TODAVÍA puede eliminarse");
  assert(!/nunca/i.test(DISPOSABLE_HINT.process), "dice «nunca» sobre algo que sí es posible ahora");
  const sql = stripSql(read(MIG_A));
  assert(/quality_process_state_label/.test(sql), "el estado debe decirse en español, no en código interno");
});

check("M10. la migración explica el porqué y ancla sus decisiones", () => {
  const comments = read(MIG).split("\n").filter((l) => l.trim().startsWith("--"));
  assert(comments.length > 120, `solo ${comments.length} líneas de comentario`);
  const text = comments.join("\n");
  for (const d of ["D-04", "D-20", "OI-07", "OI-24", "OI-28", "MDR-49"]) {
    assert(text.includes(d), `no ancla la decisión ${d}`);
  }
  assert(/2026-07/.test(text) || /julio/.test(text), "no deja constancia del defecto que corrige");
});

console.log(`\nQUALITY-03.1 · puras y estáticas: ${passed} correctas, ${failed} fallidas\n`);
if (failed > 0) process.exit(1);
