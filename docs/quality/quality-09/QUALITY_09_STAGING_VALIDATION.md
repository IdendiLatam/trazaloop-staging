# QUALITY-09 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: validación local completa

La migración se replayó **entera** contra un stack Supabase local (Postgres 17,
la misma versión mayor que Production) antes de tocar Staging:

```
supabase db reset --local     → EXIT 0 · cabecera 0127
npm run test:quality09        → 103 conformes, 0 fallos
npm run test:quality09-rls    →  60 conformes, 0 fallos
npm run build                 → EXIT 0 · 7 rutas nuevas
npm run test:all              → TEST_ALL_EXIT = 0
```

Los diez defectos que aparecieron están en `QUALITY_09_TEST_MATRIX.md` §5. Los
tres que importan —el disparador de autoría, la política `for all` que reabría
la lectura de las notas restringidas y el barrido que no era idempotente— los
encontró la suite **contra base real**, no una prueba estática.

Regresiones de base real, todas verdes antes de subir:

```
test:quality03-rls  → 52 correctas   test:quality031-rls → 30 correctas
test:quality04-rls  → 33 correctas   test:quality05-rls  → 74 conformes
test:quality06-rls  → 58 conformes   test:quality061-rls → 28 conformes
test:quality07-rls  → 48 conformes   test:quality08-rls  → 60 conformes
```

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0127_quality_audits.sql...
  {"migrations":["0127_quality_audits.sql"]}
```

Antes: cabecera 0126. Después: **0127**. Una sola migración; ninguna anterior se
tocó y no se ejecutó ningún `migration repair`.

**Por qué una y no dos.** El encargo anticipaba `0128` si aparecía una
corrección posterior. Los tres defectos se encontraron con 0127 aplicada **solo
en local**, así que corregir 0127 en el sitio era legítimo: la regla es no
editarla una vez aplicada a Staging, y no lo estaba.

## 3 · Paridad de migraciones

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 119 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0127 · remote 0127
```

| Entorno | Cabecera |
|---|---|
| Local | **0127** |
| Staging | **0127** |
| Production | **0111** — ver §7 |

## 4 · El esquema, comprobado en remoto

```
tablas_del_dominio        = 22   (las 22 existen en Staging)
anon_con_lectura          = 0    (probadas las 22 con el cliente anónimo)
vistas                    = 3    (las tres responden 200 al service_role)
rpc_expuestas_a_anon      = 0    (404 en cinco; 401 en quality_scan_audits,
                                  que acepta {} por tener parámetro con
                                  valor por defecto — y falla por permisos)
```

En local, con acceso a `pg_catalog`:

```
tablas                   = 22
sin_rls                  = 0
vistas_invoker           = 3
definer_sin_search_path  = 0
funciones                = 27
politicas                = 43
triggers                 = 41
anon_sobre_dominio       = 0
```

## 5 · La suite RLS corrió CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-09-audits.test.ts
  → 60 conformes, 0 fallos
```

No es una repetición decorativa. Un proyecto de Supabase concede privilegios por
defecto sobre cada tabla nueva; las comprobaciones que verifican que `anon` no
lee nada, que la nota restringida no sale y que una auditoría de A no alcanza un
proceso de B son exactamente las que habrían fallado sin las revocaciones y las
FK compuestas de la migración.

Verificado después en el remoto, sobre los datos que la suite dejó:

```
no_conformidades_creadas_por_el_dominio = 0
auditorías por estado tras la suite      = closed 2 · cancelled 2 · planned 4 · draft 2
```

## 6 · §104 · Datos efímeros y residuo

La suite creó cuatro empresas efímeras (`Q09 A …`, `Q09 B …` de dos pasadas),
usuarios de prueba `@test.trazaloop.dev` y su contenido. Todo se retiró
**lógicamente**:

| Qué | Cómo quedó |
|---|---|
| Auditorías abiertas | `cancelled`, con `cancelled_at` y razón |
| Programas | `closed`, con nota de cierre |
| Checklists | `is_active = false`, con fecha de retiro |
| Conflictos sin decidir | `dismissed` |
| Avisos | `dismissed` |
| Tareas | `cancelled` |
| Casos | `closed` |
| Procesos | `retired` |
| Cargos | `is_active = false` |
| Personas | `former`, con fecha de salida |

Recuento posterior: **0** auditorías abiertas, **0** programas abiertos, **0**
avisos pendientes, **0** tareas pendientes, **0** casos abiertos. Estado final:
8 auditorías `cancelled` y 2 `closed`; 2 programas `closed`.

**Lo que se conservó, y por qué.** 4 informes de auditoría, 8 revisiones de
programa, 2 reprogramaciones y 4 hallazgos. Son **inmutables por diseño**, y ese
diseño no se debilita para limpiar datos de prueba: borrarlos exigiría quitar
exactamente las guardas que este sprint existe para poner. Quedan dentro de
empresas efímeras retiradas, sin ninguna vía activa.

Ninguna cuenta QA permanente se modificó: el retiro se acotó por
`organizations.name like 'Q09 %'`.

## 7 · §96 · Production, intacta

| Comprobación | Resultado |
|---|---|
| Cabecera de migraciones | **0111** — sin cambios |
| Variables de entorno de Production | las 7, todas con 32 días de antigüedad |
| Variables de Development | 0 |
| Migraciones aplicadas | ninguna |
| Datos escritos | ninguno |
| Usuarios o semillas | ninguno |
| Despliegue, promoción o alias | ninguno |

Production en 0111 es **intencional**: QUALITY-01…09 nunca se han aplicado
allí. No se intentó sincronizar.

## 8 · §95 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-09-audits` |
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
vercel env ls preview feature/quality-09-audits
  SUPABASE_SERVICE_ROLE_KEY      Preview (feature/quality-09-audits)
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Preview (feature/quality-09-audits)
  NEXT_PUBLIC_SUPABASE_URL       Preview (feature/quality-09-audits)
```

**URL de Preview:**
`https://trazaloop-production-hc2duxqcr-idendi-latam-s-projects.vercel.app`
(el despliegue del commit final; el anterior, `…ogse7t9xf…`, también quedó
● READY con las mismas 302)

```
/                              → 302
/quality                       → 302
/quality/audits                → 302
/quality/audits/programs       → 302
/quality/audits/list           → 302
/quality/audits/findings       → 302
/quality/audits/checklists     → 302
```

La protección de despliegue intercepta todas las rutas. **No se desactivó**:
desactivarla para ver una pantalla expondría el resto de la aplicación. La
verificación equivalente se hizo donde sí se puede —la suite completa contra
Staging con sesiones reales, y la compilación de producción local—.
