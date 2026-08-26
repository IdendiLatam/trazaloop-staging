# QUALITY-05 · Metodología configurable y versionada

**Decisiones que manda este documento:** RO-03, RO-04, RO-15, RO-35, MDR-08, MDR-36.

## Por qué no hay una matriz 5×5 en el código

Sería más corto. También haría imposibles dos cosas que RO exige a la vez:

- **RO-03**: la metodología es configurable. Una empresa puede valorar con tres
  dimensiones, con pesos, o con una escala de siete niveles.
- **RO-04**: las evaluaciones históricas conservan la suya. Si la fórmula viviera
  en el programa, publicar una versión nueva reescribiría el pasado sin tocar una
  sola fila.

Por eso la metodología es un dato, no código.

## Qué define una versión

```
versión
 ├─ regla de combinación   product | sum | weighted_sum | max | min
 ├─ escalas «dimension»    Probabilidad, Impacto, … (con peso)
 │   └─ niveles            Rara(1) Posible(3) Casi segura(5) …
 └─ escala «result»        Nivel de riesgo
     └─ niveles con banda  Bajo 1–4 · aceptable · revisar cada 12 m
                           Alto 10–15 · sobre el criterio · revisar cada 3 m
```

Tres propiedades del nivel de resultado hacen trabajo real:

| Propiedad | Para qué |
|---|---|
| `min_score` / `max_score` | La banda. Es lo que convierte un puntaje en nivel |
| `is_acceptable` | RO-08. El apetito lo declara la metodología, no el humor de quien mira. Aceptar un nivel no aceptable exige aprobación formal |
| `review_months` | RO-35. La periodicidad sale del nivel: un extremo se revisa antes que un bajo. No se impone un aniversario |

## El ciclo de una versión

```
borrador ──publicar──▶ publicada ──se publica otra──▶ sustituida
   │                       │
   │ se edita              │ NO se edita nunca más
   │ se puede eliminar     │ NO se puede eliminar si se usó
```

`quality_publish_methodology_version()` comprueba antes de congelar:

- al menos una dimensión, y ninguna sin niveles;
- exactamente una escala de resultado;
- al menos una banda con puntajes.

Publicar una metodología incompleta produciría evaluaciones que no se pueden
derivar, y para entonces ya sería inmutable.

## Qué protege la inmutabilidad

Tres disparadores, no tres comprobaciones de pantalla:

| Disparador | Impide |
|---|---|
| `quality_methodology_version_is_frozen` | Cambiar número, regla, vigencia o volver a borrador |
| `quality_risk_scales_frozen` | Tocar las dimensiones de una versión publicada |
| `quality_risk_scale_levels_frozen` | Tocar sus niveles — **incluido añadir uno** |

El tercero es el que más importa. Congelar solo el `UPDATE` habría dejado añadir
un nivel nuevo a una versión ya usada, y entonces una evaluación vieja podría
caer de pronto en una banda que no existía cuando se hizo.

## Escenario obligatorio (§69, §70): la v2 no reescribe la v1

Probado en `tests/rls/quality-05-risks-opportunities.test.ts`, sección G:

1. Se evalúa un riesgo con la **v1** (umbrales: Bajo 1–4, Medio 5–9, Alto 10–15).
2. Se publica la **v2** con umbrales más duros (Bajo 1–2, Medio 3–6, Alto 7–12).
3. La v1 pasa a `superseded` con su vigencia cerrada. **No se borra.**
4. La evaluación de ayer sigue apuntando a la v1, con su puntaje y su nivel intactos.
5. Un puntaje de 3 cae en «Bajo» con la v1 y en «Medio» con la v2 — los criterios
   cambiaron de verdad, y el pasado no se recalculó.

## Derivación: una sola función

`quality_derive_level(version_id, level_ids[])` la usan **la base al guardar y la
pantalla al mostrar**. Con dos implementaciones, lo que la interfaz explica y lo
que la base guarda acabarían diciendo cosas distintas.

Devuelve el puntaje, el nivel, si es aceptable, cada cuánto revisar, y el rastro
de los factores. Ese rastro es lo que permite escribir en pantalla:

> Probabilidad Probable (4) · Impacto Grave (5) → multiplicando da 20, que cae en «Extremo».

Y rechaza, con mensaje propio:

- un nivel que no pertenece a esa versión;
- una dimensión sin valorar;
- un puntaje que no cae en ninguna banda.

## Metodología de oportunidades (RO-15)

Es otra metodología, con `applies_to = 'opportunity'`, sus propias dimensiones
—beneficio esperado, viabilidad— y su escala de prioridad. Las RPC comprueban el
ámbito **antes** que la vigencia: decir «esa metodología es de riesgos» ayuda;
decir «no está publicada» cuando además es de otro ámbito, despista.
