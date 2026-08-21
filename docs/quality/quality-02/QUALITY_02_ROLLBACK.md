# QUALITY-02 · Rollback

**Migración:** `0116_document_control_revisions_workflow_and_tasks.sql`
**Rama:** `feature/quality-02-document-control`
**Alcance del rollback:** LOCAL y STAGING. Production nunca recibió este sprint.

---

## 1. Lo primero: casi nunca hace falta

0116 es **enteramente aditiva**. No modifica ninguna migración anterior, no
elimina ninguna tabla, no borra ninguna fila y no reescribe
`change_trazadoc_document_status`. Los documentos existentes nacen y siguen en
`revision_model = 'legacy'`, que es su comportamiento de siempre.

En la práctica eso significa que **revertir el código sin tocar la base deja el
sistema en un estado consistente**: PCR, Textiles y los documentos de Quality
anteriores funcionan exactamente igual que antes del sprint.

Empieza por ahí. Bajar la migración solo es necesario si hay que devolver el
esquema a su forma previa, y tiene un coste real (§3).

---

## 2. Rollback de código (recomendado)

```bash
# En el repositorio, con el árbol limpio:
git checkout main                     # o la rama que corresponda
# El despliegue de Preview de la rama deja de servirse al no promocionarse.
```

Si la rama ya se hubiera integrado:

```bash
git revert --no-commit d0ca41b 3c33012 9fe8faa 9b5bf11
git commit -m "revert: QUALITY-02"
```

**Qué queda tras esto**

| | Estado |
|---|---|
| PCR, Textiles, TrazaDocs | Intactos, sin diferencia observable |
| Documentos de Quality creados antes de QUALITY-02 | Intactos |
| Documentos de Quality creados DURANTE QUALITY-02 | Siguen existiendo, con su contenido y su historial. La pantalla vuelve a la de QUALITY-01.1: se ven y se editan, pero sin control documental |
| Tablas de 0116 | Siguen ahí, sin escritores. No estorban |

⚠️ Un documento con `revision_model = 'controlled'` **no podrá cambiar de estado**
con el código anterior: el trigger `t_trazadoc_documents_revision_guard` sigue
instalado y bloquea a `change_trazadoc_document_status`. Si eso es un problema,
la solución mínima es §4 (desactivar solo el guarda), no bajar la migración
entera.

---

## 3. Rollback de base de datos (destructivo)

> **Destruye el historial documental creado durante el sprint.** Antes de
> ejecutarlo, exporta lo que haya que conservar.

```sql
-- 1. Exportar antes de destruir (imprescindible si hay datos reales)
\copy (select * from public.trazadoc_document_revisions)   to 'revisions.csv'   csv header
\copy (select * from public.trazadoc_document_decisions)   to 'decisions.csv'   csv header
\copy (select * from public.trazadoc_document_workflow_participants) to 'participants.csv' csv header
\copy (select * from public.work_tasks)  to 'tasks.csv'  csv header
\copy (select * from public.work_alerts) to 'alerts.csv' csv header

-- 2. Vista
drop view if exists public.v_trazadoc_document_control;

-- 3. Triggers y funciones de guarda
drop trigger if exists t_work_alerts_recipient_scope on public.work_alerts;
drop trigger if exists t_trazadoc_sections_controlled_editing on public.trazadoc_document_sections;
drop trigger if exists t_trazadoc_documents_revision_guard on public.trazadoc_documents;
drop trigger if exists t_trazadoc_document_revisions_direct_update on public.trazadoc_document_revisions;
drop trigger if exists t_trazadoc_document_revisions_immutable on public.trazadoc_document_revisions;

drop function if exists public.protect_work_alert_recipient_scope();
drop function if exists public.protect_trazadoc_controlled_section_editing();
drop function if exists public.protect_trazadoc_document_revision_number();
drop function if exists public.protect_trazadoc_revision_direct_update();
drop function if exists public.protect_trazadoc_revision_immutability();

-- 4. RPC
drop function if exists public.trazadoc_delete_document_safely(uuid);
drop function if exists public.trazadoc_retire_document(uuid, text);
drop function if exists public.trazadoc_record_document_decision(uuid, text, text);
drop function if exists public.trazadoc_submit_document_revision(uuid, jsonb, jsonb, text, date, date, text);
drop function if exists public.trazadoc_activate_workflow_stage(uuid, text);
drop function if exists public.trazadoc_create_document_revision(uuid, text);
drop function if exists public.trazadoc_current_org_role(uuid);
drop function if exists public.trazadoc_build_document_snapshot(uuid);

-- 5. Tablas (el orden importa: las hijas primero)
drop table if exists public.work_alerts;
drop table if exists public.work_tasks;
drop table if exists public.trazadoc_document_decisions;
drop table if exists public.trazadoc_document_workflow_participants;
drop table if exists public.trazadoc_document_revisions;

-- 6. Columnas añadidas a trazadoc_documents
alter table public.trazadoc_documents
  drop constraint if exists trazadoc_documents_owner_position_fk,
  drop constraint if exists trazadoc_documents_disposition_check,
  drop constraint if exists trazadoc_documents_revision_model_check;
drop index if exists public.trazadoc_documents_owner_position_idx;
drop index if exists public.trazadoc_documents_org_module_disposition_idx;
alter table public.trazadoc_documents
  drop column if exists retirement_reason,
  drop column if exists retired_by,
  drop column if exists retired_at,
  drop column if exists current_revision_id,
  drop column if exists owner_position_id,
  drop column if exists disposition,
  drop column if exists revision_model;

-- 7. Registro de migraciones
delete from supabase_migrations.schema_migrations where version = '0116';
```

**Efecto sobre los datos:** todo documento creado durante el sprint conserva su
identidad, su contenido y su `current_version`, pero pierde sus revisiones, sus
decisiones formales, sus aprobaciones y su bandeja. Su `current_version` queda
como el número que tuviera —que ya no significará nada— y la RPC histórica
volverá a incrementarlo en cada transición.

---

## 4. Rollback parcial: desactivar solo el guarda de revisión

Si el problema fuera únicamente que la RPC histórica no puede tocar los
documentos controlados —por ejemplo, para desbloquear un flujo mientras se
decide qué hacer—, basta con quitar **un** trigger:

```sql
drop trigger if exists t_trazadoc_documents_revision_guard on public.trazadoc_documents;
```

Consecuencia: los cambios de estado volverán a incrementar `current_version`
también en los documentos controlados, es decir, vuelve el defecto que este
sprint corrige. Es una medida de emergencia, no una configuración.

---

## 5. Rollback en STAGING

Staging (`qchzkxbnbqeyuxinipln`) recibió la migración con `--project-ref`
explícito. Para revertirla:

```bash
# El repositorio queda desvinculado tras el sprint, así que se vincula solo
# para esta operación y se desvincula al terminar.
npx supabase link --project-ref qchzkxbnbqeyuxinipln
npx supabase db push --dry-run          # comprobar qué se aplicaría
# Ejecutar el SQL de §3 en el editor SQL del proyecto, o con psql.
npx supabase unlink
```

No se usa `supabase migration repair`. El registro se corrige con el `delete`
explícito de §3, paso 7.

---

## 6. Production

**Production nunca recibió QUALITY-02.** Ni la migración, ni el código, ni
variables. No hay nada que revertir allí, y este documento no autoriza ninguna
operación sobre Production.
