"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  APPROVAL_DECISION_LABEL, APPROVAL_DECISIONS, describeScope, describeTrend,
  EVALUATION_KIND_LABEL, EVALUATION_STATUS_LABEL, EXPIRY_IS_NOT_SUSPENSION, formatDate,
  INCIDENT_IS_NOT_NC, INCIDENT_KIND_LABEL, INCIDENT_KINDS, INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABEL, RELATIONSHIP_STATUS_LABEL, RELATIONSHIP_STATUSES,
  REQUIREMENT_ENFORCEMENT_HINT, REQUIREMENT_ENFORCEMENT_LABEL, REQUIREMENT_KIND_LABEL,
  SUPPLIER_SIGNAL_LABEL, SUPPLIER_SOURCE_LABEL,
} from "@/lib/domain/quality-suppliers";
import { LifecyclePanel } from "@/components/domain/quality/lifecycle-panel";
import type { DeletionEligibility } from "@/lib/domain/lifecycle";
import type { MethodologyRow } from "@/lib/db/risks";
import type { SupplierCategoryRow, SupplierFile, SupplierTemplateRow } from "@/lib/db/quality-suppliers";
import {
  assessCriticalityAction, assignCategoryAction, createContactAction, createDocumentAction,
  createEvaluationAction, createScopeAction, createSiteAction, decideApprovalAction,
  deleteSupplierAction, dismissSignalAction, openCaseFromIncidentAction, recordIncidentAction,
  retireSupplierAction, updateSupplierAction,
} from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · La ficha 360 del proveedor.
 *
 * Responde las doce preguntas del §41 sin convertirse en un ERP: quién es, qué
 * suministra, dónde, qué criticidad tiene, para qué está aprobado, qué se le
 * exige, cuándo se evaluó, cómo ha evolucionado, qué evidencia tiene, cuándo se
 * reevalúa y qué casos hay abiertos.
 *
 * Lo que la ficha se niega a enseñar: un semáforo global. «Aprobado» sin decir
 * para qué es la afirmación más peligrosa de este dominio, y por eso la
 * aprobación se lee siempre por ALCANCE.
 */
export type ScopeRequirements = {
  scopeId: string;
  items: {
    requirementId: string; code: string | null; title: string;
    kind: keyof typeof REQUIREMENT_KIND_LABEL;
    enforcement: keyof typeof REQUIREMENT_ENFORCEMENT_LABEL;
    source: "scope" | "category";
  }[];
};

