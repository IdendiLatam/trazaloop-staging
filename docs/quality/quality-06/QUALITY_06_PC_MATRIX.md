# QUALITY-06 · Matriz PC-01 … PC-28

**Cómo leerla.** `IMPLEMENTED` significa que la decisión está sostenida por algo
que falla si alguien la rompe: una restricción, una política o una prueba.
Existir una tabla no basta.

| # | Decisión | Estado | Evidencia |
|---|---|---|---|
| **PC-01** | Quality administra personas desde el SGC, no como nómina | IMPLEMENTED | `quality_people` sin salario, banco, salud, religión, orientación, familia ni disciplina. `FORBIDDEN_PERSON_FIELDS` + prueba B1/B2 contra el esquema real |
| **PC-02** | El organigrama se genera desde datos estructurados | IMPLEMENTED | `v_quality_org_chart` deriva de unidades + cargos + jerarquía + asignaciones. No hay ninguna columna de imagen ni ruta de subida |
| **PC-03** | Cargo y Persona son independientes | IMPLEMENTED | Tablas distintas unidas por `quality_position_assignments` con vigencia. Prueba A1–A5 y escenario 1 en base real |
| **PC-04** | Las funciones del cargo pueden enlazar actividades de proceso | IMPLEMENTED (alcance actual) | `quality_position_functions.process_id`. El modelo de *actividad* de proceso no existe todavía en la plataforma; se enlaza al proceso, que es el nivel disponible |
| **PC-05** | Persona organizacional y usuario de Trazaloop son entidades distintas | IMPLEMENTED | `profile_id` **opcional** y único por empresa; el guardián de asignación comprueba membresía **solo cuando hay cuenta** |
| **PC-06** | Competencia y desempeño son conceptos separados | IMPLEMENTED | Tablas propias; la RPC de cierre no toca `quality_person_competencies` (prueba C2) y el escenario 7 lo comprueba en base real |
| **PC-07** | La IA no asigna calificaciones finales ni decisiones laborales | IMPLEMENTED (por ausencia) | No hay IA en el sprint (prueba M1). El resultado lo escribe una persona; la RPC exige evaluador y criterios |
| **PC-08** | El desarrollo es más amplio que la formación | IMPLEMENTED | Nueve `DEVELOPMENT_KINDS`; el dominio se llama Desarrollo; prueba E1/E3 |
| **PC-09** | Las acciones evaluables cierran el ciclo con eficacia | IMPLEMENTED | `quality_learning_effectiveness_reviews` con criterio previo; escenarios 4 y 5 |
| **PC-10** | Onboarding/offboarding derivan de cargo, proceso, documentos, competencia y conocimiento | PARTIAL | **Offboarding**: `quality_offboarding_report` completo, con pantalla y escenario 9. **Onboarding**: los datos son derivables —perfil publicado, requisitos, matriz, conocimiento— pero no hay una vista que los reúna en una sola pantalla de incorporación. Ver *gaps* §1 |
| **PC-11** | Se preserva la validez histórica de estructura, cargos, asignaciones, competencias y evaluaciones | IMPLEMENTED | Vigencias, versiones y cadena de sustitución; cuatro funciones `..._on()`; `QUALITY_06_HISTORICAL_TRUTH.md` |
| **PC-12** | La IA solo estructura un CV como propuesta pendiente de validar | NOT APPLICABLE en este sprint | §41 y §83 lo dejan fuera. No se implementó importación de CV, así que no hay ninguna vía por la que un dato entre sin validación humana |
| **PC-13** | El personal aplicable tiene un ciclo formal anual | IMPLEMENTED | `quality_performance_cycles` + `_cycle_members` (población **declarada**, no inferida); escenario 7 |
| **PC-14** | Planificación anual formal con actualización continua | IMPLEMENTED | Plan único por año; `added_on`/`added_reason` por item; la ficha imprime «previsto» e «incorporado» por separado |
| **PC-15** | Asistencia, aprendizaje, competencia y eficacia siguen siendo distintas | IMPLEMENTED | Columnas y tablas separadas; vocabularios disjuntos (prueba D6); escenarios 4 y 5 |
| **PC-16** | Las competencias pueden relacionarse con cargos y con actividades | IMPLEMENTED (alcance actual) | `quality_competency_requirements` con `position_version_id` **XOR** `process_id` |
| **PC-17** | Las brechas generan acciones de desarrollo; no toda brecha implica formación | IMPLEMENTED | Nueve tipos; escenario 3 resuelve una brecha con **práctica supervisada** |
| **PC-18** | El conocimiento crítico es un objeto estructurado | IMPLEMENTED | `quality_knowledge_items` con tipo, criticidad y estado de documentación. Existe sin documento |
| **PC-19** | Las personas sostienen conocimiento sin volverse sus dueñas exclusivas | IMPLEMENTED | La tabla se llama `_holders`; `is_primary_holder` explícito y único; el texto del producto lo dice en ficha, PDF y acción |
| **PC-20** | Quality detecta el riesgo de concentración de conocimiento | IMPLEMENTED | `v_quality_knowledge_continuity` + señal idempotente + tarea de revisión. Promover a riesgo es humano (escenario 8) |
| **PC-21** | Las lecciones aprendidas son objetos gestionados capaces de producir cambios | IMPLEMENTED | Cuatro columnas + propuestas con decisión y `outcome_kind`/`outcome_id` (escenario 10) |
| **PC-22** | La formación puede proponerse desde cambios de documento, proceso, auditoría, riesgo o evaluación | IMPLEMENTED | `origin_kind` de la necesidad cubre los cinco orígenes, y la lección puede proponer `development_action` |
| **PC-23** | Cambiar el perfil de un cargo no reescribe requisitos históricos | IMPLEMENTED | El requisito cuelga de la **versión**; `quality_required_level_on()`; escenario 2; y un PDF histórico de la matriz |
| **PC-24** | Las certificaciones y la evidencia pueden vencer | IMPLEMENTED | `expires_on` opcional; el barrido marca la evidencia y **no** la competencia; el texto dice *revisar* (escenario 6) |
| **PC-25** | Los archivos de personas tienen permisos más estrictos | IMPLEMENTED | Tres círculos en RLS; `quality_can_read_person` fila a fila; bloque J de la suite en base real |
| **PC-26** | Los datos importados de personas deben validarse | NOT APPLICABLE en este sprint | §82 no exige importador. No se construyó ninguno, así que no hay datos importados sin validar. El estado de la persona y su vínculo se declaran a mano |
| **PC-27** | La IA sigue los permisos del usuario para datos de personas | IMPLEMENTED (por arquitectura) | No hay IA, y la lectura de personas pasa siempre por `quality_can_read_person`. Cualquier copiloto futuro tendrá que atravesar la misma puerta: no existe una vía de lectura que la evite |
| **PC-28** | Los datos operacionales apoyan la evaluación pero no la determinan | IMPLEMENTED | No hay puntaje, promedio ni ranking (pruebas C3–C5). El contexto es texto que escribe el evaluador. Ver *gaps* §2: el panel de contexto operacional no está construido, pero la invariante que PC-28 protege sí |

## Gaps reales

**1 · Onboarding sin pantalla propia (PC-10).** Es un *functional gap*, no de
arquitectura: el perfil publicado del cargo ya dice qué funciones, qué autoridad
y qué competencias se exigen; la matriz dice la brecha; el conocimiento dice qué
sostiene el cargo. Lo que falta es la vista que lo reúna al asignar a alguien.
Nada hay que rediseñar para construirla.

**2 · Panel de contexto operacional en la evaluación (PC-28, §39).** El encargo
dice que los datos de indicadores, procesos y casos *pueden ayudar al evaluador*.
Esa ayuda no está construida: la evaluación guarda un `context_note` que escribe
la persona. La prohibición —que esos datos no calculen el resultado— sí está,
por construcción y por prueba.

**3 · Actividades de proceso (PC-04, PC-16).** El modelo de *actividad* dentro de
un proceso no existe en la plataforma. Los requisitos y las funciones se enlazan
al **proceso**, que es el nivel disponible hoy. El esquema ya admite el enlace
por actividad el día que ese modelo exista.

Ninguno de los tres se esconde detrás de «future»: los tres son funcionalidad que
se puede construir sobre lo que este sprint deja, y ninguno afecta a una
invariante de PC.
