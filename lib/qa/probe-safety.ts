import { randomBytes } from "node:crypto";

/**
 * Trazaloop · PE-03 · Lo que una sonda de QA tiene que hacer bien.
 *
 * Existe porque una sonda contra Staging se equivocó en dos cosas a la vez, y
 * las dos son del tipo que se repite si no queda escrito en un sitio:
 *
 *   1 · usó una contraseña estática que está en el repositorio, y su limpieza
 *       falló, así que quedó una cuenta de Staging con contraseña pública;
 *   2 · borró el objeto de una versión que HABÍA LLEGADO A PUBLICARSE, porque
 *       su `finally` retiraba lo subido sin preguntarle nada a la base.
 *
 * No es una librería de pruebas. Son tres funciones y una regla, pensadas para
 * que la siguiente sonda no tenga que acordarse de nada.
 */

// ===========================================================================
// 1 · CREDENCIALES EFÍMERAS
// ===========================================================================

/**
 * Una contraseña de un solo uso, en memoria y nada más.
 *
 * POR QUÉ NO UNA CONSTANTE
 *
 * Las suites usan `Trazaloop-Test-1234` y es aceptable: crean cuentas contra la
 * base LOCAL, que se replaya entera. Contra Staging no lo es. Si la limpieza
 * falla —y falló—, queda una cuenta viva en un entorno compartido cuya
 * contraseña está escrita en un fichero versionado.
 *
 * Esta se genera al arrancar, vive en una variable, y desaparece con el
 * proceso. **No se imprime, no se guarda y no se documenta**, así que aunque la
 * cuenta sobreviva a un fallo, no sirve para entrar.
 *
 * 32 bytes en base64url: suficiente para que adivinarla no sea un plan.
 */
export function ephemeralQaPassword(): string {
  // El prefijo garantiza los requisitos de complejidad que pida Auth sin
  // reducir la entropía de lo aleatorio.
  return `Qa1!${randomBytes(32).toString("base64url")}`;
}

// ===========================================================================
// 2 · QUÉ SE PUEDE BORRAR DE STORAGE, Y QUÉ NO
// ===========================================================================

/** Lo que la sonda necesita saber de la base antes de borrar un objeto. */
export type ObjectReference = {
  /** ¿Alguna versión que referencia este objeto llegó a publicarse alguna vez? */
  everPublished: boolean;
  /** Cuántas versiones lo referencian, publicadas o no. */
  referencingVersions: number;
};

export type CleanupDecision =
  | { remove: true; reason: "never_published" }
  | { remove: false; reason: "was_published" | "still_referenced" | "unknown_state" };

/**
 * La regla, en una función.
 *
 * **Un objeto referenciado por una versión que haya sido publicada NO se borra
 * por limpieza de QA.** Ni aunque la sonda crea que no llegó a publicar: lo que
 * decide es lo que dice la base AHORA, no lo que la sonda recuerda haber hecho.
 *
 * La diferencia no es teórica. La sonda que falló tenía razón en su variable
 * local hasta la línea en la que publicó; su `finally` se ejecutó después, con
 * la variable intacta y la base ya avanzada.
 *
 * `unknown_state` no borra. Ante la duda, un objeto de más ocupa unos megas; un
 * objeto de menos rompe una versión publicada.
 */
export function decideObjectCleanup(ref: ObjectReference | null): CleanupDecision {
  if (ref === null) return { remove: false, reason: "unknown_state" };
  if (ref.everPublished) return { remove: false, reason: "was_published" };
  if (ref.referencingVersions > 1) return { remove: false, reason: "still_referenced" };
  return { remove: true, reason: "never_published" };
}

export const CLEANUP_REASON_TEXT: Record<CleanupDecision["reason"], string> = {
  never_published: "nunca se publicó · se retira",
  was_published: "llegó a publicarse · SE CONSERVA",
  still_referenced: "otra versión lo referencia · SE CONSERVA",
  unknown_state: "no se pudo consultar el estado · SE CONSERVA",
};

// ===========================================================================
// 3 · QUE NO QUEDE UN PRIVILEGIO SUELTO
// ===========================================================================

/**
 * Las cuentas con rol de plataforma que SÍ deben existir en Staging.
 *
 * Es una lista de identidades, no un número. Comprobar «hay un superadmin» deja
 * pasar el caso en que el que hay es el equivocado, y eso es exactamente lo que
 * la sonda produjo: dos, y el sobrante era el suyo.
 */
export const STAGING_EXPECTED_PLATFORM_ACCOUNTS = [
  "qa-a@trazaloop-staging.local",
] as const;

export type StaffRow = { email: string | null; roleCode: string; status: string };

export type ResidueReport = {
  ok: boolean;
  /** Cuentas con privilegio activo que no estaban previstas. */
  unexpected: StaffRow[];
  /** Cuentas previstas que ya no tienen el privilegio. También es un problema. */
  missing: string[];
};

/**
 * ¿La sonda dejó un privilegio que no había antes?
 *
 * Compara **identidades**, no cuentas. Y avisa en los dos sentidos: sobra una
 * cuenta con privilegio, o falta una de las que debía tenerlo — porque una
 * limpieza demasiado entusiasta es tan mala como una que no limpia.
 */
export function checkPlatformResidue(
  activeSuperadmins: StaffRow[],
  allowlist: readonly string[] = STAGING_EXPECTED_PLATFORM_ACCOUNTS
): ResidueReport {
  const permitidas = new Set(allowlist.map((e) => e.toLowerCase()));
  const presentes = new Set(
    activeSuperadmins.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean)
  );

  const unexpected = activeSuperadmins.filter(
    (r) => !permitidas.has((r.email ?? "").toLowerCase())
  );
  const missing = [...permitidas].filter((e) => !presentes.has(e));

  return { ok: unexpected.length === 0 && missing.length === 0, unexpected, missing };
}
