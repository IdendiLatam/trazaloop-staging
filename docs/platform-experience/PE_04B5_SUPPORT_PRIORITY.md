# PE-04B5 · Prioridad y orden de la cola

## La regla que importa

**«Extra prioritario» no significa que quien paga se cuele delante de un
incidente crítico.** Una caída, un problema de integridad de datos o un asunto de
seguridad reportado por una empresa **Free** va antes que una duda de uso de una
empresa **Extra**.

Y no es una opinión de quien atiende: es el orden que devuelve la base.

## El orden exacto

`support_queue_rank(support_kind, priority, commercial_priority)`:

| Rango | Qué |
|---|---|
| 10 | incidente técnico **urgente** · de cualquier plan |
| 20 | incidente técnico **alto** · de cualquier plan |
| 30 | **caso funcional con prioridad comercial** (Extra) |
| 40 | resto urgente |
| 50 | resto alto |
| 60 | normal |
| 70 | bajo |

La severidad técnica se evalúa **antes** que lo comercial, y hay una prueba
estática que comprueba precisamente el orden de las ramas, no solo que existan.

## Dónde se aplica

`queue_rank` viaja en las dos vistas de resumen, así que la cola de plataforma
ordena por ella sin que nadie tenga que acordarse.

## La prioridad comercial se fija al enviar

Con el plan de ese momento, y **no se recalcula**. Bajar de plan no degrada un
caso que ya estaba aceptado y en curso.

## El objetivo de respuesta

**Objetivo de primera respuesta: 1 día hábil.** Es lo que se dice y es lo único
que se promete.

No se promete resolución. `first_response_target_at` existe desde 0053 y salta
sábados y domingos; **no hay calendario de festivos**, y B5 no construye un motor
de SLA para fingir una precisión que no tenemos. Una prueba comprueba que el
ticket tiene objetivo de primera respuesta y **no** una fecha de resolución
comprometida.

## Notificaciones

No se anuncia «prioritario» ni «1 día hábil» a un ticket técnico solo porque la
empresa sea Extra. La prioridad comercial es de la **orientación funcional**; los
incidentes técnicos se ordenan por severidad, que es lo que corresponde.

## El anti-abuso sigue aparte

Los controles técnicos de tasa siguen siendo técnicos. Nunca se le dice a alguien
que agotó sus casos cuando lo que ha ocurrido es que envió demasiadas peticiones
seguidas. Y no se inventa un cupo pequeño de tickets visible para el cliente.
