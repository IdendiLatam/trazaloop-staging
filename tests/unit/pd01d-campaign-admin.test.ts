/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01D · Administración de campañas.
 *
 *
 * QUÉ SE DEFIENDE AQUÍ
 *
 * Una campaña pública se abre UNA vez y la ve mucha gente de fuera. Abrirla a
 * medias —sin instrumento publicado, sin texto de consentimiento, con las
 * fechas al revés— no da un error: da una convocatoria rota delante de un socio
 * institucional. Por eso la decisión de «está lista» es una función pura y se
 * prueba caso a caso, incluidos los que en producción no queremos ver nunca.
 *
 * Y por eso el ciclo de vida es una lista cerrada y no un desplegable: reabrir
 * una campaña cerrada mezcla en el mismo conjunto de datos a quien respondió
 * dentro del plazo y a quien respondió después, y eso ya no se separa al
 * analizar.
 *
 * Correr: npm run test:pd01d
 */
import { readFileSync } from "node:fs";
import {
  CAMPAIGN_TRANSITIONS, campaignAvailability, canTransition,
  evaluateCampaignReadiness, isValidCampaignSlug, publicCampaignUrl,
  suggestCampaignSlug, transitionDeniedMessage,
} from "../../lib/domain/public-diagnostics";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/[^\n]*/g, "$1");

const LISTA = {
  name: "Cámara XXXX · PCR 2026",
  slug: "camara-xxxx-pcr-2026",
  diagnosticVersionId: "v1",
  diagnosticVersionStatus: "published" as const,
  consentDocumentId: "doc1",
  consentContentHash: "abc123",
  opensAt: "2026-10-01T00:00:00.000Z",
  closesAt: "2026-11-01T00:00:00.000Z",
};

console.log("\nA · Preparación: qué impide abrir");
// ===========================================================================

check("Una campaña completa está lista", () => {
  const r = evaluateCampaignReadiness(LISTA);
  assert(r.ready, `no está lista: ${r.blockers.join(" ")}`);
  assert(r.blockers.length === 0, "hay bloqueos en una campaña completa");
});

check("F. Sin versión publicada NO abre, y se dice por qué", () => {
  const borrador = evaluateCampaignReadiness({ ...LISTA, diagnosticVersionStatus: "draft" });
  assert(!borrador.ready, "abrió contra un borrador");
  assert(borrador.blockers.some((b) => /borrador/i.test(b)),
    `el bloqueo no explica nada: ${borrador.blockers.join(" ")}`);
  const retirada = evaluateCampaignReadiness({ ...LISTA, diagnosticVersionStatus: "retired" });
  assert(!retirada.ready, "abrió contra una versión retirada");
  const sin = evaluateCampaignReadiness({ ...LISTA, diagnosticVersionId: null });
  assert(!sin.ready, "abrió sin instrumento");
});

check("G. Sin documento de consentimiento NO abre", () => {
  const r = evaluateCampaignReadiness({ ...LISTA, consentDocumentId: null });
  assert(!r.ready, "abrió sin documento de consentimiento");
  assert(r.blockers.some((b) => /consentimiento/i.test(b)),
    "el bloqueo no nombra el consentimiento");
  // Y no se inventa uno: es bloqueo, no aviso.
  assert(!r.warnings.some((w) => /consentimiento/i.test(w) && /falta/i.test(w)),
    "la falta de consentimiento se degradó a simple aviso");
});

check("H. Fechas al revés impiden abrir", () => {
  const r = evaluateCampaignReadiness({
    ...LISTA, opensAt: "2026-11-01T00:00:00.000Z", closesAt: "2026-10-01T00:00:00.000Z" });
  assert(!r.ready, "abrió con la fecha de cierre antes de la de apertura");
  assert(r.blockers.some((b) => /posterior/i.test(b)), "el bloqueo no lo explica");
  const igual = evaluateCampaignReadiness({ ...LISTA, closesAt: LISTA.opensAt });
  assert(!igual.ready, "abrió con cierre igual a apertura");
  const mala = evaluateCampaignReadiness({ ...LISTA, opensAt: "no es una fecha" });
  assert(!mala.ready, "abrió con una fecha ilegible");
});

check("I. Y los bloqueos se distinguen de los avisos", () => {
  const sinCierre = evaluateCampaignReadiness({ ...LISTA, closesAt: null });
  assert(sinCierre.ready, "no tener fecha de cierre pasó a impedir abrir");
  assert(sinCierre.warnings.length > 0, "no se avisa de que quedará abierta indefinidamente");
  const sinHuella = evaluateCampaignReadiness({ ...LISTA, consentContentHash: null });
  assert(sinHuella.ready, "la falta de huella pasó a bloquear");
  assert(sinHuella.warnings.some((w) => /huella/i.test(w)), "no se avisa de la falta de huella");
});

check("Nombre y dirección pública también son requisito", () => {
  assert(!evaluateCampaignReadiness({ ...LISTA, name: "" }).ready, "abrió sin nombre");
  assert(!evaluateCampaignReadiness({ ...LISTA, slug: null }).ready, "abrió sin dirección");
  assert(!evaluateCampaignReadiness({ ...LISTA, slug: "Con Mayúsculas" }).ready,
    "abrió con una dirección que no cabe en una URL");
});

