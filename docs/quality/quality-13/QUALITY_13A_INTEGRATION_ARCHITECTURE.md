# QUALITY-13A · ARQUITECTURA DE INTEGRACIÓN · QI-01 … QI-29

**Congelada tras la revisión humana de 13A.1.** Las decisiones marcadas
*(modificada 13A.1)* y *(nueva 13A.1)* recogen lo que decidió la persona; el resto queda
tal como se propuso y **no se renumera**.

Decisiones **de integración únicamente**. Cuando algo ya está decidido en una línea
congelada, se **referencia** en vez de repetirse.

---

## Eje

**QI-01 · El eje primario de integración es el PROCESO.**
Veinticinco tablas ya guardan `process_id`; el eje existe en los datos y no en la
pantalla. Todo lo demás de QUALITY-13 cuelga de aquí.
*Se apoya en:* PC-01…PC-28 (procesos), T-02 (propiedad por cargo).

**QI-02 · El eje secundario es el CARGO.**
Treinta y tres tablas apuntan a `quality_positions`. «De qué responde este cargo» es la
segunda pregunta transversal, y se resuelve leyendo, sin modelar nada.
*Se apoya en:* MDR-33, T-02.

**QI-03 · No se fuerza `process_id` donde la semántica no lo pide.** *(modificada 13A.1)*
Proveedores, clientes, partes interesadas, personas y revisión por la dirección se
relacionan con el proceso **indirectamente**, y así se queda. Inventar la columna sería
crear una relación que nadie mantendría.
*Ampliación de 13A.1:* cuando esa relación indirecta haga falta enseñarla, se **deriva**
de las verdades operativas existentes; y si hubiera que declararla, se declara como
enlace periférico. Nunca como tabla nueva. Ver **QI-23**.

---

## Mirador de proceso

**QI-04 · La ficha de proceso se convierte en mirador, con siete secciones y un patrón
fijo.** *(modificada 13A.1)*
Requisitos que atiende · riesgos y oportunidades · objetivos e indicadores · hallazgos ·
casos y acciones · competencias requeridas, sumadas a lo que ya hay.

El patrón es **uno solo, y es el que la revisión humana congeló**:

```
resumen / contexto  →  recuento y estado  →  enlace profundo al dominio dueño
```

«Riesgos abiertos: 3 → Ver riesgos». El mirador **no replica ningún dominio**: no vuelve
a construir el editor de riesgos, ni el de indicadores, ni el de hallazgos. Cada dominio
sigue siendo dueño de su edición.

**QI-05 · El mirador se alimenta de un cargador compuesto, no de una mega-vista.**
Consultas acotadas en paralelo, como el paquete de contexto de Intelligence. Una vista
que una quince tablas tendría un plan de ejecución que depende de la tabla más pequeña.

**QI-06 · El mirador no muestra proveedores ni quejas.**
Hoy no tienen relación con proceso (G-05). Mostrar el dominio entero en cada ficha sería
ruido con aspecto de integración.

---

## Portada y atención

**QI-07 · La atención se DERIVA; no se crea una sexta tabla.**
Ya hay cinco verdades —`quality_signals` y cuatro tablas de dominio— más ocho barridos.
Una tabla `quality_attention` sería la sexta.
*Consecuencia:* el trabajo es de **convergencia**, no de construcción.

**QI-08 · La convergencia usa el mecanismo que ya existe: `supersedes_observer`.**
Dos de ocho barridos ya están relevados por plantilla. Los otros seis siguen el mismo
camino, uno por uno y con su plantilla equivalente.

**QI-09 · Un punto de atención tiene contrato único.** *(modificada 13A.1)*
`{ dominio, sujeto (tipo + id), etiqueta, severidad, desde cuándo, enlace, origen }`.
Sin ese contrato, doce cargadores cuentan doce veces.
*Ampliación de 13A.1:* el enlace **no es opcional**. Todo punto de atención tiene que
poder navegar al objeto que lo causa; una línea que dice «3 vencidas» y no lleva a
ninguna de las tres es una cifra, no un aviso.

**QI-10 · La deduplicación es por SUJETO, no por dominio.**
Un indicador fuera de meta con señal abierta es **un** problema. Sin esta regla, la
portada infla la lista y pierde la confianza en la primera semana.

