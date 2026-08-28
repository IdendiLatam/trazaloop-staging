/**
 * Trazaloop · PT-01 · CABLEADO · Evidence Integrity & Scale.
 *
 * QUÉ COMPRUEBA ESTA SUITE Y QUÉ NO
 *
 * No comprueba que la paginación funcione: eso se demuestra contra PostgREST
 * real con 1 200 filas en `test:pcr-textiles-scale-rls`, y con menos de mil no
 * se puede demostrar nada porque el corte no llega a producirse.
 *
 * Lo que comprueba es lo OTRO, que es donde este tipo de arreglo se pierde:
 * que las pantallas y los exportadores estén CONECTADOS a las lecturas nuevas.
 * Una primitiva correcta que nadie usa deja el fallo exactamente donde estaba,
 * y una prueba que invoca la función directamente no lo detecta.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_TYPE_OPTIONS,
  canonicalEvidenceType,
  evidenceTypeDisplay,
  isEvidenceApplicableAt,
  isEvidenceExpiredNow,
  evidenceValidityLabel,
  SUPPORTED_EVIDENCE_TARGETS,
  UNSUPPORTED_EVIDENCE_TARGETS,
} from "@/lib/domain/evidence-governance";
import { DEFAULT_PAGE_SIZE, TRAVERSAL_CHUNK, pageRange, clampPage } from "@/lib/domain/pagination";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

console.log("\nPT-01 · Evidence Integrity & Scale · cableado\n");

// ---------------------------------------------------------------------------
// A · El tipo de evidencia sale de UN sitio
// ---------------------------------------------------------------------------

check("A1. Los tres formularios y el filtro beben de la misma lista", () => {
  const digital = read("components/domain/evidences/forms.tsx");
  const fisico = read("components/domain/evidences/physical-forms.tsx");
  const lista = read("app/(app)/(shell)/(cpr)/evidences/page.tsx");

  // El digital era un campo de TEXTO LIBRE. Ese es el fallo original.
  assert(!/name="evidence_type"[\s\S]{0,120}hint=/.test(digital),
    "el formulario digital sigue teniendo un campo de texto libre para el tipo");
  assert(digital.includes("EVIDENCE_TYPE_OPTIONS"),
    "el formulario digital debía alimentarse del catálogo canónico");
  assert(fisico.includes("EVIDENCE_CATEGORIES") || fisico.includes("EVIDENCE_TYPE_OPTIONS"),
    "el formulario físico debía seguir alimentándose del catálogo");
  assert(lista.includes("EVIDENCE_CATEGORIES"),
    "el filtro de la lista debía alimentarse del catálogo");
});

check("A2. Lo que ofrece el formulario es exactamente lo que filtra la lista", () => {
  // Es la comprobación que reproduce el fallo: si las dos listas divergen,
  // vuelve a haber evidencias invisibles al filtro.
  const ofrecidos = EVIDENCE_TYPE_OPTIONS.map((o) => o.value).sort();
  const filtrados = [...EVIDENCE_CATEGORIES].sort();
  assert(JSON.stringify(ofrecidos) === JSON.stringify(filtrados),
    `el selector ofrece ${ofrecidos.join(",")} y el filtro usa ${filtrados.join(",")}`);
});

check("A3. Un valor legacy se enseña TAL CUAL y marcado", () => {
  const d = evidenceTypeDisplay("record");
  assert(d.label === "record", "un valor desconocido debía mostrarse literal");
  assert(d.uncatalogued, "y debía quedar marcado como no catalogado");
  const conocido = evidenceTypeDisplay("origin_supplier");
  assert(conocido.label === "Origen / proveedor" && !conocido.uncatalogued,
    "un valor del catálogo debía mostrar su etiqueta sin marca");
  assert(evidenceTypeDisplay(null).label === "Sin tipo", "sin tipo se dice así");
});

check("A4. Solo se traducen los alias INEQUÍVOCOS", () => {
  assert(canonicalEvidenceType("Declaración de proveedor") === "origin_supplier",
    "un alias inequívoco debía traducirse");
  // `record` podría ser de recepción, de control o de producción. Elegir uno
  // sería inventarse el dato de otra persona.
  assert(canonicalEvidenceType("record") === null,
    "un valor ambiguo NO debe traducirse");
  assert(canonicalEvidenceType("origin_supplier") === "origin_supplier", "lo canónico se devuelve igual");
  assert(canonicalEvidenceType(null) === null, "sin valor, no hay traducción");
});

// ---------------------------------------------------------------------------
// B · Vigencia: el presente y la historia son preguntas distintas
// ---------------------------------------------------------------------------

check("B1. El catálogo mira HOY; la aplicabilidad mira la fecha del lote", () => {
  assert(isEvidenceExpiredNow("2020-01-01", "2026-08-28"), "vencida hoy");
  assert(!isEvidenceExpiredNow(null, "2026-08-28"),
    "sin vencimiento declarado NO es lo mismo que vencida");
  // La misma evidencia, juzgada contra la operación que amparaba.
  assert(isEvidenceApplicableAt({ validUntil: "2020-01-01" }, "2019-06-01"),
    "debía amparar una operación de cuando estaba vigente (PT-F03)");
  assert(!isEvidenceApplicableAt({ validUntil: "2020-01-01" }, "2021-06-01"),
    "no debía amparar una operación posterior a su vencimiento");
});

check("B2. `valid_until` es INCLUSIVO, y en un solo sitio", () => {
  assert(isEvidenceApplicableAt({ validUntil: "2026-06-30" }, "2026-06-30"),
    "el propio día de vencimiento cuenta");
  assert(!isEvidenceExpiredNow("2026-06-30", "2026-06-30"),
    "y el catálogo dice lo mismo: ese día todavía está vigente");
  // La base usa la misma semántica: `valid_until < referencia` rechaza.
  const mig = read("supabase/migrations/0142_evidence_catalog_and_historical_truth.sql");
  assert(/v_ev\.valid_until\s*<\s*v_ref/.test(mig),
    "la base debía usar `<` (inclusivo), igual que el dominio");
});

check("B3. La etiqueta del catálogo distingue los tres casos", () => {
  assert(evidenceValidityLabel(null, "2026-08-28") === "Sin vencimiento declarado", "sin fecha");
  assert(evidenceValidityLabel("2027-01-01", "2026-08-28").startsWith("Vigente"), "futura");
  assert(evidenceValidityLabel("2020-01-01", "2026-08-28").startsWith("Obsoleta"), "pasada");
});

// ---------------------------------------------------------------------------
// C · La asociación pasa por la puerta, y la puerta está en la base
// ---------------------------------------------------------------------------

check("C1. La acción de servidor llama a la RPC y no inserta a mano", () => {
  const acc = read("server/actions/evidences.ts");
  assert(acc.includes("evidence_link_confirm"), "debía llamar a la RPC de confirmación");
  assert(!/from\("evidence_links"\)\s*\.insert/.test(acc),
    "quedó un insert directo: la guarda se puede rodear");
  assert(/p_confirmed:\s*confirmed/.test(acc),
    "la confirmación humana debía viajar explícita, no por defecto");
});

check("C2. La migración RETIRA la política de insert", () => {
  // Sin esto la RPC es una recomendación: cualquiera con sesión escribe la
  // fila a mano, sin confirmar, sin vigencia y sin snapshot.
  const mig = read("supabase/migrations/0142_evidence_catalog_and_historical_truth.sql");
  assert(/drop policy if exists evidence_links_insert/.test(mig),
    "la política de insert debía retirarse");
  assert(/security definer/i.test(mig), "la RPC debía ser security definer");
});

check("C3. Los dos formularios de asociación piden confirmación", () => {
  for (const f of ["components/domain/evidences/forms.tsx",
                   "components/domain/traceability/action-button.tsx"]) {
    const src = read(f);
    assert(src.includes("ConfirmDialog"), `${f} debía confirmar antes de escribir`);
    assert(/name="confirmed"/.test(src), `${f} debía enviar la confirmación como campo`);
    // Cancelar no puede escribir: el campo vale "" mientras el diálogo no se
    // confirme, y la base rechaza sin él.
    assert(/value=\{confirming \? "1" : ""\}/.test(src),
      `${f}: el campo de confirmación debía depender del diálogo`);
    assert(/type="button"/.test(src), `${f}: el botón no puede enviar directamente`);
  }
});

check("C4. El selector solo ofrece evidencias asociables", () => {
  const pagina = read("app/(app)/(shell)/(cpr)/evidences/page.tsx");
  assert(/\.eq\("status", "valid"\)/.test(pagina) && /\.is\("archived_at", null\)/.test(pagina),
    "la página debía traer solo aceptadas y sin archivar");
  const form = read("components/domain/evidences/forms.tsx");
  assert(form.includes("isEvidenceApplicableAt"),
    "el formulario debía descartar las no vigentes en la fecha del destino");
  assert(/referenceDate/.test(form), "los destinos debían viajar con su fecha empresarial");
});

check("C5. Los destinos declarados y los soportados no se confunden", () => {
  assert(SUPPORTED_EVIDENCE_TARGETS.length === 9, "el disparador resuelve nueve destinos");
  assert(UNSUPPORTED_EVIDENCE_TARGETS.includes("document"),
    "`document` está en el enum y NO se soporta: eso costó un sprint en 12.2D");
  const mig = read("supabase/migrations/0142_evidence_catalog_and_historical_truth.sql");
  for (const t of SUPPORTED_EVIDENCE_TARGETS) {
    assert(mig.includes(`when '${t}'`), `el disparador debía resolver ${t}`);
  }
});

// ---------------------------------------------------------------------------
// D · Archivar deja de ofrecerse, sin borrar nada
// ---------------------------------------------------------------------------

check("D1. No se puede archivar desde la interfaz; desarchivar sí", () => {
  const g = read("components/domain/evidences/governance-actions.tsx");
  assert(!/>\s*\{?archiving \? "Guardando…" : archived \? "Desarchivar" : "Archivar"\}?/.test(g),
    "el botón seguía ofreciendo archivar");
  assert(g.includes('"Desarchivar"'), "desarchivar debía conservarse");
  assert(/canReview && archived \?/.test(g),
    "y solo debía aparecer cuando la fila YA está archivada");
});

check("D2. Nada del histórico se borra", () => {
  const mig = read("supabase/migrations/0142_evidence_catalog_and_historical_truth.sql");
  assert(!/drop column[^;]*archived_at/i.test(mig), "no se puede eliminar archived_at");
  assert(!/update public\.evidences/i.test(mig), "0142 no debe reescribir ninguna fila");
  assert(!/\bdelete from\b/i.test(mig), "0142 no debe borrar nada");
  const gob = read("lib/domain/evidence-governance.ts");
  assert(gob.includes("EVIDENCE_ARCHIVED_LABEL"), "las archivadas se siguen etiquetando");
});

check("D3. En Textiles, «Archivada» deja de ofrecerse y se sigue viendo", () => {
  const dom = read("lib/domain/textiles-evidences.ts");
  assert(dom.includes("TEXTILE_EVIDENCE_OFFERED_STATUSES"), "debía existir la lista ofrecida");
  assert(/archived: "Archivada"/.test(dom), "la etiqueta debía conservarse");
  const panel = read("components/domain/textiles/evidence-status-panel.tsx");
  assert(panel.includes("TEXTILE_EVIDENCE_OFFERED_STATUSES"),
    "el panel debía usar la lista ofrecida, no todos los estados");
});

// ---------------------------------------------------------------------------
// E · Escala: el cableado (el comportamiento se prueba con 1 200 filas reales)
// ---------------------------------------------------------------------------

/** Las listas de Textiles que la pantalla enseña paginadas. */
const PANTALLAS_PAGINADAS: Array<[string, string]> = [
  ["app/(app)/(shell)/textiles/catalogs/suppliers/page.tsx", "searchTextileSuppliers"],
  ["app/(app)/(shell)/textiles/catalogs/materials/page.tsx", "searchTextileMaterials"],
  ["app/(app)/(shell)/textiles/catalogs/components/page.tsx", "searchTextileComponents"],
  ["app/(app)/(shell)/textiles/catalogs/processes/page.tsx", "searchTextileProcesses"],
  ["app/(app)/(shell)/textiles/catalogs/outsourced-processes/page.tsx", "searchTextileOutsourcedProcesses"],
  ["app/(app)/(shell)/textiles/products/page.tsx", "searchTextileProducts"],
  ["app/(app)/(shell)/textiles/products/collections/page.tsx", "searchTextileCollections"],
  ["app/(app)/(shell)/textiles/traceability/input-lots/page.tsx", "searchTextileInputLots"],
  ["app/(app)/(shell)/textiles/traceability/orders/page.tsx", "searchTextileProductionOrders"],
  ["app/(app)/(shell)/textiles/traceability/output-lots/page.tsx", "searchTextileOutputLots"],
  ["app/(app)/(shell)/textiles/evidences/page.tsx", "searchTextileEvidences"],
];

