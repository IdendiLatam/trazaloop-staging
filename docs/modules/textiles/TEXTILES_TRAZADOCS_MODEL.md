# Trazaloop Textil · Modelo de TrazaDocs Textil

> Sprint T0 — Solo documentación. La decisión técnica aquí propuesta NO crea
> migraciones; se implementa en el sprint T8 del roadmap.

> **Estado (T8 ejecutado)**: la propuesta quedó implementada con la variante
> mínima del encargo T8 — ver
> `TEXTILES_T8_TRAZADOCS_IMPLEMENTATION_REPORT.md` para la estructura REAL:
> `module_key` aditivo en `trazadoc_blueprints`/`trazadoc_documents` con
> herencia por trigger e inmutabilidad (0082), 12 estructuras TXT-MAN-001 …
> TXT-MAT-012 con 140 secciones/tips, envolturas
> `lib/db|domain/textiles-trazadocs.ts` + `server/actions/textiles-trazadocs.ts`
> sobre el motor 0043–0048, y rutas `/textiles/trazadocs*`. Lo no ejecutado en
> T8 (maestro Textil propio, selector de módulo en consola superadmin, conteo
> Demo por módulo) permanece aquí como diseño de referencia.

> **Consolidación T0.1**: este modelo queda ratificado por las decisiones DL-06
> (motor multi-módulo), DL-07 (reutilización con `module_key`, condicionada a no
> romper CPR) y DL-15 (gobierno del superadministrador) del
> `TEXTILES_DECISION_LOG.md`. La implementación es exclusiva del Sprint T8; los
> riesgos multi-módulo se rastrean como R-02/R-03/R-16 en
> `TEXTILES_RISK_REGISTER.md`.

## 1. Objetivo

Definir TrazaDocs Textil: qué es, cómo funciona, qué reutiliza de TrazaDocs CPR, en
qué se diferencia, cómo lo gestiona el superadministrador, qué estructuras sugeridas
ofrece y cómo se integra con diagnóstico, evidencias, circularidad y pasaporte.

## 2. Alcance

Motor documental del módulo Textil (documentos vivos + maestro documental con
archivos controlados). No cubre evidencias técnicas (módulo Evidencias, bucket y
tablas separados — regla heredada de CPR: documentos ≠ evidencias).

## 3. Qué es TrazaDocs Textil

Documentos **vivos** dentro de la plataforma — editables por secciones, con ayudas
contextuales (tips), estados, versionamiento e impresión — específicos del sector
textil: manual de trazabilidad, procedimientos de composición, proveedores, insumos,
órdenes, evidencias, circularidad, pasaporte, claims, cuidado, tercerizados, producto
no conforme y capacitación. Incluye además el **maestro documental Textil**: vista
única de documentos vivos + documentos descargables (archivos controlados subidos por
la empresa), con categorías y export CSV, filtrada por módulo.

Principios heredados de TrazaDocs CPR:
- Documento guiado (desde estructura sugerida) vs documento libre.
- Las estructuras crean secciones **vacías**, nunca contenido de relleno.
- Documento aprobado protegido: solo se modifica creando nueva versión.
- Historial de estados y versiones append-only.

## 4. Qué reutiliza de CPR y qué se diferencia

| Aspecto | Reutiliza de CPR | Diferencia en Textil |
|---|---|---|
| Motor (tablas, acciones, componentes) | `trazadoc_blueprints(+sections)`, `trazadoc_documents(+sections, versions, status_history)`, `trazadoc_file_documents(+versions)`, componentes `components/domain/trazadocs/*`, acciones `trazadocs.ts`/`trazadocs-master.ts` | Se agrega separación lógica por `module_key`; ningún flujo nuevo de motor. |
| Estados | draft / in_review / approved / obsolete | Idénticos (Borrador, En revisión, Aprobado, Obsoleto). |
| Categorías | `category_code` (manual, procedure, instruction, record, technical_support, policy, format, other) | Mismas categorías; ampliación aditiva solo si el piloto lo exige. |
| Estructuras sugeridas | Mecanismo blueprint + secciones + tips + orden + activación | **Contenido 100 % textil** (13 estructuras nuevas, §7); jamás se muestran blueprints CPR en Textil ni viceversa. |
| Límite de plan | `documents_trazadocs` (Demo: 2) | Conteo **por módulo** (decisión D-09): el límite Demo aplica de forma independiente en CPR y en Textil. |
| Maestro documental | Vista unificada + export CSV + archivos controlados | Filtrado por `module_key='textiles'`; bucket/prefijo de storage propio del módulo. |

