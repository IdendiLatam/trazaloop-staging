# Trazaloop · Maestro de documentos (Sprint 10B)

## 1. Qué es el Maestro de documentos

`/trazadocs/master` es un registro centralizado de **toda** la
documentación de la empresa dentro de TrazaDocs — en un solo lugar, con
su categoría, código, estado, versión vigente, responsable y fecha de
actualización. Responde preguntas como «¿qué documentos tiene la
empresa?», «¿cuáles están aprobados?» o «¿cuál es la versión vigente de
cada uno?» sin tener que revisar módulo por módulo.

## 2. Documento vivo vs. archivo descargable

| | Documento vivo | Archivo descargable |
|---|---|---|
| Dónde se edita | Dentro de Trazaloop, por secciones | Fuera de Trazaloop (Word, Excel, etc.) |
| Qué se sube | Nada — el contenido se escribe en la plataforma | El archivo completo (PDF, Word, Excel, CSV, imagen) |
| Acción en el maestro | **Abrir** (va al documento) | **Descargar** (genera un enlace temporal) |
| Ejemplo | Procedimiento de trazabilidad diligenciado en Trazaloop | Un formato externo en Excel, un manual corporativo en PDF |

Ninguno reemplaza al otro — un documento vivo nunca se convierte en
archivo descargable, y viceversa. Tampoco se mezclan con las
**evidencias técnicas** (bucket y tabla distintos) ni se usan para el
cálculo de contenido reciclado.

## 3. Cómo crear un documento vivo

Sin cambios respecto a TrazaDocs — desde `/trazadocs/new`, a partir de
una estructura sugerida o como documento libre. Ver `docs/TRAZADOCS_GUIDE.md`.

## 4. Cómo agregar un documento descargable

Desde `/trazadocs/master` → «Agregar documento descargable», o
directamente en `/trazadocs/files/new`: título, categoría, código y
descripción opcionales, y el archivo. Tipos permitidos: PDF, Word
(DOC/DOCX), Excel (XLS/XLSX), CSV, PNG, JPG/JPEG y WebP — nunca
ejecutables, ZIP ni SVG por ahora. Tamaño máximo por archivo: 10 MB en
plan Demo, 25 MB en Full/Extra (además de la cuota total de
almacenamiento del plan).

## 5. Cómo se agrupa por categoría

Cada documento —vivo o descargable— tiene una categoría: Manuales,
Procedimientos, Instructivos, Registros, Soportes técnicos, Políticas,
Formatos u Otros. Los documentos creados desde una estructura sugerida
(manual, procedimiento, instructivo) heredan su categoría automáticamente;
los documentos libres quedan en «Otros» salvo que se elija otra. La
categoría de un documento vivo se puede cambiar desde su pantalla de
edición, mientras esté en borrador o en revisión.

## 6. Cómo funciona la versión

Cada documento —vivo o descargable— lleva su propio historial de
versiones, con snapshot completo en cada transición de estado. Un
documento descargable recién creado siempre queda en **v1**, con la ruta
real de su archivo ya confirmada — nunca queda a medias ni con una
versión mal numerada. **Un documento aprobado nunca se edita
directamente**: para modificarlo hay que reemplazar el archivo
(documentos descargables) o crear una nueva versión en borrador (ambos
tipos) — la versión anterior queda intacta en el historial, nunca se
pierde.

## 7. Cómo descargar archivos

Desde el maestro o desde el detalle del documento, el botón «Descargar»
genera un enlace temporal (10 minutos) — nunca se guarda ni se comparte
una URL permanente del archivo.

## 8. Cómo exportar CSV

Botón «Exportar CSV» en `/trazadocs/master` — descarga
`maestro-documentos-trazaloop.csv` (UTF-8) con categoría, código,
documento, tipo, estado, versión, responsable, fecha de actualización,
fecha de aprobación, archivo y tamaño. Respeta los filtros activos en
pantalla (búsqueda, categoría, estado, tipo).

## 9. Cómo imprimir / guardar como PDF desde el navegador

`/trazadocs/master/print` — vista optimizada para impresión, con logo de
empresa (si existe), razón social, NIT y la tabla completa agrupada por
categoría. El botón «Imprimir / guardar como PDF» usa el diálogo de
impresión del navegador — **no existe generación de PDF en el
servidor**, ni aquí ni en ningún documento de TrazaDocs.

## 10. Cómo se aplican los planes Demo/Full/Extra

El límite `documents_trazadocs` (2 en Demo, ilimitado en Full/Extra) es
**uno solo**: cuenta documentos vivos y descargables juntos, sin importar
la mezcla — 2 vivos, 2 descargables, o 1 de cada uno, todos llegan igual
al límite en Demo. Los documentos descargables también consumen la
cuota de almacenamiento del plan (50 MB Demo, 500 MB Full, 5 GB Extra),
sumada junto con evidencias y el logo de empresa en un solo total.

## 11. Qué pasa con suspended/cancelled

Una empresa con la suscripción suspendida o cancelada puede **seguir
viendo el maestro, descargando archivos existentes e imprimiendo** — pero
no puede cargar documentos nuevos, editar metadatos, reemplazar
archivos, aprobar, marcar obsoleto ni eliminar borradores. Mismo
principio de solo lectura que el resto de la plataforma.

## 12. Permisos por rol

Mismas reglas que TrazaDocs vivo — un documento descargable se gobierna
exactamente igual:

- **Admin / Supervisor (quality)**: crean, editan, aprueban, marcan
  obsoleto y reactivan cualquier documento descargable de la empresa.
- **Consultor**: crea y edita documentos descargables en borrador o en
  revisión; **nunca aprueba ni marca obsoleto**; solo elimina los
  borradores que él mismo creó.
- Cualquier miembro de la empresa puede **ver** el maestro y **descargar**
  archivos, sin importar su rol.
