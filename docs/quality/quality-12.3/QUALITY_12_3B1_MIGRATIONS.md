# QUALITY-12.3B1 · Migraciones

## Una sola: `0149_quality_interested_parties_core.sql`

No se fragmentó. La arquitectura permitía separar catálogos de dominio, pero
los catálogos de este dominio —categorías y grupos— son **sujetos** del
análisis: partirlos en dos migraciones habría dejado una mitad sin las claves
foráneas que le dan sentido, y la segunda sería obligatoria para que la primera
sirviera de algo. Eso no es separación, es un corte arbitrario.

| # | Sección | Qué hace |
|---|---|---|
| 1 | Permiso | `quality_manages_interested_parties(uuid)` |
| 2 | Categorías | taxonomía 4.2 por empresa |
| 3 | Grupos | colectivos internos y genéricos |
| 4 | Análisis | el núcleo, con sujeto de dos tipos y modelo temporal |
| 5 | Requisitos | necesidad / expectativa / requisito + guardián de origen |
| 6 | Requisito → proceso | relación core |
| 7 | Estrategias | con dueña cargo |
| 8 | Estrategia → requisito | relación core + guardián de mismo análisis |
| 9 | Revisiones | append-only |
| 10 | Historical Truth | guardianes de sucesión e inmutabilidad |
| 11 | RLS y privilegios | ocho tablas, sin DELETE por ninguna vía |
| 12 | Semilla | 15 categorías, idempotente |
| 13 | Reversión | documentada, en orden de dependencia, sin `cascade` |

## Reglas respetadas

- **Append-only.** Ninguna migración histórica modificada (verificado con
  `git diff --name-status`: 0149 aparece como **A**).
- **Sin `drop … cascade`.** Ni uno, tampoco en el bloque de reversión: el
  orden de dependencia está escrito para que un borrado que arrastre algo falle
  y lo diga.
- **Sin tocar otros dominios.** La migración no tiene un solo `alter table`
  sobre una tabla que no sea suya. Comprobado por la prueba 17.
- **Autorizada** en las 17 listas blancas del proyecto.

## Reversión

El bloque final de la migración la documenta entera, en orden de dependencia.
Las ocho tablas **nacen vacías**: revertir antes de que nadie registre nada no
pierde nada. Después, sí.

## Estado por entorno

| Entorno | Cabecera |
|---|---|
| Local (reejecución limpia 0001→0149) | **0149** |
| Staging `qchzkxbnbqeyuxinipln` | **0149**, cero pendientes |
| Production | **0111**, 38 migraciones pendientes, **ninguna 0112+ aplicada** |

Production se verificó **solo leyendo** (`supabase migration list`). Sin
despliegue, sin migración, sin cambios de entorno. Repo remote-unlinked al
terminar; `git origin` intacto.

## Nota de operación

Tras aplicar en Staging, PostgREST devolvió **404** en las ocho tablas durante
unos segundos: es su caché de esquema, que se refresca sola. No es un fallo de
la migración y no requiere intervención — pero conviene saberlo antes de
diagnosticar un problema que no existe.
