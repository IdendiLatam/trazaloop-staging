"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  DEFAULT_REEVALUATION_MONTHS, EXTRAORDINARY_TRIGGER_LABEL, EXTRAORDINARY_TRIGGERS,
  formatDate, reevaluationOverdue,
} from "@/lib/domain/quality-suppliers";
import type { SupplierOverviewRow } from "@/lib/db/quality-suppliers";
import { scanSupplierReviewsAction } from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Reevaluaciones.
 *
 * La pantalla contesta una sola pregunta —a quién toca volver a mirar— y se
 * detiene ahí. No reevalúa sola, no baja a nadie de categoría y no retira
 * ninguna aprobación cuando se pasa la fecha: que una revisión esté vencida
 * significa que hay trabajo pendiente, no que el proveedor haya empeorado.
 */
export function SupplierReevaluations({
  suppliers, canManage, today,
}: {
  suppliers: SupplierOverviewRow[];
  canManage: boolean;
  today: string;
}) {
  const vencidas = suppliers.filter((s) => reevaluationOverdue(s.nextReviewOn, today));
  const proximas = suppliers.filter(
    (s) => s.nextReviewOn !== null && !reevaluationOverdue(s.nextReviewOn, today));
  const sinFecha = suppliers.filter((s) => s.nextReviewOn === null);

  const fila = (s: SupplierOverviewRow) => [
    <Link
      key="n" href={`/quality/suppliers/${s.profileId}`}
      className="font-medium text-loop hover:underline"
    >
      {s.legalName}
    </Link>,
    s.topCriticalityLabel ?? "Sin clasificar",
    s.lastEvaluatedOn ? formatDate(s.lastEvaluatedOn) : "Nunca",
    s.nextReviewOn ? formatDate(s.nextReviewOn) : "—",
    `${s.reevaluationMonths} meses`,
    `${s.approvedScopeCount} de ${s.scopeCount}`,
  ];
  const cabeceras = [
    "Proveedor", "Criticidad", "Última evaluación", "Toca el", "Cada", "Alcances aprobados",
  ];

  return (
    <div className="space-y-6">
      <DomainNote>
        Pasarse de la fecha de reevaluación <strong>no suspende</strong> a nadie ni
        caduca ninguna aprobación por su cuenta. Lo único que dice es que hay una
        revisión pendiente.
      </DomainNote>

      <Card
        title="Vencidas"
        description={`${vencidas.length} proveedor${vencidas.length === 1 ? "" : "es"}`}
        action={<ExportPdfButton exportKey="quality.supplier-reevaluation.list" label="Descargar PDF" />}
      >
        <Table headers={cabeceras} rows={vencidas.map(fila)} empty="Ninguna revisión vencida." />
      </Card>

      <Card title="Programadas" description={`${proximas.length} con fecha por delante`}>
        <Table headers={cabeceras} rows={proximas.map(fila)} empty="Ninguna revisión programada." />
      </Card>

      {sinFecha.length > 0 ? (
        <Card
          title="Sin fecha de revisión"
          description="Nunca se han evaluado, así que todavía no hay desde cuándo contar."
        >
          <Table headers={cabeceras} rows={sinFecha.map(fila)} empty="" />
        </Card>
      ) : null}

      <Card title="Cuándo toca reevaluar">
        <p className="text-xs text-ink-soft">
          La cadencia por defecto es de {DEFAULT_REEVALUATION_MONTHS} meses y se puede
          cambiar proveedor a proveedor. Si la metodología de criticidad fija una revisión
          más corta para un nivel, manda la más corta: depender mucho de alguien se mira
          más a menudo.
        </p>
        <p className="mt-3 text-xs font-medium text-ink">Fuera de ciclo, además, cuando:</p>
        <ul className="mt-1 space-y-1 text-xs text-ink-soft">
          {EXTRAORDINARY_TRIGGERS.map((t) => (
            <li key={t}>· {EXTRAORDINARY_TRIGGER_LABEL[t]}</li>
          ))}
        </ul>
        <DomainNote>
          Una reevaluación extraordinaria es una evaluación más, con su motivo. No
          sustituye a la periódica ni borra la anterior.
        </DomainNote>
      </Card>

      {canManage ? (
        <Card
          title="Revisar ahora"
          description="Recalcula los avisos de revisión, vencimiento y documentos por caducar."
        >
          <ActionForm action={scanSupplierReviewsAction} submitLabel="Revisar">
            <DomainNote>
              La revisión solo <strong>avisa</strong>. No abre evaluaciones, no cambia
              aprobaciones y no duplica los avisos que ya existían.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
