# QUALITY-01.2 · Rollback

**Migraciones:** `0114`, `0115` · **Rama:** `fix/quality-01-2-process-relations-docs-map`
**Commits:** `8d2bc11` (código y migraciones) + el de entregables

---

## Lo primero: casi nunca hace falta

Antes de deshacer nada conviene saber que **QUALITY-01.2 no puede afectar a
ningún módulo que no sea Quality**:

| Módulo | Por qué está a salvo |
|---|---|
| **PCR** | Ninguna tabla suya se toca. Los cambios transversales son el destino tras aceptar invitación y tras elegir empresa, y ambos van ahora al selector de módulos, desde donde PCR se entra igual que siempre |
| **Textiles** | Ídem |
| **TrazaDocs** | Ni una tabla, ni una política, ni una RPC. La única relación nueva es una columna opcional en una tabla **de Quality** que apunta a `quality_process_io` |
| **Production** | No recibió migraciones, ni despliegue, ni variables. `QUALITY_MODULE_ENABLED` no está definida allí: Quality es invisible |

Y el kill switch sigue siendo la palanca más rápida: **apagar
`QUALITY_MODULE_ENABLED` deja Quality inaccesible en el acto**, sin tocar la
base ni el código. Los datos se conservan.

---

## Nivel 1 · Apagar Quality (segundos, reversible)

```
QUALITY_MODULE_ENABLED  →  quitar la variable, o ponerla en cualquier valor que no sea "true" ni "1"
```

Todo `/quality/*` responde 404 —el módulo es privado, no «denegado»— y las
server actions devuelven un error claro. **Nada se borra.** Volver a encenderla
lo restaura tal cual.

Esto NO revierte los dos cambios transversales (destino tras aceptar invitación
y tras elegir empresa). Para eso, nivel 2.

---

## Nivel 2 · Revertir el código, conservando la base

```bash
git revert 8d2bc11        # sin --no-commit: que quede constancia
npm run build && npm run test:all
```

Deja las migraciones aplicadas —son **aditivas**: una columna opcional, una
tabla nueva, dos índices de unicidad y tres funciones— y devuelve la aplicación
al comportamiento de QUALITY-01.1.

### Qué vuelve a ocurrir si se revierte

Conviene saberlo antes de hacerlo, porque tres de estas cosas eran defectos
reportados:

| Vuelve | Consecuencia |
|---|---|
| Aceptar invitación lleva a `/dashboard` | Quien es invitado desde Textiles o Quality termina en PCR |
| Elegir empresa lleva a `/dashboard` | Una empresa sin PCR rebota al selector |
| «Crear documento» en Quality | **Vuelve a fallar** con «This page couldn't load» |
| Los documentos vinculados enlazan a `/trazadocs/…` | Enlace roto para una empresa que solo tenga Quality |
| El mapa vuelve a ser una lista de tarjetas | Sin flechas |
| La ficha solo permite «entrega a» | Sin «recibe de» |

**Las tres funciones que 0114 redefine seguirían siendo las de 0114** aunque se
revierta el código: `quality_publish_map_version`,
`quality_open_process_revision` y `quality_publish_process_revision` viven en la
base, no en el repositorio. Eso **no rompe nada** —escriben en tablas que la
interfaz revertida sencillamente no lee— pero conviene tenerlo presente.

---

## Nivel 3 · Revertir también la base

Solo si hay una razón concreta. Es **destructivo**: se pierden las relaciones
documentales de entradas y salidas y los snapshots de los mapas publicados.

### 3.1 · Antes de nada, mirar qué se va a perder

```sql
-- Documentos vinculados a una entrada o salida
select count(*) from public.quality_process_documents where io_id is not null;

-- Snapshots de mapas publicados
select count(*) as aristas, count(distinct map_version_id) as versiones
  from public.quality_process_map_edges;
```

Si ambos dan 0, no hay nada que perder y el rollback es limpio.

### 3.2 · Copia de seguridad (nunca opcional)

```bash
pg_dump "$DB_URL" \
  --table=public.quality_process_documents \
  --table=public.quality_process_map_edges \
  --data-only --column-inserts \
  > quality-01-2-backup-$(date +%Y%m%d-%H%M%S).sql
```

