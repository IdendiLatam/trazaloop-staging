# QUALITY-12.3B2 · Partes interesadas · EVENTOS

**Migración:** `0150_quality_interested_parties_integrations.sql`

---

## 1 · Los cinco hechos

| Tipo | Sujeto | Cuándo | Quién lo emite |
|---|---|---|---|
| `interested_party.assessed` | `quality_stakeholder_assessment` | se sucede un análisis | `quality_supersede_stakeholder_assessment` |
| `interested_party.relevance_changed` | `quality_stakeholder_assessment` | y además cambió la pertinencia | la misma |
| `interested_party.requirement_changed` | `quality_stakeholder_requirement` | se convierte, se retira, cambia su pertinencia o su vínculo con un proceso | `quality_emit_stakeholder_change_event` |
| `interested_party.strategy_changed` | `quality_stakeholder_strategy` | se crea, se edita, cambia de estado o de requisitos | la misma |
| `interested_party.review_completed` | `quality_stakeholder_assessment` o `_strategy` | se registra una revisión | `quality_record_stakeholder_review` |

`source_domain = 'interested_party'`. Los cinco están en
`quality_automation_event_catalog` con `domain = 'interested_parties'`.

---

## 2 · Por qué hubo que escribir un emisor

Los tres primeros hechos nacen dentro de RPCs. Los otros dos ocurren en
**escrituras normales bajo RLS**, que las hace la capa de aplicación. Y la capa
de aplicación **no puede insertar en `work_events`**: la tabla tiene política de
lectura y ninguna de escritura, a propósito desde 0117. El bus solo lo escribe la
base.

Sin `quality_emit_stakeholder_change_event`, dos tipos de evento habrían quedado
declarados en el CHECK y en el catálogo de automatización —visibles para quien
fuera a escribir una regla— y sin que nadie los produjera nunca. Una promesa de
aviso que no llega.

Es exactamente el hueco que QUALITY-12.2F.1 encontró con
`ai.usage_hard_limit_reached`, meses después de crearlo. Aquí se cerró **antes de
que existiera**.

### Lo que el emisor comprueba

Es `security definer`, así que vuelve a comprobar las dos cosas: que la fila
existe, y que quien llama gestiona partes interesadas **en la empresa de esa
fila**. La empresa sale de la fila, nunca de quien llama; al revés sería fiable
solo mientras nadie se equivocara de identificador.

---

## 3 · Exactamente una vez

Todos llevan `dedupe_key` y `on conflict do nothing`, respaldado por el índice
único parcial que `work_events` ya tenía.

```
interested_party.assessed:<id del sucesor>
interested_party.relevance_changed:<id del sucesor>
interested_party.review_completed:<id de la revisión>
interested_party.requirement_changed:<id>:<qué cambió>:<fecha>
interested_party.strategy_changed:<id>:<qué cambió>:<fecha>
```

Los tres primeros se deduplican por el identificador de la fila que acaban de
crear: se emiten una vez porque la fila se crea una vez. Los dos últimos incluyen
**el cambio y el día**: dos pulsaciones del mismo botón producen un hecho; el
mismo cambio mañana produce el suyo, que es lo correcto —son hechos distintos—.

Y el doble clic sobre «suceder» ni siquiera llega al bus: el segundo intento
encuentra el análisis ya sucedido y se rechaza con `assessment_superseded`.

---

## 4 · Lo que no se emite

Cambiar el resumen de un análisis sin cambiar la pertinencia **no** emite
`relevance_changed`. Un cambio que no ocurrió no es un hecho, y emitirlo
convertiría el bus en ruido.

Y `relevance_changed` sale con severidad `warning`, no `info`: dejar de
considerar pertinente a alguien es exactamente lo que una auditoría va a
preguntar.

---

## 5 · Los contratos de automatización quedan pendientes

Los cinco tipos están en el **catálogo de eventos**, que es lo que hace falta
para que existan y se puedan observar. Los **contratos**
(`quality_automation_event_contracts`) exigen además una fila en
`quality_automation_sources`, que es la superficie de autoría de reglas —B3—.
Registrarlos ahora habría sido declarar una regla sin sitio donde escribirla.
