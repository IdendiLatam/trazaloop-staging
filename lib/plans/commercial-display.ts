import type { CommercialTier } from "./types";
import { PLAN_LABEL } from "./types";

/**
 * Trazaloop · STABILIZATION-01 · Cómo se NOMBRA el estado comercial.
 *
 * EL DEFECTO QUE ESTE MÓDULO CIERRA
 *
 * Una empresa recién registrada recibe, por política, una concesión de PRUEBA
 * del plan Full durante 48 horas. El esquema lo distingue perfectamente: la
 * asignación lleva `grant_kind = 'trial'` y su propia fecha de fin, y al lado
 * sigue viva la concesión `base` de Free, que es lo que la empresa tiene
 * contratado de verdad.
 *
 * Lo que se perdía era el nombre. `organization_effective_plan_code` devuelve
 * solo el código —«full»— y las dos consolas pintaban `PLAN_LABEL["full"]`, es
 * decir «Full». Una empresa que no ha contratado nada leía en su panel que
 * tiene el plan de pago. No es un matiz de redacción: es decirle a alguien que
 * compró algo que no compró.
 *
 * Aquí vive la regla, sola y pura, para poder ejercitarla sin base de datos ni
 * navegador. Dos ejes que NO se mezclan:
 *
 *   · lo CONTRATADO  → qué paga la empresa           (concesión no-prueba)
 *   · lo EFECTIVO    → a qué tiene acceso ahora mismo (incluida la prueba)
 *
 * Cuando coinciden, el nombre es el de siempre. Cuando difieren porque hay una
 * prueba viva, el nombre lo dice: «Demo Full», y con la fecha si se sabe.
 */

export type GrantKind = "base" | "trial" | "sold" | "courtesy";

export type EstadoComercial = {
  /** Lo que la empresa tiene contratado. `null` = no se pudo determinar. */
  contractedPlanCode: CommercialTier | null;
  /** A lo que tiene acceso ahora, prueba incluida. `null` = no se pudo determinar. */
  effectivePlanCode: CommercialTier | null;
  /** De qué naturaleza es la concesión que manda hoy. */
  grantKind: GrantKind | null;
  /** Cuándo termina esa concesión, si termina. */
  grantEndsAt: string | null;
  /** La revisión del plan CONTRATADO, para poder preguntar sus cifras. */
  contractedPlanRevisionId?: string | null;
};

/** ¿Está la empresa dentro de una prueba que le da más de lo que paga? */
export function esAccesoDePrueba(e: EstadoComercial): boolean {
  return e.grantKind === "trial"
    && e.effectivePlanCode !== null
    && e.effectivePlanCode !== e.contractedPlanCode;
}

/**
 * El nombre que se enseña. Nunca afirma un plan que no se pudo leer: sin dato
 * no es Free, es «no disponible».
 */
export function etiquetaComercial(
  e: EstadoComercial,
  opciones?: { fecha?: (iso: string) => string }
): string {
  if (e.effectivePlanCode === null) return "No se pudo determinar";

  if (!esAccesoDePrueba(e)) return PLAN_LABEL[e.effectivePlanCode];

  const base = `Demo ${PLAN_LABEL[e.effectivePlanCode]}`;
  if (!e.grantEndsAt) return base;
  const fecha = opciones?.fecha
    ? opciones.fecha(e.grantEndsAt)
    : new Date(e.grantEndsAt).toISOString().slice(0, 10);
  return `${base} · hasta ${fecha}`;
}

/**
 * La frase de apoyo, para que no quede duda de qué se paga. Solo existe cuando
 * hay prueba: en el resto de casos el nombre ya lo dice todo.
 */
export function aclaracionDePrueba(e: EstadoComercial): string | null {
  if (!esAccesoDePrueba(e)) return null;
  const contratado = e.contractedPlanCode ? PLAN_LABEL[e.contractedPlanCode] : "Free";
  return `Acceso de prueba. La empresa no ha contratado `
    + `${PLAN_LABEL[e.effectivePlanCode as CommercialTier]}: su plan es ${contratado}.`;
}
