# QUALITY-11.1 · Matriz de pruebas

## 1 · Las dos suites nuevas

| Suite | Comando | Qué comprueba | Resultado |
|---|---|---|---|
| Puras y estáticas | `npm run test:quality111` | que los dos huecos se cerraran REUTILIZANDO, no construyendo al lado | **41 conformes, 0 fallos** |
| Contra base real | `npm run test:quality111-rls` | los dos huecos, con hechos creados por las RPC de dominio reales | **42 conformes, 0 fallos** |

## 2 · La suite pura, bloque a bloque

| Bloque | Qué busca |
|---|---|
| A · no se rediseñó nada | 3 tablas nuevas y ninguna de cola, trabajo o notificación · ninguna cola externa · el outbox sigue siendo `work_events` · nada de IA |
| B · GAP-01 | los dos barridos dejan de exigir sesión sin perder permisos · su lógica y sus claves intactas · ceden ante la regla que los releva · las tres plantillas existen · los dos hechos nuevos del catálogo |
| C · GAP-02 | enrutado por tipo de hecho con índice · sujeto por contrato y sin leer el JSON · fuente que debe coincidir · **el mismo** evaluador, **el mismo** proveedor (18/18 ramas), **el mismo** ejecutor · la clave de dedupe sin el camino · el linaje hasta el hecho |
| D · idempotencia | acuse único · no reevaluar lo entregado · reintentar lo fallido contando intentos · la marca de agua no es la garantía |
| E · lo que no puede hacer | no enruta sus propios hechos · ninguna de las nueve decisiones · una regla rota no deshace el hecho · el hecho se emite dentro de la transacción |
| F · seguridad | definer con `search_path` · empresa nunca del navegador · tipo de hecho rearmado en el servidor y validado contra el catálogo · acuses y catálogos de solo lectura · la bitácora no admite escritura |
| G · pantalla y planificador | CUÁNDO MIRA / CUANDO OCURRE en el constructor · las dos formas explicadas sin jerga · resumen determinístico · las ejecuciones distinguen origen · la señal dice de dónde vino · el planificador drena y barre · **ningún cron configurado** |
| H · migración | la 0131 es única y última · la 0129 y la 0130 sin tocar · el catálogo de eventos se amplía con guarda anti-estrechamiento · pgcrypto cualificado |

## 3 · La suite contra base real, bloque a bloque

| Bloque | Escenario | §  |
|---|---|---|
| A | catálogo de hechos y contratos: se leen, no se tocan | §11, §17 |
| B | **queja registrada** por el camino real → hecho → puente → señal · sin caso ni NC · procesar dos veces no emite dos veces | §13, §52, §22 |
| C | **medición cargada** fuera de meta → señal al instante · el indicador no cambia | §54 |
| D | mismo evaluador · **colisión evento + barrido: una sola señal** · el ejecutor es uno | §19, §20, §59 |
| E | **evaluación de proveedor cerrada** → resolutor evaluación→alcance → señal · aprobación intacta | §53 |
| F | **hallazgo evaluado** → señal · NC = 0 | §55 |
| G | GAP-01: los ocho corren sin sesión · medición y acción detectadas · la acción no cambia · segundo barrido sin duplicados · **adoptar la regla calla al barrido** · la regla detecta lo mismo · la bandeja no se duplica | §50, §51, §8 |
| H | reintento tras fallo a medias · dos procesadores a la vez · rearme | §23, §57, §60 |
| I | los hechos de la automatización no se enrutan · cinco pasadas no crecen · v2 no reescribe la señal de la v1 · el día de negocio manda | §25, §31, §32 |
| J | seguridad: falsificar un hecho, procesar lo ajeno, regla de B con hecho de A, anónimo, acuses, regla con hecho de otro sujeto, hecho inventado | §47, §48 |
| K | una regla rota no impide la buena ni deshace el hecho | §26, §58 |
| L | con varios sujetos en la fuente, se evalúa **el del hecho** | §17, §18 |

## 4 · Los defectos que encontraron las pruebas

**Tres, y los tres los encontró la ejecución real.**

| # | Defecto | Cómo apareció | Por qué importaba |
|---|---|---|---|
| 1 | el reintento era **imposible**: la marca de agua dejaba fuera el hecho fallido | H1 · tras marcar el acuse en fallo, reprocesar no hacía nada | una entrega perdida por un corte se habría perdido para siempre, en silencio |
| 2 | el filtro por sujeto se coló **dentro de una subconsulta** en 2 de las 18 ramas | revisión del SQL generado tras aplicar; L1 lo fija como regresión | el puente habría evaluado «un» indicador en vez de «el» del hecho: señales sobre el objeto equivocado |
| 3 | la columna `signal_created` no llegó a existir al reaplicar la migración sobre una tabla ya creada | B2 · «column d.signal_created does not exist» | el informe de una ejecución por eventos habría contado mal |

El segundo es el que más habría dolido: con un solo sujeto sembrado —que es lo
normal en una prueba— no se nota nunca.

## 5 · Regresiones

```
npm run test:all → TEST_ALL_EXIT = 0
```

Y las suites contra base real, en local, después de QUALITY-11.1:

```
quality03-rls  52 ✔   quality04-rls  33 ✔   quality07-rls  48 ✔
quality08-rls  60 ✔   quality09-rls  60 ✔   quality10-rls  61 ✔
quality11-rls  68 ✔   quality11-perf  6 ✔   quality111-rls 42 ✔
```

Las de QUALITY-03 y QUALITY-04 son las que importan aquí: sus barridos se
tocaron, y siguen verdes sin cambiar una línea de sus pruebas.

## 6 · Lo que hubo que actualizar en la suite de QUALITY-11

Dos afirmaciones dejaron de ser ciertas **porque QUALITY-11.1 cerró el hueco**,
y se actualizaron diciendo por qué:

| Antes | Ahora |
|---|---|
| «se omiten 2 observadores sin sesión» (0130) | «los ocho corren sin sesión» (0131) |
| «hay 14 plantillas» | «hay 21»: tres de paridad y cuatro por evento |
| «los tipos de ejecución son manual, programada, simulación» | «…y por un hecho ocurrido» |
