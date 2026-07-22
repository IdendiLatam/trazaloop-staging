# Trazaloop Textil · Modelo de evaluación de circularidad y fin de vida

> Sprint T0 — Solo documentación. Sin código, sin migraciones.

## 1. Objetivo

Definir la matriz de evaluación de circularidad del producto textil: indicadores,
base normativa, campos, preguntas, evidencias, reglas de clasificación, niveles,
brechas, advertencias y su presentación en plataforma y pasaporte. La evaluación es
una **matriz de preparación e información**, nunca una certificación.

## 2. Alcance

Cubre los 7 indicadores, el índice interno de preparación circular y su integración.
La tabla de persistencia es `textile_circularity_assessments`
(`TEXTILES_DATA_MODEL_PROPOSAL.md` §4.16).

## 3. Indicadores

Para cada indicador: definición · base normativa · campos requeridos · preguntas de
evaluación · evidencias esperadas · reglas de clasificación.

Escala común de resultado por indicador: **Alta / Media / Baja / No evaluable**.
"No evaluable" aplica cuando falta información mínima; nunca se rellena con
suposiciones.

### 3.1 Reparable (potencial de reparación)
- **Definición**: grado en que el diseño, los repuestos y las instrucciones facilitan
  reparar el producto (terminología N-04/ISO 5157).
- **Base normativa**: N-04, N-10/N-11; N-01/N-02 como contexto de ecodiseño.
- **Campos**: costuras/accesos reparables (sí/parcial/no), avíos reemplazables
  (sí/algunos/no), repuestos disponibles (sí/no), instrucciones de reparación
  (sí/no), servicio de reparación propio o aliado (sí/no).
- **Preguntas**: ¿los avíos críticos (cierre, botones) pueden sustituirse sin dañar
  la prenda? ¿existen repuestos para la referencia? ¿hay instructivo de reparación?
- **Evidencias**: instructivo, ficha de repuestos, registro de servicio.
- **Reglas**: Alta = avíos reemplazables + (repuestos o servicio) + instrucciones;
  Media = avíos reemplazables sin repuestos/instrucciones; Baja = diseño no
  reparable; No evaluable = campos núcleo vacíos.

### 3.2 Reutilizable (potencial de segunda vida)
- **Definición**: potencial de reacondicionamiento, reventa, donación o reutilización
  con limitaciones documentadas.
- **Base normativa**: N-04, N-10/N-11; N-02.
- **Campos**: apto para segunda vida (sí/con limitaciones/no), limitaciones
  (personalización/logos, higiene, normativa de uso), canal de segunda vida
  documentado (sí/no).
- **Evidencias**: política de reacondicionamiento, acuerdos de donación/reventa.
- **Reglas**: Alta = apto + canal documentado; Media = apto con limitaciones;
  Baja = no apto (p. ej. uniforme con identidad corporativa sin proceso de
  desmarcado); No evaluable = sin información.

### 3.3 Reciclabilidad potencial
- **Definición**: potencial de reciclaje según composición, separabilidad,
  contaminantes/recubrimientos y existencia de ruta de reciclaje conocida.
  Siempre "potencial": la reciclabilidad real depende de infraestructura local.
- **Base normativa**: N-05 (ISO 14021 condiciona el claim "reciclable"), N-04, N-01.
- **Campos**: composición completa registrada (sí/parcial/no), % fibra dominante,
  presencia de elastano > umbral (parametrizable, propuesta inicial 5 %),
  recubrimientos/laminados (sí/no), componentes no separables que contaminan
  (sí/no), ruta de reciclaje identificada (sí/no).
- **Evidencias**: composición con evidencia, ficha del reciclador/ruta si existe.
- **Reglas**: Alta = composición completa + monomaterial o mezcla simple + sin
  recubrimientos + separable + ruta identificada; Media = mezcla simple con
  separabilidad parcial o sin ruta identificada; Baja = mezcla compleja, laminados o
  no separable; No evaluable = composición incompleta.
