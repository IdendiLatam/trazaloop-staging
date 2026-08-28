import "server-only";

import type { RelatedContextType } from "@/lib/domain/document-review";
import { renderAuthoringContext } from "@/lib/domain/organization-profile";
import type { OrganizationAuthoringContext } from "@/lib/domain/organization-profile";
import type { Db, ReviewScope } from "./scope";
import { FactWriter } from "./facts";

/**
 * Trazaloop · QUALITY-12.2D · Ocho adaptadores pequeños.
 *
 * POR QUÉ NO SE REUTILIZAN LOS DEL COPILOT
 *
 * Se miraron uno por uno, que es lo que pedía el encargo, y no sirven aquí por
 * una razón concreta: están escritos para responder a CUALQUIER pregunta sobre
 * la empresa, así que leen a nivel de empresa. El de controles trae los doce
 * controles activos de la organización; el de riesgos, los riesgos abiertos;
 * el de señales, todas las señales sin resolver. Ninguno acepta «solo los de
 * este documento», porque el Copilot nunca lo necesitó.
 *
 * Reutilizarlos habría significado traer el sistema de gestión entero para
 * revisar un párrafo, filtrarlo después y pagar los tokens igual. Estos leen
 * ya filtrados por el alcance estructural del documento.
 *
 * TODOS COMPARTEN CUATRO REGLAS
 *
 *   1 · Leen con la SESIÓN de quien pregunta. No hay cliente administrativo en
 *       este archivo y no puede haberlo: la revisión no eleva permisos, y la
 *       RLS de siempre sigue decidiendo qué se ve.
 *   2 · Reciben un ALCANCE y no saben leer sin él. Un adaptador que pueda
 *       responder «todo» es un adaptador que un día responderá «todo».
 *   3 · Nombran las columnas que leen, una a una. Esa lista es lo que se puede
 *       auditar: si `responsible` o `storage_path` no está escrito aquí, no
 *       hay forma de que salga hacia el proveedor.
 *   4 · Dicen si saben reconstruir el pasado. Los que no saben se APAGAN
 *       cuando se pide una fecha, en vez de entregar el valor de hoy con
 *       aspecto de valor de entonces.
 */

export type ReviewAdapter = {
  type: RelatedContextType;
  /** Sabe reconstruir el estado a una fecha. §10: fingirlo sería peor que no
   *  tenerlo, porque un hecho de hoy presentado como de entonces convierte una
   *  revisión histórica en una mentira con formato de informe. */
  historical: boolean;
  load(db: Db, scope: ReviewScope, w: FactWriter): Promise<void>;
};

type Fila = Record<string, unknown>;
const filas = (d: unknown): Fila[] => (Array.isArray(d) ? d as Fila[] : []);
const txt = (v: unknown): string => (typeof v === "string" ? v : "");

/** Recorta un texto de la base antes de que viaje. Una descripción de proceso
 *  de cuatro mil caracteres no aporta cuatro mil caracteres de juicio. */
