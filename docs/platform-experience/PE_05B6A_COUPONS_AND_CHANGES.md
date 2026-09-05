# PE-05B6A · Cupones y cambios de plan, decididos antes de escribirlos

No implementa nada. Dice qué se va a construir, qué ya estaba decidido, y —lo
más importante— **qué no puede decidirse aquí**.

---

## 1 · Lo que ya existe

**Motor de promociones: ninguno.** Ni tablas, ni funciones, ni códigos. Buscado
por `coupon`, `promotion`, `campaign`, `discount` y sus equivalentes en
castellano: no hay nada que reutilizar y no hay riesgo de construir un segundo.

**Pero el hueco ya está reservado.** `billing_quotes` y `billing_payments`
nacieron en 0169 con `discount_amount`, hoy siempre `0`, y con la restricción
`total_amount = base_amount + tax_amount`. Eso no es casualidad: fija que
`base_amount` es la base **después** del descuento y **antes** del impuesto. El
orden aritmético ya estaba escrito en un `check`.

**Y las reglas comerciales ya están congeladas** en PE-05A, PAY-45 a PAY-53:

| | |
|---|---|
| PAY-45 | un cupón toca **el precio**, nunca las capacidades |
| PAY-46 | los códigos son **datos**, no lógica |
| PAY-47 | dos tipos: porcentaje e importe fijo |
| PAY-48 | cupón de aliados: hasta 40 % sobre Full |
| PAY-49 | `eligible_plan_codes` explícito · **Extra no hereda** |
| PAY-50 | el Acompañamiento no admite cupones de SaaS |
| PAY-51 | el servidor valida todo; el navegador manda un código |
| PAY-52 | el canje se registra aparte y **no se reescribe** |
| PAY-53 | no se verifica la pertenencia a gremios |

Así que este tramo no inventa política: la implementa.

---

## 2 · La identidad, en cuatro piezas que no se confunden

```
campaña            por qué existe el descuento y hasta cuándo
   └── código      la cadena que alguien teclea
        └── canje  quién lo usó, en qué presupuesto y en qué pago
             └── instantánea   cuánto descontó DE VERDAD
```

La cadena **no es autoridad financiera**. Un presupuesto de ayer tiene que poder
reconstruirse aunque hoy el código esté retirado, la campaña caducada, el
porcentaje cambiado o el texto reescrito. Por eso el descuento aplicado se
congela en el presupuesto y en el cobro —donde ya hay sitio—, y el canje guarda
el vínculo.

Es la misma idea que sostiene las revisiones inmutables de PE-04 y el libro de
créditos: **el catálogo cambia; lo cobrado, no**.

---

## 3 · El 40 % · una distinción que hay que hacer antes de codificar

PAY-48 y la línea base comercial dicen «hasta **40 %**, elegible para **Full**».
Leídas con cuidado, eso es el techo **de ese tipo de cupón** —el de gremio o
cámara—, no un techo global del sistema: PAY-49 dice expresamente que las
promociones de Extra «se configuran aparte, con su propio porcentaje».

**Recomendación:** no clavar un 40 % en la base para todo cupón. Poner el techo
donde de verdad es: un `max_discount_basis_points` **por campaña**, que la
administración fija al crearla y que ninguna edición posterior puede superar.
Así el cupón institucional nace con 4000 y no puede pasar de ahí ni por error,
y una promoción de Extra tiene el suyo sin heredar una regla que no era suya.

Si el 40 % sí fuera un techo de producto para **todo** descuento de SaaS, es una
decisión distinta y hay que decirlo: se convierte en una restricción global.

---

## 4 · La aritmética, y en qué orden

```
precio de catálogo (USD, del intervalo elegido)
  − descuento comercial                    ← el cupón actúa AQUÍ
  = precio con descuento (USD)
  × tipo de cambio                          ← una sola conversión
  = base imponible (COP)
  + impuesto (base × puntos básicos)
  = total a cobrar (COP)
```

Dos cosas que se deciden aquí y no después:

**El descuento actúa sobre el catálogo, en su moneda.** Descontar después de
convertir daría el mismo número casi siempre y uno distinto a veces, por el
redondeo; y sobre todo dejaría de poder decirse «este cupón es el 40 % de USD
40», que es lo que entiende quien lo negoció.

**El impuesto se calcula sobre la base ya descontada.** Nunca se descuenta el
impuesto por separado: no es una promoción, es un tributo sobre lo que
efectivamente se cobra.

