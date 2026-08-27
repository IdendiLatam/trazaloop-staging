# QUALITY-11 · Matriz de pruebas

## 1 · Las tres suites nuevas

| Suite | Comando | Qué comprueba | Resultado |
|---|---|---|---|
| Puras y estáticas | `npm run test:quality11` | que las siete separaciones existan **en el código** | **129 conformes, 0 fallos** |
| Contra base real | `npm run test:quality11-rls` | los quince escenarios, los ataques y el planificador | **68 conformes, 0 fallos** |
| Rendimiento | `npm run test:quality11-perf` | 100 y 1 000 sujetos · 1 y 3 reglas | **6 conformes, 0 fallos** |

## 2 · Qué cubre la suite pura (§154)

| Bloque | Qué busca |
|---|---|
| A · catálogo | 18 fuentes · 70 campos · sin tabla ni columna · **sin SQL dinámico** |
| B · versionado | identidad estable · contenido en la versión · publicada no se edita |
| C · vigencia | publicada ≠ activa · la ventana manda · desactivar conserva |
| D · evaluador | los 14 operadores en los tres sitios · falla cerrada · AND · inmutable |
| E · separaciones | las seis, buscadas como escritura concreta |
| F · explicabilidad | cada condición se explica · el retrato es mínimo |
| G · idempotencia | índice parcial · `xmax` · rearme · resolución determinística |
| H · simulación | mismo evaluador · cero salidas · exige sesión |
| I · reloj | del servidor · en la zona de la empresa · resuelto una vez |
| J · bucles | ninguna fuente observa salidas · el motor no se llama |
| K · las nueve decisiones | ninguna existe como escritura |
| L · un solo motor | los ocho barridos intactos e integrados |
| M · seguridad | `search_path` · RLS · privilegios · sin `service_role` |
| N · privacidad | anonimato · no vigilancia · retrato mínimo |
| O · ciclo de vida | borrable solo en borrador · retirar conserva |
| P · salidas | la señal va primera · destinatario del catálogo |
| Q · nada de IA | ni librería, ni llamada, ni red |
| R · papeles | las seis claves · sin PDF por evaluación · sin secretos |
| S · pantalla | menú · constructor por catálogo · vista previa · explicación |
| T · planificador | mismo motor · 404 sin secreto · no se queda ciego · duración real |
| U · migración | 0129 + corrección 0130 · sin estrechar nada |
| V · dominio puro | forma del valor · validación · frases · permisos |

## 3 · Qué cubre la suite contra base real (§153)

Los quince escenarios de §136…§150, los once ataques de §152, los permisos, el
ciclo de vida, el planificador sin sesión y la salud del motor. La tabla
completa está en `QUALITY_11_DOMAIN_COVERAGE.md` §3.

## 4 · Los defectos que encontraron las pruebas

Ocho, y **seis los encontró la suite contra base real**, no una prueba estática.

| # | Defecto | Cómo apareció |
|---|---|---|
| 1 | `column i.direction does not exist` — la dirección del indicador vive en la configuración, no en el indicador | al construir el proveedor de sujetos |
| 2 | `argument of IS TRUE must be type boolean` — `gap` de la matriz de competencias es una **distancia entera**, no un booleano | ídem |
| 3 | el motor rechazaba el barrido sin sesión | primera ejecución del camino programado |
| 4 | los observadores de plataforma inflaban `alerts_created`: algunos barridos heredados devuelven el total de la condición, no las filas nuevas | escenario 1 · avisos = 2 cuando la regla creó 1 |
| 5 | publicar una v2 «desde hoy» dejaba a la regla **sin versión vigente** cuando el día de negocio de la empresa iba por detrás del día del servidor | escenario 11 · 0 coincidencias donde debía haber 1 |
| 6 | `finished_at = now()` daba duración **cero** siempre: `now()` es la hora de la transacción | prueba de rendimiento · 0 ms en todo |
| 7 | el proveedor de sujetos dejaba **ciego** al barrido programado: sin sesión devolvía cero sujetos y la ejecución salía «correcta» | prueba del planificador |
| 8 | dos barridos heredados exigen sesión y fallaban cada noche | verificación contra **Staging** → corrección `0130` |

El 5 y el 7 son los que más importan: los dos habrían pasado inadvertidos en
producción durante meses —una regla que no salta y un barrido que dice que miró
sin haber mirado no se quejan—.

## 5 · Regresiones

```
npm run test:all → TEST_ALL_EXIT = 0
```

Y las quince suites contra base real, en local:

```
quality01-rls  57 ✔     quality011-rls 41 ✔     quality012-rls 33 ✔
quality02-rls  58 ✔     quality03-rls  52 ✔     quality031-rls 30 ✔
quality04-rls  33 ✔     quality05-rls  74 ✔     quality06-rls  58 ✔
quality061-rls 28 ✔     quality07-rls  48 ✔     quality08-rls  60 ✔
quality09-rls  60 ✔     quality10-rls  61 ✔     quality11-rls  68 ✔
```

`quality01-rls` estaba en **rojo desde QUALITY-10**: dos invariantes suponían
que toda tabla `quality_*` lleva `organization_id` y RLS, y el catálogo global
de entradas de la revisión ya lo desmentía. Se corrigió reconociendo los
catálogos de plataforma como lo que son —globales y de solo lectura— y se añadió
la comprobación `50b` para que la excepción no se convierta en un agujero.

Contra **Staging**, con datos reales:

```
quality11-rls  68 ✔     quality08-rls  60 ✔  (regresión de anonimato)
quality09-rls  60 ✔     quality10-rls  61 ✔
```
