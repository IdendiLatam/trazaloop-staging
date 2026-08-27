# QUALITY-12.2C · Cuánto cuesta mejorar un párrafo

## El número que este sprint existe para no repetir

El descubrimiento de QUALITY-12.2 midió el Copilot global:

| Pieza | Tokens |
|---|---|
| `POLITICA_COMUN` | **846** |
| `ANSWER_SCHEMA` | **742** |
| tarea `copilot.ask` | 76 |
| **Coste fijo antes de un solo byte de contenido** | **1 664** |

Y lo que la validación de QUALITY-12.1 facturó de verdad, con 16–17 fuentes:
entre **2 514 y 2 886 tokens de entrada** por consulta.

La conclusión del descubrimiento fue que para editar un párrafo eso **no se
arregla recortando fuentes**: hay que cambiar la política y el esquema. Esto es
la comprobación de que se hizo.

---

## Lo medido, con la misma regla

3,6 caracteres por token en castellano — la misma conversión que usó el
descubrimiento, para poder comparar sin trampa. No es exacta y no pretende
serlo: sirve para vigilar el orden de magnitud, que es lo que decide si una
mejora de párrafo es barata.

### El coste fijo

| Pieza | Quick Edit | Copilot | |
|---|---|---|---|
| Política | **348** | 846 | −59 % |
| Tarea | **56** | 76 | |
| Esquema | **169** | 742 | −77 % |
| **Maquinaria** | **573** | **1 664** | **−66 %** |
| Guía de la sección | 94 | — | |
| Perfil de la empresa | 127 | — | |
| Datos del documento | 44 | — | |
| **Contexto útil** | **228** | (el Context Pack entero) | |
| **COSTE FIJO TOTAL** | **801** | **1 664** | **−52 %** |

De los 801, **228 son contexto que sirve** —la guía, el perfil y de qué
documento hablamos— y 573 son la maquinaria. En el Copilot los 1 664 son
maquinaria entera, antes de una sola fuente.

### Por tamaño de texto

| Texto de la persona | Entrada total | Objetivo | |
|---|---|---|---|
| 50 palabras | **898** | ≤ 900 | ✔ |
| 100 palabras | **979** | ≤ 1 000 | ✔ |
| 250 palabras | **1 230** | ≤ 1 300 | ✔ |
| 500 palabras | **1 648** | ≤ 1 800 | ✔ |

**Los cuatro objetivos del encargo, cumplidos sin ajustar ninguno.**

### La comparación que importa

Mejorar un párrafo de **100 palabras** cuesta **979 tokens** frente a los
**2 514** de una consulta real del Copilot: **el 39 %**.

---

## Cómo se llegó ahí, y qué se descartó

La primera versión de la política ocupaba **480 tokens** y el coste fijo salía
a **1 004**. Los cuatro objetivos fallaban por unos doscientos tokens cada uno.

El encargo decía explícitamente: *«No convertir estos valores en trucos de
test.»* Así que se ajustó lo que estaba de más, no los objetivos:

**1 · La política se reescribió más corta.** 480 → 348 tokens. No se quitó
ninguna regla: se quitaron las repeticiones y las enumeraciones que el Copilot
necesita porque puede recibir cualquier pregunta y aquí no.

**2 · Se quitó la explicación duplicada de cada cajón.** El material enviaba,
en cada llamada, «Consejo de redacción de Trazaloop. NO afirma nada sobre esta
empresa» encima de la guía y «A qué se dedica. Sirve para su vocabulario, no
como evidencia» encima del perfil. **Eso ya lo dice la política**, una sola vez.
Repetirlo por llamada costaba ~37 tokens y no añadía una idea.

**3 · Las descripciones del esquema se acortaron** sin quitar ninguna
restricción: los topes siguen pedidos en el propio esquema.

Lo que **no** se tocó: los objetivos, ni la regla de conversión, ni el fixture
de medida.

---

## Lo que NO se envía, y cuánto ahorra

| Qué se dejó fuera | Por qué |
|---|---|
| Los 19 adaptadores del Copilot | mejorar un párrafo no necesita la voz del cliente ni las auditorías |
| Voz del cliente, auditorías, proveedores, riesgos, acciones, indicadores, señales | idem |
| Datos de contacto, NIT, dirección, teléfono, miembros | no hacen falta y son personales |
| Campos vacíos de la guía | un `PROPÓSITO:` sin nada detrás ocupa sitio y no informa |
| Guía restringida (Demo) | no se entrega en Demo, así que no viaja |

El perfil de la empresa es el compacto de QUALITY-12.2B —**90 tokens** medidos
contra Staging, 106 en un perfil típico, 256 en el máximo teórico— y no se
vuelve a consultar la empresa.

La guía es la canónica de QUALITY-12.2A: **97 caracteres de media**, ≈27
tokens, más su barrera cuando la tiene.

---

## La salida

| Campo | Tope |
|---|---|
| `suggested_text` | como mucho el triple del original, y nunca más de 4 000 caracteres |
| `change_summary` | 2 |
| `missing_information` | 3 |
| `warnings` | 2 |

Los topes se **piden en el esquema** y se **imponen al validar**. Pedirle al
modelo que escriba un ensayo explicando su edición y luego recortarlo es pagar
por texto que se tira.

Una propuesta desproporcionadamente más larga que el original **se rechaza**:
ya no es una mejora, y reemplazar con ella sorprendería a quien pulse el botón.

---

## Lo que la prueba vigila

`test:quality122c-budget`, **14 comprobaciones**:

* la política pesa menos de la mitad que la del Copilot;
* el esquema, menos de un tercio;
* la maquinaria entera, menos de la mitad;
* los cuatro objetivos por tamaño de texto;
* una mejora de 100 palabras cuesta menos de la mitad que una consulta real;
* los topes de salida están en el esquema, no solo en la validación;
* no se piden campos del Copilot (`facts`, `interpretation`, `sources`…);
* un campo vacío no viaja;
* el perfil es el compacto, no una segunda consulta.

Si alguien engorda la política mañana, la prueba lo dice antes de que llegue a
la factura.
