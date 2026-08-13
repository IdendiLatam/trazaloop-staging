# PCR-02.4 · Review Fixes — Closed Order Structural Guard

Base: `trazaloop-sprint-PCR-02.3.zip` (verificado byte a byte: 0 diferencias).
Regla del sprint: mientras una orden esté `closed`/`cancelled`, su estructura
de trazabilidad está congelada; se corrige reabriendo explícitamente. El
candado histórico (PCR-02.3) permanece en todos los casos.

| Hallazgo | Reproducido | Causa | Corrección | Test |
| --- | --- | --- | --- | --- |
| 1 · `updateBatchConsumptionAction` edita masa/notas de consumos de una orden cerrada sin guarda | ✅ Código: 0 llamadas a `assertOrderAcceptsMutations` en la acción. BD: `UPDATE batch_consumption SET mass_kg 100→70` sobre orden CLOSED fue **permitido** (bug B de la evidencia) | La acción escribe directo tras `checkCprCanMutate` (rol), sin consultar el estado de la orden; en BD ninguna tabla hija validaba `production_orders.status` | La acción resuelve `production_order_id` del consumo y exige `assertOrderAcceptsMutations`; en BD, trigger `t_batch_consumption_structural_guard` (§2e) | S10.1 (matriz §38), unit S2 |
| 2 · Bypass Supabase REST/RLS: INSERT/UPDATE/DELETE directos sobre estructura de órdenes cerradas | ✅ BD real: INSERT consumo (bug A), UPDATE composición 95→10 (bug C), INSERT consumo interno (bug D), UPDATE cantidad del lote 95→40 (bug E), DELETE composición (bug F) — todos **permitidos** sobre orden CLOSED antes del fix | Las RLS validan tenant+rol pero no estado; las server actions eran la única guarda de estado y PostgREST las esquiva | Guarda de dominio `assert_production_order_is_mutable` (SECURITY INVOKER, search_path fijo, acotada por organización, mensaje uniforme, 23514) + triggers BEFORE I/U/D en `batch_consumption`, `output_batch_consumption`, `output_batches` y `batch_composition` | S10.1–S10.4 y S10.8 (bajo `set local role authenticated` con claims de admin) |
| 3 · `add/update/deleteBatchCompositionAction` mutan composición de lotes de órdenes cerradas | ✅ Código: 0 guardas en las tres acciones; BD: bugs C y F | La composición nunca resolvía su orden productora (`batch_composition → output_batches → production_orders`) | Helper `assertOutputBatchOrderAcceptsMutations` (delega en la guarda central, §7: sin duplicar state logic) en las tres acciones; trigger `t_batch_composition_structural_guard` que valida el lote del OLD **y** del NEW (cubre mover composición, §22) | S10.4, unit S10–S12 |
| 4 · `updateOutputBatchAction` permite cambiar cantidad/producto/código de un lote de orden cerrada | ✅ Código: la guarda PCR-02.1 solo corría al **cambiar de orden**; BD: bug E | La política PCR-02.1 trataba cantidad/producto/código como descriptivos | Política §10/§47: **estructurales** = orden productora, producto, cantidad producida, código (identidad en genealogía/dossier) → exigen orden mutable en la acción y en el trigger `t_output_batches_structural_guard`; **descriptivos** = fecha de producción, características, aplicación, almacenamiento, notas → corregibles siempre y auditados por `t_audit_output_batches` (0025) | S10.3 (bloqueos + corrección descriptiva auditada), unit S9 |
| 5 · `UPDATE production_orders` directo puede reabrir y reescribir en una sentencia (§26) | ✅ Por diseño previo: ninguna barrera BD sobre campos de una orden cerrada | La reapertura explícita solo existía como server action | Trigger `t_production_orders_reopen_only_guard`: sobre `closed`/`cancelled` solo se admite la transición **pura** a `in_progress` (comparación `to_jsonb` excluyendo `status`, `updated_at`, `history_locked_at` — así el candado §2c y el backfill siguen operando); editar campos, reabrir+reescribir o pasar a `draft` fallan | S10.5, S10.6 |

Bugs no reproducidos (§60): ninguno — los cinco hallazgos de la revisión se
reprodujeron con evidencia (código y/o PostgreSQL real) antes de corregir.

Evidencia roja (resumen, PostgreSQL 16 local sobre la 0104 previa al fix):
`bugA INSERT batch_consumption sobre CERRADA → permitido · bugB UPDATE 100→70
→ permitido · bugC UPDATE composición 95→10 → permitido · bugD INSERT consumo
interno → permitido · bugE UPDATE cantidad lote 95→40 → permitido · bugF
DELETE composición → permitido` (fixture con ciclo realista abierta→construir
→cerrar, revertido con rollback intencional).
