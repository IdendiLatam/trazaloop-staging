# PE-05B2W1 · Wompi en pruebas · cobró dos veces sobre la misma tarjeta

**Lo que había que demostrar está demostrado.** Wompi guardó un medio de pago y
lo cobró **dos veces**, la segunda con `recurrent: true` y sin volver a pedir la
tarjeta. Es exactamente el modelo que el cobro anual necesitaba y que la otra
pasarela lleva tres tramos sin poder confirmar.

## El entorno, y por qué esto es un alivio

```
wompi_environment: sandbox · configuration_problems: []
```

Las cuatro llaves llevan el entorno en el prefijo y cada entorno tiene su URL.
Y se exige que las **cuatro coincidan**: una sola de producción entre llaves de
prueba deja la configuración inválida, porque ese caso —parece configurado y
cobraría de verdad— es peor que no tener llaves.

Con la otra pasarela esto no se puede hacer, y nos costó tres tramos
descubrirlo.

## La cadena completa, ejecutada de verdad

| Paso | Resultado |
|---|---|
| Contratos de aceptación | los dos, con sus **PDF** públicos |
| Tokenización de la tarjeta de prueba | `tok_test_…` · marca **VISA** · HTTP 201 |
| Fuente de pago | **371065** · `AVAILABLE` |
| Presupuesto de B1 | USD 40 × 4 000 + 19 % = **190 400 COP** |
| **Cobro 1** | `12180854-1788480098-19704` → **APPROVED** · 190 400 COP |
| **Cobro 2** · misma fuente · `recurrent: true` | `12180854-1788480128-60974` → **APPROVED** · 190 400 COP |

`FIRST_WOMPI_PAYMENT = VERIFIED_SANDBOX` ·
`RECURRING_PAYMENT_SOURCE = VERIFIED_SANDBOX`

El segundo cobro llevó su **propia referencia** —`<intento>-2`— y no volvió a
tokenizar nada. Eso es la prueba: el medio guardado se puede cobrar otra vez.

## La trampa de este proveedor

`amount_in_cents` cuenta **centésimas de peso**, y el peso no tiene decimales.
B1 guarda `190400`, que son ciento noventa mil cuatrocientos pesos; a Wompi hay
que mandarle `19040000`.

**Mandar el número de B1 tal cual cobraría cien veces menos**, y nadie lo
notaría hasta el extracto. Por eso la conversión está aislada, con su vuelta, y
la conciliación **rechaza explícitamente** el importe sin convertir.

Comprobado en la ida y en la vuelta: los dos cobros reales devolvieron
`190 400 COP` exactos.

## Las dos firmas

**Integridad** (transacciones): `SHA256(referencia + centavos + moneda +
secreto)`. Verificada contra el ejemplo oficial de Wompi **carácter a carácter
y resumen a resumen** — el hash de su documentación sale idéntico. Se calcula
en el servidor; el secreto no viaja al navegador.

**Eventos** (webhook): el evento **enumera qué campos firma**. Se toman sus
valores en ese orden, más el sello de tiempo y el secreto de eventos, y se
compara el SHA-256 en tiempo constante.

Que el evento diga qué firma es lo que lo hace resistente: el **importe** y el
**estado** están entre lo firmado, así que alterarlos rompe la firma. Hay una
prueba que lo altera y comprueba que se rompe.

## La tarjeta, y una desviación dicha en voz alta

En el producto el número va del **navegador a Wompi** con la llave pública, y
el servidor no lo ve nunca. En esta prueba automatizada no hay navegador, así
que se tokenizó desde el servidor con la tarjeta **pública** de la
documentación.

Es una desviación consciente y acotada:

- vive **solo** en el disparador provisional, que se retira;
- solo acepta las **dos tarjetas publicadas** por Wompi — cualquier otro número
  se rechaza, así que este camino no puede usarse con la tarjeta de una
  persona ni por error;
- el número no se guarda, ni se registra, ni se devuelve;
- una prueba recorre `lib`, `server`, `components` y `app` y comprueba que
  **ningún fichero de producto** toca `cvc`, `card_holder`, `exp_month` ni
  `exp_year`.

## Lo que NO cambió

El contrato de B1 **no se reescribió**: se le añadió una capacidad que el
proveedor **declara**, en vez de que el dominio adivine.

```
Wompi         recurrenceOwner: merchant  · fuente guardada, sin suscripción propia
Mercado Pago  recurrenceOwner: provider  · suscripción propia, sin fuente guardada
```

Es una capacidad **técnica**, no una verdad comercial: el plan, el precio y el
derecho siguen siendo de PE-04 y B1.

Y **no hay un segundo motor**. La referencia de la transacción de Wompi **es**
la referencia opaca del intento, así que la conciliación y la liquidación son
las mismas: `billing_settle_provider_payment`. Comprobado contra base real —
veinte eventos repetidos siguen siendo **una** activación, el importe
equivocado no activa, y un evento de producción sobre un intento de pruebas
tampoco.

**Ninguna migración.** La cabecera sigue en **0171**: `billing_checkout_intents`
y `billing_provider_events` ya son neutrales respecto al proveedor, y el
`payment_source_id` cabe en `provider_subscription_id` sin inventar columnas
con nombre de pasarela.

## Idempotencia · quién la pone

Wompi **no ofrece clave de idempotencia** en la creación. La pone Trazaloop:
una **referencia por intento de cobro** —`<intento>-<nº>`—, construida antes de
llamar. Y por debajo sigue la de B1: `(proveedor, id de pago)` único.

Un reintento de red no significa que la petición fallara; con una referencia
por intento, repetirla es reconocible.

## El webhook · implementado, sin registrar

La ruta existe y se comprueba con eventos deterministas. **La URL todavía no se
le ha dado a Wompi**, como pedía el encargo: primero las pruebas, después el
registro.

Firma inválida → **401** y cero efecto; hay una prueba que corta el fichero por
esa línea y comprueba que ninguna llamada con efecto ocurre antes.

## Alcance de tarjetas

`recurrent: true` activa credencial en archivo para **VISA y Mastercard**. La
prueba se hizo con VISA. **No se afirma nada de AMEX en recurrencia**: Wompi lo
acepta como medio de pago, pero el comportamiento COF documentado es para las
otras dos, y eso se verifica aparte cuando toque.

## `WOMPI_RENEWAL_SCHEDULER_REQUIRED = YES`

Es el coste de este camino y hay que decirlo claro: **si el planificador se
equivoca, se cobra de más o no se cobra.**

No se implementó nada —ni cron, ni `pg_cron`, ni bucle— y hay una prueba que lo
comprueba por nombre. Cuando llegue, debe apoyarse en lo que ya existe en
`billing_subscriptions`: `renews_at`, periodo, identidad del intento, estado de
reintento, `grace_until`, `cancel_at_period_end`. **No una segunda verdad
comercial.**

## Artefactos y limpieza

En Wompi quedan una fuente de pago de prueba y dos transacciones aprobadas de
sandbox —hacen falta para la prueba de webhook, que es lo siguiente—. La
empresa de QA se reutilizó; no se creó ninguna otra.

La tasa sintética se **cierra otra vez** al terminar: el disparador abre una
vigencia nueva cuando hace falta, así que no hay motivo para dejarla efectiva.

## Lo que sigue igual

Crear una fuente de pago **no** activa Full. Una transacción enviada **no**
activa Full. `PENDING` **no** activa Full. Solo un pago **aprobado y
comprobado en el servidor**.
