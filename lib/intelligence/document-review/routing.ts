import "server-only";

import {
  RELATED_CONTEXT_TYPES, ROUTABLE_CONTEXT_TYPES, isRoutable,
  type RelatedContextType,
} from "@/lib/domain/document-review";
import type { OrganizationAuthoringContext } from "@/lib/domain/organization-profile";
import type { Db, ReviewScope } from "./scope";
import { resolveScope, scopeIsEmpty } from "./scope";
import { FactWriter } from "./facts";
import {
  controlAdapter, documentAdapter, indicatorAdapter,
  loadOrganizationProfile, positionAdapter, processAdapter, riskAdapter,
  type ControlSeen, type PositionSeen, type ProcessOwnerSeen, type ReviewAdapter,
} from "./adapters";
import {
  frequencyOf, FRECUENCIA_LEGIBLE, positionCatalog, processCatalog, resolveNames,
  type Observation,
} from "./observations";
import type { ReviewLimit } from "./context";

/**
 * Trazaloop · QUALITY-12.2D · Quién decide qué se busca.
 *
 * No este archivo. Lo decide la GUÍA CANÓNICA, sección por sección, en la
 * columna `related_context_types` que QUALITY-12.2A creó y 12.2B cerró a doce
 * valores. Aquí solo se obedece.
 *
 * Suena a un detalle de implementación y es la decisión de arquitectura del
 * sprint. La alternativa —una tabla en el código que diga «responsables lleva
 * cargos y procesos»— parece lo mismo y no lo es: esa tabla envejece en el
 * repositorio, no la ve quien redacta las guías, y el día que alguien añada
 * una sección nueva habrá que acordarse de tocarla. La metadata viaja con la
 * guía, se versiona con ella y se revisa cuando se revisa la guía.
 *
 * En los datos de hoy: 183 guías no declaran ningún tipo, 66 declaran dos, una
 * declara tres y una declara cuatro. Ninguna declara cinco. La recuperación es
 * pequeña porque la metadata dice que lo sea.
 *
 * EL TOPE QUE PROTEGE DE UNA MALA CONFIGURACIÓN
 *
 * `MAX_CONTEXT_TYPES` existe para el día en que alguien declare los doce en una
 * guía. Hoy no lo dispara nadie. Cuando salte, no se recorta en silencio: el
 * material lo dice y el registro lo guarda, porque un contexto recortado sin
 * avisar se lee exactamente igual que uno completo.
 */

/** Nunca más de seis tipos en una revisión, declare lo que declare la guía. */
export const MAX_CONTEXT_TYPES = 6;

/** El tope duro de consultas. Los casos reales de hoy hacen entre 4 y 7; esto
 *  está para que una configuración rara no se convierta en un barrido. */
export const MAX_QUERIES = 12;

/** El orden en que se resuelven. No es alfabético: los procesos van primero
 *  porque casi todo lo demás cuelga de ellos, y el perfil va al final porque
 *  no consulta nada. */
const ORDEN: RelatedContextType[] = [
  "process", "position", "control", "indicator", "risk",
  "document", "organization_profile",
  "objective", "supplier", "customer_feedback", "case", "evidence",
];

/**
 * Por qué no hubo nada que contrastar. Son dos cosas muy distintas y hasta
 * ahora se contaban igual:
 *
 *   `no_types`    la guía de la sección no señala ningún tipo de registro.
 *                 No falta nada en la empresa; esta sección no se contrasta.
 *   `empty_scope` la guía sí señala, pero el documento no está atado a nada:
 *                 ni cargo responsable, ni procesos. Falta una relación.
 *
 * La diferencia importa porque la segunda es accionable —hay algo que
 * enlazar— y la primera no. Decir «no encontré registros relacionados» en los
 * dos casos deja a quien lee sin saber si tiene que hacer algo.
 */
export type EmptyReason = "no_types" | "empty_scope" | null;

export type RoutingResult = {
  writer: FactWriter;
  scope: ReviewScope;
  emptyReason: EmptyReason;
  /** Los tipos que la guía pidió y que se intentaron. */
  requested: RelatedContextType[];
  /** Los que aportaron al menos un hecho. */
  resolved: RelatedContextType[];
  observations: Observation[];
  limits: ReviewLimit[];
};

export function routeTypes(declared: string[] | null | undefined): {
  requested: RelatedContextType[]; unscoped: RelatedContextType[]; dropped: RelatedContextType[];
} {
  const vistos = new Set<string>();
  const validos: RelatedContextType[] = [];
  for (const t of declared ?? []) {
    if (!(RELATED_CONTEXT_TYPES as readonly string[]).includes(t)) continue;
    if (vistos.has(t)) continue;
    vistos.add(t);
    validos.push(t as RelatedContextType);
  }
  const enOrden = ORDEN.filter((t) => vistos.has(t));
  const unscoped = enOrden.filter((t) => !isRoutable(t));
  const rutables = enOrden.filter((t) => isRoutable(t));
  return {
    requested: rutables.slice(0, MAX_CONTEXT_TYPES),
    unscoped,
    dropped: rutables.slice(MAX_CONTEXT_TYPES),
  };
}

