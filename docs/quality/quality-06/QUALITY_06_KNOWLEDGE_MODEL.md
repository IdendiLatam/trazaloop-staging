# QUALITY-06 · Modelo de conocimiento

## 1 · El conocimiento es un objeto, no un archivo

PC-18. Un elemento de conocimiento puede ser explícito, tácito o mixto. Ejemplos
reales: el procedimiento especial de calibración, la configuración histórica de
una máquina, el trato con un proveedor crítico, el método de reconciliación.

Existe **aunque nadie lo haya escrito nunca**. Por eso
`documentation_status` es una columna aparte —sin documentar / parcialmente
documentado / documentado— y no un `document_id` obligatorio: si el modelo
exigiera un archivo, la mitad del conocimiento crítico de una planta quedaría
fuera del sistema por definición.

## 2 · HOLDER, no dueño

PC-19. La persona **sostiene** el conocimiento; no es su dueña. El conocimiento
pertenece a la empresa y a su sistema de gestión.

Eso tiene tres consecuencias concretas:

1. la tabla se llama `quality_knowledge_holders`, no `_owners`;
2. perder a la persona no borra el elemento;
3. `is_primary_holder` es **explícito**. Un elemento puede tener varios holders
   vigentes; lo que no puede tener son dos «responde primero» a la vez, y nadie
   lo adivina mirando el primero de una lista (§17).

Cada registro lleva `since_on`/`until_on`, así que se puede responder quién lo
sostenía en una fecha.

## 3 · Señal de continuidad, no riesgo

PC-20 + §44/§45. Cuando un conocimiento **crítico o alto** depende de una sola
persona —o de ninguna— aparece una señal:

> «Conocimiento crítico concentrado en una sola persona.»

El sujeto de la frase es el conocimiento. En ninguna parte del producto se dice
que una persona sea un riesgo, y una prueba recorre las etiquetas para
comprobarlo.

La señal:

- se calcula desde `v_quality_knowledge_continuity`;
- es **idempotente**: un índice único deja una señal abierta por elemento y tipo,
  y el segundo barrido mueve `last_seen_at` en vez de crear una fila;
- se **resuelve sola** cuando el conocimiento deja de estar concentrado;
- **no** abre una no conformidad ni crea un riesgo formal.

## 4 · Promover a riesgo es una decisión humana

`quality_promote_knowledge_signal(señal, riesgo)` enlaza una señal con un riesgo
**que alguien ya escribió** —con su metodología y su evaluación, como cualquier
otro— y registra quién lo decidió y cuándo. El barrido nunca inserta en
`quality_risks`, y el escenario G de la suite RLS comprueba que tras el barrido
haya cero casos y cero riesgos.

## 5 · Transferencia

Para el conocimiento crítico, `quality_knowledge_transfer_plans` guarda holder
de origen, método, objetivo y fecha; `_items` guarda cada actividad con su
receptor y su evidencia.

**Verificar es un acto aparte de ejecutar.** La RPC exige que no queden
actividades sin cerrar y que la verificación diga *en qué se comprobó que el
conocimiento pasó*. Haber hecho las actividades no demuestra que pasara: esa es
precisamente la afirmación que un plan de transferencia tiene que sostener.

## 6 · Offboarding

`quality_offboarding_report(empresa, persona)` responde, **antes** de cerrar la
puerta:

- qué cargos quedarían sin titular, y cuáles de ellos son críticos;
- qué conocimiento crítico quedaría sin cobertura;
- qué transferencias siguen abiertas;
- qué tareas quedan a su nombre.

Solo informa. No borra a la persona, no cierra tareas y no reescribe sus actos
históricos. La ficha muestra este informe junto al botón de desvincular, que es
el momento en que sirve.

## 7 · Lecciones aprendidas

PC-21. Una lección es un objeto gestionado, con cuatro columnas separadas: qué
ocurrió, qué se aprendió, dónde aplica, qué se recomienda cambiar. Colapsarlas en
un único `description` es exactamente como se pierden las lecciones.

Puede nacer de un caso, una acción, un riesgo materializado, una auditoría, un
proyecto, un proceso, un incidente, una mejora, o registrarse directamente.

## 8 · La lección PROPONE; no cambia nada

§48. `quality_lesson_proposals` guarda cada propuesta con su tipo, su objetivo
—documento, proceso, competencia, cargo— y su estado.

Aceptarla **no** modifica el documento ni crea la formación: deja escrito que se
aceptó, quién y cuándo. Cuando alguien crea de verdad la acción, la tarea, la
necesidad de desarrollo o la revisión documental, se anota en
`outcome_kind`/`outcome_id`.

Esa pareja de columnas es lo que hace que «la lección cambió el procedimiento»
sea comprobable en vez de una creencia. El escenario I de la suite RLS cuenta los
documentos y las actividades antes y después de aceptar una propuesta, y
comprueba que no cambie nada.
