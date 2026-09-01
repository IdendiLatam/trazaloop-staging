# PE-03B3 · El traspaso del superadministrador de Staging

Hasta aquí, el único superadministrador de Staging era una cuenta de QA. Este
tramo pone en su sitio a la persona real, para que la prueba humana la haga
quien tiene que hacerla.

---

## 1 · Lo que se hizo, y lo que no se tocó

**`idendilatam@gmail.com` es ahora superadministrador activo de Staging.**

| | |
|---|---|
| Cuenta | `idendilatam@gmail.com`, la que ya existía en Auth |
| Rol | `superadmin`, `status = active` en `platform_staff` |
| Vía | `add_platform_staff`, la función canónica |
| Contraseña | **la que esa cuenta ya tenía** |

Y la lista de lo que **no** se hizo importa igual, porque era una instrucción
explícita:

- No se leyó su contraseña.
- No se imprimió su contraseña.
- No se restableció ni se sustituyó.
- No se generó ninguna recuperación ni se envió ningún correo.
- No se modificó ninguna credencial de Auth.
- No se copiaron credenciales entre proyectos.
- No se creó ninguna cuenta nueva.
- No se cambió su correo.
- No se tocaron sus pertenencias a organizaciones: sigue en las mismas, con los
  mismos papeles. Ser superadministrador de plataforma y ser miembro de una
  empresa son dos cosas distintas y aquí se mantienen distintas.

Su fila de `auth.users` quedó **sin un solo cambio**. Lo único que se escribió
fue una fila en `platform_staff`, que es una tabla de la aplicación.

---

## 2 · Por qué por la función canónica y no con un `insert`

`add_platform_staff` exige que quien la llama ya sea superadministrador, deja
constancia de quién concedió el papel en `created_by`, y comprueba que la
persona existe antes de sentarla.

Un `insert` directo con `service_role` habría llegado al mismo estado sin
ninguna de las tres cosas — y el registro de quién dio acceso a quién es
justamente lo que una tabla de personal existe para conservar.

La única vez que un asiento directo es legítimo es el **primero** de una base
recién creada, porque no hay ningún superadministrador que autorice al primero.
No era el caso: Staging ya tenía uno.

---

## 3 · `qa-a` sigue activo, a propósito

`qa-a@trazaloop-staging.local` **no se ha revocado**, y no se revocará hasta que
haya confirmación humana de que `idendilatam@gmail.com` entra bien.

Es la regla de no quedarse sin puerta. Revocar el acceso viejo antes de confirmar
que el nuevo funciona es cómo se pierde el acceso a un entorno: si la sesión de
la cuenta nueva fallara por cualquier motivo, ya no habría nadie con quien
arreglarlo.

Su contraseña **tampoco se ha restablecido**. Estaba prohibido y no hacía falta.

> **Pendiente de la persona.** Cuando `idendilatam@gmail.com` haya entrado al
> Preview y visto la consola de tutoriales, se puede revocar `qa-a`. Ese paso
> es de PE-03B4 o posterior; no es de este tramo.

---

## 4 · La cuenta de la sonda sigue cerrada

La cuenta que la sonda de QA creó en Staging —y que quedó como
superadministrador residual, según el
[informe del incidente](PE_03_QA_PROBE_INCIDENT.md)— sigue como se la dejó:

- rol revocado en `platform_staff`,
- cuenta baneada en Auth,
- **cero sesiones activas**.

Se comprobó otra vez al empezar este tramo, no se dio por hecho. Un estado que
se arregló una vez y no se vuelve a mirar es un estado que nadie sabe si sigue
ahí.

---

## 5 · Cómo entra la persona

1. Abrir el despliegue de Preview.
2. Entrar con `idendilatam@gmail.com` y **su contraseña de siempre**.
3. La consola de tutoriales está en `/platform/tutorials`.

Si la contraseña no funciona, el camino correcto es el de siempre —recuperación
desde la propia pantalla de acceso, que la hace la persona— y no que nadie se la
cambie por detrás.

---

## 6 · Producción no se tocó

Ni una sola operación de este tramo apuntó a Producción. Todas las órdenes
remotas llevaron `--project-ref qchzkxbnbqeyuxinipln`, que es Staging, y el
despliegue fue `--target=preview`.

Producción sigue donde estaba: migración **0111**, sin cubo de tutoriales, sin
0159, sin 0160, sin cambios de rol, sin despliegue, sin medios y sin cambios de
variables de entorno.
