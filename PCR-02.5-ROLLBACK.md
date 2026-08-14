# PCR-02.5 / PCR-02.5.1 · Rollback

## ROLLBACK APP
Re-promover el deployment anterior (PCR-02.4). Sin datos que revertir.
Compatible con la 0105 aplicada (ver ventana de la guía de deploy).

## ROLLBACK DB — quirúrgico (conservando el resto de PCR-02.x)
```sql
-- Guardas de saldo y pisos
drop trigger if exists t_batch_consumption_total_balance_guard on public.batch_consumption;
drop trigger if exists t_output_batch_consumption_total_balance_guard on public.output_batch_consumption;
drop trigger if exists t_input_batches_total_balance_guard on public.input_batches;
drop trigger if exists t_output_batches_total_balance_guard on public.output_batches;
drop function if exists public.batch_consumption_total_balance_guard();
drop function if exists public.output_batch_consumption_total_balance_guard();
drop function if exists public.input_batches_total_balance_guard();
drop function if exists public.output_batches_total_balance_guard();
-- Vistas de inventario
drop view if exists public.v_material_inventory;
drop view if exists public.v_output_batch_inventory;
drop view if exists public.v_input_batch_inventory;
-- Cantidad producida: volver a opcional (solo si de verdad hay que retroceder)
alter table public.output_batches alter column produced_quantity_kg drop not null;
```

### Implicaciones — leer antes de ejecutar
- **No hay pérdida de datos**: la 0105 no escribe ni transforma filas; los
  consumos creados con las guardas activas son datos VÁLIDOS y coherentes
  y permanecen intactos tras el rollback.
- Retirar las guardas **reabre** el sobreconsumo y las carreras: consumos
  posteriores al rollback pueden volver a dejar saldos negativos que, al
  re-aplicar la 0105, NO bloquean la migración (el preflight solo audita
  `produced_quantity_kg`) pero sí dejarán lotes con disponible negativo en
  las vistas. Tratarlo como medida temporal con la app PCR-02.4 re-promovida.
- `drop not null` solo si el retroceso de la app lo exige (la app PCR-02.4
  tolera la columna NOT NULL sin cambios: nunca escribe NULL salvo cantidad
  vacía, que pasaría a error). Si se retira, re-aplicar exigirá pasar de
  nuevo el preflight.
- La UI PCR-02.5 REQUIERE las vistas: no dejar app nueva + BD revertida.

## Nota PCR-02.5.1 / PCR-02.5.2
Los preflights y el LOCK viven DENTRO de la 0105 y no crean objetos
propios: el rollback anterior no cambia. La 0105 no contiene transaction
control top-level (PCR-02.5.2): la atomicidad la pone el runner (Supabase
CLI o `psql --single-transaction`), de modo que si la migración abortó por
preflight no hay nada que revertir — demostrado en el arnés (tras el abort
no existen ni vistas ni triggers y el dato legacy queda intacto).

## Rollback de PCR-02.x completo
Encadenar después los rollbacks documentados de PCR-02.4 → 02.3 → … (cada
uno en su guía). El candado histórico es aditivo y seguro de conservar.
