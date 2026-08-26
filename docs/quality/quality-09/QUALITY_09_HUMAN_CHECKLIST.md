# QUALITY-09 · Guion para la prueba humana

Doce recorridos. Cada uno termina en una afirmación **comprobable en pantalla**:
si no la ves, es un defecto, no una interpretación.

Entra como usuario con rol `quality` o `admin`. Menú **Quality → Auditorías**.

---

## 1 · Crear un programa y ver que no es una auditoría

**Programa → Crear programa.** Nombre, periodo, propósito y —importante— *cómo
se priorizó*.

Comprueba que:
- el formulario **no** te pide fechas de ejecución ni hallazgos;
- el programa recién creado dice «El programa todavía no tiene auditorías» y
  **no** muestra 0 % de cobertura;
- en su ficha aparece ya una revisión, la número 1, «Creado».

## 2 · Cambiar el programa deja historia

En la ficha del programa, pásalo a **Activo**. Vuelve a mirar «Revisiones».

- Hay una revisión nueva. La anterior sigue ahí, sin cambiar.

## 3 · Crear dos auditorías y ver la cobertura real

**Auditorías → Crear auditoría**, dos veces, ambas dentro del programa y con
fechas. Vuelve al programa.

- Cobertura: «0 de 2 ejecutadas · 2 pendientes.» → **0 %**.

## 4 · Cancelar NO mejora la cobertura

Entra en una auditoría → **Plan → Cancelar**, con un motivo.

- La cobertura sigue diciendo **0 %** y ahora menciona «1 cancelada».
- La auditoría cancelada **sigue en la lista**, con su motivo.

> Si la cobertura hubiera subido, el sistema estaría premiando el no auditar.

## 5 · Reprogramar conserva la fecha original

En la otra auditoría → **Plan → Reprogramar**, con motivo.

- La cabecera muestra **dos** fechas: «Fecha original» y «Fecha vigente».
- Aparece «Reprogramada 1 vez» y una tabla de reprogramaciones con el motivo.

## 6 · Alcance, criterios y equipo

En **Plan**: añade un proceso al alcance, un criterio interno y dos personas al
equipo (una como líder).

- El criterio **no** te pide una redacción de pregunta: no es un checklist.
- Intenta poner un segundo líder: no se puede.

## 7 · La independencia se comprueba con los cargos de la fecha

Pulsa **Comprobar independencia**.

- El resultado dice, con todas las letras, que el sistema **NO declara a nadie
  independiente**: enseña lo que encontró.
- Si hay conflicto, aparece como *detectado* y te pide decidir. Al aceptarlo,
  **te exige escribir la mitigación**.

## 8 · El checklist versiona, y contestar no acusa

**Checklists → Crear checklist**, añade una pregunta, **publica** la versión.

- Intenta editar la pregunta ya publicada: no se puede.
- Vuelve a la auditoría → **Ejecución → Checklist**, usa esa versión y contesta
  una pregunta como **«posible brecha»**.
- **Comprueba: la sección de Hallazgos sigue vacía.** El mensaje lo dice.

## 9 · El momento que hay que mirar dos veces

Antes de nada, abre **Quality → Casos** en otra pestaña y **anota cuántas no
conformidades hay**.

Vuelve a la auditoría → **Hallazgos → Levantar hallazgo**, clasificación
propuesta **«Posible no conformidad»**, gravedad «Mayor».

Ahora vuelve a Casos y **cuenta otra vez**.

- **El número no ha cambiado.**

Repite después de *evaluar* el hallazgo. Y otra vez después de **abrir el caso
desde el hallazgo**.

- Sigue sin cambiar. El caso existe, y **no está clasificado como no
  conformidad**: eso lo decide alguien en el caso.

> Esta es la afirmación central del sprint. Si el número se mueve, es un
> defecto grave y hay que decirlo.

## 10 · El informe es una foto

En **Ejecución**, termina la ejecución escribiendo conclusiones. Ve a **Informe
y cierre → Emitir informe**.

- Sin conclusiones no te deja emitirlo.
- Descarga el PDF del informe.
- Ahora **añade otra persona al equipo auditor** y vuelve a descargar el mismo
  informe (versión 1).
- **El PDF sigue mostrando el equipo de antes.**
- Emite otro informe: nace como **versión 2** y dice que corrige a la anterior.
  Las dos se conservan.

## 11 · Cerrar la auditoría no cierra lo que abrió

**Cerrar auditoría**, con razón y con la nota de seguimiento.

- Si queda algún hallazgo sin evaluar, **no te deja**.
- Una vez cerrada, la sección «Seguimiento» sigue diciendo cuántos casos y
  acciones quedaron abiertos.
- Intenta añadir un hallazgo: no se puede.

## 12 · Los papeles no certifican nada

Descarga los doce PDF: programa, listado de programas, ficha, listado, plan,
agenda, checklist, registro de ejecución, hallazgo, listado de hallazgos,
informe y seguimiento.

- Ninguno dice «Certificado», «ISO compliant» ni «conforme a la norma».
- Todos llevan la frase: *Trazaloop administra auditorías; la certificación la
  concede un organismo acreditado, que no es esto.*
- El de hallazgos separa en dos secciones rotuladas **«Lo que PROPUSO el
  auditor»** y **«Lo que se DECIDIÓ»**.

---

## Qué reportar

| Si ves… | Es… |
|---|---|
| El conteo de no conformidades moverse en el recorrido 9 | **Grave** |
| Un PDF que dice «Certificado» o «conforme a la norma» | **Grave** |
| Un informe emitido que cambia al cambiar el equipo | **Grave** |
| La cobertura subir al cancelar | **Grave** |
| Una nota de entrevista restringida visible para quien no audita | **Grave** |
| Un texto confuso, un botón mal puesto, una etiqueta rara | Mejora |
