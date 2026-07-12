# Trazaloop · Despliegue en staging (Supabase Cloud + Vercel)

Guía paso a paso para dejar Trazaloop probable, desplegable y demostrable en
nube. Nada de esta guía cambia la lógica normativa de cálculo ni las reglas
de defendibilidad.

## 1. Requisitos

- Node **20.9+** (`node -v`)
- Git
- Cuenta de GitHub
- Cuenta de Supabase (proyecto nuevo para staging)
- Cuenta de Vercel

## 2. Clonar o abrir el proyecto

```bash
git clone https://github.com/TU_USUARIO/trazaloop.git
cd trazaloop
```

## 3. Instalar dependencias

```bash
npm ci
```

## 4. Crear `.env.local`

```bash
cp .env.example .env.local
```

Completa los valores (los encuentras en Supabase → Project Settings → API):

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon key pública, siempre protegida por RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: **solo** para scripts/tests administrativos
  (smoke, RLS); jamás en código de la app ni en el navegador.
- `ACTIVE_ORG_COOKIE_SECRET`: secreto de firma de la cookie de empresa activa.
  Genera uno fuerte con:

  ```bash
  openssl rand -base64 32
  ```

- `NEXT_PUBLIC_SITE_URL`: URL de la app en local (`http://localhost:3000`) o
  en staging (`https://tu-proyecto.vercel.app`). Cuando apunta a Vercel, la
  app muestra el badge «Ambiente staging».

## 5. Validar en local

```bash
npm run typecheck
npm run build
npm run lint
```

o todo junto: `npm run test:all` (suites sin BD) y `npm run predeploy`
(incluye el build).

## 6. Subir a GitHub

```bash
git init            # si aún no es repo
git add .
git commit -m "Trazaloop staging"
git remote add origin https://github.com/TU_USUARIO/trazaloop.git
git push -u origin main
```

Verifica que **no** se suban `.env.local`, `node_modules`, `.next` ni
`tsconfig.tsbuildinfo` (ya están en `.gitignore`). Si `tsconfig.tsbuildinfo`
quedó trackeado de antes:

```bash
git rm --cached tsconfig.tsbuildinfo
```

## 7. Crear el proyecto Supabase

