# QUALITY-09 · Planificación, alcance, criterios e independencia

## 1 · El alcance es estructurado

Nueve clases —proceso, unidad organizativa, sede, proveedor, alcance de
proveedor, documento, requisito, producto o servicio, otro— cada una con su
`check` de coherencia: no se puede registrar «proceso» sin proceso, ni «sede»
sin decir cuál.

Un alcance escrito como frase libre es lo que produce discusiones en la reunión
de cierre sobre si aquello entraba o no.

Cuando el elemento es un proceso, se guarda además `process_revision_id`: la
revisión que regía al planificar.

## 2 · CRITERIO ≠ PREGUNTA DE CHECKLIST

| Criterio de auditoría | Pregunta de checklist |
|---|---|
| Contra qué se audita | Cómo se recuerda mirarlo |
| Vive en la auditoría | Vive en una versión del checklist |
| Puede ser un requisito, un documento, un contrato, una ley | Es una redacción concreta |
| Obligatorio para que un hallazgo signifique algo | Opcional siempre |

`quality_audit_criteria` **no tiene** `prompt` ni `stable_key`, y
`quality_audit_checklist_items` no referencia criterios. Son dos cosas.

## 3 · La revisión de ENTONCES (AR-05)

Un criterio documental guarda `document_revision_id`. Es la diferencia entre
«el hallazgo era cierto contra el procedimiento vigente ese día» y «el hallazgo
ya no se entiende porque el procedimiento cambió».

El expediente de preparación resuelve, para la fecha de la auditoría:

- la revisión publicada vigente de cada proceso del alcance;
- la revisión vigente de cada documento que sirve de criterio.

Y el informe la congela, para que reimprimirlo dentro de dos años devuelva lo
que decía entonces.

## 4 · AUDITOR ≠ RESPONSABLE DE LA AUDITORÍA

`quality_audits.owner_position_id` es el CARGO que responde por la auditoría.
`quality_audit_team_members` son las personas que la conducen, con cinco
papeles: `lead`, `auditor`, `technical_expert`, `observer`, `in_training`.

Un índice único garantiza **un solo `lead`** por auditoría.

### El auditor externo no necesita cuenta

El equipo cuelga de `quality_people`, no de `profiles`. Un auditor contratado
para una semana no tiene por qué convertirse en usuario de Trazaloop, y exigirlo
produce cuentas de usuario que nadie recuerda desactivar.

### La competencia INFORMA; no decide

El expediente de preparación muestra las competencias registradas de cada
miembro del equipo. No bloquea a nadie. Un auditor sin competencias registradas
no está descalificado: está sin registrar, que es otra cosa, y decidir en su
lugar sería sustituir un juicio profesional por una tabla incompleta.

## 5 · La independencia es HISTÓRICA (AR-11)

La pregunta correcta no es «¿qué cargo tiene Ana hoy?» sino **«¿qué cargo
ocupaba Ana el día de la auditoría?»**.

`quality_audit_conflicts_on(organization_id, audit_id, on)` lee
`quality_position_assignments` acotando por `effective_from <= on` y
`(effective_to is null or effective_to >= on)`, y cruza el resultado con
`quality_processes.owner_position_id` para los procesos del alcance.

Detecta dos conflictos:

1. **`owns_audited_process`** — auditar un proceso del que se respondía.
2. **`is_auditee`** — figurar a la vez en el equipo auditor y entre los
   auditados.

La fecha de referencia es la de ejecución si la hubo, si no la vigente, si no la
original.

**Verificado contra base real** (`test:quality09-rls` H1–H2): una persona que
ocupó la jefatura de Compras hasta hace un mes produce conflicto al preguntar
por hace un año, y **no** produce conflicto al preguntar por hoy. Una auditoría
de 2026 conducida por quien respondía de Compras sigue teniendo ese conflicto en
2029, aunque esa persona ya no esté en Compras.

## 6 · El sistema NUNCA declara a nadie independiente

`quality_check_audit_independence(audit_id)` registra lo que encontró y devuelve:

```json
{ "declares_independence": false, "conflicts_found": 2, "conflicts": [ … ] }
```

`declaresIndependence()` en el dominio devuelve `false` sin mirar los argumentos,
y la pantalla lo dice con todas las letras. Un conflicto detectado exige una
decisión humana: descartarlo, o aceptarlo **con una mitigación escrita** —un
`check` de la base impide aceptarlo sin ella.

Que el sistema no encuentre conflictos no es una declaración de independencia:
es lo que el sistema pudo comprobar con lo que hay registrado.

## 7 · La agenda es una intención

Si el día de la auditoría se mira otra cosa, la agenda no queda invalidada: la
agenda planificó y la ejecución registró. Son dos capas y las dos se conservan.
