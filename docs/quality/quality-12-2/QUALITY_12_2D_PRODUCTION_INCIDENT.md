# Incidente de producción · 27 de agosto de 2026

> **Estado: CERRADO.** Producción restaurada al despliegue anterior conocido.
> La base de datos de Production **nunca se tocó**: siguió y sigue en `0111`.

---

## 1 · Qué pasó

Preparando el Preview de QUALITY-12.2D ejecuté:

```
npx vercel --prod=false --yes
```

creyendo que `--prod=false` significaba «no producción».

**Desplegó a producción.** `trazaloop.com` pasó a servir el commit de 12.2D.

---

## 2 · La causa, reproducida

El CLI de Vercel declara `--prod` como **bandera booleana** y analiza los
argumentos con la librería `arg`. Para una bandera booleana, `arg` mira si la
bandera **está presente**; el `=false` no la desactiva:

```js
arg({ '--prod': Boolean }, { argv: ['--prod=false'] })
// → { '--prod': true }
```

Reproducido con la misma librería que usa el CLI instalado (59.1.3).

No es un fallo de Vercel: es cómo funcionan las banderas booleanas. El error
fue mío, al asumir que aceptaría un valor.

---

## 3 · Cronología

| Hora | Qué |
|---|---|
| **18:13:06** | `git push` de la rama → despliegue de **vista previa** (`source=git`) |
| **18:13:23** | `npx vercel --prod=false --yes` → despliegue **de producción** (`source=cli`) |
| 18:44–19:57 | varios previews más, todos correctos |
| ~19:45 | detectado al revisar los metadatos de despliegue por otra razón |
| ~20:00 | informado |
| **20:2x** | **rollback autorizado y ejecutado** |

Los diecisiete segundos entre los dos despliegues son lo que descarta al `git
push` como causa: el push solo produce previews en este proyecto, y así lo
confirman todos los despliegues anteriores.

**Duración aproximada: unas dos horas.**

---

## 4 · Los tres despliegues

| | Despliegue | Commit | Rama | Creado |
|---|---|---|---|---|
| **Anterior** | `dpl_G7ShrFNuxpojx4wYnVQpj2dCirHp`<br>`trazaloop-production-f0ot13scr…` | `0289a8d4` | `hotfix/auth-01-password-recovery` | 18 ago 11:29 |
| **Accidental** | `dpl_D3cZDp7Ywcwb5vR2cP5WyXNxpfXM`<br>`trazaloop-production-6fbiru3ku…` | `65cfba9` | `feature/quality-12-2d-…` | **27 ago 18:13** |
| **Restaurado** | `dpl_G7ShrFNuxpojx4wYnVQpj2dCirHp` — el mismo que el anterior | `0289a8d4` | — | promovido 27 ago |

El accidental tenía `source=cli` y `target=production`.

**El despliegue accidental NO se ha borrado.** Se conserva como evidencia; solo
ha dejado de tener dominios apuntándole.

---

## 5 · El riesgo real

| | Migraciones que espera el código | Base de datos |
|---|---|---|
| Despliegue anterior y restaurado | hasta **0110** | **0111** |
| Despliegue accidental | hasta **0139** | **0111** |

El build accidental esperaba **28 migraciones que la base no tiene**. Las
páginas públicas respondían con normalidad —no tocan el esquema nuevo—, pero
cualquier ruta autenticada que leyera tablas posteriores a 0111 habría fallado:
Quality entero, la guía de autoría, el perfil de organización y la IA.

No hay forma de saber desde aquí si alguien lo sufrió: haría falta revisar los
registros de la aplicación, y eso no forma parte de este rollback.

**Al revés no hay problema:** la base está una migración por delante del build
restaurado, y `0111_platform_role_privileges` solo contiene `grant` y `revoke`
—cero sentencias destructivas—, así que el código de 0110 funciona sobre ella.
Es la misma pareja que estuvo sirviendo desde el 18 de agosto.

---

## 6 · Lo que NO pasó

| | |
|---|---|
| Migraciones aplicadas a Production | **cero** · cabecera `0111`, 103 aplicadas, ninguna ≥ 0112 |
| Variables de IA en Production | **cero** |
| Variables de Supabase de Production | **sin tocar** · las siete tienen 33 días |
| Cambios de código para arreglar el incidente | **ninguno** |
| Datos de Production | **sin tocar** |

---

## 7 · Verificación posterior al rollback

**Despliegue activo** (`targets.production` del proyecto):
`dpl_G7ShrFNuxpojx4wYnVQpj2dCirHp` · `0289a8d4` · READY.

**Alias reales** (consultados en `/v4/aliases`, no deducidos del código de
salida del comando):

| Dominio | Apunta a |
|---|---|
| `trazaloop.com` | **restaurado** ✔ |
| `www.trazaloop.com` | **restaurado** ✔ |
| `trazaloop-production.vercel.app` | **restaurado** ✔ |

Ningún dominio de producción apunta ya al despliegue accidental.

**Smoke público:** `trazaloop.com`, `www.trazaloop.com`, `/login` y `/terms`
responden **200**, con el título correcto.

**Smoke autenticado: requiere una persona.** No tengo credenciales de
Production, y crear un usuario o modificar datos para probar sería peor que no
probar. Lo que sí se verificó es estático y es lo que importa: el build
restaurado es exactamente el que sirvió del 18 al 27 de agosto sobre esta misma
base de datos en `0111`.

---

## 8 · Lo que se hace para que no vuelva a pasar

Ver `docs/releases/VERCEL_DEPLOY_SAFETY.md` y la suite `test:deploy-safety`,
que falla si la forma peligrosa reaparece en el repositorio.

La regla, en una línea:

> Para desplegar una vista previa a mano: **`--target=preview`**, explícito.
> Nunca `--prod=false`.

---

## 9 · Lo que enseña, más allá del comando

Una bandera booleana no acepta un valor, y escribirle uno da una falsa
sensación de haber sido explícito. `--prod=false` **se lee** como «no
producción» y **significa** «producción».

De ahí que el guard no se limite a prohibir esa cadena: exige la forma
afirmativa `--target=preview`. Decir lo que sí se quiere es más difícil de
malinterpretar que negar lo que no.
