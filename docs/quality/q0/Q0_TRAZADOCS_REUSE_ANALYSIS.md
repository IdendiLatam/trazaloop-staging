# Q0_TRAZADOCS_REUSE_ANALYSIS

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Pregunta que responde:** ¿puede TrazaDocs convertirse en el **Motor Documental Transversal** que
exige el baseline (D-16, DA-19, Maestro §7.4), y qué parte se reutiliza, evoluciona o descarta?
**Migraciones leídas íntegras:** 0043, 0044, 0045, 0046, 0047, 0048, 0057, 0058, 0082, 0083

---

## 1. Veredicto

**TrazaDocs es una base sólida y debe EVOLUCIONAR, no reemplazarse.** No debe crearse un segundo
motor documental para Quality (D-16, Maestro §7.4, decisión ya congelada).

Pero conviene ser preciso sobre qué es hoy: TrazaDocs implementa **control de versiones y
trazabilidad de estado**, no **control de vigencia documental**. La distinción es exactamente la
que el baseline separa en D-06 (aprobación ≠ vigencia) y es la brecha estructural principal.

| Dimensión | Estado |
|---|---|
| Identidad documental estable | PARCIAL |
| Versionado append-only | IMPLEMENTADO |
| Inmutabilidad de lo aprobado | IMPLEMENTADO |
| Estados y transiciones controladas | IMPLEMENTADO |
| **Aprobación ≠ vigencia** | **NO IMPLEMENTADO** |
| **Revisión periódica** | **NO IMPLEMENTADO** |
| **Obsolescencia diferenciada** | **NO IMPLEMENTADO** |
| Secciones estructuradas | IMPLEMENTADO |
| Archivos controlados | IMPLEMENTADO |
| Storage y cuota | IMPLEMENTADO (modelo maduro) |
| Histórico | IMPLEMENTADO |
| Permisos | IMPLEMENTADO (por rol) |
| Listado maestro derivado | IMPLEMENTADO |
| **Exportación PDF servidor** | **NO IMPLEMENTADO** |
| **Documentos externos controlados** | **NO IMPLEMENTADO** |
| **Flujo con múltiples revisores/aprobadores** | **NO IMPLEMENTADO** |
| **Propietario = cargo** | **NO IMPLEMENTADO** |
| Multi-módulo | IMPLEMENTADO |

---

## 2. Qué existe exactamente

### 2.1 Ocho tablas, dos familias

**Familia A — documentos VIVOS** (editables por secciones dentro de la plataforma):

```text
trazadoc_blueprints          estructuras sugeridas GLOBALES (no org-scoped)
  └ trazadoc_blueprint_sections

trazadoc_documents           documento de la empresa (org-scoped)
  ├ trazadoc_document_sections    contenido vivo por sección
  ├ trazadoc_document_versions    snapshots JSONB append-only
  └ trazadoc_status_history       historial de estado append-only
```

**Familia B — documentos DESCARGABLES** (archivos controlados, no editables):

```text
trazadoc_file_documents
  └ trazadoc_file_document_versions
```

Ambas familias se unifican para el usuario en la vista `v_trazadoc_document_master`.

### 2.2 Multi-módulo — ya resuelto

La migración 0082 añadió `module_key` de forma **aditiva** con `default 'cpr'` y backfill
automático, más un trigger `set_trazadoc_document_module_key()` que impone la verdad en servidor:

- si el documento nace de una estructura, **hereda** el `module_key` de esa estructura y se ignora
  cualquier valor enviado por el cliente;
- en `UPDATE` el módulo es **inmutable**: un documento jamás cruza de módulo.

El encabezado de 0082 lo dice explícitamente: *"NO se crea un motor nuevo ni se duplican tablas."*

**Esto es la prueba de que el motor ya demostró ser extensible a un módulo nuevo sin duplicación.**
Quality sería el tercer consumidor (`module_key = 'quality'`), siguiendo un camino ya recorrido y
probado. Es el hallazgo más importante de este documento.

### 2.3 Modelo de versionado real

`change_trazadoc_document_status(p_document_id, p_to_status, p_change_note)` — `security definer`,
atómica, corre con la sesión real del usuario (nunca `service_role`). En una sola transacción:

