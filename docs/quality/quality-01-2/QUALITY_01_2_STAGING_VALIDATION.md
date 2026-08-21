# QUALITY-01.2 · Validación en Staging

**Fecha:** 21 de agosto de 2026 · **Rama:** `fix/quality-01-2-process-relations-docs-map`
**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Production:** intacta. Sin migración, sin variable, sin despliegue, sin datos.

---

## 1. Verificación del destino

| Proyecto | Ref | Papel en este sprint |
|---|---|---|
| `trazaloop-staging-qa` | `qchzkxbnbqeyuxinipln` | **Único destino de escritura** |
| `trazaloop-production` | `mvmpadeixomwkpxbnhky` | **No se tocó.** Ni una lectura de datos |
| `trazaloop-staging` (legado) | `dtrxxqmdweykzncfmahc` | **No se usó.** Pausado |
| `extrusion-diagnostic-db` | `sadoqnynjwfrxcaupzkk` | Ajeno |

El repositorio sigue **desvinculado** (`project_id = "trazaloop-local"` en
`config.toml`, sin `linked_project`): toda operación remota exige
`--project-ref` explícito. No hay destino implícito posible, que es la garantía
de Q0.2.

Las suites contra Staging llevan además su propia guarda: comparan el proyecto
de la API con el de `SUPABASE_DB_URL` y **abortan** si no coinciden. Ninguna
credencial de Staging se escribió en el repositorio.

---

## 2. Migraciones

Dos, en dos pasos.

```
db push --dry-run  →  solo 0114_quality_relations_io_documents_and_map_edges.sql
db push            →  exit 0
```

Después, al comprobar el resultado, apareció un defecto que **solo se ve en
remoto** (§4) y se corrigió con una segunda migración:

```
db push            →  0115_quality_map_edges_privilege_hardening.sql · exit 0
```

| | Antes | Después |
|---|---|---|
| Migraciones remotas | 105 | **107** |

`migration list` confirma que local y remoto coinciden en las 107, de `0001` a
`0115`. Sin `migration repair`: nada se marcó como aplicado sin ejecutarlo.
**Ninguna migración de 0001 a 0113 fue modificada.**

---

## 3. Estado resultante

| Comprobación | Esperado | Obtenido |
|---|---|---|
| Última migración | `0115` | `0115` |
| `quality_process_map_edges` existe | sí | sí |
| …con RLS activa | sí | **sí** |
| …con **una sola** política | `SELECT` | `SELECT` |
| `quality_process_documents.io_id` | existe | existe |
| FK del snapshot con `SET NULL` **de columna** | `{interaction_id}` | `{4}` = `interaction_id` |
| Privilegios de `anon` sobre el snapshot | 0 | **0** |
| Privilegios de `authenticated` sobre el snapshot | solo `SELECT` | **solo `SELECT`** (tras 0115) |

Idéntico al local.

---

## 4. El defecto que solo se vio en Staging

Merece su sección porque es la razón por la que validar contra un proyecto real
no es un trámite.

**Lo que 0114 dice:** el snapshot del mapa lo escribe únicamente la RPC de
publicación, así que `authenticated` recibe `SELECT` y nada más.

**Lo que ocurría:** conceder `SELECT` no **quita** lo que el entorno ya
concedió, y los privilegios por defecto no son los mismos en los dos sitios:

| Entorno | `pg_default_acl` sobre tablas nuevas | Resultado en 0114 |
|---|---|---|
| Local | `anon=Dxtm, authenticated=Dxtm` | 0114 revoca `Dxtm` → queda solo `SELECT` ✔ |
| Staging | `anon=arwdDxtm, authenticated=arwdDxtm` | 0114 revoca solo `Dxtm` → **quedaba `INSERT, UPDATE, DELETE`** ✘ |

La RLS seguía impidiendo escribir —sin política no hay acceso— así que **el
comportamiento observable era correcto y todas las pruebas pasaban en los dos
entornos**. Pero la defensa en profundidad se apoyaba en una sola capa en vez de
en dos, y la migración afirmaba algo que en remoto no era cierto.

**0115** revoca explícitamente `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
TRIGGER` a `authenticated` y reafirma la revocación total a `anon`. Solo revoca:
no crea, no altera datos, no toca ninguna otra tabla.

Y se añadieron **tres comprobaciones de privilegios por SQL directo** (S1–S3),
que son las que lo detectaron y las que impiden que vuelva. No se consultan por
PostgREST, así que solo corren cuando hay `SUPABASE_DB_URL`.

