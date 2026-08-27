# QUALITY-11.1 · Rollback

## 1 · Apagar el puente sin desplegar nada

El puente solo hace algo si hay **reglas por evento activas**. No las hay hasta
que alguien adopta una de las cuatro plantillas.

```sql
-- una regla por evento deja de reaccionar, conservando su historia
update quality_automation_rules set status = 'inactive' where id = '<regla>';

-- o la empresa entera deja de barrerse y de enrutar
update quality_automation_settings set is_enabled = false
 where organization_id = '<empresa>';
```

Si además se quiere dejar de drenar la cola: no llamar a
`quality_automation_process_events`. El endpoint del planificador lo hace, y el
botón «Procesar hechos pendientes» también; los dos son voluntarios.

## 2 · Deshacer la paridad de GAP-01

Los dos barridos heredados vuelven a su comportamiento anterior si se les
devuelve la guarda de sesión (en una migración nueva, nunca editando la 0131):

```sql
-- 0132, si hiciera falta
create or replace function public.quality_scan_pending_measurements(...)
  -- con  if auth.uid() is null then raise exception 'No autenticado'; end if;
```

Efecto: bajo el planificador volverían a anotarse como omitidos, que es donde
estaban al terminar QUALITY-11.

Y si lo que molesta es que **cedan**: basta con retirar la regla que los releva
(`status = 'inactive'`), y vuelven a emitir. No hace falta tocar código.

## 3 · Revertir el código

```bash
git revert <commit de QUALITY-11.1>
```

Se pierden: el selector «Cuándo mira» del constructor, la columna de origen en
señales, el botón de procesar hechos y la llamada al puente desde el endpoint.
Las tablas y los datos siguen ahí.

**Ojo con el orden**: si se revierte el código pero no la migración, no pasa
nada —el puente simplemente deja de invocarse—. Al revés sí: desplegar código
que llama a `quality_automation_process_events` sin la 0131 aplicada falla.

## 4 · Revertir el esquema

**No se recomienda.** Apagar consigue el mismo efecto sin destruir el linaje.

Si aun así se quisiera, en una migración nueva y en este orden:

```sql
drop trigger  if exists t_quality_customer_feedback_event on public.quality_customer_feedback;
drop function if exists public.quality_customer_feedback_event();
drop function if exists public.quality_automation_process_events(uuid, integer, date);
drop function if exists public.quality_automation_validate_event_version(uuid);
drop table    if exists public.quality_automation_event_deliveries;
drop table    if exists public.quality_automation_event_contracts;
drop table    if exists public.quality_automation_event_catalog;
alter table public.quality_signals drop column if exists source_event_id;
alter table public.quality_automation_rules drop column if exists supersedes_observer;
alter table public.quality_automation_settings drop column if exists events_processed_through;
-- y devolver `quality_automation_run` y `quality_automation_emit` a la 0130
```

El último paso no es opcional: la 0131 extrajo el ejecutor de salidas, y dejar
al motor llamando a una función que ya no existe rompería **todo** el barrido,
no solo el puente.

Las plantillas nuevas se pueden dejar: una plantilla que nadie instancia no hace
nada.

## 5 · Qué NO se pierde nunca

Señales, ejecuciones y acuses de entrega no se borran: un disparador lo impide.
Son la prueba de qué observó la plataforma, por qué, y con qué hecho. Retirar
datos de prueba se hace **lógicamente** —resolver, retirar, apagar—, nunca
aflojando una restricción.
