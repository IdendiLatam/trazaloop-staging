# PE-05B2W3.1 · El periodo que hay que pagar

## Por qué hubo que tocar el dominio

El defecto de W3 —el periodo avanzó 6 minutos y 23 segundos en vez de un mes—
no era una cuenta mal hecha. Era un hueco: **no existía nada que representara
lo que hay que pagar**. Solo existía lo que se pagó. Sin una obligación con
nombre, el ciclo siguiente había que deducirlo de la hora a la que entró el
cobro, y nada ataba una renovación a un mes concreto.

De ahí salían los dos síntomas por el mismo sitio:

* el calendario se movía con el reloj, no con el contrato;
* dos cobros aprobados del mismo mes avanzaban el derecho dos veces, porque
  nadie sabía que eran del mismo mes.

## Lo que introduce 0172

**`billing_subscription_periods`** — la obligación como objeto propio. Tiene
número de orden, principio, fin, importe base, moneda y estado (`open` o
`settled`). Dos unicidades en la base, no en el código: una suscripción no
puede tener dos periodos con el mismo número, ni dos con las mismas fechas.

**`billing_period_bounds(ancla, intervalo, número)`** — el calendario. Calcula
el periodo N como `ancla + (N-1) × intervalo` **en un solo paso**. Nunca suma
al periodo anterior. La diferencia no es de estilo:

| | sumando al anterior | desde el ancla |
|---|---|---|
| 31-ene | 28-feb | 28-feb |
| siguiente | 28-mar | **31-mar** |
| siguiente | 28-abr | **30-abr** |

Sumar mes a mes pierde el día 31 en febrero y ya no lo recupera jamás: el
cliente que contrató el 31 acaba cobrado el 28 para siempre. Desde el ancla, el
día se conserva y solo se recorta cuando el mes no llega. Comprobado hasta
mayo, con agosto, y con el 29 de febrero bisiesto.

**`billing_open_next_period(suscripción)`** — abre la obligación **antes** de
cobrar. El ancla es el principio del periodo 1, no `now()`. Si ya había una
abierta, devuelve esa: no se reclaman dos meses teniendo uno sin pagar.

Al día, por adelantado y **dentro de los 7 días de gracia**, el periodo nuevo
empieza donde acababa el anterior. Durante la gracia el derecho siguió
disponible, así que el calendario comercial no se mueve: pagar tarde no regala
días. Pasada la gracia falla cerrado —`REACTIVATION_REQUIRES_NEW_PURCHASE`—
porque volver de Free no es renovar, es contratar, y eso es una decisión
comercial, no un efecto secundario de un webhook.

**`billing_settle_period_payment(...)`** — la obligación se salda una vez, con
candado sobre su fila. Un segundo pago aprobado para un periodo ya saldado se
**anota** y va a `manual_review`: el derecho no avanza otra vez, pero el dinero
que se movió no desaparece del libro. Y cuando salda, el periodo de la
suscripción se pone en las fechas **ya definidas** de la obligación; no se
vuelve a calcular nada.

**La referencia deja de decidir.** Al proveedor viaja `pay_<intento>` y lo que
ese intento significa —contratación o renovación, y de qué mes— lo dice la
base. El número que permitía dos cobros para el mismo mes ya no existe.

## Prueba real, y dónde se paró

Contra el entorno de pruebas de Wompi, con webhook real:

* Compra inicial: periodo 1 = **2026-09-04 → 2026-10-04**, saldado por el
  webhook real de la transacción `12180854-1788526154-22410`, un solo evento,
  un solo pago, tres concesiones `sold`.
* Renovación: `billing_open_next_period` abrió el periodo 2 =
  **2026-10-04 → 2026-11-04**. Un mes exacto, pegado al anterior, sin hueco.
  El calendario y la identidad del periodo quedan demostrados sobre datos
  reales.

La renovación **no llegó a cobrarse**, y no por elección: la bloquea un defecto
distinto que se documenta aparte en
[`PE_05B2W31_PAYMENT_SOURCE_BLOCKER.md`](PE_05B2W31_PAYMENT_SOURCE_BLOCKER.md).

## Lo que queda pendiente y por qué

`billing_record_renewal_payment` —el camino de renovación del **otro**
proveedor— sigue avanzando el periodo con `now() + intervalo`. Es el defecto
original, sin reparar. No se ha tocado porque llevarlo al dominio de periodos
exige una migración que este encargo no autoriza: 0172 construye el dominio,
pero conectar el otro proveedor a él es trabajo de otra.
