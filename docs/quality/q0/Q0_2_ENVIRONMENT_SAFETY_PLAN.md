# Q0_2_ENVIRONMENT_SAFETY_PLAN

**Sprint:** Q0.2 — Environment Safety Closure
**Fecha:** 2026-08-18
**Naturaleza:** **PLANIFICACIÓN ÚNICAMENTE. NADA EJECUTADO.**
**Cierra:** DR-02, DR-13, DR-14
**Precondición para:** la primera migración de Trazaloop Quality

> **Ningún comando de este documento se ha ejecutado.** Todos los bloques de comandos están
> marcados `NOT EXECUTED`. No se ha creado ningún proyecto Supabase, no se ha modificado ningún
> enlace, `.env`, variable de Vercel, bucket, ajuste de Auth, migración, DNS ni Git.

---

## 1. Current environment state

### 1.1 Lo que existe hoy

| Elemento | Estado real | Fuente |
|---|---|---|
| Supabase **Production** | `mvmpadeixomwkpxbnhky` · `trazaloop-production` · `aws-1-us-west-2` · PG 17.6.1.147 | Verificado en Q0.1 |
| Supabase **Staging** | **No existe** | No hay segundo proyecto vinculado ni referenciado |
| Supabase **Local** | **No arrancable** | Falta `supabase/config.toml` |
| Proyecto retirado | `dtrxxqmdweykzncfmahc` — sin DNS, no existe | Verificado en Q0.1 |
| Vínculo del repositorio | **Apunta a Production** (`supabase/.temp/linked-project.json`) | Q0.1 |
| `.env.local` | Generado por `vercel env pull` (Development); apunta al proyecto **retirado** | Q0.1 |
| Vercel | Proyecto `trazaloop-production` (`prj_6MqJ…`) | `.vercel/project.json` |
| Docker | Instalado y con demonio **activo** | Verificado |
| Supabase CLI | 2.114.0 instalado; **sin `access-token`** en `~/.supabase` (usa credencial almacenada por `link`) | Verificado |
| Vercel CLI | **No instalado** | Verificado |

### 1.2 El riesgo central

```text
Repositorio ──link──► trazaloop-production   (¡PRODUCCIÓN!)
                 │
                 └── supabase db push  →  impacta producción SIN AVISO
```

`supabase db push` opera contra el proyecto vinculado. Hoy ese proyecto es producción y **no
existe ninguna barrera** entre un comando escrito por costumbre y la base real de clientes.

Matiz importante: `supabase/.temp/` está en `.gitignore`, así que el vínculo es **estado local de
esta máquina**, no del repositorio. Un clon nuevo nace sin vincular, que es el estado seguro. El
problema es específico de este equipo de trabajo — y de cualquier otro donde alguien ejecute
`supabase link` apuntando a producción.

### 1.3 Utillaje que YA existe y debe reutilizarse

El repositorio **ya tiene** casi toda la herramienta necesaria. Este plan reutiliza y no duplica
(Maestro §53).

| Herramienta | Qué hace | Uso en este plan |
|---|---|---|
| `scripts/release/v1/precheck-env.ts` | Verifica **presencia** de variables sin imprimir valores; admite `--env` y **`--expect-project-ref`** | **Núcleo del guardrail** y de la verificación por entorno |
| `scripts/smoke-staging.ts` | Smoke contra un proyecto **local o staging**: variables, conexión, tablas y vistas, RLS conductual, bucket, semillas | Smoke de LOCAL y de STAGING |
| `scripts/verify-production.ts` | Verificación **estricta y de solo lectura** de producción | Verificación posterior a promoción |
| `scripts/seed-demo.ts` | Semilla demo que **respeta RLS** (inicia sesión como usuario, sin `service_role`) y exige `DEMO_ORGANIZATION_ID` explícito | Datos mínimos de prueba en staging |
| `scripts/release/v1/cleanup-staging.ts` | Limpieza de staging, **dry-run por defecto**, fail-closed, nunca ejecutada | Higiene de staging |
| `tests/db/run-local-pg.sh` + `harness-prelude.sql` | PostgreSQL local desechable con superficie Supabase emulada | Validación SQL sin Supabase |
| `docs/STAGING_DEPLOYMENT.md` (348 líneas, 18 secciones) | Procedimiento de staging ya escrito | **Base del §5**, con correcciones |
| `docs/PRODUCTION_DEPLOYMENT.md` | Procedimiento de producción | Referencia para promoción |

### 1.4 Deuda detectada en la documentación y el entorno existentes

| Hallazgo | Detalle |
|---|---|
| `STAGING_DEPLOYMENT.md` desactualizado | Su §8 dice *"Deben aplicarse las migraciones `0001` … `0069`"*. Hoy son **102**, hasta `0110`. |
| `STAGING_DEPLOYMENT.md` usa nombres heredados | Su §11 lista `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`; `.env.example` ya declara vigentes `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`. |
| `STAGING_DEPLOYMENT.md` §11 omite variables | No incluye `TEXTILES_MODULE_ENABLED` ni `PUBLIC_REGISTRATION_ENABLED`, ambas obligatorias según `.env.example`. |
| `.env.local` usa nombres heredados | Coherente con lo anterior; el código los acepta como respaldo. |
| `.env.local` no define `PUBLIC_REGISTRATION_ENABLED` | Ausencia ⇒ registro público **deshabilitado** (fail-closed). Correcto por defecto, pero no explícito. |

