# Trazaloop · PCR-02.1 — Informe de implementación

Sprint correctivo de hardening sobre PCR-02 (NO-GO de la revisión
independiente). Base: `trazaloop-sprint-PCR-02.zip`, verificado byte a byte
contra el árbol de trabajo (720 archivos, 0 diferencias). Se conservó todo lo
correcto de PCR-02 (§26/§51–56 del brief) y el diff es enfocado (§43).

La tabla Hallazgo | Severidad | Causa | Corrección | Test vive en
`docs/PCR-02.1-REVIEW-FIXES.md`; este informe detalla archivos y decisiones.

---

## 1. Archivos modificados / nuevos

### Migración (corregida in situ — 0104 jamás fue aplicada; no existe 0105)

| Archivo | Cambio |
| ------- | ------ |
| `supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql` | §2 trigger anti-autoconsumo → `SECURITY INVOKER` + acotado por `organization_id` + mensaje único sin oráculo. **§2b nuevo**: trigger `t_output_batches_protect_reassignment` (un lote consumido no cambia de orden productora). §4 `v_output_batch_completeness` reescrita con cierre recursivo acotado (herencia aguas arriba, 5 puntos de semántica documentados en el propio SQL; columnas idénticas). **§4b nuevo**: `v_implementation_next_actions` (definición vigente 0065 íntegra) con la CTE de «orden sin consumo» considerando ambos orígenes, entre marcadores extraíbles. §5 verificaciones actualizadas. |

La tabla §1, sus FK compuestas, índices, triggers estándar, auditoría y RLS
de PCR-02 quedaron **intactos** (ahora probados de verdad, ver §3).

### Server actions (`server/actions/traceability.ts`)

| Acción | Antes (PCR-02) | Ahora (PCR-02.1) |
| ------ | -------------- | ---------------- |
| `deleteBatchConsumptionAction` | Borraba sin mirar el estado de la orden | Resuelve la orden del consumo y ejecuta `assertOrderAcceptsMutations` antes del `delete`; conserva el mensaje de rol cuando la RLS bloquea |
| `deleteOutputConsumptionAction` | `void`, sin guarda, sin feedback | Patrón `TraceActionState` + misma guarda; el usuario ve el motivo («La orden está cerrada…») |
| `updateOutputBatchAction` | Podía cambiar `production_order_id` sin validar nada más que pertenencia | Detecta la reasignación comparando contra el lote actual; **bloquea** si el lote ya fue consumido; exige que la orden actual **y** la destino acepten mutaciones; captura el `23514` del trigger §2b con el mismo mensaje. Campos descriptivos siguen editables siempre (§49) |
| `deleteOutputBatchAction` | El `ON DELETE RESTRICT` llegaba como error SQL crudo | Pre-chequeo de consumidores («ya fue consumido por otras órdenes: no puede eliminarse…»), guarda de estado de la orden productora, y `23503` traducido al mismo mensaje amable |
| `addBatchConsumptionAction` / `addOutputConsumptionAction` / `createOutputBatchAction` | Guardadas desde PCR-02 | Sin cambios (conservadas; candado 1.4 de la suite) |

### UI

| Archivo | Cambio |
| ------- | ------ |
| `app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx` | Botones «Eliminar» (externo e interno) dentro de `!mutationBlocked`; borrado interno con `ActionButton` (feedback visible); nota de **modo consulta / auditoría** al bloquear (la navegación a lotes/evidencias/genealogía se conserva, §8). Selectores acotados: componente local `SelectorSearch` (GET, ancla por sección, conserva los términos hermanos) con `in_q`/`int_q`/`ev_q` y aviso «Mostrando 20 de N». Ya no se cargan todos los lotes de entrada ni todas las evidencias. |
| `app/(app)/(shell)/(cpr)/traceability/genealogy/page.tsx` | Fuera `listOutputBatches`/`listInputBatches` completos: búsqueda `bq`/`iq` con `searchOutputBatches`/`searchInputBatches` (PCR-01.1, 20/página), resultados como enlaces (`?output=`/`?input=` se conservan como deep links) y el lote consultado se resuelve por id con `getOutputBatch`/`getInputBatch`. Aviso de recorte con total. |
| `app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx` | El lote en edición entra en `listForwardUsesForOutputs`; si ya fue consumido se pasa `lockOrder` al formulario. |
| `components/domain/traceability/forms.tsx` | `OutputBatchForm` acepta `lockOrder`: orden productora fija (hidden + explicación con las órdenes consumidoras) cuando el lote ya fue consumido; el resto de campos sigue editable. |

### Capa de datos (`lib/db/traceability.ts`)

`SELECTOR_OPTIONS_LIMIT = 20` y tipo `BoundedOptions {options,total,limit}`.
`listConsumableOutputs` ahora recibe término + límite (conserva el `.neq` de
la propia orden y el filtro de empresa; devuelve total para el aviso).
Nuevos `searchInputBatchOptions` y `searchEvidenceOptions` con el mismo
contrato (`ilike` saneado de `%`/`_`, orden por recencia/nombre).

### Pruebas