1. bloquea el documento (`for update`);
2. valida membresía y rol;
3. construye un **snapshot JSONB** de todas las secciones tal como están;
4. inserta en `trazadoc_document_versions` (append-only);
5. inserta en `trazadoc_status_history` (append-only);
6. actualiza el documento: estado, `current_version`, `approved_by/at`, `obsolete_at`.

Estados: `draft → in_review → approved → obsolete` (y reactivación).

### 2.4 Inmutabilidad de lo aprobado

Corregido en 0047 tras detectarse como bloqueante. La política de `UPDATE` directo exige
`status in ('draft','in_review')` **para los tres roles por igual** — ya no hay excepción para
admin/quality. Un documento aprobado **no se edita**: se crea una versión nueva en borrador.

0083 añadió defensa en profundidad a nivel de base: un trigger impide insertar secciones en un
documento aprobado u obsoleto vía API directa, y hace `document_id` y `section_key` inmutables
para que una sección no pueda "mudarse" de documento.

### 2.5 Permisos

| Rol | Puede |
|---|---|
| `admin` | Todo, incluida reactivación de obsoletos |
| `quality` | Crear, editar en borrador/revisión, aprobar, marcar obsoleto |
| `consultant` | Crear y editar solo en borrador/revisión; **nunca** aprueba, marca obsoleto ni reabre un aprobado |

La restricción del consultor se aplica **tres veces**: en la política RLS, dentro de la función
`security definer`, y con una comprobación explícita del estado de **origen** (añadida en 0047 al
detectarse que solo se miraba el estado destino, permitiendo reabrir un aprobado moviéndolo a
`draft`).

### 2.6 Listado maestro

`v_trazadoc_document_master` unifica ambas familias con `union all`, normaliza categorías a
etiquetas en español y expone `action_type` (`open` / `download`).

**Es una proyección derivada, no una tabla paralela.** Cumple D-13 y MDR-16 tal cual.

### 2.7 Archivos y almacenamiento

Bucket privado `trazadocs-documents`, separado de `evidences` y `organization-assets`. El ciclo de
subida es el modelo maduro descrito en `Q0_DATABASE_SCHEMA_INVENTORY.md` §9: intent durable →
subida autorizada por política ligada al intent → verificación física del objeto en servidor →
finalización server-only con tamaño y MIME **reales**.

Un reemplazo es siempre **un objeto nuevo** en una ruta `vN+1`; el anterior queda como versión
histórica y **sigue contabilizado**. `UPDATE` y `DELETE` directos sobre objetos TrazaDocs están
prohibidos por ausencia de política (0101).

---

## 3. Brechas frente al baseline documental (D-01 … D-30)

