# QUALITY-10 · Decisiones y salidas

> **La afirmación central de este sprint.** Registrar una decisión de la
> dirección deja el número de acciones **exactamente igual**. Y crear dos
> acciones deja el número de decisiones **exactamente igual**.

## 1 · Por qué importa

Un sistema que convierte cada decisión en una acción produce dos daños. Infla el
motor de trabajo con tareas que nadie pidió — y una decisión como «se acepta el
nivel actual del riesgo y se mantiene el control» no necesita ninguna. Y borra
la distinción entre lo que la dirección **resolvió** y lo que alguien **tiene
que hacer**, que es justo lo que un acta existe para separar.

## 2 · El escenario, tal como el encargo lo plantea (§82)

```
La dirección decide:
  «Aumentar la capacidad de inspección del proveedor crítico.»

  Decisiones: 1
  Acciones:   0        ← y es correcto

Después alguien crea dos acciones:
  · Adquirir el equipo de inspección
  · Capacitar al inspector de recepción

  Decisiones: 1        ← sigue siendo una
  Acciones:   2
```

**Verificado contra base real** (`test:quality10-rls` F1–F5), contando antes y
después: registrar la decisión no movió el número de acciones; no creó ninguna
tarea; y crear dos acciones no convirtió la decisión en varias.

## 3 · Cómo se sostiene en el modelo

`quality_management_review_decisions` **no tiene ninguna columna de acción**.
Ni `action_id`, ni `work_action_id`. Una columna solo sabría guardar una, y una
decisión puede tener cinco.

La atadura es `work_references`:

```
owner_kind = 'management_review_decision'
ref_kind   = 'work_action'
```

—el mismo motor de referencias tipadas que valida que las dos puntas sean de la
misma empresa. No hay tabla puente propia, ni motor paralelo (RD-19).

`quality_mr_record_decision` no contiene `insert into work_actions` en ninguna
rama. `quality_mr_create_action_from_decision` es el acto explícito, y es el
único que crea trabajo.

## 4 · Qué conserva una decisión (§39)

| Campo | Por qué |
|---|---|
| `topic` | Sobre qué se decidió |
| `decision` | Qué se resolvió |
| `rationale` | Por qué — lo que hace defendible el acta |
| `expected_result` | Qué se espera que ocurra. **No es la acción que lo consigue** |
| `input_id` | Qué entrada la motivó |
| `owner_position_id` | Qué cargo responde |
| `decided_by`, `decided_on` | El actor histórico |

Y queda también como **hecho formal** en `work_decisions`
(`subject_kind='management_review_decision'`), que es donde vive la historia de
negocio de toda la plataforma. No es `audit_log`: eso son trazas técnicas.

## 5 · Las salidas que el dominio soporta (§40, RD-13)

Nueve clases de decisión, que cubren lo que una revisión por la dirección tiene
que poder producir:

```
improvement · system_change · resource · strategic
objective · risk · opportunity · followup · other
```

Una decisión de clase `resource` es exactamente la necesidad de recursos que la
norma pide registrar; una `system_change`, un cambio al sistema; una
`improvement`, una oportunidad de mejora tomada.

## 6 · La vista que lo hace visible

`v_quality_management_review_decision_actions` pone el número de decisiones y el
de acciones en **columnas distintas**, con abiertas, completadas, vencidas,
eficaces y no eficaces. La pantalla y los PDF imprimen las dos y explican por
qué no coinciden:

> El número de decisiones y el de acciones no coinciden, y no es un error: una
> decisión puede generar cero, una o cinco acciones, y sigue siendo una decisión.

## 7 · Las oportunidades de mejora no se toman solas (§32)

El adaptador `quality_mr_src_improvement` reúne oportunidades de QUALITY-05, de
hallazgos de auditoría clasificados como mejora, de sugerencias de clientes y de
casos. **Ninguna crea una acción.** La dirección decide cuáles se toman, y esa
decisión es un objeto con autor y fecha.
