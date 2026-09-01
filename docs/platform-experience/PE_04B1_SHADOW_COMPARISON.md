# PE-04B1 · La comparación en sombra

Antes de mover la autoridad hay que saber en qué se diferencian las dos
verdades. Esto lo mide. **No escribe nada.**

---

## 1 · Las cuatro clases

| Clase | Qué significa |
|---|---|
| `MATCH` | Las dos dicen lo mismo |
| `EXPECTED_MIGRATION_DIFFERENCE` | Difieren, y el diseño dice que difieran |
| `LEGACY_DRIFT` | Las fuentes **viejas** se contradicen entre sí |
| `CANONICAL_UNAVAILABLE` | El modelo nuevo no pudo responder |

Y **una cuenta aparte**: `legacyMismatch`.

### Por qué el desacuerdo viejo va aparte

Mientras B1 no migre a nadie, el canónico responde `absent` y **toda** fila cae
en `EXPECTED_MIGRATION_DIFFERENCE`. Si el desacuerdo entre las fuentes viejas se
contara dentro de las cuatro clases, quedaría escondido detrás del estado
transitorio de este tramo — y es justamente el dato que B2 necesita.

Así que se calcula **siempre**, con independencia de lo que diga el modelo nuevo.

El orden de la clasificación también importa: primero si el canónico pudo
responder, después si las viejas se contradicen, y solo entonces si coinciden. Al
revés, una deriva del modelo viejo se escondería tras un «coincide».

---

## 2 · Lo que salió en la base local

```
filas comparadas              20
MATCH                          0
EXPECTED_MIGRATION_DIFFERENCE 20   ← B1 no migra a nadie: es lo correcto
LEGACY_DRIFT                   0
CANONICAL_UNAVAILABLE          0

15 de 20 filas con las DOS FUENTES VIEJAS EN DESACUERDO
```

Las quince son el defecto de PE-04A visto desde otro ángulo: los módulos dicen
`full` y la suscripción dice `demo`. **No lo causa el modelo nuevo.**

---

## 3 · La traducción que define la migración

```
demo  → free      ← la ventana de prueba deja de ser un plan; el suelo es Free
full  → full
extra → extra
```

Una función pura, `legacyModeToCanonical`, con su prueba. Es la línea que resume
el cambio entero.

---

## 4 · Nunca fuerza una coincidencia

Hay una prueba dedicada: si lo viejo dice `full` y lo canónico dice `free`, **no**
se clasifica como `MATCH`. Aplastar diferencias para que el informe salga limpio
sería peor que no tener informe.

---

## 5 · Cómo se ejecuta

```
SUPABASE_DB_URL=... npx tsx scripts/pe04b1/sombra.ts --actor <uuid>
```

Contra Staging, con `STAGING_DB_URL` y las credenciales que pone quien ejecuta.

### Por qué adopta una identidad

Los resolutores son `security definer` y exigen `auth.uid()`. Una clave de
servicio no la tiene, así que con ella el informe saldría **entero** como
`CANONICAL_UNAVAILABLE` — y sería mentira: el resolutor funciona; lo que falta es
una identidad.

Así que hace lo mismo que `scripts/pe02b5b/publicar.sql`: declara la sesión y
baja al rol `authenticated`, igual que la pasarela. **La comprobación de
autorización se ejecuta.**

### Las dos fases, y por qué

| | Rol | Qué hace |
|---|---|---|
| **1 · Inventario** | el del operador | Lee empresas, módulos y suscripciones |
| **2 · Resolución** | `authenticated` como el actor | Llama a los resolutores |

`organizations` y `organization_modules` tienen RLS **de miembro**, no de
personal de plataforma. Un superadministrador que no pertenezca a ninguna empresa
no vería ni una fila, y el informe saldría vacío diciendo que no hay nada que
comparar — **la peor forma de fallar: la apariencia de éxito**.

Es el mismo motivo por el que `listPlatformOrganizationModules` ya usa un cliente
administrativo para esto. Y la transacción entera es `read only`, así que el
privilegio no puede escribir nada.

> Se descubrió ejecutándolo: la primera versión usaba una clave de servicio y
> devolvió veinte filas de `CANONICAL_UNAVAILABLE`. La segunda leyó las empresas
> como `authenticated` y devolvió **cero filas**, que era peor. La tercera es
> esta.

---

## 6 · No escribe, y se comprueba

Tres barreras:

1. La transacción es `begin transaction read only`.
2. Una prueba estática busca `insert(`, `update(`, `delete(` y `upsert(` en
   `lib/db/plan-shadow.ts`: ninguno.
3. Otra busca `insert into`, `update` y `delete from` en el guion: ninguno.

Es el mismo principio que el inventario de residuos de PE-03B5: **la herramienta
que compara no puede ser la que arregla**, porque entonces nadie mira el informe.
