# EXPORT-01.2 · El encabezado corporativo

> Todo PDF que sale de Trazaloop lleva, en **todas** sus páginas: el logo de la
> empresa, su nombre y el nombre del documento.

## Qué estaba mal

EXPORT-01 dejó un encabezado común y una decisión que parecía razonable:

> *«El logo solo en la primera página: repetirlo en un listado de doce páginas
> gasta espacio sin añadir nada.»*

Gasta unos milímetros. Lo que ahorra vale menos que lo que cuesta: la página
siete de un listado de materiales era **un papel anónimo**. Encima de una mesa,
junto a papeles de otras tres empresas, no se podía saber de quién era ni qué
era.

El motor documental heredado estaba peor. Su identidad —logo y nombre— se
dibujaba **dentro del cuerpo** de la primera página, así que a partir de la
segunda quedaba una línea fina con el código de revisión. Un procedimiento de
cuatro páginas llevaba membrete en una.

Y no existía un **nombre documental**. El encabezado mostraba el tipo de
registro que cada adaptador quisiera poner, a veces igual al título de la
entidad. Dos exportaciones del mismo tipo podían llamarse distinto sin que nada
lo impidiera.

## La primitiva

`lib/pdf/corporate-header.ts` · `renderCorporateHeader()`

Es la **única** función que dibuja identidad en la parte de arriba de un PDF de
Trazaloop, y la llaman los dos motores que existen desde el `header` de página,
no desde el cuerpo. El cuerpo empieza donde ella dice.

```
┌───────────────────────────────────────────────────────────┐
│ [LOGO]   NOMBRE DE LA EMPRESA                     CÓDIGO  │
│          NOMBRE DEL DOCUMENTO                             │
│          NIT · línea de sistema                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  CUERPO                                                   │
│                                                           │
├───────────────────────────────────────────────────────────┤
│ Trazaloop · representación      Generado … · Página N de M│
└───────────────────────────────────────────────────────────┘
```

Los tres primeros son obligatorios y no se pueden apagar: no existe ningún
`showHeader`, y una prueba falla si alguien lo introduce.

## El nombre documental es un contrato

Vive en el **registro**, no en el adaptador:

```ts
export type ExportDefinition = {
  …
  documentName: string;   // «Ficha de proceso», «Listado de riesgos»
};
```

Y el tipo lo hace imposible de olvidar. El adaptador devuelve un
`PrintDocumentDraft` —el documento **menos** su nombre— y el endpoint lo
completa desde la definición:

```ts
renderPrintDocument({ ...result.document, documentName: definition.documentName })
```

Un adaptador no puede inventarse el encabezado porque su tipo no se lo permite,
y el endpoint no puede olvidarlo porque el tipo del renderizador lo exige. Las
**85** definiciones lo declaran.

### Cómo se llaman las cosas

Con la nomenclatura real de la plataforma, no con una inventada:

| | |
|---|---|
| Un registro concreto | **Ficha de** proceso, cargo, indicador, caso, acción, riesgo, oportunidad, control, producto, material, proveedor, referencia, evidencia |
| Una colección | **Listado de** procesos, riesgos, controles, materiales… |
| Nombres propios del dominio | Documento controlado · Lista maestra de documentos · Maestro de documentos · Orden / corrida de producción · Lote producido / lote final · Metodología de riesgos · Evaluación de riesgo · Expediente de auditoría · Pasaporte de producto · Datos de la empresa |

Nunca la clave técnica. `quality.risk.list` no aparece en ningún papel.

Tres pruebas lo vigilan: el nombre empieza en mayúscula y tiene cuerpo, un
`.list` se llama «Listado» (o «Lista maestra», «Maestro», «Reporte»), y la
nomenclatura histórica no revive —ni «CPR», ni «lote de salida», ni «orden de
producción» sin «corrida»—.

## El logo

Sale de donde salía: el `organizationId` ya validado en servidor → la ruta
guardada en la fila de la empresa → el bucket privado, leído con la sesión del
usuario. **Ninguna URL entra desde el navegador.** La primitiva ni siquiera sabe
descargar: no contiene `fetch`, ni `http`, ni cliente de base.

