# QUALITY-13B2 · VALIDACIÓN HUMANA

La matriz P1…P8 está **automatizada** en `tests/e2e/quality-13b2-process-cockpit.test.ts`
y corre contra el build de producción por HTTP: 28 comprobaciones, EXIT=0.

Lo que queda para una persona es lo que una prueba no puede juzgar: si esto **se
entiende** y si **se ve bien**.

---

## 1 · Lo que ya está comprobado, y no hace falta repetir

| | Automatizado |
|---|---|
| P1 | cabecera, navegación, «Evaluación», y que la ficha conserva sus seis secciones |
| P2 | el requisito con su parte interesada y su tipo de relación, y la vuelta al dominio |
| P3 | riesgo y oportunidad separados, con la palabra de Riesgos |
| P4 | objetivo e indicador distintos; «no es por sí mismo una no conformidad» |
| P5 | el documento propio con ficha; el de otro módulo sin ficha inventada |
| P6 | hallazgo, caso y lo derivado, con su camino y sin revelar a quién |
| P7 | atención con causa y enlace; revisión pasada avisada; proceso vacío explicado; proceso ajeno → 404 |
| P8 | **todos** los destinos abren; ninguno sale de Quality; sin tablas; sin «Crear» |

---

## 2 · Lo que hay que mirar con ojos

Entrar a **Quality → Sistema de gestión → Procesos** y abrir un proceso con datos.

1. **¿Se entiende de un vistazo?** El mirador tiene siete bloques. ¿Se lee o se sufre?
   Si hay que hacer varios desplazamientos para hacerse una idea, el tope de filas o el
   número de bloques está mal.

2. **¿El orden es el que espera un responsable de calidad?** Qué se le exige → qué puede
   pasar → qué se espera y cómo se mide → con qué se opera → con qué se gobierna → qué
   encontró la verificación → qué se está atendiendo.

3. **¿El bloque de atención llama la atención lo justo?** Tiene que verse, sin gritar. Un
   proceso con tres cosas abiertas no está ardiendo.

4. **¿Los textos de sección vacía sirven?** «No hay riesgos relacionados con este
   proceso» debería leerse como un hecho, no como un reproche.

5. **En el teléfono.** Abrir la misma ficha con la ventana estrecha: las secciones se
   apilan, nada se sale, y los enlaces se pueden pulsar.

6. **La aclaración de los documentos.** El mirador cuenta los del proceso **y** los de sus
   entradas y salidas; la sección de abajo solo los del proceso entero. ¿La frase que lo
   explica basta, o los dos números se leen como una contradicción?

7. **Una revisión antigua.** Abrir una revisión pasada desde el historial: ¿queda claro
   que el proceso es de entonces y lo de alrededor es de hoy?

---

## 3 · Lo que NO es un defecto

- **Un documento sin enlace.** Si es de PCR o de Textiles, su ficha está allí. Enlazarla
  desde aquí llevaría a un módulo que la empresa puede no tener.
- **Cuatro filas cuando el recuento dice más.** La muestra es una muestra; el total es del
  dominio. Para verlas todas está el «Ver…».
- **Un hallazgo sin ficha propia.** No la tiene; se llega por «Ver hallazgos de
  auditoría».
- **Un indicador fuera de meta que no aparece en atención.** Es deliberado: eso lo
  determina su dominio, no esta pantalla.

---

## 4 · Dónde mirar si algo no cuadra

| Síntoma | Dónde |
|---|---|
| falta o sobra una sección | `COCKPIT_BLOCKS` en `lib/domain/quality-process-cockpit.ts` |
| un texto de vacío no sirve | `VACIO`, mismo archivo |
| un estado se ve en inglés | `ESTADOS`, mismo archivo |
| un recuento no cuadra | `lib/db/quality-process-context.ts` (B1) |
| un enlace lleva mal | `RUTA` en `lib/domain/quality-integration.ts` |

---

## 5 · Cómo se corre lo automatizado

```
npm run build
npm run test:quality13b2-cockpit-e2e
```

Requiere Supabase local en marcha. Crea sus propios datos con prefijo `QA Mirador ·`, en
una empresa nueva y **con Quality solo**: ni PCR ni Textiles, para que la independencia de
módulo se compruebe de verdad.
