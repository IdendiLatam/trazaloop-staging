# PE-04A · Decisiones de arquitectura comercial · PEC-01 … PEC-36

Congeladas para PE-04B salvo que el propietario del producto diga otra cosa.
Cada una dice **qué** y **por qué**, y las que dependen de una elección humana
se marcan.

---

## Identidad y catálogo

| | Decisión |
|---|---|
| **PEC-01** | **Identidad estable en `plans`.** `free`, `full`, `extra` son códigos que no cambian. El nombre visible vive en la revisión |
| **PEC-02** | **Revisiones inmutables con vigencia.** Cambiar un precio o un límite crea una revisión; la anterior se cierra. Mismo patrón que 0136, 0155 y 0159 |
| **PEC-03** | **La empresa apunta a una revisión**, no a un código. Ahí está la verdad histórica |
| **PEC-04** | **La asignación admite ámbito de módulo.** «PCR en Full y Textiles en Free» es un caso real que no se puede perder |

## Demo y Free

| | Decisión |
|---|---|
| **PEC-05** | **`free` es un plan persistente.** La prueba es una **concesión temporal de un plan superior** (`grant_kind='trial'`), no un plan. `demo` deja de ser código de plan |
| **PEC-06** | **La autoayuda no es un derecho comercial.** Ningún resolutor se consulta para servir FAQ, ayuda o tutoriales |

## Almacenamiento

| | Decisión |
|---|---|
| **PEC-07** | **Un solo resolutor de cuota** y una sola definición del número. Hoy hay tres |
| **PEC-08** | **Toda vía de subida de cliente pasa por reserva previa.** Hoy falta el logo de empresa |
| **PEC-14** | **Aviso blando antes del muro duro.** Al 80 %, como ya hace la IA |
| **PEC-15** | **Estar por encima del límite es un estado legítimo.** Se muestra, bloquea lo nuevo y no destruye lo viejo |

## Inteligencia

| | Decisión |
|---|---|
| **PEC-09** | **Dos medidores.** El comercial en consultas/mes, desde la revisión; el de coste en tokens y dinero, operativo y **nunca** visible |
| **PEC-10** | **Cuatro fallos, cuatro mensajes.** Cuota agotada, servicio caído, función apagada y error del sistema no se disfrazan |
| **PEC-22** | **Ningún plan implica gasto de IA sin techo**, tampoco los de pago |

## Uso diario

| | Decisión |
|---|---|
| **PEC-23** | **«Uso diario» = operaciones medidas y nombradas**, no tiempo ni sesiones ni acciones genéricas. Limitar «entrar y consultar lo propio» queda descartado |
| **PEC-24** | **El techo comercial es de la organización.** El límite por persona se conserva como reparto interno |
| **PEC-25** | **Las ventanas se calculan en la zona horaria de la empresa.** `business_timezone` sube a la organización |
| **PEC-26** | **El uso se deriva del dato de dominio.** Un contador propio exige justificación |

## Precio

| | Decisión |
|---|---|
| **PEC-13** | **El descuento se aplica sobre el precio.** Jamás crea un plan |
| **PEC-18** | **Los precios son sin impuestos**, en céntimos enteros, y la columna lo dice |
| **PEC-19** | **Los campos públicos salen por una vista pública explícita.** La tabla base no se concede a `anon` |

## Ciclo de vida

| | Decisión |
|---|---|
| **PEC-11** | **Bajar de plan nunca borra datos** |
| **PEC-12** | **La historia comercial se lee de las asignaciones cerradas**, no de un registro de auditoría |
| **PEC-16** | **Publicar es una primitiva.** Nadie escribe `effective_to` a mano |
| **PEC-17** | **Vigencia desde la publicación.** Sin programación diferida hasta que haya caso |
| **PEC-20** | **PE-04 conserva `active`/`suspended`/`cancelled`.** Los estados de cobro los trae PE-05 |
| **PEC-21** | **Toda excepción es una asignación con motivo y vigencia.** No existe la excepción silenciosa |
| **PEC-30** | **El estado administrativo de la cuenta es un eje independiente del plan** |
| **PEC-36** | **Ninguna transición comercial borra datos de negocio** |

## Soporte

| | Decisión |
|---|---|
| **PEC-27** | **Reportar un fallo del producto es derecho de todos los planes**, Free incluido |
| **PEC-28** | **El objetivo de respuesta es interno.** PE-04 no crea compromisos contractuales |
| **PEC-29** | **Asesor es un complemento con vigencia, no un plan.** PE-04 registra el derecho; no gestiona la prestación |

## Seguridad

| | Decisión |
|---|---|
| **PEC-31** | **Plan y permiso no se sustituyen.** Toda operación pasa por los dos |
| **PEC-32** | **Las comprobaciones de plan en políticas van por `security definer`** — lección de 0141 |
| **PEC-33** | **Todo límite duro con coste real necesita reserva atómica** |
| **PEC-34** | **El resolutor devuelve tres respuestas**: el plan, «sin derecho» y `ENTITLEMENT_UNAVAILABLE`. La tercera deniega y **no se muestra como un plan** |
| **PEC-35** | **Un solo número.** Superadministrador, cliente y servidor leen del mismo resolutor |

---

## La frontera con PE-05

| PE-04 | PE-05 |
|---|---|
| Catálogo, revisiones, precios **guardados** | Página pública de precios |
| Asignación y entitlement efectivo | Pasarela, checkout, cliente de pago |
| Límites y su aplicación | Cupones y descuentos |
| Uso y su medición | Facturación anual, impuestos |
| Consola de superadministrador | Estados de cobro (`past_due`, `grace`) |
| Que un precio se pueda **mostrar** | Que un precio se pueda **cobrar** |

**La regla:** PE-04 termina donde empieza el dinero que se mueve. Guardar «USD
40 sin impuestos» es PE-04; cobrarlos es PE-05.