Se registra **una vez** en el archivo con el nombre `OrgLogo` y cada página lo
referencia. Un listado de diez páginas contra Staging: 10 dibujos del logo, **2
objetos de imagen** en el archivo (el color y su máscara de transparencia). No
viaja diez veces ni se descarga diez veces.

La caja es de 92×30 puntos y respeta la proporción: un logo apaisado, uno
cuadrado y uno vertical entran los tres sin deformarse.

## «No hay logo» ≠ «hay logo y no sirve»

Antes las dos situaciones devolvían `null` y producían el mismo PDF mudo. Una
empresa que había subido su logo y cuyo archivo estaba dañado veía exactamente
lo mismo que una que nunca subió nada: nada. **Un problema así puede durar años
sin que nadie lo sepa.**

Ahora el resolutor devuelve un veredicto:

```ts
{ outcome: "none" }                       // no hay logo cargado
{ outcome: "ok"; image; storagePath }     // se puede incrustar
{ outcome: "unusable"; reason }           // hay logo declarado y no sirve
```

Y el encabezado, cuando corresponde, lo dice en una línea discreta y en todas
las páginas:

> El logo configurado no se pudo mostrar. Vuelve a cargarlo en Datos de empresa.

El motivo interno —ruta que no pertenece a la empresa, archivo demasiado grande,
descarga fallida, formato no incrustable— **no** sale al papel. El usuario no
necesita saber cómo se llama el bucket; necesita saber que su branding está roto
y dónde arreglarlo.

## Sin logo

El PDF se genera igual, con el nombre de la empresa ocupando la zona de
identidad y sin reservar un hueco vacío. No se inventa un logo de Trazaloop en
su lugar: el encabezado representa a **la empresa**. Trazaloop sigue apareciendo
donde le corresponde, en el pie.

## Textos largos

- **Nombre de empresa**: se ajusta hasta dos renglones y reduce cuerpo (10,5 →
  7,5 pt) antes que salirse del margen o pisar el nombre documental. Probado con
  «Corporación Industrial de Reciclados y Transformaciones Plásticas del Caribe
  Colombiano S.A.S.».
- **Nombre documental**: igual, y si aun así no cabe termina en puntos
  suspensivos. Un nombre formal no se recorta en silencio: recortar sin señal
  convierte «Listado de órdenes con evidencias» en «Listado de órdenes», que es
  otra cosa.
- El ancho disponible descuenta el código de la derecha, así que no se solapan.

## Caracteres de control

Un salto de línea dentro de un literal de cadena PDF no rompe el archivo, pero
sí el renglón: el medidor de ancho lo cuenta como un carácter cualquiera y el
texto se dibuja fuera de su caja. Un nombre que viene de la base puede traerlo
sin que nadie lo haya querido.

Se limpian en `pdfString()`, el único punto por el que pasa **todo** lo que
acaba siendo visible. Limpiarlo en cada llamada sería confiar en que nadie
olvide una.

## PDF_BYPASS_HEADER = 0

Solo dos funciones saben escribir un PDF en toda la plataforma, y las dos llaman
a la primitiva:

| Motor | Qué produce |
|---|---|
| `lib/export/render.ts` | 83 de las 85 exportaciones, vía Print Model |
| `lib/pdf/quality-documents.ts` | Documento controlado (3 módulos) y Lista Maestra |

Las dos rutas heredadas —`/quality/documents/[id]/pdf` y
`/quality/documents/master/pdf`— usan el segundo motor, así que heredan el
encabezado sin excepción: **no vale «es legacy, por eso no lo lleva»**.

Las cinco rutas `/print` no generan PDF: son vistas de impresión del navegador.
Quedan fuera del recuento porque no producen `application/pdf`.

Una prueba recorre `lib`, `app`, `server` y `components` buscando cualquier
`new PdfLayout(` o `new PdfWriter(` fuera de esos dos motores. Si aparece un
tercero, la suite falla.