**Prohibición central**: TrazaDocs Textil no mezcla documentos de CPR con documentos
de Textil — ni en listados, ni en el maestro, ni en conteos, ni en blueprints, ni en
filtros, ni en vistas de impresión.

## 5. Decisión técnica: separación por módulo

Opciones analizadas (detalle comparativo en `TEXTILES_DATA_MODEL_PROPOSAL.md` §5):

1. **Opción A — `module_key` en tablas existentes (RECOMENDADA)**: columna
   `module_key text not null default 'cpr' check (module_key in ('cpr','textiles'))`
   en `trazadoc_blueprints`, `trazadoc_documents` y `trazadoc_file_documents`;
   propagación a vistas (`0045`, `0057+`), filtros, conteos de plan y consola de
   plataforma. Ventajas: un solo motor, cero divergencia, dato CPR intacto por
   default. Riesgo: migración aditiva sobre tablas productivas — mitigado con
   regresión completa CPR y rollback trivial (columna ignorable).
2. **Opción B — tablas específicas Textil**: máxima protección de CPR, pero duplica
   motor, UI, RLS y bugs; el maestro documental se fragmenta. Descartada.
3. **Opción C — motor genérico nuevo multi-módulo**: requiere migrar datos CPR
   productivos; contradice la restricción de no modificar CPR funcionalmente.
   Descartada para esta fase (puede ser evolución futura si llegan más módulos).

Salvaguardas de la Opción A (obligatorias en T8):
- Migración aditiva única, sin renombrar ni borrar nada de CPR.
- Todas las consultas CPR agregan `module_key='cpr'` sin cambiar su semántica.
- Tests de regresión TrazaDocs CPR (crear/editar/versionar/aprobar/imprimir/maestro)
  verdes antes y después.
- El código de dominio expone `module_key` como parámetro tipado
  (`type TrazadocModuleKey = 'cpr' | 'textiles'`), nunca strings sueltos.
- Unicidad de blueprint `code`: pasa de `unique(code)` a
  `unique(module_key, code)` — cambio aditivo evaluado en la misma migración (los
  codes CPR existentes no colisionan).

## 6. Gestión por el superadministrador (consola de plataforma)

Desde `platform/trazadocs` (misma consola CPR, con selector/filtro de módulo), el
superadministrador puede, para el módulo Textil:

- crear estructuras documentales sugeridas (blueprints) textiles;
- editar nombre, descripción, tipo documental y categoría;
- activar/desactivar estructuras (`status active/inactive`; nunca borrar);
- crear, ordenar (`sort_order`) y desactivar secciones;
- definir y actualizar tips/ayudas (`hint`) y textos guía por sección;
- marcar una estructura como **recomendada u obligatoria** (campo nuevo propuesto
  `recommendation_level check in ('suggested','recommended','required')` —
  aditivo; en CPR el default 'suggested' no cambia comportamiento);
- gestionar versiones de estructuras sugeridas (evolución del blueprint sin afectar
  documentos ya creados: los documentos conservan las secciones con las que
  nacieron — comportamiento actual del motor, se conserva);
- mantener totalmente separadas las estructuras CPR y Textil (filtro obligatorio por
  `module_key` en la consola).

El superadministrador **no** gestiona documentos internos de una empresa, salvo
funciones de soporte autorizadas (mismas reglas de `platform_staff` actuales).

## 7. Estructuras documentales sugeridas (13)

Estructura común a todas: cada blueprint define objetivo (descripción), secciones
ordenadas con tips, categoría (`category_code`), nivel de recomendación, y su
relación con normas, evidencias, pasaporte y diagnóstico. Rol responsable por
defecto: administrador de empresa (aprueba); supervisor revisa; consultor redacta.
Estado documental: ciclo estándar §8. Todas nacen con secciones vacías.

