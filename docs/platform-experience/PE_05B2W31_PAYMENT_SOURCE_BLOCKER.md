# PE-05B2W3.1 · El medio de pago está colgado del sitio equivocado

## El hecho

Con el periodo 2 correctamente abierto (2026-10-04 → 2026-11-04), la renovación
real se paró antes de mover dinero:

```
duplicate key value violates unique constraint "bci_provider_subscription_uniq"
Key (provider, provider_subscription_id)=(wompi, 371065) already exists.
```

Reproducido de forma aislada, sin cobrar, con el diagnóstico
`link_payment_source` del disparador de pruebas.

## Qué lo causa

En 0171:

```sql
create unique index bci_provider_subscription_uniq
  on public.billing_checkout_intents (provider, provider_subscription_id)
  where provider_subscription_id is not null;
```

Ese índice es correcto **para el modelo del otro proveedor**, donde el objeto
recurrente lo gestiona la pasarela: allí una suscripción del proveedor nace de
una contratación y de una sola, así que dos intentos apuntando a la misma
suscripción serían un error de verdad.

Pero Wompi es `MERCHANT_SCHEDULED_RECURRING`: no hay suscripción en la
pasarela. Lo que se guarda es un **medio de pago** —una tarjeta tokenizada— y
ese medio de pago es, por definición, **el mismo para todos los cobros**: la
contratación, la renovación de octubre, la de noviembre y el reintento de la
que salió rechazada.

Las dos cosas comparten columna. Y con esa unicidad, el segundo intento contra
la misma tarjeta es imposible: **la renovación está estructuralmente rota a
partir del segundo cobro**, no solo en las pruebas.

## Por qué no lo vio ninguna prueba

Ninguna prueba determinista crea **dos intentos contra el mismo medio de pago
guardado**. Las de W3 comprobaban el encaminamiento —que una renovación no se
tratara como contratación— con un intento por caso. El defecto vive justo en la
frontera que ninguna cruzaba.

Y en el camino real se tragaba en silencio: la llamada a
`billing_attach_provider_subscription` no comprobaba su error. El enlace
fallaba, nadie se enteraba, y el síntoma aparecía mucho después y muy lejos,
como `PAYMENT_SOURCE_UNKNOWN`. Eso ya está corregido: ahora el enlace que falla
para la petición.

## Lo que hay que arreglar

El medio de pago **no pertenece a un intento de compra**. Un intento es una
tentativa; la tarjeta guardada sobrevive a todas ellas. Pertenece a la
suscripción —o a la empresa—, igual que el periodo pertenece a la suscripción y
no al cobro que lo salda.

La reparación pide migración propia:

1. mover el medio de pago guardado fuera de `billing_checkout_intents`;
2. estrechar la unicidad para que solo ate lo que de verdad es único: el objeto
   recurrente **gestionado por la pasarela**;
3. una prueba determinista que abra dos intentos contra la misma tarjeta
   guardada y exija que ambos vivan.

Nada de eso está autorizado en este encargo, que autoriza 0172 y solo 0172. Se
deja documentado y sin tocar.

## Estado en el que queda la prueba real

* Calendario: **demostrado** sobre datos reales.
* Identidad del periodo: **demostrada** sobre datos reales.
* Liquidación exactamente una vez: **verde en determinista**, sin comprobar
  todavía contra una segunda transacción real.
* Renovación real cobrada: **no**, bloqueada por lo de arriba.

No se ha creado ninguna transacción real de renovación. El encargo lo prohíbe
mientras la relación intento↔periodo no esté verde, y no lo está.
