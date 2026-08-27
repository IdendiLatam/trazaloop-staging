# QUALITY-12.1 · La credencial: dónde vive y dónde no puede aparecer

## Dónde vive

En **una sola variable de entorno del servidor**, `QUALITY_AI_API_KEY`, dada de
alta en Vercel con alcance **Preview + esta rama**. No hay variable nueva: se
reutiliza la que QUALITY-12 ya había definido (§8).

Se lee en **un solo sitio del código**: `lib/ai/config.ts`. Ni el adaptador, ni
el orquestador, ni ninguna acción de servidor la leen de `process.env` por su
cuenta; la reciben como argumento en el momento de construir el cliente. La
prueba `A2` de `test:quality121` comprueba justamente eso: que nadie más la
lee.

## Dónde NO puede aparecer, y qué lo impide

| Sitio | Qué lo impide |
|---|---|
| el navegador | no hay `NEXT_PUBLIC_`; el módulo es `server-only` |
| la base de datos | ninguna columna la guarda; ninguna RPC la recibe |
| la serialización de un componente de servidor | nunca se pasa como propiedad |
| el registro | el adaptador no escribe en consola |
| un mensaje de error | no se serializa el error del SDK, se mapea y se trunca |
| una captura de prueba | las suites no la piden ni la imprimen |
| un PDF exportado | ninguna exportación la toca |
| Git | no está en el repositorio, ni en `.env`, ni en `.env.example` |

El punto del **mensaje de error** merece explicación. El objeto de error del
SDK lleva dentro la petición que se envió, y en la petición va la cabecera de
autorización. Serializarlo entero para «dar más detalle» es la forma más fácil
de acabar con una clave en un registro. Por eso el adaptador clasifica el error
por su tipo, compone un mensaje propio y trunca a 200 caracteres cualquier
texto que reenvíe. Prueba `A3`.

## Sin credencial, no se llama

`resolveProvider()` comprueba que hay credencial **antes** de elegir un
proveedor real. Sin ella devuelve el doble determinístico y `live: false`, y la
pantalla dice la verdad: *«No hay proveedor de IA configurado: las respuestas
se componen solo con los datos de Trazaloop»* (§62).

Una cadena vacía, con espacios, o un `PENDIENTE` que alguien dejó puesto **no
cuentan como credencial**. Se comprueba que hay algo con forma de clave —no que
empiece por un prefijo concreto, porque los prefijos cambian y una comprobación
rígida acaba rechazando una clave buena—.

## Ni una sola vez en este trabajo

La clave **no** se pidió, **no** se pegó en el chat, **no** se escribió en un
archivo, **no** se imprimió y **no** se intentó recuperar. Todo lo que no
requería secreto se implementó y se probó primero; la única intervención humana
del sprint es introducirla en Vercel.

## Cómo revocarla

Si hubiera cualquier duda sobre la clave, el orden es: revocarla en el panel de
OpenAI **primero**, y borrarla de Vercel después. Al desaparecer, el Copilot
vuelve solo al doble determinístico y lo dice en pantalla; el resto de
Trazaloop no se entera.
