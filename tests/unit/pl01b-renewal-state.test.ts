/**
 * Trazaloop · PROD-LAUNCH-01B · Lo que se le dice a quien tiene un plan que vence.
 *
 *
 * DOS COSAS SE PROTEGEN AQUÍ, Y LA SEGUNDA MÁS QUE LA PRIMERA
 *
 * La primera es aritmética: que los avisos de siete, tres y un día caigan
 * cuando tienen que caer, que escalen en vez de repetirse y que a nadie se le
 * quite un día por redondear hacia abajo.
 *
 * La segunda son las PALABRAS. Al vencer un pago no se dice «cuenta
 * desactivada»: se dice que el periodo terminó, que la información está
 * intacta y que ahora se usa Free. Quien lee «desactivada» asume que perdió
 * sus datos, y a partir de ahí ya no está decidiendo si renovar — está
 * decidiendo si confiar. Esa palabra vuelve sola cada vez que alguien reescribe
 * un texto sin saber por qué estaba así, y por eso hay una prueba.
 *
 * Correr: npm run test:pl01b-renewal
 */
import {
  resolveRenewalView, noticeFor, daysUntil,
  RENEWAL_NOTICE_DAYS, RENEWAL_CTA_RENEW, RENEWAL_CTA_REACTIVATE,
  EXPIRED_TITLE, EXPIRED_BODY, FORBIDDEN_EXPIRY_WORDS,
} from "../../lib/domain/renewal-state";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const AHORA = new Date("2026-10-05T12:00:00Z");
const enDias = (d: number) =>
  new Date(AHORA.getTime() + d * 86_400_000).toISOString();

console.log("\nA · Los tres avisos, y solo tres");
// ===========================================================================

check("Son exactamente 7, 3 y 1 días", () => {
  assert(JSON.stringify([...RENEWAL_NOTICE_DAYS]) === "[7,3,1]",
    `los avisos son ${JSON.stringify(RENEWAL_NOTICE_DAYS)}`);
});

check("A ocho días o más no toca ningún aviso", () => {
  for (const d of [8, 9, 15, 30, 365]) {
    assert(noticeFor(d) === null, `a ${d} días saltó el aviso de ${noticeFor(d)}`);
  }
});

check("El aviso ESCALA en vez de repetirse", () => {
  const esperado: Array<[number, number]> = [
    [7, 7], [6, 7], [5, 7], [4, 7],
    [3, 3], [2, 3],
    [1, 1],
  ];
  for (const [restan, aviso] of esperado) {
    assert(noticeFor(restan) === aviso,
      `a ${restan} días tocaba el aviso de ${aviso} y salió ${noticeFor(restan)}`);
  }
});

check("Los días se redondean HACIA ARRIBA", () => {
  // A quien le quedan treinta horas le quedan dos días, no uno. Redondear
  // hacia abajo le quitaría margen justo cuando menos tiene.
  const treintaHoras = new Date(AHORA.getTime() + 30 * 3_600_000).toISOString();
  assert(daysUntil(treintaHoras, AHORA) === 2,
    `treinta horas dieron ${daysUntil(treintaHoras, AHORA)} días`);
});

console.log("\nB · Full vigente");
// ===========================================================================

check("Con quince días por delante se ofrece renovar, sin aviso", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: enDias(15), now: AHORA });
  assert(v.kind === "active", `salió ${v.kind}`);
  assert(v.notice === null, `se avisó a quince días: ${v.notice}`);
  assert(v.ctaLabel === RENEWAL_CTA_RENEW, `el botón dice «${v.ctaLabel}»`);
  assert(v.title === "Full activo", `el título dice «${v.title}»`);
});

check("A un día, el texto dice «mañana» y no «en 1 días»", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: enDias(0.5), now: AHORA });
  assert(v.kind === "active" && v.daysLeft === 1, `quedaron ${(v as { daysLeft: number }).daysLeft}`);
  assert(v.kind === "active" && /mañana/.test(v.body), `el texto dice «${(v as { body: string }).body}»`);
  assert(!/en 1 días/.test((v as { body: string }).body), "quedó «en 1 días»");
});

check("Extra también renueva", () => {
  const v = resolveRenewalView({ planCode: "extra", periodEndsAt: enDias(2), now: AHORA });
  assert(v.kind === "active" && v.notice === 3, `Extra salió ${JSON.stringify(v)}`);
});

console.log("\nC · Vencido: las palabras exactas");
// ===========================================================================

check("H. Al vencer se dice que la información permanece intacta", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: enDias(-1), now: AHORA });
  assert(v.kind === "expired", `salió ${v.kind}`);
  assert(v.title === EXPIRED_TITLE, `el título dice «${v.title}»`);
  assert(v.body === EXPIRED_BODY, `el cuerpo dice «${v.body}»`);
  assert(/intacta/.test(v.body), "no se dice que la información permanece intacta");
  assert(/Free/.test(v.body), "no se dice en qué plan se está ahora");
});

check("Y NUNCA se dice «desactivada», «suspendida» ni «bloqueada»", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: enDias(-30), now: AHORA });
  const texto = `${(v as { title: string }).title} ${(v as { body: string }).body}`.toLowerCase();
  for (const palabra of FORBIDDEN_EXPIRY_WORDS) {
    assert(!texto.includes(palabra),
      `al vencer se dice «${palabra}»: eso hace creer que se perdieron los datos`);
  }
});

check("El botón dice «Reactivar Full», no «Activar Full»", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: enDias(-1), now: AHORA });
  assert(v.kind === "expired" && v.ctaLabel === RENEWAL_CTA_REACTIVATE,
    `el botón dice «${(v as { ctaLabel: string }).ctaLabel}» a quien ya fue cliente`);
});

check("Justo al filo —cero días— ya cuenta como vencido", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: AHORA.toISOString(), now: AHORA });
  assert(v.kind === "expired", `en el instante exacto del vencimiento salió ${v.kind}`);
});

console.log("\nD · Cuando no hay nada que ofrecer");
// ===========================================================================

check("Sin periodo no se dibuja nada", () => {
  const v = resolveRenewalView({ planCode: "free", periodEndsAt: null, now: AHORA });
  assert(v.kind === "none", `sin periodo salió ${v.kind}`);
});

check("Con Free y un periodo aún vigente tampoco se ofrece renovar", () => {
  // Pasa cuando la asignación cambió antes de que el periodo terminara: no se
  // ofrece renovar algo que la empresa ya no tiene.
  const v = resolveRenewalView({ planCode: "free", periodEndsAt: enDias(5), now: AHORA });
  assert(v.kind === "none", `salió ${v.kind}`);
});

check("Una fecha ilegible no inventa un estado", () => {
  const v = resolveRenewalView({ planCode: "full", periodEndsAt: "no-es-una-fecha", now: AHORA });
  assert(v.kind === "none", `una fecha rota produjo ${v.kind}`);
});

console.log(`\nPROD-LAUNCH-01B · renovación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
