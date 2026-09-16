# PE-05B2 · MP-SBX-02C · El fallo del proveedor, reintentado y cerrado

Sanitizado. No contiene tokens, secretos, credenciales, direcciones de correo
completas ni datos personales.

Este documento existe porque la evidencia que lo sostiene **ya no está en el
código**: las dos sondas que la produjeron se retiraron en el mismo tramo que lo
escribe. Sin esto, «Mercado Pago lo arregló» volvería a ser una afirmación de
oídas.

## 1 · Qué bloqueaba

`MP-SBX-02B` se quedó parado en una respuesta del proveedor:

```
PUT /preapproval/{id}
400 · Invalid value for preapproval_plan_id
```

El campo del mensaje **no se enviaba**: ni con valor, ni nulo, ni vacío. Y la
suscripción no tenía plan asociado. Se abrió ticket.

## 2 · Lo que Mercado Pago confirmó por ticket

| | |
|---|---|
| `application_id` `685221457097068` | Es la **TestApp automática** de la cuenta de prueba. No es un error de configuración nuestro, y no se puede corregir desde la cuenta principal. |
| `notifications_callback_url = null` | La TestApp automática no lo expone. **La ausencia de webhook en ese escenario es esperada**, no un síntoma. |
| El `400` | Era un **fallo de plataforma**, corregido el **09/09 sobre las 17:45 (hora de Brasil)**. |

Mercado Pago pidió reintentar el ciclo de vida sobre una preapproval nueva.

## 3 · Por qué el reintento necesitó una sonda aparte

El arnés ya tenía `probe_amount_change`, pero **ya no reproducía el caso**:
después del 400 se le añadió `reason` al cuerpo, que fue el rodeo que
desbloqueó el trabajo. Un 200 por esa vía no distingue dos cosas muy distintas:

- que el proveedor lo haya arreglado, y
- que sigamos esquivándolo.

Así que el reintento se hizo con el cuerpo **original**, el que el proveedor
reconoce como afectado: `auto_recurring` y nada más.

## 4 · El retest, con sus números

Ejecutado el **16/09/2026** sobre Preview/Sandbox, con la sesión real de
superadministrador. Fronteras comprobadas **antes** de la primera llamada:

```
vercel_environment      : preview
configured_environment  : test
observed_owner_id       : 3663569024   (coincide con el esperado)
owner_site_id           : MCO
provider_reachable      : true
```

| # | Paso | Resultado |
|---|---|---|
| 1 | `POST /preapproval` · diaria, 5000 COP, `status: pending` | **201** |
| 2 | Lectura del estado | `pending` · 5000 COP · sin plan asociado · 0 pagos |
| 3 | `PUT /preapproval/{id}` · **solo** `auto_recurring` | **200** |
| 4 | Relectura independiente del proveedor | **9000 COP** · `version` 1 → 2 |
| 5 | `PUT` de cancelación · `reason` + `status: cancelled` | **200** |
| 6 | Estado final | **`cancelled`** · 0 pagos |

Identidad del objeto creado:

```
preapproval_id : 03ec8c2a1b1f44fe9a7a4d490c4e3e78
application_id : 685221457097068   (TestApp automática · esperado)
collector_id   : 3663569024
external_ref   : MP-SBX-02C-UP-c4911307-3aa1-4c91-b90e-5acfd869b0bf
payer          : test_user_…@testuser.com   (enmascarado)
```

El cuerpo EXACTO del `PUT` que decide, tal y como salió:

```json
{ "auto_recurring": { "transaction_amount": 9000, "currency_id": "COP" } }
```

Una sola clave de primer nivel. Sin `reason`, sin `preapproval_plan_id`, sin
`status`, sin `external_reference`, sin `back_url`, sin `card_token_id`.

## 5 · Veredicto

```
PROVIDER_BUG_FIX_CONFIRMED = YES
PREVIOUS_400_REPRODUCED    = NO
PROVIDER_BLOCK             = CLEARED
```

El `400` no reapareció, el cambio **persistió** —comprobado releyendo del
proveedor, no del eco del `PUT`— y la cancelación llegó a `cancelled`.

Ningún cobro se disparó: los pagos asociados a la referencia fueron **0** en las
tres lecturas. Tampoco se escribió estado interno: las sondas no tocaban ninguna
tabla, así que no hubo empresa, suscripción, periodo ni módulos que limpiar.

## 6 · Lo que este resultado NO autoriza

El rodeo **sigue en pie**. El adaptador canónico manda `reason` +
`auto_recurring` y se queda exactamente igual.

Que el proveedor haya corregido el fallo no es razón suficiente para quitarlo:
`reason` es un campo documentado como obligatorio al actualizar una suscripción
sin plan asociado, y retirarlo es una decisión de diseño que se evalúa aparte,
con su propia evidencia. Este documento solo cierra la pregunta del proveedor.

Tampoco autoriza arrancar recurrentes en Producción. El lanzamiento sigue
siendo Checkout Pro con pagos únicos.

## 7 · Las sondas, y por qué ya no están

Se añadieron dos acciones temporales al disparador de QA:

- `probe_provider_fix_create` — creaba la suscripción resolviendo el comprador
  de prueba **del entorno**, para no pasear esa identidad por el navegador ni
  por la conversación que conducía la prueba.
- `probe_provider_fix_original_put` — mandaba el cuerpo original desnudo.

Las dos se **retiraron** en el commit que publica este documento. La evidencia
que produjeron está arriba; el código que la produjo era de un solo uso, y
dejarlo vivo habría sido dejar una vía de escritura al proveedor sin motivo.

`probe_daily`, `probe_amount_change`, `probe_state` y `cancel_min` **no se
tocaron**: forman parte del arnés de sandbox ya gobernado.
