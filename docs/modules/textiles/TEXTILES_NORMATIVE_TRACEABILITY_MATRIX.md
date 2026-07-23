# Trazaloop Textil · Matriz normativa de trazabilidad

> **Nota T0.2**: esta matriz es del **módulo Textil**. El copy público de la
> plataforma Trazaloop y de las tarjetas de módulos se rige por
> `TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md`; las normas de CPR (NTC 6632,
> UNE-EN 15343) pertenecen al módulo CPR y nunca se citan como soporte textil.

> Sprint T0.1 — Solo documentación. Mapea cada área funcional de la plataforma con
> su norma o marco internacional de referencia. Complementa
> `TEXTILES_NORMATIVE_MAPPING.md` (catálogo N-01…N-17 con tipos de referencia).
>
> **Reglas de lectura**: ninguna fila implica certificación ni cumplimiento; los
> tipos son los del catálogo (Regulación · Norma de referencia · Esquema de
> certificación de terceros · Marco conceptual · Estándar de interoperabilidad ·
> Vocabulario · Etiquetado · Medición). Las referencias marcadas **[futuro]** o
> **[complementaria]** no están implementadas ni prometidas. No se citan normas no
> verificadas; la incertidumbre (actos delegados del DPP) se declara donde existe.

## Matriz

