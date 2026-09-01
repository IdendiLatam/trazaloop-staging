# CORTE DE PRODUCCIÓN · Limpieza de personal de plataforma

> **Esto NO es un pendiente de PE-03.** Es un elemento de la lista de
> verificación del corte a Producción, y tiene que aparecer en **PE-06**.

PE-03 está cerrado. Lo que sigue es lo que hay que hacer **antes de dar por
completada la publicación en Producción**, y se escribe aquí porque un pendiente
que solo vive en la cabeza de quien lo decidió no es un pendiente: es una bomba
de relojería.

---

## 1 · Por qué se aplazó

`qa-a@trazaloop-staging.local` es hoy superadministrador **activo** de Staging, y
lo es **a propósito**.

PE-03B3 puso a `idendilatam@gmail.com` como superadministrador humano y dejó a
`qa-a` viva por la regla de no quedarse sin puerta: revocar el acceso viejo antes
de confirmar que el nuevo funciona es cómo se pierde el acceso a un entorno.

PE-03B4 preparó la retirada y no la ejecutó. PE-03B5 tampoco: el propietario del
producto la movió al corte de producción, donde tiene más sentido — es cuando se
decide de una vez quién administra qué, en los dos entornos.

**Tratarla como residuo accidental sería un error.** Está donde está por una
decisión.

---

## 2 · La lista, en orden

El orden importa: cada paso deja en pie la puerta que el siguiente cierra.

### 1 · Verificar el superadministrador humano previsto

Confirmar que `idendilatam@gmail.com` es quien tiene que administrar la
plataforma. No es una comprobación técnica: es una decisión que alguien firma.

### 2 · Establecer el papel en PRODUCCIÓN por el proceso controlado

Producción **no tiene** hoy las tablas de tutoriales ni el personal de plataforma
que tiene Staging: está en la migración **0111**, y llegar a 0161 son 49
migraciones. Establecer el papel allí es parte de ese proceso, no un atajo.

- Por la vía canónica: `add_platform_staff`, que deja constancia de quién
  concedió el acceso.
- **Sin transferir contraseñas.** Cada persona entra con la suya.
- **Sin credenciales compartidas de QA.**

### 3 · Revocar `qa-a` en Staging

Ya está escrito y probado:

```
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
  npx tsx scripts/pe03b4/retirar-qa-a.ts --dry-run    # ver el estado
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
  npx tsx scripts/pe03b4/retirar-qa-a.ts              # retirar
```

El guion **comprueba primero** que el humano es superadministrador activo y
aborta si no lo es. Cambia un solo campo —`status: active → revoked`—, no borra
la fila, no toca Auth, no toca el correo ni el papel. Después vuelve a leer la
base y exige que quede exactamente un superadministrador activo y que sea el
humano.

### 4 · Retirar cualquier otra cuenta privilegiada de QA

```
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
  npx tsx scripts/pe03b5/inventario-residuos.ts
```

Solo lectura. Clasifica como `RIESGO_SEGURIDAD` toda cuenta de QA con papel de
plataforma activo. Lo que salga ahí se retira una por una, no en bloque.

### 5 · Verificar la lista blanca de superadministradores activos

En los dos entornos. **Solo las personas que tienen que estar.** Cero cuentas
de QA, cero sondas, cero cuentas compartidas.

### 6 · Conservar la autoría histórica

En todos los pasos anteriores. `qa-a` publicó en Staging la política de
privacidad **v1.1** y las **quince respuestas de seguridad**: esas publicaciones
están atribuidas a ella y tienen que seguir estándolo.

**Retirar un acceso no es borrar a quien hizo algo.** Nada de esto borra
identidades de Auth, ni reasigna atribuciones, ni pone `null` donde hubo alguien.

---

## 3 · Lo que NO hay que hacer

| | Por qué |
|---|---|
| Borrar la identidad de Auth de `qa-a` | Se llevaría por delante la atribución de dieciséis publicaciones |
| Reasignar sus publicaciones al humano | Sería falsificar quién hizo qué |
| Restablecer contraseñas para «traspasar» una cuenta | Las cuentas no se traspasan. Se crean y se retiran |
| Revocar antes de confirmar al sustituto | Es como se pierde el acceso a un entorno |
| Retirar en bloque todo lo que parezca de QA | El inventario clasifica por una razón |

---

## 4 · La sonda de PE-03B1

Estado esperado, ya verificado en PE-03B3 y PE-03B4:

- papel de plataforma **revocado**;
- cuenta **baneada** en Auth;
- **cero** sesiones válidas;
- su atribución, intacta.

Se vuelve a comprobar en el corte, no se da por hecho. Un estado que se arregló
una vez y nadie vuelve a mirar es un estado que nadie sabe si sigue ahí.

Y la [inconsistencia histórica](PE_03_QA_PROBE_INCIDENT.md) que dejó —una versión
publicada cuyo objeto se borró— **no se corrige inventando bytes**. PE-03B5
comprobó que es inalcanzable desde el producto por construcción, no por
casualidad: su clave no está en el registro, la acción del cliente exige que lo
esté, y reactivar el tutorial no la hace alcanzable.

---

## 5 · Producción, hoy

| | |
|---|---|
| Migración | **0111** |
| Cubo de tutoriales | no existe |
| 0159 / 0160 / 0161 | no aplicadas |
| Personal de plataforma | sin cambios |
| Despliegue | ninguno de PE-03 |

PE-03 no tocó Producción en ninguno de sus cinco tramos.
