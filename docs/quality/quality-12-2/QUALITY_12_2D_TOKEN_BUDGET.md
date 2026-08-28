# QUALITY-12.2D · Presupuesto

Dos presupuestos, no uno.

El de **tokens** es el conocido. El de **consultas** es nuevo y hace falta: el
Copilot no se pasaba de precio por escribir mucho, sino por leer diecinueve
dominios cada vez. Una capacidad puede tener el prompt más corto del mundo y
seguir siendo insostenible si para armarlo hace veinte viajes a la base.

Los números con los que hay que comparar, todos reales y medidos antes:

| | Coste fijo | Entrada |
|---|---|---|
| Copilot · QUALITY-12 | **1 664** | 2 514 – 2 886 |
| Quick Edit · QUALITY-12.2C | 607 – 736 real (801 estimado) | **727** de media |

---

## A · El coste fijo de 12.2D

| | Tokens |
|---|---|
| Política | **548** |
| Esquema | **290** |
| **Fijo** | **838** |

**Un 50 % menos que el Copilot.**

Revisar cuesta más que redactar —548 frente a los 348 de 12.2C— y es lo
esperable: la política de 12.2D tiene que enseñar a distinguir cuatro cosas
que no valen lo mismo (HECHO, COMPROBADO, GUÍA, TEXTO) y tiene que impedir tres
confusiones que 12.2C no podía cometer, porque no traía hechos.

---

## B · Una revisión normal

Medido con la guía real de «Responsabilidades» de Quality —copiada tal cual de
la base, no una aproximación escrita para la ocasión— y con las frases que de
verdad producen los adaptadores.

| Texto de la sección | Hechos | Total | Tope |
|---|---|---|---|
| 40 palabras | 6 | **1 277** | 1 400 |
| 100 palabras | 6 | **1 382** | 1 400 |

---

## C · El caso complejo

Cuatro tipos de contexto, el cupo de hechos lleno, un texto largo y un límite
declarado.

| | |
|---|---|
| Texto | 250 palabras |
| Hechos | 16, el máximo |
| **Total** | **1 952** · tope **2 000** |

Y el peor caso medido, **1 914**, sigue por debajo de la consulta **más barata**
del Copilot (2 514).

| | vs 2 514 | vs 2 886 |
|---|---|---|
| Revisión normal (1 277) | −49 % | −56 % |
| Peor caso (1 914) | −24 % | −34 % |

---

## D · Cómo se llegó a esos números

La primera medición dio **1 024** de coste fijo, y con eso una sección de 100
palabras se iba a 1 433 — por encima del tope. Tres recortes, ninguno de ellos
una regla:

**1 · Las frases de los hechos repetían la política.** Cada una decía «está
registrado en Trazaloop», dentro de un cajón que se llama HECHOS REGISTRADOS EN
TRAZALOOP. El adaptador de riesgos añadía «Es un riesgo, no un incumplimiento»
a cada riesgo, cuando la política ya lo dice una vez.

**2 · Las etiquetas de los cajones se alinearon con la política.**
`<HECHOS_REGISTRADOS_EN_TRAZALOOP>` pasó a `<HECHOS>`, que es la palabra que la
política usa. Además de ahorrar, dejó de haber dos nombres para cada cosa.

**3 · El cupo de hechos bajó de 24 a 16.** Empezó en 24 por simetría con los
topes por tipo, y la medición lo dejó claro: veinte y pico hechos sobre **una**
sección cuestan ochocientos tokens y nadie los va a leer. La pantalla enseña
como mucho seis hallazgos; alimentarla con veinticuatro hechos es pagar por
material que no cabe en la respuesta.

Y una cosa que **no** se tocó: la regla de 3,6 caracteres por token. Es
conservadora —en 12.2C estimó 801 y lo real fue 607–736— y así se queda. Una
estimación que se pasa por arriba avisa a tiempo; una que se queda corta avisa
tarde.

---

## E · Los topes por tipo

| Tipo | Hechos como mucho |
|---|---|
| `organization_profile` | 1 |
| `process` | 3 |
| `position` | 6 |
| `document` | 5 |
| `control` `indicator` `risk` | 6 |
| **Total de la revisión** | **16** |

Cuando un tipo llega a su tope, **se dice**. Un contexto recortado en silencio
se lee igual que uno completo, y esa es exactamente la lectura que no debe
poder hacerse.

---

## F · El presupuesto de consultas

