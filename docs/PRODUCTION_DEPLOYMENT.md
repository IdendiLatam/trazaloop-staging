# Trazaloop · Despliegue en producción

Guía para llevar Trazaloop v0.5.x (fase piloto) a un proyecto de producción.
Complementa `docs/STAGING_DEPLOYMENT.md` (misma mecánica) con los cuidados
propios de producción. **Regla de oro:** en producción no se ejecutan
`test:rls` ni `seed:demo` (crean datos de prueba); las verificaciones son de
solo lectura (`npm run verify:prod`).

## 1. Crear el proyecto Supabase de PRODUCCIÓN

- Proyecto **separado** del de staging (nunca compartir base).
- Región cercana a la empresa piloto; contraseña de BD fuerte y guardada en
  un gestor de secretos.
- Plan con backups automáticos diarios (ver `docs/BACKUP_RESTORE.md`).

## 2. Aplicar migraciones

```bash
npx supabase link --project-ref REF_DE_PRODUCCION
npx supabase db push
```

Deben aplicar `0001 … 0032` en orden. Verifica el estado con
`npx supabase migration list`.

## 3. Verificar semillas

```bash
npm run verify:prod
```

Si reporta semillas faltantes (preguntas/clasificaciones/metodología):

```bash
npm run repair:seeds
```

(Idempotente, no borra nada; requiere `SUPABASE_DB_URL` del proyecto de
producción en `.env.local`. Retira esa variable del archivo al terminar.)

## 4. Configurar Auth de producción

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://app.tudominio.com` (o el dominio productivo).
- **Additional Redirect URLs**: solo el dominio productivo con `/**`. NO
  dejar `localhost` ni dominios de staging.
- Revisar plantillas de correo (remitente y textos) y, si aplica, SMTP
  propio.
- Confirmación de correo: activada.

## 5. Variables de entorno en Vercel (Production)

Settings → Environment Variables, entorno **Production** únicamente:

```
NEXT_PUBLIC_SUPABASE_URL        → URL del proyecto de PRODUCCIÓN
NEXT_PUBLIC_SUPABASE_ANON_KEY   → anon key de PRODUCCIÓN
SUPABASE_SERVICE_ROLE_KEY       → service key de PRODUCCIÓN (solo scripts)
ACTIVE_ORG_COOKIE_SECRET        → secreto NUEVO (openssl rand -base64 32);
                                  distinto del de staging
NEXT_PUBLIC_SITE_URL            → https://app.tudominio.com
```

Con `NEXT_PUBLIC_SITE_URL` productivo (sin `vercel.app` ni `staging`), el
badge «Ambiente staging» desaparece automáticamente.

Redeploy después de configurar variables.

## 6. Verificación final (solo lectura)

```bash
npm run verify:prod
```

Chequea: conexión (API y SQL), migraciones (tablas y vistas clave), semillas
(52 preguntas, 10 clasificaciones, metodología RC-6632-15343 v1 activa),
bucket `evidences` privado, y **RLS activo de verdad** (`pg_class`) más el
chequeo conductual con anon. Cualquier ❌ bloquea el despliegue.

Después, el recorrido manual de `docs/PILOT_QA_CHECKLIST.md` con un usuario
real del piloto.

## 7. Qué NO ejecutar en producción

- `npm run test:rls` (crea usuarios y datos de prueba) → solo staging/local.
- `npm run seed:demo` (datos demo) → solo staging.
- Nunca borrar ni editar migraciones aplicadas: corregir siempre hacia
  adelante con una migración nueva.

## 8. Rollback mínimo

- **App (Vercel):** Deployments → despliegue anterior → *Promote to
  Production*. Instantáneo y sin tocar datos.
- **Variables:** si un cambio de variables rompió el build/login, restaurar
  el valor anterior y redeploy.
- **Base de datos:** las migraciones no se revierten en caliente. Ante un
  problema de datos: 1) congelar escrituras (avisar al piloto), 2) evaluar
  restauración desde backup (ver `docs/BACKUP_RESTORE.md` — restaurar a un
  proyecto NUEVO y validar antes de apuntar la app), 3) corregir hacia
  adelante con migración nueva cuando sea posible; es casi siempre
  preferible a restaurar.
- Registrar todo incidente y su resolución antes de reabrir el piloto.
