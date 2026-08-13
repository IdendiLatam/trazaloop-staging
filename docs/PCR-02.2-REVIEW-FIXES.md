# Trazaloop · PCR-02.2 — Correcciones del micro-sprint final

Base oficial: `trazaloop-sprint-PCR-02.1.zip` (verificado byte a byte contra
el árbol de trabajo: 0 diferencias). La 0104 sigue inédita en todos los
entornos → las correcciones viven **en la propia 0104** (sin 0105). Diff
mínimo; todo PCR-02.1 conservado.

## Tabla de hallazgos

| Hallazgo | Reproducido | Causa | Corrección | Test |
| -------- | ----------- | ----- | ---------- | ---- |
| **A** · Una orden `closed`/`cancelled` puede eliminarse, arrastrando consumos históricos por cascada | **SÍ — evidencia dura en PostgreSQL real**: se creó una orden cerrada con un consumo externo (sin salidas, para esquivar el RESTRICT), se ejecutó `DELETE` con éxito; el consumo pasó de 1 a **0 filas** (cascada silenciosa) | (i) `deleteProductionOrderAction` solo validaba sesión + acceso comercial. (ii) `batch_consumption → production_orders` es **ON DELETE CASCADE** (0025) y `output_batch_consumption → production_orders` también (0104 §1) — correcto para limpiar borradores, letal para historial. (iii) `output_batches` es RESTRICT: solo protegía órdenes CON salidas. (iv) La RLS DELETE (admin/quality) no distingue estados. (v) Botón «Eliminar» visible en detalle y listado | **Tres capas**: (1) `orderDeletionBlockedMessage(status)` en `lib/domain/production-alerts.ts` (política pura documentada: draft/in_progress conservan su comportamiento; closed/cancelled jamás) usada por `deleteProductionOrderAction` **antes** del delete, con el `23514` del trigger traducido al mismo mensaje; (2) UI: «Eliminar» oculto en detalle y listado para historial («Editar» permanece: es la vía para reabrir); (3) **0104 §2c**: trigger `t_production_orders_protect_history` BEFORE DELETE, `SECURITY INVOKER`, solo lee OLD, estados reales, mensaje «Las órdenes cerradas o canceladas no pueden eliminarse: forman parte del historial de trazabilidad.» — al abortar ANTES del borrado, **ninguna cascada llega a arrancar** | PostgreSQL real: **S7.A1–A7** (draft e in_progress eliminables; closed/cancelled fallan por igual; con consumo externo/interno nada se pierde — §14 no-cascada; bypass con rol `authenticated` + RLS). Suite `pcr02-2`: A.1 matriz pura ejecutada, A.2 guarda antes del delete, A.3 UI, A.4 trigger |
| **B1** · Un ciclo interno puro se clasifica `complete` | **SÍ — evidencia dura**: OP-C1⇄OP-C2 sin ningún lote externo, con composición → ambos lotes **`complete`** en la vista PCR-02.1 | En `closure_flags`, `bool_and(coalesce(ex.all_have_supplier, true))`: las órdenes de un ciclo puro no tienen consumo externo → agregado NULL → `coalesce(NULL, true)` = satisfecho; el `path` **omitía** el salto cíclico (protección operacional) sin **registrarlo** (evidencia semántica) | **0104 §4 fail-closed**: nueva CTE `cycle_edges` registra todo salto que volvería a una orden del camino; `chain_supplier_ok`/`chain_material_ok` exigen además `not exists(cycle_edges)` → una rama cíclica jamás demuestra procedencia. Decisión §25 documentada: el ciclo invalida **aunque exista una rama externa válida en paralelo**. Señales internas al CTE; columnas públicas intactas (§23) | PostgreSQL real: **S8.B4+B5** (ciclo puro con composición → incomplete), **S8.B6** (ciclo mixto → incomplete), **S8.R1** (regresión demostrada: la fórmula PCR-02.1 daba `true` sobre esos mismos datos) |
| **B2** · Un recorrido truncado por profundidad se clasifica `complete` | **SÍ — evidencia dura**: cadena de 13 órdenes con la raíz externa a 12 saltos (límite 10) → el lote final **`complete`** en la vista PCR-02.1 | Al frenar la recursión en la profundidad 10, las órdenes más lejanas (incluida la raíz) quedan fuera del cierre; el resto del cierre «no muestra problema» y `coalesce(NULL, true)` completa el falso positivo — se confundió «no seguir recorriendo» con «procedencia demostrada» (§21) | **0104 §4**: nueva CTE `truncated_branches` (órdenes alcanzadas EN el límite que aún tienen consumo interno por seguir); `chain_*_ok` exige `not exists(truncated_branches)`. La protección operacional (`depth < 10`, `path`) se conserva intacta (§20/§30) | PostgreSQL real: **S8.B8** (raíz fuera del límite → incomplete), **S8.B7** (raíz a 8 saltos → complete: sin sobre-corrección), **S8.R2** (regresión demostrada) |

## Demostraciones «rojo antes / verde después» (§52)

Las tres reproducciones se ejecutaron **sobre PCR-02.1 sin modificar** antes
de tocar código (transcritas en el reporte del chat):

| Bug | Rojo (PCR-02.1) | Verde (PCR-02.2) |
| --- | ---------------- | ---------------- |
| DELETE de orden cerrada | `A-despues: orden existe = 0 · consumos historicos = 0` (borrada CON su historia) | S7.A3/A5: el DELETE falla con el mensaje pactado y consumo + lote de entrada sobreviven |
| Ciclo interno puro | `OUT-C1 -> complete · OUT-C2 -> complete` | S8.B4: ambos `incomplete`; S8.R1 fija que la fórmula vieja daba `true` |
| Raíz fuera del límite | `OUT-1 (raiz a 12 saltos) -> complete` | S8.B8: `incomplete`; S8.B7 la cadena legal sigue `complete`; S8.R2 fija la fórmula vieja |

## Qué NO se tocó (§30–35, §47–50)

Detector transaccional global de ciclos: **fuera de alcance** (decisión
conservada; el autoconsumo directo sigue bloqueado y la completitud ahora es
fail-closed). Trigger anti-autoconsumo, protección de reasignación,
selectores acotados, vista de implementación, PCR-01.1, Textiles, textos
legales y `package.json` (`"1.0.0"`): intactos, con candados en la suite
`pcr02-2` (C.1–C.3).
