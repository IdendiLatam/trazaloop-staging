# QUALITY-12.1 · El proveedor OpenAI

## Qué se añadió, y qué NO se tocó

Se añadió **un tercer adaptador** detrás del contrato `QualityAiProvider` que
QUALITY-12 ya había definido. No cambió el orquestador, no cambió el
constructor de contexto, no cambió una sola pantalla y no cambió el esquema de
la respuesta. Esa es la prueba de que la abstracción del sprint anterior servía
para algo: se enchufa un proveedor real y el resto del sistema no se entera.

```
lib/ai/provider.ts        ← el contrato (sin cambios de forma)
lib/ai/providers/fake.ts     · el doble determinístico
lib/ai/providers/anthropic.ts · el que ya estaba
lib/ai/providers/openai.ts    · NUEVO
```

## La llamada, campo por campo

`client.responses.create(...)` con la API de Respuestas del SDK oficial
(`openai@7.7.0`).

| Campo | Valor | Por qué |
|---|---|---|
| `model` | de la configuración del **servidor** | §63 · el navegador no elige modelo |
| `instructions` | la política + la tarea | separadas del material del tenant |
| `input` | contexto y pregunta, marcados como material | §29 |
| `text.format` | `json_schema` con `strict: true` | §26 · la forma se exige, no se pide |
| `reasoning.effort` | `low` (configurable) | §13 |
| `max_output_tokens` | tope de la configuración | coste acotado |
| `store` | **`false`** | §6 · nada se retiene en el proveedor |
| `timeout` | tope de la configuración | §85 · el Copilot no cuelga Calidad |
| `maxRetries` | `1` | un reintento; no una tormenta |

### Lo que NO se envía, y es deliberado

* **`temperature` y `top_p`**: no se mandan. En un modelo que razona compiten
  con el propio razonamiento y el proveedor puede rechazar la petición (§14).
* **`tools` / `tool_choice`**: no se declaran. Ni búsqueda web (§53), ni
  ficheros alojados o almacenes vectoriales (§54), ni ejecución de código
  (§55), ni herramientas del lado del proveedor (§56). El modelo **no consulta
  nada**: recibe el contexto que el servidor le construyó y responde sobre él.

## El esquema estricto

El modo estricto de salida estructurada exige que **todo** objeto declare
`additionalProperties: false` y liste **todas** sus propiedades en `required`.
El esquema compartido `ANSWER_SCHEMA` no cumple eso a propósito —Anthropic no
lo necesita y el doble tampoco—, así que el adaptador lo convierte al vuelo con
`strictSchema()`.

La alternativa era endurecer el esquema compartido y obligar a los otros dos
proveedores a vivir con las restricciones de este. Se descartó: un proveedor no
debe imponer su dialecto a los demás.

## El esfuerzo de razonamiento: por qué `low`

El Copilot **resume datos que ya tiene delante y los cita**. No resuelve un
problema abierto, no busca, no deduce cadenas largas: el trabajo duro —contar,
filtrar, reconstruir el pasado— ya lo hizo el servidor antes de llamar.

`low` da la calidad que esa tarea necesita sin pagar latencia ni tokens de
razonamiento. Se puede subir con `QUALITY_AI_REASONING_EFFORT` sin tocar
código. `xhigh` y `max` no se admiten (§13): la configuración los rechaza y cae
en `low`.

## El mapa de errores

El contrato tiene cuatro formas de fallar, y todas se traducen sin ampliarlo:

| Lo que pasa | Se devuelve | Lo que ve la persona |
|---|---|---|
| 401 / 403 · credencial inválida | `unavailable` | «no está disponible temporalmente» |
| 429 · demasiadas peticiones | `unavailable` | lo mismo |
| 5xx · el proveedor caído | `unavailable` | lo mismo |
| tiempo agotado o cancelado | `timeout` | «tardó demasiado» |
| 400 / 422 · petición rechazada | `refused` | el motivo, saneado |
| el modelo se niega | `refused` | el motivo, saneado |
| salida vacía o no interpretable | `invalid_output` | «no se pudo interpretar» |

**Nada de esto imprime la clave.** El adaptador no escribe en el registro, no
serializa el error entero —dentro del objeto de error del SDK viaja la petición,
y en la petición la cabecera de autorización— y trunca cualquier texto que
reenvíe. Prueba `A3` de `test:quality121`.

## El consumo

Se guarda lo que el proveedor informe, y **solo** eso (§12):

| Campo | De dónde sale |
|---|---|
| `input_tokens` | `usage.input_tokens` |
| `cached_input_tokens` | `usage.input_tokens_details.cached_tokens` |
| `output_tokens` | `usage.output_tokens` |
| `reasoning_tokens` | `usage.output_tokens_details.reasoning_tokens` |
| `total_tokens` | `usage.total_tokens` |

Un campo que el proveedor no informa queda en **`null`**, no en cero. Un cero
diría «el modelo razonó gratis»; un hueco dice «no lo sabemos», que es la
verdad. El doble determinístico no informa ninguno de los tres nuevos: la
prueba `D1` de `test:quality121-rls` comprueba precisamente que se quedan
vacíos.

## Cómo se elige el proveedor

```
QUALITY_AI_PROVIDER=openai    + credencial válida → OpenAI, en vivo
QUALITY_AI_PROVIDER=anthropic + credencial válida → Anthropic, en vivo
QUALITY_AI_PROVIDER=openai    SIN credencial      → doble, y la pantalla lo dice
QUALITY_AI_PROVIDER=cualquier-otra-cosa           → doble, y la pantalla lo dice
```

**Un nombre mal escrito no acaba llamando a OpenAI.** Si alguien escribe
`anthropc`, lo que ocurre es que el Copilot responde solo con datos de
Trazaloop y avisa de que no hay proveedor configurado. Caer sobre un proveedor
real por un error de tecleo sería gastar dinero de alguien sin que lo haya
pedido (§61). Pruebas `B1` estática y `D2`–`D5` contra base real.

Una credencial vacía, con espacios, o de relleno (`PENDIENTE`) **no cuenta como
credencial**: se comprueba que hay algo con forma de clave, no que empiece por
un prefijo concreto —los prefijos cambian, y una comprobación rígida acaba
rechazando una clave buena—.
