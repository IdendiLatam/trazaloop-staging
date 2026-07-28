/**
 * Trazaloop · v1.0.0 · PAQUETE JURÍDICO — metadatos y textos cortos.
 *
 * Lógica PURA (sin BD, sin sesión, sin process.env, sin Next): describe el
 * paquete jurídico APROBADO, identifica al operador y aporta los textos que
 * la interfaz necesita mostrar en el registro, en el muro de aceptación y
 * en el índice legal.
 *
 * ESTE MÓDULO NO PUBLICA NADA EN LA BASE DE DATOS.
 *
 * `LEGAL_PACKAGE_APPROVED` es el espejo en código del bloqueo
 * `c_legal_approval_confirmed` de `scripts/release/v1/publish-legal-v2.sql`.
 * Vale `true` desde el 27 de julio de 2026: la dirección del proyecto
 * comunicó la aprobación del paquete completo. Constancia interna en
 * `docs/legal/V1.0.0_APPROVAL_RECORD.md`; la evidencia completa se conserva
 * fuera del repositorio.
 *
 * Los TÉRMINOS y la POLÍTICA no se sirven desde aquí: son documentos
 * versionados en `legal_documents` y se leen en /terms y /privacy. Este
 * módulo solo enlaza a esas rutas — nunca guarda una segunda copia.
 */

/** Marca que conservan los documentos auxiliares NO adoptados en la v1.0. */
export const LEGAL_PACKAGE_DRAFT_BANNER = "BORRADOR PARA REVISIÓN JURÍDICA — NO PUBLICAR";

/**
 * Espejo en código del bloqueo del script SQL.
 * APROBADO el 27 de julio de 2026 por la dirección del proyecto.
 */
export const LEGAL_PACKAGE_APPROVED = true;

/** Versión comercial del paquete jurídico. */
export const LEGAL_PACKAGE_VERSION = "1.0";

/** Fecha en que la dirección del proyecto comunicó la aprobación. */
export const LEGAL_PACKAGE_APPROVAL_DATE = "27 de julio de 2026";

/** Fecha de entrada en vigor del paquete. */
export const LEGAL_PACKAGE_EFFECTIVE_DATE = "27 de julio de 2026";

/**
 * Versión INTERNA con la que los documentos versionados entran en
 * `legal_documents`. Es `v2` porque `v1` ya existe desde la migración 0066
 * y nunca se sobrescribe: se archiva. La versión que ve el público es
 * `LEGAL_PACKAGE_VERSION`.
 */
export const LEGAL_PACKAGE_DOCUMENT_DB_VERSION = "v2";

/** Registro interno de la aprobación (no publicable). */
export const LEGAL_PACKAGE_APPROVAL_RECORD = "docs/legal/V1.0.0_APPROVAL_RECORD.md";

/** Identificación del operador. Dato de transparencia, no texto jurídico. */
export const LEGAL_OPERATOR = {
  legalName: "CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL",
  tradeName: "Trazaloop",
  taxId: "901835846-6",
  representative: "Jhorman Mena Ledezma",
  representativeRole: "Director General",
  domicile: "Medellín, Colombia",
  address: "Carrera 43A #15 Sur – 15",
  generalEmail: "contacto@idendi.org",
  privacyEmail: "contacto@idendi.org",
  supportEmail: "contacto@cirquiloconsultores.com",
  phone: "+57 324 3268865",
  website: "https://www.trazaloop.com",
} as const;

/** Los seis documentos del paquete jurídico de la v1.0. */
export const LEGAL_PACKAGE_DOCUMENT_SLUGS = [
  "terminos",
  "privacidad",
  "aviso-privacidad",
  "autorizacion-registro",
  "anexo-tratamiento",
  "aviso-cookies",
] as const;

export type LegalPackageDocumentSlug = (typeof LEGAL_PACKAGE_DOCUMENT_SLUGS)[number];

/** Cómo se entrega cada documento aprobado. */
export type LegalPackageDelivery =
  /** Documento versionado en `legal_documents`; se acepta en /legal/accept. */
  | "versioned_document"
  /** Texto servido por la aplicación desde este módulo. */
  | "static_text"
  /** Se entrega por contrato, a solicitud de la empresa cliente. */
  | "on_request";

