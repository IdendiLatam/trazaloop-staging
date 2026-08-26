"use client";

import Link from "next/link";
import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import type { OrgChartRow, OrgUnitRow } from "@/lib/db/quality-people";
import { createOrgUnitAction, updatePositionStructureAction } from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Estructura de la empresa y organigrama.
 *
 * PC-02 · El organigrama que se ve aquí no es una imagen: se dibuja cada vez a
 * partir de unidades, cargos, jerarquía y asignaciones vigentes. Por eso no
 * puede quedar desactualizado, y por eso no hay ningún botón para «subir el
 * organigrama».
 *
 * §9 · Y las unidades son OPCIONALES. Una empresa pequeña funciona con una
 * unidad y varios cargos; obligarla a inventar departamentos para poder
 * empezar sería pedirle que se disfrace de empresa grande.
 */
export function OrgStructureView({
  units, chart, canManage, today,
}: {
  units: OrgUnitRow[];
  chart: OrgChartRow[];
  canManage: boolean;
  today: string;
}) {
  const [date, setDate] = useState(today);
  const byUnit = new Map<string | null, OrgChartRow[]>();
  for (const p of chart.filter((c) => c.isActive)) {
    const key = p.orgUnitId;
    byUnit.set(key, [...(byUnit.get(key) ?? []), p]);
  }
  const criticalVacant = chart.filter((p) => p.isActive && p.isCritical && p.holderCount === 0);

  return (
    <div className="space-y-6">
      <Card
        title="Organigrama"
        description="Derivado de unidades, cargos, jerarquía y asignaciones vigentes."
        action={<ExportPdfButton exportKey="quality.orgchart.detail" label="Descargar PDF" />}
      >
        {[...byUnit.entries()].length === 0 ? (
          <p className="text-xs text-ink-soft">Todavía no hay cargos activos.</p>
        ) : (
          <div className="space-y-4">
            {[...byUnit.entries()].map(([unitId, positions]) => (
              <div key={unitId ?? "sin-unidad"} className="space-y-1">
                <h3 className="text-xs font-semibold text-ink">
                  {unitId
                    ? units.find((u) => u.id === unitId)?.name ?? "Unidad"
                    : "Cargos sin unidad asignada"}
                </h3>
                <ul className="ml-3 space-y-1 border-l border-hairline pl-3">
                  {positions.map((p) => (
                    <li key={p.positionId} className="text-xs text-ink">
                      <Link
                        href={`/quality/people/positions/${p.positionId}`}
                        className="font-medium text-loop hover:underline"
                      >
                        {p.positionName}
                      </Link>
                      {p.isCritical ? " · cargo crítico" : ""}
                      <span className="text-ink-soft">
                        {" — "}
                        {p.holderCount === 0
                          ? "sin titular vigente"
                          : p.primaryHolderName ?? `${p.holderCount} persona(s)`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <DomainNote>
          Las cajas hablan de <strong>cargos</strong>, no de personas. El titular se ve al
          lado porque es útil, pero quien responde por un proceso es el cargo: así el
          sistema sigue en pie cuando alguien se va.
        </DomainNote>
      </Card>

      {criticalVacant.length > 0 ? (
        <Card title="Cargos críticos sin titular">
          <Table
            headers={["Cargo", "Unidad"]}
            empty=""
            rows={criticalVacant.map((p) => [p.positionName, p.orgUnitLabel ?? "—"])}
          />
        </Card>
      ) : null}

      <Card
        title="Titulares en una fecha"
        description="Quién ocupaba cada cargo ese día, no quién lo ocupa hoy."
        action={
          <ExportPdfButton
            exportKey="quality.position-holders.historical"
            filters={{ date }}
            label="Descargar PDF"
          />
        }
      >
        <Field label="Fecha">
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <DomainNote>
          Se reconstruye con las asignaciones vigentes en esa fecha. No se rellena con los
          titulares actuales: eso convertiría un documento del pasado en una afirmación falsa.
        </DomainNote>
      </Card>

      <Card
        title="Unidades de la empresa"
        description={`${units.length} declarada(s). Son opcionales.`}
        action={<ExportPdfButton exportKey="quality.org-unit.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Unidad", "Código", "Depende de", "Estado"]}
          empty="Sin unidades. Una empresa puede funcionar con una sola unidad y varios cargos."
          rows={units.map((u) => [
            u.name, u.code ?? "—",
            u.parentId ? units.find((x) => x.id === u.parentId)?.name ?? "—" : "Unidad raíz",
            u.isActive ? "Activa" : "Inactiva",
          ])}
        />
        {canManage ? (
          <ActionForm action={createOrgUnitAction} submitLabel="Crear unidad">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="Código">
                <input name="code" className={inputClass} />
              </Field>
              <Field label="Depende de">
                <select name="parent_id" className={inputClass} defaultValue="">
                  <option value="">Unidad raíz</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {canManage ? (
        <Card
          title="Colocar un cargo en la estructura"
          description="Unidad, cargo superior y criticidad."
        >
          <ActionForm action={updatePositionStructureAction} submitLabel="Guardar">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Cargo">
                <select name="position_id" required className={inputClass}>
                  <option value="">Elige</option>
                  {chart.map((p) => (
                    <option key={p.positionId} value={p.positionId}>{p.positionName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unidad">
                <select name="org_unit_id" className={inputClass} defaultValue="">
                  <option value="">Sin unidad</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Depende del cargo">
                <select name="parent_position_id" className={inputClass} defaultValue="">
                  <option value="">Ninguno</option>
                  {chart.map((p) => (
                    <option key={p.positionId} value={p.positionId}>{p.positionName}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="¿Es un cargo crítico?"
                hint="Si lo es, quedarse sin titular genera un aviso."
              >
                <input type="checkbox" name="is_critical" className="mt-2" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