| # | Documento sugerido (blueprint) | Categoría | Nivel |
|---|---|---|---|
| 1 | Manual técnico de trazabilidad textil | manual | required |
| 2 | Procedimiento de gestión de composición de fibras | procedure | required |
| 3 | Procedimiento de control de proveedores textiles | procedure | required |
| 4 | Procedimiento de control de insumos textiles y avíos | procedure | recommended |
| 5 | Procedimiento de trazabilidad de órdenes y lotes de confección | procedure | required |
| 6 | Procedimiento de control de evidencias textiles | procedure | required |
| 7 | Procedimiento de evaluación de circularidad del producto | procedure | recommended |
| 8 | Procedimiento de pasaporte técnico textil | procedure | recommended |
| 9 | Procedimiento de gestión de claims ambientales | procedure | recommended |
| 10 | Procedimiento de recomendaciones de cuidado y separación | procedure | recommended |
| 11 | Procedimiento de control de procesos tercerizados | procedure | recommended |
| 12 | Procedimiento de producto textil no conforme | procedure | suggested |
| 13 | Procedimiento de capacitación del personal en trazabilidad textil | procedure | suggested |

Detalle por documento (objetivo · secciones recomendadas · tips ejemplo · normas ·
evidencias asociadas · relación con pasaporte/diagnóstico):

1. **Manual técnico de trazabilidad textil** — Objetivo: describir cómo la empresa
   identifica productos, materiales, proveedores, procesos y evidencias, y cómo
   sostiene su cadena de custodia documental. Secciones: alcance y definiciones
   (glosario ISO 5157); identificación de productos y referencias; modelo de
   trazabilidad (insumo→proceso→lote); responsables; documentos y registros
   relacionados. Tip ejemplo: "Define aquí qué significa 'lote' en tu operación —
   por orden, por corte o por entrega de tela". Normas: N-03, N-04. Evidencias:
   ninguna obligatoria (documento marco). Relación: base del bloque H del pasaporte;
   recomendado cuando D11/D12 del diagnóstico salen bajas.
2. **Gestión de composición de fibras** — Objetivo: asegurar registro y soporte de
   composiciones. Secciones: fuentes de composición; nomenclatura de fibras;
   registro por componente; validación de suma 100 %; manejo de cambios de tela.
   Tip: "Registra la composición del forro y los hilos, no solo la tela principal".
   Normas: N-08, N-09, N-05. Evidencias: fichas técnicas, ensayos ISO 1833,
   declaraciones. Relación: bloque B del pasaporte; dimensión D2 del diagnóstico.
3. **Control de proveedores textiles** — Objetivo: identificar, documentar y mantener
   proveedores con su soporte documental. Secciones: alta de proveedores; documentos
   requeridos por tipo; certificados de esquemas externos; revisión de vigencias.
   Tip: "Distingue proveedor certificado de material certificado — el certificado
   tiene alcance". Normas: N-03; N-12/N-13/N-14 como esquemas archivables.
   Evidencias: certificados, declaraciones, fichas. Relación: bloque C; D4.
4. **Control de insumos textiles y avíos** — Objetivo: catalogar insumos y avíos con
   material y proveedor. Secciones: catálogo de materiales; avíos y componentes;
   empaques; recepción y lotes de entrada. Tip: "Incluye marquillas y etiquetas: son
   componentes con material propio". Normas: N-03, N-08. Evidencias: fichas de
   insumos. Relación: bloques B/C; D7.
5. **Trazabilidad de órdenes y lotes de confección** — Objetivo: definir cómo se
   conecta orden→insumos→procesos→lote terminado. Secciones: creación de órdenes;
   asignación de lotes de entrada; registro de procesos; cierre de orden y lote de
   salida; reconstrucción de cadena. Tip: "Prueba mensualmente reconstruir la cadena
   de una orden al azar". Normas: N-03; N-15 futuro. Evidencias: remisiones,
   registros de producción. Relación: bloque C; D5.
6. **Control de evidencias textiles** — Objetivo: gobernar carga, validación,
   vigencia y asociación de evidencias. Secciones: tipos de evidencia; criterios de
   validez; responsables; vigencias y alertas; asociación a objetos. Tip: "Una
   evidencia vencida no desaparece: cambia de estado y genera brecha". Normas: N-03,
   N-05. Evidencias: n/a (las gobierna). Relación: bloque D; D3.
