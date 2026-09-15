/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · Administración y exportación, por fuera.
 *
 * Aquí viven las comprobaciones que no necesitan base: las columnas que se
 * derivan del instrumento, la neutralización de fórmulas, el `.xlsx` —abierto
 * después con otra implementación en la prueba de base—, y que la puerta de la
 * administración se compruebe en el SERVIDOR y no en un botón escondido.
 *
 * Correr: npm run test:pd01h
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  csvHeaders, csvRows, csvTable, workbookSheets, neutralizeFormula,
  answerLabel, exportFilename,
  type ExportDataset, type ExportSubmission,
} from "../../lib/domain/public-diagnostic-export";
import { buildXlsx, columnName, sheetName } from "../../lib/xlsx";
import { toCsv, parseCsv } from "../../lib/csv";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/[^\n]*/g, "$1");
const sinSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

const RUTA_CSV = sinTs(leer("app/(app)/platform/public-diagnostics/[campaignId]/export/csv/route.ts"));
const RUTA_XLSX = sinTs(leer("app/(app)/platform/public-diagnostics/[campaignId]/export/xlsx/route.ts"));
const ACCIONES = sinTs(leer("server/actions/public-diagnostics-admin.ts"));
const DATOS = sinTs(leer("lib/db/public-diagnostic-admin.ts"));
const TABLA = sinTs(leer("components/domain/public-diagnostics/submissions-table.tsx"));
const SQL0202 = sinSql(leer("supabase/migrations/0202_public_anon_execute_audit.sql"));
const INFORME = sinTs(leer("components/domain/public-diagnostics/result-report.tsx"));

/** Un conjunto pequeño pero con todos los casos incómodos dentro. */
function datos(nPreguntas = 3): ExportDataset {
  const secciones = [
    { code: "s1", title: "Sección uno" }, { code: "s2", title: "Sección dos" },
  ];
  const questions = Array.from({ length: nPreguntas }, (_, i) => ({
    code: `S${(i % 2) + 1}Q${String(i + 1).padStart(2, "0")}`,
    text: `¿Pregunta ${i + 1}?`,
    sectionCode: `s${(i % 2) + 1}`,
    sectionTitle: secciones[i % 2].title,
  }));
  const base: ExportSubmission = {
    submissionId: "sub-1", startedAt: "2026-09-01T10:00:00Z",
    completedAt: "2026-09-01T10:30:00Z", status: "completed",
    participantName: "Ana Pérez", participantEmail: "ana@ejemplo.com",
    participantPhone: "+573001112233", companyName: "Recicladora S.A.S.",
    requiredConsentVersion: "1.2", requiredConsentAt: "2026-09-01T10:00:00Z",
    marketingConsent: false, marketingConsentAt: null,
    maturityPercent: 65.3846, readinessLevel: "medium",
    snapshotSchema: "public_pcr_result.v2",
    supersedesId: null, supersededById: null,
    dimensions: [
      { code: "s1", title: "Sección uno", percent: 80 },
      { code: "s2", title: "Sección dos", percent: 40 },
    ],
    answers: Object.fromEntries(questions.map((q, i) => [q.code, i % 2 === 0])),
  };
  const conMarketing: ExportSubmission = {
    ...base, submissionId: "sub-2", companyName: "=SUMA(A1:A9)",
    participantName: "+57 Beto", participantEmail: "beto@ejemplo.com",
    marketingConsent: true, marketingConsentAt: "2026-09-02T09:00:00Z",
  };
  const aMedias: ExportSubmission = {
    ...base, submissionId: "sub-3", status: "in_progress", completedAt: null,
    companyName: "A Medias SAS", maturityPercent: null, readinessLevel: null,
    snapshotSchema: null, dimensions: [], answers: {},
  };
  return {
    campaign: {
      name: "Convocatoria QA", slug: "qa-convocatoria", diagnosticType: "pcr",
      versionNumber: 1, status: "open",
      opensAt: "2026-09-01T00:00:00Z", closesAt: "2026-10-01T00:00:00Z",
    },
    questions, sections: secciones,
    submissions: [base, conMarketing, aMedias],
  };
}

console.log("\nA · Las columnas salen del instrumento");
// ===========================================================================

