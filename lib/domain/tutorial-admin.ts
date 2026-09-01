/**
 * Trazaloop · PE-03B2 · Las palabras de la consola de tutoriales.
 *
 * Puro y sin `"use server"`: un módulo de acciones solo puede exportar
 * funciones asíncronas, así que los textos viven aquí. Es la misma corrección
 * que PE-02B2 tuvo que hacer con `FAQ_UNAVAILABLE_MESSAGE`.
 */

export const TUTORIAL_CONSOLE_UNAVAILABLE =
  "No se pudo consultar los tutoriales. Vuelve a intentarlo; si sigue igual, avisa al equipo.";

/**
 * El estado de la SUBIDA, que no es el estado de la publicación.
 *
 * Se nombran con lo que significan para quien mira, no con el valor de la
 * columna: «Verificado» dice más que `verified` a quien acaba de subir un
 * archivo y quiere saber si ya puede publicarlo.
 */
export const TUTORIAL_FILE_STATE_LABEL: Record<string, string> = {
  reserved: "Esperando el archivo",
  uploaded: "Subido, sin verificar",
  verified: "Verificado",
  failed: "La subida falló",
};

/**
 * Y el estado de la PUBLICACIÓN.
 *
 * Se dice «Publicada» y no «Activa». PE-02 aprendió que «activo» significa
 * cosas distintas en cada pantalla —un módulo activo, una cuenta activa, un
 * documento activo— y que el verbo concreto siempre gana.
 */
export type TutorialPublicationState = "candidate" | "published" | "historical";

export function tutorialPublicationState(v: {
  effectiveFrom: string | null; effectiveTo: string | null;
}): TutorialPublicationState {
  if (v.effectiveFrom === null) return "candidate";
  return v.effectiveTo === null ? "published" : "historical";
}

export const TUTORIAL_PUBLICATION_LABEL: Record<TutorialPublicationState, string> = {
  candidate: "Sin publicar",
  published: "Publicada",
  historical: "Histórica",
};

/**
 * Lo que se dice de un tutorial en la lista.
 *
 * Que una pantalla no tenga vídeo NO es un defecto: es el estado normal de casi
 * todas mientras se graban. Por eso se llama «Sin vídeo todavía» y no «Falta»
 * ni «Incompleto».
 */
export function tutorialCoverageLabel(row: {
  current: unknown | null; candidate: unknown | null;
}): { text: string; tone: "ok" | "pending" | "none" } {
  if (row.current) return { text: "Con vídeo publicado", tone: "ok" };
  if (row.candidate) return { text: "Sin publicar · hay una versión lista", tone: "pending" };
  return { text: "Sin vídeo todavía", tone: "none" };
}

/** Tamaño legible. Un número en bytes no le dice nada a nadie. */
export function humanFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Duración legible, y «—» cuando no se sabe. Jamás un cero inventado. */
export function humanDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Los pasos de una subida, con el nombre que se le enseña a la persona.
 *
 * «Listo para revisar» y no «Publicado»: es exactamente la confusión que este
 * tramo tiene que evitar. Subir no publica.
 */
export const TUTORIAL_UPLOAD_STEP_LABEL = {
  idle: "Seleccionar archivo",
  reserving: "Preparando…",
  uploading: "Subiendo…",
  verifying: "Verificando el archivo…",
  done: "Listo para revisar",
  error: "No se pudo subir",
} as const;

export type TutorialUploadStep = keyof typeof TUTORIAL_UPLOAD_STEP_LABEL;

/**
 * Traduce el fallo a algo que se pueda leer.
 *
 * Nunca se enseña el texto crudo del almacenamiento: «new row violates
 * row-level security policy» no le dice a nadie qué hacer, y de paso cuenta
 * cómo está construido por dentro.
 */
export function tutorialUploadErrorMessage(raw: string | null | undefined): string {
  const m = (raw ?? "").toLowerCase();
  if (/expir|caduc/.test(m)) {
    return "La reserva de subida caducó. Vuelve a empezar; el archivo no se perdió de tu equipo.";
  }
  if (/row-level security|not authorized|unauthorized|permission/.test(m)) {
    return "El almacenamiento rechazó la subida. Vuelve a empezar.";
  }
  if (/exceeded|too large|payload|maximum allowed size/.test(m)) {
    // El límite ya no es de Trazaloop, así que el mensaje no puede dar un
    // número como si fuera una regla del producto: sería mentira y además
    // caducaría en cuanto el proveedor cambiara el suyo.
    return "El servicio de almacenamiento rechazó el archivo por su tamaño. "
      + "No es un límite de Trazaloop: es la capacidad técnica del servicio.";
  }
  if (/mime|content type|invalid/.test(m)) {
    return "Solo se admiten vídeos en formato MP4 o WebM.";
  }
  if (/exists/.test(m)) {
    return "Ya hay un archivo en esa ruta. Vuelve a empezar.";
  }
  return "No fue posible subir el vídeo. Vuelve a intentarlo.";
}
