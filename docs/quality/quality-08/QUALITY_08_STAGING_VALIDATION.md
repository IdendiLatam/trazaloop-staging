# QUALITY-08 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: validación local completa

La migración se replayó **entera** contra un stack Supabase local (Postgres 17,
la misma versión mayor que Production) antes de tocar Staging:

```
supabase db reset --local     → EXIT 0 · cabecera 0126
npm run test:quality08        → 112 conformes, 0 fallos
npm run test:quality08-rls    → 60 conformes, 0 fallos
npm run build                 → EXIT 0 · 8 rutas nuevas
npm run test:all              → TEST_ALL_EXIT_REAL = 0
```

Los siete defectos que aparecieron —seis antes de tocar Staging y uno de
nomenclatura— están en `QUALITY_08_TEST_MATRIX.md` §5.

Regresiones de base real, todas verdes antes de subir:

```
test:quality03-rls  → 52 correctas   test:quality031-rls → 30 correctas
test:quality04-rls  → 33 correctas   test:quality05-rls  → 74 conformes
test:quality06-rls  → 58 conformes   test:quality061-rls → 28 conformes
test:quality07-rls  → 48 conformes
```

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0126_quality_customer_voice.sql...
  {"migrations":["0126_quality_customer_voice.sql"]}
```

Antes: cabecera 0125. Después: **0126**. Una sola migración; ninguna anterior se
tocó y no se ejecutó ningún `migration repair`.

**Por qué una y no dos.** El encargo anticipaba `0127` si aparecía una
corrección posterior. Los seis defectos se encontraron con 0126 aplicada **solo
en local**, así que corregir 0126 en el sitio era legítimo: la regla es no
editarla una vez aplicada a Staging, y no lo estaba. Se editó, se replayó entera
con `db reset --local` y se validó de nuevo antes de subirla.

## 3 · Paridad de migraciones

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 118 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0126 · remote 0126
```

| Entorno | Cabecera |
|---|---|
| Local | **0126** |
| Staging | **0126** |
| Production | **0111** — ver §7 |

## 4 · El esquema, comprobado en remoto

```
tablas                   = 14
sin_rls                  = 0
vistas_invoker           = 3
definer_sin_search_path  = 0
puente_pcr               = 1   (customer_requirements.external_party_id)
anon_sobre_dominio       = 0
token_hash_a_sesion      = 0   (ni authenticated ni anon ven el hash)
respuestas_authenticated = SELECT  (y nada más)
rpc_anon                 = quality_resolve_survey_token, quality_submit_survey_response
fuentes_nativas          = 9   (5 de QUALITY-03 + 4 nuevas)
```

## 5 · La suite RLS corrió CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-08-customer-voice.test.ts
  → 60 conformes, 0 fallos