| Área funcional | Funcionalidad | Norma/marco | Tipo de referencia | Aplicación en Trazaloop Textil | Evidencia esperada | Advertencia / qué no prometer |
|---|---|---|---|---|---|---|
| Diagnóstico inicial | Autoevaluación de madurez en 12 dimensiones | N-01 ESPR (UE 2024/1781) y N-02 Estrategia textil UE como contexto; N-03 ISO 22095 y N-05 ISO 14021 en preguntas específicas | Regulación (contexto) + normas de referencia | Las preguntas señalan la información y evidencias que estos marcos vuelven relevantes; `standard_refs` por pregunta | Respuestas autodeclaradas + observaciones | El resultado es autoevaluación: no mide cumplimiento del ESPR ni de norma alguna. |
| Cadena de custodia | Modelo insumo → orden/proceso → lote y vínculos de trazabilidad | N-03 ISO 22095 (cadena de custodia) | Norma de referencia | Conceptos de custodia e identificación de eslabones estructuran `textile_input_batches`, `textile_order_processes`, `textile_output_batches`, `textile_traceability_links` | Registros de lotes, órdenes, remisiones/facturas vinculadas | No es un modelo de custodia certificado ni auditado; ISO 22095 orienta el diseño. |
| Composición de fibras | Registro porcentual por producto/referencia/material/componente | N-08 ISO 2076 (nomenclatura de fibras); N-09 serie ISO 1833 (análisis cuantitativo) **[complementaria: la plataforma no ensaya]**; N-04 ISO 5157 (vocabulario) | Vocabulario + medición + vocabulario | Catálogo de fibras con denominaciones estandarizadas; la composición registrada distingue "declarada" de "con evidencia" | Ficha técnica del proveedor, declaración o informe de ensayo (ISO 1833 si existe) | La plataforma no verifica composición ni realiza ensayos; registra y contrasta documentos. |
| Gestión de proveedores | Directorio tipificado con documentos y vigencias | N-03 ISO 22095 (actores de la cadena) | Norma de referencia | Tipos de proveedor textil y asociación de documentos por proveedor | Certificados, fichas, acuerdos con vigencia | No califica ni audita proveedores. |
| Evidencias | Carga, estados, vigencias y vínculos polimórficos | N-05 ISO 14021 (soporte de autodeclaraciones); esquemas N-12/N-13/N-14 como origen documental | Norma de referencia + esquemas de certificación de terceros | Toda afirmación relevante puede vincular su documento; estados pendiente/válida/rechazada/vencida con validación interna | Certificados de esquemas, fichas, ensayos, declaraciones | La validación es interna (revisión documental del supervisor), no verificación de tercera parte. |
| Claims ambientales | Registro de claims con estado de soporte | N-05 ISO 14021 (autodeclaraciones ambientales) | Norma de referencia | Un claim solo pasa a "soportado" con evidencia válida vinculada; redacción guiada prudente | Evidencia válida por claim | La plataforma no valida la veracidad del claim ante terceros; evita greenwashing por diseño, no lo certifica. |
| Material reciclado | Registro del atributo y su evidencia | N-12 GRS/RCS **[esquemas externos]**; N-05 ISO 14021 (condiciones del claim "reciclado") | Esquemas de certificación de terceros + norma de referencia | `scheme_code` como etiqueta del documento aportado; sin cálculo de contenido reciclado (excluido, DL/Q-20) | Certificado de transacción/alcance GRS o RCS vigente | No calcula, verifica ni certifica contenido reciclado; solo archiva y contrasta certificados externos. |
| Material orgánico | Registro del atributo y su evidencia | N-13 OCS/GOTS **[esquemas externos]** | Esquemas de certificación de terceros | Igual que reciclado: etiqueta + documento | Certificado OCS/GOTS vigente con alcance | No certifica origen orgánico ni sustituye al esquema. |
| Recomendaciones de cuidado | Registro de instrucciones de cuidado por referencia | N-06 ISO 3758 (símbolos de cuidado); N-07 ISO 6330 (procedimientos de lavado doméstico) **[complementaria]** | Etiquetado + medición | Campos de cuidado alineados al sistema de símbolos; texto libre complementario | Etiqueta/ficha de cuidado; informes de ensayo si existen | No genera etiquetado certificado ni valida que el símbolo elegido sea el correcto para la prenda. |
| Reparabilidad | Indicador de la matriz de circularidad | N-10 ISO 59020 (medición de circularidad) + N-11 ISO 59004/59010 (principios) **[marco conceptual]** | Medición + marco conceptual | Indicador cualitativo Alta/Media/Baja/No evaluable según información registrada (repuestos, construcción, servicio) | Datos de producto + observaciones; evidencia si existe | Indicador informativo con criterios internos; no es un índice normalizado de reparabilidad. |
| Reutilización | Indicador de la matriz de circularidad | N-10, N-11 (ídem) | Medición + marco conceptual | Potencial de segunda vida según durabilidad declarada y tipo de producto | Datos de producto; ensayos N-17 si existen **[complementaria]** | No garantiza mercado ni vida útil real. |
| Reciclabilidad potencial | Indicador de la matriz de circularidad | N-10, N-11; composición según N-08/N-09 | Medición + marco conceptual + vocabulario | "Reciclabilidad potencial ... con base en la información registrada" (redacción obligatoria), derivada de composición y separabilidad | Composición evidenciada; separabilidad de componentes | No afirma reciclabilidad efectiva: depende de infraestructura local no modelada. |
| Separabilidad | Componentes separables e instrucciones | N-10 (flujos al fin de vida); N-04 (vocabulario) | Medición + vocabulario | `textile_components.is_separable` + instrucciones de separación; alimenta reciclabilidad y pasaporte | Registro de componentes; fotos/fichas opcionales | Criterio interno informativo. |
| Dificultad de reciclaje | Indicador derivado de mezcla de fibras y avíos | N-10; umbrales internos declarados no normativos (monomaterial ≥99 %, mezcla simple ≥70 %, elastano >5 %) | Medición + criterio interno | Clasificación determinista de complejidad de mezcla | Composición registrada | Los umbrales son criterio interno explícito, no norma; se declaran junto al resultado. |
| Circularidad (índice) | "Índice de preparación circular del producto" (DL-12) | N-10 ISO 59020 (medición de circularidad como información) | Medición | Índice 0–100 ponderado sobre los 7 indicadores, con No evaluable y tope del 40 % de peso no evaluable | Matriz completada + fuentes registradas | Nombre y copy prohíben "certificada"; no equivale a certificación ni score oficial. |
| Pasaporte técnico textil | Consolidado versionado por referencia(+lote) | N-01 ESPR/DPP **[contexto: actos delegados textiles pendientes — incertidumbre declarada]**; N-03; N-05 | Regulación (contexto) + normas de referencia | Bloques A–H con datos, evidencias, claims, circularidad y brechas; snapshot inmutable "Aprobado internamente" | Todo lo anterior consolidado | No es el Digital Product Passport oficial ni asegura conformidad futura con sus requisitos. |
| TrazaDocs Textil | Documentos vivos por estructura sugerida | N-05, N-06/N-07, N-10, N-03 según procedimiento (ver `TRAZADOCS_MODEL` §7) | Normas de referencia | 13 estructuras con secciones, tips y normas relacionadas por documento | Documentos aprobados internamente | Tener el documento no equivale a implementar la práctica ni a certificarla. |
| Maestro documental | Inventario de documentos controlados por módulo | — (buena práctica documental; sin norma citada para no inventar soporte) | Buena práctica | Listado con versión, estado y vigencia filtrado por `module_key='textiles'` | Registros del maestro | No constituye un sistema de gestión certificado (p. ej. no implica ISO 9001). |
| Interoperabilidad futura | Proyección del grafo de trazabilidad a eventos estándar | N-15 GS1 EPCIS/CBV **[futuro]** | Estándar de interoperabilidad | Solo criterio de diseño de `textile_traceability_links` (D-19); sin campos ni endpoints EPCIS | n/a | Prohibido afirmar compatibilidad EPCIS mientras no exista implementación. |
| QR futuro | Vista pública reducida de un pasaporte aprobado | N-16 GS1 Digital Link **[futuro]**; N-01 **[contexto]** | Estándar de interoperabilidad + regulación (contexto) | Solo estrategia D-18: lista blanca de campos, identificadores no adivinables, revocación; nada implementado | n/a | No existe QR ni vista pública en el MVP; no prometer fechas ni conformidad DPP. |
| Reportes | Vistas imprimibles de estado y consolidados | N-05 (lenguaje de lo reportado); N-10 (indicadores incluidos) | Normas de referencia | Reportes con las mismas advertencias que sus fuentes; impresión vía navegador | Datos registrados | Un reporte no es un informe de auditoría ni un certificado. |
| Brechas | Matriz de faltantes con criticidad | N-01/N-02 **[contexto]**: la brecha se define frente a la información que estos marcos vuelven relevante | Regulación (contexto) | Brechas por referencia visibles en dashboard y bloque G del pasaporte | Estado de datos/evidencias | Cerrar brechas mejora preparación; no acredita cumplimiento. |

