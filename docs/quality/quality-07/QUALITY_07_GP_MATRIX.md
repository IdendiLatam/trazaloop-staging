# QUALITY-07 · Matriz GP-01 … GP-33

Cada decisión del conjunto congelado, dónde vive y qué la comprueba.

| GP | Decisión | Dónde vive | Prueba |
|---|---|---|---|
| **GP-01** | El proveedor es un objeto del sistema de gestión, no de compras | `quality_supplier_profiles`; sin pedidos, precios ni facturas | K1, K2 |
| **GP-02** | La identidad de la empresa externa es transversal | `quality_external_parties` + `_roles` | A1 |
| **GP-03** | Proveedor ≠ sede ≠ categoría ≠ alcance | cuatro tablas; `quality_supplier_scopes` como unidad | B1, B2 |
| **GP-04** | El proveedor de Quality es un PAPEL de esa empresa | `quality_supplier_profiles.party_id` + papel `supplier` | A1, A2 |
| **GP-05** | La criticidad se clasifica con metodología versionada | `quality_supplier_criticality_assessments.version_id` | C1, C2 · RLS E1 |
| **GP-06** | Tres grados de exigencia: informativo, exigido, bloqueante | `quality_supplier_requirements.enforcement` | O1, O3 |
| **GP-07** | Homologar es responsabilidad de la empresa | `quality_decides_supplier_approval` — sin `consultant` | D5 · RLS J2, J3 |
| **GP-08** | La lista de proveedores aprobados se DERIVA | `v_quality_approved_supplier_list` | RLS B3 |
| **GP-09** | La decisión se toma sobre un alcance | `quality_supplier_approval_decisions.scope_id not null` | B2 · RLS B2 |
| **GP-10** | La reevaluación tiene cadencia configurable | `reevaluation_months` + `next_review_on` | G1, G2 |
| **GP-11** | Un alcance sin decidir no es «no aprobado» | `is_approved_now` distingue nulo de negativo | RLS B2, F1 |
| **GP-12** | La puntuación informa; no homologa | `scoreApproves() === false` · `decides_nothing` | D1, D2 · RLS C4 |
| **GP-13** | La decisión exige fundamento | `rationale not null` | D3 · RLS B4 |
| **GP-14** | Se puede preguntar al pasado | `quality_supplier_*_on(org, scope, fecha)` | O2 · RLS F1…F4 |
| **GP-15** | La evaluación conserva la versión con la que se hizo | `quality_supplier_evaluations.version_id` | F1, F2 · RLS D1 |
| **GP-16** | Una evaluación cerrada es final | `quality_supplier_evaluation_is_closed` | F2bis · RLS C5, C6 |
| **GP-17** | El requisito puede vivir en TrazaDocs y aquí se REFERENCIA | `trazadoc_document_id` | — (no se copia texto) |
| **GP-18** | Un documento vencido no suspende a nadie | barrido: cambia el papel, no la decisión | G4 · RLS G3 |
| **GP-19** | Una aprobación condicionada dice sus condiciones | RPC + acción de servidor | D6 · RLS B5 |
| **GP-20** | La criticidad modula la frecuencia de revisión | `review_months` de la banda de resultado | C4 · RLS E2 |
| **GP-21** | Un incidente no es una no conformidad | sin clasificación en la tabla; `INCIDENT_IS_NOT_NC` | H1 · RLS H1 |
| **GP-22** | Escalar abre un caso SIN clasificar | `quality_open_case_from_supplier_incident` | H2 · RLS H2 |
| **GP-23** | El plan de mejora de un proveedor es una acción del motor | `work_actions` + `work_references` | I5 |
| **GP-24** | La tendencia solo se afirma cuando hay con qué | `describeTrend` | N1 |
| **GP-25** | Vencer no es suspender | `EXPIRY_IS_NOT_SUSPENSION`; el barrido no toca decisiones | G4 · RLS G2, G3 |
| **GP-26** | Una racha de incidentes avisa; no decide | alerta `supplier_incident_streak` | H4 |
| **GP-27** | «No aplica» no cuenta como cero | restricción de tabla + `countsTowardsScore` | E1…E5 · RLS C2, C3 |
| **GP-28** | Se dice cuánto se pudo mirar | `summarizeOutcomes` en pantalla y en papel | E4 |
| **GP-29** | Retirar conserva; borrar solo sin historia | dictamen + guardia `before delete` | L1 · RLS K1…K5 |
| **GP-30** | Los actos formales son inmutables | tres disparadores de inmutabilidad | C2, D4 · RLS E4, I3 |
| **GP-31** | Suspender un alcance no toca los demás | decisión por alcance | RLS I1 |
| **GP-32** | Lo de otra empresa no existe | RLS deny-by-default + definer con pertenencia | J1…J5 · RLS L1…L7 |
| **GP-33** | PCR y Textiles siguen funcionando igual | puente opcional, sin migración de datos | A2 · RLS A3, K4 |

**Leyenda:** las claves sin prefijo son de `test:quality07`; las que llevan
`RLS` son de `test:quality07-rls`.

## Desviaciones declaradas

**Una tabla de evaluaciones, no tres.** El encargo enumera «evaluación de
selección», «evaluación periódica» y «reevaluación» como nombres lógicos
distintos. Se modelaron como `evaluation_kind` sobre una sola tabla: habrían
compartido criterios, resultados, cálculo, cierre y papel, y la primera
divergencia entre ellas habría sido un error, no una decisión.

**GP-17 sin prueba propia.** La columna `trazadoc_document_id` existe en
requisitos y en resultados de evaluación, pero no hay una comprobación dedicada
porque no hay nada que pueda romperse en silencio: no se copia texto a ninguna
parte, así que no hay dos versiones que puedan divergir.
