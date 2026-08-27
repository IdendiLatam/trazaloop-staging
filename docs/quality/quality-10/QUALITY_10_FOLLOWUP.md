# QUALITY-10 · Seguimiento

## 1 · Dos capas, y por qué

```
EL ACTA                          EL SEGUIMIENTO
foto congelada                   estado vivo
lo que la dirección revisó       qué sigue abierto AHORA
y decidió aquel día              del motor de acciones

no cambia nunca                  cambia cada día
```

Colapsarlas tiene un coste concreto: si el acta se actualizara sola, dejaría de
poder usarse como prueba de qué se revisó. Y si el seguimiento se congelara,
haría falta reabrir la revisión para saber cómo va una acción.

## 2 · Cerrar no cierra las acciones (§48, §83)

`quality_mr_close_review` exige:

- que **no queden entradas pendientes** —una faltante está revisada; una
  pendiente no—;
- que **ninguna entrada preparada o faltante siga sin análisis**;
- que haya **al menos una decisión** —una revisión sin decisiones no es una
  revisión: es una presentación—;
- conclusiones escritas y una nota de cierre.

Y **no** exige que las acciones estén terminadas. Exigirlo produce revisiones
abiertas durante años por una acción de nadie. Lo que sí exige es **decir** qué
queda (`followup_note`).

**Verificado** (`test:quality10-rls` I1–I5): no se cierra con entradas sin
mirar; sí se cierra con una acción abierta; y cerrar no cerró ninguna acción.

## 3 · El seguimiento, en vivo

`quality_mr_followup(review_id)` recorre las decisiones de la revisión, resuelve
sus acciones por `work_references` y devuelve el estado **de ahora**: abiertas,
completadas, canceladas, vencidas, eficaces, no eficaces y pendientes de
verificar eficacia, con el detalle acción por acción.

Es `stable`: no escribe nada.

**Verificado** (I8–I9): tras cerrar, una acción pasa a completada y luego a
eficaz. El acta no cambia; el seguimiento dice 1 decisión, 2 acciones, 1
completada, 1 eficaz y 1 abierta.

## 4 · La pantalla transversal

`/quality/management-review/followup` responde a una pregunta: **de todo lo que
la dirección decidió, ¿qué sigue abierto hoy?** Por revisión y decisión por
decisión.

Y lo dice con todas las letras:

> Una revisión cerrada con acciones abiertas es una situación NORMAL. Exigir que
> todas estén terminadas para poder cerrar produce revisiones abiertas durante
> años por una acción de nadie.

## 5 · La revisión siguiente hereda el seguimiento (§19, §87, RD-12)

`quality_mr_src_previous_actions` es la primera de las catorce entradas. Busca
las revisiones **cerradas con periodo anterior** al de esta, resuelve sus
decisiones, y de ahí sus acciones por el motor de referencias.

Responde: abiertas, completadas, canceladas, vencidas, eficaces, no eficaces y
pendientes de verificar.

Y **no las copia**: se leen del motor de acciones cada vez. No existe
`quality_management_review_actions`.

**Verificado** (`test:quality10-rls` J1–J3): la revisión del año B ve las dos
acciones que dejó la del año A, con su estado correcto; no se duplicaron —siguen
siendo dos acciones en total—; y la revisión del año A no se ve a sí misma como
anterior.

## 6 · Los avisos (§44, §94)

Seis tipos, todos idempotentes y ninguno decide nada:

| Aviso | Cuándo |
|---|---|
| `management_review_due` | La próxima revisión está a menos de 30 días |
| `management_review_input_pending` | Una revisión en curso sigue con entradas sin mirar |
| `management_review_overdue` | El periodo terminó hace más de 90 días y sigue sin cerrarse |
| `management_review_action_overdue` | Una acción decidida por la dirección venció |
| `management_review_source_updated` | Reservado para QUALITY-11 |
| `management_review_followup_pending` | Reservado para QUALITY-11 |

`quality_scan_management_reviews` devuelve **lo que ha creado en esta pasada**,
no cuántos avisos hay. Una segunda pasada seguida devuelve 0, y eso es
exactamente lo que significa idempotente.

**Verificado** (M1–M2): dos pasadas, los mismos avisos; la segunda devuelve 0; y
el barrido no cerró ninguna revisión ni decidió nada.
