# TEXTILES_PASSPORT_DATA_MODEL_PROPOSAL — Modelo de datos del pasaporte técnico textil (propuesta T9A)

> Propuesta para el sprint **T9A**. No se crea migración en T9.0. Sigue los
> patrones establecidos del módulo textil (0020/0024): `unique(org,id)`,
> `unique(org, code)`, FKs compuestas por `(organization_id, id)`, triggers
> `set_updated_at` / `force_created_by` / `prevent_organization_id_change` /
> `audit_row_change`, RLS deny-by-default con `security_invoker` en vistas.

## 1. Decisión: una tabla principal, versionado por registros

Un pasaporte = **un registro por versión**. `passport_code` es estable dentro de
`(organization_id, reference_id, output_lot_id)` y `passport_version` es
incremental. El histórico es el conjunto de registros con el mismo
`passport_code`; el vigente es el de mayor `passport_version` no `obsolete`.

No se crean `textile_technical_passport_sections` ni
`textile_technical_passport_versions` en T9A:

- Las **secciones** son una estructura fija (documento 3) que vive dentro de
  `snapshot_json`; no se editan campo a campo, se regeneran. Una tabla de
  secciones solo tendría sentido si el usuario editara el pasaporte sección a
  sección, lo que contradice el principio de snapshot. Se deja como **opción
  futura** documentada, no implementada.
- El **versionado** por registros separados ya da historial inmutable; una
  tabla de versiones duplicaría el snapshot. Se descarta salvo que aparezca una
  necesidad de diffs estructurados (no prevista).

## 2. Tabla `textile_technical_passports`

```
create table public.textile_technical_passports (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id),

  passport_code            text not null,           -- estable por (org, ref, lote)
  passport_version         integer not null default 1,

  reference_id             uuid not null,           -- eje del pasaporte
  output_lot_id            uuid,                    -- opcional (pasaporte por lote)
  circularity_assessment_id uuid,                   -- opcional

  status                   text not null default 'draft',
    -- draft | generated | in_review | approved_internal | obsolete

  -- Snapshot y derivados: SOLO los escribe la RPC de generación bajo flag.
  snapshot_json            jsonb not null default '{}'::jsonb,
  data_sources_json        jsonb not null default '{}'::jsonb, -- IDs + updated_at usados
  gaps_json                jsonb not null default '[]'::jsonb,
  warnings_json            jsonb not null default '[]'::jsonb,
  recommendations_json     jsonb not null default '[]'::jsonb,
  source_hash              text,                    -- detección de cambios posteriores

  -- Sellos de ciclo de vida (usuarios de la organización).
  generated_at             timestamptz,
  generated_by             uuid references public.profiles (id),
  reviewed_at              timestamptz,
  reviewed_by              uuid references public.profiles (id),
  approved_at              timestamptz,
  approved_by              uuid references public.profiles (id),
  obsolete_at              timestamptz,
  obsolete_by              uuid references public.profiles (id),

  notes                    text,
  created_by               uuid references public.profiles (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint textile_passports_org_id_uniq unique (organization_id, id),
  constraint textile_passports_code_version_uniq
    unique (organization_id, passport_code, passport_version),
  constraint textile_passports_status_check
    check (status in ('draft','generated','in_review','approved_internal','obsolete')),
  constraint textile_passports_version_positive check (passport_version >= 1),

  -- FKs compuestas: la referencia/lote/evaluación deben ser de la MISMA
  -- organización (imposibilita cruces cross-tenant a nivel de esquema).
  constraint textile_passports_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id),
  constraint textile_passports_output_lot_fk
    foreign key (organization_id, output_lot_id)
    references public.textile_output_lots (organization_id, id),
  constraint textile_passports_assessment_fk
    foreign key (organization_id, circularity_assessment_id)
    references public.textile_circularity_assessments (organization_id, id)
);
```

Notas de diseño:

- `textile_references`, `textile_output_lots` y `textile_circularity_assessments`
  ya exponen `unique(organization_id, id)` (verificado en 0074/0078/0080), por
  lo que las FKs compuestas son viables sin cambios a esas tablas.
- Índices sugeridos: `(organization_id, reference_id)`,
  `(organization_id, output_lot_id)`, `(organization_id, status)`,
  `(organization_id, passport_code)`.
- La coherencia "lote ↔ referencia" y "evaluación ↔ referencia" no se puede
  expresar solo con FKs (el lote referencia una orden, no directamente la
  referencia); se valida por **trigger** en T9A (documento 6, validaciones de
  destino, espejo de `validate_…_target` de 0080).

## 3. `snapshot_json` — forma (resumen; detalle en documento 3)

```
{
  "passport": { "code", "version", "generated_at", "status", "scope" },
  "organization": { "id", "name", "legal_name?", "tax_id?", "logo_url?" },
  "product": { ... },
  "composition": { "fibers": [...], "total_percentage", "status", "gaps": [...] },
  "materials": [...],
  "components": [...],
  "suppliers_processes": { ... },
  "evidences": { "items": [...], "by_status": { ... } },
  "traceability": { "present": bool, ... },
  "circularity": { "present": bool, "methodology", "score", "level", "dimensions", "gaps", "recommendations" },
  "care_repair_eol": { ... },
  "claims": [...],
  "trazadocs": [ { "code", "title", "status", "version" } ],
  "gaps": [...],           // consolidado (documento 8)
  "executive_summary": { "preparation_level", "strengths", "gaps", "next_steps" }
}
```

`snapshot_json` es autocontenido: incluye los valores mostrados **y** los IDs
fuente (para navegación) más `data_sources_json` con los `updated_at` usados
(para el hash). Ningún consumidor del pasaporte histórico necesita volver a las
tablas vivas.

## 4. Estados y transiciones (resumen; detalle en documento 5)

`draft → generated → in_review → approved_internal → obsolete`, con
`generated → obsolete` y `approved_internal → obsolete` (al crear una nueva
versión) permitidos. El snapshot es inmutable desde `generated`. Transiciones
vía RPC atómica en servidor.

## 5. Qué NO se crea en T9A

Sin tabla de secciones, sin tabla de versiones, sin tablas de QR/enlace público,
sin columnas de firma electrónica, sin `organization_module_*`. Una sola tabla
nueva. El resto (evidencias) reutiliza `textile_evidence_links` ampliando su
`entity_type`/`link_type` de forma aditiva (documento 6, §evidencias).
