/**
 * Trazaloop · PROD-LAUNCH-01D.4A · Lo que se paga tiene que llegar.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * El primer pago real de Trazaloop —157 080 COP, aprobado y conciliado— dejó a
 * la empresa con la suscripción en Full activo, las concesiones canónicas en
 * `sold`… y los módulos en `demo` vencido el 9 de septiembre. La puerta lee la
 * tabla vieja, así que quien pagó vio «Tu plan está activo» y, al entrar a
 * Quality, «Estás consultando» sin poder crear nada.
 *
 *
 * LO QUE ESTA BATERÍA DEFIENDE
 *
 * Sobre todo, la trampa en la que era fácil caer al arreglarlo: marcar Full
 * SIN FECHA. La regla ignoraba el vencimiento de full/extra, así que eso habría
 * comprado acceso PERPETUO por una mensualidad. Aquí se exige lo contrario —que
 * Full mire su fecha— y que al terminar el periodo se vuelva solo a consulta,
 * conservando la información.
 *
 * Correr: npm run test:pl01d4a
 */
import { readFileSync } from "node:fs";
import { resolveModuleAccess, type ModuleAccessInput } from "../../lib/modules/access";
import {
  isEnterableState, isReadableState, isReadOnlyState,
  DERIVED_STATE_LABEL, DERIVED_STATE_HINT, moduleAccessDeniedMessage,
} from "../../lib/modules/messages";
import { presentationFor, isNavigable } from "../../lib/modules/entry";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");

/** El periodo REAL del primer pago de Trazaloop. */
const PAGO   = new Date("2026-09-14T16:10:28.552Z");
const FIN    = "2026-10-14T16:10:28.552Z";
const DENTRO = new Date("2026-10-01T00:00:00.000Z");
const DESPUES = new Date("2026-10-14T16:10:29.000Z");   // un segundo después

function acceso(mode: "demo" | "full" | "extra", vence: string | null, now: Date) {
  const input: ModuleAccessInput = {
    isFunctional: true, killSwitchActive: true, now,
    assignment: { enabled: true, accessMode: mode, accessExpiresAt: vence },
  };
  return resolveModuleAccess(input);
}

console.log("\nA · Pagar entrega acceso de verdad");
// ===========================================================================

check("A. Demo vencido + Full mensual pagado → se puede MUTAR", () => {
  const d = acceso("full", FIN, PAGO);
  assert(d.allowed === true, "pagó y sigue sin poder crear");
  assert(d.derivedState === "full", `estado «${d.derivedState}»`);
  assert(isEnterableState(d.derivedState), "el estado no permite trabajar");
});

check("B. Y Full ANUAL igual: lo que manda es la fecha, no la periodicidad", () => {
  const finAnual = "2027-09-14T16:10:28.552Z";
  const d = acceso("full", finAnual, PAGO);
  assert(d.allowed === true, "un pago anual no da acceso");
  assert(d.expiresAt === finAnual, `la vigencia dice «${d.expiresAt}»`);
});

check("C. El acceso llega hasta el final del periodo pagado, y lo dice", () => {
  const d = acceso("full", FIN, DENTRO);
  assert(d.allowed === true, "dentro del periodo pagado no deja trabajar");
  assert(d.expiresAt === FIN,
    `la regla oculta la vigencia («${d.expiresAt}»): antes devolvía null siempre`);
  assert(d.isExpired === false, "se marca vencido dentro del periodo");
});

console.log("\nB · Y NO compra acceso perpetuo");
// ===========================================================================

check("E. Pasado el periodo pagado: NO se muta, SÍ se consulta", () => {
  const d = acceso("full", FIN, DESPUES);
  assert(d.allowed === false,
    "una mensualidad compró Full para siempre: la regla no mira el vencimiento");
  assert(d.derivedState === "full_expired", `estado «${d.derivedState}»`);
  assert(d.retainedRead === true, "al vencer se le quitó el acceso a su información");
  assert(d.isExpired === true, "no se marca como vencido");
  assert(d.expiresAt === FIN, "no se dice cuándo terminó");
});

check("Un segundo ANTES del final todavía se trabaja", () => {
  const justo = new Date(new Date(FIN).getTime() - 1000);
  assert(acceso("full", FIN, justo).allowed === true,
    "el corte se adelanta: se pierde el último segundo pagado");
  const exacto = new Date(FIN);
  assert(acceso("full", FIN, exacto).allowed === false,
    "en el instante exacto del vencimiento todavía deja mutar");
});

check("Extra se comporta igual que Full", () => {
  assert(acceso("extra", FIN, DENTRO).allowed === true, "Extra vigente no deja trabajar");
  const v = acceso("extra", FIN, DESPUES);
  assert(v.allowed === false && v.derivedState === "full_expired",
    `Extra vencido quedó en «${v.derivedState}»`);
});

check("Sin fecha SIGUE siendo perpetuo: core y el Full de administración", () => {
  const d = acceso("full", null, DESPUES);
  assert(d.allowed === true, "un Full sin vencimiento dejó de funcionar");
  assert(d.derivedState === "full", `estado «${d.derivedState}»`);
  assert(d.expiresAt === null, "se inventó una fecha de fin");
});

console.log("\nC · Un periodo pagado que termina NO es una prueba que caduca");
// ===========================================================================

