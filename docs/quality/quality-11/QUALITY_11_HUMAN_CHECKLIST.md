# QUALITY-11 · Guion de prueba humana

**22 pasos.** Rol necesario: `admin` o `quality` (publicar exige uno de los
dos). Una empresa de prueba, no una real.

---

### Preparar

**1.** Abre **Calidad → Automatización**. Deberías ver el resumen: motor
encendido, día de negocio, cero reglas, cero señales.

**2.** Entra en **Reglas**. Mira la biblioteca de plantillas: catorce, y
**ninguna activa**. Eso es lo correcto: encender cincuenta reglas el primer día
llena la bandeja de ruido.

---

### Crear y simular

**3.** Crea una regla sobre **Indicadores** con la condición *«evaluación =
fuera de meta»*. Elige un cargo responsable que tenga titular con cuenta.
Salidas: señal + aviso + tarea.

**4.** Antes de publicar, lee la **descripción automática**. Tiene que decir en
castellano lo que la regla hará, sin jerga técnica.

**5.** Pulsa **Simular**. Anota el número de coincidencias.

**6.** ⚠️ Ve a **Señales**. Comprueba que la simulación **no creó ninguna**. Y a
**Ejecuciones**: la simulación aparece con salidas en cero.

**7.** Publica la regla.

---

### Ejecutar

**8.** Asegúrate de que hay al menos un indicador **fuera de meta** con una
medición registrada.

**9.** Pulsa **Ejecutar ahora**. Abre la ejecución: cuántas reglas, cuántos
sujetos, cuántas coincidencias, cuántas salidas.

**10.** Ve a **Señales** y abre la que se creó. Lee la **explicación**: tiene que
decir la regla, la versión, el sujeto, la condición con el valor observado y la
fecha.

**11.** Comprueba abajo los **datos que la regla miró**. Solo deben aparecer los
campos de las condiciones, no el indicador entero.

**12.** Ve a tu **bandeja de trabajo**. Tiene que haber un aviso y una tarea, la
tarea abierta y con vencimiento.

---

### Lo que NO debe pasar

**13.** ⚠️ Pulsa **Ejecutar ahora** otra vez, sin cambiar nada. La segunda
ejecución debe decir **0 señales, 0 avisos, 0 tareas nuevas**. La señal de antes
sigue siendo una sola, con el contador de detecciones en 2.

**14.** Registra una medición que **cumpla** la meta y vuelve a ejecutar. La
señal debe quedar **resuelta sola**, diciendo que la condición dejó de
cumplirse.

**15.** ⚠️ Vuelve a tu bandeja: la **tarea sigue abierta**. Resolver la señal no
cierra el trabajo de nadie.

**16.** Registra otra medición que **incumpla** y ejecuta. Debe aparecer una
señal **nueva** —no revivir la vieja—, con su contador a 1.

---

### Los otros dominios

**17.** Instancia la plantilla **«Proveedor crítico con reevaluación
vencida»**, ajusta las etiquetas de criticidad a las de tu metodología, publica
y ejecuta. ⚠️ Comprueba en el proveedor que **su aprobación no ha cambiado**.

**18.** Registra una evidencia de competencia que caduque pronto, crea la regla
correspondiente y ejecuta. ⚠️ Comprueba que la competencia de la persona sigue
**válida y con el mismo nivel**.

**19.** Registra una queja recibida hace más de un mes y crea la regla. ⚠️ Tras
ejecutar, comprueba que **no se ha abierto ningún caso ni ninguna no
conformidad**.

---

### Versiones, papeles y permisos

**20.** Crea una **versión 2** de tu primera regla con otro número y publícala.
⚠️ Abre la señal antigua: debe seguir diciendo **versión 1** y su título de
entonces.

**21.** Descarga los seis PDF: listado y ficha de regla, listado y ficha de
señal, listado e informe de ejecución. La ficha de regla debe imprimir **todas**
sus versiones.

**22.** Entra con un usuario de **otra empresa**: no debe ver ni una regla, ni
una señal, ni una ejecución de esta. Y con un usuario **consultor**: puede
preparar una regla, pero al publicar debe recibir una negativa.

---

### Lo que hay que mirar con lupa

| Si ves esto | Es un fallo |
|---|---|
| la simulación creó algo | grave |
| el segundo barrido duplicó una señal, un aviso o una tarea | grave |
| resolver la señal cerró la tarea | grave |
| la automatización cambió un estado de negocio | **muy grave** |
| la señal no explica por qué saltó | grave |
| la señal antigua cambió de versión al publicar la v2 | grave |
| una empresa ve algo de otra | **muy grave** |
