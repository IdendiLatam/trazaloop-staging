# ENTITLEMENT-CONVERGENCE-01 · Dos verdades sobre el acceso a un módulo

**Estado:** deuda registrada. No se aborda en PROD-LAUNCH-01D.4A.

## El problema

Hoy conviven dos fuentes sobre si una empresa puede usar un módulo:

| | Qué es | Quién la escribe | Quién la lee |
|---|---|---|---|
| `organization_plan_assignments` | el modelo **canónico** (0162/0163): qué plan se compró, qué módulos se concedieron, con qué vigencia | `commercial_apply_assignment`, desde cada liquidación | el catálogo de planes y los límites |
| `organization_modules` | la tabla **operativa** (0100): `enabled`, `access_mode`, `access_expires_at` | administración, alta de empresa, y —desde 0194— la proyección | **la puerta de acceso** (`getOrganizationModuleAssignment` → `resolveModuleAccess`) |

0163 cerró esta duplicidad para el **plan**: desde entonces el plan sale del
modelo canónico y la suscripción legacy ya no manda. Para el **acceso a
módulos** nunca se cerró.

## Lo que costó

El primer pago real de Trazaloop lo encontró. La liquidación concedió en el
modelo canónico —tres módulos en `sold`— y no tocó `organization_modules`, que
seguía en `demo` vencido. La empresa pagó 157 080 COP, la pantalla de plan dijo
«Tu plan está activo», y al entrar a Quality se encontró en solo consulta.

## Lo que se hizo en 0194

`organization_modules` pasa a tratarse como una **proyección** del modelo
canónico, no como una segunda decisión comercial:

- `billing_project_module_access(org)` la recalcula desde las concesiones
  vendidas vigentes y el periodo liquidado más lejano;
- dos disparadores la ejecutan cuando cambia lo canónico, en la misma
  transacción que reconoce el dinero;
- la regla de acceso pasó a mirar el vencimiento de `full`/`extra`, que antes
  ignoraba, para que el acceso termine con el periodo pagado sin ningún cron.

Es un arreglo, no una convergencia: sigue habiendo dos tablas y una copia entre
ellas.

## Lo que falta

Que el acceso a módulos se derive de **un solo** modelo de derechos, y que la
proyección desaparezca. Mientras exista la copia:

- cualquier escritura directa en `organization_modules` que no pase por la
  proyección puede desviarse de lo canónico y nadie se entera;
- hay dos sitios donde mirar cuando algo no cuadra;
- una tercera vía de concesión que se añada mañana tendrá que acordarse de las
  dos.

Cuando se aborde, dos cosas a cuidar:

1. **El acceso concedido a mano por administración** (`assignment_source =
   'superadmin'`, sin vencimiento) tiene que sobrevivir a la unificación: no
   todo acceso viene de un pago.
2. **`core`** no es funcional y no se compra; hoy queda fuera de la proyección
   por `is_functional`. Cualquier modelo único tiene que seguir dejándolo fuera.
