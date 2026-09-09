import { veredictoDeCambio } from "../../lib/billing/mercadopago/qa-amount-verdict";

/**
 * Trazaloop · MP-SBX-01C · El veredicto no puede mentir sobre un rechazo.
 *
 * EL FALLO QUE ESTA PRUEBA IMPIDE QUE VUELVA
 *
 * La primera versión comparaba el importe leído después contra el importe
 * pedido, sin mirar si el proveedor había aceptado la petición. En la prueba
 * NO-OP —donde el objetivo es el mismo valor que ya había— Mercado Pago
 * respondió 400, no cambió nada, y el veredicto dijo «importe aplicado» porque
 * los números coincidían. Lo cazó el dueño del producto leyendo la salida.
 *
 * Un veredicto así es peor que ninguno: se lee de un vistazo y se cree. La
 * regla queda fijada aquí, con el caso real incluido.
 */

let passed = 0;
let failed = 0;

function check(nombre: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}

function assert(cond: boolean, mensaje: string) {
  if (!cond) throw new Error(mensaje);
}

console.log("\nMP-SBX-01C · el veredicto del cambio de importe\n");

check("A. EL CASO REAL · NO-OP rechazado con 400: nada es verdad", () => {
  // 01C-UP, 8 de septiembre de 2026. `reason` presente, sin plan asociado,
  // Mercado Pago devolvió «Invalid value for preapproval_plan_id».
  const v = veredictoDeCambio({
    putHttp: 400, antes: 5000, despues: 5000, objetivo: 5000, pagosNuevos: 0,
  });
  assert(v.put_aceptado === false, "un 400 no es un PUT aceptado");
  assert(v.importe_aplicado === false,
    "AQUÍ estaba el fallo: coincidir no es aplicarse cuando nadie tocó nada");
  assert(v.importe_cambiado === false, "no cambió nada");
  assert(v.cobro_inmediato === false, "no hubo cobro");
  assert(v.lectura.includes("400"), "la lectura debe decir qué código devolvió");
});

check("B. Cambio real rechazado con 400: tampoco", () => {
  const v = veredictoDeCambio({
    putHttp: 400, antes: 5000, despues: 5000, objetivo: 9000, pagosNuevos: 0,
  });
  assert(!v.put_aceptado && !v.importe_aplicado && !v.importe_cambiado,
    "un rechazo no aplica ni cambia nada");
});

check("C. Un 400 con un pago del ciclo en medio no cuenta como cobro del cambio", () => {
  // El ciclo diario puede cobrar mientras se hace el experimento. Si la
  // petición fue rechazada, ese pago es del calendario, no del cambio.
  const v = veredictoDeCambio({
    putHttp: 400, antes: 5000, despues: 5000, objetivo: 9000, pagosNuevos: 1,
  });
  assert(v.cobro_inmediato === false,
    "sin PUT aceptado, un pago en esa ventana no se le puede atribuir");
});

check("D. NO-OP aceptado: el PUT vale, y no dice nada del cambio", () => {
  const v = veredictoDeCambio({
    putHttp: 200, antes: 5000, despues: 5000, objetivo: 5000, pagosNuevos: 0,
  });
  assert(v.put_aceptado === true, "200 es aceptado");
  assert(v.importe_aplicado === true, "el importe pedido es el que quedó");
  assert(v.importe_cambiado === false, "no cambió: era el mismo");
  assert(v.lectura.includes("NADA sobre qué pasa al cambiar"),
    "la lectura tiene que avisar de que un no-op no responde la pregunta financiera");
});

check("E. Subida aplicada sin cobro inmediato", () => {
  const v = veredictoDeCambio({
    putHttp: 200, antes: 5000, despues: 9000, objetivo: 9000, pagosNuevos: 0,
  });
  assert(v.put_aceptado && v.importe_aplicado && v.importe_cambiado, "se aplicó y cambió");
  assert(v.cobro_inmediato === false, "no aparecieron pagos");
});

check("F. Subida aplicada CON cobro inmediato", () => {
  const v = veredictoDeCambio({
    putHttp: 200, antes: 5000, despues: 9000, objetivo: 9000, pagosNuevos: 1,
  });
  assert(v.cobro_inmediato === true, "hay un pago nuevo en la misma ventana");
  assert(v.lectura.includes("indicio"),
    "y se dice como INDICIO, no como causa demostrada");
});

check("G. Bajada aplicada", () => {
  const v = veredictoDeCambio({
    putHttp: 200, antes: 9000, despues: 5000, objetivo: 5000, pagosNuevos: 0,
  });
  assert(v.importe_aplicado && v.importe_cambiado, "bajar también es cambiar");
});

check("H. Aceptado pero el proveedor dejó otro importe", () => {
  const v = veredictoDeCambio({
    putHttp: 200, antes: 5000, despues: 7000, objetivo: 9000, pagosNuevos: 0,
  });
  assert(v.put_aceptado === true, "la petición se aceptó");
  assert(v.importe_aplicado === false, "no quedó el que se pidió");
  assert(v.importe_cambiado === true, "pero sí cambió respecto de lo que había");
});

check("I. Cualquier código fuera de 2xx es un rechazo", () => {
  for (const http of [301, 400, 401, 403, 404, 409, 422, 429, 500, 502]) {
    const v = veredictoDeCambio({
      putHttp: http, antes: 5000, despues: 9000, objetivo: 9000, pagosNuevos: 2,
    });
    assert(!v.put_aceptado && !v.importe_aplicado && !v.importe_cambiado
      && !v.cobro_inmediato, `HTTP ${http} no puede dar nada por bueno`);
  }
  for (const http of [200, 201, 204]) {
    const v = veredictoDeCambio({
      putHttp: http, antes: 5000, despues: 9000, objetivo: 9000, pagosNuevos: 0,
    });
    assert(v.put_aceptado, `HTTP ${http} sí es aceptado`);
  }
});

check("J. Sin importe legible no se inventa un resultado", () => {
  const v = veredictoDeCambio({
    putHttp: 200, antes: null, despues: null, objetivo: 9000, pagosNuevos: 0,
  });
  assert(v.importe_aplicado === false, "null no es el objetivo");
  assert(v.importe_cambiado === false, "de null a null no hay cambio");
});

console.log(`\nMP-SBX-01C · veredicto: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
