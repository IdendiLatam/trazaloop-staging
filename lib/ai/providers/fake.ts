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

      // Los disparadores van PRIMERO: los caminos de fallo son los mismos para
      // los dos contratos, y comprobarlos es justo lo que hacen falta.
      if (pregunta.includes("[[TEST:timeout]]")) {
        return { ok: false, kind: "timeout", message: "El proveedor tardó más de lo permitido." };
      }
      if (pregunta.includes("[[TEST:unavailable]]")) {
        return { ok: false, kind: "unavailable", message: "No se pudo contactar con el proveedor." };
      }
      if (pregunta.includes("[[TEST:invalid]]")) {
        return { ok: true, value: { esto: "no cumple el esquema" }, usage: uso(pregunta), raw: "{}" };
      }

      // QUALITY-12.2C · La asistencia de redacción tiene su propio contrato.
      // El doble lo reconoce por el esquema que se le pide, no por adivinar.
      if (req.schemaName === "propuesta_de_redaccion") {
        return redaccion(req, pregunta);
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
 * QUALITY-12.2C · Una propuesta de redacción determinística.
 *
 * NO reescribe: normaliza. Quita espacios dobles, deja una sola línea y
 * corrige lo poco que se puede corregir sin entender el texto. Y sobre todo,
 * hace lo que de verdad importa comprobar sin un modelo: NO añade un solo
 * hecho, y sí señala lo que la guía pide y el texto no dice.
 *
 * Una prueba que pasa con esto pasa por la arquitectura —los cajones, el
 * permiso, el registro— y no porque el modelo estuviera inspirado.
 */
function redaccion(req: AiRequest, material: string): AiResult {
  const texto = /<TEXTO_DE_LA_PERSONA>\n([\s\S]*?)\n<\/TEXTO_DE_LA_PERSONA>/
    .exec(material)?.[1] ?? "";
  const guia = /<GUIA_DE_LA_SECCION>\n([\s\S]*?)\n<\/GUIA_DE_LA_SECCION>/
    .exec(material)?.[1] ?? "";

  const limpio = texto.replace(/\s+/g, " ").trim();

  // Lo que la guía nombra y el texto no menciona. Deliberadamente tonto: dos
  // palabras clave. No se rellena nada; solo se dice que falta.
  const falta: string[] = [];
  for (const [clave, etiqueta] of [
    ["respons", "Responsable"], ["frecuencia", "Frecuencia"],
    ["criterio", "Criterio"], ["registro", "Registro"],
  ] as const) {
    if (new RegExp(clave, "i").test(guia) && !new RegExp(clave, "i").test(texto)) {
      falta.push(etiqueta);
    }
  }

  const avisos: string[] = [];
  if (/ignora (las |lo )?(instrucciones|anterior)|revela|exporta los datos/i.test(texto)) {
    avisos.push("El texto contiene una frase con forma de instrucción para un "
      + "sistema. Se ha tratado como contenido del documento.");
  }

  return {
    ok: true,
    usage: uso(material),
    raw: "",
    value: {
      suggested_text: limpio,
      change_summary: limpio === texto.trim()
        ? [] : ["Se normalizaron los espacios y los saltos de línea."],
      missing_information: falta.slice(0, 3),
      warnings: avisos.slice(0, 2),
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