| Decisión | Estado | Detalle |
|---|---|---|
| **D-01** Documento ≠ archivo | PARCIAL | Se distinguen documento vivo y documento-archivo, pero en la familia B los metadatos del archivo (`storage_path`, `file_name`, `mime_type`, `size_bytes`) viven **en la fila del documento**, no en una entidad de contenido separada |
| **D-02** Revisión aprobada inmutable | **IMPLEMENTADO** | Append-only real + RLS por estado + trigger |
| **D-03** Secuencia interna ≠ etiqueta visible | PARCIAL | La familia B tiene `version_label` además de `current_version`; la familia A deriva la etiqueta como `'v' || current_version` |
| **D-04** Códigos no reciclados | **NO IMPLEMENTADO** | `code` es `text` **nullable sin restricción de unicidad** en ambas familias. Nada impide dos documentos con el mismo código, ni reutilizar el código de uno obsoleto |
| **D-05** Preparación / decisión / publicación diferenciadas | PARCIAL | Existen `draft`/`in_review`/`approved`, pero decisión y publicación coinciden |
| **D-06** Vigencia programada | **NO IMPLEMENTADO** | No hay `effective_from`/`effective_to`. Aprobar = poner en vigor, en el mismo instante |
| **D-07** Cambios disparan análisis de impacto | NO IMPLEMENTADO | No existe motor de impacto |
| **D-08** Revisión periódica sin cambios no crea versión | **NO IMPLEMENTADO** | No existe el concepto de revisión periódica |
| **D-09** Revisión vencida no vuelve obsoleto | n/a | No aplica: no hay revisión periódica |
| **D-10** Disposición final controlada | PARCIAL | No hay borrado (correcto), pero tampoco disposición formal |
| **D-11** El registro conserva la revisión exacta de la plantilla | **NO IMPLEMENTADO** | `blueprint_id` apunta al blueprint, **no a una revisión del blueprint**: los blueprints no están versionados. Si se edita un blueprint, los documentos ya creados pierden la referencia a la estructura con la que nacieron |
| **D-12** Nueva revisión dispara lectura/formación | NO IMPLEMENTADO | Sin motor de eventos |
| **D-13** Listado maestro derivado | **IMPLEMENTADO** | `v_trazadoc_document_master` |
| **D-14** IA distingue dato real de sugerencia | n/a | No hay IA |
| **D-15** Resolver la revisión válida en una fecha histórica | PARCIAL | Se puede reconstruir por `created_at` de las versiones, pero **no** por vigencia de negocio, porque no existe |
| **D-16** Motor documental transversal derivado de TrazaDocs | **EN CAMINO** | `module_key` demuestra la extensibilidad; falta formalizarlo |
| **D-17** Propietario preferentemente un cargo | **NO IMPLEMENTADO** | `owner_id → profiles` (persona/usuario). No existe entidad Cargo |
| **D-18** Múltiples revisores/aprobadores | **NO IMPLEMENTADO** | Un solo `approved_by` |
| **D-19** Rutas secuenciales y paralelas | **NO IMPLEMENTADO** | Sin motor de workflow |
| **D-20** Decisiones de revisión inmutables | IMPLEMENTADO | `trazadoc_status_history` append-only |
| **D-21** Documentos externos como objetos controlados | **NO IMPLEMENTADO** | No existe `external_documents` |
| **D-22** Documento/plantilla/registro/evidencia/archivo distintos | PARCIAL | Documento y plantilla sí; **registro no existe** como concepto; evidencia vive en otro sistema |
| **D-23** Obsolescencia por sustitución o retiro | **NO IMPLEMENTADO** | Un único estado `obsolete`; no se distingue *superseded* / *retired* / *archived* |
| **D-24** Documentos relacionados con actividades de proceso | NO IMPLEMENTADO | No existen procesos |
| **D-25** Cambios de proceso/cargo disparan revisión documental | NO IMPLEMENTADO | Sin motor de impacto |
| **D-26** Exportaciones son representaciones | IMPLEMENTADO | Impresión del navegador; el PDF nunca es fuente |
| **D-27** IA respeta permisos | n/a | No hay IA |
| **D-28** Migrar documentación sin asumir vigencia | NO IMPLEMENTADO | No hay flujo de migración documental |
| **D-29** Caracterización derivada de datos de proceso | NO IMPLEMENTADO | No existen procesos |
| **D-30** Vincular a un requisito no implica conformidad | n/a | No existe el vínculo documento↔requisito |

### 3.1 La brecha estructural: versión ≠ vigencia

El modelo actual incrementa `current_version` **en cada cambio de estado**, incluido
`draft → in_review`. Un documento que pasa por borrador, revisión y aprobación llega a **v4** sin
que su contenido haya cambiado tres veces.

Esto significa que `current_version` **no es un número de revisión documental** en el sentido
normativo: es un contador de transiciones. Para un sistema de gestión donde el usuario dice
*"estamos en la revisión 2 del procedimiento"*, el número mostrado hoy no corresponde.

Combinado con la ausencia de `effective_from`/`effective_to`, la consecuencia es que **el sistema
no puede responder la pregunta que el baseline pone como central** (§2.5, D-15, Maestro §24):

> ¿Qué revisión de este documento estaba vigente el 14 de marzo?

Puede responder *"qué versión se creó antes de esa fecha"*, que es una pregunta distinta.

**Es la brecha que más condiciona el diseño de Quality**, porque auditorías (AR-05, AR-17),
revisión por la dirección (RD-04) y trazabilidad temporal de la IA (AT-19) dependen de ella.

---

## 4. Clasificación por componente

### REUTILIZAR sin cambios

| Componente | Motivo |
|---|---|
| Patrón RLS por rol y estado | Correcto y probado |
| `trazadoc_status_history` | Historial append-only bien modelado |
| Ciclo de subida por intent + verificación física + finalización server-only | El mejor patrón del repositorio |
| Bucket `trazadocs-documents` y su contabilidad de cuota | Funciona y está integrado con el motor de cuotas |
| `v_trazadoc_document_master` como patrón de proyección | Cumple D-13 y MDR-16 |
| Triggers de integridad (0083) | Defensa en profundidad correcta |
| `module_key` como eje de segmentación | Ya probado con Textiles |

