# PE-02B4 · Inventario de la ayuda escrita en código

Nueve constantes `*_HELP`, clasificadas. Lo que se trasladó, lo que se queda
donde está, y lo que espera.

---

## 1 · La primera ola · TRASLADADA

| Constante | Dónde | Qué se hizo |
|---|---|---|
| `INTERESTED_PARTIES_HELP` · 11 ayudas | `lib/domain/quality-interested-parties.ts` | **Trasladada a la base.** La pantalla las lee de `help_items`; la constante queda como respaldo |

PE-02A la señaló como primera ola porque **ya tenía la forma correcta**:
explicación, ejemplo y respaldo normativo, escritos con cuidado y sin afirmar
conformidad. Se trasladaron tal cual, partidas en sus tres campos, sin inventar
nada: dos de las once no tenían respaldo normativo y sus columnas quedaron
**nulas**.

Las once quedan clasificadas `normative_reference`: todas citan ISO 9001:2015 y
ninguna afirma cumplimiento.

### Por qué la constante no se borra todavía

Es el respaldo para cuando la ayuda administrada no llegó —porque no se configuró
en ese entorno, o porque la consulta falló—. **No es doble verdad**: cuando hay
ayuda administrada manda ella y la constante no se consulta.

Se borrará cuando el traslado esté verificado en todos los entornos, y queda
anotado aquí para que no se olvide.

---

## 2 · Lo que se queda donde está · KEEP NATIVE

| Constante | Por qué |
|---|---|
| `HINT_LINK_HELP_TEXT` · `lib/domain/hint-links.ts` | Es ayuda **del editor**, no del cliente: explica cómo escribir un enlace dentro de un hint. Vive donde se usa |
| Guía de autoría de TrazaDocs · `trazadoc_authoring_guidance` | Ya es administrable, con su propio alcance y su puerta comercial. Ver la implementación §10 |

Y una frontera que ya existía y se respeta, escrita en `hint-access.ts`:

> Los mensajes de validación, errores de formulario, atributos `title`, ayudas de
> accesibilidad, avisos legales y mensajes de límites de uso **no** pasan por aquí
> y no se sustituyen jamás.

Un mensaje de error editable desde una consola es un mensaje de error que puede
quedar vacío.

---

## 3 · Lo que espera · DEFER

| Constante | Dónde | Qué le falta |
|---|---|---|
| `LIFECYCLE_HELP` | `lib/domain/document-control.ts` | Una línea por estado. Sin ejemplo ni respaldo |
| `CLASSIFICATION_HELP` | `lib/domain/work-cases.ts` | Ídem |
| `ACTION_KIND_HELP` | `lib/domain/work-cases.ts` | Ídem |
| `OBJECTIVE_RULE_HELP` | `lib/domain/quality-indicators.ts` | Ídem |
| `NATIVE_SOURCE_NATURE_HELP` | `lib/domain/quality-indicators.ts` | Ídem |
| `MOVEMENT_KIND_HELP` | `lib/domain/output-movements.ts` | Ídem |
| `DEFENSIBILITY_HELP` | `lib/domain/recycled-readiness.ts` | Ídem |

**Por qué esperan, y no es pereza.** Las siete son *diccionarios de estado*: un
`Record<Estado, string>` que la pantalla usa para explicar cada valor de un
desplegable. Trasladarlas exige una decisión que este tramo no tenía por qué
tomar: si cada valor es una ayuda —siete ayudas para siete estados— o si es una
sola con siete párrafos.

Y ninguna tiene ejemplo ni respaldo. §15 del encargo es explícito: **no fabricar
ejemplos ni referencias normativas para rellenar campos**. Trasladarlas hoy
significaría o dejar dos de cada tres columnas vacías, o inventarlas.

**Recomendación para quien las traslade:** hacerlo cuando haya alguien
escribiendo el ejemplo y el respaldo, no antes. Una ayuda administrable con un
solo párrafo no gana nada respecto de la constante — y sí pierde: pasa a
depender de una consulta.

---

## 4 · Dónde estaba cada botón «i»

| Componente | Ayudas | Estado |
|---|---:|---|
| `interested-parties/assessment-section.tsx` | 4 | **administrada** |
| `interested-parties/requirements-section.tsx` | 3 + variable | **administrada** |
| `interested-parties/strategies-section.tsx` | 2 | **administrada** |
| `interested-parties/reviews-section.tsx` | 1 | **administrada** |
| `interested-parties/history-section.tsx` | 1 | **administrada** |
| `quality/context/interested-parties/page.tsx` | 1 | **administrada** |
| `trazadocs/section-editor.tsx` | guía de autoría | nativa (0136) |
| `textiles/trazadoc-editor.tsx` | guía de autoría | nativa (0136) |

---

## 5 · Regla contra la doble verdad

**Ningún objetivo de ayuda puede tener a la vez contenido administrado y una
constante que lo gobierne.** Hoy se cumple: las once de partes interesadas se
leen de la base, y la constante solo se usa cuando la base no respondió.

Cuando se traslade otra ola, el mismo criterio: la pantalla pasa a leer la
administrada **en el mismo cambio** en que se siembra, y la constante queda como
respaldo con un comentario que lo diga.
