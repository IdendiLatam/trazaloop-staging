import "server-only";

import { aiApiKey, aiConfig, aiCredentialConfigured, type AiModelConfig } from "./config";
import { anthropicProvider } from "./providers/anthropic";
import { fakeProvider } from "./providers/fake";
import { openaiProvider } from "./providers/openai";

/**
 * Trazaloop · QUALITY-12 · §5 · El contrato del proveedor.
 *
 * POR QUÉ HAY UNA ABSTRACCIÓN Y NO UNA LLAMADA DIRECTA
 *
 * No es por gusto arquitectónico. Es porque el dominio Quality tiene que poder
 * comprobarse SIN gastar una llamada real —y sin depender de que un servicio de
 * terceros esté de pie para que la suite pase—, y porque el proveedor de hoy no
 * tiene por qué ser el de dentro de un año. Lo que no cambia es el contrato:
 * texto entra, estructura validada sale, y un puñado de metadatos que se
 * guardan con la ejecución.
 *
 * LO QUE EL CONTRATO NO OFRECE, A PROPÓSITO
 *
 * · No hay `runSql`, ni `queryTable`, ni nada que ejecute lo que el modelo
 *   escriba (§10). Las herramientas son de LECTURA y están tipadas (§70).
 * · No hay forma de que el proveedor escriba en la base. Ninguna.
 */

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiRequest = {
  /** La política del sistema. Es CÓDIGO versionado, no algo que el tenant edite. */
  system: string;
  /** El material: contexto autorizado + pregunta, ya separados y etiquetados. */
  messages: AiMessage[];
  /** El esquema que debe cumplir la respuesta. */
  schemaName: string;
  schema: Record<string, unknown>;
  config: AiModelConfig;
};

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  /** §12 · Lo que el proveedor informe, si lo informa. No se inventa ninguno:
   *  un campo ausente se queda en `null` y el informe lo muestra vacío. */
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
};

export type AiResult =
  | { ok: true; value: unknown; usage: AiUsage; raw: string }
  | { ok: false; kind: AiFailure; message: string; usage?: AiUsage };

/** §85/§86/§26 · Las cuatro formas de fallar, distinguidas porque se tratan
 *  distinto: una se reintenta, otra se rechaza y otra apaga el Copilot. */
export type AiFailure = "unavailable" | "timeout" | "invalid_output" | "refused";

export type QualityAiProvider = {
  name: string;
  /** §25 · Lo único que el dominio usa: estructura validada. */
  generateStructured(req: AiRequest): Promise<AiResult>;
};

/**
 * El proveedor vigente. Si no hay credencial configurada, devuelve el doble
 * determinístico y lo dice: es preferible una respuesta honesta y acotada a una
 * pantalla rota, y la interfaz avisa de que la IA no está configurada (§164).
 */
export function resolveProvider(): { provider: QualityAiProvider; live: boolean } {
  const cfg = aiConfig();
  const key = aiApiKey();

  // §62 · Sin credencial NO se llama a nadie, y no se disimula: se responde con
  // el doble y la pantalla dice que falta configurar el proveedor.
  if (key) {
    if (cfg.provider === "openai") return { provider: openaiProvider(key), live: true };
    if (cfg.provider === "anthropic") return { provider: anthropicProvider(key), live: true };
  }
  return { provider: fakeProvider(), live: false };
}

export function providerIsLive(): boolean {
  const cfg = aiConfig();
  return (cfg.provider === "openai" || cfg.provider === "anthropic")
    && aiCredentialConfigured();
}
