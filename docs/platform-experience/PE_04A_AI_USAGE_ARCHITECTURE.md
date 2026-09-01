# PE-04A · Inteligencia: lo que se mide y lo que se vende

---

## 1 · Hoy: los límites de IA NO dependen del plan

Es el hallazgo más importante de esta parte, y hay que decirlo sin rodeos:
`intelligence_effective_limits()` **no lee `plan_code` ni `access_mode` ni una
sola vez**. Cada empresa recibe los mismos valores por defecto.

### Los dos motores que existen, y se solapan

| | `intelligence_usage_limits` | `quality_ai_settings` |
|---|---|---|
| Ámbito | Empresa | Empresa |
| Ventanas | minuto **60** · hora **600** · mes **10 000** · concurrencia **8** | mes **500** · **día por persona 50** |
| Dónde se aplica | `intelligence_usage_guard()` | `quality_ai_start_run()` |
| Excepciones | `intelligence_limit_overrides`, con motivo y vigencia | ninguna |
| Origen | Protección operativa | Configuración del módulo |

**Dos techos mensuales distintos** —10 000 y 500— que nadie concilia. El que
manda en la práctica es el más bajo del camino que se recorra.

> **Hallazgo.** Antes de colgar el plan de esto hay que decidir cuál de los dos
> es el contador comercial. Añadir un tercero sería el peor resultado posible.

---

## 2 · La separación que hace falta

El encargo la nombra y es exactamente la correcta:

| | LÍMITE DEL CLIENTE | GUARDA DE COSTE |
|---|---|---|
| Para quién | El cliente | Trazaloop |
| Unidad | **Consultas al mes** | Tokens, coste, concurrencia |
| Visible | Sí, en la pantalla de uso | **No.** Nunca |
| Viene de | La revisión del plan | Configuración operativa |
| Al alcanzarlo | «Alcanzaste el límite de tu plan» | «El servicio está saturado» |
| Cambia | Por decisión comercial | Por decisión operativa |

**El cliente entiende «40 consultas al mes».** No entiende «800 000 tokens», y
enseñárselo lo obliga a aprender una unidad que no es suya. El contador interno
sigue siendo por token y por coste, porque es lo que de verdad se gasta.

Los dos existen a la vez y **ninguno sustituye al otro**: Full con una guarda de
coste sigue teniendo guarda. Que un plan sea de pago no significa gasto
ilimitado.

> **PEC-09.** Dos medidores. El comercial, en consultas al mes, sale de la
> revisión del plan. El de coste, en tokens y dinero, es operativo y **nunca**
> se enseña al cliente.

---

## 3 · Fallar bien: cuatro cosas distintas

Hoy `intelligence_usage_guard` ya distingue cinco razones —`rate_limited_minute`,
`rate_limited_hour`, `too_many_concurrent`, `monthly_cap`, y permitido— y eso es
una base excelente. Lo que falta es que la **capa comercial** no las aplaste.

| Situación | Qué se dice | Qué NO se puede decir |
|---|---|---|
| Cuota comercial agotada | «Alcanzaste las N consultas de tu plan este mes. Se reinicia el 1.» | — |
| Muchas a la vez | «Hay varias consultas en curso. Espera unos segundos.» | «tu plan» |
| El proveedor no responde | «El servicio de IA no está disponible ahora.» | **«tu plan»** |
| La IA está apagada | «Tu empresa no tiene la IA activada.» | «límite» |
| Fallo del sistema | «No se pudo completar. Inténtalo de nuevo.» | «tu plan» |

Decir «alcanzaste tu límite» cuando falló el proveedor es una mentira que empuja
a comprar algo que no hacía falta. Es la misma regla que PE-03 aplicó a los
vídeos: **sin dato no es cero**; aquí, **fallo no es cuota**.

> **PEC-10.** Cuota agotada, servicio caído, función apagada y error del sistema
> son cuatro estados con cuatro mensajes. Ninguno se disfraza de otro.

---

## 4 · La ventana mensual y la zona horaria

`intelligence_usage_guard` usa `date_trunc('month', now() at time zone 'UTC')`.
`quality_ai_start_run` usa `date_trunc('day', now())` — **la zona de la sesión de
base de datos**, que no es lo mismo.

Dos ventanas, dos zonas, ningún acuerdo. Ver
[PE_04A_DAILY_USE_ARCHITECTURE.md](PE_04A_DAILY_USE_ARCHITECTURE.md) §4.

---

## 5 · Producción no tiene IA, y da igual

Producción históricamente no tiene proveedor de IA configurado. **Eso no cambia
nada de este diseño**: PE-04 define a qué tiene derecho una empresa, no si el
proveedor está desplegado.

Una empresa puede tener derecho a 100 consultas al mes en un entorno donde la IA
no está encendida. Lo que ve entonces es «tu empresa no tiene la IA activada» —
el cuarto estado de §3—, no un error de cuota.

---

## 6 · Free y la IA

`quality_ai_settings.is_enabled` es **`false` por defecto**: hoy la IA está
apagada salvo que alguien la encienda. Eso ya es un buen suelo para Free.

Las opciones, y no son técnicas:

| | A favor | En contra |
|---|---|---|
| Free **sin** IA | Coste cero, sin sorpresas | No se ve lo que más impresiona |
| Free con una **cuota pequeña** | Se prueba lo mejor del producto | Coste real, aunque acotado |

**Recomendación técnica:** una cuota pequeña y configurable, no cero. La IA es lo
que hace que alguien entienda qué es Trazaloop, y un Free que no la deja tocar
enseña menos de lo que cuesta. **El número es decisión humana.**

---

## 7 · La economía se protege en todos los planes

Incluso Full y Extra necesitan techo. Un plan de pago no es un cheque en blanco
contra un proveedor que cobra por token.

La arquitectura ya tiene casi todo:

- **Techo de uso razonable** por revisión de plan, configurable.
- **Guarda de coste** operativa, invisible, que ya existe.
- **Observabilidad**: `/platform/intelligence` ya proyecta coste por empresa y
  por flota, y ya señala las que se salen de la media.
- **Excepciones** con motivo y caducidad: `intelligence_limit_overrides` ya lo
  hace bien y es el patrón a copiar.

Lo que falta es **conectar el techo comercial a la revisión del plan** y no
inventar ni un número aquí.

> **PEC-22.** Ningún plan implica gasto de IA sin techo. El techo comercial es
> configurable por revisión; la guarda de coste es operativa y siempre está.
