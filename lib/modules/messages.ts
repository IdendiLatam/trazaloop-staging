/**
 * Trazaloop · Sprint T9F · Mensajes y etiquetas COMPARTIDOS del estado
 * comercial de un módulo. Un solo lugar para el selector, los banners, los
 * guards y el superadministrador — nunca textos duplicados por componente.
 * Lógica PURA (sin BD, sin sesión).
 */
import type { DerivedModuleState, ModuleAccessReason } from "./access";

/** Etiqueta corta del estado visible (tarjetas del selector, tabla superadmin). */
export const DERIVED_STATE_LABEL: Record<DerivedModuleState, string> = {
  demo_active: "Prueba",
  demo_permanent: "Acceso de prueba",
  // PROD-LAUNCH-01C.4 · «Prueba finalizada» era exacta y se leía como una
  // puerta cerrada: describía lo que se acabó en vez de lo que queda. Lo que
  // queda es la información, y se puede entrar a verla.
  demo_expired: "Solo consulta",
  // PROD-LAUNCH-01D.4A · Se pagó y el periodo terminó. Misma capacidad que
  // «Solo consulta» y nombre distinto a propósito: quien pagó no está en una
  // prueba, y llamarlo igual borraría esa diferencia justo en la pantalla
  // donde decide si renueva.
  full_expired: "Periodo finalizado",
  full: "Activo",
  extra: "Activo · almacenamiento ampliado",
  disabled: "Acceso suspendido",
  globally_disabled: "Temporalmente no disponible",
  coming_soon: "Próximamente",
  not_assigned: "No incluido",
  unavailable: "No se pudo verificar",
};

/** Frase breve secundaria para la tarjeta del selector. */
export const DERIVED_STATE_HINT: Record<DerivedModuleState, string> = {
  demo_active: "Acceso de prueba.",
  demo_permanent: "Acceso de prueba sin fecha de vencimiento.",
  demo_expired: "Tus datos se conservan: puedes consultarlos y descargarlos. Para volver a crear o editar, activa Full.",
  full_expired: "Tu periodo pagado terminó. Tus datos se conservan: puedes consultarlos y descargarlos. Renueva para volver a crear y editar.",
  full: "Acceso funcional completo.",
  extra: "Acceso funcional completo con almacenamiento ampliado.",
  disabled: "La empresa no tiene acceso a este módulo. Los datos se conservan.",
  globally_disabled: "El módulo no está disponible por el momento.",
  coming_soon: "Este módulo estará disponible próximamente.",
  not_assigned: "Este módulo no forma parte del acceso de tu empresa.",
  // PE-01B · NUNCA dice si el módulo está o no contratado, porque no se sabe.
  // Y no filtra el error técnico: quien lee esto no puede hacer nada con un
  // código de PostgREST.
  unavailable: "No fue posible verificar el acceso a este módulo. Vuelve a intentarlo.",
};

/** ¿El estado permite MUTAR dentro del módulo? (espejo de allowed, para la UI). */
export function isEnterableState(state: DerivedModuleState): boolean {
  return state === "demo_active" || state === "demo_permanent" || state === "full" || state === "extra";
}

/**
 * PROD-LAUNCH-01C.4 · ¿El estado permite ENTRAR, aunque sea a mirar?
 *
 * Espejo de `retainedRead`. Se separó de `isEnterableState` en vez de
 * ampliarlo porque las dos preguntas son distintas y hay ciento y pico de
 * sitios que preguntan la primera: ampliarla habría dado permiso de escritura
 * a quien solo viene a consultar.
 */
export function isReadableState(state: DerivedModuleState): boolean {
  return isEnterableState(state)
    || state === "demo_expired" || state === "full_expired";
}

/** ¿Se entra, pero SOLO a consultar? */
export function isReadOnlyState(state: DerivedModuleState): boolean {
  return isReadableState(state) && !isEnterableState(state);
}

/**
 * PROD-LAUNCH-01C.4 · Lo que se dice cuando la acción crea o modifica y la
 * empresa está en consulta.
 *
 * Tres cosas, en este orden: qué hace falta, que los datos siguen ahí, y qué
 * puede hacer ahora mismo quien lo lee. La versión anterior decía «contacta al
 * equipo de Trazaloop», que convertía un cambio de plan en un trámite con una
 * persona — y dejaba a la empresa esperando una respuesta para recuperar algo
 * que puede activar sola.
 */
