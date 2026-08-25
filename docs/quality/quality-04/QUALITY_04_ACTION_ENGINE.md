# QUALITY-04 · El motor de acciones

## 1. Uno solo (AC-01)

`work_actions` es **una** tabla para los cuatro tipos. No hay
`quality_corrective_actions`, ni `audit_actions`, ni `supplier_actions`: crear
una tabla por dominio es exactamente lo que impide reutilizar un motor.

Lo que separa los tipos es su **significado**, no su almacenamiento:

| Tipo | Qué hace | Qué NO hace |
|---|---|---|
| **Contención** | detiene el daño ahora | no arregla ni previene |
| **Corrección** | arregla lo que se rompió | **no impide que vuelva a pasar** |
| **Acción correctiva** | actúa sobre la causa | no arregla el caso concreto |
| **Acción de mejora** | mejora algo que no incumplía nada (AC-20) | — |

La interfaz muestra esa explicación junto a cada opción, porque confundir
corrección con acción correctiva es el error más común del dominio.

## 2. Acción ≠ tarea (§21)

```
ACCIÓN   compromiso de gestión: objetivo, responsable, fecha, resultado esperado
TAREA    unidad operativa que ayuda a ejecutarla o a revisarla
```

Una acción **produce** tareas. Al planificar una acción con responsable, se crea
una `work_tasks` de tipo `action_execution` para el titular actual del cargo —y
se cierra sola cuando la acción se completa—.

Pero la acción **no se guarda como** una tarea: una tarea no tiene resultado
esperado, ni criterio de eficacia, ni verificación.

## 3. Responsable por cargo (MDR-33)

`owner_position_id` apunta a un **cargo**. La persona se resuelve por la
asignación vigente. Cuando alguien cambia de puesto, la acción conserva su
dueño y la responsabilidad histórica no se pierde.

Quien **ejecuta**, **completa** y **verifica** queda registrado como persona
concreta en `completed_by`, `verified_by` y `work_decisions.decided_by`.

## 4. Fechas y prórrogas (AC-15)

```
due_on           la fecha vigente
original_due_on  la que se puso al planificar
extension_count  cuántas veces se movió
```

Prorrogar **no borra** la fecha original. Un plan que se mueve tres veces y solo
muestra la última parece cumplido a tiempo; la ficha muestra ambas.

## 5. Vencimientos, sin scheduler

`work_scan_pending_actions` deriva los atrasos de los datos —no hay proceso
programado— y produce:

- un **evento** `action.overdue` en la bitácora;
- una **alerta** para el titular del cargo responsable;
- una alerta de `effectiveness_due` para quien gobierna, cuando una eficacia
  queda pendiente.

**Idempotente** por `dedupe_key` (AC-23): repetirlo no duplica nada (`C2`). Sin
eso, un barrido diario llenaría la bandeja con la misma tarea treinta veces y la
gente dejaría de mirarla.

Reutiliza `work_tasks`/`work_alerts`/`work_events`. **No** existe
`action_alerts`.

## 6. Completar (AC-13)

`work_complete_action` exige describir **qué se hizo**: una acción completada
sin resultado no se puede verificar después.

Y decide el estado real:

```
requires_effectiveness = false  →  effectiveness = not_required,  closed_at = ahora
requires_effectiveness = true   →  effectiveness = pending,       closed_at = NULL
```

Completar **no** cierra cuando queda algo por comprobar.

## 7. Criterio antes, no después (AC-16)

Un CHECK impide crear una acción que exija verificación sin decir contra qué se
comprobará. Definir el criterio después de ver el resultado es elegir el examen
sabiendo la nota.

## 8. Verificación de eficacia

`work_verify_effectiveness` exige que la acción esté **completada** —no se puede
verificar lo que no se hizo— y es un acto de **gobierno**: solo administración o
calidad (`X3`).

Cada verificación es una fila **append-only** en `work_action_verifications`:
criterio, resultado, comentario, quién y cuándo. No se edita ni se borra
(`B13`).

Si el resultado es `not_effective`, el caso vuelve a **análisis** (AC-17) y la
acción fallida **permanece** con su veredicto. La segunda acción es una acción
nueva; no un parche sobre la primera (`B14`).

## 9. Un caso con dos acciones y dos verificaciones

Así se ve la cadena que este sprint conserva íntegra:

```
A-2026-001  Acción correctiva  «Configurar seguimiento preventivo»
            Completada el 25/08  ·  NO eficaz
            └─ verificación · 25/08 · «Volvió a vencer un documento en el primer mes»

A-2026-002  Acción correctiva  «Automatizar el aviso 30 días antes»
            Completada el 25/08  ·  Eficaz
            └─ verificación · 25/08 · «Sin vencimientos desde entonces»
```

Nada se sobrescribió. El caso puede cerrarse porque **ninguna** eficacia queda
pendiente, y el historial explica por qué hubo dos intentos.

## 10. Referencias, no copias (AC-12, §26, §58)

Una acción puede tener **varios** objetos de origen, y se atan por
`work_references` en vez de una FK directa. Por eso mañana una acción podrá
nacer a la vez de un caso y de un riesgo sin cambiar el esquema.

Las evidencias **referencian** lo que ya existe —documento, revisión, medición,
proceso— en lugar de copiar archivos: T-03 sigue vigente y no se creó un segundo
motor de evidencias.