export type LegalPackageDocument = {
  slug: LegalPackageDocumentSlug;
  title: string;
  /** Archivo fuente aprobado, para trazabilidad interna. */
  source: string;
  delivery: LegalPackageDelivery;
  /** Ruta pública donde se consulta, cuando la hay. */
  route?: string;
  /** Resumen de una línea, apto para mostrarse en el índice. */
  summary: string;
};

export const LEGAL_PACKAGE_DOCUMENTS: readonly LegalPackageDocument[] = [
  {
    slug: "terminos",
    title: "Términos de uso de Trazaloop v1.0",
    source: "docs/legal/V1.0.0_TERMS_APPROVED.md",
    delivery: "versioned_document",
    route: "/terms",
    summary:
      "Condiciones de uso de la plataforma modular: alcance, cuentas, accesos por módulo, responsabilidades, propiedad intelectual y jurisdicción.",
  },
  {
    slug: "privacidad",
    title: "Política de privacidad y tratamiento de datos personales v1.0",
    source: "docs/legal/V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md",
    delivery: "versioned_document",
    route: "/privacy",
    summary:
      "Responsable, finalidades, categorías de datos, encargados, seguridad, derechos de los titulares y criterios de conservación.",
  },
  {
    slug: "aviso-privacidad",
    title: "Aviso de privacidad",
    source: "docs/legal/V1.0.0_PRIVACY_NOTICE_APPROVED.md",
    delivery: "static_text",
    summary:
      "Versión corta que se muestra en el momento de recoger los datos y remite a la política completa.",
  },
  {
    slug: "autorizacion-registro",
    title: "Autorización para tratamiento de datos en el registro",
    source: "docs/legal/V1.0.0_REGISTRATION_AUTHORIZATION_APPROVED.md",
    delivery: "static_text",
    summary:
      "Texto de la casilla con la que la persona usuaria autoriza el tratamiento de sus datos al crear la cuenta.",
  },
  {
    slug: "anexo-tratamiento",
    title: "Anexo de tratamiento de datos para clientes empresariales",
    source: "docs/legal/V1.0.0_CLIENT_DATA_PROCESSING_ADDENDUM_APPROVED.md",
    delivery: "on_request",
    summary:
      "Encargo del tratamiento sobre los datos que cada empresa cliente registra en la plataforma. Se entrega por contrato, a solicitud.",
  },
  {
    slug: "aviso-cookies",
    title: "Aviso sobre cookies y tecnologías estrictamente necesarias",
    source: "docs/legal/V1.0.0_COOKIE_POLICY_APPROVED.md",
    delivery: "static_text",
    summary:
      "Informa el uso de cookies y mecanismos equivalentes imprescindibles para autenticación, sesión, empresa activa y seguridad.",
  },
] as const;

