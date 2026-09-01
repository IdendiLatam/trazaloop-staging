# PE-03B1 · Qué se comprobó, y a qué nivel

> **SUPERSEDED BY PRODUCT OWNER DECISION · 31 de agosto de 2026**
>
> Este documento describe el tope de **200 MB por archivo** que regía cuando se
> escribió. El propietario del producto lo **revocó en PE-03B3, sin sustituirlo
> por otro número**, y también dejó dicho que Trazaloop **no impone una duración
> máxima**.
>
> El texto se conserva tal como se escribió: es el informe de lo que se hizo
> entonces, y reescribirlo dejaría sin explicación las decisiones que sí se
> tomaron con esa regla puesta. Lo que hoy rige está en
> [PE_03B3_LARGE_MEDIA_ARCHITECTURE.md](PE_03B3_LARGE_MEDIA_ARCHITECTURE.md).


**69 comprobaciones**, cuatro suites. El nivel importa: seis de estas salen
verdes sin demostrar nada si se hacen contra la tabla equivocada.

| Suite | Nivel | Checks |
|---|---|---|
| `pe03b1-tutorial-media` | puro · en `test:all` | 24 |
| `pe03b1-tutorials` | base real | 15 |
| `pe03b1-upload-security` | base real + Storage | 15 |
| `pe03b1-playback` | base real + HTTP con rango | 15 |

---

## Lo que pedía el encargo, y dónde está

### Versionado · §33

| | Dónde |
|---|---|
| **A** identidad estable | `tutorials` A |
| **B** un tutorial por `page_key` | `tutorials` B |
| **C** clave desconocida rechazada | `tutorials` C · `media` C4 |
| **D** identidad de bienvenida válida | `tutorials` D |
| **E** subir no publica | `tutorials` E |
| **F** versión publicada inmutable | `tutorials` L |
| **G** una versión nueva conserva la vieja | `tutorials` **H** |
| **H** una sola vigente | `tutorials` I |
| **I** el periodo anterior queda cerrado | `tutorials` I |
| **J** reponer no reabre el periodo | `tutorials` **J** |
| **K** el objeto histórico sigue referenciado | `tutorials` J |
| **L** sin borrado destructivo de lo histórico | `tutorials` L |

### Subida · §34

| | Dónde |
|---|---|
| **M** persona normal no reserva | `upload` C |
| **N** soporte no reserva | `upload` B |
| **O** superadministrador sí | `upload` A |
| **P** el destino es de una ruta concreta | `upload` A, D |
| **Q** no se puede reclamar otro destino | `upload` M, O |
| **R** archivo vacío rechazado | `upload` E · `media` A2 |
| **S** más de 200 MB rechazado | `upload` E · `media` A3 |
| **T** extensión equivocada | `media` A5 |
| **U** tipo equivocado | `upload` F · `media` A4 |
| **V** firma binaria equivocada | `media` A6, A7 |
| **W** subida fallida invisible | `upload` H, I |
| **X** objeto sin finalizar no se publica | `upload` J · `tutorials` F |

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

El tope de 200 MB se prueba **en el metadato**, no subiendo 200 MB: la
comprobación de tamaño ocurre al reservar, y hacerla de verdad convertiría la
suite en cuatro minutos de red por nada. La integración se prueba con archivos
de 256 KB y 512 KB.

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

### Reproducción · §35

| | Dónde |
|---|---|
| **Y** una persona permitida obtiene la vigente | `playback` A, B, E |
| **Z** la candidata no | `playback` C |
| **AA** la histórica no | `playback` D, F |
| **AB** sin sesión no se llega | `playback` J, K |
| **AC** la firma caduca | `playback` I |
| **AD** rango 206 | `playback` **G** |
| **AE** los bytes del tramo correctos | `playback` **G** |
| **AF** el cubo no se lista | `upload` K |

### Cuota e independencia · §36

| | Dónde |
|---|---|
| **AG** no cuenta en la cuota | `playback` **M** · `media` D1 |
| **AH–AJ** módulos independientes | `playback` N · `media` C4 |
| **AK** sin respaldo entre módulos | `playback` N |
| **AL** sin barrera de plan | `playback` **O** |

### La regresión de seguridad · §37

La comprobación **O** de `upload-security` documenta el hallazgo en vez de
fingir lo contrario: no se afirma que la política de Storage impida las subidas
firmadas. Se comprueba lo que sí protege — que una persona normal no obtiene
reserva, y sin reserva no hay ruta que firmar.

---

## Las seis que salen verdes sin demostrar nada si se hacen mal

**1 · «La versión anterior se conserva.»** Contando filas: inútil. Las filas se
conservan casi siempre; lo que se puede perder son los bytes. Se descarga el
objeto y se **compara su SHA-256**.

**2 · «Reponer no reabre el periodo.»** Viendo que hay una versión nueva:
inútil. Se lee el `effective_to` de la antigua **antes y después**.

**3 · «El vídeo se reproduce.»** Con un 200: demuestra que el objeto existe. Se
pide un **rango** y se comparan los bytes del tramo.

**4 · «Los tutoriales no cuentan en la cuota.»** Afirmándolo: es una promesa. Se
**mide** el consumo real con `v_module_usage`.

**5 · «No hay barrera de plan.»** Probando con una cuenta Demo: solo prueba esa
cuenta. Se **lee el código** del camino de lectura y se comprueba que no
menciona planes.

**6 · «La ruta es segura.»** Con un nombre normal: no prueba nada. Se prueba con
`../../../etc/passwd`, `a/b/c.mp4` y etiquetas HTML.

---

## Los dos fallos que encontraron las pruebas

**La marca de fallo que se deshacía sola.** `tutorial_finalize_upload` marcaba
la versión como fallida y lanzaba una excepción — que deshacía la marca con la
transacción. La versión se quedaba en `uploaded` para siempre. Lo encontró la
comprobación **H** de `upload-security`, y el arreglo no fue persistir a pesar
del error: fue ver que no es un error.

**La política que se evaluaba con permisos ajenos.** La comprobación de lectura
del cubo llevaba una subconsulta dentro del `using`, que se evalúa con la
identidad de quien pregunta — y la RLS de las versiones le devolvía cero filas.
Una persona normal no podía firmar el vídeo vigente. Lo encontró la comprobación
**E** de `playback`, con un «Object not found» que no señalaba a ninguna parte.

---

## Las cuentas

Se crean al vuelo con la API administrativa, como en PE-02: superadministrador,
soporte, persona normal, y una segunda persona donde hace falta.

**Y las suites son repetibles.** Cada una usa una clave de pantalla propia con
marca de tiempo, se autorrepara al arrancar retirando lo que dejó una pasada
caída, y retira sus objetos en un `finally` — no al final del camino feliz. Es la
lección que PE-02B4 aprendió por las malas, multiplicada aquí porque estas suben
archivos.

---

## Lo que no se comprueba, y hace falta a mano

1. Que el vídeo **se vea bien** en un teléfono.
2. Que **adelantar** con el ratón se sienta fluido, no solo que devuelva 206.
3. Que un vídeo real de 100 MB **se suba** sin que el navegador se atragante.

Las tres son de B2 y B3, cuando haya consola y reproductor.
