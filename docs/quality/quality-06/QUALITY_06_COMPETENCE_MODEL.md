# QUALITY-06 · Modelo de competencia

## 1 · Cuatro cosas distintas que se confunden a diario

| Concepto | Qué es | Dónde vive |
|---|---|---|
| **Competencia** | Una capacidad reutilizable de la empresa: «Auditoría interna», «Operación de extrusora» | `quality_competencies` |
| **Requisito** | Qué nivel de esa competencia exige un cargo — **en una versión concreta de su perfil** | `quality_competency_requirements` |
| **Competencia demostrada** | La decisión de que una persona alcanzó un nivel, con su método y su fundamento | `quality_person_competencies` |
| **Evidencia** | El papel o el hecho que sostiene esa decisión | `quality_competency_evidence` |

Y una quinta que **no** está aquí: el **desempeño**. Se puede ser competente y
estar rindiendo mal —por el proceso, por la carga, por las herramientas— y al
revés. Ver `QUALITY_06_DATA_MODEL.md` §6.

## 2 · La escala la define la empresa

`quality_competency_levels` guarda valor, nombre y qué significa. No hay ninguna
escala cableada en el código. Se ofrece una de partida —«Conoce», «Ejecuta con
supervisión», «Ejecuta autónomamente», «Puede formar a otros»— porque empezar
con una hoja en blanco tampoco ayuda, pero se crea **solo cuando alguien la
pide** desde la aplicación, y es suya: puede cambiar los nombres, los niveles y
cuántos hay.

Por eso `quality_seed_competency_levels` es una función y no un `INSERT` masivo
sobre todas las organizaciones existentes.

## 3 · La competencia se EXIGE, no se copia

El requisito es una fila que enlaza una competencia con la **versión** de un
perfil de cargo (o, cuando exista el modelo, con una actividad de proceso —
PC-16: `position_version_id` **XOR** `process_id`).

Copiar la competencia dentro del cargo habría tenido dos consecuencias: la misma
capacidad escrita de cinco maneras distintas en cinco cargos, y ninguna forma de
responder «¿quién más necesita esto?».

## 4 · Demostrada ≠ declarada

Una decisión de competencia guarda:

- el **nivel** alcanzado;
- el **método** (educación, experiencia, certificación, observación, evaluación
  práctica, formación, desempeño demostrado, otra evidencia autorizada);
- el **fundamento**, en texto: qué se observó;
- **quién** decidió y **cuándo**.

No existe ninguna vía para escribir «sí sabe» sin decir cómo se supo. Y no se
edita: registrar una decisión nueva inserta una fila y marca la anterior
`superseded`, enlazada por `superseded_by`.

## 5 · La brecha

```
brecha = max(nivel_exigido − nivel_demostrado, 0)
```

Se **calcula, se explica y no se guarda**. Una columna `gap` es cómoda de listar
y empieza a mentir al día siguiente: el requisito cambia con la versión del
perfil y la demostración cambia con cada evaluación.

`v_quality_competence_matrix` cruza personas asignadas hoy × competencias
exigidas por el perfil publicado de su cargo, y añade el estado de la evidencia
en una columna **aparte**.

Lo que la matriz no hace: sumar, promediar ni ordenar personas. Una prueba
comprueba que la vista no tenga `avg(` ni `sum(`, y otra que el PDF no reordene
ni agregue. Un total por persona convertiría una herramienta de planificación en
un ranking de empleados, que es justo lo que PC-28 y §39 prohíben.

## 6 · PC-24 · vencer no es dejar de ser competente

Una evidencia puede no vencer (`expires_on` nulo — una respuesta legítima, no un
campo olvidado), vencer, o quedar anulada.

Cuando vence:

1. el barrido marca la **evidencia** como `expired`;
2. emite **un** aviso, cuyo texto dice literalmente que requiere revisión y que
   *no implica por sí solo que la persona haya dejado de ser competente*;
3. **no toca** `quality_person_competencies`.

Decidir si la persona sigue siendo competente es un acto humano posterior. El
escenario E de la suite RLS comprueba las tres cosas, incluida la última: tras el
vencimiento, el nivel y el estado de la decisión son idénticos.

## 7 · PC-23 · el requisito de entonces

Ver `QUALITY_06_HISTORICAL_TRUTH.md`. En corto: el requisito cuelga de la versión
del perfil, y hay funciones para preguntar por una fecha
(`quality_required_level_on`, `quality_demonstrated_level_on`). Existe además un
PDF —«Matriz de competencias en una fecha»— que imprime esa lectura, para que la
afirmación se pueda auditar en papel y no solo en una consulta.
