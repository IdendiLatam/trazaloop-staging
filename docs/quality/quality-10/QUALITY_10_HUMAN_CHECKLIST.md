# QUALITY-10 · Guion para la prueba humana

Veintisiete pasos. Cada uno termina en una afirmación **comprobable en
pantalla**: si no la ves, es un defecto, no una interpretación.

Entra con rol `quality` o `admin`. Menú **Quality → Revisión por la dirección**.

---

**1. Crear la revisión.** «Nueva revisión»: código `RD-2027-001`, título,
periodo del 01/01/2027 al 31/12/2027.

**2. Comprobar el periodo.** La ficha muestra «2027 · 01/01/2027 — 31/12/2027».
Ese periodo decide todo lo que verás después.

**3. Preparar entradas.** Sección «1 · Preparar» → «Preparar entradas».

- Aparecen **catorce** entradas.
- Ninguna te pidió teclear un número.

**4. Comprobar los indicadores.** Abre «Resultados de seguimiento y medición».

- Cada medición muestra **valor y meta**.
- La meta es la que regía cuando se midió, no la de hoy.

**5. Comprobar los riesgos.** Abre «Eficacia de las acciones frente a riesgos».
Verás riesgos por encima del criterio aceptable y materializaciones del periodo.

**6. Comprobar los proveedores.** Verás criticidad, evaluaciones del periodo,
reevaluaciones vencidas e incidentes. **No** verás «bueno» y «malo».

**7. Comprobar la Voz del Cliente.**

**8. Verificar el anonimato.** En esa entrada, despliega «De dónde viene este
número» y mira el dato.

- Ves métricas, campañas y conteos.
- **No ves ni un nombre, ni un correo, ni un identificador de quien respondió.**
- La entrada lo dice explícitamente.

**9. Comprobar las auditorías.** Debe decir «N ejecutadas de M programadas», y
distinguir hallazgos de no conformidades formalizadas.

**10. Comprobar NC y acciones.** «No conformidades y acciones correctivas»
cuenta por separado casos, clasificación, acciones y eficacia. No dice
«incidentes».

**11. Registrar un input manual.** En «Cambios relevantes» → «Añadir aportación
de la dirección». Queda con tu nombre y la fecha, y marcada como **manual**.

**12. Marcar una entrada N/A.** Elige una que de verdad no aplique → «Marcar no
aplica».

- **Te exige escribir por qué.** Sin razón no te deja.

**13. Cambiar una fuente antes del cierre.** Antes, escribe **análisis** en la
entrada de casos. Luego abre Quality → Casos y crea un caso con fecha dentro de
2027.

**14. Ver FUENTE ACTUALIZADA.** Vuelve a la revisión.

- La entrada de casos muestra la etiqueta **FUENTE ACTUALIZADA**.
- **Y el dato de la entrada NO ha cambiado solo.**

**15. Refrescar sin perder el análisis.** Pulsa «Refrescar el dato».

- El dato se actualiza.
- **Tu análisis sigue exactamente donde estaba.**

> Si el análisis desaparece, es un defecto grave: enseñaría a no refrescar nunca.

**16. Escribir análisis** en el resto de entradas. Fíjate en que el análisis
aparece en un bloque distinto del dato, no encima de él.

**17. Crear una decisión.** «4 · Decidir» → «Registrar decisión»: por ejemplo,
«Aumentar la capacidad de inspección del proveedor crítico».

**18. Confirmar que NO aparece ninguna acción.**

- El contador dice **1 decisión · 0 acciones**.
- La decisión dice «Sin acciones. Una decisión puede no necesitarlas.»

> Este es el momento a mirar dos veces. Si aparece una acción sola, es un
> defecto grave.

**19. Crear dos acciones desde la decisión.** «Crear acción desde una decisión»,
dos veces.

- El contador dice **1 decisión · 2 acciones**.
- La decisión **sigue siendo una**.

**20. Cerrar la revisión con una abierta.** Escribe conclusiones, emite el acta
y cierra.

- Si queda una entrada **pendiente**, no te deja — y te dice cuál.
- Si queda una entrada sin análisis, tampoco.
- Si no hay ninguna decisión, tampoco.
- Con una acción **abierta**, **sí te deja**.

**21. Descargar el Informe.** «Informe de revisión por la dirección».

- Diez secciones numeradas.
- Las catorce entradas con su dato, su periodo y tu análisis.
- La sección 8 separa decisión de acción.

**22. Cambiar la acción después.** Ve a Quality → Casos y pasa una acción a
completada, y luego a eficaz.

**23. Confirmar que el historial NO cambia.** Vuelve a la revisión y descarga el
**Acta** (no el Informe).

- **El acta sigue diciendo lo mismo que decía al emitirla.**

**24. Abrir el seguimiento.** Sección «6 · Seguimiento», o la pestaña
«Seguimiento».

- Ahí **sí** ves la acción completada y eficaz, en vivo.

**25. Revisar acciones de la revisión anterior.** Crea una segunda revisión con
periodo 2028 y prepara sus entradas.

- La primera entrada, «Estado de las acciones de revisiones anteriores», trae
  las acciones de 2027 con su estado real.
- **No están duplicadas**: son las mismas.

**26. Probar permisos con una segunda empresa.** Con una cuenta de otra empresa,
intenta abrir la URL de esta revisión. No debe ver nada.

**27. Descargar un PDF largo.** El paquete de entradas de una revisión con las
catorce preparadas ocupa varias páginas.

- **El encabezado —logo, nombre de empresa, nombre del documento— aparece en
  todas.**
- Las tablas cortan bien y nada se sale del papel.

---

## Qué reportar

| Si ves… | Es… |
|---|---|
| Una acción creada sola al registrar una decisión (paso 18) | **Grave** |
| El análisis desaparecer al refrescar (paso 15) | **Grave** |
| El acta cambiar porque una acción avanzó (paso 23) | **Grave** |
| «Satisfacción 0» donde no hubo campaña (paso 7) | **Grave** |
| Un nombre o correo de quien respondió una encuesta (paso 8) | **Grave** |
| La meta de hoy en la revisión de un periodo anterior (paso 4) | **Grave** |
| Un texto confuso, un botón mal puesto, una etiqueta rara | Mejora |
