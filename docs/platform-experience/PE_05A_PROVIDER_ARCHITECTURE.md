# PE-05A · El proveedor de pagos y su frontera

## Lo que Trazaloop necesita

| Necesidad | Por qué |
|---|---|
| Comercio colombiano | la empresa opera desde Colombia |
| SaaS recurrente mensual | Full y Extra se cobran cada mes |
| SaaS anual | 400 y 1 000 USD al año |
| Medios de pago colombianos | tarjetas locales, y previsiblemente PSE |
| Tarjetas internacionales | si es comercialmente viable |
| Webhooks fiables | el pago se confirma en servidor, no en el navegador |
| Cancelación de suscripción | el cliente debe poder irse |
| Consulta de estado de pago | para reconciliar cuando el webhook falla |
| Devoluciones | aunque sean excepcionales |
| Idempotencia | un webhook llega repetido por diseño |
| Verificación en servidor | firma o consulta directa a la API |

## Una frontera, no un proveedor esparcido

> **PAY-01** · El dominio comercial **no conoce al proveedor**. Se define una
> frontera —`BillingProvider`— con las operaciones que el negocio necesita:
>
> ```
> createCheckout(quote)        → { redirectUrl, providerRef }
> createSubscription(quote)    → { providerSubscriptionId, status }
> cancelSubscription(id, when) → { status }
> getPaymentStatus(ref)        → estado canónico
> verifyWebhook(raw, headers)  → { valid, eventId, type, payload }
> refund(paymentRef, amount)   → { status }
> ```
>
> Ningún nombre de proveedor aparece en el dominio. Nada se llama
> `mercadopago_subscription_id` fuera de la tabla que guarda referencias del
> proveedor.

El motivo no es purismo: es que el proveedor de pagos es la pieza que más
probablemente cambie —por comisiones, por cobertura o porque deja de servir— y
cambiarlo no puede obligar a tocar el modelo comercial que PE-04 acaba de
estabilizar.

## Un proveedor, no una orquesta

> **PAY-02** · **Un solo proveedor en el lanzamiento.** Construir orquestación
> multi-proveedor antes de tener el primer cliente de pago es trabajo que se
> paga hoy y se usa quizá nunca.
>
> Lo que sí se hace es dejar el reemplazo posible: la frontera de PAY-01, y que
> las referencias del proveedor vivan en su propia tabla —`billing_provider_refs`
> o equivalente— en vez de como columnas del dominio.

## Candidatos, y lo que hay que verificar fuera del repositorio

**Este encargo no incluye investigación web.** Lo que sigue es el marco de
evaluación y lo que hay que confirmar con el proveedor antes de decidir; los
datos comerciales concretos —comisiones, disponibilidad, límites— **necesitan
verificación externa** y no se inventan aquí.

| Candidato | Encaje aparente | Qué verificar antes de elegir |
|---|---|---|
| **Mercado Pago** | comercio colombiano, presencia fuerte en LATAM, API madura, sandbox | ¿soporta suscripciones recurrentes (preapproval) en Colombia?, ¿tarjetas internacionales?, ¿COP y/o USD?, comisiones |
| **Wompi** (Bancolombia) | pensado para Colombia, PSE y tarjetas | ¿recurrencia nativa o hay que tokenizar y cobrar nosotros?, ¿webhooks y firma?, ¿internacionales? |
| **PayU LATAM** | recurrencia y cobertura regional | comisiones, complejidad de integración, calidad de webhooks |
| **ePayco** | integración sencilla, medios locales | madurez de la API de suscripciones |
| **dLocal** | cobro local con liquidación internacional | mínimos de facturación, ¿es para nuestro tamaño? |
| **Stripe** | la mejor API de suscripciones del mercado | **verificar si acepta comercios colombianos para recibir liquidación**; si no, queda descartado por mucho que la API guste |

La pregunta que decide casi todo: **¿el proveedor gestiona la recurrencia, o
solo cobra una vez?** Si solo cobra una vez, Trazaloop tendría que guardar un
token y disparar cobros por su cuenta —un sistema de reintentos, calendario y
tolerancia a fallos que es un producto en sí mismo—. Eso cambia el coste del
tramo por completo y debe pesar más que la comisión.

> **Decisión humana pendiente 1** · Qué proveedor. La arquitectura no depende de
> cuál, pero el calendario sí: recurrencia nativa o recurrencia construida.

## Modo sandbox y separación de entornos

> **PAY-03** · Tres configuraciones separadas: **sandbox** para desarrollo,
> **sandbox** para Staging y **producción** solo en Producción. Las credenciales
> de producción **nunca** viven en Preview ni en Staging, y un webhook de prueba
> **no puede** tocar datos de Producción.
>
> Cada webhook entrante declara a qué entorno pertenece y se rechaza si no
> coincide. Un evento de sandbox llegando a Producción es un intento de fraude o
> un error de configuración; en los dos casos, se rechaza y se registra.

## Frontera PCI

> **PAY-04** · **Trazaloop nunca ve una tarjeta.** Se usa checkout alojado por el
> proveedor o tokenización en el navegador contra el proveedor. Ni el número, ni
> el CVV, ni un token reutilizable pasan por nuestros servidores ni por nuestra
> base.
>
> Con eso el alcance PCI de Trazaloop queda en **SAQ-A** (o el equivalente del
> proveedor), que es la única frontera sostenible para un equipo de este tamaño.
