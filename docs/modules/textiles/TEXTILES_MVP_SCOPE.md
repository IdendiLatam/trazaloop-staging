# Trazaloop Textil · Alcance del MVP

> Sprint T0 — Solo documentación.

## 1. Objetivo

Definir un MVP realista de Trazaloop Textil: qué entra, qué no entra, y cómo se
escalona entre MVP privado, piloto, versión comercial y futuro avanzado.

## 2. Alcance

Alcance funcional del MVP y sus exclusiones. El orden de construcción está en
`TEXTILES_IMPLEMENTATION_ROADMAP.md`.

## 3. Principios del MVP

1. Privado por defecto: feature flag + activación por organización; nada público.
2. Datos parciales permitidos: la plataforma muestra brechas, no bloquea captura.
3. Todo resultado con advertencia de no certificación.
4. Nada que exija integraciones externas, verificación de terceros o requisitos DPP
   aún indefinidos.

## 4. Incluido en el MVP

| Capacidad | Alcance MVP |
|---|---|
| Diagnóstico inicial textil | Wizard de 12 dimensiones / 58 preguntas, nivel de madurez, brechas iniciales; Demo sin recomendaciones avanzadas. |
| Productos textiles | CRUD con categoría, colección, país de confección, estados. |
| Referencias/SKU | CRUD vinculado a producto, versión de ficha; talla/color como atributos simples. |
| Composición de fibras | Editor porcentual por producto/referencia/material/componente con catálogo de fibras y semáforo de evidencia. |
| Proveedores | CRUD con tipos textiles y documentos asociados. |
| Insumos/componentes | Catálogo de materiales + componentes del producto con separabilidad. |
| Evidencias | Carga, estados (pendiente/válida/rechazada/vencida), vigencias, vínculos polimórficos; validación interna por supervisor. |
| Órdenes/lotes | Órdenes de confección, ruta simple de procesos (incl. tercerizados), lotes de entrada y salida, vínculos de trazabilidad y vista de cadena. |
| Evaluación circular básica | Matriz de 7 indicadores + índice de preparación circular con niveles y advertencia. |
| Brechas | Matriz de brechas por referencia con criticidad, visible en dashboard y pasaporte. |
| Pasaporte técnico imprimible | Generación de snapshot versionado + vista imprimible del navegador (patrón `(print)`); estados Borrador/En revisión/Aprobado internamente/Obsoleto. |
| TrazaDocs Textil básico | Motor multi-módulo (`module_key`), 13 estructuras sugeridas, documentos vivos + maestro documental filtrado, gestión superadmin. |
| Dashboard simple | Conteos, estado de diagnóstico, pasaportes por estado, brechas priorizadas, siguiente paso. |
| Claims documentados | Registro de claims con evidencia y estado de soporte (parte del flujo de evidencias/pasaporte). |

## 5. Excluido del MVP (lista vinculante)

QR público · blockchain · integración con ERP · integración con certificadoras ·
pasaporte europeo oficial completo (DPP) · ACV · huella de carbono · marketplace ·
IA · auditorías completas · módulo de acciones correctivas · firma electrónica ·
trazabilidad prenda a prenda · portal de proveedores · cálculo de contenido reciclado
textil · exportación PDF server-side · API pública.

Cualquier PR que introduzca uno de estos elementos en fase MVP se rechaza por alcance.

## 6. Fases

| Fase | Qué es | Criterio de salida |
|---|---|---|
| **MVP privado** (T1–T11) | Módulo completo del §4, invisible al público, datos reales solo de organizaciones internas de prueba | Checklist QA textil + regresión CPR verde + RLS auditada. |
| **Piloto con empresas** | 1–3 confeccionistas reales activadas por superadmin; acompañamiento y feedback | Diagnóstico + ≥1 pasaporte aprobado internamente por empresa; validación de blueprints y umbrales de circularidad. |
| **Versión comercial** | Activación por plan (Demo con límites textiles definidos, Full/Extra), textos legales revisados, guías de usuario | Límites de plan sembrados; documentación de usuario final; soporte entrenado. |
| **Futuro avanzado** | QR/vista pública controlada, exportes PDF/JSON, interoperabilidad GS1/EPCIS, alineación con actos delegados DPP, contenido reciclado textil (rediseño metodológico), integraciones | Cada elemento con su propio análisis normativo y de producto. |

## 7. Límites de plan en MVP (orientativos, a confirmar en fase comercial)

| Recurso | Demo | Full/Extra |
|---|---|---|
| Productos + referencias | 3 / 10 | Ilimitado |
| Proveedores / materiales | 5 / 10 | Ilimitado |
| Evidencias | 10 | Ilimitado |
| Órdenes / lotes | 3 / 6 | Ilimitado |
| Documentos TrazaDocs Textil | 2 (conteo por módulo, D-09) | Ilimitado |
| Pasaportes | 1 (borrador) | Ilimitado |

Durante el MVP privado y el piloto no se aplican límites (módulo activado
manualmente); los valores anteriores son la propuesta para el sprint de planes.

> **Actualización T0.2 (DL-20/DL-22)**: estos límites se aplicarán como plan
> **por módulo** (Textil en Demo/Full/Extra independiente del plan de CPR), sobre
> el modelo de `TRAZALOOP_MODULE_PLANS_DECISION.md`, en el sprint futuro
> Plataforma-M1. Durante MVP privado y piloto no se implementa nada de planes.

## 8. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Alcance MVP completo | N-01/N-02 (contexto), N-03, N-04, N-05, N-08/N-09, N-06/N-07, N-10 | El MVP cubre información y evidencias base que estas referencias vuelven relevantes. | Cumplimiento del ESPR/DPP ni de norma alguna. |
| Exclusión de QR/interoperabilidad | N-15/N-16 | Declaradas referencia futura. | Compatibilidad GS1 actual. |
| Exclusión de contenido reciclado textil | N-12 | Solo archivo de certificados GRS/RCS. | Cálculo o verificación de contenido reciclado. |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Presión por adelantar QR/pasaporte público | Lista vinculante §5 + preguntas abiertas Q-12/Q-13/Q-14 antes de cualquier diseño. |
| MVP demasiado ancho para el equipo | El roadmap permite recortar T10 (reportes/importaciones) sin romper el núcleo diagnóstico→pasaporte. |
| Pilotos con datos sensibles | Acuerdos de piloto + RLS auditada antes de activar empresas reales. |

## 10. Criterios de aceptación

- [ ] Todo elemento del §4 tiene módulo funcional, datos y sprint asignado.
- [ ] Ningún elemento del §5 aparece en el roadmap T1–T11.
- [ ] Las fases tienen criterios de salida verificables.

## 11. Próximos pasos

1. Confirmar candidatos de piloto (Q-15) durante T1–T2.
2. Revisar límites Demo propuestos al llegar al sprint de planes (fase comercial).