---

## 2. Target environment architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│  LOCAL DEVELOPMENT                                                   │
│  Supabase local (Docker) · supabase start / db reset                 │
│  · Datos sintéticos. Cero datos de clientes.                         │
│  · Ciclo rápido: reset destructivo permitido y esperado.             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  promoción: migración validada
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SUPABASE STAGING            <ref-staging>                           │
│  Vercel: entorno Preview                                             │
│  · Datos de prueba propios, generados con seed:demo.                 │
│  · NUNCA una copia de datos de Production.                           │
│  · cleanup:staging disponible.                                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  promoción: aprobación humana explícita
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SUPABASE PRODUCTION         mvmpadeixomwkpxbnhky                    │
│  Vercel: entorno Production                                          │
│  · Datos reales de clientes.                                         │
│  · Solo lectura desde el puesto de desarrollo.                       │
│  · Escritura únicamente por procedimiento aprobado.                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Reglas de la arquitectura objetivo**

1. Development **jamás** apunta a Production.
2. `mvmpadeixomwkpxbnhky` permanece **intacto** durante todo este trabajo.
3. `dtrxxqmdweykzncfmahc` se considera **inexistente**; ninguna configuración debe referenciarlo.
4. El desarrollo cotidiano ocurre contra **Supabase local**.
5. **Staging debe existir antes** de la primera migración de Quality.
6. Toda migración recorre **local → staging → production**, en ese orden y sin saltos.
7. Cada entorno tiene **secretos propios**. `ACTIVE_ORG_COOKIE_SECRET` **nunca** se comparte entre
   entornos (`.env.example` ya lo exige).

---

## 3. DR-02 closure procedure

**Objetivo:** determinar si `ACTIVE_ORG_COOKIE_SECRET` existe en el entorno **Production** de
Vercel. Resultado admitido: `EXISTS` / `MISSING` / `NOT DETERMINABLE`. **El valor nunca se
muestra.**

**Vía elegida: verificación manual desde el panel de Vercel.** El encargo pide preferir la
verificación manual antes que introducir herramientas nuevas solo para esta comprobación, y es la
opción correcta: instalar el CLI de Vercel para responder una pregunta binaria añade una
dependencia, requiere autenticación interactiva y amplía la superficie de acceso a producción sin
necesidad.

### Procedimiento (1 minuto, lo ejecuta una persona)

1. Abrir `vercel.com` → equipo `team_QTJuXk4bOQr9mqe8wnn8XMaI` → proyecto **trazaloop-production**.
2. **Settings → Environment Variables**.
3. Filtrar por `ACTIVE_ORG_COOKIE_SECRET`.
4. Observar **únicamente** la columna de entornos: ¿tiene marcado **Production**?
5. **No pulsar el icono de revelar valor.** No copiar. No descargar.
6. Registrar el resultado como `EXISTS` / `MISSING`.

### Verificación adicional recomendada mientras se está en esa pantalla

Sin revelar ningún valor, comprobar **qué proyecto Supabase** tiene configurado Production. El
`project ref` viaja dentro de `NEXT_PUBLIC_SUPABASE_URL`, que es **información pública** (llega al
navegador en cada petición), así que puede leerse sin comprometer nada:

- Si Production apunta a `mvmpadeixomwkpxbnhky` → correcto.
- Si apunta a `dtrxxqmdweykzncfmahc` → **incidencia grave**, producción estaría configurada contra
  un proyecto inexistente. Q0.1 demostró que el entorno Development lo está; conviene descartar
  que Production comparta el defecto.

Confirmar de paso la presencia (no el valor) de: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o su heredada, `SUPABASE_SECRET_KEY` o su heredada,
`TEXTILES_MODULE_ENABLED`, `PUBLIC_REGISTRATION_ENABLED`, `NEXT_PUBLIC_SITE_URL`.

### Alternativa automatizable (solo si se decide instalar el CLI de Vercel)

```bash
# NOT EXECUTED — requiere instalar y autenticar el CLI de Vercel (DR-02a)
npm i -g vercel
vercel login
vercel link --yes
vercel env ls production          # lista NOMBRES y entornos; NO muestra valores
```

`vercel env ls` imprime nombres y entornos, no valores. **Nunca usar `vercel env pull` sobre
Production**: descargaría los secretos reales a disco, que es justo lo que este sprint quiere
evitar.

---

## 4. Local Supabase restoration procedure (DR-13)

### 4.1 Diagnóstico

