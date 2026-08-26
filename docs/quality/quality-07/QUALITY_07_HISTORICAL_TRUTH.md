# QUALITY-07 · Verdad histórica

> **GP-14 · GP-15 · §60, §72, §77**

## 1 · Tres preguntas que no se responden mirando hoy

| Pregunta | Función |
|---|---|
| ¿Qué aprobación tenía este alcance el 15 de marzo? | `quality_supplier_approval_on(org, scope, fecha)` |
| ¿Qué criticidad tenía entonces? | `quality_supplier_criticality_on(org, scope, fecha)` |
| ¿Qué se le exigía entonces? | `quality_supplier_requirements_on(org, scope, fecha)` |

Las tres devuelven lo que regía **ese día**, no lo de hoy. Y las tres
distinguen «no había decisión» de «había una decisión negativa», que no es lo
mismo: lo primero significa que todavía no se había decidido.

## 2 · Subir el listón no vuelve incumplido el pasado

Es el escenario que hace falta que funcione bien: en agosto la empresa decide
exigir certificación ISO a la categoría «materia prima». Una evaluación de
marzo **no** pasa a estar incumplida.

Lo hace posible que la exigencia viva en la **asignación**, no en el requisito:

```
quality_supplier_requirement_assignments
  requirement_id
  category_id XOR scope_id    ← o a una categoría entera, o a un alcance
  effective_from  not null
  effective_to                ← retirar es poner fecha, no borrar
```

Retirar un requisito lo retira **desde esa fecha**. La asignación anterior se
conserva y `quality_supplier_requirements_on` la sigue devolviendo para las
fechas en que estuvo vigente.

## 3 · Cada evaluación con sus criterios

`quality_supplier_evaluations.version_id` ata la evaluación a la versión de
plantilla con la que se hizo, y los criterios cuelgan de la versión. Publicar
una versión nueva no reescribe ni una evaluación anterior — la prueba D1 de la
suite RLS publica una v2 con un criterio nuevo y comprueba que la evaluación
de la v1 conserva su puntuación, su versión y sus tres criterios.

## 4 · Cada clasificación con su metodología

`quality_supplier_criticality_assessments.version_id`, más el rastro completo de
la derivación en `derivation`. Cambiar hoy la metodología no recalcula 2026,
porque 2026 sigue señalando la versión de 2026.

## 5 · Qué NO se puede reconstruir, y se dice

Tres documentos declaran `HISTORICAL_NOT_SUPPORTED` con su motivo, porque
fabricar un pasado que la base no guarda es peor que admitir que no se guarda:

| Documento | Por qué |
|---|---|
| Ficha de proveedor | reúne la situación vigente de cada alcance; para una fecha están la decisión y la evaluación, que sí conservan su versión |
| Reevaluaciones pendientes | la fecha de revisión se **deriva** de la última evaluación y la cadencia vigentes; no se guarda cada valor calculado |
| Informe de desempeño | agrega evaluaciones e incidentes hasta hoy; cada evaluación por separado sí es del pasado |

`HISTORICAL_NOT_SUPPORTED` **nunca** significa que falte el PDF actual. Los tres
existen y se descargan; lo que no hacen es presentarse como documentos de una
fecha que no pueden probar.

## 6 · Y las que sí son del pasado

Cinco claves con `temporality: "historical"`:

- `quality.supplier-evaluation.detail` — sus criterios y pesos son los de su
  versión;
- `quality.supplier-criticality.detail` — su metodología y sus factores;
- `quality.supplier-approval.detail` — el acto formal, inmutable;
- `quality.supplier-approval.historical` — qué estaba decidido en una fecha
  concreta, con la fecha como filtro;
- (y `quality.approved-supplier.list`, que se deriva de esas decisiones y remite
  a ellas).
