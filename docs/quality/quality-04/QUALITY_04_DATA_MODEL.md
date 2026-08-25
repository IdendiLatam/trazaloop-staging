# QUALITY-04 · Modelo de datos

**Migración:** `0121_work_cases_and_actions_engine.sql` (~1 800 líneas).
Append-only. No edita 0001–0120. Sin `migration repair`.

## 1. Por qué el prefijo es `work_` y no `quality_`

AC-01 dice que existe **un** motor de acciones transversal, y AC-02 que el caso
es un **contenedor común con especializaciones semánticas**. Auditorías, Voz del
Cliente, Proveedores, Riesgos y la Revisión por la Dirección lo reutilizarán.

Llamarlo `quality_cases` habría hecho lo mismo que hacen los sistemas que luego
no se pueden extender: convertir la primera experiencia en el dueño del motor.
El prefijo `work_` es el que ya usan `work_tasks`, `work_alerts` y `work_events`
desde 0116, y significa exactamente eso: primitiva transversal.

## 2. Las nueve tablas

### `work_cases` — el contenedor

Identidad estable (`id`), número legible por empresa y año (`C-2026-001`),
título, descripción, `case_type` (la especialización de AC-02), `origin_kind`,
responsable **por cargo** (MDR-33), `classification`, `priority`, `status`.

Y la declaración estructurada de la NC en **tres campos**, no en uno:

```
requirement_text     · qué exige la norma, el documento o el contrato
evidence_text        · qué se observó, con datos
nonconformity_text   · la declaración, en una frase
```

Un solo textarea llamado «descripción de la no conformidad» produce NC que no
se pueden defender en una auditoría, porque mezclan lo que se exigía con lo que
se vio y con la conclusión.

Un CHECK impide una NC sin requisito ni declaración; otro impide que `closed`
y `closed_at` discrepen.

### `work_case_codes` — la lápida del número

Un número asignado queda ocupado **para siempre** dentro de la empresa, aunque
el borrador se elimine. Un `C-2026-001` aparece en actas y correos: que designe
dos cosas distintas en momentos distintos es el problema que D-04 describe para
documentos. **No se generalizó por analogía** (§35): se aplicó porque el número
de caso tiene exactamente la misma propiedad.

### `work_references` — referencias tipadas y validadas

Un caso apunta a un indicador, a una medición, a un documento, a un proceso —y
mañana a una auditoría—. Las dos salidas fáciles son malas:

- un `jsonb {tipo, id}` no valida nada y no se puede consultar;
- quince columnas FK nulas ensucian la tabla y no escalan.

`work_references` usa un **catálogo cerrado** de tipos y un disparador que
comprueba, para cada tipo, que la fila **exista** y que sea de la **misma
empresa**. Lo segundo importa tanto como lo primero: referenciar el indicador de
otra empresa filtraría su existencia.

Sirve para casos **y** para acciones, porque AC-12 dice que una acción puede
tener varios objetos de origen.

`snapshot` congela el **contexto de la decisión** (§58, §59) — «Periodo 2026-01
· resultado 82 · meta 95 · no cumple»—. No es una segunda fuente de verdad
editable: el dato vivo sigue en el indicador, y la interfaz distingue siempre
«referencia» de «contexto de aquel momento».

### `work_case_processes` · `work_case_requirements`

N:N con procesos (§39): una NC de «fallo en la entrega» toca Producción,
Calidad y Despachos. Es **una** no conformidad con tres procesos, no tres.

Los requisitos **reutilizan la capa normativa que ya existe**
(`frameworks`/`requirements`, §12): no se construye un segundo catálogo ISO. Un
CHECK exige **exactamente una** fuente por fila —normativa, documento interno, o
texto—, porque mezclarlas haría imposible saber contra qué se mide.

### `work_case_findings` — el hallazgo (AC-03)

Qué se encontró, dónde, cuándo, quién, evidencia. Un caso puede tener varios. Un
hallazgo **no** es una no conformidad: es un hecho que pide evaluación y puede
terminar en observación, en oportunidad de mejora o en nada.

### `work_case_causes` — hipótesis ≠ causa validada (AC-10)

`hypothesis` se escribe, se discute y se descarta. `validated_cause` se aprueba,
y desde entonces es historia: un disparador impide reescribirla. Metodología
elegible entre `five_whys`, `ishikawa` y `structured`; **no** se construyó un
diseñador universal de metodologías.

### `work_actions` — el motor (AC-01)

**Una** tabla para los cuatro tipos. Lo que los separa es su significado, no su
almacenamiento:

| | |
|---|---|
| `containment` | detener el daño ahora |
| `correction` | arreglar lo que se rompió |
| `corrective` | impedir que se repita |
| `improvement` | mejorar sin que hubiera NC (AC-20) |

Campos que existen por una decisión concreta:

- **`original_due_on`** (AC-15) — prorrogar no borra la fecha original. Un plan
  que se mueve tres veces y solo muestra la última parece cumplido a tiempo.
- **`effectiveness_criteria`** (AC-16) — se define **antes**. Definirlo después
  es elegir el examen sabiendo la nota. Un CHECK lo exige.
- **`effectiveness_result`** y **`closed_at`** separados de `status` (AC-13) —
  completada, cerrada y eficaz son tres cosas.

### `work_action_verifications` — append-only

Una verificación **no se corrige**: si la conclusión cambia, se registra otra.
Sobrescribir «no eficaz» por «eficaz» borraría exactamente el aprendizaje que
justifica todo el ciclo.

### `work_decisions` — el acta (AC-22)

Clasificar, aprobar una causa, verificar, cerrar, reabrir, conceder. Cada fila
dice **qué**, **quién**, **cuándo** y **con qué fundamento**. Append-only:
disparadores impiden `update` y `delete`.

Es historia de **negocio**, no `audit_log` (§68). `audit_log` sigue siendo lo
que era —quién tocó qué fila—; esto es otra cosa, y es lo que alimenta el
historial que lee una persona.

## 3. Lo que se ensanchó sin romper

`work_tasks`, `work_alerts` y `work_events` **son las de 0116**. El encargo
prohíbe un sistema paralelo, así que §14 se limita a ensanchar sus CHECK:

```
work_tasks   + case_evaluation, case_closure, action_execution, action_effectiveness
work_alerts  + case_assigned, action_assigned, action_overdue, effectiveness_due
work_events  + case.opened, case.classified, case.closed, case.reopened,
               action.planned, action.completed, action.verified, action.overdue
```

Ensanchar un CHECK es aditivo: ninguna fila existente deja de ser válida.

## 4. La vista derivada

`v_work_case_overview` calcula acciones abiertas, vencidas y eficacias
pendientes. Nada de eso se almacena (MDR-37): un contador guardado se queda
desactualizado respecto de los datos que lo justifican.

## 5. Diagrama

```
work_cases ──┬─< work_case_findings
             ├─< work_case_causes
             ├─< work_case_processes >── quality_processes
             ├─< work_case_requirements ─┬─ requirements (normativa de plataforma)
             │                           └─ trazadoc_documents
             └─< work_references ────────── indicador · medición · documento · proceso…
                        │
                        └── owner_kind='action' ──> work_actions
                                                      ├─< work_action_verifications
                                                      └── work_decisions
work_decisions ── subject_kind ∈ {case, action}  (append-only · el acta)

work_tasks · work_alerts · work_events   ← las de 0116, solo ensanchadas
```
