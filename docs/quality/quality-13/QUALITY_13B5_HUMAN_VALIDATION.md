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

## 3 · Lo que NO es un defecto

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

## 4 · El estado de la IA en vivo

**No se ejecutó ninguna llamada a un proveedor.** El entorno local no tiene credencial
configurada, y §26 lo permite explícitamente: «Do not block B5 if live provider is
unavailable».

Todo lo que B5 entrega —composición, selección, permisos, anonimato, citas, límites— se
valida **antes** de la llamada al modelo, que es donde vive. La llamada en sí es la de
QUALITY-12, sin cambios.

Cuando haya credencial en Preview, una sola pregunta desde la portada basta para el humo en
vivo. **Nunca en Production.**

---

## 5 · Dónde mirar si algo no cuadra

| Síntoma | Dónde |
|---|---|
| falta una fuente en una pregunta | `CONTEXT_PLANS` en `lib/domain/quality-intelligence.ts` |
| sobra contexto | el mismo plan: quitar la fuente y decir por qué |
| una sugerencia no sirve | `INTEGRATED_QUESTIONS`, mismo archivo |
| la atención no cuadra | es de B3 · `lib/db/quality-attention.ts` |
| el contexto de proceso no cuadra | es de B1 · `lib/db/quality-process-context.ts` |
| una cita no se guarda | su fuente falta en `quality_ai_sources` (ver 0154) |
