# QUALITY-06 · Modelo de datos

**Migración:** `0123_quality_people_competence_knowledge.sql` · append-only · no altera 0001–0122.

Los nombres salen del inventario lógico del *Quality Architecture Baseline v1.0*
(§7 del encargo). Donde el baseline nombra una entidad y el repositorio ya tenía
otra equivalente, manda el repositorio: `quality_positions` se **evoluciona**, no
se recrea.

## 0 · Discovery: qué se reutiliza y qué se crea

| Concepto | Ya existía | Decisión | Por qué |
|---|---|---|---|
| Cargo | `quality_positions` (0112) | **REUSE + EVOLVE** | Ya lo usan procesos, documentos, indicadores, objetivos, riesgos y tareas. Un segundo catálogo habría partido en dos la responsabilidad estructural. Se le añaden `org_unit_id`, `parent_position_id` e `is_critical` |
| Asignación persona↔cargo | `quality_position_assignments` (0112) | **EVOLVE** | Apuntaba a `profiles`: solo podía ocupar un cargo quien tuviera cuenta. Se añade `person_id`, `profile_id` deja de ser obligatorio, y un CHECK exige al menos uno |
| Persona organizacional | — | **CREATE** | `profiles` es una cuenta autenticada, no un ser humano de la organización (PC-05) |
| Unidad de la empresa | `quality_positions.org_unit` (texto libre) | **EVOLVE → CREATE** | El texto libre no soporta jerarquía. Se crea `quality_org_units` y el texto se conserva como respaldo para quien aún no ha estructurado unidades |
| Competencia, desarrollo, desempeño, conocimiento, lecciones | — | **CREATE** | No existía nada equivalente |
| Tareas, alertas, eventos, decisiones, referencias | `work_*` (0116, 0121, 0122) | **REUSE** | Se ensanchan sus catálogos cerrados de forma aditiva. No se crean `quality_people_tasks` ni un segundo almacén de evidencias |
| Motor de exportación | `lib/export/*` (EXPORT-01…01.3) | **REUSE** | 21 definiciones nuevas, un solo endpoint, el encabezado corporativo de 01.2 y la normalización de logo de 01.3 |
| Copiloto / IA | — | **DEFER** | §83: fuera de alcance. Lo que este sprint garantiza es que no haya automatización peligrosa que después haya que desmontar |

## 1 · Estructura (PC-02, §9, §10)

| Tabla | Qué guarda | Por qué existe |
|---|---|---|
| `quality_org_units` | Unidad con `parent_id` opcional y ciclo prohibido por disparador | §9. La jerarquía es opcional: una empresa puede funcionar con una unidad y varios cargos |
| `quality_positions` *(evolucionada)* | `org_unit_id`, `parent_position_id`, `is_critical` | El organigrama se deriva; `is_critical` es lo que hace que quedarse sin titular genere aviso |

No hay tabla de «organigrama». El organigrama **es** la proyección de unidades +
cargos + jerarquía + asignaciones vigentes (`v_quality_org_chart`). Guardar una
imagen habría creado una segunda verdad que envejece sola.

## 2 · Perfil del cargo (§12, §13)

| Tabla | Qué guarda |
|---|---|
| `quality_position_versions` | Propósito, alcance, autoridad, formación y experiencia, con `status` (`draft`/`published`/`superseded`) y vigencia |
| `quality_position_functions` | Funciones estructuradas: responsabilidad, autoridad o actividad, con enlace opcional al proceso (PC-04) |

Un índice único deja **un solo borrador** por cargo, y la RPC de publicación
cierra la versión anterior el día antes. Nunca hay dos vigentes.

## 3 · Persona (PC-01, PC-05, §14)

`quality_people`: nombre, código interno opcional, correo laboral, `profile_id`
**opcional**, relación (`employee`/`contractor`/`temporary`/`intern`/`external`),
estado y fechas relevantes para el SGC.

**Lo que no tiene, y es deliberado:** salario, cuentas bancarias, información
médica, religión, orientación sexual, información familiar, historial
disciplinario. No están pendientes: no pertenecen a un sistema de gestión.
`FORBIDDEN_PERSON_FIELDS` en `lib/domain/quality-people.ts` lo declara como dato
y una prueba lo comprueba contra el esquema real.

Un índice único impide que dos fichas apunten a la misma cuenta dentro de una
empresa: dos fichas para el mismo usuario es como se duplica un historial.

