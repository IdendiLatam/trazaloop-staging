# PE-02B3 · La FAQ que lee el cliente

**Rutas:** `/faq` y `/faq/[slug]` · **Migración:** `0157` (contenido, sin esquema)
**Cabeceras:** Local **0157** · Staging **0157** · Production **0111**

---

## 1 · Qué resolvía

La revisión humana de B2 dijo dos cosas: *la portada sigue enseñando cuatro
tarjetas iguales*, y *no encuentro la FAQ*. Lo segundo era exacto: B2 construyó
la **administración** y no existía ninguna pantalla donde leerla. Se administraba
un contenido que nadie podía ver.

---

## 2 · Una sola FAQ, que crece con la sesión

No hay dos productos. Hay **una** página que lee la sesión sin bloquear —igual
que la portada— y elige la vista que le corresponde:

| Quién llega | Qué vista lee | Qué ve |
|---|---|---|
| Sin sesión | `v_faq_public` | lo publicado, público y vigente |
| Con sesión | `v_faq_authenticated` | lo anterior **más** lo que exige sesión |

La sesión **nunca redirige**. Quien llega sin haber entrado tiene que poder
leer, y al final se le dice —sin prometer respuestas concretas— que dentro hay
más.

---

## 3 · Dónde se encuentra

| Desde | Dónde |
|---|---|
| La portada pública | «Ayuda» en la cabecera y «Preguntas frecuentes» el primero del pie |
| La puerta de módulos | al pie, junto a la nota de acceso |
| Dentro de la plataforma | grupo **Sistema**, antes del Centro de soporte |

Está en **Sistema** y no dentro de un módulo, y eso es una decisión: la FAQ es
transversal. Ponerla dentro de Quality la haría desaparecer para quien no lo
tenga, y las preguntas de cuenta, empresa o documentos valen para todos.

Va **antes** del Centro de soporte a propósito: primero se busca, y si no está,
se pregunta.

---

## 4 · La página

Abre con **«¿En qué podemos ayudarte?»** y un buscador. Debajo: los temas, lo
más preguntado, y las respuestas.

Sin acordeones. Una respuesta corta cabe entera; plegarla añadiría estado,
`aria-expanded` y una pulsación para leer dos líneas.

Sin estado de navegador: la búsqueda y los filtros viajan **por la URL**. Así una
búsqueda se comparte, el botón de atrás hace lo que se espera, y quien llega sin
ejecutar JavaScript lee igual.

**Las destacadas desaparecen al buscar.** Si alguien busca, lo que quiere es su
resultado, no lo que solemos destacar.

---

## 5 · La búsqueda

Servidor, español, `search_document` —la columna generada de 0155— con el
analizador `websearch`, que entiende comillas y exclusiones sin que haya que
enseñárselo. Índice GIN sobre las revisiones vigentes.

Busca en la pregunta y en las dos respuestas: encontrar «organismo certificador»
lleva a la respuesta sobre certificación aunque esas palabras no estén en la
pregunta.

Sin servicios externos, sin vectores y sin IA.

---

## 6 · Los temas

Salen de la base, con su orden y su cuenta. **Una categoría sin preguntas para
quien mira no se ofrece**: un menú que lleva a una pantalla vacía es una promesa
que la pantalla no cumple.

Consecuencia visible y deliberada: **un visitante ve menos temas que alguien con
sesión**, porque buena parte de las respuestas hablan del uso diario. No es un
fallo; es lo que evita ofrecerle un tema que para él está vacío. Hay una
comprobación por HTTP que abre todos los temas ofrecidos a un visitante y exige
que ninguno esté vacío.

«Seguridad y privacidad» **no se ofrece todavía**: su contenido es de B5.

---

## 7 · Los cuatro vacíos

| Situación | Qué se lee |
|---|---|
| No hay nada publicado | «Todavía no hay preguntas publicadas» |
| Búsqueda sin resultados | «No hay resultados para esa búsqueda» |
| Tema sin preguntas | «Este tema todavía no tiene preguntas» |
| **Avería** | «No se pudieron cargar las preguntas. **Es un problema temporal**…» |

