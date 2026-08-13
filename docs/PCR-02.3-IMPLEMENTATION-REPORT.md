# Trazaloop · PCR-02.3 — Informe de implementación

## Objetivo e invariante

> **Una Orden / corrida que alguna vez haya sido cerrada o cancelada forma
> parte del historial de trazabilidad y jamás vuelve a ser eliminable,
> aunque posteriormente se reabra.** Reabrir permite corregir; nunca
> permite borrar la historia.

## Decisión de diseño (§6): opción B — marcador persistente

**Opción A (consultar audit_log en cada DELETE) descartada** por cuatro
motivos verificados en el repositorio: (1) costo y acoplamiento — el trigger
de DELETE pasaría de O(1) a un scan de jsonb dependiente del volumen y del
formato del `diff`; (2) privilegios — `audit_log` tiene RLS solo-admin y el
trigger de DELETE es SECURITY INVOKER a propósito (PCR-02.2), con lo que un
usuario `quality` no podría ni evaluar la condición sin escalar privilegios;
(3) retención — la integridad quedaría rehén de cualquier futura política de
depuración del audit; (4) el candado es un HECHO de la fila, no una consulta.
**El audit_log sí se usa una única vez** — en el backfill, donde su
evidencia es inequívoca y el costo es de migración, no de operación.

**Opción B**: `production_orders.history_locked_at timestamptz` — momento de
la **primera** entrada en `closed/cancelled` (no «último cierre», §36).
Columna **gestionada por el sistema**: `t_production_orders_history_lock`
(BEFORE INSERT OR UPDATE, SECURITY INVOKER) parte siempre del valor previo —
un UPDATE no puede anularla ni reemplazarla, un INSERT no puede fabricarla —
y solo el propio trigger la asigna al entrar en un estado final. Fail-closed
silencioso: el valor ilegal simplemente no ocurre (S9.3/S9.9).

## Cambios en la 0104 (única migración; sin 0105)

* **§2c (nuevo)**: columna + comment con semántica; **backfill 1/2** (órdenes
  hoy en `closed/cancelled` → `now()` documentado como activación técnica
  del candado, NO fecha real de cierre — `updated_at` es «última
  modificación» y usarlo falsificaría historia, §9); **backfill 2/2 (§10)**:
  órdenes reabiertas ANTES del sprint — `t_audit_production_orders` existe
  desde la **creación de la tabla** (la propia 0025 lo instala), así que
  todo paso por `closed/cancelled` dejó fila con `diff` old/new; el backfill
  marca solo donde hay esa evidencia y el control negativo S9.11 demuestra
  que **sin evidencia no se inventa nada** (limitación documentada: si
  alguna operación externa depurara `audit_log`, los pasos depurados no
  serían detectables; en el repo no existe migración que lo depure). Orden
  interno **columna → backfill → trigger** (candado B.2): la columna del
  sistema descartaría el backfill si fuera al revés.
* **§2d**: el trigger de DELETE bloquea por `OLD.status IN
  ('closed','cancelled')` **o** `OLD.history_locked_at IS NOT NULL`, con el
  mensaje semántico único de §31.
* **§5**: verificaciones manuales ampliadas. Índice de cabecera actualizado.

## Cambios en la aplicación

* `lib/domain/production-alerts.ts`: `ORDER_HISTORY_MESSAGE`,
  `orderDeletionBlockedMessage(status, historyLockedAt)` (matriz H1–H4),
  `orderReopenAllowed`, `isReopenedHistoricalOrder`, transiciones §18
  documentadas (estados reales; sin `reopened`, §33).
* `server/actions/traceability.ts`: delete carga y evalúa el candado y
  traduce la barrera §2d; **`reopenProductionOrderAction`** (valida usuario/
  organización/rol vía `checkCprCanMutate`, orden, transición
  closed/cancelled→in_progress; no toca el candado; auditada por
  `t_audit_production_orders`); `updateProductionOrderAction` **veta la
  edición genérica de finalizadas** y redirige a «Reabrir orden» (§14/§34).
* UI detalle y listado: `closed/cancelled` en **modo consulta/auditoría**
  con acción explícita **«Reabrir orden»** (sin «Editar» genérico); Eliminar
  condicionado por estado **y** candado; aviso discreto **«Orden histórica
  reabierta»** (§32); `history_locked_at` expuesto por la capa de datos.
* Política `cancelled` (§16): **sí se reabre** — el dominio ya permitía esa
  transición desde el formulario; ahora es explícita y el candado la vuelve
  permanentemente no-borrable (S9.6). Cerrar de nuevo una reabierta no
  altera la fecha original del candado (§35/§36, S9.2).

## Tests

* **PostgreSQL real** (`tests/db/pcr02_3_assertions.sql`, paso 6/6 del
  runner): S9.1–S9.11 → cobertura de H1–H10 del brief + auditoría §28 +
  backfill §9/§10. El arnés subió su emulación de `audit_log` a la
  **fidelidad del esquema real 0005** (diff jsonb old/new) porque la 0104 lo
  consulta.
* **Unit** (`tests/unit/pcr02-3-hardening.test.ts`): matriz pura del
  candado, candados de acciones/UI (H11/H12), estructura de la 0104
  (incluido el orden columna→backfill→trigger) y conservación C.1–C.3.
* PCR-02.2: S7.A3/A4/A7 y la suite unit adaptadas al mensaje unificado y a
  la reapertura explícita (comportamiento idéntico, texto y política de UI
  nuevos — documentado en REVIEW-FIXES).

## Hot compatibility (§53) — resumen

`history_locked_at` es nullable, sin default obligatorio y sin NOT NULL: los
INSERT/UPDATE de la v1.0.1 viva siguen funcionando; si esa app cierra o
cancela una orden durante la ventana, **el trigger activa el candado
igualmente** (S9.1 lo prueba por SQL directa, que es exactamente lo que hace
la app vieja). Detalle completo en `PCR-02.3-PRODUCTION-DEPLOY.md`.

## Validaciones (§50)

typecheck / lint / build (`next build --webpack`) / **test:all: EXIT 0 —
1505 verificaciones**, incluyendo PCR-01.1, PCR-02, PCR-02.1, PCR-02.2,
PCR-02.3 y Textiles; arnés PostgreSQL: **EXIT 0 — 60 aserciones** (S1–S9).
