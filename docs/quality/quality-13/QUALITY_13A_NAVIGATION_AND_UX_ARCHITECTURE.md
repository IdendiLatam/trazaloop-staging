# QUALITY-13A · NAVEGACIÓN Y EXPERIENCIA

---

## 1 · Lo que hay hoy

Doce grupos y ~38 destinos, más «Inicio Quality» y «Mis tareas» en el nivel superior:

| Grupo | Entradas |
|---|---|
| Contexto | Partes interesadas |
| Sistema de gestión | Cargos · Procesos · Mapa de procesos |
| Desempeño | Objetivos · Indicadores |
| Riesgos y oportunidades | Riesgos y oportunidades · Metodología |
| Casos y acciones | Casos |
| Documentación | Documentos · Lista Maestra |
| Personas | 7 entradas |
| Proveedores | 4 |
| Voz del cliente | 5 |
| Auditorías | 5 |
| Revisión por la dirección | 2 |
| Automatización | 4 |
| *(Copilot)* | Intelligence |

**Doce grupos es mucho para un menú lateral**, pero cada uno corresponde a un dominio
real y renombrarlos por capricho perdería el mapa mental que ya tiene quien lo usa.

---

## 2 · La tentación de ordenar por la norma, y por qué se rechaza

Sería fácil reagrupar en Contexto / Planificación / Operación / Evaluación / Mejora. Es
la estructura de la norma y suena ordenada.

**No se propone**, por dos razones:

1. **Ya hay un principio congelado**: la navegación por numerales está desacoplada de la
   experiencia operativa. Quien entra a registrar una queja no piensa «esto es 9.1.2».
2. **Rompería el mapa aprendido** de un producto ya en uso, y sin resolver ninguno de
   los nueve huecos: el problema no es dónde está cada entrada, es que la ficha de
   proceso no enseña lo que ya sabe.

**Propuesta: cambios mínimos y con motivo, no una reorganización.**

---

## 3 · Los cuatro cambios que sí se proponen

**N-01 · «Contexto» crece.** Hoy tiene una entrada. Recibirá «Contexto de la empresa»
(4.1) cuando exista. Ningún cambio ahora; el grupo ya está preparado.

**N-02 · Resolver la colisión de «Desempeño».** El grupo pasa a llamarse **«Objetivos e
indicadores»** y la entrada de Personas conserva «Desempeño», que es su nombre propio
(evaluación de desempeño). Alternativa opuesta —renombrar la de Personas a «Evaluación
de desempeño»— también vale. **Es decisión humana.**

**N-03 · La portada deja de ser una lista de doce bloques.** Un solo bloque «Qué
requiere atención», ordenado por urgencia y **no por dominio**, con el origen a la vista
en cada línea. Debajo, los accesos por dominio.

**N-04 · La ficha de proceso pasa a ser el segundo destino más importante del módulo.**
Ver §4.

---

## 4 · El mirador de proceso

La ficha de proceso tiene hoy: identidad, propósito y alcance, entradas y salidas,
relaciones con otros procesos, documentos, historial de revisiones.

**Lo que se propone añadir**, y solo esto:

| Sección | De dónde sale | Por qué merece estar |
|---|---|---|
| **Responsable** | ya está | — |
| **Requisitos que atiende** | `quality_stakeholder_requirement_processes` | es la entrada del 4.2 al proceso: qué obliga aquí |
| **Riesgos y oportunidades** | `quality_risk_processes`, `quality_opportunity_processes` | qué puede salir mal aquí |
| **Objetivos e indicadores** | `quality_objective_processes`, `quality_indicators.process_id` | cómo se sabe si funciona |
| **Hallazgos de auditoría** | `quality_audit_findings.process_id` | qué se ha encontrado mirándolo |
| **Casos y acciones** | `work_case_processes` | qué se está haciendo al respecto |
| **Competencias requeridas** | `quality_competency_requirements.process_id` | quién tiene que saber hacerlo |

**Lo que NO se propone meter**, aunque el encargo lo listaba como candidato:

- **Proveedores** y **retroalimentación de clientes**: hoy no tienen relación con
  proceso (G-05). Meterlos exigiría inventar el vínculo o mostrar todo el dominio en
  todas las fichas, que es ruido.