export const RETAINED_READ_DENIED_MESSAGE =
  "Esta acción requiere Full. Tu información se conserva y puedes seguir consultándola, "
  + "descargándola y borrándola. Activa Full desde Plan y facturación para volver a crear y editar.";

/** A dónde lleva «Activar Full». NUNCA inicia un cobro: abre la pantalla. */
export const ACTIVATE_FULL_HREF = "/settings/billing";
export const ACTIVATE_FULL_LABEL = "Activar Full";

/** Mensaje de error para una Server Action bloqueada por acceso de módulo. */
export function moduleAccessDeniedMessage(moduleName: string, reason: ModuleAccessReason): string {
  switch (reason) {
    case "demo_expired":
      // Con el nombre del módulo: quien tiene tres y solo uno vencido necesita
      // saber CUÁL, y el mensaje genérico se lo hacía adivinar.
      return `Tu acceso a ${moduleName} es de solo consulta porque la prueba finalizó. `
        + "Tu información se conserva y puedes seguir consultándola, descargándola y "
        + "borrándola. Activa Full desde Plan y facturación para volver a crear y editar.";
    case "full_expired":
      // A quien PAGÓ no se le dice «activa»: se le dice «renueva». Tratarlo
      // como si nunca hubiera contratado es la clase de detalle que hace que
      // un cliente no renueve.
      return `Tu periodo pagado de ${moduleName} terminó. Tu información se conserva y `
        + "puedes seguir consultándola, descargándola y borrándola. Renueva desde Plan "
        + "y facturación para volver a crear y editar.";
    case "disabled":
      return `El acceso a ${moduleName} está deshabilitado para esta empresa.`;
    case "globally_disabled":
      return `${moduleName} no está disponible por el momento.`;
    case "coming_soon":
      return `${moduleName} estará disponible próximamente.`;
    case "not_assigned":
      return `${moduleName} no está asignado a esta empresa.`;
    case "unavailable":
      return `No fue posible verificar tu acceso a ${moduleName}. Vuelve a intentarlo.`;
    default:
      return `No tienes acceso a ${moduleName}.`;
  }
}

/** Aviso general del banner Demo (cuando todos los módulos comparten fecha). */
export const DEMO_BANNER_INTRO =
  "Tu empresa está utilizando Trazaloop en modo Demo. El acceso de prueba estará disponible durante 2 días.";

/**
 * PROD-LAUNCH-01C.4 · El aviso ya no manda a nadie a escribir un correo.
 *
 * Decía «contacta al equipo de Trazaloop para reactivar el acceso», y eso
 * convertía un cambio de plan —que la empresa puede hacer sola, en dos
 * pantallas— en un trámite con una persona y una espera. Peor: leído junto a
 * un módulo al que ya no se podía entrar, sonaba a que los datos estaban
 * retenidos hasta que alguien contestara.
 */
export const DEMO_EXPIRED_BANNER =
  "Tu periodo de prueba ha finalizado. Tus datos se conservan y puedes seguir "
  + "consultándolos. Activa Full cuando quieras para volver a crear y editar.";

/** El cuerpo del aviso cuando ya no queda ninguna prueba en pie. */
export const DEMO_EXPIRED_BANNER_BODY =
  "Tus datos se conservan y puedes seguir consultándolos. Activa Full cuando quieras "
  + "para volver a crear y editar.";

export const DEMO_PARTIAL_BANNER_TITLE = "Algunas pruebas de módulos han finalizado.";

/** Hay pruebas en curso, pero la empresa NO está de prueba: tiene algo más. */
export const DEMO_ACTIVE_PARTIAL_TITLE = "Tienes módulos en periodo de prueba.";

export const DEMO_ACTIVE_PARTIAL_BODY =
  "El resto de tu acceso no es una prueba y no vence.";

export const DEMO_PARTIAL_BANNER_BODY =
  "Los módulos con acceso vigente continúan disponibles, y los que terminaron se "
  + "pueden seguir consultando.";

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
  // PE-01B · `unavailable` tampoco entra: de un módulo que no se pudo leer no
  // se sabe si estaba en prueba, así que no puede sostener ningún aviso.
  const applicable = modules.filter(
    (m) => m.state !== "coming_soon" && m.state !== "not_assigned"
      && m.state !== "unavailable"
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
