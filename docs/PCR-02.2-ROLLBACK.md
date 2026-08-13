> **REEMPLAZADA POR PCR-02.3** — usar `PCR-02.3-ROLLBACK.md`.

# Trazaloop · PCR-02.2 — Plan de rollback

**Sustituye a `docs/PCR-02.1-ROLLBACK.md`** (conservado como historial).
Principio anti-drift: el repositorio de migraciones NUNCA se reescribe. Si
hay que revertir la base de datos **después** de haber aplicado la 0104, se
hace con una migración **compensatoria** nueva (`0105_revert_pcr02.sql`) —
la excepción técnica justificada que permite un 0105, porque entonces la
0104 ya sería historia aplicada.

## Escenario 1 · La 0104 aún no se aplicó (rollback solo de app)

Camino por defecto y el único necesario en la mayoría de incidentes:
re-deploy del build v1.0.1 (`da36ddf`) en Vercel. La base de datos sigue en
0103; no hay nada que revertir en ella.

## Escenario 2 · 0104 aplicada, app nueva con problemas

Re-deploy de v1.0.1 **dejando la 0104 en la base**. Es seguro por el
análisis §39 (guía de despliegue): la tabla §1 y los triggers §2/§2b quedan
inertes, la vista conserva el contrato y el trigger §2c solo bloquea la
operación que nunca debió permitirse. No escribir migraciones compensatorias
para este caso.

## Escenario 3 · Reversión real de la base de datos

Solo si un incidente exige retirar los objetos PCR-02. Crear
`supabase/migrations/0105_revert_pcr02.sql` con, **en este orden** (inverso
a las dependencias):

```sql
-- 1) Trigger de historial (PCR-02.2 §2c) — primero: no depende de nada,
--    pero debe salir antes de tocar las tablas que protege.
drop trigger if exists t_production_orders_protect_history on public.production_orders;
drop function if exists public.production_orders_protect_history();

-- 2) Vistas: restaurar las definiciones previas COPIÁNDOLAS de los archivos
--    históricos del repo (idénticas a las de Production pre-0104):
--    · v_implementation_next_actions ← 0065 (definición íntegra)
--    · v_output_batch_completeness  ← 0026 (definición íntegra)
--    (create or replace view …)

-- 3) Triggers PCR-02.1 sobre la genealogía interna:
drop trigger if exists t_output_batches_protect_reassignment on public.output_batches;
drop function if exists public.output_batches_protect_reassignment();
drop trigger if exists t_output_batch_consumption_no_self on public.output_batch_consumption;
drop function if exists public.output_batch_consumption_no_self();

-- 4) Tabla de consumo interno (última: los triggers anteriores la referían).
--    ADVERTENCIA: destruye la genealogía interna registrada tras el deploy.
--    Antes de ejecutar: select count(*) from public.output_batch_consumption;
--    y exportar las filas si el conteo es > 0.
drop table if exists public.output_batch_consumption;
```

Después del rollback de BD, verificar:

```sql
select count(*) from pg_trigger
 where tgname in ('t_production_orders_protect_history',
                  't_output_batches_protect_reassignment',
                  't_output_batch_consumption_no_self');                -- 0
select count(*) from pg_tables where tablename = 'output_batch_consumption';  -- 0
select count(*) from information_schema.columns
 where table_name = 'v_output_batch_completeness';                      -- 19 (0026)
```

y hacer una pasada por `/traceability` con v1.0.1: listado, detalle de
orden, completitud e implementación deben verse como antes del sprint.
**Nota**: tras este escenario, borrar órdenes cerradas vuelve a ser posible
(el estado pre-PCR-02.2); tratarlo como ventana de riesgo y re-aplicar el
hardening en cuanto el incidente se resuelva.

## Qué NO hacer

* No editar la 0104 ya aplicada ni borrarla del historial de migraciones.
* No usar `supabase migration repair` para "olvidar" la 0104 sin haber
  ejecutado la compensatoria.
* No hacer `drop … cascade` genéricos: el orden explícito de arriba evita
  arrastres accidentales.
