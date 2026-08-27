# QUALITY-10 · Reversión

## 1 · Qué se puede revertir sin tocar la base

Todo lo visible. El dominio es **aditivo**: ninguna pantalla anterior cambió de
comportamiento.

| Paso | Efecto |
|---|---|
| Quitar `QUALITY_REVISION_DIRECCION_GROUP` de `lib/modules/registry.ts` | Desaparece del menú de Quality |
| Revertir el commit de QUALITY-10 | Desaparecen rutas, pantallas, acciones y los ocho papeles |
| No desplegar | El Preview no está promovido ni tiene alias |

Las tablas quedan vacías y sin puerta. Nada de lo anterior deja de funcionar.

## 2 · Qué NO se debe revertir en la base

`0128_quality_management_review.sql` es **append-only**. No se edita una vez
aplicada a Staging, no se repara y no se hace `drop`.

Si hiciera falta una corrección, la forma es **`0129`**, aditiva, con su propia
validación local completa antes de tocar Staging.

## 3 · Lo que la migración tocó fuera de su dominio

Ampliaciones de catálogo del motor transversal —siempre `drop constraint` +
`add constraint` con el conjunto anterior **más** los valores nuevos—:

| Tabla | Qué se añadió |
|---|---|
| `work_tasks` | 5 tipos de tarea · dominio `management_review` · 3 tipos de asunto |
| `work_alerts` | 6 tipos de aviso · dominio `management_review` |
| `work_events` | dominio, 3 tipos de asunto y 6 tipos de evento — **y la reparación de §4** |
| `work_decisions` | 2 clases de asunto · 3 clases de decisión |
| `work_references` | 3 clases de dueño · 3 clases de referencia |
| `work_reference_must_be_valid()` | reescrita para admitir las referencias nuevas |
| `quality_deletion_eligibility()` | reescrita para admitir `management_review` — **conservando** las guardas heredadas |

Revertir cualquiera de esas ampliaciones rompería filas ya escritas. Si algún
día se retira QUALITY-10, la vía es dejar de escribir esos valores, no quitarlos
del catálogo.

## 4 · La reparación de `work_events_type_check`

0128 reescribe el catálogo de tipos de evento. Al hacerlo se detectó —con la
suite contra base real— que la versión que se estaba escribiendo **estrechaba**
el conjunto: diecinueve tipos que migraciones anteriores insertan de verdad
quedaban fuera, y publicar una versión de encuesta empezaba a fallar.

El catálogo final es la **unión completa**: lo que declaraba 0127, lo que
cualquier migración inserta de verdad, y los seis nuevos. Ochenta y dos tipos.

Una comprobación automática, ejecutada sobre el árbol, verifica que **ninguno**
de los doce catálogos transversales se estrechó respecto de 0127. Si algún
sprint futuro reescribe uno de ellos, esa comprobación es el lugar donde
mirarlo antes de aplicar.

## 5 · Datos

La migración **no siembra datos de negocio**: lo único que inserta es el
catálogo de las catorce entradas, que es estructura. No reescribe datos de otros
módulos.

Lo único escrito en Staging son los datos efímeros de la suite, ya retirados
lógicamente (`QUALITY_10_STAGING_VALIDATION.md` §6).

## 6 · Production

No se tocó. Cabecera **0111**, sin migraciones, sin datos, sin variables, sin
despliegue.
