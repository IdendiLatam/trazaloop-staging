# PE-04B5 · La empresa, vista desde plataforma

## Configurado ≠ efectivo

Se enseñan **por separado**, y es la decisión que evita mentir:

> Base **Free** + prueba de **Full** activa
> · **Configurado**: Free (base) + Full (prueba, hasta el día X)
> · **Efectivo**: Full

Meter las dos en un solo campo obliga a elegir cuál mentir. La tarjeta de plan
efectivo dice además de dónde sale —el catálogo canónico, no la suscripción
heredada— y avisa de que al terminar la prueba la empresa vuelve a su base **sin
que nadie tenga que hacer nada**.

## Qué se muestra

| Bloque | Fuente |
|---|---|
| Plan efectivo | `plan_effective_for_organization` (B2) |
| Asignaciones vigentes, con tipo de concesión y origen | `organization_plan_assignments` |
| Almacenamiento: estado, uso y cuota | `organization_storage_status` (B3) |
| Créditos de Intelligence, mensuales y de prueba | `ai_credits_status` (B4) |
| Uso diario y mensual, y modo consulta | `organization_time_status` (B4) |
| Soporte: reporte técnico y casos usados/restantes | `organization_support_entitlement` (B5) |
| Historia comercial | `commercial_assignment_events` (B5) |

**Ningún número se recalcula aquí.** Todo sale de los resolutores canónicos, los
mismos que aplica el servidor y los mismos que ve el cliente. Dos aritméticas
para el mismo mes es cómo se acaba discutiendo con alguien que tiene razón.

Y no aparece el plan heredado presentado como vigente: la tarjeta legacy que
queda debajo está rotulada como histórica desde PE-04B2, y la cola de soporte
dejó de enseñar `coalesce(plan_code, 'demo')` en 0167.

## Privacidad

El tiempo de uso se enseña **agregado por empresa**. No hay minutos por persona
en ninguna pantalla, y no puede haberlos: la tabla de PE-04B4 no guarda quién.
Ver un ticket tampoco amplía el acceso de soporte al resto de la empresa: cada
lectura sigue acotada por su propia RLS.

## Lo que el cliente ve de lo mismo

En la puerta (`/modules`): plan, prueba si está activa, créditos de Intelligence
—mensuales y de prueba, separados—, tiempo de uso si aplica y el estado de modo
consulta. En `/support`: qué soporte incluye su plan.

Nunca tokens, coste del proveedor ni pesos internos de operación: eso es economía
nuestra. Y ningún control de administración.