Es la misma lección de 0111 y de 0112 §12, aplicada al caso que faltaba: cuando
una tabla debe ser de solo lectura para el cliente, **no basta con conceder
`SELECT`; hay que revocar lo demás**.

---

## 5. Comportamiento verificado contra Staging

### 5.1 · Suites con base real

```
· entorno: qchzkxbnbqeyuxinipln

quality-01-process-foundation   →  56 en verde, 0 en rojo
quality-01-1-acceptance         →  41 en verde, 0 en rojo
quality-01-2-acceptance         →  33 en verde, 0 en rojo
```

Las tres corren con la **sesión real** de usuarios creados al vuelo, sujetas a
RLS. El cliente administrativo se usa solo para crear las cuentas y ajustar el
plan comercial.

> Nota sobre el acceso SQL: sin `SUPABASE_DB_URL` las suites corren igual pero
> **omiten** las comprobaciones que necesitan SQL directo (5 en `quality01-rls`,
> 4 en `quality011-rls`, 3 en `quality012-rls`) y lo anuncian. Se ejecutaron las
> dos formas; los números de arriba son con acceso completo, por el pooler de
> sesión `aws-0-us-west-2`.

### 5.2 · Recorrido humano por HTTP contra Staging

```
16 en verde, 0 en rojo
```

Los 16 pasos del recorrido, contra la base de Staging.

**Un detalle que costó un intento:** `NEXT_PUBLIC_*` se **inlinea en el
build**, así que un build hecho con el entorno local apunta a Supabase local por
mucho que se cambien las variables al arrancar. El primer intento dio 14 fallos
por eso. Se recompiló con el entorno de Staging y pasó completo. No es un
defecto del código; es cómo funciona Next, y conviene tenerlo escrito para la
próxima vez.

---

## 6. Production

**Intacta.** Comprobable:

| | |
|---|---|
| Migraciones aplicadas | ninguna |
| Variables de entorno | sin tocar |
| Despliegues | ninguno |
| Datos | sin leer y sin escribir |
| `QUALITY_MODULE_ENABLED` | **no definida** — Quality sigue invisible allí |

El único `--project-ref` que aparece en todo el sprint es
`qchzkxbnbqeyuxinipln`.

---

## 7. Preview

```
https://trazaloop-production-51i6hl5cy-idendi-latam-s-projects.vercel.app
```

Alias de rama:
`https://trazaloop-production-git-fix-qua-768ee2-idendi-latam-s-projects.vercel.app`

Estado **Ready**, `target: preview`, construido desde
`fix/quality-01-2-process-relations-docs-map`.

Sigue tras el SSO de Vercel (limitación G-2 de QUALITY-01.1): no se desactivó,
porque es una opción de proyecto compartida con Production.

---

## 8. Cómo repetir esto

```bash
# 1 · Verificar el destino ANTES de escribir
npx supabase projects list

# 2 · Qué se aplicaría (no escribe nada)
npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run

# 3 · Aplicar
npx supabase db push --project-ref qchzkxbnbqeyuxinipln

# 4 · Suites con base real (las credenciales NUNCA en el repositorio)
export NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=…
export SUPABASE_SERVICE_ROLE_KEY=…
export SUPABASE_DB_URL=postgresql://postgres.qchzkxbnbqeyuxinipln:…@aws-0-us-west-2.pooler.supabase.com:5432/postgres
npm run test:quality012-rls

# 5 · Recorrido HTTP: recompilar con ESE entorno antes de correrlo
npm run build && npm run test:quality012-ui
```

### Reconstrucción local completa

`supabase db reset` se detiene en 0105: esa migración toma un `LOCK TABLE` y el
runner del CLI (2.115.0) ejecuta algunas sentencias fuera de un bloque
transaccional. **No es un problema de QUALITY-01.2** — el propio encabezado de
0105 documenta la vía soportada en local: aplicar el archivo con
`psql --single-transaction`. Contra Staging, `db push` administra su propia
transacción y no hay ningún problema.

```bash
npx supabase db reset            # llega hasta 0104
for f in supabase/migrations/*.sql; do   # el resto, uno a uno
  psql "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
  # y registrar la versión en supabase_migrations.schema_migrations
done
```

Resultado: **107 migraciones**, `0115` incluida, sin error.
