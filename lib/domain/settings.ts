/**
 * Trazaloop · Sprint 8.3 · Lógica PURA de configuración de empresa y perfil.
 *
 * Mismo patrón que lib/domain/team.ts: estas funciones son la
 * ESPECIFICACIÓN de quién puede editar qué y qué datos son válidos.
 * organizations_update (solo admin, `is_org_admin`) y profiles_update
 * (solo el propio usuario, `id = auth.uid()`) YA EXISTÍAN desde el
 * Sprint 1 — este módulo no cambia esas políticas, solo refleja la misma
 * regla en TypeScript para poder validar en servidor con un mensaje claro
 * ANTES de que la base rechace el UPDATE, y para poder probarla sin BD con
 * `npm run test:settings`.
 *
 * Sin imports de Supabase, de servidor ni de Next. No cambia la
 * metodología de cálculo de contenido reciclado.
 */
import { isValidEmail, normalizeEmail } from "./team";

// ---------------------------------------------------------------------------
// Permisos (Parte 3 y Parte 5 del Sprint 8.3).
// ---------------------------------------------------------------------------

/** Solo admin edita datos de empresa (organizations_update ya lo exige a
 *  nivel de RLS: is_org_admin(id); esto es la misma regla en servidor,
 *  para dar un mensaje claro sin esperar el error crudo de la base). */
export function canEditCompany(actorRole: string | null | undefined): boolean {
  return actorRole === "admin";
}

/** Cualquier miembro autenticado puede editar su PROPIO perfil (nunca el
 *  de otro): la propia sesión ya fija de quién es el perfil — no hace
 *  falta ningún chequeo de rol aquí, la restricción es "es el mío o no". */
export function canEditProfile(sessionUserId: string, targetUserId: string): boolean {
  return sessionUserId === targetUserId;
}

// ---------------------------------------------------------------------------
// Validación de "Datos de empresa" (Parte 2, Parte 9 casos 1-5, 9-12).
// ---------------------------------------------------------------------------
export type CompanySettingsInput = {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
};

export type SettingsValidation = { error: string | null };

/** URL simple y permisiva: con o sin protocolo, con al menos un punto en
 *  el host. No es un validador RFC estricto — evita que se guarde
 *  cualquier texto libre como sitio web, sin ser innecesariamente rígido. */
const WEBSITE_RE = /^(https?:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/\S*)?$/i;

export function isValidWebsite(raw: string): boolean {
  return WEBSITE_RE.test(raw.trim());
}

/** Normaliza vacío/espacios a null (campo "no informado"), igual que el
 *  resto de los formularios opcionales de la app. */