| Archivo | Contenido |
| ------- | --------- |
| `tests/db/harness-prelude.sql` (nuevo) | Superficie mínima equivalente a Supabase (auth.uid(), roles `authenticated`/`anon`, funciones regla 0024, `is_org_member`/`has_org_role`, tablas base, vistas de implementación emuladas) para aplicar las migraciones REALES en local. |
| `tests/db/run-local-pg.sh` (nuevo) | Runner desechable: crea `trazaloop_pcr02_1`, aplica el arnés + **0025 real** + **0104 real tal como se envía**, grants estilo Supabase, y ejecuta las aserciones. `BLOCKED` con exit 2 si no hay PostgreSQL local. Nada remoto. |
| `tests/db/pcr02_1_assertions.sql` (nuevo) | 33 aserciones conductuales: S1 constraints, S2 trigger (mensajes comparados por igualdad), S3 reasignación, S4 RLS real por rol y empresa, S5 completitud A–F + ciclo + regresión S5.D2, S6 implementación casos 1–4 + regresión S6.5. |
| `tests/unit/pcr02-1-hardening.test.ts` (nuevo) | 17 checks: matriz de estados ejecutada + candados estructurales por función (guardas ANTES del delete, invoker+org en el trigger, CTE de ambos orígenes, cierre recursivo, selectores acotados, PCR-01/Textiles/no-remoto). Mapea los 16 puntos del §41. |
| `tests/unit/pcr02-internal-consumption.test.ts` | Candado 8 endurecido: el borrado interno además exige la guarda de estado. |
| `package.json` | `test:pcr02-1` (en `test:all`) y `test:pcr02-1-db` (fuera de `test:all`: requiere PostgreSQL local). |

### Documentación

Nuevos: `docs/PCR-02.1-REVIEW-FIXES.md`, `docs/PCR-02.1-IMPLEMENTATION-REPORT.md`
(este), `docs/PCR-02.1-TEST-MATRIX.md`, `docs/PCR-02.1-PRODUCTION-DEPLOY.md`,
`docs/PCR-02.1-ROLLBACK.md`. Actualizados con secciones PCR-02.1: los 5
documentos PCR-02 de la raíz.

## 2. Decisiones de diseño

1. **Reasignación de un lote consumido: bloqueo total (§7).** Cambiar la
   orden productora de un lote que ya alimenta otra orden reescribiría la
   historia productiva y podría crear un autoconsumo silencioso (reasignar el
   productor a la orden consumidora no pasa por el trigger §2). Se bloquea en
   servidor (mejor mensaje + estados) **y** en BD (§2b, barrera ante API
   directa). Si el lote no fue consumido, la corrección de orden es legítima
   y se permite, validando el estado de ambas órdenes.
2. **Campos descriptivos siempre corregibles (§49).** Código, producto,
   fechas, cantidad, características, aplicación, ubicación y notas se
   corrigen en auditorías reales; solo la reasignación es estructural. La
   cantidad producida mantiene la filosofía de advertencias (no bloqueo) de
   PCR-02.
3. **Completitud con herencia acotada (§21).** Ni booleanos constantes
   (falso positivo) ni «solo el propio nivel» (falso negativo que PCR-02
   corrigió): cierre recursivo del grafo de órdenes vía consumo interno,
   profundidad 10 y camino anti-ciclos — la misma filosofía del recorrido de
   genealogía, ahora en SQL. Contrato de columnas intacto (compat §47).
4. **Trigger `SECURITY INVOKER`.** Más fuerte que «definer con filtro»: la
   RLS del llamante aplica también dentro del trigger, y el filtro explícito
   por organización queda como defensa en profundidad (rutas service-role).
   Mensaje único para inexistente/ajeno: sin oráculo.
5. **Selectores: búsqueda GET server-side, cero librerías nuevas (§16–17).**
   Mismo patrón de PCR-01.1 (formularios GET + `ilike` acotado). En el
   detalle cada sección conserva los términos de las otras y ancla a su
   sección; en genealogía los resultados son enlaces (los deep links
   `?output=`/`?input=` históricos siguen funcionando).
6. **Validación PostgreSQL local por arnés (§31–35).** Sin Docker en el
   entorno, se instaló PostgreSQL 16 del sistema y se construyó una
   superficie mínima de Supabase para aplicar las migraciones **reales** (la
   0104 se prueba tal como se envía, no una copia). Emula Supabase, no lo
   replica: auth/storage reales y las suites `test:rls`/`test:smoke` del
   repo siguen BLOCKED para el QA (separación documentada en la matriz).

## 3. Qué se conservó de PCR-02 (sin cambios)

Detalle-hub como centro (§53) con sus secciones y anclas; redirect legacy
`?order=` (§54); creación de salidas contextual a la orden y Bloque G (§52);
«Consumido después en OP-x» (§55); dossier «Producción interna (OP-x)»
(§56); genealogía multi-salto bidireccional con ciclos y profundidad (§26,
suites intactas); alerta 72 h (§51, suite intacta); tabla
`output_batch_consumption` completa con FK compuestas, RLS y auditoría;
nomenclatura (§44).

## 4. Riesgos

* Los escenarios que exigen Supabase real (auth, storage, navegador,
  `test:rls`/`test:smoke` del repo) siguen BLOCKED — diferenciados en la
  matriz como «no ejecutable aquí», no como riesgo técnico conocido.
* El cierre recursivo de la vista de completitud crece con la longitud de
  las cadenas internas; está acotado (10) y las cadenas reales son cortas,
  pero en organizaciones con miles de órdenes encadenadas conviene vigilar
  el plan de la vista (nota de rendimiento en la propia migración).
* Ciclos largos entre órdenes siguen sin bloquearse en BD (decisión §27
  conservada): genealogía y vista los recorren acotados; riesgo operativo
  documentado.
* Pantallas pre-PCR-02 (`/evidences`, recycled-content, audit-support)
  conservan sus listados completos de v1.0.1 (fuera del alcance §43/§58).