| | |
|---|---|
| Tope de tipos por revisión | **6** |
| Tope duro de consultas | **12** |
| Copilot | 19 adaptadores |

### Lo que cuestan los casos reales que existen hoy

| Caso | Tipos | Consultas |
|---|---|---|
| Quality · responsabilidades | `{position, process}` | **7** |
| Quality · desarrollo | `{process, control, indicator, risk}` | **7** |
| PCR · responsables | `{position, process}` | **7** |
| Textiles · alcance | `{organization_profile, process}` | **4** |
| Textiles · registros | `{document, evidence}` | **4** |

Medido contra base real: **7 consultas**, coincidiendo con la cuenta.

El desglose de una revisión de responsabilidades: 1 el alcance, 1 el catálogo
de cargos, 1 el de procesos, 2 el adaptador de cargos, 2 el de procesos.

Los dos catálogos son el precio de la resolución por nombre —lo que permite
detectar el conflicto y la ambigüedad—, y se quedan en el servidor: de ellos
solo salen los registros que la persona escribió.

### El tope duro

`MAX_QUERIES = 12` existe para el día en que alguien declare los doce tipos en
una guía. Hoy no lo dispara nadie: ninguna guía declara más de cuatro. Cuando
salte, no se recorta en silencio — el material lo dice y el registro lo guarda.

Y una prueba comprueba que un texto de sesenta frases fabricadas sigue costando
ocho consultas o menos. El coste depende del alcance, no de lo que se escriba.

---

## G · Lo que se guarda para poder costearlo en 12.2F

En cada operación, `quality_ai_runs`:

| | |
|---|---|
| `related_context_types` | los tipos que **de verdad** se resolvieron |
| `context_queries` | cuántas consultas costó |
| `context_items` | cuántas fuentes se citaron |
| `input_tokens` `cached_input_tokens` `output_tokens` `reasoning_tokens` | el consumo |
| `latency_ms` | el tiempo |
| `provider_called` | si hubo llamada de verdad |

Separado del Copilot y de 12.2C por su propio `use_case`,
`document.contextual_review`, y visible en `v_document_review_usage`.

`related_context_types` no guarda lo que la guía pidió: guarda lo que se
**trajo**. Es lo que permite responder dentro de seis meses a la pregunta que
importa: ¿esta capacidad se mantuvo pequeña?

---

## H · Los números reales · pendientes de la consulta de cierre

Las tres pruebas humanas se hicieron y pasaron. El consumo real sale de
`QUALITY_12_2D_CLOSING_QUERY.sql` —solo lectura, sin el texto de nadie— y se
comparará, sin mover los criterios después de verlos, contra:

| | Referencia |
|---|---|
| Presupuesto normal de 12.2D | **≤ 1 400** · diseñado en 1 277–1 382 |
| Presupuesto complejo de 12.2D | **≤ 2 000** · diseñado en 1 952 |
| Quick Edit real (12.2C) | **727** de entrada media |
| Copilot global | **2 514 – 2 886** |
| Consultas · Copilot | 19 adaptadores |
| Consultas · 12.2D esperado | **7** en Quality y PCR, 4 en Textiles |

Y una limitación que conviene decir antes de mirar los datos: se registra la
**latencia total** de la operación, no separada entre construir el contexto y
esperar al proveedor. Con los topes de consultas que hay —de cuatro a siete—
la parte de contexto es pequeña, pero afirmarlo sin medirlo sería justo lo que
este sprint no hace. Separarlas es trabajo de 12.2F, donde hace falta para
costear.

---

## I · Lo que falta medir

Los números de arriba son **estimaciones** con la regla de 3,6 caracteres por
token. Faltan los reales del proveedor, que llegarán con la validación humana:
entrada, entrada cacheada, salida, razonamiento y latencia.

Basándose en 12.2C, donde lo real quedó un 8 %–24 % por debajo de lo estimado,
cabe esperar un fijo real en torno a **640–770** y una revisión normal en torno
a **1 050–1 270**. Se confirmará con datos, no con esta frase.

**Sobre el caché de entrada:** en 12.2D el prefijo —política más esquema— es
idéntico en **todas** las revisiones, porque no hay acciones que lo cambien
como en 12.2C. Es la condición que el caché del proveedor necesita, así que a
partir de la segunda revisión seguida debería servirse desde caché la mayor
parte de esos 838 tokens. Es una mejora estructural que 12.2C no podía tener;
medirla exige uso continuado.
