import "server-only";

import type { AiRequest, AiResult, QualityAiProvider } from "../provider";

/**
 * Trazaloop · QUALITY-12 · §5 · La única integración real.
 *
 * POR QUÉ `fetch` Y NO UN SDK
 *
 * El repositorio no tenía ninguna dependencia de IA. Añadir un SDK para hacer
 * una llamada HTTP con un esquema es cargar una cadena de suministro entera
 * —con sus actualizaciones y sus sorpresas— a cambio de ahorrar cuarenta
 * líneas. Cuando haga falta streaming o herramientas complejas se revisará;
 * hoy no hace falta.
 *
 * CÓMO SE OBTIENE ESTRUCTURA
 *
 * Con una herramienta de un solo uso: se le declara al modelo una herramienta
 * cuyo `input_schema` es el esquema de la respuesta y se le exige usarla. Es
 * más fiable que pedir «devuelve JSON» y esperar suerte, y deja la validación
 * del lado del servidor igualmente (§26): que el proveedor diga que cumplió no
 * es motivo para creerle.
 */
export function anthropicProvider(apiKey: string): QualityAiProvider {
  return {
    name: "anthropic",
    async generateStructured(req: AiRequest): Promise<AiResult> {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), req.config.timeoutMs);

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: control.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: req.config.model,
            max_tokens: req.config.maxOutputTokens,
            temperature: req.config.temperature,
            system: req.system,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
            tools: [{
              name: req.schemaName,
              description: "La estructura EXACTA en la que se debe responder.",
              input_schema: req.schema,
            }],
            tool_choice: { type: "tool", name: req.schemaName },
          }),
        });

        if (!res.ok) {
          // El cuerpo del error puede traer detalles del proveedor. Se lee lo
          // justo para poder distinguir qué pasó, y no se guarda entero.
          const detalle = (await res.text()).slice(0, 300);
          return {
            ok: false,
            kind: res.status === 429 || res.status >= 500 ? "unavailable" : "refused",
            message: `El proveedor respondió ${res.status}. ${resumen(detalle)}`,
          };
        }

        const cuerpo = await res.json() as {
          content?: { type: string; name?: string; input?: unknown }[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const uso = {
          inputTokens: cuerpo.usage?.input_tokens ?? null,
          outputTokens: cuerpo.usage?.output_tokens ?? null,
        };
        const bloque = (cuerpo.content ?? []).find(
          (c) => c.type === "tool_use" && c.name === req.schemaName);

        if (!bloque || bloque.input === undefined) {
          return {
            ok: false, kind: "invalid_output", usage: uso,
            message: "El proveedor no devolvió la estructura pedida.",
          };
        }
        return { ok: true, value: bloque.input, usage: uso, raw: JSON.stringify(bloque.input) };
      } catch (e) {
        const abortado = e instanceof Error && e.name === "AbortError";
        return {
          ok: false,
          kind: abortado ? "timeout" : "unavailable",
          message: abortado
            ? "El proveedor tardó más de lo permitido."
            : "No se pudo contactar con el proveedor.",
        };
      } finally {
        clearTimeout(reloj);
      }
    },
  };
}

/** Un detalle de error puede traer caracteres de control; se limpia antes de
 *  mirarlo, por la misma razón por la que se limpia cualquier dato ajeno. */
function resumen(texto: string): string {
  return texto.replace(new RegExp("[\\u0000-\\u001f\\u007f]", "g"), " ").slice(0, 160);
}
