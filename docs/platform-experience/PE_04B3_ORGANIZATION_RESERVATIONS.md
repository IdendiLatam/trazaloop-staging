# PE-04B3 · La reserva de empresa

## Una sola primitiva

```sql
organization_storage_guard(p_organization_id, p_requested_bytes, p_already_counted_bytes)
```

1. Toma `pg_advisory_xact_lock('organization_storage:<org>')` — **un lock por
   empresa**, no por módulo.
2. Pide `organization_storage_status`.
3. `QUOTA_UNAVAILABLE` → lanza `STORAGE_UNVERIFIABLE` (si el uso no es
   verificable) o `STORAGE_QUOTA_UNVERIFIABLE` (plan ausente, ilegible o límite
   sin configurar).
4. `unlimited` → concede.
5. `confirmado + reservado − ya_contado + entrante > cuota` →
   `STORAGE_QUOTA_EXCEEDED`.

Los códigos de error son los que ya existían en T9F, de modo que el mapeo a
mensajes de `lib/db/storage-intents.ts` y `server/actions/textiles-evidences.ts`
sigue funcionando sin tocarse.

## `p_already_counted_bytes`

Es para lo que se **reemplaza**, y sin él el producto se rompería de una forma
poco obvia:

- **CPR** revive un intent sobre la misma ruta antes de comprobar la cuota, así
  que sus bytes ya están dentro de `reserved`. Se descuentan.
- **El logo** sustituye lo que la empresa tiene bajo su prefijo de
  `organization-assets`. Sin descontarlo, una empresa cerca del límite **no
  podría volver a cambiar su logo nunca**, aunque el nuevo pesara lo mismo.

## Quién la llama

| Camino | Cómo llega a la reserva |
|---|---|
| Evidencias PCR y TrazaDocs | `begin_cpr_storage_upload` → `organization_storage_guard(org, bytes, revivido)` |
| Evidencias Textiles | `begin_textile_evidence_upload_v2` → `organization_storage_guard(org, bytes, 0)` |
| Logo de empresa | `organization_storage_guard_logo` → `organization_storage_guard(org, bytes, prefijo_actual)` |
| Vista previa en la aplicación | `getModuleStorageUsage` / `checkStorageAvailable` → `organization_storage_status` |

La comprobación de la aplicación y la de la base miran ahora **el mismo
número**. Antes la aplicación consultaba el cupo del módulo y la base también,
pero cada módulo por separado; en cuanto la base pasó a exigir el cupo de
empresa, dejar la vista previa por módulo habría hecho que la pantalla dijera
que cabe y el servidor contestara que no.

## Orden de locks

Los dos caminos de módulo toman primero sus locks de módulo y **después** el de
empresa:

```
module_resource:<org>/<módulo>/<recurso>   (solo Textiles)
module_storage:<org>/<módulo>
organization_storage:<org>                 ← el nuevo, siempre el último
```

Ese orden es fijo y está escrito en las tres funciones. Con órdenes distintos,
una carga de PCR y otra de Textiles de la misma empresa podrían abrazarse.

## Lo que la reserva NO resuelve, dicho claro

El logo **no tiene intent**: se sube con `upsert` a una ruta fija y no hay
dónde anotar una reserva persistente sin inventarle un módulo (la tabla de
huérfanos exige `module_code` con clave foránea a `modules`). Lo que hace
`organization_storage_guard_logo` es exigir la misma cuota, bajo el mismo lock
y contra la misma contabilidad, justo antes de escribir.

Queda un hueco acotado y medido: dos subidas de logo simultáneas **de la misma
empresa** podrían pasar las dos y sobrepasar el cupo en, como mucho, 2 MB
(`MAX_LOGO_SIZE_BYTES`). Las dos escriben en el mismo prefijo y la segunda
sustituye a la primera, y el uso canónico mide ese prefijo **físicamente**, así
que ninguno de esos bytes queda sin medir: aparecen en el uso en cuanto se
escriben, y el siguiente intento se deniega. Es un desbordamiento transitorio y
visible, no una puerta lateral.

Lo que sí se cerró del todo es lo que era una puerta lateral de verdad: antes
el logo pasaba por `checkStorageAvailable`, que comparaba contra una vista sin
versiones, sin reservas y sin huérfanos, con el límite legacy traducido por el
puente `free→demo` — y sus bytes no aparecían en la contabilidad que usaban PCR
y Textiles para decidir.
