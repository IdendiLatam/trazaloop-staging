# QUALITY-13A · SECUENCIA DE IMPLEMENTACIÓN

Derivada de los nueve huecos, no de la plantilla del encargo. Cinco tramos, cada uno
entregable y verificable por sí solo.

---

## Por qué NO son los cinco del encargo

El encargo proponía: primitivas → portada → mirador → convergencias → aceptación. El
descubrimiento cambia dos cosas:

1. **El mirador de proceso debe ir ANTES que la portada.** La portada necesita un
   contrato de atención que se prueba mejor sobre un eje concreto; y el mirador es el
   que resuelve el hueco mayor. Construir la portada primero obligaría a rehacerla.
2. **La convergencia de atención no es un tramo final: es su propio tramo**, y hay que
   hacerlo antes de la portada, o la portada nacerá contando dos veces.

---

## QUALITY-13B1 · Primitivas de enlace · **ENTREGADO** (0152)

**Qué:** ampliar `work_references` con los propietarios de planificación (QI-12), con el
rechazo explícito de las parejas que ya tienen tabla propia (QI-13); y el cargador
compuesto de proceso (QI-05) sin interfaz todavía.

**Migración entregada:** `0152_quality_process_automation_source.sql`. Resultó ser de
otro tipo del previsto: lo que hizo falta no fue ampliar `work_references` —eso sigue
pendiente y se hará cuando un consumidor lo necesite— sino registrar el **proceso como
sujeto observable**, que era el hueco de esquema que 13A había marcado como el único
seguro. Ver `QUALITY_13B1_INTEGRATION_PRIMITIVES.md`.

**Cómo se sabe que está bien:** un objetivo puede declarar de qué requisito nace; un
riesgo puede decir de qué parte interesada viene; y objetivo→proceso **se rechaza** por
la vía genérica porque ya tiene tabla. El cargador devuelve los recuentos correctos para
un proceso con datos en los siete ejes.

**Riesgo, que sigue vivo para cuando se amplíe `work_references`:** ampliar el
vocabulario abre parejas que no se deben permitir. Ya pasó en 0150 y se resolvió
cerrándolas a mano. Hay que hacer la misma lista **antes** de ampliar.

**Lo entregado además de la migración:** el contrato de integración —tiempo, enlace,
sección, atención, observador y frontera de la tarea propia—, el contexto de proceso con
nueve secciones y el de cargo con cuatro, la derivación de proveedor y queja sin
persistir nada, y 49 comprobaciones. **Sin interfaz.**

---

## QUALITY-13B2 · Mirador de proceso · **ENTREGADO** (sin migración)

**Qué:** las nueve secciones de B1 en la ficha, agrupadas en siete bloques con el orden
de gestión; recuento del dominio y hasta cuatro filas; enlace a cada dominio dueño; la
parte interesada derivada de su requisito; proveedor y queja derivados en la dirección
del proceso; el bloque de atención del proceso; y el renombrado de navegación de QI-25.

**Migración:** **ninguna**. Cabecera 0152, la misma con la que empezó el tramo.

**Cómo se sabe que está bien:** 124 comprobaciones en cuatro suites —decisiones,
pantalla, base real y aceptación por HTTP—. La aceptación abre **todos** los destinos que
el mirador ofrece; ahí apareció el único defecto real del tramo: un documento de otro
módulo enlazado a `/quality/documents/…` daba 404. Ver
`QUALITY_13B2_PROCESS_COCKPIT_IMPLEMENTATION.md` §5.

**Lo que NO entró, y sigue siendo de su tramo:** la ficha de cargo con su vista inversa
(QI-02) —el contexto de cargo existe desde B1 y no tiene pantalla; construirla aquí
habría sido el mirador de cargo, que §16 del encargo excluye—.

**Riesgo, gestionado:** que el mirador se convierta en quince pantallas apiladas. Tope de
cuatro filas por sección, verificado en las cuatro suites.

---

## QUALITY-13B3 · Convergencia de la atención

**Qué:** plantillas equivalentes a los **diez** barridos y tablas de señal que aún no
tienen relevo —el mapa completo está en el descubrimiento §4.bis—, cada una declarando
`supersedes_observer` (QI-08); la fuente de proceso para automatización (QI-22); y el
contrato único de punto de atención (QI-09) con deduplicación por sujeto (QI-10) y
enlace obligatorio a la causa (QI-26).

**Regla de compatibilidad (QI-27):** ningún barrido se borra. Se releva, se comprueba
contra lo que emitía, y solo después se plantea retirarlo.

**Migración:** una, para la fuente de proceso y las plantillas.

**Cómo se sabe que está bien:** adoptar la plantilla apaga el barrido correspondiente y
la bandeja **no** duplica; el mismo problema aparece una vez aunque dos dominios lo
conozcan; y una empresa que no adopta nada sigue viendo exactamente lo que veía.

**Riesgo:** el más alto de los cinco. Aquí se toca lo que la gente ya recibe. Cada
plantilla debe medirse contra el barrido que releva **antes** de relevarlo.

---

## QUALITY-13B4 · Portada de atención

**Qué:** la portada reconstruida sobre el contrato de B3; partes interesadas incluida;
cada línea con su origen y su enlace a la fila; sin la palabra «desempeño» para
completitud (QI-11).

**Migración:** ninguna.

**Cómo se sabe que está bien:** ninguna cifra sale de las filas cargadas; ningún
problema aparece dos veces; cada línea lleva a su fila; y una empresa sin nada
configurado ve una portada que lo dice en vez de doce ceros.

---

## QUALITY-13B5 · Convergencia de Intelligence y aceptación

**Qué:** el adaptador de proceso enriquecido (QI-21) y la composición de servidor que
conserva procedencia, privacidad, modo temporal y frontera de permiso (QI-28),
reutilizando el cargador de B1;
exponer los constructores de Revisión por la Dirección fuera de una revisión abierta
(QI-19) si el mirador o la portada lo necesitan; y la aceptación integrada.

**Migración:** ninguna.

**Cómo se sabe que está bien:** «¿qué procesos concentran riesgos y acciones abiertas?»
se responde con hechos citables; ninguna respuesta se salta un permiso; ninguna entrada
formal de revisión depende de IA; y las 225 comprobaciones anteriores siguen en verde.

---

## Lo que NO entra en ningún tramo

- El informe «Quality completo» en PDF: **ya existe** y se llama Revisión por la
  Dirección (QI-19).
- Modelar proveedor→proceso y queja→proceso: **decidido en 13A.1 que no se modela**
  (QI-23). Lo que sí entra, en B2, es **derivar** y enseñar esa relación desde lo que ya
  es cierto.
- Convertir tareas propias de dominio en acciones transversales (QI-24).
- Ayuda global, tutoriales, vídeo de bienvenida, FAQ, planes, pagos y soporte: sprint
  transversal.
- El selector global de módulos con Quality dominante: transversal, aunque la
  navegación interna ya esté lista.

---

## Orden y por qué

```
B1 primitivas ─→ B2 mirador ─→ B3 convergencia ─→ B4 portada ─→ B5 Intelligence
     (enlaces)      (el eje)      (una verdad)      (la puerta)     (y cierre)
```

Cada tramo es útil aunque el siguiente no llegue: B1 permite declarar relaciones que hoy
no se pueden declarar; B2 responde la pregunta del proceso; B3 quita duplicados que hoy
molestan; B4 cambia la puerta de entrada; B5 compone.