**Backfill.** Se crea una persona por cada cuenta que hoy ocupa un cargo, con su
nombre real, y se enlazan las asignaciones existentes. Sin eso, el historial de
QUALITY-01 habría quedado mudo en el modelo nuevo.

## 4 · Competencia (PC-16, PC-22, PC-23, PC-24)

| Tabla | Qué guarda |
|---|---|
| `quality_competencies` | Catálogo reutilizable de la empresa |
| `quality_competency_levels` | La escala, **configurable**: valor, nombre y qué significa |
| `quality_competency_requirements` | Qué se exige, colgado de `position_version_id` **XOR** `process_id` |
| `quality_person_competencies` | La decisión: nivel demostrado, método, fundamento, quién decidió, y la cadena de sustitución |
| `quality_competency_evidence` | Educación, experiencia, certificación, observación… con vencimiento opcional y enlace a TrazaDocs |

Que el requisito cuelgue de la **versión** del perfil es lo que hace que PC-23 se
cumpla por construcción: al publicar un perfil nuevo, el anterior conserva sus
requisitos y una evaluación pasada se sigue leyendo contra ellos.

## 5 · Desarrollo (PC-08, PC-14, PC-17)

| Tabla | Qué guarda |
|---|---|
| `quality_development_needs` | La necesidad **con su origen** (brecha, auditoría, riesgo, cambio documental, lección…) |
| `quality_development_plans` | Plan anual, único por año y empresa |
| `quality_development_plan_items` | Item con `development_kind` (nueve valores, uno es «formación»), `added_on` y `added_reason` |
| `quality_learning_activities` | Lo que se ejecutó, con sus fechas reales |
| `quality_learning_participants` | Asistencia y aprendizaje en **columnas distintas** |
| `quality_learning_effectiveness_reviews` | Criterio declarado antes, método, resultado y observación |

## 6 · Desempeño (PC-06, PC-13, PC-28)

| Tabla | Qué guarda |
|---|---|
| `quality_performance_cycles` | Periodo y estado |
| `quality_performance_cycle_members` | **Población aplicable**, declarada: sin ella «aplicable» acabaría siendo «los que alguien alcanzó a evaluar» |
| `quality_performance_evaluations` | Persona, cargo de entonces, evaluador, contexto y resultado |
| `quality_performance_items` | Contra qué se evaluó, con resultado cualitativo |

Ninguna de estas tablas escribe en `quality_person_competencies`. Competencia y
desempeño son dominios separados y la RPC de cierre lo demuestra: no toca la
competencia declarada de nadie.

## 7 · Conocimiento y lecciones (PC-18…PC-21)

| Tabla | Qué guarda |
|---|---|
| `quality_knowledge_items` | Explícito, tácito o mixto; criticidad y estado de documentación |
| `quality_knowledge_holders` | Quién lo **sostiene**, con `is_primary_holder` explícito y vigencia |
| `quality_knowledge_signals` | Señal de continuidad, idempotente, con la traza de quién la promovió a riesgo |
| `quality_knowledge_transfer_plans` / `_items` | El plan y sus actividades, con verificación aparte |
| `quality_lessons_learned` | Qué ocurrió, qué se aprendió, dónde aplica, qué se recomienda — en cuatro columnas |
| `quality_lesson_proposals` | La propuesta, su decisión y **qué se creó** al aceptarla |

## 8 · Vistas derivadas

Todas con `security_invoker = true`; sin eso, una vista se ejecuta con los
permisos de su dueño y se convierte en un túnel por debajo de RLS.

| Vista | Qué proyecta |
|---|---|
| `v_quality_org_chart` | Unidades + cargos + jerarquía + ocupantes vigentes |
| `v_quality_position_occupants_current` | Todos los ocupantes vigentes hoy, de cualquier tipo |
| `v_quality_competence_matrix` | Requerido · demostrado · brecha · estado de la evidencia |
| `v_quality_knowledge_continuity` | Holders vigentes, señal de concentración, transferencias abiertas |
| `v_quality_position_current_holder` *(0112, actualizada)* | Ahora resuelve el nombre desde la **persona**, y cae al perfil solo como respaldo |

Esa última actualización no es cosmética: sin ella, un titular sin cuenta de
Trazaloop habría dejado en blanco el propietario del proceso, del indicador, del
objetivo y del caso, en silencio.