7. **Evaluación de circularidad del producto** — Objetivo: definir cómo y quién
   evalúa los 7 indicadores. Secciones: indicadores y definiciones; información
   mínima; procedimiento de evaluación; aprobación interna; actualización por
   cambios. Tip: "Si falta información, el resultado es 'No evaluable' — nunca se
   estima". Normas: N-04, N-10, N-05. Evidencias: las referenciadas por la matriz.
   Relación: bloque F; D9.
8. **Pasaporte técnico textil** — Objetivo: definir generación, revisión, aprobación
   interna y obsolescencia de pasaportes. Secciones: cuándo se genera; contenido
   mínimo; revisión; nueva versión; comunicación a compradores. Tip: "El pasaporte
   aprobado es una foto: los cambios van a una versión nueva". Normas: N-01
   (contexto), N-03, N-05. Relación: es el procedimiento del propio pasaporte; D12.
9. **Gestión de claims ambientales** — Objetivo: controlar qué claims se declaran y
   con qué soporte. Secciones: claims permitidos; requisitos de evidencia por claim;
   redacción (especificidad, alcance, limitaciones); revisión y retiro de claims.
   Tip: "'Reciclable' exige más que composición: considera separabilidad y ruta".
   Normas: N-05; N-12/N-13. Evidencias: por claim. Relación: bloque E; D10.
10. **Recomendaciones de cuidado y separación** — Objetivo: definir criterio para
    cuidado y para instrucciones de separación. Secciones: criterios de cuidado por
    tipo de tela; símbolos; separación de componentes; comunicación al usuario.
    Tip: "Anota el origen del criterio: proveedor, ensayo o experiencia
    documentada". Normas: N-06, N-07, N-04. Relación: bloque F; D8.
11. **Control de procesos tercerizados** — Objetivo: mantener custodia documental al
    tercerizar. Secciones: terceros aprobados; envío y retorno de material;
    evidencias de proceso; verificación. Tip: "La remisión firmada es tu evidencia
    mínima de transferencia de custodia". Normas: N-03. Relación: bloque C; D6.
12. **Producto textil no conforme** — Objetivo: registrar y disponer producto no
    conforme sin romper trazabilidad (segundas, reproceso, retazos). Secciones:
    identificación; segregación; disposición; registro. Tip: "El destino de las
    segundas también es información de circularidad". Normas: N-03, N-04.
    Relación: bloques C/G; D5/D9. (No es módulo de acciones correctivas.)
13. **Capacitación del personal en trazabilidad textil** — Objetivo: asegurar que el
    personal conozca los procedimientos según su rol. Secciones: matriz de roles y
    temas; plan de capacitación; registros de asistencia; evaluación de comprensión.
    Tip: "Prioriza a quien registra lotes y carga evidencias". Normas: N-03 (soporte
    de práctica consistente). Evidencias: registros de capacitación. Relación:
    D11 (pregunta 55).

## 8. Roles y estados documentales

Roles (mapeados a los roles reales del sistema — `admin`, `quality` con etiqueta
"Supervisor", `consultant`):

| Rol | Permisos en TrazaDocs Textil |
|---|---|
| Administrador de empresa (`admin`) | Crear, editar, enviar a revisión, aprobar, obsoletar y gestionar documentos de su empresa. |
| Supervisor / calidad (`quality`) | Revisar y editar; **aprobar solo si la política del módulo lo permite** (flag de configuración por organización, decisión D-06; por defecto: puede aprobar, igual que hoy en CPR). |
| Consultor (`consultant`) | Crear y editar borradores, proponer cambios, enviar a revisión; **no aprueba**. |
| Superadministrador | No gestiona documentos internos salvo soporte autorizado; gestiona estructuras globales, tips, categorías y versiones sugeridas del módulo Textil (§6). |

Nota de implementación: hoy el motor CPR permite editar draft/in_review a los 3
roles por igual y las transiciones se controlan en `0046_trazadocs_status_transitions`.
La restricción "consultor no aprueba" y el flag de aprobación del supervisor son
ajustes de política **por módulo** a introducir sin romper CPR (guardas en server
actions + política RLS condicionada a `module_key='textiles'`).

