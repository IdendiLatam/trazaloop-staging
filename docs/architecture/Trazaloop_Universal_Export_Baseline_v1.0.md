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

## Addendum EXPORT-01.1 · EX-25 … EX-30

EXPORT-01 construyó el motor. EXPORT-01.1 cerró la promesa funcional: **toda
entidad de negocio administrada por Trazaloop que tenga sentido documental se
puede descargar**. Estas seis decisiones son lo que hace que esa frase se pueda
sostener en el tiempo.

- **EX-25** — El inventario es un DATO, no un documento. Vive en
  `lib/export/inventory.ts` y las pruebas lo recorren. Un markdown no falla: se
  queda atrás en silencio mientras el registro crece.

- **EX-26** — Existen CUATRO estados finales, y ninguno es «pendiente»:
  `AVAILABLE`, `EMBEDDED`, `NOT_APPLICABLE` y `HISTORICAL_NOT_SUPPORTED`. Cada
  uno es una afirmación que alguien puede discutir; «pendiente» es una deuda que
  nadie discute porque no dice nada.

- **EX-27** — `HISTORICAL_NOT_SUPPORTED` significa que el dominio no conserva
  versión temporal suficiente para reconstruir el pasado con verdad. **Nunca**
  significa que falte el PDF actual. Usarlo para no implementar es exactamente
  lo que la clasificación existe para impedir, y una prueba lo comprueba.

- **EX-28** — Toda exportación declara qué afirma sobre el tiempo:
  `temporality: "historical" | "current"`. Una declarada `current` está obligada
  a explicar QUÉ no guarda el dominio, y su PDF lleva el aviso
  «Representación del estado actual» con la fecha de generación. Un documento
  que retrata el presente y lo dice es honesto; uno que lo disfraza de pasado no.

- **EX-29** — Una entidad con IDENTIDAD DE NEGOCIO propia tiene ficha propia,
  aunque hoy solo se consulte dentro de su padre. Una acción, un control y una
  evaluación de riesgo se llevan a una reunión, se entregan a un auditor y se
  adjuntan a un expediente por separado. «Aparece dentro de X» no es razón
  suficiente para negarles hoja propia; sí lo es no tener identidad — una fila
  de relación, un estado técnico.

- **EX-30** — Un mismo motor documental sirve a varios módulos POR PARÁMETRO,
  nunca por copia. La diferencia entre el documento de Quality, el de PCR y el
  textil es de contexto —módulo, entitlement, empresa—, no de motor. Tres copias
  del mismo archivo garantizan que dentro de seis meses digan tres cosas.

---

## Addendum EXPORT-01.2 · EX-31 … EX-34

**EL ENCABEZADO CORPORATIVO ES OBLIGATORIO.**

- **EX-31** — Todo PDF que salga de Trazaloop lleva, en **todas** sus páginas,
  tres elementos: el LOGO de la empresa cuando existe, el NOMBRE de la empresa y
  el NOMBRE DEL DOCUMENTO. No hay excepciones por antigüedad, por módulo ni por
  ahorrar espacio. Una hoja suelta de la página siete tiene que decir de quién
  es y qué es.

- **EX-32** — El NOMBRE DOCUMENTAL lo declara el REGISTRO, no el adaptador, y en
  lenguaje humano con la nomenclatura real de la plataforma. Una clave técnica
  nunca es visible para el usuario. El adaptador entrega un documento **sin**
  nombre —su tipo se lo impide— y quien lo completa es el endpoint desde la
  definición: así dos exportaciones del mismo tipo no pueden llamarse distinto.

- **EX-33** — Existe UNA primitiva de encabezado y todos los motores de PDF la
  usan. `PDF_BYPASS_HEADER = 0` es una comprobación, no una aspiración: una
  prueba recorre el código y falla si aparece un escritor de PDF fuera de ella.
  «Es heredado» no es una razón para no llevarlo.

- **EX-34** — «No hay logo» y «hay logo y no se puede usar» son estados
  DISTINTOS. El primero es normal y el PDF sale con el nombre como identidad. El
  segundo se dice en el papel, sin revelar nada del almacenamiento: una empresa
  no puede arreglar un branding roto que nadie le señala.

---

## Contrato para módulos futuros

Toda entidad de negocio visible que se implemente a partir de ahora debe
declarar, **durante su sprint**:

```
EXPORT_DETAIL     = YES | NO
EXPORT_LIST       = YES | NO
EXPORT_HISTORICAL = YES | NO
DOCUMENT_NAME     = "<nombre documental humano>"   ← EXPORT-01.2, obligatorio
```

Un `NO` exige una razón explícita y defendible en el informe del sprint. La
omisión silenciosa no se acepta.

**Desde EXPORT-01.1 esto no es una convención: es una prueba.** La entidad se
añade como fila en `lib/export/inventory.ts` con sus tres ejes clasificados, y
la suite falla si:

- una ficha o un listado declarados `AVAILABLE` no tienen definición en el
  registro;
- una definición del registro no está clasificada en el inventario;
- un `NOT_APPLICABLE` o un `EMBEDDED` no traen motivo con sustancia;
- un `EMBEDDED` nombra un padre que no existe;
- un `HISTORICAL_NOT_SUPPORTED` no explica qué no guarda el dominio, o se usa
  en una entidad que tampoco tiene PDF actual;
- una exportación existe y ninguna pantalla la ofrece.

«No alcanzó el tiempo» no es una razón arquitectónica. «No es un objeto
documentable» sí lo es, y hay que sostenerlo — por escrito y en el sitio donde
una prueba lo lee.

**No se vuelve a crear un backlog general de PDFs.** Cada dominio nuevo cumple
esto durante su propio sprint.

---

## Cómo se añade una exportación

1. Escribir un adaptador en `lib/export/adapters/` que devuelva un
   `PrintDocument`.
2. Declararlo en `lib/export/registry.ts`.
3. Añadir el `ExportPdfButton` donde el usuario lo espere.
4. Añadir la fila correspondiente a la matriz de cobertura.

Las pruebas de `test:export01` comprueban 1 y 2 automáticamente: una definición
a medias no pasa.