check("El número de preguntas NO está escrito en ninguna parte", () => {
  for (const n of [3, 52, 70]) {
    const d = datos(n);
    const cab = csvHeaders(d);
    const deRespuesta = cab.slice(cab.indexOf(d.questions[0].code));
    assert(deRespuesta.length === n,
      `con ${n} preguntas salieron ${deRespuesta.length} columnas de respuesta`);
    assert(JSON.stringify(deRespuesta) === JSON.stringify(d.questions.map((q) => q.code)),
      "las columnas no son las claves estables del instrumento");
  }
  // Y no hay un 52 escrito en el dominio ni en la capa de datos.
  for (const [nombre, src] of [["dominio", leer("lib/domain/public-diagnostic-export.ts")],
                               ["capa de datos", DATOS]] as const) {
    assert(!/\b52\b/.test(sinTs(src)), `el ${nombre} de exportación lleva un 52 escrito`);
  }
});

check("Las columnas base están, y con el nombre acordado", () => {
  const cab = csvHeaders(datos());
  for (const c of ["campaign_name", "campaign_slug", "diagnostic_type", "diagnostic_version",
                   "submission_id", "started_at", "completed_at",
                   "participant_name", "participant_email", "participant_phone",
                   "company_name", "required_consent", "required_consent_at",
                   "marketing_consent", "marketing_consent_at",
                   "global_score", "readiness_level"]) {
    assert(cab.includes(c), `falta la columna «${c}»`);
  }
  assert(cab.filter((c) => c.startsWith("dimension_")).length === 2,
    "las columnas de dimensión no salen de las secciones");
});

check("Una fila por participación COMPLETADA, y las de a medias fuera", () => {
  const filas = csvRows(datos());
  assert(filas.length === 2, `salieron ${filas.length} filas`);
  const ids = filas.map((f) => f[csvHeaders(datos()).indexOf("submission_id")]);
  assert(!ids.includes("sub-3"),
    "una participación sin cerrar entró en el CSV: su porcentaje vacío acabaría "
    + "en el promedio de alguien");
});

console.log("\nB · Lo que Excel no va a ejecutar");
// ===========================================================================

check("Las celdas peligrosas se neutralizan, y las normales no se tocan", () => {
  for (const malo of ["=SUMA(A1)", "+1+1", "-2", "@SUM", "\tdisimulado", "\rotro"]) {
    const r = neutralizeFormula(malo);
    assert(r.startsWith("'"), `«${malo}» no se neutralizó`);
    assert(r.slice(1) === malo, `«${malo}» se alteró más de la cuenta`);
  }
  for (const bueno of ["Recicladora S.A.S.", "65.3846", "", "ana@ejemplo.com", "Sí"]) {
    assert(neutralizeFormula(bueno) === bueno, `«${bueno}» se neutralizó sin motivo`);
  }
});

check("Y una empresa con nombre de fórmula sale inofensiva del CSV", () => {
  const tabla = csvTable(datos());
  const i = csvHeaders(datos()).indexOf("company_name");
  const peligrosa = tabla.slice(1).map((f) => f[i]).find((v) => v.includes("SUMA"));
  assert(peligrosa === "'=SUMA(A1:A9)", `salió «${peligrosa}»`);
  // Y sobrevive al viaje completo por el CSV.
  const vuelta = parseCsv(toCsv(tabla));
  const fila = vuelta.find((f) => f[i]?.includes("SUMA"));
  assert(fila?.[i] === "'=SUMA(A1:A9)", `tras releer el CSV salió «${fila?.[i]}»`);
  // El nombre del participante también pasa por el filtro.
  const j = csvHeaders(datos()).indexOf("participant_name");
  assert(tabla.slice(1).some((f) => f[j] === "'+57 Beto"),
    "el nombre que empieza por «+» no se neutralizó");
});

console.log("\nC · Los dos consentimientos, separados");
// ===========================================================================

check("Quien NO autorizó lo comercial sigue en el estudio, y se distingue", () => {
  const tabla = csvTable(datos());
  const cab = csvHeaders(datos());
  const iMkt = cab.indexOf("marketing_consent");
  const iReq = cab.indexOf("required_consent");
  const sinMkt = tabla.slice(1).find((f) => f[iMkt] === "No");
  assert(sinMkt !== undefined,
    "quien no autorizó comunicaciones desapareció del conjunto de datos");
  assert(sinMkt![iReq] === "1.2",
    "el consentimiento del diagnóstico no viaja en su propia columna");
  assert(cab.indexOf("marketing_consent_at") > -1, "falta la fecha del comercial");
  // Y las dos columnas no son la misma cosa con dos nombres.
  assert(iMkt !== iReq, "los dos consentimientos comparten columna");
});

