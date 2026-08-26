/**
 * Trazaloop · QUALITY-05 · Riesgos y oportunidades — el vocabulario del dominio.
 *
 * LAS SEPARACIONES QUE SOSTIENEN TODO
 *
 *   RIESGO ≠ NO CONFORMIDAD           un riesgo es lo que PODRÍA pasar
 *   RIESGO MATERIALIZADO ≠ NC         que pase es un hecho, no un juicio
 *   OPORTUNIDAD ≠ ACCIÓN DE MEJORA    primero existe, luego puede originarlas
 *   CONTROL ≠ ACCIÓN DE TRATAMIENTO   el control ya opera; la acción se hará
 *   CAUSA ≠ EVENTO ≠ CONSECUENCIA     por qué, qué, y qué nos costaría
 *   INHERENTE ≠ RESIDUAL              sin controles y con ellos
 *   NIVEL ≠ ESTADO                    RO-18: son ejes distintos
 *   METODOLOGÍA ≠ EVALUACIÓN          la regla y su aplicación
 *
 * Este archivo es PURO: no sabe de base de datos ni de sesión. Nombra el
 * dominio en español y responde lo que no depende de nadie. Quien DECIDE es la
 * base, en las RPC de 0122; aquí solo se nombra y se explica.
 */

// ---------------------------------------------------------------------------
// Metodología (RO-03, RO-04, RO-15)
// ---------------------------------------------------------------------------

export const METHODOLOGY_SCOPES = ["risk", "opportunity"] as const;
export type MethodologyScope = (typeof METHODOLOGY_SCOPES)[number];

export const METHODOLOGY_SCOPE_LABEL: Record<MethodologyScope, string> = {
  risk: "Riesgos",
  opportunity: "Oportunidades",
};

export const METHODOLOGY_APPROACHES = ["qualitative", "semi_quantitative", "custom"] as const;
export type MethodologyApproach = (typeof METHODOLOGY_APPROACHES)[number];

export const METHODOLOGY_APPROACH_LABEL: Record<MethodologyApproach, string> = {
  qualitative: "Cualitativa",
  semi_quantitative: "Semicuantitativa",
  custom: "A medida",
};

