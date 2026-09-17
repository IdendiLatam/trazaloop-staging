/**
 * Trazaloop · COMMERCIAL-UX-01D · Qué se le ofrece a quien mira, según quién
 * sea.
 *
 *
 * POR QUÉ ESTO ES UN MÓDULO Y NO UNOS `if` EN LA PÁGINA
 *
 * Una página de precios la abre gente en siete situaciones distintas: sin
 * cuenta, con cuenta y sin empresa, en Free, en prueba, en Full, en Full con la
 * cancelación programada, y en Extra. A cada una le corresponde un botón
 * distinto y un destino distinto.
 *
 * Metido en el JSX, eso son siete ramas anidadas que nadie puede leer y que
 * NADIE puede probar sin navegador. Aquí es una función pura con siete casos, y
 * se ejercitan los siete.
 *
 *
 * LA REGLA QUE ESTE MÓDULO EXISTE PARA CUMPLIR
 *
 * Una página pública ORIENTA; no cobra. Ningún botón de aquí dispara un cobro:
 * todos llevan al flujo que ya existe —registro, entrada, o la ficha de
 * facturación— y es ahí donde el checkout hace lo suyo, con su autoridad y sus
 * comprobaciones.
 *
 * Y el caso que obliga a tener esto: **Extra no se puede contratar hoy**. Su
 * mejora la cobra un carril que con la pasarela del lanzamiento no puede
 * cobrar, y COMMERCIAL-UX-01B ya cerró que no se ofrezca una acción
 * transaccional que no puede completarse. Prometerlo desde una página pública
 * sería el mismo defecto, con más público.
 *
 * Lógica PURA: sin React, sin base de datos, sin sesión.
 */

/** En qué situación está quien mira la página. */
export type VisitorState =
  /** Sin sesión. La mayoría. */
  | { kind: "anonymous" }
  /** Tiene cuenta pero todavía no ha creado empresa. */
  | { kind: "authenticated_no_org" }
  /** Tiene empresa, con el plan y la concesión que la autoridad diga. */
  | {
      kind: "organization";
      /** Lo que la empresa tiene CONTRATADO. `null` si no se pudo leer. */
      contractedPlanCode: string | null;
      /** Lo EFECTIVO ahora mismo, prueba incluida. */
      effectivePlanCode: string | null;
      /** `trial` mientras dure la prueba. */
      grantKind: string | null;
      /** ¿Hay suscripción de pago viva? */
      hasSubscription: boolean;
      /** ¿Se canceló al final del periodo pagado? */
      cancelAtPeriodEnd: boolean;
    };

/** Lo que la página puede ofrecer, ya decidido. */
export type PlanCta = {
  /** El texto del botón. `null` = para este plan, a esta persona, no hay botón. */
  label: string | null;
  /** A dónde lleva. Siempre una ruta que EXISTE. */
  href: string | null;
  /** Cómo se pinta: el principal de la tarjeta destacada, o uno discreto. */
  tone: "primary" | "quiet";
  /**
   * Por qué no hay botón, cuando no lo hay. No se enseña al visitante: existe
   * para que la decisión sea auditable y para que una prueba pueda afirmarla.
   */
  suppressedReason?: CtaSuppressedReason;
  /** Una línea de contexto bajo el botón, cuando ayuda. */
  note?: string;
};

export type CtaSuppressedReason =
  /** Ya es lo que tiene: ofrecerle contratarlo sería ruido. */
  | "ALREADY_ON_PLAN"
  /** El carril que cobra esa mejora no puede cobrarla en este despliegue. */
  | "UPGRADE_NOT_TRANSACTIONAL"
  /** El registro público está cerrado: no hay a dónde mandar a nadie. */
  | "REGISTRATION_CLOSED";

/** Lo que el entorno permite hoy, resuelto FUERA y pasado como dato. */
export type PricingCapabilities = {
  /** ¿Se puede crear cuenta sin invitación? */
  registrationOpen: boolean;
  /** ¿Puede completarse una mejora con cobro? Sale de `resolveUpgradeAvailability`. */
  upgradeTransactional: boolean;
};

/** El canal real cuando no hay autoservicio. Es el que ya usa la portada. */
export const CONTACT_HREF = "mailto:contacto@idendi.org";

