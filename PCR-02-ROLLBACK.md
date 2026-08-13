# PCR-02 — ROLLBACK

> **⚠ SUSTITUIDO POR PCR-02.1.** El plan vigente es
> `docs/PCR-02.1-ROLLBACK.md` (incorpora el trigger §2b de reasignación y la
> restauración de `v_implementation_next_actions` desde 0065). Se conserva
> como registro.

Plan de reversión. La 0104 no transforma datos existentes, pero la tabla
nueva SÍ acumula datos de negocio (consumos internos registrados tras el
despliegue): revertirla los pierde. Por eso el camino por defecto es
**revertir solo la aplicación**.

---

## 0. Rollback de la aplicación (camino por defecto)

Revertir el deploy a v1.0.1 (Vercel → redeploy anterior / revert del merge).
**La app v1.0.1 funciona con la 0104 aplicada**: la tabla nueva le es
invisible y `v_output_batch_completeness` conserva su contrato de columnas.
Efecto: se pierde la UX nueva, pero los consumos internos ya registrados
permanecen en BD intactos para cuando se re-despliegue. Ningún dato queda
inconsistente.

## 1. Política anti-drift (heredada de PCR-01.1)

Una vez que la 0104 esté **aplicada y registrada** por Supabase:

- **Si solo falla la app** → paso 0 y dejar la 0104 aplicada. Por defecto.
- **Si de verdad hay que revertir el ESQUEMA** → crear en ese momento una
  **MIGRACIÓN COMPENSATORIA 0105+** con el contenido del §2, para que la
  reversión quede registrada y todos los entornos converjan.
- El SQL manual del §2 queda reservado como respuesta de **emergencia**; si
  se usa, reconciliar de inmediato creando la 0105 equivalente.
- **Nunca** eliminar ni renumerar el archivo 0104 del repositorio (rompería
  los candados de integridad de las suites).
- La 0105 compensatoria NO se crea ahora: no existe un rollback real.

## 2. Contenido de la reversión de esquema (solo si se decide)

⚠ `drop table` **elimina los consumos internos registrados** desde el
despliegue. Es una pérdida de datos de trazabilidad: decisión expresa del
cliente, jamás automática. Exportar antes:

```sql
copy (select * from public.output_batch_consumption) to stdout with csv header;
```

Reversión (en una migración compensatoria 0105+, o manual solo en emergencia):

```sql
-- 1) Restaurar la vista de completitud con la definición de 0026
--    (copiar el bloque create or replace view v_output_batch_completeness
--    del archivo supabase/migrations/0026_traceability_views.sql — es la
--    fuente exacta de la versión anterior).

-- 2) Retirar el consumo interno
drop trigger if exists t_output_batch_consumption_no_self on public.output_batch_consumption;
drop function if exists public.output_batch_consumption_no_self();
drop table if exists public.output_batch_consumption;
```

Orden importante: la vista PRIMERO (deja de referenciar la tabla), la tabla
después. Las políticas RLS y los triggers estándar caen con la tabla.

Nota: si se restaura la vista de 0026 pero se conserva la tabla (reversión
parcial), la app v1.0.1 y la PCR-02 siguen funcionando; solo cambia que los
lotes cuyas órdenes consumen únicamente intermedios volverán a mostrarse
«incomplete: consumos de lotes de entrada» — el falso negativo que 0104
corrige.

## 3. Reversión funcional selectiva (sin tocar BD)

- **Solo la alerta 72 h**: es constante de dominio
  (`lib/domain/production-alerts.ts`); un valor altísimo la neutraliza. No
  requiere BD.
- **Solo la guarda de órdenes cerradas**: revertir
  `assertOrderAcceptsMutations` en `server/actions/traceability.ts` (cambio
  de app, sin BD).
- **Solo el Bloque G** (reponer la creación general de lotes): revertir la
  página de lotes producidos (cambio de app; la acción
  `createOutputBatchAction` sigue soportando ambos flujos).

## 4. Qué NO revertir

- Migraciones 0001–0103: no fueron modificadas; no tocar.
- Datos: PCR-02 no alteró filas existentes; no ejecutar ningún
  UPDATE/DELETE «compensatorio» sobre tablas previas.

## 5. Verificación post-rollback de esquema

```sql
select count(*) from information_schema.tables
 where table_name = 'output_batch_consumption';                        -- 0
select count(*) from pg_proc
 where proname = 'output_batch_consumption_no_self';                   -- 0
-- La vista responde y conserva sus columnas:
select * from public.v_output_batch_completeness limit 1;
```

Smoke mínimo: abrir el listado de órdenes y un lote producido, crear un
consumo externo, y verificar Textiles.
