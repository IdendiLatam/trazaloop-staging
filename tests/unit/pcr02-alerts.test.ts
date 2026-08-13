/**
 * Trazaloop · Sprint PCR-02 · Bloques H e I — estados de la orden y alerta
 * de órdenes abiertas demasiado tiempo. Ejecuta la lógica PURA
 * (lib/domain/production-alerts.ts) y verifica estáticamente su uso real en
 * detalle, listado, dashboard y server actions.
 *
 * Correr: npm run test:pcr02-alerts
 */
import fs from "node:fs";
import path from "node:path";
import {
  PRODUCTION_ORDER_OPEN_ALERT_HOURS,
  OPEN_PRODUCTION_ORDER_STATUSES,
  FINISHED_PRODUCTION_ORDER_STATUSES,
  isProductionOrderOpen,
  isProductionOrderOpenTooLong,
  productionOrderAgeHours,
  productionOrderOpenDays,
  openTooLongMessage,
  orderMutationBlockedMessage,
} from "../../lib/domain/production-alerts";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

const NOW = new Date("2026-08-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

console.log("PCR-02 · Alerta de órdenes abiertas y estados (Bloques H/I)");

check("1. El umbral es una constante de dominio = 72 horas (sin env var)", () => {
  assert(PRODUCTION_ORDER_OPEN_ALERT_HOURS === 72, "el umbral pactado es 72");
  const src = readSource("../../lib/domain/production-alerts.ts");
  assert(!src.includes("process.env"), "el umbral no debía depender de variables de entorno");
});

check("2. Los estados provienen del CHECK real de 0025 (sin estados nuevos)", () => {
  assert(
    JSON.stringify(OPEN_PRODUCTION_ORDER_STATUSES) === JSON.stringify(["draft", "in_progress"]),
    "abiertas = draft/in_progress"
  );
  assert(
    JSON.stringify(FINISHED_PRODUCTION_ORDER_STATUSES) === JSON.stringify(["closed", "cancelled"]),
    "terminadas = closed/cancelled"
  );
  assert(isProductionOrderOpen("draft") && isProductionOrderOpen("in_progress"), "abiertas");
  assert(!isProductionOrderOpen("closed") && !isProductionOrderOpen("cancelled"), "terminadas");
});

check("3. Orden abierta hace MENOS de 72 h → sin alerta", () => {
  assert(!isProductionOrderOpenTooLong("draft", hoursAgo(71.9), NOW), "71.9 h no alerta");
  assert(!isProductionOrderOpenTooLong("in_progress", hoursAgo(1), NOW), "1 h no alerta");
});

check("4. Orden abierta hace MÁS de 72 h → alerta (draft e in_progress)", () => {
  assert(isProductionOrderOpenTooLong("draft", hoursAgo(72.1), NOW), "72.1 h alerta");
  assert(isProductionOrderOpenTooLong("in_progress", hoursAgo(200), NOW), "200 h alerta");
});

check("5. Orden cerrada o cancelada → NUNCA alerta, sin importar la edad", () => {
  assert(!isProductionOrderOpenTooLong("closed", hoursAgo(500), NOW), "closed no alerta");
  assert(!isProductionOrderOpenTooLong("cancelled", hoursAgo(500), NOW), "cancelled no alerta");
});

check("6. Sin created_at (dato ausente) → sin alerta y sin romper", () => {
  assert(!isProductionOrderOpenTooLong("draft", null, NOW), "null no alerta");
  assert(!isProductionOrderOpenTooLong("draft", undefined, NOW), "undefined no alerta");
  assert(productionOrderAgeHours(hoursAgo(-5), NOW) === 0, "fechas futuras → edad 0");
});

check("7. Días y mensaje pactado", () => {
  assert(productionOrderOpenDays(hoursAgo(72.5), NOW) === 3, "72.5 h → 3 días");
  assert(productionOrderOpenDays(hoursAgo(25), NOW) === 1, "25 h → mínimo 1 día");
  assert(
    openTooLongMessage(4) ===
      "Esta orden lleva abierta 4 días. Verifique si debe registrar la producción pendiente o cerrarla.",
    "mensaje plural"
  );
  assert(
    openTooLongMessage(1) ===
      "Esta orden lleva abierta 1 día. Verifique si debe registrar la producción pendiente o cerrarla.",
    "mensaje singular"
  );
});

check("8. Bloque H: guarda de mutaciones por estado (mensajes en español)", () => {
  assert(orderMutationBlockedMessage("draft") === null, "draft admite movimientos");
  assert(orderMutationBlockedMessage("in_progress") === null, "in_progress admite movimientos");
  assert(
    orderMutationBlockedMessage("closed")?.includes("La orden está cerrada"),
    "closed bloquea con mensaje"
  );
  assert(
    orderMutationBlockedMessage("cancelled")?.includes("cancelada"),
    "cancelled bloquea con mensaje"
  );
});

check("9. Uso real: detalle, listado y dashboard (in-app, sin correos ni cron)", () => {
  const detail = readSource(
    "../../app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx"
  );
  assert(
    detail.includes("isProductionOrderOpenTooLong") && detail.includes("openTooLongMessage"),
    "el detalle debía mostrar la alerta con el mensaje de dominio"
  );
  const list = readSource(
    "../../app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx"
  );
  assert(
    list.includes("isProductionOrderOpenTooLong") && list.includes("Abierta hace"),
    "el listado debía marcar las órdenes estancadas con un chip"
  );
  const dashboard = readSource("../../app/(app)/(shell)/(cpr)/dashboard/page.tsx");
  assert(
    dashboard.includes("countStaleOpenOrders") && dashboard.includes("más de 72 horas"),
    "el dashboard debía dar el aviso mínimo"
  );
  const domain = readSource("../../lib/domain/production-alerts.ts");
  assert(
    !/nodemailer|sendgrid|resend|cron/i.test(domain),
    "sin correos ni tareas programadas (fuera de alcance PCR-02)"
  );
});

check("10. Bloque H en servidor: consumos y salidas exigen orden abierta", () => {
  const actions = readSource("../../server/actions/traceability.ts");
  assert(
    actions.includes("assertOrderAcceptsMutations"),
    "debía existir la guarda de estado de la orden"
  );
  assert(
    actions.includes("orderMutationBlockedMessage"),
    "la guarda debía usar los mensajes de dominio"
  );
  const guarded = actions.split("assertOrderAcceptsMutations(org.organizationId").length - 1;
  assert(
    guarded >= 3,
    `consumo externo, consumo interno y creación de salida debían pasar por la guarda (usos: ${guarded})`
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones de alertas/estados pasaron.");
