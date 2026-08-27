# QUALITY-11 · Idempotencia, rearme y recurrencia

## 1 · Por qué NO se comprueba antes de insertar

El patrón obvio sería:

```sql
if not exists (select 1 from quality_signals where dedupe_key = k) then
  insert into quality_signals …
end if;
```

Y está mal. Dos barridos simultáneos —el cron y alguien que pulsa «Ejecutar
ahora»— pasan **los dos** por ese `select` antes de que ninguno inserte, y
crean dos señales para la misma condición. La única defensa real bajo
concurrencia es la base de datos:

```sql
create unique index quality_signals_open_dedupe_uniq
  on public.quality_signals (organization_id, dedupe_key)
  where resolved_at is null;
```

```sql
insert into quality_signals (…) values (…)
on conflict (organization_id, dedupe_key) where resolved_at is null
do update set last_detected_at = now(),
              detection_count = quality_signals.detection_count + 1
returning id, (xmax = 0) into v_signal, v_nuevo;
```

`xmax = 0` distingue la fila **insertada** de la fila **actualizada**, que es lo
que permite que la ejecución cuente lo que de verdad creó y no lo que tocó.

Comprobado ejecutándolo: la prueba L1 lanza dos barridos en paralelo sobre la
misma condición y comprueba que queda **una** señal abierta.

## 2 · La clave

```
auto:<id de la versión>:<id del sujeto>
```

Lleva la **versión** y no la regla: cambiar la regla abre una condición nueva, y
eso es correcto —la v2 dice algo distinto de la v1—.

No lleva la **fecha**. Si la llevara, el motor abriría una señal nueva cada
mañana para la misma condición, que es la definición de ruido.

## 3 · El rearme sale gratis del predicado parcial

El índice solo cubre las señales **abiertas**. En cuanto una se resuelve, libera
la clave. Consecuencia:

| Momento | Qué pasa |
|---|---|
| la condición se cumple | nace la señal · ocupa la clave |
| el barrido se repite | `detection_count` sube · no nace nada |
| la condición deja de cumplirse | la señal se resuelve sola · libera la clave |
| la condición vuelve a cumplirse | nace una señal **nueva**, con su contador a 1 |

Ni dedupe eterno, ni duplicado. Es el escenario 3 (§138), comprobado en la
prueba D1: dos señales, la primera `resolved`, la segunda `open`, y la segunda
sin heredar el contador de la primera.

## 4 · La resolución automática es determinística

Se resuelven las señales abiertas de **esa** regla cuyo sujeto **se evaluó en
este barrido** y cuya clave **no** salió de la evaluación. Las tres condiciones
importan:

- «de esa regla» — una regla no cierra las señales de otra;
- «cuyo sujeto se evaluó» — si el sujeto desapareció del censo, la señal se
  queda abierta: no se sabe si la condición dejó de cumplirse o si dejó de
  mirarse;
- «cuya clave no salió» — si la condición sigue cumpliéndose, la señal sigue.

Y resolver la señal **no cierra la tarea** ni toca ninguna acción. La prueba C2
lo comprueba: tras la resolución automática, la tarea sigue `open` y hay cero
acciones.

## 5 · Reconocer ≠ resolver ≠ silenciar

| Acto | Qué hace | Qué NO hace |
|---|---|---|
| **reconocer** | anota quién la vio y cuándo | no cierra: `resolved_at` sigue nulo |
| **resolver** | cierra con `manual` / `dismissed` y una nota | no cierra la tarea |
| **silenciar** | cierra con `suppressed` y aparta la regla del barrido mientras dure | no dice que el problema esté resuelto |

Silenciar exige decir **por qué**, y admite fecha de fin. Una regla silenciada
no se evalúa mientras dure el silencio: la prueba T3 comprueba que ni siquiera
aparece en el detalle de la ejecución.

## 6 · Lo que el barrido cuenta

`rules_evaluated` · `subjects_evaluated` · `matches` · `signals_created` ·
`alerts_created` · `tasks_created` · `failures`.

Todos cuentan **lo que se creó**, no lo que se miró. Incluidos los observadores
de plataforma: como algunos barridos heredados devuelven el total de la
condición en vez de las filas nuevas, el motor mide el delta real de avisos
alrededor de cada llamada. Un barrido con cero señales nuevas no es un barrido
fallido: es lo que ocurre cuando nada ha cambiado.
