# QUALITY-13B4 · VALIDACIÓN HUMANA

La matriz P1…P8 está **automatizada** en `tests/e2e/quality-13b4-home.test.ts` y corre
contra el build de producción por HTTP: 23 comprobaciones, EXIT=0.

Lo que queda para una persona es lo que ninguna prueba puede juzgar.

---

## 1 · Lo que ya está comprobado

| | Automatizado |
|---|---|
| P1 | la atención va antes que los recuentos · nada se llama «desempeño» · sin formularios |
| P2 | el total, los grupos, un asunto una vez, sin vocabulario interno, con la aclaración de qué no es una NC |
| P3 | **todos** los destinos abren · el riesgo lleva a su ficha |
| P4 | filtrar por dominio funciona en servidor · se puede quitar · un dominio inválido no vacía la portada |
| P5 | filtrar por proceso acota y ofrece el mirador, que abre |
| P6 | despejado sin prometer conformidad · con asuntos ya no se dice · un proceso ajeno no filtra nada |
| P7 | las doce baldosas, con Contexto y su resumen |
| P8 | sin tablas · con punto de ruptura · ni rastro de PCR o Textiles |

---

## 2 · Las cinco preguntas para la persona

Entrar a **Quality**. Nada más, sin buscar nada.

1. **¿Me dice enseguida qué importa?** En los primeros cinco segundos, ¿sé qué tengo que
   mirar hoy?
2. **¿Hay demasiado?** Ocho líneas y doce baldosas. ¿Se lee o se sufre?
3. **¿Se entienden las prioridades?** «Vencido», «Se acerca» y «Por su estado». ¿Se nota
   la diferencia sin explicarla?
4. **¿Sé dónde pulsar?** Al ver un asunto, ¿queda claro adónde lleva?
5. **¿Parece UN sistema de gestión?** ¿O doce módulos compartiendo pantalla?

Y una sexta, si hay tiempo: **abrir con la ventana estrecha**, como en un teléfono.

---

## 3 · Lo que NO es un defecto

- **Que un aviso se titule con el código y no con el nombre largo.** «Revisión vencida:
  R-014» es la palabra del dominio; la portada no la reescribe. Si conviene cambiarla, se
  cambia en Riesgos, no aquí.
- **Que una baldosa diga 0 asuntos.** Es un cero honesto: se leyó y no hay nada.
- **Que «Asignado a ti» no sume aparte.** Lo tuyo ya está dentro del total de la empresa, y
  la propia sección lo dice.
- **Que no haya un botón de «resolver».** Se resuelve en el dominio dueño; hacerlo aquí
  reescribiría el estado del aviso, no la verdad del negocio.
- **Que no haya «Mi atención».** Se aplaza a propósito: la propiedad es del cargo, no de la
  persona, y hacerlo mal convertiría el usuario en dueño. Ver
  `QUALITY_13B4_HOME_UX.md` §7.

---

## 4 · Dónde mirar si algo no cuadra

| Síntoma | Dónde |
|---|---|
| falta o sobra una baldosa | `HOME_DOMAINS` en `lib/domain/quality-home.ts` |
| un asunto en el grupo equivocado | `OVERDUE_OBSERVERS` / `DUE_SOON_OBSERVERS` en `lib/domain/quality-observers.ts` |
| un texto de estado no sirve | `attentionState` / `incompleteNotice`, mismo archivo |
| un asunto aparece dos veces | la clave de B1 · `attentionKey` |
| un recuento no cuadra | `summarizeAttention`, sobre lo ya convergido |
| un contexto administrativo falta | `loadQualityHome` en `lib/db/quality-home.ts` |

---

## 5 · Cómo se corre lo automatizado

```
npm run build
npm run test:quality13b4-home-e2e
```

Requiere Supabase local. Crea sus propios datos con prefijo `QA Q13 B4 ·` en una empresa
nueva **con Quality y sin PCR ni Textiles**, para que la independencia de módulo se
compruebe de verdad. La primera comprobación se hace **antes** de crear nada: así se ve el
estado despejado de una empresa recién abierta.