Redondeo: el que ya usan `billing_usd_minor_to_cop` y `billing_tax_amount` —
`round()` de Postgres, mitad hacia arriba, sobre `numeric`, a entero. Sin
decimales en pesos, porque el peso no los tiene.

Y `discount_amount` se guarda **en la moneda de cobro**, como su vecino
`base_amount`: es lo que dejó de pagarse en pesos.

---

## 5 · El anual no se descuenta dos veces

El precio anual **ya es** el precio con su descuento comercial: USD 400 frente a
480, USD 1000 frente a 1200. Diez meses pagados, doce servidos.

El cupón se aplica sobre el precio anual canónico —USD 400—, nunca reconstruyendo
doce mensualidades. Un 40 % sobre 400 son 240; un 40 % sobre 12 × 40 serían 288,
y esos 48 dólares de diferencia son el descuento anual regalado dos veces.

`billing_create_quote` ya elige el precio del intervalo antes de convertir, así
que el cupón se inserta justo ahí y no hay nada que reconstruir.

---

## 6 · Un cupón por compra

Sin apilamiento. No porque sea difícil, sino porque dos descuentos sobre el
mismo precio obligan a decidir un orden, y ese orden es una política comercial
que nadie ha escrito.

La forma de garantizarlo es que el presupuesto tenga **una** referencia de canje,
no una lista. Si algún día hacen falta dos, se verá en el modelo y habrá que
decidirlo a propósito.

---

## 7 · Canje y abuso

Sin verificación de pertenencia: PAY-53 lo dejó decidido y no se reabre. Lo que
sí sostiene el motor, porque es lo que de verdad frena que un código circule por
internet: vigencia, estado, planes e intervalos elegibles, tope de canjes total y
tope por empresa.

---

## 8 · La renovación no vuelve a mirar el cupón

Esto es lo que hace compatible el descuento con todo B5: la suscripción cobra un
**importe base congelado** y la renovación no consulta ni catálogo, ni tipo de
cambio, ni campaña. Un cupón que afecte a los cobros siguientes tiene que dejar
su resultado escrito en la suscripción, no una regla que haya que reevaluar cada
mes.

Y por tanto: **una campaña que caduque no cambia sola lo que paga quien ya
contrató**. Cambiar un importe recurrente es una repreciación explícita, con su
propia transición comercial. Nunca escondida dentro de una renovación.

---

## 9 · La decisión que falta, y que no puedo tomar

**¿Cuánto dura el descuento?**

Busqué en toda la documentación rectora: PE-04A, PE-04B, PE-05A, la línea base
comercial y las decisiones PAY. **No consta.** PAY-45 a PAY-53 definen qué es un
cupón, quién lo valida y cómo se registra, pero ninguna dice si el 40 % del
gremio se aplica al primer cobro, a unos meses, o a todos mientras la empresa
siga suscrita.

Las tres salidas razonables, con lo que cuesta cada una:

| | qué significa | consecuencia |
|---|---|---|
| **solo el primer cobro** | el descuento es un gancho de entrada | lo más simple: el importe recurrente nace sin cupón y B5 no cambia en nada |
| **N periodos** | descuento por un tiempo pactado | hay que contar periodos descontados en la suscripción, y decidir qué pasa al acabarse: subir el importe **es** una repreciación |
| **mientras dure la suscripción** | tarifa de gremio de verdad | el importe congelado nace ya descontado y no se toca nunca más; es lo más fácil de sostener técnicamente y lo más caro comercialmente |

No elijo por mi cuenta: es dinero recurrente y la diferencia entre la primera y
la tercera es todo el margen del acuerdo.

---

## 10 · Subir de plan: el mecanismo ya existe, la política no

Descubrimiento que conviene decir en voz alta: **`billing_schedule_plan_change`
de 0178 no mira la dirección**. Acepta `full` y `extra`, así que programar
Full → Extra al final del periodo ya funciona en el dominio. Lo único que hoy lo
impide es la pantalla, que solo ofrece bajar.

Sobre cuándo debe surtir efecto, sí hay regla previa:

> **PAY-32 · Subir** (Full → Extra): dos caminos honestos —inmediato con
> prorrateo del proveedor, o al siguiente periodo—. **Recomendación: inmediato
> solo si el proveedor calcula el prorrateo**; si no, al siguiente periodo.

Y su condición ya está resuelta por los hechos: **Wompi no prorratea nada**. No
tiene objeto de suscripción; cada cobro lo programa el comercio. Así que la regla
que ya estaba escrita da un único resultado: **al siguiente periodo, sin
prorrateo**.

