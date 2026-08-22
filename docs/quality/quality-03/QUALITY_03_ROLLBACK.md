# QUALITY-03 · Reversión

**Documentado. NO ejecutar sin una decisión explícita.**

---

## 1. Antes de nada: casi nunca hace falta

QUALITY-03 es **aditivo**. No modifica ninguna tabla previa salvo para ensanchar
dos CHECK de tipo en `work_tasks` y `work_alerts`, y ensanchar un CHECK no
invalida ninguna fila existente. No borra datos, no cambia columnas y no toca
0116 ni anteriores.

En la práctica hay tres reversiones distintas, de menor a mayor daño. **Elegir la
más pequeña que resuelva el problema.**

---

## 2. Nivel 1 · Apagar la funcionalidad sin tocar la base

El más seguro y casi siempre el correcto.

Quality entero está tras `QUALITY_MODULE_ENABLED`. Si el problema es que
Objetivos e Indicadores no debe verse, basta con **desplegar el commit anterior**
(`a73a514`, el HEAD aprobado de QUALITY-02):

```bash
git revert --no-commit 860d9c8 95a659b bf880d3 468de29
```

La base conserva 0117 y 0118. Las tablas quedan ahí, vacías o con datos, sin
que nada las lea. **Ningún dato se pierde** y volver a activar es un despliegue.

> Las tablas de QUALITY-03 no las lee ningún código de QUALITY-01/02, así que
> dejarlas presentes no tiene efecto observable.

---

## 3. Nivel 2 · Revertir solo 0118

Si el endurecimiento de privilegios rompiera algo —no debería: retira privilegios
que ningún código usa, porque toda escritura pasa por RPC `security definer`—:

```sql
grant insert, update, delete on table
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events
to authenticated;

grant update on table public.quality_measurement_evidence to authenticated;
```

Devuelve privilegios que nada usa: **la RLS seguiría bloqueando igual**, porque
esas tablas no tienen política de escritura. Lo único que se pierde es la
segunda capa de defensa, y las pruebas `G5` y `X2` volverían a fallar contra
Staging.

Es la reversión menos útil que existe. Está documentada por completitud.

---

## 4. Nivel 3 · Retirar el esquema completo

**Destructivo. Borra todos los objetivos, indicadores, metas y mediciones.**

No hay `down migration` en el repositorio, y es deliberado: un archivo que borra
diez tablas y que se aplica solo es un accidente esperando. Si de verdad hay que
hacerlo, se escribe en el momento, se revisa y se aplica a mano.

### 4.1 · Antes: respaldo obligatorio

```bash
pg_dump "$SUPABASE_DB_URL" \
  --table=public.quality_objectives \
  --table=public.quality_objective_processes \
  --table=public.quality_objective_indicators \
  --table=public.quality_indicators \
  --table=public.quality_indicator_configs \
  --table=public.quality_measurements \
  --table=public.quality_measurement_evidence \
  --table=public.quality_calculation_runs \
  --table=public.quality_period_closures \
  --table=public.work_events \
  > quality-03-backup-$(date +%Y%m%d-%H%M%S).sql
```

### 4.2 · El orden importa

Las dependencias se retiran de fuera hacia dentro. Al revés, cada `drop` falla:

```sql
begin;

-- 1 · Vistas (dependen de las tablas)
drop view if exists public.v_quality_objective_performance;
drop view if exists public.v_quality_indicator_status;

-- 2 · Disparadores y sus funciones
--     (los cinco de 0117 §19; ver la migración para los nombres exactos)

-- 3 · RPC públicas
drop function if exists public.quality_reopen_period(uuid, date, date, text);
drop function if exists public.quality_close_period(uuid, date, date, text);
drop function if exists public.quality_scan_pending_measurements(uuid);
drop function if exists public.quality_correct_measurement(uuid, numeric, text);
drop function if exists public.quality_run_indicator_calculation(uuid, date, date);
drop function if exists public.quality_record_measurement(uuid, date, date, numeric, text, jsonb, text);
drop function if exists public.quality_publish_indicator_config(...);

-- 4 · Auxiliares del motor
drop function if exists public.quality_emit_performance_signals(...);
drop function if exists public.quality_compute_calculated(...);
drop function if exists public.quality_validate_calc_definition(jsonb);
drop function if exists public.quality_native_source_value(uuid, text, date, date);
drop function if exists public.quality_native_source_keys();
drop function if exists public.quality_indicator_owner_profile(uuid);
drop function if exists public.quality_config_for_period(uuid, date, date);
drop function if exists public.quality_period_is_closed(uuid, uuid, date, date);
drop function if exists public.quality_previous_period(text, date);
drop function if exists public.quality_period_bounds(text, date);
drop function if exists public.quality_evaluate_value(...);
drop function if exists public.quality_fmt_number(numeric);
drop function if exists public.quality_measurement_guard(...);

-- 5 · Tablas, de hoja a raíz
drop table if exists public.quality_measurement_evidence;
drop table if exists public.quality_measurements;
drop table if exists public.quality_calculation_runs;
drop table if exists public.quality_period_closures;
drop table if exists public.quality_objective_indicators;
drop table if exists public.quality_indicator_configs;
drop table if exists public.quality_indicators;
drop table if exists public.quality_objective_processes;
drop table if exists public.quality_objectives;
drop table if exists public.work_events;

commit;
```

### 4.3 · Lo que NO se debe revertir

**`current_org_role()`** (0117 §0) se comparte: `trazadoc_current_org_role`
delega en ella desde este sprint. Borrarla **rompe el control documental de
QUALITY-02**. Se queda.

**Los CHECK ensanchados** de `work_tasks` y `work_alerts`. Estrecharlos de nuevo
fallaría si existe alguna fila con un tipo de indicador, y esas filas son
historia real de la bandeja. Un CHECK más ancho de lo necesario no hace daño.

**`work_events`** merece un párrafo aparte: es append-only y es la bitácora de
lo que pasó. Borrarla no es revertir una funcionalidad, es borrar un registro
histórico. Si se retira el esquema, esa tabla debería conservarse o exportarse
antes.

### 4.4 · Después

```sql
delete from supabase_migrations.schema_migrations where version in ('0117','0118');
```

Sin esto, el CLI cree que las migraciones están aplicadas y no las volvería a
aplicar.

---

## 5. Qué NO hay que hacer nunca

- **Editar 0117 o 0118.** Están desplegadas. Una migración desplegada no se
  edita: se corrige con otra encima. 0118 existe precisamente por eso.
- **`migration repair`.** Miente al registro sobre lo que la base tiene.
- **Revertir en Production.** No hay nada que revertir: nunca se aplicó allí.
