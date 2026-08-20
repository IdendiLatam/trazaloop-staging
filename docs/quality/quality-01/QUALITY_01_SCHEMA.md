# QUALITY-01 · Esquema de la fundación de Procesos

**Migración:** `supabase/migrations/0112_quality_process_foundation.sql` (append-only tras 0111)
**Objetos:** 11 tablas · 4 RPC · 1 vista · 13 triggers propios
**Estado:** aplicada en LOCAL y en STAGING (`qchzkxbnbqeyuxinipln`). **No aplicada en Production.**

---

## 1. Las cuatro decisiones que dan forma al esquema

Antes del detalle, conviene entender por qué el esquema tiene la forma que tiene. Cuatro
decisiones congeladas del sprint explican casi todas las tablas:

**T-02 · El responsable de un proceso es un CARGO, no una persona.** Si un proceso apuntara a un
usuario, el día que esa persona cambia de puesto o deja la empresa el proceso queda huérfano o,
peor, sigue señalando a alguien que ya no responde por él. Por eso existe `quality_positions` y
por eso `quality_processes.owner_position_id` apunta ahí y nunca a `profiles`.

**T-01 · La vigencia es empresarial, no de sistema.** `created_at` responde "cuándo se grabó
esto"; no responde "quién ocupaba este cargo el 14 de marzo". Esa segunda pregunta es la que
importa en un sistema de calidad, así que las asignaciones y las revisiones llevan
`effective_from` / `effective_to` propios, independientes del reloj del servidor.

**T-03 · Los documentos se referencian, jamás se copian.** `quality_process_documents` guarda un
puntero a `trazadoc_documents`. Copiar el documento crearía dos verdades que divergen en cuanto
alguien edite una.

**Publicar congela.** Una versión publicada deja de ser editable — su contenido, sus entradas y
sus salidas quedan como estaban ese día. Es lo que permite responder "esto es lo que regía"
sin matices. Se impone con triggers, no con confianza en la interfaz.

---

## 2. Mapa de las once tablas

```
quality_process_categories          catálogo (base global + propias de la empresa)
        ▲ (validada por trigger, sin FK)
        │
quality_positions ──────────────────  el CARGO: sujeto estable de la responsabilidad
        ▲                    ▲
        │                    │ owner_position_id (FK compuesta)
quality_position_assignments │        persona ↔ cargo, CON vigencia
                             │
                    quality_processes    identidad del proceso
                             ▲
      ┌──────────────────────┼──────────────────────┬─────────────────────┐
      │                      │                      │                     │
quality_process_        quality_process_      quality_process_    quality_process_
  revisions               interactions          documents            map_nodes
      ▲                                              │                    ▲
      │ revision_id                                  ▼                    │
quality_process_io                          trazadoc_documents    quality_process_
  (entradas y salidas)                        (TrazaDocs)           map_versions
                                                                          ▲
                                                                  quality_process_maps
```

---

## 3. Tabla por tabla

### §1 · `quality_process_categories` — el catálogo

La única tabla con `organization_id` **nulable**, y a propósito: `NULL` identifica las categorías
base de Trazaloop, y un UUID las que añade una empresa. Es el mismo patrón que las fibras
textiles de 0093.

| Columna | Notas |
|---|---|
| `organization_id` | `NULL` = catálogo base; UUID = categoría propia de la empresa |
| `code`, `name`, `description` | `code` es la clave funcional |
| `sort_order`, `is_active` | |

Dos índices parciales en lugar de una única restricción: `(code) where organization_id is null`
para el catálogo base, `(organization_id, code) where organization_id is not null` para las
propias. Una empresa puede así llamar `core` a una categoría suya sin chocar con la global.

Semilla (DA-03): `strategic` (Estratégicos), `core` (Misionales), `support` (De apoyo),
`system` (De gestión del sistema).

El trigger `protect_global_quality_process_categories()` impide modificar o borrar una fila del
catálogo base. Es lo que hace que el intento de renombrar "Misionales" desde una empresa no
tenga efecto (comprobación 4 de la suite de RLS).

> **Por qué ninguna FK apunta aquí.** `quality_processes.category_code` es un `text`, no una
> clave foránea, porque la categoría puede ser global o de la empresa y una FK no puede expresar
> "una de las dos". La validación la hace el trigger `quality_process_category_must_exist()`,
> que comprueba exactamente eso.

### §2 · `quality_positions` — el Cargo

| Columna | Notas |
|---|---|
| `organization_id` | obligatorio |
| `code`, `name`, `org_unit`, `description` | `name` único por empresa (índice sobre `lower(name)`) |
| `is_active` | un cargo se **desactiva**; no se borra |

**No hay política de DELETE.** Borrar un cargo rompería el histórico de propiedad de los
procesos, que es justo lo que T-02 quiere preservar.

RLS: leen los miembros; crean y editan `admin` y `quality`.

### §3 · `quality_position_assignments` — persona ↔ cargo, con vigencia

