# QUALITY-10 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: validación local completa

La migración se replayó **entera** contra un stack Supabase local (Postgres 17,
la misma versión mayor que Production) antes de tocar Staging:

```
supabase db reset --local     → EXIT 0 · cabecera 0128
npm run test:quality10        → 106 conformes, 0 fallos
npm run test:quality10-rls    →  61 conformes, 0 fallos
npm run build                 → EXIT 0 · 3 rutas nuevas
npm run test:all              → TEST_ALL_EXIT = 0
```

Los ocho defectos están en `QUALITY_10_TEST_MATRIX.md` §5. Los cuatro que
importan —el catálogo de eventos estrechado, el alias ambiguo, la reapertura que
violaba su propia restricción y el refresco que degradaba una entrada ya
revisada— los encontró la suite **contra base real**, no una prueba estática.

Regresiones de base real, todas verdes antes de subir:

```
test:quality03-rls  → 52 correctas   test:quality031-rls → 30 correctas
test:quality04-rls  → 33 correctas   test:quality05-rls  → 74 conformes
test:quality06-rls  → 58 conformes   test:quality061-rls → 28 conformes
test:quality07-rls  → 48 conformes   test:quality08-rls  → 60 conformes
test:quality09-rls  → 60 conformes
```

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0128_quality_management_review.sql...
  {"migrations":["0128_quality_management_review.sql"]}
```

Antes: cabecera 0127. Después: **0128**. Una sola migración; ninguna anterior se
tocó y no se ejecutó ningún `migration repair`.

**Por qué una y no dos.** El encargo anticipaba `0129` si aparecía una
corrección posterior. Los seis defectos se encontraron con 0128 aplicada **solo
en local**, así que corregir 0128 en el sitio era legítimo.

## 3 · Paridad de migraciones

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 120 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0128 · remote 0128
```

| Entorno | Cabecera |
|---|---|
| Local | **0128** |
| Staging | **0128** |
| Production | **0111** — ver §7 |

## 4 · El esquema, comprobado en remoto

```
tablas_del_dominio      = 9    (las nueve existen en Staging)
anon_denegado           = 9    (permission denied en las nueve)
anon_con_filas          = 0
vistas                  = 3    (las tres responden 200 al service_role)
rpc_expuestas_a_anon    = 0    (404 en las seis probadas)
```

En local, con acceso a `pg_catalog`:

```
tablas                   = 9    (8 con RLS + el catálogo global)
sin_rls                  = 0
vistas_invoker           = 3
definer_sin_search_path  = 0
funciones                = 35
adaptadores_de_fuente    = 14
politicas                = 16
triggers                 = 25
anon_sobre_dominio       = 0
catalogo                 = 14 entradas sembradas
actas_authenticated      = SELECT   (y nada más)
```

## 5 · Las suites corrieron CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-10-management-review.test.ts
  → 61 conformes, 0 fallos

NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-08-customer-voice.test.ts        # §100
  → 60 conformes, 0 fallos
```

La segunda no es decorativa: es la regresión de anonimato. QUALITY-10 agrega
información de la voz del cliente, y la comprobación de que no introdujo una
fuga lateral hay que hacerla **con datos reales, contra el mismo proyecto**.

## 6 · §103 · Datos efímeros y residuo

La suite creó dos empresas efímeras (`Q10 A …`, `Q10 B …`), usuarios de prueba
`@test.trazaloop.dev` y su contenido en nueve dominios. Todo se retiró
**lógicamente**:

| Qué | Cómo quedó |
|---|---|
| Revisiones abiertas | `cancelled`, con motivo |
| Acciones abiertas | `cancelled`, con motivo |
| Auditorías abiertas | `cancelled`, con motivo |
| Programas de auditoría | `closed` |
| Campañas | `closed` |
| Encuestas | `is_active = false` |
| Indicadores | de vuelta a `draft` |
| Casos | `closed` |
| Avisos | `dismissed` |
| Tareas | `cancelled` |
| Procesos | `retired` |
| Cargos | `is_active = false` |
| Personas | `former` |

Recuento posterior: **0** revisiones abiertas, **0** acciones abiertas, **0**
avisos pendientes, **0** tareas pendientes, **0** casos abiertos.

**Lo que se conservó, y por qué.** 1 acta de revisión, 1 decisión, 28 entradas
con su retrato, 1 participante y 2 mediciones. Son **inmutables por diseño**, y
ese diseño no se debilita para limpiar datos de prueba: borrarlos exigiría quitar
exactamente las guardas que este sprint existe para poner.

**Ninguna guarda se tocó.** El indicador no se pudo pasar a `retired` sin motivo
—QUALITY-03 lo exige— y no se forzó: se dejó en `draft`, que es un estado
legítimo y no obliga a inventar una razón.

Ninguna cuenta QA permanente se modificó: el retiro se acotó por
`organizations.name like 'Q10 %'`.

## 7 · §105 · Production, intacta

| Comprobación | Resultado |
|---|---|
| Cabecera de migraciones | **0111** — sin cambios |
| Variables de entorno de Production | las 7, sin tocar |
| Variables de Development | 0 |
| Migraciones aplicadas | ninguna |
| Datos escritos | ninguno |
| Usuarios o semillas | ninguno |
| Despliegue, promoción o alias | ninguno |

Production en 0111 es **intencional**: QUALITY-01…10 nunca se han aplicado allí.

## 8 · §104 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-10-management-review` |
| Variables | tres, **solo scope Preview y solo esta rama**, apuntando a Staging |
| Estado | ● READY |
| SSO | Sigue activo: seis rutas comprobadas, **302** todas |
| Production Environment / Development | **Sin tocar** |

```
TARGET=PREVIEW
SUPABASE=STAGING
PRODUCTION_ENV_CHANGED=NO
```

```
vercel env ls preview feature/quality-10-management-review
  SUPABASE_SERVICE_ROLE_KEY      Preview (feature/quality-10-management-review)
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Preview (feature/quality-10-management-review)
  NEXT_PUBLIC_SUPABASE_URL       Preview (feature/quality-10-management-review)
```

**URL de Preview:**
`https://trazaloop-production-fd0n60ly8-idendi-latam-s-projects.vercel.app`

```
/                                     → 302
/quality                              → 302
/quality/management-review            → 302
/quality/management-review/followup   → 302
/quality/audits                       → 302
/quality/tasks                        → 302
```

La protección de despliegue intercepta todas las rutas. **No se desactivó**:
desactivarla para ver una pantalla expondría el resto de la aplicación. La
verificación equivalente se hizo donde sí se puede —la suite completa contra
Staging con sesiones reales, y la compilación de producción local—.
