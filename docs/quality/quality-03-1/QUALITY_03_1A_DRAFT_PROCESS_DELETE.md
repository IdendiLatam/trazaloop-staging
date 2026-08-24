# QUALITY-03.1a · Eliminar un proceso que todavía es un borrador

Micro-hotfix que cierra la brecha **G-1** declarada en QUALITY-03.1.

## 1. La causa

No era una decisión: era una **ausencia**. `quality_processes` tenía políticas
de `SELECT`, `INSERT` y `UPDATE`, y ninguna de `DELETE`. Un proceso recién
creado y vacío no se podía eliminar.

Peor: hasta 0119, `authenticated` conservaba el privilegio **sin política**, así
que el intento ni siquiera fallaba — afectaba a cero filas y devolvía 204. 0119
retiró el privilegio (el intento pasó a fallar de forma honesta); 0120 da la
política que faltaba, con su puerta.

## 2. Lo que había debajo, y por eso no bastaba con abrir el borrado

Siete tablas cascadean desde el proceso y una restringe:

```
quality_process_map_edges.{source,target}_process_id  → CASCADE
quality_process_revisions.process_id                  → CASCADE
quality_process_documents.process_id                  → CASCADE
quality_objective_processes.process_id                → CASCADE
quality_process_map_nodes.process_id                  → CASCADE
quality_process_interactions.{source,target}          → CASCADE
quality_process_io.process_id                         → CASCADE
quality_indicators.scope_process_id                   → RESTRICT
```

`quality_process_map_edges` es el **snapshot de las relaciones que mostraba una
versión publicada del mapa** (0114/0115). Abrir el borrado sin más habría hecho
que eliminar un proceso arrancara filas de un mapa ya publicado: no se pierde
«un proceso», se corrompe un registro que alguien firmó. Lo mismo con las
revisiones publicadas.

**Las cascadas no se retiran.** Son correctas cuando el proceso sí es
desechable: un borrador se lleva sus revisiones en borrador, y esas sus
entradas y salidas, que nunca salieron del borrador. Lo que se añade es la
puerta que decide si ese caso se da.

## 3. La regla definitiva

> Un proceso puede eliminarse **mientras siga siendo un borrador sin publicar y
> nada dependa de él**. En cuanto se publica, entra en un mapa publicado o algo
> lo referencia, se **retira** en su lugar.

`status = 'draft'` **no** es el criterio: es una de las ocho preguntas. Se
consultan las referencias reales, porque un dato anómalo no debe convertirse en
un borrado.

## 4. Qué bloquea, y de qué tipo es

### Historia — no se resuelve quitando nada → **retirar**

| Referencia | Por qué |
|---|---|
| revisión publicada o sustituida | el proceso rigió alguna vez |
| versión publicada del mapa que lo incluye | forma parte de un mapa que alguien publicó |
| relación dibujada en un mapa publicado (`map_edges`) | ídem, desde el snapshot |
| el estado ya no es borrador | activarlo es el acto por el que la empresa lo adopta |

### Referencias vivas — sí se resuelven → **suelta la asociación**

| Referencia | Por qué |
|---|---|
| relación con otro proceso | la relación es un objeto **compartido**: borrar este mutaría en silencio la ficha del otro, que dejaría de decir de quién recibe |
| documento asociado | simétrico a lo que ya hace el borrado documental de 0116, que pide quitar la asociación primero |
| objetivo que lo incluye | referencia viva de otro dominio |
| indicador cuyo alcance es este proceso | ídem; además la FK es `RESTRICT` |

El mensaje distingue los dos casos: en el primero ofrece **«Retirarlo
conservando su historia»**; en el segundo, **«Quita esas asociaciones y podrás
eliminarlo»**.

### Lo que NO bloquea

**Las entradas y salidas de una revisión en borrador.** Cuelgan de la revisión
—y un disparador de 0112 impide tocarlas fuera del borrador—, así que nunca
salieron de él y no son historia de nadie. Se van con el proceso. Comprobado en
`P2`, que además verifica que no quedan huérfanas.

## 5. La alternativa no se inventó

`quality_processes.status` ya tenía **`retired`**, y la ficha ya ofrecía
«Retirar proceso». El dictamen apunta a lo que el modelo ya soportaba; no se
creó ningún estado ni workflow nuevo (§8 del encargo).

## 6. Migración

**`0120_quality_draft_process_deletion.sql`.** Append-only; no edita 0112 ni
ninguna anterior; no borra datos; no crea tablas.

| Bloque | Qué |
|---|---|
| §1 | `quality_process_deletion_verdict()` y `quality_process_state_label()` |
| §2 | el despachador público `quality_deletion_eligibility()` aprende `'process'` |
| §3 | el disparador genérico de 0119 aprende `'process'`; `BEFORE DELETE` sobre `quality_processes` |
| §4 | la política de `DELETE` que faltaba, y el `grant delete` que 0119 había retirado |

**Se reutiliza el patrón de QUALITY-03.1**, no se crea uno paralelo: el mismo
dictamen lo consultan la pantalla y la puerta, así que el aviso y el rechazo no
pueden discrepar. La prueba `M11` lo fija, y comprueba además que reemplazar el
`case` del despachador no haya perdido ninguna de las cuatro ramas anteriores.

## 7. RLS y autorización

