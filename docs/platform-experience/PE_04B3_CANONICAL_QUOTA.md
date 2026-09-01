# PE-04B3 · La cuota canónica

## Una sola cuota, de la empresa

`storage_bytes` ya estaba declarado en 0162 con `scope = 'organization'`. Lo que
faltaba era que el producto lo respetara. Desde 0164:

| | Antes | Ahora |
|---|---|---|
| Alcance | por módulo (PCR y Textiles, cada uno el suyo) + el logo por libre | **una empresa, un cupo** |
| Fuente del límite | `plan_definitions.storage_limit_bytes` por `access_mode` del módulo | `plan_revision_limits.storage_bytes` de la revisión vigente |
| Fuente del uso | `module_storage_snapshot` (por módulo) o `v_organization_plan_usage` (incompleta) | `organization_storage_usage` |
| Traducción de plan | puente `free → demo` | ninguna |

Valores congelados en PE-04B2, sin cambios aquí:

| Plan | Bytes | |
|---|---|---|
| Free | 52 428 800 | 50 MiB |
| Full | 524 288 000 | 500 MiB |
| Extra | 5 368 709 120 | 5 GiB |

La prueba usa **almacenamiento de Full**, y sale gratis: la prueba no es un
cuarto plan, es una concesión temporal de Full (PE-04B2), así que el resolutor
devuelve `full` y con él sus 500 MiB. No hay una regla aparte que mantener.

## Las tres funciones

```
organization_storage_usage(org)   → solo USO. No sabe nada de planes.
organization_storage_quota(org)   → solo CUOTA. No sabe nada de bytes usados.
organization_storage_status(org)  → las junta y da el ESTADO.
```

Separarlas no es estética: mientras uso y cuota se calculaban juntos en cada
sitio, cada sitio podía equivocarse por su cuenta, y eso es exactamente lo que
pasaba.

## Qué cuenta y qué no

**Cuenta** (deduplicado por `(bucket, ruta)`, quedándose con el tamaño mayor):
evidencias PCR · documentos TrazaDocs · **versiones históricas de TrazaDocs** ·
evidencias Textiles · el prefijo físico del logo en `organization-assets` ·
huérfanos no retirados · intents sin resolución confirmada · reservas vivas.

**No cuenta**: `tutorial-media`, que es contenido de la plataforma. No se le
cobra a ninguna empresa y no aparece en ninguna de las funciones.

El logo se mide **físicamente** (todo el prefijo `{org}/` del bucket) en vez de
por la columna declarada, y por una razón concreta: la ruta del logo lleva la
extensión, de modo que sustituir un PNG por un WEBP dejaba el PNG anterior en
el bucket sin fila que lo referenciara. `organization-assets` no tiene
mecanismo de huérfanos —`storage_orphan_candidates` solo admite los dos buckets
de módulo, y su `module_code` es obligatorio— así que medir el prefijo es la
única contabilidad posible. La aplicación además retira esos restos al subir un
logo nuevo; si el borrado fallara, los bytes siguen contando.

## Los tres estados del límite

`limit_state` viene de `plan_limit_for_revision` y tiene tres valores:

- `finite` — hay un número.
- `unlimited` — no hay tope. Se representa en TypeScript con `Infinity`, nunca
  con `0` ni con `null`.
- `not_configured` — **nadie lo ha decidido**, y **niega**. No es «ilimitado»
  ni «cero»: es que no se sabe, y no se autoriza sobre lo que no se sabe.

## Los cuatro estados del producto

| Estado | Cuándo | Se puede subir |
|---|---|---|
| `WITHIN_LIMIT` | usado < cuota, o cuota ilimitada | sí |
| `AT_LIMIT` | usado = cuota exactamente | no |
| `OVER_LIMIT` | usado > cuota | no |
| `QUOTA_UNAVAILABLE` | no se puede afirmar capacidad | no |

`QUOTA_UNAVAILABLE` lleva siempre una `reason`, porque «no se pudo» tiene
cuatro causas distintas y confundirlas impide arreglarlas:

- `plan_absent` — la empresa no tiene ninguna asignación vigente.
- `plan_unreadable` — el resolutor no pudo contestar.
- `limit_not_configured` — la revisión no declara `storage_bytes`.
- `usage_unverifiable` — hay objetos de tamaño desconocido o contradictorio.

`remaining_bytes` nunca es negativo: por encima del límite lo que queda es
cero, no una deuda.

## Fail-closed

Un fallo de lectura **niega**, y el mensaje dice que fue un fallo de lectura,
no que el plan no lo permita. Decirle «te quedaste sin espacio» a quien tiene
espacio es la misma familia de defecto que hacer leer «Plan Demo» a un cliente
Full, y se corrige igual: el `null` de una lectura fallida no se convierte en
el valor más bajo.
