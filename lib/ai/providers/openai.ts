import "server-only";

import OpenAI from "openai";
import { APIError } from "openai";
import type { AiRequest, AiResult, AiUsage, QualityAiProvider } from "../provider";

/**
 * Trazaloop · QUALITY-12.1 · El proveedor real: OpenAI.
 *
 * POR QUÉ EL SDK OFICIAL Y NO `fetch`
 *
 * En QUALITY-12 se eligió `fetch` para el adaptador de Anthropic porque hacía
 * una llamada simple y añadir una dependencia entera no compensaba. Aquí no es
 * lo mismo: la Responses API con Structured Outputs tiene una forma concreta
 * —`text.format`, `store`, `reasoning`, el detalle de `usage`— y sus errores
 * vienen tipados por clase, que es exactamente lo que hace falta para
 * distinguir un 401 de un 429 de un tiempo agotado sin adivinar por el texto.
 * Reimplementar eso a mano sería copiar el SDK peor.
 *
 * QUÉ SE LE PIDE, Y QUÉ NO
 *
 *   store: false            · Trazaloop guarda su propia procedencia. No hace
 *                             falta que el proveedor conserve nada nuestro.
 *   reasoning: low          · es un resumidor con fuentes delante, no un
 *                             solucionador de problemas abiertos.
 *   sin temperature         · los modelos de razonamiento no la usan, y
 *                             mandarla es pedir un comportamiento que no existe.
 *   sin herramientas        · ni búsqueda web, ni ficheros, ni intérprete. El
 *                             contexto lo construye el servidor: abrirle
 *                             internet al modelo sería justo lo contrario de
 *                             «fundado en Trazaloop».
 */

/** §5 · Structured Outputs en modo estricto exige que cada objeto declare todas
 *  sus propiedades como obligatorias y prohíba las demás. El esquema del
 *  dominio ya lo cumple casi entero; esto lo termina sin tocarlo, para que
 *  Anthropic siga recibiendo el suyo tal cual. */
function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema === null || typeof schema !== "object") return schema;
  const salida: Record<string, unknown> = { ...schema };

  if (salida.type === "object" && salida.properties && typeof salida.properties === "object") {
    const props = salida.properties as Record<string, unknown>;
    const convertidas: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      convertidas[k] = strictSchema(v as Record<string, unknown>);
    }
    salida.properties = convertidas;
    salida.additionalProperties = false;
    salida.required = Object.keys(convertidas);
  }
  if (salida.type === "array" && salida.items && typeof salida.items === "object") {
    salida.items = strictSchema(salida.items as Record<string, unknown>);
  }
  return salida;
}