### 3.3 · Deshacer 0115

```sql
-- Devuelve un privilegio que nada usa: la RLS bloquea igual, porque el
-- snapshot no tiene politica de escritura. Se incluye por completitud.
grant insert, update, delete on public.quality_process_map_edges to authenticated;
```

### 3.4 · Deshacer 0114

```sql
begin;

-- 1 · El snapshot del mapa.
drop table if exists public.quality_process_map_edges cascade;

-- 2 · Los documentos de entradas y salidas.
--     ATENCION: esto BORRA esas relaciones. El documento de TrazaDocs
--     sobrevive intacto; lo que se pierde es a que entrada o salida aplicaba.
delete from public.quality_process_documents where io_id is not null;

drop trigger if exists t_quality_process_documents_io_match
  on public.quality_process_documents;
drop function if exists public.quality_process_document_io_must_match();
drop index if exists public.quality_process_documents_scope_uniq;
drop index if exists public.quality_process_documents_io_idx;
alter table public.quality_process_documents
  drop constraint if exists quality_process_documents_io_fk;
alter table public.quality_process_documents drop column if exists io_id;

-- Restaurar la unicidad de 0112.
alter table public.quality_process_documents
  add constraint quality_process_documents_uniq
  unique (process_id, document_id, relation_type);

-- 3 · La guarda de procesos retirados.
drop trigger if exists t_quality_process_interactions_not_retired
  on public.quality_process_interactions;
drop function if exists public.quality_interaction_processes_must_be_active();

-- 4 · La unicidad de las relaciones, de vuelta a la de 0112.
--     OJO: si existen dos flujos distintos entre el mismo par que comparten
--     el texto del item, este indice FALLARA al crearse. Es correcto que
--     falle: significa que hay datos que la regla antigua no admite. Hay que
--     decidir cual conservar ANTES de continuar; no borrar a ciegas.
drop index if exists public.quality_process_interactions_flow_uniq;
create unique index quality_process_interactions_pair_item_uniq
  on public.quality_process_interactions
     (source_process_id, target_process_id, coalesce(lower(information_item), ''));

commit;
```

### 3.5 · Restaurar las tres funciones de 0112

`create or replace function` **sobrescribe**: los cuerpos de 0112 se
recuperan volviendo a ejecutar sus bloques desde el archivo, que no se ha
modificado.

```bash
# quality_open_process_revision       → 0112, lineas 1045-1098
# quality_publish_process_revision    → 0112, lineas 1104-1148
# quality_publish_map_version         → 0112, lineas 1203-1248
sed -n '1045,1098p;1104,1148p;1203,1248p' \
  supabase/migrations/0112_quality_process_foundation.sql | psql "$DB_URL"
```

### 3.6 · Sincronizar el historial

```sql
delete from supabase_migrations.schema_migrations where version in ('0114','0115');
```

---

## Qué NO hay que hacer nunca

| No | Por qué |
|---|---|
| `drop table quality_process_documents` | Se llevaría también las relaciones a nivel de proceso, que son de **0112** y no de este sprint |
| Renumerar o editar 0114/0115 una vez aplicadas | El repositorio es append-only. Un cambio corrige el archivo pero no la base, y las dos dejan de decir lo mismo |
| Tocar 0001–0113 | Están aplicadas en Production |
| `migration repair` para «arreglar» el historial | Marca como aplicado algo que no se ejecutó. Si hay divergencia, hay que entenderla |
| Aplicar cualquier cosa a `mvmpadeixomwkpxbnhky` | Es Production, y está fuera del alcance de este sprint |

---

## Verificación posterior

```bash
npm run typecheck && npm run lint && npm run build
npm run test:all                 # ~1.400 comprobaciones
npm run test:rls                 # 110 · aislamiento entre empresas
npm run test:quality01 && npm run test:quality01-rls
npm run test:quality011 && npm run test:quality011-rls
```

Tras un rollback de nivel 3, `test:quality012` y `test:quality012-rls` **deben
fallar**: comprueban justamente lo que se acaba de deshacer. Es la señal de que
el rollback funcionó, no un problema.
