# QUALITY-13 · CIERRE

Cinco tramos, una migración de esquema y dos asientos de catálogo. Lo que se cierra: que
trece dominios completos dejaran de estar desintegrados por el eje que los une.

---

## 1 · El diagnóstico de 13A

Trece dominios terminados. Veinticinco tablas guardando `process_id`. Y:

1. **La ficha de proceso no enseñaba nada de eso.** La pregunta «¿qué significa esto para
   el proceso X?» tenía respuesta en la base y no en la pantalla.
2. **Cinco verdades sobre «qué requiere atención»**, sin contrato común. Si dos contaban el
   mismo problema, la portada lo enseñaba dos veces sin saberlo.
3. **La convergencia estaba diseñada y casi sin usar**: `supersedes_observer` existía desde
   QUALITY-11.1 y solo dos plantillas lo declaraban.
4. **Faltaba Contexto entero** en la portada.

Y una corrección del propio 13A que conviene recordar: la matriz de integración se publicó
con un resumen que no cuadraba. Se recontó del documento —**14 filas × 15 ejes = 210
celdas**, 10 en diagonal, 200 clasificadas— y desde entonces una prueba deriva las dos
cifras del mismo archivo.

---

## 2 · Las 29 decisiones

QI-01…QI-29, congeladas en 13A.1. Las que más gobernaron la ejecución:

| | Qué dice | Dónde se ve |
|---|---|---|
| **QI-23** | proveedor→proceso y queja→proceso **se derivan**, no se modelan | B2 y B5 |
| **QI-24** | tarea propia de dominio ≠ acción transversal | B1, B2, B3, B4 |
| **QI-25** | el grupo «Desempeño» pasa a «Evaluación»; Personas conserva el suyo | B2 |
| **QI-26** | cada aviso lleva a su causa | B1 en adelante |
| **QI-27** | ningún barrido se borra sin comprobar antes que se recibe lo mismo | B3 |
| **QI-29** | todo declara su momento; nunca se mezclan callando | B1, B2, B5 |

---

## 3 · Los cinco tramos

### B1 · Primitivas de enlace · `0712941` · migración **0152**

El contrato de integración —tiempo, enlace, sección, atención, observador y frontera de la
tarea propia— y el contexto de proceso con nueve secciones que se leen a la vez y no
comparten nada. Sin interfaz.

**Lo que apareció al escribirlo:** el indicador guarda su proceso en `scope_process_id` y
exige declarar `scope_type` a la vez; el hallazgo no tiene `title`/`status`/`severity` sino
`statement`/`evaluation_status`/`proposed_severity`; y `processes` llevaba desde 0129 fuera
del CHECK de dominios de fuentes. Los tres habrían devuelto cero en silencio.

**43 comprobaciones.**

### B2 · Mirador de proceso · `3349206` · sin migración

Las nueve secciones en siete bloques con el orden de gestión, recuento del dominio, cuatro
filas y enlace al dueño. La parte interesada derivada de su requisito; proveedor y queja
derivados en la dirección del proceso.

**El defecto que encontró la aceptación:** un proceso de Quality puede referenciar un
documento de PCR o Textiles, y el mirador lo mandaba a `/quality/documents/{id}` → **404**.
Lo vio la comprobación que **abre** todos los destinos. Ninguna prueba de código fuente lo
habría encontrado.

**124 comprobaciones.** Humano: *«Se entiende y me gusta»*.

### B3 · Convergencia de la atención · `40278b9` · migración **0153**

El inventario de **33 condiciones** observadas, comprobado contra las migraciones en las
dos direcciones. Las diez comprobaciones de compatibilidad. Y la consulta convergida.

**El defecto, y es el motivo del tramo:** `supersedes_observer` nombraba el **barrido**, y
los barridos son multicondición. Adoptar la plantilla «acción vencida» apagaba también el
aviso de verificar la eficacia, que ninguna plantilla releva. **Una empresa perdía, en
silencio, algo que venía recibiendo.** Se reprodujo contra base real y se arregló llevando
el relevo a la granularidad de la condición.

**Dos cosas que la documentación daba por ciertas y no lo eran:** `quality_risk_signals` no
la escribe nadie —relevarla habría sido relevar el vacío— y las otras tres tablas de señal
no son observadores, sino el almacén de su barrido.

**Cero relevos nuevos, y ese es el resultado.** Las diez salen NO EQUIVALENTE: umbrales
distintos, sujetos distintos u observadores más estrechos.

**96 comprobaciones.**

### B4 · Portada de Quality · `5853d6f` · sin migración

La atención primero y con su total; los recuentos administrativos debajo. Doce baldosas con
cuánto hay **y** cuánto atender. Contexto por fin. Filtros por dominio y por proceso,
resueltos en servidor.

**La decisión que más pesa:** «no hay asuntos» se dice si —y solo si— todas las fuentes se
leyeron. Con una caída se dice lo contrario, con esas palabras.

**Auditoría de los doce cargadores viejos:** tres salen, ocho se adaptan a contexto
administrativo, uno se queda, uno nuevo entra.

**96 comprobaciones.** Humano: *«Se entiende y me gusta»*.

### B5 · Intelligence entre dominios · migración **0154**

Dos fuentes que miran el sistema por donde está unido —la atención convergida y el contexto
de proceso—, una selección de fuentes por pantalla de origen, y dos entradas contextuales.