function normalizeOptionalText(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Valida los datos de empresa (Parte 9, casos 1-5 y 9-12). NO valida por sí
 * sola quién puede llamarla — eso es canEditCompany, una regla aparte,
 * comprobada primero en el server action.
 */
export function validateCompanySettings(input: CompanySettingsInput): SettingsValidation {
  if (!input.name || input.name.trim().length === 0) {
    return { error: "El nombre de la empresa no puede estar vacío." };
  }

  const website = normalizeOptionalText(input.website);
  if (website && !isValidWebsite(website)) {
    return { error: "El sitio web no parece una dirección válida." };
  }

  const contactEmail = normalizeOptionalText(input.contactEmail);
  if (contactEmail && !isValidEmail(contactEmail)) {
    return { error: "El correo de contacto no parece válido." };
  }

  // tax_id / NIT: opcional a propósito (Parte 9, caso 9) — una empresa
  // recién creada puede no tenerlo todavía; no se exige.
  return { error: null };
}

export type TrustedCompanySettingsUpdate = {
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
};

/**
 * Arma el payload de actualización de la empresa. El `organizationId`
 * usado para el UPDATE real SIEMPRE lo decide el server action con
 * `.eq("id", organizationId)` de la empresa activa validada en servidor
 * (requireActiveOrg) — este payload ni siquiera tiene un campo
 * organization_id/id: no hay forma de que un valor así "viaje" a través
 * de él (Parte 9, caso 5, mismo patrón que buildInvitationInsertPayload).
 */
export function buildCompanySettingsUpdatePayload(
  input: CompanySettingsInput
): TrustedCompanySettingsUpdate {
  const contactEmail = normalizeOptionalText(input.contactEmail);
  return {
    name: input.name.trim(),
    legal_name: normalizeOptionalText(input.legalName),
    tax_id: normalizeOptionalText(input.taxId),
    contact_email: contactEmail ? normalizeEmail(contactEmail) : null,
    phone: normalizeOptionalText(input.phone),
    address: normalizeOptionalText(input.address),
    city: normalizeOptionalText(input.city),
    country: normalizeOptionalText(input.country),
    website: normalizeOptionalText(input.website),
  };
}

// ---------------------------------------------------------------------------
// Validación de "Mi perfil" (Parte 4, Parte 9 casos 6-8).
// ---------------------------------------------------------------------------
export type ProfileSettingsInput = {
  fullName: string;
  phone?: string | null;
  position?: string | null;
  // NUNCA "email": el correo de autenticación no se edita desde este
  // formulario (Parte 4, Parte 9 caso 8) — el tipo ni siquiera lo declara,
  // así que no hay forma de que un intento de mandarlo llegue a alguna
  // parte que lo use.
};

export function validateProfileSettings(input: ProfileSettingsInput): SettingsValidation {
  if (!input.fullName || input.fullName.trim().length === 0) {
    return { error: "El nombre completo no puede estar vacío." };
  }
  return { error: null };
}

export type TrustedProfileUpdate = {
  full_name: string;
  phone: string | null;
  position: string | null;
};

/** Igual que buildCompanySettingsUpdatePayload: no declara ningún campo de
 *  identidad (id/user_id/email) — el server action siempre actualiza
 *  `.eq("id", session.user.id)`, nunca un id que venga del cliente. */
export function buildProfileUpdatePayload(input: ProfileSettingsInput): TrustedProfileUpdate {
  return {
    full_name: input.fullName.trim(),
    phone: normalizeOptionalText(input.phone),
    position: normalizeOptionalText(input.position),
  };
}

// ---------------------------------------------------------------------------
// Logo de empresa (Sprint 9.2, Parte 6). Bucket privado `organization-assets`
// (0049) — separado de `evidences`: un logo no es una evidencia técnica.
// ---------------------------------------------------------------------------
/**
 * EXPORT-01.3 (§22) · Lo que se acepta al subir es EXACTAMENTE lo que la
 * plataforma sabe normalizar para un PDF.
 *
 * Aceptar un formato que después no se puede usar es el defecto que este sprint
 * vino a cerrar: la empresa sube su logo, lo ve en pantalla y sus documentos
 * salen sin él. AVIF entra en la lista porque el normalizador lo resuelve, no
 * al revés. Una prueba compara esta lista con `SUPPORTED_LOGO_KINDS`.
 *
 * SVG sigue fuera, y es una decisión, no un olvido: un SVG es un documento con
 * scripts, no un mapa de bits, y admitirlo exige saneamiento propio.
 */
export const ALLOWED_LOGO_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/avif",
] as const;
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export const LOGO_TOO_LARGE_MESSAGE = "El logo no puede pesar más de 2 MB.";
export const LOGO_INVALID_TYPE_MESSAGE =
  "Formato no admitido. Usa PNG, JPG/JPEG, WebP o AVIF (SVG no se admite por ahora).";
/** §23 · El contenido no coincide con ninguna imagen que sepamos procesar. */
export const LOGO_CONTENT_MISMATCH_MESSAGE =
  "El archivo no es una imagen que podamos procesar. Vuelve a exportarlo como PNG, JPG, WebP o AVIF.";

/** Validación de negocio: tamaño máximo 2 MB y un tipo declarado de la lista.
 *
 *  OJO: el tipo declarado es una AFIRMACIÓN DEL NAVEGADOR, y basta renombrar un
 *  archivo para que mienta. Esta comprobación es la primera puerta, no la
 *  única: el servidor vuelve a mirar el CONTENIDO antes de guardar nada
 *  (§23). */
export function validateLogoFile(file: { size: number; type: string }): SettingsValidation {
  if (file.size <= 0) {
    return { error: "Selecciona un archivo de imagen." };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { error: LOGO_TOO_LARGE_MESSAGE };
  }
  if (!(ALLOWED_LOGO_TYPES as readonly string[]).includes(file.type)) {
    return { error: LOGO_INVALID_TYPE_MESSAGE };
  }
  return { error: null };
}

/** Extensión segura a partir del tipo MIME validado (nunca del nombre
 *  original del archivo, que el cliente controla). */
export function logoExtensionForType(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}