export function openaiProvider(apiKey: string): QualityAiProvider {
  return {
    name: "openai",
    async generateStructured(req: AiRequest): Promise<AiResult> {
      const client = new OpenAI({
        apiKey,
        // §16/§17 · El tiempo lo pone Trazaloop, y los reintentos los hace el
        // SDK solo sobre errores transitorios. Uno basta: si el proveedor está
        // caído, insistir alarga la espera del usuario sin cambiar el final.
        timeout: req.config.timeoutMs,
        maxRetries: 1,
      });

      try {
        const res = await client.responses.create({
          model: req.config.model,
          // La política del sistema va donde va la política, no mezclada con
          // el material del tenant.
          instructions: req.system,
          input: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          text: {
            format: {
              type: "json_schema",
              name: req.schemaName,
              schema: strictSchema(req.schema),
              strict: true,
            },
          },
          reasoning: { effort: req.config.reasoningEffort },
          max_output_tokens: req.config.maxOutputTokens,
          // §6 · Trazaloop conserva su propia procedencia.
          store: false,
        });

        const usage: AiUsage = {
          inputTokens: res.usage?.input_tokens ?? null,
          outputTokens: res.usage?.output_tokens ?? null,
          cachedInputTokens: res.usage?.input_tokens_details?.cached_tokens ?? null,
          reasoningTokens: res.usage?.output_tokens_details?.reasoning_tokens ?? null,
          totalTokens: res.usage?.total_tokens ?? null,
        };

        // §51 · Una negativa del modelo NO es una respuesta de negocio con otra
        // forma: es otra cosa, y se trata como tal.
        const rechazo = negativa(res);
        if (rechazo) {
          return { ok: false, kind: "refused", message: rechazo, usage };
        }

        // §50 · El texto tiene que ser el JSON del esquema. Si el modelo se
        // quedó sin espacio a mitad, `output_text` viene truncado y esto falla
        // aquí, que es donde debe fallar.
        const texto = res.output_text ?? "";
        if (texto.trim().length === 0) {
          return {
            ok: false, kind: "invalid_output", usage,
            message: res.status === "incomplete"
              ? "El modelo se quedó sin espacio antes de terminar la respuesta."
              : "El proveedor devolvió una respuesta vacía.",
          };
        }

        let valor: unknown;
        try {
          valor = JSON.parse(texto);
        } catch {
          return {
            ok: false, kind: "invalid_output", usage,
            message: "El proveedor no devolvió la estructura pedida.",
          };
        }
        return { ok: true, value: valor, usage, raw: texto };
      } catch (e) {
        return mapearError(e);
      }
    },
  };
}

/** Busca una negativa explícita entre los bloques de salida. */
function negativa(res: { output?: unknown[] }): string | null {
  for (const item of (res.output ?? []) as { content?: unknown[] }[]) {
    for (const parte of (item.content ?? []) as { type?: string; refusal?: string }[]) {
      if (parte?.type === "refusal") {
        return parte.refusal && parte.refusal.length > 0
          ? `El modelo se negó a responder: ${limpiar(parte.refusal)}`
          : "El modelo se negó a responder.";
      }
    }
  }
  return null;
}

/**
 * §15 · Cada error a su categoría, porque cada una se trata distinto: un 401 es
 * un problema de configuración que hay que ver en el informe, un 429 se puede
 * reintentar más tarde, y un tiempo agotado no es lo mismo que un proveedor
 * caído.
 *
 * §10 · Y de ningún error sale nunca la credencial: se guarda el estado y un
 * resumen limpio, jamás la petición ni sus cabeceras.
 */
function mapearError(e: unknown): AiResult {
  if (e instanceof APIError) {
    const status = e.status;
    if (status === 401 || status === 403) {
      return {
        ok: false, kind: "unavailable",
        message: "El proveedor rechazó las credenciales configuradas en el servidor.",
      };
    }
    if (status === 429) {
      return {
        ok: false, kind: "unavailable",
        message: "El proveedor está limitando las peticiones. Inténtalo en un momento.",
      };
    }
    if (status === 400 || status === 422) {
      return {
        ok: false, kind: "refused",
        message: `El proveedor rechazó la petición (${status}).`,
      };
    }
    if (typeof status === "number" && status >= 500) {
      return {
        ok: false, kind: "unavailable",
        message: `El proveedor respondió ${status}.`,
      };
    }
    // Abortos y errores de conexión llegan como APIError sin estado.
    const nombre = e.constructor?.name ?? "";
    if (nombre.includes("Timeout") || nombre.includes("Abort")) {
      return { ok: false, kind: "timeout", message: "El proveedor tardó más de lo permitido." };
    }
    return { ok: false, kind: "unavailable", message: "No se pudo contactar con el proveedor." };
  }

  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return { ok: false, kind: "timeout", message: "El proveedor tardó más de lo permitido." };
  }
  return { ok: false, kind: "unavailable", message: "No se pudo contactar con el proveedor." };
}

/** Un mensaje ajeno puede traer cualquier cosa; se limpia antes de guardarlo. */
function limpiar(texto: string): string {
  return texto.replace(new RegExp("[\\u0000-\\u001f\\u007f]", "g"), " ").slice(0, 200);
}
