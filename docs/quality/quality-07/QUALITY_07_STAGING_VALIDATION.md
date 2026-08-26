# QUALITY-07 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: validación local completa

La migración se replayó **entera** contra un stack Supabase local (Postgres 17,
la misma versión mayor que Production) antes de tocar Staging:

```
supabase db reset --local     → EXIT 0 · cabecera 0125
npm run test:quality07        → 68 conformes, 0 fallos
npm run test:quality07-rls    → 48 conformes, 0 fallos
npm run build                 → EXIT 0 · 8 rutas nuevas bajo /quality/suppliers
npm run test:all              → TEST_ALL_EXIT_REAL=0
```

Los cinco defectos que aparecieron —y se corrigieron **antes** de tocar
Staging— están en `QUALITY_07_TEST_MATRIX.md` §5.

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0125_quality_suppliers_evaluation.sql...
  {"migrations":["0125_quality_suppliers_evaluation.sql"]}
```

Antes: cabecera 0124. Después: **0125**. Una sola migración; ninguna anterior se
tocó y no se ejecutó ningún `migration repair`.

**Por qué una y no dos.** El encargo anticipaba `0126` si hacía falta una
corrección posterior. Los cinco defectos se encontraron con 0125 aplicada
**solo en local**, así que corregir 0125 en el sitio era legítimo: la regla es
no editarla una vez aplicada a Staging, y no lo estaba. Se editó, se volvió a
replayar entera con `db reset --local` y se validó de nuevo antes de subirla.

## 3 · Paridad de migraciones

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 117 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0125 · remote 0125
```

| Entorno | Cabecera |
|---|---|
| Local | **0125** |
| Staging | **0125** |
| Production | **0111** — ver §7 |

## 4 · El esquema, comprobado en remoto

```
tablas_nuevas           = 21
sin_rls                 = 0
vistas_invoker          = 3
puente_cpr              = 1     (suppliers.external_party_id)
puente_textiles         = 1     (textile_suppliers.external_party_id)
definer_sin_search_path = 0
applies_to_widened      = 1     (supplier_criticality admitido)
anon_sobre_proveedores  = 0
decisiones_authenticated= SELECT (y nada más)
triggers_cierre         = 2     (evaluación cerrada y sus criterios)
```

## 5 · La suite RLS corrió CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-07-suppliers-evaluation.test.ts
  → 48 conformes, 0 fallos
```

Verificado que corrió de verdad contra el remoto: las dos empresas efímeras
`Q07 A …` y `Q07 B …` quedaron creadas en Staging.

## 6 · Datos efímeros y residuo

La suite creó dos empresas efímeras, cuatro usuarios de prueba
(`@test.trazaloop.dev`) y su contenido. Todo se retiró **lógicamente**, sin
debilitar ninguna invariante:

| Qué | Cómo quedó |
|---|---|
| Proveedores de Quality | `retired` |
| Empresas externas y sus papeles | `retired` / `inactive` |
| Categorías, requisitos y plantillas | `is_active = false` |
| Metodología de criticidad | `is_active = false` |
| Documentos | `revoked` |
| Incidentes | `closed` |
| Señales | `dismissed` |
| Alertas | `dismissed` |
| Tareas del barrido | `cancelled`, con su motivo escrito y su fecha de cierre |
| Casos abiertos desde incidentes | `closed`, con nota de cierre |
| Proveedor textil de prueba | `is_active = false` |

Recuento posterior: **0** proveedores activos, **0** empresas externas activas,
**0** categorías, requisitos, plantillas o metodologías activas, **0**
incidentes abiertos, **0** documentos vigentes, **0** señales abiertas, **0**
alertas pendientes, **0** tareas pendientes, **0** casos abiertos.

**Lo que se conservó a propósito:** 1 evaluación, 3 decisiones de aprobación y
1 clasificación de criticidad. Son inmutables por diseño, y ese diseño no se
debilita para limpiar datos de prueba. Una tarea cancelada necesitó su
`completed_at` porque la invariante del motor de trabajo lo exige — tampoco se
tocó esa invariante.

Ninguna cuenta QA permanente se modificó: el retiro se acotó por
`organizations.name like 'Q07 %'`.

## 7 · Production, intacta

| Comprobación | Resultado |
|---|---|
| Cabecera de migraciones | **0111** — sin cambios |
| Variables de entorno de Production | las 7, todas con 32 días de antigüedad |
| Migraciones aplicadas | ninguna |
| Datos escritos | ninguno |
| Despliegue, promoción o alias | ninguno |

Production en 0111 es **intencional**: QUALITY-01…07 nunca se han aplicado allí.
No se intentó sincronizar.

## 8 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-07-suppliers-evaluation` |
| Variables | tres, **solo scope Preview y solo esta rama**, apuntando a Staging |
| Estado | ● READY |
| SSO | Sigue activo: `/`, `/quality/suppliers` y `/quality/suppliers/evaluations` responden **302** sin sesión |
| Production Environment / Development | **Sin tocar** |

```
TARGET=PREVIEW
SUPABASE=STAGING
PRODUCTION_ENV_CHANGED=NO
```

```
vercel env ls preview feature/quality-07-suppliers-evaluation
  SUPABASE_SERVICE_ROLE_KEY      Preview (feature/quality-07-suppliers-evaluation)
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Preview (feature/quality-07-suppliers-evaluation)
  NEXT_PUBLIC_SUPABASE_URL       Preview (feature/quality-07-suppliers-evaluation)

vercel env pull --environment=preview --git-branch=feature/quality-07-…
  referencia de Production en el entorno Preview: 0 ocurrencias
```

**URL de Preview:**
`https://trazaloop-production-rgvw1vts7-idendi-latam-s-projects.vercel.app`

La protección de despliegue impide una comprobación anónima en tiempo de
ejecución —que es justo lo que debe hacer—, así que la prueba de destino es la
de configuración.

## 9 · Estado final del repositorio

```
working tree            limpio
supabase REMOTE         UNLINKED
push                    normal, sin force
migraciones             append-only, sin repair
```
