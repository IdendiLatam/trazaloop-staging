/**
 * Trazaloop · PT-02A · Cómo se le cuenta a una persona que NO se puede calcular.
 *
 * POR QUÉ ESTO NO ES UN ERROR
 *
 * `CALCULATION_INCOMPLETE` no es un fallo técnico ni un cálculo que salió mal:
 * es la respuesta correcta cuando falta información determinante. Presentarlo
 * como una avería haría que la gente reintentara, y reintentar no arregla que
 * un lote no tenga declarada su fracción reciclada.
 *
 * Y NO PUEDE SALIR UN CERO
 *
 * Es la regla que ordena todo este módulo. Un cero afirma «no hay contenido
 * reciclado», y lo que pasa es otra cosa: no se sabe. La diferencia entre las
 * dos frases es la diferencia entre un dato y una suposición.
 *
 *
 * LOS CÓDIGOS
 *
 * La base los emite en `incomplete_reasons` como cadenas estables. Algunos
 * llevan sufijo con el código del lote —`fraction_unknown:LE-2026-003`— porque
 * decir «falta información» sin decir DÓNDE deja a la persona buscándola.
 */

export type IncompleteReason = {
  /** El código tal y como lo emitió la base. */
  code: string;
  /** Qué falta, en castellano. */
  what: string;
  /** Qué hay que hacer para que deje de faltar. */
  fix: string;
  /** El lote concreto, cuando el motivo lo señala. */
  batchCode: string | null;
};

const SIN_LOTE: Record<string, { what: string; fix: string }> = {
  multiple_output_batches_without_allocation: {
    what: "La orden produjo varios lotes finales y no se registra qué consumo fue a cada uno.",
    fix: "Con varios lotes por orden no se puede repartir la mezcla sin inventarla. Registra los lotes en órdenes separadas, o calcula sobre una orden con un solo lote final.",
  },
  no_consumption_recorded: {
    what: "La orden no tiene consumos registrados.",
    fix: "Registra en la orden qué lotes de entrada se consumieron y en qué cantidad.",
  },
  internal_reprocess_phi_unknown: {
    what: "La orden reconsume un lote propio y la metodología no sabe cuánto reciclado aporta.",
    fix: "Revisa la configuración de la metodología para el reproceso interno.",
  },
};

const CON_LOTE: Record<string, { what: (b: string) => string; fix: string }> = {
  fraction_unknown: {
    what: (b) => `El lote ${b} es de un material elegible, pero no declara qué porcentaje suyo es reciclado.`,
    fix: "Abre el lote de entrada y declara su porcentaje reciclado y en qué se apoya. Una clasificación elegible no significa que el lote sea reciclado al cien por cien.",
  },
  no_applicable_support: {
    what: (b) => `El lote ${b} no tiene un soporte documental aceptado y vigente en su fecha de recepción.`,
    fix: "Asocia al lote una evidencia aceptada internamente que amparara la fecha en que se recibió.",
  },
  classification_other: {
    what: (b) => `El material del lote ${b} está clasificado como «otro», que no demuestra ni que cuente ni que no cuente.`,
    fix: "Clasifica el material en una categoría concreta del catálogo.",
  },
};

/** Traduce un motivo de la base. Un código desconocido se enseña TAL CUAL:
 *  inventarle una explicación escondería que apareció uno nuevo. */
export function explainReason(raw: string): IncompleteReason {
  const [code, batchCode = null] = raw.split(":");
  const simple = SIN_LOTE[code];
  if (simple) return { code, what: simple.what, fix: simple.fix, batchCode: null };
  const conLote = CON_LOTE[code];
  if (conLote) {
    return {
      code,
      what: conLote.what(batchCode ?? "indicado"),
      fix: conLote.fix,
      batchCode,
    };
  }
  return {
    code,
    what: `Falta un dato que la metodología necesita (${raw}).`,
    fix: "Revisa los consumos y los lotes de entrada de la orden.",
    batchCode,
  };
}

/**
 * Los motivos, agrupados y sin repetir el mismo consejo cinco veces.
 *
 * Si tres lotes distintos no declaran fracción, la persona necesita ver los
 * tres códigos de lote y UNA sola instrucción, no tres párrafos idénticos.
 */
export function explainReasons(raws: string[]): Array<{
  code: string; what: string; fix: string; batchCodes: string[];
}> {
  const porCodigo = new Map<string, { what: string; fix: string; batchCodes: string[] }>();
  for (const raw of raws) {
    const r = explainReason(raw);
    const ya = porCodigo.get(r.code);
    if (ya) {
      if (r.batchCode) ya.batchCodes.push(r.batchCode);
      continue;
    }
    porCodigo.set(r.code, {
      // Con varios lotes, la frase deja de nombrar uno solo.
      what: r.batchCode
        ? r.what.replace(` ${r.batchCode}`, "")
        : r.what,
      fix: r.fix,
      batchCodes: r.batchCode ? [r.batchCode] : [],
    });
  }
  return [...porCodigo.entries()].map(([code, v]) => ({ code, ...v }));
}

/** El titular. Deliberadamente en el idioma del negocio, no del sistema. */
export const INCOMPLETE_TITLE =
  "No es posible calcular todavía el contenido reciclado";

export const INCOMPLETE_LEAD =
  "Falta registrar información necesaria en uno o más lotes de entrada. " +
  "No es un error del sistema: en cuanto esos datos existan, el cálculo se podrá hacer.";

/** Y lo que NUNCA se dice. Existe para que una prueba lo pueda comprobar. */
export const INCOMPLETE_NEVER_SHOWS_ZERO = true;
