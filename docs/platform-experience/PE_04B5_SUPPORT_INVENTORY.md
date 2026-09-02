# PE-04B5 · Inventario del motor de soporte

Levantado leyendo el esquema aplicado, no la arquitectura de PE-04A.

## Lo que ya existía

| Pieza | Estado |
|---|---|
| `support_tickets` | 19 columnas · categoría, módulo, prioridad, estado, asignación, objetivo de primera respuesta |
| `support_ticket_messages` | hilo, con notas internas |
| `support_ticket_status_history` | cambios de estado con nota |
| `v_support_ticket_summary` | `security_invoker` · vista del cliente |
| `v_platform_support_ticket_summary` | vista de plataforma con `where is_platform_staff()` |
| Funciones | `assign_support_ticket`, `update_support_ticket_status`, `update_support_ticket_priority`, `reopen_support_ticket`, `can_create_support_ticket_for_org` |
| Pantallas | `/support`, `/support/new`, `/support/[id]`, `/platform/support`, `/platform/support/[id]` |

**No se construye un segundo motor.** Lo que B5 añade es un eje sobre el mismo.

## Las diez categorías reales

`account` · `plan` · `trazability` · `evidences` · `trazadocs` · `imports` ·
`calculation` · `technical_support` · `bug` · `other`.

Coinciden con lo que reportó PE-04A. **Y no sirven para decidir el derecho
comercial**: mezclan *de qué va* el ticket (trazabilidad, evidencias, cálculo)
con *qué se pide* (soporte técnico, error, cuenta, plan). Deducir de ahí si una
empresa gasta uno de sus dos casos sería deducir un derecho de la palabra que el
cliente eligió para describir un tema.

De ahí `support_kind`, que se pregunta explícitamente. `category` sigue
diciendo de qué va.

## Estados y prioridades

Estados: `open` · `assigned` · `waiting_customer` · `in_progress` · `resolved` ·
`closed`. Prioridades: `low` · `normal` · `high` · `urgent`. **Se reutilizan tal
cual.** El derecho comercial es independiente del estado: dos casos abiertos
consumen los dos casos del mes, y cerrar uno no crea un tercero.

## El objetivo de primera respuesta ya existía

`normalize_support_ticket_insert` (0053) calcula
`first_response_target_at = creación + 1 día`, saltando sábado y domingo. **No
hay calendario de festivos**, y B5 no finge que lo haya: el valor se presenta
como *objetivo de primera respuesta*, nunca como plazo de resolución. Es
configurable por revisión de plan en el sentido de que el derecho lo declara el
catálogo; el cálculo del día hábil se deja como está para no construir un motor
de SLA que nadie ha pedido.

## Adjuntos: no hay

No existe tabla ni bucket de adjuntos de soporte, y no hay una sola mención en
la capa de datos, las acciones o las pantallas. **B5 no crea ninguno**, de modo
que no hay ninguna vía de escritura a Storage que pudiera saltarse la cuota de
PE-04B3, ni doble contabilidad de bytes. Si algún día se añaden, tendrán que
decidir explícitamente si son del cliente —y entonces pasar por la reserva
canónica de 0164— o material operativo de plataforma.

## Un hallazgo: el plan que enseñaba la cola de soporte

`v_platform_support_ticket_summary` mostraba
`coalesce(organization_subscriptions.plan_code, 'demo')` bajo el nombre
`plan_code`. Es la copia administrativa heredada: quien atendía a un cliente Full
podía leer «demo». Es la misma familia de defecto que PE-04B2 cerró en la consola
de empresas, y sobrevivía aquí.

0167 lo corrige: `plan_code` pasa a ser el plan **comercial vigente** del catálogo
canónico, y el estado administrativo se conserva con el nombre `account_status`,
que ya no se confunde con un plan.

## Otro: una segunda puerta de escritura

`insertSupportTicket` escribía en `support_tickets` sin comprobar nada. Con el
derecho comercial en juego, una segunda puerta es la forma de que el cupo deje de
significar algo el día que alguien la use por comodidad. Se retira, y un guardia
estático impide que vuelva un `insert` directo a la tabla.