export function getLegalPackageDocument(slug: string): LegalPackageDocument | null {
  return LEGAL_PACKAGE_DOCUMENTS.find((d) => d.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Textos que la interfaz muestra.
// ---------------------------------------------------------------------------

/**
 * Aviso breve para el pie de los formularios que recogen datos (registro,
 * invitación). No sustituye a la política completa: remite a ella.
 */
export const PRIVACY_NOTICE_SHORT =
  "Tus datos son tratados por la CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL " +
  "(NIT 901835846-6) para crear y administrar tu cuenta, prestarte los módulos habilitados, darte soporte " +
  "y proteger la seguridad de la información. Puedes ejercer tus derechos escribiendo a contacto@idendi.org.";

/**
 * Aviso de privacidad aprobado, en su versión completa. Transcripción del
 * § 1 de `docs/legal/V1.0.0_PRIVACY_NOTICE_APPROVED.md`. Se sirve en
 * /legal/paquete. NO sustituye a la Política completa, que es un documento
 * versionado y vive en /privacy.
 */
export const PRIVACY_NOTICE_FULL: readonly string[] = [
  "La CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL, NIT 901835846-6, " +
    "con domicilio en Medellín, Colombia, Carrera 43A #15 Sur – 15, teléfono +57 324 3268865, " +
    "correo contacto@idendi.org, es responsable del tratamiento de los datos personales que se " +
    "recogen a través de la plataforma Trazaloop (https://www.trazaloop.com).",
  "Tratamos datos de identificación, contacto, empresa, datos técnicos de conexión, registros de " +
    "seguridad y datos de soporte, con las siguientes finalidades necesarias: crear y administrar " +
    "tu cuenta y tus accesos; prestarte los módulos habilitados (Trazaloop CPR y Trazaloop " +
    "Textiles); gestionar los estados comerciales, límites y capacidad de almacenamiento de tu " +
    "empresa; darte soporte; enviarte las comunicaciones necesarias del servicio; garantizar la " +
    "seguridad y el aislamiento de la información entre empresas; conservar la prueba de la " +
    "aceptación de los documentos legales; y cumplir obligaciones legales.",
  "No usamos tus datos para comunicaciones comerciales automatizadas, para analítica de " +
    "comportamiento ni para elaborar perfiles. No solicitamos autorización de mercadeo.",
  "La información que tu empresa registra en sus catálogos, evidencias, documentos, trazabilidad " +
    "y pasaportes es responsabilidad de tu empresa; respecto de ella, Trazaloop actúa como " +
    "encargado del tratamiento, siguiendo sus instrucciones.",
  "La plataforma utiliza cookies y mecanismos equivalentes estrictamente necesarios para " +
    "autenticación, sesión, selección de empresa activa, seguridad y funcionamiento técnico. " +
    "No usamos cookies de analítica ni de publicidad.",
  "Nuestros proveedores tecnológicos (Supabase, Vercel y Resend) tratan la información únicamente " +
    "para prestar el servicio. Puede existir tratamiento o transmisión internacional, sujeto a las " +
    "medidas contractuales, técnicas y legales aplicables.",
  "Como titular puedes conocer, actualizar, rectificar y suprimir tus datos, revocar la " +
    "autorización cuando proceda, solicitar prueba de ella y presentar quejas ante la autoridad " +
    "competente, en los términos de la legislación aplicable.",
  "Para ejercer tus derechos o resolver cualquier consulta sobre privacidad, escríbenos a " +
    "contacto@idendi.org.",
] as const;

/**
 * Texto de autorización de tratamiento que acompaña al registro. Es la
 * finalidad NECESARIA para prestar el servicio: no incluye ni puede incluir
 * comunicaciones comerciales, que quedan fuera del alcance de la v1.0.0.
 */
export const REGISTRATION_AUTHORIZATION_TEXT =
  "Autorizo el tratamiento de mis datos personales por parte de la CORPORACIÓN INSTITUTO PARA EL " +
  "DESARROLLO DEL ENTRETENIMIENTO DIGITAL, conforme a la Política de tratamiento de datos personales " +
  "y privacidad de Trazaloop.";

/**
 * Aviso de cookies estrictamente necesarias. No hay cookies opcionales, así
 * que no existe ni debe existir un mecanismo de consentimiento: solo se
 * informa. Ver `docs/legal/V1.0.0_COOKIE_POLICY_APPROVED.md`.
 */
export const ESSENTIAL_COOKIES_PURPOSES = [
  "autenticación",
  "sesión",
  "selección de empresa activa",
  "seguridad",
  "funcionamiento técnico",
] as const;

/** Inventario de las cookies y mecanismos estrictamente necesarios. */
export const ESSENTIAL_COOKIES_INVENTORY = [
  {
    name: "tz-active-org",
    origin: "Trazaloop (propia)",
    purpose:
      "Recuerda la empresa activa seleccionada. Va firmada y es httpOnly. No es una barrera de seguridad: el control real es la revalidación en servidor.",
    duration: "30 días",
  },
  {
    name: "Cookies de sesión de autenticación",
    origin: "Supabase Auth",
    purpose: "Mantienen la sesión iniciada y refrescan los tokens.",
    duration: "Según la sesión",
  },
] as const;

/** Proveedores tecnológicos actuales, por categoría. Sin ubicación fija. */
export const LEGAL_TECH_PROVIDERS = [
  { name: "Supabase", service: "Autenticación, base de datos y almacenamiento" },
  { name: "Vercel", service: "Alojamiento y entrega de la aplicación web" },
  { name: "Resend", service: "Envío transaccional de correos de autenticación" },
] as const;
