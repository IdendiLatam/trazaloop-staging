# QUALITY-07 · Reversión

## 1 · Lo primero: por qué casi nunca hace falta

La migración 0125 es **puramente aditiva**. No borra ninguna tabla, ninguna
columna ni ningún dato. Lo único que modifica de lo existente son:

- dos columnas nuevas y **opcionales** en `suppliers` y `textile_suppliers`;
- restricciones de catálogo cerrado en `work_tasks`, `work_alerts`,
  `work_events`, `work_decisions`, `work_references` y
  `quality_risk_methodologies`, **ensanchadas**: ningún valor anterior
  desaparece;
- `quality_deletion_eligibility`, que añade la rama `'supplier'`;
- `quality_derive_level`, que gana una comprobación de pertenencia por delante.

Con QUALITY-07 apagado a nivel de producto, nada de eso cambia el comportamiento
de PCR, de Textiles ni de QUALITY-01…06.1.

## 2 · Reversión a nivel de producto (recomendada)

Quitar el grupo `QUALITY_PROVEEDORES_GROUP` de `lib/modules/registry.ts` y
retirar el despliegue Preview. Las rutas dejan de estar en el menú; los datos
siguen ahí y no se pierde nada.

Coste: un despliegue. Riesgo: ninguno.

## 3 · Reversión de esquema (solo si es imprescindible)

**No se hace editando 0125.** Se escribe una migración `0126` que deshaga lo
que haga falta, en este orden:

```sql
-- 1 · Los disparadores y las funciones del dominio
drop trigger if exists t_quality_supplier_delete_guard on public.quality_supplier_profiles;
drop function if exists public.quality_supplier_delete_guard();
-- … el resto de funciones quality_supplier_* y quality_*_supplier_*

-- 2 · Las vistas
drop view if exists public.v_quality_approved_supplier_list;
drop view if exists public.v_quality_supplier_overview;
drop view if exists public.v_quality_supplier_scope_status;

-- 3 · Las tablas, de hoja a raíz
--    resultados → evaluaciones → criterios → versiones → plantillas
--    factores → criticidad
--    decisiones · documentos · incidentes · señales
--    asignaciones de requisito → requisitos
--    asignaciones de categoría → alcances → categorías
--    perfiles → contactos → sedes → papeles → empresas externas

-- 4 · El puente (esto SÍ pierde el enlace; los proveedores no se tocan)
alter table public.suppliers         drop column if exists external_party_id;
alter table public.textile_suppliers drop column if exists external_party_id;
```

**Lo que NO se debe deshacer:**

- el ensanche de los catálogos cerrados del motor de trabajo. Devolverlos a su
  lista anterior rompería cualquier fila que ya use un valor nuevo, y esas filas
  existen en Staging.
- `quality_derive_level`. La comprobación de pertenencia que 0125 le añadió
  cierra un agujero real de QUALITY-05; quitarla sería reabrirlo.
- la rama `'supplier'` de `quality_deletion_eligibility`, que devuelve
  `not_found` sin daño si las tablas ya no existen.

## 4 · Lo que se pierde

| Qué | Se pierde con la reversión de esquema |
|---|---|
| Proveedores, sedes, contactos, categorías | sí |
| Criticidades, evaluaciones, decisiones | sí |
| Incidentes, documentos, señales | sí |
| Proveedores de PCR y Textiles | **no** — solo el enlace |
| Casos abiertos desde incidentes | **no** — quedan sin referencias |
| Tareas y alertas del dominio | **no** — quedan huérfanas de asunto |

Por eso la reversión a nivel de producto es casi siempre la correcta.

## 5 · Production

No aplica. Production está en 0111 y nunca ha visto ninguna migración de
QUALITY-01…07.
