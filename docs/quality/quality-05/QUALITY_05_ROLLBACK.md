# QUALITY-05 · Reversión

## Lo primero: qué NO hace falta revertir

La migración 0122 es **aditiva**. No borra datos, no elimina columnas, no toca
ninguna tabla anterior salvo para **ensanchar** catálogos cerrados de forma que
ningún valor previo desaparece. Un despliegue anterior de la aplicación funciona
contra una base con 0122 aplicada: las tablas nuevas simplemente no se consultan.

Por eso la reversión preferida es **revertir el código, no la base**.

## Nivel 1 · Revertir la aplicación (recomendado)

```bash
git revert 581c00a        # el commit de QUALITY-05
npm run build && desplegar
```

La base queda con 0122. Las tablas nuevas quedan vacías o con lo que se hubiera
registrado, y nada las lee. Riesgo: **ninguno**.

## Nivel 2 · Desactivar la entrada sin revertir

Si solo se quiere quitar Riesgos del menú, basta con retirar
`QUALITY_RIESGOS_GROUP` de `QUALITY_SHELL_MODULE.groups` en
`lib/modules/registry.ts`. Las rutas siguen existiendo pero dejan de anunciarse.

## Nivel 3 · Deshacer el esquema (última opción)

**Nunca editando 0122.** Una migración aplicada no se reescribe: se escribe otra.

Orden obligatorio, por las dependencias:

```sql
-- 1 · Disparadores y funciones propias
drop trigger if exists quality_risks_guard_delete on public.quality_risks;
drop trigger if exists quality_opportunities_guard_delete on public.quality_opportunities;
drop trigger if exists quality_controls_guard_delete on public.quality_controls;
drop trigger if exists quality_risk_methodology_versions_guard_delete
  on public.quality_risk_methodology_versions;

-- 2 · Devolver el despachador a su forma de 0121
--     (copiar el cuerpo de 0121 tal cual, sin las cuatro entidades nuevas)
create or replace function public.quality_deletion_eligibility(...) ...;

-- 3 · Devolver work_reference_must_be_valid a su forma de 0121
create or replace function public.work_reference_must_be_valid() ...;

-- 4 · Estrechar los catálogos SOLO si no hay filas con los valores nuevos
--     (comprobarlo antes; si las hay, se pierde información)
alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind in (... los nueve de 0121 ...));
-- y lo mismo para work_tasks, work_alerts, work_events, work_decisions

-- 5 · Vistas
drop view if exists public.v_quality_opportunity_overview;
drop view if exists public.v_quality_risk_overview;

-- 6 · Tablas, de hija a madre
drop table if exists public.quality_opportunity_assessment_factors;
drop table if exists public.quality_opportunity_assessments;
drop table if exists public.quality_opportunity_objectives;
drop table if exists public.quality_opportunity_processes;
drop table if exists public.quality_opportunity_codes;
drop table if exists public.quality_opportunities;
drop table if exists public.quality_risk_signals;
drop table if exists public.quality_risk_materializations;
drop table if exists public.quality_risk_treatment_plans;
drop table if exists public.quality_risk_assessment_factors;
drop table if exists public.quality_risk_assessments;
drop table if exists public.quality_control_effectiveness_reviews;
drop table if exists public.quality_control_activity_links;
drop table if exists public.quality_risk_control_links;
drop table if exists public.quality_control_codes;
drop table if exists public.quality_controls;
drop table if exists public.quality_risk_objectives;
drop table if exists public.quality_risk_processes;
drop table if exists public.quality_risk_consequences;
drop table if exists public.quality_risk_causes;
drop table if exists public.quality_risk_codes;
drop table if exists public.quality_risks;
drop table if exists public.quality_risk_scale_levels;
drop table if exists public.quality_risk_scales;
drop table if exists public.quality_risk_methodology_versions;
drop table if exists public.quality_risk_methodologies;
```

**Advertencia que no es formulismo:** el paso 6 destruye evaluaciones,
decisiones de tratamiento y materializaciones. Son registros que el propio
sprint declara históricos e imborrables, y que una auditoría puede pedir. Antes
de ejecutarlo hay que responder por escrito qué se pierde y quién lo autoriza.

## Lo que NO se hace nunca

- `supabase migration repair`
- editar 0122 o cualquier migración anterior
- `force push` sobre una rama publicada
