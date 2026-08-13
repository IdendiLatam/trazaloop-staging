# PCR-02 — PRODUCTION DEPLOY

> **⚠ SUSTITUIDO POR PCR-02.1.** No usar esta guía: el despliegue vigente es
> `docs/PCR-02.1-PRODUCTION-DEPLOY.md` (la 0104 corregida añade el trigger
> §2b y la vista de implementación; el smoke incluye los escenarios de
> hardening). Se conserva como registro.

Procedimiento para desplegar PCR-02 cuando el cliente lo decida. **Nada de
este sprint se ha ejecutado contra producción, Vercel ni Git.**

Contenido: código de la rama de integración (desde
`trazaloop-sprint-PCR-02.zip`) + **una** migración nueva
(`0104_pcr02_internal_consumption_and_completeness.sql`). Producción hoy:
v1.0.1 con 0103 aplicada.

---

## 0. Integración del código (local del cliente)

1. Desde el tag `v1.0.1` (commit `da36ddf`, working tree limpio), crear la
   rama `feature/pcr-02-order-hub` (o la convención del equipo).
2. Volcar el contenido del ZIP sobre el working tree (el ZIP no incluye
   `.git`, `node_modules`, `.next`, `.vercel`, `supabase/.temp` ni
   configuración local; **sí incluye `.env.example`**, igual que la base —
   verifica el diff antes de commitear).
3. Revisar `git status`/`git diff` contra la lista de archivos del informe
   (PCR-02-IMPLEMENTATION-REPORT.md §7). `package.json` sigue en
   `"version": "1.0.0"` por instrucción del cliente: NO ajustarlo dentro de
   este sprint.

## 1. Prechecks (obligatorios, en local/CI)

```bash
npm ci
npm run typecheck
npm run lint
npm run build          # next build --webpack
npm run test:all       # debe terminar EXIT 0 (en esta base quedó 1460 en verde)
```

Cualquier error detiene el despliegue.

## 2. Validación QA previa (recomendada antes de producción)

En un proyecto Supabase de QA con la app desplegada: ejecutar los escenarios
**BLOCKED** de PCR-02-TEST-MATRIX.md (secciones A6, B3, C2–C3, C7–C9, D7,
E4–E5, F4, G2) y las suites `test:rls` / `test:smoke`. El guion funcional
mínimo es el smoke del §7 de este documento.

## 3. Auditoría previa en producción (SOLO LECTURA)

```sql
-- Estado de órdenes (dimensiona el efecto de la alerta 72 h y la guarda H)
select status, count(*),
       count(*) filter (where created_at < now() - interval '72 hours') as abiertas_72h
  from public.production_orders
 group by status;

-- Órdenes con varias salidas (cardinalidad 1→N ya existente)
select production_order_id, count(*)
  from public.output_batches
 group by production_order_id
having count(*) > 1
 order by count(*) desc limit 20;
```

Ninguna modifica datos. La primera anticipa cuántas órdenes mostrarán la
alerta el día del despliegue (es esperable un pico inicial en empresas con
órdenes antiguas en borrador: es información correcta, no un error).

## 4. Respaldo

Backup completo del proyecto Supabase (dashboard → Database → Backups o
`pg_dump`) inmediatamente antes de aplicar 0104. La definición previa de
`v_output_batch_completeness` vive en el archivo 0026 del repositorio (pieza
de reversión funcional).

## 5. Aplicar la migración 0104

Aditiva: crea una tabla vacía + trigger + RLS y reemplaza una vista
conservando columnas. No borra ni transforma datos, no toca RLS existente.

```bash
supabase db push        # o el pipeline de migraciones del equipo
```

**Orden seguro (§24): primero la migración, luego la app.** La app v1.0.1
sigue funcionando con 0104 aplicada (la tabla nueva le es invisible y la
vista conserva su contrato); la app nueva NO debe desplegarse antes que la
migración (consulta `output_batch_consumption`).

Verificaciones post-migración:

```sql
select relrowsecurity from pg_class
 where oid = 'public.output_batch_consumption'::regclass;              -- true
select count(*) from pg_policies
 where tablename = 'output_batch_consumption';                         -- 4
select tgname from pg_trigger
 where tgrelid = 'public.output_batch_consumption'::regclass
   and not tgisinternal;                                               -- 5 filas
select column_name from information_schema.columns
 where table_name = 'v_output_batch_completeness'
 order by ordinal_position;                    -- mismas 19 columnas que antes
-- En un registro de PRUEBA: insertar consumo del lote de la MISMA orden →
-- 'Una orden no puede consumir un lote producido por ella misma.'
```

## 6. Despliegue de la aplicación

Deploy del build por el pipeline habitual (Vercel). Sin variables de entorno
nuevas (el umbral 72 h es constante de dominio, deliberadamente).

## 7. Smoke test funcional post-deploy (~20 min)

1. **Eje**: abrir el listado de órdenes → «Abrir orden» → el detalle carga
   con identificación, consumos y salidas. Un enlace antiguo
   `…/production-orders?order=<id>` redirige al detalle.
2. **Punto 14 conservado**: crear una orden → aterriza en «Materiales /
   lotes consumidos» del detalle con los dos textos pactados; registrar un
   consumo externo → «Consumo registrado correctamente.»
3. **Bloque B/C**: en el detalle, «Registrar lote producido» (sin select de
   orden) → el detalle vuelve mostrando la salida resaltada; registrar una
   SEGUNDA salida en la misma orden → contador «2 salidas».
4. **Bloques D/E**: crear la orden B; en sus consumos, subsección «Lotes
   producidos internos» → consumir el lote intermedio de la orden A →
   aparece con el chip verde y el enlace a la orden productora; en la orden
   A, la salida muestra «Consumido después en: OP-B (kg)». Intentar consumir
   en B un lote producido por B (vía API si se desea) → rechazo con el
   mensaje de autoconsumo.
5. **Bloque F**: Genealogía del lote FINAL → cadena completa Proveedor →
   Lote de entrada → Orden A → Lote intermedio → Orden B → Lote final; desde
   el lote de entrada, «Seguir el lote» llega al final.
6. **Bloques H/I**: poner la orden B en «Cerrada» → los formularios de
   consumo/salida desaparecen y la API rechaza con el mensaje de cerrada;
   una orden con >72 h abierta muestra el banner en el detalle, el chip en
   el listado y la línea del dashboard.
7. **Completitud**: un lote cuya orden solo consume intermedios NO aparece
   «incomplete» por falta de consumos.
8. **Regresión**: lotes de entrada (cantidad obligatoria), evidencias
   («Ir al registro» de una orden → detalle), reciclado, dossier de una
   orden con consumo interno («Producción interna (OP-A)»), y Textiles.

## 8. Monitoreo posterior

Primeras 24 h: errores 23514 en `output_batch_consumption` (autoconsumo por
integraciones), 23505 (duplicados), y quejas por la alerta 72 h en empresas
con backlog de órdenes en borrador (comunicar que cerrar/cancelar la orden
apaga la alerta).

## 9. Qué NO hace este despliegue

No modifica datos históricos ni hace backfill; no cambia el cálculo de
contenido reciclado; no altera planes, roles ni RLS existentes; no envía
correos ni programa tareas; no toca Textiles.
