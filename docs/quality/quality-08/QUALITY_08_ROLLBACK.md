# QUALITY-08 · Reversión

## 1 · Por qué casi nunca hace falta

La migración 0126 es **puramente aditiva**. No borra ninguna tabla, ninguna
columna ni ningún dato. Lo único que modifica de lo existente son:

- una columna nueva y **opcional** en `customer_requirements`;
- restricciones de catálogo cerrado en `work_tasks`, `work_alerts`,
  `work_events`, `work_decisions` y `work_references`, **ensanchadas**: ningún
  valor anterior desaparece;
- `quality_deletion_eligibility`, que añade dos entidades y **conserva** las dos
  comprobaciones heredadas;
- `quality_native_source_keys` y `quality_native_source_value`, que ganan cuatro
  fuentes y conservan las cinco que había.

Con QUALITY-08 apagado a nivel de producto, nada de eso cambia el comportamiento
de PCR, de Textiles ni de QUALITY-01…07.

## 2 · Reversión a nivel de producto (recomendada)

Quitar `QUALITY_VOZ_CLIENTE_GROUP` de `lib/modules/registry.ts` y retirar el
despliegue Preview. Las rutas dejan de estar en el menú; los datos siguen ahí.

**Y revocar los enlaces públicos vivos**, que es lo único con efecto hacia
fuera:

```sql
update quality_survey_invitations
   set status = 'revoked', revoked_at = now()
 where status = 'pending';
```

Coste: un despliegue. Riesgo: ninguno.

## 3 · Reversión de esquema (solo si es imprescindible)

**No se hace editando 0126.** Se escribe una `0127` que deshaga lo necesario, en
este orden:

```sql
-- 1 · Las dos puertas públicas, PRIMERO: mientras existan, la superficie
--     anónima sigue viva aunque el resto ya no esté.
drop function if exists public.quality_submit_survey_response(text, jsonb);
drop function if exists public.quality_resolve_survey_token(text);

-- 2 · Los disparadores y las demás funciones del dominio
drop trigger if exists t_quality_customer_delete_guard on public.quality_customer_profiles;
-- … el resto de quality_customer_* / quality_survey_*

-- 3 · Las vistas
drop view if exists public.v_quality_metric_series;
drop view if exists public.v_quality_customer_overview;
drop view if exists public.v_quality_campaign_summary;

-- 4 · Las tablas, de hoja a raíz
--    answers → responses → invitations → campaigns
--    metric_results → metric_definitions
--    questions → versions → surveys
--    signals · feedback · topics · voice_reviews · customer_profiles

-- 5 · El puente (pierde el enlace; PCR no se toca)
alter table public.customer_requirements drop column if exists external_party_id;
```

**Lo que NO se debe deshacer:**

- el ensanche de los catálogos cerrados del motor de trabajo — devolverlos a su
  lista anterior rompería cualquier fila que ya use un valor nuevo, y esas filas
  existen en Staging;
- las dos comprobaciones de `quality_deletion_eligibility` — vienen de
  QUALITY-03.1 y de QUALITY-06 y cierran agujeros reales;
- las cuatro fuentes nativas, si algún indicador ya las usa: quitarlas dejaría
  configuraciones que no saben calcularse. Retirar primero los indicadores.

## 4 · Lo que se pierde

| Qué | Se pierde con la reversión de esquema |
|---|---|
| Clientes, encuestas, versiones, campañas | sí |
| **Respuestas de clientes** | **sí — y no se pueden volver a pedir** |
| Métricas, señales, cierres de periodo | sí |
| Requisitos de cliente de PCR | **no** — solo el enlace |
| Casos abiertos desde quejas | **no** — quedan sin referencias |
| Tareas y alertas del dominio | **no** — quedan huérfanas de asunto |
| Indicadores configurados con fuentes de voz | **no** — pero dejan de calcularse |

Las respuestas son la razón de que la reversión a nivel de producto sea casi
siempre la correcta: lo que dijo un cliente es de las pocas cosas que un sistema
de gestión no puede volver a obtener.

## 5 · Production

No aplica. Production está en 0111 y nunca ha visto ninguna migración de
QUALITY-01…08.