Estados y versionamiento (idéntico a CPR):

- **Borrador → En revisión → Aprobado → Obsoleto.**
- Versión inicial v1 al crear; el documento aprobado queda protegido (sin edición
  directa); "nueva versión desde aprobado" crea v+1 en Borrador copiando contenido;
  la aprobación registra aprobador y fecha; la obsolescencia conserva el documento;
  impresión disponible por versión; exportación futura (PDF) fuera de MVP;
  trazabilidad de cambios vía `trazadoc_document_versions` +
  `trazadoc_status_history` (append-only).

## 9. Integración con el resto del módulo

| Con | Cómo |
|---|---|
| Diagnóstico | Niveles bajos en D2–D12 sugieren crear los blueprints correspondientes (mapa dimensión→documento del §7). |
| Evidencias | Los procedimientos 2, 3, 6, 9 y 11 definen la política que el módulo Evidencias operacionaliza; los documentos pueden citarse desde brechas. |
| Pasaporte técnico | Bloque H lista documentos relacionados (código, versión, estado); el procedimiento 8 gobierna el ciclo del pasaporte. |
| Circularidad | El procedimiento 7 define responsables y criterios de la matriz. |
| Maestro documental | Vivos + descargables Textil en una sola vista con export CSV. |

## 10. Cambios técnicos futuros necesarios (T8, sin ejecutar ahora)

1. Migración aditiva `module_key` (3 tablas + vistas + unique de blueprint).
2. Campo `recommendation_level` en blueprints (aditivo).
3. Parámetros `module_key` en `lib/db|domain/trazadocs*` y acciones.
4. Filtro de módulo en consola `platform/trazadocs` y en maestro.
5. Conteo de plan por módulo (`documents_trazadocs` por module_key — D-09).
6. Seed de los 13 blueprints textiles (secciones + tips), solo en T8.
7. Tests: regresión CPR completa + tests de aislamiento entre módulos (un documento
   textil jamás aparece en vistas CPR y viceversa) + tests de política de roles.

## 11. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Documentos vivos de trazabilidad | N-03, N-04 | Estructuras y terminología alineadas a cadena de custodia y vocabulario textil. | Conformidad documental con ISO ni sistema de gestión certificado. |
| Procedimientos de claims/cuidado/circularidad | N-05, N-06/N-07, N-10 | Secciones y tips que orientan práctica prudente. | Que seguir el procedimiento garantice validez de claims o etiquetas. |
| Control documental (estados/versiones) | Buenas prácticas de control documental (soporte a N-03) | Estados, versiones e historial append-only. | Equivalencia con requisitos ISO 9001. |

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper TrazaDocs CPR con `module_key` | Default 'cpr', migración aditiva, regresión completa, rollback simple. |
| Mezcla de módulos por un filtro olvidado | Parámetro tipado obligatorio en capa de dominio; tests de aislamiento; revisión de todas las vistas 0045/0057+. |
| Blueprints textiles genéricos o de relleno | Redacción con experto textil en piloto; secciones nacen vacías (regla del motor). |
| Conteo Demo compartido entre módulos penaliza al usuario | Decisión D-09: límite por módulo, documentado en guía de planes. |

## 13. Criterios de aceptación (para el sprint futuro de implementación, T8)

- [ ] CPR: todas las rutas y flujos TrazaDocs funcionan idéntico (regresión verde).
- [ ] Un blueprint/documento textil nunca aparece en contexto CPR y viceversa.
- [ ] Superadmin crea/edita/ordena/activa estructuras textiles desde la consola con
  filtro de módulo.
- [ ] Los 13 blueprints sembrados con secciones y tips; documentos nacen vacíos.
- [ ] Política de roles textil aplicada (consultor no aprueba; flag de supervisor).
- [ ] Límite Demo contado por módulo.
- [ ] Maestro documental Textil operativo con export CSV filtrado.

## 14. Próximos pasos

1. Validar los 13 blueprints (nombres, secciones, tips) con experto/piloto.
2. Resolver Q-17/Q-18 (gestión superadmin y obligatoriedad) antes de T8.
3. Redactar la migración propuesta de `module_key` (sin aplicar) al inicio de T8.
