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

export type AiProviderName = "openai" | "anthropic" | "fake";

/** §13 · Cuánto piensa el modelo antes de responder. El Copilot resume datos
 *  que ya tiene delante y los cita: no está resolviendo un problema abierto.
 *  `low` da la calidad que hace falta sin pagar latencia ni tokens de más, y
 *  se puede subir por configuración sin tocar código. */
export type AiReasoningEffort = "minimal" | "low" | "medium" | "high";

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
  /** §13 · Solo lo usan los modelos que razonan; los demás lo ignoran. */
  reasoningEffort: AiReasoningEffort;
};

/** La configuración vigente. Es server-only y se lee entera en cada ejecución. */
export function aiConfig(): AiModelConfig {
  const provider = (process.env.QUALITY_AI_PROVIDER ?? "").trim().toLowerCase();
  const model = (process.env.QUALITY_AI_MODEL ?? "").trim();

  return {
    // §61 · Un proveedor que no se reconoce NO cae en silencio sobre otro: cae
    // sobre el doble determinístico, que no llama a nadie y lo dice en pantalla.
    // Elegir OpenAI porque alguien escribió mal «anthropic» sería exactamente
    // el fallo silencioso que este sprint tiene que evitar.
    provider: provider === "openai" ? "openai"
      : provider === "anthropic" ? "anthropic"
        : "fake",
    model: model.length > 0 ? model : defaultModel(provider),
    maxOutputTokens: intFromEnv("QUALITY_AI_MAX_OUTPUT_TOKENS", 1500, 200, 8000),
    temperature: 0,
    timeoutMs: intFromEnv("QUALITY_AI_TIMEOUT_MS", 30_000, 3_000, 120_000),
    contextBudgetChars: intFromEnv("QUALITY_AI_CONTEXT_BUDGET", 24_000, 2_000, 120_000),
    maxQuestionChars: intFromEnv("QUALITY_AI_MAX_QUESTION", 1_200, 100, 4_000),
    maxToolCalls: intFromEnv("QUALITY_AI_MAX_TOOL_CALLS", 4, 0, 12),
    reasoningEffort: effortFromEnv(),
  };
}

/** §63 · El modelo lo pone el SERVIDOR. Nunca llega del navegador, y cada
 *  proveedor tiene el suyo por omisión para que una configuración a medias no
 *  acabe pidiendo un modelo que no existe en ese proveedor. */
function defaultModel(provider: string): string {
  if (provider === "openai") return "gpt-5.4-mini";
  if (provider === "anthropic") return "claude-sonnet-5";
  return "doble-determinista-1";
}

function effortFromEnv(): AiReasoningEffort {
  const v = (process.env.QUALITY_AI_REASONING_EFFORT ?? "").trim().toLowerCase();
  return v === "minimal" || v === "low" || v === "medium" || v === "high"
    ? (v as AiReasoningEffort)
    : "low";
}

/** §164 · Si no hay credencial, la pantalla lo explica en vez de fallar. */
export function aiCredentialConfigured(): boolean {
  const provider = (process.env.QUALITY_AI_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "fake") return true;
  // §9 · Se comprueba que HAY algo con forma de credencial, no que empiece por
  // un prefijo concreto: los prefijos cambian y una comprobación rígida acaba
  // rechazando una clave buena. Lo que importa es no llamar con la cadena
  // vacía ni con un «PENDIENTE» que alguien dejó puesto (§62).
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
