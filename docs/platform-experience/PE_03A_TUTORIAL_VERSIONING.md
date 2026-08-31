# PE-03A · Identidad, versiones y publicación

Trazaloop ya ha resuelto este problema tres veces: documentos legales, FAQ y
ayuda contextual. PE-03 lo resuelve una cuarta, con la misma forma, y añade lo
único que es nuevo: que aquí la versión tiene un archivo detrás.

---

## PET-14 · La forma, que ya existe

| | Identidad | Revisiones | Borrador | Publicación |
|---|---|---|---|---|
| Legales | `legal_documents` | la propia fila | — | `legal_publish_document` |
| FAQ | `faq_entries` | `faq_entry_revisions` | `faq_entry_drafts` | `faq_publish_entry` |
| Ayuda | `help_items` | `help_item_revisions` | `help_item_drafts` | `help_publish_item` |
| **Tutoriales** | `platform_tutorials` | `platform_tutorial_versions` | *(ver PET-16)* | `tutorial_publish_version` |

Identidad estable + versiones inmutables con `effective_from`/`effective_to`,
índice único parcial que garantiza **una sola versión abierta**, publicación por
función `security definer`, e inmutabilidad por **disparador** —no por política,
porque una política no detiene a `service_role`—.

**Se elige la opción A del encargo §52**, con una diferencia que se explica en
PET-16.

---

## PET-15 · La identidad de un tutorial de página

**Es el `page_key` de PE-02.** No la ruta, ni el título, ni el nombre del
componente.

Una pantalla puede mudarse de `/quality/context/interested-parties` a otro sitio
sin que su tutorial deje de ser el suyo: lo que se actualiza es el `route` del
registro, y la clave —y con ella el tutorial, su historia y sus versiones— no se
entera.

**Un tutorial por clave de página.** No varios compitiendo.

Si algún día hacen falta un tutorial rápido y uno avanzado para la misma
pantalla, la identidad tendría que crecer con un discriminante. **Hoy no hace
falta y no se construye.** Añadirlo ahora sería pagar una complejidad por un caso
que nadie ha pedido, y quitarlo después es más difícil que añadirlo.

---

## PET-16 · Por qué el borrador NO es una tabla aparte

Aquí PE-03 se separa de la FAQ y de la ayuda, y conviene decir por qué.

En la FAQ, el borrador es una tabla aparte porque **se edita muchas veces**:
alguien escribe, corrige, vuelve, y mientras tanto lo publicado tiene que seguir
intacto y visible. Un borrador a medias no es historia de nada.

Un vídeo no se edita. **Se sube.** No hay un estado intermedio en el que alguien
va cambiando un archivo palabra por palabra: hay un archivo, y luego hay otro.
Los metadatos que sí se editan —título, descripción, nota de cambio— son cuatro
campos, no un documento.

Así que la versión candidata **es una fila de `platform_tutorial_versions`** con
estado propio, no una tabla de borradores paralela. Se elige la **opción B** del
encargo §52 para este punto: identidad estable + versiones con estado.

Y la inmutabilidad se aplica **desde que se publica**, no desde que se crea: una
candidata se puede corregir de título; una publicada, jamás. El disparador
distingue los dos casos, igual que el de `legal_documents` distingue borrador de
vigente.

---

## PET-17 · Los estados, que son dos vocabularios y no uno

El encargo pide no mezclar estado de subida con estado de publicación. Son
independientes de verdad, así que van en dos columnas:

**Estado del archivo** — dónde está el objeto:

| | |
|---|---|
| `reserved` | hay reserva, no hay objeto |
| `uploaded` | hay objeto, sin verificar |
| `verified` | el servidor leyó el objeto real: tamaño, tipo y resumen coinciden |
| `failed` | la subida no llegó o no cuadró |

**Estado de publicación** — qué se ve:

| | |
|---|---|
| `candidate` | verificada, lista, no se ve |
| `published` | es la que se ve |
| `retired` | fue la que se veía |

Y del tutorial, como conjunto, se deriva **lo único que la pantalla necesita
saber**: si hay una versión publicada o no. Eso no es una columna: es una
consulta, y se llama `NO_VIDEO` cuando no hay.

Que sean dos columnas evita el enredo clásico: una versión puede estar `verified`
y `candidate` a la vez, y eso es un estado perfectamente normal que un solo
enumerado tendría que inventarse un nombre para representar.

---

## PET-18 · Qué guarda una versión

Derivado de lo que ya guardan las revisiones de FAQ y ayuda, más lo que exige un
archivo:

| Campo | Por qué |
|---|---|
| número o etiqueta de versión | para nombrarla |
| referencia al objeto (cubo + ruta) | dónde están los bytes |
| título y descripción | lo que se lee junto al reproductor |
| duración en segundos | **nula si no se pudo leer** — nunca inventada |
| tamaño y tipo reales | los leídos del objeto, no los declarados |
| nombre original del archivo | metadato, jamás autorización |
| resumen SHA-256 | integridad, duplicados, y distinguir una reposición |
| quién subió y cuándo | la mitad de la historia |
| quién publicó y cuándo | la otra mitad |
| nota de cambio | por qué esta versión existe |
| `effective_from` / `effective_to` | el periodo en que se vio |
| `restored_from_version_id` | si repone contenido anterior, cuál |
| poster | opcional · ver PET-25 |

---

## PET-19 · Publicar

**Subir no publica.** Es el punto que separa este diseño de «reemplazar el
vídeo».

