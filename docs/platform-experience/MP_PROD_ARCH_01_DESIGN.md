# MP-PROD-ARCH-01 · Mercado Pago en Trazaloop, sin activar cobros

*9 de septiembre de 2026. Diseño. **Nada de esto está implementado**, y no se
toca Producción.*

Con MP-PLAN-01 cerrado —crear plan, checkout, descubrir, autorizar, cobrar y
cancelar— la pregunta deja de ser si Mercado Pago sirve y pasa a ser **cómo
entra sin romper lo que ya funciona**.

---

## El hecho que decide la arquitectura

El contrato de proveedor de PE-05B1 ya distingue **quién manda en la
recurrencia**:

| | Wompi | Mercado Pago |
|---|---|---|
| `recurrenceOwner` | **`merchant`** | **`provider`** |
| `supportsStoredPaymentSource` | sí | no |
| `supportsRecurringCharge` | sí | no |
| `supportsProviderSubscription` | no | **sí** |

Con Wompi, **Trazaloop lleva el calendario**: abre el periodo, decide cuándo
vence y ordena el cobro. Con Mercado Pago **el calendario es del proveedor**: MP
cobra por su cuenta y nosotros nos enteramos.

Todo lo que sigue se deduce de ahí. Y explica por qué **no** hay que construir un
segundo motor: hay que construir un **segundo modo** del mismo motor.

---

## A · Qué se reutiliza tal cual

| Pieza | Por qué sirve sin tocarla |
|---|---|
| `plan_revisions` · `plan_revision_limits` · `plans` | El catálogo comercial es del producto, no del proveedor |
| `commercial_fx_rates` · `billing_tax_rules` | El precio en pesos y el impuesto se calculan igual quien cobre |
| `billing_quotes` | Un presupuesto congela catálogo, descuento, tasa e impuesto: eso no cambia |
| `billing_subscriptions` | Ya tiene `provider`, `provider_subscription_id`, `plan_revision_id`, importes congelados y anclaje |
| `billing_payments` | Un pago aprobado es un pago aprobado |
| `billing_provider_events` | Ya guarda tópico, recurso, firma verificada, idempotencia y desenlace, **por proveedor** |
| `billing_payment_methods` | Existe; con MP quedará **vacía**, y eso es correcto |
| `organization_plan_assignments` | El derecho se concede aquí, y su origen sigue siendo un pago aprobado |
| `billing_operations_alerts` | Un cobro en duda avisa igual venga de donde venga |

**La columna `provider` es texto libre**: no hay ninguna restricción que impida
`mercadopago`. No hace falta migrar para admitirlo.

---

## B · Los huecos exactos

**1 · No existe ninguna relación entre una revisión de plan y un plan del
proveedor.** Cero columnas con `provider_plan` en todo el esquema. Es el hueco
central: sin eso, el `init_point` no se puede resolver desde el servidor y el
identificador acabaría llegando del navegador.

**2 · El motor de renovación no distingue al proveedor.** `billing_due_renewals`
selecciona vencimientos y medios de pago **sin filtrar por `recurrenceOwner`**.
Tal cual, intentaría cobrar una suscripción que Mercado Pago ya está cobrando.
**Es el riesgo más caro de esta integración: un cobro doble.**

**3 · Los periodos son obligaciones, no observaciones.**
`billing_subscription_periods` está pensado para que nosotros abramos el mes y
después cobremos. Con MP, el periodo **ya ocurrió** cuando nos enteramos.

**4 · No hay reconciliación.** Con Wompi el cobro lo iniciamos nosotros, así que
siempre sabemos que hubo intento. Con MP, si un webhook se pierde, **nadie se
entera**: ni de un cobro, ni de una cancelación hecha desde la app de Mercado
Pago.

**5 · El cambio de importe no existe como camino.** Está demostrado que
`PUT` de importe falla sin plan, y con plan **no se ha probado**. El MVP no debe
depender de él.

**6 · No hay webhook de Mercado Pago con verificación servidor→proveedor.** La
ruta existe desde PE-05B2, pero no está cerrada contra este modelo.

---

## C · El modelo · `billing_provider_plans`

Una tabla nueva, **append-only**, que ata la oferta comercial a un objeto del
proveedor:

```
billing_provider_plans
  id
  provider                     'mercadopago'
  environment                  'test' | 'live'
  plan_revision_id             → plan_revisions        (QUÉ se vende)
  billing_interval             'monthly' | 'annual'
  provider_plan_id             el preapproval_plan_id
  charge_currency              'COP'
  charge_amount                el importe EXACTO con el que se creó allí
  fx_rate_id                   la vigencia usada al fijarlo
  tax_rule_id                  la regla usada al fijarlo
  status                       'active' | 'retired'
  effective_from / effective_to
  created_by / created_at
```

**Las tres reglas que la gobiernan**, y son las mismas que rigen el resto del
modelo comercial:

1. **Un plan del proveedor no se edita nunca.** Si cambia el precio, la tasa o
   el impuesto, se crea **otro** `preapproval_plan` y una fila nueva; la
   anterior se retira cerrando su vigencia. Editar el de allí cambiaría el
   precio a quien ya está suscrito, sin que nadie lo decidiera.
2. **Una suscripción viva apunta a la fila con la que nació.** Su verdad
   histórica es la de su fila, no la vigente hoy — igual que el periodo congela
   su identidad desde 0182.
3. **No hay dos vigentes para el mismo (revisión, intervalo, entorno).** Un
   disparador lo impide, como el de solapamiento de FX en 0182.

Y el enlace desde la suscripción: `billing_subscriptions.provider_plan_id`.

---

## D · Productos iniciales

Cuatro filas, con las cifras comerciales ya congeladas y **calculadas por el
dominio, no escritas a mano**: `billing_usd_minor_to_cop` con la tasa vigente,
más `billing_tax_amount` con la regla vigente.

```
Full   monthly     Full   annual
Extra  monthly     Extra  annual
```

**No se crean planes reales de Producción todavía.** Se crean en sandbox para
cerrar el diseño, y en Producción solo dentro de la ventana de corte comercial.

---

## E · Checkout

```
persona elige oferta
  → servidor: presupuesto (catálogo · descuento · FX · impuesto)   [ya existe]
  → servidor: resuelve billing_provider_plans por
              (plan_revision_id, billing_interval, entorno)         [NUEVO]
  → si el importe del presupuesto ≠ charge_amount de la fila → SE PARA
  → devuelve el init_point de ESE plan
  → la persona va a Mercado Pago
```

**El navegador nunca manda un identificador de plan.** Manda una intención —qué
plan y cada cuánto— y el servidor resuelve. Es la misma regla que ya rige el
importe en `billing_create_quote`.

**Y la comprobación del importe no es decorativa**: si el plan del proveedor y el
presupuesto no coinciden, alguien cambió una tasa sin crear una fila nueva. Parar
ahí es barato; descubrirlo en la factura del cliente, no.

---

## F · El retorno del navegador

No concede nada. Muestra *«Estamos verificando tu suscripción»* y lee el estado
**canónico** de la base. Es lo mismo que ya hace el retorno de Wompi, y la razón
es idéntica: **volver de una pasarela no es haber pagado**.

---

## G · MP-WEBHOOK-01

```
llega la notificación
  → se guarda en billing_provider_events (idempotente por recurso+tópico)
  → se verifica la firma; sin firma válida NO se procesa
  → se RELEE del proveedor: GET /preapproval/{id}
                            GET /authorized_payments/search?preapproval_id=…
                            GET /v1/payments/{id}
  → se concilia contra el modelo
  → se concede o se retira el derecho
  → se cierra el evento con su desenlace
```

**La carga del webhook no es la verdad**: es un aviso de que hay algo que mirar.
La verdad se relee del proveedor con nuestras credenciales. Esa regla ya está
escrita para Wompi y no se relaja aquí.

Idempotencia por `(provider, topic, resource_id)`, que la tabla ya soporta.

---

## H · Reconciliación

Un pase periódico —el mismo corredor que ya existe, en **modo observación**—
que para cada suscripción viva de Mercado Pago:

1. `GET /preapproval/{id}` → estado y `next_payment_date`
2. `GET /authorized_payments/search?preapproval_id=…` → facturas
3. `GET /v1/payments/{id}` → el pago, con su importe y su estado

y detecta: autorizada, cancelada **fuera de Trazaloop**, cobro aprobado, cobro
rechazado, renovación nueva.