| Columna | Notas |
|---|---|
| `position_id` | FK **compuesta** `(organization_id, position_id)` |
| `profile_id` | la persona |
| `assignment_type` | `holder` \| `acting` \| `delegate` |
| `effective_from` / `effective_to` | vigencia **empresarial** (T-01) |

Dos reglas que la base impone por sí sola:

- **Un solo titular vigente.** Índice único parcial sobre `(position_id) where effective_to is
  null and assignment_type = 'holder'`. Suplencias y delegaciones pueden coexistir; dos titulares
  a la vez, no.
- **Solo miembros activos.** El trigger `quality_assignment_profile_must_belong()` exige
  membresía activa en la empresa. Sin él, una FK a `profiles` dejaría asignar a cualquier usuario
  de la plataforma.

### §4 · `quality_processes` — la identidad del proceso

| Columna | Notas |
|---|---|
| `code`, `name` | únicos por empresa |
| `category_code` | validada por trigger contra el catálogo |
| `owner_position_id` | **FK compuesta a `quality_positions`** (T-02) |
| `status` | `draft` \| `active` \| `retired` |
| `current_revision` | número de la revisión publicada vigente; `0` mientras no haya ninguna |

Lo que **no** está aquí es tan importante como lo que está: propósito, alcance, entradas y
salidas viven en la revisión. Esta tabla guarda solo lo que no se versiona.

### §5 · `quality_process_revisions` — el contenido versionado

| Columna | Notas |
|---|---|
| `revision_number` | ≥ 1, único por proceso |
| `status` | `draft` \| `published` \| `superseded` |
| `purpose`, `scope`, `change_note` | el contenido |
| `effective_from` / `effective_to` | vigencia empresarial |
| `published_by`, `published_at` | quién y cuándo |

Tres garantías:

- **Un solo borrador abierto** por proceso (índice parcial `where status = 'draft'`). Evita dos
  personas editando borradores paralelos que luego no se sabe cuál publicar.
- **Una sola vigente** (índice parcial `where status = 'published' and effective_to is null`).
- **Publicada = inmutable.** El trigger `quality_protect_published_revision()` revierte cualquier
  intento de cambiar el contenido de una revisión publicada.

### §6 · `quality_process_io` — entradas y salidas

Cuelgan de la **revisión**, no del proceso. Esa es la decisión clave: si colgaran del proceso,
publicar una revisión no congelaría realmente nada — bastaría con editar las entradas para
cambiar lo publicado por la puerta de atrás.

| Columna | Notas |
|---|---|
| `revision_id` | FK compuesta; a qué revisión pertenece |
| `process_id` | FK compuesta; redundante a propósito, para consultar sin pasar por la revisión |
| `direction` | `input` \| `output` |
| `io_kind` | `information` \| `material` \| `document` \| `record` \| `resource` \| `other` |

Las políticas de INSERT/UPDATE/DELETE exigen `status = 'draft'` en la revisión padre, y el
trigger `quality_io_revision_must_be_draft()` lo vuelve a comprobar.

### §7 · `quality_process_interactions` — la relación entre procesos (DA-06)

Una relación **estructurada**, guardada una sola vez y leída desde ambos extremos. No es una
flecha del dibujo: existe aunque nadie haya hecho el mapa.

| Columna | Notas |
|---|---|
| `source_process_id`, `target_process_id` | FK compuestas; `check` impide que coincidan |
| `source_output_id`, `target_input_id` | opcionales: qué salida concreta alimenta qué entrada |
| `information_item`, `description` | qué se intercambia |

El trigger `quality_interaction_io_must_match()` comprueba que la salida referenciada pertenece
de verdad al proceso origen y la entrada al destino. Sin él se podría enlazar la salida de un
tercer proceso y el mapa mentiría.

### §8 · Mapa: `quality_process_maps` + `_map_versions` + `_map_nodes`

Misma mecánica de tres piezas que los procesos: identidad, versiones y contenido.

- `quality_process_maps` — identidad. Un solo mapa por defecto por empresa (índice parcial).
- `quality_process_map_versions` — `draft` / `published` / `superseded`, con vigencia. Una sola
  vigente. Trigger `quality_protect_published_map_version()`.
- `quality_process_map_nodes` — qué proceso aparece, en qué categoría y en qué orden. Único por
  `(map_version_id, process_id)`: un proceso no se repite dentro de una versión.

DA-04: cada bloque del mapa corresponde a un proceso **real** (`process_id` es una FK compuesta,
no un texto libre). El trigger `quality_map_node_version_must_be_draft()` impide tocar los nodos
de una versión publicada.

### §9 · `quality_process_documents` — el puente con TrazaDocs

| Columna | Notas |
|---|---|
| `process_id` | FK compuesta a `quality_processes` |
| `document_id` | **FK compuesta a `trazadoc_documents (organization_id, id)`** |
| `relation_type` | `governs` \| `supports` \| `records` \| `reference` |

