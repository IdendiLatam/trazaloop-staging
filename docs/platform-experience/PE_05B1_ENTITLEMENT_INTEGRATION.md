# PE-05B1 · Del pago al derecho

## Los tres ejes siguen separados

| | Quién manda |
|---|---|
| Lo que la empresa **tiene** | PE-04 · `organization_plan_assignments` |
| Lo que la empresa **ha pagado** | PE-05 · `billing_subscriptions` y `billing_payments` |
| Lo que una persona **puede hacer** | rol y RLS |

Comprobado en las dos direcciones: un pago **rechazado** existe sin suscripción y
sin derecho; y el derecho existe **sin pago** —el suelo Free y la prueba siguen
ahí—.

## PE-04 sigue siendo la autoridad

La activación no escribe asignaciones a mano ni toca `organization_subscriptions`.
Llama a `commercial_apply_assignment` —el núcleo extraído de 0168— con
`grant_kind = 'sold'` y `source = 'checkout'`, los dos valores que PE-04B1 dejó
preparados en el enum sin usar.

**No hay un segundo resolutor de plan efectivo.** Tras un pago verificado, el
plan efectivo lo sigue diciendo `plan_effective_for_organization`, y las cinco
lecturas de PE-04 —plan, almacenamiento, Intelligence, tiempo y soporte— cambian
solas porque leen de ahí.

## Una extracción, no una copia

La facturación necesitaba exactamente lo que 0168 arregló: cerrar la concesión
anterior antes de abrir la nueva. **Copiarlo habría sido repetir el error que
0168 vino a corregir**, así que se extrajo a `commercial_apply_assignment`, que
no se concede a nadie: solo la llaman otras funciones `security definer`.

Las 18 comprobaciones de transición de PE-04B6 siguen en verde después de la
extracción, que era la condición para darla por buena.

## Alcance

Al activar, el nivel se aplica a **cada módulo funcional habilitado**. Un módulo
habilitado más tarde **hereda** el nivel pagado sin comprar otra vez y sin una
segunda suscripción: `commercial_provision_new_module` llama a
`billing_apply_tier_to_module` al final.

Y dos cosas que no pasan, comprobadas:

- **Pagar no concede acceso** a un módulo que la empresa no tiene habilitado.
- **`core` nunca recibe plan comercial**: si lo recibiera, toda empresa
  resolvería a ese plan y el nivel dejaría de significar nada. Es el hallazgo de
  PE-04B1, respetado también desde aquí.

## Lo heredado sigue sin mandar

`organization_subscriptions` no se lee ni se escribe en ningún camino de
facturación. Su comentario en el esquema lo dice, y hay una comprobación que
verifica que el plan efectivo no sale de ahí.