check("E1. Toda pantalla de lista textil pide UNA página, no el conjunto", () => {
  for (const [f, fn] of PANTALLAS_PAGINADAS) {
    const src = read(f);
    assert(src.includes(fn), `${f} no usa ${fn}`);
    assert(src.includes("ListPagination"), `${f} no ofrece paginación`);
    assert(src.includes("ListSearchForm"), `${f} no ofrece búsqueda`);
    assert(/total\b/.test(src), `${f} no enseña el total del conjunto`);
  }
});

check("E2. Ninguna de esas pantallas filtra en memoria", () => {
  // `fetch page → filter in JS` devuelve «los resultados de la página uno»,
  // que se parece lo bastante a «los resultados» como para que nadie lo note.
  for (const [f] of PANTALLAS_PAGINADAS) {
    const src = read(f);
    assert(!/\brows\.filter\(|\.filter\(\(\w+\) =>[^)]*includes\(/.test(src),
      `${f} filtra en memoria sobre la página ya leída`);
  }
});

check("E3. Las lecturas COMPLETAS recorren y lanzan si no pueden", () => {
  // Un desplegable al que le faltan opciones no se distingue de uno completo.
  for (const f of ["lib/db/textiles-catalogs.ts", "lib/db/textiles-products.ts",
                   "lib/db/textiles-traceability.ts", "lib/db/textiles-evidences.ts",
                   "lib/db/catalog.ts", "lib/db/traceability.ts"]) {
    const src = read(f);
    assert(src.includes("readAllStrict"), `${f} no usa el lector estricto`);
  }
  const pr = read("lib/db/paged-read.ts");
  assert(/throw new Error\(/.test(pr), "readAllStrict debía lanzar ante una lectura incompleta");
});

check("E4. Cada vuelta del recorrido construye una consulta NUEVA", () => {
  // Un builder de Supabase no es reutilizable: aplicarle `.range()` dos veces
  // sobrescribe el rango y el recorrido devolvería la primera página siempre.
  for (const f of ["lib/db/textiles-catalogs.ts", "lib/db/textiles-products.ts",
                   "lib/db/textiles-traceability.ts", "lib/db/textiles-evidences.ts",
                   "lib/db/catalog.ts", "lib/db/traceability.ts"]) {
    const src = read(f);
    assert(!/readAllStrict<[^>]*>\(\(\) => (query|req|request)[,)]/.test(src),
      `${f} reutiliza un builder ya construido en el recorrido`);
  }
});

check("E5. El recorrido pide lotes por DEBAJO del tope de PostgREST", () => {
  // Pedir 1 000 exactos deja sin saber si el último lote fue el final o el
  // corte. Con menos, una respuesta corta significa siempre «se acabó».
  const config = read("supabase/config.toml");
  const cap = Number(/max_rows\s*=\s*(\d+)/.exec(config)?.[1] ?? 0);
  assert(cap === 1000, `se esperaba max_rows = 1000, hay ${cap}`);
  assert(TRAVERSAL_CHUNK < cap, `el lote (${TRAVERSAL_CHUNK}) debe ser menor que el tope (${cap})`);
});

check("E6. Los exportadores no consultan la base por su cuenta", () => {
  // Si un adaptador leyera directo volvería a heredar el corte.
  for (const f of ["lib/export/adapters/textiles.ts", "lib/export/adapters/textiles-extended.ts",
                   "lib/export/adapters/cpr.ts", "lib/export/adapters/cpr-extended.ts"]) {
    const src = read(f);
    assert(!/\.from\("/.test(src), `${f} consulta la base directamente y hereda el corte`);
  }
});

check("E7. La aritmética de paginación es la primitiva compartida", () => {
  assert(DEFAULT_PAGE_SIZE === 20, "el tamaño por defecto cambió sin avisar");
  assert(pageRange(1, 20).from === 0 && pageRange(1, 20).to === 19, "la primera página");
  assert(pageRange(3, 20).from === 40 && pageRange(3, 20).to === 59, "la tercera");
  // Pedir una página que ya no existe devuelve la última, no un vacío.
  assert(clampPage(99, 45, 20) === 3, "una página fuera de rango debía caer en la última");
  const pr = read("lib/db/paged-read.ts");
  assert(pr.includes("clampPage"), "el lector debía reencuadrar la página fuera de rango");
});

check("E8. El orden de la consulta es tenant → filtros → búsqueda → count → order → range", () => {
  const src = read("lib/db/textiles-catalogs.ts");
  const fn = src.slice(src.indexOf("export async function searchTextileSuppliers"));
  const cuerpo = fn.slice(0, fn.indexOf("\n}"));
  const iOrg = cuerpo.indexOf('eq("organization_id"');
  const iBusca = cuerpo.indexOf("ilike(");
  const iCount = cuerpo.indexOf('count: "exact"');
  const iOrder = cuerpo.indexOf(".order(");
  const iRange = cuerpo.indexOf(".range(");
  assert(iOrg >= 0 && iBusca > iOrg, "la búsqueda va después del inquilino");
  assert(iCount >= 0, "debía pedirse el total exacto");
  assert(iOrder > iBusca && iRange > iOrder, "el rango va el último, tras ordenar");
});

check("E9. El orden de las páginas es ESTABLE", () => {
  // Con `created_at` a secas, dos filas del mismo instante pueden repetirse en
  // una página y faltar en la siguiente, con el total correcto.
  for (const f of ["lib/db/textiles-traceability.ts", "lib/db/textiles-evidences.ts"]) {
    const src = read(f);
    // Las lecturas con `.limit(n)` explícito son cotas DELIBERADAS —trabajos de
    // limpieza que piden «los n más antiguos»— y no listados que se recorran.
    // Ahí el orden no necesita desempate porque no hay página siguiente.
    const sinCotaExplicita = src
      .split("\n")
      .filter((_l, i, arr) => !/\.limit\(/.test(arr.slice(i, i + 4).join("\n")))
      .join("\n");
    const porFecha = (sinCotaExplicita.match(/\.order\("created_at"[^)]*\)/g) ?? []).length;
    const conDesempate =
      (sinCotaExplicita.match(/\.order\("created_at"[^)]*\)\s*\.order\("(id|output_lot_id)"/g) ?? []).length;
    assert(conDesempate === porFecha,
      `${f}: ${porFecha - conDesempate} orden(es) por created_at sin desempate por id`);
  }
});

// ---------------------------------------------------------------------------
// F · La migración es aditiva
// ---------------------------------------------------------------------------

check("F1. 0142 es la siguiente y no toca ninguna anterior", () => {
  const m = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  assert(m.includes("0142_evidence_catalog_and_historical_truth.sql"), "0142 debía existir");
  const i = m.indexOf("0142_evidence_catalog_and_historical_truth.sql");
  assert(m[i - 1] === "0141_intelligence_platform_visibility.sql", "0142 debía ir tras 0141");
});

check("F2. Las columnas del snapshot son NULLABLE y no hay backfill", () => {
  const mig = read("supabase/migrations/0142_evidence_catalog_and_historical_truth.sql");
  assert(!/not null/i.test(mig.slice(mig.indexOf("alter table public.evidence_links"),
                                     mig.indexOf("comment on column"))),
    "una columna NOT NULL rompería las filas anteriores a la migración");
  assert(/confirmed_at IS NULL|confirmed_at.*NULL en las filas anteriores/i.test(mig),
    "debía decirse que las filas legacy se quedan sin confirmación");
});

check("F3. La reversión está documentada", () => {
  const mig = read("supabase/migrations/0142_evidence_catalog_and_historical_truth.sql");
  assert(/REVERSI[ÓO]N/i.test(mig), "toda migración de este sprint documenta su vuelta atrás");
  assert(/create policy evidence_links_insert/.test(mig),
    "la reversión debía incluir cómo restaurar la política retirada");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
