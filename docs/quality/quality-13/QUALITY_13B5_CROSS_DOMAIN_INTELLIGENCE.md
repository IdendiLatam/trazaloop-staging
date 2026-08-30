# QUALITY-13B5 · INTELLIGENCE ENTRE DOMINIOS

---

## 1 · Sigue habiendo UN motor

No hay un segundo copiloto, ni otro proveedor, ni un chat incrustado en la portada. B5 es
una **capa de composición** sobre lo que QUALITY-12 ya construyó: el constructor de
contexto autorizado, los adaptadores tipados, las citas, los límites y el libro de
consumo.

Lo que se añade cabe en cuatro cosas:

1. **Dos fuentes** que miran el sistema por donde está unido.
2. **Una selección de fuentes** por pantalla de origen.
3. **Dos entradas contextuales** —la portada y el mirador de proceso— y sus preguntas.
4. **Un asiento de catálogo** para que las citas de esas dos fuentes se puedan guardar.

---

## 2 · El problema medido, y su arreglo

Veinte de los veintidós adaptadores estaban declarados `useCases: ["*"]`. Consecuencia:
**cualquier pregunta cargaba todas las fuentes**. Para preguntar por un proceso se leía el
historial de proveedores de la empresa entera.

Medido contra base real en este tramo:

| Pregunta | Fuentes pedidas |
|---|---|
| Global, sin origen conocido | **23** |
| Desde la portada | **10** |
| Desde la revisión por la dirección | **11** |
| Desde un proceso | **7** |

La selección la decide el **servidor** a partir de dónde se pulsó. No la decide el modelo
y no se adivina leyendo el texto de la pregunta: adivinarla sería el modelo eligiendo qué
mirar, que es justo lo que este diseño evita.

**Sin origen conocido se comporta como antes**: la especialización es una mejora, no una
amputación.

---

## 3 · Las dos fuentes integradas

### `attention` · la respuesta convergida de B3

Un problema visto por el estado del dominio, por un barrido heredado y por una regla es
**un** hecho, no tres. Sin esta fuente, cada pregunta integrada volvería a contar señales,
avisos y pendientes por separado — la duplicación que B3 quitó.

No lee `quality_signals`, ni los barridos, ni las tablas de señal de dominio. Le pregunta a
B3, que ya sabe. Y cuando se pregunta desde un proceso, llega **acotada a ese proceso**.

Los números vienen contados por `summarizeAttention` (§19): el modelo los explica, no los
produce.

### `process_context` · el contexto de proceso de B1/B2

Nueve secciones, sus recuentos y una muestra, más lo derivado de QI-23 —proveedor y queja—
diciendo **por qué camino llegó** cada relación. Sin esta fuente, preguntar por un proceso
significaría volver a unir las veinticinco tablas que guardan `process_id`.

### Lo que ninguna de las dos hace

- No escriben. Componer un contexto no cambia una sola fila de negocio.
- No convierten un fallo en un cero: si una fuente de atención no se pudo leer, se declara
  la limitación y el contexto dice que está incompleto.
- No inventan relaciones. Solo relaciones tipadas o las derivaciones congeladas de
  QUALITY-13.

---

## 4 · Los cinco orígenes integrados

| Origen | Fuentes | Qué aporta |
|---|---|---|
| Portada de Quality | 10 | lo que requiere atención + los dominios que lo producen |
| Mirador de proceso | 7 | el contexto del proceso + su atención acotada |
| Revisión por la dirección | 11 | los dominios que sus entradas resumen |
| Partes interesadas | 4 | el contexto con sus estrategias y los procesos |
| Preparación de auditoría | 9 | lo abierto, los documentos que rigen, los riesgos |

`attention` está en los cinco: es lo que impide que cada uno vuelva a contar por su cuenta.

---

## 5 · Las entradas, y por qué son dos y no doce

**Una por pantalla, y son enlaces.** Abren el mismo Intelligence de siempre con el contexto
fijado. Ni un chat incrustado, ni un motor aparte.

- **Portada** · entrada nueva. Fija el contexto a la portada —que es una pantalla, no una
  entidad, y por eso el contexto fijado admite quedarse sin identificador—.
- **Mirador de proceso** · la entrada **ya existía** desde QUALITY-12, en la cabecera de la
  ficha, y ya fijaba el proceso. Añadir una segunda en la misma pantalla habría sido
  exactamente la proliferación que §29 prohíbe. Lo que B5 le cambia es qué se compone y qué
  se sugiere.

Partes interesadas conserva la suya. Ninguna otra pantalla gana botón.

---

## 6 · Las preguntas sugeridas

Pocas —tres o cuatro por origen— y en la lengua del producto. Son **preguntas**, no
respuestas: la persona las edita antes de enviarlas.

Cubren los ocho casos del encargo: qué requiere atención, qué procesos concentran lo
abierto, indicadores relacionados con riesgos o acciones, cambios desde la última revisión,
requisitos sin estrategia, preguntas para una auditoría, procesos con pendientes y qué
revisar hoy.

**Partes interesadas no recibe lista nueva**, y es deliberado: ya traía seis de
QUALITY-12.3B3B, y tres son exactamente las integradas. Sustituirlas habría quitado
producto para poner lo mismo con otras palabras.

---

## 7 · La migración 0154, y por qué existe

`quality_ai_add_reference` rechaza cualquier cita cuya fuente no esté en
`quality_ai_sources`. Es la guarda de QUALITY-12 que impide citar algo que el catálogo no
reconoce, y no se toca.

Las dos fuentes integradas no existían cuando se escribió ese catálogo, así que sus citas
se rechazaban: la respuesta las enseñaba y el servidor no las guardaba. Una cita **no
direccionable**, que es lo que §18 prohíbe.

**Se comprobó midiendo, no leyendo:** la suite de QUALITY-12 empezó a fallar en «las citas
están guardadas y tienen enlace interno» en cuanto las dos fuentes entraron en juego.

0154 son **dos filas en un catálogo**. Sin tablas nuevas, sin tocar el proveedor, el libro
de consumo, los topes ni los precios. Las dos declaran `historical_mode = 'current'`: no
reconstruyen el pasado, y decirlo es lo que hace que al preguntar por una fecha pasada el
constructor avise en vez de rellenar el hueco en silencio.

---

## 8 · Lo que Intelligence sigue sin decidir

Nueve decisiones formales, declaradas como lista comprobable y no solo como una frase en el
prompt: declarar pertinente una parte interesada, clasificar un hallazgo como no
conformidad, cerrar una acción, aprobar un documento, aceptar un riesgo, cambiar un
objetivo, aprobar un proveedor, emitir la conclusión de una revisión y declarar conformidad
con una norma.

Puede sugerir. Y una sugerencia se presenta como sugerencia.