| Pregunta | Respuesta verificada |
|---|---|
| Configuración Supabase del repositorio | `supabase/` contiene **solo** `migrations/` y `.temp/`. **No hay `config.toml`** → `supabase start` no puede arrancar. |
| Qué depende de `.env.local` | Todo el acceso a datos: `lib/supabase/server.ts`, `browser.ts`, `admin.ts`; `lib/env.ts`; y los scripts `precheck:env`, `test:smoke`, `test:rls`, `seed:demo`, `verify:prod`. |
| Docker | Instalado y con demonio activo. Requisito cumplido. |
| Buckets | Los crean las **migraciones**: `evidences` (0015), `organization-assets` (0049), `trazadocs-documents` (0058). **No requieren paso manual.** |
| Auth | El trigger `on_auth_user_created` (0004) es parte de las migraciones. La *URL Configuration* y *Confirm email* son ajustes de panel, **no aplicables en local**. |
| Semillas | Vienen en las migraciones: 52 preguntas de diagnóstico, 10 clasificaciones de material, marcos normativos y metodología `RC-6632-15343` activa. **No requieren seed adicional.** |
| Primer superadministrador | **Requiere SQL directo** por diseño (0040): la política de `INSERT` es infranqueable mientras la tabla esté vacía. |

### 4.2 Diferencias respecto a Production que deben preservarse

| Aspecto | Local | Production |
|---|---|---|
| `ACTIVE_ORG_COOKIE_SECRET` | Propio, de desarrollo | Propio, distinto |
| `PUBLIC_REGISTRATION_ENABLED` | `true` (para poder registrarse) | `false` en el hito técnico |
| `TEXTILES_MODULE_ENABLED` | `true` | `true` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | dominio real |
| Confirmación de correo | Deshabilitada / Inbucket local | **Habilitada** |
| Detección de entorno | Sin variables de Vercel ⇒ `development` ⇒ **muestra distintivo** | `production` ⇒ sin distintivo |
| Datos | Sintéticos | Reales |

### 4.3 `supabase/config.toml` propuesto

**NOT CREATED.** Contenido propuesto, a revisar antes de escribirlo. Nótese que `config.toml`
**no** está en `.gitignore`, así que se versiona y lo comparte todo el equipo.

```toml
# NOT EXECUTED / NOT CREATED — propuesta para revisión
project_id = "trazaloop-local"

[db]
port = 54322
major_version = 17          # igualar a Production (17.6.1.147)

[api]
port = 54321
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**"]
enable_confirmations = false   # DIFERENCIA deliberada con Production

[studio]
port = 54323

[inbucket]
port = 54324                   # captura de correo local
```

**Decisión abierta:** `major_version = 17` debe igualar a Production para que el entorno local
reproduzca su comportamiento. Conviene confirmar que el CLI 2.114.0 soporta esa versión en local.
→ **DR-15**.

### 4.4 Procedimiento propuesto

```bash
# ═══════════════ TODO NOT EXECUTED ═══════════════

# Paso 0 · DESVINCULAR de producción ANTES de nada más.
#          Es el primer paso por seguridad, no por orden lógico.
supabase unlink

# Paso 1 · Crear config.toml (contenido de §4.3), revisado y aprobado.

# Paso 2 · Arrancar Supabase local (Docker).
supabase start
#   Imprime API URL, anon key y service_role key LOCALES.
#   Son claves de desarrollo, no secretos de producción.

# Paso 3 · Aplicar las 102 migraciones desde cero.
supabase db reset
#   db reset es DESTRUCTIVO — y aquí es exactamente lo que se quiere:
#   recrea la base local y aplica 0001…0110 en orden.

# Paso 4 · Escribir .env.local apuntando a LOCAL.
#          Hacer copia de seguridad del actual primero, fuera del repo.
cp .env.local ~/trazaloop-env-backup-$(date +%Y%m%d).bak
cp .env.example .env.local
#   y rellenar con los valores que imprimió `supabase start`:
#     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key local>
#     SUPABASE_SECRET_KEY=<service_role key local>
#     ACTIVE_ORG_COOKIE_SECRET=$(openssl rand -base64 32)
#     NEXT_PUBLIC_SITE_URL=http://localhost:3000
#     TEXTILES_MODULE_ENABLED=true
#     PUBLIC_REGISTRATION_ENABLED=true
#     SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Paso 5 · Verificar presencia y coherencia de variables.
npm run precheck:env

# Paso 6 · Levantar la aplicación.
npm run dev

# Paso 7 · Registrar el primer usuario por UI (/register).
#          El correo se captura en Inbucket (http://127.0.0.1:54324).

# Paso 8 · Promover ese usuario a superadministrador (única vía posible).
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "insert into platform_staff (user_id, role_code, status)
   select id, 'superadmin', 'active' from profiles where email = 'TU_CORREO_LOCAL';"
```

### 4.5 Riesgo específico de aplicar las migraciones en local

Las migraciones 0016, 0049, 0058, 0076, 0099 y 0101 crean políticas sobre `storage.objects`. En
Supabase gestionado, el esquema `storage` pertenece al proveedor: 0099 y 0101 documentan que
`comment on policy … on storage.objects` **falla** con `must be owner of relation objects`
(SQLSTATE 42501), y por eso esos comentarios se omiten.