- **Política**: `admin`, `quality`, `consultant` — exactamente `QUALITY_EDITOR_ROLES`,
  los mismos que ya crean y editan procesos. Un lector no puede (`P11`).
- **Puerta**: el disparador se aplica a todos, incluido el administrador.
- **Cross-tenant**: el despachador enmascara por completo lo ajeno — para quien
  no es miembro, la respuesta es la misma que para un identificador inventado,
  sin motivo y **sin contadores**, porque un contador ya es información (`P8`).

La política dice **quién** puede intentarlo; el disparador dice **si** se puede.
Son preguntas distintas y hacen falta las dos.

## 8. Interfaz

Mismo `LifecyclePanel` que las otras cuatro entidades:

- **Desechable** — «Podrás eliminar este proceso mientras siga siendo un
  borrador sin publicar y nada dependa de él. Una vez publicado o incluido en
  un mapa, podrás retirarlo conservando su historia.» + «Eliminar proceso», que
  abre una confirmación que **nombra** el objeto: «Esta acción eliminará
  definitivamente el proceso «Gestión de compras». No se puede deshacer.»
- **No desechable** — «Este proceso ya no puede eliminarse. Este proceso ya
  salió del borrador (activo) y su historia debe conservarse. Tiene 1 revisión
  publicada. Retirarlo conservando su historia.»

El estado se dice **en español**: un código interno no se le enseña a nadie.

## 9. Server recheck

El servidor **no** confía en el dictamen que se pintó. El disparador lo vuelve a
emitir en el instante del borrado, así que la ventana entre «se abrió la
confirmación» y «se pulsó Eliminar» no es aprovechable: si en ese rato aparece
una relación, el borrado falla, y con el motivo que se habría leído antes.
Comprobado en `P9`.

Además, la acción de servidor **deja pasar el mensaje del disparador tal cual**
en vez de sustituirlo por un genérico: ya está escrito para una persona.

## 10. Pruebas

`test:quality031a-rls` — **11 comprobaciones**, base real, sesiones reales:

| | |
|---|---|
| `P1` | un proceso vacío en borrador se elimina de verdad |
| `P2` | sus entradas y salidas en borrador se van con él, **sin dejar huérfanas** |
| `P3` | una relación con otro proceso lo retiene, desde **ambos** extremos, y la relación sobrevive |
| `P4` | un proceso de un mapa publicado no se elimina, y el mapa sigue completo |
| `P5` | un documento asociado lo retiene, y el documento no se toca |
| `P6` | un objetivo o un indicador que lo señala lo retienen (sin dejar FK rota) |
| `P7` | un proceso publicado no se elimina, ofrece retirarlo, y retirarlo conserva la revisión |
| `P8` | una empresa ajena no lo elimina ni averigua nada |
| `P9` | el servidor vuelve a comprobar en el instante del borrado |
| `P10` | **el dictamen y lo que ocurre al ejecutar coinciden**, para todos los procesos de la empresa |
| `P11` | un editor sí puede, un lector no |

`P10` es la que impide que la pantalla prometa una cosa y la base haga otra:
recorre todos los procesos, pregunta y ejecuta.

Más **4 comprobaciones estáticas** en `test:quality031` (`M11`–`M14`): que se
reutiliza el patrón, que política y puerta son cosas distintas, que la frontera
mira las siete referencias reales, y que el proceso tiene ayuda propia y estado
en español.

### Regresión

```
npm run test:all   →  EXIT 0   ·  1 969 comprobaciones
```

Más, con exit 0: QUALITY-01 (56 ✔ base real, 15 recorrido), QUALITY-01.1
(41 ✔, 16), QUALITY-01.2 (33 ✔, 16), QUALITY-03.1 (30 ✔), QUALITY-03.1a (11 ✔)
y el hotfix de acceso por módulo (17 ✔).

## 11. Staging

Ver §13 del informe final de este sprint. Staging pasa de **0119 a 0120**, con
project ref explícito y build recompilado con su entorno.

## 12. Reversión

**Nivel 1 — quitar la posibilidad de borrar, dejando todo lo demás:**

```sql
drop policy if exists quality_processes_delete on public.quality_processes;
revoke delete on table public.quality_processes from authenticated;
```

Vuelve al estado de QUALITY-03.1: ningún proceso se puede eliminar. No se
pierde nada.

**Nivel 2 — retirar 0120 por completo:**

```sql
drop trigger if exists quality_processes_guard_delete on public.quality_processes;
drop policy  if exists quality_processes_delete       on public.quality_processes;
revoke delete on table public.quality_processes from authenticated;
drop function if exists public.quality_process_deletion_verdict(uuid);
drop function if exists public.quality_process_state_label(text);
delete from supabase_migrations.schema_migrations where version = '0120';
```

> **Ojo con el orden y con lo compartido.** `quality_deletion_eligibility()` y
> `quality_guard_hard_delete()` se **reemplazaron** en 0120 para conocer
> `'process'`. Si se retira 0120 hay que **reemitir las versiones de 0119** de
> ambas; borrarlas dejaría sin dictamen a indicadores, objetivos, cargos y
> documentos. Están íntegras en
> `0119_quality_temporal_eligibility_and_lifecycle.sql` §2.5 y §2.6.

**Nunca:** editar 0120 una vez desplegada, ni `migration repair`, ni revertir en
Production — allí nunca se aplicó.
