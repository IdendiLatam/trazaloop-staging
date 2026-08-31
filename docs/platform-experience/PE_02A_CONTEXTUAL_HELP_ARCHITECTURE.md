# PE-02A · Arquitectura de la ayuda contextual · el botón «i»

Complementa [PE_02A_FAQ_ARCHITECTURE.md](./PE_02A_FAQ_ARCHITECTURE.md).
Las decisiones PEH-01, PEH-02, PEH-03, PEH-06, PEH-08, PEH-10 y PEH-12 se
aplican aquí igual; este documento añade lo que solo vale para la ayuda pegada a
una pantalla.

---

## 1 · Lo que ya funciona y no se toca

`components/ui/section-hint.tsx` es un botón «i» compartido, accesible y probado
desde T9G: `type="button"`, `aria-expanded`, `aria-label="Más información"`,
cierre con Escape, foco devuelto, panel con desplazamiento, y **sin contenido no
pinta nada**. El texto pasa por `HintText`, que **nunca interpreta HTML**.

**PE-02 no rediseña este componente.** Le cambia de dónde viene el contenido.

---

## 2 · El contrato de contenido · ya está escrito en el producto

§12 pide diseñar un contrato con explicación, ejemplo y respaldo técnico. El
repositorio ya lo tiene **dos veces**, y coinciden:

**En el código** (`INTERESTED_PARTIES_HELP`, once bloques):

```
QUÉ ES    Un análisis no se edita: se sustituye. El anterior se conserva…
EJEMPLO   En una auditoría preguntan por qué en marzo no había estrategia…
RESPALDO  ISO 9001:2015, 7.5, información documentada: lo que se conserva
          tiene que poder demostrar lo que se hizo.
```

**En la base** (`trazadoc_authoring_guidance_revisions`, desde 0136):

```
guidance · purpose · example · do_not_invent · related_context_types
normative_class · content_hash · effective_from/to · change_note · created_by
```

**Decisión: el contrato canónico es el de la base, con los nombres de la base.**
No se inventa un tercero.

| Campo | Qué es | ¿Obligatorio? |
|---|---|---|
| `title` | de qué habla la ayuda | sí |
| `explanation` (≡ `guidance`) | **QUÉ ES**, en lenguaje llano | sí |
| `purpose` | para qué existe eso en el producto | no |
| `example` | **EJEMPLO**, marcado como ejemplo | no |
| `technical_reference` | **RESPALDO**: la referencia normativa, como referencia | no |
| `do_not_invent` | qué **no** se puede rellenar sin dato que lo respalde | no |
| `normative_class` | los cinco valores de 0136 | sí |
| `language` | hoy siempre `es` (PEH-12) | sí |

`do_not_invent` merece defenderse: nació para que un modelo no rellenara una
sección con lo que le pareciera, y sirve igual para una persona. Es la barrera
escrita **junto al texto que la necesita**, no en una política lejana. Se
conserva.

---

## 3 · Dónde se pega · la identidad

```
(module_key, page_key, target_kind, target_key, language)

target_kind   page    → la ayuda de la pantalla entera
              section → la de un bloque
              field   → la de un campo
              entity  → la de un concepto  (target_key = quality_ai_sources.code)
```

`page_key` es lo único nuevo (PEH-08). Se declara **en el código**, junto a la
pantalla, en un catálogo único; la base solo lo referencia como texto. Así una
clave inexistente se detecta con una prueba estática, no con una fila huérfana.

**La URL no entra en la identidad.** Es la lección de PE-01B: se movió una
superficie entera sin cambiar ninguna promesa, y una clave por ruta habría roto
la ayuda ese día.

---

## 4 · Visibilidad · dos preguntas distintas

| Pregunta | Respuesta |
|---|---|
| ¿Se ve sin sesión? | **No.** La ayuda contextual vive dentro del producto. Lo que se explica al público es FAQ |
| ¿Depende del plan? | **Hoy sí, para la guía de TrazaDocs**: en Demo el texto administrado no sale de la base. |

