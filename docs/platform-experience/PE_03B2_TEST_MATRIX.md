# PE-03B2 · Qué se comprobó

**63 comprobaciones**, tres suites.

| Suite | Nivel | Checks |
|---|---|---|
| `pe03b2-tutorial-console` | puro · en `test:all` | 35 |
| `pe03b2-tutorial-admin` | base real + Storage | 18 |
| `pe03b2-tutorials` (e2e) | HTTP con sesiones reales | 10 |

---

## P1–P8, el recorrido que pedía el encargo

| | Qué demuestra | Dónde |
|---|---|---|
| **P1** | Llegar a la consola · y que la lista no haga una consulta por fila | `admin` P1 · `e2e` A |
| **P2** | Crear un tutorial desde el registro | `admin` P2 |
| **P3** | Subir un vídeo por el flujo real | `admin` P3 |
| **P4** | Previsualizar la candidata | `admin` P4 · P4b · P4c |
| **P5** | Publicar | `admin` P5 · `e2e` G |
| **P6** | Versión nueva + historia | `admin` P6 · P6b · `e2e` H |
| **P7** | Reponer un vídeo antiguo | `admin` P7 · `e2e` I |
| **P8** | Soporte de solo lectura · persona normal denegada | `admin` P8 · P8b · `e2e` B · C |

**El flujo es el real.** `uploadToSignedUrl`, que es el transporte del navegador
y el único que ejercita la frontera de PE-03B1. No se simula la subida.

---

## Lo que pedía el encargo, por bloques

### La consola · §40 A–L

| | Dónde |
|---|---|
| **A** navegación | `console` A1 · A2 · `e2e` A |
| **B** soporte de solo lectura | `admin` P8 · `e2e` B |
| **C** organización denegada | `admin` P8b · `e2e` C |
| **D** crear desde el registro | `admin` P2 |
| **E** clave libre imposible | `admin` P2b · `console` (B1 C4) |
| **F** identidad de bienvenida | `admin` F3 |
| **G** reserva | `admin` P3 |
| **H** subida firmada directa | `admin` P3 |
| **I** progresión de estados | `console` C1 |
| **J** verificación | `admin` P3 |
| **K** vista previa | `admin` P4 · P4b |
| **L** candidata invisible | `admin` P4c |

### Publicación e historia · §41 M–W

| | Dónde |
|---|---|
| **M** publicar | `admin` P5 |
| **N** la anterior se cierra | `admin` P6 |
| **O** la nueva queda vigente | `admin` P6 |
| **P** historia inmutable | B1 `tutorials` L |
| **Q** vista previa histórica solo para plataforma | `admin` P4c |
| **R** reponer crea versión nueva | `admin` P7 |
| **S** **reponer no reabre el periodo** | `admin` P7 |
| **T** reutiliza el objeto sin copiarlo | `admin` P7 |
| **U** retirar deja sin vídeo | `admin` P7b |
| **V** la identidad y la historia se conservan | `admin` P7b |
| **W** el producto distingue «sin vídeo» | `admin` P7b · `e2e` F |

### Archivos y fallos · §42 X–AF

| | Dónde |
|---|---|
| **X** 200 MB coherente | `console` (B1 A3) · B1 `upload` E |
| **Y** MP4 | `admin` P3 |
| **Z** WebM | `admin` P6 |
| **AA** error legible | `console` I1 |
| **AB** reserva caducada | `console` I1 |
| **AC** verificación fallida | B1 `upload` H |
| **AD** recargar no convierte una reserva en subida hecha | `admin` P3b · el estado vive en la base |
| **AE** una fallida no se publica | B1 `upload` I |
| **AF** descartar solo lo nunca publicado | `console` F2 · acción |

---

## Lo que la consola añade, y no estaba en la lista

| | Qué demuestra |
|---|---|
| **Los bytes no vuelven a Vercel** | ninguna acción declara recibir `File`/`Blob`, y `next.config.ts` sigue sin `bodySizeLimit` |
| **Subir no se anuncia como publicar** | ninguna etiqueta de la subida contiene «publicad» |
| **«Usar nuevamente», no «reactivar»** | ningún botón insinúa que la historia se reescriba |
| **Toda acción pasa por la puerta** | se recorren las exportadas una a una |
| **Las que escriben exigen superadministrador** | ocho, comprobadas por nombre |
| **Las que leen NO lo exigen** | soporte ve |
| **Sin cliente administrativo** salvo la excepción aislada | y esa comprueba referencias antes de borrar |
| **Sin librería de reproductor** | y sin reproducción automática |
| **Sin dato no es cero** | duración y tamaño desconocidos se muestran como «—» |
| **La lista no hace N+1** | contando consultas de verdad con un `Proxy` |
| **La vista previa se firma al pulsar** | no al pintar: una ficha con cinco versiones no firma cinco vídeos |

---

## Lo que encontraron las pruebas

**Un callejón sin salida.** La unicidad del tutorial es por pantalla y no
distingue activo de retirado, así que retirar dejaba esa pantalla sin forma de
volver a tener tutorial. Apareció al ejecutar la suite **dos veces**, no una. Se
resolvió con la acción «Volver a activar», sin tocar el esquema.

**Tres falsos positivos míos, del tipo de siempre.** `File` dentro de
`validateTutorialFileDeclaration`; la palabra «reactivar» dentro del comentario
que explica por qué NO se usa; y el mensaje congelado partido en varias líneas
del JSX. Las tres comprobaciones se corrigieron para mirar el código y no los
comentarios, y para normalizar los espacios. Es la cuarta vez que este
repositorio tropieza con lo mismo.

---

## Y las suites son repetibles

Cada una se autorrepara al arrancar: retira las candidatas de una pasada
anterior con sus objetos, cierra la versión vigente y reactiva el tutorial.

**Lo que no hace es borrar un tutorial que publicó algo** — no se puede, y esa
imposibilidad es justo lo que el tramo promete. Así que la suite hace lo que
haría una persona: **reutiliza la identidad** en vez de crear otra.

Y por eso ninguna comprobación afirma que el contador de publicaciones sea cero:
esa pantalla arrastra historia real de pasadas anteriores, y debe.
