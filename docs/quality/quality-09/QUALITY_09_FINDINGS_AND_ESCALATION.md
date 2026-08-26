# QUALITY-09 · Hallazgos, evaluación y escalada

> **La afirmación central de este sprint.** Registrar un hallazgo —incluso uno
> que el auditor propone como «posible no conformidad»— deja el recuento de no
> conformidades de la organización **exactamente igual**.

## 1 · Por qué importa tanto

Un sistema que convierte hallazgos en no conformidades automáticamente produce
dos daños a la vez. Infla el número que la dirección mira. Y le quita a alguien
la decisión de clasificar, que es justamente el acto que un sistema de gestión
existe para documentar.

## 2 · El auditor PROPONE

`proposed_classification` admite cinco valores y **`'nonconformity'` no es uno
de ellos**:

| Valor | Qué dice |
|---|---|
| `conforming` | Se miró y estaba bien — es un hallazgo, no un silencio |
| `observation` | Algo que conviene mirar. **No es una no conformidad** |
| `improvement_opportunity` | Una mejora posible sin incumplimiento |
| `nonconformity_suspected` | «Sospecho», no «es» |
| `not_conclusive` | No alcanzó la evidencia para decidir |

`classificationCreatesNonconformity()` devuelve `false` para los cinco.

La conformidad es **local**: «este proceso, contra estos criterios, en esta
muestra». No dice que el sistema esté conforme.

## 3 · Los cuatro momentos, y qué mueve cada uno

| Acto | Crea NC | Abre caso | Mueve el conteo |
|---|---|---|---|
| Registrar el hallazgo | no | no | **no** |
| Atar evidencia | no | no | **no** |
| Evaluarlo | no | no | **no** |
| Escalarlo | no | **sí** | **no** |

La última fila es la que sorprende. Escalar abre un **caso**, y un caso todavía
no es una no conformidad: lo será si el motor de casos lo clasifica así, con
QUALITY-04, con su autor y su fecha.

`quality_open_case_from_audit_finding()` no contiene la palabra
`'nonconformity'` en ninguna rama. Si la contuviera, estaría decidiendo.

**Verificado contra base real** (`test:quality09-rls` G1–G7), midiendo el
recuento de `work_cases` con `classification = 'nonconformity'` antes y después
de cada uno de los cuatro actos: no se movió ninguna vez. Y el intento de
insertar `proposed_classification = 'nonconformity'` lo rechaza la base.

## 4 · Evaluar es un acto de autoridad

`quality_evaluate_audit_finding(finding_id, status, note)` exige una razón
escrita. Los estados: `pending`, `evaluated`, `dismissed`, `escalated`.

`escalated` **no se puede fijar directamente**: la acción de servidor lo rechaza
y redirige a «Abrir caso desde el hallazgo», que es el único camino. Marcar
«escalado» sin abrir el caso dejaría un hallazgo que dice haber sido tratado y
no lo fue.

Desestimar no es borrar: el hallazgo se queda, con la razón de por qué se
desestimó.

## 5 · La clasificación formal se LEE del caso

`listFindings()` trae `caseClassification` desde `work_cases`. No se deriva de
lo que propuso el auditor; se lee de donde alguien la decidió. La ficha del
hallazgo y su PDF imprimen las dos, en secciones distintas y rotuladas:

- **«Lo que PROPUSO el auditor»**
- **«Lo que se DECIDIÓ»**

## 6 · Recurrencia: una señal, no un veredicto

`v_quality_audit_recurring_findings` muestra el mismo proceso con hallazgos en
varias auditorías. No abre una no conformidad, ni un riesgo, ni una acción. Es
información para quien decide el próximo programa, y la pantalla lo dice.

## 7 · Los avisos tampoco deciden

Los seis tipos nuevos —`audit_upcoming`, `audit_overdue`,
`audit_report_pending`, `audit_finding_unevaluated`,
`audit_independence_conflict`, `audit_program_coverage_gap`— dicen que hay algo
que mirar. `quality_scan_audits()` no inserta en `quality_audits`, ni en
`quality_audit_findings`, ni en `work_cases`, ni cambia ningún estado.

El texto del aviso de hallazgo sin evaluar lo dice en el propio mensaje:
«Evaluarlo NO obliga a abrir ningún caso ni lo convierte en no conformidad».

## 8 · Cerrar la auditoría ≠ cerrar las acciones

`quality_close_audit()` exige:

- que la ejecución haya terminado y haya informe;
- que **no queden hallazgos sin evaluar**;
- una nota de cierre.

Y **no** exige que las acciones correctivas estén cerradas. Exigirlo produce
auditorías abiertas durante años por una acción de nadie. Lo que sí exige es
DECIR qué queda pendiente (`followup_note`).

`v_quality_audit_overview` deriva `open_cases` y `open_actions` del motor
transversal —no los copia— y la ficha y el informe los imprimen al lado del
cierre. **Verificado** (`test:quality09-rls` J1–J3): no se cierra con hallazgos
pendientes; sí se cierra con un caso abierto; y el caso sigue abierto después.
