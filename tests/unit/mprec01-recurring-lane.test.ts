/**
 * Trazaloop · MP-REC-01 · El carril recurrente, cerrado por defecto.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Se abre un segundo carril de adquisición: la pasarela cobra sola. Mientras no
 * esté aprobado, tiene que ser IMPOSIBLE que funcione en Producción, y tiene
 * que ser imposible por construcción y no por disciplina.
 *
 * Las dos formas de equivocarse aquí son conocidas:
 *
 *   · Un `if (staging)` en cada componente. Funciona hasta que alguien añade
 *     el cuarto camino y olvida el suyo.
 *   · Una bandera que se enciende sola porque `Boolean("false")` es `true`.
 *
 * Por eso la decisión vive en UN sitio, es pura, y esta suite comprueba los
 * seis casos sin desplegar nada.
 *
 * Y comprueba algo más: que el carril MANUAL —el que hoy cobra de verdad en
 * Producción— no ha cambiado. Un frente nuevo que toca el que ya funciona no
 * es un frente nuevo, es una regresión con nombre bonito.
 *
 * Correr: npm run test:mprec01
 */
import { readFileSync } from "node:fs";
import {
  resolveRecurringLane, isRecurringLaneOpen,
} from "../../lib/billing/recurring/policy";
import { resolveModuleAccess } from "../../lib/modules/access";
import { renewalCopyFor } from "../../lib/domain/billing-renewal-copy";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

/** El único entorno en el que el carril debe abrirse. */
const STAGING_OK = {
  VERCEL_ENV: "preview",
  BILLING_RECURRING_ENABLED: "true",
  MERCADOPAGO_ENVIRONMENT: "test",
};

console.log("\nB · PRODUCCIÓN NO ABRE EL CARRIL, DIGA LO QUE DIGA LA BANDERA");

check("B1. Producción con todo encendido sigue cerrada", () => {
  const r = resolveRecurringLane({ ...STAGING_OK, VERCEL_ENV: "production" });
  assert(!r.open, "el carril se abrió en Producción");
  assert(r.open === false && r.reason === "RECURRING_FORBIDDEN_IN_PRODUCTION",
    "el motivo no señala a Producción");
});

check("B2. `VERCEL_TARGET_ENV` manda sobre `VERCEL_ENV`", () => {
  // La precedencia es la de `lib/env.ts`. Si alguien la cambiara allí, este
  // carril dejaría de estar protegido y nadie lo notaría desde aquí.
  const r = resolveRecurringLane({
    ...STAGING_OK, VERCEL_TARGET_ENV: "production", VERCEL_ENV: "preview" });
  assert(r.open === false && r.reason === "RECURRING_FORBIDDEN_IN_PRODUCTION",
    "un target de producción no cerró el carril");
});

check("B3. La bandera ausente es «apagado»", () => {
  const { BILLING_RECURRING_ENABLED: _, ...sinBandera } = STAGING_OK;
  const r = resolveRecurringLane(sinBandera);
  assert(r.open === false && r.reason === "RECURRING_FLAG_NOT_ENABLED",
    "sin bandera el carril no quedó cerrado");
});

check("B4. Ningún valor que no sea un sí explícito la enciende", () => {
  // `Boolean("false")` es `true`, y así se han encendido banderas que nadie
  // quería encender. Aquí se comprueba con los valores que de verdad aparecen
  // en una configuración copiada de un entorno a otro.
  for (const v of ["false", "0", "no", "off", "", "  ", "1", "yes", "si",
                   "TRUE ", "True"]) {
    const r = resolveRecurringLane({ ...STAGING_OK, BILLING_RECURRING_ENABLED: v });
    if (v.trim().toLowerCase() === "true") continue;
    assert(r.open === false && r.reason === "RECURRING_FLAG_NOT_ENABLED",
      `«${v}» encendió el carril`);
  }
  // Y el sí explícito sí, con espacios y mayúsculas alrededor.
  assert(isRecurringLaneOpen({ ...STAGING_OK, BILLING_RECURRING_ENABLED: " TRUE " }),
    "el sí explícito no abrió el carril");
});