En local, el CLI ejecuta como superusuario, de modo que puede comportarse **de forma distinta**.
Un `supabase db reset` que pase limpio en local **no demuestra** que pase en un proyecto
gestionado. Es la razón por la que staging no es opcional: es el único entorno donde una migración
se valida bajo las mismas restricciones de propiedad que producción.

### 4.6 Smoke test local

Se **reutiliza** `npm run test:smoke`, que ya está escrito para funcionar contra local o staging y
verifica variables, conexión, tablas y vistas, RLS conductual, bucket de evidencias, metodología
activa y semillas de diagnóstico.

Comprobaciones adicionales propuestas para demostrar que local reproduce la fundación
(§10 detalla los criterios de aceptación):

```bash
# NOT EXECUTED
npm run precheck:env            # presencia de variables
npm run test:smoke              # fundación operativa
npm run typecheck               # compilación
npm run test:plans              # lógica de planes
npm run test:trazadocs          # motor documental
```

---

## 5. Staging Supabase creation procedure (DR-14)

**Base:** `docs/STAGING_DEPLOYMENT.md` ya describe el procedimiento en 18 secciones. Este plan
**no lo reescribe**: lo referencia y corrige sus tres desactualizaciones (§1.4).

### 5.1 Correcciones que deben aplicarse a esa guía

1. §8 — el rango es **`0001` … `0110`** (102 migraciones), no `0001…0069`.
2. §11 — usar los nombres vigentes `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.
3. §11 — añadir `TEXTILES_MODULE_ENABLED` y `PUBLIC_REGISTRATION_ENABLED`, obligatorias según
   `.env.example`.

### 5.2 Procedimiento propuesto

```bash
# ═══════════════ TODO NOT EXECUTED ═══════════════

# Paso 1 · Crear el proyecto en supabase.com
#   Nombre sugerido: trazaloop-staging
#   Región: la MISMA que producción (aws-1-us-west-2) para igualar latencia
#           y versión de motor.
#   PostgreSQL: 17.x, igual que producción.
#   Guardar la contraseña de BD en el gestor de secretos del equipo.
#   → anotar <ref-staging>

# Paso 2 · Aplicar las 102 migraciones — CON REF EXPLÍCITO, sin vincular.
supabase db push --project-ref <ref-staging>

# Paso 3 · Verificar semillas y buckets (SQL Editor de Supabase, solo lectura)
#   select count(*) from frameworks;                -- ≥ 1
#   select count(*) from diagnostic_questions;      -- 52
#   select count(*) from material_classifications;  -- 10
#   select count(*) from calculation_methodologies; -- ≥ 1 activa
#   select id, public from storage.buckets;         -- 3 buckets, todos public = false
#   select count(*) from pg_tables where schemaname='public';  -- 87

# Paso 4 · Auth (panel, manual — no lo cubren las migraciones)
#   Authentication → URL Configuration:
#     Site URL: https://<staging>.vercel.app
#     Additional Redirect URLs: https://<staging>.vercel.app/**
#   Authentication → Providers → Email → Confirm email = ENABLED
#     (igual que producción; es el único mecanismo de confirmación)

# Paso 5 · Vercel — entorno Preview
#   Settings → Environment Variables, ámbito Preview:
#     NEXT_PUBLIC_SUPABASE_URL=https://<ref-staging>.supabase.co
#     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon de staging>
#     SUPABASE_SECRET_KEY=<secret de staging>
#     ACTIVE_ORG_COOKIE_SECRET=<NUEVO, distinto de producción>
#     NEXT_PUBLIC_SITE_URL=https://<staging>.vercel.app
#     TEXTILES_MODULE_ENABLED=true
#     PUBLIC_REGISTRATION_ENABLED=true
#     NEXT_TELEMETRY_DISABLED=1

# Paso 6 · Verificar el entorno antes de desplegar
npm run precheck:env -- --env=preview --expect-project-ref=<ref-staging>

# Paso 7 · Desplegar Preview y correr el smoke
npm run test:smoke

# Paso 8 · Primer superadministrador de staging (SQL directo, igual que local)

# Paso 9 · Datos mínimos de prueba — NUNCA copiados de producción
#   9a. Registrar usuario demo por UI.
#   9b. Crear organización demo por UI y copiar su id.
#   9c. Sembrar la cadena de prueba:
DEMO_ORGANIZATION_ID=<id> DEMO_USER_EMAIL=<correo> DEMO_USER_PASSWORD=<clave> \
  npm run seed:demo