**Lo medido:** una pregunta global pedía **23** fuentes; desde un proceso pide **7**; desde
la portada, **10**. La selección la decide el servidor, no el modelo.

**75 comprobaciones.**

---

## 4 · Las migraciones

| | Qué hizo | Por qué |
|---|---|---|
| **0152** | registra el proceso como sujeto observable | el eje primario llevaba desde 0129 fuera del catálogo |
| **0153** | el relevo de observadores, por **condición** | relevar un barrido entero apagaba condiciones que nadie observa |
| **0154** | dos asientos en el catálogo de fuentes de Intelligence | sin ellos, las citas de las fuentes integradas no se guardaban |

Ninguna crea una tabla de negocio. Ninguna borra nada. Ninguna usa `CASCADE`. Y **ninguna
de las cinco tablas prohibidas existe**: ni `quality_attention`, ni `quality_dashboard`, ni
`quality_supplier_processes`, ni `quality_complaint_processes`, ni una sexta tabla de
atención.

---

## 5 · Entornos

| | Cabecera | Estado |
|---|---|---|
| **Local** | **0154** | replay limpio 0001 → 0154 · 146 en disco · 146 registradas · **0 fallos** |
| **Staging** | **0154** | 146 remotas · 0 pendientes · repo remote-unlinked |
| **Production** | **0111** | **sin tocar**: ni migración, ni deploy, ni env, ni pagos |

Production nunca recibió Quality: el módulo sigue siendo privado.

---

## 6 · Las pruebas

**434 comprobaciones nuevas** en veinte suites, todas por código de salida.

| Tramo | Suites | Comprobaciones |
|---|---|---|
| B1 | 4 | 43 |
| B2 | 4 | 124 |
| B3 | 4 | 96 |
| B4 | 4 | 96 |
| B5 | 4 | 75 |
| | | **434** |

Nueve entran en `test:all`; las de base real y las tres aceptaciones por HTTP se corren
aparte porque necesitan Supabase local y el build de producción.

**Las cuatro que más valieron**, y las cuatro encontraron algo que el código fuente no
delataba:

1. **B2 · abrir todos los destinos** → el 404 del documento de otro módulo.
2. **B3 · reproducir el relevo viejo** → el aviso de eficacia perdido.
3. **B4/B5 · contar consultas con un `Proxy`** → que el coste no crece con los datos.
4. **B3 · leer las migraciones y comparar en las dos direcciones** → un inventario que no
   puede envejecer.

---

## 7 · Aceptación integrada

| Qué | Cómo se comprobó | Estado |
|---|---|---|
| Portada de Quality | 96 comprobaciones + humano | **PASS** |
| Mirador de proceso | 124 comprobaciones + humano | **PASS** |
| Atención convergida | 96 comprobaciones | **PASS** |
| Partes interesadas | presente en portada, mirador e Intelligence | **PASS** |
| Revisión por la dirección | plan de contexto propio, sin reconstruir sus entradas | **PASS** |
| Intelligence integrada | 75 comprobaciones | **PASS** |
| Independencia de módulo | ningún enlace a PCR ni Textiles, en ninguna de las tres aceptaciones | **PASS** |

`test:all` **EXIT=0** · `typecheck` **0** · `lint` **0 errores** · `build` **0**.

---

## 8 · Lo aprendido, que vale más que el código

**Un número escrito a mano envejece.** Pasó dos veces: el resumen de la matriz de 13A y las
«49 comprobaciones» de B1, que eran 43. Las dos veces la corrección fue la misma: derivar
la cifra de su fuente y dejar una prueba que la vuelva a derivar.

**Una prueba que lee código fuente no sustituye a una que abre la puerta.** Los dos defectos
reales del sprint —el 404 y el aviso perdido— los encontraron pruebas que ejecutaban, no
que leían.

**«Cero» es la mentira más fácil de un sistema de gestión.** Una lectura denegada, una
fuente caída y un dominio vacío se parecen mucho en una pantalla, y solo uno de los tres
permite dormir tranquilo. Está separado en las cinco capas.

**Documentar lo que NO se hizo cuesta lo mismo y vale más.** Cero relevos nuevos en B3, «Mi
atención» aplazado en B4, sin lista nueva de preguntas para Contexto en B5: los tres con su
motivo escrito, para que quien venga no lo intente creyendo que se olvidó.

---

## 9 · Lo que queda fuera, y dónde va

**PLATFORM EXPERIENCE & COMMERCIAL HARDENING**, no antes:

1. Selector global de módulos con Quality dominante.
2. Enriquecimiento global de la ayuda «i».
3. Vídeo tutorial por pantalla.
4. Gestión de tutoriales desde Superadmin.
5. Vídeo de bienvenida.
6. Preferencia «no volver a mostrar».
7. FAQ.
8. Planes y precios.
9. Pasarela de pago.
10. Modelo comercial de soporte: Full autoservicio · Extra con tickets priorizados y más
    almacenamiento.

**Y tres cosas de Quality, con su motivo escrito:**

- Relevar `quality_scan_risk_reviews`, cuando la fuente `risk` exponga `status`.
- Relevar `knowledge_single_holder`, cuando se compruebe la paridad del filtro de criticidad.
- Borrar `quality_risk_signals`, que es limpieza y no convergencia.
