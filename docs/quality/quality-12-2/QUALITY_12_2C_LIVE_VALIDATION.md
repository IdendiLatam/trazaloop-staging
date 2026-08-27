# QUALITY-12.2C · Validación contra el proveedor real

> **Estado: CERRADA.** Cuatro consultas reales contra OpenAI, las cuatro
> aceptadas humanamente. Verificación técnica contra Staging: 28
> comprobaciones, cero fallos.

**Preview validado**
`https://trazaloop-production-qu5llp57p-idendi-latam-s-projects.vercel.app`
**Empresa** «QUALITY-12.1 en vivo 41721770» · Staging QA

---

# 1 · Las dos rondas, y lo que enseñó cada una

| Ronda | Qué pasó |
|---|---|
| **Primera** | **BLÓQUER**: al pulsar Proponer no ocurría nada. Ni carga, ni propuesta, ni error |
| **Segunda** | Las cuatro pruebas **PASS** |

## La primera ronda · el botón que no hacía nada

Cincuenta y dos comprobaciones estaban en verde y el botón no respondía.

**Causa raíz: un `<form>` dentro de otro `<form>`.** El panel tenía formulario
propio y vive dentro del formulario de guardado de la sección. Es HTML
inválido: el analizador del navegador descarta la etiqueta interna, y el botón
pierde la acción a la que estaba atado.

React no valida el anidamiento al renderizar. El árbol compila, pasa el linter
y se sirve igual desde el servidor: el defecto **solo existe cuando un
navegador analiza ese HTML**.

Y estaba en los tres módulos, porque el panel es transversal.

### Por qué ninguna prueba lo vio

Todas llamaban a la acción de servidor **por su nombre**, y esa parte
funcionaba.

> Una prueba que invoca la función de servidor comprueba que la función existe.
> No comprueba que alguien pueda llegar a ella.

### Dónde se cortaba la cadena

| | |
|---|---|
| ¿Salía petición del navegador? | **No** |
| ¿Llegaba a la acción de servidor? | **No** |
| ¿Se llamaba al proveedor? | **No** |

**Cero llamadas al proveedor gastadas** en el diagnóstico: se reprodujo con el
doble determinístico y un DOM en memoria.

### El arreglo · `6f1d988`

El panel deja de tener formulario. El `FormData` se construye en el manejador y
la acción se despacha en una transición; el botón es `type="button"`, así que
tampoco puede enviar el guardado por accidente — el otro riesgo latente del
diseño anterior.

Y aparece lo que faltaba pase lo que pase:

```
IDLE → «Pensando…» (botón deshabilitado) → propuesta
IDLE → «Pensando…» (botón deshabilitado) → error visible
```

### Las dos regresiones añadidas

**`test:quality122c-ui` · 13 ✔** — monta el panel en un DOM real, **dentro de
un formulario**, pulsa el botón y mira el resultado. La acción se inyecta como
propiedad: sin servidor y sin proveedor.

**`L2`, el guarda transitivo** — recorre el grafo de composición a nivel de
componente y falla si algo colgado de una región `<form>…</form>` acaba
pintando otro form **a cualquier profundidad**. El defecto real era una cadena
de tres —editor → `SectionEditor` → panel—, así que un guarda que mirase solo
al hijo directo no habría visto nada.

**Comprobado que sirve**: reintroduciendo el `<form>`, `L2` lo caza en los tres
módulos.

---

# 2 · Las cuatro pruebas humanas

## Prueba 1 · PCR · Mejorar redacción

```
ANTES   las actividades de recepcion se revisan periodicamente por el area
        correspondiente y se deja registro de la revision realizada en el
        formato que corresponda, esto se hace para asegurar que el material
        que entra cumple con lo que se pidio.

DESPUÉS Las actividades de recepción se revisan periódicamente por el área
        correspondiente y se deja registro de la revisión realizada en el
        formato que corresponda. Esto se hace para asegurar que el material
        que ingresa cumple con lo solicitado.
```

**PASS.** Ortografía, puntuación y redacción. Ni un responsable, ni una
frecuencia, ni un proceso, ni un requisito añadidos.

## Prueba 2 · Textiles · Hacer más claro

```
ANTES   cada referencia textil tiene su composicion declarada y esta se
        verifica contra la ficha del proveedor cuando esta disponible, si no
        hay ficha se deja constancia de esa situacion.

DESPUÉS Cada referencia textil tiene declarada su composición. Esta se
        verifica contra la ficha del proveedor cuando está disponible. Si no
        hay ficha, se deja constancia de esa situación.
```

