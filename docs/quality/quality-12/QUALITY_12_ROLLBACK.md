# QUALITY-12 · Rollback

## 1 · Apagarlo, que casi siempre es suficiente

```sql
update quality_ai_settings set is_enabled = false
 where organization_id = '<empresa>';
```

Desde ese instante esa empresa no tiene Copilot: la pantalla lo explica y no se
llama a ningún proveedor. Nada de lo consultado se pierde, y el resto de
Trazaloop no se entera.

Más fino, sin apagarlo del todo:

```sql
update quality_ai_settings
   set allow_people = false,        -- se deja de mirar competencias
       allow_customer = false,      -- se deja de leer comentarios
       allow_drafts = false,        -- se dejan de guardar borradores
       monthly_run_limit = 0        -- o directamente a cero
 where organization_id = '<empresa>';
```

## 2 · Apagarlo para toda la instalación

Basta con **quitar la credencial** del entorno (`QUALITY_AI_API_KEY`). El
Copilot pasa al doble determinístico, la pantalla dice que no hay proveedor
configurado, y nada se rompe. Es un cambio de variable, no un despliegue de
código.

## 3 · Revertir el código

```bash
git revert 36d24a6
```

Desaparecen: la entrada «Copilot» del menú, la pantalla, los botones
contextuales de siete entidades y las tres exportaciones. Las tablas siguen ahí
con sus datos.

**El orden importa**: revertir el código sin revertir la migración no rompe
nada; al revés sí, porque la pantalla llamaría a funciones que ya no existen.

## 4 · Revertir el esquema

**No se recomienda.** Apagar consigue lo mismo sin destruir el registro de qué
se preguntó y con qué se respondió, que es justamente lo que permite auditar el
uso de IA.

Si aun así se quisiera, en una migración nueva (0133) y en este orden:

```sql
drop view  if exists public.v_quality_ai_suggestion_overview;
drop view  if exists public.v_quality_ai_run_overview;
drop view  if exists public.v_quality_campaign_comments;
drop table if exists public.quality_ai_feedback;
drop table if exists public.quality_ai_suggestions;
drop table if exists public.quality_ai_run_references;
drop table if exists public.quality_ai_runs;
drop table if exists public.quality_ai_sessions;
drop table if exists public.quality_ai_sources;
drop table if exists public.quality_ai_settings;
-- y las once funciones `quality_ai_*`
```

Los dos catálogos transversales (`work_events`) quedaron **ampliados**, no
estrechados: los dos tipos nuevos y el dominio `ai` pueden quedarse sin efecto
alguno. Quitarlos exigiría comprobar que ninguna fila los usa.

## 5 · Qué no se pierde nunca

Las consultas y los borradores no se borran: un disparador lo impide. Son la
explicación de qué se preguntó, con qué contexto, con qué modelo y qué se
propuso — y de si alguien lo aceptó.

Retirar datos de prueba se hace **lógicamente**: apagar la empresa, descartar
los borradores con su motivo. Nunca aflojando una restricción.

## 6 · Lo que QUALITY-12 no puede haber roto

Ninguna función, tabla, política o pantalla de QUALITY-01…11.1 se modificó,
salvo tres cosas, todas aditivas:

- siete pantallas ganaron un **enlace** a `/quality/copilot`;
- el menú de Calidad ganó un grupo;
- `work_events` admite dos tipos y un dominio más.

Si el Copilot desapareciera mañana, el sistema de gestión seguiría exactamente
igual. Que es, en el fondo, lo que este sprint tenía que garantizar.