```

No es una repetición decorativa. Un proyecto de Supabase concede privilegios por
defecto sobre cada tabla nueva; las comprobaciones que verifican que `anon` no
lee nada, que el hash del token no sale y que la sesión no puede fabricar una
respuesta son exactamente las que habrían fallado sin las revocaciones
explícitas de la migración.

### 5.1 · §103 · Y el flujo público, real

La suite emite enlaces reales, los resuelve, envía respuestas y las reutiliza,
todo con el cliente **anónimo** contra el endpoint de Staging. Verificado
después en el remoto:

```
respuestas_por_enlace_publico       = 9
invitaciones_usadas                 = 9
respuestas_anonimas_con_identidad   = 0
auditoria_de_respuestas_anonimas    = 0
no_conformidades                    = 0
riesgos                             = 0
```

## 6 · §104 · Datos efímeros y residuo

La suite creó dos empresas efímeras (`Q08 A …`, `Q08 B …`), cuatro usuarios de
prueba (`@test.trazaloop.dev`) y su contenido. Todo se retiró **lógicamente**:

| Qué | Cómo quedó |
|---|---|
| Encuestas | `is_active = false`, con fecha de retiro |
| Clientes y empresas externas | `retired` |
| Papeles de la identidad externa | `inactive` |
| Perfiles de proveedor de la prueba | `retired` |
| Campañas abiertas | `closed`, con nota · las de borrador, `cancelled` |
| Enlaces sin usar | `revoked` |
| Manifestaciones y quejas | `closed`, con su nota |
| Señales | `dismissed` |
| Alertas | `dismissed` |
| Tareas | `cancelled`, con motivo y fecha de cierre |
| Casos | `closed`, con nota de cierre |
| Temas y métricas | `is_active = false` |

Recuento posterior: **0** encuestas activas, **0** clientes activos, **0**
campañas abiertas, **0** enlaces vivos, **0** quejas abiertas, **0** señales
abiertas, **0** alertas pendientes, **0** tareas pendientes, **0** casos
abiertos.

**Lo que se conservó, y por qué.** 9 respuestas enviadas, 5 resultados de
métrica, 1 cierre de periodo y 2 versiones de encuesta. Son **inmutables por
diseño**, y ese diseño no se debilita para limpiar datos de prueba: borrarlas
exigiría quitar las guardas que este sprint existe para poner. Quedan dentro de
dos empresas efímeras retiradas, sin ninguna vía activa.

Ninguna cuenta QA permanente se modificó: el retiro se acotó por
`organizations.name like 'Q08 %'`.

## 7 · §106 · Production, intacta

| Comprobación | Resultado |
|---|---|
| Cabecera de migraciones | **0111** — sin cambios |
| Variables de entorno de Production | las 7, todas con 32 días de antigüedad |
| Migraciones aplicadas | ninguna |
| Datos escritos | ninguno |
| Usuarios o semillas | ninguno |
| Despliegue, promoción o alias | ninguno |

Production en 0111 es **intencional**: QUALITY-01…08 nunca se han aplicado allí.
No se intentó sincronizar.

## 8 · §105 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-08-customer-voice` |
| Variables | tres, **solo scope Preview y solo esta rama**, apuntando a Staging |
| Estado | ● READY |
| SSO | Sigue activo: `/`, `/quality/customer-voice` y `/quality/customer-voice/campaigns` responden **302** |
| Production Environment / Development | **Sin tocar** |

```
TARGET=PREVIEW
SUPABASE=STAGING
PRODUCTION_ENV_CHANGED=NO
```

```
vercel env ls preview feature/quality-08-customer-voice
  SUPABASE_SERVICE_ROLE_KEY      Preview (feature/quality-08-customer-voice)
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Preview (feature/quality-08-customer-voice)
  NEXT_PUBLIC_SUPABASE_URL       Preview (feature/quality-08-customer-voice)

vercel env pull --environment=preview --git-branch=feature/quality-08-…
  referencias a Production en el entorno Preview: 0
```

**URL de Preview:**
`https://trazaloop-production-jseako7d9-idendi-latam-s-projects.vercel.app`

### 8.1 · La ruta pública y la protección de despliegue

La protección de despliegue intercepta **todas** las rutas del Preview, incluida
`/survey/[token]`, que responde 302 como el resto. **No se desactivó**:
desactivarla para probar una ruta expondría el resto de la aplicación.

La verificación equivalente se hizo en los dos entornos que sí lo permiten:

- **la RPC completa contra Staging** — enlace real, resolución, envío y replay,
  con el cliente anónimo (§5.1);
- **la página completa contra la compilación de producción local** — 200 con la
  encuesta, 200 con el mensaje genérico y cero menciones de la empresa para un
  token inventado.

Lo que queda sin probar en Preview es el reparto de estáticos, que no tiene nada
específico de este dominio.

## 9 · Estado final del repositorio

```
working tree            limpio
supabase REMOTE         UNLINKED
push                    normal, sin force
migraciones             append-only, sin repair
```
