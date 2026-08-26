# EXPORT-01.3 · Validación en Staging

**Base:** `qchzkxbnbqeyuxinipln` (Staging QA) · **Producción: intacta.**

## Estado del esquema

**Ninguna migración.** Staging sigue en **0122**. Este sprint es normalización de
imagen, registro de formatos y pruebas: no toca la base. Sin `db reset`, sin
`cleanup`.

## El asset real

Se localizó consultando las empresas con logo y descargando cada objeto **solo
para leerlo**. El del caso se identifica sin ambigüedad por sus bytes:

```
guardado como  logo.png
content_type   image/png
bytes mágicos  ftypavif          ← ISO-BMFF, marca AVIF
peso           10 179 B
```

La empresa a la que pertenece es una de las **cuentas QA permanentes**, así que
no se tocó: no se le cambió el logo, ni la fila, ni la membresía. El archivo se
leyó, se analizó y se volvió a leer al final para comprobar que seguía **byte a
byte igual**.

Para la prueba de extremo a extremo se copiaron **los mismos bytes** al logo de
una empresa efímera creada para el sprint. Es exactamente el archivo del caso,
con otro dueño temporal.

## Resultado

**14 comprobaciones, 0 fallos.**

```
A · El logo que hoy falla, leído de Staging
  asset localizado · 10179 B · guardado como logo.png
  bytes mágicos    · ftypavif
  ✔ el asset real se reconoce por su CONTENIDO, no por su nombre
  ✔ el motor ANTERIOR no podía incrustarlo
      origen heif 484×240 · 4 canales · srgb · alfa=true
      canónico PNG 484×240 · 30783 B · 149 ms
  ✔ el normalizador SÍ puede

B · El mismo archivo, por el endpoint real
  ✔ core.company.detail · el logo del caso aparece
  ✔ quality.process.list · el logo del caso aparece
  ✔ quality.master-list.list · el logo del caso aparece
      10 páginas · logo 10/10 · 2 objetos · 141 KiB
  ✔ listado multipágina: logo en todas las páginas

C · El original no se tocó
  ✔ el asset original sigue byte a byte igual

D · Formatos de siempre y casos límite
  ✔ un PNG normal sigue apareciendo
  ✔ un archivo que NO es imagen sigue siendo inservible
  ✔ la marca de otra empresa sigue sin poder imponerse

E · Limpieza y cuentas permanentes
  ✔ los logos efímeros se retiran del almacenamiento
  ✔ las dos empresas efímeras se retiran de Staging
  ✔ las tres cuentas QA permanentes siguen existiendo
```

## Antes y después, con el archivo real

| | Antes | Ahora |
|---|---|---|
| Subida | OK | OK |
| Vista en la interfaz | OK | OK |
| `decodeImage` directo | **FALLA** | (ya no se llama con el original) |
| Normalización | no existía | **OK, 149 ms** |
| Veredicto del logo | `unusable` | **`ok`** |
| Logo en el PDF | **0 dibujos** | **10 de 10 páginas** |
| Transparencia | — | `/SMask` presente |
| Aviso «no se pudo mostrar» | aparecía | ya no |

## Un detalle de la validación

La primera ejecución falló una comprobación: al reemplazar el logo de la empresa
efímera con un archivo que no es imagen —reutilizando la misma ruta con
`upsert`— el PDF seguía mostrando el PNG anterior. No era el producto: el
almacenamiento sirvió la copia cacheada del objeto anterior y la prueba estaba
midiendo otra cosa. Se cambió a una ruta propia para ese caso.

Lo dejo escrito porque la lección se repite: **una prueba que reutiliza una ruta
con `upsert` puede estar comprobando el archivo de antes.**

## Residuo

**Ninguno.** Las dos empresas efímeras, sus usuarios y sus logos se retiraron.
El asset original y las tres cuentas QA permanentes quedaron exactamente como
estaban.

## Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `fix/export-01-3-robust-logo-normalization` |
| Variables | tres, **solo scope Preview y solo esta rama**, apuntando a Staging |
| SSO | Sigue activo. No se desactivó |
| Production Environment / Development | **Sin tocar** |

`STAGING_KEY_SOURCE=VERIFIED`

## Nota sobre el despliegue

La normalización depende de `sharp` con libvips y libheif. Verificado en el
lockfile: están tanto `@img/sharp-darwin-arm64` (esta máquina) como
`@img/sharp-linux-x64` (Vercel), y la instalación local declara
`heif.input = { file: true, buffer: true, stream: true }` con libvips 8.17.3.

Y si un día faltara, el fallo está acotado: `normalizeLogo` devuelve
`no_normalizer`, el logo queda `unusable` y el PDF se genera igual con el nombre
de la empresa. Un fallo de marca no puede impedir que alguien descargue su
procedimiento.
