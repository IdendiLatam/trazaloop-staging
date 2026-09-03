# PE-05B2 · El vendedor de prueba · el cambio funcionó, el pagador sigue sin existir

## El clasificador estaba mal, y este tramo lo demostró

B2 clasificaba el entorno por el **prefijo del token**. Parecía razonable y era
falso: cuando la aplicación se crea iniciando sesión como **vendedor de
prueba**, Mercado Pago emite sus credenciales bajo el epígrafe «producción» y
con prefijo `APP_USR-`. Con la regla vieja, el guardia habría declarado
«producción» a un vendedor sintético y habría bloqueado justo el entorno que
existe para probar.

Y al revés sería peor: un vendedor real con aspecto de pruebas cobraría de
verdad.

**Ahora decide la identidad, no la forma.**

- La pista síncrona solo puede **afirmar** «pruebas»: un `TEST-…` lo es con
  certeza. Nunca puede afirmar lo contrario por sí sola.
- La autoridad es la ficha del dueño del token: hay entorno de pruebas **solo
  con evidencia positiva** de usuario de prueba —la etiqueta `test_user`—.
- **No poder preguntar no es «es de pruebas».** Sin respuesta, «producción».
- Ninguna puerta trasera: no hay `ALLOW_LIVE`, ni `SKIP_SAFETY`, ni
  `MERCADOPAGO_ENV`, y una prueba lo comprueba por nombre.

La identidad se recuerda por token mientras vive el proceso, para no gastar una
llamada por notificación. Un fallo **no** se recuerda.

## El cambio de credenciales sí funcionó

```
owner_is_test_user: true
owner_site_id: MCO · owner_country_id: CO
tags: user_product_seller · test_user · normal
```

**`MERCADOPAGO_ENVIRONMENT = TEST_SELLER_MCO`**, aunque el panel llame
«producción» a esas credenciales.

Compárese con la vez anterior, misma consulta: `tags: user_product_seller ·
messages_as_seller · normal`, **sin `test_user`**. El cambio es visible y
verificado por identidad, no por confianza.

## Y aun así, el pagador sigue sin poder existir

Dos operaciones, dos rechazos distintos:

| Operación | Respuesta |
|---|---|
| `POST /v1/customers` con el pagador estable `test_payer_…@testuser.com` | **401 `access denied`** |
| `POST /preapproval` con ese mismo correo como `payer_email` | **400 `User bad request`** |

La **búsqueda** de clientes sí respondió —no encontró ninguno—, así que el 401
es de la creación: la API de Clientes no está autorizada para esta aplicación.
Y el correo con el formato que la propia referencia documenta,
`test_payer_[0-9]{1,10}@testuser.com`, tampoco sirve como pagador.

No se probó ninguna variante más. Cada intento es una llamada real, y probar
formatos hasta acertar es adivinar.

## Lo que esto significa

El vendedor ya es de prueba y del sitio correcto: esa hipótesis se comprobó y
**no era la única causa**. Lo que falta sigue siendo una **identidad de
pagador** que Mercado Pago acepte, y por tres caminos distintos no se ha podido
obtener:

1. el correo del usuario de prueba **no lo devuelve la API** —ni al crearlo ni
   al leerlo—, aunque la referencia lo documente;
2. el panel del comprador **no lo muestra**;
3. la API de **Clientes** está denegada para esta aplicación.

Con eso hay evidencia reproducible suficiente para abrir soporte con Mercado
Pago: el mismo formato que su documentación prescribe es rechazado por su API
bajo un vendedor de prueba verificado del mismo sitio.

## El anual sigue sin poder preguntarse

**`ANNUAL_RECURRENCE` = `DOCUMENTATION INCONCLUSIVE`.** Mercado Pago valida el
pagador antes que la recurrencia: la pregunta sobre `frequency: 12` no ha
llegado a hacerse ni una sola vez, en ninguno de los intentos. **No es un
rechazo del cobro anual.**

## Nada quedó a medias

| | |
|---|---|
| Suscripciones en el proveedor | **0** · `PreApproval.search` → `total: 0` |
| Clientes creados | **0** |
| Cuentas de prueba creadas en este tramo | **0** |
| Cuenta Comprador MCO | intacta, con sus credenciales fuera del repositorio |
| Pagador técnico | el mismo de siempre, estable, sin regenerar |

## La tasa sintética, retirada

Como el bloqueo es externo y de duración desconocida, la tasa de QA dejó de ser
efectiva el mismo día. **Por vigencia, no borrándola**: su periodo se cerró y
quedó marcada `retired`, igual que se retira una regla fiscal.

- ventana demostrable: vigente **solo** durante el smoke;
- `billing_resolve_fx(USD, COP)` → `unavailable · no_active_rate`;
- un presupuesto nuevo falla ahora con **`FX_RATE_UNAVAILABLE`**, comprobado;
- los **seis** presupuestos históricos conservan su `fx_rate_micros`;
- ni un `DELETE`, ni una migración, ni Producción.
