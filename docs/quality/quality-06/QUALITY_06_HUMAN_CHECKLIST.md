# QUALITY-06 · Prueba humana

**Dónde:** Preview
`https://trazaloop-production-4c0vivc60-idendi-latam-s-projects.vercel.app`
(apunta a Staging; requiere iniciar sesión — la protección de despliegue está
activa a propósito).

**Con qué cuenta:** una con rol `admin` o `quality`. Para el paso 22 hace falta
además una segunda cuenta con rol `consultant` en la misma empresa.

**Cuánto tarda:** unos 25 minutos.

---

### Estructura y personas

1. **Crear un cargo.** *Cargos* → crea «Coordinador de Calidad». Luego
   *Personas → Estructura de la empresa* → colócalo en una unidad y márcalo como
   **crítico**. Observa que aparece en «Cargos críticos sin titular».

2. **Crear una persona SIN usuario.** *Personas* → «Registrar persona» → nombre
   y nada más. En «Cuenta de Trazaloop» deja **Sin cuenta**.
   *Fíjate:* la ficha se crea igual. No hay ningún campo de salario, banco ni
   salud, y no es un olvido.

3. **Asignarla al cargo.** Abre su ficha → «Asignar cargo» → titular, desde
   hace unos meses.
   *Fíjate:* el aviso de cargo crítico sin titular deja de tener sentido, y el
   organigrama muestra su nombre bajo el cargo.

4. **Cambiar de titular y comprobar el histórico.** En la asignación vigente,
   «Cerrar vigencia hoy». Crea una segunda persona y asígnala desde hoy.
   Ve a *Estructura de la empresa → Titulares en una fecha*, elige una fecha
   **anterior** al cambio y descarga el PDF.
   *Debe decir la primera persona, no la actual.* Ese es el punto entero de
   MDR-33.

### Competencia

5. **Crear una competencia.** *Competencias* → si no hay escala, pulsa «Empezar
   con una escala de partida» y cámbiala si quieres: es tuya. Crea «Auditoría
   interna».

6. **Exigirla al cargo.** *Estructura → el cargo → Nuevo perfil* → describe el
   propósito → «Exigir competencia» con nivel **3** → «Publicar este perfil».

7. **Evaluar la competencia de una persona.** Ficha de la persona → «Registrar
   competencia» con nivel **2**, método y fundamento.
   *Fíjate:* el fundamento es obligatorio en la práctica; no existe un «sí sabe».

8. **Ver la brecha.** *Competencias → Ver la matriz*: exigido 3, demostrado 2,
   brecha 1.
   *Fíjate:* no hay puntaje total ni orden por «peor».

### Desarrollo

9. **Crear desarrollo que NO sea un curso.** *Desarrollo* → «Registrar
   necesidad» con origen «Brecha de competencia» → crea un plan del año → añade
   un item con tipo **Práctica supervisada**.
   *Fíjate:* el desplegable ofrece nueve opciones y solo una es un curso.

10. **Registrar actividad y asistencia.** «Registrar actividad» → inscribe a la
    persona → «Registrar asistencia» = **Asistió**.

11. **Comprobar que asistencia NO marca eficacia.** Cambia el estado de la
    actividad a **Terminada**.
    *Debe seguir sin haber ninguna evaluación de eficacia*, y el mensaje lo dice
    en voz alta.

12. **Evaluar la eficacia.** «Declarar criterio de eficacia» → escribe contra
    qué se juzgará → luego «Evaluar eficacia» con resultado **No eficaz**.
    Intenta evaluarla otra vez como «Eficaz»: **debe rechazarlo**.

### Desempeño

13. **Crear ciclo anual.** *Desempeño* → «Crear ciclo» → ábrelo → añade a las
    dos personas a la **población aplicable**.

14. **Evaluar humanamente.** «Crear evaluación» eligiendo evaluador (no puede
    ser la misma persona) → añade un criterio con su resultado y observación →
    «Cerrar evaluación».
    Prueba a cerrarla **antes** de añadir criterios: debe rechazarlo.
    *Fíjate:* la competencia de la persona no cambió.

### Conocimiento

15. **Crear conocimiento crítico.** *Conocimiento* → «Registrar» con tipo
    **Tácito** y criticidad **Crítica**.

16. **Dejar un solo holder y observar la señal.** «Registrar quién lo sostiene»
    con una sola persona → «Revisar señales ahora».
    *Debe aparecer* «Conocimiento crítico concentrado». *No debe aparecer*
    ningún riesgo ni ninguna no conformidad nueva.
    Pulsa dos veces más: **no se duplica**.

17. **Crear transferencia.** «Crear plan de transferencia» → añade una actividad
    → ciérrala con su evidencia → «Verificar transferencia» explicando en qué lo
    comprobaste. Prueba a verificar con la actividad sin cerrar: debe rechazarlo.

### Lecciones

18. **Crear lección aprendida.** *Lecciones aprendidas* → rellena las cuatro
    preguntas → añade una propuesta de «Cambiar un documento» → «Aceptar».
    *Comprueba que el documento NO cambió.* Aceptar deja escrito que se aceptó.

### Papel y navegación

19. **Descargar PDFs.** Al menos: ficha de persona, listado de personas,
    organigrama, matriz de competencias (vigente e **histórica**), plan de
    desarrollo, registro de eficacia, evaluación de desempeño, ficha de
    conocimiento y lección.
    *En todos:* logo y nombre de la empresa y nombre del documento en **todas**
    las páginas.

20. **Comprobar el organigrama.** Debe salir de los datos: cambia un cargo de
    unidad y vuelve a descargarlo.

21. **Comprobar Mis tareas.** Vuelve a *Conocimiento → Revisar señales ahora* y
    abre *Mis tareas*: deben aparecer tareas de evaluación, eficacia,
    transferencia y revisión de continuidad, y cada enlace debe llevar a su
    pantalla.

22. **Probar permisos con una segunda cuenta.** Entra con la cuenta
    `consultant`:
    - **debe** ver el organigrama y el catálogo de competencias;
    - **no debe** poder abrir la ficha de una persona;
    - **no debe** ver la evaluación de desempeño ni descargar su PDF.

---

## Qué debería hacerte sospechar

- Que un cargo muestre «sin titular» cuando la persona asignada no tiene cuenta.
- Que un PDF pierda el encabezado en la segunda página.
- Que la matriz de competencias ordene a las personas por brecha.
- Que terminar una actividad la marque como eficaz.
- Que en algún sitio aparezca la frase «persona incompetente» o «Juan es un
  riesgo».
- Que el consultor vea algo de la ficha de alguien.

Ninguna de esas cosas debería ocurrir. Si ocurre, es un defecto y merece
reportarse tal cual.
