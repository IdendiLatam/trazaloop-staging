# QUALITY-02 · Generación y validación de PDF

**Decisiones ancladas:** D-26 (los exportables son representaciones, no la
fuente de verdad) · D-30

---

## 1. Por qué el generador está escrito a mano

El sprint pide un botón **«Descargar PDF»** que entregue un archivo real, no la
impresión del navegador. Las dos familias de solución habituales:

| Opción | Por qué se descartó |
|---|---|
| Motor de navegador sin cabeza (Puppeteer / Chromium) | Cientos de MB en la ruta de despliegue. Desproporcionado para dos documentos tipográficamente sobrios |
| Librería de composición de terceros | Dependencia nueva para un subconjunto de PDF pequeño y estable desde 1993 |

Lo que hay que producir —texto, tablas, encabezados y pies— necesita: catálogo,
árbol de páginas, un flujo de contenido por página, las fuentes estándar y una
tabla de referencias cruzadas. Escribirlo en `lib/pdf/` evita una dependencia
binaria y, sobre todo, deja el resultado **comprobable**.

### 1.1 Sin comprimir, a propósito

Los flujos de contenido se emiten **sin comprimir**. Eso permite que una prueba
abra el archivo generado y verifique que el código, el título, la revisión y la
empresa están realmente dentro —Parte 22 del encargo— en lugar de conformarse
con un HTTP 200. El coste es tamaño: un documento típico pesa 7–20 KB.

### 1.2 Alcance

Fuentes estándar Helvetica y Helvetica-Bold en `WinAnsiEncoding`, texto, líneas
y rectángulos. Sin imágenes, sin transparencias, sin fuentes incrustadas, sin
formularios.

**Métricas reales de fuente.** Sin las anchuras por carácter no hay salto de
línea correcto, y medir «a ojo» produce líneas que se salen del margen —que es
exactamente lo que hace que un PDF parezca improvisado—. Las letras acentuadas
del español tienen, en Helvetica, la anchura de su letra base: la tilde no
ensancha el glifo.

---

## 2. PDF del documento

`GET /quality/documents/<id>/pdf` → `application/pdf`, `attachment`,
nombre `codigo-rev<N>.pdf`.

Contiene:

- Identidad de la empresa: nombre, razón social y NIT
- Código, título y descripción
- **Aviso de estado** cuando el documento no está vigente (§4)
- Ficha de control: estado, revisión, tipo, propietario, revisor(es),
  aprobador(es), fecha y autor de la aprobación, creación, envío, vigencia
  desde/hasta, próxima revisión y procesos asociados
- Contenido completo por secciones, en su orden, marcando lo no diligenciado
- **Control de revisión**: cada revisión con su estado, aprobación y vigencia
- **Decisiones registradas**: fecha, decisión, ronda, quién y motivo

Encabezado breve en las páginas siguientes —para que una hoja suelta siga
identificando de qué documento y revisión es— y pie con «Página N de M», la
fecha de generación y la advertencia de D-26.

### 2.1 Lo que NO lleva

Ningún identificador técnico: ni UUID, ni nombre de tabla, ni ruta interna. Una
prueba lo exige con una expresión regular sobre el archivo completo.

---

## 3. PDF de la Lista Maestra

`GET /quality/documents/master/pdf?<filtros>` → A4 apaisado.

Contiene: organización, título, **filtros aplicados declarados**, número de
documentos, fecha y hora de generación, las dieciséis columnas con encabezado
repetido en cada página, y paginación.

Una lista maestra impresa que no dice qué filtro se aplicó es una lista que
engaña: parece completa y no lo es. Por eso los filtros viajan en la URL —los
mismos que se ven en pantalla— y se imprimen en el encabezado.

Si ningún documento cumple los filtros, el PDF **lo dice** en vez de imprimir
una tabla vacía.

### 3.1 Densidad

Dieciséis columnas en A4 apaisado son densas por diseño. Dos decisiones
concretas:

- El **código** es la única columna que no puede partirse: es el identificador
  con el que se pide un documento en una auditoría. Se le reserva ancho
  suficiente antes que al título.