export const AGGREGATIONS = ["product", "sum", "weighted_sum", "max", "min"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

/** Cómo se combinan los factores, dicho para quien no escribe fórmulas. */
export const AGGREGATION_LABEL: Record<Aggregation, string> = {
  product: "Multiplicando los valores",
  sum: "Sumando los valores",
  weighted_sum: "Sumando los valores según su peso",
  max: "Tomando el valor más alto",
  min: "Tomando el valor más bajo",
};

export const VERSION_STATUSES = ["draft", "published", "superseded", "retired"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  superseded: "Sustituida",
  retired: "Retirada",
};

/** Una versión publicada ya no se toca: se publica otra (RO-04). */
export function versionIsEditable(status: VersionStatus): boolean {
  return status === "draft";
}

/** Solo se evalúa con lo que está vigente. */
export function versionCanAssess(status: VersionStatus): boolean {
  return status === "published";
}

// ---------------------------------------------------------------------------
// Riesgo (RO-01, RO-18, RO-29)
// ---------------------------------------------------------------------------

export const RISK_STATUSES = ["draft", "active", "closed", "retired", "superseded"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  closed: "Cerrado",
  retired: "Retirado",
  superseded: "Sustituido",
};

/** RO-18. El estado dice en qué punto administrativo está la ficha; el nivel
 *  dice cuánto preocupa. Un riesgo extremo puede estar activo y uno bajo
 *  cerrado: mezclarlos haría imposible responder a ninguna de las dos. */
export function riskIsOpen(status: RiskStatus): boolean {
  return status === "draft" || status === "active";
}

export const RISK_ORIGINS = [
  "manual", "indicator", "process", "document", "case",
  "audit", "supplier", "customer", "management_review", "signal", "other",
] as const;
export type RiskOrigin = (typeof RISK_ORIGINS)[number];

export const RISK_ORIGIN_LABEL: Record<RiskOrigin, string> = {
  manual: "Identificado a mano",
  indicator: "Un indicador",
  process: "Un proceso",
  document: "Un documento",
  case: "Un caso",
  audit: "Una auditoría",
  supplier: "Un proveedor",
  customer: "Un cliente",
  management_review: "La revisión por la dirección",
  signal: "Una señal",
  other: "Otro",
};

export const CAUSE_SOURCES = [
  "internal", "external", "supplier", "customer",
  "technology", "people", "regulatory", "other",
] as const;
export type CauseSource = (typeof CAUSE_SOURCES)[number];

export const CAUSE_SOURCE_LABEL: Record<CauseSource, string> = {
  internal: "Interna",
  external: "Externa",
  supplier: "Un proveedor",
  customer: "Un cliente",
  technology: "Tecnología",
  people: "Personas",
  regulatory: "Regulatoria",
  other: "Otra",
};

export const IMPACT_AREAS = [
  "operational", "quality", "customer", "financial",
  "regulatory", "reputational", "safety", "environmental", "other",
] as const;
export type ImpactArea = (typeof IMPACT_AREAS)[number];

export const IMPACT_AREA_LABEL: Record<ImpactArea, string> = {
  operational: "Operación",
  quality: "Calidad del producto o servicio",
  customer: "Cliente",
  financial: "Finanzas",
  regulatory: "Cumplimiento legal",
  reputational: "Reputación",
  safety: "Seguridad de las personas",
  environmental: "Medio ambiente",
  other: "Otra",
};

// ---------------------------------------------------------------------------
// Evaluación (RO-07, RO-09)
// ---------------------------------------------------------------------------

export const ASSESSMENT_KINDS = ["inherent", "residual"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  inherent: "Inherente",
  residual: "Residual",
};

export const ASSESSMENT_KIND_HINT: Record<AssessmentKind, string> = {
  inherent: "Qué tan expuestos estaríamos sin contar ningún control.",
  residual: "Qué tan expuestos quedamos teniendo en cuenta los controles que ya existen.",
};

/** Un factor elegido, tal como lo devuelve la derivación de la base. */
export type DerivationFactor = {
  scale_code: string;
  scale_label: string;
  level_label: string;
  value: number;
  weight: number;
};

export type Derivation = {
  score: number;
  level_id: string;
  level_label: string;
  is_acceptable: boolean;
  review_months: number | null;
  color_token: string | null;
  aggregation: Aggregation;
  version_id: string;
  factors: DerivationFactor[];
};

/**
 * La explicación en una frase (§62).
 *
 * No es decoración: si el sistema dice «Alto» y no puede decir por qué, la
 * evaluación no se puede discutir, y una evaluación que no se puede discutir
 * no se corrige nunca.
 */
export function explainDerivation(d: Derivation | null): string | null {
  if (!d || !Array.isArray(d.factors) || d.factors.length === 0) return null;
  const parts = d.factors.map((f) => `${f.scale_label} ${f.level_label} (${fmt(f.value)})`);
  const how =
    d.aggregation === "product" ? "multiplicando" :
    d.aggregation === "sum" ? "sumando" :
    d.aggregation === "weighted_sum" ? "sumando según su peso" :
    d.aggregation === "max" ? "tomando el más alto" : "tomando el más bajo";
  return `${parts.join(" · ")} → ${how} da ${fmt(d.score)}, que cae en «${d.level_label}».`;
}

function fmt(n: number): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
}

/** RO-08: el apetito lo declara la metodología, no el humor de quien mira. */
export function levelIsAcceptable(d: Derivation | null): boolean | null {
  if (!d) return null;
  return Boolean(d.is_acceptable);
}

// ---------------------------------------------------------------------------
// Controles (RO-06, RO-25, RO-26)
// ---------------------------------------------------------------------------

export const CONTROL_NATURES = ["preventive", "detective", "corrective"] as const;
export type ControlNature = (typeof CONTROL_NATURES)[number];

export const CONTROL_NATURE_LABEL: Record<ControlNature, string> = {
  preventive: "Preventivo",
  detective: "Detectivo",
  corrective: "Correctivo",
};

export const CONTROL_NATURE_HINT: Record<ControlNature, string> = {
  preventive: "Actúa antes: hace menos probable que ocurra.",
  detective: "Avisa cuando ocurre, para poder reaccionar a tiempo.",
  corrective: "Limita el daño una vez que ya ocurrió.",
};

export const OPERATION_MODES = ["manual", "automated", "mixed"] as const;
export type OperationMode = (typeof OPERATION_MODES)[number];

export const OPERATION_MODE_LABEL: Record<OperationMode, string> = {
  manual: "Manual",
  automated: "Automático",
  mixed: "Mixto",
};