## Cobertura

Las 22 áreas funcionales del encargo están mapeadas; las 16 referencias mínimas
solicitadas (ISO 22095, ISO 5157, ISO 14021, ISO 3758, ISO 59020, ISO 59004, ISO
59010, ESPR (UE) 2024/1781, Estrategia europea textil, GS1 EPCIS, GS1 Digital
Link, GRS, RCS, OCS, GOTS, OEKO-TEX MADE IN GREEN) aparecen al menos una vez.
OEKO-TEX MADE IN GREEN (N-14) opera como los demás esquemas externos: etiqueta de
evidencia aportada por la empresa en el área de Evidencias. Referencias adicionales
del catálogo usadas: ISO 2076 (N-08), serie ISO 1833 (N-09), ISO 6330 (N-07),
ISO 12947/13934 (N-17, complementaria en durabilidad).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La matriz se lee como declaración de conformidad | Encabezado con reglas de lectura + columna de advertencia en cada fila. |
| Divergencia con `NORMATIVE_MAPPING` al evolucionar | Ambos usan el catálogo N-nn; cambios de catálogo actualizan los dos en el mismo PR. |

## Criterios de aceptación

- [ ] 22 áreas mapeadas con las 7 columnas completas.
- [ ] Ninguna norma inventada; referencias futuras/complementarias marcadas.
- [ ] Cada fila tiene advertencia explícita.

## Próximos pasos

1. Validar filas de composición, cuidado y circularidad con experto textil (Q-16).
2. Revisar la fila del pasaporte cuando se publiquen actos delegados del DPP textil.
