/**
 * Trazaloop · COMMERCIAL-UX-01C · El catálogo comercial, de lectura.
 *
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * Es una CAPA DE LECTURA. Toma lo que ya dicen las autoridades, lo junta en la
 * forma que una pantalla necesita, y para ahí.
 *
 *   precio      → `plan_revisions` publicadas
 *   límites     → `plan_revision_limits` de esa misma revisión
 *   prueba      → `commercial_trial_policy` + la revisión Full vigente
 *   texto       → `commercial-copy.ts`, que no contiene ni una cifra
 *
 * No escribe. No calcula precios. No calcula impuestos. No decide derechos. No
 * dice si un cobro puede ejecutarse. Y, sobre todo, NO sustituye a
 * `billing_create_quote`: lo que una página pública enseña y lo que el checkout
 * cobra pueden coincidir porque leen la misma autoridad debajo, pero el total
 * que se cobra —con su impuesto, su descuento y su tipo de cambio— lo produce
 * la base en el momento de contratar, y solo ella.
 *
 *
 * POR QUÉ ESTA FUNCIÓN ES PURA
 *
 * Recibe filas y devuelve el modelo. Así se puede ejercitar entera —incluido lo
 * que hace cuando la autoridad viene incompleta— sin base de datos y sin
 * navegador. Quien va a buscar las filas es `lib/db/commercial-catalog.ts`.
 *
 *
 * EL ACOMPAÑAMIENTO NO ESTÁ AQUÍ DENTRO
 *
 * `saasPlans` tiene exactamente los planes SaaS. El Acompañamiento sale en
 * `services`, en su propia lista, porque no es una alternativa a Full o Extra:
 * es algo que se suma a cualquiera de los dos.
 */
import {
  resolveTimeUsage, type TimeUsage, type LimitState,
} from "@/lib/plans/commercial-presentation";
import {
  PLAN_COPY, COMMERCIAL_SERVICES, TRIAL_COPY,
  type CommercialService,
} from "@/lib/plans/commercial-copy";

/** Una fila de `v_public_plan_catalog`, ya en castellano de TypeScript. */
export type CatalogPlanRow = {
  planCode: string;
  displayOrder: number;
  planRevisionId: string;
  displayName: string;
  description: string | null;
  publicConditions: string | null;
  priceState: "configured" | "not_configured";
  currency: string | null;
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
};

/** Una fila de `v_public_plan_limits`. */
export type CatalogLimitRow = {
  planCode: string;
  resourceCode: string;
  resourceLabel: string | null;
  unit: string | null;
  limitState: LimitState;
  limitValue: number | null;
};

export type TrialPolicyRow = {
  enabled: boolean;
  trialPlanCode: string;
  trialDurationHours: number;
};

/** Un límite ya interpretado, listo para presentarse. */
export type CatalogLimit = {
  resourceCode: string;
  label: string;
  unit: string | null;
  state: LimitState;
  value: number | null;
};

export type CommercialPlan = {
  code: string;
  /** El nombre de la AUTORIDAD. El titular público vive en `headline`. */
  displayName: string;
  headline: string;
  shortDescription: string;
  idealFor: string;
  displayOrder: number;
  featured: boolean;
  bullets: readonly string[];
  description: string | null;
  publicConditions: string | null;

  currency: string | null;
  /** Unidades MENORES y ANTES de impuestos, igual que en la autoridad. */
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
  /** `not_configured` no es gratis: es sin decidir. */
  priceState: "configured" | "not_configured";

  /** Bytes. `null` si la autoridad no lo declara. */
  storageBytes: number | null;
  /** Créditos al mes. `null` si la autoridad no lo declara. */
  aiCreditsMonthly: number | null;
  /** Nunca asume que un plan tenga minutos. */
  timeUsage: TimeUsage;

  /** Todos los límites públicos, por si una tabla comparativa los quiere. */
  limits: readonly CatalogLimit[];
};

export type CommercialTrial = {
  available: boolean;
  headline: string;
  shortDescription: string;
  /** El plan que la prueba concede de verdad. */
  effectivePlanCode: string;
  durationHours: number;
  cardRequired: boolean;
  /** «48 horas», ya escrito. Sale de la política, no de una constante local. */
  durationLabel: string;
  /**
   * El tiempo de uso DURANTE la prueba, heredado de la revisión vigente del
   * plan que concede. Se copia del plan, no se declara aparte: si se declarara
   * aparte, sería una segunda verdad que se desincronizaría en la primera
   * revisión nueva.
   */
  timeUsage: TimeUsage;
};

export type CommercialCatalog = {
  saasPlans: readonly CommercialPlan[];
  services: readonly CommercialService[];
  trial: CommercialTrial | null;
};

/** Los tres planes SaaS y su orden, cuando la copia no diga otra cosa. */
const ORDEN_POR_DEFECTO: Record<string, number> = { free: 1, full: 2, extra: 3 };

function limiteDe(limites: readonly CatalogLimit[], code: string): CatalogLimit | null {
  return limites.find((l) => l.resourceCode === code) ?? null;
}

