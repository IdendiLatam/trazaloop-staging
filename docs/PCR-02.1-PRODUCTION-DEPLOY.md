# Trazaloop · PCR-02.1 — Guía de despliegue a producción

> **SUSTITUIDO POR PCR-02.2** — la guía vigente es `docs/PCR-02.2-PRODUCTION-DEPLOY.md` (incorpora el trigger de protección del historial de órdenes y la completitud fail-closed). Este documento se conserva como historial del sprint PCR-02.1.


Supuestos (§46): Production está en **v1.0.1** (0103 aplicada); la **0104
nunca fue aplicada**; PCR-02/PCR-02.1 **no está desplegado**; el staging de
Supabase puede estar pausado; el despliegue será **manual y controlado** por
el cliente. **Ninguno de estos pasos fue ejecutado en este sprint.**

Se despliega: el código del ZIP `trazaloop-sprint-PCR-02.1.zip` + **una**
migración (`0104`, ya corregida). Sustituye a la guía PCR-02: la 0104 que se
aplica es la de ESTE paquete.

---

## 1. Auditoría read-only en Production

```sql
-- Dimensiona la alerta 72 h y la guarda de estados
select status, count(*),
       count(*) filter (where created_at < now() - interval '72 hours') as abiertas_72h
  from public.production_orders group by status;

-- Órdenes con varias salidas (cardinalidad ya existente)
select production_order_id, count(*) from public.output_batches
 group by production_order_id having count(*) > 1 order by count(*) desc limit 20;

-- Definición vigente de las vistas que 0104 reemplaza (respaldo funcional)
select pg_get_viewdef('public.v_output_batch_completeness'::regclass, true);
select pg_get_viewdef('public.v_implementation_next_actions'::regclass, true);
```

Nada modifica datos. Guardar la salida de los `pg_get_viewdef` junto al
backup (además, las definiciones previas viven en los archivos 0026 y 0065
del repositorio).

## 2. Backup

Backup completo del proyecto Supabase (dashboard → Database → Backups o
`pg_dump`) inmediatamente antes de aplicar la 0104.

## 3. Integración del código + prechecks (local/CI)

Desde el tag `v1.0.1` (commit `da36ddf`), rama `feature/pcr-02-1-hardening`;
volcar el ZIP (no incluye `.git`/`node_modules`/artefactos; **sí**
`.env.example`); revisar el diff contra la lista de archivos del informe.
`package.json` sigue en `"version": "1.0.0"` por instrucción. Ejecutar:

```bash
npm ci && npm run typecheck && npm run lint && npm run build && npm run test:all
```

Todo debe terminar EXIT 0 (en este sprint: 1482 verificaciones).

## 4. Dry-run en QA (recomendado)

En un proyecto Supabase de QA: aplicar la 0104, desplegar la app, ejecutar
las suites `test:rls`/`test:smoke` del repo, opcionalmente
`npm run test:pcr02-1-db` contra un PostgreSQL local del equipo, y los
escenarios BLOCKED de `docs/PCR-02.1-TEST-MATRIX.md`. El smoke funcional
mínimo es el §7 de esta guía.

## 5. Aplicar la migración 0104 en Production

Aditiva: tabla nueva vacía + 2 triggers + RLS + reemplazo de 2 vistas
conservando columnas. No borra ni transforma datos.

```bash
supabase db push        # o el pipeline de migraciones del equipo
```

**Orden seguro: primero la migración, luego la app** (§47, ver compat
abajo). La app nueva NO debe desplegarse antes que la migración.

## 6. Validaciones PostgreSQL post-migración

