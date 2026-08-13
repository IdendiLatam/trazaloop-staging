# Trazaloop · PCR-02.1 — Correcciones de la revisión independiente

**Sprint correctivo de hardening sobre la entrega PCR-02** (que recibió
NO-GO). Base oficial: `trazaloop-sprint-PCR-02.zip` (verificado byte a byte,
720 archivos, 0 diferencias). La migración `0104` nunca fue aplicada, por lo
que las correcciones de modelo viven **en la propia 0104** (no existe 0105).

## Tabla de hallazgos

| Hallazgo | Severidad | Causa | Corrección | Test |
| -------- | --------- | ----- | ---------- | ---- |
| **1.A** `deleteBatchConsumptionAction` borra consumos de órdenes cerradas/canceladas | **Crítica** | La acción solo validaba sesión + acceso comercial; el estado de la orden nunca se consultaba antes del `delete` | La acción resuelve la orden del consumo (`select id, production_order_id` acotado a la empresa) y ejecuta `assertOrderAcceptsMutations` **antes** de borrar (`server/actions/traceability.ts`) | `pcr02-1-hardening` 1.2 (guarda antes del delete, sobre el código real); matriz de estados ejecutada en 1.1 |
| **1.B** `deleteOutputConsumptionAction` — mismo defecto, y además era `void` (el usuario nunca veía el motivo) | **Crítica** | Acción de formulario sin estado, escrita en PCR-02 sin la guarda | Convertida al patrón `TraceActionState` con la misma guarda de estado; el detalle usa `ActionButton` (igual que el borrado externo) y muestra el motivo del rechazo | `pcr02-1-hardening` 1.3; candado endurecido en `pcr02-internal-consumption` check 8 |
| **1.C** El detalle de una orden cerrada seguía mostrando botones «Eliminar» | **Alta** | Los botones de fila quedaron fuera del condicional `!mutationBlocked` que ya ocultaba los formularios de alta | Ambos botones (externo e interno) dentro de `!mutationBlocked`; nota explícita de **modo consulta / auditoría** conservando navegación a lotes, evidencias y genealogía | `pcr02-1-hardening` 1.8 |
| **1.D** `updateOutputBatchAction` permitía cambiar `production_order_id` sin validar estados ni consumidores | **Crítica** | La acción validaba pertenencia de orden/producto pero no comparaba contra el lote actual ni miraba `output_batch_consumption` | (i) Si cambia la orden productora: **bloqueado** si el lote ya fue consumido («la genealogía registrada no se reescribe»), y exige que la orden actual **y** la destino acepten mutaciones. (ii) **§2b de 0104**: trigger `t_output_batches_protect_reassignment` como barrera final en BD (además evita el autoconsumo silencioso de reasignar el productor a una orden consumidora). (iii) Campos descriptivos siguen editables (§49) | PostgreSQL real: S3.1–S3.3 (reasignación bloqueada con mensaje exacto, genealogía intacta, descriptivos editables); `pcr02-1-hardening` 1.5 y 3.3 |
| **§50** `deleteOutputBatchAction` dejaba llegar el error SQL crudo del `ON DELETE RESTRICT` | **Alta** | Sin pre-chequeo de consumidores ni estado de la orden productora | Pre-chequeo de consumidores con mensaje claro; `assertOrderAcceptsMutations` de la orden productora; captura de `23503` con el mismo mensaje amable | PostgreSQL real: S1.4 (RESTRICT); `pcr02-1-hardening` 1.6 |
| **2** `v_implementation_next_actions` recomendaba «Registrar consumo» a órdenes trazadas solo con producto intermedio | **Crítica** | La CTE `sample_order_without_consumption` (definición vigente de 0065) solo miraba `batch_consumption` | 0104 §4b redefine la vista **vigente completa** (0065 reproducida íntegra: columnas, prioridades, textos y href idénticos) cambiando **solo** la CTE a `not exists(batch_consumption) and not exists(output_batch_consumption)` (marcadores `PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE`) | PostgreSQL real sobre la **vista real**: S6.1–S6.4 (casos §11 1–4) + **S6.5 regresión demostrada** (la CTE de PCR-02 marca la orden solo-interna) |
| **3** Trigger anti-autoconsumo `SECURITY DEFINER` sin acotar por empresa | **Alta** | La función consultaba `output_batches` solo por `id`, con privilegios elevados, y el mensaje «no existe» diferenciado podía actuar de oráculo | Función ahora **`SECURITY INVOKER`** (la RLS del llamante aplica también dentro del trigger) con `and organization_id = new.organization_id`, `search_path` fijado, y **mensaje único** para lote inexistente/ajeno: «El lote producido no existe o no pertenece a tu empresa.» | PostgreSQL real: S2.1–S2.4 (autoconsumo, cross-tenant, uuid inexistente, **mensajes comparados por igualdad** = sin oráculo) y S4.5 (bajo rol `authenticated` con RLS) |
| **4** Selectores ilimitados (genealogía: todos los lotes; detalle: todos los lotes de entrada, todos los internos, todas las evidencias) | **Alta** | PCR-02 llenaba `<select>` con listados completos, regresión del patrón corregido en PCR-01.1 | Buscadores server-side **acotados a 20** (`SELECTOR_OPTIONS_LIMIT`) con `ilike` saneado y filtro `organization_id`: `searchInputBatchOptions`, `listConsumableOutputs` (ahora con término+límite, conserva `.neq` de la propia orden), `searchEvidenceOptions`. Detalle: mini-formularios GET por sección (`in_q`, `int_q`, `ev_q`) con aviso «Mostrando 20 de N». Genealogía: reutiliza `searchOutputBatches`/`searchInputBatches` (PCR-01.1, 20/página) con resultados como enlaces y resolución del lote consultado por id (`getOutputBatch`/`getInputBatch`) | `pcr02-1-hardening` 4.1–4.4 (páginas sin listados completos; buscadores con límite y filtro de empresa) |
| **5** Completitud: un consumo interno forzaba `has_supplier_info`/`has_material_info` = `true` constantes → falso positivo con cadena aguas arriba incompleta | **Crítica** | La unión de consumos de PCR-02 aportaba booleanos constantes para las filas internas | 0104 §4 reescribe `v_output_batch_completeness` con **cierre recursivo acotado** (profundidad 10, camino anti-ciclos): la información de proveedor/material de una cadena interna se **hereda** del cierre aguas arriba, y una orden intermedia sin consumos **corta** la cadena. Semántica documentada en 5 puntos dentro de la migración. Columnas, etiquetas y contrato idénticos (compat §47) | PostgreSQL real: S5.A–S5.F (casos §22) + S5.G (ciclo sin recursión infinita) + **S5.D2 regresión demostrada** (la regla PCR-02 habría dado proveedor=true al lote final con cadena rota) |
| **6** Tests demasiado permisivos (conteos de strings que no detectaron 1–5) | **Alta** | Las suites PCR-02 verificaban presencia de nombres, no comportamiento | (i) **Suite PostgreSQL local ejecutable** (`tests/db/`): 33 aserciones conductuales sobre las migraciones **reales** 0025+0104 — constraints, trigger, RLS con `set role authenticated` + `auth.uid()` emulado, vistas reales, dos demostraciones «rojo antes / verde después». (ii) Suite `pcr02-1-hardening` (17 checks): lógica pura de estados ejecutada + candados estructurales por función (guarda **antes** del delete, no un conteo global). (iii) Candado 8 de `pcr02-internal-consumption` endurecido | `npm run test:pcr02-1` (EXIT 0) y `npm run test:pcr02-1-db` (EXIT 0, 33 aserciones) |

