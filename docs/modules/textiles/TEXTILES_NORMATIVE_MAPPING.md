# Trazaloop Textil · Mapeo normativo y referencias internacionales

> Sprint T0 — Solo documentación. Este documento es la fuente única de verdad sobre
> qué normas, regulaciones, esquemas y marcos soportan cada parte de Trazaloop Textil,
> y sobre qué NO se puede prometer.

## 1. Objetivo

Asegurar que cada parte funcional de Trazaloop Textil esté soportada por una norma,
estándar, marco o referencia internacional, correctamente clasificada, sin inventar
normas ni atribuirles alcances que no tienen.

## 2. Alcance

Cubre la clasificación de referencias, el mapeo funcionalidad → referencia, y las
reglas de lenguaje. No cubre el detalle de cada funcionalidad (ver documentos
específicos).

## 3. Clasificación de referencias (obligatoria)

Cada referencia se usa según su tipo. Confundir tipos es un error de producto.

| Tipo | Qué es | Qué permite decir | Qué NO permite decir |
|---|---|---|---|
| **Regulación** | Norma jurídica vinculante en su jurisdicción (p. ej. UE) | "Contexto regulatorio", "preparación frente a" | "Trazaloop cumple/garantiza cumplimiento" |
| **Norma de referencia** | Norma ISO de terminología, modelos o requisitos, no certificable por Trazaloop | "Basado en", "alineado con la terminología/modelo de" | "Certificado bajo", "conforme a" |
| **Esquema de certificación** | Programa de tercera parte con certificadoras acreditadas | "Archivo de evidencias del esquema X del proveedor" | "Trazaloop certifica bajo X", "producto certificado X" (salvo certificado externo vigente archivado, y aun así lo afirma el certificado, no Trazaloop) |
| **Marco conceptual** | Principios y modelos (p. ej. economía circular) | "Inspirado en los principios de" | "Cumple los principios de" |
| **Estándar de interoperabilidad** | Formato/protocolo de intercambio de datos | "Referencia futura para interoperabilidad" | "Compatible con / implementa" (mientras no se implemente) |
| **Estándar de vocabulario** | Definiciones terminológicas | "Usa la terminología de" | "Conforme a" |
| **Estándar de etiquetado** | Códigos/símbolos de etiquetado | "Registra recomendaciones según el código de símbolos de" | "Genera etiquetas legalmente válidas" |
| **Estándar de medición / ensayo** | Métodos de medición o ensayo de laboratorio | "Permite registrar resultados de ensayos según" | "Ejecuta/valida ensayos" |

## 4. Catálogo de referencias adoptadas

| ID | Referencia | Tipo | Rol en Trazaloop Textil |
|---|---|---|---|
| N-01 | ESPR (UE) 2024/1781 — Ecodesign for Sustainable Products Regulation (Ecodiseño para Productos Sostenibles) | Regulación | Contexto del pasaporte digital de producto, requisitos de información, reparabilidad y reciclabilidad. Los requisitos textiles específicos dependen de actos delegados aún en desarrollo: **incertidumbre declarada**. |
| N-02 | Estrategia Europea para Textiles Sostenibles y Circulares | Marco sectorial (política, no vinculante por sí misma) | Dirección del sector: durabilidad, reparación, reciclaje, transparencia. |
| N-03 | ISO 22095 — Chain of custody. General terminology and models | Norma de referencia | Base conceptual de trazabilidad: identidad, segregación, balance de masa, actores y transferencias de custodia. |
| N-04 | ISO 5157 — Textiles. Environmental aspects. Vocabulary | Estándar de vocabulario | Terminología ambiental y circular textil usada en UI, documentos, diagnóstico y pasaporte. |
| N-05 | ISO 14021 — Self-declared environmental claims | Norma de referencia (declaraciones) | Condiciones para claims autodeclarados (reciclable, reutilizable, contenido reciclado): soporte, especificidad, no ambigüedad. |
| N-06 | ISO 3758 — Textiles. Care labelling code using symbols | Estándar de etiquetado | Registro de recomendaciones de cuidado con el código de símbolos. |
| N-07 | ISO 6330 — Domestic washing and drying procedures for textile testing | Estándar de ensayo | Referencia para registrar ensayos de lavado/secado cuando la empresa disponga de ellos. |
| N-08 | ISO 2076 — Man-made fibres. Generic names | Norma de referencia | Catálogo de nombres genéricos de fibras manufacturadas para el catálogo de fibras. |
| N-09 | Serie ISO 1833 — Quantitative chemical analysis | Estándar de ensayo | Referencia para evidencias analíticas de composición de mezclas. |
| N-10 | ISO 59020 — Measuring and assessing circularity performance | Estándar de medición | Base para el índice interno de preparación circular (medición basada en información disponible). |
| N-11 | ISO 59004 / ISO 59010 — Circular economy: vocabulario, principios y modelos de negocio | Marco conceptual | Principios de circularidad que orientan la matriz (se citan solo donde aportan). |
| N-12 | GRS / RCS (Textile Exchange) | Esquema de certificación | Contenido reciclado textil: Trazaloop solo archiva y organiza certificados/alcances del proveedor; no calcula contenido reciclado textil en MVP. |
| N-13 | OCS / GOTS | Esquema de certificación | Textiles orgánicos: mismo tratamiento que N-12. |
| N-14 | OEKO-TEX MADE IN GREEN | Esquema de certificación / trazabilidad de esquema privado | Referencia de trazabilidad y producción responsable; se archivan etiquetas/IDs como evidencia. |
| N-15 | GS1 EPCIS / CBV | Estándar de interoperabilidad | Referencia FUTURA para eventos de trazabilidad (qué, dónde, cuándo, por qué). No se implementa en MVP. |
| N-16 | GS1 Digital Link | Estándar de interoperabilidad | Referencia FUTURA para identificación/QR. No se implementa en MVP. |
| N-17 | ISO 12947 (Martindale), ISO 13934-1 (tracción) y ensayos textiles análogos | Estándares de ensayo | Registro opcional de resultados de durabilidad cuando existan; solo como evidencia. |

