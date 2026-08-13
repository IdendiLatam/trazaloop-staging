# PCR-02.4 · Implementation Report — Closed Order Structural Guard

## Invariantes finales de PCR-02 (§71)
1. **Historical lock** (PCR-02.3): una orden que alguna vez fue finalizada
   jamás puede eliminarse (`history_locked_at` irreversible, §2c/§2d).
2. **Structural freeze** (este sprint): mientras esté `closed`/`cancelled`,
   su estructura de trazabilidad no puede modificarse.
3. **Explicit reopen**: para corregirla hay que reabrirla; la reapertura es
   una transición PURA de estado y el candado histórico permanece.

## Arquitectura de la guarda (defensa en tres capas)
- **PostgreSQL (fuente de verdad, §13/§17)** — `0104` §2e:
  - `assert_production_order_is_mutable(order_id, organization_id)`:
    SECURITY INVOKER, `search_path = public`, acotada a la organización de
    la fila (si la orden es de otra organización no se encuentra y no
    bloquea: existencia y tenant son responsabilidad de FK compuestas y
    RLS — sin oracle cross-tenant, §15/§52). Si la orden está
    `closed`/`cancelled` lanza 23514 con el mensaje uniforme (§16):
    «La orden está cerrada o cancelada. Reábrela antes de modificar su
    trazabilidad.» EXECUTE concedido a `authenticated` (los triggers
    INVOKER la ejecutan como el rol que escribe) y revocado a `public`/`anon`.
  - Triggers BEFORE INSERT/UPDATE/DELETE (fail-closed, una función por
    semántica — §53, sin refactor masivo):
    `t_batch_consumption_structural_guard` y
    `t_output_batch_consumption_structural_guard` comparten
    `consumption_structural_guard()` (valida la orden del OLD y la del NEW:
    cubre también mover el consumo de orden);
    `t_output_batches_structural_guard` (INSERT/DELETE siempre; UPDATE solo
    si cambian campos estructurales — y al cambiar de orden valida origen y
    destino); `t_batch_composition_structural_guard` (resuelve la orden vía
    el lote del OLD y del NEW, §21–§22);
    `t_production_orders_reopen_only_guard` (§26–§28: sobre una cerrada solo
    la transición pura a `in_progress`; la comparación `to_jsonb` excluye
    `status`, `updated_at` e `history_locked_at`, de modo que §2c y el
    backfill de la propia 0104 siguen operando).
  - Orden de triggers (§54): los BEFORE de una misma tabla disparan en orden
    alfabético — en `output_batches`, `…protect_reassignment` (§2b) precede a
    `…structural_guard`; en `production_orders`, `…history_lock` (§2c)
    precede a `…reopen_only_guard` y el DELETE pasa por `…protect_history`
    (§2d). Cualquier error estructural aborta ANTES de FK, cascadas y
    escritura de auditoría; los intentos bloqueados no generan registros de
    negocio falsos (§55).
- **Server actions** (mensajes de dominio, sin SQL crudo, §48):
  `updateBatchConsumptionAction` ahora resuelve la orden del consumo y exige
  `assertOrderAcceptsMutations`; `add/update/deleteBatchCompositionAction`
  usan el nuevo helper `assertOutputBatchOrderAcceptsMutations` (delega en
  la guarda central, §7); `updateOutputBatchAction` distingue
  `structuralChange` (orden/producto/cantidad/código) y lo veta sobre
  cerradas, conservando la regla PCR-02.1 de reasignación (lote consumido +
  ambas órdenes mutables). Los ocho mutadores PCR-02.1 conservan su guarda.
- **UI** (§12/§49/§50): el detalle de la orden ya operaba en modo
  consulta/auditoría al estar cerrada (PCR-02/02.1, con botón «Reabrir»).
  En `/traceability/output-batches`, si la orden productora está cerrada:
  se ocultan «Eliminar» del lote, el alta de composición y el borrado de
  filas de composición, con un aviso de modo auditoría que invita a reabrir;
  consulta, navegación, genealogía y dossier permanecen. «Editar» permanece
  visible porque los campos DESCRIPTIVOS siguen siendo corregibles; los
  estructurales los vetan la server action y el trigger con mensaje claro.

## Política estructural/descriptiva del lote producido (§10/§47)
- **Estructurales (congelados con la orden cerrada):** `production_order_id`
  (genealogía), `product_id` (producto), `produced_quantity_kg`
  (masa/balance), `batch_code` (identidad con la que el lote aparece en
  genealogía y dossier).
- **Descriptivos (corregibles siempre):** `produced_date`,
  `characteristics`, `intended_application`, `storage_location`, `notes` —
  auditados por `t_audit_output_batches` (0025); S10.3 verifica el registro
  en `audit_log`.

## Reapertura y recierre (§23–§25, §29–§30)
`reopenProductionOrderAction` sigue siendo el mecanismo de UI y ya emitía la
transición pura (`update { status: 'in_progress' }`). Un usuario autorizado
que reabra por API directa solo lo consigue con esa misma sentencia pura: el
trigger rechaza combinar la reapertura con cambios productivos. Tras
reabrir, las mutaciones vuelven según rol/RLS/organización (S10.6 las
ejecuta de verdad); `history_locked_at` no cambia y el DELETE sigue vetado.
El recierre congela de inmediato conservando la fecha original del candado
(S10.7). `cancelled` congela exactamente igual y, si se reabre, recupera la
mutabilidad (S10.9 + S10.6 por simetría de estados en la guarda).

## Migración (§5/§58)
`0001–0103` intactas; TODO el cambio vive en la `0104` (aún no desplegada);
no existe `0105`; sin backfills nuevos (§57); sin tocar Production. La 0104
conserva íntegros: tabla y FK de consumo interno, RLS, anti-autoconsumo,
guarda de reasignación, candado histórico + backfill, delete histórico,
completitud fail-closed (`cycle_edges`, `truncated_branches`, profundidad
10), next actions, grants, índices y verificaciones (§31–§35).

## Hot compatibility (§56)
Production sigue en v1.0.1. Aplicar la 0104 (PCR-02.4) antes del deploy de
la app es seguro para todos los flujos correctos: la app vieja no ofrece
mutaciones sobre órdenes cerradas en sus pantallas normales. Si algún
cliente antiguo intentara igualmente escribir estructura de una orden
cerrada (API directa o pantalla desactualizada), recibirá el error 23514
con el mensaje funcional — hardening deliberado de una operación que ya era
conceptualmente incorrecta. La ventana recomendada sigue siendo
migración → deploy inmediato.

## Archivos tocados
`supabase/migrations/0104_…` (§2e + verificaciones §5) ·
`server/actions/traceability.ts` (helper + 5 acciones) ·
`lib/db/traceability.ts` (status de la orden productora en OutputBatch) ·
`app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx` (congelación UI) ·
`tests/db/pcr02_4_assertions.sql` (nuevo, S10.1–S10.9) ·
`tests/db/run-local-pg.sh` (7/7) ·
`tests/db/pcr02_1_assertions.sql` y `pcr02_2_assertions.sql` (fixtures a
ciclo realista) · `tests/unit/pcr02-4-hardening.test.ts` (nuevo) ·
`package.json` (solo scripts) · documentación PCR-02.4 + banner en la guía
de deploy PCR-02.3.
