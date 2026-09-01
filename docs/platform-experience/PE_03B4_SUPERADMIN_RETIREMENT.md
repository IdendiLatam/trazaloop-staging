# PE-03B4 · Retirar a `qa-a` como superadministrador

> **Estado: PREPARADO, NO EJECUTADO.**
> La operación está escrita, probada y lista. Falta ejecutarla contra Staging, y
> eso necesita unas credenciales que este agente no tiene y que no ha ido a
> buscar. El porqué está en §5.

---

## 1 · Qué se autorizó

El propietario del producto autorizó **retirar el papel activo de plataforma**
de `qa-a@trazaloop-staging.local`, conservando su identidad histórica.

Y lo que no se autoriza sigue sin autorizarse: no borrar la identidad de Auth,
no cambiar el correo, no restablecer ni mirar la contraseña, no tocar la autoría
histórica ni las atribuciones de publicación, no tocar datos de ninguna empresa.

---

## 2 · Por qué la autoría se conserva

`qa-a` publicó en Staging la política de privacidad **v1.1** y las **quince
respuestas de seguridad**. Esas publicaciones están atribuidas a ella y tienen
que seguir estándolo.

Retirar un acceso no es borrar a quien hizo algo. Por eso la operación cambia
**el estado de una fila**, no la borra: borrarla perdería quién tuvo acceso y
hasta cuándo, que es justamente lo que una tabla de personal existe para
conservar.

```
platform_staff.status:  active → revoked
```

Y nada más. Ni el papel, ni el correo, ni la fila de `auth.users`.

---

## 3 · El orden importa: no quedarse sin puerta

El guion comprueba **primero** que `idendilatam@gmail.com` es superadministrador
activo, y aborta si no lo es.

Revocar antes de eso dejaría Staging sin ningún superadministrador humano y sin
nadie con quien arreglarlo. Es la misma regla que hizo que PE-03B3 dejara a
`qa-a` activa a propósito hasta que hubiera confirmación de que la cuenta nueva
entra.

Y después de escribir, **vuelve a leer la base** y exige que quede exactamente
un superadministrador activo y que sea el humano. No se da por hecho que el
`update` hizo lo que se le pidió: la base es la verdad, no el flujo.

---

## 4 · La cuenta de la sonda no entra en esto

La cuenta que la sonda de QA creó en Staging sigue como la dejó el
[informe del incidente](PE_03_QA_PROBE_INCIDENT.md): rol revocado, cuenta
baneada, cero sesiones.

El guion **no la toca**. Retirar a `qa-a` no es una excusa para pasar por otras
cuentas, y una prueba comprueba que el guion ni la nombra.

---

## 5 · Por qué no está ejecutado

Las credenciales de Staging no viven en el repositorio ni en `.env.local`, a
propósito: las pone quien ejecuta, en el entorno de la orden. Es la convención
que ya seguía `scripts/pe03a-spike/staging-probe.ts`.

En este entorno no están disponibles, y el encargo de PE-03B3 dejó una
instrucción permanente que sigue vigente: **no buscar contraseñas en ficheros,
no leer secretos de Vercel, no volcar variables de entorno, no leer claves ni
credenciales.** Ir a rescatarlas de un registro de sesión anterior habría sido
desobedecerla por comodidad.

Así que la operación se entrega escrita y verificada, y la ejecuta una persona:

```
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
  npx tsx scripts/pe03b4/retirar-qa-a.ts --dry-run     # ver el estado
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
  npx tsx scripts/pe03b4/retirar-qa-a.ts               # retirar
```

El guion imprime el estado **antes** y **después**, y termina en rojo si el
resultado no es el esperado.

---

## 6 · Salvaguardas, y la prueba que las vigila

`tests/unit/pe03b4-superadmin-retirement.test.ts` — 12 comprobaciones. **No
afirma que `qa-a` esté revocada**: afirmarlo sin haberlo mirado sería
exactamente el error que este repositorio persigue. Lo que comprueba es que la
operación está escrita, que es la canónica, y que lleva sus salvaguardas.

| | |
|---|---|
| A2 | Cambia el estado; **no borra** la fila |
| A3 | No toca Auth, ni el correo, ni el papel, ni ninguna tabla ajena |
| B1 | Comprueba al humano **antes** de revocar (posiciones, no a ojo) |
| B2 | Y aborta si no es superadministrador activo |
| C1 | Aborta si la URL no es la del proyecto `qchzkxbnbqeyuxinipln` |
| C2 | Las credenciales vienen del entorno, nunca de un fichero del repo |
| C3 | Hay una pasada en seco |
| D1 | Vuelve a leer la base después de escribir |
| D2 | Y exige que quede **un** superadministrador activo, y quién |
| D3 | La cuenta de la sonda no aparece |

---

## 7 · El estado esperado después

| | |
|---|---|
| `idendilatam@gmail.com` | `superadmin` / `active` — **con su contraseña de siempre** |
| `qa-a@trazaloop-staging.local` | `superadmin` / **`revoked`** · identidad y autoría intactas |
| Cuenta de la sonda | revocada, baneada, cero sesiones |
| Superadministradores activos | **uno**: el humano |
| Producción | sin cambios de papel |
