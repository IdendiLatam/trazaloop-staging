# PE-02B6 · La ayuda que todavía no es administrable

Siete familias de ayuda siguen escritas en el código. **No se inventó contenido
para trasladarlas** —ningún ejemplo, ninguna referencia normativa— y esa es
exactamente la razón por la que siguen ahí.

Esto no bloquea PE-02: es trabajo editorial para cuando haya quien lo escriba.

---

## 1 · Por qué esperan

Las once de partes interesadas se trasladaron porque ya tenían las tres partes:
explicación, ejemplo y respaldo normativo, escritos con cuidado.

Las siete que quedan son **diccionarios de estado**: un texto corto por cada
valor de un desplegable. Ninguna tiene ejemplo ni respaldo. Trasladarlas hoy
significaría o dejar dos de cada tres columnas vacías —y entonces la ayuda
administrada no gana nada respecto de la constante, y sí pierde: pasa a depender
de una consulta— o **inventarlos**, que es lo que §15 de PE-02B4 prohibió y esta
consolidación mantiene.

Hay además una decisión de diseño que nadie ha tomado: si cada valor es una
ayuda —siete ayudas para siete estados— o si es una sola con siete párrafos. La
respuesta no es obvia y depende de cómo se quiera que se lea en pantalla.

---

## 2 · El inventario

| Familia | Dónde | Qué explica | ¿Ejemplo? | ¿Respaldo? | Quién debería escribirlo |
|---|---|---|---|---|---|
| `LIFECYCLE_HELP` | `lib/domain/document-control.ts` | los estados del ciclo de vida de un documento | no | **sí lo pide** — es control documental | responsable de calidad |
| `CLASSIFICATION_HELP` | `lib/domain/work-cases.ts` | cómo se clasifica un caso | no | **sí lo pide** — no conformidad frente a observación | responsable de calidad |
| `ACTION_KIND_HELP` | `lib/domain/work-cases.ts` | tipos de acción: corrección, correctiva, mejora | no | **sí lo pide** — la distinción es normativa y se confunde a diario | responsable de calidad |
| `OBJECTIVE_RULE_HELP` | `lib/domain/quality-indicators.ts` | cómo se evalúa el cumplimiento de un objetivo | **sí lo pide** — un número ayuda | conveniente | responsable de calidad |
| `NATIVE_SOURCE_NATURE_HELP` | `lib/domain/quality-indicators.ts` | qué naturaleza tiene una fuente de medición | **sí lo pide** | no necesariamente | producto |
| `MOVEMENT_KIND_HELP` | `lib/domain/output-movements.ts` | tipos de movimiento de un lote producido | **sí lo pide** | no | producto · PCR |
| `DEFENSIBILITY_HELP` | `lib/domain/recycled-readiness.ts` | los tres niveles de defendibilidad de un cálculo | **sí lo pide** — es de lo que más se pregunta | conveniente | producto · PCR |

**Las tres primeras son las que más ganarían**: explican distinciones normativas
que se confunden en la práctica, y ahí un ejemplo y una referencia valen más que
en ningún otro sitio.

**`DEFENSIBILITY_HELP` es la más urgente por uso**: la FAQ ya tiene una pregunta
sobre defendibilidad, y quien la lee está mirando la pantalla donde ese texto
vive.

---

## 3 · Lo que NO cuenta como candidato

Escrito para que no se traslade por descuido:

- **`HINT_LINK_HELP_TEXT`** — es ayuda **del editor**, no del cliente: explica
  cómo escribir un enlace dentro de un hint. Vive donde se usa.
- **La guía de autoría de TrazaDocs** — ya es administrable, con su alcance y su
  puerta comercial propios.
- **Mensajes de validación, errores de formulario, atributos `title`, ayudas de
  accesibilidad, avisos legales y mensajes de límite de uso.** La frontera está
  escrita en `hint-access.ts` desde T9G y se respeta: un mensaje de error
  editable desde una consola es un mensaje de error que puede quedar vacío.

---

## 4 · Cómo trasladar una, cuando llegue el momento

1. Escribir explicación, ejemplo y respaldo. **Si no hay ejemplo bueno, se deja
   vacío** — la consola lo dice en la pista del campo.
2. Añadir la pantalla a `lib/modules/page-keys.ts` si no está.
3. Crear la ayuda desde `/platform/help` y publicarla.
4. **En el mismo cambio**, hacer que la pantalla la lea con `getPageHelp` y
   reparta el mapa. No antes: dejar contenido administrado que nadie lee es peor
   que no tenerlo.
5. Dejar la constante como respaldo, con un comentario que lo diga.

El paso 4 es el que evita la doble verdad, y hay una prueba que comprueba que
nadie sembró ayuda para una pantalla que no la lee.
