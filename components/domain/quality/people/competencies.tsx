"use client";

import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import type { CompetenceMatrixRow, CompetencyLevelRow, CompetencyRow } from "@/lib/db/quality-people";
import {
  createCompetencyAction, seedCompetencyLevelsAction, upsertCompetencyLevelAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Catálogo de competencias y escala.
 *
 * §18 · La competencia es REUTILIZABLE: «Auditoría interna» se define una vez
 * y la exigen los cargos que la necesiten. No existe «la competencia de Juan».
 *
 * §19 · Y la escala la define la empresa. Se ofrece una de partida porque
 * empezar con una hoja en blanco tampoco ayuda, pero es suya: puede cambiar
 * los nombres, los niveles y cuántos hay.
 */
export function CompetenciesView({
  competencies, levels, canManage,
}: {
  competencies: CompetencyRow[];
  levels: CompetencyLevelRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card
        title="Escala de niveles"
        description="La define tu empresa. Trazaloop no impone ninguna."
      >
        <Table
          headers={["Nivel", "Nombre", "Qué significa"]}
          empty="Todavía no has definido la escala."
          rows={levels.map((l) => [String(l.value), l.label, l.description ?? "—"])}
        />
        {canManage && levels.length === 0 ? (
          <ActionForm action={seedCompetencyLevelsAction} submitLabel="Empezar con una escala de partida" />
        ) : null}
        {canManage ? (
          <ActionForm action={upsertCompetencyLevelAction} submitLabel="Guardar nivel">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nivel">
                <input name="level_value" type="number" min={0} required className={inputClass} />
              </Field>
              <Field label="Nombre">
                <input name="label" required className={inputClass} />
              </Field>
              <Field label="Qué significa">
                <input name="description" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Competencias"
        description={`${competencies.length} en el catálogo`}
        action={<ExportPdfButton exportKey="quality.competency.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Competencia", "Código", "Categoría", "Estado", ""]}
          empty="Sin competencias en el catálogo."
          rows={competencies.map((c) => [
            c.name, c.code ?? "—", c.category ?? "—",
            c.isActive ? "Activa" : "Inactiva",
            <ExportPdfButton
              key="x" exportKey="quality.competency.detail" id={c.id} label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>
          Una competencia se <strong>exige</strong> desde la versión del perfil de un cargo,
          no se copia dentro del cargo. Así, cuando el perfil cambia, el requisito anterior
          sigue existiendo con su vigencia.
        </DomainNote>
        {canManage ? (
          <ActionForm action={createCompetencyAction} submitLabel="Crear competencia">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="Código">
                <input name="code" className={inputClass} />
              </Field>
              <Field label="Categoría">
                <input name="category" className={inputClass} />
              </Field>
            </div>
            <Field label="Descripción">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>
    </div>
  );
}

/**
 * §25/§65 · La matriz.
 *
 * Ordenada por persona y competencia, sin totales y sin orden por brecha. Una
 * columna «puntaje» aquí convertiría una herramienta de planificación en un
 * ranking de empleados, que es exactamente lo que PC-28 prohíbe.
 */
export function CompetenceMatrixView({
  matrix, today,
}: { matrix: CompetenceMatrixRow[]; today: string }) {
  const [date, setDate] = useState(today);
  const conBrecha = matrix.filter((m) => m.gap > 0).length;

  return (
    <div className="space-y-6">
      <Card
        title="Matriz de competencias"
        description={`${matrix.length} cruce(s) · ${conBrecha} con brecha`}
        action={
          <ExportPdfButton exportKey="quality.competence-matrix.detail" label="Descargar PDF" />
        }
      >
        <Table
          headers={["Persona", "Cargo", "Competencia", "Exigido", "Demostrado", "Brecha", "Evidencia"]}
          empty="Todavía no hay cargos con perfil publicado y personas asignadas."
          rows={matrix.map((m) => [
            m.personName, m.positionName, m.competencyName,
            String(m.requiredLevel),
            m.demonstratedLevel === null ? "Sin evaluar" : String(m.demonstratedLevel),
            m.gap === 0 ? "Sin brecha" : String(m.gap),
            m.evidenceStatus === "valid" ? "Vigente"
              : m.evidenceStatus === "expired" ? "Vencida · revisar" : "Sin evidencia",
          ])}
        />
        <DomainNote>
          Una brecha es la diferencia entre lo que el cargo exige y lo que la persona ha
          demostrado. No es una calificación, y esta pantalla no suma, no promedia y no
          ordena personas. Además, no toda brecha se cierra con un curso.
        </DomainNote>
      </Card>

      <Card
        title="La matriz en una fecha"
        description="Con el requisito que regía entonces, no con el de hoy."
        action={
          <ExportPdfButton
            exportKey="quality.competence-matrix.historical" filters={{ date }}
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
          Subir hoy un nivel exigido no vuelve incumplida una evaluación del año pasado.
          Este documento lee el requisito de la versión del perfil que estaba vigente en
          la fecha elegida.
        </DomainNote>
      </Card>
    </div>
  );
}