/**
 * Construye el contexto.
 *
 * El orden de dentro tiene una razón en cada paso:
 *
 *   1 · El ALCANCE primero. Sin él ningún adaptador sabe leer, que es la
 *       propiedad que impide que esto se convierta en un barrido.
 *   2 · Los NOMBRES antes que los cargos y procesos, porque lo que la persona
 *       escribió puede meter un registro en el material —solo si ya existe—.
 *   3 · Los ADAPTADORES en su orden.
 *   4 · Las COMPARACIONES al final, cuando ya se sabe qué hechos viajaron. Una
 *       discrepancia confirmada contra un hecho que el modelo no vio sería
 *       pedirle que citara algo que no tiene delante.
 */
export async function buildReviewContext(params: {
  db: Db;
  organizationId: string;
  documentId: string;
  ownerPositionId: string | null;
  userText: string;
  declaredTypes: string[] | null | undefined;
  organization: OrganizationAuthoringContext | null;
  asOf?: string | null;
}): Promise<RoutingResult> {
  const { db, userText } = params;
  const { requested, unscoped, dropped } = routeTypes(params.declaredTypes);
  const limits: ReviewLimit[] = [
    ...unscoped.map((type) => ({ kind: "unscoped_type" as const, type })),
  ];

  const w = new FactWriter();
  const observations: Observation[] = [];

  const { scope, queries } = await resolveScope(db, {
    organizationId: params.organizationId,
    documentId: params.documentId,
    ownerPositionId: params.ownerPositionId,
    asOf: params.asOf ?? null,
  });
  w.countQuery(queries);

  if (requested.length === 0 || scopeIsEmpty(scope)) {
    // Sin tipos que resolver, o sin nada a lo que engancharse: no se consulta
    // más y no se llama a nadie. Lo decide quien llama, con `isEmpty()`.
    return {
      writer: w, scope, requested, resolved: [], observations, limits,
      emptyReason: requested.length === 0 ? "no_types" : "empty_scope",
    };
  }

  // ---- 2 · Lo que la persona nombró, si ya existe ------------------------
  const cargosExtra: string[] = [];
  const procesosExtra: string[] = [];

  if (requested.includes("position")) {
    w.countQuery();
    const catalogo = await positionCatalog(db, scope);
    const r = resolveNames(catalogo, userText);
    cargosExtra.push(...r.matched.map((m) => m.id));
    for (const a of r.ambiguous) {
      observations.push({
        kind: "ambiguous", refs: [], token: a.token,
        candidates: a.candidates.map((c) => c.name),
      });
    }
  }
  if (requested.includes("process")) {
    w.countQuery();
    const catalogo = await processCatalog(db, scope);
    const r = resolveNames(catalogo, userText);
    procesosExtra.push(...r.matched.map((m) => m.id));
    for (const a of r.ambiguous) {
      if (observations.some((o) => o.kind === "ambiguous" && o.token === a.token)) continue;
      observations.push({
        kind: "ambiguous", refs: [], token: a.token,
        candidates: a.candidates.map((c) => c.name),
      });
    }
  }

  // Un proceso NOMBRADO por la persona entra en el alcance del resto: si el
  // párrafo habla del proceso de compras, sus controles son pertinentes.
  const scopeAmpliado: ReviewScope = {
    ...scope,
    processIds: [...new Set([...scope.processIds, ...procesosExtra])].slice(0, 6),
  };

  // ---- 3 · Los adaptadores -----------------------------------------------
  const cargosVistos: PositionSeen[] = [];
  const controlesVistos: ControlSeen[] = [];
  // Se llena mientras corre el adaptador de procesos y lo lee el de cargos.
  // El orden de `ORDEN` lo garantiza: procesos va antes que cargos, y los
  // adaptadores calculan sus ids DENTRO de `load`, no al construirse.
  const duenosDeProceso: ProcessOwnerSeen[] = [];

  const registro: Partial<Record<RelatedContextType, ReviewAdapter>> = {
    process: processAdapter(duenosDeProceso),
    position: positionAdapter(cargosExtra, cargosVistos, duenosDeProceso),
    control: controlAdapter(controlesVistos),
    indicator: indicatorAdapter,
    risk: riskAdapter,
    document: documentAdapter,
  };

  for (const type of requested) {
    if (w.queries >= MAX_QUERIES) {
      limits.push({ kind: "truncated", type });
      continue;
    }
    if (type === "organization_profile") {
      loadOrganizationProfile(scopeAmpliado, params.organization, w);
      continue;
    }
    const adapter = registro[type];
    if (!adapter) continue;

    // §10 · Un dominio que no sabe reconstruir el pasado se APAGA cuando se
    // pide una fecha. No se entrega el valor de hoy con etiqueta de entonces.
    if (scopeAmpliado.asOf && !adapter.historical) {
      limits.push({ kind: "no_historical", type, asOf: scopeAmpliado.asOf });
      continue;
    }
    await adapter.load(db, scopeAmpliado, w);
  }

  for (const type of dropped) limits.push({ kind: "truncated", type });
  for (const type of w.truncated) {
    if (!limits.some((l) => l.kind === "truncated" && l.type === type)) {
      limits.push({ kind: "truncated", type });
    }
  }

  // ---- 4 · Las comparaciones, sobre los hechos que SÍ viajaron -----------
  observations.push(...compareResponsibility(cargosVistos, userText));
  observations.push(...compareFrequency(controlesVistos, userText));

  return {
    writer: w, scope: scopeAmpliado, requested,
    resolved: w.resolvedTypes(), observations, limits,
    emptyReason: w.isEmpty() ? "empty_scope" : null,
  };
}

