# Trazaloop Textil · Modelo de diagnóstico inicial

> Sprint T0 — Solo documentación. No crea seeds, migraciones ni UI.

## 1. Objetivo

Permitir que una empresa de confección conozca su estado inicial frente a
trazabilidad, documentación técnica, evidencias, composición, proveedores,
circularidad y preparación para pasaporte de materiales, obteniendo un nivel de
madurez y brechas accionables. El diagnóstico es **propio del sector textil**: no es
el diagnóstico CPR con otras palabras.

## 2. Alcance

Dimensiones, formato de respuesta, ponderación, niveles de madurez, recomendaciones,
banco inicial de preguntas (58) y relación con la plataforma. Las tablas de datos
están en `TEXTILES_DATA_MODEL_PROPOSAL.md`.

## 3. Decisión de formato de respuesta

**Recomendación: escala cerrada de 4 opciones — Sí / Parcial / No / No aplica.**

| Opción | Valor | Racional |
|---|---|---|
| Sí | 1.0 | Práctica establecida y consistente. |
| Parcial | 0.5 | Muy frecuente en confección (p. ej. composición registrada solo para tela principal, no para forro ni avíos). El booleano CPR perdería esta señal. |
| No | 0.0 | Práctica inexistente. |
| No aplica | excluida del cálculo | Necesaria en textil: hay preguntas de claims, orgánico/reciclado, tercerización o e-commerce que legítimamente no aplican. En CPR (Sí/No) esto no existía y forzaría respuestas falsas. |

Diferencia deliberada frente a CPR: CPR usa respuestas booleanas
(`0018_diagnostics_yes_no.sql`, `diagnostic_answers.answer boolean`). Textil requiere
gradación y exclusión. Nota técnica: el enum histórico `diagnostic_answer`
(none/informal/documented/implemented/evidenced, 0002) existe sin uso en CPR; **no**
se reutiliza — 5 niveles subjetivos aumentan fricción sin mejorar la señal.

Cada respuesta admite **observación opcional** (texto corto), igual que CPR.

## 4. Dimensiones

12 dimensiones que cubren las 20 áreas solicitadas (varias áreas afines se agrupan
para que el wizard sea manejable). Pesos por dimensión sobre 100.

| # | Dimensión | Cubre | Peso |
|---|---|---|---|
| D1 | Identificación de productos y referencias | Identificación de productos; referencias, colecciones y lotes (catalogación) | 10 |
| D2 | Composición de fibras y materiales | Composición de fibras | 12 |
| D3 | Evidencias de composición y origen | Evidencias | 12 |
| D4 | Proveedores | Gestión de proveedores | 8 |
| D5 | Trazabilidad de insumos, órdenes y lotes | Trazabilidad de insumos; gestión de lotes | 12 |
| D6 | Procesos de confección y tercerizados | Procesos propios; procesos tercerizados | 8 |
| D7 | Avíos y componentes | Gestión de avíos y componentes; separabilidad | 8 |
| D8 | Cuidado del producto | Recomendaciones de cuidado | 5 |
| D9 | Circularidad del producto | Reparabilidad; reutilización; reciclabilidad potencial | 10 |
| D10 | Claims ambientales y esquemas externos | Claims; material reciclado u orgánico si aplica | 5 |
| D11 | Control documental | Control documental; madurez digital de la información | 5 |
| D12 | Preparación para pasaporte técnico | Preparación para pasaporte; brechas frente a revisión técnica | 5 |

> **Validación T0.1 (cerrada)**: se ratifica la escala **Sí / Parcial / No / No aplica**
> (decisión DL-09 del `TEXTILES_DECISION_LOG.md`). Justificación: el booleano CPR pierde
> la señal "parcial" (dominante en confección) y fuerza respuestas falsas donde el tema
> no aplica. Cobertura verificada de las 16 áreas requeridas: trazabilidad→D5,
> composición→D2, proveedores→D4, evidencias→D3, procesos→D6, tercerizados→D6,
> avíos→D7, claims→D10, cuidado→D8, reparabilidad/reutilización/reciclabilidad
> potencial→D9, separación→D7+D9 (pregunta 43), pasaporte técnico→D12, control
> documental→D11, madurez digital→D11 (preguntas 53–54). 58 preguntas, 12 dimensiones,
> pesos que suman 100: validado.

## 5. Cálculo y niveles de madurez

- Puntaje de dimensión = Σ(valor × peso_pregunta) / Σ(peso_pregunta de preguntas
  aplicables) × 100. Las "No aplica" salen del denominador.
