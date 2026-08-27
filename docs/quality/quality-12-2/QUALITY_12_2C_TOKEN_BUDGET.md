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


---

# Lo REAL, medido con OpenAI

La validación humana produjo cuatro llamadas reales. Esto es lo que costaron,
frente a lo que este documento estimaba.

| # | módulo · acción | entrada | salida | razonando | total | latencia |
|---|---|---|---|---|---|---|
| 1 | cpr · improve_writing | **724** | 155 | 58 | 879 | 3 398 ms |
| 2 | textiles · clarify | **784** | 111 | 18 | 895 | 1 600 ms |
| 3 | quality · review_against_guidance | **754** | 316 | 224 | 1 070 | 3 875 ms |
| 4 | quality · formalize | **645** | 103 | 22 | 748 | 2 325 ms |

Entrada: media **727** · mediana **739** · mín **645** · máx **784**.

## El coste fijo real

| # | Texto | Entrada | Fijo deducido |
|---|---|---|---|
| 1 | 40 palabras | 724 | **656** |
| 2 | 29 palabras | 784 | **734** |
| 3 | 9 palabras | 754 | **736** |
| 4 | 24 palabras | 645 | **607** |

**607 – 736 tokens**, frente a los **1 664** del Copilot: **−56 % a −64 %**.

## La estimación iba del lado seguro

Este documento estimaba **801** de coste fijo y el real quedó entre **607 y
736**. La regla de 3,6 caracteres por token es conservadora frente al
tokenizador real de OpenAI para castellano.

**Eso es lo correcto para un presupuesto**: una estimación que se queda corta
avisa tarde. No se ajusta la regla — que las medidas reales caigan por debajo
del presupuesto es la señal de que el presupuesto sirve.

## Frente al Copilot, con datos reales

| | vs 2 514 | vs 2 886 |
|---|---|---|
| Media de entrada (727) | **−71 %** | **−75 %** |
| Peor caso (784) | −69 % | −73 % |
| Mejor caso (645) | −74 % | −78 % |

Y en tiempo: **1,6 – 3,9 s** frente a los **17–20 s** que costaba construir el
Context Pack global.

## Sobre el caché de entrada

Los cuatro runs traen `cached_input_tokens = 0`. Es esperable y no es un
defecto: cada uno usó una **acción distinta**, y la acción va dentro de las
instrucciones, así que el prefijo nunca se repitió.

En uso real —alguien mejorando varias secciones seguidas con la misma acción—
el prefijo sí se repite y el proveedor lo sirve desde caché, como se vio en
QUALITY-12.1 (2 304 de 2 519 tokens cacheados a partir de la segunda consulta).
Es una mejora que llegará sola; medirla exige un uso continuado, no cuatro
pruebas deliberadamente distintas entre sí.
