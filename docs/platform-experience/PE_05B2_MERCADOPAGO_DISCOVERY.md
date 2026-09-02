# PE-05B2 · Lo que dice la documentación oficial de Mercado Pago

Consultado el **2 de septiembre de 2026**. Solo fuentes oficiales: el portal de
desarrolladores de Mercado Pago y el SDK oficial de Node publicado en npm.
Ningún blog ni foro se usó como autoridad.

El portal responde de forma irregular por región —varias rutas devolvieron 404
o 503 mientras otras equivalentes respondían—. Eso es inestabilidad del sitio,
no ausencia de la API: cuando una ruta falló se consultó la equivalente de otro
país o el propio SDK.

## Fuentes

| Qué | Dónde |
|---|---|
| Crear suscripción | `mercadopago.com.co/developers/en/reference/online-payments/subscriptions/create-preapproval/post` |
| Suscripción sin plan · pago autorizado | `mercadopago.com.co/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments` |
| Suscripción sin plan · pago pendiente | `mercadopago.com.br/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments` |
| Gestión de suscripciones | `mercadopago.com.co/developers/en/docs/subscriptions/subscription-management` |
| Webhooks y firma | `mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks` |
| SDK oficial | `mercadopago@3.6.0` (npm), tipos y código publicados |

## Suscripción SIN plan asociado

`preapproval_plan_id` es **opcional**. Se crea con `POST /preapproval` mandando
`auto_recurring`, `payer_email`, `external_reference`, `back_url`, `reason` y
`status`.

Hay dos modelos:

- **`status: "pending"`** — sin medio de pago todavía. Mercado Pago devuelve un
  `init_point` al que se manda al cliente para que autorice.
- **`status: "authorized"`** — exige `card_token_id`, es decir, tokenizar la
  tarjeta antes. Trazaloop **no** toma este camino en B2: obligaría a tener el
  formulario de tarjeta, que es de B4.

## Recurrencia

`auto_recurring.frequency` es un número y `frequency_type` admite **`"months"`
o `"days"`**. Los ejemplos oficiales usan siempre `frequency: 1`.

## Anual · NO DEMOSTRADO

**`ANNUAL RECURRENCE — DOCUMENTATION INCONCLUSIVE`.**

- **Qué se revisó**: la referencia de `POST /preapproval` en cuatro países, la
  referencia de `POST /preapproval_plan`, las dos guías de suscripción sin plan
  y los tipos del SDK oficial.
- **Qué acepta el contrato**: `frequency` es `number` sin restricción declarada
  y `frequency_type` acepta `months`. `frequency: 12, frequency_type: "months"`
  es representable.
- **Qué NO está demostrado**: que el servidor de Mercado Pago **acepte** esa
  combinación para una suscripción sin plan asociado en Colombia. Ninguna
  página oficial declara un rango permitido ni una restricción, y todos los
  ejemplos usan `1`. Que el SDK declare `frequency: number` no demuestra que el
  backend lo admita.
- **Qué prueba lo resolvería**, en cuanto haya credenciales de PRUEBA:

```
POST https://api.mercadopago.com/preapproval
Authorization: Bearer TEST-…
{
  "reason": "Trazaloop Full anual (prueba)",
  "external_reference": "<uuid del intento>",
  "payer_email": "test_user_…@testuser.com",
  "back_url": "https://…/billing/return",
  "status": "pending",
  "auto_recurring": {
    "frequency": 12,
    "frequency_type": "months",
    "transaction_amount": <total en pesos>,
    "currency_id": "COP"
  }
}
```

Se acepta si devuelve 201 y `GET /preapproval/{id}` responde
`auto_recurring.frequency = 12`. Si devuelve 400, el anual **no** es
representable y eso sí sería una decisión de producto.

**No se simula el año con doce cobros mensuales.** Está prohibido en el encargo
y no hay ninguna rama del código que lo haga: un cliente que compra un año paga
una vez, y partirlo en doce le permitiría dejar de pagar en el tercero
llevándose lo que contrató.

## Cambiar el importe de UNA suscripción

`PUT /preapproval/{id}` acepta `auto_recurring.transaction_amount` y
`currency_id`. El SDK lo declara sin ambigüedad:

> «Only the amount and currency can be changed after creation; frequency and
> schedule are immutable.»

También acepta `status` (`paused`, `cancelled`), `card_token_id`,
`external_reference`, `back_url` y `reason`. La guía de gestión menciona además
día fijo de cobro mensual y un importe prorrateado configurable.

Lo que la documentación **no** dice: cuándo entra en vigor el importe nuevo, si
genera cargo inmediato y si prorratea. Ver
[el cambio de importe](PE_05B2_AMOUNT_CHANGE.md).

## Primer cobro

La guía de pago autorizado dice que el primer cargo ocurre **alrededor de una
hora después** de crear la suscripción, y que antes hay una validación de
tarjeta que se devuelve.

De ahí sale una de las decisiones más importantes del tramo: **`authorized` no
es «activo»**. Una suscripción puede estar autorizada sin que se haya cobrado
nada. Traducirlo a activo daría el plan de pago a quien todavía no ha pagado.

## Notificaciones

Temas: `payment`, `subscription_preapproval`, `subscription_authorized_payment`,
`subscription_preapproval_plan`, más otros que no tocan a Trazaloop.

Para suscripciones sin plan hacen falta `subscription_preapproval` y
`subscription_authorized_payment`; los cobros llegan además por `payment`.

## Firma

`x-signature` con formato `ts=<milisegundos>,v1=<hex>`, más `x-request-id`. El
manifiesto es

```
id:[data.id];request-id:[x-request-id];ts:[ts];
```

omitiendo las partes ausentes, con `data.id` en minúsculas si trae mayúsculas,
y HMAC-SHA256 en hexadecimal con la clave secreta de la aplicación.

## Idempotencia

El SDK expone `requestOptions.idempotencyKey`, que viaja como cabecera de
idempotencia. Se usa en la creación de la suscripción con la referencia externa
del intento. No se inventa la cabecera en endpoints donde no está documentada.
