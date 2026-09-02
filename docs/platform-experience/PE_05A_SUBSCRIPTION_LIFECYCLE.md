# PE-05A · El ciclo de vida de una suscripción

## Tres ejes que PE-04 separó y PE-05 no puede volver a juntar

> **PAY-16** · **Derecho comercial ≠ estado de pago ≠ autorización.**
>
> - Lo que la empresa **tiene** lo dice PE-04: las asignaciones canónicas.
> - Lo que la empresa **ha pagado** lo dice PE-05.
> - Lo que una persona **puede hacer** lo dicen el rol y la RLS.
>
> Un pago cobrado puede existir sin derecho vigente (devuelto, o de un periodo
> pasado). Un derecho puede existir sin pago (Free, prueba, cortesía, asignación
> manual). Y quien paga no es necesariamente quien puede escribir.

## Free y la prueba no pasan por caja

> **PAY-18** · Free **no crea** cliente en el proveedor, ni suscripción, ni
> presupuesto. Y **sigue funcionando aunque la pasarela esté caída**: es el suelo
> del producto, no un plan de pago con precio cero.
>
> La prueba de 48 horas **no pide tarjeta** ni crea nada en el proveedor. Al
> caducar cae a Free sola, como ya hace hoy. Crear un registro de pasarela para
> empezar una prueba sería inventar una relación comercial que no existe.

## De Free a Full o Extra

```
admin elige plan e intervalo
  → servidor emite PRESUPUESTO
  → checkout del proveedor
  → el cliente paga
  → ⚠ el proveedor CONFIRMA (webhook o consulta)
  → se registra el pago
  → se crea la asignación canónica con commercial_assign_plan
  → PE-04 resuelve el nuevo plan efectivo
```

> **PAY-20** · **Volver del checkout no activa nada.** El redirect con
> `?success=true` es experiencia de usuario; la verdad del pago es el evento
> verificado del proveedor o una consulta a su API. Activar por el parámetro de
> una URL es regalar el producto a quien sepa escribir esa URL.

Mientras el pago se confirma, la pantalla dice **«estamos confirmando tu pago»**,
no «ya eres Full» ni «tu pago falló».

## La activación usa la transición canónica

> **PAY-21** · La activación llama a **`commercial_assign_plan`** (0167/0168), con
> `source = 'checkout'` y `grant_kind = 'sold'`.
>
> No se escribe en `organization_plan_assignments` a mano, no se toca
> `organization_subscriptions`, y **no existe un segundo resolutor de plan
> efectivo**. PE-04 sigue siendo la autoridad de derecho; PE-05 solo provoca
> transiciones autorizadas.
>
> De regalo: 0168 ya cierra la asignación anterior del mismo alcance, así que una
> subida o bajada por facturación hereda un comportamiento correcto y probado.

## El registro de suscripción de Trazaloop

Mínimo, y sin copiar las tripas del proveedor:

```
organization_id
provider · provider_customer_id · provider_subscription_id
plan_code · plan_revision_id · billing_interval
status
current_period_start · current_period_end
cancel_at_period_end
cancelled_at · ended_at
```

> **PAY-22** · Los **estados canónicos** son de Trazaloop, no del proveedor:
> `pending` · `active` · `past_due` · `cancel_at_period_end` · `cancelled` ·
> `expired`. Los estados del proveedor se **traducen** en la frontera.
>
> Heredar sus cadenas como vocabulario del dominio ata el producto a un
> proveedor concreto por la puerta de atrás: cambiarlo obligaría a reescribir
> cada `if` del sistema.

## El registro de pago

Separado de la suscripción, porque son cosas distintas: la suscripción es una
relación, el pago es un hecho.

```
organization_id · subscription_id · quote_id
provider_payment_id
base · discount · tax · total · currency
fx_rate · fx_source (si hubo)
status · paid_at · failed_at · failure_reason
refunded_amount · refunded_at
provider_fee (si el proveedor lo informa)
```

La comisión del proveedor se guarda **solo para análisis de rentabilidad**.
**PAY-23**: jamás altera lo que el cliente tiene.

## Renovación

> **PAY-24** · Una renovación cobrada **no crea una jerarquía de plan nueva**.
> Registra el pago, mueve el periodo de la suscripción y **deja la asignación
> comercial como está**: el cliente sigue teniendo lo mismo, y crear una
> transición idéntica cada mes llenaría su historia comercial de ruido que no
> explica nada.
>
> La asignación solo se toca cuando **cambia** lo que la empresa tiene.