console.log("\nD · Nada de secretos en la salida");
// ===========================================================================

check("Ni testigos, ni hashes, ni metadato de seguridad", () => {
  const tabla = JSON.stringify(csvTable(datos()));
  const libro = JSON.stringify(workbookSheets(datos()));
  for (const prohibido of ["resume_token", "token_hash", "consent_content_hash",
                           "content_hash", "prefix", "ip", "user_agent", "cookie"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`, "i").test(tabla),
      `el CSV lleva «${prohibido}»`);
    assert(!new RegExp(`\\b${prohibido}\\b`, "i").test(libro),
      `el libro lleva «${prohibido}»`);
  }
  // Y la capa de datos ni siquiera los pide.
  const i = DATOS.indexOf("const CAMPOS_PARTICIPACION");
  const campos = DATOS.slice(i, DATOS.indexOf(";", i));
  for (const prohibido of ["resume_token_hash", "resume_token_prefix",
                           "consent_content_hash"]) {
    assert(!campos.includes(prohibido), `se lee «${prohibido}» de la base`);
  }
  assert(!/select\("\*"\)|select\('\*'\)/.test(DATOS),
    "se pide `*`: cualquier columna nueva entraría en la exportación sin que nadie lo decida");
});

console.log("\nE · El libro de Excel");
// ===========================================================================

check("Cuatro hojas, en su orden, y ninguna comparativa", () => {
  const hojas = workbookSheets(datos());
  assert(JSON.stringify(hojas.map((h) => h.name))
      === JSON.stringify(["Resumen", "Participantes", "Respuestas", "Dimensiones"]),
    `hojas: ${hojas.map((h) => h.name).join(", ")}`);
  const texto = JSON.stringify(hojas).toLowerCase();
  for (const prohibido of ["ranking", "percentil", "promedio", "benchmark",
                           "mejor empresa", "peor empresa", "posición"]) {
    assert(!texto.includes(prohibido),
      `el libro compara empresas («${prohibido}»): eso necesita un referente `
      + `gobernado que todavía no existe`);
  }
});

check("El resumen cuenta iniciadas, completadas, incompletas y tasa", () => {
  const [resumen] = workbookSheets(datos());
  const mapa = new Map(resumen.rows.slice(1).map((f) => [String(f[0]), f[1]]));
  assert(mapa.get("Participaciones iniciadas") === 3, "iniciadas mal contadas");
  assert(mapa.get("Participaciones completadas") === 2, "completadas mal contadas");
  assert(mapa.get("Participaciones incompletas") === 1, "incompletas mal contadas");
  assert(mapa.get("Tasa de finalización (%)") === 66.7, `tasa ${mapa.get("Tasa de finalización (%)")}`);
});

check("Respuestas en formato largo, con el texto de la versión", () => {
  const d = datos(4);
  const hojas = workbookSheets(d);
  const respuestas = hojas.find((h) => h.name === "Respuestas")!;
  // 2 completadas × 4 preguntas + cabecera.
  assert(respuestas.rows.length === 2 * 4 + 1,
    `la hoja de respuestas tiene ${respuestas.rows.length} filas`);
  const fila = respuestas.rows[1];
  assert(fila[4] === d.questions[0].code, "no se identifica la pregunta por su clave");
  assert(fila[5] === d.questions[0].text, "no viaja el texto de la pregunta");
  assert(["Sí", "No"].includes(String(fila[6])), `la respuesta salió «${fila[6]}»`);
});

check("Y las dimensiones salen del resultado congelado", () => {
  const dim = workbookSheets(datos()).find((h) => h.name === "Dimensiones")!;
  assert(dim.rows.length === 2 * 2 + 1, `la hoja tiene ${dim.rows.length} filas`);
  assert(dim.rows[1][4] === 80, `el puntaje salió ${dim.rows[1][4]}`);
});

check("Sin responder no es «No»", () => {
  assert(answerLabel(true) === "Sí" && answerLabel(false) === "No",
    "las respuestas no se etiquetan");
  assert(answerLabel(undefined) === "",
    "una pregunta sin responder se exporta como «No»: eso inventa un dato");
});

check("El escritor de .xlsx produce un ZIP con sus partes", () => {
  const buf = buildXlsx(workbookSheets(datos()));
  assert(buf.length > 500, "el libro salió vacío");
  assert(buf[0] === 0x50 && buf[1] === 0x4b, "no empieza por la firma de un ZIP");
  // Determinista: los mismos datos, los mismos bytes.
  const otro = buildXlsx(workbookSheets(datos()));
  assert(buf.equals(otro), "dos libros con los mismos datos salen distintos");
  // Y los nombres de columna pasan de la Z, que con 52 preguntas hace falta.
  assert(columnName(0) === "A" && columnName(25) === "Z" && columnName(26) === "AA"
      && columnName(51) === "AZ", "la numeración de columnas se rompe pasada la Z");
  assert(sheetName("Con / barra : y más de treinta y un caracteres").length <= 31,
    "un nombre de hoja inválido haría que Excel se niegue a abrir el fichero");
});

check("Y OTRA implementación lo abre: zip + XML, desde Python", () => {
  /*
    Que el fichero lo lea el mismo código que lo escribió no demuestra nada.
    Esto lo abre con `zipfile` y `ElementTree` —otro lenguaje, otra
    implementación de ZIP, ni una línea compartida— y comprueba que las partes
    están, que el XML parsea y que los valores llegaron donde tenían que
    llegar. Si Python no está, se dice y no se finge una comprobación.
  */
  let python = true;
  try { execFileSync("python3", ["-c", "import zipfile"], { stdio: "ignore" }); }
  catch { python = false; }
  if (!python) { console.log("      (sin python3: se omite la lectura independiente)"); return; }

  const d = datos(4);
  const dir = mkdtempSync(join(tmpdir(), "tz-xlsx-"));
  const ruta = join(dir, "prueba.xlsx");
  writeFileSync(ruta, buildXlsx(workbookSheets(d)));

  const guion = `
import sys, zipfile, json
import xml.etree.ElementTree as ET
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, 'zip corrupto'
partes = set(z.namelist())
for p in ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
          'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']:
    assert p in partes, 'falta ' + p
wb = ET.fromstring(z.read('xl/workbook.xml'))
hojas = [s.get('name') for s in wb.findall('.//m:sheet', NS)]
def valores(i):
    r = ET.fromstring(z.read('xl/worksheets/sheet%d.xml' % i))
    out = []
    for fila in r.findall('.//m:row', NS):
        celdas = []
        for c in fila:
            if c.get('t') == 'inlineStr':
                n = c.find('m:is/m:t', NS)
                celdas.append(n.text if n is not None else '')
            else:
                v = c.find('m:v', NS)
                celdas.append(v.text if v is not None else '')
        out.append(celdas)
    return out
print(json.dumps({'hojas': hojas,
                  'resumen': valores(1)[:4],
                  'respuestas_filas': len(valores(3)),
                  'primera_respuesta': valores(3)[1]}))
`;
  const salida = execFileSync("python3", ["-c", guion, ruta], { encoding: "utf8" });
  const leido = JSON.parse(salida) as {
    hojas: string[]; resumen: string[][]; respuestas_filas: number;
    primera_respuesta: string[];
  };
  assert(JSON.stringify(leido.hojas)
      === JSON.stringify(["Resumen", "Participantes", "Respuestas", "Dimensiones"]),
    `otra implementación ve las hojas: ${leido.hojas.join(", ")}`);
  assert(leido.resumen[1][1] === "Convocatoria QA",
    `el nombre de la campaña llegó como «${leido.resumen[1][1]}»`);
  assert(leido.respuestas_filas === 2 * 4 + 1,
    `la hoja de respuestas se lee con ${leido.respuestas_filas} filas`);
  assert(leido.primera_respuesta[5] === d.questions[0].text,
    `el texto de la pregunta llegó como «${leido.primera_respuesta[5]}»`);
  assert(["Sí", "No"].includes(leido.primera_respuesta[6]),
    `la respuesta llegó como «${leido.primera_respuesta[6]}»`);
});

console.log("\nF · La puerta de la administración");
// ===========================================================================

check("Las dos rutas de exportación comprueban en SERVIDOR", () => {
  for (const [nombre, src] of [["CSV", RUTA_CSV], ["Excel", RUTA_XLSX]] as const) {
    assert(/requireSession\(\)/.test(src), `la ruta ${nombre} no exige sesión`);
    assert(/isSuperadmin/.test(src) && /status: 403/.test(src),
      `la ruta ${nombre} no exige superadministración`);
    assert(!/redirect\(/.test(src),
      `la ruta ${nombre} redirige: quien pide un fichero se descargaría el HTML de otra página`);
  }
});

check("Y ver a los participantes también", () => {
  const i = ACCIONES.indexOf("export async function listSubmissionsAction");
  const cuerpo = ACCIONES.slice(i, i + 700);
  assert(/requirePlatformStaff\(\)/.test(cuerpo), "no se exige equipo de plataforma");
  assert(/if \(!isSuperadmin\) return \{ page: null, canRead: false \}/.test(cuerpo),
    "no se exige superadministración para ver datos personales");
  // Y no hay cliente privilegiado: la RLS es la segunda capa.
  assert(!/createAdminClient/.test(DATOS),
    "la capa de datos usa el cliente de servicio y se salta la RLS");
});

check("La pantalla no enseña testigos", () => {
  for (const prohibido of ["token", "hash", "prefix"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`, "i").test(TABLA),
      `la tabla de participaciones pinta «${prohibido}»`);
  }
});

