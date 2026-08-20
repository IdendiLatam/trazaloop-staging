# QUALITY-01 · Despliegue en Staging

**Fecha:** 20 de agosto de 2026
**Rama:** `feature/quality-01-process-foundation`
**Destino de base de datos:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Production:** **intacta**. Sin migración, sin variable, sin despliegue.

---

## 1. Verificación del destino antes de escribir

La regla heredada de Q0 es que ninguna escritura remota ocurre sin comprobar antes el proyecto de
destino. Se comprobó explícitamente y se abortaría si coincidiera con Production:

```
destino verificado: qchzkxbnbqeyuxinipln (trazaloop-staging-qa)
```

| Proyecto | Ref | Papel en este trabajo |
|---|---|---|
| `trazaloop-staging-qa` | `qchzkxbnbqeyuxinipln` | **Único destino de escritura** |
| `trazaloop-production` | `mvmpadeixomwkpxbnhky` | **Solo lectura.** No se escribió |
| `trazaloop-staging` | `dtrxxqmdweykzncfmahc` | **LEGACY STAGING — NO USAR.** Pausado; no se tocó |
| `extrusion-diagnostic-db` | `sadoqnynjwfrxcaupzkk` | Ajeno. No se tocó |

El repositorio sigue **desvinculado** (DR de Q0.2): no hay `supabase/.temp/project-ref`, así que
toda operación remota exige `--project-ref` explícito. No hay destino implícito posible.

---

## 2. Ensayo previo

```
supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run
→ Would push these migrations:
   • 0112_quality_process_foundation.sql
```

Exactamente una migración. Si el ensayo hubiera listado más, habría significado deriva entre el
repositorio y Staging y se habría detenido ahí.

---

## 3. Aplicación

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
→ Applying migration 0112_quality_process_foundation.sql...
→ Finished supabase db push.
```

**Exit 0.** Sin `migration repair`. Sin marcar nada como aplicado sin ejecutarlo. Sin modificar
ninguna migración histórica.

| Momento | Locales | Remotas aplicadas |
|---|---|---|
| Antes | 104 | 103 |
| Después | 104 | **104** |

---

## 4. Verificación del estado resultante

Consultado por SQL directo contra Staging:

| Comprobación | Esperado | Obtenido |
|---|---|---|
| Última migración | `0112` | `0112` |
| Migraciones aplicadas | 104 | 104 |
| Tablas `quality_*` | 11 | 11 |
| Tablas `quality_*` sin RLS | 0 | **0** |
| Privilegios de `anon` sobre `quality_*` | 0 | **0** |
| `TRUNCATE`/`REFERENCES`/`TRIGGER` de rol cliente | 0 | **0** |
| `authenticated` sobre `quality_positions` | DML | `DELETE,INSERT,SELECT,UPDATE` |
| Categorías base sembradas | 4 | 4 |
| `modules.quality.is_functional` | `true` | `true` |
| Funciones `quality_*` | — | 11 (4 RPC + 7 triggers) |
| Vista con `security_invoker` | sí | **sí** |

Idéntico a LOCAL. La preocupación de Q0 —que un entorno gestionado se comporte distinto del
local en materia de privilegios— **no se materializó**, igual que ya se había comprobado en Q0.4.

---

## 5. Comportamiento verificado contra Staging

### 5.1 Suite de RLS — 54/54

```
· API y SQL directo apuntan al mismo proyecto: qchzkxbnbqeyuxinipln
Resultado: 54 en verde, 0 en rojo.
```

La primera línea no es decorativa. En el primer intento, la API apuntaba a Staging pero
`SUPABASE_DB_URL` se había repoblado desde `.env.local` con la base **local**: las cinco
comprobaciones por SQL directo se ejecutaron contra local y la suite dijo "54 en verde" sin haber
mirado Staging. Se añadió una guarda que exige que ambas señalen al mismo proyecto y aborta si
no; el resultado de arriba es ya con la guarda activa.

### 5.2 Recorrido HTTP — 10/10

El build de producción, ejecutado localmente **contra Staging**, con sesión real:

```
✔ 1. /quality abre y resume el estado real de la empresa
✔ 2. /quality/positions muestra el cargo y su titular vigente
✔ 3. /quality/processes lista los procesos con su cargo propietario
✔ 4. El detalle reúne propósito, entradas, salidas, relaciones y documento
✔ 5. /quality/map agrupa los procesos por categoría
✔ 6. Publicado el proceso, la pantalla lo presenta como oficial NO editable
✔ 7. Publicado el mapa, la versión vigente se consulta y no se edita
✔ 8. Otra empresa no ve nada de esto, ni con la URL exacta
✔ 9. Sin sesión, /quality no entrega contenido
✔ 10. Con el kill switch APAGADO, /quality no existe ni con sesión válida
```

Esto exigió reconstruir con el entorno de Staging: las variables `NEXT_PUBLIC_*` se **incrustan
en tiempo de build**, de modo que un build hecho con `.env.local` sigue hablando con la base
local por mucho que se cambien las variables al arrancar el servidor. El build local se restauró
después y se reverificó (10/10).

---

## 6. Vercel

### 6.1 Variable añadida en Preview

```
QUALITY_MODULE_ENABLED = true    ·  entorno: Preview  ·  tipo: Sensitive
```

Preview apunta **exclusivamente** a Staging (siete variables creadas en el cierre de Q0). Con
esta son ocho.

### 6.2 Production no se tocó

```
$ vercel env ls production | grep -ci quality
0
```

Las siete variables de Production siguen con 26 días de antigüedad: ninguna se creó, modificó ni
eliminó. **`QUALITY_MODULE_ENABLED` no existe en Production**, de modo que si el código llegara
allí, `/quality` respondería 404.

### 6.3 Despliegue Preview

| | |
|---|---|
| Rama publicada | `feature/quality-01-process-foundation` → `origin` |
| Push | normal, sin `--force`, sin tocar otras ramas |
| Despliegue | `https://trazaloop-production-c6z5p4d1h-idendi-latam-s-projects.vercel.app` |
| Estado | **Ready** (2 min de build) |
| Target | `preview` |