console.log("\nB · La dirección pública");
// ===========================================================================

check("D. Se valida con la MISMA forma que exige la base", () => {
  for (const bueno of ["camara-xxxx-pcr-2026", "abc", "a1-b2-c3"]) {
    assert(isValidCampaignSlug(bueno), `«${bueno}» debería valer`);
  }
  for (const malo of ["ab", "Con-Mayúsculas", "con espacios", "-empieza", "termina-",
                      "doble--guion", "acentós", "a".repeat(81)]) {
    assert(!isValidCampaignSlug(malo), `«${malo}» no debería valer`);
  }
  // Y la forma coincide con el CHECK de 0196: si divergieran, la pantalla mentiría.
  const sql = leer("supabase/migrations/0196_public_diagnostic_campaigns.sql");
  assert(/\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$/.test(sql),
    "la base ya no usa la misma forma de slug que la pantalla");
});

check("Se sugiere desde el nombre, sin tildes ni sorpresas", () => {
  assert(suggestCampaignSlug("Cámara de Comercio XXXX · PCR 2026")
    === "camara-de-comercio-xxxx-pcr-2026", suggestCampaignSlug("Cámara de Comercio XXXX · PCR 2026"));
  assert(isValidCampaignSlug(suggestCampaignSlug("  Ñandú   y   Más!!  ")),
    "la sugerencia produjo un slug inválido");
});

check("Y se muestra la dirección futura", () => {
  assert(publicCampaignUrl("https://www.trazaloop.com/", "abc-def")
    === "https://www.trazaloop.com/diagnostic/abc-def", "la URL prevista no cuadra");
});

console.log("\nC · Ciclo de vida");
// ===========================================================================

check("J/K/L. Borrador abre, abierta cierra, cerrada archiva", () => {
  assert(canTransition("draft", "open"), "un borrador no puede abrirse");
  assert(canTransition("open", "closed"), "una abierta no puede cerrarse");
  assert(canTransition("closed", "archived"), "una cerrada no puede archivarse");
});

check("M/N. Cerrada NO reabre y archivada NO revive", () => {
  assert(!canTransition("closed", "open"), "una campaña cerrada se pudo reabrir");
  assert(!canTransition("archived", "open"), "una campaña archivada se pudo reabrir");
  assert(!canTransition("archived", "closed"), "una archivada cambió de estado");
  assert(CAMPAIGN_TRANSITIONS.archived.length === 0, "archivada dejó de ser terminal");
  // Y se explica POR QUÉ, que es lo que evita que alguien lo pida otra vez.
  const m = transitionDeniedMessage("closed", "open");
  assert(/mezclad|plazo/i.test(m), `el motivo no se explica: «${m}»`);
  assert(/campaña nueva/i.test(m), "no se ofrece la salida (crear otra campaña)");
});

check("No hay ningún salto que se cuele", () => {
  const estados = ["draft", "open", "closed", "archived"] as const;
  const permitidos = new Set(["draft→open", "draft→archived", "open→closed", "closed→archived"]);
  for (const a of estados) for (const b of estados) {
    if (a === b) continue;
    assert(canTransition(a, b) === permitidos.has(`${a}→${b}`),
      `la transición ${a}→${b} no coincide con lo declarado`);
  }
});

console.log("\nD · Estado no es lo mismo que disponibilidad");
// ===========================================================================

