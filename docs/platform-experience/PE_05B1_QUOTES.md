# PE-05B1 · Presupuestos

## Qué congela

Empresa · plan y **revisión concreta** · intervalo · importe y moneda de
catálogo · tipo de cambio y su identificador · moneda de cobro · descuento
(cero en B1) · base · **clase de servicio** · **regla fiscal** y su tipo ·
impuesto · total · caducidad.

Referenciar la **revisión** y no solo el plan es lo que hace que un cobro de
enero se siga explicando cuando en marzo se publique otra revisión. Es la misma
idea que sostiene PE-04.

## El navegador manda intenciones

`billing_create_quote` acepta **tres** cosas: empresa, plan e intervalo. No
existe ningún parámetro por el que mandar un importe, un descuento o un tipo
impositivo. Un `amount = 10` del cliente no se valida: **no se mira**.

Y la tabla no admite escritura de nadie: solo la escribe la función de dominio.
Comprobado por efecto —leyendo el total antes y después de un intento de
`update`—, porque un `UPDATE` que la RLS filtra no da error, da cero filas.

## Quién puede pedirlo

Solo **`admin`** de la empresa. Ni `quality` ni `consultant`: comprar compromete
a la empresa, y un consultor externo factura aparte.

## Caducidad

**30 minutos.** Un tipo de cambio y una regla fiscal congelados para siempre
serían una puerta abierta: guardar un presupuesto y pagarlo seis meses después
sería comprar al precio de entonces. Un presupuesto caducado **no se puede
liquidar**.

## Inmutable

Cambiar el tipo de cambio no mueve un presupuesto ya emitido — comprobado
publicando una tasa nueva y verificando que el importe y el tipo congelados no se
movieron. Cambiar de idea emite **otro** presupuesto; los dos quedan.

## La aritmética, escrita

```
base_cop = round( centavos_usd × micros / 100 000 000 )
iva_cop  = round( base_cop × puntos_básicos / 10 000 )
total    = base + iva
```

El peso colombiano no tiene subunidad en uso: la unidad menor es el peso.
Redondeo **al peso entero, media hacia arriba**, aplicado a la base y otra vez al
impuesto. Está escrito aquí y en la migración para que ninguna prueba lo adivine
y ninguna pantalla lo calcule distinto.

Cuatro comprobaciones —Full mensual y anual, Extra mensual y anual— verifican
base, IVA y total **exactos** contra esa fórmula.