```
subir → verificar → candidata → vista previa → publicar
```

Publicar hace tres cosas en una transacción, como ya hace `legal_publish_document`:

1. cierra la versión vigente poniéndole `effective_to`;
2. abre la nueva con `effective_from`;
3. deja constancia de quién.

**Como mucho una versión publicada por tutorial.** No lo garantiza la función:
lo garantiza un índice único parcial sobre `(tutorial_id)` donde
`effective_to is null`. La diferencia importa — una función se puede llamar dos
veces a la vez.

---

## PET-20 · Reponer una versión anterior

El encargo lo pide y prohíbe la vía fácil: **no se reabre un periodo histórico**.

```
histórica A  ──elegir como base──▶  candidata nueva  ──publicar──▶  vigente
```

La versión nueva es una fila nueva, con su propio `effective_from`, que **apunta
al mismo objeto** de A —seguro, porque nadie sobrescribe— y guarda
`restored_from_version_id = A`.

La historia queda así, y es la verdad:

| Versión | Periodo | Contenido |
|---|---|---|
| v1 | mar–jun | archivo X |
| v2 | jun–ago | archivo Y |
| **v3** | ago–hoy | **archivo X**, repuesto de la v1 |

Lo que **no** se hace es volver a abrir el periodo de la v1, que diría que ese
vídeo estuvo vigente desde marzo hasta hoy con un hueco imposible en medio.

Reponer no es deshacer. Es publicar otra vez, y se lee así.

---

## PET-21 · Nada se borra

Coherente con la decisión congelada: las versiones anteriores se conservan.

- **No hay borrado de versiones publicadas o históricas** en la consola. No es que
  esté escondido: no existe.
- Lo que sí hay es **retirar** un tutorial: deja de verse, y la historia queda.
- Y hay limpieza de basura —reservas caducadas y objetos que nunca llegaron a ser
  versión—, que es otra cosa (PET-12).

---

## PET-22 · El vídeo de bienvenida, en el mismo motor

**Sí, comparte motor.** Un discriminante de tipo, no un segundo sistema.

| | |
|---|---|
| `page_tutorial` | identificado por `page_key` |
| `welcome` | identificado por una clave global |

Todo lo demás —versiones, verificación, publicación, historia, reposición,
almacenamiento— es idéntico, y construir dos motores para eso sería duplicar el
trabajo y la superficie de fallo.

La bienvenida **no cuelga de una clave de página**, y no se le inventa una ruta
falsa para alojarla: el tipo la distingue. `PAGE_KEYS` no crece con una entrada
ficticia.

Lo único propio de la bienvenida es **cuándo se muestra y qué recuerda de cada
persona**, y eso vive fuera del motor de contenido: en
`PE_03A_WELCOME_ONBOARDING.md`.

---

## PET-23 · La historia vive en las tablas de negocio

No en el registro de auditoría. Quién subió, quién publicó, cuándo empezó y cuándo
dejó de verse cada versión son **datos del contenido**, no rastros técnicos.

Es lo que ya hacen la FAQ, la ayuda y los documentos legales, y lo que permite
que la consola responda «qué se veía en junio» sin depender de que nadie haya
purgado un log.

---

## PET-24 · Subtítulos y transcripción

**La arquitectura los deja entrar; PE-03B no los exige.**

Un tutorial sin subtítulos excluye a quien no oye, y eso hay que decirlo en vez
de descubrirlo. Pero exigirlos para publicar el primer vídeo significaría no
publicar ninguno hasta tener a alguien que los escriba.

Lo que se hace ahora es no cerrarles la puerta: una versión puede tener pistas de
texto asociadas, en el mismo cubo y bajo la misma versión, y el reproductor
nativo las muestra con `<track>` sin librería.

**Y no se generan.** Ni con IA ni de otra forma: una transcripción inventada de un
vídeo es peor que ninguna, porque parece fiable.

**Queda documentado como hueco de accesibilidad**, y es una de las decisiones
humanas.

---

## PET-25 · Miniaturas

**No hace falta un canal de imágenes.**

El navegador pinta el primer fotograma solo. Un `poster` explícito mejora el
cartel cuando el primer fotograma es negro, así que el campo existe y es
**opcional**: si alguien sube uno, se usa; si no, el navegador se apaña.

Lo que no se construye es la generación automática de miniaturas, que exige
procesar vídeo en el servidor para un beneficio cosmético.

---

## PET-26 · El reproductor

**`<video controls>` del navegador.** Sin librería.

Reproducir, pausar, adelantar, volumen, pantalla completa y subtítulos vienen
gratis, funcionan en móvil, son accesibles por teclado desde el primer día, y
pesan cero.

Una librería de reproductor se justificaría con reproducción adaptativa, marcas
de capítulo o analítica de reproducción. Nada de eso está pedido.

Y la sonda dice que el navegador podrá hacer su trabajo: `Accept-Ranges: bytes`,
`206` con rango correcto, y sin `Content-Disposition` que fuerce una descarga.

---

## PET-27 · Medir reproducciones

**No en PE-03B.**

Se puede: existe un bus de hechos de negocio con deduplicación. Y podría ser útil
saber qué tutorial nadie termina.

Pero no bloquea nada, no lo pide el producto, y la diferencia entre saber qué
tutorial se abandona y vigilar a quien lo abandona es de diseño, no de intención.
Se documenta como posible y se deja fuera.
