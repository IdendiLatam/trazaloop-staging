# QUALITY-11 · Cobertura documental

**`Q11_EXPORT_PENDING = 0`.**

## 1 · Las seis exportaciones

| Clave | Documento | Tipo | Temporalidad |
|---|---|---|---|
| `quality.automation-rule.list` | Listado de reglas | listado | actual |
| `quality.automation-rule.detail` | Ficha de regla | ficha | **histórica** |
| `quality.automation-signal.list` | Listado de señales | listado | actual |
| `quality.automation-signal.detail` | Ficha de señal | ficha | **histórica** |
| `quality.automation-run.list` | Reporte de ejecuciones | listado | actual |
| `quality.automation-run.detail` | Informe de ejecución | ficha | **histórica** |

Las seis tienen botón en la pantalla, pasan por el endpoint único
(`/export/[key]`), exigen sesión, empresa activa y entitlement de módulo, y
ninguna usa la clave de servicio.

## 2 · Las cuatro reglas que las atraviesan

**Todo se explica solo.** La ficha de señal imprime la explicación línea a
línea y el retrato de los datos que la regla miró. El informe de ejecución
imprime qué se evaluó, cuántos sujetos, cuántas coincidencias y qué falló.

**La ficha de regla imprime TODAS sus versiones.** No solo la vigente: una señal
de hace un año se lee con la versión que la emitió, y si la ficha solo mostrara
la de hoy, el papel contradiría a la señal.

**Ninguna afirma que la plataforma decidió nada.** Las notas lo dicen con todas
las letras: la automatización observa, avisa y encarga trabajo; declarar,
aprobar, aceptar y cerrar siguen siendo de personas.

**Ninguna rompe el anonimato.** La ficha de una señal del dominio `customer`
lleva la nota de anonimato; la del dominio `people`, la de no vigilancia. Y lo
que imprimen es lo que la señal guarda, que son agregados y vencimientos.

## 3 · Lo que NO se exporta

**No hay PDF por evaluación.** La inmensa mayoría de las evaluaciones no
coinciden y no documentan nada; la ejecución ya dice cuántas hubo.

**El informe de ejecución no imprime ningún secreto.** Ni la variable del
planificador, ni tokens, ni claves. Comprobado con una prueba que busca esas
palabras en el bloque del adaptador.

## 4 · El inventario

Once entidades nuevas clasificadas, ninguna pendiente:

| Entidad | Ficha | Listado | Histórico |
|---|---|---|---|
| Regla de automatización | ✔ | ✔ | ✔ (la ficha) |
| Versión de regla | dentro de la regla | dentro | dentro |
| Condición de una regla | dentro de la regla | dentro | dentro |
| Salida de una regla | dentro de la regla | dentro | dentro |
| Señal | ✔ | ✔ | ✔ (la ficha) |
| Supresión de señal | dentro de la señal | dentro | dentro |
| Ejecución | ✔ | ✔ | ✔ (la ficha) |
| Resultado de una regla en una ejecución | dentro de la ejecución | dentro | dentro |
| Fuente observable | no documentable · catálogo de plataforma | idem | idem |
| Campo observable | no documentable · catálogo de plataforma | idem | idem |
| Plantilla de regla | no documentable · catálogo de plataforma | idem | idem |
| Ajustes de la automatización | no documentable · configuración | único por empresa | la historia está en las ejecuciones |

Tras QUALITY-11 el registro tiene **164 claves** y el inventario **201
entidades**, con cero pendientes. Las cuatro suites de EXPORT-01 siguen verdes.