**PASS.** Tres frases donde había una. Ni fibras, ni porcentajes, ni
certificados, ni GRS/RCS/GOTS/OEKO-TEX, ni requisitos normativos inventados.

## Prueba 3 · Quality · Responsabilidades · **la prueba reina**

```
ANTES   el responsable revisara los proveedores y se llevara registro.

DESPUÉS El responsable revisará a los proveedores y llevará el registro.

FALTA   · Cargo concreto que asume la revisión y el registro.
        · Quién revisa, si es distinto de quien ejecuta.
        · Quién decide sobre los proveedores.
```

**PASS.** La guía pedía cargos y quién hace qué; el texto no los tenía; el
perfil tampoco. La respuesta **conservó el hecho conocido, corrigió la
redacción y nombró lo que falta sin rellenarlo**. Ni un cargo, ni una
periodicidad, ni un nombre, ni un marcador tipo `[Coordinador de Calidad]`.

Que `suggested_text` saliera conservador **es el comportamiento correcto**, no
una limitación.

### Verificado: lo que falta viene de la guía, no del modelo

Se comprobó contra la base que la revisión de guía usada —`section_role`
`responsibilities` de Quality, revisión 1— pide literalmente *«quién ejecuta,
quién revisa, quién decide»*, y que los tres puntos señalados responden a eso.
No es conocimiento libre del modelo: es lo que la guía canónica pedía.

## Prueba 4 · Quality · Sección a medida · Hacer más técnico

```
ANTES   los criterios de aceptacion propios de la planta se aplican segun lo
        acordado con el cliente y se revisan cuando el cliente lo solicita.

DESPUÉS Los criterios de aceptación propios de la planta se aplican conforme a
        lo acordado con el cliente y se revisan cuando este lo solicita.
```

**PASS.** Sin guía —`guidance_revision_id` en null—, funcionando con el texto y
el perfil. **No se reutilizó la guía de otro papel** y no se inventó ninguna.

---

# 3 · Los cuatro runs reales

| # | run | módulo | documento | sección | acción |
|---|---|---|---|---|---|
| 1 | `f3ac5f8a…` | `cpr` | QE-CPR-838391 | `objetivo` | `improve_writing` |
| 2 | `6025fe1a…` | `textiles` | QE-TEX-838391 | `composicion` | `clarify` |
| 3 | `407c3769…` | `quality` | QE-QLT-838391 | `responsibilities` | `review_against_guidance` |
| 4 | `531d3083…` | `quality` | QE-QLT-838391 | `criterios_propios_…` | `formalize` |

Los cuatro: actor `2b27d90e…`, empresa `1837779e…`, `openai` /
**`gpt-5.4-mini`**, `provider_called = true`, `status = succeeded`,
plantilla `document.quick_edit.<acción> v1`.

| # | Guía usada | Alcance |
|---|---|---|
| 1 | `bde82334…` rev **2** | `blueprint_section` · cpr |
| 2 | `73619f57…` rev **1** | `blueprint_section` · textiles |
| 3 | `143b4a68…` rev **1** | **`section_role`** · quality |
| 4 | **ninguna** | sección a medida |

La revisión 2 del run 1 es una de las nueve corregidas por normativa en
QUALITY-12.2A: la trazabilidad de la guía funciona de punta a punta.

---

# 4 · Consumo real

| # | módulo | acción | entrada | caché | salida | razonando | total | latencia |
|---|---|---|---|---|---|---|---|---|
| 1 | cpr | improve_writing | **724** | 0 | 155 | 58 | 879 | 3 398 ms |
| 2 | textiles | clarify | **784** | 0 | 111 | 18 | 895 | 1 600 ms |
| 3 | quality | review_against_guidance | **754** | 0 | 316 | 224 | 1 070 | 3 875 ms |
| 4 | quality | formalize | **645** | 0 | 103 | 22 | 748 | 2 325 ms |

**Entrada** — media **727** · mediana **739** · mínimo **645** · máximo **784**

## Comparación con el Copilot global

QUALITY-12.1 midió entre **2 514** y **2 886** tokens de entrada por consulta
real.

| | vs 2 514 | vs 2 886 |
|---|---|---|
| Run 1 | −71 % | −75 % |
| Run 2 | −69 % | −73 % |
| Run 3 | −70 % | −74 % |
| Run 4 | −74 % | −78 % |
| **Media** | **−71 %** | **−75 %** |

## Coste fijo real, deducido

| # | Texto de la persona | Entrada | **Fijo ≈** |
|---|---|---|---|
| 1 | 40 palabras (~68 tokens) | 724 | **656** |
| 2 | 29 palabras (~50 tokens) | 784 | **734** |
| 3 | 9 palabras (~18 tokens) | 754 | **736** |
| 4 | 24 palabras (~38 tokens) | 645 | **607** |

