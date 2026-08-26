# QUALITY-07 · La decisión de aprobación

> **GP-07 · GP-08 · GP-12 · GP-19 · MDR-49 · §13…§15, §36**

## 1 · Aprobado ¿para qué?

Es la pregunta que sostiene todo el dominio, y la razón de que no exista ninguna
columna `is_approved` en el proveedor.

La decisión se toma sobre un **alcance** —sede × categoría— y solo vale para él.
En la ficha, la columna «Aprobación» nunca aparece sin la columna «Alcance» al
lado; una prueba estática comprueba el orden. En los PDF, ninguna cabecera dice
«proveedor aprobado»: dicen el alcance.

## 2 · Cinco decisiones, y solo tres aprueban

| Decisión | ¿Aprueba? |
|---|---|
| `approved` | sí |
| `conditionally_approved` | sí, con condiciones **obligatorias** |
| `reinstated` | sí — vuelve a habilitar tras una suspensión |
| `rejected` | no |
| `suspended` | no |

Una condicionada sin condiciones se rechaza en la RPC y en la acción de
servidor: una aprobación condicionada que no dice cuáles son las condiciones es
una aprobación a secas con una palabra tranquilizadora delante.

## 3 · Lo que exige el registro

```
quality_supplier_approval_decisions
  scope_id       not null   ← para qué
  decision       not null
  rationale      not null   ← en qué se basa
  conditions                ← obligatorias si es condicionada
  effective_from not null
  valid_until               ← nulo = sin fecha límite
  evaluation_id             ← la evaluación que la informó, si la hubo
  decided_by, decided_at
  superseded_by             ← qué decisión la reemplazó
```

`rationale not null` no es burocracia. Es lo único que hace que la decisión
siga siendo comprensible cuando quien la tomó ya no está.

## 4 · No se edita: se sustituye

`quality_supplier_decision_is_immutable` rechaza cualquier `update` sobre el
contenido de una decisión (MDR-49). Decidir otra cosa es **decidir otra vez**:
la RPC marca la anterior con `superseded_by` y la nueva queda vigente. Las dos
se conservan, porque la anterior explica qué se creía y por qué en su momento.

`quality_supplier_approval_on(org, scope, fecha)` responde qué estaba decidido
en cualquier día, con un `was_valid` que distingue «estaba aprobado» de «había
una decisión de aprobación que ya había caducado».

## 5 · Quién decide

| Rol | Administra el dominio | Decide la aprobación |
|---|---|---|
| `admin` | sí | **sí** |
| `quality` | sí | **sí** |
| `consultant` | sí | **no** |

GP-07 · Homologar es responsabilidad de la empresa. El consultor externo
acompaña la implantación, registra, evalúa y propone; no decide de quién se
compra. La regla vive en tres capas y las tres se comprueban:

- `canDecideSupplierApproval` en el dominio;
- el guard de la acción de servidor;
- `quality_decides_supplier_approval` en la base, más una política RLS que solo
  concede `select` sobre la tabla de decisiones, de modo que ni siquiera un
  `insert` directo funciona.

## 6 · GP-08 · La lista de proveedores aprobados se DERIVA

`v_quality_approved_supplier_list` no es una tabla que alguien mantiene: sale de
las decisiones vigentes, filtrando las caducadas. No puede quedarse
desactualizada, y no se puede añadir a nadie sin decidirlo.

Una aprobación con `valid_until` en el pasado deja de contar como vigente
aunque nadie la haya tocado. Decir lo contrario sería dar por bueno algo a lo
que la propia empresa le puso fecha de revisar.

## 7 · Suspender un alcance no toca los demás

La suspensión se decide sobre un alcance. Los otros alcances del mismo proveedor
siguen exactamente como estaban, y el mensaje que devuelve la acción lo dice:

> «Suspensión registrada para ESTE alcance. Los demás alcances del proveedor no
> cambian.»

La prueba I1 de la suite RLS lo demuestra con dos alcances del mismo proveedor.
