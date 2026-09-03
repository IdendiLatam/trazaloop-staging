# PE-05B2 · El flujo pendiente, probado · y por qué el pagador sigue bloqueando

## La corrección de interpretación, aceptada

El `401 · causa 300` de `POST /v1/customers` **no demuestra** que el token sea
de clase producción. Se reclasifica:

**`CUSTOMER_API_TEST_COMPATIBILITY = REJECTED_OR_INCONCLUSIVE`**, y **no se
extrapola** a `/preapproval`.

Por eso **no se implementó** la regla propuesta en el informe anterior. Habría
sido una inferencia incorrecta en las dos direcciones: ni `APP_USR` implica
producción, ni un dueño de prueba implica credencial de prueba. El
endurecimiento se queda como está, y la API de Clientes sale del camino
crítico: Mercado Pago aclaró que no es prerrequisito de `/preapproval`.

## El modelo documentado, verificado antes de llamar

Documentación oficial actual de *Suscripciones → Sin plan asociado → Con pago
pendiente*, confirmada en dos dominios:

```json
{
  "reason": "…", "external_reference": "…",
  "payer_email": "test_payer@example.com",
  "auto_recurring": { "frequency": 1, "frequency_type": "months",
                      "transaction_amount": 10, "currency_id": "BRL" },
  "back_url": "…", "status": "pending"
}
```

`status: "pending"`, **sin** `card_token_id`, **sin** `preapproval_plan_id`, y
el comprador completa después por un enlace. Es exactamente el modelo que
Trazaloop necesita, y el que se probó.

## Lo que se envió

Una sola llamada, con el fixture del ejemplo oficial como pagador —que no es la
identidad de nadie: ni contacto de facturación, ni cuenta de Mercado Pago, ni
el comprador de prueba—:

```
reason              Trazaloop FULL monthly (QA sandbox)
external_reference  <uuid opaco del intento>
payer_email         test_payer@example.com   ← ejemplo de la documentación
back_url            …/billing/return
status              pending
auto_recurring      frequency 1 · frequency_type months
                    transaction_amount 190400 · currency_id COP
```

Importe calculado por B1: USD 40 × 4 000 = 160 000 + 19 % = **190 400 COP**.
Ninguna cifra escrita a mano, ninguna cifra del navegador.

Credencial: la de *Pruebas → Credenciales de prueba*, huella `b26cd64d18`,
dueño `test_user` en `MCO`/`CO`.

## La respuesta

```
http=400 | message=Payer is associated with a different site
```

## Lo que enseña, que es más de lo que parece

`test_payer@example.com` es un dominio de ejemplo y aun así el proveedor no
dice «correo inválido»: dice **«el pagador pertenece a otro sitio»**. La misma
respuesta que dio `test@testuser.com` en el primer intento de todos.

De ahí se sigue una regla que hasta ahora era conjetura y ahora es observación:
**`payer_email` tiene que ser un usuario de Mercado Pago existente y del sitio
MCO.** Los valores de ejemplo de la documentación son marcadores pensados para
otros sitios, no direcciones utilizables en Colombia.

Y eso devuelve el problema exactamente al mismo sitio: hace falta el correo
real del **comprador de prueba MCO**, que Mercado Pago no expone ni por API ni
por panel.

Una sola llamada, y parada. No se probaron variantes.

## Estado

| | |
|---|---|
| `MONTHLY_PENDING_PREAPPROVAL` | no verificado |
| `MONTHLY_RECURRENCE` | no verificado |
| `ANNUAL_RECURRENCE` | **sigue sin poder preguntarse** — el pagador se valida antes que la recurrencia |
| Artefactos en el proveedor | **0** · `PreApproval.search` → `total: 0` |
| Candidato para autorización humana | ninguno · sin `init_point` |

## La tasa de QA, cerrada otra vez

El mensual falló, así que la vigencia nueva se cerró en el acto, como pedía el
encargo. **Dos vigencias históricas cerradas**, ninguna reescrita,
`billing_resolve_fx` devuelve `no_active_rate` y los **siete** presupuestos
conservan el tipo con el que se calcularon.

## Lo que no cambió, y no debe cambiar

Crear un preapproval **no** activa Full. Volver del navegador **no** activa
Full. Un preapproval autorizado **no** es, por sí solo, un pago aprobado. La
activación sigue dependiendo de evidencia de pago aprobado verificada en el
servidor.
