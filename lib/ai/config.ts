import "server-only";

/**
 * Trazaloop · QUALITY-12 · §7 · La configuración del modelo, en UN sitio.
 *
 * POR QUÉ NO ESTÁ REPARTIDA
 *
 * Un modelo escrito a mano en quince archivos es un modelo que nadie puede
 * cambiar: el día que haya que subirlo de versión habrá que encontrar los
 * quince, y el que se quede atrás producirá respuestas distintas sin que nadie
 * lo note. Aquí está una vez, y cada ejecución guarda con cuál se produjo
 * (§121): cambiar esto mañana NO reescribe lo que se respondió ayer.
 *
 * POR QUÉ LA CLAVE NO ESTÁ AQUÍ
 *
 * Porque no está en ninguna parte del repositorio. Se lee del entorno del
 * SERVIDOR (§6) y no se imprime nunca: ni en un log, ni en un PDF, ni en la
 * base, ni en la respuesta de una acción.
 */

export type AiProviderName = "anthropic" | "fake";

export type AiModelConfig = {
  provider: AiProviderName;
  model: string;
  /** Tope de salida. Un tope alto no mejora la respuesta: alarga la factura. */
  maxOutputTokens: number;
  /** Baja a propósito: esto resume hechos, no escribe poesía. */
  temperature: number;
  /** §86 · Más allá de esto se cancela y se dice que el Copilot no está. */
  timeoutMs: number;
  /** §73 · Presupuesto de contexto, en caracteres aproximados. */
  contextBudgetChars: number;
  /** §90 · Lo que una persona puede escribir de una vez. */
  maxQuestionChars: number;
  /** §72 · Cuántas veces puede pedir datos el modelo en una misma consulta. */
  maxToolCalls: number;
};

/** La configuración vigente. Es server-only y se lee entera en cada ejecución. */
export function aiConfig(): AiModelConfig {
  const provider = (process.env.QUALITY_AI_PROVIDER ?? "").trim().toLowerCase();
  const model = (process.env.QUALITY_AI_MODEL ?? "").trim();

  return {
    // Sin proveedor configurado, el Copilot no se inventa uno: queda apagado y
    // lo dice. El doble determinístico solo entra si se pide explícitamente.
    provider: provider === "anthropic" ? "anthropic" : provider === "fake" ? "fake" : "fake",
    model: model.length > 0 ? model : "claude-sonnet-5",
    maxOutputTokens: intFromEnv("QUALITY_AI_MAX_OUTPUT_TOKENS", 1500, 200, 8000),
    temperature: 0,
    timeoutMs: intFromEnv("QUALITY_AI_TIMEOUT_MS", 30_000, 3_000, 120_000),
    contextBudgetChars: intFromEnv("QUALITY_AI_CONTEXT_BUDGET", 24_000, 2_000, 120_000),
    maxQuestionChars: intFromEnv("QUALITY_AI_MAX_QUESTION", 1_200, 100, 4_000),
    maxToolCalls: intFromEnv("QUALITY_AI_MAX_TOOL_CALLS", 4, 0, 12),
  };
}

/** §164 · Si no hay credencial, la pantalla lo explica en vez de fallar. */
export function aiCredentialConfigured(): boolean {
  const provider = (process.env.QUALITY_AI_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "fake") return true;
  return (process.env.QUALITY_AI_API_KEY ?? "").trim().length > 20;
}

/** La clave, solo para el adaptador. Nunca sale de este módulo hacia arriba. */
export function aiApiKey(): string | null {
  const k = (process.env.QUALITY_AI_API_KEY ?? "").trim();
  return k.length > 20 ? k : null;
}

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt((process.env[name] ?? "").trim(), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}
