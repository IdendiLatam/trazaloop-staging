# EXPORT-01 · Informe de implementación

## Qué se construyó

Una **capacidad de plataforma**, no un PDF por pantalla.

```
entidad → autorización → datos correctos → Print Model → renderizador → descarga
```

Un solo endpoint. Un solo renderizador. 32 descripciones de qué imprimir.

Antes de este sprint la plataforma sabía generar exactamente dos PDF —el
documento controlado y la Lista Maestra— con su propio camino, sus propias
cabeceras y su propio nombre de archivo. La forma evidente de crecer desde ahí
era escribir el tercero, el cuarto y el décimo igual. A los veinte, cada PDF
tendría su propia idea de qué es «esta empresa» y de qué puede leer el que
descarga.

## Las decisiones que sostienen todo lo demás

### El Print Model es la frontera

Un adaptador de dominio no dibuja: **describe**. Devuelve una estructura pura y
serializable —encabezados, campos, tablas, insignias, matrices, referencias— y
el renderizador la dibuja sin saber jamás si eso era un riesgo, un lote o un
documento.

Es puro de verdad: sin React, sin base, sin sesión y **sin reloj**. `generatedAt`
entra como dato. Por eso una prueba puede generar el mismo archivo dos veces y
comparar.

La ganancia se nota al añadir la exportación número 33: se escribe un adaptador
y se declara. No se toca el renderizador ni el endpoint.

### El registro es cerrado

La alternativa evidente —un endpoint que acepte «qué tabla» y «qué columnas»—
convierte el generador de PDF en un motor de consultas arbitrarias. Aquí el
navegador solo puede **nombrar una clave** de una lista escrita a mano.

Añadir una entidad exportable es añadir una entrada. No hay resolución por
cadena libre en ninguna parte del camino.

### La empresa sale de la sesión

Nunca de la petición. Un `?organization_id=` en la URL se ignora en silencio, y
hay una prueba que descarga el PDF y comprueba que trae los datos de la empresa
propia —no que la respuesta fue 200—.

### Verdad histórica, en palabras

La trampa de un PDF no es inventar datos: es explicar el pasado con los valores
de hoy. Una medición de enero comparada contra la meta de hoy convierte un
incumplimiento leve en uno grave.

Cada referencia dice **en palabras** si es viva o es una foto:
«INDICADOR · REFERENCIA VIVA», «EVALUACIÓN DEL RIESGO · COMO ESTABA ENTONCES».
Sin esa etiqueta, el lector no puede saberlo. Con ella, no tiene que adivinarlo.

## Lo que se encontró y se arregló por el camino

### El renderizador no imprimía los filtros

Escribí la aserción «un listado declara sus filtros y cuántos registros trae»
esperando verde. Salió roja. El renderizador **recibía** `appliedFilters` y
`recordCount` y no los dibujaba.

Una prueba funcional habría pasado: 200, PDF válido, filas correctas. Y el papel
habría mentido por omisión: un listado filtrado indistinguible del completo. Es
la razón por la que §60 pide archivos reales y no códigos de estado.

### La Lista Maestra habría exportado la lista completa

La definición declaraba filtros llamados `estado`, `categoria`, `buscar`. El
lector de la pantalla lee `lifecycle`, `category`, `search`. Los filtros del
usuario se descartaban por no estar declarados, y la descarga traía **todo**.

Sin aviso, sin error, sin diferencia visible salvo el número de filas. Ahora la
definición usa los nombres de la pantalla y una prueba compara los dos ficheros.

### El logo WebP que la plataforma aceptaba y luego ignoraba

`ALLOWED_LOGO_TYPES` admite WebP. El escritor de PDF solo incrusta JPEG y PNG.
Una empresa podía subir su logo, verlo en pantalla, y encontrarse con PDF sin
logo para siempre sin que nadie le explicara por qué.

Se convierte en servidor a PNG —no a JPEG: los logos llevan transparencia y
aplanarla contra blanco deja un recuadro sobre cualquier fondo—. Y una prueba
compara la lista de formatos aceptados con lo que el conversor sabe resolver.

### El botón del mapa llevaba a un 404

La empresa de aceptación no tenía mapa publicado. El botón se ofrecía igual.
Ahora se muestra inhabilitado y **dice por qué**: «todavía no hay mapa».

### Catorce exportaciones existían y eran inalcanzables

PCR y Textiles tenían adaptadores y entradas en el registro, y **ni un botón**.
El registro estaba impecable y la funcionalidad no existía para el usuario.

De ahí salió el grupo H de pruebas: toda clave del registro tiene que ofrecerse
en alguna pantalla, o la suite falla nombrando la que falta. Se verificó que la
prueba tiene dientes retirando un botón: falla.

## Lo que deliberadamente NO se hizo

**No se migraron los dos PDF documentales al Print Model.** Llevan meses en uso
y 70 aserciones comprueban su contenido real. Reexpresarlos habría cambiado
espaciados, orden y cortes de página sin ganar nada para quien los usa, y §27
pide que su comportamiento validado permanezca.

Lo que sí se unificó es el **acceso**: misma clave, mismo endpoint, misma
política de nombres y de cabeceras. Comparten además el mismo escritor y el
mismo motor de página, así que el motor transversal ya era el suyo. El escape
está documentado en el tipo, limitado a dos definiciones, y hay una prueba que
falla si aparece una tercera.

**No se creó ninguna migración.** §78 pedía crearla solo si hacía falta de
verdad. Exportar es lectura: no hace falta. El efecto es que revertir este
sprint es revertir código.

**No se guarda ningún PDF.** La fuente de verdad sigue siendo la base; el
archivo se genera bajo demanda. Un «PDF emitido» como entidad formal —con su
número, su firma y su registro— es una decisión de producto, no una
generalización que se pueda colar en un sprint de exportación.

**No se generó nada en el navegador.** Ni captura de DOM, ni canvas, ni
conversión desde HTML.

## Números

| | |
|---|---|
| Exportaciones en el registro | 32 |
| Módulos que las ofrecen | Quality, TrazaDocs, PCR, Textiles |
| Filas de entidad clasificadas | 94, ninguna sin clase |
| Pruebas propias | 50, sobre PDF reales |
| Regresión completa | `npm run test:all` → exit code **0** |
| Validación en Staging | 26 comprobaciones, 0 fallos |
| Migraciones añadidas | **0** |
