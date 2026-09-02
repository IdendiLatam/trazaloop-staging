# PE-05B1 · Pagos

## Separados de la suscripción

La suscripción es una **relación**; el pago es un **hecho**. Un pago rechazado
existe sin suscripción; una suscripción existe sin un pago de este mes.

## Qué guarda cada pago

Empresa · suscripción · presupuesto · proveedor y su identificador · base ·
descuento · **clase de servicio, regla fiscal, tipo e importe del impuesto** ·
total · moneda · tipo de cambio · estado · fechas · motivo del fallo ·
devoluciones · **comisión del proveedor** cuando la informe.

La comisión se guarda **solo para analizar rentabilidad** y jamás altera lo que
el cliente tiene.

## Se registra salga como salga

Un intento fallido **también es historia financiera**, y es lo que explica un
reclamo. Un rechazo crea la fila de pago con estado `declined` y **no** crea
suscripción ni concede nada; el presupuesto sigue abierto hasta caducar, de modo
que el cliente puede reintentar con otra tarjeta sin volver a empezar.

## Idempotencia

`(proveedor, identificador de pago)` es **único**, y `billing_settle_payment`
reconoce el reintento y devuelve `already_settled: true` sin crear un segundo
cobro ni conceder el plan otra vez. Comprobado.

Los proveedores reintentan por diseño. Un doble cobro descubierto por el cliente
vale más caro que todo el trabajo de evitarlo.

## Dónde el dinero se convierte en derecho

`billing_settle_payment` **no está concedida a `authenticated`**. Solo la llama
el servidor cuando el proveedor ha confirmado; en B2 la llamará el manejador de
webhooks tras verificar la firma.

Comprobado: un cliente autenticado que la invoca recibe un error y no se crea
ninguna suscripción. **Volver del checkout no llega hasta aquí**, y ese es el
punto: activar por el parámetro de una URL sería regalar el producto a quien
sepa escribir esa URL.

## Estados

`pending` · `approved` · `declined` · `failed` · `refunded` ·
`partially_refunded` · `manual_review`.

Y en el contrato del proveedor, tres maneras de fallar que **no** son la misma
noticia: `declined`, `provider_unavailable` e `invalid_request`. Confundir «la
pasarela no responde» con «la tarjeta fue rechazada» acaba en un cliente que
pagó y al que se le baja el plan.
