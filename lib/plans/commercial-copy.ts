/**
 * Trazaloop · COMMERCIAL-UX-01C · Lo que se dice de cada plan, que no es lo que
 * cada plan cuesta.
 *
 *
 * LA LÍNEA QUE ESTE FICHERO NO CRUZA
 *
 * Aquí vive TEXTO: a quién le sirve cada plan, cómo se presenta, cuál se
 * destaca, en qué orden se leen. Eso es criterio comercial y cambiarlo no toca
 * la base de datos ni el cobro.
 *
 * Aquí NO vive ni un precio, ni un límite, ni una cuota. Esos salen de
 * `plan_revisions` y `plan_revision_limits` a través del read model. Si alguien
 * escribiera «USD 40» en este fichero, el día que el precio cambie en la
 * autoridad la página seguiría diciendo 40 y nadie se enteraría hasta que un
 * cliente reclamara. Una prueba se pone roja si aparece una cifra de dinero o
 * de cuota aquí dentro.
 *
 *
 * EL CASO INCÓMODO: EL ACOMPAÑAMIENTO
 *
 * El Acompañamiento tiene una referencia comercial aprobada —ocho horas al mes,
 * del orden de 380 dólares— y no es un plan SaaS: no es una `plan_revision`, no
 * concede nada, no se contrata desde el producto y no se cobra por el checkout.
 *
 * Por eso su referencia va como TEXTO, no como número. Un `string` no se puede
 * sumar, ni multiplicar por un tipo de cambio, ni pasar a `billing_create_quote`
 * por accidente. La forma del dato impide el error en lugar de confiar en que
 * nadie lo cometa.
 */

/** Metadata de presentación de un plan SaaS. Texto y orden, nada más. */
export type PlanCopy = {
  /** Cómo se titula en una página pública. Puede diferir del nombre interno. */
  headline: string;
  /** Una línea. Qué es este plan. */
  shortDescription: string;
  /** A quién le sirve. Lo que de verdad ayuda a elegir. */
  idealFor: string;
  /** El orden en que se leen. La autoridad trae el suyo; este manda en público. */
  displayOrder: number;
  /** El que se recomienda por defecto. Como mucho uno. */
  featured: boolean;
  /**
   * Frases explicativas. NO son límites: son lo que significa el plan.
   * Los números los pone el read model desde la autoridad.
   */
  bullets: readonly string[];
};

export const PLAN_COPY: Record<string, PlanCopy> = {
  free: {
    headline: "Free",
    shortDescription: "Para conocer Trazaloop con datos reales, sin pagar nada.",
    idealFor: "Quien está evaluando si la trazabilidad le encaja.",
    displayOrder: 1,
    featured: false,
    bullets: [
      "Acceso a la plataforma con tus propios datos",
      "Uso de la plataforma medido por tiempo",
      "Sin tarjeta y sin caducidad",
    ],
  },
  full: {
    headline: "Full",
    shortDescription: "La operación completa: trazabilidad, documentos y evidencias.",
    idealFor: "Empresas que ya operan y necesitan sostener la trazabilidad cada día.",
    displayOrder: 2,
    featured: true,
    bullets: [
      "Uso de la plataforma sin límite de tiempo",
      "Registros y evidencias sin tope de cantidad",
      "Importaciones, roles y permisos",
    ],
  },
  extra: {
    headline: "Extra",
    shortDescription: "Full, con más espacio, más Intelligence y acompañamiento funcional.",
    idealFor: "Operaciones con volumen alto o varias líneas de producto.",
    displayOrder: 3,
    featured: false,
    bullets: [
      "Todo lo de Full",
      "Mucho más almacenamiento y créditos de Intelligence",
      "Casos de acompañamiento funcional incluidos",
    ],
  },
};

/**
 * Un servicio comercial que NO es un plan SaaS.
 *
 * Vive en su propia lista a propósito. Meter el Acompañamiento en `saasPlans`
 * lo convertiría visualmente en un cuarto plan, y quien lo leyera creería que
 * es una alternativa a Full o Extra en vez de un complemento a cualquiera de
 * ellos.
 */
export type CommercialService = {
  code: string;
  headline: string;
  shortDescription: string;
  idealFor: string;
  displayOrder: number;
  /**
   * La referencia comercial, EN TEXTO y a propósito.
   *
   * No es un precio de checkout, ni un SKU, ni una `plan_revision`. Es lo que
   * se le dice a alguien que pregunta cuánto cuesta, antes de que hablemos.
   * Como `string` no puede colarse en un cálculo financiero.
   */
  referenceScope: string;
  referencePrice: string;
  /** Lo que hay que dejar clarísimo para que nadie lo confunda con un plan. */
  disclaimer: string;
  bullets: readonly string[];
};

export const COMMERCIAL_SERVICES: readonly CommercialService[] = [
  {
    code: "acompanamiento",
    headline: "Acompañamiento",
    shortDescription: "Apoyo humano para poner y mantener la trazabilidad en marcha.",
    idealFor: "Equipos que prefieren no recorrer solos la puesta en marcha.",
    displayOrder: 1,
    referenceScope: "8 h/mes",
    referencePrice: "aprox. USD 380",
    disclaimer:
      "Es un servicio complementario, independiente del plan. No se contrata "
      + "desde la plataforma ni se cobra automáticamente: se acuerda antes.",
    bullets: [
      "Se suma a cualquier plan; no lo sustituye",
      "Alcance y precio se acuerdan caso por caso",
      "Opcional en todo momento",
    ],
  },
];

/** Metadata de la prueba. La DURACIÓN no está aquí: la manda la política. */
export const TRIAL_COPY = {
  headline: "Prueba Full",
  /** Se compone con la duración real que venga de `commercial_trial_policy`. */
  cardNotRequiredLabel: "sin tarjeta de crédito",
  shortDescription:
    "Para ver Full por dentro con tus datos antes de decidir nada.",
} as const;
