# QUALITY-01.1 · Reversión

QUALITY-01.1 corrige defectos: revertirlo devuelve esos defectos. Antes de
hacerlo, conviene tener claro qué se recupera y qué se rompe.

**Empieza siempre por el nivel 1.**

---

## Qué se pierde al revertir

| Corrección | Si se revierte |
|---|---|
| Categorías | El selector vuelve a salir **en blanco** y no se pueden crear procesos |
| Navegación | «Equipo» y «Configuración» vuelven a **expulsar de Quality a PCR** |
| Invitaciones | El enlace vuelve a existir **una sola vez** y nadie puede aceptar con módulos en Full |
| Cargos | Desaparecen **Editar** y **Eliminar** |
| Documentos | Quality se queda **sin espacio documental** |

Las tres primeras afectan a la plataforma entera, no solo a Quality.

---

## Nivel 1 · Apagar el kill switch — segundos, sin pérdida de datos

Sigue siendo el mecanismo previsto para cualquier urgencia con Quality.

```bash
vercel env rm QUALITY_MODULE_ENABLED preview
# o conservando la variable:
printf 'false' | vercel env add QUALITY_MODULE_ENABLED preview
```

Después **redespliega**: las variables se leen al construir y arrancar.

| | |
|---|---|
| `/quality` y sus subrutas | **404** |
| Documentos de Quality | Intactos en la base, invisibles |
| Datos de Quality | Intactos |
| Resto de la plataforma | Sin efecto |

**Ojo:** esto NO revierte las correcciones transversales, y es deliberado. Las
invitaciones y la navegación siguen arregladas, que es lo que quieres.

---

## Nivel 2 · Revertir el código

```bash
git revert --no-commit e00f862
git commit -m "revert(quality): revertir QUALITY-01.1"
git push
```

o simplemente no mezclar la rama.

### Antes de hacerlo, tres avisos

**1 · Vuelve el fallo de las categorías.** El selector quedará vacío otra vez.
Si solo quieres revertir Documentos, conserva al menos esto:

```ts
// lib/db/quality-processes.ts · listQualityCategories
.select("code, name, description, sort_order, organization_id")
.order("sort_order", { ascending: true })
```

**2 · Vuelve el salto a PCR.** `resolveShellModuleForPath` deja de aceptar el
parámetro y `moduleAwareHref` desaparece.

**3 · Las invitaciones quedan a medias.** El código vuelve a mostrar el enlace
una sola vez, pero la corrección del plan vive en 0113 (SQL) y **no se revierte
con git**. Eso está bien: aceptar seguirá funcionando.

### Qué queda en la base

`module_key='quality'` sigue admitido y los documentos creados siguen ahí. No
molestan: sin código que los lea, ninguna consulta los devuelve. Si estorban,
aplica el nivel 3a.

---

## Nivel 3 · Revertir el esquema

Como en QUALITY-01, no hay migración inversa preescrita: la convención es
append-only, y una reversión escrita «por si acaso» se queda obsoleta sin que
nadie lo note. Si hiciera falta, se escribe como migración **nueva** (`0114_…`),
nunca borrando 0113.

### 3a · Devolver Quality a dos módulos documentales

> **Antes: comprueba si hay documentos de Quality.**
> ```sql
> select count(*) from trazadoc_documents where module_key = 'quality';
> ```
> Si no es cero, **detente**. Restringir la restricción con filas que la
> incumplen hace fallar la migración — y si primero las borras, se pierden.

```sql
-- 0114_quality_documents_rollback.sql
delete from public.trazadoc_documents where module_key = 'quality';  -- DESTRUCTIVO

alter table public.trazadoc_documents
  drop constraint if exists trazadoc_documents_module_key_check;
alter table public.trazadoc_documents
  add constraint trazadoc_documents_module_key_check
  check (module_key in ('cpr', 'textiles'));

alter table public.trazadoc_blueprints
  drop constraint if exists trazadoc_blueprints_module_key_check;
alter table public.trazadoc_blueprints
  add constraint trazadoc_blueprints_module_key_check
  check (module_key in ('cpr', 'textiles'));
```

Las relaciones en `quality_process_documents` se van solas: su FK a
`trazadoc_documents` es `on delete cascade`.

### 3b · Quitar el borrado de cargos

```sql
drop policy if exists quality_positions_delete on public.quality_positions;
```

Las FK `ON DELETE RESTRICT` no se tocan: son la barrera real y seguirían
protegiendo el historial igual.

### 3c · Devolver el trigger del catálogo a su forma original

```sql
create or replace function public.protect_global_quality_process_categories()
returns trigger language plpgsql as $$
begin
  if (tg_op in ('UPDATE','DELETE')) and old.organization_id is null then
    raise exception 'Las categorias de proceso del catalogo base de Trazaloop no se modifican ni se eliminan';
  end if;
  return coalesce(new, old);
end;
$$;
```

Consecuencia: **ninguna migración futura podrá mantener esos nombres.** Fue
exactamente el problema que 0113 resolvió.

### 3d · Devolver la aceptación de invitaciones al plan heredado

**No recomendado.** Restaurar la versión de 0056 devuelve un defecto real: una
empresa con módulos en Full podría crear invitaciones que nadie puede aceptar.

Si aun así hiciera falta, se copia el cuerpo de 0056 tal cual, sabiendo que se
está reintroduciendo ese comportamiento.

---

## Reversión de Production

**No aplica.** QUALITY-01 y QUALITY-01.1 nunca llegaron a Production:

| | |
|---|---|
| `0112` y `0113` en Production | **No aplicadas** |
| `QUALITY_MODULE_ENABLED` en Vercel Production | **No existe** |
| Código desplegado | **No** |
| Datos modificados | **Ninguno** |

Aunque el código llegara allí por un despliegue accidental, `/quality`
respondería 404 por ausencia de la variable.

**Un matiz que conviene tener presente:** la corrección de
`accept_team_invitation` está en 0113, que no se ha aplicado a Production. El
defecto del plan heredado **sigue vivo allí**. Cuando se promueva Quality, esa
corrección viaja con él; si antes apareciera el síntoma en Production —alguien
con módulos en Full que no puede aceptar una invitación— la §3 de 0113 es la
corrección, y puede promoverse por separado.

---

## Resumen

| Nivel | Acción | Tiempo | Pierde datos | Reversible |
|---|---|---|---|:---:|
| 1 | Apagar el kill switch | segundos | No | ✔ |
| 2 | Revertir el código | minutos | No | ✔ |
| 3a | Quitar el módulo documental | minutos | **Sí, los documentos de Quality** | ✘ |
| 3b | Quitar el borrado de cargos | minutos | No | ✔ |
| 3c | Trigger original del catálogo | minutos | No | ✔ |
| 3d | Plan heredado en invitaciones | minutos | No, pero **reintroduce un defecto** | ✔ |
