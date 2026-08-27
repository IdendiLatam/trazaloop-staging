import "server-only";

import type { AuthoringGuidance } from "@/lib/db/authoring-guidance";
import type { OrganizationAuthoringContext } from "@/lib/domain/organization-profile";
import { renderAuthoringContext } from "@/lib/domain/organization-profile";

/**
 * Trazaloop · QUALITY-12.2C · Los cuatro cajones, y por qué van separados.
 *
 * El Copilot mete todo en un «contexto» y lo etiqueta por dentro. Aquí no
 * basta, porque la confusión que hay que evitar es más fina:
 *
 *   LA GUÍA DICE QUÉ DEBERÍA CONTENER LA SECCIÓN.
 *   EL PERFIL DICE A QUÉ SE DEDICA LA EMPRESA.
 *   EL TEXTO DICE LO QUE LA EMPRESA HACE.
 *
 * Solo el tercero es un hecho. «Indique el responsable» no significa que haya
 * uno, y «fabricante de envases» no significa que los inspeccione. Mezclar los
 * tres bajo una sola etiqueta es pedirle al modelo que distinga algo que
 * nosotros no distinguimos al construirlo.
 *
 * LO QUE NO ENTRA
 *
 * Ninguno de los diecinueve adaptadores del Copilot. Ni voz del cliente, ni
 * auditorías, ni proveedores, ni riesgos, ni acciones, ni indicadores. Para
 * mejorar un párrafo no hacen falta y costarían más que todo lo demás junto.
 *
 * Ni un dato personal: ni miembros, ni correos, ni teléfonos, ni NIT, ni
 * direcciones. Mejorar la redacción de un procedimiento no es motivo para
 * enviar a un tercero la libreta de direcciones de una empresa.
 */

export type DocumentContext = {
  moduleLabel: string;
  documentTitle: string;
  documentCode: string | null;
  documentType: string | null;
  sectionTitle: string;
  sectionKey: string;
};

export type QuickEditContext = {
  userText: string;
  guidance: AuthoringGuidance | null;
  organization: OrganizationAuthoringContext | null;
  document: DocumentContext;
};

/** Qué se usó de verdad. Es lo que la pantalla enseña, y lo que se registra. */
export type ContextUsed = {
  userText: true;
  guidance: boolean;
  organizationProfile: boolean;
  documentMetadata: true;
};

export function contextUsed(ctx: QuickEditContext): ContextUsed {
  return {
    userText: true,
    guidance: ctx.guidance !== null && !ctx.guidance.restricted
      && (ctx.guidance.guidance ?? "").trim().length > 0,
    organizationProfile: ctx.organization !== null
      && (ctx.organization.sector !== null
        || ctx.organization.primaryActivity !== null
        || ctx.organization.productsServices.length > 0
        || ctx.organization.description !== null),
    documentMetadata: true,
  };
}

/**
 * Cada cajón, marcado.
 *
 * No se envía un campo vacío: un `PROPÓSITO:` sin nada detrás no informa de
 * nada y ocupa sitio. El propósito y el ejemplo de las guías trasladadas están
 * vacíos —QUALITY-12.2A no los inventó— y no tienen por qué viajar.
 */
export function renderQuickEditInput(ctx: QuickEditContext): string {
  const partes: string[] = [];

  partes.push("<TEXTO_DE_LA_PERSONA>");
  partes.push(ctx.userText);
  partes.push("</TEXTO_DE_LA_PERSONA>");

  const g = ctx.guidance;
  if (g && !g.restricted && (g.guidance ?? "").trim().length > 0) {
    partes.push("");
    // La etiqueta ya dice qué es, y la política ya explica qué vale. Repetirlo
    // aquí en cada llamada cuesta tokens y no añade una idea.
    partes.push("<GUIA_DE_LA_SECCION>");
    if (g.purpose) partes.push(`Para qué existe la sección: ${g.purpose}`);
    partes.push(`Guía: ${g.guidance}`);
    if (g.example) partes.push(`Ejemplo (es un ejemplo, no un dato): ${g.example}`);
    if (g.doNotInvent) partes.push(`No se puede inventar: ${g.doNotInvent}`);
    partes.push("</GUIA_DE_LA_SECCION>");
  }

  const o = ctx.organization;
  if (o) {
    const texto = renderAuthoringContext(o);
    partes.push("");
    partes.push("<PERFIL_DE_LA_EMPRESA>");
    partes.push(texto);
    partes.push("</PERFIL_DE_LA_EMPRESA>");
  }

  const d = ctx.document;
  partes.push("");
  partes.push("<DATOS_DEL_DOCUMENTO>");
  partes.push(`Módulo: ${d.moduleLabel}`);
  partes.push(`Documento: ${d.documentCode ? `${d.documentCode} · ` : ""}${d.documentTitle}`);
  if (d.documentType) partes.push(`Tipo: ${d.documentType}`);
  partes.push(`Sección: ${d.sectionTitle}`);
  partes.push("</DATOS_DEL_DOCUMENTO>");

  return partes.join("\n");
}