**No cobra. No puede cobrar.** Es el contrapeso de que la iniciativa sea del
proveedor: sin esto, un webhook perdido es un derecho mal concedido o mal
retirado, y nadie se entera.

Una lección de esta semana entra aquí: **preguntar mal no es un cero**. El helper
por `external_reference` devolvía `total 0` para una suscripción que sí había
cobrado. Las consultas de reconciliación van por `preapproval_id`, y un error del
proveedor se registra como error, nunca como ausencia.

---

## I · Cancelación

```
PUT /preapproval/{id}   { "status": "cancelled" }
GET /preapproval/{id}   → confirmar
```

```
MERCADOPAGO_PREAPPROVAL_CANCEL_STATUS = "cancelled"
```

Con doble ele. Probado: `canceled` devuelve 400 «Invalid preapproval status
param». Y el `GET` posterior es obligatorio — el eco del `PUT` no es evidencia.

---

## J · Subidas y bajadas, en el MVP

**Sin depender del cambio de importe**, que no está demostrado con plan y falló
sin él.

**Subir** (Full → Extra), en este orden:
1. Se crea una suscripción nueva contra el plan de Extra.
2. La persona autoriza.
3. **Solo cuando hay pago aprobado**, se cancela la de Full y se concede Extra.

Nunca al revés. Cancelar primero dejaría a alguien pagando sin plan si la
autorización no llega.

**Bajar** (Extra → Full) y **cambiar de periodicidad**: cambio **programado al
final del periodo pagado**, que es la política que PE-05B6E ya congeló. Al
vencer, se cancela la actual y se abre la del plan destino.

**La asimetría no es un capricho**: subir es inmediato porque el cliente recibe
más; bajar espera al borde pagado porque ya pagó por lo que tiene.

---

## Migraciones

**0184** · `billing_provider_plans` con sus disparadores de solo-añadir y
no-solapamiento, `billing_subscriptions.provider_plan_id`, y una función
`billing_resolve_provider_plan(plan_revision_id, interval, environment)`.

**0185** · `billing_due_renewals` filtrando por dueño de la recurrencia: **una
suscripción de Mercado Pago no entra jamás en el cobro automático**. Es la
migración que evita el cobro doble, y va sola para que se pueda revisar sola.

**0186** · reconciliación: `billing_record_provider_observation` y el desenlace
que concede o retira derecho desde una lectura, no desde una orden.

*(Numeración provisional: Producción está en 0183.)*

---

## Orden de implementación, hasta el primer cobro real controlado

| | Paso | Se puede parar aquí sin daño |
|---|---|---|
| 1 | **MP-PLAN-02-ANNUAL** en sandbox: ¿el plan anual preserva 12 meses? | sí |
| 2 | Migración **0184** y su suite | sí |
| 3 | Sembrar los cuatro planes **en sandbox** desde el dominio | sí |
| 4 | Checkout que resuelve el plan en el servidor · Preview | sí |
| 5 | **0185** · el motor de renovación excluye a Mercado Pago | sí |
| 6 | **MP-WEBHOOK-01** con relectura y firma · Preview | sí |
| 7 | Ciclo completo en sandbox: contratar → cobrar → renovar → cancelar | sí |
| 8 | **0186** · reconciliación, en modo observación | sí |
| 9 | Credenciales de Producción y webhook registrado | **no** — aquí empieza lo irreversible |
| 10 | Planes reales de Producción, creados en la ventana de corte | no |
| 11 | **Un** cobro real controlado, importe mínimo, empresa de QA | no |

Los pasos 1 a 8 son todos reversibles y no tocan dinero de nadie. El 9 es la
frontera.

---

## Lo que este diseño NO propone

No hay segundo motor de facturación. No hay credenciales de Producción, ni
planes reales, ni pagos, ni webhooks de Producción. No se activa
`COMMERCIAL_PAYMENTS_ALLOWED` ni se toca la puerta de PE-06D2.

Y una cosa que conviene decir en voz alta: **elegir Mercado Pago no obliga a
abandonar Wompi.** El modelo admite los dos a la vez porque la diferencia está
declarada en las capacidades, no en el esquema. Cuál se ofrece, y a quién, es una
decisión comercial que este documento no toma.
