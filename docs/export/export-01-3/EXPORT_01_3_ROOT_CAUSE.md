# EXPORT-01.3 · Causa raíz

## CAUSA RAÍZ

> **El archivo es AVIF. Se llama `logo.png`, el almacenamiento lo tiene
> registrado como `image/png`, y la tubería del PDF preguntaba por el tipo
> DECLARADO en vez de mirar los bytes.**

El navegador lo mostraba sin problema —los navegadores miran el contenido— y el
PDF se rendía. Las dos cosas eran ciertas a la vez, y por eso el defecto parecía
inexplicable desde fuera.

## El original

Recuperado del almacenamiento privado de Staging, **sin modificarlo**:

| | |
|---|---|
| Guardado como | `{organization_id}/logo/logo.png` |
| `content_type` registrado | `image/png` |
| **Contenido real** | **ISO-BMFF, marca `avif` — AVIF/AV1** |
| Bytes mágicos | `00 00 00 20 66 74 79 70 61 76 69 66` → `....ftypavif` |
| Peso | 10 179 bytes |
| Dimensiones | 484 × 240 |
| Canales | 4 (RGBA) |
| Espacio de color | sRGB |
| Profundidad | 8 bits por canal (`uchar`) |
| Alfa | **sí** |
| Perfil ICC | no |
| EXIF | no |
| Orientación | ninguna |
| Entrelazado / progresivo | no |
| Páginas / animación | 1 |
| Compresión | AV1 |
| Decodificador que lo lee | libvips 8.17.3 vía libheif |

Visualmente: el logotipo de IDENDI —«IDENDI / Instituto para el desarrollo del
entretenimiento digital»— en negro sobre fondo transparente.

## La tubería anterior, paso a paso

Reproducido con el asset exacto antes de tocar una línea:

```
ETAPA 1 · recuperación del asset          OK  (10 179 B)
ETAPA 2 · decodeImage(original)           FALLA → «Formato de imagen no soportado en el PDF.»
ETAPA 3 · toEmbeddableImage("image/png")  outcome=native   ← ¡aquí!
          ¿bytes cambiaron?               NO — devolvió los originales
ETAPA 4 · ¿se reintenta decodificar?      NO — la condición exige outcome==='converted'
ETAPA 5 · veredicto del logo              unusable
ETAPA 6 · PDF generado                    0 objetos de imagen · 0 dibujos del logo

UPLOAD / APP DISPLAY = OK
PDF LOGO             = FAIL
```

### Por qué fallaba

El escritor de PDF de este repositorio está hecho a mano. Sabe incrustar dos
cosas: JPEG tal cual (`/DCTDecode`) y PNG de 8 bits sin entrelazar
(`/FlateDecode` + `/SMask`). Cualquier otra cosa la rechaza por bytes mágicos —y
hace bien, porque no sabe leerla—.

EXPORT-01 añadió una red de seguridad: si el escritor no puede, convertir con
`sharp`. Pero esa red preguntaba **por el tipo declarado**:

```ts
const NATIVE = new Set(["image/png", "image/jpeg"]);
if (NATIVE.has(mime)) return { bytes, outcome: "native" };   // ← se cree la etiqueta
```

Con `mime = "image/png"` la función respondía «esto ya es nativo, no hay nada
que convertir», devolvía **los bytes AVIF sin tocar**, y el reintento —atado a
`outcome === "converted"`— no llegaba a ejecutarse.

La red de seguridad se desactivaba a sí misma **justo en el único caso en que
hacía falta**: cuando la etiqueta miente.

Funcionaba para WebP porque un WebP subido como WebP declara `image/webp`
honestamente. Bastaba una etiqueta equivocada para que dejara de funcionar, y
una etiqueta equivocada no requiere mala intención: renombrar un archivo basta.

## Cómo llegó ahí un AVIF

El validador de subida comprueba `file.type`, que es **lo que dice el
navegador**, y el navegador lo deriva casi siempre de la extensión. Un archivo
AVIF renombrado a `.png` se presenta como `image/png` y pasa. Después,
`uploadCompanyLogo` guarda ese mismo tipo declarado en el `content_type` del
objeto, así que el almacenamiento **propaga la mentira** en lugar de detenerla.

Tres capas —navegador, validador y almacenamiento— repitiendo la misma
afirmación sin que ninguna la comprobara.

## El defecto de fondo, que era más grande

Al analizar el asset quedó claro que AVIF era el síntoma, no la enfermedad. El
escritor de PDF entiende **un subconjunto** de PNG y JPEG, y todo lo que caiga
fuera produce el mismo silencio:

| Variante | Con el motor anterior |
|---|---|
| PNG entrelazado | rechazado |
| PNG de 16 bits | rechazado |
| PNG indexado **con tRNS** | aceptado **perdiendo la transparencia** |
| JPEG CMYK | rechazado |
| WebP | rescatado solo si la etiqueta era honesta |
| AVIF | rechazado |

La de tRNS es la peor de todas: no falla, **miente**. Un logo recortado se
incrusta opaco y aparece sobre un rectángulo de color.

Ampliar el escritor para cubrir cada variante es escribir un decodificador de
imágenes completo dentro de un generador de PDF, y cada hueco que quedara se
manifestaría igual: una empresa ve su logo en pantalla y no lo ve en el papel.

Por eso la corrección no es «añadir AVIF». Es **dejar de interpretar variantes**.
Ver `EXPORT_01_3_NORMALIZATION.md`.
