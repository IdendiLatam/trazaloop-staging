# QUALITY-11.1 · Informe consolidado

## A · Rama

`fix/quality-11-1-event-scheduled-parity`, desde `af44163` (HEAD real de
QUALITY-11, árbol limpio y verificado antes de empezar).

## B · HEAD

`59ab288`, más el commit de entregables de este mismo informe.

## C · Commits

| Commit | Qué |
|---|---|
| `59ab288` | QUALITY-11.1 · puente de eventos y paridad del barrido programado |
| *(este)* | entregables de QUALITY-11.1 |

## D · Baseline

`baseline/quality-11-post-acceptance` = `af44163`, etiquetado y empujado antes
de tocar nada.

## E · Migraciones

| Migración | Qué |
|---|---|
| `0131_quality_automation_event_bridge.sql` | lo único que añade QUALITY-11.1 |

Append-only. **Ni la 0129 ni la 0130 se editaron** — hay una prueba que lo
comprueba buscando la cadena «QUALITY-11.1» dentro de las dos.

**Local 0131 · Staging 0131 · Production 0111.**

## F · GAP-01 · causa raíz

`quality_scan_pending_measurements` (0119) y `work_scan_pending_actions` (0121)
se escribieron como acciones de pantalla: su primera línea es
`if auth.uid() is null then raise exception 'No autenticado'`. Bajo el
planificador —que entra sin usuario— no podían ejecutarse, y la 0130 los anotaba
como omitidos.

No era un fallo de QUALITY-11: era una decisión de QUALITY-03 y QUALITY-04 que
solo se volvió visible cuando apareció un ejecutor sin sesión.

## G · GAP-01 · solución

Tres pasos, en `QUALITY_11_1_SCHEDULED_PARITY.md`:

1. dos hechos nuevos en el catálogo tipado —`measurement_period_closed` y
   `requires_effectiveness`— para poder escribir la condición **exacta**;
2. tres plantillas que la expresan con el mismo evaluador y el mismo ejecutor;
3. los barridos dejan de exigir sesión —conservando los permisos cuando la
   hay— y **ceden** ante la regla que los releva.

No se usó `service_role` para saltarse nada, y no se reimplementó ninguno de los
dos: eso habría sido el segundo motor que §2 prohíbe.

## H · Adaptación de QUALITY-03

`quality_scan_pending_measurements`: guarda de sesión alineada con la de los
otros seis barridos, y cesión ante `indicator_measurement_due`. Sus consultas,
sus claves (`ev:due:`, `tk:due:`, `al:due:`) y sus salidas, intactas. Su suite
pasa sin cambios.

## I · Adaptación de QUALITY-04

`work_scan_pending_actions`: lo mismo, y cesión ante `action_overdue`. Sus claves
(`ev:act:overdue:`, `al:act:overdue:`, `al:act:eff:`) intactas. Su suite pasa sin
cambios, en local y contra Staging.

## J · GAP-02 · arquitectura

```
HECHO (work_events, escrito dentro de la transacción de dominio)
   → ENRUTADOR (reglas por evento, versión vigente, índice GIN por tipo)
   → CONTRATO DE SUJETO (registrado, resolutor con nombre)
   → PROVEEDOR TIPADO (el mismo, acotado a un sujeto)
   → EVALUADOR (el mismo)
   → EJECUTOR DE SALIDAS (el mismo, extraído a `quality_automation_emit`)
   → SEÑAL · AVISO · TAREA
```

Detalle en `QUALITY_11_1_EVENT_BRIDGE.md`.

## K · Catálogo de hechos

20 hechos, 8 dominios, todos reales salvo `complaint.recorded` /
`feedback.recorded`, que faltaban para un hecho que el sistema ya trataba como
importante. Quedan fuera, a propósito, los de la propia automatización y los que
emite un barrido. `QUALITY_11_1_EVENT_CATALOG.md`.

## L · Enrutado

Por `event_types @> array[tipo]` con índice GIN parcial sobre las versiones por
evento, una versión por regla (`distinct on`), y filtrado por empresa, estado,
vigencia y silencio. No se evalúan todas las reglas ante cada hecho.

## M · Reutilización del evaluador

`quality_automation_evaluate`, sin tocar. La 0131 no reescribe ni el evaluador
ni el comparador —hay una prueba que lo comprueba—, y el proveedor de sujetos es
el mismo con un parámetro más: las 18 ramas admiten acotarse a un sujeto.

## N · Reutilización del ejecutor

`quality_automation_emit`, extraído del barrido. Los dos caminos lo llaman y
ninguno inserta señales por su cuenta. Que las 68 comprobaciones de QUALITY-11
sigan verdes después de la extracción es la prueba de que no cambió nada.

## O · Linaje

`quality_signals.source_event_id` → `work_events`, más el acuse de entrega, más
la versión y la ejecución que ya guardaba. Desde una señal se puede responder:
qué hecho, qué regla, qué versión, qué ejecución, qué avisos y qué tareas.

## P · Idempotencia

Tres capas: índice único parcial de la señal, restricción única del acuse,
`where not exists` de aviso y tarea. `QUALITY_11_1_IDEMPOTENCY.md`.

