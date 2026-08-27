import "server-only";

import type { AiRequest, AiResult, QualityAiProvider } from "../provider";

/**
 * Trazaloop · QUALITY-12 · §131 · El doble determinístico.
 *
 * PARA QUÉ EXISTE
 *
 * Para que la suite compruebe TODO lo que rodea al modelo —el contexto
 * autorizado, las citas, los permisos, las barreras, los topes— sin gastar una
 * llamada real y sin que un servicio de terceros decida si la suite pasa hoy.
 * Y para que, cuando no hay credencial configurada, la aplicación siga en pie y
 * lo diga en vez de romperse (§164).
 *
 * QUÉ NO ES
 *
 * No es un modelo. No interpreta nada. Compone una respuesta a partir del
 * contexto que el servidor ya construyó, cita SOLO las referencias que ese
 * contexto trae, y cuando no hay contexto dice que no hay información
 * suficiente. Es, deliberadamente, lo más aburrido posible: si una prueba pasa
 * con esto, pasa por la arquitectura y no por la elocuencia del modelo.
 *
 * LOS DISPARADORES DE PRUEBA
 *
 * Reconoce marcas dentro de la pregunta para poder ejercitar los caminos de
 * fallo: `[[TEST:timeout]]`, `[[TEST:unavailable]]`, `[[TEST:invalid]]`. No
 * son magia: son la única forma de comprobar el comportamiento ante un
 * proveedor caído sin tirar el proveedor.
 *
 * QUALITY-12.1 · TAMBIÉN AGRUPA TEMAS, PERO SIN LEER
 *
 * Cuando la tarea es la de temas de clientes, agrupa los comentarios anónimos
 * por la campaña de la que vienen. No es análisis de contenido —no lo pretende—:
 * es una agrupación real y comprobable que permite ejercitar la persistencia,
 * la procedencia y los recuentos sin depender de que un modelo acierte.
 */
export function fakeProvider(): QualityAiProvider {
  return {
    name: "fake",
    async generateStructured(req: AiRequest): Promise<AiResult> {
      const pregunta = req.messages.map((m) => m.content).join("\n");

      if (pregunta.includes("[[TEST:timeout]]")) {
        return { ok: false, kind: "timeout", message: "El proveedor tardó más de lo permitido." };
      }
      if (pregunta.includes("[[TEST:unavailable]]")) {
        return { ok: false, kind: "unavailable", message: "No se pudo contactar con el proveedor." };
      }
      if (pregunta.includes("[[TEST:invalid]]")) {
        return { ok: true, value: { esto: "no cumple el esquema" }, usage: uso(pregunta), raw: "{}" };
      }

      // Las referencias que el SERVIDOR puso en el contexto, numeradas.
      const referencias = [...pregunta.matchAll(/^\[(\d+)\]\s+(.+)$/gm)]
        .map((m) => ({ n: Number(m[1]), etiqueta: m[2].trim() }));

      // Los hechos que el servidor ya calculó, que es de donde salen los
      // números: el doble no cuenta nada, igual que no debe contar el modelo.
      const hechos = [...pregunta.matchAll(/^· (.+?) \[(\d+(?:, ?\d+)*)\]$/gm)]
        .map((m) => ({
          statement: m[1].trim(),
          references: m[2].split(",").map((x) => Number(x.trim())),
        }));

      if (referencias.length === 0) {
        return {
          ok: true,
          usage: uso(pregunta),
          raw: "",
          value: {
            summary: "No encontré información suficiente en Trazaloop para responder a esto.",
            facts: [],
            interpretation: [],
            suggestions: [],
            unanswered: ["No hay datos autorizados que respondan a la pregunta."],
            evidence: "missing",
            themes: [],
          },
        };
      }

      return {
        ok: true,
        usage: uso(pregunta),
        raw: "",
        value: {
          summary: `Se revisaron ${referencias.length} fuente(s) autorizada(s) de Trazaloop.`,
          facts: hechos.length > 0
            ? hechos
            : referencias.slice(0, 5).map((r) => ({
                statement: r.etiqueta, references: [r.n],
              })),
          interpretation: hechos.length > 0
            ? ["Lo anterior son los datos tal como están registrados; conviene contrastarlos con quien conoce el proceso."]
            : [],
          suggestions: [],
          unanswered: [],
          evidence: hechos.length > 0 ? "sufficient" : "limited",
          themes: temas(req.system, referencias),
        },
      };
    },
  };
}

/**
 * Los temas, solo cuando la tarea es la de temas. Se agrupa por campaña porque
 * es lo que la etiqueta de la referencia dice de verdad; inventar temas por el
 * contenido sería justo lo que un doble determinístico no puede hacer.
 */
function temas(system: string, referencias: { n: number; etiqueta: string }[]) {
  if (!system.includes("Agrupa comentarios de clientes en temas")) return [];

  const porCampana = new Map<string, number[]>();
  for (const r of referencias) {
    const m = /campaña (.+)$/.exec(r.etiqueta);
    if (!m) continue;
    const campana = m[1].trim();
    const lista = porCampana.get(campana) ?? [];
    lista.push(r.n);
    porCampana.set(campana, lista);
  }

  return [...porCampana.entries()].map(([campana, nums]) => ({
    key: campana.toLowerCase().slice(0, 80),
    label: `Comentarios de ${campana}`,
    summary: "Agrupación por campaña de origen. No es un análisis del contenido.",
    sentiment: "unknown",
    references: nums,
  }));
}

/** Un recuento aproximado, para que los topes y el informe de consumo tengan
 *  algo que enseñar también sin proveedor real. */
function uso(texto: string) {
  return { inputTokens: Math.ceil(texto.length / 4), outputTokens: 120 };
}
