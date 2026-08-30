# QUALITY-13A · ARQUITECTURA DE INTEGRACIÓN · QI-01 … QI-22

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

**QI-03 · No se fuerza `process_id` donde la semántica no lo pide.**
Proveedores, clientes, partes interesadas, personas y revisión por la dirección se
relacionan con el proceso **indirectamente**, y así se queda. Inventar la columna sería
crear una relación que nadie mantendría.

---

## Mirador de proceso

**QI-04 · La ficha de proceso se convierte en mirador, con siete secciones y un tope.**
Requisitos que atiende · riesgos y oportunidades · objetivos e indicadores · hallazgos ·
casos y acciones · competencias requeridas, sumadas a lo que ya hay. Cada una con
**recuento y tres o cuatro filas**, nunca la tabla entera.

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

**QI-09 · Un punto de atención tiene contrato único.**
`{ dominio, sujeto (tipo + id), etiqueta, severidad, desde cuándo, enlace, origen }`.
Sin ese contrato, doce cargadores cuentan doce veces.

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

**QI-15 · El desarrollo de personas conserva su propia semántica**, y se escribe la
razón: desarrollar a alguien no es una acción correctiva, tiene otro dueño, otra
cadencia y otro final. Deja de ser una omisión y pasa a ser una decisión.

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

**Cero conflictos.** Ninguna decisión de integración obliga a reabrir una decisión de
dominio: QI-12 amplía un vocabulario (que es como ese catálogo ha crecido siempre),
QI-22 añade una fuente (como hizo 0151), y el resto es composición sobre lo existente.
