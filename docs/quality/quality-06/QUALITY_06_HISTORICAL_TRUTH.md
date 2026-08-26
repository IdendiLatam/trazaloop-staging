# QUALITY-06 · Verdad histórica

**Pregunta que este documento responde:** ¿por qué un informe de marzo dice lo
que decía en marzo, y no lo que diríamos hoy?

## 1 · La regla

MDR-33 separa dos cosas que se confunden con facilidad:

- **Responsabilidad persistente** → es del **cargo**. El Responsable del Proceso
  es «Coordinador de Calidad», y lo sigue siendo cuando la persona se va.
- **Acto histórico** → es de la **persona** que lo ejecutó. Quien firmó la
  revisión de marzo fue Carlos López, y eso no cambia porque hoy el cargo lo
  ocupe Ana.

Reconstruir el pasado con los valores actuales no es un atajo: es afirmar algo
falso con formato de prueba.

## 2 · Las seis preguntas del §54, y cómo se responden

| Pregunta | Cómo se responde | Dónde |
|---|---|---|
| ¿Quién ocupaba este cargo el 15/03? | `quality_position_holders_on(org, cargo, fecha)` | Asignaciones con vigencia; nunca la actual |
| ¿Qué perfil de cargo regía? | `quality_position_version_on(org, cargo, fecha)` | `quality_position_versions` con `effective_from`/`effective_to` |
| ¿Qué competencias se exigían? | `quality_required_level_on(org, cargo, competencia, fecha)` | El requisito cuelga de la **versión**, no del cargo |
| ¿Qué competencia se había demostrado? | `quality_demonstrated_level_on(org, persona, competencia, fecha)` | La decisión vigente entonces, por cadena de sustitución |
| ¿Qué evidencia estaba vigente? | Ficha de persona: cada evidencia lleva emisión y vencimiento | `quality_competency_evidence` |
| ¿Qué evaluación correspondía a ese periodo? | El ciclo tiene periodo, y la evaluación cerrada conserva lo firmado | `quality_performance_cycles` + `_evaluations` |
| ¿Qué conocimiento tenía holders registrados? | `quality_knowledge_holders` con `since_on`/`until_on` | Ficha de conocimiento |

## 3 · Los tres mecanismos que lo sostienen

**Vigencias, no sobrescritura.** Cerrar una asignación pone `effective_to`; la
fila anterior se conserva íntegra. La alternativa —editar la fila— convertiría
«Ana ocupó el cargo hasta junio» en «el cargo siempre lo ocupó Carlos».

**Versiones, no edición.** Publicar un perfil nuevo marca el anterior como
`superseded` y le pone `effective_to = nueva vigencia − 1 día`. La RPC
`quality_publish_position_version` es la única vía y no deja dos vigentes.

**Sustitución, no reescritura.** `quality_record_person_competence` inserta una
decisión nueva y marca la anterior `superseded` enlazándola por `superseded_by`.
Lo que se declaró en julio sigue diciendo lo que decía.

## 4 · PC-23, demostrado

El escenario B de `tests/rls/quality-06-people-competence-knowledge.test.ts` hace
exactamente esto:

1. el perfil v1 exige nivel 2; Carlos demuestra 2 → sin brecha;
2. se publica el perfil v2 exigiendo 3;
3. se vuelve a preguntar **por la fecha de entonces**: el requisito sigue siendo
   2 y la evaluación de entonces sigue cumpliendo;
4. se pregunta por hoy: el requisito es 3 y la brecha es 1.

Si el requisito colgara del cargo en vez de la versión, el paso 3 devolvería 3 y
una persona que cumplió pasaría a figurar como incumplida en un periodo que ya
está cerrado.

## 5 · Lo que NO se puede reconstruir, y se dice

| Documento | Por qué no |
|---|---|
| Organigrama en una fecha | Las **unidades** y la jerarquía de cargos no se versionan. Las asignaciones sí llevan fechas —por eso existe «Titulares de cargos en una fecha»— pero la estructura de un día pasado no se puede afirmar con verdad |
| Listado de personas en una fecha | El listado retrata quién está vinculado hoy. La historia de cada persona va en su ficha, con sus vigencias |
| Necesidad de desarrollo en una fecha | Conserva su origen y su fecha, pero no versiones de sí misma |
| Catálogo de competencias en una fecha | Lo que conserva historia no es la competencia sino el **requisito**, y ese vive en la versión del perfil |

Cada uno de estos casos declara su motivo en `historicalLimitReason` dentro de su
definición de exportación, y una prueba comprueba que ninguno diga «actual» sin
explicar por qué.
