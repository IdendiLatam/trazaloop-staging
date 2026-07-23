/**
 * Trazaloop · Sprint T9F · REGLA CANÓNICA de acceso comercial a un módulo y
 * ESTADOS DERIVADOS de interfaz. Lógica PURA (sin BD, sin sesión, sin
 * process.env, sin Date.now()): la hora "ahora" SIEMPRE se inyecta y en
 * producción es la del SERVIDOR/BD, nunca la del navegador.
 *
 * Modelo comercial (definitivo): los únicos access_mode son 'demo', 'full'
 * y 'extra'. La habilitación administrativa (`enabled`) es un eje SEPARADO.
 * "Demo temporal" y "Demo permanente" comparten access_mode='demo' y solo
 * difieren en access_expires_at (fecha futura vs null). El vencimiento se
 * deriva por FECHA: un guard rechaza una prueba vencida de inmediato, sin
 * depender de ningún cron.
 *
 * Full y Extra tienen EXACTAMENTE las mismas funcionalidades; su única
 * diferencia es la cuota de almacenamiento (ver buildModuleEntitlements).
 */

export type ModuleAccessMode = "demo" | "full" | "extra";

/** Estado DERIVADO para la interfaz. No son nuevos access_mode: se derivan de
 *  (status del módulo + enabled + access_mode + expiración + kill switch). */
export type DerivedModuleState =
  | "demo_active" // demo con vencimiento futuro
  | "demo_permanent" // demo sin vencimiento
  | "demo_expired" // demo con vencimiento pasado → acceso bloqueado
  | "full"
  | "extra"
  | "disabled" // enabled = false (deshabilitación administrativa)
  | "globally_disabled" // kill switch global apagado
  | "coming_soon" // módulo no funcional
  | "not_assigned"; // sin fila de asignación

/** Motivo de bloqueo (para mensajes claros; nunca errores SQL). */
export type ModuleAccessReason =
  | "ok"
  | "coming_soon"
  | "globally_disabled"
  | "not_assigned"
  | "disabled"
  | "demo_expired";

/** La asignación empresa-módulo, tal como vive en organization_modules. */
export type ModuleAssignment = {
  enabled: boolean;
  accessMode: ModuleAccessMode;
  /** ISO string o null (Demo permanente / Full / Extra). */
  accessExpiresAt: string | null;
};

export type ModuleAccessInput = {
  /** ¿El módulo es funcional y publicado? (catálogo canónico). */
  isFunctional: boolean;
  /** ¿El kill switch global está activo? (true si no tiene kill switch). */
  killSwitchActive: boolean;
  /** La fila de asignación, o null si la empresa no la tiene. */
  assignment: ModuleAssignment | null;
  /** "Ahora" — SIEMPRE hora del servidor/BD. */
  now: Date;
};

export type ModuleAccessDecision = {
  allowed: boolean;
  reason: ModuleAccessReason;
  derivedState: DerivedModuleState;
  accessMode: ModuleAccessMode | null;
  isDemo: boolean;
  isExpired: boolean;
  expiresAt: string | null;
};

/**
 * ¿Puede la empresa ACCEDER al módulo, y en qué estado visible?
 *
 * Puede acceder si: el módulo es funcional (1) y publicado, el kill switch
 * global está activo (2), existe una asignación (3) con enabled=true (4), y
 * el access_mode es full/extra, o demo sin vencimiento, o demo con
 * vencimiento futuro (5). Demo con vencimiento pasado → acceso vencido.
 *
 * `enabled = false` (deshabilitación administrativa) y "Demo vencido" son
 * estados DISTINTOS: se comunican distinto en la UI.
 */
