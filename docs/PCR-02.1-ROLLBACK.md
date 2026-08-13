# Trazaloop · PCR-02.1 — Plan de rollback

> **SUSTITUIDO POR PCR-02.2** — la guía vigente es `docs/PCR-02.2-ROLLBACK.md` (incorpora el trigger de protección del historial de órdenes y la completitud fail-closed). Este documento se conserva como historial del sprint PCR-02.1.


Actualiza el plan PCR-02: la 0104 corregida añade **dos** triggers (el
anti-autoconsumo y el §2b de reasignación) y reemplaza **dos** vistas
(completitud e implementación). La tabla nueva acumula datos de negocio tras
el despliegue: revertir el esquema los pierde. Camino por defecto: **revertir
solo la aplicación**.

## 0. Rollback de la aplicación (por defecto)

Revertir el deploy a v1.0.1 (Vercel → redeploy anterior / revert del merge).
La app v1.0.1 funciona con la 0104 aplicada (ver «Compatibilidad en
caliente» de la guía de despliegue). Los consumos internos registrados
permanecen intactos para el re-despliegue. Ningún dato queda inconsistente.

## 1. Política anti-drift (sin cambios)

- Solo falla la app → paso 0 y dejar la 0104 aplicada.
- Reversión de ESQUEMA → **migración compensatoria 0105+** escrita en ese
  momento con el contenido del §2 (jamás SQL manual salvo emergencia, y
  reconciliar de inmediato con la 0105 equivalente).
- Nunca eliminar/renumerar el archivo 0104 (candados de 7 suites).
- La 0105 compensatoria NO se crea ahora: no existe un rollback real.

## 2. Contenido de la reversión de esquema (solo si se decide)

⚠ `drop table` elimina los consumos internos registrados. Exportar antes:

```sql
copy (select * from public.output_batch_consumption) to stdout with csv header;
```

En la migración compensatoria (orden importante):

```sql
-- 1) Restaurar las vistas con sus definiciones ANTERIORES:
--    · v_implementation_next_actions → bloque completo del archivo
--      supabase/migrations/0065_implementation_next_action_support_language.sql
--    · v_output_batch_completeness → bloque del archivo
--      supabase/migrations/0026_traceability_views.sql
--    (restaurar las vistas PRIMERO: dejan de referenciar la tabla)

-- 2) Retirar la protección de reasignación (§2b, nuevo en PCR-02.1)
drop trigger if exists t_output_batches_protect_reassignment on public.output_batches;
drop function if exists public.output_batches_protect_reassignment();

-- 3) Retirar el consumo interno
drop trigger if exists t_output_batch_consumption_no_self on public.output_batch_consumption;
drop function if exists public.output_batch_consumption_no_self();
drop table if exists public.output_batch_consumption;
```

Las políticas RLS y los triggers estándar caen con la tabla.

Reversión parcial (conservar la tabla, restaurar solo vistas): la app
PCR-02.1 sigue funcionando; reaparecen el falso negativo de completitud y la
recomendación errónea de Implementación que este sprint corrige.

## 3. Reversión funcional selectiva (sin tocar BD)

- **Solo la alerta 72 h**: constante de dominio
  (`lib/domain/production-alerts.ts`).
- **Solo las guardas de estado**: revertir los bloques PCR-02.1 de
  `server/actions/traceability.ts` (cambio de app; el §2b de BD seguiría
  protegiendo la reasignación).
- **Solo los selectores acotados**: revertir las páginas de detalle y
  genealogía (cambio de app; las funciones de búsqueda no estorban).

## 4. Qué NO revertir

Migraciones 0001–0103 (no fueron modificadas); datos existentes (PCR-02.1 no
alteró ninguna fila; jamás ejecutar UPDATE/DELETE «compensatorios»).

## 5. Verificación post-rollback de esquema

```sql
select count(*) from information_schema.tables
 where table_name = 'output_batch_consumption';                          -- 0
select count(*) from pg_proc
 where proname in ('output_batch_consumption_no_self',
                   'output_batches_protect_reassignment');               -- 0
select * from public.v_output_batch_completeness limit 1;                -- responde
select * from public.v_implementation_next_actions limit 1;              -- responde
update public.output_batches set storage_location = storage_location
 where false;                                                            -- sin trigger §2b
```

Smoke mínimo: listado de órdenes, un lote producido, un consumo externo,
Implementación y Textiles.
