# Trazaloop · Centro de soporte y tickets (Sprint 10C)

## 1. Qué es el Centro de soporte

`/support` reemplaza visualmente al antiguo «Feedback» como la forma de
pedir ayuda dentro de Trazaloop. Cualquier miembro de la empresa puede
crear un **ticket**, hacer seguimiento a su estado y conversar con el
equipo de soporte de Trazaloop — todo queda almacenado y con historial,
nunca se pierde.

## 2. Cómo crear un ticket

Desde `/support` → «Nuevo ticket» (`/support/new`): asunto, descripción,
categoría, módulo relacionado y prioridad (por defecto Normal). Al
crearlo, Trazaloop calcula automáticamente el **objetivo de primera
respuesta** (siguiente día hábil) y muestra el mensaje:

> «Tiempo objetivo de primera respuesta: 1 día hábil.»

Esto es un objetivo operativo, **no una garantía contractual** — nunca
verás la palabra «garantizado» en ningún texto del Centro de soporte.

La **descripción inicial que escribiste siempre queda visible** en el
detalle del ticket (`/support/[id]` y `/platform/support/[id]`), en su
propia sección — nunca se pierde ni queda escondida detrás de la
conversación.

Todos los campos que definen el estado real de un ticket (estado,
asignación, primera respuesta, resolución, cierre) los controla
Trazaloop en el servidor — un intento de crear un ticket ya "resuelto"
o ya "asignado" desde fuera de la aplicación normal se normaliza
automáticamente a los valores correctos, nunca se acepta tal cual.

La **fecha de creación** de un ticket, y la de cada mensaje, también las
fija siempre el servidor — nunca se puede adelantar ni atrasar la fecha
real para alterar el objetivo de primera respuesta o la «última
actividad» que ve la empresa.

## 3. Estados de ticket

| Estado | Significado |
|---|---|
| Abierto | Recién creado, sin asignar todavía. |
| Asignado | Alguien del equipo de soporte lo tomó. |
| En espera de la empresa | Soporte respondió y espera información tuya. |
| En proceso | Se está trabajando activamente. |
| Resuelto | Soporte considera el caso resuelto. |
| Cerrado | Caso cerrado. |

Un ticket **resuelto o cerrado se puede reabrir** en cualquier momento
respondiendo — vuelve automáticamente a «Abierto».

El historial de cambios de estado de cada ticket lo genera únicamente el
sistema, en el mismo momento en que ocurre el cambio real — nunca se
puede escribir una entrada de historial "a mano" ni desde fuera de la
aplicación.

## 4. Prioridades

Baja, Normal (por defecto), Alta, Urgente. Solo el equipo de soporte de
plataforma puede cambiar la prioridad de un ticket ya creado — no hay
escalamiento automático todavía.

## 5. Categorías

Cuenta / acceso · Plan / límites · Trazabilidad · Evidencias · TrazaDocs
· Importaciones · Cálculo · Soporte técnico · Error de plataforma ·
Otro.

## 6. Tiempo objetivo de primera respuesta

Se calcula como el **siguiente día hábil** (lunes a viernes) desde el
momento de creación — sin festivos por ahora. Cada ticket muestra su
estado frente a ese objetivo: **dentro del tiempo objetivo**, **próximo
a vencer** (últimas 4 horas), **vencido**, o **respondido** (una vez
que llega la primera respuesta real de plataforma).

## 7. Mensaje visible vs. nota interna

- **Mensaje visible**: lo ve la empresa y el equipo de soporte. Cualquiera
  de los dos puede escribir uno. Actualiza la «última actividad» del
  ticket que ve la empresa.
- **Nota interna**: solo la ve el equipo de soporte de plataforma —
  nunca la empresa. Un usuario de empresa no puede crear una nota
  interna bajo ninguna circunstancia (esto se exige a nivel de base de
  datos, no solo en la interfaz). Tampoco actualiza la «última
  actividad» que ve la empresa — así nunca hay una notificación visual
  de un cambio que la empresa no puede leer.

## 8. Cómo responde plataforma

Desde `/platform/support/[id]`, el equipo de soporte responde con
mensajes visibles o agrega notas internas. La **primera vez** que
plataforma envía un mensaje **visible** (nunca una nota interna) en un
ticket, se registra automáticamente como la primera respuesta real —
sin que nadie tenga que marcarlo a mano.

## 9. Cómo se reabre un ticket

La empresa (cualquier miembro) o el equipo de soporte pueden reabrir un
ticket que esté **resuelto** o **cerrado** — vuelve a «Abierto» y queda
registrado en el historial de estado del ticket, con quién lo reabrió y
cuándo.

## 10. Qué puede hacer una empresa suspendida o cancelada

Con la cuenta suspendida o cancelada (Sprint 10A), la regla general es
modo solo lectura — pero el Centro de soporte tiene una excepción
controlada, precisamente para poder pedir ayuda:

- Puede **crear tickets nuevos** solo de categoría **Cuenta / acceso** o
  **Plan / límites** — para pedir ayuda a reactivarse.
- Puede **responder tickets ya existentes**, de cualquier categoría, sin
  ninguna restricción.
- No puede crear tickets técnicos nuevos (Trazabilidad, Evidencias,
  TrazaDocs, etc.) mientras la cuenta esté suspendida o cancelada — esta
  regla se exige tanto en la aplicación como directamente en la base de
  datos, así que no hay forma de saltársela.

## 11. Qué ve el superadministrador

Desde `/platform/support`, todos los tickets de todas las empresas, con
filtros por estado, categoría, prioridad, empresa y vencidos. Desde el
detalle de cada ticket (`/platform/support/[id]`): datos de la empresa
(incluido su plan), conversación completa (mensajes visibles y notas
internas), historial de estado, y acciones para asignar, cambiar estado,
cambiar prioridad, responder y agregar notas internas. El detalle de
empresa (`/platform/organizations/[id]`) también muestra un resumen de
sus tickets: abiertos, vencidos, en proceso y el más reciente.

## 12. Qué pasó con el feedback anterior

**No se perdió nada.** Cada registro de `implementation_feedback` con
autor conocido quedó convertido en un ticket real, enlazado a su origen
— visible en el Centro de soporte con su categoría, prioridad y estado
equivalentes. La tabla original de feedback nunca se borró ni se
modificó; sigue existiendo tal cual. La página `/implementation/feedback`
ahora muestra un aviso invitando a usar el Centro de soporte, sin romper
ningún enlace que ya apuntara ahí.