En [supabase.com](https://supabase.com): New project → región cercana →
contraseña de BD fuerte (guárdala: la pide `db push`).

## 8. Aplicar migraciones

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

`TU_PROJECT_REF` es el identificador del proyecto (Settings → General). Deben
aplicarse las migraciones `0001` … `0032` en orden.

Verifica las semillas en el SQL Editor de Supabase:

```sql
select count(*) from frameworks;                 -- marcos normativos
select count(*) from diagnostic_questions;       -- 52
select count(*) from material_classifications;   -- 10
select count(*) from calculation_methodologies;  -- ≥ 1 (RC-6632-15343 activa)
select id, public from storage.buckets where id = 'evidences';  -- public = false
```

## 9. Configurar bucket y Auth

- **Bucket**: la migración `0015` crea `evidences` privado con políticas por
  organización. Confírmalo con la consulta anterior (`public = false`).
- **Auth**: Authentication → URL Configuration:
  - *Site URL*: `https://tu-proyecto.vercel.app`
  - *Additional Redirect URLs*: agrega `http://localhost:3000/**` para
    desarrollo y `https://tu-proyecto.vercel.app/**`.

## 10. Crear el proyecto en Vercel

Import Git Repository → selecciona el repo → framework Next.js (autodetectado).

## 11. Environment variables en Vercel

Settings → Environment Variables (entornos Production y Preview):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ACTIVE_ORG_COOKIE_SECRET
NEXT_PUBLIC_SITE_URL
```

`NEXT_PUBLIC_SITE_URL` = la URL que Vercel asigna al proyecto.

## 12. Deploy

Deploy desde Vercel (o `git push`, que dispara el build). El build termina
solo: no necesita conectarse a Supabase (las rutas protegidas son dinámicas).

## 13. Probar login

Abre la app → `/register` → crea un usuario → revisa el correo si la
confirmación está activa → inicia sesión.

## 14. Probar organización

Crea la organización (p. ej. **Demo Plásticos**) y verifica que el shell
carga con la empresa activa.

## 15. Probar el flujo demo

Dos opciones:

**A. Flujo manual guiado** (recomendado la primera vez — usa la sección
*Flujo guiado* de la app como mapa):

1. Registrar usuario. 2. Crear organización **Demo Plásticos**. 3. Crear
proveedor **Recicladora Demo**. 4. Crear material **PCR Demo**
(postconsumo). 5. Cargar evidencia de origen. 6. Validar la evidencia
(admin/calidad). 7. Crear lote de entrada. 8. Crear orden. 9. Registrar
consumo. 10. Crear lote de salida. 11. Registrar composición.
12. Calcular. 13. Abrir dossier. 14. Abrir flujo guiado.

**B. Seed demo por script** (opcional; NUNCA automático, NUNCA en producción):

```bash
DEMO_ORGANIZATION_ID=<uuid de tu organización> \
DEMO_USER_EMAIL=demo@tudominio.com \
DEMO_USER_PASSWORD=xxxx \
npm run seed:demo
```

El script inicia sesión **como el usuario demo** (sin `service_role`: aplican
RLS y triggers reales), exige `DEMO_ORGANIZATION_ID` explícito, verifica la
membresía y solo inserta en esa organización. Crea proveedor, materiales,
evidencia validada, producto (declara 60 %), cadena completa balanceada y el
cálculo por la misma RPC de la app; al final imprime las URLs del flujo
guiado y del dossier. El usuario demo debe registrarse antes desde la UI
(crear usuarios de Auth por SQL no es práctico ni recomendable).

## 16. Correr smoke test

```bash
npm run test:smoke
```

Verifica variables, conexión, migraciones (tablas y vistas clave), RLS activo
(chequeo conductual con anon), y —con `SUPABASE_SERVICE_ROLE_KEY` como
herramienta administrativa— bucket privado, metodología activa y semillas.

## 17. Correr test RLS

### Cómo ejecutar test:rls contra staging

```bash
cp .env.example .env.local
# llenar variables del proyecto de staging
npm run test:rls
```

> **Advertencia:** este test crea usuarios, organizaciones y datos de prueba.
> Ejecutarlo solo en ambiente staging o local, **nunca en producción con
> datos reales**. Debe correrse antes de cualquier salida a producción.

Los 40 casos cubren aislamiento multiempresa, inmutabilidad de snapshots, el
motor de cálculo, agregaciones, soporte técnico y el flujo guiado. Los
chequeos a nivel de BD (barrido de RLS y triggers) requieren además
`SUPABASE_DB_URL`.

## 18. Troubleshooting

### 18.1 Git pide usuario y contraseña

GitHub ya no acepta la contraseña normal por HTTPS. Crea un **Personal Access
Token** (GitHub → Settings → Developer settings → Tokens) y pégalo cuando Git
pida el *password*.

### 18.2 `supabase db push` falla

- Proyecto no vinculado → `npx supabase link --project-ref TU_PROJECT_REF`.
- Contraseña de BD incorrecta → usa la del paso 7 (o resetéala en Settings →
  Database).
- Migración aplicada parcialmente → revisa `supabase migration list` y el
  error SQL exacto; no edites migraciones antiguas, corrige hacia adelante.
- SQL incompatible → verifica que el proyecto sea Postgres 15+.

### 18.3 El build en Vercel falla por variables

- Revisa Settings → Environment Variables (¿están en el entorno correcto?).
- **Redeploy** después de cambiar variables (no se aplican al build anterior).
- Verifica `NEXT_PUBLIC_SITE_URL`.

### 18.4 El login redirige mal

Supabase → Authentication → URL Configuration: revisa **Site URL** y
**Additional Redirect URLs** (deben incluir tu dominio de Vercel y, para
desarrollo, `http://localhost:3000/**`).

### 18.5 Las evidencias no suben

- ¿Existe el bucket `evidences`? (migración 0015)
- ¿Es privado? (debe serlo)
- ¿Las storage policies están aplicadas? (mismas migraciones)
- ¿El archivo excede el límite del plan?
- ¿Hay sesión de usuario activa?

### 18.6 La app no muestra datos

- ¿Hay organización activa seleccionada? (cookie `tz-active-org`)
- ¿El usuario tiene **membresía activa** en esa organización?
- RLS filtra por membresía: sin membership no hay filas (correcto).
- Borra cookies y vuelve a seleccionar empresa si cambiaste de proyecto.

### 18.7 El build se queda colgado

No debe pasar (corregido en Sprint 3.1). Si reaparece, revisa:

- llamadas a Supabase en **top-level** de módulos (prohibidas);
- rutas protegidas sin `export const dynamic = "force-dynamic"`;
- server actions importadas incorrectamente en Client Components.