console.log("\nG · La puerta anónima, cerrada y declarada");
// ===========================================================================

check("0202 declara nueve funciones y tres relaciones, y nada más", () => {
  const permitidas = [...SQL0202.matchAll(/^\s*\('([a-z_]+)'\)[,;]/gm)].map((m) => m[1]);
  assert(permitidas.length === 9, `se declaran ${permitidas.length} funciones`);
  for (const f of ["public_diagnostic_resolve_campaign", "public_diagnostic_begin_submission",
                   "public_diagnostic_get_assessment", "public_diagnostic_save_progress",
                   "public_diagnostic_get_result", "public_diagnostic_resume_submission",
                   "quality_resolve_survey_token", "quality_submit_survey_response",
                   "resolve_textile_passport_share"]) {
    assert(permitidas.includes(f), `falta declarar ${f}`);
  }
  assert(/revoke all on all tables in schema public from anon/.test(SQL0202),
    "no se retiran las tablas");
  const concesiones = [...SQL0202.matchAll(/grant select on public\.(\w+)\s+to anon/g)]
    .map((m) => m[1]).sort();
  assert(JSON.stringify(concesiones)
      === JSON.stringify(["legal_documents", "v_faq_public", "v_faq_public_categories"]),
    `relaciones concedidas: ${concesiones.join(", ")}`);
});