- Puntaje global = Σ(puntaje_dimensión × peso_dimensión) / Σ(pesos de dimensiones con
  al menos una pregunta aplicable).
- Preguntas **críticas** (`is_critical`): si se responden "No", la dimensión no puede
  superar el nivel "Básico" aunque el promedio sea mayor (regla de tope, calculada en
  `lib/domain`, no en SQL).

| Nivel | Rango | Lectura |
|---|---|---|
| Inicial | 0–24 | Información dispersa; trazabilidad no demostrable documentalmente. |
| Básico | 25–49 | Identificación y registros parciales; brechas mayores en evidencia. |
| Intermedio | 50–69 | Registros y evidencias en las áreas núcleo; brechas en circularidad/terceros. |
| Avanzado | 70–84 | Trazabilidad documental consistente; listo para preparar pasaportes por referencia. |
| Preparado | 85–100 | Información y evidencias suficientes para revisión técnica externa (no equivale a certificación). |

> **Actualización T2.1 (hardening)**: la finalización es EXCLUSIVA de la RPC
> `finalize_textile_diagnostic` (0072), que re-valida membresía, habilitación del
> módulo, estado borrador, completitud, "No aplica" inválidos y la regla de
> contexto, y **calcula el resultado en SQL como espejo determinista de
> `lib/domain/textiles-diagnostic.ts`** — cualquier cambio a las reglas de esta
> sección debe aplicarse en AMBAS implementaciones (test de scoring + comparación
> post-finalización vigilan la consistencia). Un diagnóstico finalizado es
> histórico inmutable (sin reapertura, DL-24): se registra `finalized_by` y
> `completed_at` es la fecha de finalización.

**Advertencia obligatoria en el resultado**: "Nivel de preparación interno con base en
las respuestas registradas. No constituye certificación, verificación independiente ni
garantía de cumplimiento regulatorio."

### Recomendaciones por nivel

| Nivel | Recomendación principal |
|---|---|
| Inicial | Crear catálogo de productos/referencias y proveedores; iniciar el Manual técnico de trazabilidad en TrazaDocs Textil. |
| Básico | Completar composición de fibras de referencias activas y cargar evidencias de proveedor. |
| Intermedio | Cerrar trazabilidad orden→lote y documentar procesos tercerizados; iniciar evaluación de circularidad. |
| Avanzado | Generar pasaportes técnicos en borrador y cerrar brechas priorizadas. |
| Preparado | Mantener vigencias de evidencias; preparar revisión con comprador/tercero. |

## 6. Banco inicial de preguntas (58)

Convenciones: (C) = crítica; refs = `standard_refs` sugeridas (ver
`TEXTILES_NORMATIVE_MAPPING.md`). Todas admiten Sí/Parcial/No/No aplica salvo que "No
aplica" carezca de sentido (se indica NA:no).

### D1 · Identificación de productos y referencias (5)
1. (C) ¿Cada producto o referencia tiene un código único interno? [N-01; NA:no]
2. ¿Las referencias se agrupan por colección, línea o temporada? [N-01]
3. ¿Cada referencia tiene ficha técnica con versión identificada? [N-01, N-03]
4. ¿Se distingue formalmente entre producto, referencia y variante (talla/color)? [N-01]
5. ¿Existe un responsable definido de crear y actualizar fichas técnicas? [N-03]

### D2 · Composición de fibras y materiales (6)
6. (C) ¿Se registra la composición porcentual de fibras de la tela principal? [N-08, N-09; NA:no]
7. ¿Se registra la composición de telas secundarias y forros? [N-08]
8. ¿Se registra la composición o material de hilos de confección? [N-08]
9. ¿Los nombres de fibra usados siguen nomenclatura estandarizada (p. ej. nombres genéricos ISO 2076)? [N-08]
10. ¿Las composiciones registradas suman 100 % por componente? [N-08]
11. ¿Se identifica la presencia de elastano u otras fibras minoritarias relevantes para reciclaje? [N-08, N-04]

### D3 · Evidencias de composición y origen (6)
12. (C) ¿La composición declarada se soporta con ficha técnica, certificado, ensayo o declaración del proveedor? [N-05, N-03; NA:no]
13. ¿Las evidencias están archivadas de forma centralizada y recuperable? [N-03]
14. ¿Las evidencias tienen fecha y responsable identificables? [N-03]
15. ¿Se controla la vigencia de certificados y declaraciones (p. ej. vencimientos)? [N-03]
16. ¿Existen resultados de ensayos de laboratorio de composición (serie ISO 1833) para alguna referencia? [N-09]
17. ¿Se puede ubicar la evidencia de una referencia específica en menos de un día? [N-03]

