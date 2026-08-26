# EXPORT-01.3 · El logo canónico

> Todo logo válido que Trazaloop acepta se normaliza en servidor antes de llegar
> al escritor de PDF.

## La idea

El escritor de PDF deja de adivinar. Recibe **siempre lo mismo**:

```
PNG · 8 bits por canal · RGBA · sRGB · sin entrelazar · ya orientado
```

Una sola forma. Lo que llega desde el almacenamiento —PNG de cualquier variante,
JPEG de cualquier variante, WebP, AVIF— se convierte en esa forma antes de
tocarlo.

## La tubería

```
ASSET PRIVADO AUTORIZADO
        ↓  (organizationId de la sesión → fila de la empresa → bucket privado)
RECONOCER EL FORMATO REAL          ← bytes mágicos, nunca la etiqueta
        ↓  lo que no sea PNG/JPEG/WebP/AVIF se detiene aquí
DECODIFICAR                        ← sharp / libvips, con techo de píxeles
        ↓
ORIENTAR                           ← .rotate(), aplica el EXIF
        ↓
NORMALIZAR COLOR                   ← .toColourspace("srgb")
        ↓
NORMALIZAR ALFA                    ← .ensureAlpha()
        ↓
LIMITAR TAMAÑO                     ← lado mayor ≤ 1400 px, proporción intacta
        ↓
PNG CANÓNICO
        ↓
CODIFICADOR PDF                    ← el de siempre: /FlateDecode + /SMask
        ↓
ENCABEZADO CORPORATIVO             ← sin cambios respecto de EXPORT-01.2
```

## El reconocimiento por contenido

`lib/pdf/image-kind.ts` mira los primeros bytes, como hace un navegador:

| Formato | Firma |
|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| JPEG | `FF D8 FF` |
| WebP | `RIFF` … `WEBP` |
| AVIF | caja `ftyp` con marca `avif` / `avis` |
| HEIC | caja `ftyp` con `heic`, `heif`, `mif1`… |

Y reconoce también **lo que hay que rechazar** —SVG, GIF, BMP, TIFF, cualquier
otra cosa— para poder negarlo con un motivo claro en vez de dejar que llegue al
decodificador. Se **falla cerrado**: lo desconocido no pasa.

Un tipo declarado es *una afirmación de quien sube el archivo*. Puede estar
equivocada sin mala intención y puede estarlo a propósito. Los bytes no.

## Los cinco pasos, y por qué cada uno

**Orientar antes.** Un JPEG puede llevar en su EXIF «esto va girado 90°». El PDF
no entiende de EXIF: si no se aplica aquí, el logo sale tumbado. `.rotate()` sin
argumentos aplica exactamente lo que dice el metadato.

**Color a sRGB.** Un JPEG CMYK o un PNG con un perfil raro se interpretan de
forma distinta según quién los abra. Se llevan al único espacio que el PDF va a
mostrar igual en todas partes.

**Alfa siempre.** No para inventar transparencia: para que el escritor tenga
**una** forma que tratar. Un logo opaco recibe una máscara opaca; uno recortado
conserva la suya. Lo que se evita es la rama en la que un PNG indexado con tRNS
se incrustaba «sin alfa» y aparecía sobre un rectángulo de color.

**Sin aplanar contra un fondo.** No se convierte a JPEG por defecto, no se pinta
blanco detrás y no se intenta quitar fondos con heurísticas. Si el logo trae
fondo blanco real, se conserva; si es transparente, se conserva. La imagen dice
lo que dice.

**Limitar el tamaño.** En el papel el logo ocupa 92 × 30 puntos, unos 32 × 10
milímetros. A 300 ppp eso son ~380 píxeles de ancho. Se permite hasta **1400 px
de lado mayor** —casi cuatro veces— para que quepan logos muy apaisados y para
no notar el recorte si la caja crece. Por encima solo se añaden bytes que nadie
ve: incrustar 12 000 × 8 000 para dibujarlo a 30 mm es regalar megas por página.
La proporción se conserva y **un logo pequeño nunca se agranda**.

## Límites

| | | Por qué |
|---|---|---|
| `MAX_LOGO_INPUT_BYTES` | 2 MB | El mismo que acepta la subida |
| `MAX_INPUT_PIXELS` | 40 Mpx | Un archivo de 250 KB puede declarar 30 000 × 30 000; libvips corta antes de reservar memoria |
| `MAX_CANONICAL_SIDE` | 1400 px | Explicado arriba |
| Animación | primer fotograma | Un logo animado es raro; se imprime su primer cuadro en vez de rechazar el documento entero |

## Qué se rescató

| Variante | Antes | Ahora |
|---|---|---|
| PNG RGBA / RGB / gris / gris+alfa | funcionaba | funciona |
| PNG indexado | funcionaba | funciona |
| **PNG indexado con tRNS** | **incrustaba opaco** | conserva la transparencia |
| **PNG entrelazado** | rechazado | funciona |
| **PNG de 16 bits** | rechazado | funciona |
| JPEG baseline / progresivo | funcionaba | funciona |
| **JPEG CMYK** | rechazado | funciona |
| JPEG con EXIF girado | se incrustaba tumbado | se orienta |
| **WebP con y sin pérdida** | solo si la etiqueta era honesta | funciona siempre |
| **AVIF** | rechazado | funciona |
| HTML / SVG disfrazados | rechazado | rechazado, con motivo |
| PNG corrupto | rechazado | rechazado, sin caerse |
| Bomba de descompresión | rechazado | rechazado antes de reservar memoria |

## Lo que NO cambió

**El original.** El archivo que la empresa subió sigue intacto en su
almacenamiento privado, byte a byte —comprobado releyéndolo después de generar
los PDF—. La normalización ocurre **en memoria** durante la generación.

**No hay caché.** Ni tabla, ni bucket, ni migración. Se normaliza una vez por
documento y se descarta.

**El encabezado.** El diseño aprobado en EXPORT-01.2 no se toca: logo, empresa y
nombre del documento, en todas las páginas. Lo único que cambió es de dónde sale
la imagen.

**Una vez por PDF.** Una descarga, una normalización, un registro en el archivo,
N páginas dibujándolo. Nada de `sharp` por página.

## El contrato con la subida

Aceptar un formato que después no se puede usar es el defecto que este sprint
vino a cerrar. Así que ahora:

```
ALLOWED_LOGO_TYPES  ==  SUPPORTED_LOGO_KINDS
image/png · image/jpeg · image/webp · image/avif
```

**AVIF entra en la lista porque el normalizador lo resuelve**, no al revés. Una
prueba compara las dos listas en los dos sentidos.

Y la validación deja de creerse la etiqueta: la acción de subida mira el
contenido, rechaza lo que no sabe normalizar, y **guarda el tipo y la extensión
que corresponden a lo que el archivo ES**. El almacenamiento deja de propagar la
mentira.

**SVG sigue fuera**, y es una decisión declarada: un SVG es un documento con
scripts, no un mapa de bits. No se habilita para resolver un caso concreto.

## Si el logo no se puede usar

La semántica de EXPORT-01.2 se mantiene: `none` (no hay logo) es distinto de
`unusable` (hay logo y no sirve), y el encabezado avisa en el segundo caso sin
revelar nada del almacenamiento. Lo que cambia es **quién cae en cada cubo**: el
logo de este caso pasó de `unusable` a `ok`, porque es una imagen válida que la
plataforma sí sabe procesar.
