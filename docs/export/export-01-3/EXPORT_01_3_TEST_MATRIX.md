# EXPORT-01.3 · Matriz de pruebas

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:export013` | La normalización, sobre imágenes reales generadas | **34 conformes, 0 fallos** |
| `npm run test:export012` | El encabezado corporativo sigue intacto | **28, 0** |
| `npm run test:export011` | La cobertura universal sigue intacta | **31, 0** |
| `npm run test:export01` | El motor de EXPORT-01 sigue intacto | **54, 0** |
| Validación en Staging | **Con el archivo real que hoy falla** | **14, 0** |
| `npm run test:all` | Regresión completa | **exit code 0** |

---

## Los fixtures

No hay ningún binario versionado y **no está el logo del cliente** (§28). Los
fixtures se **generan**: `tests/fixtures/logo-variants.ts` construye cada PNG
byte a byte —para poder elegir profundidad, tipo de color, paleta, tRNS,
entrelazado— y deriva de él las demás variantes con `sharp`.

Así se puede leer qué tiene cada fixture en vez de confiar en un blob opaco.

**El fixture del defecto** es `avif-named-png`: bytes AVIF que todo el mundo
llama PNG. Reproduce la propiedad técnica responsable sin llevarse la marca de
nadie al repositorio.

## Los ocho grupos

### A · El contenido manda (4)

- `A1` · el reconocedor identifica PNG, JPEG, WebP y AVIF por sus bytes.
- `A2` · **el defecto**: un AVIF llamado PNG. Comprueba primero la
  **precondición** —que el escritor antiguo no podía con él— y luego que la
  normalización sí.
- `A3` · y llega dibujado hasta el PDF, en todas las páginas.
- `A4` · el veredicto pasa de `unusable` a `ok`: es lo que ve la empresa.

### B · Siete variantes rescatadas (7)

Cada una comprueba **la precondición primero**: que fallaba de verdad antes. Una
prueba de regresión que no demuestra el fallo previo no prueba nada.

| Variante | Antes |
|---|---|
| PNG entrelazado | rechazado |
| PNG de 16 bits | rechazado |
| JPEG CMYK | rechazado |
| WebP con pérdida | rechazado |
| WebP sin pérdida con alfa | rechazado |
| AVIF | rechazado |
| **PNG indexado con tRNS** | **aceptado, perdiendo la transparencia** |

La última es distinta y es la que más importa: no fallaba, **mentía**. La prueba
asserta que antes `image.alpha === undefined` y ahora existe.

### C · El canónico tiene una sola forma (5)

- `C1` · las **quince** variantes admitidas producen PNG de 8 bits, DeviceRGB,
  con alfa y `/FlateDecode`. Siempre.
- `C2` · la orientación EXIF se aplica: un JPEG 120×60 con orientación 6 sale
  vertical.
- `C3` · 3000×1000 se reduce a ≤1400 conservando la proporción (±0,02).
- `C4` · 120×60 **no** se agranda.
- `C5` · la transparencia no se aplana: el PDF lleva `/SMask`.

### D · Falla cerrado (6)

| Entrada | Veredicto |
|---|---|
| HTML con `<script>` | `unsupported_format` |
| SVG con `<script>` | `unsupported_format` |
| PNG realmente roto | `decode_failed` |
| Cabecera que declara 30 000 × 30 000 con 72 bytes | `decode_failed` |
| Archivo por encima de 2 MB | `too_large` |
| Cualquiera de ellos | **el PDF se genera igual**, con aviso |

### E · Contrato con la subida (3)

- `E1` · `ALLOWED_LOGO_TYPES` y `SUPPORTED_LOGO_KINDS` coinciden **en los dos
  sentidos**: nada se acepta que no se sepa normalizar, y nada se normaliza que
  no se acepte.
- `E2` · la acción de subida usa `sniffImageKind`, rechaza lo desconocido y
  guarda el tipo y la extensión derivados del **contenido**.
- `E3` · SVG sigue fuera, y la exclusión está explicada.

### F · Seguridad y coste (5)

- `F1` · el normalizador no contiene `fetch`, `http`, cliente de base ni storage.
- `F2` · **una** descarga y **una** normalización por documento; el encabezado no
  puede normalizar (se dibuja una vez por página).
- `F3` · el original no se toca: el lector no escribe en el almacenamiento.
- `F4` · sin caché persistente y sin migración > 0122.
- `F5` · los límites están declarados y llegan al decodificador.

### G · EXPORT-01.2 sigue intacto (3)

Logo normalizado en **todas** las páginas de un listado de 220 filas, con **2**
objetos de imagen en el archivo. PNG, JPEG y WebP de siempre siguen apareciendo.
Sin logo, el PDF sigue saliendo.

### H · Coste (1)

| Caso | Normalizar | Incrustar | PDF |
|---|---|---|---|
| Logo pequeño (120×60 PNG) | 1,3 ms | 0,3 ms | 0,1 ms |
| AVIF equivalente al del caso | 1,5 ms | 0,2 ms | 0,0 ms |
| Logo grande (3000×1000 PNG) | 10,4 ms | 18,6 ms | 0,1 ms |
| **Archivo real de Staging (484×240 AVIF)** | **149 ms** | — | — |

Los 149 ms del archivo real incluyen la primera carga de libheif en el proceso;
el AVIF sintético equivalente, ya calentado el decodificador, tarda 1,5 ms. Es
**una vez por documento**, no por página.

## Validación contra Staging · 14 comprobaciones

Con **el archivo exacto almacenado en Staging**, leído sin modificarlo.

| Bloque | Qué demuestra | Nº |
|---|---|---|
| El asset real | Se reconoce como AVIF por su contenido pese a llamarse `.png` | 1 |
| Precondición | El motor anterior **no podía** incrustarlo | 1 |
| Normalización | `heif 484×240 · 4 canales · srgb · alfa=true` → PNG 484×240 en 149 ms | 1 |
| Tres exportaciones por el endpoint real | Logo en todas las páginas, con `/SMask`, y **sin** el aviso de logo roto | 3 |
| Listado multipágina | **10 páginas · logo 10/10 · 2 objetos · 141 KiB** | 1 |
| El original | **Byte a byte igual** después de generar los PDF | 1 |
| PNG de siempre | Sigue apareciendo | 1 |
| Archivo que no es imagen | Sigue siendo inservible, con aviso y sin incrustar basura | 1 |
| Marca ajena por URL | Sigue sin poder imponerse | 1 |
| Limpieza y cuentas QA | Logos y empresas efímeras retirados; las tres cuentas siguen | 3 |

## Comprobación visual

Rasterizado con Quick Look y **mirado**, sin OCR:

| Muestra | Qué se comprobó |
|---|---|
| Datos de la empresa (local, asset real) | El logo de IDENDI aparece, negro sobre transparente |
| **Datos de la empresa (Staging, endpoint real)** | Igual, generado por la aplicación de verdad |
| Listado multipágina | El logo aparece y la tabla no se tapa |

Proporción correcta (484×240 ≈ 2:1 dibujado en la caja), no invertido, sin fondo
inesperado, sin recortes.