La FK compuesta es lo que garantiza T-03 con aislamiento: un proceso solo puede referenciar
documentos de **su** empresa, y lo garantiza la base, no una comprobación en la aplicación.
Quitar la asociación borra la fila de esta tabla; el documento no se toca.

---

## 4. Las cuatro RPC

Publicar toca varias filas de forma consistente: cerrar la vigente, abrir la nueva, actualizar
la identidad. Hacerlo con `UPDATE` sueltos desde el cliente dejaría estados intermedios visibles
(dos vigentes, ninguna vigente). Por eso son RPC atómicas, mismo patrón que
`change_trazadoc_document_status` de 0046.

Las cuatro son `SECURITY DEFINER` pero resuelven la identidad con `auth.uid()`: **jamás
suplantan a nadie**. Se revocan de `public` y `anon`; solo `authenticated` puede ejecutarlas.

| RPC | Qué hace |
|---|---|
| `quality_open_process_revision(p_process_id, p_change_note)` | Devuelve el borrador abierto si ya existe (idempotente); si no, crea uno nuevo **copiando** propósito, alcance y entradas/salidas de la vigente |
| `quality_publish_process_revision(p_revision_id, p_effective_from)` | Solo `admin`/`quality`. Cierra la vigencia de la anterior, publica la nueva y actualiza `status`/`current_revision` del proceso. Devuelve el número de revisión |
| `quality_open_map_version(p_map_id, p_change_note)` | Idempotente; copia los nodos de la versión vigente |
| `quality_publish_map_version(p_version_id, p_effective_from)` | Solo `admin`/`quality`. **Rechaza un mapa vacío** |

La idempotencia de las dos primeras no es cosmética: sin ella, pulsar "abrir revisión" dos veces
—o un doble envío del formulario— crearía dos borradores y el índice único fallaría con un error
incomprensible.

---

## 5. La vista

`v_quality_position_current_holder`, declarada `with (security_invoker = true)`. Sin esa opción
la vista leería con los permisos de quien la creó y **saltaría la RLS del usuario**: cualquiera
vería los cargos de cualquier empresa.

Es un `LEFT JOIN`, de modo que devuelve también los cargos sin titular — necesario para que la
pantalla de cargos pueda decir "Sin titular asignado" en lugar de omitir la fila.

---

## 6. Triggers transversales heredados

Cada tabla nueva declara los triggers de plataforma que ya existían, en lugar de confiar en que
alguien los recuerde:

| Trigger | Qué impide |
|---|---|
| `set_updated_at()` | `updated_at` desincronizado |
| `prevent_organization_id_change()` | Mover una fila de empresa mediante un `UPDATE` |
| `force_created_by()` | Falsificar la autoría |
| `audit_row_change()` | Cambios sin rastro (en las tablas con contenido de negocio) |

---

## 7. Privilegios — la lección de Q0 aplicada

Q0 descubrió que ninguna migración histórica concedía privilegios de tabla: Production
funcionaba por el bootstrap permisivo de Supabase, no porque el repositorio lo declarara. 0111
corrigió lo existente; **0112 es la primera migración que nace ya con la convención**.

```sql
grant select, insert, update, delete on table  -- DML enumerado, jamás GRANT ALL
  public.quality_process_categories, … (11 tablas)
to authenticated, service_role;

revoke truncate, references, trigger on table  -- TRUNCATE bypasea la RLS
  … from anon, authenticated;

revoke all on table … from anon;               -- anon no recibe NADA
```

Sin `ALTER DEFAULT PRIVILEGES`: cada tabla futura de Quality tendrá que declarar los suyos igual
que estas. Es deliberadamente incómodo — un olvido se nota, un default permisivo no.

Verificado en LOCAL y en STAGING:

| Comprobación | Esperado | LOCAL | STAGING |
|---|---|---|---|
| Tablas `quality_*` | 11 | 11 | 11 |
| Sin RLS | 0 | 0 | 0 |
| Privilegios de `anon` | 0 | 0 | 0 |
| `TRUNCATE`/`REFERENCES`/`TRIGGER` de rol cliente | 0 | 0 | 0 |
| `authenticated` sobre `quality_positions` | DML | `DELETE,INSERT,SELECT,UPDATE` | `DELETE,INSERT,SELECT,UPDATE` |

---

## 8. Espejo del catálogo en la base

```sql
update public.modules set is_available = true, is_functional = true where code = 'quality';
```

`modules.is_functional` es el espejo en base de datos de `lib/modules/catalog.ts`, y una prueba
unitaria verifica que ambos coincidan. Consecuencia derivada, documentada aquí porque es un
cambio de comportamiento observable: **una empresa nueva recibe Quality en Demo de 48 h junto a
CPR y Textiles**, porque la provisión sigue exactamente a `is_functional`. Que la asignación
exista no significa que el módulo sea accesible: el kill switch decide eso, y en Production está
apagado.
