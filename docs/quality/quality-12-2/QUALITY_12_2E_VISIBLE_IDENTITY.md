# Trazaloop Intelligence · identidad visible

> Decisión de producto **congelada**, y validada visualmente el 28 de agosto de
> 2026 sobre el Preview `ig1vypkni` (commit `fdbbc36`): cinco comprobaciones,
> cinco PASS.
>
> Este documento es la autoridad sobre cómo se llama la capacidad de cara a
> quien la usa, y sobre qué **no** cambia por debajo.

---

## La decisión, en dos líneas

| | |
|---|---|
| **Identidad visible** | **Trazaloop Intelligence** |
| **Espacio técnico** | `quality_ai_*` — **sin tocar** |

Las dos mitades importan igual. La primera es lo que lee una persona. La
segunda es lo que evita que un sprint futuro «termine el trabajo» con una
migración masiva de nombres que no le daría nada a nadie.

---

## Los nombres

| | |
|---|---|
| Completo | **Trazaloop Intelligence** |
| Corto | **Intelligence** |

El corto se usa en navegación, botones y cualquier sitio estrecho. No es «IA»
ni «AI»: eso describe la tecnología, no el producto, y dentro de un año habría
que explicarlo igual.

### Las tres acciones

| | |
|---|---|
| `INTELLIGENCE_ACTIONS.ask` | **Preguntar a Intelligence** |
| `INTELLIGENCE_ACTIONS.improve` | **Mejorar con Intelligence** |
| `INTELLIGENCE_ACTIONS.review` | **Revisar con Intelligence** |

Se llaman distinto porque hacen cosas distintas, y la diferencia entre las dos
últimas es la que más cuesta transmitir:

> **Mejorar** mira tu texto y lo escribe mejor.
> **Revisar** compara tu texto con lo que Trazaloop tiene registrado.

### Secciones

| | |
|---|---|
| Ajustes | **Ajustes de Intelligence** |
| Propuestas | **Propuestas de Intelligence** |
| Historial | **Consultas de Intelligence** |

---

## Por qué no «Quality Intelligence»

Nació dentro de Quality. Hoy funciona en **Quality, PCR, Textiles y sobre los
documentos de TrazaDocs**, y el permiso lo da el módulo del documento, no
Quality.

Llamarlo «Quality Intelligence» contaría mal dónde se puede usar, y sería el
tipo de error que después cuesta mucho deshacer porque la gente ya aprendió el
nombre.

---

## Lo que NO se renombra, y por qué

Esta lista existe para que nadie la «complete» más adelante.

| Qué | Por qué se queda |
|---|---|
| `quality_ai_runs` y las demás tablas | Renombrarlas obligaría a migrar datos históricos sin ganar nada visible |
| `QUALITY_AI_PROVIDER` `QUALITY_AI_MODEL` `QUALITY_AI_API_KEY` `QUALITY_AI_REASONING_EFFORT` | Están configuradas en entornos reales; cambiar el nombre rompe despliegues a cambio de nada |
| `copilot.ask` y las demás plantillas | Están **guardadas en filas**. Un run de hace tres meses es esa consulta |
| `use_case` persistidos | Ídem. La traducción vive en la presentación |
| La ruta `/quality/copilot` | Un nombre visible no es una migración de URL |
| `CopilotPanel`, `AskCopilotButton`, `runCopilot` | Identificadores internos. Nadie los lee |
| La política enviada al modelo | Cambiarla es **comportamiento**, no identidad, y rompería el versionado del prompt |
| `copilot-aviso` (id del DOM) | Invisible. El nombre accesible sale del texto del botón, que sí cambió |

### Cómo se traduce sin tocar la base

```
lib/domain/intelligence-identity.ts · labelForUseCase()

  copilot.ask                  → Pregunta a Intelligence
  copilot.customer_themes      → Temas de la voz del cliente
  document.quick_edit          → Mejora de redacción
  document.contextual_review   → Revisión contextual
```

Un identificador desconocido se devuelve **tal cual**: inventarle un nombre
bonito escondería que ha aparecido uno nuevo.

---

## Dónde vive esto

`lib/domain/intelligence-identity.ts`. Ocho constantes y dos funciones, y **no
es `server-only`**: lo usan las pantallas y el servidor.

No es un sistema de marca. Un framework de branding para un producto con un
nombre sería peor que el problema que resuelve. Lo que resuelve es concreto: el
nombre estaba escrito a mano en una treintena de sitios y cambiarlo obligaba a
encontrarlos todos.

---

## El tono

Sobrio. La marca se nombra **una vez** y no en cada frase.

| No | Sí |
|---|---|
| «Intelligence sabe…» | «Intelligence puede ayudarte a…» |
| «Intelligence garantiza…» | «Revisa tu texto frente a…» |
| «Pensando…» | «Preparando…» |
| «Intelligence está preparando una propuesta…» | «Preparando una propuesta…» |

«Pensando» se cambió por «Preparando» en este sprint: antropomorfizaba, y el
producto no piensa.

Y la filosofía sigue escrita donde se ve:

> **Intelligence propone. La persona decide.**

Nada de aprobación automática, cumplimiento automático, corrección definitiva
ni decisión tomada por la IA.

---

## Documentación histórica

**No se reescribe.** QUALITY-12 se llamó Copilot y sus documentos lo dicen.

El guard de cadenas de `test:quality122e` mira `app/`, `components/`, `lib/` y
`server/`, y **deja fuera** `docs/`, `tests/`, `supabase/` y `scripts/`. Si
mirara la documentación, no se podría a la vez exigir que el runtime no diga
«Copilot» y que la historia del proyecto siga siendo verdad.
