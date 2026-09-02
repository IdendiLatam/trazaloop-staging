# PE-05B2 · Los estados, traducidos

El estado crudo del proveedor **nunca** es el estado canónico de Trazaloop. Se
guarda aparte, en el registro del proveedor, y se traduce.

## Suscripción

| Mercado Pago | Trazaloop | Por qué |
|---|---|---|
| `pending` | `pending` | sin medio de pago todavía |
| **`authorized`** | **`pending`** | **autorizado no es pagado** |
| `paused` | `past_due` | el cobro no está ocurriendo |
| `cancelled` / `canceled` | `ended` | ambas grafías aparecen en la documentación |
| `finished`, `expired` | `ended` | |
| cualquier otro | **`null` → revisión** | |

La fila que importa es la segunda. Mercado Pago cobra **alrededor de una hora
después** de autorizar, y antes hace una validación de tarjeta que devuelve.
Traducir `authorized` a `active` daría el plan de pago a quien todavía no ha
pagado nada, por un malentendido de calendario. El derecho lo concede un
**pago aprobado**, nunca una autorización.

## Pago

| Mercado Pago | Trazaloop | Por qué |
|---|---|---|
| `approved` | `approved` | |
| `authorized` | `pending` | retenido, no cobrado |
| `pending` | `pending` | |
| **`in_process`** | **`pending`** | **revisión antifraude, no rechazo** |
| `in_mediation` | `manual_review` | hay una disputa abierta |
| `rejected` | `declined` | decisión del medio de pago |
| `cancelled` / `canceled` | `failed` | no llegó a cobrarse |
| `refunded` | `refunded` | |
| `charged_back` | `manual_review` | contracargo: lo mira una persona |
| cualquier otro | **`null` → revisión** | |

`in_process` acaba aprobado a menudo. Tratarlo como rechazo dejaría al cliente
sin plan habiendo pagado, y encima culpando a su tarjeta.

## Solo tres salidas liquidan

`approved`, `declined` y `failed`. `pending` y `manual_review` **no liquidan**:
se anota y se espera al aviso siguiente. Eso es distinto de fallar.

## Un estado desconocido no degrada a nadie

Va a `manual_review`, se anota el estado crudo para poder investigarlo, y **el
derecho no se toca**. Comprobado ejecutando: se manda un estado inventado y la
asignación vendida y la suscripción activa siguen exactamente igual.

Cancelar, marcar moroso o terminar son decisiones de ciclo de vida, y son de
**B5**. Ninguna rama de B2 las toma.

## Caída del proveedor ≠ rechazo del cliente

| Situación | Clase |
|---|---|
| conexión, tiempo agotado, 5xx, 429 | `provider_unavailable` |
| credenciales mal puestas | `provider_unavailable` |
| rechazo real del medio de pago | `declined` |
| petición mal formada | `invalid_request` |

Confundirlos acaba en un cliente que pagó y al que se le baja el plan. Cuando
el recurso no se puede leer, el evento queda en `pending_resource` y **no se
liquida nada**.