## Q · Colisión evento + barrido

**No puede ocurrir.** La clave de dedupe es `auto:<versión>:<sujeto>` y no
incluye el camino. Comprobado ejecutándolo: procesar el hecho y después barrer
deja una sola señal.

Además, una regla por evento **no se barre**: se anota como omitida con su
motivo, para que el barrido no cierre sola una señal nacida de un hecho.

## R · Reintentos

El acuse pasa a `failed` con su mensaje; el siguiente pase lo reintenta,
incrementa `attempts` y completa lo que faltara exactamente una vez. El
procesador incluye siempre los hechos fallidos **aunque la marca de agua ya los
haya dejado atrás** — sin eso el reintento era imposible, y fue el primer
defecto que encontró la suite.

## S · Prevención de bucles

`source_domain <> 'automation'` en el enrutador, más la ausencia de fuentes que
observen tareas, avisos o señales. Comprobado por las dos vías: ningún acuse
referencia un hecho de la automatización, y cinco pasadas no crean nada.

## T · Seguridad

`QUALITY_11_1_SECURITY_RLS.md`. Lo esencial: un hecho no se puede falsificar
—`work_events` es de solo lectura para las sesiones—, la empresa nunca viene del
navegador, el sujeto se traduce por contrato y el tipo de hecho se valida contra
el catálogo.

## U · RLS

Acuses con RLS por empresa y solo lectura; los dos catálogos, de plataforma y
solo lectura; el disparador de historia inmutable alcanza también a los acuses.

## V · Escenarios de dominio reales

Cuatro dominios probados de punta a punta con las RPC de siempre: **cliente**
(queja registrada), **indicadores** (medición cargada), **proveedores**
(evaluación cerrada, con resolutor) y **auditorías** (hallazgo evaluado). En los
cuatro, el estado de negocio no cambia: 0 casos, 0 no conformidades, aprobación
intacta, indicador intacto.

## W · Regresiones

```
npm run test:all → TEST_ALL_EXIT = 0
```

Nueve suites contra base real en local, verdes, incluidas las de QUALITY-03 y
QUALITY-04, que son las que tocaba vigilar.

## X · Staging

`0131`, paridad exacta, la suite completa en verde contra Staging, dos barridos
consecutivos sin duplicados y reproducción de hechos sin duplicados.
`QUALITY_11_1_STAGING_VALIDATION.md`.

## Y · URL de Preview

Ver §9 de `QUALITY_11_1_STAGING_VALIDATION.md`.

## Z · Production intacta

Cabecera **0111**. Sin migración, cron, planificador, variables, datos,
usuarios, despliegue, promoción ni alias.

## AA · Los 167 criterios de QUALITY-11, reevaluados

El único que estaba en PARCIAL era el **#11 · camino por evento**. Ahora:

| # | Criterio | Antes | Ahora | Evidencia |
|---|---|---|---|---|
| 11 | camino por evento | **PARCIAL** | **PASS** | hecho real → enrutador → regla activa → mismo evaluador → mismo ejecutor → señal real → linaje → idempotencia, en cuatro dominios |

Y los que QUALITY-11.1 refuerza sin cambiarles el veredicto:

| # | Criterio | Refuerzo |
|---|---|---|
| 69 | planificador = un motor | ahora drena hechos **y** barre, por la misma puerta |
| 71 | ejecución de sistema = mismo motor | los ocho observadores corren sin sesión |
| 92 | barridos anteriores auditados | los dos que faltaban pasan a ADAPTED |
| 93 | duplicados eliminados o adaptados | el barrido heredado cede ante su regla |
| 57 | dedupe concurrente | ahora también entre caminos distintos |
| 58 | reintento idempotente | acuse de entrega con reintento probado |

**167 PASS · 0 PARCIAL · 0 GAP · 0 FAIL.**

## AB · AT-01…AT-45

**45 IMPLEMENTED**, sin cambios de veredicto. Cuatro quedan reforzados: AT-02,
AT-26, AT-27 y AT-31. Adenda en `QUALITY_11_AT_MATRIX.md`.

## AC · Huecos

**GAP-01 · CERRADO.** Las dos condiciones se observan sin sesión humana, y no
hay salida duplicada: el barrido heredado cede ante la regla que lo releva.

**GAP-02 · CERRADO.** Existe el camino real hecho → enrutador → regla → mismo
evaluador → mismo ejecutor → señal, con linaje e idempotencia, probado de punta
a punta en cuatro dominios y contra Staging.

**No quedan huecos abiertos.**

Dos observaciones que no son huecos, pero conviene tener escritas:

1. Las cuatro plantillas por evento están **apagadas**, como todas. Hasta que
   una empresa adopte alguna, el puente corre y no encuentra nada que hacer —lo
   cual es correcto y es lo que dice §34—.
2. El planificador sigue **sin cron configurado**, por la misma razón que en
   QUALITY-11: configurarlo tocaría `vercel.json`, que es configuración
   compartida con Production. El paso de activación está escrito en
   `QUALITY_11_SCHEDULER.md` §3 y ahora incluye también el drenaje de hechos.
