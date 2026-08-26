# QUALITY-06 · Modelo de desarrollo

## 1 · Por qué el dominio se llama DESARROLLO

PC-08. La formación es **un** tipo de desarrollo; también lo son la práctica
supervisada, la mentoría, el acompañamiento, la rotación, el autoestudio, la
experiencia dirigida y la inducción.

Llamar «capacitación» al dominio entero no es un problema de vocabulario: empuja
a que la respuesta a cualquier brecha sea inscribir a alguien en un curso que no
resuelve nada. `DEVELOPMENT_KINDS` tiene nueve valores y solo uno es
`training`; el desplegable de la pantalla los ofrece todos, y una prueba
comprueba que sigan siendo nueve.

## 2 · Las cinco capas, y por qué no se colapsan

| Capa | Pregunta | Dónde se registra |
|---|---|---|
| **Necesidad** | ¿Qué hace falta desarrollar, y por qué? | `quality_development_needs` |
| **Plan** | ¿Qué se pretende hacer este año? | `quality_development_plans` + `_items` |
| **Actividad** | ¿Qué se hizo de verdad? | `quality_learning_activities` |
| **Participación** | ¿Quién asistió, y qué aprendió? | `quality_learning_participants` |
| **Eficacia** | ¿Sirvió? | `quality_learning_effectiveness_reviews` |

Mezclar plan y actividad hace imposible responder «se planeó y no se hizo».
Mezclar asistencia y aprendizaje hace imposible registrar a quien fue a todo y no
demostró nada. Mezclar aprendizaje y eficacia hace que aprobar un cuestionario
parezca que el problema se resolvió.

## 3 · La necesidad conserva su origen

`origin_kind` admite: brecha de competencia, nuevo cargo, cambio de proceso,
cambio documental, auditoría, riesgo, evaluación, cambio tecnológico, lección
aprendida y decisión humana. Además guarda la persona, el cargo y la competencia
relacionados cuando existen.

Sin eso, dentro de seis meses nadie puede responder «¿por qué estábamos formando
a esta persona en marzo?».

Una necesidad **sin persona** es una necesidad del cargo o de la empresa, y por
eso la ve cualquier miembro; en cuanto nombra a alguien pasa al círculo de
privacidad de la ficha.

## 4 · El plan es anual y está vivo

PC-14 y DA-22 piden un plan formal anual **con actualización continua**. Congelar
enero y bloquear el resto del año convierte el plan en un trámite.

Cada item guarda `added_on` y `added_reason`. La ficha del plan imprime dos
bloques separados —«previsto al inicio del año» e «incorporado durante el año»—
porque un plan que no los distingue parece que lo tenía todo previsto desde
enero, y entonces no se puede revisar.

## 5 · Asistencia ≠ aprendizaje

Dos columnas distintas en la misma fila, a propósito:

- `attendance_status`: inscrita / asistió / asistió parcialmente / no asistió /
  cancelada;
- `learning_result`: **no se evalúa** / pendiente de evaluar / demostró
  aprendizaje / no demostró aprendizaje.

`not_evaluated` es una respuesta legítima: no toda actividad se evalúa. Y ninguna
acción de servidor rellena una columna al escribir la otra — hay dos formularios
distintos y una prueba comprueba que no se toquen.

## 6 · Aprendizaje ≠ competencia

Aprobar una evaluación de aprendizaje no declara competencia. La competencia se
declara en la ficha de la persona, con su método y su fundamento, y la actividad
puede figurar como **evidencia** entre otras.

## 7 · Eficacia · la cuarta capa

`quality_learning_effectiveness_reviews` guarda:

- el **criterio**, obligatorio y declarado **antes** de juzgar — si no, se acaba
  justificando el resultado que salió;
- el **método**: observación, evaluación práctica, indicador, auditoría,
  desempeño del proceso, evidencia u otro;
- cuando el criterio es un indicador, se **referencia** (`indicator_id`); no se
  copian valores;
- el resultado: pendiente / eficaz / parcialmente eficaz / **no eficaz**.

Terminar la actividad no crea ninguna evaluación de eficacia ni la resuelve. El
escenario C de la suite RLS lo comprueba: tras marcar la actividad como
`completed`, hay cero evaluaciones fabricadas y el resultado nace `pending`.

## 8 · Un «no eficaz» se conserva

La RPC `quality_review_learning_effectiveness` rechaza reescribir una eficacia ya
evaluada. Si hace falta otra acción, será **otra** acción, con su propio criterio
y su propia eficacia. Maquillar el resultado anterior borraría la única
información que hace útil el registro.

## 9 · Development item ≠ acción del SGC

§53. Un item del plan de desarrollo **no** se convierte automáticamente en
`work_action`. Puede generar una **tarea** de ejecución; si la situación merece
una acción formal del sistema de gestión, alguien autorizado la crea
explícitamente. Una prueba comprueba que ninguna vía del dominio inserte en
`work_actions`.
