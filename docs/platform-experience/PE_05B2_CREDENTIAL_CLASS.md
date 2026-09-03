# PE-05B2 · Dos ejes, no uno · identidad del dueño y clase de credencial

> **Retirado como conclusión.** El `401 · causa 300` de `POST /v1/customers` no
> demuestra que el token sea de clase producción: la documentación oficial dice
> que las credenciales de *Pruebas* sirven para el entorno de pruebas y que un
> token de prueba puede empezar por `APP_USR`. El hallazgo se reclasifica como
> **`CUSTOMER_API_TEST_COMPATIBILITY = REJECTED_OR_INCONCLUSIVE`** y **no se
> extrapola** a `/preapproval`. **La regla propuesta abajo NO se implementó.**
> Lo que sigue vale como descripción de los dos ejes y de la asimetría de
> nuestro guardia, no como conclusión sobre esta credencial.

## Lo que se creía

Que un vendedor de prueba implica credenciales de prueba. Parecía obvio y es
falso, y costó tres tramos descubrirlo.

## Lo que se demostró

Dos credenciales distintas de la **misma** aplicación, propiedad de un
**vendedor de prueba MCO verificado**, dan el mismo resultado:

| Credencial | `GET /v1/customers/search` | `POST /v1/customers` |
|---|---|---|
| *Producción → Credenciales de producción* | `200` | `401` · causa **300** · *Unauthorized use of live credentials* |
| *Pruebas → Credenciales de prueba* | `200` | `401` · causa **300** · *Unauthorized use of live credentials* |

En ambos casos el dueño responde `site_id: MCO`, `country_id: CO` y `tags` con
**`test_user`**.

Así que los dos ejes son independientes:

- **`OWNER_IDENTITY`** — quién es el dueño del token. Observable en
  `GET /users/me` por la etiqueta `test_user`. Aquí: **prueba**.
- **`CREDENTIAL_CLASS`** — qué clase de credencial es, según el proveedor.
  **No es observable** por ningún campo documentado: solo se manifiesta al
  intentar una operación, y aquí dice **producción**.

## Por qué importa para la seguridad, y no solo para el sandbox

El guardia de B2 existe para que nunca se cobre de verdad sin querer. Hoy
decide «pruebas» con la etiqueta del **dueño**, y el proveedor dice
«producción» por la **clase de credencial**. Nuestro guardia es más permisivo
que el criterio del propio proveedor.

No ha habido exposición —cero objetos creados, y un vendedor de prueba no
transacciona con compradores reales—, pero la asimetría es real y hay que
cerrarla.

## La regla que se propone

**No se implementó**: es un cambio no trivial y el encargo pide reportarlo
antes de improvisarlo.

1. Un token `TEST-…` es de prueba **con certeza**. Sigue valiendo.
2. Cualquier otra forma se trata como **producción** a efectos de permitir
   operaciones que muevan dinero, **aunque el dueño sea un usuario de prueba**.
   La etiqueta del dueño deja de bastar por sí sola.
3. La clase de credencial **no se adivina** y **no se prueba escribiendo**:
   sondearla creando objetos sería justo lo que el guardia debe impedir.
4. Sin poder determinarla: **producción**. Falla cerrado.
5. Ninguna puerta trasera. Ni `ALLOW_LIVE`, ni `SKIP_SAFETY`, ni un
   interruptor de entorno.

Consecuencia práctica y honesta: con el comportamiento actual de Mercado Pago,
**un token `APP_USR-` nunca habilitaría el sandbox**. Eso es correcto —el
proveedor mismo lo llama producción— y deja el trabajo bloqueado hasta que
exista una credencial que él acepte como de prueba. Es preferible a un guardia
que se cree de pruebas lo que el proveedor considera real.

## La huella del token

Hasta ahora, «se cambió la credencial» era una afirmación sin prueba: no había
forma de comprobar que un despliegue trajera la nueva y no la anterior. Ahora
la comprobación previa devuelve **diez hexadecimales de un SHA-256** del token.
No revela ni el valor ni la longitud, y permite comparar entre despliegues.

Huella del despliegue con las credenciales de prueba: **`b26cd64d18`**.

Y la guardia que impide filtrar el secreto se afinó: prohibía cualquier
`slice`, sin distinguir entre recortar el token y recortar su resumen. Ahora
exige que entre el token y el recorte haya un `digest`. Se la vio ponerse roja
reintroduciendo un `.slice(0, 8)` sobre el token.