### D4 · Proveedores (5)
18. (C) ¿Los proveedores de telas e insumos están identificados con datos básicos completos? [N-03; NA:no]
19. ¿Cada material del catálogo tiene proveedor(es) asociado(s)? [N-03]
20. ¿Se solicitan y archivan documentos técnicos del proveedor (fichas, declaraciones, certificados)? [N-03, N-05]
21. ¿Se conoce el país de origen de las telas principales? [N-03, N-01]
22. ¿Se registran certificados de esquemas externos del proveedor (GRS/RCS, OCS/GOTS, OEKO-TEX) cuando existen? [N-12, N-13, N-14]

### D5 · Trazabilidad de insumos, órdenes y lotes (6)
23. (C) ¿Las órdenes de confección identifican la referencia y cantidad producida? [N-03; NA:no]
24. ¿Se registra qué lotes o entregas de tela se usaron en cada orden? [N-03]
25. ¿Los lotes de entrada conservan el código de lote del proveedor? [N-03]
26. ¿Los lotes de producto terminado tienen código propio rastreable a su orden? [N-03]
27. ¿Es posible reconstruir la cadena insumo → proceso → producto terminado para una orden reciente? [N-03]
28. ¿Se conserva la relación entre facturas/remisiones de compra y lotes de entrada? [N-03]

### D6 · Procesos de confección y tercerizados (5)
29. ¿Los procesos internos (corte, confección, acabado, empaque) están definidos y documentados? [N-03]
30. ¿Se registra qué procesos se ejecutan con terceros (maquila, lavandería, estampación)? [N-03]
31. ¿Los terceros están identificados como proveedores con datos completos? [N-03]
32. ¿Las salidas y retornos de material con terceros quedan documentados (remisiones, actas)? [N-03]
33. ¿Los procesos húmedos o de acabado que afectan el producto (lavado, tintura, estampado) quedan asociados a la orden? [N-03]

### D7 · Avíos y componentes (5)
34. ¿Los avíos (botones, cierres, etiquetas, herrajes) están catalogados con material y proveedor? [N-03, N-08]
35. ¿Se registra el material de las etiquetas y marquillas? [N-08]
36. ¿Se sabe qué componentes del producto son separables manualmente? [N-04, N-10]
37. ¿El empaque del producto está identificado con su material? [N-05]
38. ¿Existen instrucciones internas de separación de componentes para fin de vida? [N-04, N-01]

### D8 · Cuidado del producto (4)
39. ¿Las prendas llevan recomendaciones de cuidado definidas por referencia? [N-06]
40. ¿Las recomendaciones usan el código de símbolos estandarizado (ISO 3758)? [N-06]
41. ¿Las recomendaciones de cuidado se definen con criterio técnico (proveedor de tela, ensayo o experiencia documentada)? [N-06, N-07]
42. ¿Existen ensayos de lavado/secado (p. ej. ISO 6330) o de durabilidad para alguna referencia? [N-07, N-17]

### D9 · Circularidad del producto (6)
43. ¿Se evalúa si el diseño facilita reparación (costuras accesibles, avíos reemplazables)? [N-04, N-10]
44. ¿La empresa ofrece o documenta opciones de reparación o repuestos? [N-04]
45. ¿Se evalúa el potencial de reutilización o segunda vida del producto? [N-04, N-10]
46. ¿Se conoce si las referencias principales son monomaterial o mezcla? [N-08, N-04]
47. ¿Se evalúa la reciclabilidad potencial considerando composición y separabilidad, sin declarar claims no soportados? [N-05, N-04]
48. ¿Se identifican elementos que dificultan el reciclaje (laminados, recubrimientos, mezclas complejas, herrajes)? [N-04, N-10]

### D10 · Claims ambientales y esquemas externos (4)
49. ¿La empresa hace claims ambientales (reciclado, orgánico, reciclable, reutilizable) sobre sus productos? [N-05] *(pregunta de contexto: "No" no penaliza; activa NA en 50–52)*
50. ¿Cada claim tiene soporte documental identificado? [N-05]
51. ¿Se distingue entre material certificado, proveedor certificado y producto final certificado? [N-12, N-13, N-05]
52. ¿Los claims se redactan de forma específica y no ambigua (tipo de material, porcentaje, alcance)? [N-05]