```

### 5.3 Cómo se evitan datos reales de clientes

Regla absoluta: **staging no recibe jamás una copia de producción.** Ni `pg_dump` de datos, ni
restauración, ni exportación parcial, ni "solo unas tablas para probar".

Fundamentos, no solo prudencia: el paquete legal aprobado (`docs/legal/`) incluye política de
privacidad y adenda de tratamiento de datos; replicar datos de clientes en un entorno de prueba
sería un tratamiento no consentido. Además el baseline prohíbe el movimiento silencioso de datos
entre ámbitos (§38: *no silent cross-tenant data movement*).

Los datos de staging se generan con `seed:demo`, que además **respeta RLS** por diseño: inicia
sesión como el usuario demo con la clave anónima en lugar de usar `service_role`, de modo que
ejercita el mismo camino que la aplicación real.

`cleanup:staging` queda disponible para vaciar staging entre ciclos. Es dry-run por defecto y
fail-closed, y **nunca se ha ejecutado**.

---

## 6. Environment variable matrix

Presencia y origen. **Ningún valor aparece en esta tabla.**

| Variable | LOCAL | STAGING (Preview) | PRODUCTION |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<ref-staging>.supabase.co` | `https://mvmpadeixomwkpxbnhky.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | de `supabase start` | de staging | de producción |
| `SUPABASE_SECRET_KEY` | de `supabase start` | de staging | de producción |
| `ACTIVE_ORG_COOKIE_SECRET` | propio de desarrollo | **propio, distinto** | **propio, distinto** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | URL de Preview | dominio real |
| `TEXTILES_MODULE_ENABLED` | `true` | `true` | `true` |
| `PUBLIC_REGISTRATION_ENABLED` | `true` | `true` | `false` (hito técnico) |
| `NEXT_TELEMETRY_DISABLED` | `1` | `1` | `1` |
| `SUPABASE_DB_URL` | local, en `.env.local` | **no configurar** | **solo temporal en el puesto del operador**; retirar tras usar |
| `VERCEL_TARGET_ENV` / `VERCEL_ENV` | ausentes ⇒ `development` | `preview` | `production` |
| Distintivo de ambiente en UI | "Entorno local" | "Ambiente staging" | ninguno |

**Nombres heredados.** El código acepta `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` como respaldo. Las instalaciones nuevas (local y staging) deben usar
los nombres vigentes. Production usa hoy los heredados; migrarlos es una decisión aparte
(→ **DR-16**) y **no debe hacerse en el mismo cambio** que la creación de staging.

---

## 7. Migration promotion workflow

```text
   ┌─────────────┐   supabase db reset      valida: sintaxis, orden,
   │   LOCAL     │ ─────────────────────►   constraints, triggers, RLS
   └──────┬──────┘   npm run test:smoke
          │          npm run test:all
          │
          │ ✅ verde y revisión de código
          ▼
   ┌─────────────┐   supabase db push --project-ref <ref-staging>
   │   STAGING   │ ─────────────────────►   valida bajo las MISMAS
   └──────┬──────┘   npm run test:smoke      restricciones de propiedad
          │          npm run test:rls         que producción
          │
          │ ✅ verde + APROBACIÓN HUMANA EXPLÍCITA
          ▼
   ┌─────────────┐   procedimiento aprobado (§9.4)
   │ PRODUCTION  │ ─────────────────────►   npm run verify:prod
   └─────────────┘                          smoke manual
```

**Sin saltos.** Una migración que no ha pasado por staging no llega a producción. Esta regla es la
razón de ser de todo el sprint: sin staging, la primera migración de Quality se estrenaría en la
base de clientes.

**Antes de cada promoción:**

```bash
# NOT EXECUTED
npm run precheck:env -- --env=preview    --expect-project-ref=<ref-staging>
npm run precheck:env -- --env=production --expect-project-ref=mvmpadeixomwkpxbnhky
```

---

## 8. Storage / Auth considerations

### 8.1 Storage

- Los **3 buckets los crean las migraciones** (0015, 0049, 0058). No hay paso manual, y por tanto
  no hay riesgo de que staging quede con buckets distintos de producción.
- Los tres son **privados**. Verificable con `select id, public from storage.buckets`.
- Las políticas sobre `storage.objects` **sí** dependen de permisos del esquema `storage`: es la
  diferencia entre local y gestionado descrita en §4.5, y la razón por la que staging es
  obligatorio.
- Estado final esperado: **9 políticas** (verificado en producción en Q0.1). Staging debe alcanzar
  exactamente ese número.
- **No existe política de `DELETE` ni `UPDATE`** en `evidences` ni `trazadocs-documents`. Si en
  staging apareciera alguna, sería señal de que se creó algo fuera de migración.

### 8.2 Auth

- El trigger `on_auth_user_created` (0004) vive sobre `auth.users` y viaja en las migraciones.
- **Manual en cada proyecto gestionado** (no lo cubren las migraciones):
  - *Site URL* y *Additional Redirect URLs* — sin esto, el restablecimiento de contraseña, las
    invitaciones y la compartición de pasaportes generan enlaces inválidos.
  - **Confirm email = enabled** — crítico. `docs/STAGING_DEPLOYMENT.md` §9 lo advierte: Trazaloop
    **no implementa** confirmación de correo propia y depende por completo de este ajuste. Sin él,
    un registro público obtendría sesión completa sin confirmar el correo.
- En local no aplica: Inbucket captura el correo y la confirmación se deshabilita a propósito.
- El **primer superadministrador** requiere SQL directo en los tres entornos, por diseño de 0040.

---

## 9. Guardrails against accidental Production changes

Cinco capas, de la más simple a la más fuerte. Ninguna implementada.

### 9.1 Capa 1 — Desvincular producción del puesto de trabajo

La medida de mayor efecto y menor coste.

```bash
# NOT EXECUTED
supabase unlink
```

Sin vínculo, `supabase db push` **no tiene destino** y falla en lugar de acertar en producción.
Todo comando remoto pasa a exigir `--project-ref` explícito, lo que convierte el destino en una
decisión consciente y visible en la línea de comandos.

### 9.2 Capa 2 — Guion envolvente con lista de denegación

Propuesta: `scripts/db/guarded-push.sh` (**NOT CREATED**).

```bash
#!/usr/bin/env bash
# NOT EXECUTED / NOT CREATED — propuesta
set -euo pipefail
PRODUCTION_REF="mvmpadeixomwkpxbnhky"
TARGET_REF="${1:-}"

