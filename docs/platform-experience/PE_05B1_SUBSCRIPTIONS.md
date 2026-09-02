# PE-05B1 · Suscripciones

## Una por empresa

Índice único parcial sobre las vivas —`pending`, `active`, `past_due`,
`cancel_at_period_end`—. Si hubiera dos, «qué paga esta empresa» dejaría de
tener respuesta. Misma clase de invariante que la de 0168 para las asignaciones.

**No hay una suscripción por módulo.** Los cuatro recursos que definen el plan
—almacenamiento, Intelligence, tiempo y soporte— ya son de empresa desde PE-04,
así que vender por módulo desbloquearía capacidad en todos comprando el más
barato.

## Qué congela, y qué no

**Congela** el precio **base** en la moneda de cobro y el tipo con que se
calculó. **No congela el impuesto**, y es deliberado: ver
`PE_05B1_FUTURE_SELF_SERVICE_EXEMPTION.md`.

Un cambio posterior del tipo de cambio comercial **no** mueve la base de una
suscripción existente. Los clientes nuevos usan el tipo nuevo; a quien ya
contrató no se le cambia el precio sin una acción comercial explícita.

## Estados canónicos

`pending` · `active` · `past_due` · `cancel_at_period_end` · `ended` ·
`manual_review`.

Son **de Trazaloop**. Los del proveedor se traducen en la frontera: heredar sus
cadenas como vocabulario del dominio ataría el producto a un proveedor concreto
por la puerta de atrás.

## Preparado, no implementado

Las columnas para el ciclo completo existen y B5 las usará:
`current_period_end`, `renews_at`, `cancel_at_period_end`, `cancelled_at`,
`ended_at`, `grace_until`, y el cambio programado
(`scheduled_plan_revision_id`, `scheduled_effective_at`).

**Gracia: 7 días naturales** tras un cobro fallido, conservando el derecho
pagado; al agotarse, el suelo Free **sin borrar nada**. B1 representa el estado;
el planificador de reintentos es del proveedor y llega en B2/B5.

## Cancelación

**Al final del periodo pagado.** El cliente pagó un mes y ese mes es suyo. El
esquema lo representa con `cancel_at_period_end`; ejecutarlo es B5.