El documento marcaba PAY-32 como «decisión humana pendiente», así que no la doy
por cerrada: la dejo resuelta por la regla existente **a falta de confirmación**.
Construir aritmética de prorrateo propia sigue descartado por PAY-32, y con razón
—los errores de contabilidad se descubren en el extracto de un cliente—.

---

## 11 · Y un cabo que hay que atar antes de usar nada de esto

Subir o bajar de plan **cambia el importe que se cobra contra una tarjeta ya
guardada**. Eso es exactamente lo que sigue sin verificar:

```
WOMPI_REPRICING_COF_BEHAVIOR = NEEDS_EXPLICIT_VERIFICATION
```

Y no es un problema nuevo de los cupones: **la bajada de plan de B5F ya lo toca**.
Todavía no ha pasado nada porque ninguna suscripción real ha renovado con un
importe cambiado, pero el día que ocurra hay que saber si el proveedor o las
marcas exigen algo para cobrar un importe distinto al inicialmente autorizado.

Queda dicho aquí porque es una **precondición**, no un detalle: afecta a la
bajada ya entregada y a la subida que se diseñe.

---

## 12 · Lo que el cliente ve, y lo que le falta

Hoy `/settings/billing` muestra plan, intervalo, situación traducida, próxima
renovación y las decisiones de cambiar o cancelar. **No muestra ni un cobro.**

`organization_billing_state` ya devuelve el último —`last_payment_status`,
`last_payment_at`— y la capa lo transporta, pero la pantalla no lo pinta.

Lo que falta, por orden de utilidad:

1. **historial de cobros**: fecha, importe, moneda, plan, intervalo y estado;
2. **el descuento aplicado**, cuando lo haya, en la línea de cada cobro;
3. **descarga** de un comprobante.

Y una distinción que no se puede difuminar: un **comprobante de pago** no es una
**factura electrónica**. Colombia tiene requisitos fiscales propios para lo
segundo —resolución, numeración, validación ante la DIAN— y nada de eso existe
en el sistema. Llamar «factura» a un recibo sería un problema legal, no de
palabras. Aquí solo entra el historial y, como mucho, un comprobante.

---

## 13 · La administración de campañas

Como el catálogo comercial de PE-04B5: borrador, publicar, retirar. Una campaña
publicada no se edita —se retira y nace una sucesora—, porque editar el
porcentaje de una campaña viva reescribiría lo que significó ayer.

Solo superadministración crea y publica. Soporte lee. Ninguna empresa administra
promociones globales, y una prueba lo vigila.

---

## 14 · En el pago

Con cupón aplicado, la pantalla enseña las cuatro líneas: precio de catálogo,
descuento, impuestos y total en pesos. Sin líneas escondidas y sin «precio antes»
inventado.

Si el código no vale —no existe, caducó, no es para ese plan, se agotó— se dice
que no vale y **no por qué**: la regla interna de una campaña no es asunto de
quien la teclea, y decirla enseña a buscarle la vuelta.

El navegador manda **un código**. Nunca un porcentaje, nunca un importe, nunca un
total. Al proveedor viaja el importe canónico final y nada más: el cupón es
economía de Trazaloop y no viaja como metadato con autoridad.

---

## 15 · Lo que haría falta en 0179

Tres tablas y una función, todo colgando del dominio comercial que ya existe:

```
billing_promotions          campaña · vigencia · tipo · valor · techo
                            planes e intervalos elegibles (explícitos)
                            topes de canje · estado
billing_promotion_codes     el código, único · su campaña · estado
billing_promotion_redemptions  qué cupón, qué empresa, qué presupuesto,
                            qué pago, CUÁNTO descontó y cuándo
```

Más: `billing_quotes.redemption_id`, la extensión de `billing_create_quote` para
aceptar un código y validarlo entero en SQL, y —si la duración resulta ser «N
periodos» o «siempre»— lo que la suscripción necesite para recordarlo.

`discount_amount` **ya existe** en presupuestos y cobros: no hace falta añadirlo.

Nada de esto es un sistema paralelo de facturación.

---

## 16 · Matriz de pruebas

Los veintiséis casos del encargo (A–Z), y tres que salen de este análisis:

| | |
|---|---|
| AA | el descuento se aplica ANTES del impuesto, y el impuesto sobre la base descontada |
| AB | un cupón sobre el anual descuenta del precio anual canónico, no de 12 mensualidades |
| AC | el techo por campaña no se puede superar editando |

Y una que vale por muchas: **un presupuesto de ayer sigue reconstruyéndose** con
la campaña retirada, el código borrado y el porcentaje cambiado.
