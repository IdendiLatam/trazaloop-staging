/**
 * Trazaloop · MP-SBX-01C · El veredicto de un cambio de importe.
 *
 * POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO TRES LÍNEAS DENTRO DE LA RUTA
 *
 * La primera versión vivía dentro del manejador y comparaba el importe leído
 * después contra el importe pedido. En un cambio real eso parece razonable; en
 * una prueba NO-OP —donde el objetivo es el mismo valor que ya había— resultó
 * ser una mentira: el proveedor devolvió 400, no cambió nada, y el veredicto
 * dijo «importe aplicado» porque el número coincidía.
 *
 * Un veredicto que confunde «no hizo falta cambiar nada» con «se aplicó el
 * cambio» es peor que no tener veredicto, porque se lee rápido y se cree. Aquí
 * está aparte para poder ejercitarlo con los casos reales, incluido el que nos
 * engañó.
 *
 * LAS TRES PREGUNTAS, QUE SON DISTINTAS
 *
 *   · ¿Aceptó el proveedor la petición?      → `putAceptado`
 *   · ¿Quedó el importe que se pedía?        → `importeAplicado`
 *   · ¿Cambió respecto de lo que había?      → `importeCambiado`
 *
 * Sin un 2xx, las tres son falsas. No «probablemente»: falsas. Que el número
 * leído después coincida con el pedido no dice nada cuando la petición fue
 * rechazada — dice que nadie tocó nada.
 */

export type EntradaVeredicto = {
  /** Código HTTP que devolvió el `PUT`. */
  putHttp: number;
  /** Importe antes de pedir el cambio, leído del proveedor. */
  antes: number | null;
  /** Importe después, releído del proveedor (no el eco del `PUT`). */
  despues: number | null;
  /** Importe que se pidió. En un NO-OP coincide con `antes`, y ahí está la trampa. */
  objetivo: number;
  /** Cuántos pagos aparecieron entre la foto previa y la posterior. */
  pagosNuevos: number;
};

export type Veredicto = {
  put_aceptado: boolean;
  importe_aplicado: boolean;
  importe_cambiado: boolean;
  cobro_inmediato: boolean;
  /** Qué se puede concluir, dicho en una línea. */
  lectura: string;
};

export function veredictoDeCambio(e: EntradaVeredicto): Veredicto {
  const putAceptado = e.putHttp >= 200 && e.putHttp < 300;
  const importeAplicado = putAceptado && e.despues === e.objetivo;
  const importeCambiado = putAceptado && e.antes !== e.despues;
  // Un cobro solo cuenta si la petición se aceptó: si el proveedor la rechazó,
  // un pago que aparezca en esa ventana es del ciclo, no del cambio.
  const cobroInmediato = putAceptado && e.pagosNuevos > 0;

  const lectura = !putAceptado
    ? `El proveedor rechazó la petición (HTTP ${e.putHttp}). No se cambió nada y `
      + "no se puede concluir nada sobre la semántica del cambio de importe."
    : !importeCambiado && e.objetivo === e.antes
      ? "PUT aceptado sobre el mismo importe: demuestra que la petición mínima es "
        + "válida, y NADA sobre qué pasa al cambiar la cifra."
      : importeAplicado
        ? (cobroInmediato
          ? `El importe quedó en ${e.despues} y aparecieron ${e.pagosNuevos} pago(s) `
            + "en la misma ventana: hay indicio de cobro provocado por el cambio."
          : `El importe quedó en ${e.despues} sin pagos nuevos: el cambio no cobró `
            + "en el acto.")
        : `El proveedor aceptó la petición pero el importe quedó en ${e.despues}, `
          + `y se había pedido ${e.objetivo}.`;

  return {
    put_aceptado: putAceptado,
    importe_aplicado: importeAplicado,
    importe_cambiado: importeCambiado,
    cobro_inmediato: cobroInmediato,
    lectura,
  };
}
