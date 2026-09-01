# PE-04B3 · Bajar de plan y quedarse por encima del límite

## La regla

**Bajar de plan o caducar una prueba NUNCA borra datos del cliente.** Lo único
que cambia es la cuota; los archivos siguen donde estaban y se pueden seguir
leyendo, descargando y borrando.

## Qué se puede hacer estando por encima del límite

| Acción | ¿Permitida? | Por qué |
|---|---|---|
| Leer y listar | **sí** | Los datos son del cliente |
| Descargar | **sí** | Idem — y es lo que necesita para llevárselos |
| Borrar | **sí**, y además es la salida | Borrar es lo que le devuelve capacidad |
| Subir algo nuevo | **no** | `organization_storage_guard` lo deniega |
| Reemplazar un archivo | **no** mientras no quepa | Un reemplazo es un objeto nuevo (A03) |

Estar `OVER_LIMIT` es un estado normal del producto, no un error: se llega ahí
simplemente dejando de pagar. El producto lo dice, no lo castiga.

## Por qué el suelo es Free y no «sin plan»

Una prueba caducada no deja a la empresa sin plan: cae a su base Free, que
tiene 50 MiB. Modelar la prueba como un cuarto plan habría dejado a la empresa
sin nada al caducar, y «sin nada» niega. Está en `PE_04B2_FREE_TRIAL_LIFECYCLE.md`
y aquí solo se hereda.

## Nada en 0164 borra nada

La migración no contiene `drop table`, `truncate` ni ningún `delete from` sobre
tablas de cliente, y hay una prueba estática que lo comprueba
(`pe04b3-storage-static`, A4). La prueba de ejecución cuenta los objetos de la
empresa antes y después de bajar de Full a Free y exige que el número sea el
mismo (`pe04b3-organization-storage`, D1), y comprueba además que un intento de
subida denegado tampoco toca nada (D2).

## Volver a subir de plan

Devuelve la capacidad al instante y sin migrar nada: la cuota se **resuelve**
en cada consulta a partir de la asignación vigente, no se copia a ninguna parte.
Comprobado en D3.
