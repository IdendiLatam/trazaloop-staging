# PE-05B2 · De la suscripción del proveedor al modelo de Trazaloop

## Dos tablas, y no es capricho

`0171` añade dos:

- **`billing_checkout_intents`** — el registro del proveedor. Existe **antes**
  de que exista ninguna suscripción: hay que crear el objeto recurrente y darle
  una referencia externa, y esa referencia tiene que apuntar a algo del
  servidor. Apunta aquí.
- **`billing_provider_events`** — el libro de notificaciones.

Van separadas porque responden preguntas distintas —«¿en qué quedó mi
contratación?» frente a «¿qué nos mandó el proveedor?»— y tienen visibilidades
distintas: el administrador de una empresa ve su intento; **nadie** fuera de la
plataforma ve un evento crudo.

## La referencia externa es el `id` del intento

Un UUID y nada más. Viaja por la red del proveedor y aparece en paneles de
terceros, así que no lleva nombre de empresa, ni plan, ni importe. Lo que hace
falta al volver es poder mirar en el servidor, y para eso un opaco basta.

## Lo esperado se congela

El intento guarda `expected_total_amount` y `expected_currency` copiados del
presupuesto al abrirlo. La conciliación compara contra **esa copia** y no
vuelve a derivar nada: si el presupuesto caduca o cambia de estado, lo que se
prometió no cambia.

## Un presupuesto, un intento vivo

Reabrir devuelve el mismo. Sin eso, cada pulsación del cliente crearía un
objeto recurrente nuevo en Mercado Pago.

## `billing_subscriptions` no aprende vocabulario del proveedor

Todo lo del proveedor —estado crudo, versión, `init_point`, importe
sincronizado, fecha del próximo cobro— vive en el intento. `0171` **no altera
ninguna tabla de B1**, y una prueba lo comprueba.

## El estado del intento

`created` → `provider_created` → `authorized` → `settled`, con salidas a
`declined`, `failed`, `cancelled`, `expired` y `manual_review`.

Un intento **ya liquidado no retrocede** porque llegue una noticia de
suscripción: el pago cobrado es el hecho, y el estado del objeto recurrente es
una consecuencia.

## Orden de llegada

Mercado Pago numera cada modificación con `version`. Una respuesta vieja que
llega tarde **no pisa** a una nueva: se descarta y se dice
`stale_provider_version`. Comprobado ejecutando.

## El correo de facturación

Sale de `organizations.contact_email`, que es el dato que la empresa declaró
para que la contacten. **Si no lo hay, no se sustituye por el de un empleado**:
`billing_open_checkout_intent` devuelve `billing_email_missing: true` y quien
llame decide. Usar el correo de quien pulsó el botón habría mandado a un
tercero un dato personal que nadie designó para eso.

Es el hallazgo de modelo del tramo: el contacto de la empresa existe pero es
opcional, así que **contratar exige que esté**. No se amplió el esquema para
arreglarlo —eso cambiaría el modelo de B1— y queda anotado para B4, que es
quien construye el checkout y puede pedirlo antes de empezar.
