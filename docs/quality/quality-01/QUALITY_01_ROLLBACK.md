# QUALITY-01 · Reversión

Tres niveles, de menos a más invasivo. **Empieza siempre por el nivel 1**: en la práctica resuelve
cualquier problema urgente en segundos y no destruye nada.

---

## Nivel 1 · Apagar el kill switch — segundos, sin pérdida de datos

**Es el mecanismo previsto.** Todo el módulo se diseñó para poder apagarse sin tocar la base.

```bash
# Preview (Staging)
vercel env rm QUALITY_MODULE_ENABLED preview
# o, si prefieres conservar la variable:
printf 'false' | vercel env add QUALITY_MODULE_ENABLED preview
```

Después, **redespliega**: las variables se leen en tiempo de build/arranque, así que un
despliegue existente sigue con el valor con el que se construyó.

### Qué ocurre

| | |
|---|---|
| `/quality` y todas sus subrutas | **404** — el módulo deja de existir para todos |
| Datos de Quality | **intactos** en la base |
| Resto de la plataforma | **sin efecto**: CPR, Textiles, TrazaDocs siguen igual |
| Asignaciones `organization_modules` | intactas; el switch manda por encima |

Verificado: la comprobación 10 de `test:quality01-ui` levanta un servidor con el switch apagado
y confirma los cuatro 404 **y** que `/dashboard` sigue devolviendo 200.

### Cuándo usarlo

Ante cualquier duda. Si Quality se comporta mal, apagarlo es gratis y reversible: volver a
encenderlo devuelve el módulo exactamente como estaba, con todos sus datos.

---

## Nivel 2 · Revertir el código, conservando el esquema

Si el problema está en la aplicación y no en la base.

```bash
git revert --no-commit 7c4c36b 3eac3e3
git commit -m "revert(quality): revertir QUALITY-01"
git push
```

o, si la rama no se ha mezclado todavía, simplemente no mezclarla.

### Qué queda atrás

Las once tablas de Quality siguen en la base, vacías o con lo que se haya creado. **No molestan**:

- No las lee ni escribe ningún código.
- No aparecen en ninguna consulta de otro módulo.
- Su RLS sigue activa, así que nadie accede a ellas.
- `modules.quality.is_functional` seguiría en `true`, de modo que la tarjeta aparecería en el
  selector. Si eso estorba, aplica el nivel 3a.

### Ojo con un efecto colateral

El commit `3eac3e3` también corrige la resolución del kill switch en
`lib/db/module-access.ts` (§8 de `QUALITY_01_RLS_SECURITY.md`). Revertirlo restaura el
comportamiento antiguo, que es **correcto para Textiles** —la única rama que contemplaba— pero
volvería a denegar en silencio cualquier módulo futuro con switch. Si reviertes el código y
quieres conservar la corrección, aplica esto encima:

```ts
// lib/db/module-access.ts
function isKillSwitchActive(mod: CommercialModule): boolean {
  return isModuleKillSwitchActive(mod);
}
```

junto con `isKillSwitchFlagEnabled` e `isModuleKillSwitchActive` de `lib/modules/catalog.ts`.

---

## Nivel 3 · Revertir el esquema

**Último recurso, y destructivo.** No hay migración inversa preescrita a propósito: la convención
del repositorio es append-only, y una migración de reversión escrita "por si acaso" tiende a
quedarse obsoleta sin que nadie lo note.

Si hiciera falta, la reversión se escribe como una **migración nueva** (`0113_…`), nunca borrando
0112.

### 3a · Solo ocultar el módulo, sin borrar nada

Casi siempre es esto lo que se quiere de verdad:

```sql
-- 0113_quality_module_unpublish.sql
update public.modules
   set is_available = false, is_functional = false
 where code = 'quality';
```

Y en `lib/modules/catalog.ts`, devolver la entrada `quality` a `status: "coming_soon"`.

Efecto: la tarjeta desaparece del selector, el módulo deja de asignarse a empresas nuevas y las
tablas quedan tal cual. **Sin pérdida de datos.**