- **Redacción obligatoria**: "reciclabilidad potencial alta/media/baja/no evaluable
  con base en la información registrada". Prohibido "producto certificado como
  reciclable" o "reciclable" sin condicionar.

### 3.4 Monomaterial o mezcla (complejidad de material)
- **Definición**: clasificación de complejidad: monomaterial / mezcla simple /
  mezcla compleja / multicomponente.
- **Base normativa**: N-08, N-09 (identificación de fibras), N-05.
- **Campos**: derivados de `textile_fiber_compositions` y `textile_components`:
  nº de fibras, % dominante, nº de componentes con materiales distintos.
- **Reglas propuestas (parametrizables en `lib/domain`)**:
  monomaterial = 1 fibra ≥ 99 % (tolerancia declarada) y componentes del mismo
  material o separables; mezcla simple = 2 fibras y dominante ≥ 70 %; mezcla
  compleja = ≥ 3 fibras o dominante < 70 %; multicomponente = componentes de
  materiales distintos no separables. No evaluable = composición incompleta.
- **Nota de incertidumbre**: los umbrales (99/70/5 % elastano) son internos y
  ajustables con expertos; no provienen de una norma que fije esos valores — se
  declara explícitamente en UI ("umbral interno de referencia").

### 3.5 Dificultad de reciclaje
- **Definición**: síntesis de obstáculos: nº de fibras, elastano, recubrimientos,
  laminados, accesorios metálicos/plásticos, separabilidad.
- **Base normativa**: N-10, N-04; N-02 como contexto.
- **Reglas**: se deriva de 3.3/3.4 + accesorios: Baja dificultad = monomaterial
  separable; Media = mezcla simple o accesorios separables; Alta = mezcla compleja,
  laminados o accesorios no separables; No evaluable si 3.4 es No evaluable.

### 3.6 Recomendaciones de cuidado
- **Definición**: registro de símbolos y tratamientos máximos (lavado, blanqueo,
  secado, planchado, limpieza profesional).
- **Base normativa**: N-06 (ISO 3758), N-07 (ISO 6330 para ensayos si existen).
- **Campos**: 5 tratamientos con valor de símbolo/código + origen del criterio
  (proveedor de tela / ensayo / experiencia documentada), ensayo asociado (opcional).
- **Evidencias**: ficha del proveedor de tela, informe de ensayo.
- **Reglas**: Completo = 5 tratamientos definidos con origen; Parcial = algunos;
  Sin definir. (Este indicador reporta completitud, no calidad del cuidado.)
- **No promete**: etiquetas de cuidado legalmente válidas por país.

### 3.7 Instrucciones de separación
- **Definición**: instrucciones para separar avíos, etiquetas, forros, herrajes y
  empaques al fin de vida.
- **Base normativa**: N-01 (información de fin de vida como tendencia regulatoria),
  N-04, N-10.
- **Campos**: por componente (`textile_components`): `is_separable`,
  `separation_instructions`; instrucción general por referencia.
- **Reglas**: Completo = todos los componentes con separabilidad definida e
  instrucciones donde aplica; Parcial; Sin definir; No evaluable = sin componentes
  registrados.

## 4. Índice de preparación circular del producto

Índice interno 0–100 por referencia, ponderando información + evidencia + resultados:

| Dimensión | Peso |
|---|---|
| Composición identificada (completitud) | 20 % |
| Evidencia documental (composición y claims con evidencia válida) | 15 % |
| Reparabilidad | 10 % |
| Reutilización | 10 % |
| Reciclabilidad potencial | 15 % |
| Monomaterialidad / complejidad de mezcla | 10 % |
| Cuidado (completitud con criterio) | 10 % |
| Separación y fin de vida | 10 % |

Conversión indicador→puntos: Alta/Completo = 100, Media/Parcial = 50, Baja/Sin
definir = 0; **No evaluable excluye la dimensión del denominador** y genera brecha.
Si > 40 % del peso queda No evaluable, el índice global es **No evaluable**.