if [ -z "$TARGET_REF" ]; then
  echo "ABORTADO: falta --project-ref explícito." >&2
  echo "Uso: npm run db:push -- <project-ref>" >&2
  exit 2
fi

if [ "$TARGET_REF" = "$PRODUCTION_REF" ]; then
  if [ "${ALLOW_PRODUCTION_MIGRATION:-}" != "I_UNDERSTAND_THIS_IS_PRODUCTION" ]; then
    echo "═══════════════════════════════════════════════════════════" >&2
    echo " ABORTADO: destino = PRODUCCIÓN ($PRODUCTION_REF)."          >&2
    echo " Las migraciones de producción siguen el procedimiento"      >&2
    echo " aprobado. Ver docs/quality/q0/Q0_2_ENVIRONMENT_SAFETY_PLAN" >&2
    echo "═══════════════════════════════════════════════════════════" >&2
    exit 3
  fi
  read -r -p "Escribe el nombre del proyecto para confirmar: " TYPED
  [ "$TYPED" = "trazaloop-production" ] || { echo "ABORTADO." >&2; exit 4; }
fi

supabase db push --project-ref "$TARGET_REF"
```

Doble barrera para producción: variable de entorno con valor literal poco tecleable por accidente,
más confirmación escrita del nombre del proyecto.

### 9.3 Capa 3 — Comprobación previa por entorno

`precheck-env.ts` **ya implementa** `--expect-project-ref` y falla si no coincide. No hay que
construirlo: hay que **usarlo** como paso obligatorio antes de cualquier promoción, e integrarlo
en los scripts de npm.

### 9.4 Capa 4 — Procedimiento de promoción a producción

Ninguna migración de producción se ejecuta desde un puesto de desarrollo por iniciativa
individual. Secuencia obligatoria (baseline §38, Maestro §56):

```text
PRECHECK  →  BACKUP / PLAN DE ROLLBACK  →  MIGRACIÓN  →  SMOKE  →  VALIDACIÓN
```

con aprobación humana explícita registrada antes de la migración.

### 9.5 Capa 5 — CI/CD (recomendado, no imprescindible para arrancar)

Migraciones de producción ejecutadas **solo** desde un workflow de GitHub Actions con un
*Environment* protegido que exija revisor. Beneficios: el secreto de producción vive en el
entorno protegido y no en portátiles; queda registro de quién aprobó y cuándo; y desaparece la
posibilidad del comando accidental.

→ **DR-17**: decidir si se adopta ahora o después del primer corte de Quality.

### 9.6 Lo que NO funciona como guardrail

Conviene decirlo para que nadie lo intente:

- **Un alias de shell** que envuelva `supabase` — solo protege a quien lo configuró, no al equipo.
- **Versionar `supabase/.temp/`** — está en `.gitignore` por buenas razones (contiene estado local
  y una URL con credencial). No debe versionarse.
- **Confiar en `config.toml`** — `project_id` no impide que `--project-ref` apunte a otro sitio.

---

## 10. Smoke tests

### 10.1 Smoke de LOCAL — criterios de aceptación

Demuestra que el entorno local reproduce la fundación de Trazaloop.

| # | Comprobación | Criterio | Herramienta |
|---|---|---|---|
| 1 | Variables presentes y coherentes | exit 0 | `npm run precheck:env` |
| 2 | Conexión API y BD | OK | `npm run test:smoke` |
| 3 | **87 tablas** en `public` | exactamente 87 | SQL |
| 4 | **33 vistas** | exactamente 33 | SQL |
| 5 | **RLS en 87/87** | ninguna sin RLS | SQL sobre `pg_class.relrowsecurity` |
| 6 | 3 buckets, los 3 privados | `public = false` | SQL |
| 7 | Semillas | 52 preguntas · 10 clasificaciones · marcos ≥ 1 · metodología activa | `npm run test:smoke` |
| 8 | RLS conductual | un cliente anónimo no lee filas | `npm run test:smoke` |
| 9 | Compilación | sin errores | `npm run typecheck` |
| 10 | Registro por UI | usuario creado, correo en Inbucket | manual |
| 11 | Crear organización | `create_organization` funciona; quedan `core` + 2 módulos en Demo 48 h | manual |
| 12 | Aislamiento multiempresa | A ve A, A no ve B, A no edita B | `npm run test:rls` contra local |

**Criterio de cierre de DR-13:** 1–12 en verde.

### 10.2 Smoke de STAGING — criterios adicionales

Todo lo anterior, más lo que solo un proyecto gestionado puede demostrar:

| # | Comprobación | Criterio |
|---|---|---|
| 13 | Las 102 migraciones aplican en un proyecto **gestionado** | `db push` sin errores de propiedad (§4.5) |
| 14 | **9 políticas** sobre `storage.objects` | exactamente 9 |
| 15 | Auth configurado | Site URL, redirects y **Confirm email habilitado** |
| 16 | Restablecimiento de contraseña | el enlace llega y funciona |
| 17 | Flujo de invitación | invitar → aceptar → membresía activa |
| 18 | Subida de evidencia | intent → subida → verificación → finalización |
| 19 | Distintivo de ambiente | la UI muestra "Ambiente staging" |
| 20 | Cadena demo completa | `seed:demo` termina sin errores |

**Criterio de cierre de DR-14:** 13–20 en verde.

---

## 11. Rollback strategy

| Escenario | Rollback |
|---|---|
| `supabase/config.toml` incorrecto | Borrar el archivo. No afecta a ningún entorno remoto. |
| Local roto | `supabase stop --no-backup` + `supabase db reset`. Es desechable por definición. |
| `.env.local` mal configurado | Restaurar desde la copia de `~/trazaloop-env-backup-<fecha>.bak` (paso 4 de §4.4). |
| Staging con migraciones fallidas | Es un proyecto desechable: borrarlo y recrearlo, o usar `cleanup:staging`. **Nunca** intentar `migration repair`. |
| Desvinculación indeseada | `supabase link --project-ref <ref>` restaura el vínculo. Reversible. |
| Guardrail demasiado restrictivo | Los guiones son archivos del repositorio: revertir el commit. |
| **Migración ya aplicada en producción** | **No hay rollback automático.** Cada migración lleva su rollback documentado en el encabezado; se aplica como migración nueva y aditiva, jamás editando la desplegada. Esta es la razón de que staging exista. |

**Este sprint no tiene rollback que ejecutar: no ha cambiado nada.**

---

## 12. Exact implementation sequence

Orden propuesto. Cada fase termina en un punto verificable.

| # | Fase | Acción | Resultado esperado | Riesgo |
|---|---|---|---|---|
| **0** | Aprobación | Revisar este plan; resolver DR-15…DR-17 | Plan aprobado | — |
| **1** | DR-02 | Verificación manual en el panel de Vercel (§3) | `EXISTS` / `MISSING` + confirmación del ref de Supabase en Production | Ninguno (solo lectura) |
| **2** | Seguridad | `supabase unlink` | El puesto deja de apuntar a producción | Ninguno; reversible |
| **3** | Local | `config.toml` + `supabase start` + `db reset` | 102 migraciones aplicadas en local | Bajo; desechable |
| **4** | Local | Reescribir `.env.local` (con copia previa) | App funcionando en local | Bajo; copia de seguridad |
| **5** | Local | Smoke 1–12 | **DR-13 cerrada** | — |
| **6** | Guardrails | `guarded-push.sh` + scripts npm | Producción protegida | Bajo |
| **7** | Docs | Corregir las 3 desactualizaciones de `STAGING_DEPLOYMENT.md` | Guía fiable | Ninguno |
| **8** | Staging | Crear proyecto + `db push --project-ref` | 102 migraciones en un proyecto gestionado | Medio — §4.5 |
| **9** | Staging | Auth + buckets + variables de Vercel Preview | Preview operativo | Bajo |
| **10** | Staging | Smoke 13–20 + `seed:demo` | **DR-14 cerrada** | — |
| **11** | Cierre | Actualizar Q0 y este documento con los resultados | Entornos seguros | — |

**Solo al completar la fase 11 puede diseñarse la primera migración de Quality.**

Las fases 1 y 2 son independientes del resto y pueden hacerse de inmediato; la 2 es la de mayor
reducción de riesgo por unidad de esfuerzo de todo el plan.

---

## 13. Proposed commands — NOT EXECUTED

Recopilación única. **Ninguno se ha ejecutado.**

```bash
# ══════════════════════════════════════════════════════════
#  TODOS LOS COMANDOS: NOT EXECUTED
# ══════════════════════════════════════════════════════════

