# QUALITY-13B4 · PORTADA DE QUALITY

---

## 1 · Qué tenía la portada vieja, y qué le pasaba

598 líneas, **doce cargadores en paralelo**, diez bloques del mismo tamaño y siete
tarjetas de «cómo se construye». QUALITY-13A le encontró cuatro cosas:

1. **Sin contrato común**, dos dominios podían contar el mismo problema y la portada lo
   enseñaba dos veces sin saberlo.
2. **Decía «3 vencidas» y no llevaba a ninguna de las tres.**
3. **Faltaba Contexto entero** —partes interesadas—, el dominio más reciente.
4. Una tarjeta se llamaba «Desempeño» y había otra entrada «Desempeño» en Personas.

Y una quinta que se ve al leerla: los recuentos administrativos —cuántos cargos, cuántos
procesos, cuántos documentos— ocupaban tanto sitio como lo que había que atender.

---

## 2 · La auditoría de los doce cargadores (§24)

| Cargador | Veredicto | Por qué |
|---|---|---|
| `getQualitySummary` | **ADAPT** | pasa a ser contexto de las baldosas de Procesos y Documentos. No cuenta atención |
| `listMyTasks` | **KEEP** | responde otra pregunta —qué me toca a MÍ— y viaja en su propia franja, fuera del total de la empresa |
| `listObjectives` | **ADAPT** | solo para el recuento de objetivos activos |
| `listIndicators` | **ADAPT** | recuento de indicadores **y** la zona de atención, que ningún observador ve |
| `getCaseSummary` | **ADAPT** | casos abiertos y no conformidades: estado del dominio, no condiciones observadas |
| `getRiskSummary` | **ADAPT** | por encima del criterio y aceptaciones por aprobar: **ningún observador los emite** |
| `getPeopleSignals` | **REMOVE FROM HOME** | sus cinco líneas son ya condiciones de B3 |
| `getSupplierHomeSignals` | **ADAPT** | solo por `openIncidents`, que no es una condición observada |
| `getCustomerVoiceHomeSignals` | **REMOVE FROM HOME** | sus cuatro líneas son condiciones de B3 |
| `getAuditHomeSignals` | **REMOVE FROM HOME** | sus cinco líneas son condiciones de B3 |
| `getManagementReviewHomeSignals` | **ADAPT** | próxima y en preparación, del dominio; la atención viene de B3 |
| `getAutomationHomeSignals` | **ADAPT** | solo por `engineFailing`, que es una **avería**, no una condición de calidad |
| *(nuevo)* `getSummary` de partes interesadas | **KEEP** | ya existía y nadie lo llamaba desde la portada. Ahora sí |

**Ninguna función de dominio se borró.** Las tres que salen de la portada siguen
existiendo y sirviendo a sus pantallas.

**Y ninguna consulta vieja convive con la nueva:** ningún cargador de los que quedan
vuelve a contar atención. Una prueba lo vigila (`A2`, `A3`).

### Lo que se perdió a propósito, y por qué

`getPeopleSignals.openTransfers` —«transferencias de conocimiento en curso»— sale de la
portada. Una transferencia **en curso** no es una condición pendiente: la vencida sí, y
esa la observa B3 y aparece en la atención. Está en Personas, que es su sitio.

---

## 3 · La portada nueva

```
Necesita atención            ← la pregunta, y el sitio que le corresponde
  [total]  [vencido] [se acerca] [sin fecha clara]
  Vencido      → hasta 8 líneas, cada una con su causa y su enlace
  Se acerca
  Por su estado
  Ver: Todo · Contexto · Procesos · …          ← filtros, en servidor

Asignado a ti                ← otra pregunta, en su franja, sin sumar

Dónde entrar                 ← doce baldosas: cuánto hay · cuánto atender

Qué se está mirando          ← qué es esto, y qué NO es
```

Tres archivos con tres responsabilidades:

| Archivo | Qué hace | Qué NO hace |
|---|---|---|
| `lib/domain/quality-home.ts` | agrupa, nombra, decide cuándo se puede decir que no hay nada | no consulta |
| `lib/db/quality-home.ts` | compone B3 + ocho bloques de contexto | no pinta, no escribe |
| `components/domain/quality/home-view.tsx` | pinta | no decide, no consulta, **no cuenta** |

---

## 4 · La atención se pregunta UNA vez

Sale entera de `loadAttention` y se resume con `summarizeAttention`. **Ninguna baldosa
cuenta por su cuenta**: la cifra de cada una se lee del resumen ya deduplicado, sumando
los dominios que le tocan —«Casos y acciones» recibe dos—.

Comprobado contra base real: el barrido de riesgos deja un aviso **y** un pendiente para
la misma condición, y la portada enseña **una** línea.

---

## 5 · Cuándo se puede decir que no hay nada

Una sola condición: **todas** las fuentes leídas **y** cero asuntos. Con una caída se
dice lo contrario —«no hay asuntos a la vista, pero falta información por leer: esto no
es un “todo en orden”»—.

Y el texto del despejado **no afirma conformidad**: dice qué se miró y cuándo. Trazaloop
no certifica, y una portada en verde es exactamente donde esa frase haría más daño.

Las once fuentes de atención y bloques de contexto viajan con su estado, y por eso la
portada sabe si puede afirmar su total.

---

## 6 · Lo que la portada no hace

- **No edita.** Ni un formulario. Se resuelve en el dominio dueño.
- **No ofrece «marcar como resuelto».** Eso reescribiría el estado del observador, no la
  verdad del negocio.
- **No inventa una escala.** Ni alta/media/baja, ni puntuación, ni semáforo. La gravedad
  es la del dominio o no hay.
- **No enseña cómo está hecha.** Ni «observador», ni «barrido», ni «clave de
  deduplicación».
- **No clasifica.** Un indicador fuera de meta, un hallazgo sin evaluar y una queja sin
  revisar llevan escrito, **en su línea**, que no son no conformidades.

---

## 7 · Sin esquema

Cabecera **0153**, la misma con la que empezó el tramo. Ninguna tabla, ninguna vista,
ninguna columna. Lo único que se tocó en la capa de datos fue **añadir un parámetro
`client?` opcional** a cinco cargadores que no lo tenían, para poder componerlos con un
cliente inyectado y probarlos contra base real. Es el patrón que ya usaba el resto del
repositorio.

---

## 8 · Lo que sigue siendo de otro tramo

- **B5** · Intelligence entre dominios.
- **Platform Experience** · el selector global de módulos con Quality dominante, la ayuda
  global, los tutoriales, el vídeo de bienvenida, FAQ, planes y pagos.
- **«Mi atención» por cargo** · se evaluó y se aplaza: hoy la portada enseña lo asignado a
  la PERSONA, que es un dato real (`assignee_profile_id`), no una deducción de propiedad a
  partir del usuario. Filtrar por los cargos de quien mira exigiría resolver
  usuario→cargos→sujetos, y QI-12 avisa de que la propiedad es del cargo. Ver
  `QUALITY_13B4_HOME_UX.md` §7.
- **«Cambios recientes»** · aplazado. La única fuente sería `work_events`, y §18 pide que
  no se convierta en un visor de bitácora. Sin una fuente limpia, no se hace.