**Entre 607 y 736 tokens**, frente a los **1 664** fijos del Copilot: una
reducción del **56 % al 64 %**.

Y **por debajo de los 801 estimados**: la regla de 3,6 caracteres por token es
conservadora frente al tokenizador real. La estimación va del lado seguro, que
es el lado correcto para un presupuesto.

## Sobre el caché

Los cuatro runs traen `cached_input_tokens = 0`, y es esperable: cada uno usó
una **acción distinta**, y la acción va dentro de las instrucciones. El prefijo
solo se repite cuando se repite la acción — que es lo que pasará en uso real,
donde alguien mejora varias secciones seguidas con «Mejorar redacción». No es
un defecto; es que estas cuatro pruebas eran deliberadamente distintas entre sí.

## Latencia

**1 600 – 3 875 ms**, media **2 800 ms**.

Frente a los **17–20 segundos** que QUALITY-12.1 midió construyendo el Context
Pack global con diecinueve adaptadores en fila. Aquí no hay fase de
construcción: dos lecturas acotadas y la llamada.

---

# 5 · Las comprobaciones técnicas

**28 conformes, 0 fallos** contra Staging.

## Human-in-the-loop · nada se escribió

| | |
|---|---|
| Los tres documentos | siguen en **borrador**, sin aprobar, sin revisión vigente |
| Revisiones creadas | **0** |
| Versiones creadas | **0** |
| Las cuatro secciones | **sin tocar** — `updated_at` = `created_at` |
| Objetivos · controles · acciones | los del escenario, ninguno nuevo |
| Riesgos · auditorías | **0** |

La propuesta vive en la pantalla. «Reemplazar» cambia el valor del editor y
nada más; después la persona sigue teniendo que guardar. Comprobado en tres
niveles: el DOM (`C1`, `C2` de la suite de interfaz), el código (`F1`, `F2`
estáticas: ni un `.update(`, ni un `.insert(`, ni un `revalidatePath`) y la
base (esta verificación).

## Guía canónica

Las tres con guía usaron la **fuente canónica de 12.2A**, revisión **vigente**,
y la clave de sección coincide. Ninguna leyó `trazadoc_blueprint_sections.hint`
— congelada desde 12.2A, y con una prueba que lo vigila.

## Transversalidad

| Módulo | Documental | Comercial | Dependió de Quality |
|---|---|---|---|
| PCR | `cpr` | `traceability_6632` | **no** |
| Textiles | `textiles` | `textiles` | **no** |
| Quality | `quality` | `quality` | sí, el suyo |

Un solo motor. El módulo se lee del documento y la base comprueba que el
declarado coincide.

## Sin Context Pack global

Las fuentes usadas fueron exactamente cuatro: el texto, la guía, el perfil
compacto y los datos del documento. Ni voz del cliente, ni auditorías, ni
proveedores, ni riesgos, ni acciones, ni indicadores, ni automatización. Lo
vigila `D1` de la suite estática, y lo confirma la latencia.

## Perfil de organización

El compacto de 12.2B. Ni NIT, ni correos, ni teléfonos, ni direcciones, ni
razón social, ni miembros, ni facturación, ni almacenamiento — comprobado con
todos esos campos cargados en la empresa (`E1`, `E2` de la suite de barreras).

## Separación del consumo

```
ask 17 · customer_themes 1 · document.quick_edit 4
```

`v_document_authoring_usage` trae **solo** las cuatro y **no expone el texto**.
Se podrá saber cuánto cuesta la asistencia sin mezclarla con el Copilot.

---

# 6 · Calidad editorial

Las cuatro pruebas demuestran una estrategia **conservadora**, y es la deseada:

* no adorna con lenguaje inexistente;
* no escribe «garantizando el cumplimiento de…»;
* no convierte una ayuda editorial en un hecho;
* no inventa cargos, frecuencias, certificaciones ni criterios.

**No hay que subir la creatividad del modelo para que la salida luzca más.** Un
texto más vistoso que afirma algo que la empresa no ha decidido es peor que uno
sobrio que dice la verdad.

---

# 7 · Presupuesto automatizado

| Texto | Estimado | Objetivo | |
|---|---|---|---|
| 50 palabras | 898 | ≤ 900 | ✔ |
| 100 | 979 | ≤ 1 000 | ✔ |
| 250 | 1 230 | ≤ 1 300 | ✔ |
| 500 | 1 648 | ≤ 1 800 | ✔ |

Los cuatro, **sin alterar ningún objetivo**. Y los runs reales quedaron **por
debajo** de la estimación.