# ── Fase 2 · Seguridad inmediata ──
supabase unlink

# ── Fase 3 · Local ──
# (crear supabase/config.toml según §4.3)
supabase start
supabase db reset

# ── Fase 4 · Entorno local ──
cp .env.local ~/trazaloop-env-backup-$(date +%Y%m%d).bak
cp .env.example .env.local
openssl rand -base64 32            # para ACTIVE_ORG_COOKIE_SECRET local

# ── Fase 5 · Smoke local ──
npm run precheck:env
npm run test:smoke
npm run typecheck
npm run test:rls

# ── Fase 8 · Staging ──
supabase db push --project-ref <ref-staging>

# ── Fase 9 · Verificación de staging ──
npm run precheck:env -- --env=preview --expect-project-ref=<ref-staging>

# ── Fase 10 · Smoke y datos de staging ──
npm run test:smoke
DEMO_ORGANIZATION_ID=<id> DEMO_USER_EMAIL=<correo> DEMO_USER_PASSWORD=<clave> npm run seed:demo

# ── Verificación de producción (solo lectura, cuando corresponda) ──
npm run verify:prod
npm run precheck:env -- --env=production --expect-project-ref=mvmpadeixomwkpxbnhky

# ══════════════════════════════════════════════════════════
#  PROHIBIDOS SIN PROCEDIMIENTO APROBADO
#    supabase db push          (sin --project-ref explícito)
#    supabase db reset         (contra cualquier remoto)
#    supabase migration repair (en cualquier circunstancia)
#    vercel env pull           (sobre Production)
#    cualquier copia de datos de Production a Staging
# ══════════════════════════════════════════════════════════
```

---

## 14. Risks

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-1 | `db push` accidental contra producción antes de instalar guardrails | Media | **Crítico** | Fase 2 (`unlink`) primero; es el paso de mayor retorno |
| R-2 | Migraciones que pasan en local pero fallan en gestionado (§4.5) | **Media** | Alto | Staging obligatorio; nunca promover de local a producción |
| R-3 | Pérdida del `.env.local` actual | Baja | Bajo | Copia previa fuera del repositorio (fase 4) |
| R-4 | Staging con versión de PostgreSQL distinta de producción | Media | Medio | Fijar 17.x explícitamente al crear el proyecto |
| R-5 | Olvidar *Confirm email* en staging | Media | Medio | Punto 15 del smoke |
| R-6 | Alguien copia datos de producción a staging "para probar" | Baja | **Crítico** (legal) | Prohibición explícita §5.3; `seed:demo` como única vía |
| R-7 | `ACTIVE_ORG_COOKIE_SECRET` compartido entre entornos | Media | Alto | Matriz §6; `.env.example` ya lo advierte |
| R-8 | Production apunta al proyecto retirado | **Desconocida** | **Crítico** | Se descarta en la fase 1 (§3) |
| R-9 | Coste del proyecto Supabase adicional | Alta | Bajo | Decisión de negocio → DR-18 |
| R-10 | `config.toml` versionado con puertos que chocan en otras máquinas | Media | Bajo | Puertos por defecto del CLI; documentar cómo sobrescribir |
| R-11 | El plan se aplica a medias y queda un estado híbrido | Media | Medio | Secuencia §12 con puntos verificables; no saltar fases |

---

## 15. Decisions still requiring human approval

| ID | Decisión | Bloquea |
|---|---|---|
| **DR-02** | Ejecutar la verificación manual del panel (§3) y registrar `EXISTS`/`MISSING`. Además, confirmar a qué proyecto Supabase apunta Production | Fase 1 |
| **DR-02a** | ¿Se instala el CLI de Vercel para automatizar verificaciones futuras, o basta el panel? Recomendación: **basta el panel** | Fase 1 |
| **DR-13** | Aprobar el procedimiento local (§4) y el contenido de `config.toml` (§4.3) | Fase 3 |
| **DR-14** | Aprobar la creación de staging (§5): nombre, región, versión de PostgreSQL | Fase 8 |
| **DR-15** | **NUEVA.** Confirmar `major_version = 17` en `config.toml` y que el CLI 2.114.0 lo soporta en local | Fase 3 |
| **DR-16** | **NUEVA.** ¿Se migran los nombres de variable heredados a los vigentes en Production? Debe ser un cambio **separado** de la creación de staging | Posterior |
| **DR-17** | **NUEVA.** ¿Se adopta CI/CD con *Environment* protegido para migraciones de producción ahora, o tras el primer corte de Quality? | Fase 6 |
| **DR-18** | **NUEVA.** Aprobación del coste del proyecto Supabase adicional para staging | Fase 8 |
| **DR-19** | **NUEVA.** ¿Quién puede aprobar una promoción a producción? Definir el rol antes de que exista la primera migración de Quality | Fase 6 |
| **DR-03 … DR-12** | Sin cambios; abiertas desde Q0 | Q1/Q2 |

---

## 16. Confirmación de no intervención

- **Cero** proyectos Supabase creados.
- **Cero** cambios de enlace, `.env`, Vercel, Production, Storage, Auth, migraciones, Git o DNS.
- **Cero** `db push`, `db reset`, `migration repair`, despliegues.
- **Cero** commits, **cero** push.
- **Cero** comandos de §13 ejecutados.
- Todo el trabajo de este sprint fue **lectura del repositorio** para fundamentar el plan.
