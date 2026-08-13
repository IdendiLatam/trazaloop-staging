> **REEMPLAZADA POR PCR-02.3** — usar `PCR-02.3-PRODUCTION-DEPLOY.md`.

# Trazaloop · PCR-02.2 — Guía de despliegue a Production

**Esta guía sustituye a `docs/PCR-02.1-PRODUCTION-DEPLOY.md`** (que se
conserva como historial). Supuestos: Production = **v1.0.1** (commit
`da36ddf`); la `0104` **no está aplicada en ningún entorno remoto**;
PCR-02.2 será la **primera** versión PCR-02 que llegue a la base de datos;
staging puede seguir pausado; Supabase CLI local puede estar sin `link`;
despliegue **manual**. Nada de esta guía fue ejecutado por el sprint (§57).

## Fase 0 · Auditoría read-only de Production

1. En el SQL Editor de Supabase (Production), confirmar el punto de partida:

   ```sql
   select max(version) from supabase_migrations.schema_migrations;   -- esperado: 0103
   select count(*) from pg_tables  where tablename = 'output_batch_consumption';  -- 0
   select count(*) from pg_trigger where tgname   = 't_production_orders_protect_history';  -- 0
   ```

   Si la `0104` ya aparece aplicada, **detenerse**: esta guía asume su primer
   despliegue; validar qué versión de la 0104 se aplicó antes de continuar.
2. Verificar en Vercel que Production sigue sirviendo v1.0.1.

## Fase 1 · Backup

1. Backup completo (Dashboard → Database → Backups, o `pg_dump`).
2. Guardar las definiciones actuales de las vistas que la 0104 reemplaza:

   ```sql
   select pg_get_viewdef('public.v_output_batch_completeness'::regclass, true);
   select pg_get_viewdef('public.v_implementation_next_actions'::regclass, true);
   ```

   (Son las de 0026/0065; el rollback las restaura desde los archivos del
   repo, pero conservar el texto vivo elimina cualquier duda de drift.)

## Fase 2 · Integración y prechecks locales

1. Integrar el paquete PCR-02.2 en la rama principal de trabajo.
2. `npm ci && npm run typecheck && npm run lint && npm run build` → EXIT 0.
3. `npm run test:all` → EXIT 0 (1493 verificaciones).
4. Con PostgreSQL 16 local (ver `tests/db/README.md`):
   `npm run test:pcr02-2-db` → EXIT 0 (**49 aserciones**, incluye toda la
   matriz PCR-02.1). Esto ejecuta la **0104 real** dos capas antes de
   acercarse a Production.

## Fase 3 · Dry-run en un proyecto Supabase desechable (recomendado)

Aplicar `0001…0104` en un proyecto QA vacío y repetir las verificaciones de
la Fase 5. Detecta cualquier sorpresa de plataforma sin tocar Production.

## Fase 4 · Aplicar la 0104 en Production

Ventana de bajo tráfico. Con CLI (`supabase link` + `supabase db push`) o
pegando `supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql`
completo en el SQL Editor (es idempotente: `if not exists` / `create or
replace` / `drop trigger if exists`). Si se aplica a mano, registrar la fila
`0104` en `supabase_migrations.schema_migrations` para que el historial CLI
no divergea.

## Fase 5 · Validaciones SQL post-migración

