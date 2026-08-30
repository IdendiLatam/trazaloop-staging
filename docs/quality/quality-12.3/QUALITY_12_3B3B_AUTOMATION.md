# QUALITY-12.3B3B · Partes interesadas · AUTOMATIZACIÓN

**Migración:** `0151_quality_interested_parties_automation_and_outputs.sql`
**Local** 0151 · **Staging** 0151 · **Production** 0111, sin tocar.

---

## 1 · Lo que faltaba, dicho por B2

B2 catalogó cinco tipos de evento y **no** registró contratos, con esta razón
escrita: un contrato exige una fila en `quality_automation_sources`, y esa tabla es
la superficie de autoría de reglas. B3B pone la fuente y cierra el círculo.

## 2 · Tres fuentes, y por qué no una

El encargo pedía no crear una fuente por evento. No se creó: hay cinco eventos y
tres fuentes. Tampoco se creó una sola «de dominio», porque el patrón real de este
motor es **una fuente por sujeto observable** —`risks` tiene tres, `people` tres,
`customer` dos— y aquí lo observable son tres cosas con campos y titulares
distintos.

Hay además una razón dura: `quality_automation_sources.subject_type` es **una sola
columna**, y `quality_automation_event_contracts` traduce `subject_type` → fuente.
Con tres sujetos y una sola fuente, dos de los cinco eventos se quedarían sin
destino.

| Fuente | Sujeto | Qué observa |
|---|---|---|
| `interested_party` | `quality_stakeholder_assessment` | pertinencia, categoría, estrategias vigentes, requisitos sin proceso |
| `interested_party_requirement` | `quality_stakeholder_requirement` | tipo de entrada, subtipo, pertinencia, procesos vigentes |
| `interested_party_strategy` | `quality_stakeholder_strategy` | estado, seguimiento, cargo responsable, fechas de revisión |

Las tres admiten `schedule` y `event`. Y las tres miran **solo lo vigente** en la
fecha de negocio: observar un análisis sucedido abriría señales sobre el pasado, y
el pasado ya no se puede atender.

## 3 · Los cinco contratos

| Evento | Sujeto | Fuente | Resolutor |
|---|---|---|---|
| `interested_party.assessed` | assessment | `interested_party` | direct |
| `interested_party.relevance_changed` | assessment | `interested_party` | direct |
| `interested_party.review_completed` | assessment | `interested_party` | direct |
| `interested_party.requirement_changed` | requirement | `interested_party_requirement` | direct |
| `interested_party.strategy_changed` | strategy | `interested_party_strategy` | direct |

**Carga mínima.** El payload de cada hecho lleva lo justo: qué cambió, y en la
sucesión, de qué pertinencia a cuál. Ni instantáneas gigantes, ni correos, ni
teléfonos, ni contactos. Los campos observables tampoco: el cargo responsable se
observa por su **nombre de cargo**, y solo para poder preguntar si lo hay.

**Idempotencia.** Todo pasa por `dedupe_key` con `on conflict do nothing`. Tres
llamadas al mismo cambio dejan **un** hecho, comprobado en la suite. Y los hechos
se emiten solo tras una mutación con éxito: leer no emite nada, y una mutación
rechazada tampoco —también comprobado—.

## 4 · Cinco plantillas, ninguna activa

| Plantilla | Fuente | Condición | Salida |
|---|---|---|---|
| Parte pertinente sin estrategia | `interested_party` | pertinente **y** 0 estrategias vigentes | señal |
| Requisito pertinente sin proceso | `interested_party_requirement` | requisito **y** pertinente **y** 0 procesos | señal |
| Revisión de estrategia vencida | `interested_party_strategy` | vigente **y** fecha prevista pasada | señal + aviso al cargo |
| Estrategia sin cargo responsable | `interested_party_strategy` | vigente **y** sin cargo | señal |
| Estrategia sin método de seguimiento | `interested_party_strategy` | vigente **y** sin método | señal |

**Una plantilla no vigila nada.** Es una propuesta escrita que la empresa adopta y
ajusta. Mientras nadie la adopte no hay regla, sin regla no hay señal y sin señal no
hay un solo aviso: activar el módulo **no** llena la bandeja de nadie. Hay una
comprobación que falla si sembrar el dominio dejara una sola regla activa.

Ninguna crea tareas por omisión: quién y para cuándo lo decide la empresa al
adoptarla. Solo la de revisión vencida añade aviso, y al **cargo** responsable, que
es quien tiene la fecha pasada.

La de revisión vencida solo mira estrategias **con** fecha prevista: sin fecha no hay
nada vencido. Es la misma regla que el dominio aplica en pantalla.

## 5 · La superficie de autoría ya existía

No se construyó ningún diseñador nuevo. `lib/db/quality-automation.ts` lee las
fuentes y sus campos **desde la base**, así que las tres aparecen en el editor de
reglas de QUALITY-11 sin tocar una línea de interfaz. Lo único que hizo falta en
TypeScript fue añadir `interested_parties` al vocabulario de dominios y su etiqueta.

## 6 · Un defecto que la suite encontró

La categoría de una regla usa el **mismo** vocabulario cerrado que el dominio de las
fuentes, y `quality_automation_rules_category_check` no lo sabía. Adoptar cualquiera
de las cinco plantillas fallaba al instanciarla: la plantilla se veía perfecta hasta
que alguien la usaba. Ampliado en 0151.

## 7 · Revisión por la Dirección

La entrada `interested_parties` de B2 se validó de extremo a extremo: devuelve
disponibilidad, recuento de pertinentes, quién entró y quién salió, requisitos nuevos
y retirados, pertinentes sin estrategia, estrategias sin cargo o sin seguimiento, y
revisiones del periodo. **Sin una sola llamada a un modelo** —comprobado contando las
operaciones de Intelligence después—. Intelligence puede resumirla; la entrada existe
sin él.
