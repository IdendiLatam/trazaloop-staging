# PE-04 · Lo que hay que hacer en el corte de producción

Producción sigue en **0111** y no se ha tocado. Esto es lo que PE-06 tendrá que
ejecutar, en este orden. **Nada de esto se ha hecho ahora.**

## A · Comprobar que Producción sigue sin empresas de cliente

Inmediatamente **antes** de aplicar las migraciones comerciales. Toda la
migración de empresas de 0163 asume que no hay clientes reales que reinterpretar;
si los hubiera, la decisión cambia y hay que pararse.

```sql
select count(*) from public.organizations;   -- esperado: 0
```

## B · Retirar `qa-a@trazaloop-staging.local`

Sigue **activo a propósito** en Staging. Se retira durante el corte, y **solo
después** de verificar que existe el superadministrador humano previsto y que
puede entrar. La operación está escrita desde PE-03B4 y nunca se ha ejecutado.

## C · Conservar la atribución histórica

Retirar una cuenta no borra lo que hizo. Las revisiones publicadas, las
asignaciones, los eventos comerciales y las reclasificaciones guardan su actor.

## D · Verificar que no queda ninguna cuenta privilegiada de QA

```sql
select user_id, role_code, status from public.platform_staff where status = 'active';
```

Debe quedar exactamente el personal previsto. En local, tras toda la regresión de
PE-04, quedan **0**.

## E · Ejecutar el guardia de SEC-01

```sql
select n.nspname, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- esperado: 0 filas
```

Además, `0166` y `0167` llevan el preflight **dentro**: si alguna tabla llegara
sin RLS, la promoción se detiene sola y dice cuál.

## F · Reconciliar migraciones

Staging debe ir por delante y coincidir hasta la cabeza de release. Comprobar con
`supabase migration list --project-ref <ref>` que no hay ninguna migración remota
que no esté en el repositorio.

## G · Verificar la configuración de Producción por separado

Proveedor de IA, claves, buckets y variables de entorno. **No se copian
credenciales entre proyectos.** El catálogo comercial viaja en las migraciones;
las credenciales, no.

## H · Migración controlada de 0111 a la cabeza de release

Son **57** migraciones de salto. No es un `db push` a ciegas: hay que decidir
ventana, orden y verificación posterior. Y la corrección de SEC-01 (**0165**)
viaja por numeración **antes** de 0166 y 0167, de modo que Producción no puede
quedar abierta al uso con las siete tablas expuestas.

## Sobre la cadena que se promueve

Son **57** migraciones de salto desde 0111 hasta **0168**. La corrección de
SEC-01 (**0165**) viaja por numeración **antes** de 0166, 0167 y 0168, y las
cuatro últimas llevan el preflight que se niega a aplicarse sobre una base con
alguna tabla de `public` expuesta.

0168 incluye una **normalización idempotente** de asignaciones comerciales
solapadas: es un no-op donde no hubo defecto, y no borra ninguna fila.
