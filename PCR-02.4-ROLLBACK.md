# PCR-02.4 · Rollback

## App
Re-promover el deployment anterior en Vercel (v1.0.1 o el previo aprobado).
Sin migraciones de datos que revertir en la app.

## Base de datos — solo el structural guard (§2e)
Si hubiera que retirar ÚNICAMENTE la congelación estructural conservando el
resto de PCR-02 (candado histórico incluido):
```sql
drop trigger if exists t_batch_consumption_structural_guard on public.batch_consumption;
drop trigger if exists t_output_batch_consumption_structural_guard on public.output_batch_consumption;
drop trigger if exists t_output_batches_structural_guard on public.output_batches;
drop trigger if exists t_batch_composition_structural_guard on public.batch_composition;
drop trigger if exists t_production_orders_reopen_only_guard on public.production_orders;
drop function if exists public.consumption_structural_guard();
drop function if exists public.output_batches_structural_guard();
drop function if exists public.batch_composition_structural_guard();
drop function if exists public.production_orders_reopen_only_guard();
drop function if exists public.assert_production_order_is_mutable(uuid, uuid);
```
Sin efectos sobre datos: la guarda no escribe ni transforma filas.

## Base de datos — PCR-02 completo
Seguir el rollback de PCR-02.3 (candado histórico y §2a–§2d) tras retirar lo
anterior. El backfill de `history_locked_at` es aditivo; conservar la
columna es seguro.

## Nota
Retirar §2e reabre los bypasses documentados en `PCR-02.4-REVIEW-FIXES.md`
(mutación de estructura de órdenes cerradas por API directa). Solo usarlo
como medida temporal y con la app antigua re-promovida.
