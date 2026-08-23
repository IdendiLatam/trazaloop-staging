# QUALITY-03.1 · Identidad de empresa en los PDF

## 1. La brecha

QUALITY-02 declaró que los PDF no llevaban el logo de la empresa. La prueba
humana lo confirmó. Aquí se cierra.

## 2. La fuente es la que ya existe

Desde el Sprint 9.2 la empresa sube su logo en **Datos de empresa**, y queda en:

- bucket **privado** `organization-assets`;
- ruta `{organization_id}/logo/logo.{ext}`;
- referencia en `organizations.logo_storage_path`.

**No se creó** ningún `quality_logo`, ni una segunda carga, ni una tabla nueva.
La empresa sube su logo una vez y aparece en sus PDF.

## 3. Seguridad: el generador nunca recibe una URL

La tentación evidente sería aceptar la dirección del logo desde el navegador y
descargarla. Eso convertiría el servidor en un cliente HTTP que va **donde le
digan**: un atacante podría apuntarlo a la red interna, al endpoint de
metadatos de la nube o al bucket de otra empresa, y el PDF le devolvería el
resultado. Es una SSRF de manual.

La cadena real no tiene ningún valor que venga del cliente:

```
organizationId (validado contra la sesión en servidor)
  → SELECT logo_storage_path FROM organizations WHERE id = organizationId
  → comprobación: la ruta debe empezar por `${organizationId}/`
  → storage.download(path) con la sesión del usuario (la RLS vuelve a decidir)
  → decodeImage(bytes)
```

Cuatro barreras, y la segunda merece explicación: si una fila quedara con una
ruta ajena —por un error de datos o por una escritura maliciosa— tampoco se
leería.

Validaciones sobre los bytes: **tipo real** por firma del archivo (no por la
extensión ni por el `content-type` declarado), **2 MB** de tope y **4096 px**
por lado, comprobado **antes** de descomprimir —un PNG que declara 30 000 px de
lado reventaría la memoria del servidor—.

Una prueba estática (`P12`) exige que ni la resolución del logo ni el generador
contengan `fetch(` ni ninguna dirección externa.

## 4. Cómo se incrusta, sin dependencias nuevas

El generador de PDF del repositorio está escrito a mano y solo sabía dibujar
texto, líneas y rectángulos. Se le añadió lo mínimo, aprovechando que **PDF ya
entiende de forma nativa los dos formatos que hacen falta**:

| Formato | Cómo | Por qué |
|---|---|---|
| **JPEG** | se incrusta **tal cual** con `/DCTDecode` | `/DCTDecode` *es* JPEG: los bytes del archivo ya son el flujo. Recomprimir sería perder calidad para nada |
| **PNG** | se descomprime con `node:zlib`, se deshacen los filtros por línea y se recomprimen color y alfa por separado | PDF no conoce PNG, pero sí `/FlateDecode`. Aun así no basta copiar el IDAT: sin separar el alfa en `/SMask`, **un logo recortado se dibuja sobre un rectángulo negro** |
| **WebP** | **no soportado** | no hay decodificador en la plataforma y traer uno sería una dependencia grande para un caso que el respaldo cubre. Declarado como brecha (G-2) |

`node:zlib` viene con Node: **cero dependencias añadidas**.

Se soportan PNG de color verdadero, con paleta y en escala de grises, con y sin
transparencia. Un PNG entrelazado o de más de 8 bits por canal se declina con
un mensaje, no con una excepción.

El logo se registra **una vez** y se referencia desde cada página que lo usa:
en un documento de siete páginas viaja una sola vez, no siete (`P11`).

Y se encaja **sin deformarse** —una identidad incluye sus proporciones— y sin
agrandarse, para no pixelar un logo pequeño.

## 5. Dónde aparece

El bloque de identidad es **compartido** por los dos generadores: no se creó
uno paralelo para Quality.

- **PDF del documento** — logo, nombre de la empresa, razón social, NIT,
  código, título, revisión y todo el bloque de control documental.
- **PDF de la Lista Maestra** — el mismo bloque, para que ambos se lean como
  emitidos por la misma empresa.

## 6. Si no hay logo

El PDF **se genera igual**, con el nombre de la empresa. Devuelve `null` y
sigue si: no hay logo, la ruta no pertenece a la empresa, el archivo excede el
tope, el formato no se puede incrustar, el archivo está corrupto o el bucket no
responde.

Un adorno no puede impedir que alguien descargue su procedimiento.

Verificado de extremo a extremo: con el logo retirado de la fila de la empresa,
ambas rutas devuelven `HTTP 200 · application/pdf`, con **cero** objetos de
imagen, cerrando correctamente y conservando el nombre — y pesando menos, que
es la prueba de que el logo era la diferencia:

```
                con logo    sin logo
documento        4 462 b     3 818 b
lista maestra    5 352 b     4 708 b
```

## 7. Verificación real

No se aceptó un `HTTP 200`. Se descargó el PDF **desde la interfaz**, con un
clic en «Descargar PDF», y se comprobó el archivo:

```
tamaño: 4462 bytes          cabecera: %PDF-1.7
cierra bien: True           páginas: 1
objetos de imagen: 2        (el logo y su máscara de transparencia)
la página referencia el logo: True
el logo se dibuja: True
contiene «QA 03.1»: True    contiene «PR-QA-007»: True
contiene «Control de documentos»: True   contiene «Revisi»: True

$ file PR-QA-007.pdf
PR-QA-007.pdf: PDF document, version 1.7, 1 pages
```

Y se **renderizó** para verlo: el logo aparece arriba, sobre el nombre de la
empresa, el código y el título. Lo mismo con la Lista Maestra.
