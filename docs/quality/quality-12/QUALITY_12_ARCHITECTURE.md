# QUALITY-12 · Arquitectura del Copilot

## 1 · La frase que lo resume

**El modelo no consulta la base de datos.** Nunca. Recibe un paquete de texto
que el servidor construyó con la sesión de quien pregunta, y devuelve una
estructura que el servidor valida antes de creerse nada.

Todo lo demás de este documento son consecuencias de esa frase.

## 2 · El camino de una pregunta

```
PERSONA
  ↓  pregunta + caso de uso (de una lista cerrada)
ACCIÓN DE SERVIDOR        · comprueba sesión, empresa y módulo
  ↓
quality_ai_start_run      · ¿está encendido? ¿este uso? ¿queda cupo?
  ↓                         si NO → se responde y NO se llama al proveedor
CONSTRUCTOR DE CONTEXTO   · adaptadores tipados, con la RLS de esa persona
  ↓                         hechos ya calculados + fuentes numeradas
quality_ai_add_reference  · las fuentes se guardan ANTES de preguntar
  ↓
PROVEEDOR                 · política + tarea + material marcado
  ↓
VALIDACIÓN                · esquema · citas fuera de rango descartadas
  ↓
quality_ai_complete_run   · qué costó, cuánta evidencia había
  ↓
PANTALLA                  · hechos · interpretación · sugerencias · fuentes
```

Cada flecha es un sitio donde algo puede decir que no, y ninguna de ellas
escribe en una tabla de negocio.

## 3 · Las capas

| Capa | Dónde vive | Qué hace |
|---|---|---|
| Configuración | `lib/ai/config.ts` | modelo, topes, tiempos. Server-only. Un solo sitio |
| Contrato de proveedor | `lib/ai/provider.ts` | `generateStructured` y cuatro formas de fallar |
| Adaptador real | `lib/ai/providers/anthropic.ts` | una integración, con `fetch`, sin SDK |
| Doble determinístico | `lib/ai/providers/fake.ts` | para las pruebas y para cuando no hay credencial |
| Instrucciones | `lib/ai/prompts.ts` | siete plantillas versionadas · política / tarea / material |
| Esquema | `lib/ai/schemas.ts` | la forma de una respuesta y su validación |
| Contexto | `lib/ai/context/` | el constructor y once adaptadores tipados |
| Orquestador | `lib/ai/copilot.ts` | el orden de arriba, entero |
| Persistencia | `lib/db/quality-ai.ts` | lecturas con RLS |
| Acciones | `server/actions/quality-ai.ts` | la puerta desde la pantalla |
| Base | `0132_quality_ai_copilot.sql` | seis tablas, dos catálogos, once funciones |

## 4 · Por qué NO hay base vectorial (§158)

Porque no hay un problema que resolver con ella.

Los datos de Trazaloop **están estructurados**: un indicador tiene mediciones
con periodo y valor, un riesgo tiene nivel y revisión, una señal tiene regla,
versión y explicación. Recuperar eso con adaptadores tipados es más exacto que
recuperarlo por similitud semántica, y además se puede citar con precisión.

Meter embeddings «porque esto es IA» habría añadido: una infraestructura nueva
que mantener, un problema de aislamiento entre empresas, un problema de borrado
—qué pasa con el vector cuando el documento se retira—, un problema de verdad
histórica —qué versión del documento está vectorizada— y una copia de los datos
del cliente en un tercer sitio.

Cuando aparezca una necesidad real de búsqueda semántica sobre documentos
largos, se evaluará con §160 delante. Hoy se difiere, que es lo honesto.

## 5 · Por qué el proveedor está detrás de un contrato (§5)

Dos razones, y ninguna es estética:

1. **Las pruebas.** Con el doble determinístico, las 119 comprobaciones de este
   sprint corren sin gastar una llamada y sin que un servicio de terceros decida
   si la suite pasa hoy. Si una prueba pasa, pasa por la arquitectura.
2. **El día de mañana.** El proveedor de hoy no tiene por qué ser el de dentro
   de un año, y cambiarlo no puede significar tocar quince archivos del dominio.

## 6 · Lo que el contrato NO ofrece

No hay `runSql`, ni `queryTable`, ni una herramienta genérica de base de datos.
No es que estén protegidas: **no existen**. El modelo no tiene forma de pedir
datos que el servidor no haya decidido darle, porque el único canal es el texto
del contexto.

## 7 · La separación con QUALITY-11

| | QUALITY-11 | QUALITY-12 |
|---|---|---|
| Qué hace | detecta condiciones | interpreta y redacta |
| Cómo | catorce operadores deterministas | un modelo de lenguaje |
| Repetibilidad | la misma condición da siempre lo mismo | no se promete |
| Quién lo dispara | el reloj o un hecho | una persona |
| Qué produce | señales, avisos, tareas | texto y borradores |
| Puede decidir | no | no |

**Ninguna regla de automatización llama al Copilot, y el planificador tampoco**
(§42, §125). Hay una prueba que lo comprueba leyendo las migraciones 0129–0131 y
el endpoint del cron.
