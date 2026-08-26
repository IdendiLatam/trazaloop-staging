# Trazaloop · Universal Export Baseline v1.0

**Estado:** aprobado en EXPORT-01.
**Naturaleza:** addendum TRANSVERSAL. No reinterpreta ninguna decisión anterior.
Las decisiones DA, MDR, D, PC, OI, AC, RO, AR, RD, GP, VC y AT del *Documento
Maestro* y del *Quality Architecture Baseline* siguen vigentes sin cambio.

Este documento es el **contrato para todos los sprints siguientes**.

---

## Principio congelado: EXPORTABILIDAD UNIVERSAL

> Todo objeto de negocio visible y administrado por Trazaloop debe disponer de
> una representación documental descargable, autorizada y reproducible cuando su
> naturaleza tenga sentido documental.

Una exportación respeta, sin excepción: `organization_id`, permisos, entitlement
del módulo, RLS, identidad de empresa, versionamiento, Historical Truth, estado
histórico, relaciones, filtros aplicados y privacidad.

---

## Decisiones aprobadas EX-01 … EX-24

### Arquitectura

- **EX-01** — La exportación es una CAPACIDAD DE PLATAFORMA, no una función por
  pantalla. Existe un solo motor y N descripciones.
- **EX-02** — La cadena es: entidad → autorización → datos correctos → Print
  Model → renderizador → descarga. Ningún dominio salta pasos.
- **EX-03** — El **Print Model** es la frontera. Un adaptador de dominio produce
  una descripción serializable; el renderizador la dibuja sin saber de riesgos,
  lotes ni documentos.
- **EX-04** — El Print Model es PURO: sin React, sin base, sin sesión, sin
  reloj. `generatedAt` llega como dato para que una prueba compruebe el archivo
  exacto.
- **EX-05** — Existe un **registro CERRADO** de exportaciones. Añadir una
  entidad exportable es añadir una entrada; no hay resolución por cadena libre.

### Seguridad

- **EX-06** — La generación es SERVER-SIDE. Nunca captura de DOM, nunca canvas,
  nunca conversión desde HTML.
- **EX-07** — El navegador solo puede enviar: una CLAVE del registro, un
  identificador de entidad, y filtros DECLARADOS por esa exportación. Nada más
  llega al cargador.
- **EX-08** — PROHIBIDO aceptar del cliente: HTML, SQL, nombre de tabla, URL de
  cualquier clase —incluida la del logo—, u `organization_id`.
- **EX-09** — La empresa sale de la SESIÓN. Manipular la URL no cambia de
  empresa.
- **EX-10** — Un PDF **no concede permisos nuevos**. Si alguien no puede leer la
  entidad, no puede exportarla; si solo ve un subconjunto, el PDF trae ese
  subconjunto.
- **EX-11** — Entitlement de módulo y autorización de rol son capas DISTINTAS y
  se comprueban las dos, en ese orden, antes de cargar dato alguno.
- **EX-12** — Una clave inventada, una entidad ajena y una entidad inexistente
  responden IGUAL. No se confirma ni se niega qué existe.
- **EX-13** — Los PDF llevan `Cache-Control: private, no-store`. Un documento de
  una empresa no puede quedar en una caché compartida.
- **EX-14** — Los nombres de archivo se componen en un solo sitio y se sanean
  dos veces: al construirlos y al ponerlos en la cabecera.

### Contenido

- **EX-15** — Todos los PDF comparten encabezado, identidad de empresa, pie,
  numeración «Página N de M» y la nota de que el PDF es una representación.
- **EX-16** — El logo se resuelve desde la fila de la empresa ya autorizada y su
  almacenamiento privado. Si falta o falla, el PDF se genera con el nombre como
  identidad. Un adorno no rompe un documento.
- **EX-17** — Todo formato de logo que la plataforma acepte al subir debe
  renderizar, convertirse en servidor, o tener un fallback explícito y
  documentado. Aceptar un formato y luego ignorarlo no es aceptable.
- **EX-18** — **Historical Truth**: nunca se reconstruye el pasado con valores
  actuales. Una medición usa la meta que regía; una evaluación, la metodología
  con la que se hizo; una revisión, sus decisiones.
- **EX-19** — Un PDF distingue en PALABRAS una REFERENCIA VIVA de una FOTO
  HISTÓRICA. Mostrar un dato de hoy donde hubo otro ayer es afirmar algo falso.
- **EX-20** — Un listado exporta el conjunto FILTRADO, y declara sus filtros y
  su número de registros en el encabezado. El servidor reconstruye la consulta;
  el navegador nunca manda filas.
- **EX-21** — El color ACOMPAÑA; la palabra informa. Ninguna información
  depende únicamente del color.
- **EX-22** — La orientación la decide el contenido: ficha en vertical, matriz,
  listado ancho y mapa en apaisado. No se rota nada globalmente.

### Alcance

- **EX-23** — Por defecto NO se guarda ninguna copia del PDF. La fuente de
  verdad sigue siendo la base; el archivo se genera bajo demanda. Un «PDF
  emitido» como entidad formal es una decisión futura, no una generalización.
- **EX-24** — Exportar es LECTURA. Un sprint de exportación no cambia reglas de
  negocio, workflows ni estados.

---

## Contrato para módulos futuros

Toda entidad de negocio visible que se implemente a partir de ahora debe
declarar, **durante su sprint**:

```
EXPORT_DETAIL     = YES | NO
EXPORT_LIST       = YES | NO
EXPORT_HISTORICAL = YES | NO
```

Un `NO` exige una razón explícita y defendible en el informe del sprint. La
omisión silenciosa no se acepta: si una entidad no aparece en
`EXPORT_01_INVENTORY.md`, el sprint está incompleto.

«No alcanzó el tiempo» no es una razón arquitectónica. «No es un objeto
documentable» sí lo es, y hay que sostenerlo.

---

## Cómo se añade una exportación

1. Escribir un adaptador en `lib/export/adapters/` que devuelva un
   `PrintDocument`.
2. Declararlo en `lib/export/registry.ts`.
3. Añadir el `ExportPdfButton` donde el usuario lo espere.
4. Añadir la fila correspondiente a la matriz de cobertura.

Las pruebas de `test:export01` comprueban 1 y 2 automáticamente: una definición
a medias no pasa.
