# QUALITY-13A · HUECOS DE DATOS Y DE APLICACIÓN

Cada hueco lleva su clase, su evidencia y su coste. Las clases son las del encargo:

**A** modelo de datos · **B** dominio/aplicación · **C** UX/navegación ·
**D** automatización · **E** Intelligence · **F** salidas/PDF · **G** documentación/copy ·
**H** experiencia de plataforma (diferido, **no** es un bloqueador de Quality).

---

## G-01 · `work_references` no admite propietarios de planificación · **A**

`owner_kind` tiene 32 valores y ninguno es `process`, `objective`, `indicator` o
`document`. Consecuencia: un objetivo no puede declarar «respondo a este requisito de
parte interesada», un riesgo no puede decir «nací de esta parte», y una auditoría no
puede tomar un requisito como criterio.

**Coste:** ampliar un CHECK y añadir ramas al disparador `work_reference_must_be_valid`,
exactamente como hizo 0150. Sin tabla nueva.

**Cuidado:** al ampliar hay que cerrar las parejas que son relaciones centrales, como ya
se hizo con estrategia→requisito. Objetivo→proceso, por ejemplo, **ya** tiene tabla
propia (`quality_objective_processes`) y no puede entrar por la vía genérica.

---

## G-02 · No existe superficie de proceso · **B + C**

Veinticinco tablas guardan `process_id` y no hay **ni una vista** `v_quality_process_*`
—todos los demás dominios tienen su `_overview`—, ni sección alguna en la ficha de
proceso que muestre riesgos, indicadores, hallazgos, casos o requisitos.

**Coste:** un cargador compuesto en `lib/db` que reúna los recuentos por proceso, y
secciones en la ficha. **No hace falta migración**: son lecturas.

**Trampa a evitar:** una vista que una quince tablas. Mejor un cargador que hace N
consultas acotadas en paralelo —el patrón que ya usa el paquete de contexto de
Intelligence— que una mega-vista cuyo plan de ejecución dependa de la tabla más pequeña.

---

## G-03 · Cinco verdades sobre la atención · **D**

Cuatro tablas de señales de dominio (`quality_risk_signals`, `_supplier_signals`,
`_customer_signals`, `_knowledge_signals`) conviven con `quality_signals`, y ocho
barridos heredados corren junto al ejecutor único.

**El mecanismo de convergencia ya existe**: `quality_automation_rules.supersedes_observer`,
usado hoy por **dos** plantillas de ocho posibles.

**Coste:** plantillas equivalentes para los seis barridos restantes, y que cada una
declare a quién releva. Sin motor nuevo, sin tabla nueva.

**Lo que NO hay que hacer:** una tabla `quality_attention` que copie las cinco. Sería la
sexta verdad.

---

## G-04 · La portada no compone, agrega · **B + C**

Doce llamadas independientes, cada una con su forma de contar, sin contrato común, sin
partes interesadas y sin enlace a la fila concreta.

**Coste:** un contrato único de «punto de atención» —dominio, sujeto, severidad, desde
cuándo, enlace— y un cargador que lo alimente desde las fuentes que ya existen. Es
composición, no un motor.

**Riesgo real:** doble conteo. Un indicador fuera de meta puede aparecer como señal de
automatización *y* como línea de desempeño. La deduplicación tiene que hacerse por
sujeto, no por dominio.

---

## G-05 · Proveedores y clientes no declaran proceso · **B** · *decidido en 13A.1*

Ni `quality_supplier_scopes` ni `quality_customer_feedback` tienen relación con proceso.
El caso que nace de una queja sí la tiene (`work_case_processes`).

**Decisión humana (13A.1): no se crean relaciones core nuevas.** Ni
`supplier_processes`, ni `complaint_processes`, ni equivalentes. La relación se
**deriva** de las verdades operativas que ya existen:

- *proveedor → proceso*: por lo que suministra —el alcance, la categoría, y el caso o el
  incidente que lo toca—;
- *queja → proceso*: por el caso que genera, que sí declara sus procesos.

**Y si en algún punto hace falta declararla explícitamente**, se usa el mecanismo
transversal —`work_references`— y no una tabla nueva. Con la salvedad de siempre: si la
relación llegara a necesitar **vigencia propia**, entonces ya no es periférica y la
conversación cambia (QI-13).

