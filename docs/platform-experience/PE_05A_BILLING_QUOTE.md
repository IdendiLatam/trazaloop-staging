# PE-05A · El presupuesto

## Por qué existe

Entre «el cliente elige Full anual con cupón» y «se cobran X pesos» hay seis
decisiones: qué revisión del plan, qué precio, si el cupón aplica, cuánto
descuenta, qué impuesto y a qué tipo de cambio. Si esas seis se toman **en el
momento del cobro**, no se pueden explicar después; y si alguna la toma el
navegador, no se pueden defender.

> **PAY-12** · Antes de cualquier cobro se emite un **presupuesto** que resuelve
> y **congela** todo: empresa, plan y revisión, intervalo, precio base, cupón y
> descuento, base imponible, impuesto, tipo de cambio si lo hubo, importe y
> moneda finales, y **cuándo caduca**.
>
> El pago **referencia** un presupuesto. Nunca se reconstruye el importe a partir
> de lo que mande el navegador.

## Lo que el navegador puede pedir, y lo que no

| El cliente pide | El servidor decide |
|---|---|
| plan = `full` | qué **revisión publicada** de Full |
| intervalo = anual | el precio anual de esa revisión |
| cupón = `XXXX` | si existe, si está activo, si aplica a ese plan e intervalo, si esa empresa puede usarlo y cuánto descuenta |
| — | base, impuesto y total |
| — | tipo de cambio e importe en la moneda de cobro |

> **PAY-13** · **El navegador nunca es autoridad de precio.** Un `amount = 10`
> que llegue del cliente se ignora; no se «valida», se ignora. Lo único que se
> acepta del cliente son *intenciones*: qué plan, qué intervalo, qué código.

## Caducidad

> **PAY-14** · Un presupuesto **caduca**. Un tipo de cambio o un cupón congelados
> para siempre son una puerta abierta: guardar un presupuesto de hace seis meses
> y pagarlo hoy sería comprar al precio de entonces.
>
> Vida sugerida: **30 minutos**, suficiente para completar un pago y corto para
> que nada se quede viejo. Al caducar se emite uno nuevo; el viejo se conserva
> como historia de lo que se ofreció.

## Inmutable

Un presupuesto no se edita. Cambiar de idea —otro intervalo, otro cupón— emite
**otro**. Los dos quedan, y se puede ver qué se ofreció y qué se aceptó.

## Qué guarda

```
organization_id
plan_code · plan_revision_id        ← la revisión CONCRETA, no el plan
billing_interval                    ← monthly | annual
catalog_amount_minor · catalog_currency
coupon_id · discount_amount_minor
base_amount_minor
tax_amount_minor · tax_rate_ref
total_amount_minor
fx_rate · fx_source · fx_at         ← si hubo conversión
charge_amount_minor · charge_currency
expires_at
created_by · created_at
```

Referenciar la **revisión** y no solo el plan es lo que hace que un cobro de
enero se siga explicando cuando en marzo se publique una revisión nueva. Es la
misma idea que sostiene PE-04: lo que alguien contrató no cambia porque el
catálogo cambie.

## Mensual y anual

> **PAY-15** · El intervalo es un **atributo del cobro**, no una identidad de
> plan. No existen `full_monthly` ni `full_annual`: existe **Full**, y se paga
> mensual o anualmente.
>
> Lo que el cliente *tiene* —500 MiB, 500 créditos, sin reloj— es idéntico en los
> dos casos. Lo que cambia es cuánto paga y cada cuánto. Crear dos identidades de
> plan habría duplicado el catálogo, los límites y la resolución para expresar
> una diferencia que es solo de cobro.

El anual es un **precio publicado propio** (`annual_price_minor`), no «el mensual
por doce menos algo». La explicación comercial —dos meses equivalentes gratis— es
copia de marketing, no aritmética del sistema.