### 3b · Eliminar el esquema completo

Solo si el esquema es inservible y no hay datos que conservar.

> **Antes de nada: comprueba si hay datos reales.**
> ```sql
> select 'processes', count(*) from quality_processes
> union all select 'positions', count(*) from quality_positions
> union all select 'revisions', count(*) from quality_process_revisions
> union all select 'maps', count(*) from quality_process_maps;
> ```
> Si alguno no es cero, **detente y consúltalo**. No hay forma de recuperarlo después.

```sql
-- 0113_quality_foundation_rollback.sql

-- Orden inverso al de creación: los hijos primero.
drop view if exists public.v_quality_position_current_holder;

drop table if exists public.quality_process_documents;
drop table if exists public.quality_process_map_nodes;
drop table if exists public.quality_process_map_versions;
drop table if exists public.quality_process_maps;
drop table if exists public.quality_process_interactions;
drop table if exists public.quality_process_io;
drop table if exists public.quality_process_revisions;
drop table if exists public.quality_processes;
drop table if exists public.quality_position_assignments;
drop table if exists public.quality_positions;
drop table if exists public.quality_process_categories;

drop function if exists public.quality_publish_map_version(uuid, date);
drop function if exists public.quality_open_map_version(uuid, text);
drop function if exists public.quality_publish_process_revision(uuid, date);
drop function if exists public.quality_open_process_revision(uuid, text);
drop function if exists public.quality_protect_published_revision();
drop function if exists public.quality_protect_published_map_version();
drop function if exists public.quality_io_revision_must_be_draft();
drop function if exists public.quality_map_node_version_must_be_draft();
drop function if exists public.quality_interaction_io_must_match();
drop function if exists public.quality_process_category_must_exist();
drop function if exists public.quality_assignment_profile_must_belong();
drop function if exists public.protect_global_quality_process_categories();

update public.modules
   set is_available = false, is_functional = false
 where code = 'quality';
```

Los `drop table` arrastran sus triggers y políticas. Las funciones se eliminan aparte porque son
objetos de esquema independientes.

**Lo que este script NO toca, a propósito:** `trazadoc_documents`, `profiles`, `memberships`,
`organizations` y `organization_modules`. Quality solo **referencia** documentos de TrazaDocs
(T-03), así que eliminar Quality no debe rozar ni un documento. Las filas de
`organization_modules` con `module_code = 'quality'` quedan huérfanas y son inertes.

### Después de aplicar 3b

Hay que revertir también el código (nivel 2) y devolver las pruebas a su estado anterior:

- `tests/unit/quality-01-foundation.test.ts`, `tests/rls/quality-01-process-foundation.test.ts`
  y `tests/e2e/quality-01-walkthrough.test.ts` se eliminan, junto con sus tres scripts de
  `package.json` y la entrada de `test:all`.
- Las 16 listas de migraciones autorizadas incluirían `0113_…` en lugar de `0112_…`.
- Las pruebas de la tabla de `QUALITY_01_TEST_MATRIX.md` §6 volverían a afirmar que Quality es
  `coming_soon`.

---

## Reversión de Production

**No aplica.** QUALITY-01 nunca llegó a Production:

| | |
|---|---|
| Migración 0112 en Production | **No aplicada** |
| `QUALITY_MODULE_ENABLED` en Vercel Production | **No existe** |
| Código desplegado a Production | **No** |
| Datos de Production modificados | **Ninguno** |

No hay nada que revertir allí. Aunque el código llegara a Production por un despliegue accidental
de la rama, `/quality` respondería 404 por ausencia de la variable, y ninguna consulta de Quality
se ejecutaría.

---

## Resumen

| Nivel | Acción | Tiempo | Pierde datos | Reversible |
|---|---|---|---|:---:|
| 1 | Apagar el kill switch | segundos | No | ✔ |
| 2 | Revertir el código | minutos | No | ✔ |
| 3a | Despublicar el módulo | minutos | No | ✔ |
| 3b | Eliminar el esquema | minutos | **Sí, todo Quality** | ✘ |
