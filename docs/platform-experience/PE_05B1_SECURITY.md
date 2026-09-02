# PE-05B1 · Seguridad

## Las cinco barreras

| | |
|---|---|
| **El importe** | el navegador manda plan e intervalo; no existe parámetro por el que colar un importe |
| **El impuesto** | lo resuelve el servidor desde la regla vigente; la interfaz no calcula |
| **La activación** | `billing_settle_payment` **no** está concedida a `authenticated` |
| **El rol** | contratar es de `admin`; ni `quality` ni `consultant` |
| **La empresa** | RLS por empresa en las tres tablas financieras |

Todas comprobadas **por efecto** —leyendo el valor antes y después—, no esperando
un error: un `UPDATE` que la RLS filtra devuelve cero filas, no un error, y una
prueba que solo mirara el error daría verde sin comprobar nada. Es la lección de
PE-04B5, aplicada desde el primer día.

## Sin escritura para nadie

`billing_quotes`, `billing_subscriptions` y `billing_payments` tienen política de
**lectura** y ninguna de escritura. Solo las mueven las funciones de dominio. Ni
el dueño de la empresa puede fabricarse un presupuesto a su medida.

`billing_tax_rules` y `commercial_fx_rates` sí admiten escritura, y **solo** de
la administración de plataforma. Comprobado que soporte y cliente no las mueven.

## Cero tarjetas

El contrato del proveedor **no tiene forma de pasar datos de tarjeta**. Ninguna.
El cobro se hará en el checkout alojado del proveedor o con tokenización contra
él, y Trazaloop nunca verá un número, un CVV ni un token reutilizable.

## Cero secretos

En B1 no hay credenciales porque no hay pasarela. El doble no abre una sola
conexión de red, y **no finge verificar firmas**: `verifyWebhook` devuelve un
fallo explícito diciendo que llega en B2. Decir que sí sin comprobar nada sería
exactamente el agujero que la verificación existe para tapar.

## RLS

Las seis tablas nuevas nacen con RLS, política explícita y grants revisados.
0169 lleva el preflight de SEC-01, que se niega a aplicarse sobre una base con
alguna tabla de `public` expuesta. Tras el replay: **0 infractoras**.

Nada financiero es accesible para `anon`.

## Historia financiera

Vive en sus **propias tablas de dominio** —presupuesto, suscripción, pago, foto
fiscal, foto de cambio— y no en `audit_log`. `audit_log` dice que algo cambió;
aquí hace falta poder explicarle a un cliente por qué se le cobró lo que se le
cobró, y a un contador por qué el ingreso es el que es.
