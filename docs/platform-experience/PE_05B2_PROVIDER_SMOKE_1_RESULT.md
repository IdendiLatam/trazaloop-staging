# PE-05B2 · La llamada real · qué dijo Mercado Pago

**Se llamó al proveedor. Cuatro veces. Las cuatro rechazó, por el mismo motivo,
y no es la recurrencia.**

## Cómo se llegó al Preview sin tocar el SSO

Con **Protection Bypass for Automation**, el mecanismo oficial de Vercel. El
secreto se usa como cabecera dentro del proceso y no se imprime, ni se guarda,
ni se escribe aquí.

Comprobado en la misma sesión, contra el mismo despliegue:

| Petición | Respuesta |
|---|---|
| Sin bypass | **401** · la protección sigue puesta |
| Con bypass | **200** · llega al despliegue |

El SSO **no se desactivó** ni se debilitó para nadie.

## Quién puede disparar la prueba

El disparador acepta dos identidades: superadministrador de plataforma con su
sesión —cuando lo lanza una persona— o quien presenta el **secreto de
automatización del proyecto**, comparado en tiempo constante contra el que el
despliegue conoce.

La segunda no es un permiso más débil. Quien tiene ese secreto tiene acceso al
proyecto en Vercel, y con él puede leer cualquier variable de entorno y volver
a desplegar: es estrictamente más que ser superadministrador de Trazaloop.

## El token

`access_token_environment: "test"`. Se ejecutó el clasificador de B2 **del lado
del servidor**; el valor no se leyó, ni se imprimió, ni se copió.

## Lo que B1 calculó, sin una cifra escrita a mano

| | Full mensual | Extra anual |
|---|---|---|
| Catálogo | USD 40,00 | USD 1 000,00 |
| Tasa | 4 000 COP/USD (sintética de QA) | igual |
| Base | 160 000 COP | 4 000 000 COP |
| IVA 19 % | 30 400 COP | 760 000 COP |
| **Total** | **190 400 COP** | **4 760 000 COP** |

Ningún importe viajó desde el navegador: las acciones del disparador son un
catálogo cerrado de nombres, y el dinero sale del presupuesto de B1.

## Lo que se le pidió a Mercado Pago

```json
{
  "reason": "Trazaloop FULL monthly (QA sandbox)",
  "external_reference": "<uuid del intento>",
  "payer_email": "<MERCADOPAGO_TEST_BUYER_EMAIL>",
  "back_url": "…/billing/return",
  "status": "pending",
  "auto_recurring": {
    "frequency": 1,          ← anual: 12
    "frequency_type": "months",
    "transaction_amount": 190400,   ← anual: 4760000
    "currency_id": "COP"
  }
}
```

Sin `preapproval_plan_id`. La anual pidió **`frequency: 12`**, no doce cobros.

## La respuesta

```
http=400 | message=Payer is associated with a different site
```

Idéntica en la mensual y en la anual.

## Qué significa, comprobado y no supuesto

El error podía querer decir dos cosas muy distintas —comprador de otro país, o
vendedor que no es de Colombia—, y la persona tendría que hacer cosas distintas
en cada caso. Así que se preguntó por el sitio de la cuenta vendedora:

```
site_id: MCO · country_id: CO · user_type: normal
```

**La cuenta vendedora es colombiana.** El peso y el sitio son los correctos, y
el rechazo es del **pagador**: `test@testuser.com` es la dirección de ejemplo de
la documentación, no un usuario de prueba del sitio MCO de esta cuenta. Mercado
Pago exige que el pagador pertenezca al mismo sitio que el vendedor.

`TEST_BUYER_ACCOUNT_EMAIL_REQUIRED_FOR_HUMAN_AUTH`.

Hace falta el correo de la cuenta **Comprador Colombia** que ya se creó en el
panel, puesto en `MERCADOPAGO_TEST_BUYER_EMAIL` (Vercel, ámbito Preview). No
hay que pegarlo en ninguna conversación.

Alternativa, si se prefiere: Mercado Pago permite crear un usuario de prueba
por API (`POST /users/test_user` con `site_id: MCO`), que devuelve un correo
válido. **No se hizo**: sustituiría por cuenta propia la identidad que ya se
configuró, y eso lo decide una persona.

## Lo que NO se pudo demostrar

**`ANNUAL_RECURRENCE` sigue en `DOCUMENTATION INCONCLUSIVE`.**

Mercado Pago valida el pagador **antes** que la recurrencia, así que rechazó la
anual sin llegar a opinar sobre `frequency: 12`. No es un rechazo del anual: es
que la pregunta no llegó a hacerse. Con un pagador válido se responde en una
sola llamada.

## Ningún artefacto quedó en el proveedor

`PreApproval.search` devuelve **total: 0**. No hay ni una suscripción en la
cuenta de pruebas: los cuatro intentos fueron rechazos, no creaciones a medias.

Se comprobó **preguntando al proveedor**, no deduciéndolo de que las respuestas
fueran 400.

## Lo que sí quedó en Staging

| | |
|---|---|
| Empresa | `QA-PE05B2-MERCADOPAGO` · una, reutilizada |
| Tasa | una, `QA-SYNTHETIC-NOT-FOR-PRODUCTION` |
| Presupuestos | 4 · tres Full mensual, uno Extra anual |
| Intentos | 4 · todos `created`, **ninguno con id de proveedor** |
| Suscripciones / cobros / eventos | **0 / 0 / 0** |

Los intentos sin `provider_subscription_id` son la prueba del lado nuestro de
que ninguna creación llegó a completarse.

> **La tasa sintética manda mientras esté puesta.** `billing_resolve_fx` no mira
> la nota: cualquier presupuesto de Staging usará 4 000 COP/USD hasta que se
> retire o la sustituya una tasa real. Hay que quitarla antes de cualquier uso
> comercial de Staging.

## Un descuido propio, corregido

La primera versión de la comprobación del sitio devolvía `/users/me` casi
entero, y ahí venía el **teléfono del titular** de la cuenta. Para responder
«¿de qué país es esta cuenta?» no hace falta un dato personal. Se recortó a
`site_id`, `country_id`, `user_type` y `tags`.
