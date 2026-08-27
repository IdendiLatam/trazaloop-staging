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
  "Tu periodo de prueba ha finalizado. Tus datos se conservarán. Contacta al equipo de Trazaloop para reactivar el acceso.";

export const DEMO_PARTIAL_BANNER_TITLE = "Algunas pruebas de módulos han finalizado.";

/** Hay pruebas en curso, pero la empresa NO está de prueba: tiene algo más. */
export const DEMO_ACTIVE_PARTIAL_TITLE = "Tienes módulos en periodo de prueba.";

export const DEMO_ACTIVE_PARTIAL_BODY =
  "El resto de tu acceso no es una prueba y no vence.";

export const DEMO_PARTIAL_BANNER_BODY =
  "Los módulos con acceso vigente continúan disponibles.";

// ---------------------------------------------------------------------------
// AVISO DE PRUEBA — clasificación por MÓDULO, nunca por cuenta
// ---------------------------------------------------------------------------

/**
 * El vencimiento es un hecho DE UN MÓDULO. La cuenta no vence.
 *
 * Antes de este arreglo el aviso se decidía con una sola pregunta —«¿hay algún
 * demo activo?»— y, si la respuesta era no, anunciaba «Tu periodo Demo ha
 * finalizado» aunque la empresa tuviera un módulo en Full plenamente usable.
 * El mensaje se mostraba incluso DENTRO de ese módulo, contradiciendo lo que
 * el usuario estaba haciendo en ese mismo momento.
 *
 * La clasificación necesita dos hechos independientes: qué venció y qué sigue
 * siendo entrable. Con uno solo no se puede distinguir «se te acabó todo» de
 * «se te acabó una prueba y lo demás sigue en pie», que es justo la diferencia
 * que importa.
 */
export type DemoNoticeKind =
  | "none" // nada que anunciar
  | "active" // TODO lo que la empresa tiene está en prueba
  | "active_partial" // hay pruebas en curso, pero algo NO es una prueba
  | "partial" // venció alguna prueba, pero queda al menos un módulo entrable
  | "all_expired"; // venció alguna prueba y NO queda ningún módulo entrable

/** Lo mínimo que hace falta de cada módulo para clasificar el aviso. */
export type ModuleNoticeInput = { state: DerivedModuleState };

/**
 * ¿Qué aviso corresponde al conjunto de módulos de la empresa?
 *
 * Solo cuentan los módulos APLICABLES: los que la empresa tiene asignados y
 * son funcionales. Uno «Próximamente» o «Sin asignar» no vence —nunca lo
 * tuvo— y tampoco puede salvar a la cuenta de un aviso general.
 */
export function classifyDemoNotice(modules: ModuleNoticeInput[]): DemoNoticeKind {
  const applicable = modules.filter(
    (m) => m.state !== "coming_soon" && m.state !== "not_assigned"
  );
  const expired = applicable.some((m) => m.state === "demo_expired");
  const enterable = applicable.some((m) => isEnterableState(m.state));
  const activeDemo = applicable.some((m) => m.state === "demo_active");

  if (expired) return enterable ? "partial" : "all_expired";

  // Que haya una prueba en curso no convierte a la EMPRESA en una prueba.
  //
  // Esto se vio en la validación de QUALITY-12.1: una empresa con Quality en
  // Full sin vencimiento y dos módulos que nunca usa en Demo de dos días leía
  // «Tu empresa está utilizando Trazaloop en modo Demo… finaliza el 29 de
  // agosto» mientras trabajaba dentro de Quality. Es el mismo error que ya se
  // había corregido para el vencimiento —hablar en nombre de la cuenta cuando
  // el hecho es de un módulo— y que en el caso «hay prueba activa» seguía
  // intacto.
  //
  // La distinción es la que importa: si TODO lo que la empresa tiene es una
  // prueba, decir que la empresa está de prueba es cierto. Si además tiene algo
  // contratado, no lo es, y hay que nombrar qué está en prueba.
  if (activeDemo) {
    const soloPruebas = applicable.every((m) => m.state === "demo_active");
    return soloPruebas ? "active" : "active_partial";
  }
  return "none";
}

/**
 * Ordena las tarjetas del selector dejando delante las que SÍ se pueden usar.
 *
 * El catálogo tiene un orden histórico (PCR, Textiles, Quality, Construcción)
 * y las tarjetas se pintaban en ese orden sin más. Con PCR y Textiles
 * bloqueados, el único módulo utilizable quedaba en la segunda fila y su
 * «Entrar →» —la última línea de la tarjeta más alta— caía por debajo del
 * borde inferior de la pantalla. El usuario veía «Plan Full · Acceso funcional
 * completo» y ningún modo de entrar, sin nada que le indicara que había que
 * desplazarse.
 *
 * El orden se decide por el ESTADO, no por la clave del módulo: cualquier
 * módulo futuro entra en la regla sin tocar esta función.
 */
export function sortModulesForSelector<T>(
  items: readonly T[],
  isEnterable: (item: T) => boolean
): T[] {
  return items
    .map((item, index) => ({ item, index, enterable: isEnterable(item) }))
    .sort((a, b) =>
      a.enterable === b.enterable ? a.index - b.index : a.enterable ? -1 : 1
    )
    .map((entry) => entry.item);
}