- **Evidencia** como sección propia: la evidencia cuelga de cada cosa —del hallazgo, de
  la medición, de la competencia— y una lista suelta de archivos no dice de qué son.
- **Personas**: el cargo propietario ya está; listar a las personas de un proceso es
  otra pantalla (estructura de la empresa).

**Cada sección debe mostrar recuento y las tres o cuatro filas más relevantes, con
enlace a su dominio. Nunca la tabla entera.** Un mirador que carga quince listas
completas no es un mirador: es quince pantallas apiladas.

---

## 5 · La portada

Debe responder **«qué requiere mi atención»**, con estas reglas:

1. **Una línea por problema, no por dominio.** Un indicador fuera de meta que ya tiene
   una señal abierta es **un** problema, no dos.
2. **Cada línea dice de dónde sale** y enlaza a la fila concreta, no al módulo.
3. **Nada se llama «desempeño»** si es completitud administrativa. Que falten tres
   evaluaciones no es desempeño: es trabajo pendiente.
4. **Sin números inventados**: si no hay dato, se dice «sin dato», nunca cero.
5. **Partes interesadas entra** —hoy no está—.

Candidatas, todas derivables de lo que existe: revisiones vencidas (estrategias,
proveedores, riesgos, documentos), indicadores fuera de meta, riesgos significativos
abiertos, acciones vencidas, evaluaciones de proveedor pendientes, quejas sin cerrar,
auditorías próximas, brechas de competencia, entradas de revisión por la dirección
pendientes, y señales de automatización sin resolver.

---

## 6 · Inventario de ayuda contextual

| Dominio | Patrón «i» | Calidad |
|---|---|---|
| Partes interesadas | **sí**, 11 ayudas | qué es + ejemplo + respaldo · **cumple el estándar futuro** |
| TrazaDocs (editores) | sí, contenido administrado | según lo que escriba la plataforma |
| Los otros once dominios | **no** | explican con párrafos en pantalla, sin ejemplo ni respaldo |

**Nada de esto se implementa en QUALITY-13.** Es entrada para el sprint transversal, con
una recomendación concreta: el modelo de partes interesadas —constante en el dominio,
resuelta sin puerta comercial porque no es contenido administrado— es el que conviene
generalizar.

---

## 7 · Superficies para tutoriales futuros

**No se añade ningún marcador.** Se deja el inventario de rutas estables para que el
sistema transversal pueda mapear un vídeo por página sin inventarse claves:

`/quality` · `/quality/tasks` · `/quality/context/interested-parties` (+`/categories`,
+`/[id]`) · `/quality/positions` · `/quality/processes` (+`/[id]`) · `/quality/map` ·
`/quality/objectives` (+`/[id]`) · `/quality/indicators` (+`/[id]`) · `/quality/risks`
(+`/methodology`, +`/[id]`) · `/quality/cases` (+`/[id]`) · `/quality/documents`
(+`/master`, +`/[id]`) · `/quality/people/*` (7) · `/quality/suppliers/*` (4+) ·
`/quality/customer-voice/*` (5) · `/quality/audits/*` (5+) ·
`/quality/management-review` (+`/followup`, +`/[id]`) · `/quality/automation/*` (4) ·
`/quality/copilot`.

**La clave estable debe ser la ruta**, no el título: los títulos cambian y las rutas de
este módulo llevan doce sprints sin moverse.

---

## 8 · Terminología

| Concepto | Palabra elegida | Nota |
|---|---|---|
| empresa | **empresa** | ya vigilado por prueba; «organización» solo en cita normativa |
| responsable | **cargo responsable** | nunca persona ni texto libre |
| revisión | **revisión** para volver a mirar; **revisión de documento** para la versión | dos cosas, dos usos, ambos asentados |
| requisito | **requisito** | solo lo que obliga |
| hallazgo | **hallazgo** | de auditoría; nunca «no conformidad» automática |
| caso / acción | **caso** y **acción** | motor único |
| documento / archivo | **documento** | el archivo es su contenido |
| evidencia | **evidencia** | referencia, no copia |
| análisis / evaluación | **análisis** en partes interesadas, **evaluación** en proveedores y personas | consistente dentro de cada dominio; conviene no unificarlos a la fuerza |

**Ningún identificador de base de datos se renombra por motivos de redacción.**
