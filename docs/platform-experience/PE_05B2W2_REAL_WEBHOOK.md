# PE-05B2W2 · El webhook real de Wompi

**Wompi entregó. La firma cuadró. El importe conció. Se liquidó una vez.**

## La cadena, con datos reales

```
Wompi Sandbox
  → Preview protegido (bypass de automatización)
  → firma SHA-256 con el secreto de eventos
  → environment = test, coincidiendo con las llaves
  → relectura de la transacción en la API
  → conciliación exacta contra B1
  → billing_settle_provider_payment
```

| | |
|---|---|
| Transacción | `12180854-1788488068-55204` |
| Evento | `transaction.updated` · **firmado y verificado** |
| Estado del proceso | `processed` · resultado **`activated`** |
| Cobro | `wompi` · **approved** · **190 400 COP** |
| Suscripción | `full` · **active** · base 160 000 |
| Intento | **`settled`**, con su suscripción enlazada |

El importe recorrió el viaje entero sin perder un peso: B1 dijo 190 400 COP, el
adaptador mandó 19 040 000 centavos, y volvió 190 400.

## Idempotencia · seis entregas, un efecto

Wompi solo reintenta cuando no recibe `200`, y recibió `200`. Así que la
reentrega se provocó desde el servidor —único sitio donde vive el secreto y por
tanto único sitio donde se puede firmar—, repitiendo el **evento de la
transacción real** cinco veces más:

```
attempt_count: 6   ·   una sola fila
outcome:       already_settled
cobros: 1  ·  suscripciones: 1
```

**`WEBHOOK_APPROVED_SETTLEMENT = VERIFIED_SANDBOX`**

`REAL_PROVIDER_RETRY_OBSERVED = NO` — no se provocó un fallo prolongado solo
para forzar un reintento del proveedor. La primera entrega prueba el
transporte; la reentrega prueba la idempotencia.

## Un defecto encontrado antes de que costara caro

La referencia de cobro de Wompi es `<intento>-<nº>`, porque el proveedor exige
unicidad por transacción y con este modelo un mismo intento puede cobrarse
varias veces. La liquidación esperaba el intento **desnudo**: el primer webhook
real habría acabado en «referencia desconocida».

Se extrae en la ruta, que es donde toca —el formato es nuestro y la base no
tiene por qué aprender el de una pasarela—, y una referencia ilegible va a
revisión en vez de inventarse un intento. El primer cobro de un intento usa el
intento desnudo, que además es único.

## Lo que NO se demostró, y por qué

**La asignación vendida.** Ambos cobros liquidaron correctamente pero
concedieron el plan a **cero módulos**, y la causa no está en el cobro:

`billing_settle_payment` concede el nivel a cada módulo funcional **habilitado
en `organization_modules`**, que es la regla de PE-04 —*pagar no concede
módulos*— y está probada desde B1.

`commercial_provision_new_module` crea las **asignaciones** de plan (`base` y
`trial`) pero **no habilita el módulo**: eso es un paso distinto del producto.
Así que las dos empresas sintéticas tenían `organization_modules` vacío y no
había nada a lo que conceder.

Es un hueco del **fixture**, no de la liquidación. Para verlo entero hace falta
una empresa de QA con un módulo funcional realmente habilitado.

## Un hueco real para B5

Con Wompi el calendario es del comercio, así que **el segundo cobro de una
suscripción es una renovación**, no una contratación. La ruta llama siempre a
`settleProviderPayment`, y esa primitiva **inserta** una suscripción: sobre una
empresa que ya tiene una viva chocaría con `billing_subscriptions_one_live`.

Falla cerrado —el evento quedaría en error, sin cobrar dos veces— pero no es
gracioso. La renovación tiene su primitiva, `billing_record_renewal_payment`, y
enrutar hacia ella según el estado de la suscripción es trabajo de **B5**, junto
con el calendario.

No se arregló aquí: este tramo probaba eventos, no orquestación de recurrencia.

## Artefactos

| | |
|---|---|
| Fuente de pago | **371065**, reutilizada · no se creó otra ni se volvió a tokenizar |
| Transacciones | dos de B2W1 + **dos** de este tramo |
| Eventos reales | 2, ambos firmados y procesados |
| Eventos simulados | 5 del guardia de entorno + 5 reentregas |
| Suscripciones de QA | 2, activas, en empresas sintéticas |

**Dos transacciones en vez de una.** La segunda se hizo para intentar completar
la mitad del derecho, sobre una empresa nueva y provisionada. No lo consiguió
—por lo del `organization_modules` de arriba— y ahí se paró: es una desviación
del encargo, que autorizaba una.

## Estado final

- **Tasa QA cerrada**: `no_active_rate`; diez presupuestos históricos conservan
  su tipo. Cuatro vigencias cerradas, ninguna reescrita.
- **Derechos de QA**: se dejan como están, en empresas inconfundiblemente
  sintéticas, para los tramos siguientes. **Nada se borró.**

## Carryovers

- **`BROWSER_TOKENIZATION_REQUIRED_BEFORE_WOMPI_PROVIDER_CLOSURE = YES`**
- **`WOMPI_RENEWAL_SCHEDULER_REQUIRED = YES`**
- **`WOMPI_REPRICING_COF_BEHAVIOR = NEEDS_EXPLICIT_VERIFICATION`**
- **`WOMPI_RENEWAL_ROUTING_REQUIRED = YES`** *(nuevo)* — enrutar el segundo
  cobro hacia la primitiva de renovación.
- **`QA_FIXTURE_NEEDS_ENABLED_MODULE = YES`** *(nuevo)* — para poder ver la
  asignación vendida de punta a punta.