**QI-11 · Completitud administrativa nunca se llama «desempeño».**
Que falten tres evaluaciones es trabajo pendiente, no rendimiento.

---

## Enlaces transversales

**QI-12 · `work_references` admitirá propietarios de planificación** —`process`,
`objective`, `indicator`, `document`— para que la relación pueda declararse desde los
dos lados.
*Y con el mismo cuidado de 0150:* toda pareja que ya tenga tabla propia con vigencia
—requisito→proceso, estrategia→requisito, objetivo→proceso— **se rechaza** por la vía
genérica.
*Se apoya en:* T-03, y en la frontera fijada en QUALITY-12.3B2.

**QI-13 · La regla de la frontera se enuncia una vez, para todo el sistema:**
> Si la relación tiene **vigencia propia** y forma parte de lo que se audita, tiene
> tabla propia. Si es un enlace de contexto, va a `work_references`.

---

## Casos y acciones

**QI-14 · `work_cases` / `work_actions` sigue siendo el único motor de trabajo
correctivo**, y ningún dominio nuevo crea el suyo.
*Se apoya en:* AC-01…AC-35.

**QI-15 · El desarrollo de personas conserva su propia semántica.** *(modificada 13A.1)*
Desarrollar a alguien no es una acción correctiva: tiene otro dueño, otra cadencia y otro
final. Deja de ser una omisión y pasa a ser una decisión, y en 13A.1 se generaliza como
principio en **QI-24**: este caso es su primera aplicación, no la regla entera.

**QI-16 · «Crear acción desde esto» no clasifica nada.**
Un hallazgo no es una no conformidad, una queja no es una no conformidad, un riesgo
materializado no es una no conformidad, un indicador fuera de meta no es una no
conformidad. La clasificación la hace una persona.
*Se apoya en:* AC-02.

---

## Historia

**QI-17 · La verdad histórica es POR DOMINIO, y se declara en pantalla.**
Ocho fuentes reconstruyen a fecha, ocho por periodo, ocho solo el presente, y eso está
bien. Lo que no puede pasar es que una pantalla mezcle las tres sin decirlo.
*Se apoya en:* T-01, T-04, y el patrón de 12.3.

**QI-18 · Ninguna vista histórica muestra un dato actual sin etiquetarlo.**

---

## Convergencias

**QI-19 · La Revisión por la Dirección es la agregación canónica, y no se duplica.**
Quince entradas deterministas, ninguna dependiente de IA. El «informe integrado de
Quality» que se podría querer construir **ya existe** y se llama así.
*Consecuencia:* QUALITY-13 **no** crea un PDF «Quality completo». Lo que sí puede hacer
es exponer los mismos constructores **fuera** de una revisión abierta.
*Se apoya en:* RD-01…RD-20.

**QI-20 · Ninguna entrada formal depende de IA.** Intelligence resume después; nunca
calcula la entrada.

**QI-21 · Intelligence gana composición, no un motor.**
Un adaptador de proceso enriquecido que reutilice el cargador de QI-05. Sin tocar
proveedor, modelo, límites ni registro de consumo.
*Se apoya en:* la línea de QUALITY-12/12.1/12.2.

**QI-22 · Automatización gana una fuente de proceso**, con sus campos y su rama en
`quality_automation_subjects`. Es el único punto de esta arquitectura que exige
migración con seguridad.
*Se apoya en:* AT-01…AT-45.

---

## Decisiones de la revisión humana · QI-23 … QI-29

**QI-23 · Proveedor→proceso y queja→proceso se DERIVAN; no se modelan.** *(nueva 13A.1)*
No se crean `supplier_processes`, `complaint_processes` ni equivalentes. La relación sale
de lo que ya es cierto —lo que el proveedor suministra; el caso que la queja genera— y,
si hace falta declararla explícitamente, se expresa con `work_references`.
**No se crea una segunda verdad solo para simplificar una pantalla.**
Se reabre el modelado únicamente si aparece un caso real que no se pueda ni derivar ni
representar. *Sustituye a la decisión pendiente de G-05.*

**QI-24 · TAREA PROPIA DE DOMINIO ≠ ACCIÓN TRANSVERSAL.** *(nueva 13A.1)*
`work_actions` se usa cuando hay una acción transversal explícita que gestionar conforme
a AC-01…AC-35. Una capacitación, una verificación de eficacia o una actividad de
desarrollo pueden seguir siendo objetos de su dominio. Pueden **relacionarse** con una
acción transversal cuando corresponda; **no se duplican automáticamente**.
*Generaliza QI-15 a todo el sistema, no solo a Personas.*

