# PE-04B3 · Reconciliación · lo que la base cree frente a lo que Storage tiene

## Qué es y qué no es

`organization_storage_drift(org)` compara, empresa a empresa, lo que las tablas
declaran con lo que hay realmente en los buckets. **Solo informa.** No borra,
no corrige y no cambia ninguna cuota. Corregir a ciegas un desajuste de
almacenamiento es como se pierden archivos de clientes.

Solo puede ejecutarla personal de plataforma (`is_platform_staff()`).

## Las cinco clases

| Clase | Qué significa | Qué hacer |
|---|---|---|
| `MISSING_OBJECT` | La base declara un archivo y en Storage no está | Investigar antes de tocar la fila: puede ser una carga que falló a medias o un borrado que solo se aplicó a un lado. Nunca borrar la fila «para limpiar»: es lo que el cliente ve. |
| `UNTRACKED_OBJECT` | Storage tiene un objeto que ninguna fila declara ni ampara | Candidato a huérfano. Registrar con el ciclo de `storage_orphan_candidates` (que ya lo contabiliza) antes de retirarlo. |
| `UNKNOWN_SIZE` | El objeto existe pero su metadata no dice cuánto ocupa | Bloquea cargas nuevas por diseño. Se resuelve releyendo el tamaño real del objeto. |
| `UNDECLARED_SIZE` | La fila existe pero no declara tamaño | Igual: se rellena con el tamaño físico, nunca con cero. |
| `SIZE_MISMATCH` | Los dos lo dicen y no coinciden | El físico manda. La contabilidad ya usa el mayor de los dos (A06), así que nunca concede capacidad de más. |

Un objeto amparado por un intent vigente o por un candidato huérfano **no es
deriva**: está contabilizado y tiene dueño conocido. Se excluye a propósito
para que el informe sea legible.

## La herramienta

```
npx tsx --conditions=react-server scripts/pe04b3/reconciliacion.ts \
  --email <persona-de-plataforma> --password <clave>
  [--org <uuid>]
```

Adopta la identidad de una persona de plataforma real, igual que la sombra de
PE-04B1, y por la misma lección: la función es `security definer` y comprueba
`is_platform_staff()`. Con la clave de servicio (sin `auth.uid()`) devolvería un
error, y sin identidad ninguna devolvería **cero filas**, que se lee como «todo
en orden» y es la peor de las respuestas posibles.

Las empresas cuya lectura falla se cuentan aparte, en `ILEGIBLES`. No se suman
a «sin desajustes».

## Estado en local

En la base local no hay objetos en Storage (`storage.objects` está vacío), así
que la herramienta no tiene deriva real que enseñar. Lo que sí está demostrado
ejecutando es la clasificación: una fila declarada sin objeto sale como
`MISSING_OBJECT` y un objeto amparado por un intent vigente no sale
(`pe04b3-organization-storage`, F1 y F2). La primera pasada con datos reales
corresponde hacerla en Staging.
