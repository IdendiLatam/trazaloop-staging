# PE-04B5 · Los casos de orientación funcional

## Cuándo se consume

Al **ENVIAR** con éxito. No al abrir el formulario, no cuando soporte responde,
no al cerrar. Solo así el control de concurrencia es determinista y solo así el
cliente sabe en qué momento gastó.

## Cómo se cuenta

No hay un `casos_restantes = 1` suelto. Se **derivan** de los tickets, que son la
verdad: `count(*) where entitlement_period = mes_de_negocio`. En cualquier mes
pasado se puede responder cuántos casos incluidos se consumieron, y con qué
tickets, sin haber guardado un contador aparte.

Cada ticket lleva `entitlement_period` (qué mes pagó) y `entitlement_consumed_at`
(cuándo), y un `check` obliga a que vayan juntos o no vayan.

## Un ticket consume como mucho UNA vez en su vida

Es la regla que impide el ping-pong: reclasificar de un lado a otro no puede
cobrar dos veces. Demostrado ejecutando.

## No se devuelve al cerrar

Cerrar, cancelar o borrar el ticket **no** restituye el caso. Está consumido para
ese mes. No hay motor de devoluciones y B5 no lo construye.

La única devolución es **explícita y de soporte**: cuando al mirarlo resulta que
era un defecto nuestro, no una consulta. Cobrarle el caso a quien encontró un
fallo sería exactamente al revés de lo justo. Nunca es automática, exige motivo y
queda registrada como `released`.

## No se acumulan

Dos al mes. Si en septiembre se usan cero, octubre empieza con **dos**, no con
cuatro. Demostrado con consumo del mes anterior.

## El mes es el de negocio de la empresa

El **mismo** que usa el reloj de PE-04B4 (`organization_business_month`, sobre la
zona horaria de 0129). No se inventó un calendario de soporte: dos calendarios
por empresa acaban contradiciéndose.

## Concurrencia

`support_submit_ticket` toma `pg_advisory_xact_lock` por empresa y resuelve el
derecho **dentro de la misma transacción** que inserta. Con un caso libre, dos
envíos simultáneos: pasa uno. Demostrado.

## Una sola bolsa por empresa

No es por usuario, ni por módulo, ni por asignación. Dos personas comparten el
saldo, y una empresa con Extra en **dos** módulos funcionales sigue teniendo
**dos** casos: el recurso está declarado con alcance `organization` desde 0162.
Ambos demostrados.

## Cambios de plan

| Situación | Qué pasa |
|---|---|
| Subir a Extra a mitad de mes | recibe el cupo de 2; los tickets técnicos previos **no** cuentan |
| Bajar de Extra | no se pueden abrir casos nuevos; **los abiertos siguen abiertos**, visibles y en su flujo normal |
| Ir y volver a Extra en el mismo mes | el consumo **sigue en 2/2** · cambiar de plan no regala casos |
| Prueba de Full | **no** incluye los casos de Extra; el reporte técnico sí |

Bajar de plan **no cierra** un caso aceptado. Que el plan cambie no puede
cancelar una conversación que ya empezó.
