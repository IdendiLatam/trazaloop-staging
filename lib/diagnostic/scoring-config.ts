import {
  PCR_V1_SCORING, type ReadinessLevel, type ScoringConfig, type ScoringLevelRule,
} from "@/lib/diagnostic/scoring";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · El perfil guardado, leído sin inventar.
 *
 *
 * POR QUÉ ESTO EXISTE
 *
 * 0195 congeló los umbrales en `diagnostic_versions.scoring_config` para que
 * mover un 75 a un 80 no cambiara el nivel de un diagnóstico ya cerrado. Pero
 * congelar el dato no sirve de nada si al puntuar se siguen usando las
 * constantes del código: había que traer el perfil desde la versión hasta el
 * motor, y eso pasa por convertir un JSON en la forma que el motor entiende.
 *
 *
 * FALLA CERRADO, Y ES DELIBERADO
 *
 * Ante un perfil ausente o mal formado esto devuelve `null` y quien llama NO
 * puntúa. La tentación era caer en `PCR_V1_SCORING` «por si acaso»: sería
 * exactamente el defecto que 0195 cerró, porque un resultado saldría con los
 * umbrales de HOY sin que nadie se enterara. Mejor no cerrar el diagnóstico
 * que cerrarlo con un perfil que no es el suyo.
 *
 * Lógica PURA: sin base de datos, para poder compararla con el motor.
 */

const NIVELES: readonly ReadinessLevel[] = [
  "low", "medium", "high", "audit_ready_candidate",
];

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** El perfil tal como lo guarda 0195, o `null` si no se puede confiar en él. */
export function parseScoringConfig(raw: unknown): ScoringConfig | null {
  if (!esObjeto(raw)) return null;

  const decimales = raw.rounding_decimals;
  if (typeof decimales !== "number" || !Number.isInteger(decimales)
      || decimales < 0 || decimales > 10) return null;

  const niveles = raw.levels;
  if (!Array.isArray(niveles) || niveles.length === 0) return null;

  const levels: ScoringLevelRule[] = [];
  for (const n of niveles) {
    if (!esObjeto(n)) return null;
    const code = n.code;
    if (typeof code !== "string"
        || !NIVELES.includes(code as ReadinessLevel)) return null;
    const min = n.min_percent;
    if (typeof min !== "number" || min < 0 || min > 100) return null;
    const tope = n.max_critical_gaps;
    // `null` significa «sin tope» y es un valor legítimo, no un dato ausente:
    // hay que distinguirlo de `undefined`, que sí sería un perfil incompleto.
    if (tope !== null && (typeof tope !== "number" || !Number.isInteger(tope)
        || tope < 0)) return null;
    levels.push({
      code: code as ReadinessLevel,
      minPercent: min,
      maxCriticalGaps: tope === null ? null : tope,
    });
  }

  // Todo perfil tiene que poder responder algo a cualquier entrada: sin un
  // peldaño sin tope y con mínimo cero, una empresa podría quedarse sin nivel.
  const haySuelo = levels.some(
    (l) => l.minPercent <= 0 && l.maxCriticalGaps === null);
  if (!haySuelo) return null;

  return { roundingDecimals: decimales, levels };
}

/**
 * ¿Este perfil es exactamente el de PCR v1?
 *
 * Sirve para una sola cosa —demostrar que lo guardado en 0195 y lo que hay en
 * el código no han divergido— y por eso vive aquí y no en una prueba: si algún
 * día divergen, quiero que lo diga el mismo módulo que los une.
 */
export function isPcrV1Profile(config: ScoringConfig): boolean {
  return JSON.stringify(config) === JSON.stringify(PCR_V1_SCORING);
}
