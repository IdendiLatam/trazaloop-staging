# QUALITY-12 · Fundamento y citas

## 1 · Una cita no se puede inventar

Porque no la escribe el modelo. La escribe el servidor, en la tabla
`quality_ai_run_references`, **antes** de preguntar. El modelo solo recibe una
lista numerada y cita por número.

```
[1] Indicador: Cumplimiento de entregas
[2] Medición: Cumplimiento de entregas · 2027
[3] Caso CASO-12: Entregas fuera de plazo
```

Si la respuesta cita `[7]` y solo hay tres fuentes, ese número **se descarta**:
no se corrige, no se ignora en silencio, se elimina y se cuenta. La pantalla
dice cuántas citas se descartaron.

## 2 · Los números no los pone el modelo (§58)

«Hay tres no conformidades abiertas» es una cuenta, y las cuentas las hace SQL o
TypeScript. El contexto llega con los hechos ya calculados y la política dice
explícitamente: «Los NÚMEROS ya vienen calculados en el contexto. No los
recalcules ni los estimes.»

Ejemplos de lo que calcula el código:

- cuántas señales abiertas hay, y de qué gravedad;
- cuántas acciones están vencidas;
- cuántos casos hay abiertos y cuántos clasificados como no conformidad;
- qué valor tuvo un indicador en cada periodo, con su evaluación;
- cuánto varió una cifra entre dos revisiones por la dirección, **ya restada**;
- cuántos comentarios de clientes se leyeron.

## 3 · Los enlaces son internos y del servidor (§92)

Cada referencia lleva su `deep_link`, construido por el adaptador que la creó:
`/quality/indicators/<id>`, `/quality/automation/signals/<id>`. El modelo no
propone URLs y la pantalla no enlaza nada que venga de él. Una prueba comprueba
que todos los enlaces guardados empiezan por `/quality/`.

## 4 · Cuando no hay nada que citar (§19, §67)

Si el contexto sale vacío, **no se llama al proveedor**. Se responde:

> «No encontré información suficiente en Trazaloop para responder a esto.»

Y se registra la ejecución con evidencia `missing`. Ni se completa con
conocimiento general, ni se gasta una llamada para que el modelo diga lo mismo.

## 5 · El nivel de evidencia no es un porcentaje (§66)

Tres niveles, calculados por el servidor contando lo que encontró:

| Nivel | Cuándo | Qué significa |
|---|---|---|
| **Sin evidencia** | 0 fuentes | no se encontró información autorizada |
| **Evidencia escasa** | menos de 3 fuentes, o ningún hecho sostenido | conviene contrastar antes de decidir |
| **Evidencia suficiente** | 3 o más fuentes con hechos | varias fuentes sostienen lo que se afirma |

No hay «95 % de confianza» en ninguna parte. El nivel que el modelo diga de sí
mismo se ignora: manda el del servidor.

## 6 · Hechos, interpretación y sugerencias, separados (§65)

La respuesta obliga a clasificar:

- **`facts`** — leído del contexto, con sus fuentes. Si no puede citarse, no es
  un hecho.
- **`interpretation`** — lo que el modelo deduce. Se muestra aparte y en gris.
- **`suggestions`** — propuestas para que decida una persona.
- **`unanswered`** — lo que la pregunta pedía y el contexto no permite responder.

En la pantalla son cuatro bloques con sus títulos, siempre en el mismo orden.
Mezclarlos en un párrafo es lo que convierte una suposición en un dato para
quien lee deprisa.

## 7 · Fuentes que se contradicen (§68)

El paquete tiene un canal para declararlas (`conflicts`) y la pantalla las
muestra como tales. No se elige una en silencio.

## 8 · Actual, periodo o fecha (§69)

Cada ejecución guarda su modo temporal y su fecha de corte, y el contexto se lo
dice al modelo con todas las letras: «LA PREGUNTA ES SOBRE LA SITUACIÓN AL
2027-12-31». Las referencias históricas llevan su propio `as_of`.
