# QUALITY-09 · El modelo de datos

**Migración:** `0127_quality_audits.sql` — 3 801 líneas, append-only.
**Local 0127 · Staging 0127 · Production 0111.**

## 0 · Lo que NO se creó, y por qué

| No existe | Porque ya existe |
|---|---|
| Un motor de casos de auditoría | `work_cases` — y QUALITY-04 ya había previsto este dominio: `case_type` incluía `'audit_finding'` y `origin_kind` incluía `'audit'` desde 0116 |
| Un motor de acciones correctivas | `work_actions`, atadas por `work_references` |
| Una bandeja de tareas de auditoría | `work_tasks` · seis tipos nuevos |
| Un sistema de avisos | `work_alerts` · seis tipos nuevos |
| Un repositorio documental | `trazadoc_documents` y sus revisiones |
| Un bucket de archivos | La evidencia REFERENCIA; no sube nada |

Un segundo motor de casos no es un atajo: es el punto exacto en el que la
organización deja de poder responder «¿cuántas no conformidades tenemos?» con un
solo número.

## 1 · Las veintidós tablas

### El programa (AR-01, AR-02)

| Tabla | Qué sostiene |
|---|---|
| `quality_audit_programs` | El plan del periodo: qué se auditará, cuándo y **por qué** (`prioritization_note`, que escribe una persona) |
| `quality_audit_program_revisions` | Cada cambio, con su `snapshot jsonb`. Sin política de `update` ni de `delete`: una revisión es una foto |

El programa **no tiene** `scheduled_from`, `executed_from` ni hallazgos. Si los
tuviera sería una auditoría con otro nombre.

### La auditoría individual (AR-03, §43…§45)

| Tabla | Qué sostiene |
|---|---|
| `quality_audits` | `planned_from/to` = la fecha ORIGINAL · `scheduled_from/to` = la VIGENTE · `executed_from/to` = lo que pasó |
| `quality_audit_reschedules` | De qué fecha a qué fecha, con motivo obligatorio y autor |

`program_id` es **nullable**: una auditoría extraordinaria es legítima y solo
tiene que decir que lo es (`nature = 'extraordinary'`).

### Alcance y criterios (AR-04, AR-05)

| Tabla | Qué sostiene |
|---|---|
| `quality_audit_scope_items` | Nueve clases: proceso, unidad, sede, proveedor, alcance de proveedor, documento, requisito, producto/servicio, otro. Guarda `process_revision_id` |
| `quality_audit_criteria` | Seis clases. Guarda `document_revision_id`: **la revisión que se auditó, no la de hoy** |

El alcance es estructurado, no una frase. Un `check` por clase impide registrar
«proceso» sin proceso o «sede» sin decir cuál.

### El checklist (AR-06)

| Tabla | Qué sostiene |
|---|---|
| `quality_audit_checklists` | El instrumento |
| `quality_audit_checklist_versions` | `draft` → `published` → `superseded` |
| `quality_audit_checklist_items` | Preguntas con `stable_key`: lo que permite comparar entre versiones |
| `quality_audit_checklist_runs` | Qué auditoría corrió qué VERSIÓN |
| `quality_audit_check_results` | La respuesta a cada pregunta |

`quality_checklist_version_is_published()` rechaza tocar una versión publicada.
La siguiente versión hereda las claves estables de la anterior.

### Equipo e independencia (AR-10, AR-11)

| Tabla | Qué sostiene |
|---|---|
| `quality_audit_team_members` | `person_id` → `quality_people`. **Sin `user_id`**: un auditor externo no necesita cuenta. Índice único para un solo `lead` |
| `quality_audit_conflict_checks` | Lo que la comprobación encontró y qué decidió una persona |

### Plan de trabajo (AR-09)

`quality_audit_agenda_items`, `quality_audit_meetings`, `quality_audit_auditees`.

### Ejecución (AR-12, AR-15)

| Tabla | Qué sostiene |
|---|---|
| `quality_audit_notes` | Notas de trabajo, con `is_restricted` |
| `quality_audit_samples` | Población y muestra: «10 de 400», no «revisado» |
| `quality_audit_evidence` | **Referencias**: documento, revisión, indicador, medición, evaluación de proveedor, riesgo, caso y `external_evidence_id` → `evidences` de PCR |

### Hallazgos (AR-13, AR-14)

| Tabla | Qué sostiene |
|---|---|
| `quality_audit_findings` | `proposed_classification` ∈ (`conforming`, `observation`, `improvement_opportunity`, `nonconformity_suspected`, `not_conclusive`) · `evaluation_status` · `case_id` |
| `quality_audit_finding_evidence` | El puente hallazgo↔evidencia, que se ata **después y a mano** |

El catálogo **no admite `'nonconformity'`**. Un `check` impide que `case_id`
exista sin `evaluation_status = 'escalated'`.

### Informe (AR-16)

`quality_audit_reports` — `snapshot jsonb not null`, `supersedes_id`, sin
política de `update` ni de `delete`.

## 2 · Vistas

Las tres son `security_invoker`: deciden las mismas políticas que las tablas.

| Vista | Qué responde |
|---|---|
| `v_quality_audit_program_coverage` | Planificadas, ejecutadas, cerradas, canceladas, reprogramadas, `coverage_pct` y procesos cubiertos |
| `v_quality_audit_overview` | Por auditoría: equipo, alcance, criterios, evidencia, hallazgos por estado, **y los casos y acciones abiertos, derivados de `work_cases`/`work_actions`** |
| `v_quality_audit_recurring_findings` | El mismo proceso con hallazgos en varias auditorías |

`coverage_pct` es **null** —no 0— cuando el programa no tiene auditorías: 0%
sugiere incumplimiento donde no hay nada que cumplir.

## 3 · Multiempresa

Toda relación del dominio usa FK compuestas `(organization_id, id)` (MDR-42).
Más de treinta en la migración. Una auditoría de A no alcanza un proceso, una
persona, un documento, un requisito ni una evidencia de B ni con el UUID en la
mano; la base lo rechaza antes de que llegue a RLS.
