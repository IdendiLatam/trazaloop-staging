"use client";

import Link from "next/link";
import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  CUSTOMER_IS_A_ROLE, CUSTOMER_RELATIONSHIP_STATUS_LABEL,
  CUSTOMER_RELATIONSHIP_STATUSES, formatDate,
} from "@/lib/domain/quality-customer-voice";
import type { AdoptableParty, CustomerOverviewRow } from "@/lib/db/quality-customer-voice";
import { adoptCustomerAction, createCustomerAction } from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · Listado de clientes.
 *
 * Lo primero que ofrece esta pantalla es dar el papel de cliente a una empresa
 * que YA existe —normalmente porque es proveedor—, antes que crear una nueva.
 * No es orden decorativo: si crear estuviera primero, ACME acabaría dos veces
 * en la misma base y nadie sabría cuál mirar.
 */
export function CustomerDirectory({
  customers, adoptable, positions, canManage,
}: {
  customers: CustomerOverviewRow[];
  adoptable: AdoptableParty[];
  positions: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const visibles = customers.filter((c) =>
    (status === "" || c.relationshipStatus === status)
    && (search === "" || c.legalName.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-6">
      <DomainNote>{CUSTOMER_IS_A_ROLE}</DomainNote>

      <Card
        title="Clientes"
        description={`${visibles.length} de ${customers.length}`}
        action={<ExportPdfButton exportKey="quality.customer.list" label="Descargar PDF" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Estado de la relación">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {CUSTOMER_RELATIONSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>{CUSTOMER_RELATIONSHIP_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Buscar">
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Table
          headers={["Cliente", "Estado", "Segmento", "Quejas abiertas", "Manifestaciones",
                    "Última", "Respuestas identificadas", ""]}
          empty="Todavía no hay clientes registrados."
          rows={visibles.map((c) => [
            <span key="n" className="flex flex-col">
              <Link
                href={`/quality/customer-voice/customers/${c.profileId}`}
                className="font-medium text-loop hover:underline"
              >
                {c.legalName}
              </Link>
              {c.isAlsoSupplier ? (
                <span className="text-[11px] text-ink-soft">También proveedor</span>
              ) : null}
            </span>,
            CUSTOMER_RELATIONSHIP_STATUS_LABEL[c.relationshipStatus],
            c.segment ?? "—",
            String(c.openComplaintCount),
            String(c.feedbackCount),
            c.lastFeedbackOn ? formatDate(c.lastFeedbackOn) : "—",
            String(c.identifiedResponseCount),
            <ExportPdfButton
              key="x" exportKey="quality.customer.detail" id={c.profileId}
              label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>
          La columna de respuestas cuenta solo las <strong>identificadas</strong>. Una
          respuesta anónima no se cuenta contra ningún cliente, ni siquiera para decir
          cuántas hay.
        </DomainNote>
      </Card>

      {canManage && adoptable.length > 0 ? (
        <Card
          title="Empresas que ya están registradas"
          description="Darles el papel de cliente no crea ninguna ficha nueva."
        >
          <ActionForm action={adoptCustomerAction} submitLabel="Registrar como cliente">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Empresa">
                <select name="party_id" required className={inputClass}>
                  {adoptable.map((p) => (
                    <option key={p.partyId} value={p.partyId}>
                      {p.legalName}{p.isSupplier ? " · ya es proveedor" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Segmento"><input name="segment" className={inputClass} /></Field>
              <Field label="Responsable interno">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <DomainNote>
              La misma empresa puede ser cliente y proveedor a la vez. Sus sedes y sus
              contactos se comparten, porque son de la empresa y no del papel.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {canManage ? (
        <Card title="Cliente nuevo" description="Solo si la empresa no está ya registrada.">
          <ActionForm action={createCustomerAction} submitLabel="Registrar cliente">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Razón social"><input name="legal_name" required className={inputClass} /></Field>
              <Field label="Nombre comercial"><input name="trade_name" className={inputClass} /></Field>
              <Field label="Identificación fiscal"><input name="tax_id" className={inputClass} /></Field>
              <Field label="Ciudad"><input name="city" className={inputClass} /></Field>
              <Field label="País"><input name="country" className={inputClass} /></Field>
              <Field label="Segmento" hint="Como segmente tu empresa: no hay catálogo impuesto.">
                <input name="segment" className={inputClass} />
              </Field>
            </div>
            <Field label="Responsable interno">
              <select name="owner_position_id" className={inputClass} defaultValue="">
                <option value="">Sin asignar</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
