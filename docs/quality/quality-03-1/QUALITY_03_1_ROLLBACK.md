# QUALITY-03.1 · Reversión

**Documentado. NO ejecutar sin una decisión explícita.**

## 1. Qué hizo 0119, para saber qué se revierte

| Bloque | Qué hace | ¿Destructivo? |
|---|---|---|
| §1 Temporal | `quality_period_is_eligible()`, reemplaza la vista y el barrido | no |
| §2 Ciclo de vida | dictámenes, despachador, disparadores, revocaciones | no |
| §3 D-04 | tabla `trazadoc_document_codes` + disparadores + siembra | crea una tabla |

**No borra datos.** La única escritura es sembrar las reservas de los códigos
que ya existían.

## 2. Nivel 1 · Revertir solo el arreglo temporal

Si por alguna razón hubiera que volver a que la vista pida el periodo anterior
sin comprobar la vigencia:

```sql
-- Restaurar el cuerpo de la vista tal como lo dejó 0117 §20.1,
-- y el del barrido tal como lo dejó 0117 §18.
```

Ambos están íntegros en `0117_quality_objectives_indicators_and_measurements.sql`
y se pueden reemitir con `create or replace`. **No es recomendable**: devuelve
el defecto de julio.

## 3. Nivel 2 · Revertir solo el ciclo de vida

```sql
drop trigger if exists quality_indicators_guard_delete  on public.quality_indicators;
drop trigger if exists quality_objectives_guard_delete  on public.quality_objectives;
drop trigger if exists quality_positions_guard_delete   on public.quality_positions;
drop trigger if exists trazadoc_documents_guard_delete  on public.trazadoc_documents;
```

**Lo que esto reabre:** borrar un indicador vuelve a destruir en cascada sus
mediciones, sus metas históricas y su linaje. Es la razón por la que se puso.

Devolver los privilegios revocados por §2.7 no cambia nada observable: esas
tablas no tienen política de escritura, así que la RLS seguiría bloqueando. Lo
único que se pierde es que el rechazo vuelva a ser un silencioso «cero filas»
en vez de un `42501` honesto.

## 4. Nivel 3 · Revertir D-04

```sql
drop trigger if exists trazadoc_documents_reserve_code on public.trazadoc_documents;
drop trigger if exists trazadoc_documents_release_code on public.trazadoc_documents;
drop table if exists public.trazadoc_document_codes;
drop function if exists public.trazadoc_reserve_document_code();
drop function if exists public.trazadoc_release_document_code();
drop function if exists public.trazadoc_code_key(text);
```

**Destructivo en un sentido sutil:** se pierde el registro de qué códigos
estuvieron ocupados. Los documentos vivos conservan los suyos, pero los de los
borradores eliminados vuelven a quedar libres, y ese conocimiento no se puede
reconstruir. Si se retira, conviene exportar antes:

```bash
pg_dump "$SUPABASE_DB_URL" --table=public.trazadoc_document_codes \
  > codigos-documentales-$(date +%Y%m%d-%H%M%S).sql
```

## 5. Nivel 4 · Retirar 0119 por completo

Los tres bloques anteriores, más:

```sql
drop function if exists public.quality_deletion_eligibility(text, uuid);
drop function if exists public.quality_indicator_deletion_verdict(uuid);
drop function if exists public.quality_objective_deletion_verdict(uuid);
drop function if exists public.quality_position_deletion_verdict(uuid);
drop function if exists public.trazadoc_document_deletion_verdict(uuid);
drop function if exists public.quality_guard_hard_delete();
drop function if exists public.trazadoc_state_label(text);
drop function if exists public.quality_objective_state_label(text);
drop function if exists public.quality_period_is_eligible(uuid, date, date);

delete from supabase_migrations.schema_migrations where version = '0119';
```

**Ojo con el orden**: `quality_period_is_eligible` la usan la vista y el
barrido, así que hay que restaurarlos primero (§2) o el `drop` fallará.

## 6. Revertir el código sin tocar la base

Casi siempre es lo que se quiere. `git revert` del commit de QUALITY-03.1
devuelve la interfaz y el PDF al estado anterior dejando 0119 aplicada: las
funciones quedan ahí sin que nadie las llame, y los disparadores siguen
protegiendo la historia. Ningún dato se pierde.

La excepción son los disparadores: siguen impidiendo borrados que la interfaz
anterior sí ofrecía. Si eso estorba, aplicar además el nivel 2.

## 7. Lo que NO hay que revertir nunca

- **La imagen en el motor PDF.** `lib/pdf/image.ts` no rompe nada: sin logo, el
  camino es el de siempre.
- **La corrección de `removeQualityPosition`.** Contemplar `P0001` además de
  `23503` es correcto con y sin los disparadores.
- **Las listas blancas de migraciones.** Quitar 0119 de ellas pondría en rojo
  diecisiete suites sin motivo.

## 8. Lo que no se debe hacer

- **Editar 0119.** Ya está desplegada en Staging. Una migración desplegada no
  se edita: se corrige con otra encima.
- **`migration repair`.** Miente al registro sobre lo que la base tiene.
- **Revertir en Production.** No hay nada que revertir: nunca se aplicó allí.
