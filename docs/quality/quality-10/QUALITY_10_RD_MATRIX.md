# QUALITY-10 · Matriz RD-01 … RD-20

Cada decisión congelada, dónde vive en el código y cómo se demuestra.
Ninguna se marca cumplida por la mera existencia de una tabla.

| # | Decisión | Dónde vive | Evidencia | Estado |
|---|---|---|---|---|
| **RD-01** | La frecuencia de la revisión es configurable | `next_review_planned_on` + `next_review_note`; ningún «anual» en el modelo · `FREQUENCY_IS_CONFIGURABLE` | `test:quality10` A4 | **IMPLEMENTED** |
| **RD-02** | Las entradas salen de objetos reales del sistema | 14 adaptadores `quality_mr_src_*` sobre Q01…Q09 | `test:quality10` C3 · `-rls` A2, C1, D2, J1 | **IMPLEMENTED** |
| **RD-03** | Quality genera un expediente previo automático | `quality_mr_prepare_inputs` recorre el catálogo y llama al despachador | `test:quality10` G1 · `-rls` A2 | **IMPLEMENTED** |
| **RD-04** | La revisión conserva una instantánea de lo presentado | `inputs.snapshot` por entrada + `minutes.snapshot` del conjunto | `test:quality10` J1, J3 · `-rls` I3, I8 | **IMPLEMENTED** |
| **RD-05** | Información, discusión, conclusión y decisión son distintas | `snapshot` / `analysis` / `conclusion` / `quality_management_review_decisions` | `test:quality10` E1, E2, E3, H3 · `-rls` G4 | **IMPLEMENTED** |
| **RD-06** | Las decisiones son objetos reales del sistema | Tabla propia + hecho formal en `work_decisions` | `test:quality10` H1 · `-rls` F1, F3 | **IMPLEMENTED** |
| **RD-07** | El acta se genera desde datos estructurados | `quality_mr_issue_minutes` deriva de revisión, entradas, análisis, decisiones y participantes | `test:quality10` J2 · `-rls` I3 | **IMPLEMENTED** |
| **RD-08** | Cerrar la sesión no cierra las acciones derivadas | `quality_mr_close_review` sin exigencia sobre acciones + `p_followup_note` | `test:quality10` K1 · `-rls` I4, I5 | **IMPLEMENTED** |
| **RD-09** | «Quality by Observation»: no se vuelve a teclear | Los 14 adaptadores leen; ninguno escribe en su dominio | `test:quality10` E4 · `-rls` A0–A2 | **IMPLEMENTED** |
| **RD-10** | La IA no toma decisiones formales de la dirección | Cero llamadas a modelo en todo el dominio · `AI_DOES_NOT_DECIDE` · `aiConcludes()` = `false` | `test:quality10` Q1, Q2, Q3 | **IMPLEMENTED** |
| **RD-11** | Revisiones completas, extraordinarias y temáticas | `review_kind ∈ (full, extraordinary, thematic)` | `test:quality10` A4 | **IMPLEMENTED** |
| **RD-12** | Los compromisos anteriores aparecen solos en el ciclo siguiente | `quality_mr_src_previous_actions`, primera de las catorce | `test:quality10` I6 · `-rls` J1–J3 | **IMPLEMENTED** |
| **RD-13** | Una decisión puede generar acciones, cambios, recursos, objetivos, riesgos u oportunidades | Nueve clases de `decision_kind` + `quality_mr_create_action_from_decision` | `test:quality10` H4 · `-rls` F4 | **IMPLEMENTED** |
| **RD-14** | La información de personas es agregada o estrictamente necesaria | `quality_mr_src_resources` sin nombres · `PEOPLE_DATA_IS_AGGREGATED` | `test:quality10` M4 | **IMPLEMENTED** |
| **RD-15** | La IA hereda los permisos de la revisión | **No aplica todavía**: no hay IA. Lo que sí se dejó preparado es que la revisión no guarda nada que su lector no pudiera ver por sí mismo —agregados y referencias—, de modo que heredar sus permisos no dará acceso a nada nuevo | `test:quality10` M1–M5 | **NOT_APPLICABLE** — se implementa con la IA, en QUALITY-12 |
| **RD-16** | La revisión puede comparar el periodo actual con anteriores | `v_quality_management_review_input_status` expone la misma entrada por revisión y periodo; `previous_actions` trae el ciclo anterior | `test:quality10` H6 · `-rls` J1 | **PARTIAL** — la comparación se puede componer sobre la vista; la pantalla todavía no la pinta lado a lado |
| **RD-17** | Las tendencias priman sobre los datos aislados cuando hay serie | `v_quality_metric_series` en la entrada de cliente; series de medición por periodo en seguimiento | `-rls` C1–C3 | **PARTIAL** — las series llegan al retrato; la lectura de tendencia la hace todavía la persona |
| **RD-18** | El acta emitida es una revisión de documento controlado inmutable | Sin política de escritura + `document_id`/`document_revision_id` hacia TrazaDocs | `test:quality10` J4, J6 · `-rls` I10 | **IMPLEMENTED** |
| **RD-19** | Las acciones derivadas usan el motor transversal | `work_actions` + `work_references`; ninguna tabla de acciones propia | `test:quality10` H2, I1 · `-rls` F4, F5 | **IMPLEMENTED** |
| **RD-20** | Quality puede detectar decisiones o temas recurrentes sin seguimiento eficaz | Los avisos `management_review_action_overdue` y `management_review_followup_pending` existen y el barrido produce el primero | `test:quality10` P3 · `-rls` M1 | **PARTIAL** — la señal por acción vencida funciona; la detección de TEMA recurrente entre revisiones se deja a QUALITY-11, que es el sprint de detección |

**16 IMPLEMENTED · 3 PARTIAL · 1 NOT_APPLICABLE · 0 sin cubrir.**

## Las tres parciales, sin adornos

- **RD-16** — el modelo ya permite comparar: la vista devuelve la misma entrada
  por revisión y periodo, con estado y resumen. Lo que falta es la pantalla que
  ponga 2027 y 2028 en dos columnas. Es trabajo de interfaz, no de modelo.
- **RD-17** — las series llegan al retrato con sus periodos y su marca de rotura
  de comparabilidad. Lo que no hay es una función que diga «esto mejora» o «esto
  empeora»: eso es una lectura, y en este dominio las lecturas las escribe una
  persona. Añadirla sin metodología declarada sería fabricar la conclusión.
- **RD-20** — detectar que la misma decisión se repite sin seguimiento eficaz es
  exactamente lo que QUALITY-11 existe para hacer. Aquí quedan los eventos y los
  avisos que necesita; el detector, no.

## RD-15, con más detalle

No se marca «pendiente» porque no hay nada que implementar todavía: sin IA, no
hay permisos que heredar. Lo que sí se hizo es la parte que le corresponde a
este sprint — que la revisión **no acumule** datos que su lector no podría ver
por sí mismo. Si mañana una IA hereda los permisos de quien la invoca, no
encontrará aquí ninguna respuesta de encuesta, ninguna nota de entrevista y
ningún nombre de una evaluación de desempeño.
