# QUALITY-06.1 · Onboarding del sistema de gestión

Cierra **GAP-1** de QUALITY-06 (PC-10, criterio 56).

## 1 · Qué es, y qué NO es

Es la respuesta a una pregunta concreta: *cuando esta persona asumió este cargo,
¿qué tenía que saber, qué se le exigía y qué quedó pendiente?*

No es una inducción corporativa, ni un expediente laboral, ni un flujo de
contratación. No aparece nómina, contrato, salario, beneficios, información
médica ni disciplina — y una prueba recorre las tres capas buscando esas
palabras.

## 2 · No hay dominio nuevo

**Cero migraciones.** No existe tabla de onboarding, ni columna de estado, ni
checklist almacenado. Todo se deriva de lo que QUALITY-06 ya guarda:

| Lo que se muestra | De dónde sale |
|---|---|
| Cargo, vínculo y fechas | `quality_position_assignments` |
| Perfil aplicable | `quality_position_versions`, resuelto por `quality_position_version_on(fecha)` |
| Responsabilidades y autoridades | `quality_position_functions` de esa versión |
| Procesos | `quality_processes.owner_position_id` ∪ los que nombran las funciones |
| Documentos | `trazadoc_documents.owner_position_id` ∪ `quality_process_documents` de esos procesos |
| Competencias | `quality_competency_requirements` de esa versión × `quality_demonstrated_level_on(fecha)` |
| Desarrollo | `quality_development_needs` y `_plan_items` de la persona o del cargo |
| Conocimiento | `quality_knowledge_items.process_id` ∈ procesos, cruzado con holders y transferencias |
| Tareas | `work_tasks` abiertas del cargo o de la persona |

Una prueba comprueba que la capa de datos **solo lee**: sin `insert`, `update`,
`delete` ni `upsert`.

## 3 · El perfil correcto, no el último

El perfil aplicable se resuelve por la **fecha efectiva de la asignación**. Si
alguien entró bajo la v1 y hoy rige la v2, su onboarding sigue siendo el de la
v1: es lo que se le pidió, y publicar un perfil nuevo no cambia lo que se le
pidió entonces.

Y si una asignación empieza el día que entra en vigor una versión nueva, toma
esa versión — es la misma regla leída hacia adelante.

Cuando hoy rige otra versión, la pantalla y el PDF lo dicen y añaden una columna
**«Hoy se exige»** al lado de lo que se exigía. Se distingue; no se sustituye.

## 4 · Solo relaciones reales

Cada proceso y cada documento llevan escrito **por qué aparecen**:

- *El cargo es su propietario*
- *Por un proceso del cargo*
- *Por una función del perfil*

No existe la regla «todo empleado debe leer todos los documentos». Habría
producido una lista de cien documentos que nadie mira, y habría sido una
invención: el sistema no sabe eso de nadie.

## 5 · El checklist no miente

Trazaloop **no registra confirmación de lectura** de documentos. Así que el
onboarding no tiene ninguna casilla «leído». Los documentos se listan con una
marca informativa (`·`), no como pendientes, y la pantalla y el papel explican
por qué:

> Trazaloop no registra confirmación de lectura de documentos, así que estos no
> se cuentan como pendientes: se listan para que se sepa cuáles son.

Un checklist con casillas que nadie puede sostener se firma, se archiva y deja
de servir. Los cuatro estados son `✓` hecho · `!` requiere atención · `○`
pendiente · `·` informativo, y **cada línea declara de qué entidad sale**.

## 6 · Sin estado agregado inventado

No se dice «completo» ni «incompleto»: no existe una regla formal de
completitud, y afirmarla sería inventarla. Se dice cuántos pendientes hay y de
qué tipo:

> Pendientes del sistema de gestión: 4 — 1 brecha(s) de competencia, 1
> acción(es) de desarrollo, 2 tarea(s) abierta(s).

El total es la suma de sus partes y una prueba lo comprueba.

## 7 · Persona sin usuario

Funciona completo. La consulta de tareas cae al filtro por cargo cuando la
persona no tiene cuenta, y la ficha, el perfil, las competencias, el desarrollo
y el conocimiento se derivan igual. La pantalla y el PDF dicen «sin cuenta de
Trazaloop», que es información, no un defecto.

## 8 · Desarrollo: se ofrece, no se crea

Si hay brechas sin desarrollo asociado, la pantalla ofrece **crear la
necesidad** — con su competencia y su motivo — como acción humana explícita. La
capa de datos no la crea: una prueba comprueba que `createNeedAction` no aparece
en `lib/db/quality-onboarding.ts`.

## 9 · Tareas: se muestran, no se fabrican

Se listan las tareas que ya existen en el motor transversal. El onboarding **no
crea una `work_task` por cada línea visual**, y una prueba lo verifica.

## 10 · Dónde se abre

| Desde | Qué enlaza |
|---|---|
| Ficha de persona | El onboarding de **cada** asignación, incluidas las cerradas |
| Ficha del cargo | El onboarding de cada ocupante vigente |

Ruta: `/quality/people/[personId]/onboarding/[assignmentId]`. La página
comprueba que la persona de la ruta sea la de la asignación: no se puede abrir
el onboarding de alguien desde la ficha de otra persona.

## 11 · PDF

`quality.onboarding.detail` · **«Onboarding del sistema de gestión»** ·
encabezado corporativo con logo, empresa y nombre del documento en todas las
páginas. Contiene persona, cargo, fecha efectiva, perfil aplicable,
responsabilidades, procesos, documentos, competencias, desarrollo, conocimiento,
tareas y pendientes.

Lleva el aviso de privacidad —un PDF no lleva consigo los permisos que lo
produjeron— y el aviso de que no se registra confirmación de lectura.