export const CONTROL_STATUSES = ["draft", "active", "retired"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export const CONTROL_STATUS_LABEL: Record<ControlStatus, string> = {
  draft: "Borrador",
  active: "Vigente",
  retired: "Retirado",
};

export const DESIGN_VERDICTS = ["adequate", "partial", "inadequate", "not_assessed"] as const;
export type DesignVerdict = (typeof DESIGN_VERDICTS)[number];
export const DESIGN_VERDICT_LABEL: Record<DesignVerdict, string> = {
  adequate: "Bien diseñado",
  partial: "Parcialmente adecuado",
  inadequate: "Mal diseñado",
  not_assessed: "Sin evaluar",
};

export const IMPLEMENTATION_VERDICTS = ["implemented", "partial", "not_implemented", "not_assessed"] as const;
export type ImplementationVerdict = (typeof IMPLEMENTATION_VERDICTS)[number];
export const IMPLEMENTATION_VERDICT_LABEL: Record<ImplementationVerdict, string> = {
  implemented: "Se aplica",
  partial: "Se aplica a medias",
  not_implemented: "No se aplica",
  not_assessed: "Sin evaluar",
};

export const EFFECTIVENESS_VERDICTS = ["effective", "partially_effective", "ineffective", "not_assessed"] as const;
export type EffectivenessVerdict = (typeof EFFECTIVENESS_VERDICTS)[number];
export const EFFECTIVENESS_VERDICT_LABEL: Record<EffectivenessVerdict, string> = {
  effective: "Eficaz",
  partially_effective: "Parcialmente eficaz",
  ineffective: "No eficaz",
  not_assessed: "Sin evaluar",
};

/**
 * RO-26. Que un control exista y que sirva son dos preguntas.
 *
 * Un control bien diseñado que nadie aplica es un papel; uno que se aplica y
 * no reduce nada es un gasto. Por eso el veredicto de eficacia no se deduce de
 * los otros dos: se declara aparte.
 */
export function controlIsTrustworthy(v: EffectivenessVerdict): boolean {
  return v === "effective";
}

// ---------------------------------------------------------------------------
// Tratamiento (§33, RO-08, §32)
// ---------------------------------------------------------------------------

export const RISK_STRATEGIES = ["avoid", "reduce", "share", "accept"] as const;
export type RiskStrategy = (typeof RISK_STRATEGIES)[number];

export const RISK_STRATEGY_LABEL: Record<RiskStrategy, string> = {
  avoid: "Evitar",
  reduce: "Reducir",
  share: "Transferir o compartir",
  accept: "Aceptar",
};

export const RISK_STRATEGY_HINT: Record<RiskStrategy, string> = {
  avoid: "Dejar de hacer aquello que lo genera.",
  reduce: "Actuar sobre la causa o la consecuencia para bajar la exposición.",
  share: "Repartir la exposición con un tercero: un seguro, un contrato, un socio.",
  accept: "Convivir con él a conciencia. Aceptar no es olvidarse: se sigue revisando.",
};

export const PLAN_STATUSES = ["pending_approval", "active", "superseded", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  pending_approval: "Esperando aprobación",
  active: "Vigente",
  superseded: "Sustituido",
  cancelled: "Cancelado",
};

/**
 * RO-08. Aceptar por encima del apetito declarado exige aprobación formal.
 *
 * La decisión no es del que escribe: sale de la metodología. Por eso esta
 * función mira el nivel, no la intención.
 */
export function acceptanceNeedsApproval(strategy: RiskStrategy, levelIsAcceptable: boolean | null): boolean {
  return strategy === "accept" && levelIsAcceptable === false;
}

// ---------------------------------------------------------------------------
// Materialización (RO-27, §43)
// ---------------------------------------------------------------------------

export const MATERIALIZATION_SEVERITIES = ["minor", "moderate", "major", "severe"] as const;
export type MaterializationSeverity = (typeof MATERIALIZATION_SEVERITIES)[number];

export const MATERIALIZATION_SEVERITY_LABEL: Record<MaterializationSeverity, string> = {
  minor: "Leve",
  moderate: "Moderada",
  major: "Importante",
  severe: "Grave",
};

/**
 * El texto que la ficha muestra tras registrar que el riesgo ocurrió.
 *
 * Está aquí y no en el componente porque es una AFIRMACIÓN DEL DOMINIO, no una
 * frase de pantalla: que ocurra no lo convierte en no conformidad (RO-27), y
 * quien lo lea tiene que entender que la decisión sigue siendo suya.
 */
export const NO_AUTOMATIC_NC_NOTICE =
  "Queda registrado como hecho. No se ha abierto ninguna no conformidad: eso se decide después, evaluando el caso.";

// ---------------------------------------------------------------------------
// Oportunidades (RO-01, RO-15, RO-16, RO-31, §45)
// ---------------------------------------------------------------------------

export const OPPORTUNITY_KINDS = [
  "improvement", "innovation", "efficiency", "risk_derived",
  "customer", "audit", "supplier", "other",
] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_KIND_LABEL: Record<OpportunityKind, string> = {
  improvement: "Mejora",
  innovation: "Innovación",
  efficiency: "Eficiencia",
  risk_derived: "Derivada de un riesgo",
  customer: "Del cliente",
  audit: "De una auditoría",
  supplier: "De un proveedor",
  other: "Otra",
};

export const OPPORTUNITY_STATUSES = [
  "draft", "active", "in_progress", "implemented", "closed", "discarded",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  draft: "Borrador",
  active: "Identificada",
  in_progress: "En marcha",
  implemented: "Implementada",
  closed: "Cerrada",
  discarded: "Descartada",
};

/** §34 · RO-31. Catálogo PROPIO. «Evitar» o «transferir» son palabras de daño:
 *  aplicadas a una oportunidad no significan nada. */
export const OPPORTUNITY_DECISIONS = ["pursue", "defer", "decline", "to_objective"] as const;
export type OpportunityDecision = (typeof OPPORTUNITY_DECISIONS)[number];

export const OPPORTUNITY_DECISION_LABEL: Record<OpportunityDecision, string> = {
  pursue: "Aprovecharla",
  defer: "Aplazarla",
  decline: "Descartarla",
  to_objective: "Convertirla en objetivo",
};

export const OPPORTUNITY_DECISION_HINT: Record<OpportunityDecision, string> = {
  pursue: "Se actúa ahora. Las acciones se crean aparte y la oportunidad sigue existiendo.",
  defer: "Interesa, pero no toca todavía. Queda registrada con su prioridad.",
  decline: "Se decide no perseguirla, y queda dicho por qué.",
  to_objective: "Es lo bastante grande como para volverse un objetivo de la empresa (RO-31).",
};

export const OPPORTUNITY_ASSESSMENT_KINDS = ["prioritization", "realized_benefit"] as const;
export type OpportunityAssessmentKind = (typeof OPPORTUNITY_ASSESSMENT_KINDS)[number];

export const OPPORTUNITY_ASSESSMENT_KIND_LABEL: Record<OpportunityAssessmentKind, string> = {
  prioritization: "Priorización",
  realized_benefit: "Beneficio obtenido",
};

export function opportunityIsOpen(status: OpportunityStatus): boolean {
  return status !== "closed" && status !== "discarded";
}

// ---------------------------------------------------------------------------
// Autorización (§55). Roles REALES del proyecto; no se inventa un «Risk Manager».
// ---------------------------------------------------------------------------

export type QualityRole = "admin" | "quality" | "consultant";

/** Identificar, evaluar, registrar controles y materializaciones. */
export function canManageRisks(role: string | null | undefined): boolean {
  return role === "admin" || role === "quality" || role === "consultant";
}

/** Decidir el tratamiento, cerrar y reabrir. */
export function canGovernRisks(role: string | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Publicar metodologías y aprobar aceptaciones por encima del apetito. */
export function canGovernMethodology(role: string | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

// ---------------------------------------------------------------------------
// Revisión (RO-10, RO-35, §40)
// ---------------------------------------------------------------------------

/** Días que faltan (negativo si ya venció). */
export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export function reviewIsOverdue(nextReviewOn: string | null | undefined, today = new Date()): boolean {
  const d = daysUntil(nextReviewOn, today);
  return d !== null && d < 0;
}

/** Cómo se dice una fecha de revisión sin obligar a nadie a hacer cuentas. */
export function describeReview(nextReviewOn: string | null | undefined, today = new Date()): string {
  const d = daysUntil(nextReviewOn, today);
  if (d === null) return "Sin revisión programada";
  if (d < 0) return `Revisión vencida hace ${Math.abs(d)} ${Math.abs(d) === 1 ? "día" : "días"}`;
  if (d === 0) return "Toca revisarlo hoy";
  if (d === 1) return "Se revisa mañana";
  return `Se revisa en ${d} días`;
}

/** RO-35: la periodicidad la manda la metodología y la criticidad, no el
 *  calendario. Sin nivel evaluado no hay plazo que imponer. */
export function reviewMonthsFrom(d: Derivation | null): number | null {
  return d?.review_months ?? null;
}
