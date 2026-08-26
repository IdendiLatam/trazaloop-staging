# QUALITY-07 · Criticidad

> **GP-05 · GP-20 · §9…§12**

## 1 · La confusión que este modelo existe para evitar

**Criticidad ≠ desempeño.**

Un proveedor crítico puede llevar cuatro años sin un solo incumplimiento y
seguir siendo crítico. Uno que falla cada mes puede ser perfectamente
prescindible. La criticidad mide **cuánto daño haría que fallara**; el desempeño
mide **cómo lo ha hecho**. Mezclarlas produce dos errores simétricos y ambos
caros: relajar el control sobre un proveedor crítico porque «va bien», y
someter a un proveedor irrelevante al régimen de uno crítico porque tuvo un mal
trimestre.

La comprobación estructural: `quality_supplier_criticality_assessments` **no
tiene** ninguna columna que apunte a una evaluación. La prueba C3 de
`test:quality07` lo verifica leyendo el cuerpo de la tabla, y la pantalla lo
dice con todas las letras donde se clasifica.

## 2 · Se reutiliza el motor de QUALITY-05

No se construyó un segundo motor de metodologías. Se ensanchó el que ya existía:

```sql
check (applies_to in ('risk', 'opportunity', 'supplier_criticality'))
```

Con eso, la criticidad de proveedores hereda gratis todo lo que QUALITY-05 ya
resolvió y que habría que haber vuelto a escribir:

- escalas y niveles definidos **por la empresa**, no por el producto;
- versionado con vigencia, así que reclasificar en 2027 con otra metodología no
  recalcula 2026;
- `quality_derive_level`, con su rastro de derivación;
- y las **bandas de resultado**, que es donde está el detalle que importa.

La constante `METHODOLOGY_SCOPES` de `lib/domain/risks.ts` se ensanchó en
paralelo: sin eso el alcance existiría en la base pero la pantalla de
metodologías no lo ofrecería, y el motor sería inalcanzable.

## 3 · GP-20 · La criticidad modula la frecuencia de revisión

Una banda de resultado de QUALITY-05 ya lleva `review_months`. Al reutilizar el
motor, GP-20 se cumple **sin una sola columna nueva**:

```
Nivel «Crítico»  → review_months = 6   → next_review_on = última evaluación + 6 meses
Nivel «No crítico» → review_months = 24
```

`quality_assess_supplier_criticality` lo aplica al perfil del proveedor cuando
la banda lo declara. Si la empresa no declara meses en su banda, la cadencia
configurada del proveedor se respeta: el motor no inventa una política que nadie
aprobó.

La prueba E2 de la suite RLS lo demuestra de punta a punta: clasificar un
alcance como «Crítico» deja el perfil en 6 meses.

## 4 · La clasificación es un hecho fechado

```
quality_supplier_criticality_assessments
  scope_id      ← el alcance, no el proveedor
  version_id    ← la versión de metodología que la produjo
  score, level_id, level_label, review_months
  derivation    ← el rastro completo, en jsonb
  assessed_on, rationale, decided_by
```

Y `quality_supplier_criticality_factors` guarda **qué valor se escogió en cada
dimensión**. Sin eso, «3» sería un número sin defensa; con eso, la clasificación
dice «impacto alto · sustituibilidad baja» y se puede discutir.

Un disparador `before update` la hace inmutable (GP-30). Reclasificar es
clasificar otra vez, y la anterior se conserva: `quality_supplier_criticality_on`
responde qué nivel regía en cualquier fecha.

> **Un defecto real, encontrado por la suite.** La primera versión leía los
> identificadores de los factores del rastro de la derivación. Ese rastro está
> pensado para LEERSE —código, etiqueta, valor y peso— y no lleva
> identificadores, así que los factores se escribían con `scale_id` nulo y la
> tabla los rechazaba. Se corrigió escribiéndolos desde los niveles elegidos.
> Ver `QUALITY_07_TEST_MATRIX.md` §5.

## 5 · Lo que la criticidad NO hace

- No aprueba ni suspende a nadie. La prueba E3 comprueba que clasificar no crea
  ninguna decisión de aprobación.
- No abre un riesgo. Un alcance crítico sin aprobación vigente produce una
  **señal** (`critical_without_approval`), que es una invitación a mirar, no un
  registro de riesgo que nadie decidió abrir.
- No ordena a los proveedores en un ranking. No hay ninguna consulta que los
  numere por criticidad; hay una columna que dice el nivel de cada alcance.
