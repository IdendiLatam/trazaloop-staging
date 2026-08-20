# QUALITY-01.1 · Validación en Staging

**Fecha:** 20 de agosto de 2026 · **Rama:** `fix/quality-01-acceptance`
**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Production:** intacta. Sin migración, sin variable, sin despliegue, sin datos.

---

## 1. Verificación del destino

Comprobado explícitamente antes de escribir, con aborto previsto si coincidiera
con Production:

```
destino verificado: qchzkxbnbqeyuxinipln
```

| Proyecto | Ref | Papel |
|---|---|---|
| `trazaloop-staging-qa` | `qchzkxbnbqeyuxinipln` | **Único destino de escritura** |
| `trazaloop-production` | `mvmpadeixomwkpxbnhky` | **Solo lectura** |
| `trazaloop-staging` (legado) | `dtrxxqmdweykzncfmahc` | **NO USAR.** Pausado; no se tocó |

El repositorio sigue **desvinculado**: toda operación remota exige
`--project-ref` explícito. No hay destino implícito posible.

---

## 2. Migración

```
db push --dry-run  →  solo 0113_quality_documents_and_position_lifecycle.sql
db push            →  exit 0
```

| | Antes | Después |
|---|---|---|
| Migraciones remotas | 104 | **105** |

Sin `migration repair`. Sin marcar nada como aplicado sin ejecutarlo. **Ninguna
migración de 0001 a 0112 fue modificada.**

---

## 3. Estado resultante

| Comprobación | Esperado | Obtenido |
|---|---|---|
| Última migración | `0113` | `0113` |
| Módulos de TrazaDocs | tres | `'cpr'`, `'textiles'`, `'quality'` |
| Política de DELETE en cargos | 1 | 1 |
| Categorías base | los nombres congelados | `Estratégicos / Misionales / Apoyo / Sistema` |
| Privilegios de `anon` sobre `quality_*` | 0 | **0** |
| `accept_team_invitation` usa el plan vigente | sí | **sí** |

Idéntico al local.

---

## 4. Comportamiento verificado contra Staging

### 4.1 · Suites con base real

```
· API y SQL directo apuntan al mismo proyecto: qchzkxbnbqeyuxinipln

quality-01-process-foundation   →  56 en verde, 0 en rojo
quality-01-1-acceptance         →  41 en verde, 0 en rojo
```

La primera línea no es decorativa: la guarda de entorno aborta si la API y
`SUPABASE_DB_URL` no señalan al mismo proyecto. Sin ella, olvidar la variable
hacía que las comprobaciones por SQL se ejecutaran contra la base local y la
suite dijera «verde en Staging» sin haberlo mirado.

### 4.2 · Recorrido humano por HTTP — 16/16

El build de producción, ejecutado localmente **contra Staging**, con sesión real
y navegando por los enlaces que renderiza cada pantalla:

```
✔  1. Login: la sesión abre la aplicación
✔  2. Selector de módulos: Quality con «Entrar →»
✔  3. Entrar a Quality siguiendo el enlace de la tarjeta
✔  4. Cargos: la pantalla ofrece Editar, Desactivar y Eliminar
✔  5. Editar el cargo desde su formulario
✔  6. Categorías: el selector NO está vacío
✔  7. Crear un proceso con categoría y propietario
✔  8. «Sistema» NO saca de Quality
✔  9. Mapa de procesos accesible desde Quality
✔ 10. Documentos: la sección propia de Quality abre
✔ 11. Crear un documento de Quality y verlo en su lista
✔ 12. Abrir y editar el documento con el editor del motor
✔ 13. Vincular un documento EXISTENTE de otro módulo al proceso
✔ 14. Invitación de equipo: el enlace CONTIENE el token
✔ 15. El enlace de invitación abre una página que SÍ lee el token
✔ 16. El invitado acepta y queda dentro de la empresa
```

Esto exige reconstruir con el entorno de Staging: las variables
`NEXT_PUBLIC_*` se **incrustan en tiempo de build**. El build local se restauró
después y se reverificó.

### 4.3 · La cuenta QA real

Con `quality.qa@trazaloop-staging.local`, sobre Staging:

```
✔ /modules            HTTP 200  contiene «Entrar →»
✔ /quality            HTTP 200  contiene «Documentos»
✔ /quality/positions  HTTP 200  contiene «Eliminar»
✔ /quality/processes  HTTP 200  contiene «Estratégicos»
✔ /quality/documents  HTTP 200  contiene «Documentos vinculados»
✔ /team?m=quality     HTTP 200  contiene «Trazaloop Quality»
```

La última fila es el defecto que reportaste: navegar a Equipo desde Quality y
**seguir en Quality**.

**Las credenciales no cambian.** Siguen siendo las que ya tienes.

---

## 5. Vercel

| | |
|---|---|
| Rama publicada | `fix/quality-01-acceptance` → `origin` |
| Push | normal, sin `--force`, sin tocar otras ramas |
| Despliegue Preview | `https://trazaloop-production-pdxgvxnhr-idendi-latam-s-projects.vercel.app` |
| Estado | **Ready** (1 min) |

Variables de Preview: sin cambios. `QUALITY_MODULE_ENABLED=true` ya estaba.

### Production no se tocó

```
$ vercel env ls production | grep -ci quality
0

$ supabase migration list --project-ref mvmpadeixomwkpxbnhky
  0112: remota=(NO APLICADA)
  0113: remota=(NO APLICADA)
```

Sin variable, sin migraciones y sin despliegue nuevo: el último de Production
sigue siendo de hace dos días.

---

## 6. Limitación conocida

Los despliegues Preview siguen tras la **autenticación SSO de Vercel** (gap
G-2). No se desactivó ni se creó un token de omisión, porque es una opción **a
nivel de proyecto** compartida con Production: relajarla expondría también los
despliegues de producción.

Consecuencia práctica: **el Preview es navegable por ti** con tu cuenta del
equipo, pero no comprobable por HTTP anónimo. Por eso la validación de la capa
de aplicación se hizo ejecutando el build de producción localmente contra la
base de Staging — el mismo código, con los mismos datos.

---

## 7. Lo que NO se hizo

- No se aplicó ninguna migración a Production.
- No se activó Quality en Production.
- No se desplegó a Production.
- No se cambió ni un dato de Production.
- No se tocó el staging heredado `dtrxxqmdweykzncfmahc`.
- No se copiaron datos entre entornos.
- No se ejecutó `migration repair` en ningún proyecto.
- No se modificó ninguna migración de 0001 a 0112.
- No se hizo `force push` ni se mezcló ninguna otra rama.
- No se desactivó el SSO de Vercel.

La contraseña de Production **no está disponible en este entorno** y no se usó
en ningún momento.
