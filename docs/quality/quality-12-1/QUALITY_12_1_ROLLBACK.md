# QUALITY-12.1 · Cómo deshacer esto

Tres niveles, del más suave al más completo. Casi siempre basta el primero.

## Nivel 1 · Apagar el proveedor sin tocar nada

Borra `QUALITY_AI_API_KEY` en Vercel —o cambia `QUALITY_AI_PROVIDER` a
`fake`— y vuelve a desplegar.

El Copilot sigue en pie: responde solo con datos de Trazaloop, cita sus fuentes
y **dice en pantalla** que no hay proveedor configurado. No se pierde ni una
consulta guardada, ni un tema, ni una referencia. El resto de Calidad no se
entera.

Es la palanca correcta para: una factura que se dispara, un incidente del
proveedor, una duda sobre la clave, o simplemente querer parar.

## Nivel 2 · Apagar el Copilot para una empresa

En **Calidad → Copilot → Ajustes**, `is_enabled = false`. A partir de ahí no se
abre ninguna consulta —ni siquiera se llega a construir el contexto— y la
pantalla lo explica.

También se puede apagar solo un uso sensible: `allow_customer` deja de permitir
la voz del cliente, y con ella los temas.

## Nivel 3 · Retirar las migraciones 0134 y 0133

En ese orden: la 0134 primero, porque rehace objetos que la 0133 creó. La
operativa de la 0134 está en `QUALITY_12_1_MIGRATION_0134.md`.

### La 0133

Solo si hubiera que volver el esquema al estado de QUALITY-12. **No se puede
retirar la 0132**: está aplicada en Staging y la 0133 depende de ella.

```sql
begin;

-- 1 · Los objetos nuevos.
drop view if exists public.v_quality_ai_customer_theme_series;
drop function if exists public.quality_ai_resolve_customer_theme(uuid, text, text);
drop function if exists public.quality_ai_record_customer_theme(
  uuid, text, text, text, text, date, date, uuid[]);
drop table if exists public.quality_ai_customer_theme_evidence;
drop table if exists public.quality_ai_customer_themes;

-- 2 · La firma de cierre, de vuelta a la de la 0132.
drop function if exists public.quality_ai_complete_run(
  uuid, jsonb, text, integer, integer, integer, integer, integer, integer);
-- … y volver a crear aquí la versión de seis argumentos, copiada de la 0132.

-- 3 · Las columnas de consumo. OJO: esto BORRA lo ya medido.
alter table public.quality_ai_runs
  drop column if exists cached_input_tokens,
  drop column if exists reasoning_tokens,
  drop column if exists total_tokens;

commit;
```

**Antes de ejecutar el paso 3**, decide si de verdad quieres perder el detalle
de consumo ya registrado. Dejar las columnas ahí no molesta a nadie: código que
no las escribe las deja en null, que es lo que significan.

La clave única `quality_ai_run_references_org_id_uniq` puede quedarse: es
correcta por sí misma y no estorba.

## Nivel 4 · Retirar el código

La rama es `fix/quality-12-1-openai-live-provider`, sobre `383124d` (cierre de
QUALITY-12). Revertir el commit de implementación devuelve el código exacto de
QUALITY-12, con sus doce adaptadores y sus dos proveedores.

Si se revierte el código **sin** retirar la 0133, todo sigue funcionando: las
columnas y las tablas nuevas quedan sin usar. El orden inverso —retirar la 0133
dejando el código— **sí rompe**: el cierre de consulta llamaría a una firma que
ya no existe.

## Production

No hay nada que deshacer. Production sigue en la migración **0111**, sin
variables de IA, sin credencial, sin despliegue de esta rama y sin alias. Este
sprint no la ha tocado.