- Los encabezados se **envuelven**, no se recortan. Un «Revisión vi…» en la
  cabecera obliga a adivinar qué columna se está leyendo.

Un nombre completo sí puede repartirse en dos líneas dentro de su columna: es
tipografía normal de tabla, no pérdida de información.

---

## 4. Un documento que no rige, lo dice

| Estado | Banda impresa en la primera página |
|---|---|
| Vigente | *(ninguna)* |
| Borrador | BORRADOR · NO VIGENTE · no usar como documento del sistema de calidad |
| En revisión | EN REVISIÓN · NO VIGENTE |
| Devuelto | DEVUELTO CON OBSERVACIONES · NO VIGENTE |
| Pendiente de aprobación | PENDIENTE DE APROBACIÓN · NO VIGENTE |
| Aprobado, aún no vigente | APROBADO · TODAVÍA NO VIGENTE |
| Sustituido | SUSTITUIDO POR UNA REVISIÓN POSTERIOR · copia histórica |
| Retirado | RETIRADO · copia histórica, no usar |

Repartir un borrador que parezca vigente es el error clásico del control
documental en papel. No se va a repetir en pantalla.

---

## 5. El PDF no es la fuente de verdad (D-26)

Cada archivo lo dice en su pie:

> Representación impresa. El documento controlado vive en la plataforma; este
> archivo no es la fuente de verdad.

**No se guarda ningún PDF.** El snapshot inmutable de una revisión aprobada es
`content_snapshot` —datos estructurados, no un archivo—, y de él se puede
regenerar el PDF exacto de esa revisión cuando haga falta. Guardar además el
binario duplicaría información sin añadir garantía (MDR-36: preferir FK a
versión inmutable antes que instantáneas innecesarias).

---

## 6. Cómo se valida

`npm run test:quality02` §G — sobre archivos generados en memoria:

- Cabecera, catálogo, árbol de páginas, `xref`, `startxref` y `%%EOF`
- **Las posiciones del `xref` apuntan de verdad a cada objeto.** Un `xref` con
  desplazamientos mal calculados produce un archivo que muchos lectores
  «arreglan» en silencio y otros rechazan
- Texto esperado dentro del archivo
- La banda de estado del documento no vigente
- Ausencia de UUID y de nombres de tabla
- Paginación, fecha de generación y advertencia de D-26
- Escapado de paréntesis en los literales de cadena: sin él, una etiqueta como
  «REVISOR(ES)» cerraría la cadena antes de tiempo y el archivo no abriría
- Acentos, incluida la mayúscula acentuada («PRÓXIMA REVISIÓN»)
- Medición y partición de texto: ninguna línea excede su ancho

`npm run test:quality02-ui` §19–21 — sobre los bytes que devuelve la app real,
con sesión: `content-type`, `content-disposition`, tamaño, estructura, páginas
y contenido.

### 6.1 Verificación con un lector real

Los dos PDF generados por la aplicación se abrieron con el motor de
previsualización de macOS (CoreGraphics), que los renderiza correctamente: no
son solo bytes que pasan una prueba, son archivos que un lector de PDF real
compone bien.

---

## 7. CSV

Se preserva la exportación de datos: `GET /quality/documents/master/csv` con los
**mismos filtros y las mismas columnas** que el PDF y la pantalla —una sola
definición de columnas, en el dominio, para que las tres no puedan discrepar—.

Lleva BOM UTF-8: sin él, Excel en Windows abre «Revisión» como «RevisiÃ³n» y el
archivo deja de servir para lo único que se usa.

---

## 8. Brecha conocida

**El logo de la empresa no se incrusta en el PDF.** El generador no soporta
imágenes, y la identidad de la empresa se imprime en texto (nombre, razón
social, NIT). El encargo lo condicionaba a «si el motor ya la soporta»; no lo
soporta. Añadirlo requiere un objeto XObject de imagen y descargar el logo desde
Storage en el momento de generar. Está fuera del alcance de este sprint y
declarado como brecha en el informe final.