La cuarta es la que importa. Una avería que se lee «no encontramos preguntas»
hace que alguien deje de buscar, convencido de que Trazaloop no tiene respuesta a
lo suyo. Se pinta además distinta —aviso, no vacío— y las cuatro se anuncian con
`role="status"`.

---

## 8 · El enlace de cada respuesta

`/faq/<identificador>`. El identificador **no se deriva del texto**: reformular
la pregunta no rompe un marcador guardado. Es la razón por la que 0155 separó
identidad y texto, y hay una comprobación que cambia la pregunta y verifica que
el enlace sigue siendo el mismo.

Cada respuesta lleva su título propio en la pestaña y su descripción. Los
metadatos se componen con la vista **pública**: hacerlo con la de sesión
filtraría por el título una respuesta que la página no va a enseñar. Una
dirección que no lleva a nada se marca `noindex`.

---

## 9 · Visibilidad ≠ derecho de módulo

La regla de PEH-05, comprobada de cuatro maneras:

> Que una empresa no tenga contratado un módulo **no le oculta la documentación
> sobre ese módulo**.

Una empresa con todos los módulos apagados abre la respuesta del pasaporte
textil y filtra por Textiles sin problema. Lo único que amplía lo que se lee es
**haber iniciado sesión**.

Y su reverso, comprobado por cinco caminos —el listado, la búsqueda por su texto
exacto, el identificador a mano, el contador de su categoría y las destacadas—:
una respuesta que exige sesión **no se filtra** a quien no la tiene.

---

## 10 · Lo que nunca sale

`verification_status`, `source_basis`, `verification_note`, `verified_at`,
`change_note`, `created_by`, `external_source_url`, `content_hash`,
`revision_number`, `effective_to`.

No porque la capa se acuerde de excluirlos: **las vistas no los contienen**. La
capa del producto ni siquiera menciona esos nombres, y hay una prueba que lo
comprueba leyendo su código.

---

## 11 · Consultas

| Pantalla | Consultas |
|---|---|
| `/faq` | **4**: resultados (con total), categorías, destacadas, y una de una fila para saber si hay algo publicado |
| `/faq` con filtros | las mismas 4; las destacadas no se pintan pero se piden |
| `/faq/[slug]` | **2**: la respuesta y las de su categoría · más 1 en los metadatos |

Ninguna crece con el número de preguntas: todas están acotadas o paginadas (20
por página). La de categorías pide **una columna** de todas las filas visibles y
agrupa en memoria —decenas de cadenas cortas— en vez de añadir una segunda vista
por una cuenta. El día que sean miles, eso pasa a ser una vista.

**Mejora pendiente y anotada:** en `/faq` con filtros se piden las destacadas
aunque no se vayan a pintar. Es una consulta de cinco filas y no se ha optimizado
para no complicar el flujo; queda dicho en vez de disimulado.

---

## 12 · Accesibilidad y pantalla estrecha

- El buscador es un `form` con `role="search"`, etiqueta oculta y nombre
  accesible; funciona con teclado y sin JavaScript.
- Los temas son enlaces con `aria-current="page"` en el activo, y el activo se
  distingue **también por peso de fuente**, no solo por color.
- Un `h1` por página, `h2` por sección, `h3` por respuesta.
- Sin tablas, sin anchos fijos en píxeles, sin desplazamiento horizontal.
- Foco visible en enlaces y botones.

---

## 13 · Lo que este tramo NO hizo

- **No** hay ayuda contextual ni se migraron las once ayudas de partes
  interesadas: es B4.
- **No** se publicó ninguna respuesta de seguridad ni la del entrenamiento de
  modelos: es B5.
- **No** hay planes, precios ni pagos, ni ninguna cifra comercial en la FAQ.
- **No** se tocó «Crear cuenta Demo» ni se renombró a «Gratis»: es PE-04.
- **No** se creó ninguna tabla.
