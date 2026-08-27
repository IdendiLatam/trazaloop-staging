import "server-only";

import type { Db, ReviewScope } from "./scope";

/**
 * Trazaloop · QUALITY-12.2D · Lo que compara el CÓDIGO, no el modelo.
 *
 * QUALITY-12 fijó una regla —§58— que aquí vuelve a ser la que sostiene todo:
 * los números los calcula el código. El modelo los lee, los explica y los cita,
 * pero no los produce, porque un número producido por un modelo es una opinión
 * con aspecto de dato.
 *
 * La versión de 12.2D de esa regla es más fuerte:
 *
 *     UNA DISCREPANCIA CONFIRMADA LA DECLARA UNA FUNCIÓN, NO UNA FRASE.
 *
 * El modelo puede decir «esto podría no coincidir». Solo eso. La palabra
 * «confirmada» la escribe este archivo, y únicamente cuando ha comparado dos
 * valores concretos y no eran iguales: el cargo que la persona nombró contra
 * el cargo registrado, la frecuencia escrita contra la frecuencia registrada.
 * Cualquiera puede repetir esa comparación mañana y le dará lo mismo.
 *
 * CÓMO SE RESUELVE UNA ENTIDAD, Y POR QUÉ ASÍ
 *
 * Por NOMBRE COMPLETO Y EXACTO, normalizando acentos y mayúsculas. Nada más.
 *
 * Es defendible por dos motivos. El primero: `quality_positions` y
 * `quality_processes` tienen el nombre único por empresa —hay un índice que lo
 * garantiza—, así que un nombre completo que aparece en el texto señala a UNA
 * fila, nunca a dos. El segundo, que importa más: no se puede inventar nada.
 * Cada acierto es una fila que ya existía y una palabra que la persona ya
 * había escrito. No se «deduce» que hablaba de un cargo; se comprueba que
 * escribió su nombre.
 *
 * Lo que NO se hace es buscar parecidos. «Compras» no resuelve a nada aunque
 * exista el Jefe de Compras, porque «compras» también es una palabra normal
 * del castellano y una revisión que empiece a tratar sustantivos comunes como
 * entidades acabará hablando de cosas que nadie mencionó. Cuando una palabra
 * distintiva apunta a más de un registro, se dice que es ambigua y no se elige
 * —§8—: elegir en silencio es la peor de las opciones, porque acierta a veces.
 */

const CATALOGO_MAX = 200;

export function normalizar(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Palabras que casi todos los cargos comparten y que por tanto no distinguen
 *  a ninguno. Sin esta lista, «coordinador» señalaría a los siete. */
const GENERICAS = new Set([
  "coordinador", "coordinadora", "jefe", "jefa", "director", "directora",
  "gerente", "responsable", "auxiliar", "analista", "supervisor", "supervisora",
  "encargado", "encargada", "asistente", "tecnico", "tecnica", "operario",
  "operaria", "lider", "area", "departamento", "proceso", "general", "del",
  "las", "los", "una", "uno", "para", "por", "con", "sin", "que", "como",
]);

function distintivos(nombre: string): string[] {
  return normalizar(nombre).split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !GENERICAS.has(t));
}

export type NamedEntity = { id: string; name: string };

export type NameResolution = {
  /** Los que aparecen en el texto con su nombre completo. */
  matched: NamedEntity[];
  /** Palabras distintivas del texto que apuntan a más de un registro. */
  ambiguous: { token: string; candidates: NamedEntity[] }[];
  /** Había catálogo que mirar. Distingue «no nombró ninguno» de «no hay». */
  catalogSize: number;
};

/**
 * Resuelve nombres del catálogo CONTRA el texto, en ese sentido y no al revés.
 *
 * La dirección es lo que lo hace seguro: no se parte de las palabras del texto
 * buscando a qué podrían referirse —eso es adivinar—, sino de las filas que
 * existen comprobando si la persona las escribió.
 *
 * Y lo que sale de aquí es lo ÚNICO que puede añadir un cargo o un proceso al
 * material más allá del alcance estructural. Un registro que ni está atado al
 * documento ni fue escrito por la persona no llega al proveedor.
 */
export function resolveNames(catalogo: NamedEntity[], texto: string): NameResolution {
  const t = normalizar(texto);
  const matched = catalogo.filter((e) => {
    const n = normalizar(e.name);
    return n.length >= 4 && t.includes(n);
  });

  const yaResueltos = new Set(matched.map((m) => m.id));
  const porToken = new Map<string, NamedEntity[]>();
  for (const e of catalogo) {
    for (const tok of distintivos(e.name)) {
      const lista = porToken.get(tok) ?? [];
      lista.push(e);
      porToken.set(tok, lista);
    }
  }

  const ambiguous: NameResolution["ambiguous"] = [];
  for (const [tok, candidatos] of porToken) {
    if (candidatos.length < 2) continue;
    if (!new RegExp(`(^|[^a-z0-9])${tok}([^a-z0-9]|$)`).test(t)) continue;
    // Si uno de los candidatos ya quedó resuelto por su nombre completo, la
    // persona fue precisa: no hay ambigüedad que señalar.
    if (candidatos.some((c) => yaResueltos.has(c.id))) continue;
    ambiguous.push({ token: tok, candidates: candidatos.slice(0, 4) });
  }

  return { matched, ambiguous, catalogSize: catalogo.length };
}