**QI-25 · El grupo de navegación se llama «Evaluación».** *(nueva 13A.1)*
Resuelve la colisión de «Desempeño», que se conserva como entrada de Personas porque es
su nombre propio. **No** se llama «Evaluación del desempeño»: meter el título literal del
capítulo 9 metería el numeral en la navegación por la puerta de atrás, y el principio
congelado dice lo contrario.

**QI-26 · Todo punto de atención navega a su causa.** *(nueva 13A.1)*
Enunciado aparte de QI-09 porque es la diferencia entre una portada que se usa y un
tablero que se mira una vez.

**QI-27 · La convergencia de la atención se documenta antes de tocarla.** *(nueva 13A.1)*
Para cada mecanismo hay que dejar escrito qué es: **fuente de verdad**, **observador**,
**observador relevado**, **barrido heredado** o **destino final**.
Y **ningún barrido heredado se borra sin análisis de compatibilidad**: se releva con
`supersedes_observer`, se comprueba que la empresa recibe lo mismo, y solo entonces se
plantea retirarlo. El mapa vive en `QUALITY_13A_INTEGRATION_DISCOVERY.md` §4bis.

**QI-28 · La composición cross-domain de Intelligence es de SERVIDOR y no salta
permisos.** *(nueva 13A.1)*
Las fuentes de dominio existentes permanecen. QUALITY-13 podrá componer varias en una
respuesta, pero cada fragmento conserva su **procedencia**, su **clase de privacidad**,
su **modo temporal** y su **frontera de permiso**. No existe una fuente «global» que lea
por encima de los dominios.

**QI-29 · Toda integración declara su tiempo: CURRENT, AS_OF o PERIOD.** *(nueva 13A.1)*
No todos los dominios necesitan el mismo modelo temporal —y no lo van a tener—. Lo que
no puede pasar es que una pantalla integrada mezcle los tres sin decirlo. Un dato actual
dentro de una vista histórica va **etiquetado o no va**.
*Formaliza QI-17 y QI-18 como obligación de la interfaz, no solo del dominio.*

---

## Transversales que NO cambian

| | Decisión | Dónde está decidido |
|---|---|---|
| Permisos | capacidad, nunca cadena de rol en la interfaz; RLS manda siempre | ya uniforme en los trece dominios |
| Independencia de módulo | Quality funciona sin PCR ni Textiles; cero referencias hoy | verificado en 13A |
| Entitlement ≠ autorización | `demo/full/extra` decide **acceso al módulo**; el rol decide **qué se puede hacer** | 0100 y el guard de módulo |
| Evidencia | un solo sistema de referencias; ningún tercer motor | T-03 |
| Documentos | un solo motor documental | D-01…D-30 |

---

## Ganchos para lo diferido

Sin implementar nada, la arquitectura debe dejar tres cosas fáciles:

1. **Ayuda «i» generalizable**: cualquier sección nueva recibe su ayuda por el
   componente compartido, con el modelo de partes interesadas —constante de dominio, sin
   puerta comercial— como plantilla.
2. **Tutoriales por ruta**: la clave estable es la ruta, ya inventariada. No se añade
   ningún marcador ahora.
3. **Modelo comercial**: nada en la integración puede asumir que Full = Extra para
   siempre. El límite comercial se pregunta al guard de módulo, no se codifica en el
   dominio.

---

## Comprobación de conflictos

Se contrastaron las 22 decisiones contra DA, D, PC, OI, GP, VC, RO, AC, AR, RD, AT, MDR
y PI.

**Cero conflictos**, y las siete decisiones de 13A.1 no cambian esa conclusión: QI-23
**evita** tocar el modelo, QI-24 confirma AC-01…AC-35 en vez de reabrirlo, QI-25 aplica
el principio de navegación ya congelado, y QI-26…QI-29 son obligaciones de integración
que ninguna línea de dominio contradice.

Ninguna decisión de integración obliga a reabrir una de dominio: QI-12 amplía un
vocabulario (que es como ese catálogo ha crecido siempre), QI-22 añade una fuente (como
hizo 0151), y el resto es composición sobre lo existente.
