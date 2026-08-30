# QUALITY-13B3 · COMPROBACIÓN DE COMPATIBILIDAD

Los diez de 13A, uno por uno. Para cada uno: qué observa lo VIEJO, qué observaría lo
NUEVO, y el veredicto.

**La regla, congelada en QI-27:** una empresa que no adopta la plantilla equivalente tiene
que seguir recibiendo exactamente lo mismo. Y una que la adopta no puede perder nada que
la plantilla no cubra.

---

## 1 · El defecto que había que encontrar antes de relevar nada

**`work_scan_pending_actions`**

| | VIEJO · el barrido | NUEVO · la plantilla `action_overdue` |
|---|---|---|
| condición 1 | acción vencida y sin completar | la misma |
| condición 2 | **acción completada con la eficacia por verificar** | **no la observa** |
| sujeto | `work_action` | `work_action` |
| alcance | la empresa | la empresa |
| salidas | aviso + hecho | señal + aviso + pendiente, según la regla |

`supersedes_observer` decía `work_scan_pending_actions` —el barrido entero— y la guarda
hacía `return 0` al principio de la función.

**Consecuencia, medida contra base real:** una empresa que adoptaba «acción vencida»
dejaba de recibir el aviso de verificar la eficacia. Ninguna de las veintiséis plantillas
lo releva. Nadie se lo dijo.

**Veredicto:** el relevo era correcto para la condición 1 y **una pérdida** para la 2. Se
arregla en 0153 llevando el relevo a la granularidad de la condición. La prueba `M4b`
reproduce el defecto con la forma vieja y comprueba el arreglo con la nueva: no se
argumenta, se ejecuta.

---

## 2 · `quality_scan_pending_measurements` · el único relevo limpio

| | VIEJO | NUEVO · `indicator_measurement_due` |
|---|---|---|
| condición | terminó el periodo y no hay medición | la misma |
| condiciones del barrido | **una sola** | — |
| sujeto | `quality_indicator` | `quality_indicator` |

**Veredicto: SEGURO, y ya estaba hecho.** Y lo era por una razón concreta que nadie había
escrito: este barrido observa **una** condición, así que apagarlo entero no apagaba nada
más. Es el único de los ocho del que se podía decir eso.

---

## 3 · Los seis barridos sin relevo

### `quality_scan_audits` · **KEEP**

Cinco condiciones. La única con candidata es «hallazgo sin evaluar»:

| | VIEJO | NUEVO · `audit_finding_awaiting_assessment_window` |
|---|---|---|
| umbral | **14 días** | **30 días** |
| cobertura | 1 de 5 condiciones | 1 |

**NO EQUIVALENTE.** Relevarlo dejaría a la empresa dos semanas más sin aviso, y de paso
apagaría las otras cuatro condiciones.

### `quality_scan_customer_voice` · **KEEP**

Cinco condiciones. Candidata: `customer_metric_deterioration`, que observa un delta menor
que −5 sobre la fuente `customer_metric`. El barrido usa su propio umbral y su propia
definición de comparabilidad.

**NO EQUIVALENTE.** Umbrales distintos sobre la misma verdad no son la misma condición.

### `quality_scan_management_reviews` · **KEEP**

Cuatro condiciones, tres puramente temporales. La única plantilla del dominio,
`management_review_source_updated`, observa otra cosa: que la fuente de una entrada
automática cambió después de prepararla.

**NO EQUIVALENTE.** Ni el sujeto ni la condición coinciden.

### `quality_scan_people_signals` · **KEEP**

Siete condiciones. Dos candidatas y ninguna sirve:

| Condición | Candidata | Por qué no |
|---|---|---|
| conocimiento en una sola persona | `knowledge_single_holder_critical` | observa lo mismo, pero relevar el barrido apagaría las otras seis |
| evidencia de competencia | `competency_evidence_expiring_window` | avisa 60 días **antes**; el barrido avisa también cuando **ya** caducó |

**NO EQUIVALENTE**, y cuatro de las siete son tareas propias del dominio (QI-24).

Con la granularidad por condición de 0153, la primera pasa a ser posible. Queda
comprobar la paridad del filtro de criticidad antes de hacerlo.

### `quality_scan_risk_reviews` · **REWRITE**

Es el barrido de **una sola** condición, así que sería el candidato natural.

| | VIEJO | NUEVO · plantilla hipotética |
|---|---|---|
| campo | `quality_risks.next_review_on` | `next_review_on` — existe en la fuente |
| filtro | `status = 'active'` | **no se puede expresar** |
| sujetos de la fuente | riesgos activos | todo riesgo **no cerrado** |

**NO EQUIVALENTE**, y por un motivo preciso: la fuente `risk` no expone `status` entre sus
campos, así que una regla no puede limitarse a los riesgos activos. Sería más ancha, y
avisaría de borradores.

La plantilla más cercana, `risk_treatment_overdue`, mira `treatment_review_on`: otro
campo y otra fecha.

**Lo que falta:** un campo `status` en la fuente `risk` y su valor en el despachador de
sujetos. Eso es QUALITY-11, no convergencia de atención, y hacerlo aquí sería tocar el
motor por comodidad.

### `quality_scan_supplier_reviews` · **KEEP**

Cuatro condiciones. Candidata: `supplier_critical_reevaluation_overdue`.

| | VIEJO | NUEVO |
|---|---|---|
| sujeto | **perfil** de proveedor | **alcance** |
| filtro | ninguno por criticidad | solo criticidad alta |
| enlace | ficha del proveedor | alcance |

**NO EQUIVALENTE.** El observador nuevo es más **estrecho**: relevar dejaría sin aviso a
todos los proveedores no críticos. Y cambia el sujeto, y con él el destino del enlace.

---

## 4 · Las cuatro tablas de señal

| Tabla | Veredicto | Por qué |
|---|---|---|
| `quality_risk_signals` | **DEFER** | **no la escribe nadie**. Relevarla sería relevar el vacío. Borrarla es limpieza, y no es de este tramo |
| `quality_supplier_signals` | **KEEP** | no es un observador: es el almacén de su barrido, y tiene consumidor |
| `quality_customer_signals` | **KEEP** | ídem |
| `quality_knowledge_signals` | **KEEP** | ídem |

---

## 5 · Resumen

| Veredicto | Cuántos |
|---|---|
| **KEEP** | 8 |
| **REWRITE** | 1 · `quality_scan_risk_reviews`, cuando la fuente exponga `status` |
| **DEFER** | 1 · `quality_risk_signals`, dormida |
| **SUPERSEDE** | 0 nuevos |

**Ningún relevo nuevo, y eso es el resultado, no la falta de él.** Las diez comprobaciones
salen NO EQUIVALENTE con las plantillas de hoy. Forzar diez supersesiones habría apagado
condiciones que nadie observa, que es exactamente lo que ya había pasado una vez y lo que
este tramo encontró.

**Ningún barrido se ha borrado, desactivado ni tocado**, salvo los dos que ya cedían, y a
esos solo se les cambió DÓNDE preguntan si les toca callar.
