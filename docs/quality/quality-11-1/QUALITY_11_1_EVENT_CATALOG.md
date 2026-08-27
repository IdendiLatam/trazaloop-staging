# QUALITY-11.1 · El catálogo de hechos observables

## 1 · Cómo se eligieron

No se inventó ninguno. Se auditaron los **57 tipos de evento** que las
migraciones de Trazaloop escriben de verdad en `work_events`, y se quedaron los
que cumplen las dos condiciones que hacen falta para reaccionar a ellos:

1. son **hechos de negocio** —algo que una persona hizo—, no el eco de un
   barrido;
2. su sujeto es un objeto que el catálogo de fuentes de QUALITY-11 **sabe
   observar**.

Quedan **veinte**, repartidos en ocho dominios.

## 2 · Los veinte

| Hecho | Se llama | Dominio | Sujeto | Fuente que se observa |
|---|---|---|---|---|
| `indicator.target_missed` | Se registró una medición fuera de meta | indicadores | indicador | `indicator` |
| `indicator.attention` | Se registró una medición en zona de atención | indicadores | indicador | `indicator` |
| `case.opened` | Se abrió un caso | casos | caso | `case` |
| `case.classified` | Se clasificó un caso | casos | caso | `case` |
| `risk.assessed` | Se valoró un riesgo | riesgos | riesgo | `risk` |
| `risk.reviewed` | Se revisó un riesgo | riesgos | riesgo | `risk` |
| `risk.materialized` | Un riesgo se materializó | riesgos | riesgo | `risk` |
| `control.reviewed` | Se verificó un control | riesgos | control | `control` |
| `opportunity.assessed` | Se valoró una oportunidad | riesgos | oportunidad | `opportunity` |
| `performance.evaluation_closed` | Se cerró una evaluación de desempeño | personas | evaluación | `performance_evaluation` |
| `supplier.classified` | Se clasificó la criticidad de un proveedor | proveedores | alcance | `supplier_scope` |
| `supplier.evaluated` | Se cerró la evaluación de un proveedor | proveedores | **evaluación** → alcance | `supplier_scope` |
| `complaint.recorded` | Se registró una queja | cliente | retroalimentación | `customer_feedback` |
| `feedback.recorded` | Se registró retroalimentación | cliente | retroalimentación | `customer_feedback` |
| `campaign.metrics_computed` | Se calcularon las métricas de una campaña | cliente | campaña | `customer_metric` |
| `audit.finding_evaluated` | Se evaluó un hallazgo | auditorías | hallazgo | `audit_finding` |
| `audit.report_issued` | Se emitió el informe de una auditoría | auditorías | auditoría | `audit` |
| `audit.closed` | Se cerró una auditoría | auditorías | auditoría | `audit` |
| `management_review.inputs_prepared` | Se prepararon las entradas de la revisión | revisión | revisión | `management_review` |
| `management_review.closed` | Se cerró la revisión por la dirección | revisión | revisión | `management_review` |

## 3 · Los que quedaron fuera, y por qué

**Los que emite la propia automatización** (`automation.rule_published`,
`automation.signal_raised`, `automation.run_completed`, …). El enrutador los
descarta explícitamente por `source_domain <> 'automation'`. Es la guarda de
profundidad: sin ella, una tarea creada podría disparar una regla que crea otra
tarea.

**Los que emite un barrido y no una persona** (`indicator.measurement_due`,
`action.overdue`). No son hechos nuevos: son la misma condición contada otra
vez. Reaccionar a ellos sería observar el eco, y además duplicaría exactamente
lo que GAP-01 acaba de deduplicar.

**Los de dominios que QUALITY-11 no observa** (pasaportes textiles, importación,
plataforma). No tienen fuente en el catálogo: una regla no podría decir nada
sobre ellos.

## 4 · El único hecho nuevo

`complaint.recorded` / `feedback.recorded`.

Registrar una queja es un hecho de negocio que el sistema **ya trataba como
importante** —puede escalar a caso, entra en la revisión por la dirección, la
mira la voz del cliente— y sin embargo no dejaba rastro en la bitácora. No es
un alias inventado para pasar una prueba: es una ausencia que se notaba.

Se emite con un disparador `after insert` sobre `quality_customer_feedback`, es
decir **dentro de la misma transacción** que registra la queja. Eso lo convierte
en outbox transaccional: si la queja no se guarda, el hecho no existe; si se
guarda, el hecho existe aunque la automatización esté apagada.

## 5 · Los contratos de sujeto

Un evento trae `subject_type` y `subject_id`. Traducir eso a un sujeto
observable **no** puede hacerse leyendo un nombre de tabla del JSON del evento:
sería exactamente el agujero que QUALITY-11 evitó en el catálogo de fuentes.

`quality_automation_event_contracts` mapea tipo de sujeto → fuente, con un
**resolutor con nombre**:

| Resolutor | Qué hace | Dónde se usa |
|---|---|---|
| `direct` | el sujeto del hecho **es** el sujeto observable | 17 de los 18 contratos |
| `supplier_evaluation_to_scope` | del hecho (la evaluación) al alcance evaluado | `supplier.evaluated` |

Los dos están escritos a mano en un `CASE` de plpgsql. No hay expresiones, ni
tablas, ni columnas que vengan de ningún dato.

Y hay una comprobación más: la **fuente de la regla** tiene que coincidir con la
del contrato. Una regla sobre casos que escuche «se registró una queja» no se
publica —lo dice la validación en castellano— y, si de algún modo existiera, el
enrutador la marcaría como omitida en vez de evaluarla.