## Pago fallido

> **PAY-25** · Un fallo de cobro **no baja el plan de inmediato** ni borra nada.
> Se pasa a `past_due` y empieza un periodo de gracia.
>
> Y se distinguen tres cosas que no son la misma:
>
> | | Qué es | Qué se hace |
> |---|---|---|
> | `PAYMENT_DECLINED` | el banco rechazó | gracia y aviso |
> | `SUBSCRIPTION_PAST_DUE` | venció y no se cobró | gracia y aviso |
> | `PAYMENT_PROVIDER_UNAVAILABLE` | **la pasarela no responde** | **no se hace nada** |
>
> **PAY-26** · Que no podamos hablar con la pasarela no es que el cliente no haya
> pagado. Bajar a alguien de plan porque nuestra integración está caída sería
> cobrarle nuestro problema.

## Gracia

> **PAY-27 · Recomendación: 14 días** en `past_due`, **conservando el plan
> pagado**, y al agotarse, cierre de la asignación → la empresa cae a su suelo
> Free. **Sin borrar un solo dato**, exactamente como PE-04B3/B4/B5 ya se
> comportan cuando una empresa queda por encima de sus límites.
>
> Catorce días cubren un vencimiento de tarjeta y un par de reintentos sin
> regalar un mes. **No es un número que el sistema deba inventar solo**:
> **decisión humana pendiente 8**.

Durante la gracia la pantalla dice **«hay un problema con tu pago»** y qué pasará
si no se resuelve. **PAY-28**: nunca dice «eres Free» mientras el cliente
todavía tiene Full.

## Cancelación

> **PAY-29** · Cancelar significa **al final del periodo pagado**, no ahora. El
> cliente pagó un mes y ese mes es suyo. Al llegar el final: se cierra la
> asignación, queda el suelo Free, los datos siguen y aplican las reglas de
> exceso de PE-04.
>
> **PAY-30** · La cancelación **inmediata** existe solo como acción administrativa
> explícita —fraude, devolución, acuerdo— y nunca es lo que hace el botón del
> cliente.

## Subir y bajar

> **PAY-31 · Bajar** (Extra → Full): **al final del periodo**. El cliente pagó
> Extra hasta esa fecha. Al llegar, transición canónica a Full; si queda por
> encima de los nuevos límites, eso es un estado legítimo desde PE-04B3.
>
> **PAY-32 · Subir** (Full → Extra): dos caminos honestos —inmediato con
> prorrateo del proveedor, o al siguiente periodo—. **Recomendación: inmediato
> solo si el proveedor calcula el prorrateo**; si no, al siguiente periodo.
> Construir aritmética de prorrateo propia es entrar en contabilidad, y ahí los
> errores se descubren en el extracto de un cliente.
>
> **Decisiones humanas pendientes 6 y 7.**

> **PAY-33 · Mensual ↔ anual**: al siguiente ciclo, salvo que el proveedor
> ofrezca un camino claro y seguro. Nunca con aritmética escondida en la
> interfaz.

## Devoluciones y contracargos

> **PAY-34** · Una devolución **no borra datos** ni retira el derecho
> automáticamente: si fue total y por acuerdo, se cierra la asignación con una
> transición explícita; si fue parcial, normalmente no cambia nada.
>
> **PAY-35** · Un contracargo abre **revisión manual**. Puede llevar a suspender
> el derecho, siempre por transición explícita y con motivo. No se construye un
> sistema de disputas.

## Deshacer

> **PAY-36** · Un registro financiero **no se borra para corregirlo**. Si el
> efecto comercial fue equivocado, se emite una **transición compensatoria** que
> deja escrito qué pasó y por qué. La historia financiera es historia.

## Avisos

Hacen falta para: pago cobrado, renovación próxima, pago fallido, gracia a punto
de acabar, cancelación efectiva y cambio de plan.

**Hoy no hay canal de correo** —ni Resend, ni SendGrid, ni SMTP; las invitaciones
se reparten como enlace—. **PAY-37**: PE-05 **registra el hecho** en el bus
`work_events`, que ya deduplica, y deja la entrega para cuando exista un canal.
Un aviso que no sale es un aviso perdido; un cobro sin registro es un agujero.
