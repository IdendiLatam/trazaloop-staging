# QUALITY-07 · Guion de prueba humana

Para recorrer en el Preview con una sesión real. Cada paso dice **qué mirar**,
que es lo que distingue una prueba de un paseo.

---

## 1 · Incorporar, no crear

1. Entra a **Quality → Proveedores**.
2. La primera tarjeta es «incorporar desde PCR y Textiles», **antes** que la de
   crear. Si crear estuviera primero, la empresa acabaría con ACME tres veces.
3. Incorpora un proveedor que exista en PCR.
4. Vuelve a PCR: **sigue ahí, con su nombre y sus lotes**. No se movió nada.
5. Si el mismo proveedor existe en Textiles, incorpóralo también. **No aparece
   dos veces**: es la misma empresa.

## 2 · Aprobado ¿para qué?

6. En **Categorías**, crea dos: «Materia prima» y «Calibración».
7. En la ficha del proveedor, crea un **alcance** para cada una.
8. Decide **aprobado** solo para materia prima, escribiendo en qué te basas.
9. Mira la tabla de alcances: materia prima aprobada, calibración **sin
   decidir**. No hay ningún semáforo global — es deliberado.
10. Intenta una **aprobación condicionada sin escribir las condiciones**. Se
    rechaza, y dice por qué.

## 3 · La evaluación informa

11. En **Evaluaciones → plantillas**, crea una con tres criterios y publícala.
12. Abre una evaluación sobre el alcance de materia prima.
13. Registra dos criterios con 92 y el tercero como **«no aplica»**.
14. Intenta ponerle puntos al «no aplica». La base lo rechaza.
15. Cierra. El mensaje dice el resultado —**92**, no 61— y añade: *«Esto NO
    aprueba al proveedor.»* Mira las dos cosas.
16. Vuelve a la ficha: la decisión de aprobación **no cambió sola**.

## 4 · El pasado no se mueve

17. Publica una **versión 2** de la plantilla, con un criterio más.
18. Abre la evaluación de antes: sigue con sus **tres** criterios y su 92.
19. Intenta editar su puntuación desde donde sea. No se puede.

## 5 · Criticidad ≠ desempeño

20. En **Riesgos → Metodología**, crea una que aplique a «Criticidad de
    proveedores», con una dimensión y bandas de resultado. Dale a la banda alta
    `review_months = 6`.
21. En la ficha del proveedor, clasifica el alcance como crítico.
22. Mira la cadencia de reevaluación: pasó a **6 meses**. La criticidad la
    acortó.
23. Comprueba que la **aprobación no cambió**. Ser crítico no es ser malo.

## 6 · Vencer no es suspender

24. Registra un documento del proveedor con fecha de vencimiento **pasada**.
25. En **Reevaluaciones**, pulsa «Revisar».
26. El documento pasa a vencido y aparece un aviso. **La aprobación sigue
    vigente.** Léelo dos veces: es la afirmación que más se malinterpreta.
27. Pulsa «Revisar» otra vez. **No se duplica ningún aviso.**

## 7 · Un incidente no es una no conformidad

28. Registra un incidente de entrega.
29. Ve a **Casos**: no hay ninguno nuevo.
30. Vuelve y pulsa «Crear caso». Se abre **sin clasificar**, con las referencias
    al proveedor.
31. En la ficha del caso, clasifícalo tú. Esa decisión sigue siendo tuya.
32. Registra otro incidente marcando **«fue un problema del dato»**. Un fallo de
    la integración no es un deterioro del proveedor.

## 8 · Suspender un alcance

33. Suspende el alcance de calibración, con su fundamento.
34. Materia prima **sigue aprobada**. Míralo en la tabla.
35. En el historial hay dos decisiones: la anterior marcada como **sustituida**.
    Ninguna se editó.

## 9 · Los papeles

36. Descarga la **ficha del proveedor**. Ninguna línea dice «aprobado» sin decir
    para qué.
37. Descarga la **evaluación**. Dice con qué versión de plantilla se hizo, y
    cuántos criterios se pudieron puntuar.
38. Descarga la **decisión de aprobación**. Es el acto, con su fecha, su autor y
    su fundamento.
39. Descarga la **aprobación en una fecha** anterior a la decisión. Dice que
    entonces no había decisión — que no es lo mismo que «no aprobado».
40. Descarga el **listado de proveedores aprobados**. Solo el alcance aprobado.

## 10 · Con el rol equivocado

41. Entra con una cuenta **consultora**.
42. Puede registrar, evaluar y documentar.
43. **No puede decidir la aprobación.** El formulario ni siquiera aparece.

## 11 · Retirar

44. Intenta eliminar el proveedor. No se puede, y **dice qué lo impide**, con
    números.
45. Retíralo. Sus evaluaciones y sus decisiones **siguen ahí**.
46. Vuelve a PCR: el proveedor sigue existiendo. Lo que terminó es la relación
    en el sistema de gestión.