check("Una campaña abierta puede no estar recibiendo todavía", () => {
  const ahora = new Date("2026-10-15T00:00:00.000Z");
  assert(campaignAvailability("open", "2026-11-01T00:00:00.000Z", null, ahora) === "scheduled",
    "una campaña que aún no empieza figura como disponible");
  assert(campaignAvailability("open", "2026-10-01T00:00:00.000Z", "2026-10-10T00:00:00.000Z", ahora)
    === "window_closed", "una ventana terminada figura como disponible");
  assert(campaignAvailability("open", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z", ahora)
    === "available", "una campaña en ventana no figura como disponible");
  assert(campaignAvailability("draft", null, null, ahora) === "not_open", "un borrador figura abierto");
  assert(campaignAvailability("closed", null, null, ahora) === "closed", "una cerrada no figura cerrada");
});

console.log("\nE · La superficie administrativa");
// ===========================================================================

const ACCIONES = sinComentarios(leer("server/actions/public-diagnostics-admin.ts"));

check("P. Toda acción de escritura exige superadministración", () => {
  for (const a of ["createCampaignAction", "updateCampaignAction", "transicionar"]) {
    const i = ACCIONES.indexOf(`function ${a}`);
    assert(i > 0, `falta ${a}`);
    const cuerpo = ACCIONES.slice(i, i + 900);
    assert(/requirePlatformStaff\(\)/.test(cuerpo), `${a} no exige plataforma`);
    assert(/if \(!isSuperadmin\) return \{ error: NO_AUTORIZADO \}/.test(cuerpo),
      `${a} no exige superadministración`);
  }
});

check("Y no se fía de lo que llega del formulario", () => {
  // La versión y el documento llegan del navegador: se comprueban contra lo
  // que de verdad se puede elegir, no se insertan tal cual.
  assert(/versiones\.some\(\(v\) => v\.id === versionId\)/.test(ACCIONES),
    "la versión del formulario se acepta sin comprobar");
  assert(/const docs = await listConsentDocuments\(\)/.test(ACCIONES),
    "la huella del consentimiento no se resuelve en el servidor");
  assert(!/consent_content_hash: texto\(formData/.test(ACCIONES),
    "la huella del consentimiento llega del formulario: sería falsificable");
});

check("Una campaña nace SIEMPRE en borrador", () => {
  const i = ACCIONES.indexOf("function createCampaignAction");
  const cuerpo = ACCIONES.slice(i, ACCIONES.indexOf("export async function", i + 10));
  assert(/status: "draft"/.test(cuerpo), "la creación no fija el estado en borrador");
  assert(!/status: texto\(formData/.test(cuerpo),
    "el estado llega del formulario: abrir dejaría de ser un acto aparte");
});

check("Abrir vuelve a comprobar la preparación en el servidor", () => {
  const i = ACCIONES.indexOf("async function transicionar");
  const cuerpo = ACCIONES.slice(i);
  assert(/evaluateCampaignReadiness/.test(cuerpo),
    "abrir no comprueba la preparación: bastaría con reactivar el botón");
  assert(/canTransition\(campaña\.status, destino\)/.test(cuerpo),
    "no se valida la transición en el servidor");
});

check("No se ofrece borrar campañas", () => {
  for (const f of ["server/actions/public-diagnostics-admin.ts",
                   "components/domain/public-diagnostics/campaign-forms.tsx",
                   "app/(app)/platform/public-diagnostics/[campaignId]/page.tsx"]) {
    const src = sinComentarios(leer(f));
    assert(!/\.delete\(\)|deleteCampaign|Eliminar campaña|Borrar campaña/.test(src),
      `${f} ofrece borrar una campaña: se archiva, no se borra`);
  }
});

check("La dirección futura se enseña pero NO como enlace", () => {
  const det = sinComentarios(leer("app/(app)/platform/public-diagnostics/[campaignId]/page.tsx"));
  assert(/publicCampaignUrl/.test(det), "no se muestra la dirección prevista");
  assert(!/<Link[^>]*href=\{urlFutura\}|href=\{urlFutura\}/.test(det),
    "la dirección se ofrece como enlace y la ruta pública todavía no existe");
  assert(/Todav[íi]a no est[áa] publicada/.test(det), "no se dice que aún no existe");
});

check("Y el detalle todavía no enseña datos personales", () => {
  const det = sinComentarios(leer("app/(app)/platform/public-diagnostics/[campaignId]/page.tsx"));
  for (const pii of ["participant_name", "participantName", "participant_email",
                     "participantEmail", "participant_phone"]) {
    assert(!det.includes(pii), `el detalle muestra «${pii}»: eso es de otro tramo`);
  }
  const datos = sinComentarios(leer("lib/db/public-diagnostics.ts"));
  assert(!/participant_email|participant_name|participant_phone/.test(datos),
    "la capa de datos administrativa lee datos personales sin necesitarlos");
});

console.log("\nF · La ruta y su guarda");
// ===========================================================================

check("A/B. La pantalla vive en plataforma y pasa por su guarda", () => {
  const lista = sinComentarios(leer("app/(app)/platform/public-diagnostics/page.tsx"));
  assert(/listCampaignsAction/.test(lista), "la lista no usa la acción guardada");
  const i = ACCIONES.indexOf("function listCampaignsAction");
  const cuerpo = ACCIONES.slice(i, i + 500);
  assert(/requirePlatformStaff\(\)/.test(cuerpo), "listar no exige plataforma");
});

check("Y está en la navegación de plataforma", () => {
  const registro = leer("lib/modules/registry.ts");
  const i = registro.indexOf("PLATFORM_GROUP");
  const grupo = registro.slice(i, registro.indexOf("};", i));
  assert(/\/platform\/public-diagnostics/.test(grupo),
    "no hay entrada de navegación: solo se llegaría escribiendo la URL");
});

console.log("\nG · Auditoría, con lo que ya existe");
// ===========================================================================

check("Las campañas quedan auditadas por el disparador de siempre", () => {
  const sql = leer("supabase/migrations/0197_public_diagnostic_campaign_audit.sql");
  assert(/audit_row_change/.test(sql), "no se reutiliza la auditoría existente");
  assert(/after insert or update or delete on public\.public_diagnostic_campaigns/.test(sql),
    "el disparador no cubre creación, cambio y borrado");
  assert(!/insert into public\.audit_log/.test(ACCIONES),
    "las acciones escriben su propia auditoría: sería un segundo sistema");
  // Y las participaciones NO se auditan fila a fila: llevan datos personales.
  assert(!/on public\.public_diagnostic_submissions\s+for each row execute function public\.audit_row_change/
    .test(sql), "se auditan las participaciones, duplicando datos personales");
});

console.log(`\nPUBLIC-DIAGNOSTICS-01D · administración: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
