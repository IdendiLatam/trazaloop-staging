# QUALITY-12 · Consumo y coste

## 1 · Qué se mide (§76)

Cada consulta guarda: proveedor, modelo, plantilla y versión de instrucciones,
tokens de entrada, tokens de salida, latencia, número de fuentes en el contexto
y estado final.

`quality_ai_usage(empresa)` devuelve el agregado: consultas del mes, consultas
de hoy por la persona que pregunta, tokens del mes, fallos del mes y los topes
vigentes.

## 2 · Los topes (§89, §147)

| Tope | Por omisión | Dónde se comprueba |
|---|---|---|
| Consultas al mes, por empresa | 500 | `quality_ai_start_run` |
| Consultas al día, por persona | 50 | `quality_ai_start_run` |
| Tokens de salida | 1 500 | configuración del proveedor |
| Tamaño de la pregunta | 1 200 caracteres | orquestador + pantalla |
| Presupuesto de contexto | 24 000 caracteres | constructor de contexto |
| Herramientas por consulta | 4 | configuración |

**Se comprueban antes de llamar al proveedor.** Un tope que se comprueba después
de gastar no es un tope. Cuando uno se alcanza, se registra una ejecución con
estado `rate_limited` —para que quede el rastro— y **no se llama a nadie**.

## 3 · Carrera entre pestañas (§149)

Los topes se cuentan y se consumen bajo `pg_advisory_xact_lock` por empresa, en
la misma transacción que abre la ejecución. Dos peticiones simultáneas no pueden
colarse las dos por el hueco entre contar y crear.

## 4 · Lo que acota el coste, además de los topes

**El contexto mínimo.** Ningún adaptador hace `select *`; todos tienen tope de
filas y filtran por periodo cuando lo hay. El contexto de una pregunta típica
son unas decenas de líneas, no un volcado.

**Los textos recortados.** Cada texto de la empresa entra recortado a 800
caracteres. Un procedimiento entero no mejora la respuesta.

**Sin contexto, sin llamada.** Si no hay nada autorizado que responda a la
pregunta, se responde que no hay información y no se gasta nada.

**Temperatura cero.** Esto resume hechos, no escribe poesía.

## 5 · Rendimiento observado (§157)

Con el doble determinístico, sobre el escenario de las pruebas:

| Medida | Valor típico |
|---|---|
| Construcción del contexto | 40–200 ms (según cuántos adaptadores aplican) |
| Fuentes por consulta | 3–20 |
| Tamaño del contexto | 1–6 KB |
| Latencia total sin proveedor real | < 400 ms |

La latencia del proveedor real no se ha podido medir: no hay credencial
disponible (GAP-01). Cuando la haya, el campo `latency_ms` de cada ejecución la
registra sin tocar nada más.

## 6 · Quién ve el consumo (§118, §119)

Quien administra Calidad ve el consumo de toda la empresa: cuántas consultas,
con qué modelo, cuánto tardaron, cuántas fallaron. **No ve** el texto de las
preguntas ni de las respuestas ajenas.

El reporte en PDF (`quality.ai-run.list`) sigue la misma regla y lo dice en el
propio papel.

## 7 · Apagarlo

`is_enabled = false` deja la empresa sin Copilot desde ese instante, sin
desplegar nada y sin perder lo ya consultado. También se pueden apagar los usos
sensibles por separado, o poner los topes a cero.
