# PE-05B1 · Tratamiento fiscal

## La política de lanzamiento, congelada

| | |
|---|---|
| Full | **19 % IVA** |
| Extra | **19 % IVA** |
| Acompañamiento | **19 % IVA** |
| Free | USD 0 · no hay cobro imponible |
| Prueba | no hay cobro |

El SaaS autogestionable **podría** llegar a estar exento, pero hoy no lo está:
falta el autodiagnóstico, el visto bueno contable y la aprobación de MinTIC.
Lanzar exento sin eso sería dejar de cobrar un impuesto que hay que cobrar.

**No se sembró ninguna regla al 0 %**, ni siquiera en borrador. La arquitectura
la admite; el lanzamiento no la tiene.

## El impuesto se resuelve por CLASE DE SERVICIO

`billing_service_classes`:

| Clase | Qué es |
|---|---|
| `self_service_saas` | Free, Full y Extra. El cliente se sirve solo |
| `professional_advisory` | Acompañamiento. Hay horas de un especialista dentro |

Es una **tabla**, no una cadena comparada por el código: comparar textos sueltos
es exactamente cómo un día alguien escribe `self_service` en un sitio y
`selfservice` en otro, y el impuesto se resuelve mal.

Y es la pieza que impide el arrastre: una futura exención del SaaS
autogestionable **no** le quita el IVA al trabajo de una persona. Hay una prueba
que lo comprueba pidiendo el impuesto del servicio profesional en una fecha
posterior a la exención: sigue en 19 %.

## Vigencia y aprobación

Cada regla tiene `effective_from`, `effective_to` opcional y un estado —
`draft`, `active`, `retired`—. Solo una regla **activa y vigente en ese
instante** resuelve.

Una regla `active` **exige** constancia de aprobación: hay un `check` que la
obliga a tener `approval_reference` y `approved_at`. Cobrar —o dejar de cobrar—
un impuesto sin dejar dicho quién lo autorizó es lo que después nadie sabe
explicar.

Metadatos: referencia de aprobación, nota, quién y cuándo. **No es un flujo
burocrático** y **no guarda documentos**: si algún día hace falta adjuntar el
respaldo, TrazaDocs ya existe y no se construye un cuarto motor de evidencia.

## Falla cerrado

> Sin regla fiscal vigente, **no se cobra**.

Ni 0 % —dejaríamos de cobrar un impuesto— ni 19 % —cobraríamos uno que quizá no
toca—. `billing_resolve_tax_rule` devuelve `unavailable` y el presupuesto se
detiene con `TAX_RULE_UNAVAILABLE`.

Es imposible que un presupuesto de Full salga al 0 % por una fila que falte, un
`null`, un valor por defecto de la interfaz o un fallo del resolutor: no hay
ninguna rama que, ante la duda, deje de cobrar.

## Cada cobro lleva su propia foto

Presupuesto y pago guardan **la regla, el tipo y el importe** que se aplicaron.
No solo el porcentaje: la **referencia a la regla**, que es lo que explica por
qué a una empresa se le aplicó y a otra no.

Y una regla que **ya se aplicó** a un cobro no cambia de significado económico:
un disparador lo impide y obliga a publicar una sucesora. Misma idea que las
revisiones inmutables de PE-04B1 y que el peso aplicado del libro de créditos de
PE-04B4.

## Aritmética

Tipos en **puntos básicos enteros** (1900 = 19,00 %). Importes en enteros.
Conversión y redondeo en `numeric`, nunca en coma flotante: 0,19 no existe
exactamente en binario, y un céntimo que baila es un cliente que escribe.
