/**
 * Trazaloop · PE-02B2 · El vocabulario visible de la consola de FAQ.
 *
 * Lógica PURA: las etiquetas y las reglas de presentación que la pantalla y las
 * pruebas comparten. Ninguna decisión de acceso vive aquí — eso es de la base.
 */

export const FAQ_VISIBILITY_LABEL = {
  public: "Pública · se lee sin sesión",
  authenticated: "Con sesión",
} as const;

export const FAQ_STATUS_LABEL = {
  draft: "Borrador",
  published: "Publicada",
  unpublished: "Retirada",
} as const;

export const FAQ_STATUS_HINT = {
  draft: "Nunca se publicó. No la ve nadie de fuera.",
  published: "Hay una versión vigente y se está leyendo.",
  unpublished: "Se publicó y se retiró. El texto se conserva.",
} as const;

export const FAQ_NORMATIVE_LABEL = {
  safe: "No menciona normas",
  normative_reference: "Cita una norma como referencia",
  conformity_risk: "Podría leerse como afirmación de cumplimiento",
  certification_risk: "Podría leerse como afirmación de certificación",
  ambiguous: "Se puede leer de las dos maneras",
} as const;

export const FAQ_VERIFICATION_LABEL = {
  verified: "Verificada",
  verified_with_qualifier: "Verificada con salvedad",
  external_policy_verification_required: "Depende de una política externa sin comprobar",
  not_verified: "Sin comprobar",
  must_not_claim: "No se puede afirmar",
} as const;

export type FaqVerification = keyof typeof FAQ_VERIFICATION_LABEL;

/** Los tres estados con los que la base RECHAZA publicar (0155 §7). */
export const FAQ_VERIFICATION_BLOCKING: readonly FaqVerification[] = [
  "external_policy_verification_required",
  "not_verified",
  "must_not_claim",
];

export function faqVerificationBlocks(v: FaqVerification): boolean {
  return FAQ_VERIFICATION_BLOCKING.includes(v);
}

/**
 * Por qué NO se puede publicar todavía, dicho para quien lo va a leer.
 *
 * Devuelve `null` cuando sí se puede. La pantalla usa esto para avisar ANTES de
 * enviar; la barrera de verdad sigue siendo la base, y esta función no la
 * sustituye (§7 del encargo, y por eso está escrito aquí también).
 */
export function faqPublishBlockReason(draft: {
  verificationStatus: FaqVerification;
  verificationNote: string | null;
  externalSourceUrl: string | null;
  externalSourceCheckedOn: string | null;
} | null): string | null {
  if (!draft) return "No hay borrador que publicar.";
  if (draft.verificationStatus === "external_policy_verification_required") {
    return "Esta respuesta depende de la política de un tercero que todavía no se ha comprobado. Compruébala, anota la fuente y la fecha, y cambia el estado de verificación.";
  }
  if (draft.verificationStatus === "not_verified") {
    return "Esta respuesta todavía no se ha comprobado. Anota en qué se apoya y cambia su estado de verificación.";
  }
  if (draft.verificationStatus === "must_not_claim") {
    return "Esta respuesta está marcada como no afirmable: publicarla sería decir algo que no es cierto.";
  }
  if (draft.verificationStatus === "verified_with_qualifier"
      && (draft.verificationNote ?? "").trim().length < 10) {
    return "Está marcada como verificada CON salvedad, y la salvedad no está escrita. Una salvedad que no se escribe no es una salvedad.";
  }
  if (draft.externalSourceUrl && !draft.externalSourceCheckedOn) {
    return "Citas una política externa sin decir qué día la comprobaste. La política de un tercero cambia; sin fecha no se sabe cuándo dejó de ser cierta.";
  }
  return null;
}

/** ¿Esta categoría exige extremar el cuidado editorial? */
export function isSecurityCategory(code: string): boolean {
  return code === "seguridad";
}

export const FAQ_SECURITY_REMINDER =
  "Esta respuesta habla de seguridad o privacidad. Antes de publicarla, deja escrito en qué se apoya: quien la lea dentro de un año tiene que poder comprobarlo.";

/**
 * Lo que se dice cuando una lectura FALLA.
 *
 * Vive aquí y no junto a las acciones porque un módulo `"use server"` solo puede
 * exportar funciones asíncronas —una regla de Next.js que este repositorio
 * comprueba con una invariante—, y porque la frase la comparten la consola de
 * la FAQ, sus pruebas y cualquier pantalla futura.
 *
 * Dice «temporal» y no «no hay»: una avería no es una ausencia, y quien lee «no
 * hay contenido» cree que perdió su trabajo.
 */
export const FAQ_UNAVAILABLE_MESSAGE =
  "No fue posible consultar el contenido de la plataforma. Es un problema temporal, no una pérdida de contenido. Vuelve a intentarlo en unos minutos.";
