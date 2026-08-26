"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  APPROVAL_DECISION_LABEL, describeScope, EVALUATION_KIND_LABEL,
  EVALUATION_STATUS_LABEL, formatDate,
} from "@/lib/domain/quality-suppliers";
import type { SupplierFile } from "@/lib/db/quality-suppliers";
import { Card, DomainNote, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Una sede del proveedor.
 *
 * Existe por una razón concreta: la misma empresa puede fabricar bien en una
 * planta y mal en otra, y estar certificada solo en una de las dos. Meter las
 * dos en la misma ficha obliga a mentir en una de ellas.
 */
export function SupplierSiteView({ file, siteId }: { file: SupplierFile; siteId: string }) {
  const sede = file.sites.find((s) => s.id === siteId);
  const o = file.overview;
  if (!sede) {
    return (
      <p className="text-sm text-ink-soft">
        Esa sede ya no existe en la ficha de {o.legalName}.
      </p>
    );
  }

  const alcances = file.scopes.filter((s) => s.siteId === siteId);
  const idsAlcance = new Set(alcances.map((s) => s.scopeId));
  const evaluaciones = file.evaluations.filter((e) => idsAlcance.has(e.scopeId));
  const contactos = file.contacts.filter((c) => c.siteId === siteId);
  const otras = file.sites.length - 1;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/quality/suppliers/${o.profileId}`}
          className="text-xs font-medium text-loop hover:underline"
        >
          ← {o.legalName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{sede.name}</h1>
        <p className="text-sm text-ink-soft">
          {[sede.code, [sede.city, sede.country].filter(Boolean).join(", ")]
            .filter(Boolean).join(" · ") || "Sin ubicación registrada"}
          {sede.isPrimary ? " · Sede principal" : ""}
        </p>
        <ExportPdfButton exportKey="quality.supplier-site.detail" id={sede.id} label="Descargar PDF" />
      </header>

      <DomainNote>
        Lo que se ve aquí vale <strong>para esta sede</strong>. Que {o.legalName} esté
        aprobada en otra planta no aprueba esta, y al revés tampoco.
        {otras > 0 ? ` La ficha tiene ${otras} sede${otras === 1 ? "" : "s"} más.` : ""}
      </DomainNote>

      <Card title="Qué se le compra aquí">
        <Table
          headers={["Categoría", "Desde", "Hasta"]}
          empty="No hay categorías asignadas a esta sede en concreto."
          rows={file.categories
            .filter((c) => c.siteId === siteId)
            .map((c) => [
              c.categoryName, formatDate(c.sinceOn),
              c.untilOn ? formatDate(c.untilOn) : "Vigente",
            ])}
        />
      </Card>

      <Card title="Alcances de esta sede">
        <Table
          headers={["Alcance", "Criticidad", "Aprobación", "Vigencia", "Última evaluación"]}
          empty="Esta sede no tiene alcances propios."
          rows={alcances.map((s) => [
            describeScope({ siteName: s.siteName, categoryName: s.categoryName }),
            s.criticalityLabel ?? "Sin clasificar",
            s.decision ? APPROVAL_DECISION_LABEL[s.decision] : "Sin decidir",
            s.decisionValidUntil
              ? `${formatDate(s.decisionValidUntil)}${s.approvalExpired ? " · vencida" : ""}`
              : (s.decision ? "Sin fecha límite" : "—"),
            s.lastEvaluatedOn
              ? `${formatDate(s.lastEvaluatedOn)} · ${s.lastScore ?? "—"}`
              : "Sin evaluar",
          ])}
        />
      </Card>

      <Card title="Evaluaciones de esta sede">
        <Table
          headers={["Fecha", "Clase", "Resultado", "Estado", ""]}
          empty="Todavía no se ha evaluado esta sede."
          rows={evaluaciones.map((e) => [
            e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
            EVALUATION_KIND_LABEL[e.kind],
            e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
            EVALUATION_STATUS_LABEL[e.status],
            <Link
              key="v" href={`/quality/suppliers/evaluations/${e.id}`}
              className="font-medium text-loop hover:underline"
            >
              Ver
            </Link>,
          ])}
        />
      </Card>

      <Card title="Contactos de esta sede">
        <Table
          headers={["Nombre", "Función", "Correo", "Teléfono"]}
          empty="Sin contactos propios de esta sede."
          rows={contactos.map((c) => [
            c.fullName, c.roleTitle ?? "—", c.email ?? "—", c.phone ?? "—",
          ])}
        />
      </Card>
    </div>
  );
}
