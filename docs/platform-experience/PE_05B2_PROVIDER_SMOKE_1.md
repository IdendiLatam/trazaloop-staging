# PE-05B2 · Primera prueba real contra Mercado Pago · detenida antes de llamar

**No se hizo ninguna llamada al proveedor.** Dos cosas faltaban, y las dos las
tiene que poner una persona.

## Lo que sí quedó hecho

- **Preview desplegado** con la implementación aceptada de B2:
  `https://trazaloop-production-g8hjjupy3-idendi-latam-s-projects.vercel.app`
- **Disparador de QA construido**, con sus cuatro candados: nunca en
  Producción, solo superadministrador de plataforma con su sesión real, solo
  con credenciales de PRUEBA, y **ningún importe llega del navegador**. Es
  provisional y lo dice: se retira al cerrar B2.
- `MERCADOPAGO_ACCESS_TOKEN` **está configurado** en el ámbito Preview. Se
  comprobó su **presencia** por el nombre, sin leer ni imprimir su valor.

## Lo que falta · 1 · el correo del comprador de prueba

`MERCADOPAGO_TEST_BUYER_EMAIL` **no está configurado**, y no hay ninguna otra
fuente legítima: se revisaron las 191 empresas de Staging y **ninguna** tiene un
contacto con forma de comprador de prueba de Mercado Pago; tampoco existe
todavía la empresa `QA-PE05B2-MERCADOPAGO`.

Crear una suscripción exige `payer_email`. Las alternativas serían usar el
correo de un empleado, el del administrador de la empresa o uno inventado, y
las tres están prohibidas con razón: se mandaría a un tercero un dato personal
que nadie designó para eso, o se crearía un pagador que no existe.

**`MERCADOPAGO_TEST_BUYER_EMAIL REQUIRED`.** Hay que ponerlo en Vercel, ámbito
Preview, con el correo de la cuenta compradora de prueba. No hace falta pegarlo
en ninguna conversación.

## Lo que falta · 2 · llegar al Preview sin debilitar el SSO

El Preview responde **302 hacia `vercel.com/sso-api`** y la petición al
disparador devuelve **401**. Es lo esperado y es correcto: la protección está
puesta, y **no se tocó**.

Eso significa que la clasificación del token —comprobar que el entorno resuelve
`test` y no `live`— no se pudo ejecutar del lado del servidor. Se sabe que la
variable está; no se ha comprobado *qué* clasifica, y no se va a deducir
leyendo su valor.

Dos salidas, ambas de la persona:

1. **Protection Bypass for Automation** de Vercel. Es el mecanismo oficial para
   exactamente esto: genera un secreto que permite a una petición automatizada
   pasar la protección **sin** hacer público el Preview ni desactivar el SSO
   para nadie. Es la opción recomendada. No se activó por cuenta propia porque
   cambia una configuración de seguridad de la cuenta.
2. **Ejecutarlo desde un navegador ya autenticado**, con sesión de Vercel y de
   superadministrador de Trazaloop a la vez.

## Lo que NO se hizo, y por qué

**No se sembró la tasa sintética de 4 000 COP/USD en Staging.** El encargo la
autoriza, pero existe para poder presupuestar antes de llamar al proveedor, y
esa llamada no ocurrió. Sembrarla ahora dejaría en la configuración comercial
de Staging una tasa inventada que `billing_resolve_fx` **sí** convertiría en
precio para cualquiera que presupueste —el esquema no distingue una tasa de QA
de una comercial, como quedó anotado en B2—, y sin ningún beneficio a cambio.

El disparador la crea solo, marcada `QA-SYNTHETIC-NOT-FOR-PRODUCTION` y con la
advertencia de que 4 000 no es una tasa real, en el momento en que la prueba
pueda ejecutarse de verdad.

Por lo mismo no se creó la empresa `QA-PE05B2-MERCADOPAGO`: sería contaminación
sin uso.

**No se configuró ningún webhook**, ni `MERCADOPAGO_WEBHOOK_SECRET`, ni se
registró ninguna URL de retorno en el proveedor.

## Lo que queda por probar

Sigue todo pendiente: crear la mensual, leerla, cambiar su importe, y sobre
todo **la anual con `frequency: 12`**, que es la que decide si el producto
puede venderse por año. La petición exacta está escrita en
[el descubrimiento](PE_05B2_MERCADOPAGO_DISCOVERY.md).

`ANNUAL_RECURRENCE` sigue en **`DOCUMENTATION INCONCLUSIVE`**.
