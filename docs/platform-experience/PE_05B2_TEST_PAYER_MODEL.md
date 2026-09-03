# PE-05B2 · El pagador de pruebas · tres rechazos que cuentan la misma historia

## La distinción que había que hacer

**Cuenta de prueba** y **pagador técnico** no son el mismo objeto:

- la **cuenta Comprador MCO** tiene usuario, contraseña y código de seis
  dígitos, y sirve para que una **persona** inicie sesión y autorice;
- el **pagador** es lo que la API quiere en `payer_email`, y para pruebas su
  correo tiene un formato documentado.

La cuenta MCO **no se tocó**: sigue viva, con sus credenciales fuera del
repositorio, para el flujo humano posterior.

## Lo que dice la referencia oficial

`POST /v1/customers` exige **solo `email`**; el resto es opcional. Y para
pruebas la propia referencia declara el formato:

```
test_payer_[0-9]{1,10}@testuser.com
```

Se creó un identificador **estable para todo PE-05B2**, sin ningún dato
personal, guardado en `~/.trazaloop/mercadopago-pe05b2-test-payer.txt` con
permisos `600` para que un reintento no genere otro.

Se **busca antes de crear**: una caída o una respuesta perdida no pueden dejar
dos clientes con el mismo correo.

## Lo que respondió Mercado Pago

```
http=400 | Error invalid domain user email
```

El formato es el documentado. Lo que rechaza es el **dominio**.

## Los tres rechazos, juntos

| Qué se intentó | Respuesta |
|---|---|
| `payer_email = test@testuser.com` (ejemplo de la referencia) | `Payer is associated with a different site` |
| `payer_email` derivado del apodo y del identificador de la cuenta MCO | `User bad request` |
| `POST /v1/customers` con `test_payer_…@testuser.com` | `Error invalid domain user email` |

Por separado parecen tres problemas. Juntos son uno.

## La explicación coherente

La cuenta vendedora es **real**, no un usuario de prueba:

```
site_id: MCO · country_id: CO · user_type: normal
tags: user_product_seller · messages_as_seller · normal
```

**No lleva la etiqueta `test_user`.** Es una cuenta de verdad operando con las
*credenciales de prueba* de su aplicación.

El modelo de sandbox de Mercado Pago espera otra cosa: **dos usuarios de
prueba** —vendedor y comprador— y que se opere con el token del **vendedor de
prueba**. Con un vendedor real, el dominio `@testuser.com` no es aceptable ni
como pagador ni como cliente, que es exactamente lo que dicen los tres errores.

Eso explica también por qué la API no devuelve correo para el usuario de prueba
creado: esa identidad pertenece al mundo de prueba, y la cuenta que pregunta no.

## Qué haría falta

Crear un **usuario de prueba VENDEDOR** del sitio MCO y usar **su** Access
Token en Preview. La cuenta Comprador MCO que ya existe encaja entonces como
pagador de ese vendedor.

No se hizo: crear otra cuenta está expresamente excluido en este tramo, y
cambiar de identidad vendedora es una decisión de quien administra la cuenta.

## Lo que sigue sin demostrarse

**`ANNUAL_RECURRENCE` sigue en `DOCUMENTATION INCONCLUSIVE`.** Mercado Pago
valida el pagador antes que la recurrencia, así que la pregunta sobre
`frequency: 12` no ha llegado a hacerse ni una sola vez. **No es un rechazo del
cobro anual**: es que no se ha podido preguntar.

## Nada quedó a medias

| | |
|---|---|
| Clientes creados | **0** · el `POST` fue rechazado, y la búsqueda no encuentra ninguno |
| Suscripciones en el proveedor | **0** · `PreApproval.search` → `total: 0` |
| Cuentas de prueba creadas en este tramo | **1**, la de la vez anterior · **no** se creó otra |
| Cuenta Comprador MCO | intacta |

Todo comprobado preguntándole al proveedor, no deduciéndolo de los códigos de
error.
