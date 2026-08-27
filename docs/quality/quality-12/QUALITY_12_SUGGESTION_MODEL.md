# QUALITY-12 · Los borradores

## 1 · Un borrador no es un registro

`quality_ai_suggestions` guarda propuestas. Nada de lo que hay en esa tabla es
una acción, un riesgo, un hallazgo ni una decisión: es texto que alguien puede
usar, editar o tirar.

| Estado | Qué significa |
|---|---|
| `generated` | la IA lo propuso · nadie lo ha mirado |
| `reviewed` | alguien lo miró |
| `accepted` | una persona lo dio por bueno |
| `rejected` | una persona lo descartó |
| `expired` | caducó a los 90 días sin resolverse |

## 2 · «Aceptado» NO significa que ocurriera nada (§43)

Es la parte contraintuitiva y la más importante. Aceptar:

- marca el borrador con quién lo aceptó y cuándo;
- permite anotar **en qué acabó**, si es que acabó en algo;
- y **no crea absolutamente nada**.

La función `quality_ai_accept_suggestion` no tiene un solo `insert` sobre una
tabla de negocio, y hay una prueba que lo comprueba leyendo su cuerpo y otra que
lo comprueba contando filas antes y después.

## 3 · El camino completo (§44, §46, §104)

```
El Copilot propone
   ↓
La persona lo lee  ·  puede EDITARLO
   ↓
Decide usarlo
   ↓
Abre la acción / el riesgo / el caso con el comando de SU dominio
   ↓                        (con sus validaciones de siempre)
El registro existe · su autor es LA PERSONA
   ↓
Opcionalmente, enlaza el borrador con el registro que salió de él
```

El paso incómodo —tener que ir al módulo y crearlo— es el punto entero. Un botón
que creara la acción «porque la IA lo dijo» convertiría una sugerencia en una
decisión sin que nadie la tomara.

## 4 · La procedencia (§103)

Cada borrador arrastra: la consulta que lo generó, el proveedor, el modelo, la
plantilla de instrucciones y su versión, quién la pidió, cuándo, y cuántas
fuentes tenía el contexto.

Eso es lo que permite, dentro de dos años, responder «¿de dónde salió esta
idea?» — y también «¿con qué modelo se generó?», que no es lo mismo que el
modelo de hoy.

## 5 · Descartar también sirve (§45)

Se guarda el motivo. Sirve para saber si el Copilot está proponiendo cosas
útiles o ruido.

Lo que **no** ocurre: nada de esto entrena ningún modelo. Los datos de una
empresa no se usan para mejorar nada de nadie, y la interfaz lo dice con esas
palabras (§83).

## 6 · Los nueve tipos

`action_draft` · `risk_candidate` · `root_cause_hypothesis` · `audit_focus` ·
`review_summary` · `customer_theme` · `document_improvement` · `question_list` ·
`analysis_note`.

La lista está acotada en la base. Un tipo inventado no se guarda.

## 7 · Se pueden apagar

`allow_drafts` en los ajustes. Una empresa que solo quiera consultar y no
quiera que se guarden propuestas, puede.
