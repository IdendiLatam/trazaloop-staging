/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01D · Cuándo una campaña está lista, y qué
 * puede hacerse con ella.
 *
 *
 * POR QUÉ ESTO ES LÓGICA PURA
 *
 * Porque una campaña pública se abre una vez y la ve mucha gente de fuera.
 * Abrirla a medias —sin instrumento publicado, sin texto de consentimiento, con
 * fechas al revés— no da un error: da una convocatoria rota delante de un socio
 * institucional. Decidirlo con una función sin base de datos permite probar
 * cada caso, incluidos los que en producción no queremos ver nunca.
 *
 *
 * LO QUE ESTO NO HACE
 *
 * No sustituye a las guardas de 0196. La base sigue negándose a abrir contra un
 * borrador y a mover una campaña con participaciones. Esto existe para
 * EXPLICAR antes de intentarlo: una pantalla que solo dice «no se pudo» obliga
 * a adivinar qué falta.
 */

export type CampaignStatus = "draft" | "open" | "closed" | "archived";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Borrador",
  open: "Abierta",
  closed: "Cerrada",
  archived: "Archivada",
};

// ---------------------------------------------------------------------------
// 1 · El slug
// ---------------------------------------------------------------------------

/** Sugerencia a partir del nombre. Editable mientras la campaña sea borrador. */
export function suggestCampaignSlug(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // sin tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** La MISMA forma que exige la base. Si divergieran, la pantalla mentiría. */
export function isValidCampaignSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 80;
}

/** La dirección que tendrá cuando exista la ruta pública. */
export function publicCampaignUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/diagnostic/${slug}`;
}

// ---------------------------------------------------------------------------
// 2 · Preparación
// ---------------------------------------------------------------------------

export type CampaignReadinessInput = {
  name: string | null;
  slug: string | null;
  diagnosticVersionId: string | null;
  /** Estado de la versión elegida, tal como está HOY. */
  diagnosticVersionStatus: "draft" | "published" | "retired" | null;
  consentDocumentId: string | null;
  consentContentHash: string | null;
  opensAt: string | null;
  closesAt: string | null;
};

export type CampaignReadiness = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
};

/**
 * Qué impide abrir, y qué conviene mirar aunque no impida.
 *
 * La diferencia importa: un bloqueo se arregla antes de abrir; un aviso es una
 * decisión. Mezclarlos convierte la lista en ruido y la gente deja de leerla.
 */
export function evaluateCampaignReadiness(c: CampaignReadinessInput): CampaignReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!c.name || c.name.trim().length < 3) {
    blockers.push("Falta el nombre de la campaña.");
  }
  if (!c.slug) {
    blockers.push("Falta la dirección pública (slug).");
  } else if (!isValidCampaignSlug(c.slug)) {
    blockers.push(
      "La dirección pública no es válida: solo minúsculas, números y guiones, entre 3 y 80 caracteres.");
  }

  if (!c.diagnosticVersionId) {
    blockers.push("Falta elegir la versión del instrumento.");
  } else if (c.diagnosticVersionStatus !== "published") {
    blockers.push(
      c.diagnosticVersionStatus === "draft"
        ? "La versión elegida es un borrador: publícala antes de abrir la campaña."
        : "La versión elegida ya no está vigente. Elige la publicada.");
  }

  // Sin documento NO se abre, y no se inventa uno genérico: quien participa
  // tiene que poder saber qué aceptó, y para eso hace falta un texto publicado.
  if (!c.consentDocumentId) {
    blockers.push(
      "Falta el documento de consentimiento. Sin él no se puede pedir el tratamiento de datos.");
  } else if (!c.consentContentHash) {
    warnings.push(
      "El documento de consentimiento no tiene huella de contenido: se podrá demostrar "
      + "cuál se aceptó, pero no su texto exacto.");
  }

  const desde = c.opensAt ? Date.parse(c.opensAt) : null;
  const hasta = c.closesAt ? Date.parse(c.closesAt) : null;
  if (c.opensAt && Number.isNaN(desde)) blockers.push("La fecha de apertura no es válida.");
  if (c.closesAt && Number.isNaN(hasta)) blockers.push("La fecha de cierre no es válida.");
  if (desde !== null && hasta !== null && !Number.isNaN(desde) && !Number.isNaN(hasta)
      && hasta <= desde) {
    blockers.push("La fecha de cierre debe ser posterior a la de apertura.");
  }
  if (!c.closesAt) {
    warnings.push("La campaña no tiene fecha de cierre: quedará abierta hasta que se cierre a mano.");
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// 3 · Ciclo de vida
// ---------------------------------------------------------------------------

/**
 * Las transiciones permitidas, y solo esas.
 *
 * `closed → open` NO se permite en este corte, y es una decisión, no un olvido:
 * reabrir una convocatoria cerrada mezcla en un mismo conjunto de datos a quien
 * respondió dentro del plazo y a quien respondió después, y eso no se puede
 * deshacer luego al analizar. Si hace falta una segunda ronda, es otra campaña.
 *
 * `archived` es terminal.
 */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["open", "archived"],
  open: ["closed"],
  closed: ["archived"],
  archived: [],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

export const TRANSITION_DENIED_MESSAGE: Record<string, string> = {
  "closed→open":
    "Una campaña cerrada no se reabre: quien respondiera después quedaría mezclado con "
    + "quien respondió dentro del plazo. Si hace falta otra ronda, crea una campaña nueva.",
  "archived→open": "Una campaña archivada no se reabre.",
  "archived→closed": "Una campaña archivada ya no cambia de estado.",
};

export function transitionDeniedMessage(from: CampaignStatus, to: CampaignStatus): string {
  return TRANSITION_DENIED_MESSAGE[`${from}→${to}`]
    ?? `No se puede pasar de «${CAMPAIGN_STATUS_LABEL[from]}» a «${CAMPAIGN_STATUS_LABEL[to]}».`;
}

// ---------------------------------------------------------------------------
// 4 · Disponibilidad ≠ estado
// ---------------------------------------------------------------------------

/**
 * Una campaña puede estar ABIERTA y todavía no admitir a nadie.
 *
 * El estado lo decide una persona; la disponibilidad, el reloj. Separarlos
 * evita necesitar un cron que vaya abriendo y cerrando —el mismo criterio que
 * ya usa el vencimiento de módulos— y evita el error contrario: creer que
 * `status = open` significa «se puede participar».
 */
export type CampaignAvailability =
  | "not_open" | "scheduled" | "available" | "window_closed" | "closed";

export function campaignAvailability(
  status: CampaignStatus,
  opensAt: string | null,
  closesAt: string | null,
  now: Date
): CampaignAvailability {
  if (status === "draft") return "not_open";
  if (status === "closed" || status === "archived") return "closed";
  const t = now.getTime();
  if (opensAt && Date.parse(opensAt) > t) return "scheduled";
  if (closesAt && Date.parse(closesAt) <= t) return "window_closed";
  return "available";
}

export const AVAILABILITY_LABEL: Record<CampaignAvailability, string> = {
  not_open: "Sin abrir",
  scheduled: "Abierta · empieza más adelante",
  available: "Recibiendo participaciones",
  window_closed: "Abierta · la ventana ya terminó",
  closed: "Cerrada",
};
