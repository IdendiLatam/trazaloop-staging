# QUALITY-12 · El proveedor

## 1 · El contrato

```ts
type QualityAiProvider = {
  name: string;
  generateStructured(req: AiRequest): Promise<AiResult>;
};
```

Una función. Texto entra, estructura validada sale, más los metadatos que se
guardan con la ejecución. No hay `generateText` libre en el camino del dominio:
todo lo que el Copilot produce tiene forma, porque §65 exige poder separar
hechos de interpretación y de sugerencias, y eso no se consigue con prosa.

## 2 · La integración real

`lib/ai/providers/anthropic.ts`, con `fetch`. **Sin SDK**, y es deliberado: el
repositorio no tenía ninguna dependencia de IA, y añadir una cadena de
suministro entera para hacer una llamada HTTP con un esquema es un coste
permanente a cambio de ahorrar cuarenta líneas.

La estructura se obtiene declarando una herramienta de un solo uso cuyo
`input_schema` es el esquema de la respuesta, y exigiendo su uso
(`tool_choice`). Es más fiable que pedir «devuelve JSON»; aun así, **se valida
igual** (§26): que el proveedor diga que cumplió no es razón para creerle.

## 3 · Configuración

| Variable | Para qué | Por omisión |
|---|---|---|
| `QUALITY_AI_PROVIDER` | `anthropic` o `fake` | `fake` |
| `QUALITY_AI_MODEL` | identificador del modelo | `claude-sonnet-5` |
| `QUALITY_AI_API_KEY` | la credencial · **solo servidor** | — |
| `QUALITY_AI_MAX_OUTPUT_TOKENS` | tope de salida | 1 500 |
| `QUALITY_AI_TIMEOUT_MS` | tiempo máximo | 30 000 |
| `QUALITY_AI_CONTEXT_BUDGET` | presupuesto de contexto (caracteres) | 24 000 |
| `QUALITY_AI_MAX_QUESTION` | tamaño de la pregunta | 1 200 |
| `QUALITY_AI_MAX_TOOL_CALLS` | herramientas por consulta | 4 |

Todas se leen en `lib/ai/config.ts`, que es `server-only`. **Ninguna es
`NEXT_PUBLIC_`**, y hay una prueba que lo comprueba.

## 4 · La credencial (§6)

- Se lee del entorno del servidor.
- No se guarda en la base, ni en un log, ni en un PDF, ni en Git.
- No sale del módulo del proveedor: `lib/db`, `server/actions` y la pantalla
  nunca la ven. Comprobado por una prueba que busca `apiKey` fuera de ahí.
- En Staging/Preview iría con alcance **de rama**, nunca global.
- **Production no se toca** (§152).

## 5 · Las cuatro formas de fallar (§85, §86, §26)

| Fallo | Cuándo | Qué se hace |
|---|---|---|
| `timeout` | el proveedor tarda más del tope | se cancela de verdad (`AbortController`), la ejecución queda `failed` y se invita a reintentar |
| `unavailable` | 5xx, 429, o no se pudo contactar | «El Copilot no está disponible temporalmente» y el resto de Trazaloop sigue |
| `refused` | 4xx del proveedor | ejecución `refused` |
| `invalid_output` | la respuesta no cumple el esquema | ejecución `failed` y **no se guarda ninguna respuesta** |

En los cuatro casos no hay ninguna escritura en tablas de negocio, porque no la
hay en ningún caso.

## 6 · El doble determinístico (§131)

`lib/ai/providers/fake.ts`. No es un modelo: compone la respuesta a partir del
contexto que el servidor construyó, cita **solo** las referencias que ese
contexto trae y, si no hay contexto, dice que no hay información suficiente.

Sabe simular lo que hace falta probar:

| Marca en la pregunta | Qué simula |
|---|---|
| `[[TEST:timeout]]` | tiempo agotado |
| `[[TEST:unavailable]]` | proveedor caído |
| `[[TEST:invalid]]` | respuesta que no cumple el esquema |

Es el proveedor activo cuando no hay credencial configurada, para que la
aplicación siga en pie y lo diga (§164) en vez de romperse.

## 7 · Estado de la validación con proveedor real (§132, §133)

**No hay ninguna credencial de proveedor disponible en este entorno.** Se buscó
en el repositorio, en el entorno del servidor, en las variables de Vercel y en
la configuración local: no existe ninguna.

Siguiendo §133 al pie de la letra, **no se ha fabricado ninguna**. La
arquitectura está completa y la única pieza que falta para funcionar con un
modelo real es la variable `QUALITY_AI_API_KEY` en el entorno de Staging/Preview
con alcance de rama.

Esto se declara como **GAP-01** en el informe, y es la razón por la que el
veredicto de este sprint no puede ser «READY FOR USER TESTING» (§174).
