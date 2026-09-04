# PE-05B2W3 · El periodo no avanzó un mes · avanzó seis minutos

La comprobación estaba bien pedida. **«El periodo avanzó exactamente una vez»
era cierto y no significaba lo que parecía.**

## Los campos canónicos

`billing_subscriptions`: `billing_interval`, `status`,
`current_period_start`, `current_period_end`, `renews_at`, `grace_until`,
`cancel_at_period_end`, `ended_at`.

**No existe ningún campo de identidad de periodo ni de secuencia de
renovación.** Ni en `billing_subscriptions` ni en `billing_payments`. Eso
importa, y vuelve abajo.

## Lo que pasó, con las fechas reales

```
tras la CONTRATACIÓN   03:36:10
   period_start   2026-09-04 03:36:10
   period_end     2026-10-04 03:36:10
   renews_at      2026-10-04 03:36:10

tras la RENOVACIÓN     03:42:33
   period_start   2026-09-04 03:42:33   ← el MISMO 4 de septiembre
   period_end     2026-10-04 03:42:33   ← el MISMO 4 de OCTUBRE
   renews_at      2026-10-04 03:42:33
```

**El límite del derecho avanzó 6 minutos y 23 segundos.** Debía avanzar hasta
el **4 de noviembre**.

Se cobraron 190 400 COP **dos veces** y el derecho terminó el mismo día.

## La causa, en una línea

```sql
current_period_end = now() + interval '1 month'
```

`billing_record_renewal_payment` ancla el periodo nuevo en **la fecha del
pago**, no en el final del periodo ya pagado.

La aritmética de mes **sí** es de calendario —Postgres resuelve bien
31-ene + 1 mes = 28-feb, y 29-feb en bisiesto—, así que el problema **no** es
la duración: es **el punto de partida**.

## Por qué es peor de lo que parece

Quien paga **antes** de que termine su periodo **pierde** lo que le quedaba:

| Se renueva el | Derecho antes | Derecho después | Se gana |
|---|---|---|---|
| 5 de septiembre | 4 de octubre | 5 de octubre | **1 día** |
| 20 de septiembre | 4 de octubre | 20 de octubre | 16 días |
| 3 de octubre | 4 de octubre | 3 de noviembre | 30 días |

Un cobro puntual el día del vencimiento sale casi bien. Cualquier cobro
anticipado —un reintento temprano, un adelanto, un calendario que se despierte
antes— **regala hasta un mes de derecho ya pagado**.

Y el `current_period_start` se **rebobina** al día del pago, así que el periodo
vigente deja de ser el que el cliente contrató.

## La forma del remedio, sin implementarla

Anclar en el final del periodo pagado, no en el reloj:

```
nuevo fin = greatest(current_period_end, now()) + 1 mes
```

- **`current_period_end`** cuando se cobra a tiempo o antes: extiende, nunca
  acorta;
- **`now()`** cuando se cobra tarde —tras la gracia—: evita regalar el tiempo
  en que no se pagó.

Y `current_period_start` debería pasar a ser el fin del periodo anterior, no
el reloj.

## El segundo defecto · nada ata una renovación a un periodo

El `<n>` de `sub_<uuid>_<n>` **no lo controla el dominio**: en el disparador de
QA sale del cuerpo de la petición. Es un contador libre.

Consecuencia: `sub_<uuid>_2` y `sub_<uuid>_3` son dos transacciones distintas
para Wompi, y `billing_record_renewal_payment` solo es idempotente por
`provider_payment_id`. **Dos cobros para el mismo periodo pasarían los dos**, y
cada uno avanzaría el periodo otra vez.

La idempotencia que sí funciona es la del **mismo pago repetido**; la que falta
es la de **dos pagos distintos para el mismo periodo**.

Para cerrarlo hace falta una identidad de periodo que hoy **no existe en el
esquema** —ni columna, ni tabla—. Eso es un **gap de dominio real** y
probablemente una migración; por eso **no se ha creado nada**: la instrucción
era reportar antes.

## Lo que sí quedó bien

**La idempotencia temporal, comprobada.** Las seis entregas del mismo evento no
movieron el límite ni una vez más: el `period_end` de ahora
—`2026-10-04 03:42:33`— es exactamente el que quedó tras la **primera**
liquidación de la renovación. Los replays devolvieron `already_settled` antes
de llegar al `update`.

Y todo lo demás de W3 sigue en pie: el enrutado distingue contratación de
renovación, no se creó una segunda suscripción, las asignaciones no se
duplicaron y los módulos no cambiaron.

Lo que no se sostiene es la frase **«el periodo avanzó una vez»** entendida
como un ciclo mensual. Avanzó seis minutos.

## No se tocó nada

Ni código, ni esquema, ni despliegue, ni Wompi, ni Producción.