export function resolveModuleAccess(input: ModuleAccessInput): ModuleAccessDecision {
  const { isFunctional, killSwitchActive, assignment, now } = input;

  if (!isFunctional) {
    return deny("coming_soon", "coming_soon", null);
  }
  if (!killSwitchActive) {
    return deny("globally_disabled", "globally_disabled", assignment?.accessMode ?? null);
  }
  if (!assignment) {
    return deny("not_assigned", "not_assigned", null);
  }
  if (!assignment.enabled) {
    return deny("disabled", "disabled", assignment.accessMode);
  }

  const mode = assignment.accessMode;

  if (mode === "full" || mode === "extra") {
    return {
      allowed: true,
      reason: "ok",
      derivedState: mode,
      accessMode: mode,
      isDemo: false,
      isExpired: false,
      expiresAt: null,
    };
  }

  // access_mode = 'demo'
  const expiresAt = assignment.accessExpiresAt;
  if (expiresAt === null) {
    return {
      allowed: true,
      reason: "ok",
      derivedState: "demo_permanent",
      accessMode: "demo",
      isDemo: true,
      isExpired: false,
      expiresAt: null,
    };
  }

  const expired = new Date(expiresAt).getTime() <= now.getTime();
  if (expired) {
    return {
      allowed: false,
      reason: "demo_expired",
      derivedState: "demo_expired",
      accessMode: "demo",
      isDemo: true,
      isExpired: true,
      expiresAt,
    };
  }
  return {
    allowed: true,
    reason: "ok",
    derivedState: "demo_active",
    accessMode: "demo",
    isDemo: true,
    isExpired: false,
    expiresAt,
  };
}

function deny(
  reason: ModuleAccessReason,
  derivedState: DerivedModuleState,
  accessMode: ModuleAccessMode | null
): ModuleAccessDecision {
  return {
    allowed: false,
    reason,
    derivedState,
    accessMode,
    isDemo: accessMode === "demo",
    isExpired: reason === "demo_expired",
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------------
// Tiempo restante (INFORMATIVO — nunca autoridad de acceso)
// ---------------------------------------------------------------------------

/** Milisegundos restantes de una prueba (>=0). null si no vence o ya venció. */
export function remainingTrialMs(expiresAt: string | null, now: Date): number | null {
  if (expiresAt === null) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms > 0 ? ms : null;
}

/** "1 día y 6 horas", "6 horas", "45 minutos". Solo para mostrar. */
export function formatRemainingTrial(expiresAt: string | null, now: Date): string | null {
  const ms = remainingTrialMs(expiresAt, now);
  if (ms === null) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "día" : "días"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  if (days === 0 && hours === 0) parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);
  return parts.join(" y ");
}

// ---------------------------------------------------------------------------
// ENTITLEMENTS por módulo — reutilizan el catálogo de planes (plan_limits /
// plan_definitions, 0050). access_mode se mapea 1:1 a plan_code, de modo que
// NO se inventa ningún valor: los límites funcionales y la cuota provienen de
// la fuente central existente.
// ---------------------------------------------------------------------------

/** Un límite funcional resuelto (espejo de plan_limits). */
export type FunctionalLimit = {
  resourceCode: string;
  limitValue: number | null;
  isUnlimited: boolean;
};

export type ModuleEntitlements = {
  accessMode: ModuleAccessMode;
  isDemo: boolean;
  /** Límites funcionales (conteos + interruptores), del plan de este access_mode. */
  functionalLimits: FunctionalLimit[];
  /** Cuota de almacenamiento (bytes), de plan_definitions[access_mode]. */
  storageLimitBytes: number;
};

/** access_mode → plan_code (1:1; NO se inventan valores). */
export function accessModeToPlanCode(accessMode: ModuleAccessMode): "demo" | "full" | "extra" {
  return accessMode;
}

/**
 * Construye los entitlements de un módulo a partir de su access_mode y de los
 * datos del plan correspondiente (ya leídos de plan_limits / plan_definitions).
 * Full y Extra producen objetos IDÉNTICOS salvo `storageLimitBytes`, porque
 * así está definido en el seed de planes — esta función no añade diferencias.
 */
export function buildModuleEntitlements(
  accessMode: ModuleAccessMode,
  planLimits: FunctionalLimit[],
  storageLimitBytes: number
): ModuleEntitlements {
  return {
    accessMode,
    isDemo: accessMode === "demo",
    functionalLimits: planLimits
      .filter((l) => l.resourceCode !== "storage_bytes")
      .map((l) => ({ ...l })),
    storageLimitBytes,
  };
}

/** Comparación estructural de entitlements IGNORANDO la cuota de almacenamiento
 *  (para la prueba obligatoria Full == Extra salvo almacenamiento). */
export function functionalLimitsFingerprint(entitlements: ModuleEntitlements): string {
  const sorted = [...entitlements.functionalLimits].sort((a, b) =>
    a.resourceCode.localeCompare(b.resourceCode)
  );
  return JSON.stringify(sorted);
}
