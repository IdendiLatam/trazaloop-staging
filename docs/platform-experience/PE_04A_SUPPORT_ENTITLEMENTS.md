# PE-04A · Soporte: qué incluye cada plan

---

## 1 · Lo que ya existe, y está bien

`support_tickets` es un motor completo, y **el plan no interviene en él en
ninguna parte**. Ninguna función de soporte lee `plan_code` ni `access_mode`.

| | |
|---|---|
| Categorías | `account · plan · trazability · evidences · trazadocs · imports · calculation · technical_support · bug · other` |
| Módulos | trece |
| Prioridades | `low · normal · high · urgent` |
| Estados | `open · assigned · waiting_customer · in_progress · resolved · closed` |
| Mensajes | `support_ticket_messages` |
| Historial | `support_ticket_status_history` |
| Objetivo de respuesta | `first_response_target_at` = `created_at + 1 día`, saltando sábado y domingo |

Hoy **cualquier empresa, en cualquier plan, abre cualquier categoría con
cualquier prioridad**.

Y ya existen las dos categorías que separan las dos cosas que el encargo pide no
confundir: `technical_support` / `bug` frente a las funcionales.

---

## 2 · La distinción que hay que sostener

> **«El producto está roto»** no es lo mismo que **«enséñame a implementar ISO
> 9001»**.

| | Fallo técnico | Consulta funcional |
|---|---|---|
| Qué es | Trazaloop no hace lo que promete | Alguien necesita ayuda con su sistema de gestión |
| De quién es el problema | **Nuestro** | Del cliente, y le acompañamos |
| Coste para Trazaloop | Hay que arreglarlo igual | Tiempo de una persona que sabe |
| Categoría de hoy | `technical_support`, `bug` | `trazability`, `calculation`, `plan`… |

**Un fallo técnico se reporta en todos los planes, incluido Free.** No es
generosidad: un fallo que nadie puede reportar es un fallo que no se arregla, y
el que se calla también lo sufren los que pagan. Cobrar por avisarnos de nuestros
propios defectos es un mal negocio antes que una mala política.

> **PEC-27.** Reportar un fallo del producto es un derecho de **todos** los
> planes, Free incluido. La ayuda funcional es lo que varía.

---

## 3 · Las dimensiones que sí varían

Sin inventar números, y sobre todo sin inventar compromisos:

| Dimensión | Qué es | Free | Full | Extra |
|---|---|---|---|---|
| `technical_report_enabled` | Reportar que algo falla | **sí** | sí | sí |
| `functional_tickets_enabled` | Preguntar sobre el sistema de gestión | por decidir | **no** — congelado | **sí** |
| `functional_ticket_allowance` | Cuántas al mes | — | — | configurable |
| `priority_class` | En qué cola entra | estándar | estándar | prioritaria |
| `response_target_hours` | **Objetivo**, no compromiso | configurable | configurable | configurable |

Todas van en la revisión del plan, y todas son configurables. **Ninguna trae un
número de este documento.**

### Lo que NO se puede escribir

- **«Soporte ilimitado.»** No existe. Cualquier cosa que se ofrezca sin límite
  se convierte en un consultor gratuito a demanda.
- **Un ANS contractual.** `response_target_hours` es un **objetivo interno**, y
  hasta que alguien firme un contrato que lo prometa, no se enseña como promesa.
- **«Respuesta en 4 horas.»** No hay equipo dimensionado para sostenerlo.

El campo `first_response_target_at` que ya existe es exactamente eso: un
objetivo operativo, calculado, sin promesa al cliente. **Ese es el modelo.**

> **PEC-28.** El objetivo de respuesta es **interno**. PE-04 no crea compromisos
> contractuales.

---

## 4 · Uso razonable, no barra libre

Extra incluye acompañamiento funcional, y necesita tres perillas para no
convertirse en consultoría gratis:

| | |
|---|---|
| **Cuántas** | Consultas funcionales por mes. Configurable |
| **Con qué prioridad** | Su cola, no una promesa de tiempo |
| **Sobre qué** | El producto y el uso del producto. **No** redactar el sistema de gestión del cliente |

La tercera es la que más importa y es la más fácil de olvidar: el alcance. Sin
ella, «soporte funcional» acaba significando «hacédmelo vosotros».

---

## 5 · Asesor: no es un plan

Congelado por el encargo: la consultoría humana es **una oferta comercial
distinta**, y modelarla como «Extra pero con más tickets» sería exactamente el
error que el encargo prohíbe.

### Las tres formas posibles

| | A favor | En contra |
|---|---|---|
| **Cuarto plan** (`advisor`) | Encaja con lo que ya hay | Obliga a duplicar todos los límites funcionales; y un cliente puede querer Asesor **sobre** Full o sobre Extra |
| **Complemento** sobre un plan | Ortogonal, componible, no duplica nada | Hay que introducir el concepto de complemento |
| **Servicio fuera del producto** | Cero código | Trazaloop no sabe quién lo tiene |

**Recomendación: complemento.** El argumento decisivo es que Asesor **se combina**
con cualquier plan — «Full + Asesor» y «Extra + Asesor» son dos ofertas reales—, y
un cuarto plan obligaría a mantener las combinaciones a mano.

Y encaja con lo que ya existe: los módulos ya son ortogonales al plan
(`organization_modules`). Un complemento es la misma idea aplicada al servicio.

```
organization_plan_assignments        el plan:        free | full | extra
organization_service_addons          los servicios:  advisor, onboarding…
```

Con vigencia, motivo y quién lo asignó — lo mismo que todo lo demás.

**PE-04 no construye agenda, ni horas, ni consultores, ni calendario.** Solo
registra que una empresa tiene el servicio contratado y hasta cuándo. Todo lo
demás es un producto aparte.

> **PEC-29.** Asesor es un **complemento** con vigencia, no un plan. PE-04 solo
> registra el derecho; no gestiona la prestación.

---

## 6 · Lo que hace falta implementar, y lo que no

| | |
|---|---|
| **Ya existe y se conserva** | Tickets, mensajes, estados, historial, objetivo de respuesta, categorías |
| **PE-04 añade** | Qué categorías puede abrir cada plan · la cuota funcional · la clase de prioridad |
| **PE-04 NO añade** | Chat en vivo, base de conocimiento, ANS, encuestas de satisfacción, agenda de consultores |

El motor de soporte no se reescribe. Se le pone delante un resolutor de
entitlements que hoy no existe.
