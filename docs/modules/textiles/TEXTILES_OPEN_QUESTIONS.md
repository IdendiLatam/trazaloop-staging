# Trazaloop Textil · Preguntas abiertas

> Sprint T0 — Solo documentación. Estas preguntas deben resolverse **antes de
> programar** el sprint que bloquean. Cada una registra contexto, opciones y una
> recomendación preliminar (no vinculante) cuando existe.

## 1. Objetivo

Evitar improvisación en desarrollo: toda ambigüedad conocida queda registrada con su
sprint bloqueado y su responsable de decisión (propietario del producto, salvo nota).

## 2. Alcance

Preguntas de producto, dominio y gobierno. Las decisiones técnicas ya tomadas o
propuestas están en `TEXTILES_TECHNICAL_DECISIONS.md`.

## 3. Preguntas

| ID | Pregunta | Contexto y opciones | Recomendación preliminar | Bloquea |
|---|---|---|---|---|
| Q-01 | ¿La unidad principal será producto, referencia, lote o colección? | El modelo soporta producto→referencias; composición, circularidad y pasaporte pueden colgar de producto o de referencia. | **Referencia/SKU** como unidad técnica principal (fichas, composición, pasaporte); producto como agrupador; lote como instancia productiva opcional del pasaporte. | T3 |
| Q-02 | ¿Cómo manejar productos con múltiples variantes? | Variantes por tela/composición distinta vs variantes solo comerciales. | Si la composición cambia, es otra referencia; si no, atributos de la misma. | T3 |
| Q-03 | ¿Cómo manejar tallas y colores? | Matriz completa talla×color vs atributos simples. | Atributos simples (`size_range`, `color`) en MVP; matriz completa solo si un piloto la exige. | T3 |
| Q-04 | ¿Cómo manejar productos con muchos proveedores? | Varios proveedores por material (alternativos) y por orden (lotes de distinto origen). | Proveedor principal en material + proveedores reales por lote de entrada; el pasaporte lista los efectivamente usados. | T5/T6 |
| Q-05 | ¿Cómo manejar avíos? | ¿Avíos como materiales del catálogo, como componentes, o ambos? | Ambos: avío = material (`material_type='trim'`) instanciado como componente con rol y separabilidad. | T3/T4 |
| Q-06 | ¿Cómo manejar procesos tercerizados? | ¿Basta `textile_order_processes.is_outsourced` + tercero + evidencia, o se requiere entidad propia con estados? | Suficiente el modelo propuesto en MVP; revisar tras piloto. | T6 |
| Q-07 | ¿Cómo manejar claims ambientales? | Catálogo cerrado de claim_types vs texto libre; ¿claims a nivel producto, referencia o material? | Catálogo cerrado inicial (recycled_content, organic, recyclable, reusable, repairable, other) sobre referencia y material. | T5 |
| Q-08 | ¿Cómo se verifican evidencias? | Solo validación interna (supervisor) vs flujos adicionales. | Solo validación interna en MVP, etiquetada como tal; verificación externa fuera de alcance. | T5 |
| Q-09 | ¿Qué se considera evidencia suficiente? | Por tipo de dato: ¿ficha del proveedor basta para composición? ¿factura basta para origen? | Matriz mínima: composición = ficha técnica o declaración o ensayo; claim = certificado o declaración con alcance; origen = factura/remisión + dato de proveedor. Validar con experto. | T5 |
| Q-10 | ¿Qué límites tendrá Demo? | Propuesta orientativa en `TEXTILES_MVP_SCOPE.md` §7. | Ratificar valores en fase comercial (D-04/D-09). | Fase comercial |
| Q-11 | ¿Qué indicadores serán obligatorios? | ¿La evaluación circular exige los 7 indicadores o permite parciales? | Permitir parciales con "No evaluable" y brecha; obligatorios solo composición + complejidad para calcular índice. | T7 |
| Q-12 | ¿Cómo se diferenciará pasaporte técnico interno de pasaporte público futuro? | Interno = completo con brechas; público = subconjunto aprobado. | Público solo derivado de snapshot aprobado con lista blanca de campos; naming distinto ("vista pública"). | T9 (diseño), futuro (impl.) |
| Q-13 | ¿Qué información podría exponerse en QR en el futuro? | Candidatos: identificación, composición, cuidado, separación, claims soportados. | Definir lista blanca con piloto y revisión legal; nada de proveedores/lotes por defecto. | Futuro |
| Q-14 | ¿Qué información debe permanecer privada? | Proveedores, precios/costos (no modelados), lotes, brechas, evidencias crudas. | Privado por defecto todo lo no listado en Q-13. | Futuro |
| Q-15 | ¿Qué empresas piloto deberían probar el módulo? | 1–3 confeccionistas; ideal mezclar dotaciones/uniformes y moda/exportación. | Seleccionar durante T1–T2; acuerdos de piloto antes de T11. | T11 |
| Q-16 | ¿Qué se debe validar con expertos textiles? | Banco de diagnóstico, umbrales de circularidad (99/70/elastano 5 %), matriz de evidencia suficiente, blueprints TrazaDocs, terminología local vs ISO 5157. | Sesiones de validación en T2, T5, T7 y T8. | T2/T5/T7/T8 |
| Q-17 | ~~¿Cómo debe gestionarse TrazaDocs Textil desde superadministrador?~~ **CERRADA en T0.1 (DL-15)**: consola actual con selector de módulo; el superadmin gestiona estructuras globales y no interviene documentos internos de empresas salvo soporte autorizado. | Modelo en `TEXTILES_TRAZADOCS_MODEL.md` §6. | — | Cerrada |
| Q-18 | ¿Qué documentos textiles serán obligatorios y cuáles sugeridos? | Propuesta de niveles en `TEXTILES_TRAZADOCS_MODEL.md` §7 (4 required, 6 recommended, 2–3 suggested) y semántica de "obligatorio" (¿bloquea algo o solo señala brecha?). | "Obligatorio" = genera brecha visible si no existe aprobado; nunca bloquea el uso del módulo. | T8 |
| Q-19 | ¿El cliente inicial será confeccionista de uniformes/dotaciones, moda, retail o marca exportadora? | Afecta énfasis del onboarding, ejemplos y orden de piloto (pregunta heredada del documento base v0.1). | Definir con las candidatas de Q-15. | T10 |
| Q-20 | ¿Se evaluará contenido reciclado textil o solo evidencias de esquemas externos (GRS/RCS)? | El cálculo está excluido del MVP (lista vinculante). | Solo evidencias de esquemas externos; cualquier cálculo futuro exige rediseño metodológico propio y su propio análisis normativo. | Futuro |
| Q-21 | ¿Qué módulos reciben acceso Demo por defecto cuando una persona crea cuenta y registra una empresa? (política comercial de la plataforma, T0.2) | Hoy: plan global `demo` con CPR activado. Opciones futuras: solo CPR en Demo; CPR + Textil en Demo; elección del usuario al registrarse; ninguno hasta activación manual. | Mientras Textil sea privado: solo CPR en Demo (estado actual). Revisitar al abrir Textil a beta. | Plataforma-M1 (y beta Textil) |
| Q-22 | ¿Regla de límites de plataforma cuando hay varios módulos: `team_members` y storage total? (T0.2) | Propuesta en `TRAZALOOP_MODULE_PLANS_DECISION.md` §2.5 ("máximo de los módulos" para equipo; storage por módulo con posible cortesía global). | Ratificar "máximo de los módulos" y storage por módulo en Plataforma-M1. | Plataforma-M1 |

