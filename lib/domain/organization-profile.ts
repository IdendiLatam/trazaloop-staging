/**
 * Trazaloop · QUALITY-12.2B · El perfil de autoría de una empresa.
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * Es **contexto de estilo**: a qué se dedica la empresa, para poder redactar en
 * su vocabulario. Sirve para escribir «envases» donde una guía genérica diría
 * «productos», y para no proponerle a una empresa de software un ejemplo de
 * planta de alimentos.
 *
 * NO es evidencia. Que el perfil diga «fabricante de envases plásticos» no
 * autoriza a afirmar nada sobre sus procesos, sus controles, sus responsables
 * ni sus frecuencias. La distinción es la misma que separa AUTHORING_GUIDANCE
 * de ORGANIZATION_CONTEXT, y se sostiene aquí igual que allí: por lo que el
 * tipo contiene, no por una advertencia.
 *
 * POR QUÉ TIENE TOPES
 *
 * Porque está pensado para viajar junto al párrafo que alguien está
 * escribiendo. Un perfil sin tope convierte «contexto compacto» en una promesa
 * incumplible: los topes están en la base, y aquí se mide lo que ocupan.
 */

/** Topes por campo. Los mismos que la base exige, para poder avisar ANTES. */
export const ORG_PROFILE_LIMITS = {
  primaryActivity: 160,
  description: 280,
  productItems: 6,
  productItemLength: 50,
} as const;

/** Lo único que se le entrega a quien redacta. Ni un identificador más. */
export type OrganizationAuthoringContext = {
  organizationName: string;
  sector: string | null;
  primaryActivity: string | null;
  productsServices: string[];
  description: string | null;
};

/**
 * Cuántos tokens ocupa, aproximadamente.
 *
 * En español un token viene a ser 3,6 caracteres. No es exacto y no pretende
 * serlo: sirve para vigilar que un perfil bien diligenciado quepa en el
 * presupuesto que QUALITY-12.2 fijó —entre cien y doscientos cincuenta—, y
 * para que una prueba lo verifique en vez de confiar en que sí.
 */
export const CHARS_PER_TOKEN = 3.6;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * El perfil, escrito como se le entregaría a quien redacta.
 *
 * Un perfil a medio llenar produce un texto a medio llenar, y eso está bien:
 * lo que no se sabe no se rellena. Una empresa sin perfil produce solo su
 * nombre, que es cierto y es poco.
 */
export function renderAuthoringContext(ctx: OrganizationAuthoringContext): string {
  const lineas: string[] = [`Empresa: ${ctx.organizationName}`];
  if (ctx.sector) lineas.push(`Sector: ${ctx.sector}`);
  if (ctx.primaryActivity) lineas.push(`Actividad principal: ${ctx.primaryActivity}`);
  if (ctx.productsServices.length > 0) {
    lineas.push(`Productos o servicios: ${ctx.productsServices.join(", ")}`);
  }
  if (ctx.description) lineas.push(`Descripción: ${ctx.description}`);
  return lineas.join("\n");
}

/** Cuántos tokens ocupa este perfil. */
export function authoringContextTokens(ctx: OrganizationAuthoringContext): number {
  return estimateTokens(renderAuthoringContext(ctx));
}

/**
 * ¿Está el perfil dentro del presupuesto?
 *
 * El tope no es una preferencia: es lo que ocupa el perfil MÁS LARGO POSIBLE
 * —los cinco campos a la vez en su máximo— más un margen. Los topes por campo
 * de arriba están elegidos para que eso se cumpla; una prueba lo comprueba en
 * vez de confiar en que sí.
 *
 * Un perfil típico bien diligenciado ronda los ciento diez tokens.
 */
export const ORG_PROFILE_TOKEN_BUDGET = 260;

export function withinProfileBudget(ctx: OrganizationAuthoringContext): boolean {
  return authoringContextTokens(ctx) <= ORG_PROFILE_TOKEN_BUDGET;
}

// ---------------------------------------------------------------------------
// Validación · la misma que la base exige, para poder avisar antes de intentarlo
// ---------------------------------------------------------------------------

export type OrganizationProfileInput = {
  sectorCode: string | null;
  primaryActivity: string;
  productsServices: string;
  description: string;
};

/** La lista de productos viene de un campo de texto, uno por línea. */
export function parseProductsServices(raw: string): string[] {
  return raw
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function validateOrganizationProfileInput(
  input: OrganizationProfileInput, sectorCodes: readonly string[]
): { error: string | null } {
  if (input.sectorCode !== null && input.sectorCode !== ""
      && !sectorCodes.includes(input.sectorCode)) {
    return { error: "Ese sector no está en la lista." };
  }

  const actividad = input.primaryActivity.trim();
  if (actividad.length > 0 && actividad.length < 3) {
    return { error: "La actividad principal necesita al menos tres caracteres." };
  }
  if (actividad.length > ORG_PROFILE_LIMITS.primaryActivity) {
    return {
      error: `La actividad principal no puede pasar de ${ORG_PROFILE_LIMITS.primaryActivity} caracteres. `
        + "Es una línea, no un párrafo: el detalle va en la descripción.",
    };
  }

  const descripcion = input.description.trim();
  if (descripcion.length > 0 && descripcion.length < 10) {
    return { error: "La descripción necesita al menos diez caracteres, o déjala vacía." };
  }
  if (descripcion.length > ORG_PROFILE_LIMITS.description) {
    return {
      error: `La descripción no puede pasar de ${ORG_PROFILE_LIMITS.description} caracteres.`,
    };
  }

  const productos = parseProductsServices(input.productsServices);
  if (productos.length > ORG_PROFILE_LIMITS.productItems) {
    return {
      error: `Como mucho ${ORG_PROFILE_LIMITS.productItems} productos o servicios. `
        + "Esto no es un catálogo: son los principales, para saber de qué habla la empresa.",
    };
  }
  for (const p of productos) {
    if (p.length < 2 || p.length > ORG_PROFILE_LIMITS.productItemLength) {
      return {
        error: `«${p.slice(0, 30)}» no sirve: cada producto o servicio va entre 2 y `
          + `${ORG_PROFILE_LIMITS.productItemLength} caracteres.`,
      };
    }
  }

  return { error: null };
}

/** El payload de actualización. Nunca lleva `id` ni `organization_id`. */
export function buildOrganizationProfilePayload(input: OrganizationProfileInput): Record<string, unknown> {
  const productos = parseProductsServices(input.productsServices);
  return {
    sector_code: input.sectorCode === "" ? null : input.sectorCode,
    primary_activity: input.primaryActivity.trim() || null,
    organization_description: input.description.trim() || null,
    products_services: productos.length > 0 ? productos : null,
  };
}
