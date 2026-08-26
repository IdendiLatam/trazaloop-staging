"use client";

import Link from "next/link";
import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  formatDate, RELATIONSHIP_STATUS_LABEL, RELATIONSHIP_STATUSES,
  SUPPLIER_SOURCE_LABEL, describeRelationshipAndApproval,
} from "@/lib/domain/quality-suppliers";
import type {
  AdoptableSupplier, SupplierCategoryRow, SupplierOverviewRow,
} from "@/lib/db/quality-suppliers";
import { adoptSupplierAction, createSupplierAction } from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Listado de proveedores.
 *
 * La primera cosa que hace esta pantalla es ofrecer INCORPORAR los proveedores
 * que ya existen en PCR y en Textiles, antes que crear uno nuevo. No es un
 * detalle de orden: si crear estuviera primero, una empresa acabaría con ACME
 * tres veces y administrarlo costaría el triple.
 */
export function SupplierDirectory({
  suppliers, adoptable, categories, positions, canManage,
}: {
  suppliers: SupplierOverviewRow[];
  adoptable: AdoptableSupplier[];
  categories: SupplierCategoryRow[];
  positions: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [status, setStatus] = useState("");
  const [approval, setApproval] = useState("");
  const [review, setReview] = useState("");

  const visibles = suppliers.filter((s) =>
    (status === "" || s.relationshipStatus === status)
    && (approval === "" || (approval === "approved"
        ? s.approvedScopeCount > 0 : s.approvedScopeCount === 0))
    && (review === "" || (review === "overdue" ? s.reevaluationOverdue : true)));

  return (
    <div className="space-y-6">
      <DomainNote>
        Un <strong>proveedor</strong> es un papel de una empresa externa, no una ficha
        nueva. Si ACME ya existe en PCR o en Textiles, se incorpora: sigue siendo la misma
        empresa y esos módulos siguen funcionando igual.
      </DomainNote>

      <Card
        title="Proveedores"
        description={`${visibles.length} de ${suppliers.length}`}
        action={
          <span className="flex flex-wrap gap-2">
            <ExportPdfButton exportKey="quality.supplier.list" label="Descargar PDF" />
            <ExportPdfButton
              exportKey="quality.approved-supplier.list"
              label="Descargar PDF"
            />
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Estado de la relación">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {RELATIONSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>{RELATIONSHIP_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Aprobación">
            <select value={approval} onChange={(e) => setApproval(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              <option value="approved">Con algún alcance aprobado</option>
              <option value="not_approved">Sin ningún alcance aprobado</option>
            </select>
          </Field>
          <Field label="Reevaluación">
            <select value={review} onChange={(e) => setReview(e.target.value)} className={inputClass}>
              <option value="">Todas</option>
              <option value="overdue">Vencidas</option>
            </select>
          </Field>
        </div>

        <Table
          headers={["Proveedor", "Identificación", "Situación", "Criticidad",
                    "Reevaluación", "También en", ""]}
          empty="No hay proveedores con ese criterio."
          rows={visibles.map((s) => [
            <Link
              key="n" href={`/quality/suppliers/${s.profileId}`}
              className="font-medium text-loop hover:underline"
            >
              {s.legalName}
            </Link>,
            s.taxId ?? "—",
            describeRelationshipAndApproval(
              s.relationshipStatus, s.approvedScopeCount, s.scopeCount
            ),
            s.topCriticalityLabel ?? "Sin clasificar",
            <span key="r" className={s.reevaluationOverdue ? "font-medium" : undefined}>
              {s.nextReviewOn ? formatDate(s.nextReviewOn) : "—"}
              {s.reevaluationOverdue ? " · vencida" : ""}
            </span>,
            [
              s.cprSupplierId ? SUPPLIER_SOURCE_LABEL.cpr : null,
              s.textileSupplierId ? SUPPLIER_SOURCE_LABEL.textiles : null,
            ].filter(Boolean).join(" · ") || "—",
            <ExportPdfButton
              key="x" exportKey="quality.supplier.detail" id={s.profileId} label="Descargar PDF"
            />,
          ])}
        />
      </Card>

      {canManage && adoptable.length > 0 ? (
        <Card
          title="Proveedores que ya existen en otros módulos"
          description={`${adoptable.length} sin incorporar a Quality`}
        >
          <DomainNote>
            Incorporarlos NO los copia: crea la identidad compartida y la enlaza. PCR y
            Textiles siguen viendo su proveedor exactamente igual.
          </DomainNote>
          <ActionForm action={adoptSupplierAction} submitLabel="Incorporar a Quality">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Proveedor">
                <select name="source_id" required className={inputClass}
                  onChange={(e) => {
                    const opt = e.target.selectedOptions[0];
                    const hidden = e.target.form?.elements.namedItem("source_module");
                    if (hidden instanceof HTMLInputElement) {
                      hidden.value = opt?.dataset.module ?? "";
                    }
                  }}>
                  <option value="">Elige</option>
                  {adoptable.map((a) => (
                    <option key={`${a.sourceModule}:${a.sourceId}`} value={a.sourceId}
                      data-module={a.sourceModule}>
                      {a.name} · {SUPPLIER_SOURCE_LABEL[a.sourceModule]}
                      {a.taxId ? ` · ${a.taxId}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Responsable interno" hint="Es un CARGO, no una persona.">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <input type="hidden" name="source_module" defaultValue="" />
          </ActionForm>
        </Card>
      ) : null}

      {canManage ? (
        <Card
          title="Registrar un proveedor nuevo"
          description="Solo lo mínimo. Lo demás llega cuando haga falta."
        >
          <ActionForm action={createSupplierAction} submitLabel="Registrar proveedor">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Razón social">
                <input name="legal_name" required className={inputClass} />
              </Field>
              <Field label="Identificación fiscal" hint="Opcional: se puede completar después.">
                <input name="tax_id" className={inputClass} />
              </Field>
              <Field label="País">
                <input name="country" className={inputClass} />
              </Field>
              <Field label="Ciudad">
                <input name="city" className={inputClass} />
              </Field>
              <Field label="Responsable interno" hint="Es un CARGO, no una persona.">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <DomainNote>
              No se pide criticidad, ni requisitos, ni certificaciones: un primer formulario
              de veinte campos es como se consigue que nadie registre proveedores.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {categories.length === 0 && canManage ? (
        <DomainNote>
          Todavía no hay categorías de suministro.{" "}
          <Link href="/quality/suppliers/categories" className="font-medium text-loop hover:underline">
            Defínelas
          </Link>{" "}
          cuando quieras distinguir qué presta cada proveedor.
        </DomainNote>
      ) : null}
    </div>
  );
}