check("B5. Con credencial que no declara pruebas, cerrado", () => {
  for (const v of ["live", "", "  ", "prod", "production"]) {
    const r = resolveRecurringLane({ ...STAGING_OK, MERCADOPAGO_ENVIRONMENT: v });
    assert(r.open === false && r.reason === "RECURRING_PROVIDER_ENVIRONMENT_NOT_TEST",
      `«${v}» abrió el carril con credencial que no es de pruebas`);
  }
});

check("B6. Y en Staging, con todo en su sitio, se abre", () => {
  assert(resolveRecurringLane(STAGING_OK).open, "el carril no se abrió en Staging");
  assert(resolveRecurringLane({ ...STAGING_OK, VERCEL_ENV: "development" }).open,
    "el carril no se abrió en local");
});

check("B7. El orden del diagnóstico va de lo más de fondo a lo más de forma", () => {
  // En Producción, sin bandera y con credencial productiva fallan las tres.
  // Lo que debe salir es la que no se puede levantar.
  const r = resolveRecurringLane({
    VERCEL_ENV: "production", MERCADOPAGO_ENVIRONMENT: "live" });
  assert(r.open === false && r.reason === "RECURRING_FORBIDDEN_IN_PRODUCTION",
    "el motivo de fondo quedó tapado por uno de forma");
});

console.log("\nB' · LA DECISIÓN VIVE EN UN SOLO SITIO");

check("B8. Ningún módulo del carril decide el entorno por su cuenta", () => {
  // La regla: quien necesite saber si el carril está abierto pregunta a la
  // política. Si un fichero de `lib/billing/recurring` empieza a mirar
  // `VERCEL_ENV` directamente, la decisión se ha duplicado.
  const politica = leer("lib/billing/recurring/policy.ts");
  assert(/isProductionEnvironment/.test(politica),
    "la política no se apoya en la autoridad de entorno del repositorio");
  assert(!/process\.env\.VERCEL_ENV/.test(politica),
    "la política lee VERCEL_ENV a mano en vez de usar lib/env");
});

check("B9. La política es pura: recibe el mapa, no lo va a buscar", () => {
  // Sin esto, los seis casos de arriba no se podrían comprobar sin desplegar.
  const r = resolveRecurringLane({ VERCEL_ENV: "preview",
    BILLING_RECURRING_ENABLED: "true", MERCADOPAGO_ENVIRONMENT: "test" });
  assert(r.open, "la política no decidió con el mapa recibido");
});

console.log("\nA · EL CARRIL MANUAL NO SE HA MOVIDO");

check("A1. La liquidación del pago único sigue intacta", () => {
  const m = leer("supabase/migrations/0190_one_time_checkout_and_manual_settlement.sql");
  assert(/create or replace function public\.billing_settle_one_time_checkout/.test(m),
    "0190 ya no define la liquidación del pago único");
  assert(/renewal_mode in \('manual', 'platform', 'provider'\)/.test(m),
    "el vocabulario de renovación cambió bajo los pies del carril manual");
});

check("A2. 0204 no toca ninguna tabla ni función del carril manual", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  for (const prohibido of [
    "billing_one_time_checkouts",
    "billing_settle_one_time_checkout",
    "billing_open_one_time_checkout",
    "billing_attach_one_time_preference",
    "billing_record_manual_payment",
  ]) {
    assert(!new RegExp(`(alter|drop|create or replace)[\\s\\S]{0,40}${prohibido}`, "i").test(m),
      `0204 modifica ${prohibido}, que es del carril manual`);
  }
});

check("A3. 0204 no reescribe el modo de renovación de nadie", () => {
  // La lección de 0190: una migración que hace `update` sobre filas existentes
  // puede convertir en automática una suscripción que se renovaba a mano.
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  assert(!/update\s+public\.billing_subscriptions/i.test(m),
    "0204 escribe sobre suscripciones existentes");
  assert(!/set\s+renewal_mode\s*=/i.test(m),
    "0204 asigna renewal_mode a alguien");
});

