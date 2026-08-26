# QUALITY-05 · Modelo de datos

**Migración:** `0122_quality_risks_and_opportunities.sql` · append-only · no altera 0001–0121.

Los nombres no son una elección de este sprint: salen del inventario de entidades
lógicas del *Quality Architecture Baseline v1.0* (§21.9) y de los patrones
relacionales de §22.9. Cambiarlos por otros «más bonitos» habría violado MDR-38.

## 1 · Metodología (RO-03, RO-04, RO-15, MDR-08)

| Tabla | Qué guarda | Por qué existe |
|---|---|---|
| `quality_risk_methodologies` | Identidad estable: código, nombre, `applies_to`, enfoque | RO-03. `applies_to` ∈ (`risk`,`opportunity`) es lo que cumple RO-15: la priorización de oportunidades usa **su** metodología, no la de riesgos con otras etiquetas |
| `quality_risk_methodology_versions` | Revisión inmutable: número, estado, vigencia, regla de combinación | MDR-08. Publicada deja de editarse; una evaluación de 2026 se sigue explicando con lo que regía en 2026 |
| `quality_risk_scales` | Dimensiones de una versión, y **la escala de resultado** | `scale_kind` ∈ (`dimension`,`result`). La matriz no está cableada: se declara |
| `quality_risk_scale_levels` | Niveles. En la escala `result`, además: banda de puntaje, si es aceptable y cada cuánto obliga a revisar | RO-08 (apetito) y RO-35 (periodicidad por criticidad, no por aniversario) |

No hay tabla de «matriz». La matriz **es** el producto de las dimensiones más las
bandas: dibujarla es recorrer las escalas y aplicar la regla. Una tabla de celdas
habría duplicado un dato derivable y habría podido contradecir a la regla.

## 2 · Riesgo (RO-01, RO-13.1, RO-18, RO-29)

| Tabla | Qué guarda |
|---|---|
| `quality_risks` | El EVENTO (`event_description`, obligatorio), identidad, código reservado, propietario por **cargo**, estado administrativo, regla de revisión, cierre y sucesión |
| `quality_risk_causes` | Por qué podría pasar, con su origen |
| `quality_risk_consequences` | Qué pasaría, con el área sobre la que recae |
| `quality_risk_processes` | N:M con procesos (§22.9) |
| `quality_risk_objectives` | N:M con objetivos |
| `quality_risk_codes` | Reserva de numeración (D-04) |

CAUSA → EVENTO → CONSECUENCIA son **tres sitios**, no un textarea. Un riesgo real
tiene varias causas y varias consecuencias, y cada una se ataca distinto: meterlas
en un párrafo impide relacionarlas, contarlas o tratarlas por separado.

`status` (borrador/activo/cerrado/retirado/sustituido) **no es** el nivel. RO-18
los separa y el modelo también: el nivel no vive en esta tabla.

## 3 · Controles (RO-06, RO-24, RO-25, RO-26)

| Tabla | Qué guarda |
|---|---|
| `quality_controls` | Control existente: naturaleza (preventivo/detectivo/correctivo), modo (manual/automático/mixto), frecuencia, dueño por cargo, estado |
| `quality_risk_control_links` | N:M riesgo ↔ control |
| `quality_control_activity_links` | Dónde opera (hoy procesos; las etapas llegarán con MDR-14) |
| `quality_control_effectiveness_reviews` | Diseño, implementación y eficacia **por separado**, con su criterio |
| `quality_control_codes` | Reserva de numeración |

Un control **no tiene fecha de vencimiento**: eso es una acción. Es la diferencia
que RO-06 protege y que el esquema hace imposible confundir.

## 4 · Evaluaciones (RO-07, RO-09, MDR-10, MDR-36)

| Tabla | Qué guarda |
|---|---|
| `quality_risk_assessments` | Una evaluación formal: tipo (`inherent`/`residual`), **FK a la versión**, puntaje derivado, nivel, la explicación, quién y cuándo |
| `quality_risk_assessment_factors` | Un nivel por dimensión, con **FK real** al nivel de escala |
| `quality_opportunity_assessments` | Priorización y beneficio realizado (RO-16) |
| `quality_opportunity_assessment_factors` | Sus factores |

Dos decisiones que sostienen todo:

- **No existe `quality_risks.current_score`.** El nivel vigente es una vista. Si
  viviera en la fila, alguien tendría que mantenerlo y acabaría diciendo algo
  distinto de las evaluaciones.
- **Los factores son una relación, no un JSON** (MDR-10). La FK al nivel de
  escala es lo que IMPIDE por construcción usar un valor que no pertenece a la
  versión con la que se está evaluando.

## 5 · Tratamiento, materialización y señales

| Tabla | Qué guarda |
|---|---|
| `quality_risk_treatment_plans` | La ESTRATEGIA (evitar/reducir/transferir/aceptar), su fundamento, sobre qué evaluación se decidió, si exigió aprobación, quién aprobó y cuándo se revisa |
| `quality_risk_materializations` | El hecho: cuándo ocurrió, qué pasó, gravedad, y el caso que alguien decidió abrir después |
| `quality_risk_signals` | RO-13: una señal sugiere mirar; no es un riesgo formal |

## 6 · Oportunidades (RO-01, MDR-22, RO-31)

`quality_opportunities` es **una identidad transversal con tipos semánticos**
(MDR-22): `opportunity_kind` distingue de dónde viene sin partirla en una tabla
por origen. Su catálogo de decisión es propio —perseguir, aplazar, descartar,
convertir en objetivo— porque «evitar» o «transferir» aplicados a una oportunidad
no significan nada.

## 7 · Lo que NO se creó

`risk_actions`, `risk_tasks`, `risk_alerts`, `risk_files`, `risk_indicators`. MDR-46:
acciones, evidencias, tareas y alertas son transversales. QUALITY-04 ya las
construyó; aquí se **ensanchan** sus catálogos cerrados de forma aditiva y se
reescribe `work_reference_must_be_valid()` para que sepa validar los cinco
propietarios nuevos.

## 8 · Multi-tenant (MDR-03, MDR-42)

Toda tabla lleva `organization_id` explícito, y **toda** relación entre entidades
de empresa usa FK compuesta `(organization_id, id)`: las dos puntas tienen que ser
de la misma empresa, y eso lo garantiza el esquema, no una comprobación de
aplicación.
