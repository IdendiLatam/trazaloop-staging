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
persistir nada, y 43 comprobaciones. **Sin interfaz.**

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

## QUALITY-13B3 · Convergencia de la atención · **ENTREGADO** (0153)

**Qué se esperaba:** plantillas equivalentes a los **diez** barridos y tablas de señal que
aún no tienen relevo, cada una declarando `supersedes_observer`.

**Qué se encontró al mirar el código, que cambia el plan:**

1. **Un barrido no es un observador: es un montón.** `quality_scan_audits` observa cinco
   condiciones; `quality_scan_people_signals`, siete. `supersedes_observer` nombra el
   barrido y la guarda hacía `return 0` al principio de la función.
2. **Eso ya estaba causando una pérdida.** Adoptar la plantilla `action_overdue` apagaba
   también el aviso de verificar la eficacia, que **ninguna** plantilla releva. Medido
   contra base real, no deducido.
3. **`quality_risk_signals` no la escribe nadie.** Relevarla habría sido relevar el vacío.
4. **Las otras tres tablas de señal no son observadores**: son el almacén de su barrido.

**Qué se entregó:** el inventario completo —33 condiciones, comprobado contra las
migraciones—, las diez comprobaciones de compatibilidad, la corrección de granularidad en
`0153_quality_attention_convergence.sql`, y la consulta convergida que B4 usará en lugar
de preguntar a cinco mecanismos. **96 comprobaciones.**

**Cero relevos nuevos, y ese es el resultado.** Las diez salen NO EQUIVALENTE con las
plantillas de hoy: umbrales distintos, sujetos distintos u observadores más estrechos.
Forzarlos habría repetido, diez veces, el fallo que este tramo encontró.

**Lo que queda apuntado con su motivo exacto:** `quality_scan_risk_reviews` podrá relevarse
cuando la fuente `risk` exponga `status`; `knowledge_single_holder`, cuando se compruebe la
paridad del filtro de criticidad. Ver `QUALITY_13B3_OBSERVER_COMPATIBILITY.md`.

**Riesgo, gestionado:** era el tramo más alto de los cinco porque se toca lo que la gente
ya recibe. No se borró ni se desactivó ningún barrido; el único cambio de comportamiento
**devuelve** un aviso que se había perdido.

## QUALITY-13B4 · Portada de Quality · **ENTREGADO** (sin migración)

**Qué:** la portada reconstruida sobre la consulta convergida de B3. Partes interesadas
incluida por fin; cada línea con su origen y su enlace a la causa; sin la palabra
«desempeño» para completitud (QI-11); filtros por dominio y por proceso resueltos en
servidor; y doce baldosas que dicen cuánto hay **y** cuánto pide atención.

**Migración:** **ninguna**. Cabecera 0153.

**Cómo se sabe que está bien:** 96 comprobaciones en cuatro suites. Ninguna cifra sale de
las filas cargadas —todas del resumen deduplicado—; el aviso y el pendiente del mismo
riesgo se enseñan como **un** asunto; cada línea lleva a su ficha y **todos** los destinos
se abren en la aceptación; y una empresa sin nada configurado ve una portada que lo dice
en vez de doce ceros.

**La decisión que más pesa:** «no hay asuntos» solo se dice si **todas** las fuentes se
leyeron. Con una caída se dice lo contrario, y con esas palabras. Una portada en verde es
donde más daño haría callar.

**Auditoría de los doce cargadores viejos:** tres salen —sus condiciones son ya de B3—,
ocho se adaptan a dar contexto administrativo, y uno se queda. Ninguna función de dominio
se borró. Detalle en `QUALITY_13B4_HOME_IMPLEMENTATION.md` §2.

**Lo que NO entró, con su motivo:** el filtro «Mi atención» por cargo —la propiedad es del
cargo y resolverlo mal convertiría el usuario en dueño (QI-12)— y «Cambios recientes» —sin
una fuente que no sea la bitácora, §18 dice que no—.

## QUALITY-13B5 · Intelligence entre dominios · **ENTREGADO** (0154)

**Qué:** dos fuentes que miran el sistema por donde está unido —la atención convergida de
B3 y el contexto de proceso de B1/B2—, la selección de fuentes por pantalla de origen, las
entradas contextuales desde la portada y el mirador, y el catálogo de preguntas integradas.

**Migración:** `0154_quality_intelligence_integrated_sources.sql`. **Dos filas en un
catálogo**, y con necesidad demostrada: `quality_ai_add_reference` rechaza una cita cuya
fuente no esté registrada, así que sin esas dos filas las citas de las fuentes integradas
se enseñaban y no se guardaban. Lo destapó la suite de QUALITY-12 al ponerse en rojo.

**Cómo se sabe que está bien:** «¿qué procesos concentran riesgos y acciones abiertas?» se
responde con hechos citables; ninguna respuesta se salta un permiso; ninguna entrada formal
de revisión depende de IA; y **la especialización se midió**: una pregunta global pide 23
fuentes, una de proceso pide 7.

**Lo que NO entró, con su motivo:** ninguna lista nueva de preguntas para Partes
interesadas —ya traía seis de 12.3B3B y tres son las integradas— y ninguna llamada a un
proveedor en vivo, porque el entorno no tiene credencial y §26 no lo exige.

---

## Cierre de QUALITY-13

Los cinco tramos entregados. **454 comprobaciones** en veintiuna suites. Local y Staging en
**0154**; Production en **0111**, sin tocar. Ver `QUALITY_13_FINAL_CLOSURE.md`.

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