check("Se distingue de demo_expired, aunque puedan lo mismo", () => {
  const pagado = acceso("full", FIN, DESPUES);
  const prueba = acceso("demo", FIN, DESPUES);
  assert(pagado.derivedState !== prueba.derivedState,
    "el periodo pagado vencido se confunde con una prueba caducada");
  assert(pagado.allowed === prueba.allowed && pagado.retainedRead === prueba.retainedRead,
    "no tienen la misma capacidad, y deberían");
  assert(DERIVED_STATE_LABEL.full_expired !== DERIVED_STATE_LABEL.demo_expired,
    "comparten etiqueta");
});

check("A quien pagó se le dice «renueva», no «activa»", () => {
  const pista = DERIVED_STATE_HINT.full_expired;
  const error = moduleAccessDeniedMessage("Trazaloop Quality", "full_expired");
  for (const [dónde, t] of [["la pista", pista], ["el error", error]] as const) {
    assert(/renu[eé]v/i.test(t), `${dónde} no invita a renovar: «${t}»`);
    assert(/conserv/i.test(t), `${dónde} no dice que los datos se conservan`);
    assert(!/contacta al equipo|centro de soporte/i.test(t),
      `${dónde} manda a soporte`);
  }
  assert(/Trazaloop Quality/.test(error), "el error no nombra el módulo");
});

check("Se entra a consultar, y la tarjeta se puede pulsar", () => {
  assert(isReadableState("full_expired"), "no se considera legible");
  assert(isReadOnlyState("full_expired"), "no se considera de solo consulta");
  assert(!isEnterableState("full_expired"),
    "«entrable» incluye el periodo vencido: eso da escritura a quien no pagó");
  assert(presentationFor("full_expired") === "read_only",
    `se presenta como «${presentationFor("full_expired")}»`);
  assert(isNavigable("full_expired", "/quality"),
    "la tarjeta no lleva a ningún sitio: la información queda dentro sin puerta");
});

console.log("\nD · La proyección está donde tiene que estar");
// ===========================================================================

const SQL = leer("supabase/migrations/0194_paid_module_access_projection.sql");

check("El vencimiento sale del periodo PAGADO, no de una constante", () => {
  assert(/access_expires_at = v_hasta/.test(SQL),
    "la proyección no ata la vigencia al periodo pagado");
  assert(!/access_expires_at\s*=\s*null/i.test(SQL),
    "la proyección deja Full sin vencimiento: eso es acceso perpetuo");
  assert(/max|order by pe\.period_end desc/.test(SQL),
    "no se toma el periodo liquidado más lejano: la renovación anticipada perdería días");
  assert(/status = 'settled'/.test(SQL),
    "se proyecta desde periodos que no están liquidados");
});

check("Solo se proyecta sobre módulos con concesión VENDIDA vigente", () => {
  assert(/grant_kind = 'sold'/.test(SQL), "no se exige concesión vendida");
  assert(/a\.starts_at <= now\(\)/.test(SQL) && /a\.ends_at is null or a\.ends_at > now\(\)/.test(SQL),
    "una concesión ya terminada seguiría proyectando acceso");
  assert(/is_functional/.test(SQL),
    "se proyectaría sobre módulos no funcionales, como el de infraestructura");
});

check("Free no proyecta nada", () => {
  assert(/v_plan not in \('full', 'extra'\)/.test(SQL),
    "un periodo de plan gratuito proyectaría acceso de pago");
});

check("Es idempotente por construcción", () => {
  assert(/is distinct from/.test(SQL),
    "vuelve a escribir aunque no cambie nada: cada recálculo movería updated_at");
});

check("Se recalcula en los DOS sitios donde cambia lo canónico", () => {
  assert(/after insert or update on public\.billing_subscription_periods/.test(SQL),
    "liquidar un periodo no recalcula el acceso");
  assert(/after insert or update on public\.organization_plan_assignments/.test(SQL),
    "conceder un módulo no recalcula el acceso");
});

check("Y el backfill es una regla general, sin empresas escritas a mano", () => {
  assert(!/Empresa de Prueba/i.test(SQL), "la migración nombra una empresa concreta");
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(SQL),
    "la migración lleva un identificador de empresa escrito a mano");
  assert(/where pe\.status = 'settled'/.test(SQL),
    "el backfill no se deriva de los periodos liquidados");
});

check("La proyección no la puede ejecutar cualquiera", () => {
  assert(/revoke all on function public\.billing_project_module_access\(uuid\)\s*\n?\s*from public, anon, authenticated/.test(SQL),
    "la proyección quedó ejecutable desde fuera: cualquiera se ampliaría el acceso");
});

console.log("\nE · La deuda queda escrita");
// ===========================================================================

check("ENTITLEMENT-CONVERGENCE-01 está registrada", () => {
  const doc = leer("docs/ENTITLEMENT-CONVERGENCE-01.md");
  assert(/organization_plan_assignments/.test(doc) && /organization_modules/.test(doc),
    "no se nombran las dos verdades");
  assert(/proyecci[óo]n|espejo/i.test(doc), "no se dice que hoy una es reflejo de la otra");
  assert(/0194/.test(doc), "no se enlaza con lo que se hizo");
});

console.log(`\nPROD-LAUNCH-01D.4A · lo pagado llega: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