check("Y corta el grifo para lo que nazca mañana", () => {
  assert(/alter default privileges in schema public revoke all on tables from anon/.test(SQL0202),
    "las tablas futuras seguirían naciendo abiertas");
  assert(/alter default privileges in schema public revoke execute on functions from anon/
    .test(SQL0202), "las funciones futuras seguirían naciendo abiertas");
  // Y una política de PERSONAL deja de dirigirse a todo el mundo.
  assert(/create policy legal_documents_staff_select on public\.legal_documents\s+for select to authenticated/
    .test(SQL0202), "la política de personal sigue apuntando a `public`");
});

console.log("\nH · Y el aviso de 01G");
// ===========================================================================

check("Antes de repetir se avisa de que se puede perder el resultado a la vista", () => {
  assert(/este navegador pasará a mostrar el resultado/i.test(INFORME),
    "no se avisa de que el navegador pasará a mostrar el nuevo");
  assert(/imprímelo o\s+guárdalo antes de continuar/i.test(INFORME.replace(/\s+/g, " "))
      || /imprímelo o guárdalo antes de continuar/i.test(INFORME.replace(/\s+/g, " ")),
    "no se dice cómo conservar una copia");
});

check("El nombre del archivo no sorprende a ningún sistema de archivos", () => {
  assert(exportFilename("qa-humo", "csv") === "diagnostico-qa-humo.csv",
    "el nombre no sigue el patrón");
  assert(!/[/\\]/.test(exportFilename("../../etc/passwd", "xlsx")),
    "un slug con rutas se cuela en el nombre del archivo");
});

console.log(`\nPUBLIC-DIAGNOSTICS-01H · administración y exportación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