### D11 · Control documental (3)
53. ¿Los documentos técnicos (manuales, procedimientos, fichas) tienen versión, estado y responsable? [N-03]
54. ¿La información de producto está en formato digital estructurado (no solo papel o archivos sueltos)? [N-01]
55. ¿El personal involucrado conoce los procedimientos de trazabilidad aplicables a su rol? [N-03]

### D12 · Preparación para pasaporte técnico (3)
56. (C) ¿La empresa puede generar hoy una ficha consolidada por referencia con composición, origen, procesos y evidencias? [N-01, N-03; NA:no]
57. ¿La empresa ha recibido o anticipa requerimientos de trazabilidad de compradores o revisiones técnicas? [N-01, N-02]
58. ¿La empresa conoce las brechas de información que le impedirían responder una revisión técnica este mes? [N-10]

Rango solicitado 45–70: cumplido (58). El banco es sembrable como catálogo global
(patrón `diagnostic_sections`/`diagnostic_questions` de CPR) en el sprint T2.

## 7. Relación con la plataforma

| Resultado del diagnóstico | Alimenta |
|---|---|
| Nivel por dimensión y global | Dashboard Textil (tarjeta de preparación). |
| Respuestas "No"/"Parcial" en preguntas con `recommended_action` | Matriz de brechas inicial (antes de tener datos operativos). |
| D11/D12 bajas | Sugerencia de estructuras TrazaDocs Textil a crear. |
| D2/D3 bajas | Sugerencia de empezar por composición + evidencias en onboarding textil. |

En plan Demo se permite completar el diagnóstico y ver el nivel, sin recomendaciones
avanzadas (patrón CPR).

## 8. Diferencias frente al diagnóstico CPR

| Aspecto | CPR | Textil |
|---|---|---|
| Objeto evaluado | Preparación para trazabilidad de contenido reciclado plástico (NTC 6632 / UNE-EN 15343) | Preparación para trazabilidad textil, composición, circularidad y pasaporte técnico |
| Formato de respuesta | Sí/No booleano | Sí/Parcial/No/No aplica |
| Referencias | NTC 6632, UNE-EN 15343 | ISO 22095, 5157, 14021, 2076/1833, 3758/6330, 59020; ESPR |
| Dimensiones | Secciones de contenido reciclado | 12 dimensiones textiles (§4) |
| Metodología de cálculo | No aplica tope por críticas | Tope de nivel por preguntas críticas en "No" |
| Reutilización técnica | — | Se reutiliza el **patrón** (catálogo global + respuestas por org + wizard), no las preguntas ni las tablas CPR (ver `TEXTILES_DATA_MODEL_PROPOSAL.md`) |

## 9. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica en Trazaloop Textil | Qué NO debe prometer la plataforma |
|---|---|---|---|
| Dimensiones y preguntas | N-03, N-04, N-05, N-08/N-09, N-06/N-07, N-10; N-01/N-02 contexto | Cada pregunta lleva `standard_refs` visibles como ayuda. | Que responder "Sí" implique conformidad con la norma citada. |
| Niveles de madurez | N-10 (medición basada en información disponible) | Escala interna de preparación 0–100. | Equivalencia con auditoría, certificación o benchmark oficial. |
| Recomendaciones | N-03, N-04 | Acciones de preparación documental por nivel. | Asesoría legal o de cumplimiento. |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cuestionario largo para pymes | Wizard por dimensiones con guardado parcial (`in_progress`); 58 preguntas ≈ 30–40 min. |
| Autoevaluación optimista | Preguntas críticas con tope de nivel; advertencia de resultado interno. |
| Preguntas condicionales (D10) mal calculadas | Regla explícita: pregunta 49 es de contexto; "No" convierte 50–52 en No aplica. Test unitario obligatorio en T2. |

## 11. Criterios de aceptación

- [ ] 45–70 preguntas, todas con dimensión, peso, refs y criticidad definidas.
- [ ] Fórmula de puntaje maneja "No aplica" y críticas de forma determinista.
- [ ] Ninguna pregunta reutiliza texto del seed CPR (`0022_seed_sprint2.sql`).
- [ ] Resultado siempre acompañado de la advertencia obligatoria.

## 12. Próximos pasos

1. Validar el banco con 1–2 empresas piloto/experto textil (ajustar redacción local).
2. Definir `recommended_action` por pregunta antes del seed de T2.
3. Diseñar tests de scoring (`tests/diagnostic` textil) en T2.
