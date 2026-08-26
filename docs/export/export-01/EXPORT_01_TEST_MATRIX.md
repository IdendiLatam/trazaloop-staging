# EXPORT-01 · Matriz de pruebas

`npm run test:export01` · **54 comprobaciones, 0 fallos.**

No es una suite que compruebe que el endpoint responde 200. Genera **archivos
PDF reales**, los vuelve a leer y comprueba qué dice el papel (§60).

## Cómo se lee un PDF en la prueba

`inspectPdf()` extrae del flujo de contenido los fragmentos `(...)Tj`, el número
de objetos `/Page` y el tamaño de `MediaBox`. Así una aserción puede decir «el
encabezado dice “Vista: Activos — 3 registros”» en vez de «el archivo pesa más
de cero bytes».

## Los ocho grupos

| Grupo | Qué demuestra | Nº |
|---|---|---|
| **A · El contrato del registro** | claves únicas, cada definición completa, registro cerrado, escape de §27 limitado a dos artefactos | 8 |
| **B · El endpoint** | la empresa sale de la sesión; clave inventada → 404 mudo; entitlement y rol son capas distintas; no hay superficie de URL, HTML ni SQL; un fallo no filtra el motivo | 5 |
| **C · Filtros** | valor fuera de catálogo descartado, uuid con forma rara descartado, clave no declarada nunca llega al cargador, texto limpiado de caracteres de control, fecha mal formada descartada | 5 |
| **D · Nombres y cabeceras** | no se escapa de su carpeta, acentos transliterados, título vacío no rompe, `Content-Disposition` con las dos formas y sin saltos, `no-store` presente | 5 |
| **E · PDF reales** | 12 comprobaciones sobre archivos generados | 14 |
| **F · Identidad e imagen** | todo formato aceptado al subir se puede incrustar; el logo nunca llega de la petición; si falla, el PDF sale igual | 3 |
| **G · Lo que NO se hizo** | servidor y no navegador; nada guardado en Storage; una sola nomenclatura; ninguna migración nueva | 4 |
| **H · Alcanzabilidad** | toda clave tiene botón; ningún botón inventa claves; los tres módulos ofrecen descarga; la Lista Maestra filtra por los mismos nombres que la pantalla; el documento pasa por la puerta única | 6 |
| **I · Nada desaparece en silencio** | un bloque desconocido falla en vez de esfumarse; la matriz nombra todas las claves, no inventa ninguna, y el recuento del inventario concuerda con el registro | 4 |

## Las que costaron más, y por qué existen

**E4b — «un listado DECLARA sus filtros y cuántos registros trae».**
Escribí esta aserción esperando que pasara. Falló. El renderizador recibía
`appliedFilters` y `recordCount` y no los dibujaba: el PDF de una lista filtrada
salía **idéntico** al de la lista completa. La comprobación funcional habría
dado verde —200, PDF válido, filas correctas— y el papel habría mentido por
omisión. Es la prueba que justifica el grupo entero.

**E10 — «la matriz se dibuja con las bandas que le pasan, no con una 5×5 fija».**
Construye una matriz 3×4 con umbrales inventados y comprueba que el PDF la
dibuja así. Si alguien vuelve a cablear el 5×5 de siempre, falla.

**E11 — «una referencia histórica se distingue de una viva EN PALABRAS».**
Comprueba que el texto —no un color, no un icono— dice cuál es cuál.

**F1 — «todo formato de logo que la plataforma acepta se puede incrustar».**
Compara `ALLOWED_LOGO_TYPES` con lo que el conversor resuelve. Añadir un formato
al subir sin añadirlo aquí rompe la suite. Es la prueba que impide que el hueco
de WebP vuelva a abrirse en silencio.

**H1 — «TODA exportación del registro se ofrece en alguna pantalla».**
Un registro impecable y una funcionalidad inalcanzable son compatibles. Se
verificó que la prueba tiene dientes retirando el botón de la ficha del caso:
falla nombrando `quality.case.detail`.

**H5 — «la Lista Maestra filtra por los MISMOS nombres que la pantalla».**
Nació de un defecto real de este sprint: la definición declaraba
`estado`/`categoria`/`buscar` mientras el lector de la pantalla lee
`lifecycle`/`category`/`search`. El usuario habría filtrado, descargado y
recibido **la lista completa** sin ninguna advertencia. La prueba compara los
dos ficheros.

## Verificación en navegador, con sesión real

| Qué | Resultado |
|---|---|
| 16 claves solicitadas | 15 PDF reales; la 16ª (`quality.map.detail`) 404 correcto porque la empresa no tenía mapa → el botón pasó a mostrarse inhabilitado con su motivo |
| Cabeceras | `application/pdf`, `attachment`, `private, no-store, max-age=0, must-revalidate`, `nosniff` |
| 11 ataques | 7 → 404; 4 → 200 con el parámetro hostil **neutralizado**, verificado abriendo el PDF |
| Listado filtrado | `?vista=activos` trae A y C, no el cerrado B, y declara «Vista: Activos — 3 registros»; `?vista=todos` trae los cuatro |

**I0 — un bloque desconocido falla en vez de desaparecer del papel.**
Apareció escribiendo un banco de medición con el discriminante mal escrito
(`kind` en vez de `type`). El renderizador devolvió un PDF **válido**, con
encabezado, pie y numeración… y sin la tabla. El tipo lo impide en compilación;
ahora también lo impide en ejecución, y el endpoint lo convierte en un 500 en
vez de en una descarga engañosa.

**I1–I3 — el inventario no puede envejecer en silencio.**
Un documento de cobertura desactualizado es peor que no tenerlo: se consulta
creyendo que dice la verdad. Estas tres comparan la matriz y el recuento del
inventario contra el registro real.

## Rendimiento

El renderizador, medido en frío y en caliente (`renderPrintDocument`, sin base
ni red):

| Filas | Tamaño | Tiempo |
|---|---|---|
| 1 | 2 KiB | 0,2 ms |
| 50 | 20 KiB | 1,0 ms |
| 200 | 76 KiB | 3,3 ms |
| 1000 | 377 KiB | 15,3 ms |

Crece linealmente. El coste de una exportación es la CONSULTA, no el dibujo:
para un listado grande, el tiempo de PDF es ruido frente al viaje a la base.

## Regresión

`npm run test:all` — **exit code 0**, leído del proceso, no inferido.