```sql
-- §1 tabla + RLS
select count(*) from pg_tables where tablename = 'output_batch_consumption';          -- 1
select count(*) from pg_policies where tablename = 'output_batch_consumption';        -- 4

-- §2/§2b/§2c triggers, todos SECURITY INVOKER (prosecdef = false)
select tgname from pg_trigger
 where tgname in ('t_output_batch_consumption_no_self',
                  't_output_batches_protect_reassignment',
                  't_production_orders_protect_history');               -- 3 filas
select proname, prosecdef from pg_proc
 where proname in ('output_batch_consumption_no_self',
                   'output_batches_protect_reassignment',
                   'production_orders_protect_history');                -- prosecdef = f (×3)

-- §2c conducta (transacción de prueba: se revierte sola)
begin;
  insert into production_orders (id, organization_id, order_code, order_date, status)
  select gen_random_uuid(), id, 'QA-PCR022', current_date, 'closed'
    from organizations limit 1;
  delete from production_orders where order_code = 'QA-PCR022';
  -- esperado: ERROR «Las órdenes cerradas o canceladas no pueden eliminarse…»
rollback;

-- §4 vista fail-closed presente y con contrato intacto (19 columnas)
select count(*) from information_schema.columns
 where table_name = 'v_output_batch_completeness';                      -- 19
select definition ilike '%cycle_edges%' and definition ilike '%truncated_branches%'
  from pg_views where viewname = 'v_output_batch_completeness';          -- true
```

Con datos reales: `select traceability_status, count(*) from
v_output_batch_completeness group by 1;` — los conteos deben ser idénticos a
antes de la migración **salvo** que existan ciclos internos o cadenas de más
de 10 niveles (que ahora aparecerán `incomplete`: es la corrección, no una
regresión — revisarlos manualmente si aparecen).

## Fase 6 · Preview de la app + smoke

Deploy Preview en Vercel apuntando a Production DB (o al proyecto QA de la
Fase 3 para el smoke destructivo). Guion mínimo:

1. Orden cerrada: el detalle muestra «modo consulta / auditoría», **sin**
   botón Eliminar (ni en el listado); Editar visible; al reabrirla
   (Editar → «En proceso») el botón Eliminar reaparece.
2. Orden draft de prueba sin dependencias: se elimina con normalidad.
3. Llamada directa a la API REST de Supabase (token de un admin):
   `DELETE /rest/v1/production_orders?id=eq.<orden cerrada>` → error con el
   mensaje del historial; los consumos siguen existiendo.
4. Completitud: crear en la org de QA un ciclo OP-X⇄OP-Y → ambos lotes
   `incomplete`; una cadena corta legal → `complete`.
5. Regresión PCR-02/PCR-02.1: consumo interno, genealogía, selectores con
   búsqueda, «Registrar consumo» en implementación.

## Fase 7 · Promoción y post-deploy

1. Promocionar el deployment de la app.
2. Repetir el smoke 1–5 en Production real (con datos de prueba propios y
   limpiándolos después; el paso 3 solo lectura + intento de DELETE).
3. Monitoreo 24–48 h: logs de Postgres para errores `23514` del trigger
   (cada uno es un intento real de borrar historial — esperable desde la UI
   vieja solo durante la ventana de la Fase 4→7), y `23505`/`23503` como en
   PCR-02.1.

## Análisis de hot-compatibility (§39)

**¿Puede aplicarse la 0104 antes del nuevo deployment sin romper v1.0.1? Sí.**

* **Trigger §2c**: v1.0.1 permite hoy borrar cualquier orden (con el único
  freno del RESTRICT de salidas). Durante la ventana, un usuario de v1.0.1
  que intente borrar una orden **cerrada/cancelada** recibirá el error del
  trigger (v1.0.1 lo muestra con su mensaje genérico de error de borrado).
  Eso no es una rotura: **la operación bloqueada es exactamente la que nunca
  debió permitirse** — hardening deseado adelantado, no pérdida de
  funcionalidad legítima. Borrar borradores/órdenes en proceso sigue igual.
* **Vista §4**: mismas columnas/tipos; sin consumo interno registrado (no
  existe la tabla §1 en uso hasta el nuevo deploy) no hay ciclos internos ni
  cadenas profundas posibles → `cycle_edges`/`truncated_branches` quedan
  vacías y la semántica coincide con la actual.
* **Tabla §1 + triggers §2/§2b**: inertes hasta que la app nueva los use
  (igual que en el análisis PCR-02.1).

## Rollback

`docs/PCR-02.2-ROLLBACK.md` (sustituye al de PCR-02.1; contempla el trigger
§2c).