export function SupplierFileView({
  file, categories, templates, methodologies, requirementsByScope,
  positions, eligibility, canManage, canDecide, today,
}: {
  file: SupplierFile;
  categories: SupplierCategoryRow[];
  templates: SupplierTemplateRow[];
  methodologies: MethodologyRow[];
  requirementsByScope: ScopeRequirements[];
  positions: { id: string; name: string }[];
  eligibility: DeletionEligibility;
  canManage: boolean;
  canDecide: boolean;
  today: string;
}) {
  const o = file.overview;
  const cerradas = file.evaluations.filter((e) => e.status === "closed");
  const tendencia = describeTrend(
    cerradas[0] ? { score: cerradas[0].score, on: cerradas[0].evaluatedOn ?? "" } : null,
    cerradas[1] ? { score: cerradas[1].score, on: cerradas[1].evaluatedOn ?? "" } : null
  );
  const metodologiaVigente = methodologies
    .flatMap((m) => {
      const version = m.versions.find((v) => v.status === "published");
      return version ? [{ methodology: m, version }] : [];
    })[0] ?? null;
  const publicadas = templates.flatMap((t) =>
    t.versions.filter((v) => v.status === "published").map((v) => ({ t, v })));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/quality/suppliers" className="text-xs font-medium text-loop hover:underline">
          ← Proveedores
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{o.legalName}</h1>
        <p className="text-sm text-ink-soft">
          {RELATIONSHIP_STATUS_LABEL[o.relationshipStatus]}
          {o.taxId ? ` · ${o.taxId}` : ""}
          {o.ownerPositionName ? ` · Responsable: ${o.ownerPositionName}` : ""}
          {o.cprSupplierId || o.textileSupplierId
            ? ` · También en ${[o.cprSupplierId ? SUPPLIER_SOURCE_LABEL.cpr : null,
                               o.textileSupplierId ? SUPPLIER_SOURCE_LABEL.textiles : null]
                 .filter(Boolean).join(" y ")}`
            : ""}
        </p>
        <span className="flex flex-wrap gap-2">
          <ExportPdfButton exportKey="quality.supplier.detail" id={o.profileId} label="Descargar PDF" />
          <ExportPdfButton
            exportKey="quality.supplier-performance.detail" id={o.profileId}
            label="Descargar PDF"
          />
        </span>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Alcances"
        description="Aprobado ¿para qué? La respuesta es siempre por alcance."
      >
        <Table
          headers={["Alcance", "Criticidad", "Aprobación", "Vigencia", "Última evaluación", ""]}
          empty="Este proveedor no tiene alcances declarados."
          rows={file.scopes.map((s) => [
            describeScope({ siteName: s.siteName, categoryName: s.categoryName }),
            s.criticalityLabel ?? "Sin clasificar",
            s.decision ? APPROVAL_DECISION_LABEL[s.decision] : "Sin decidir",
            s.decisionValidUntil
              ? `${formatDate(s.decisionValidUntil)}${s.approvalExpired ? " · vencida" : ""}`
              : (s.decision ? "Sin fecha límite" : "—"),
            s.lastEvaluatedOn
              ? `${formatDate(s.lastEvaluatedOn)} · ${s.lastScore ?? "—"}${s.lastResultBand ? ` (${s.lastResultBand})` : ""}`
              : "Sin evaluar",
            <span key="x" className="flex gap-2">
              <ExportPdfButton
                exportKey="quality.supplier-criticality.detail" id={s.scopeId}
                label="Descargar PDF"
              />
              {s.decisionId ? (
                <ExportPdfButton
                  exportKey="quality.supplier-approval.detail" id={s.decisionId}
                  label="Descargar PDF"
                />
              ) : null}
              {/* La verdad histórica: qué estaba decidido en una fecha, no lo
                  que se decidió aquel día. Son preguntas distintas y por eso
                  son dos documentos. */}
              <ExportPdfButton
                exportKey="quality.supplier-approval.historical" id={s.scopeId}
                filters={{ date: today }}
                label="Descargar PDF"
              />
            </span>,
          ])}
        />
        <DomainNote>
          Un proveedor puede estar aprobado para materia prima y no para calibración. Por eso
          aquí no hay un semáforo global: sería una respuesta a una pregunta que nadie hace.
        </DomainNote>
        {canManage ? (
          <ActionForm action={createScopeAction} submitLabel="Crear alcance">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sede">
                <select name="site_id" className={inputClass} defaultValue="">
                  <option value="">Todas</option>
                  {file.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Categoría">
                <select name="category_id" className={inputClass} defaultValue="">
                  <option value="">Todas</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Etiqueta">
                <input name="label" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Criticidad"
        description="Cuánto pesa depender de este proveedor para este alcance."
      >
        <DomainNote>
          La criticidad <strong>no</strong> es una nota de desempeño. Un proveedor
          crítico puede llevar años sin un solo fallo y seguir siendo crítico: lo que
          mide es el daño si falla, no lo bien que lo ha hecho.
        </DomainNote>
        {canManage && metodologiaVigente ? (
          <ActionForm action={assessCriticalityAction} submitLabel="Clasificar">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <input type="hidden" name="version_id" value={metodologiaVigente.version.versionId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Alcance">
                <select name="scope_id" required className={inputClass}>
                  {file.scopes.map((s) => (
                    <option key={s.scopeId} value={s.scopeId}>
                      {describeScope({ siteName: s.siteName, categoryName: s.categoryName })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha">
                <input name="assessed_on" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {metodologiaVigente.version.scales
                .filter((sc) => sc.scaleKind === "dimension")
                .map((sc) => (
                  <Field key={sc.scaleId} label={sc.label} hint={sc.description ?? undefined}>
                    <select name="level_id" required className={inputClass}>
                      {sc.levels.map((l) => (
                        <option key={l.levelId} value={l.levelId}>{l.value} · {l.label}</option>
                      ))}
                    </select>
                  </Field>
                ))}
            </div>
            <Field label="Por qué" hint="Lo que no se explica hoy no se entiende dentro de un año.">
              <textarea name="rationale" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : (
          <p className="text-xs text-ink-soft">
            {canManage
              ? "Para clasificar criticidad hace falta una metodología publicada que aplique a "
                + "proveedores. Se define en Riesgos, con la misma mecánica que las demás."
              : "Tu rol no permite clasificar criticidad."}
          </p>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Qué se le exige"
        description="Los requisitos vigentes hoy, por alcance."
      >
        {requirementsByScope.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin requisitos asignados a estos alcances.</p>
        ) : (
          requirementsByScope.map((r) => {
            const alcance = file.scopes.find((s) => s.scopeId === r.scopeId);
            return (
              <div key={r.scopeId} className="space-y-1">
                <p className="text-xs font-medium text-ink">
                  {alcance
                    ? describeScope({
                        siteName: alcance.siteName, categoryName: alcance.categoryName,
                      })
                    : "Alcance"}
                </p>
                <Table
                  headers={["Requisito", "Tipo", "Exigencia", "Viene de"]}
                  empty="Sin requisitos."
                  rows={r.items.map((i) => [
                    i.code ? `${i.code} · ${i.title}` : i.title,
                    REQUIREMENT_KIND_LABEL[i.kind],
                    REQUIREMENT_ENFORCEMENT_LABEL[i.enforcement],
                    i.source === "category" ? "Su categoría" : "Este alcance",
                  ])}
                />
              </div>
            );
          })
        )}
        <DomainNote>{REQUIREMENT_ENFORCEMENT_HINT.blocking}</DomainNote>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {canDecide ? (
        <Card
          title="Decidir la aprobación"
          description="Es un acto humano, con alcance y fundamento."
        >
          <DomainNote>
            La puntuación de una evaluación <strong>no aprueba a nadie</strong>. Informa. Un
            72 puede terminar en «aprobado con condiciones» o en «no aprobado», y eso lo
            decide una persona.
          </DomainNote>
          <ActionForm action={decideApprovalAction} submitLabel="Registrar decisión">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Alcance">
                <select name="scope_id" required className={inputClass}>
                  {file.scopes.map((s) => (
                    <option key={s.scopeId} value={s.scopeId}>
                      {describeScope({ siteName: s.siteName, categoryName: s.categoryName })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Decisión">
                <select name="decision" className={inputClass} defaultValue="approved">
                  {APPROVAL_DECISIONS.map((d) => (
                    <option key={d} value={d}>{APPROVAL_DECISION_LABEL[d]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Vigente hasta" hint="En blanco = sin fecha límite.">
                <input name="valid_until" type="date" className={inputClass} />
              </Field>
              <Field label="Evaluación que la informa">
                <select name="evaluation_id" className={inputClass} defaultValue="">
                  <option value="">Ninguna</option>
                  {cerradas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {formatDate(e.evaluatedOn)} · {e.score ?? "—"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="En qué se basa" hint="Obligatorio.">
              <textarea name="rationale" rows={2} required className={inputClass} />
            </Field>
            <Field label="Condiciones" hint="Obligatorias si la aprobación es condicionada.">
              <textarea name="conditions" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <Card title="Evaluaciones" description={tendencia.text}>
        <Table
          headers={["Fecha", "Clase", "Plantilla", "Resultado", "Criterios", "Estado", ""]}
          empty="Todavía no se ha evaluado a este proveedor."
          rows={file.evaluations.map((e) => [
            e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
            EVALUATION_KIND_LABEL[e.kind],
            e.templateName ? `${e.templateName} v${e.versionNumber}` : "—",
            e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
            `${e.criteriaScored}/${e.criteriaTotal}`
              + (e.criteriaNotApplicable > 0 ? ` · ${e.criteriaNotApplicable} N/A` : "")
              + (e.criteriaUnavailable > 0 ? ` · ${e.criteriaUnavailable} sin dato` : ""),
            EVALUATION_STATUS_LABEL[e.status],
            <span key="x" className="flex gap-2">
              <Link
                href={`/quality/suppliers/evaluations/${e.id}`}
                className="font-medium text-loop hover:underline"
              >
                Ver
              </Link>
              <ExportPdfButton
                exportKey="quality.supplier-evaluation.detail" id={e.id} label="Descargar PDF"
              />
            </span>,
          ])}
        />
        <DomainNote>
          Una reevaluación es una evaluación <strong>nueva</strong>. La anterior no se
          edita: si el resultado bajó, se ve la evolución y las dos siguen ahí.
        </DomainNote>
        {canManage && publicadas.length > 0 && file.scopes.length > 0 ? (
          <ActionForm action={createEvaluationAction} submitLabel="Abrir evaluación">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Alcance">
                <select name="scope_id" required className={inputClass}>
                  {file.scopes.map((s) => (
                    <option key={s.scopeId} value={s.scopeId}>
                      {describeScope({ siteName: s.siteName, categoryName: s.categoryName })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plantilla">
                <select name="version_id" required className={inputClass}>
                  {publicadas.map(({ t, v }) => (
                    <option key={v.id} value={v.id}>{t.name} v{v.versionNumber}</option>
                  ))}
                </select>
              </Field>
              <Field label="Clase">
                <select name="evaluation_kind" className={inputClass} defaultValue="periodic">
                  <option value="selection">Selección</option>
                  <option value="periodic">Evaluación periódica</option>
                  <option value="reevaluation">Reevaluación</option>
                  <option value="extraordinary">Reevaluación extraordinaria</option>
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card title="Sedes" description="La evaluación puede depender de la sede.">
        <Table
          headers={["Sede", "Código", "Ubicación", "Principal", ""]}
          empty="Este proveedor no tiene sedes declaradas."
          rows={file.sites.map((s) => [
            s.name, s.code ?? "—",
            [s.city, s.country].filter(Boolean).join(", ") || "—",
            s.isPrimary ? "Sí" : "—",
            <span key="x" className="flex gap-2">
              <Link
                href={`/quality/suppliers/${o.profileId}/sites/${s.id}`}
                className="font-medium text-loop hover:underline"
              >
                Ver sede
              </Link>
              <ExportPdfButton
                exportKey="quality.supplier-site.detail" id={s.id} label="Descargar PDF"
              />
            </span>,
          ])}
        />
        {canManage ? (
          <ActionForm action={createSiteAction} submitLabel="Añadir sede">
            <input type="hidden" name="party_id" value={o.partyId} />
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Código"><input name="code" className={inputClass} /></Field>
              <Field label="Ciudad"><input name="city" className={inputClass} /></Field>
              <Field label="País"><input name="country" className={inputClass} /></Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Contactos"
        description="Solo lo que hace falta para trabajar con ellos."
      >
        <Table
          headers={["Nombre", "Función", "Correo", "Teléfono", "Sede"]}
          empty="Sin contactos registrados."
          rows={file.contacts.map((c) => [
            c.fullName, c.roleTitle ?? "—", c.email ?? "—", c.phone ?? "—",
            file.sites.find((s) => s.id === c.siteId)?.name ?? "Todas",
          ])}
        />
        <DomainNote>
          Aquí no van documentos de identidad ni datos personales que la relación
          comercial no necesite. Un contacto es un canal de trabajo, no un expediente.
        </DomainNote>
        {canManage ? (
          <ActionForm action={createContactAction} submitLabel="Añadir contacto">
            <input type="hidden" name="party_id" value={o.partyId} />
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre"><input name="full_name" required className={inputClass} /></Field>
              <Field label="Función"><input name="role_title" className={inputClass} /></Field>
              <Field label="Correo"><input name="email" type="email" className={inputClass} /></Field>
              <Field label="Teléfono"><input name="phone" className={inputClass} /></Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card title="Qué suministra">
        <Table
          headers={["Categoría", "Sede", "Desde", "Hasta"]}
          empty="Sin categorías asignadas."
          rows={file.categories.map((c) => [
            c.categoryName, c.siteName ?? "Todas",
            formatDate(c.sinceOn), c.untilOn ? formatDate(c.untilOn) : "Vigente",
          ])}
        />
        {canManage && categories.length > 0 ? (
          <ActionForm action={assignCategoryAction} submitLabel="Asignar categoría">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoría">
                <select name="category_id" required className={inputClass}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Sede" hint="En blanco = todas.">
                <select name="site_id" className={inputClass} defaultValue="">
                  <option value="">Todas</option>
                  {file.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card title="Documentos y certificaciones">
        <Table
          headers={["Documento", "Emisor", "Emitido", "Vence", "Estado"]}
          empty="Sin documentos registrados."
          rows={file.documents.map((d) => [
            d.title, d.issuer ?? "—",
            d.issuedOn ? formatDate(d.issuedOn) : "—",
            d.expiresOn ? formatDate(d.expiresOn) : "No vence",
            d.status,
          ])}
        />
        <DomainNote>{EXPIRY_IS_NOT_SUSPENSION}</DomainNote>
        {canManage ? (
          <ActionForm action={createDocumentAction} submitLabel="Registrar documento">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Documento"><input name="title" required className={inputClass} /></Field>
              <Field label="Emisor"><input name="issuer" className={inputClass} /></Field>
              <Field label="Emitido"><input name="issued_on" type="date" className={inputClass} /></Field>
              <Field label="Vence" hint="En blanco = no vence.">
                <input name="expires_on" type="date" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card title="Incidentes">
        <Table
          headers={["Fecha", "Incidente", "Tipo", "Gravedad", "Caso", ""]}
          empty="Sin incidentes registrados."
          rows={file.incidents.map((i) => [
            formatDate(i.occurredOn), i.title,
            INCIDENT_KIND_LABEL[i.kind], INCIDENT_SEVERITY_LABEL[i.severity],
            i.caseId
              ? <Link key="c" href={`/quality/cases/${i.caseId}`}
                  className="font-medium text-loop hover:underline">Ver caso</Link>
              : "Sin caso",
            canManage && !i.caseId ? (
              <ActionForm
                key="o" action={openCaseFromIncidentAction} submitLabel="Crear caso"
                className="flex items-end gap-2"
              >
                <input type="hidden" name="incident_id" value={i.id} />
                <input type="hidden" name="profile_id" value={o.profileId} />
              </ActionForm>
            ) : "",
          ])}
        />
        <DomainNote>{INCIDENT_IS_NOT_NC}</DomainNote>
        {canManage ? (
          <ActionForm action={recordIncidentAction} submitLabel="Registrar incidente">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Qué pasó"><input name="title" required className={inputClass} /></Field>
              <Field label="Tipo">
                <select name="incident_kind" className={inputClass} defaultValue="delivery">
                  {INCIDENT_KINDS.map((k) => (
                    <option key={k} value={k}>{INCIDENT_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gravedad">
                <select name="severity" className={inputClass} defaultValue="minor">
                  {INCIDENT_SEVERITIES.map((s) => (
                    <option key={s} value={s}>{INCIDENT_SEVERITY_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cuándo">
                <input name="occurred_on" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
            <Field
              label="¿Fue un problema del dato y no del proveedor?"
              hint="Un fallo de la integración no es un deterioro de nadie."
            >
              <input type="checkbox" name="is_data_issue" className="mt-2" />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {file.signals.length > 0 ? (
        <Card title="Señales">
          <Table
            headers={["Señal", "Detalle", "Estado", ""]}
            empty=""
            rows={file.signals.map((s) => [
              SUPPLIER_SIGNAL_LABEL[s.kind], s.detail ?? "—", s.status,
              canManage && s.status === "open" ? (
                <ActionForm
                  key="d" action={dismissSignalAction} submitLabel="Descartar"
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="signal_id" value={s.id} />
                  <input type="hidden" name="profile_id" value={o.profileId} />
                </ActionForm>
              ) : "",
            ])}
          />
          <DomainNote>
            Una señal dice «mira esto». No suspende, no rechaza y no abre ninguna no
            conformidad: todo eso lo decide una persona.
          </DomainNote>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {canManage ? (
        <Card title="Relación y cadencia">
          <ActionForm action={updateSupplierAction} submitLabel="Guardar">
            <input type="hidden" name="profile_id" value={o.profileId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Estado de la relación">
                <select name="relationship_status" className={inputClass}
                  defaultValue={o.relationshipStatus}>
                  {RELATIONSHIP_STATUSES.map((s) => (
                    <option key={s} value={s}>{RELATIONSHIP_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Responsable interno">
                <select name="owner_position_id" className={inputClass}
                  defaultValue={o.ownerPositionId ?? ""}>
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field
                label="Reevaluar cada (meses)"
                hint="La criticidad puede acortarla."
              >
                <input name="reevaluation_months" type="number" min={1} max={120}
                  defaultValue={o.reevaluationMonths} className={inputClass} />
              </Field>
            </div>
          </ActionForm>

        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <LifecyclePanel
        entity="supplier"
        name={o.legalName}
        eligibility={eligibility}
        idFieldName="profile_id"
        idValue={o.profileId}
        deleteAction={deleteSupplierAction}
        canManage={canManage}
        alternativeSlot={
          o.relationshipStatus !== "retired" ? (
            <ActionForm action={retireSupplierAction} submitLabel="Retirar proveedor">
              <input type="hidden" name="profile_id" value={o.profileId} />
              <DomainNote>
                Retirar conserva sus evaluaciones, sus decisiones y su historia. La empresa
                sigue existiendo para PCR y para Textiles: lo que termina es la relación
                como proveedor del sistema de gestión.
              </DomainNote>
            </ActionForm>
          ) : null
        }
      />
    </div>
  );
}
