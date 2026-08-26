# EXPORT-01.3 · Reversión

## Sin esquema que revertir

**Ninguna migración.** Staging y Producción siguen en **0122**. No hay tabla de
logos normalizados, no hay bucket nuevo y no hay caché: la normalización ocurre
en memoria durante la generación del PDF.

## Qué se revierte

| Nivel | Acción | Consecuencia |
|---|---|---|
| Rama completa | `git revert` del merge, o no fusionar | Los logos vuelven a resolverse por tipo declarado. **El logo del caso vuelve a desaparecer de los PDF**, junto con PNG entrelazado, 16 bits, JPEG CMYK y WebP |
| Solo la normalización | Devolver `loadCompanyLogo` a `decodeImage` + conversión por MIME | Ocho variantes vuelven a fallar y el PNG indexado con tRNS vuelve a incrustarse opaco. Siete pruebas fallan nombrando cada una |
| Solo la validación de subida | Quitar el examen de contenido de la acción | Vuelve a poder guardarse un archivo cuyo tipo real no coincide con el declarado, que es como se originó este defecto |

## Los cambios que tocan código existente

**1 · `lib/pdf/convert.ts` se eliminó.** Su trabajo —convertir lo que el escritor
no entendía— lo hace ahora `lib/pdf/logo-normalize.ts` para **todos** los
formatos, no solo para los que el escritor rechazaba. Dos pruebas que lo
nombraban se actualizaron para apuntar al nuevo módulo; la invariante que
protegían es la misma y más fuerte.

**2 · `loadCompanyLogo` normaliza antes de incrustar.** Su firma y sus tres
veredictos (`none` / `ok` / `unusable`) no cambian, así que nada de lo que lo
consume se entera. El campo `canonical` que devuelve es opcional y solo lleva
metadata técnica para diagnóstico.

**3 · `ALLOWED_LOGO_TYPES` incluye `image/avif`.** Revertirlo hace que un AVIF
subido honestamente sea rechazado —lo cual es coherente— pero deja sin explicar
los AVIF que ya están almacenados.

**4 · La acción de subida guarda el tipo y la extensión derivados del
contenido.** Los archivos ya almacenados no se tocan: siguen con el
`content_type` que tenían, y la lectura ya no lo consulta.

**5 · `lib/pdf/image.ts` no cambió.** Sigue siendo el codificador PDF de PNG y
JPEG. Lo que cambió es que ahora solo recibe PNG canónico.

## Dos pruebas ajenas se ajustaron

Ninguna se debilitó. `EXPORT-01 · F1` y `EXPORT-01.2 · E1` comprobaban que todo
formato aceptado al subir se podía resolver; seguían apuntando al conversor
antiguo. Ahora comparan la lista de formatos aceptados con
`SUPPORTED_LOGO_KINDS`, que es la lista real de lo que se sabe normalizar.

## Lo que NO hay que hacer

- **No hay migración que revertir.**
- **No hay archivo de ninguna empresa que restaurar:** el original nunca se
  modificó. Comprobado releyéndolo byte a byte después de generar los PDF.
- **No hay caché que invalidar.**