| Nivel del índice | Rango |
|---|---|
| Bajo | 0–39 |
| Medio | 40–59 |
| Bueno | 60–74 |
| Alto | 75–100 |
| No evaluable | > 40 % del peso sin información |

**Advertencia obligatoria junto al índice**: "Índice de preparación circular interno,
basado en la información registrada por la empresa. No equivale a certificación,
verificación independiente ni garantía de reciclabilidad, reparabilidad o
reutilización reales."

## 5. Brechas y advertencias

- Cada campo vacío o "No evaluable" genera una brecha con criticidad (alta si afecta
  composición/evidencia; media si afecta indicadores derivados).
- Claims registrados sin evidencia válida ⇒ advertencia "claim sin soporte
  (ISO 14021)" en la evaluación y el pasaporte.
- Composición que no suma 100 % ⇒ advertencia + indicador 3.4 No evaluable.

## 6. Presentación en plataforma y en el pasaporte

- **Plataforma** (`/textiles/circularity` y pestaña de la referencia): matriz de 7
  indicadores con semáforo textual (Alta/Media/Baja/No evaluable — nunca solo
  color), índice con nivel, advertencia, lista de brechas con enlace al dato
  faltante. Estados de la evaluación: Borrador → En revisión → Aprobado interno →
  Obsoleto (nueva versión desde aprobado; patrón TrazaDocs).
- **Pasaporte**: bloque "Circularidad" con los 7 indicadores, nivel del índice,
  fecha/versión de la evaluación y advertencia (ver
  `TEXTILES_MATERIAL_PASSPORT_MODEL.md` §4, bloque F).

## 7. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica en Trazaloop Textil | Qué NO debe prometer la plataforma |
|---|---|---|---|
| Terminología de indicadores | N-04 (ISO 5157) | Definiciones de reparación, reutilización, reciclaje, fin de vida. | Conformidad con la norma por usar sus términos. |
| Índice de preparación circular | N-10 (ISO 59020), N-11 | Medición interna basada en información disponible, con exclusión de lo no evaluable. | Equivalencia con medición certificada de circularidad. |
| Claims derivados (reciclable, etc.) | N-05 (ISO 14021) | Redacción condicionada, soporte y limitaciones visibles. | Validez del claim ante terceros o autoridades. |
| Cuidado | N-06, N-07 | Registro de símbolos/tratamientos y ensayos. | Etiquetado legal de cuidado. |
| Separación / fin de vida | N-01, N-04, N-10 | Campos e instrucciones por componente. | Aceptación por sistemas reales de reciclaje. |
| Umbrales de clasificación | — (internos) | Parámetros ajustables declarados como "umbral interno de referencia". | Que los umbrales provengan de norma alguna. |

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Lectura del índice como sello | Advertencia obligatoria e inseparable del valor; sin insignias/medallas en UI. |
| Umbrales internos discutibles | Parametrización en `lib/domain` + validación con expertos en piloto; incertidumbre declarada. |
| Evaluaciones desactualizadas tras cambios de composición | Marca "evaluación desactualizada" si la composición cambió después de `assessed_at`; sugerir nueva versión. |
| Greenwashing involuntario por parte del usuario | Los claims solo alcanzan estado "supported" con evidencia válida; texto sugerido siempre condicionado. |

## 9. Criterios de aceptación

- [ ] Los 7 indicadores tienen definición, normas, campos, preguntas, evidencias y
  reglas deterministas.
- [ ] "No evaluable" existe en todos los indicadores y en el índice.
- [ ] Ninguna salida usa lenguaje de certificación.
- [ ] Las reglas son implementables como funciones puras testeables.

## 10. Próximos pasos

1. Validar umbrales (99/70/elastano 5 %) con experto textil antes de T7.
2. Definir el esquema JSON de `answers` de la evaluación al inicio de T7.
3. Escribir tests unitarios de clasificación e índice (incl. casos No evaluable).
