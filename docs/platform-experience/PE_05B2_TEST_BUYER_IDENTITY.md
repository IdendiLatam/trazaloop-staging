# PE-05B2 · El comprador de prueba · lo que la API ya no devuelve

## Lo que se hizo

Se creó **una sola** identidad de prueba dedicada, por el contrato oficial
verificado antes de llamar:

```
POST https://api.mercadopago.com/users/test
{ "site_id": "MCO", "description": "Trazaloop PE-05B2 Test Buyer" }
```

La referencia admite exactamente esos dos campos. **No hay `profile`
documentado**, así que no se mandó: inventar un parámetro que la referencia no
declara es cómo se acaba con una cuenta que no sirve y sin saber por qué.

Resultado: `site_id: MCO`, `site_status: active`, con identificador, apodo y
contraseña. Las credenciales están **fuera del repositorio**, en
`~/.trazaloop/mercadopago-pe05b2-test-buyer.txt` con permisos `600`. No están en
Git, ni en la base, ni en ningún registro, ni en este documento.

Antes de crearla se comprobó que no existiera ya: no había ninguna. **Una y
solo una.**

## El problema · la referencia dice una cosa y la API hace otra

La referencia oficial de `POST /users/test` **documenta un campo `email`** en la
respuesta, y su ejemplo es literalmente `test@testuser.com` — que es justo el
valor que Mercado Pago rechazó por pertenecer a otro sitio.

La API real **no devolvió ningún correo**. Ni al crear, ni al leer la ficha
después: `GET /users/{id}` trae `address`, `country_id`, `id`, `nickname`,
`permalink`, `seller_reputation`, `site_id`, `status` y `user_type`. **No hay
campo de correo, con ningún nombre.**

Y la documentación de cuentas de prueba lo confirma desde el otro lado: describe
identificador, usuario, contraseña y un código de seis dígitos. **El correo ya no
aparece.**

## Lo que se intentó, con lo que la API sí devuelve

Dos formas derivadas de datos devueltos —no inventadas—, cada una una llamada:

| Forma | Respuesta de Mercado Pago |
|---|---|
| `test@testuser.com` (el ejemplo de la referencia) | `Payer is associated with a different site` |
| `<apodo>@testuser.com` | `User bad request` |
| `test_user_<id>@testuser.com` | `User bad request` |

El cambio de mensaje importa: con el primero el rechazo era **de sitio**; con
los otros dos ya no lo es. El sitio dejó de ser el problema —la identidad MCO
existe y está activa— y lo que falla es que **ninguna de las dos direcciones
derivadas es la real**.

Ahí se paró. Seguir probando direcciones sería adivinar, y cada intento es una
llamada real a la API de un tercero.

## Qué hace falta

El correo del usuario de prueba, **leído de la pantalla** donde Mercado Pago sí
lo muestra:

*Tus integraciones → la aplicación → **Cuentas de prueba***

y puesto en `MERCADOPAGO_TEST_BUYER_EMAIL` (Vercel, ámbito Preview). No hay que
pegarlo en ninguna conversación.

Con ese valor, la prueba mensual y la **anual** —que es la decisiva— se resuelven
en dos llamadas.

## Lo que no quedó a medias

`PreApproval.search` devuelve **total: 0**: ninguno de los intentos creó nada en
el proveedor. Se comprobó preguntándole, no deduciéndolo de que las respuestas
fueran 400.
