# QUALITY-13B1 · CONTEXTO DE PROCESO

`lib/db/quality-process-context.ts` · `lib/db/quality-position-context.ts`

---

## 1 · La pregunta

> ¿Qué está relacionado con el proceso X?

Veinticinco tablas guardan `process_id` y hasta hoy no había forma de preguntárselo a
todas a la vez. Esto lo hace, y hace solo eso: **lee**.

---

## 2 · Las nueve secciones, y de dónde sale cada una

| Sección | Tabla | Recuento de atención |
|---|---|---|
| Requisitos de partes interesadas | `quality_stakeholder_requirement_processes` (solo vigentes) | — |
| Riesgos | `quality_risk_processes` → `quality_risks` | los que siguen activos |
| Oportunidades | `quality_opportunity_processes` | — |
| Objetivos | `quality_objective_processes` | — |
| Indicadores | `quality_indicators.scope_process_id` | — |
| Documentos | `quality_process_documents` | — |
| Hallazgos de auditoría | `quality_audit_findings.process_id` | los **sin evaluar** |
| Casos y acciones | `work_case_processes` → `work_cases` | los que no están cerrados |
| Competencias requeridas | `quality_competency_requirements.process_id` | — |

**Solo dominios con relación real.** Proveedores, clientes, partes interesadas como
sujeto, personas y revisión por la dirección **no** guardan `process_id` y no se les
inventa (QI-03).

---

## 3 · Lo derivado (QI-23)

No existen `supplier_processes` ni `complaint_processes`, y no se van a crear.

**`deriveSupplierProcesses`** llega al proceso por dos caminos ciertos:

1. los **incidentes** del proveedor que se convirtieron en caso, y ese caso sí declara
   sus procesos;
2. los **enlaces periféricos** que alguien haya declarado desde el perfil o el alcance
   —`work_references`—, que es la vía que QI-23 autoriza.

**`deriveComplaintProcesses`** llega por el **caso** que la queja generó.

Cada resultado dice **por qué camino llegó** (`via`). Una relación derivada que no
explica su origen es indistinguible de una inventada.

Y cuando no hay nada que derivar, **se devuelve vacío**. No se adivina: comprobado en la
suite con un proveedor sin incidentes y con una queja sin caso.

Un detalle que importa: si la RLS no devuelve el nombre del proceso, ese proceso **no se
enseña**. Un identificador suelto no es un destino.

---

## 4 · Aislamiento de fallo

Cada sección se envuelve y responde por sí misma:

| Qué pasa | Qué devuelve |
|---|---|
| se leyó | `ok` con su recuento, aunque sea 0 |
| falló la lectura | `unavailable`, `count: null`, y **el motivo** |
| el rol no llega a ese dominio | `not_visible`, `count: null` |

Comprobado rompiendo **una** lectura y viendo que las otras ocho siguen; y denegando
**una** y viendo que llega como `not_visible` y no como cero.

La identidad del proceso sí es crítica: si no se puede leer, se devuelve `null` y quien
llame responderá 404. Componer secciones de un proceso que no se sabe si existe sería
peor que fallar.

---

## 5 · Coste

Nueve secciones, **entre una y dos consultas cada una**, todas en paralelo. Los
recuentos los hace la base con `head: true`; las muestras van con `limit`.

Medido en la suite: **mismo número de consultas con 1 riesgo que con 41**, y la muestra
no crece.

---

## 6 · El contexto de cargo

Deliberadamente más pequeño: cuatro secciones —procesos que dirige, riesgos a su cargo,
objetivos a su cargo y estrategias de relacionamiento— que son las cuatro donde la
propiedad por **cargo** está modelada de forma directa.

Competencias, auditorías y acciones se añadirán cuando B2 o B4 las consuman. Construir de
más antes de tener quien lo use es la forma más cara de equivocarse; lo que importaba en
B1 era dejar el contrato limpio para que ampliarlo sea añadir una función.

**No se creó ningún campo de propiedad nuevo.** Se leen los que ya existen, que en este
repositorio son siempre de cargo y nunca de persona.