## 4. Gobierno de esta lista

- Una pregunta se cierra registrando la decisión en
  `TEXTILES_TECHNICAL_DECISIONS.md` (nueva D-nn) o actualizando el documento del
  dominio afectado, y marcándola aquí como cerrada con fecha.
- Resolver las preguntas bloqueantes es **criterio de entrada** del sprint
  correspondiente (regla del roadmap §6).

## 5. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Q-07/Q-09 (claims y evidencia suficiente) | N-05 (ISO 14021) | La matriz de evidencia mínima se diseñará bajo sus condiciones para claims autodeclarados. | Que la matriz convierta un claim en verificado. |
| Q-12/Q-13 (pasaporte público futuro) | N-01, N-16 | Cualquier exposición pública se diseñará frente a los requisitos DPP cuando existan. | Cumplimiento anticipado del DPP. |
| Q-16 (validación experta) | N-04, N-08 | Terminología y umbrales se contrastan con vocabulario y nomenclatura estandarizados. | Que la validación experta equivalga a certificación. |

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Desarrollar con preguntas bloqueantes abiertas | Regla de criterio de entrada por sprint; revisión de esta lista en cada planning. |
| Decisiones tomadas informalmente y no registradas | Todo cierre pasa por `TEXTILES_TECHNICAL_DECISIONS.md`. |

## 7. Criterios de aceptación

- [ ] Toda pregunta tiene contexto, opciones, recomendación (si existe) y sprint
  bloqueado.
- [ ] Las preguntas del documento base v0.1 y del enunciado están cubiertas.

## 8. Próximos pasos

1. Sesión de decisión de Q-01, Q-02, Q-03, Q-05 antes de T3.
2. Programar validaciones expertas de Q-16.
