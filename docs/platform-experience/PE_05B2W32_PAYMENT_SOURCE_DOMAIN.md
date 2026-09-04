# PE-05B2W3.2 · El medio de pago no es una suscripción del proveedor

## Las dos cosas que compartían columna

0171 guardó en `billing_checkout_intents.provider_subscription_id` el objeto
recurrente que devuelve la pasarela, y le puso unicidad `(proveedor, id)`. Para
un proveedor que **gestiona la recurrencia** eso es correcto: su suscripción
nace de una contratación y de una sola, y que dos intentos apuntaran a la misma
sería un error de verdad.

Para un proveedor donde **la recurrencia la programa el comercio** no hay
suscripción al otro lado. Lo que se guarda es una tarjeta tokenizada, y esa
tarjeta es por definición la misma en todos los cobros: la contratación, la
renovación de octubre, la de noviembre y el reintento de la que salió
rechazada. Con aquella unicidad, el segundo mes era **imposible de cobrar**.

|  | quién programa | relación con los intentos |
|---|---|---|
| suscripción del proveedor | la pasarela | 1 ↔ 1 |
| medio de pago | el comercio | 1 ↔ N |

## Lo que introduce 0173

**`billing_payment_methods`** — el instrumento reutilizable como objeto propio:
de una empresa, con su proveedor, su entorno y su estado. No guarda ni un
dígito del número, ni el código de seguridad, ni el testigo en bruto de la
tokenización, ni nada del contrato de aceptación. Solo el identificador que
emitió el proveedor, que sin las credenciales privadas del comercio no cobra
nada.

**La unicidad, y por qué lleva el entorno dentro.** El identificador es único
dentro de la cuenta de comercio *y* dentro de su entorno: el 371065 de pruebas
y el 371065 de producción son instrumentos distintos, de espacios distintos.
Confundirlos sería cobrarle a alguien con la tarjeta de otro. Lo que la
invariante impide es lo que importa: que un mismo instrumento quede atado en
silencio a **dos empresas**.

**Falla cerrado.** `billing_register_payment_method` busca por el identificador
del proveedor, no por la empresa, justamente porque el caso peligroso es que
alguien conozca un identificador ajeno. Si pertenece a otra empresa devuelve
`owned_by_another_organization` y no registra nada. Y al atarlo a un intento
tienen que cuadrar **las tres** identidades: empresa, proveedor y entorno.

**`billing_checkout_intents.payment_method_id`** — muchos intentos, un
instrumento. Es exactamente lo que el modelo anterior hacía imposible.

**Lo que NO se tocó.** `provider_subscription_id` conserva su columna, su
unicidad y su significado. Una prueba se pone roja si alguien tira ese índice
para «arreglar» el problema por el lado fácil.

## Un solo cobro en vuelo por obligación

Faltaba la otra mitad de §11: dos trabajadores despertando a la vez no pueden
mandar dos cargos por el mismo mes. Un índice único parcial sobre `period_id`,
restringido a los estados en vuelo, lo impide en la base.

Y cuando la red se queda a medias —el proveedor no contestó— lo que toca es
**reconciliar ese intento**, no abrir otro: el dinero puede haberse movido ya.
El reintento legítimo sigue cabiendo, porque en cuanto el intento anterior
llega a un estado terminal deja de ocupar el sitio.

## La segunda verdad del calendario, muerta

`billing_record_renewal_payment` seguía corriendo el periodo con
`now() + intervalo`. Era el defecto original de W3, intacto: 0172 construyó el
periodo como objeto pero dejó vivo un segundo camino que calculaba fechas desde
la hora del cobro.

Ahora no calcula nada. Localiza la obligación canónica —la abierta si la hay, o
la siguiente por `billing_open_next_period`— y la salda por
`billing_settle_period_payment`. **Una sola verdad de calendario para las dos
pasarelas.**

Con un matiz que salió al probarlo: un aviso que **no cuadra** tampoco crea un
mes. Si la obligación se abrió solo para cobrarla y el cobro no valía —importe
que no cuadra, regla fiscal sin resolver—, no queda nada anotado contra ella y
no sobrevive. Quién debe qué lo decide el calendario, no un mensaje que llega
de fuera. Un rechazo del banco sí la deja en pie: ahí el cobro era legítimo y
el mes se sigue debiendo.

## Y el intento deja de mentir

La contratación inicial cierra su intento sola, porque la primitiva que la
salda se dirige al intento. La renovación se dirige al **periodo**, así que el
intento se quedaba diciendo «en vuelo» cuando ya no lo estaba — y la regla del
párrafo anterior depende de que ese estado sea verdad. Se cierra ahora, con el
desenlace que le corresponde. Una reentrega no lo reescribe: el desenlace lo
puso la primera entrega, y un segundo no existe.

Se vio en la prueba real: el intento `5fa0cda1` de la renovación quedó en
`created` porque lo cobró el código anterior al arreglo. **No se reescribe.** Es
la evidencia de por qué había que arreglarlo.
