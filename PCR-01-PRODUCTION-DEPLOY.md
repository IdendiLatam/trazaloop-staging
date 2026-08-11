# PCR-01 — PRODUCTION DEPLOY

Guía de despliegue del Sprint PCR-01. **Nada de este sprint se ha ejecutado
contra producción**: este documento es el procedimiento para hacerlo de forma
controlada cuando el cliente lo decida.

Contenido a desplegar: código de la rama `feature/pcr-01-hardening` (integrada
desde el ZIP `trazaloop-sprint-PCR-01.zip`) + **una** migración nueva
(`0103_pcr01_effective_plan_and_input_batch_quantity.sql`).

---

## 0. Integración del código (local del cliente)

1. Desde `release/v1.0.0-prep` (tag `v1.0.0`, commit `9471bb8`, working tree
   limpio), crear/usar la rama `feature/pcr-01-hardening`.
2. Volcar el contenido del ZIP sobre el working tree (el ZIP no incluye
   `.git`, `.env*`, `node_modules`, `.next`, `.vercel`, `supabase/.temp` ni
   configuración local — sus archivos locales de entorno no se tocan).
3. Revisar el diff completo (`git status` / `git diff`) contra la lista de
   archivos del informe (PCR-01-IMPLEMENTATION-REPORT.md §10) antes de
   commitear. Confirmar que `.env`, `.env.local` y `.env.example` locales
   siguen intactos.

## 1. Prechecks (obligatorios, en local/CI)

```bash
npm ci
npm run typecheck
npm run lint
npm run build          # next build --webpack (configuración conservada)
npm run test:all       # con .env.example presente debe quedar TODO en verde
```

Criterio de bloqueo: cualquier error en estos comandos detiene el despliegue.

## 2. Auditoría de datos legacy (producción, SOLO LECTURA — antes de migrar)

Ejecutar en el SQL editor de producción las consultas documentadas en
`0103 §5` y archivar el resultado:

```sql
-- Volumen de lotes históricos sin cantidad, por empresa
select organization_id,
       count(*)                                        as total,
       count(*) filter (where quantity_kg is null)     as sin_cantidad,
       count(*) filter (where quantity_kg is not null) as con_cantidad
  from public.input_batches
 group by organization_id
 order by sin_cantidad desc;

-- Verificación de invariante previa (debe devolver 0 filas)
select id, batch_code, quantity_kg
  from public.input_batches
 where quantity_kg is not null and quantity_kg <= 0;
```

Estas consultas no modifican nada; sirven para acordar con las empresas la
corrección posterior de sus lotes sin cantidad (jamás se inventan datos).

## 3. Respaldo

1. Backup completo del proyecto Supabase de producción (dashboard → Database →
   Backups, o `pg_dump`) inmediatamente antes de aplicar la migración.
2. Conservar además el archivo fuente de la definición previa de
   `accept_team_invitation` (0056) — ya está en el repositorio; es la pieza de
   reversión funcional (ver PCR-01-ROLLBACK.md).

## 4. Aplicar la migración 0103

La migración es **aditiva**: no borra ni transforma datos, no toca RLS, no
cambia firmas de RPC existentes. Aplicarla con el flujo habitual del proyecto:

```bash
supabase db push        # o el pipeline de migraciones que use el equipo
```

Ventana recomendada: cualquiera de bajo tráfico. Impacto en caliente: el
reemplazo de `accept_team_invitation` es atómico; el trigger de cantidad
aplica a INSERTs nuevos y, en UPDATE, solo cuando `quantity_kg` cambia
(PCR-01.1) — editar otros campos de lotes históricos no se ve afectado.

## 5. Verificaciones post-migración (producción)

