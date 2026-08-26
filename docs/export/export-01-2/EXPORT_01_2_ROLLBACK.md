# EXPORT-01.2 · Reversión

## Sin esquema que revertir

**Ninguna migración.** Staging y Producción siguen en **0122**. Este sprint
tocó el renderizador, el registro, los adaptadores, dos rutas heredadas y las
pruebas. Todo es código.

## Qué se revierte

| Nivel | Acción | Consecuencia |
|---|---|---|
| Rama completa | `git revert` del merge, o no fusionar | Los PDF vuelven al encabezado de EXPORT-01: logo solo en la primera página, sin nombre documental. Nada más cambia |
| Solo el logo en cada página | Condicionar el dibujo del logo al índice de página en `renderCorporateHeader` | Cuatro pruebas fallan nombrando «el logo aparece en 1 de N páginas». Es deliberado |
| Solo el nombre documental | No se puede quitar a medias: el tipo lo exige en el registro y en el documento impreso, y el adaptador entrega un borrador que no lo lleva | Habría que revertir los tres tipos a la vez |

## Los seis cambios que tocan código existente

**1 · `pdfString()` limpia caracteres de control.** Afecta a todo texto visible
de todos los PDF. Revertirlo devuelve el riesgo de que un salto de línea en un
nombre dibuje texto fuera de su caja.

**2 · `loadCompanyLogoForPdf` pasó a ser `loadCompanyLogo`, con veredicto.** El
nombre antiguo se conserva como envoltorio y sigue funcionando: devuelve el logo
o `null`. Nada que dependa de él se rompe.

**3 · El recurso del logo se llama `OrgLogo`** (antes `Logo` en el motor
documental). Es un nombre interno del archivo PDF; no se ve. Dos aserciones de
QUALITY-03.1 lo mencionaban y se actualizaron.

**4 · La identidad salió del cuerpo de la primera página** en el motor
documental heredado y pasó al encabezado de todas. Los 70 asertos de QUALITY-02
sobre ese PDF **siguen pasando**: el contenido es el mismo, cambió dónde se
dibuja el membrete.

**5 · Los modelos heredados exigen `documentName`.** Las dos rutas
`/quality/documents/…/pdf` lo pasan literal; el adaptador lo toma de la
definición.

**6 · `ExportResult.document` es un borrador.** Un adaptador que intente poner
`documentName` no compila. Es la garantía, no un efecto secundario.

## Tres pruebas ajenas se ajustaron

Ninguna se debilitó.

| Prueba | Antes | Ahora |
|---|---|---|
| QUALITY-03.1 · P7 | `/XObject << /Logo …` y `/Logo Do` | Lo mismo con `OrgLogo`, y ahora vale para todas las páginas |
| QUALITY-03.1 · P10 | `/Logo Do` en la Lista Maestra | `/OrgLogo Do` |
| EXPORT-01 · F2/F3 | `loadCompanyLogoForPdf(organizationId)` y `catch(() => null)` | El resolutor con veredicto, y un `.catch` que sigue impidiendo que un fallo de logo tumbe la descarga |

## Lo que NO hay que hacer

- **No hay migración que revertir.**
- **No hay PDF que borrar:** ninguno se guarda.
- **No hay dato de negocio modificado.** El sprint no escribió una sola fila
  fuera de las empresas efímeras de QA, que se retiraron.