console.log("\nQ · LA TABLA NUEVA NACE CERRADA");

check("Q1. RLS activada y con política, como toda tabla comercial", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  const creadas = [...m.matchAll(/create table (?:if not exists )?public\.(\w+)/g)]
    .map((x) => x[1]);
  assert(creadas.length === 1 && creadas[0] === "billing_recurring_authorizations",
    `0204 crea tablas inesperadas: ${creadas.join(", ")}`);
  for (const t of creadas) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(m),
      `${t} nace sin RLS`);
    assert(new RegExp(`create policy \\w+ on public\\.${t}`).test(m),
      `${t} tiene RLS y ninguna política`);
  }
});

check("Q2. Nadie escribe desde el cliente", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  assert(/revoke all on public\.billing_recurring_authorizations from anon/.test(m),
    "anon no queda revocado");
  assert(/revoke insert, update, delete, truncate[\s\S]{0,80}from authenticated, anon/.test(m),
    "authenticated conserva escritura sobre una tabla financiera");
  assert(/grant select on public\.billing_recurring_authorizations to authenticated/.test(m),
    "no se concede la lectura que la política necesita");
});

check("Q3. 0204 no crea ninguna función, y lo comprueba", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  assert(!/create or replace function/i.test(m),
    "0204 crea funciones: la superficie ejecutable cambió");
  assert(/0204_SUPERFICIE_PUBLICA_CAMBIO/.test(m),
    "0204 no comprueba la puerta de 0202");
  assert(/0204_AUTORIZACION_LEGIBLE_POR_ANON/.test(m),
    "0204 no comprueba que anon no lea la tabla");
});

console.log("\nL · UNA SOLA AUTORIZACIÓN VIVA, Y EN LA BASE");

check("L1. El instrumento del proveedor pertenece a una sola suscripción", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  assert(/create unique index[\s\S]{0,120}\(provider, provider_subscription_id\)/.test(m),
    "falta la unicidad de (provider, provider_subscription_id)");
});

check("L2. Y una suscripción no puede tener dos autorizaciones vivas", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  // El índice tiene que ser PARCIAL: si no lo fuera, el historial de las
  // muertas no podría acumularse al lado, y reemplazar sería sobrescribir.
  assert(/bra_one_live_per_subscription[\s\S]{0,200}where status in \('awaiting_authorization', 'authorized'\)/.test(m),
    "la unicidad de la autorización viva no existe o no es parcial");
});

check("L3. La tabla no concede acceso ni crea periodos por sí misma", () => {
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  assert(!/insert into public\.billing_subscription_periods/i.test(m),
    "0204 crea periodos");
  assert(!/(insert into|update|delete from|alter table)\s+(public\.)?(organization_plan_assignments|organization_modules)/i.test(m),
    "0204 toca la concesión de acceso");
  assert(/NO concede acceso/.test(m),
    "0204 no declara que no concede acceso");
});

check("L4. Presupone la proyección de 0194 en vez de confiar en ella", () => {
  // Sin el disparador, este carril cobraría y no entregaría. Mejor negarse a
  // promover que descubrirlo con dinero dentro.
  const m = leer("supabase/migrations/0204_billing_recurring_authorization.sql");
  assert(/t_project_module_access_on_period/.test(m),
    "0204 no comprueba que la proyección de módulos exista");
});

console.log("\nC · CANCELAR CONSERVA LO PAGADO, Y VENCER NO BORRA NADA");