```sql
-- 1) Plan efectivo coherente (usar una empresa conocida en Full)
select public.organization_effective_plan_code('<uuid-org-en-full>');  -- 'full'

-- 2) Permisos correctos
select has_function_privilege('authenticated',
  'public.get_organization_effective_plan(uuid)', 'execute');           -- true
select has_function_privilege('authenticated',
  'public.organization_effective_plan_code(uuid)', 'execute');          -- false

-- 3) Trigger de cantidad instalado (INSERT y UPDATE — PCR-01.1)
select tgname, pg_get_triggerdef(oid) like '%INSERT OR UPDATE%' as cubre_update
  from pg_trigger
 where tgrelid = 'public.input_batches'::regclass
   and tgname = 't_input_batches_require_quantity';        -- 1 fila, true

-- 3b) Semántica UPDATE (PCR-01.1) sobre un lote de PRUEBA (no productivo):
--     update ... set quantity_kg = null  → debe fallar con el mensaje exacto
--     update ... set notes = 'x' en lote legacy NULL → debe pasar

-- 4) La RPC de aceptación quedó reemplazada (contiene la nueva fuente)
select pg_get_functiondef('public.accept_team_invitation(text)'::regprocedure)
  like '%organization_effective_plan_code%';                            -- true
```

## 6. Despliegue de la aplicación

Desplegar el build de la rama por el pipeline habitual (Vercel). No hay
variables de entorno nuevas. Orden seguro: **primero la migración 0103, luego
la app** (la app nueva llama la RPC `get_organization_effective_plan`; con la
app vieja, la 0103 es inocua).

## 7. Smoke test funcional post-deploy (manual, ~15 min)

1. **Bug 16**: con el superadmin, poner una empresa de prueba en Demo →
   verificar que invitar bloquea con el mensaje Demo; subir sus módulos a Full
   → invitar funciona de inmediato; el invitado acepta y entra; volver a Demo →
   se restringe de nuevo.
2. **Punto 10**: crear un lote de entrada sin cantidad → mensaje exacto; con
   cantidad → se crea, la vista aterriza en el lote resaltado (fijado aunque
   caiga fuera de la página 1 — PCR-01.1). Intentar editar un lote válido
   dejando la cantidad vacía → rechazado con el mismo mensaje. Importar un
   CSV con `quantity_kg` vacío → la validación lo rechaza con el mensaje
   canónico (PCR-01.1, importador real).
3. **Punto 14**: crear una orden → confirmación + sección «Materiales / lotes
   consumidos» abierta; registrar un consumo → confirmación.
4. **Punto 1/11**: abrir 👁 una evidencia con archivo; abrir «Utilizada en (n)»
   y usar «Ir al registro» hacia un proveedor/material que esté fuera de la
   página 1 del listado → debe verse EL registro fijado y resaltado
   (PCR-01.1).
5. **Punto 13**: editar una orden con variables legacy `{"clave": valor}` →
   se ven como filas; guardar → sin pérdida.
6. **Punto 9**: buscar y paginar en proveedores y lotes de entrada.
7. **Regresión**: entrar a Trazaloop Textiles y abrir un pasaporte técnico.
8. **Nomenclatura**: verificar «Trazaloop PCR» en landing, /modules, dashboard.

## 8. Monitoreo posterior

- Revisar logs de la aplicación y de Postgres las primeras 24 h buscando:
  errores 23514 en `input_batches` (INSERTs sin cantidad desde integraciones no
  contempladas) y excepciones de `accept_team_invitation`.
- Si aparece un volumen inesperado de rechazos por cantidad en importaciones,
  comunicar a las empresas la nueva regla (la plantilla CSV descargable ya la
  declara).

## 9. Qué NO hace este despliegue

- No modifica `organization_subscriptions` ni ningún dato de negocio.
- No cambia planes, precios ni crea estados comerciales.
- No publica versiones legales nuevas (la recomendación de renombrar el texto
  legal a PCR es una decisión separada, ver informe §8).


---

## PCR-01.1 — Correcciones de revisión independiente (impacto en el despliegue)

- La migración **0103 fue corregida ANTES de su primer despliegue** (nunca se
  aplicó a producción), por eso el ajuste del trigger vive en el mismo archivo
  0103 y NO existe una 0104. Si tu entorno QA hubiera aplicado la versión
  anterior de 0103, re-aplica el §4 (el `create or replace` + `drop/create
  trigger` son idempotentes) antes de continuar.
- El importador real de lotes (`server/actions/import.ts`) ahora rechaza
  `quantity_kg` vacío en validación y en la revalidación pre-commit: si alguna
  empresa usa CSVs con esa columna vacía, deberá completarla (la plantilla y
  la ayuda del wizard ya lo declaran).
- Verificación 3/3b de la sección 5 actualizada a la semántica INSERT/UPDATE.