## Hallazgos que NO aplicaban tal cual (§58)

* **«Consumo externo incompleto» (caso B de completitud):** `input_batches.supplier_id`
  y `material_id` son `NOT NULL` desde 0025 (la columna nació así: no hay
  filas históricas con NULL). Un consumo externo «sin proveedor» es
  irrealizable; la incompletitud aguas arriba **realizable** es una orden
  intermedia sin consumos (cadena cortada), que es exactamente lo que cubren
  el caso D y `chain_has_consumption`. Documentado también en la suite
  PostgreSQL (nota del bloque S5).
* **Selectores de pantallas pre-PCR-02** (`/evidences`, recycled-content,
  audit-support): cargan listados completos **desde v1.0.1** (no son una
  regresión de PCR-02) y quedan fuera del diff de este sprint correctivo
  (§43: sin cleanup ajeno). Registrado como riesgo residual conocido.
* **Permisos (§28):** las políticas RLS de 0104 ya eran las mismas de 0025
  (insert/update: admin, quality, consultant; delete: admin, quality) y no se
  tocaron; ahora están **probadas de verdad** (S4.1–S4.8). No se expandió
  ningún permiso.

## Demostraciones «rojo antes / verde después» (§42)

| Bug | Test que lo captura | Resultado con la lógica PCR-02 | Resultado PCR-02.1 |
| --- | ------------------- | ------------------------------ | ------------------ |
| Falso positivo de completitud (hallazgo 5) | `tests/db` **S5.D2**: evalúa la regla antigua (fila interna ⇒ proveedor `true`) sobre los datos del caso D | FIN-D habría sido `complete` | FIN-D es `incomplete` con «información de proveedor» (S5.D) |
| Implementación ignora consumo interno (hallazgo 2) | `tests/db` **S6.5**: ejecuta la CTE original (`left join` solo `batch_consumption`) sobre la org del caso 3 | La orden solo-interna aparece «sin consumo» → «Registrar consumo» | La vista real no la recomienda (S6.3) |
| Borrados sin estado (hallazgo 1) | `pcr02-1-hardening` 1.2/1.3 exigen la guarda **antes** del `.delete()` dentro del cuerpo real de cada acción | Habrían fallado (no existía la guarda) | Pasan |
| Trigger sin acotar (hallazgo 3) | `pcr02-1-hardening` 3.1 exige `security invoker` + filtro de organización + ausencia de mensaje diferenciado; `tests/db` S2.4 compara los mensajes por igualdad | Habrían fallado (definer, sin filtro, mensajes distintos) | Pasan |
