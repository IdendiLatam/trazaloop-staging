# Trazaloop · PCR-02.3 — Historical Lock + reapertura explícita

Base oficial: `trazaloop-sprint-PCR-02.2.zip` (verificado byte a byte contra
el árbol de trabajo: 0 diferencias). La 0104 sigue inédita en todos los
entornos → la corrección vive **en la propia 0104** (sin 0105). Diff mínimo;
todo PCR-02.1/PCR-02.2 conservado.

## Tabla del hallazgo

| Hallazgo | Reproducido | Causa | Corrección | Test |
| -------- | ----------- | ----- | ---------- | ---- |
| **Bypass de reapertura**: `closed → reopen (UPDATE de estado) → DELETE` vuelve eliminable una orden histórica, arrastrando sus consumos por cascada | **SÍ — evidencia dura en PostgreSQL real sobre PCR-02.2 sin modificar**: paso 1 el DELETE con la orden `closed` fue **rechazado** por el trigger PCR-02.2 (error visible en la transcripción); paso 2 el `UPDATE status='in_progress'` (la reapertura implícita vía «Editar») fue **permitido**; paso 3 el DELETE de la MISMA orden **funcionó**: `orden existe = 0`, `consumos historicos = 0` | Toda la protección PCR-02.2 (server action, UI y trigger BEFORE DELETE) dependía del **estado presente** (`OLD.status`): al reabrir, la orden deja de estar en `closed/cancelled` y la barrera ya no sabe que alguna vez fue historial. Además, la reapertura era implícita (el formulario genérico permite cambiar el estado libremente), sin distinción entre «corregir» y «volver a ser borrable» | **Candado histórico persistente** (opción B, justificada en el informe): (1) **0104 §2c** — columna `production_orders.history_locked_at` (semántica: PRIMERA entrada en closed/cancelled; nunca «último cierre») + backfill en dos pasos con evidencia inequívoca (estado actual y `audit_log.diff`, instalado desde la propia 0025) + trigger `t_production_orders_history_lock` BEFORE INSERT OR UPDATE que la vuelve **columna del sistema** (ignora todo valor del cliente; la asigna solo al entrar en closed/cancelled; jamás la borra ni la reemplaza); (2) **0104 §2d** — el trigger de DELETE bloquea por estado **o por candado**, con mensaje semántico único «Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.» (§31: vale para closed, cancelled y reabiertas); (3) **app** — `orderDeletionBlockedMessage(status, historyLockedAt)`, delete action que carga y evalúa el candado, edición genérica vetada sobre finalizadas, **acción explícita `reopenProductionOrderAction`** (closed/cancelled → in_progress, auditada, sin tocar el candado) y UI con «Reabrir orden» en lugar de «Editar», Eliminar condicionado por candado y aviso discreto «Orden histórica reabierta» | PostgreSQL real **S9.1–S9.11** (60 aserciones acumuladas, EXIT 0): activación por SQL directa, conservación en reapertura y re-cierre, candado imposible de anular/falsificar/fabricar, caso central §46 con no-cascada, variante con genealogía §47, cancelled, nunca-finalizadas intactas, bypass completo bajo rol `authenticated`, auditoría de cierre/reapertura y backfill (incluida la orden reabierta pre-sprint detectada por audit_log y el control negativo «sin evidencia no se inventa»). Suite `pcr02-3`: matriz pura + candados de acción/UI/0104 |

## Rojo antes / verde después (§61)

| Paso | PCR-02.2 (rojo) | PCR-02.3 (verde) |
| ---- | ---------------- | ---------------- |
| DELETE con `closed` | rechazado ✓ | rechazado (S7.A3, mensaje semántico) |
| UPDATE a `in_progress` («reabrir») | permitido, sin dejar rastro estructural | permitido — pero el candado ya quedó activado al primer cierre (S9.1/S9.2) y la reapertura es una acción explícita en la app |
| DELETE de la orden reabierta | **ÉXITO — historia borrada** (`orden existe = 0 · consumos historicos = 0`) | **FALLA** (S9.4/S9.9) y orden, consumo, lote de entrada, salidas y genealogía permanecen (S9.4/S9.5) |

## Decisiones documentadas

* **Opción B sobre opción A**: el candado se evalúa en cada DELETE con costo
  O(1) y sin depender del volumen, la retención ni el formato del audit_log
  (solo legible por admin); el audit_log **sí** se usa una única vez, en el
  backfill, donde su evidencia es inequívoca (detalle en el informe).
* **`cancelled` se reabre** (transición que el dominio ya permitía desde el
  formulario; ahora explícita y con candado permanente) — S9.6.
* **Mensaje unificado** (§31): las aserciones S7.A3/A4/A7 de PCR-02.2 se
  actualizaron al texto semántico; el comportamiento (delete bloqueado) es
  idéntico.
* **Sin estado nuevo** (§33): `reopened` no existe; la condición es
  `status abierto + history_locked_at` (§30), mostrada como «Orden histórica
  reabierta».

## Qué NO se tocó (§37–§43)

Completitud fail-closed (`cycle_edges`/`truncated_branches`/profundidad/AND),
consumos y guardas PCR-02.1, next actions, selectores, genealogía, alerta
72 h, modelo de salidas, PCR-01.1, Textiles, legales y `package.json`
(`"1.0.0"`) — con candados en la suite `pcr02-3` (C.1–C.3) y las suites
previas en verde.