Reglas: **no inventar normas**; no citar una norma donde no aplique; ante duda sobre el
alcance de una norma, declarar la incertidumbre en el documento correspondiente.

## 5. Mapeo funcionalidad → referencia

| Funcionalidad | Norma o marco de referencia | Cómo se aplica en Trazaloop Textil | Qué NO debe prometer la plataforma |
|---|---|---|---|
| Identificación de productos, referencias y colecciones | N-01, N-16 (futuro) | Códigos únicos por organización; versionado de ficha; preparación para identificadores interoperables. | Identificadores GS1 reales, GTIN o QR público en MVP. |
| Catálogo de fibras | N-08 | Lista base de fibras con nombres genéricos estandarizados + fibras naturales de uso común. | Que el nombre registrado equivalga a verificación analítica. |
| Composición de fibras | N-08, N-09, N-05 | Porcentajes por dueño (producto/material/componente); evidencia asociada (ficha, declaración, ensayo ISO 1833). | Exactitud de laboratorio; etiquetado legal de composición por país. |
| Proveedores y cadena de suministro | N-03 | Actores identificados y vinculados a materiales, lotes y documentos. | Verificación de identidad o desempeño del proveedor. |
| Órdenes, lotes y vínculos de trazabilidad | N-03, N-15 (futuro) | Cadena documental insumo → proceso → salida con modelo inspirado en cadena de custodia. | Certificación de cadena de custodia; eventos EPCIS reales. |
| Procesos tercerizados | N-03 | Registro de transferencias de custodia a terceros con evidencia. | Control o auditoría del tercero. |
| Evidencias | N-03, N-05, N-12, N-13, N-14, N-17 | Repositorio con estados y vigencias; certificados de esquemas externos se archivan como evidencia. | Validación de autenticidad; emisión de certificados. |
| Claims ambientales | N-05 | Todo claim requiere tipo, alcance, soporte y limitaciones; sin evidencia → brecha visible. | Que un claim registrado sea válido, legal o verificado. |
| Reparabilidad / reutilización | N-04, N-10, N-11, N-01/N-02 (contexto) | Preguntas y campos de diseño, repuestos, instrucciones y segunda vida. | Índices oficiales de reparabilidad; garantías de reutilización. |
| Reciclabilidad potencial y monomaterialidad | N-05, N-04, N-01 | Clasificación basada en composición, separabilidad y complejidad de mezcla, expresada como "potencial ... con base en la información registrada". | "Producto certificado como reciclable" o reciclabilidad garantizada. |
| Recomendaciones de cuidado | N-06, N-07 | Registro de símbolos/tratamientos máximos y ensayos si existen. | Etiquetas de cuidado legalmente conformes por jurisdicción. |
| Instrucciones de separación | N-01, N-04, N-10 | Campos de separabilidad de avíos/componentes e instrucciones de fin de vida. | Aceptación por sistemas de reciclaje reales. |
| Índice de preparación circular | N-10, N-11 | Índice interno 0–100 con niveles y advertencia obligatoria. | Equivalencia con certificación o verificación independiente. |
| Pasaporte técnico textil | N-01 (contexto), N-03, N-05, N-15/N-16 (futuro) | Consolidado versionado con advertencia de no certificación. | Ser el DPP oficial de la UE o garantizar su cumplimiento. |
| Diagnóstico textil | N-03, N-04, N-05, N-10, N-06 | Dimensiones y preguntas referenciadas a normas (campo `standard_refs`). | Que el resultado acredite madurez ante terceros. |
| TrazaDocs Textil y maestro documental | N-03, N-04 (base documental/terminológica) | Documentos vivos y archivos controlados con estados y versiones. | Sistema de gestión certificado (p. ej. ISO 9001). |

## 6. Reglas de lenguaje transversales

1. Resultados siempre condicionados: "con base en la información registrada".
2. Los esquemas (GRS/RCS/OCS/GOTS/OEKO-TEX) solo aparecen como **tipos de evidencia
   externa**; la vigencia y alcance los define el certificado archivado.
3. El ESPR/DPP se menciona como **preparación**; los requisitos textiles finales
   dependen de actos delegados y estándares armonizados pendientes (incertidumbre
   normativa declarada).
4. ISO 14021 gobierna la redacción de cualquier claim mostrado por la plataforma:
   específico, no ambiguo, con soporte y limitaciones visibles.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambio o publicación de actos delegados textiles del ESPR | Pasaporte "preparatorio" versionado; revisar mapeo en cada release mayor. |
| Ediciones nuevas de normas ISO citadas | Citar sin año en UI; mantener año/edición solo en este documento y revisarlo periódicamente. |
| Uso de logos/nombres de esquemas de certificación en UI | No usar logos; nombrar esquemas solo como tipo de evidencia. |
| Traducciones imprecisas de términos ISO 5157 | Glosario controlado en TrazaDocs Textil (documento sugerido del manual técnico). |

## 8. Criterios de aceptación

- [ ] Toda funcionalidad de los demás documentos aparece en la tabla del §5.
- [ ] Ninguna referencia está mal clasificada (§3–§4).
- [ ] Ninguna celda "Cómo se aplica" implica certificación o cumplimiento.

## 9. Próximos pasos

1. Validar el catálogo N-01…N-17 con un experto normativo textil antes de T2.
2. Definir el subconjunto de `standard_refs` que se sembrará en el diagnóstico (T2).