**Por qué es la decisión correcta y no un atajo:** una tabla `supplier_processes` sería
una segunda verdad que alguien tendría que mantener a mano, y que se separaría de la
primera —lo que el proveedor realmente suministra— en cuanto cambiara un alcance. Crear
estructura para simplificar una pantalla es exactamente cómo nacen los datos que nadie
actualiza.

**Se reabre solo si aparece un caso real** que no se pueda ni derivar ni expresar como
enlace periférico. Hasta entonces, esto queda cerrado.

**Efecto en la matriz:** las dos celdas pasan de FALTA a PARCIAL. No porque el problema
desaparezca, sino porque deja de ser un hueco de modelado y pasa a ser trabajo de
derivación y de pantalla.

---

## G-06 · Procesos sin fuente de automatización · **D**

No se puede observar un proceso: ni «sin cargo propietario», ni «sin revisión en X
meses», ni «con más de N hallazgos abiertos».

**Coste:** una fuente más y una rama en `quality_automation_subjects`, igual que 0151.
**Sí necesita migración**, y es la única de esta lista que la necesita con seguridad.

---

## G-07 · Intelligence no compone dominios · **E**

Cada adaptador lee lo suyo. «¿Qué procesos concentran riesgos y acciones abiertas?» no
tiene respuesta porque nadie cruza.

**Coste:** un adaptador de proceso enriquecido que reutilice el cargador de G-02. No hay
que tocar el proveedor, ni el presupuesto, ni los límites.

---

## G-08 · Historia desigual, y en parte correctamente · **B**

Ocho fuentes responden `as_of`, ocho por periodo y ocho solo el presente. Para
documentos, cargos, riesgos y partes interesadas la reconstrucción es real. Para
objetivos, auditorías y voz del cliente es por periodo, que **para esos dominios puede
ser suficiente**: una campaña de escucha ES un periodo.

**Lo que sí es un hueco:** que no esté dicho en pantalla. Un panel que mezcle un dato
`as_of` con uno `current` sin etiquetarlo repite el defecto que 12.3 corrigió.

---

## G-09 · Tarea propia de dominio ≠ acción transversal · **B** · *decidido en 13A.1*

`quality_development_plan_items` tiene título, responsable, fecha objetivo y estado
propios, fuera de `work_actions`.

**Decisión humana (13A.1): correcto, y se congela como principio.**

> **TAREA PROPIA DE DOMINIO ≠ ACCIÓN TRANSVERSAL.**

Una capacitación, una verificación de eficacia o una actividad de desarrollo pueden
seguir siendo objetos de Personas. `work_actions` se usa cuando hay una acción
transversal explícita que gestionar conforme a AC-01…AC-35, no como envoltorio universal
de todo lo que tiene fecha y responsable.

Puede **relacionarse** con una acción transversal cuando corresponda —y ahí está
`work_references`— pero **no se duplica automáticamente**. Duplicar por sistema
convertiría la bandeja de acciones en un calendario de formación y haría irreconocible
lo que de verdad es una acción correctiva.

Deja de ser una omisión y pasa a ser una decisión: **QI-24**.

---

## G-10 · «Desempeño» nombra dos cosas · **G**

El grupo de objetivos e indicadores, y la evaluación de desempeño de personas.

**Coste:** cero técnico, alto de criterio. Es una decisión de producto.

---

## G-11 · Ayuda contextual en un solo dominio · **H**

El patrón «i» con explicación, ejemplo y respaldo existe solo en partes interesadas.

**Diferido al sprint transversal**, y **no es un bloqueador de Quality-13**. Lo que 13
debe garantizar es no hacerlo más difícil: cualquier sección nueva debería poder recibir
su ayuda por el mismo componente compartido.

---

## Resumen por clase

| Clase | Huecos | ¿Migración? |
|---|---|---|
| **A** modelo | G-01 | sí, una: CHECK + ramas del disparador |
| **B** aplicación | G-02, G-04, G-05, G-08, G-09 | no |
| **C** UX | G-02, G-04 | no |
| **D** automatización | G-03, G-06 | G-06 sí |
| **E** Intelligence | G-07 | no |
| **F** salidas | ninguno | — |
| **G** copy | G-10 | no |
| **H** diferido | G-11 | no |

**Migraciones previsibles para todo QUALITY-13: una o dos.** El resto es composición
sobre lo que ya existe, que es exactamente lo que cabría esperar de un sistema cuyo
problema es de integración y no de datos.
