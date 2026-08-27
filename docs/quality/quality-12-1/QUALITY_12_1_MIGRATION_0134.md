# QUALITY-12.1 · La migración 0134

`supabase/migrations/0134_quality_ai_provider_call_truth.sql`

## Por qué existe

La prueba humana enseñó que una consulta podía quedar registrada como
`openai · gpt-5.4-mini` con cero tokens **sin que se hubiera llamado a nadie**.
Ocurre —correctamente— cuando el contexto autorizado sale vacío: el Copilot no
pregunta a un modelo por datos que no tiene. Lo que faltaba era decirlo.

La 0133 ya está aplicada en Staging, así que esto **añade**.

## Qué trae

```sql
alter table quality_ai_runs
  add column if not exists provider_called boolean not null default true;
```

* `quality_ai_complete_run` pasa a recibirlo. La firma de nueve argumentos se
  retira: dos funciones con el mismo nombre y distinto número de argumentos por
  defecto dejan la llamada ambigua.
* `v_quality_ai_run_overview` se rehace con la columna al final.
* `quality_ai_usage` separa `provider_calls_this_month` de
  `answered_without_calling`. Sin esa separación, «treinta consultas este mes»
  no dice nada sobre lo que se va a facturar.

## El relleno de lo antiguo

```sql
update quality_ai_runs set provider_called = false
 where status = 'succeeded'
   and coalesce(context_items, 0) = 0
   and coalesce(input_tokens, 0) = 0
   and coalesce(output_tokens, 0) = 0;
```

Ésa es la firma **inequívoca** del atajo: es la única combinación que produce
ese camino. Una llamada real deja tokens; una llamada fallida deja `status`
distinto de `succeeded`. Dejar `true` en esas filas habría sido conservar
justamente la afirmación falsa que esta migración viene a arreglar.

## Vuelta atrás

```sql
begin;
drop function if exists public.quality_ai_complete_run(
  uuid, jsonb, text, integer, integer, integer, integer, integer, integer, boolean);
-- recrear aquí la firma de nueve argumentos, copiada de la 0133
-- rehacer la vista sin la columna, y quality_ai_usage sin las dos claves nuevas
alter table public.quality_ai_runs drop column if exists provider_called;
commit;
```

Como con la 0133: dejar la columna sin usar no molesta a nadie. Retirar la
migración **dejando el código** sí rompe, porque el cierre llamaría a una firma
que ya no existe.
