# PE-05B2W4 · Contratar con tarjeta, sin que la tarjeta pase por aquí

## La única frase que importa

El número de la tarjeta, el código de seguridad y la caducidad viajan del
**navegador a Wompi**. A Trazaloop llega el testigo que Wompi devolvió, que ya
no es una tarjeta y que no sirve para cobrar sin las credenciales privadas del
comercio.

```
navegador ──(número, CVC, caducidad)──▶ Wompi        ← única vez que salen
navegador ──(tok_…)──▶ Trazaloop ──(tok_… + contratos)──▶ Wompi
```

Todo el diseño se apoya en esa frase, así que hay una prueba que recorre **todo
el código de servidor** —rutas de API, acciones de servidor, `lib`— y exige que
no aparezca ni un campo de tarjeta. El único fichero del repositorio donde
pueden aparecer es el formulario del navegador.

## Tres detalles que no son cosméticos

**El formulario no tiene `action`.** Si lo tuviera, pulsar Intro mandaría los
campos a una acción de servidor. Los datos viven en estado local y se **borran**
en cuanto el testigo existe.

**La excepción de B2W1 se movió, no se amplió.** Aquel tramo tokenizaba desde el
servidor porque no había navegador, y una prueba lo permitía en un fichero. Ese
camino se retira: ahora la prueba lo prohíbe y la excepción es el formulario del
navegador, que es la frontera de verdad.

**La guardia se vio roja tres veces** antes de darla por buena: con un campo de
tarjeta en una acción de servidor, con la tarjeta subiendo en la llamada al
servidor, y con un uso disfrazado dentro de un arreglo de textos. Las tres la
pusieron en rojo.

## Lo que decide el dinero

El importe lo calcula el servidor —plan, revisión, tipo de cambio, regla
fiscal— y el intento lo **congela**. La firma del envío no acepta importe,
moneda ni precio: aunque el navegador mandara uno, no hay quien lo lea.

Y sin tipo de cambio vigente la pantalla **falla cerrado**: dice qué falta y no
enseña formulario. No se inventa un precio para poder cobrar. El 4000 COP/USD
de las pruebas no vive en el producto: lo abre el mecanismo explícito de QA y se
cierra por validez al terminar.

## Cobrar no es activar

La respuesta del envío dice que **salió**, no que se cobró. Quien activa el plan
es el webhook firmado, después de releer la transacción en el proveedor. La
pantalla pregunta cada pocos segundos por el estado **canónico** del libro; lo
que diga la pasarela en el navegador no cuenta.

## Pagar dos veces por accidente

Tres cierres, y el tercero es el que de verdad manda:

1. el botón se desactiva en cuanto empieza el envío;
2. un candado en el componente corta la segunda pulsación antes de tocar la red;
3. **el proveedor rechaza repetir una referencia.** Comprobado contra Wompi:
   `422 · INPUT_VALIDATION_ERROR · {"reference":["La referencia ya ha sido usada"]}`.

Como la referencia es `pay_<intento>`, dos envíos del mismo intento no pueden
producir dos cobros aunque todo lo demás fallara.

Y recargar la página tampoco cobra dos veces. Si ya hay una contratación viva:
si salió hacia el proveedor, se enseña en qué quedó y **no se vuelve a pedir la
tarjeta**; si no salió, se sigue con ese intento y con el importe que congeló.
Presupuestar otra vez abriría un segundo camino de pago para lo mismo.

## Qué baja al navegador

Solo la llave **pública** y la base de la API del entorno ya clasificado, como
propiedades que reparte el servidor —no como variable `NEXT_PUBLIC_`—. La llave
privada, el secreto de eventos y el de integridad se quedan en el servidor, y el
paquete del cliente se revisó: cero apariciones de ninguno de los tres.

Los dos documentos que exige el proveedor se aceptan a mano, con sus enlaces y
sin ninguna casilla marcada de antemano.