/** Lee el catálogo de cargos. Se queda EN EL SERVIDOR: de aquí solo salen los
 *  que el alcance ya traía o los que la persona escribió. */
export async function positionCatalog(
  db: Db, scope: ReviewScope
): Promise<NamedEntity[]> {
  const { data } = await db.from("quality_positions")
    .select("id, name")
    .eq("organization_id", scope.organizationId)
    .eq("is_active", true)
    .limit(CATALOGO_MAX);
  return (Array.isArray(data) ? data : [])
    .map((r) => ({ id: String((r as Record<string, unknown>).id),
                   name: String((r as Record<string, unknown>).name ?? "") }))
    .filter((e) => e.name.length > 0);
}

export async function processCatalog(
  db: Db, scope: ReviewScope
): Promise<NamedEntity[]> {
  const { data } = await db.from("quality_processes")
    .select("id, name")
    .eq("organization_id", scope.organizationId)
    .limit(CATALOGO_MAX);
  return (Array.isArray(data) ? data : [])
    .map((r) => ({ id: String((r as Record<string, unknown>).id),
                   name: String((r as Record<string, unknown>).name ?? "") }))
    .filter((e) => e.name.length > 0);
}

// ===========================================================================
// FRECUENCIAS
// ---------------------------------------------------------------------------
// El vocabulario es el de `lib/domain/quality-indicators`: siete periodicidades
// y ninguna más. No se inventa una octava aquí para que encaje una frase.
// ===========================================================================

const FRECUENCIA_CANONICA: Record<string, string> = {
  daily: "daily", diaria: "daily", diario: "daily", diariamente: "daily",
  weekly: "weekly", semanal: "weekly", semanalmente: "weekly",
  monthly: "monthly", mensual: "monthly", mensualmente: "monthly",
  bimonthly: "bimonthly", bimestral: "bimonthly", bimestralmente: "bimonthly",
  quarterly: "quarterly", trimestral: "quarterly", trimestralmente: "quarterly",
  biannual: "biannual", semestral: "biannual", semestralmente: "biannual",
  annual: "annual", anual: "annual", anualmente: "annual",
};

export const FRECUENCIA_LEGIBLE: Record<string, string> = {
  daily: "diaria", weekly: "semanal", monthly: "mensual",
  bimonthly: "bimestral", quarterly: "trimestral",
  biannual: "semestral", annual: "anual",
};

/** La periodicidad que una frase declara, si declara exactamente una.
 *
 *  Si el texto menciona dos distintas —«mensual para la revisión y anual para
 *  la auditoría»— no devuelve ninguna: comparar contra un registro cuando no
 *  se sabe a cuál de las dos se refiere sería confirmar a ciegas. */
export function frequencyOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = normalizar(s);
  const vistas = new Set<string>();
  for (const [palabra, clave] of Object.entries(FRECUENCIA_CANONICA)) {
    if (new RegExp(`(^|[^a-z])${palabra}([^a-z]|$)`).test(t)) vistas.add(clave);
  }
  return vistas.size === 1 ? [...vistas][0] : null;
}

// ===========================================================================
// LAS OBSERVACIONES
// ===========================================================================

export type Observation =
  | { kind: "position_agrees"; refs: number[]; positionName: string }
  | { kind: "position_differs"; refs: number[]; written: string; registered: string }
  | { kind: "position_none_named"; refs: number[]; registered: string }
  | { kind: "ambiguous"; refs: number[]; token: string; candidates: string[] }
  | { kind: "frequency_differs"; refs: number[]; written: string;
      registered: string; subject: string };

export type ObservationSet = {
  items: Observation[];
  /** Las fuentes cuyo desacuerdo el código YA comprobó. Es la llave que
   *  permite ascender un `possible_conflict` del modelo a confirmado: sin
   *  coincidencia de fuente, no hay ascenso. */
  confirmedRefs: Set<number>;
  ambiguities: { token: string; candidates: string[] }[];
};

export function describeObservation(o: Observation): string {
  switch (o.kind) {
    case "position_agrees":
      return `Comprobado por Trazaloop: el texto nombra «${o.positionName}», que es `
        + `exactamente el cargo registrado. Coinciden.`;
    case "position_differs":
      return `Comprobado por Trazaloop: el texto nombra el cargo «${o.written}», pero `
        + `el cargo registrado para esto es «${o.registered}». Son dos cargos `
        + `distintos, los dos existen, y no coinciden.`;
    case "position_none_named":
      return `Comprobado por Trazaloop: el cargo registrado es «${o.registered}» y su `
        + `nombre no aparece en el texto. Puede que el texto se refiera a él de otra `
        + `manera; Trazaloop no puede saberlo.`;
    case "ambiguous":
      return `Comprobado por Trazaloop: la palabra «${o.token}» del texto encaja con `
        + `más de un registro (${o.candidates.map((c) => `«${c}»`).join(", ")}). `
        + `No se ha elegido ninguno: no hay forma de saber a cuál se refiere.`;
    case "frequency_differs":
      return `Comprobado por Trazaloop: el texto dice «${o.written}» y `
        + `${o.subject} tiene registrada la frecuencia «${o.registered}». No coinciden.`;
  }
}