### EVOLUCIONAR

| Componente | Evolución necesaria |
|---|---|
| `trazadoc_documents` | Separar **identidad** de **revisión**; añadir `effective_from`/`effective_to`; separar aprobación de vigencia |
| `trazadoc_document_versions` | Pasar de "snapshot por transición" a **revisión de negocio** con numeración propia y etiqueta visible independiente |
| `change_trazadoc_document_status` | Añadir vigencia programada, sustitución explícita y revisión periódica sin nueva versión |
| `trazadoc_blueprints` | **Versionar los blueprints** para satisfacer D-11/MDR-15 |
| `owner_id` | Migrar de persona a **cargo**, conservando la persona en los actos históricos (MDR-33) |
| `code` | Añadir unicidad por organización y política de no reciclaje (D-04) |
| `module_key` | Admitir `'quality'` |

### CREAR

| Componente | Motivo |
|---|---|
| `external_documents` + versiones | D-21; no existe nada equivalente |
| Concepto de **registro** (`quality_records`) | D-22; hoy no existe |
| Workflow de revisión/aprobación con múltiples actores | D-18, D-19 |
| Vínculos documento ↔ proceso / actividad / requisito | D-24, D-30 |
| Revisión periódica programada | D-08, D-09 |
| Exportación PDF en servidor | Ver §5 |

### ADAPTAR

Nada requiere adaptación destructiva. La evolución puede ser aditiva en su totalidad.

### DEPRECAR

**Nada.** Ningún componente de TrazaDocs debe deprecarse. Incluso el contador `current_version`,
que semánticamente no es una revisión, debe conservarse por compatibilidad con los documentos CPR
y Textiles existentes; la revisión de negocio debe ser un concepto **nuevo y paralelo**, no una
reinterpretación del contador actual.

### POSPONER

- Comparación de versiones (diff por sección).
- Migración masiva de documentación histórica (D-28).
- Lectura obligatoria y formación disparada por revisión (D-12).

---

## 5. Exportación: divergencia documentada

**No existe generación de PDF en servidor.** Las rutas `(print)` son vistas optimizadas con
`@media print` y el PDF lo produce el navegador. El código lo declara explícitamente:

> *"NO genera PDF en servidor — Parte 20: «Usar impresión del navegador. No generar PDF
> server-side todavía.»"*

No hay ninguna dependencia de PDF en `package.json` (las 8 dependencias de producción no incluyen
ninguna).

Esto **diverge** del `Trazaloop_Documento_Maestro_Producto_v1.1.md`, cuya historia **H1.19** y
sección 13 exigen *"PDF, render del lado del servidor"* con marca de agua por estado
(`OBSOLETO` / `BORRADOR`).

Se registra como **gap de implementación** frente al documento de producto, no como defecto de
Quality: es una decisión de alcance tomada y documentada en su momento.
→ Decisión requerida **DR-06**.

---

## 6. Riesgo si Quality ignora este análisis

Si Quality crea sus propias tablas documentales (`quality_documents`, `document_identities`,
`document_revisions`), el resultado sería:

- **dos motores documentales** en la misma plataforma, con dos listados maestros, dos ciclos de
  estado y dos buckets;
- violación directa de **D-16**, **MDR-02**, **§34** ("no crear `quality_documents` si TrazaDocs ya
  contiene el motor reutilizable de identidad/revisión") y del Maestro §7.4;
- los documentos CPR y Textiles existentes quedarían fuera del sistema de gestión, que es
  precisamente lo que Quality debe evitar.

**La ruta correcta es evolucionar TrazaDocs y añadir `module_key = 'quality'`**, exactamente como
hizo Textiles en 0082.

---

## 7. Decisión que el baseline ya cerró

D-16 y DA-19 están **congeladas**: TrazaDocs evoluciona hacia el motor documental transversal. Este
análisis **confirma que es técnicamente viable** y que el propio motor ya demostró la extensión
multi-módulo sin duplicar tablas.

Lo que queda abierto no es *si* evolucionar, sino *cuánta* semántica documental incorporar antes
del primer corte vertical de Quality. → Decisión requerida **DR-05**.
