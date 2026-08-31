# QUALITY-13B5 · VALIDACIÓN HUMANA

La matriz P1…P8 está **automatizada** en `tests/e2e/quality-13b5-intelligence.test.ts` y
corre contra el build de producción: 15 comprobaciones, EXIT=0.

---

## 1 · Lo que ya está comprobado

| | Automatizado |
|---|---|
| P1 | la portada ofrece UNA entrada, es un enlace, y abre Intelligence con el contexto de la portada |
| P2 | las sugerencias son las de la portada, no las genéricas; ninguna pide una decisión formal |
| P3 | desde el proceso se llega con el contexto fijado a ESE proceso |
| P4 | y con las sugerencias del proceso; una sola entrada por pantalla |
| P5 | Intelligence abre y **todos** sus destinos responden 200 |
| P6 | se dice qué no decide y qué no aprende; un proceso ajeno no fija contexto |
| P7 | se puede elegir sobre qué momento se pregunta |
| P8 | ni rastro de PCR o Textiles; la portada y el mirador siguen funcionando |

---

## 2 · Las cinco preguntas para la persona

Entrar a **Quality** y pulsar **«Preguntar a Intelligence»**. Después, entrar a un proceso y
hacer lo mismo.

1. **¿Se nota que sabe de dónde vengo?** El contexto dice desde qué pantalla se pregunta y
   cuántas fuentes va a mirar. ¿Se entiende o sobra?
2. **¿Sirven las sugerencias?** Tres o cuatro por sitio. ¿Son las que uno haría?
3. **¿Se entienden las citas?** Cada fuente con su nombre y su enlace. ¿Se sabe de dónde
   salió cada cosa?
4. **¿Evita sonar a que decide?** ¿O parece que está dictaminando sobre el sistema?
5. **¿Parece el mismo Intelligence de siempre?** Debería: es el mismo. Si parece otro
   producto, algo se hizo de más.

---

## 3 · El microarreglo de presentación · tras el primer humo

La composición estaba bien; **la presentación contaba mal lo que pasaba**. Cuatro cosas,
las cuatro vistas por una persona en treinta segundos y ninguna por una suite:

| Se veía | Por qué estaba mal | Ahora |
|---|---|---|
| «Contexto: Proceso: Gestión Comercial» | el tipo dicho dos veces | **Estás preguntando sobre** · «Gestión Comercial · Proceso» |
| «se consultará … 7 fuentes relacionadas con **mirador de proceso**» | nombre interno de una pantalla, y una promesa que después no cuadraba | «Fuentes disponibles para este contexto: 7» y, en la respuesta, «Fuentes utilizadas en esta respuesta: N» |
| «y el Se ampliará el contexto…» | frase rota de un pegado anterior | la frase del ancla, entera |
| «Evidencia suficiente» + «Sin proveedor de IA configurado» + «Interpretación de la IA» | la pantalla contaba que un modelo había intervenido cuando no había ninguno | «Información disponible», «Hechos encontrados» y «Lectura del contexto» |

**Disponible no es usado.** Antes de preguntar se dice cuántas fuentes hay; después,
cuántas aportaron algo. Son dos cifras distintas y ahora se dicen con palabras distintas.

**«Evidencia suficiente» pasó a «Contexto suficiente».** El nivel siempre midió cuánto
contexto autorizado se encontró; «evidencia suficiente» es, en una empresa con sistema de
gestión, una frase con dueño — la suficiencia probatoria la declara quien audita—. El valor
guardado no cambia: era la etiqueta la que estaba mal.

**Con modelo hay «Análisis de Intelligence».** Nunca «conclusión», «dictamen» ni
«conformidad»: eso sonaría a decisión formal, y no lo es.

Todo esto está en `quality13b5-copy`: 20 comprobaciones, para que no vuelva.

---

## 4 · Lo que NO es un defecto

- **Que sin proveedor configurado avise y no responda.** Es lo correcto: no hay a quién
  preguntar, y fingir una respuesta sería peor.
- **Que el mirador de proceso no tenga un botón propio dentro del bloque del mirador.** La
  entrada está en la cabecera de la ficha desde QUALITY-12 y ya fija el proceso; una segunda
  en la misma pantalla sería proliferación.
- **Que Partes interesadas conserve sus seis preguntas.** Ya eran buenas y tres son las
  integradas: sustituirlas habría sido cambiarlas de sitio.
- **Que preguntar desde un proceso no traiga proveedores de toda la empresa.** Es la
  especialización: 7 fuentes en vez de 23.

---

## 5 · El estado de la IA en vivo

**No se ejecutó ninguna llamada a un proveedor.** El entorno local no tiene credencial
configurada, y §26 lo permite explícitamente: «Do not block B5 if live provider is
unavailable».

Todo lo que B5 entrega —composición, selección, permisos, anonimato, citas, límites— se
valida **antes** de la llamada al modelo, que es donde vive. La llamada en sí es la de
QUALITY-12, sin cambios.

Cuando haya credencial en Preview, una sola pregunta desde la portada basta para el humo en
vivo. **Nunca en Production.**

---

## 6 · Dónde mirar si algo no cuadra

| Síntoma | Dónde |
|---|---|
| falta una fuente en una pregunta | `CONTEXT_PLANS` en `lib/domain/quality-intelligence.ts` |
| sobra contexto | el mismo plan: quitar la fuente y decir por qué |
| una sugerencia no sirve | `INTEGRATED_QUESTIONS`, mismo archivo |
| la atención no cuadra | es de B3 · `lib/db/quality-attention.ts` |
| el contexto de proceso no cuadra | es de B1 · `lib/db/quality-process-context.ts` |
| una cita no se guarda | su fuente falta en `quality_ai_sources` (ver 0154) |
| un rótulo suena a dictamen | `lib/domain/quality-intelligence.ts` §5 y `EVIDENCE_LABEL` |