/**
 * ¿El cargo que escribió la persona es el que Trazaloop tiene registrado?
 *
 * Solo se afirma cuando LOS DOS LADOS están resueltos: la persona escribió el
 * nombre completo de un cargo que existe, y el documento tiene un cargo
 * responsable registrado. Con un solo lado resuelto no se confirma nada, y con
 * razón: si el texto dice «el responsable de calidad» sin nombrar un cargo
 * registrado, Trazaloop no sabe si se refiere al cargo dueño con otras
 * palabras o a otra cosa. Decirlo es honesto; adivinarlo no.
 */
function compareResponsibility(vistos: PositionSeen[], texto: string): Observation[] {
  // Primero el cargo responsable DEL DOCUMENTO. Si no lo hay —en PCR y en
  // Textiles no lo hay nunca, su pantalla no ofrece ese campo—, sirve el cargo
  // dueño del proceso, y solo si hay UNO: con dos procesos y dos dueños no se
  // sabe cuál de los dos gobierna la frase, y elegir sería adivinar.
  const duenoDoc = vistos.find((v) => v.isOwner) ?? null;
  const duenosProc = vistos.filter((v) => !v.isOwner && v.ownsProcess !== null);
  const dueno = duenoDoc ?? (duenosProc.length === 1 ? duenosProc[0] : null);
  if (!dueno) return [];

  const nombrados = vistos.filter((v) => v.id !== dueno.id);
  const duenoEscrito = normalizaContiene(texto, dueno.name);

  if (duenoEscrito) {
    return [{ kind: "position_agrees", refs: [dueno.fact], positionName: dueno.name }];
  }
  if (nombrados.length > 0) {
    return nombrados.map((o) => ({
      kind: "position_differs" as const,
      refs: [o.fact, dueno.fact],
      written: o.name,
      registered: dueno.name,
    }));
  }
  return [{ kind: "position_none_named", refs: [dueno.fact], registered: dueno.name }];
}

function normalizaContiene(texto: string, nombre: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  return n(nombre).length >= 4 && n(texto).includes(n(nombre));
}

/**
 * ¿La periodicidad escrita es la registrada?
 *
 * Solo se compara cuando las dos se pueden traducir al vocabulario cerrado de
 * Trazaloop —siete periodicidades— y cuando el texto declara EXACTAMENTE UNA.
 * Un párrafo que menciona dos frecuencias distintas no se compara contra
 * ninguna: no hay forma de saber cuál de las dos habla del control, y una
 * discrepancia «confirmada» a medias es peor que ninguna.
 */
function compareFrequency(controles: ControlSeen[], texto: string): Observation[] {
  const escrita = frequencyOf(texto);
  if (!escrita) return [];
  const salida: Observation[] = [];
  for (const c of controles) {
    const registrada = frequencyOf(c.frequency);
    if (!registrada || registrada === escrita) continue;
    salida.push({
      kind: "frequency_differs",
      refs: [c.fact],
      written: FRECUENCIA_LEGIBLE[escrita] ?? escrita,
      registered: FRECUENCIA_LEGIBLE[registrada] ?? registrada,
      subject: `el control «${c.title}»`,
    });
  }
  return salida;
}

/** Los tipos que se saben resolver. Se exporta para que la documentación y las
 *  pruebas hablen del mismo sitio y no de una copia. */
export const ROUTABLE = ROUTABLE_CONTEXT_TYPES;
