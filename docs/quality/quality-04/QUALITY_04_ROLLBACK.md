# QUALITY-04 · Reversión

**Documentado. NO ejecutar sin una decisión explícita.**

## 1. Casi siempre basta con el nivel 1

QUALITY-04 es **aditivo**: nueve tablas nuevas, y de lo existente solo ensancha
tres CHECK. No modifica datos previos.

## 2. Nivel 1 · Apagar la funcionalidad sin tocar la base

`git revert` del commit de QUALITY-04. La base conserva 0121; las tablas quedan
ahí, con sus datos, sin que nada las lea. **Ningún dato se pierde** y volver a
activar es un despliegue.

Los tipos añadidos a `work_tasks`/`work_alerts`/`work_events` **no** se
revierten: un CHECK más ancho de lo necesario no hace daño, y estrecharlo
fallaría si ya existe alguna fila con un tipo de caso.

## 3. Nivel 2 · Retirar el esquema completo

**Destructivo. Borra todos los casos, hallazgos, causas, acciones,
verificaciones y decisiones.**

No hay `down migration` en el repositorio, y es deliberado: un archivo que borra
nueve tablas y se aplica solo es un accidente esperando.

### 3.1 · Antes: respaldo obligatorio

```bash
pg_dump "$SUPABASE_DB_URL" \
  --table=public.work_cases --table=public.work_case_codes \
  --table=public.work_case_findings --table=public.work_case_causes \
  --table=public.work_case_processes --table=public.work_case_requirements \
  --table=public.work_references --table=public.work_actions \
  --table=public.work_action_codes --table=public.work_action_verifications \
  --table=public.work_decisions \
  > quality-04-backup-$(date +%Y%m%d-%H%M%S).sql
```

> **`work_decisions` merece un párrafo aparte.** Es el **acta** del sistema de
> gestión: qué se decidió, quién y por qué. Borrarla no es revertir una
> funcionalidad, es borrar el registro de las decisiones de una empresa. Si se
> retira el esquema, esa tabla debería conservarse o exportarse antes, aunque
> las demás no.

### 3.2 · El orden importa

```sql
begin;
drop view if exists public.v_work_case_overview;

-- Disparadores y sus funciones (ver §10–§12 y §18 de 0121)
drop trigger if exists work_cases_guard_delete       on public.work_cases;
drop trigger if exists work_actions_guard_delete     on public.work_actions;
drop trigger if exists work_cases_protect_closed     on public.work_cases;
drop trigger if exists work_case_causes_protect      on public.work_case_causes;
drop trigger if exists work_decisions_no_update      on public.work_decisions;
drop trigger if exists work_decisions_no_delete      on public.work_decisions;
drop trigger if exists work_action_verifications_no_update on public.work_action_verifications;
drop trigger if exists work_action_verifications_no_delete on public.work_action_verifications;
drop trigger if exists work_references_validate      on public.work_references;
drop trigger if exists work_cases_reserve_code       on public.work_cases;
drop trigger if exists work_cases_release_code       on public.work_cases;
drop trigger if exists work_actions_reserve_code     on public.work_actions;
drop trigger if exists work_actions_release_code     on public.work_actions;

-- RPC del flujo
drop function if exists public.work_reopen_case(uuid, text);
drop function if exists public.work_close_case(uuid, text);
drop function if exists public.work_case_closure_eligibility(uuid);
drop function if exists public.work_verify_effectiveness(uuid, text, text, text);
drop function if exists public.work_complete_action(uuid, date, text);
drop function if exists public.work_approve_cause(uuid, text, text);
drop function if exists public.work_classify_case(uuid, text, text, text, text, text);
drop function if exists public.work_scan_pending_actions(uuid);
drop function if exists public.work_next_action_code(uuid);
drop function if exists public.work_next_case_code(uuid);
drop function if exists public.work_case_guard(uuid, text[]);
drop function if exists public.work_case_deletion_verdict(uuid);
drop function if exists public.work_action_deletion_verdict(uuid);
drop function if exists public.work_guard_hard_delete();

-- Tablas, de hoja a raíz
drop table if exists public.work_action_verifications;
drop table if exists public.work_decisions;
drop table if exists public.work_case_findings;
drop table if exists public.work_case_causes;
drop table if exists public.work_case_requirements;
drop table if exists public.work_case_processes;
drop table if exists public.work_references;
drop table if exists public.work_action_codes;
drop table if exists public.work_actions;
drop table if exists public.work_case_codes;
drop table if exists public.work_cases;
commit;

delete from supabase_migrations.schema_migrations where version = '0121';
```

### 3.3 · Y hay que restaurar el despachador

`quality_deletion_eligibility` se **reemplazó** en 0121 §18 para conocer
`'case'` y `'action'`. Si se retira 0121 hay que **reemitir la versión de
0120**; borrarla dejaría sin dictamen a indicadores, objetivos, cargos,
documentos y procesos. Está íntegra en
`0120_quality_draft_process_deletion.sql` §2.

## 4. Lo que NO hay que revertir

- **Los tipos añadidos a las primitivas de 0116.** Estrecharlos rompería filas
  existentes.
- **Las listas blancas de migraciones.** Quitar 0121 pondría en rojo diecisiete
  suites sin motivo.

## 5. Lo que no se debe hacer

- **Editar 0121.** Está desplegada en Staging: una migración desplegada no se
  edita, se corrige con otra encima.
- **`migration repair`.** Miente al registro sobre lo que la base tiene.
- **Revertir en Production.** No hay nada que revertir: nunca se aplicó allí.
