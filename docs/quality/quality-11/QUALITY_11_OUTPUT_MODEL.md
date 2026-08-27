# QUALITY-11 · El modelo de salidas

## 1 · Tres, y solo tres

```json
[
  { "kind": "CREATE_SIGNAL" },
  { "kind": "CREATE_ALERT", "recipient_kind": "rule_owner_position" },
  { "kind": "CREATE_TASK",  "recipient_kind": "subject_owner_position",
    "task_title": "Reevaluar al proveedor crítico", "due_in_days": 30 }
]
```

La señal es obligatoria y va primera: el aviso y la tarea la referencian, y un
aviso que no puede señalar el hecho que lo motiva es ruido.

## 2 · Lo que NO se puede emitir

Correo arbitrario · webhook · HTTP · SQL · no conformidad · aprobación ·
declaración de competencia · cierre de acción, auditoría o revisión · aceptación
de riesgo · suspensión de proveedor · conclusión de dirección.

La validación rechaza cualquier `kind` fuera del catálogo con un mensaje en
castellano, y la regla **no llega a publicarse**. Comprobado con
`SEND_EMAIL`, `CREATE_NONCONFORMITY` y `HTTP_POST` en la prueba R5.

## 3 · Cada salida es idempotente por su cuenta

| Salida | Clave | Mecanismo |
|---|---|---|
| señal | `auto:<versión>:<sujeto>` | índice único parcial + `on conflict` |
| aviso | `auto_alert:<señal>:<perfil>` | `insert … where not exists` |
| tarea | `auto_task:<señal>:<perfil>` | `insert … where not exists` |

Esto es lo que hace que un **reintento** tras un fallo a medias termine el
trabajo exactamente una vez: la señal ya existe y no se duplica; la tarea que
faltaba se crea; la que ya estaba no se toca (§147, prueba M1).

## 4 · El destinatario

`rule_owner_position` — el cargo responsable de la regla.
`subject_owner_position` — el cargo responsable del objeto observado.
`specific_position` — un cargo concreto, que la validación comprueba que es
**de esta empresa**.

Se resuelve el día de la ejecución, uniendo las dos vías de asignación que
conviven en el sistema (`person_id` → perfil, y el `profile_id` heredado), y
descartando a quien no tenga cuenta. Si el cargo tiene varios ocupantes, se
avisa a todos.

## 5 · Lo que la tarea es y lo que no es

Una tarea de automatización nace `open`, con su vencimiento si la regla lo
declaró, asignada a la persona **y** al cargo, de tipo `automation_follow_up`.
Dice «mira esto». No es una acción correctiva, no la abre nadie por ella, y
resolver la señal **no** la cierra: son objetos de dueños distintos.
