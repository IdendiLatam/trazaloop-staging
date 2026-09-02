# PE-05A · Cupones y descuentos

## Un cupón toca el precio, nunca el producto

> **PAY-45** · Un descuento **modifica lo que se paga**. No modifica el
> almacenamiento, ni los créditos, ni el soporte, ni ninguna capacidad. Es
> PEC-13 de PE-04A y sigue en pie.
>
> Consecuencia práctica: un cupón **no crea un plan**. No existe «Full con 40 %»
> como identidad; existe Full, y un cobro al que se le aplicó un descuento.

## Los códigos son datos

> **PAY-46** · `ANDI40` no es lógica del sistema: es una **fila**. Administración
> crea, activa y caduca cupones sin desplegar código, igual que publica una
> revisión de plan.

Modelo mínimo:

```
code (único) · display_label
discount_type          ← percentage | fixed_amount
discount_value
eligible_plan_codes[]  ← EXPLÍCITO, nunca «todos»
eligible_intervals[]   ← monthly | annual | ambos
starts_at · ends_at
max_redemptions · max_per_organization
status                 ← active | inactive
campaign / source
```

> **PAY-47** · Dos tipos desde el principio: **porcentaje** y **importe fijo**.
> El cupón de alianza es porcentaje, pero añadir el segundo tipo después obliga a
> tocar el cálculo, el presupuesto y la interfaz a la vez.

## El cupón de aliados de Full

> **PAY-48** · Hasta **40 %** sobre **Full**. Es el caso de gremio o cámara —tipo
> ANDI—, y se configura como cualquier otro cupón: con su vigencia, su límite de
> canjes y sus planes elegibles.

## Extra no hereda

> **PAY-49** · `eligible_plan_codes` es **explícito y obligatorio**. No existe un
> cupón que «aplique a los planes de pago» por omisión.
>
> Sin esto, el cupón de aliados de Full descontaría también Extra el día que
> alguien lo probara ahí, y nadie se enteraría hasta ver la facturación. Las
> promociones de Extra se configuran aparte, con su propio porcentaje.

## Acompañamiento fuera

> **PAY-50** · El Acompañamiento **no es elegible** para los cupones de SaaS. Es
> un servicio con su propio precio y su propia negociación; mezclarlo con los
> descuentos del producto confundiría dos economías distintas.

## Validación en servidor

> **PAY-51** · El servidor comprueba, sin excepción: que el código existe, que
> está activo, que está en vigor, que aplica a **ese** plan y **ese** intervalo,
> que esa empresa puede usarlo y que quedan canjes.
>
> El navegador manda **un código**. Nunca un porcentaje, y nunca un importe.

## Canje ≠ definición

> **PAY-52** · El canje se registra aparte: qué cupón, qué empresa, qué
> presupuesto y qué pago, **cuánto descontó de verdad** y cuándo.
>
> Cambiar mañana el porcentaje del cupón **no reescribe** lo que se cobró ayer.
> Es la misma idea que el peso aplicado en el libro de créditos de PE-04B4 y que
> las revisiones inmutables de PE-04B1: el catálogo cambia; lo cobrado, no.

## Pertenencia a gremios: no se verifica

> **PAY-53** · **Decisión de negocio ya tomada**: en el lanzamiento, **tener el
> código basta**. Trazaloop **no** comprueba si la empresa pertenece a la ANDI ni
> a ninguna cámara, y **no** se integra con ningún padrón.
>
> Queda escrito para que nadie lo interprete como un olvido. Si algún día hay que
> verificar, será una decisión comercial nueva con su propio trabajo.

Mientras tanto, el control real es operativo: cupones con **caducidad** y
**límite de canjes**, que es lo que impide que un código se reparta por internet
sin freno.