```sql
select relrowsecurity from pg_class
 where oid = 'public.output_batch_consumption'::regclass;               -- true
select count(*) from pg_policies where tablename = 'output_batch_consumption'; -- 4
select tgname from pg_trigger
 where tgrelid = 'public.output_batch_consumption'::regclass and not tgisinternal; -- 5
select tgname from pg_trigger
 where tgrelid = 'public.output_batches'::regclass
   and tgname = 't_output_batches_protect_reassignment';                -- 1
select prosecdef from pg_proc where proname = 'output_batch_consumption_no_self'; -- false (INVOKER)
select column_name from information_schema.columns
 where table_name = 'v_output_batch_completeness' order by ordinal_position; -- 19 columnas, mismas
-- En registros de PRUEBA: autoconsumo → mensaje pactado; lote de otra
-- empresa o uuid inexistente → «El lote producido no existe o no pertenece
-- a tu empresa.»; reasignar un lote consumido → mensaje del §2b.
select action_code from public.v_implementation_next_actions limit 5;   -- responde
```

## 7. Deployment Vercel aislado (preview) + smoke

Deploy de preview con las env vars de producción de solo-app (sin promover).
Smoke (~25 min):

1. **Eje**: listado → «Abrir orden» → detalle completo; `?order=<id>` legado
   redirige.
2. **Punto 14**: crear orden → aterriza en consumos con los textos pactados;
   consumo externo → «Consumo registrado correctamente.»
3. **Salidas**: registrar 2 lotes desde la orden (sin re-preguntar la
   orden); contador «2 salidas».
4. **Interno**: orden B consume el intermedio de A (chip verde, enlace a la
   productora); en A, «Consumido después en: OP-B».
5. **Cerrada (PCR-02.1)**: cerrar la orden B → desaparecen TODOS los
   formularios y botones Eliminar; la nota de modo consulta/auditoría es
   visible; por API, borrar un consumo responde «La orden está cerrada…».
6. **Reasignación (PCR-02.1)**: editar el lote intermedio consumido → la
   orden productora aparece fija con la explicación; forzar por API el
   cambio → mensaje del §2b.
7. **Selectores (PCR-02.1)**: con >20 lotes, el detalle muestra «Mostrando
   20 de N» y la búsqueda por código filtra; genealogía busca y los enlaces
   `?output=` siguen funcionando.
8. **Completitud (PCR-02.1)**: lote final con cadena interna documentada →
   completo; con orden intermedia sin consumos → incompleto («información de
   proveedor»).
9. **Implementación (PCR-02.1)**: empresa con orden solo-interna no recibe
   «Registrar consumo».
10. **Regresión**: cantidad obligatoria, evidencias («Ir al registro»),
    dossier «Producción interna (OP-x)», reciclado y Textiles.

## 8. Promoción

Promover el deployment validado por el pipeline habitual. Sin variables de
entorno nuevas.

## 9. Post-smoke en producción

Repetir los pasos 1, 2, 5 y 9 del smoke con datos reales mínimos. Vigilar
las primeras 24 h: errores `23514` (autoconsumo/reasignación por
integraciones), `23503` (borrado de lote consumido), y el pico inicial de
alertas 72 h en empresas con órdenes antiguas abiertas (comportamiento
correcto — comunicar que cerrar/cancelar apaga la alerta; ahora, además,
cerrar la orden la deja en modo consulta).

## 10. Rollback

`docs/PCR-02.1-ROLLBACK.md`. Camino por defecto: revertir SOLO la app (la
v1.0.1 convive con la 0104 aplicada). Reversión de esquema únicamente por
migración compensatoria 0105+ escrita en ese momento (anti-drift).

## Compatibilidad en caliente (§47)

Con la 0104 aplicada y la app v1.0.1 aún sirviendo: la tabla nueva y el
trigger §2b le son invisibles (v1.0.1 no reasigna lotes con consumidores
porque no existen consumos internos aún, y cualquier UPDATE legítimo de
v1.0.1 no cambia `production_order_id` de lotes consumidos — la tabla nace
vacía); `v_output_batch_completeness` conserva las 19 columnas y, sin filas
internas, su cierre recursivo devuelve exactamente la semántica anterior
(cierre = la propia orden); `v_implementation_next_actions` conserva
contrato y, sin filas internas, la CTE `not exists` es equivalente al
`left join … is null` anterior. Ventana segura verificada por diseño y por
las suites de contrato.
