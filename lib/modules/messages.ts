/**
 * Trazaloop · Sprint T9F · Mensajes y etiquetas COMPARTIDOS del estado
 * comercial de un módulo. Un solo lugar para el selector, los banners, los
 * guards y el superadministrador — nunca textos duplicados por componente.
 * Lógica PURA (sin BD, sin sesión).
 */
import type { DerivedModuleState, ModuleAccessReason } from "./access";

/** Etiqueta corta del estado visible (tarjetas del selector, tabla superadmin). */
export const DERIVED_STATE_LABEL: Record<DerivedModuleState, string> = {
  demo_active: "Demo",
  demo_permanent: "Demo permanente",
  demo_expired: "Prueba finalizada",
  full: "Plan Full",
  extra: "Plan Extra",
  disabled: "Módulo deshabilitado",
  globally_disabled: "Temporalmente no disponible",
  coming_soon: "Próximamente",
  not_assigned: "Sin asignar",
};

/** Frase breve secundaria para la tarjeta del selector. */
export const DERIVED_STATE_HINT: Record<DerivedModuleState, string> = {
  demo_active: "Acceso de prueba.",
  demo_permanent: "Acceso de prueba sin fecha de vencimiento.",
  demo_expired: "Tus datos se conservarán. Contacta al equipo de Trazaloop para reactivar el acceso.",
  full: "Acceso funcional completo.",
  extra: "Acceso funcional completo con almacenamiento ampliado.",
  disabled: "La empresa no tiene acceso a este módulo. Los datos se conservan.",
  globally_disabled: "El módulo no está disponible por el momento.",
  coming_soon: "Este módulo estará disponible próximamente.",
  not_assigned: "Este módulo no está asignado a la empresa.",
};

/** ¿El estado permite entrar al módulo? (espejo de allowed, para la UI). */
export function isEnterableState(state: DerivedModuleState): boolean {
  return state === "demo_active" || state === "demo_permanent" || state === "full" || state === "extra";
}

/** Mensaje de error para una Server Action bloqueada por acceso de módulo. */
export function moduleAccessDeniedMessage(moduleName: string, reason: ModuleAccessReason): string {
  switch (reason) {
    case "demo_expired":
      return `Tu periodo Demo de ${moduleName} ha finalizado. Tus datos se conservarán. Contacta al equipo de Trazaloop para reactivar el acceso.`;
    case "disabled":
      return `El acceso a ${moduleName} está deshabilitado para esta empresa.`;
    case "globally_disabled":
      return `${moduleName} no está disponible por el momento.`;
    case "coming_soon":
      return `${moduleName} estará disponible próximamente.`;
    case "not_assigned":
      return `${moduleName} no está asignado a esta empresa.`;
    default:
      return `No tienes acceso a ${moduleName}.`;
  }
}

/** Aviso general del banner Demo (cuando todos los módulos comparten fecha). */
export const DEMO_BANNER_INTRO =
  "Tu empresa está utilizando Trazaloop en modo Demo. El acceso de prueba estará disponible durante 2 días.";

export const DEMO_EXPIRED_BANNER =
  "Tu periodo Demo ha finalizado. Tus datos se conservarán. Contacta al equipo de Trazaloop para reactivar el acceso.";