/**
 * El botón de un plan, para esta persona.
 *
 * Nunca devuelve una ruta inventada: `/register`, `/login`, `/select-org`,
 * `/settings/billing` y el correo de contacto existen todos hoy.
 */
export function resolvePlanCta(
  planCode: string,
  visitor: VisitorState,
  caps: PricingCapabilities
): PlanCta {
  // ── sin cuenta ────────────────────────────────────────────────────────────
  // Todo el mundo empieza igual: creando una cuenta. No se le promete a nadie
  // que va a contratar Extra desde aquí, porque desde aquí no se contrata nada.
  if (visitor.kind === "anonymous") {
    if (!caps.registrationOpen) {
      return {
        label: "Solicitar acceso", href: CONTACT_HREF, tone: "quiet",
        suppressedReason: "REGISTRATION_CLOSED",
        note: "Ahora mismo damos acceso por invitación.",
      };
    }
    return planCode === "free"
      ? { label: "Crear cuenta", href: "/register", tone: "quiet" }
      : { label: "Empezar la prueba", href: "/register", tone: "primary",
          note: "Se crea la cuenta y la prueba empieza sola." };
  }

  // ── con cuenta, sin empresa ───────────────────────────────────────────────
  // Le falta un paso concreto y conocido. Mandarle a facturación sería mandarle
  // a una pantalla que le va a pedir justo esto.
  if (visitor.kind === "authenticated_no_org") {
    return { label: "Crear mi empresa", href: "/select-org", tone: "primary",
             note: "Es el paso que falta para empezar." };
  }

  // ── con empresa ───────────────────────────────────────────────────────────
  const enPrueba = visitor.grantKind === "trial";
  const contratado = visitor.contractedPlanCode;

  // Extra: comercialmente se presenta, pero hoy no se contrata desde ningún
  // sitio. Se ofrece hablar, que es lo único que de verdad se puede cumplir.
  if (planCode === "extra" && contratado !== "extra") {
    if (!caps.upgradeTransactional) {
      return {
        label: "Hablemos de Extra", href: CONTACT_HREF, tone: "quiet",
        suppressedReason: "UPGRADE_NOT_TRANSACTIONAL",
        note: "El paso a Extra lo hacemos contigo.",
      };
    }
    return { label: "Pasar a Extra", href: "/settings/billing", tone: "primary" };
  }

  // Lo que ya se tiene contratado no se vuelve a ofrecer.
  if (contratado === planCode && !enPrueba) {
    // Salvo que se haya cancelado: ahí lo útil es poder volver atrás, y eso
    // vive en la ficha de facturación, no aquí.
    if (visitor.cancelAtPeriodEnd) {
      return { label: "Ver mi plan", href: "/settings/billing", tone: "quiet",
               note: "Tienes la cancelación programada." };
    }
    return { label: null, href: null, tone: "quiet",
             suppressedReason: "ALREADY_ON_PLAN", note: "Tu plan actual." };
  }

  // Free cuando ya se paga algo: bajar de plan es una decisión de la ficha, con
  // sus fechas y sus consecuencias delante. No se despacha con un botón.
  if (planCode === "free" && visitor.hasSubscription) {
    return { label: null, href: null, tone: "quiet",
             suppressedReason: "ALREADY_ON_PLAN" };
  }

  if (planCode === "free") {
    return { label: null, href: null, tone: "quiet",
             suppressedReason: "ALREADY_ON_PLAN", note: "Tu plan actual." };
  }

  // Full. Quien está en la prueba tiene prisa y merece el camino corto.
  return {
    label: enPrueba ? "Contratar Full" : "Pasar a Full",
    href: "/settings/billing",
    tone: "primary",
    note: enPrueba ? "Tu prueba termina pronto." : undefined,
  };
}

/** El botón grande del encabezado y del cierre de la página. */
export function resolvePrimaryCta(
  visitor: VisitorState, caps: PricingCapabilities
): PlanCta {
  if (visitor.kind === "anonymous") {
    return caps.registrationOpen
      ? { label: "Empezar la prueba", href: "/register", tone: "primary" }
      : { label: "Solicitar acceso", href: CONTACT_HREF, tone: "primary",
          suppressedReason: "REGISTRATION_CLOSED" };
  }
  if (visitor.kind === "authenticated_no_org") {
    return { label: "Crear mi empresa", href: "/select-org", tone: "primary" };
  }
  return { label: "Ir a mi panel", href: "/modules", tone: "primary" };
}
