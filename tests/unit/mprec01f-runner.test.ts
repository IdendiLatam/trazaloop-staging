/**
 * Trazaloop · MP-REC-01C.3 · El barrido desatendido.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Que el barrido mire a quien debe y deje en paz a quien no. Son decisiones que
 * no lanzan errores cuando se equivocan: preguntarle al proveedor por un objeto
 * muerto no falla, solo gasta; y saltarse una suscripción viva tampoco falla,
 * solo deja a alguien pagando sin plan hasta que alguien lo note.
 *
 * La trampa concreta que obliga a escribirlo: Mercado Pago sigue devolviendo
 * `next_payment_date` en una preapproval CANCELADA. Está observado en Staging,
 * con la preapproval real que el usuario canceló a mano. Un barrido que buscara
 * «quién tiene cobro pendiente» por esa fecha volvería a preguntar para siempre.
 *
 * Correr: npm run test:mprec01f
 */
import { readFileSync } from "node:fs";
import {
  decideRunnerAction, emptySummary, countInto,
  type RunnerCandidate,
} from "../../lib/billing/recurring/runner-policy";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const AHORA = new Date("2026-09-20T00:00:00.000Z");
const FIN_FUTURO = "2026-10-16T22:47:38.000Z";
const FIN_PASADO = "2026-09-01T00:00:00.000Z";

const candidata = (o: Partial<RunnerCandidate> = {}): RunnerCandidate => ({
  subscriptionId: "sub-1",
  subscriptionStatus: "active",
  renewalMode: "provider",
  authorizationStatus: "authorized",
  hasProviderObject: true,
  paidThrough: FIN_FUTURO,
  upgradeInFlight: false,
  ...o,
});

console.log("\n1 · A QUIÉN SE LE PREGUNTA AL PROVEEDOR");

check("1A. Una recurrencia viva se concilia", () => {
  const v = decideRunnerAction(candidata(), AHORA);
  assert(v.action === "reconcile", `acción ${v.action}`);
  assert(v.lifecycleRefresh === "none", "propuso limpieza sin hacer falta");
});

check("1B. Una que espera autorización también", () => {
  // Todavía no pagó, pero el proveedor puede cobrar en cualquier momento: es
  // exactamente el caso que el 404 de la vuelta dejó colgado.
  const v = decideRunnerAction(candidata({
    subscriptionStatus: "pending", authorizationStatus: "awaiting_authorization",
    paidThrough: null }), AHORA);
  assert(v.action === "reconcile", `acción ${v.action}`);
});

check("1C. Una con la autorización CANCELADA no se consulta", () => {
  const v = decideRunnerAction(candidata({
    subscriptionStatus: "cancel_at_period_end", authorizationStatus: "cancelled" }),
    AHORA);
  assert(v.action === "skip_provider_cancelled", `acción ${v.action}`);
});

check("1D. Y da igual lo que el proveedor conserve como próxima fecha", () => {
  // LA TRAMPA. `next_payment_date` NO entra en esta decisión: ni siquiera es un
  // campo de la candidata. Que no se pueda pasar es la garantía.
  const campos = Object.keys(candidata());
  assert(!campos.some((k) => /next|payment_date|nextCharge/i.test(k)),
    `la decisión admite una fecha del proveedor: ${campos.join(", ")}`);
  const politica = leer("lib/billing/recurring/runner-policy.ts");
  const codigo = politica.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(!/next_payment_date|nextPaymentDate/.test(codigo),
    "la política del barrido mira la fecha que el proveedor conserva");
});

check("1E. El carril manual no se toca", () => {
  const v = decideRunnerAction(candidata({ renewalMode: "manual" }), AHORA);
  assert(v.action === "skip_not_provider_renewal", `acción ${v.action}`);
  assert(v.lifecycleRefresh === "none", "propuso tocar una manual");
});

check("1F. Una terminada no se mira, ni para limpiar", () => {
  const v = decideRunnerAction(candidata({ subscriptionStatus: "ended" }), AHORA);
  assert(v.action === "skip_ended" && v.lifecycleRefresh === "none",
    `acción ${v.action} / limpieza ${v.lifecycleRefresh}`);
});

check("1G. Sin objeto del proveedor no hay a quién preguntar", () => {
  const v = decideRunnerAction(candidata({ hasProviderObject: false }), AHORA);
  assert(v.action === "skip_no_provider_object", `acción ${v.action}`);
});

check("1H. Un estado tomado fuera —revisión, retiro— no se revisa solo", () => {
  for (const st of ["manual_review", "retired", "lapsed", "cancelled"]) {
    const v = decideRunnerAction(candidata({ subscriptionStatus: st }), AHORA);
    assert(v.action === "skip_ended", `«${st}» dio ${v.action}`);
  }
});

console.log("\n2 · LA LIMPIEZA, QUE ES OTRA COSA");

check("2A. Cancelada y vencida: hay que ponerla al día", () => {
  const v = decideRunnerAction(candidata({
    subscriptionStatus: "cancel_at_period_end", authorizationStatus: "cancelled",
    paidThrough: FIN_PASADO }), AHORA);
  assert(v.action === "skip_provider_cancelled", "la consultó igualmente");
  assert(v.lifecycleRefresh === "to_ended", `limpieza ${v.lifecycleRefresh}`);
});