Esa puerta comercial (`lib/domain/hint-access.ts`) es una decisión vigente de
T9G/QUALITY-12.2A, no de PE-02. **Recomendación: no extenderla a la ayuda nueva
sin una decisión humana explícita.** Son cosas distintas:

- **Guía de autoría de TrazaDocs** = un recurso de valor —tutoriales, guías paso
  a paso— que se vendió como propio de Full y Extra.
- **Ayuda de producto** = explicar qué es un campo que la persona tiene delante.

Cobrar por lo segundo es cobrar por entender lo que ya se compró. Y hay un
efecto secundario feo: la ayuda de Demo desaparece justo cuando alguien está
evaluando el producto.

**Propuesta (requiere confirmación humana):** la ayuda contextual nueva es
visible en **todos** los modos, incluida Demo. La guía de autoría de TrazaDocs
mantiene su puerta actual, sin cambios.

---

## 5 · La migración del contenido escrito en código · por olas

Nueve constantes, y no todas merecen el mismo trato.

| Ola | Qué | Por qué |
|---|---|---|
| **1** | `INTERESTED_PARTIES_HELP` (11 bloques) | Ya tiene la forma exacta —QUÉ ES / EJEMPLO / RESPALDO— y referencias normativas. Es la prueba de que el motor sirve, con contenido real |
| **2** | `LIFECYCLE_HELP`, `CLASSIFICATION_HELP`, `ACTION_KIND_HELP`, `OBJECTIVE_RULE_HELP` | Explican conceptos del producto y cambian con el producto |
| **3** | `DEFENSIBILITY_HELP`, `MOVEMENT_KIND_HELP`, `NATIVE_SOURCE_NATURE_HELP` | PCR y medición; mismo trato, menos urgencia |
| **nunca** | `HINT_LINK_HELP_TEXT` | Es ayuda **del editor**, no del cliente: vive donde vive |

Y una frontera que ya existe y hay que respetar, escrita en `hint-access.ts`:

> Los mensajes de validación, errores de formulario, atributos `title`, ayudas de
> accesibilidad, avisos legales y mensajes de límites de uso **no** pasan por
> aquí y no se sustituyen jamás.

Ninguno de esos se convierte en contenido administrable. Un mensaje de error
editable desde una consola es un mensaje de error que puede quedar vacío.

---

## 6 · Vista previa · antes de publicar, no después

§24, con lo que hay:

1. **Vista previa en la consola**, con el mismo componente `SectionHint` y los
   mismos estilos. El backoffice ya ve el contenido real siempre
   (`PLATFORM_HINT_VIEWER`), así que la vista previa no necesita permisos
   nuevos.
2. **Vista previa de las dos caras** cuando la entrada es de FAQ: cómo se lee sin
   sesión y cómo se lee con ella.
3. La revisión de borrador **es** la vista previa: se ve por su identificador,
   nunca por la lectura pública.

No hace falta publicar en producción para ver cómo queda, que es lo único que
§24 exige.

---

## 7 · Lo que se lee y lo que no

- El contenido lo compone el **servidor**; el navegador recibe el objeto ya
  autorizado. Es el patrón vigente de `ResolvedHint` y se conserva.
- La ayuda **no** contiene datos de ninguna empresa. Es catálogo del producto:
  su tabla no lleva `organization_id`, igual que la FAQ.
- Y por tanto la ayuda **no es evidencia**. La frase de 0136 vale igual aquí:

  > La guía dice **QUÉ debería contener** una sección, nunca qué contiene la de
  > esta empresa.

---

## 8 · Sitio reservado para PE-03

Al pie del panel de ayuda queda hueco para «Ver tutorial en vídeo», localizado
por `(module_key, page_key)` — **las mismas claves** (PEH-15). PE-02 no crea
tabla de vídeos ni enlace: solo se abstiene de ocupar ese sitio con otra cosa.
