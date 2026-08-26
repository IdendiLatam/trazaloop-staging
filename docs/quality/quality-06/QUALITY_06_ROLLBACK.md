# QUALITY-06 · Reversión

## 1 · Qué se puede revertir y qué no

**Se puede revertir sin daño:** el código. Volver el despliegue a `6a3f40b`
—el baseline `baseline/quality-05-post-export`— deja la aplicación exactamente
como estaba antes del sprint. Las tablas de 0123 quedan presentes y vacías de
uso; ninguna pantalla anterior las consulta.

**No se deben revertir las migraciones.** 0123 y 0124 son append-only y, salvo
un caso, solo añaden. Deshacerla con un `drop table` destruiría historia si alguien ya la usó.

## 2 · Lo único que 0123 cambia de lo anterior

Tres cosas tocan objetos previos. Ninguna borra datos:

| Cambio | Reversible por | Efecto de no revertirlo |
|---|---|---|
| `quality_position_assignments.profile_id` deja de ser `not null`, gana `person_id` y un CHECK de actor | `alter column profile_id set not null` **solo si** ninguna fila tiene `profile_id` nulo | Ninguno: QUALITY-01 sigue insertando por cuenta y el CHECK lo acepta |
| `quality_assignment_profile_must_belong()` comprueba la membresía **solo cuando hay cuenta** | `create or replace` con el cuerpo de 0112 | Si se revierte con personas sin cuenta ya asignadas, esas asignaciones dejan de poder editarse |
| `v_quality_position_current_holder` resuelve el nombre desde la persona y añade dos columnas al final | `create or replace` con el cuerpo de 0112 | Si se revierte, el titular sin cuenta vuelve a aparecer en blanco en procesos, indicadores, objetivos y casos |
| Los catálogos cerrados de `work_*` admiten los valores nuevos | `alter ... drop/add constraint` con la lista de 0122 | Solo posible si no hay filas con los valores nuevos |

El **backfill** de personas (una persona por cada cuenta que ocupa un cargo) crea
filas. Revertirlo sería borrar personas, y eso no se hace: si el sprint se
descarta, esas fichas simplemente dejan de mostrarse.

## 3 · Reversión de código, paso a paso

```bash
git checkout baseline/quality-05-post-export
# desplegar ese commit en el entorno afectado
```

Production **no** requiere ninguna acción: nunca recibió 0123 y sigue en 0122.

## 4 · Qué NO hacer

- **No** `supabase migration repair`. El histórico de migraciones es el registro
  de lo que pasó; repararlo lo convierte en una versión conveniente de los
  hechos.
- **No** editar una migración ya aplicada a un entorno compartido. Cuando la
  revisión de §68 mostró que faltaban las tareas del barrido, la corrección fue
  **0124**, no un `repair` sobre 0123. Cualquier corrección posterior va en 0125.
- **No** borrar filas de `quality_position_assignments`,
  `quality_person_competencies`, `quality_performance_evaluations`,
  `quality_learning_effectiveness_reviews`, `quality_knowledge_transfer_plans` ni
  `quality_lessons_learned` para «limpiar»: esas tablas son la historia, y los
  veredictos de borrado ya lo impiden desde la aplicación.
- **No** debilitar una invariante para poder retirar datos de prueba. Si un
  objeto queda por inmutabilidad legítima, se retira **lógicamente** y se
  documenta.

## 5 · Retirada de datos de prueba

Todo lo que este sprint crea admite retirada lógica:

| Entidad | Cómo se retira |
|---|---|
| Persona | `status = 'former'` con `left_on` |
| Cargo / competencia | `is_active = false` |
| Unidad | `is_active = false` |
| Conocimiento | `status = 'retired'` |
| Lección | `status = 'archived'` |
| Señal de continuidad | `status = 'dismissed'` |
| Ciclo de desempeño | `status = 'closed'` |

Y `quality_deletion_eligibility` responde, para persona, competencia,
conocimiento y lección, si el borrado duro es posible **y qué lo retiene**. Si no
lo es, ofrece la alternativa correcta en vez de un error.