/*
  El caso real: se canceló la renovación el 17 de septiembre con el periodo
  pagado hasta el 16 de octubre. Lo que sigue comprueba las dos mitades de esa
  promesa sin tocar una sola fecha de Staging.

  La proyección de 0194 escribe `access_expires_at = fin del periodo pagado`, y
  `resolveModuleAccess` decide con ella. Aquí se le dan exactamente esos datos.
*/
const FIN_PAGADO = "2026-10-16T22:47:38.000Z";
const accesoEn = (cuando: string) => resolveModuleAccess({
  isFunctional: true,
  killSwitchActive: true,
  assignment: { enabled: true, accessMode: "full", accessExpiresAt: FIN_PAGADO },
  now: new Date(cuando),
});

check("C1. Cancelada y dentro del periodo pagado → Full de verdad", () => {
  const r = accesoEn("2026-10-01T00:00:00.000Z");
  assert(r.allowed, "no dejó trabajar con el plan pagado");
  assert(r.accessMode === "full", `modo ${r.accessMode}`);
  assert(!r.isExpired, "lo dio por vencido antes de tiempo");
  assert(r.expiresAt === FIN_PAGADO, "no dice hasta cuándo llega");
});

check("C2. Un segundo antes del vencimiento sigue siendo Full", () => {
  const r = accesoEn("2026-10-16T22:47:37.000Z");
  assert(r.allowed, "cortó un segundo antes de tiempo");
});

check("C3. Al vencer: se acaba el derecho, NO la información", () => {
  const r = accesoEn("2026-10-16T22:47:38.000Z");
  assert(!r.allowed, "siguió permitiendo mutar después de la fecha pagada");
  assert(r.retainedRead, "se perdió la consulta de lo que la empresa pagó");
  assert(r.reason === "full_expired", `motivo ${r.reason}`);
});

check("C4. Y un mes después sigue conservando la consulta", () => {
  const r = accesoEn("2026-11-20T00:00:00.000Z");
  assert(!r.allowed && r.retainedRead,
    "el tiempo acabó borrando el acceso de lectura");
});

check("C5. Nadie tuvo que apagarlo: lo gobierna la FECHA", () => {
  // Es la propiedad que hace innecesario un proceso programado para el
  // derecho. La misma asignación decide distinto solo porque cambió el reloj.
  const antes = accesoEn("2026-10-16T22:47:37.000Z");
  const despues = accesoEn("2026-10-16T22:47:39.000Z");
  assert(antes.allowed && !despues.allowed,
    "el vencimiento no depende solo de la fecha");
});

console.log("\nD · LA FICHA NO SE CONTRADICE DESPUÉS DE CANCELAR");

check("D1. Con cobros vivos, la fecha es el siguiente cobro", () => {
  const c = renewalCopyFor("provider", false);
  assert(c.dateLabel === "Siguiente cobro", `etiqueta «${c.dateLabel}»`);
  assert(c.impliesAutomaticCharge, "no reconoce que va a cobrarse");
  assert(c.offersCancellation, "no ofrece cancelar algo que sí existe");
});

check("D2. Cancelados, la MISMA fecha pasa a ser hasta cuándo llega", () => {
  // La fecha no cambia: cambia lo que significa. Seguir llamándola «siguiente
  // cobro» contradiría, en la misma pantalla, el mensaje que acaba de decir
  // que no habrá más cobros.
  const c = renewalCopyFor("provider", true);
  assert(c.dateLabel === "Plan activo hasta", `etiqueta «${c.dateLabel}»`);
  assert(!c.impliesAutomaticCharge, "sigue prometiendo un cobro que no llegará");
  assert(!c.offersCancellation, "ofrece cancelar lo ya cancelado");
});

check("D3. El carril manual no se entera de nada de esto", () => {
  for (const detenidos of [false, true]) {
    const c = renewalCopyFor("manual", detenidos);
    assert(c.dateLabel === "Activo hasta", `etiqueta «${c.dateLabel}»`);
    assert(!c.impliesAutomaticCharge, "el pago único prometió un cobro");
    assert(/no se renueva solo/i.test(c.note ?? ""),
      "dejó de decir que no se renueva solo");
  }
});

console.log(`\nMP-REC-01 · carril: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