function corto(v: unknown, max = 180): string {
  const s = txt(v).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// ===========================================================================
// PERFIL DE LA EMPRESA
// ---------------------------------------------------------------------------
// El único que no consulta nada: ya viene resuelto de QUALITY-12.2B, que lo
// lee una vez para toda la operación. Se registra como fuente igual, porque
// una revisión que use el perfil tiene que poder decir de dónde salió.
// ===========================================================================

export function loadOrganizationProfile(
  scope: ReviewScope, org: OrganizationAuthoringContext | null, w: FactWriter
): void {
  if (!org) return;
  const texto = renderAuthoringContext(org).trim();
  if (texto.length === 0) return;
  const n = w.ref({
    sourceCode: "organization_profile", entityType: "organization",
    entityId: scope.organizationId, label: "Perfil de la empresa",
    deepLink: "/settings/organization", asOf: null, revisionLabel: null,
  });
  w.fact("organization_profile", texto, [n]);
}

// ===========================================================================
// PROCESOS
// ---------------------------------------------------------------------------
// Verdad histórica: SÍ. `quality_process_revisions` fecha cada revisión con
// `effective_from`/`effective_to`, así que se puede decir qué decía el proceso
// en marzo sin adivinarlo.
// ===========================================================================

/** Quién es el cargo dueño de cada proceso del alcance. Sale de la consulta que
 *  el adaptador de procesos ya hace, así que no cuesta ni un viaje más. */
export type ProcessOwnerSeen = { positionId: string; processName: string };

export function processAdapter(sink: ProcessOwnerSeen[]): ReviewAdapter {
  return {
  type: "process",
  historical: true,
  async load(db, scope, w) {
    if (scope.processIds.length === 0) return;
    w.countQuery();
    const { data } = await db
      .from("quality_processes")
      .select("id, code, name, category_code, status, owner_position_id")
      .eq("organization_id", scope.organizationId)
      .in("id", scope.processIds);

    const encontrados = filas(data);
    if (encontrados.length === 0) return;

    // La revisión vigente —o la vigente EN LA FECHA— aporta propósito y
    // alcance, que es lo que de verdad se contrasta contra un párrafo.
    w.countQuery();
    let q = db.from("quality_process_revisions")
      .select("process_id, revision_number, purpose, scope, effective_from, effective_to")
      .eq("organization_id", scope.organizationId)
      .in("process_id", scope.processIds);
    q = scope.asOf
      ? q.lte("effective_from", scope.asOf)
         .or(`effective_to.is.null,effective_to.gt.${scope.asOf}`)
      : q.is("effective_to", null);
    const { data: revs } = await q;
    const porProceso = new Map<string, Fila>();
    for (const r of filas(revs)) porProceso.set(String(r.process_id), r);

    for (const p of encontrados) {
      const rev = porProceso.get(String(p.id));
      const n = w.ref({
        sourceCode: "process", entityType: "quality_process",
        entityId: String(p.id),
        label: `Proceso ${txt(p.code) ? `${txt(p.code)} · ` : ""}${txt(p.name)}`,
        deepLink: `/quality/processes/${String(p.id)}`,
        asOf: scope.asOf,
        revisionLabel: rev ? `rev. ${String(rev.revision_number)}` : null,
      });
      // Una frase por proceso, no tres. El propósito entra en la misma; el
      // alcance registrado se queda fuera porque para contrastar un párrafo
      // basta saber de qué va el proceso, y traer las dos cosas duplicaba el
      // coste del tipo más usado de todos.
      w.fact("process",
        `Proceso «${txt(p.name)}»${txt(p.code) ? ` (${txt(p.code)})` : ""}, `
        + `${txt(p.status) || "sin estado"}`
        + (rev && corto(rev.purpose, 140) ? `. Propósito: ${corto(rev.purpose, 140)}` : "")
        + `.`, [n]);

      // El cargo dueño del proceso viaja al adaptador de cargos.
      //
      // Hace falta para los documentos que NO tienen cargo responsable propio,
      // que en PCR y en Textiles son todos: su pantalla no ofrece ese campo, y
      // sin esto la única forma de contrastar una responsabilidad allí sería
      // que la persona nombrara un cargo, con lo que nunca habría nada contra
      // qué contrastarlo.
      //
      // Sale de este `select`, que ya pedía la columna: cero consultas nuevas.
      if (txt(p.owner_position_id)) {
        sink.push({ positionId: txt(p.owner_position_id), processName: txt(p.name) });
      }
    }
  },
  };
}

// ===========================================================================
// CARGOS
// ---------------------------------------------------------------------------
// Verdad histórica: SÍ, vía `quality_position_versions`.
//
// PRIVACIDAD · §23. Se lee el CARGO y solo el cargo. Ni `quality_people`, ni
// `quality_position_assignments`, ni quién lo ocupa hoy. Un procedimiento dice
// «el Coordinador de Compras aprueba» y esa frase se puede contrastar sin
// saber cómo se llama la persona que ocupa el puesto: el cargo sobrevive a
// quien lo ejerce, y además no es un dato que haya que mandar a un tercero
// para revisar la redacción de un párrafo.
//
// Los cargos que entran son los del ALCANCE —dueño del documento, dueños de
// sus procesos— más los que la persona haya NOMBRADO en su propio texto. Esos
// segundos los resuelve `observations.ts`; aquí se aceptan ya resueltos.
// ===========================================================================

export type PositionSeen = {
  fact: number; id: string; name: string;
  /** Cargo responsable DEL DOCUMENTO. */
  isOwner: boolean;
  /** Cargo dueño de un proceso del alcance, y de cuál. */
  ownsProcess: string | null;
};

export function positionAdapter(
  extraIds: string[], sink: PositionSeen[], processOwners: ProcessOwnerSeen[] = []
): ReviewAdapter {
  return {
    type: "position",
    historical: true,
    async load(db, scope, w) {
      const ids = [...new Set([
        ...(scope.ownerPositionId ? [scope.ownerPositionId] : []),
        ...processOwners.map((o) => o.positionId),
        ...extraIds,
      ])];
      if (ids.length === 0) return;

      w.countQuery();
      const { data } = await db
        .from("quality_positions")
        .select("id, code, name, org_unit, is_active")
        .eq("organization_id", scope.organizationId)
        .in("id", ids);

      const encontrados = filas(data);
      if (encontrados.length === 0) return;

      w.countQuery();
      let q = db.from("quality_position_versions")
        .select("position_id, version_number, purpose, authority, effective_from, effective_to")
        .eq("organization_id", scope.organizationId)
        .in("position_id", ids)
        .eq("status", "published");
      q = scope.asOf
        ? q.lte("effective_from", scope.asOf)
           .or(`effective_to.is.null,effective_to.gt.${scope.asOf}`)
        : q.is("effective_to", null);
      const { data: vers } = await q;
      const porCargo = new Map<string, Fila>();
      for (const v of filas(vers)) porCargo.set(String(v.position_id), v);

      for (const p of encontrados) {
        const v = porCargo.get(String(p.id));
        const n = w.ref({
          sourceCode: "position", entityType: "quality_position",
          entityId: String(p.id),
          label: `Cargo ${txt(p.name)}`,
          deepLink: `/quality/people/positions/${String(p.id)}`,
          asOf: scope.asOf,
          revisionLabel: v ? `versión ${String(v.version_number)}` : null,
        });
        const esDueno = String(p.id) === scope.ownerPositionId;
        const proceso = processOwners.find((o) => o.positionId === String(p.id));
        // Cada frase dice EXACTAMENTE de qué es responsable. «Responsable de
        // este documento» y «dueño de este proceso» no son lo mismo, y
        // escribirlas igual invitaría a leer la segunda como la primera.
        const nHecho = w.fact("position",
          esDueno
            ? `Responsable registrado de este documento: cargo «${txt(p.name)}»`
              + `${txt(p.org_unit) ? ` (${txt(p.org_unit)})` : ""}.`
            : proceso
              ? `Cargo dueño del proceso «${proceso.processName}»: «${txt(p.name)}»`
                + `${txt(p.org_unit) ? ` (${txt(p.org_unit)})` : ""}.`
              : `Cargo «${txt(p.name)}»`
                + `${txt(p.org_unit) ? ` (${txt(p.org_unit)})` : ""}`
                + `${p.is_active === false ? ", inactivo" : ""}.`,
          [n]);
        if (nHecho !== null) {
          sink.push({
            fact: nHecho, id: String(p.id), name: txt(p.name), isOwner: esDueno,
            ownsProcess: proceso ? proceso.processName : null,
          });
        }
        if (v && corto(v.authority, 120)) {
          w.fact("position",
            `Autoridad de «${txt(p.name)}»: ${corto(v.authority, 120)}`, [n]);
        }
      }
    },
  };
}

// ===========================================================================
// CONTROLES
// ---------------------------------------------------------------------------
// Verdad histórica: NO. `quality_controls` no fecha sus cambios, así que a una
// fecha pasada este adaptador NO responde. Es la diferencia entre no saber y
// equivocarse.
//
// Se trae la FRECUENCIA porque es justo lo que un procedimiento contradice sin
// darse cuenta: el texto dice «mensualmente», el control dice «anual», y nadie
// lo nota hasta la auditoría.
// ===========================================================================

export type ControlSeen = { fact: number; title: string; frequency: string | null };

export function controlAdapter(sink: ControlSeen[]): ReviewAdapter {
  return {
  type: "control",
  historical: false,
  async load(db, scope, w) {
    if (scope.processIds.length === 0) return;
    w.countQuery();
    const { data } = await db
      .from("quality_control_activity_links")
      .select("control_id, process_id, quality_controls!inner("
        + "id, code, title, control_nature, operation_mode, frequency, status)")
      .eq("organization_id", scope.organizationId)
      .in("process_id", scope.processIds)
      .limit(12);

    for (const l of filas(data)) {
      const c = (l.quality_controls ?? null) as Fila | null;
      if (!c || txt(c.status) === "retired") continue;
      const n = w.ref({
        sourceCode: "control", entityType: "quality_control", entityId: String(c.id),
        label: `Control ${txt(c.code) ? `${txt(c.code)} · ` : ""}${txt(c.title)}`,
        deepLink: `/quality/risks/controls/${String(c.id)}`,
        asOf: null, revisionLabel: null,
      });
      const f = txt(c.frequency);
      const nHecho = w.fact("control",
        `Control «${txt(c.title)}»${txt(c.code) ? ` (${txt(c.code)})` : ""}: `
        + `${txt(c.control_nature) || "sin naturaleza"}, `
        + `${txt(c.operation_mode) || "sin modo"}`
        + (f ? `, frecuencia «${f}»` : ", sin frecuencia")
        + `.`, [n]);
      // La frecuencia sale por aquí para que la comparación la haga una
      // función y no una frase. Solo los controles que de verdad viajaron:
      // confirmar una discrepancia contra un hecho que el modelo no vio sería
      // pedirle que citara algo que no le llegó.
      if (nHecho !== null && f) {
        sink.push({ fact: nHecho, title: txt(c.title), frequency: f });
      }
    }
  },
  };
}

// ===========================================================================
// INDICADORES
// ---------------------------------------------------------------------------
// Verdad histórica: NO para la ficha. Se lee la definición, no las mediciones:
// para revisar un párrafo importa que el indicador EXISTA y cómo se llama, no
// cuánto valió el mes pasado. Y un indicador fuera de meta NO es un
// incumplimiento (§25): es un número por debajo de un objetivo.
// ===========================================================================

export const indicatorAdapter: ReviewAdapter = {
  type: "indicator",
  historical: false,
  async load(db, scope, w) {
    if (scope.processIds.length === 0) return;
    w.countQuery();
    const { data } = await db
      .from("quality_indicators")
      .select("id, code, name, scope_type, admin_state")
      .eq("organization_id", scope.organizationId)
      .in("scope_process_id", scope.processIds)
      .neq("admin_state", "retired")
      .limit(12);

    for (const i of filas(data)) {
      const n = w.ref({
        sourceCode: "indicator", entityType: "quality_indicator", entityId: String(i.id),
        label: `Indicador ${txt(i.code) ? `${txt(i.code)} · ` : ""}${txt(i.name)}`,
        deepLink: `/quality/indicators/${String(i.id)}`,
        asOf: null, revisionLabel: null,
      });
      w.fact("indicator",
        `Indicador «${txt(i.name)}»${txt(i.code) ? ` (${txt(i.code)})` : ""}, `
        + `de este proceso.`, [n]);
    }
  },
};

// ===========================================================================
// RIESGOS
// ---------------------------------------------------------------------------
// Verdad histórica: NO. Y un riesgo NO es una no conformidad (§25): es algo
// que podría pasar, no algo que pasó.
// ===========================================================================

export const riskAdapter: ReviewAdapter = {
  type: "risk",
  historical: false,
  async load(db, scope, w) {
    if (scope.processIds.length === 0) return;
    w.countQuery();
    const { data } = await db
      .from("quality_risk_processes")
      .select("risk_id, quality_risks!inner(id, code, title, status)")
      .eq("organization_id", scope.organizationId)
      .in("process_id", scope.processIds)
      .limit(12);

    for (const l of filas(data)) {
      const r = (l.quality_risks ?? null) as Fila | null;
      if (!r || txt(r.status) === "closed") continue;
      const n = w.ref({
        sourceCode: "risk", entityType: "quality_risk", entityId: String(r.id),
        label: `Riesgo ${txt(r.code) ? `${txt(r.code)} · ` : ""}${txt(r.title)}`,
        deepLink: `/quality/risks/${String(r.id)}`,
        asOf: null, revisionLabel: null,
      });
      // «Es un riesgo, no un incumplimiento» está en la política, y repetirlo
      // en cada riesgo cuesta lo mismo que decirlo una vez.
      w.fact("risk",
        `Riesgo identificado sobre este proceso: «${txt(r.title)}»`
        + `${txt(r.code) ? ` (${txt(r.code)})` : ""}.`, [n]);
    }
  },
};

// ===========================================================================
// OTROS DOCUMENTOS
// ---------------------------------------------------------------------------
// Verdad histórica: SÍ. `trazadoc_document_revisions` fecha cada revisión.
//
// §24 · No viaja el archivo. Viaja la IDENTIDAD —código, título, estado, qué
// revisión está vigente— y nada del contenido. Para saber si un procedimiento
// contradice a otro, primero hay que saber que el otro existe; leerlo entero
// es otra funcionalidad y cuesta otro presupuesto.
// ===========================================================================

export const documentAdapter: ReviewAdapter = {
  type: "document",
  historical: true,
  async load(db, scope, w) {
    if (scope.processIds.length === 0) return;
    w.countQuery();
    const { data } = await db
      .from("quality_process_documents")
      .select("document_id, relation_type, trazadoc_documents!inner("
        + "id, code, title, status, module_key)")
      .eq("organization_id", scope.organizationId)
      .in("process_id", scope.processIds)
      .neq("document_id", scope.documentId)
      .limit(10);

    const vistos = new Set<string>();
    const ids: string[] = [];
    const encontrados: { doc: Fila; relacion: string }[] = [];
    for (const l of filas(data)) {
      const d = (l.trazadoc_documents ?? null) as Fila | null;
      if (!d || vistos.has(String(d.id))) continue;
      vistos.add(String(d.id));
      ids.push(String(d.id));
      encontrados.push({ doc: d, relacion: txt(l.relation_type) });
    }
    if (encontrados.length === 0) return;

    w.countQuery();
    let q = db.from("trazadoc_document_revisions")
      .select("document_id, revision_number, revision_label, effective_from, effective_to")
      .eq("organization_id", scope.organizationId)
      .in("document_id", ids);
    q = scope.asOf
      ? q.lte("effective_from", scope.asOf)
         .or(`effective_to.is.null,effective_to.gt.${scope.asOf}`)
      : q.is("effective_to", null);
    const { data: revs } = await q;
    const porDoc = new Map<string, Fila>();
    for (const r of filas(revs)) porDoc.set(String(r.document_id), r);

    const RELACION: Record<string, string> = {
      governs: "lo gobierna", supports: "lo apoya",
      records: "registra su ejecución", reference: "es una referencia",
    };

    for (const { doc, relacion } of encontrados) {
      const rev = porDoc.get(String(doc.id));
      const n = w.ref({
        sourceCode: "document_revision", entityType: "trazadoc_document",
        entityId: String(doc.id),
        label: `Documento ${txt(doc.code) ? `${txt(doc.code)} · ` : ""}${txt(doc.title)}`,
        deepLink: `/quality/documents/${String(doc.id)}`,
        asOf: scope.asOf,
        revisionLabel: rev ? txt(rev.revision_label) || `rev. ${String(rev.revision_number)}` : null,
      });
      w.fact("document",
        `Otro documento del mismo proceso: «${txt(doc.title)}»`
        + `${txt(doc.code) ? ` (${txt(doc.code)})` : ""}, ${RELACION[relacion] ?? "relacionado"}`
        + `${rev ? `, ${txt(rev.revision_label) || `rev. ${String(rev.revision_number)}`} vigente` : ""}`
        + `, ${txt(doc.status)}.`, [n]);
    }
  },
};

// ===========================================================================
// EVIDENCIAS · NO HAY ADAPTADOR, Y ESA ES LA NOTICIA
// ---------------------------------------------------------------------------
// Aquí había uno. Leía `evidence_links` filtrando por `target_type = 'document'`
// y una prueba lo pilló devolviendo siempre cero filas: el disparador de
// validación de `evidence_links` rechaza `document` de forma explícita, y
// ninguna otra tabla ata una evidencia a un `trazadoc_document`.
//
// La relación no existe. Con adaptador o sin él, la respuesta era la misma; la
// diferencia es que con adaptador la revisión parecía haber mirado.
//
// `evidence` está en `UNSCOPED_CONTEXT_TYPES` y la revisión lo declara como
// límite. Ver el porqué largo en `lib/domain/document-review.ts`.
// ===========================================================================
