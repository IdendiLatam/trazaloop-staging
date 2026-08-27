import "server-only";

import type { AuthoringGuidance } from "@/lib/db/authoring-guidance";
import type { RelatedContextType } from "@/lib/domain/document-review";
import { RELATED_CONTEXT_LABEL } from "@/lib/domain/document-review";
import type { ReviewFact, ReviewRef } from "./facts";
import { describeObservation, type Observation } from "./observations";

/**
 * Trazaloop · QUALITY-12.2D · Los cajones, y por qué son seis y no uno.
 *
 * 12.2C tenía cuatro y ya explicaba la idea: la GUÍA dice qué debería contener
 * la sección, el PERFIL dice a qué se dedica la empresa, y solo el TEXTO dice
 * lo que la empresa hace. Aquí hay dos cajones más y los dos importan.
 *
 * HECHOS es el que cambia la naturaleza de la funcionalidad. Va numerado
 * porque un hallazgo sin cita no se pinta: el número es la correa que ata cada
 * afirmación a una fila de la base con su enlace.
 *
 * COMPROBADO es el que evita que el modelo tenga que ser fiable en lo único
 * que no puede permitirse fallar. Las comparaciones que se pueden hacer con
 * una función —¿este cargo es el mismo?, ¿esta frecuencia es la misma?— ya
 * vienen hechas y con su resultado. El modelo las explica; no las decide.
 *
 * LÍMITES es una promesa incómoda: decir en voz alta qué NO se miró. Un
 * contexto recortado en silencio se lee igual que un contexto completo, y esa
 * es exactamente la lectura que no debe poder hacerse.
 */

export type ReviewDocumentContext = {
  moduleLabel: string;
  documentTitle: string;
  documentCode: string | null;
  documentType: string | null;
  sectionTitle: string;
  sectionKey: string;
};

/** Lo que no se pudo mirar, dicho de forma que se pueda pintar y enviar. */
export type ReviewLimit =
  | { kind: "unscoped_type"; type: RelatedContextType }
  | { kind: "truncated"; type: RelatedContextType }
  | { kind: "no_historical"; type: RelatedContextType; asOf: string };

export function describeLimit(l: ReviewLimit): string {
  const etiqueta = RELATED_CONTEXT_LABEL[l.type];
  switch (l.kind) {
    case "unscoped_type":
      return `«${etiqueta}»: la guía lo señala como pertinente, pero Trazaloop no `
        + `tiene hoy una relación que ate ese tipo de registro a un documento, así `
        + `que no se ha buscado nada. No se ha revisado.`;
    case "truncated":
      return `«${etiqueta}»: había más registros de los que caben en una revisión. `
        + `Se han traído los primeros; puede haber otros sin mirar.`;
    case "no_historical":
      return `«${etiqueta}»: no guarda el estado que tenía el ${l.asOf}, solo el de `
        + `hoy. Se ha dejado fuera para no presentar un dato actual como si fuera `
        + `de entonces.`;
  }
}

export type ReviewContext = {
  userText: string;
  guidance: AuthoringGuidance | null;
  document: ReviewDocumentContext;
  facts: ReviewFact[];
  refs: ReviewRef[];
  observations: Observation[];
  limits: ReviewLimit[];
  asOf: string | null;
};

/**
 * Arma el material.
 *
 * Un cajón vacío no se envía. La disciplina viene de 12.2C y sigue valiendo:
 * una etiqueta sin nada detrás no informa de nada, y en una llamada que se
 * repite miles de veces sí cuesta.
 */
export function renderReviewInput(ctx: ReviewContext): string {
  const p: string[] = [];

  p.push("<TEXTO>");
  p.push(ctx.userText);
  p.push("</TEXTO>");

  const g = ctx.guidance;
  if (g && !g.restricted && (g.guidance ?? "").trim().length > 0) {
    p.push("");
    p.push("<GUIA>");
    if (g.purpose) p.push(`Para qué existe la sección: ${g.purpose}`);
    p.push(`Guía: ${g.guidance}`);
    if (g.doNotInvent) p.push(`No se puede afirmar sin registro: ${g.doNotInvent}`);
    p.push("</GUIA>");
  }

  const d = ctx.document;
  p.push("");
  p.push("<DOCUMENTO>");
  p.push(`Módulo: ${d.moduleLabel}`);
  p.push(`Documento: ${d.documentCode ? `${d.documentCode} · ` : ""}${d.documentTitle}`);
  p.push(`Sección: ${d.sectionTitle}`);
  if (ctx.asOf) p.push(`Se revisa el estado a fecha ${ctx.asOf}, no el de hoy.`);
  p.push("</DOCUMENTO>");

  if (ctx.facts.length > 0) {
    p.push("");
    p.push("<HECHOS>");
    ctx.facts.forEach((f, i) => p.push(`[${i + 1}] ${f.statement}`));
    p.push("</HECHOS>");
  }

  if (ctx.observations.length > 0) {
    p.push("");
    p.push("<COMPROBADO>");
    for (const o of ctx.observations) {
      const cita = o.refs.length > 0 ? ` [${o.refs.join(", ")}]` : "";
      p.push(`· ${describeObservation(o)}${cita}`);
    }
    p.push("</COMPROBADO>");
  }

  if (ctx.limits.length > 0) {
    p.push("");
    p.push("<LIMITES>");
    for (const l of ctx.limits) p.push(`· ${describeLimit(l)}`);
    p.push("</LIMITES>");
  }

  return p.join("\n");
}

/** Qué se usó de verdad. Es lo que la pantalla enseña y lo que se registra. */
export type ReviewContextUsed = {
  guidance: boolean;
  guidanceRevisionId: string | null;
  types: RelatedContextType[];
  factCount: number;
  refCount: number;
  queries: number;
  limits: ReviewLimit[];
};