### 6.4 Limitación conocida: SSO de Vercel

Igual que en Q0 (gap G-2), los despliegues Preview están tras la autenticación SSO de Vercel:
todas las rutas devuelven `302 → vercel.com/sso-api`, incluida la raíz.

**No se desactivó el SSO ni se añadió un token de omisión**, porque es una opción **a nivel de
proyecto** y el proyecto de Vercel es compartido con Production: relajarla expondría también los
despliegues de producción. La misma decisión que se tomó en el cierre de Q0.

Consecuencia práctica: **el Preview es navegable por ti, con tu cuenta del equipo**, pero no
comprobable por HTTP anónimo. Por eso la validación de la capa de aplicación contra Staging se
hizo ejecutando el build de producción localmente contra la base de Staging — que ejercita
exactamente el mismo código con exactamente los mismos datos.

---

## 7. Cómo probarlo tú

1. Abre el despliegue Preview e inicia sesión con tu cuenta del equipo de Vercel.
2. Entra en Trazaloop con un usuario que tenga rol `admin` o `quality` en una empresa.
3. En el selector de módulos aparecerá **Trazaloop Quality**. Si la empresa es nueva, lo tendrá
   en Demo de 48 h; si no aparece, un superadministrador puede asignarlo desde
   `/platform`.
4. El recorrido está pensado para hacerse en orden: **Cargos → Procesos → Mapa**. La pantalla de
   inicio de Quality lo presenta así, con los contadores reales de tu empresa.

Los diecisiete pasos del alcance funcional y dónde se hace cada uno están en
`QUALITY_01_IMPLEMENTATION_REPORT.md`, sección C.

---

## 8. Lo que NO se hizo

- No se aplicó ninguna migración de Quality a Production.
- No se activó Quality en Production.
- No se desplegó a Production.
- No se cambió ni un dato de Production.
- No se tocó el staging heredado `dtrxxqmdweykzncfmahc` (pausado, **LEGACY — NO USAR**).
- No se copiaron datos entre entornos.
- No se ejecutó `migration repair` en ningún proyecto.
- No se modificó ninguna migración de 0001 a 0111.
- No se hizo `force push` ni se mezcló ninguna otra rama.
- No se desactivó el SSO de Vercel ni se creó un token de omisión.

La contraseña de Production **no está disponible en este entorno** y no se usó en ningún momento:
un intento de conexión de solo lectura falló con `password authentication failed`, lo que
confirma que la base de Production no era escribible desde aquí.
