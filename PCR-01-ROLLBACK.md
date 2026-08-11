# PCR-01 — ROLLBACK

Plan de reversión del Sprint PCR-01. La migración 0103 **no escribe, borra ni
transforma datos de negocio**, por lo que el rollback es puramente funcional
(definiciones de funciones/trigger) y no requiere restaurar datos. Ejecutar
solo ante una decisión explícita; cada paso es independiente y puede aplicarse
de forma selectiva.

---

## 0. Rollback de la aplicación (primero)

Revertir el deploy de la app a la versión previa (v1.0.0) por el mecanismo de
la plataforma (Vercel → redeploy del build anterior / revert del merge de
`feature/pcr-01-hardening`). La app v1.0.0 **funciona con la 0103 aplicada**
(no conoce la RPC nueva y la RPC de aceptación conserva firma y mensajes), así
que la app puede revertirse sin tocar la base si el problema es solo de UI.

## 1. Revertir la corrección del bug 16 (restaura el comportamiento previo)

⚠️ Esto REINTRODUCE el bug Demo→Full de invitaciones. Solo si la corrección
causara un problema mayor.

1. Restaurar la definición previa de la RPC ejecutando el bloque
   `create or replace function public.accept_team_invitation(p_token text) …`
   **tal como está en el repositorio en**
   `supabase/migrations/0056_accept_invitation_plan_checks.sql`
   (es la fuente exacta de la versión anterior; mismo cuerpo y mensajes).
2. Eliminar las funciones nuevas (ningún objeto del esquema depende de ellas
   una vez restaurada la RPC):

```sql
drop function if exists public.get_organization_effective_plan(uuid);
drop function if exists public.organization_effective_plan_code(uuid);
```

3. Lado servidor: al revertir la app (paso 0), `checkFeatureEnabled` /
   `checkResourceLimit` vuelven a resolver con el plan legacy. Si solo se
   revierte la BD y se conserva la app nueva, `getOrganizationEffectivePlanCode`
   queda **fail-closed a 'demo'** ante el error de la RPC ausente: seguro
   (jamás amplía permisos), pero restrictivo — revertir app y BD juntas.

## 2. Revertir la cantidad obligatoria (punto 10 + PCR-01.1)

El trigger cubre INSERT y UPDATE (PCR-01.1). Su reversión completa:

```sql
drop trigger if exists t_input_batches_require_quantity on public.input_batches;
drop function if exists public.input_batches_require_quantity();
```

- El CHECK histórico de 0025 (`null or > 0`) permanece: se vuelve exactamente
  al comportamiento previo (cantidad opcional en BD).
- Lado app: la validación del formulario/importación exige cantidad hasta que
  se revierta la app (paso 0). Ambas capas son independientes y seguras en
  cualquier orden.
- Los lotes creados durante la vigencia de la regla conservan su cantidad —
  no hay nada que limpiar.

## 3. Revertir el renombrado PCR (solo si se exige)

Es un cambio de literales de UI: se revierte con el revert del merge (paso 0).
No existe migración asociada (no se tocó `modules.name` ni los seeds legales).

## 3b. PCR-01.1 — Política contra el drift del historial de migraciones

El rollback de la APLICACIÓN (paso 0: redeploy/revert en Vercel) no toca la
base y puede usarse libremente. Para el ESQUEMA, una vez que la 0103 haya
sido **aplicada y registrada por Supabase**, rige esta regla:

- **Si solo falla la app** → revertir la app y DEJAR la 0103 aplicada (la app
  v1.0.0 es compatible con ella, ver paso 0). Es el camino por defecto.
- **Si de verdad hay que revertir la BD** → crear en ese momento una
  **MIGRACIÓN COMPENSATORIA nueva** (0104+) que contenga los `drop`/`create
  or replace` de los pasos 1–2, de modo que la reversión quede registrada en
  el historial de migraciones y todos los entornos converjan.
- El **SQL manual** de los pasos 1–2 y 5 queda reservado como respuesta de
  EMERGENCIA; si se usa, debe **reconciliarse de inmediato** con el historial
  creando la migración compensatoria equivalente (misma semántica, aplicada
  como no-op donde el manual ya corrió).
- La migración compensatoria NO se crea ahora: no existe un rollback real y
  la 0103 aún no ha sido desplegada. Este documento solo fija la regla.
- **Nunca** eliminar ni renumerar el archivo 0103 del repositorio.

## 4. Qué NO revertir

- **Migraciones históricas 0001–0102**: no fueron modificadas; no tocar.
- **Datos**: PCR-01 no alteró datos; no ejecutar ningún UPDATE/DELETE
  «compensatorio».
- **Archivo 0103 del repositorio**: aunque se revierta su efecto en la BD con
  los pasos 1–2, el archivo debe permanecer en el historial de migraciones del
  repo; una reversión posterior a producción se documenta como decisión
  operativa (no renumerar ni eliminar el archivo — rompería los candados de
  integridad de las suites).

## 5. Verificación post-rollback

```sql
-- La RPC volvió a la fuente legacy
select pg_get_functiondef('public.accept_team_invitation(text)'::regprocedure)
  like '%organization_effective_plan_code%';   -- false tras el paso 1

-- Funciones nuevas eliminadas
select count(*) from pg_proc
 where proname in ('organization_effective_plan_code','get_organization_effective_plan');  -- 0

-- Trigger eliminado
select count(*) from pg_trigger
 where tgrelid = 'public.input_batches'::regclass
   and tgname = 't_input_batches_require_quantity';   -- 0
```

Smoke mínimo tras revertir: iniciar sesión, crear un lote de entrada sin
cantidad (debe aceptarse de nuevo) y poner en NULL la cantidad de un lote de
prueba vía UPDATE (debe aceptarse de nuevo: la protección PCR-01.1 quedó
revertida), invitar en una empresa Full legacy
(volverá a fallar si su `organization_subscriptions` sigue en demo — es el bug
original reintroducido, esperado) y abrir Textiles.
