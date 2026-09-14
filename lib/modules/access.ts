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
  /**
   * PROD-LAUNCH-01D.4A · Full o Extra PAGADO cuyo periodo ya terminó.
   *
   * No es lo mismo que `demo_expired` aunque se comporten igual —se entra a
   * consultar, no a crear—: una prueba que caduca no se pagó, y esto sí. Se
   * distinguen porque lo que se le dice a cada uno es distinto: a quien pagó
   * se le ofrece renovar, no «activar».
   */
  | "full_expired"
  | "full"
  | "extra"
  | "disabled" // enabled = false (deshabilitación administrativa)
  | "globally_disabled" // kill switch global apagado
  | "coming_soon" // módulo no funcional
  | "not_assigned" // sin fila de asignación
  /**
   * PE-01B · No se pudo AVERIGUAR si hay asignación.
   *
   * No es un estado comercial: es la ausencia de respuesta. Antes de PE-01B no
   * existía, y por eso un fallo de lectura acababa presentándose como
   * `not_assigned` —«este módulo no está asignado a la empresa»—, que es una
   * afirmación sobre el contrato de la empresa hecha a partir de un corte de
   * red. Ver PE-D1.
   */
  | "unavailable";

/** Motivo de bloqueo (para mensajes claros; nunca errores SQL). */
export type ModuleAccessReason =
  | "ok"
  | "coming_soon"
  | "globally_disabled"
  | "not_assigned"
  | "disabled"
  | "demo_expired"
  | "full_expired"
  | "unavailable";

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
  /**
   * PE-01B · La lectura de la asignación NO se pudo completar.
   *
   * Distinto de `assignment: null`, que significa «se leyó y no hay fila».
   * Ausente o `false` mantiene el comportamiento anterior exactamente, así que
   * ningún llamador previo cambia de resultado.
   */
  assignmentUnavailable?: boolean;
  /** "Ahora" — SIEMPRE hora del servidor/BD. */
  now: Date;
};

export type ModuleAccessDecision = {
  /**
   * ¿Puede MUTAR? Es la puerta de siempre, y su significado NO ha cambiado:
   * todo lo que la consultaba antes sigue recibiendo exactamente la misma
   * respuesta. Ampliarla habría abierto en silencio ciento y pico de puertas.
   */
  allowed: boolean;
  /**
   * PROD-LAUNCH-01C.4 · ¿Puede CONSULTAR lo que ya creó?
   *
   * Una prueba vencida no es lo mismo que un módulo que nunca se tuvo. En el
   * primer caso hay trabajo dentro —procesos, lotes, evidencias— y quitarle a
   * una empresa el acceso a su propia información porque se le acabó la prueba
   * es cobrar por devolver lo que ya era suyo. Vence el permiso de CREAR; no
   * el de MIRAR.
   *
   * Es TRUE solo cuando existe una asignación real cuyo permiso expiró. Nunca
   * para `not_assigned` —un módulo que la empresa jamás tuvo no se regala—, ni
   * para `disabled` —eso es una decisión administrativa, no un vencimiento—,
   * ni ante un fallo de lectura, donde no se sabe nada y se falla cerrado.
   */
  retainedRead: boolean;
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
  // PE-01B · Va ANTES que `not_assigned` y por un motivo: si no se pudo leer,
  // no se sabe si hay asignación, y decir que no la hay sería inventarse la
  // respuesta. Se deniega —fallar cerrado es lo correcto para autorizar— pero
  // el motivo que se comunica es el verdadero.
  if (input.assignmentUnavailable) {
    return deny("unavailable", "unavailable", null);
  }
  if (!assignment) {
    return deny("not_assigned", "not_assigned", null);
  }
  if (!assignment.enabled) {
    return deny("disabled", "disabled", assignment.accessMode);
  }

  const mode = assignment.accessMode;

  if (mode === "full" || mode === "extra") {
    /*
      PROD-LAUNCH-01D.4A · Full y Extra AHORA MIRAN SU VENCIMIENTO.

      Antes no lo miraban: devolvían siempre `allowed: true` y hasta
      `expiresAt: null`, tuviera la fila la fecha que tuviera. Eso significaba
      que cualquier forma de marcar «pagado hasta tal día» producía acceso
      PERPETUO — el primer pago real de Trazaloop lo habría convertido en Full
      para siempre por 157 080 pesos.

      El vencimiento se deriva por FECHA, igual que en Demo y por el mismo
      motivo: así no hace falta ningún cron que vaya apagando accesos, y no hay
      ventana entre que el periodo termina y alguien se entera.

      Sin fecha sigue siendo perpetuo, que es lo correcto para `core` y para un
      Full concedido a mano por administración. Cuando se escribió esto no
      había NI UNA fila full/extra con vencimiento en Producción ni en Staging,
      así que este cambio no le quitó el acceso a nadie.
    */
    const vence = assignment.accessExpiresAt;
    if (vence !== null && new Date(vence).getTime() <= now.getTime()) {
      return {
        allowed: false,
        // Se pagó y hay trabajo dentro: la información es suya.
        retainedRead: true,
        reason: "full_expired",
        derivedState: "full_expired",
        accessMode: mode,
        isDemo: false,
        isExpired: true,
        expiresAt: vence,
      };
    }
    return {
      allowed: true,
      retainedRead: true,
      reason: "ok",
      derivedState: mode,
      accessMode: mode,
      isDemo: false,
      isExpired: false,
      // Se dice la verdad: si hay periodo pagado, hasta cuándo llega.
      expiresAt: vence,
    };
  }

  // access_mode = 'demo'
  const expiresAt = assignment.accessExpiresAt;
  if (expiresAt === null) {
    return {
      allowed: true,
      retainedRead: true,
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
      // La prueba caducó, pero la empresa entró aquí y trabajó. Lo que hay
      // dentro es suyo y se sigue consultando.
      retainedRead: true,
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
    retainedRead: true,
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
    // Fallar cerrado: solo el vencimiento conserva la consulta, y ese caso no
    // pasa por aquí. Un motivo nuevo que se añada nacerá sin consulta retenida,
    // que es el lado correcto en el que equivocarse.
    retainedRead: false,
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