function valorFinito(l: CatalogLimit | null): number | null {
  return l !== null && l.state === "finite" ? l.value : null;
}

/**
 * Junta las tres lecturas en el modelo que una pantalla puede pintar.
 *
 * Un plan sin copia declarada NO se descarta: se presenta con lo que la
 * autoridad dice de él. Ocultar un plan publicado porque a alguien se le olvidó
 * escribirle un titular sería peor que enseñarlo con su nombre técnico.
 */
export function buildCommercialCatalog(input: {
  plans: readonly CatalogPlanRow[];
  limits: readonly CatalogLimitRow[];
  trialPolicy: TrialPolicyRow | null;
}): CommercialCatalog {
  const porPlan = new Map<string, CatalogLimit[]>();
  for (const l of input.limits) {
    const lista = porPlan.get(l.planCode) ?? [];
    lista.push({
      resourceCode: l.resourceCode,
      label: l.resourceLabel ?? l.resourceCode,
      unit: l.unit,
      state: l.limitState,
      value: l.limitValue,
    });
    porPlan.set(l.planCode, lista);
  }

  const saasPlans: CommercialPlan[] = input.plans.map((p) => {
    const limites = porPlan.get(p.planCode) ?? [];
    const copia = PLAN_COPY[p.planCode];
    const diario = limiteDe(limites, "active_minutes_daily");
    const mensual = limiteDe(limites, "active_minutes_monthly");

    return {
      code: p.planCode,
      displayName: p.displayName,
      headline: copia?.headline ?? p.displayName,
      shortDescription: copia?.shortDescription ?? p.description ?? "",
      idealFor: copia?.idealFor ?? "",
      displayOrder: copia?.displayOrder
        ?? ORDEN_POR_DEFECTO[p.planCode] ?? p.displayOrder,
      featured: copia?.featured ?? false,
      bullets: copia?.bullets ?? [],
      description: p.description,
      publicConditions: p.publicConditions,

      currency: p.currency,
      monthlyPriceMinor: p.monthlyPriceMinor,
      annualPriceMinor: p.annualPriceMinor,
      priceState: p.priceState,

      storageBytes: valorFinito(limiteDe(limites, "storage_bytes")),
      aiCreditsMonthly: valorFinito(limiteDe(limites, "ai_weighted_credits_monthly")),
      timeUsage: resolveTimeUsage(
        diario === null ? null : { state: diario.state, value: diario.value },
        mensual === null ? null : { state: mensual.state, value: mensual.value }),

      limits: limites,
    };
  }).sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    saasPlans,
    services: COMMERCIAL_SERVICES,
    trial: construirPrueba(input.trialPolicy, saasPlans),
  };
}

function construirPrueba(
  politica: TrialPolicyRow | null,
  planes: readonly CommercialPlan[]
): CommercialTrial | null {
  if (politica === null || !politica.enabled) return null;
  const concedido = planes.find((p) => p.code === politica.trialPlanCode);
  // Sin el plan que concede no se puede prometer nada: no se sabe qué incluye.
  if (concedido === undefined) return null;

  const horas = politica.trialDurationHours;
  return {
    available: true,
    headline: TRIAL_COPY.headline,
    shortDescription: TRIAL_COPY.shortDescription,
    effectivePlanCode: concedido.code,
    durationHours: horas,
    // La prueba nunca ha pedido tarjeta, y el gate lo fija: el producto no
    // tiene ningún camino que la solicite para empezarla.
    cardRequired: false,
    // En HORAS mientras la prueba sea corta, y en días solo cuando ya no
    // quepa en horas sin sonar raro.
    //
    // No es una preferencia de estilo: «48 horas» se lee como una prueba —algo
    // acotado, que empieza ya— y «2 días» se lee como un plazo. Es además el
    // texto que la decisión comercial aprobó. El umbral está en 72 porque a
    // partir de ahí contar horas deja de ayudar a nadie.
    durationLabel: horas < 72
      ? `${horas} ${horas === 1 ? "hora" : "horas"}`
      : horas % 24 === 0
        ? `${horas / 24} ${horas === 24 ? "día" : "días"}`
        : `${horas} horas`,
    timeUsage: concedido.timeUsage,
  };
}

/**
 * «Prueba Full 48 horas · sin tarjeta de crédito», compuesto.
 *
 * La duración sale de la política y el nombre del plan de la autoridad; lo
 * único que pone este módulo son las palabras que las unen.
 */
export function trialTagline(trial: CommercialTrial | null,
                             planes: readonly CommercialPlan[]): string | null {
  if (trial === null) return null;
  const plan = planes.find((p) => p.code === trial.effectivePlanCode);
  const nombre = plan?.headline ?? trial.effectivePlanCode;
  const tarjeta = trial.cardRequired ? "con tarjeta" : TRIAL_COPY.cardNotRequiredLabel;
  return `Prueba ${nombre} ${trial.durationLabel} · ${tarjeta}`;
}