check("2B. Cancelada con tiempo por delante: NO se termina todavía", () => {
  // Es el estado real de Staging. Cancelar no quita lo pagado.
  const v = decideRunnerAction(candidata({
    subscriptionStatus: "cancel_at_period_end", authorizationStatus: "cancelled",
    paidThrough: FIN_FUTURO }), AHORA);
  assert(v.lifecycleRefresh === "none",
    `propuso terminar una cancelada con tiempo pagado: ${v.lifecycleRefresh}`);
});

check("2C. Activa y vencida sin renovación: past_due", () => {
  const v = decideRunnerAction(candidata({ paidThrough: FIN_PASADO }), AHORA);
  assert(v.action === "reconcile", "dejó de preguntarle al proveedor");
  assert(v.lifecycleRefresh === "to_past_due", `limpieza ${v.lifecycleRefresh}`);
});

check("2D. Y la limpieza es INDEPENDIENTE de conciliar", () => {
  // Una cancelada no se concilia Y sí se limpia. Si fueran la misma decisión,
  // las filas muertas se quedarían mintiendo para siempre.
  const v = decideRunnerAction(candidata({
    subscriptionStatus: "cancel_at_period_end", authorizationStatus: "cancelled",
    paidThrough: FIN_PASADO }), AHORA);
  assert(v.action !== "reconcile" && v.lifecycleRefresh !== "none",
    "las dos responsabilidades quedaron atadas");
});

console.log("\n3 · EL RELOJ ENTRA POR PARÁMETRO");

check("3A. La misma fila decide distinto solo por la hora", () => {
  const c = candidata({ subscriptionStatus: "cancel_at_period_end",
                        authorizationStatus: "cancelled", paidThrough: FIN_FUTURO });
  const antes = decideRunnerAction(c, new Date("2026-10-16T22:47:37.000Z"));
  const despues = decideRunnerAction(c, new Date("2026-10-16T22:47:39.000Z"));
  assert(antes.lifecycleRefresh === "none", "terminó antes de tiempo");
  assert(despues.lifecycleRefresh === "to_ended", "no terminó al vencer");
});

console.log("\n4 · LA PUERTA DEL BARRIDO");

const RUTA = "app/api/billing/recurring/run/route.ts";

check("4A. Sin secreto, no existe", () => {
  const r = leer(RUTA);
  assert(/if \(!secreto \|\| secreto\.length < 16\) return noExiste\(\)/.test(r),
    "un secreto ausente o corto no cierra la puerta");
  assert(/timingSafeEqual/.test(r), "la comparación no es en tiempo constante");
  assert(/status: 404/.test(r),
    "se le confirma a un desconocido que la puerta existe");
});

check("4B. Jamás en Producción", () => {
  const r = leer(RUTA);
  assert(/VERCEL_ENV === "production"\) return noExiste\(\)/.test(r),
    "el barrido no se niega en Producción");
});

check("4C. Y el carril tiene que estar abierto", () => {
  const r = leer(RUTA);
  assert(/resolveRecurringLane\(\)/.test(r),
    "no consulta la política del carril");
});

check("4D. Una sesión de usuario no abre esta puerta", () => {
  const r = leer(RUTA);
  for (const prohibido of ["requireActiveOrg", "requireSession", "createServerClient",
                           "checkPlatformStatus"]) {
    assert(!new RegExp(prohibido).test(r),
      `el barrido acepta identidad de usuario vía ${prohibido}`);
  }
});

check("4E. Es POST: no se dispara navegando", () => {
  const r = leer(RUTA);
  assert(/export async function POST/.test(r), "no expone POST");
  assert(!/export async function GET/.test(r),
    "un GET dispararía el barrido desde una barra de direcciones");
});

check("4F. El recuento no lleva identificadores", () => {
  const r = leer(RUTA);
  const i = r.indexOf("[billing:recurring-runner]");
  const bloque = r.slice(i - 200, i + 200);
  assert(!/subscription_id|organization_id|provider_payment/.test(bloque),
    "el registro del barrido lleva identificadores de filas");
});

check("4G. Se procesa en lotes acotados", () => {
  const r = leer(RUTA);
  assert(/Math\.min\(cuerpo\.limit as number, 200\)/.test(r),
    "no hay tope al tamaño del lote");
  assert(/\.limit\(limite\)/.test(r), "la consulta no está acotada");
});

check("4H. Una fila que falla no tumba la pasada", () => {
  const r = leer(RUTA);
  assert(/catch \{[\s\S]{0,200}resumen\.failed \+= 1/.test(r),
    "un fallo individual se lleva por delante el barrido entero");
});

console.log("\n5 · EL RECUENTO");

check("5A. Empieza en cero y cuenta por clase", () => {
  const s = emptySummary();
  assert(s.scanned === 0 && s.reconciled === 0 && s.failed === 0, "no empieza en cero");
  countInto(s.skipped, "skip_provider_cancelled");
  countInto(s.skipped, "skip_provider_cancelled");
  countInto(s.skipped, "skip_ended");
  assert(s.skipped.skip_provider_cancelled === 2 && s.skipped.skip_ended === 1,
    "no agrupa por motivo");
});

console.log(`\nMP-REC-01C.3 · barrido: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
