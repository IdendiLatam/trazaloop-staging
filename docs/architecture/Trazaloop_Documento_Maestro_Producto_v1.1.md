# Trazaloop — Documento Maestro de Producto v1.1

**Versión:** 1.1 (revisión crítica y priorización ejecutable de la v1.0)
**Cambio de enfoque:** de "visión estratégica amplia" a "ruta de desarrollo realista con MVP Alpha acotado"
**Stack objetivo:** Next.js · Supabase (PostgreSQL, Auth, Storage) · Row Level Security · Vercel

> Esta versión **corrige** la lógica de clasificación de contenido reciclado, **reduce** el MVP a un Alpha validable con una empresa piloto, y añade la **capa ejecutable** (backlog, historias, criterios de aceptación, tablas, pantallas). La visión modular futura se conserva; se distingue explícitamente qué se **diseña desde el inicio** y qué se **construye después**. No contiene código.

---

## 1. Diagnóstico crítico del documento actual (v1.0)

La v1.0 es sólida como **visión estratégica** pero débil como **plan de ejecución**. Problemas concretos:

| # | Problema en la v1.0 | Consecuencia | Corrección en v1.1 |
|---|---------------------|--------------|--------------------|
| 1 | **Error normativo**: la tabla trataba el material postindustrial como "Sí\*" (cuenta como reciclado). | Riesgo de sobre-declaración de contenido reciclado; no conformidad y riesgo legal. | Postindustrial pasa a **categoría separada que por defecto NO cuenta**; reclasificar requiere soporte documental y justificación. (Sección 14) |
| 2 | **MVP demasiado amplio**: casi todo el producto cabía en "Fase 1". | Alto riesgo de no lanzar nunca; imposible validar con un piloto. | MVP dividido en **Fase 0 → Alpha → Beta → 1.0 → Expansión**, con Alpha mínimo. (Secciones 4–6) |
| 3 | **No ejecutable**: sin backlog, historias, criterios de aceptación ni definición de "hecho". | El equipo no puede planear sprints ni saber cuándo terminó. | Se añaden épicas, historias Fase 0/1, criterios de aceptación y DoD. (Secciones 7–10) |
| 4 | **Frontera Alpha/Beta difusa** en Audit y expediente. | Alcance ambiguo, scope creep. | Audit y expediente completo se mueven explícitamente a Beta/1.0. (Sección 16) |
| 5 | **Riesgo de sobre-ingeniería temprana** (vistas materializadas, *controlled blending*). | Distrae del corazón del Alpha. | Se marcan como "no construir todavía". (Sección 16) |
| 6 | **Diseñar-desde-el-inicio vs. construir-después** no estaba explícito. | Confusión sobre qué modelar ya. | Tabla de decisión clara. (Sección 3) |
| 7 | Criterios de aceptación existían, pero para el MVP amplio. | No servían para cerrar un Alpha. | DoD específico del **MVP Alpha**. (Sección 10) |

Lo que **se conserva** de la v1.0 (sigue vigente): arquitectura de marca, las tres decisiones estructurales (marco normativo como datos, multiempresa con membresías + RLS, genealogía de lotes con cálculo en snapshots inmutables), y la visión modular futura.

---

## 2. Cambios principales realizados en la v1.1

1. **Corrección normativa del contenido reciclado.** Solo cuentan preconsumo y postconsumo **válidamente soportados**. Postindustrial = categoría separada, por defecto NO cuenta. Material recuperado en el mismo proceso (scrap, retales, desbastes, mermas, reproceso) **nunca** cuenta. Controles y advertencias explícitas.
2. **Reducción y fasado del MVP** en cinco fases (0 a 4) con un **Alpha mínimo validable con un piloto**.
3. **Capa ejecutable añadida:** backlog por épicas, historias de usuario para Fase 0 y Fase 1, criterios de aceptación por historia, definición de "hecho" del Alpha, tablas mínimas, pantallas mínimas y reportes mínimos.
4. **Separación explícita** entre lo que se diseña desde el inicio y lo que se construye después.
5. **Lista de riesgos críticos del Alpha** y **lista de "qué no construir todavía"**.
6. **Visión modular futura conservada** (Quality, Textiles, Audit, marcos y requisitos configurables).

---

## 3. Documento Maestro 1.1 — resumido y corregido

**Qué es Trazaloop.** Plataforma SaaS modular de trazabilidad, calidad, documentación, auditoría y certificación. Empieza resolviendo un dolor medible —probar el contenido reciclado de un plástico ante un certificador— y crece hacia un sistema donde la misma empresa gestiona calidad, documentación, auditorías y trazabilidad desde un solo lugar, reutilizando documentos y evidencias entre normas.

**Arquitectura de marca (sin cambios).** Trazaloop (plataforma) · Trazaloop 6632 / UNE-EN 15343 (primer módulo, vertical) · Trazaloop Docs (transversal) · Trazaloop Audit (transversal) · Trazaloop Quality (futuro, vertical) · Trazaloop Textiles (futuro, vertical).

**Problema.** Las pymes de plástico reciclado tienen una brecha entre lo que **declaran** ("30% reciclado") y lo que pueden **probar**. Hoy lo resuelven con hojas de cálculo dispersas, plantillas genéricas, cálculos sin soporte y evidencias en carpetas. Resultado: no conformidades, sobrecostos de certificación y riesgo de declaraciones no soportadas.

**Diferenciador.** Motor que relaciona requisito ↔ documento ↔ evidencia ↔ lote ↔ hallazgo; guía didáctica para empresas sin sistema maduro; cálculo de contenido reciclado **con reglas normativas correctas**; y arquitectura que reutiliza el núcleo entre estándares (hoy 6632/15343, mañana ISO 9001 y textiles).

**Usuarios.** Responsable de calidad, gerente de pyme, producción, compras, laboratorio, consultor externo (multiempresa), auditor interno.

**Propuesta de valor.** "Pasa de declarar a demostrar: Trazaloop te diagnostica, te arma el sistema documentado, te lleva la trazabilidad y te entrega el expediente listo para auditoría, aunque hoy no tengas nada montado."

**Las tres decisiones estructurales (se mantienen):**
1. **Marco normativo como datos configurables y versionados** (activar ISO 9001/textil = cargar catálogo + formularios + cálculos, sin reconstruir el núcleo).
2. **Multiempresa con membresías + RLS deny-by-default** (el consultor es un usuario con varias membresías; el aislamiento lo garantiza la BD, no la UI).
3. **Trazabilidad por genealogía de lotes con cálculo de contenido reciclado en snapshots inmutables** (defendible ante un auditor).

**Corrección canónica de contenido reciclado (resumen; detalle en sección 14):** numerador = solo reciclado preconsumo/postconsumo válidamente soportado; denominador = masa total del producto; **postindustrial** es categoría separada que por defecto **no** cuenta; material recuperado del **mismo proceso** nunca cuenta.

### Roadmap por fases (0–4)

| Fase | Nombre | Propósito | Se entrega |
|------|--------|-----------|-----------|
| **0** | Fundaciones técnicas | Base segura y aislada | Auth, multiempresa, roles, membresías, activación de módulos, RLS, Storage, bitácora básica, shell de UI |
| **1** | **MVP Alpha** | Validar el corazón con una empresa piloto | Diagnóstico corto, catálogos, trazabilidad de lotes, cálculo por lote, evidencias, 6 procedimientos, versiones básicas, 3 reportes, dashboard básico |
| **2** | MVP Beta comercial | Producto vendible | Diagnóstico completo, todos los procedimientos, reportes por referencia/familia, expediente básico, matriz de brechas, evidencias por requisito, control documental completo, comparación de versiones, alertas, auditoría interna lite |
| **3** | Versión 1.0 | Ciclo completo de gestión | Trazaloop Audit completo, planes de acción, análisis de causa, eficacia, ZIP de expediente, dashboards avanzados, laboratorio/calibraciones robustos, preparación para ISO 9001 |
| **4** | Expansión | Escala modular y ecosistema | Trazaloop Quality, Trazaloop Textiles, portal externo de auditor/certificador, API e integraciones |

### Diseñar desde el inicio vs. construir después

La regla: **diseñar** (modelar en el esquema y respetar en la arquitectura) desde ya; **construir** (UI + lógica completa) cuando toque la fase. Esto evita rework sin inflar el Alpha.

| Elemento | Diseñar desde el inicio | Construir en fase |
|----------|:-----------------------:|:-----------------:|
| Multiempresa, membresías, RLS, Storage aislado | Sí (Fase 0) | Fase 0 |
| Bitácora de cambios | Sí (Fase 0) | Fase 0 (básica) → 3 (completa) |
| Marco normativo y requisitos configurables | **Sí (esquema desde Fase 0/1, semilla mínima)** | 2 (asociaciones completas) → 4 (nuevos marcos) |
| Genealogía de lotes (entrada→orden→salida→composición) | **Sí (Fase 1)** | 1 (básica) → 3 (robusta) |
| Cálculo de contenido reciclado en snapshots inmutables | **Sí (Fase 1)** | 1 (por lote) → 2 (referencia/familia/periodo) |
| Documento lógico vs. versión inmutable | **Sí (Fase 1)** | 1 (ciclo básico) → 2 (comparación/completo) |
| Evidencia como nodo conector (enlaces polimórficos) | **Sí (Fase 1)** | 1 (carga+asociación) → 2 (por requisito) |
| Entidades genéricas para futuro textil (material/lote/referencia neutrales) | **Sí (Fase 1)** | 4 |
| Trazaloop Audit | Diseñar puntos de enlace (hallazgo↔documento) | 2 (lite) → 3 (completo) |
| Trazaloop Quality / Textiles / Portal externo / API | Solo compatibilidad de arquitectura | 4 |
| *Controlled blending* / balance de masa | No (solo dejar espacio en snapshot) | Futuro |
| Firma electrónica cualificada | No | Futuro (Alpha usa aprobación con trazabilidad) |

---

## 4. MVP Alpha claramente delimitado (Fase 0 + Fase 1)

### 4.1 Fase 0 — Fundaciones técnicas (prerrequisito del Alpha)

**Objetivo:** una base multiempresa segura sobre la que todo lo demás se construye. Sin funcionalidad de negocio.

Incluye: autenticación (email/contraseña), multiempresa (tenant = empresa), roles, membresías (usuario ↔ empresa ↔ rol), activación de módulos por empresa, RLS deny-by-default en todas las tablas, Storage aislado por empresa, bitácora básica de acciones y estructura base de UI (shell + navegación por rol).

**Fase 0 NO incluye** lógica de trazabilidad, documentos ni cálculo. Es fundación pura y debe **timeboxearse** para no caer en sobre-ingeniería.

### 4.2 Fase 1 — MVP Alpha (validar el corazón con un piloto)

**Objetivo:** que **una empresa piloto** recorra de punta a punta: onboarding → diagnóstico corto → cargar catálogos → registrar lotes → **calcular contenido reciclado correctamente** → construir 6 procedimientos → exportar PDFs → ver 3 reportes → ver dashboard. Es la validación de que Trazaloop resuelve el dolor real.

**Alcance exacto del Alpha (nada más):**

| Área | Incluido en Alpha |
|------|-------------------|
| Onboarding | Crear empresa, sedes y usuarios (subconjunto de roles: administrador, responsable de calidad y consultor) |
| Diagnóstico | **Versión corta** (10–12 preguntas de mayor peso) → % de madurez + siguiente paso + PDF |
| Catálogos (ERP liviano) | Familias, referencias, materiales (con clasificación corregida), proveedores |
| Trazabilidad | Lotes de entrada, órdenes de producción (consumo de lotes de entrada con masa), lotes de salida, **composición básica** |
| Cálculo | **Contenido reciclado por lote** (reglas corregidas + advertencias + snapshot) y comparación declarado vs. real |
| Evidencias | Carga de evidencias y asociación a una entidad |
| Documentos (Docs) | Constructor guiado para **6 procedimientos**: trazabilidad, control de material de entrada, control de producción, cálculo de contenido reciclado, control documental, control de proveedores |
| Versiones | Ciclo **básico**: borrador → en revisión → vigente → obsoleto |
| Exportación | **PDF** de procedimientos (con estado/marca de agua) |
| Reportes | Diagnóstico · trazabilidad por lote · contenido reciclado por lote |
| Dashboard | Básico de avance |

**Frontera dura del Alpha:** no hay matriz de brechas, no hay expediente completo ni ZIP, no hay auditoría (ni lite), no hay reportes por referencia/familia, no hay comparación de versiones, no hay alertas/notificaciones, no hay calibraciones/ensayos robustos, no hay portal externo ni API. (Detalle en sección 16.)

---

## 5. MVP Beta comercial claramente delimitado (Fase 2)

**Objetivo:** convertir el Alpha validado en un **producto vendible** a empresas reales que se preparan para certificación.

Incluye, sobre lo del Alpha:

- **Diagnóstico completo** (30 dimensiones, 5 bloques, secciones guardables + modo exprés).
- **Todos los procedimientos base** (los ~14 de 6632/15343 + formatos), no solo 6.
- **Reportes por referencia y familia** (además de por lote).
- **Expediente básico de certificación** (PDF con documentos vigentes, trazabilidad y cálculos).
- **Matriz de brechas** por requisito (con severidad y riesgo).
- **Evidencias por requisito** (asociación requisito ↔ evidencia y estado de cierre).
- **Control documental completo** (todas las reglas: inmutabilidad estricta, historial completo, control de acceso por transición, relación documento↔requisito↔registro).
- **Comparación de versiones** (diff por sección).
- **Alertas** de documentos y evidencias pendientes (en dashboard; notificaciones básicas).
- **Auditoría interna lite** (crear auditoría, checklist por requisitos, registrar y clasificar hallazgos, plan de acción básico, informe).

En esta fase se completan las **asociaciones del marco normativo** (requisito ↔ documento ↔ evidencia ↔ reporte) que en Alpha estaban solo diseñadas.

---

## 6. Versión 1.0 claramente delimitada (Fase 3) y nota de Expansión (Fase 4)

**Fase 3 — Versión 1.0.** Ciclo completo de gestión y preparación para escalar de norma.

Incluye, sobre la Beta:

- **Trazaloop Audit completo**: planes de acción con tareas, **análisis de causa** estructurado, **seguimiento de eficacia** con recordatorios, enlace hallazgo ↔ versión documental modificada.
- **ZIP de expediente** (PDF + evidencias/documentos adjuntos seleccionados), archivable como snapshot con fecha.
- **Dashboards avanzados** (todos los del catálogo: preparación, madurez documental/trazabilidad, riesgos, expedientes listos, etc.).
- **Calibraciones, ensayos y calidad más robustos** (equipos de medición, vencimientos, ensayos antes/después ligados a requisitos).
- **Preparación para Trazaloop Quality (ISO 9001)**: consolidar el motor de requisitos/indicadores/formularios para reutilizarlo en el vertical ISO.

**Fase 4 — Expansión (visión, no se detalla aquí).** Trazaloop Quality (ISO 9001), Trazaloop Textiles, portal externo de auditor/certificador (lectura), y API e integraciones (ERP contable, básculas, LIMS). Se construyen mayormente como **configuración + formularios + cálculos** sobre el núcleo, reutilizando ~70–80%.

---

## 7. Backlog por épicas

Épicas transversales a las fases. La columna "Fase" indica dónde se construye el grueso de la épica (algunas abarcan varias fases con alcance creciente).

| ID | Épica | Descripción | Fase(s) |
|----|-------|-------------|---------|
| **E0** | Fundaciones técnicas | Auth, multiempresa, RLS, Storage, shell de UI | 0 |
| **E1** | Onboarding y organización | Empresa, sedes, usuarios, roles, membresías, activación de módulos | 0–1 |
| **E2** | Bitácora y auditoría de cambios | Registro append-only de acciones (quién/qué/cuándo/entidad) | 0 (básica) → 3 |
| **E3** | Marco normativo y requisitos | Frameworks y requisitos configurables y versionados | 1 (semilla) → 2 (asociaciones) → 4 (nuevos marcos) |
| **E4** | Diagnóstico | Corto en Alpha; completo con brechas y plan en Beta | 1 (corto) → 2 (completo) |
| **E5** | ERP liviano (catálogos) | Familias, referencias, materiales, proveedores | 1 |
| **E6** | Trazabilidad de lotes | Entrada → orden → salida → composición → genealogía | 1 (básica) → 3 (robusta) |
| **E7** | Cálculo de contenido reciclado | Reglas corregidas + advertencias + snapshots | 1 (por lote) → 2 (referencia/familia/periodo) |
| **E8** | Evidencias | Carga, asociación polimórfica, estado y vigencia | 1 → 2 (por requisito) |
| **E9** | Trazaloop Docs — constructor | Construcción guiada por preguntas, secciones estructuradas | 1 (6 procs) → 2 (todos) |
| **E10** | Trazaloop Docs — control de versiones | Ciclo de vida, inmutabilidad, comparación | 1 (básico) → 2 (completo) |
| **E11** | Reportes y expedientes | PDF por lote/referencia/familia; expediente; ZIP | 1 (3 reportes) → 2 (expediente básico) → 3 (ZIP) |
| **E12** | Dashboards | Avance en Alpha; catálogo completo en 1.0 | 1 (básico) → 3 (avanzados) |
| **E13** | Trazaloop Audit | Auditorías, hallazgos, planes, causa, eficacia | 2 (lite) → 3 (completo) |
| **E14** | Laboratorio y calidad | Ensayos, equipos de medición, calibraciones | 1 (mínimo) → 3 (robusto) |
| **E15** | Expansión | Quality, Textiles, portal externo, API | 4 |

---

## 8. Historias de usuario — Fase 0 (Fundaciones)

Formato: **ID — Título** · "Como [rol], quiero [acción], para [beneficio]." · Criterios de aceptación (CA).

**H0.1 — Registro e inicio de sesión**
Como usuario, quiero crear una cuenta e iniciar sesión con correo y contraseña, para acceder a mi espacio de trabajo.
CA:
- Puedo registrarme y luego iniciar sesión con correo y contraseña válidos.
- Credenciales inválidas muestran un error claro sin revelar si el correo existe.
- Una sesión no autenticada no puede acceder a ninguna vista de negocio (redirige a login).

**H0.2 — Recuperación de contraseña**
Como usuario, quiero restablecer mi contraseña, para recuperar el acceso si la olvido.
CA:
- Solicito el restablecimiento con mi correo y recibo un enlace/proceso seguro.
- Tras completar el proceso puedo iniciar sesión con la nueva contraseña.

**H0.3 — Crear empresa (tenant)**
Como administrador, quiero crear una empresa, para tener un espacio privado y aislado.
CA:
- Al crear la empresa quedo asociado a ella como administrador (membresía).
- La empresa nace con datos base (nombre, identificación) editables luego.
- Ningún dato de esta empresa es accesible por usuarios de otra empresa (verificado por RLS).

**H0.4 — Gestión de usuarios y roles**
Como administrador, quiero invitar/crear usuarios y asignarles un rol dentro de mi empresa, para controlar quién hace qué.
CA:
- Puedo crear/invitar un usuario y asignarle un rol (administrador, responsable de calidad, consultor en Alpha).
- El rol determina qué acciones puede realizar (verificado en al menos una acción restringida).
- Puedo desactivar el acceso de un usuario a mi empresa.

**H0.5 — Membresía multiempresa y selección de empresa activa**
Como consultor, quiero pertenecer a varias empresas y cambiar entre ellas, para atender a varios clientes sin mezclar información.
CA:
- Un usuario con membresías en dos empresas ve solo la empresa activa seleccionada.
- Al cambiar de empresa activa, todos los datos mostrados corresponden solo a esa empresa.
- No existe forma (UI o API) de leer datos de una empresa donde no tengo membresía activa.

**H0.6 — Activación de módulos por empresa**
Como administrador, quiero activar/desactivar módulos, para ver solo lo que uso.
CA:
- Puedo activar el módulo 6632/15343 para mi empresa.
- La navegación muestra únicamente los módulos activos.
- Un módulo inactivo no expone sus vistas ni sus datos.

**H0.7 — Aislamiento de datos por RLS**
Como responsable de la plataforma, quiero que el aislamiento por empresa esté garantizado en la base de datos, para que ninguna empresa acceda a datos de otra.
CA:
- Toda tabla operativa tiene `organization_id` y política RLS deny-by-default.
- Existen pruebas automatizadas que verifican que un usuario de la empresa A no puede leer/escribir datos de la empresa B en cada tabla.
- No se usa la clave `service_role` desde el navegador.

**H0.8 — Almacenamiento aislado por empresa**
Como usuario, quiero que mis archivos estén separados por empresa, para preservar la confidencialidad.
CA:
- Los archivos se guardan bajo una ruta namespaced por `organization_id`.
- Solo usuarios con membresía activa en la empresa pueden acceder a sus archivos.
- Las descargas usan URLs firmadas de vida corta.

**H0.9 — Bitácora básica de acciones**
Como administrador, quiero un registro de acciones relevantes, para tener trazabilidad de cambios.
CA:
- Crear/editar/eliminar entidades relevantes queda registrado con usuario, acción, entidad y fecha.
- El registro es append-only (no se puede editar ni borrar desde la aplicación).

**H0.10 — Estructura base de UI y navegación por rol**
Como usuario, quiero una interfaz base con navegación clara, para orientarme según mi rol y empresa.
CA:
- Existe un shell con navegación, indicador de empresa activa y menú de usuario.
- La navegación muestra solo las secciones permitidas por el rol y los módulos activos.
- La interfaz es usable en español y responsiva a nivel básico.

---

## 9. Historias de usuario — Fase 1 (MVP Alpha)

Agrupadas por área. Todas heredan los **criterios transversales** de la sección 10 (RLS, rol, bitácora, español).

### Diagnóstico

**H1.1 — Diagnóstico corto**
Como responsable de calidad, quiero responder un diagnóstico corto guardable, para conocer mi punto de partida sin abandonar por longitud.
CA:
- El diagnóstico tiene 10–12 preguntas de mayor peso, con barra de progreso.
- Puedo guardar y continuar después sin perder respuestas.
- Al finalizar, el diagnóstico queda como snapshot con fecha.

**H1.2 — Resultado del diagnóstico y PDF**
Como responsable de calidad, quiero ver mi resultado y el siguiente paso, para saber qué hacer primero.
CA:
- Veo un % de madurez y un mensaje claro de "siguiente paso".
- Puedo exportar un **reporte PDF** del diagnóstico con marca, fecha y responsable.
- El resultado alimenta el dashboard de avance.

### Catálogos (ERP liviano)

**H1.3 — Gestionar sedes**
Como administrador, quiero registrar las sedes de mi empresa, para asociar operación y evidencias a una ubicación.
CA:
- Puedo crear, editar y listar sedes.
- Las sedes quedan disponibles para asociarse a lotes y evidencias.

**H1.4 — Gestionar familias de producto**
Como responsable de calidad, quiero registrar familias, para agrupar referencias.
CA:
- Puedo crear, editar y listar familias.
- Una referencia puede asignarse a una familia.

**H1.5 — Gestionar referencias/productos**
Como responsable de calidad, quiero registrar referencias con su % de contenido reciclado declarado, para compararlo luego con el real.
CA:
- Puedo crear, editar y listar referencias, asignarles familia y un **% reciclado declarado**.
- El % declarado se usa en la comparación declarado vs. real.

**H1.6 — Gestionar materiales con clasificación corregida**
Como comprador, quiero registrar materiales con su clasificación normativa, para que el cálculo de contenido reciclado sea correcto.
CA:
- Puedo clasificar cada material según el catálogo corregido (sección 14): preconsumo válido, postconsumo válido, **postindustrial (separado, no cuenta por defecto)**, recuperado del mismo proceso, virgen, aditivo, pigmento, carga mineral, masterbatch, otro.
- Al elegir una clasificación que **no cuenta** como reciclado, el sistema lo indica claramente.
- Reclasificar un material postindustrial como preconsumo válido exige **adjuntar soporte y una justificación**, y queda registrado en bitácora.

**H1.7 — Gestionar proveedores**
Como comprador, quiero registrar proveedores, para asociarlos a los lotes de entrada.
CA:
- Puedo crear, editar y listar proveedores.
- Un proveedor puede asociarse a lotes de entrada y a evidencias de origen.

### Trazabilidad

**H1.8 — Registrar lote de entrada**
Como comprador, quiero registrar un lote de entrada, para iniciar la trazabilidad.
CA:
- Registro proveedor, material, tipo de residuo, procedencia, fecha, tamaño/marcado y almacenamiento.
- Puedo adjuntar evidencias de origen al lote.
- El lote queda disponible para ser consumido por una orden de producción.

**H1.9 — Registrar orden de producción con consumo de lotes**
Como jefe de producción, quiero registrar una orden que consume lotes de entrada con su masa, para construir la genealogía.
CA:
- Puedo asociar uno o varios lotes de entrada a la orden, indicando la **masa consumida** de cada uno.
- Puedo registrar variables básicas de proceso y pretratamiento.
- La orden queda enlazada a los lotes de salida que produce.

**H1.10 — Registrar lote de salida**
Como jefe de producción, quiero registrar el lote de salida de una orden, para identificar el producto trazado.
CA:
- El lote de salida queda asociado a su orden de producción y (opcionalmente) a una referencia.
- Puedo registrar sus características básicas y aplicación prevista.

**H1.11 — Registrar composición del lote de salida**
Como responsable de calidad, quiero registrar la composición del lote de salida, para calcular su contenido reciclado.
CA:
- Añado materiales con su **masa** y su **clasificación**, y marco el **origen** (mismo proceso / proceso distinto / externo) cuando aplique.
- El sistema valida que las masas sean coherentes (> 0) y calcula la masa total.

**H1.12 — Ver genealogía del lote**
Como auditor interno, quiero ver la cadena de un lote, para verificar su trazabilidad.
CA:
- Desde un lote de salida puedo navegar hacia atrás a su orden, lotes de entrada y proveedores.
- Un lote con cadena incompleta (falta proveedor, composición o material) se marca como **trazabilidad incompleta**.

### Cálculo de contenido reciclado

**H1.13 — Calcular contenido reciclado por lote (reglas corregidas)**
Como responsable de calidad, quiero calcular el contenido reciclado de un lote de salida con las reglas correctas, para soportar mi declaración.
CA:
- Numerador = suma de masas de materiales **preconsumo/postconsumo válidos**; denominador = **masa total** del lote.
- El material **recuperado del mismo proceso** (scrap, retales, desbastes, mermas, reproceso) **no** se cuenta en el numerador, y el sistema **advierte** si el usuario intenta contarlo.
- El material **postindustrial** no se cuenta por defecto; requiere reclasificación con soporte para contar.
- El cálculo se guarda como **snapshot inmutable** (masas, clasificaciones, metodología, usuario, fecha) y es trazable a los datos usados.

**H1.14 — Comparar declarado vs. real y alertar riesgo**
Como responsable de calidad, quiero comparar el % calculado con el declarado, para detectar riesgo de incumplimiento.
CA:
- El sistema muestra el % calculado junto al % declarado de la referencia.
- Si el % calculado < % declarado, se muestra una **alerta de riesgo** (semáforo).

### Evidencias

**H1.15 — Cargar y asociar evidencia**
Como responsable de calidad, quiero cargar una evidencia y asociarla a una entidad, para soportar la trazabilidad.
CA:
- Puedo cargar un archivo con nombre, tipo, fecha, responsable y observaciones.
- Puedo asociar la evidencia al menos a: proveedor, lote de entrada, lote de salida, material o documento.
- La evidencia respeta el aislamiento por empresa (Storage namespaced).

### Trazaloop Docs (constructor + versiones)

**H1.16 — Crear procedimiento por cuestionario guiado**
Como responsable de calidad, quiero construir un procedimiento respondiendo preguntas, para no partir de una plantilla vacía.
CA:
- Puedo iniciar cualquiera de los 6 procedimientos del Alpha y responder su cuestionario de construcción.
- El sistema genera un **borrador estructurado** mapeando respuestas a secciones.
- Donde aplique, el cuestionario **prellena** con datos del ERP (materiales, proveedores, referencias).

**H1.17 — Editar secciones estructuradas**
Como responsable de calidad, quiero editar las secciones del documento, para ajustar el contenido a mi operación.
CA:
- Puedo editar cada sección con texto enriquecido.
- El sistema valida la **completitud mínima** de secciones antes de permitir enviarlo a revisión.

**H1.18 — Ciclo de versiones básico**
Como responsable de calidad, quiero un ciclo de vida documental, para controlar qué versión está vigente.
CA:
- Un documento transita borrador → en revisión → vigente → obsoleto sin saltos inválidos.
- Un documento **vigente no se edita**; para cambiarlo se crea una **nueva versión borrador** y el vigente permanece protegido hasta publicar.
- Al publicar una nueva versión vigente, la anterior pasa a **obsoleto**; existe **máximo una vigente** por documento.
- Cada transición registra usuario, fecha y motivo en bitácora.

**H1.19 — Exportar procedimiento a PDF**
Como responsable de calidad, quiero exportar un procedimiento a PDF, para compartirlo y archivarlo.
CA:
- El PDF incluye logo, código, versión, fecha, responsable, estado y paginación.
- Un documento obsoleto exporta con marca de agua "OBSOLETO"; un borrador, con "BORRADOR".

### Reportes y dashboard

**H1.20 — Reporte de trazabilidad por lote (PDF)**
Como responsable de calidad, quiero un reporte de trazabilidad por lote, para mostrar la cadena.
CA:
- El PDF muestra el lote de salida, su orden, lotes de entrada, proveedores y evidencias asociadas.
- Señala si la trazabilidad está incompleta.

**H1.21 — Reporte de contenido reciclado por lote (PDF)**
Como responsable de calidad, quiero un reporte de contenido reciclado por lote, para soportar la declaración.
CA:
- El PDF muestra el % calculado, las masas y clasificaciones usadas y la comparación con el declarado.
- Refleja explícitamente los materiales excluidos (mismo proceso, postindustrial no reclasificado).

**H1.22 — Dashboard básico de avance**
Como gerente, quiero un panel de avance, para ver el estado general sin ser experto.
CA:
- Muestra madurez del diagnóstico, número de procedimientos por estado y lotes con/ sin trazabilidad completa.
- Los datos corresponden solo a la empresa activa.

---

## 10. Criterios de aceptación (transversales) y Definición de "Hecho" del MVP Alpha

### 10.1 Criterios de aceptación transversales (aplican a TODA historia)

Cada historia, además de sus criterios propios, solo se considera aceptada si:

1. **Aislamiento:** la funcionalidad respeta RLS; un usuario no puede acceder a datos de una empresa donde no tiene membresía activa.
2. **Rol:** las acciones restringidas se bloquean para roles sin permiso, según la matriz.
3. **Bitácora:** toda creación/edición/eliminación relevante queda registrada (usuario, acción, entidad, fecha).
4. **Errores:** los errores se manejan con mensajes claros, sin exponer detalles internos.
5. **Idioma y usabilidad:** funciona en español y es usable/responsiva a nivel básico.
6. **Seguridad:** ninguna operación privilegiada se ejecuta con credenciales de servidor desde el navegador.

### 10.2 Definición de "Hecho" (Definition of Done) del MVP Alpha

El MVP Alpha está **hecho** cuando **todo** lo siguiente se cumple y es verificable con una empresa piloto real:

- [ ] Todas las historias de Fase 0 y Fase 1 cumplen sus criterios propios y los transversales.
- [ ] **Pruebas de aislamiento multiempresa en verde** para todas las tablas operativas (empresa A no accede a datos de empresa B).
- [ ] Un usuario piloto completa el flujo **de punta a punta**: onboarding → diagnóstico corto → catálogos → lotes (entrada/orden/salida/composición) → **cálculo de contenido reciclado por lote** → 6 procedimientos → exportar PDF → 3 reportes → dashboard.
- [ ] El **cálculo de contenido reciclado** se valida contra un cálculo manual con datos reales del piloto, **incluyendo al menos un caso con scrap/reproceso interno que NO debe contar** y un caso con material postindustrial no reclasificado que NO debe contar.
- [ ] El **ciclo de versiones básico** funciona: un documento vigente no se puede editar, se crea nueva versión borrador, y al publicar la anterior queda obsoleta (máximo una vigente).
- [ ] Los **PDF** se generan del lado del servidor de forma consistente, con marcas de agua correctas.
- [ ] La **bitácora** registra las acciones relevantes del flujo.
- [ ] La aplicación está **desplegada en un entorno accesible** (staging en Vercel) y el piloto puede usarla.
- [ ] Existe documentación mínima de uso para el piloto (guía rápida).

---

## 11. Tablas mínimas — Fase 0 y Fase 1

Nombres orientativos. Todas las tablas operativas llevan `organization_id` y campos de auditoría (`created_by`, `created_at`, `updated_at`).

### 11.1 Fase 0 (fundaciones)

| Tabla | Propósito |
|-------|-----------|
| `organizations` | Empresa (tenant), raíz del aislamiento |
| `sites` | Sedes/plantas |
| `profiles` | Perfil de usuario (extiende `auth.users`) |
| `memberships` | Usuario ↔ empresa ↔ rol (habilita consultor multiempresa) |
| `module_activations` | Módulos activos por empresa |
| `audit_log` | Bitácora append-only de acciones |

### 11.2 Fase 1 (nuevas para el Alpha)

| Tabla | Propósito | Nota |
|-------|-----------|------|
| `frameworks` | Marco normativo (6632/15343) | **Semilla mínima**, diseñado para escalar |
| `requirements` | Requisitos del marco | **Semilla mínima**; asociaciones completas → Fase 2 |
| `product_families` | Familias de producto | |
| `products` | Referencias (incluye `% reciclado declarado`) | |
| `materials` | Materiales con `classification` y `origin` | Clasificación corregida (sección 14) |
| `suppliers` | Proveedores | |
| `input_batches` | Lotes de entrada | |
| `production_orders` | Órdenes de producción (variables/pretratamiento) | |
| `batch_consumption` | Orden ↔ lote de entrada consumido, con `mass` | |
| `output_batches` | Lotes de salida (FK a orden; FK opcional a referencia) | 1 orden → N salidas |
| `batch_composition` | Material + `mass` + `classification` + `origin` por lote de salida | Base del cálculo |
| `recycled_content_calculations` | Snapshot inmutable del cálculo por lote | |
| `evidences` | Evidencia (nombre, tipo, fecha, estado, archivo) | |
| `evidence_links` | Enlace polimórfico evidencia ↔ entidad (`target_type`, `target_id`) | Enum cerrado de tipos |
| `document_types` | Tipos documentales y su cuestionario/plantilla | Semilla: 6 procedimientos |
| `documents` | Documento lógico (código estable) | |
| `document_versions` | Versión (estado, motivo, aprobador, PDF congelado) | Índice único parcial "vigente" |
| `document_sections` | Secciones estructuradas por versión | |
| `diagnostics` | Instancia de diagnóstico (snapshot, madurez) | |
| `diagnostic_answers` | Respuestas por pregunta | |

**Se diseñan en el esquema pero se pueblan/activan después (Fase 2+):** `gaps`, `document_links` (documento↔requisito), asociación requisito↔evidencia, `document_events` (historial documental rico), `report_snapshots`, entidades de Audit (`audits`, `checklists`, `findings`, `action_plans`), y laboratorio (`measurement_equipment`, `calibrations`, `tests`).

---

## 12. Pantallas mínimas — Fase 0 y Fase 1

### 12.1 Fase 0

1. Registro / inicio de sesión.
2. Recuperación de contraseña.
3. Selector de empresa activa (para multiempresa/consultor).
4. Configuración de empresa (datos + activación de módulos).
5. Gestión de usuarios y roles.
6. Shell base con navegación por rol e indicador de empresa activa.

### 12.2 Fase 1 (MVP Alpha)

7. Dashboard básico de avance.
8. Diagnóstico corto (wizard con guardar/continuar).
9. Resultado del diagnóstico (con exportar PDF).
10. Sedes (lista + formulario).
11. Familias (lista + formulario).
12. Referencias/productos (lista + formulario, con % declarado).
13. Materiales (lista + formulario **con clasificación y flujo de reclasificación** de postindustrial).
14. Proveedores (lista + formulario).
15. Lotes de entrada (lista + detalle/formulario, con evidencias).
16. Órdenes de producción (lista + detalle, con **consumo de lotes de entrada y masas**).
17. Lotes de salida (lista + detalle, con referencia y características).
18. Editor de composición + **cálculo de contenido reciclado** (materiales, masas, clasificación, origen, resultado y comparación declarado vs. real).
19. Vista de genealogía del lote (cadena + señal de trazabilidad incompleta).
20. Evidencias (lista + carga + asociación a entidad).
21. Constructor documental (lista de documentos + cuestionario guiado + editor por secciones).
22. Visor de documento y versiones (estados, transiciones, exportar PDF).
23. Reportes (diagnóstico, trazabilidad por lote, contenido reciclado por lote).

---

## 13. Reportes mínimos — Fase 1

Todos en **PDF**, render del lado del servidor, con identidad de marca (logo, código/fecha/responsable, estado, paginación):

1. **Reporte de diagnóstico** (madurez + siguiente paso).
2. **Reporte de trazabilidad por lote** (cadena entrada→orden→salida, proveedores, evidencias; señala trazabilidad incompleta).
3. **Reporte de contenido reciclado por lote** (% calculado, masas y clasificaciones usadas, materiales excluidos, comparación con declarado).
4. **Exportación PDF de procedimientos** (parte de Trazaloop Docs; con estado y marca de agua).

**No en Fase 1** (se añaden después): reportes por referencia/familia, matriz de brechas, expediente de certificación, ZIP, y reportes de proveedores/ensayos/calibraciones/documentos vigentes-obsoletos.

---

## 14. Reglas normativas corregidas para el contenido reciclado

Esta sección **reemplaza** la lógica de clasificación de la v1.0. Es la corrección más importante de la v1.1.

### 14.1 Principio de cálculo

> **Contenido reciclado (%) = (masa de materiales reciclados válidos ÷ masa total del producto) × 100**

- **Numerador:** únicamente materiales **preconsumo** y **postconsumo** que estén **válidamente soportados** con evidencia.
- **Denominador:** la **masa total** del producto (incluye todo lo que físicamente lo compone: virgen, aditivos, pigmentos, cargas, masterbatch y también el material recuperado del mismo proceso).

### 14.2 Tabla de clasificación de materiales (corregida)

| Clasificación | ¿Cuenta en el numerador (reciclado)? | ¿Cuenta en el denominador (masa total)? | Regla |
|---------------|:---:|:---:|-------|
| **Reciclado preconsumo válido (soportado)** | Sí | Sí | Solo si tiene soporte documental de origen |
| **Reciclado postconsumo válido (soportado)** | Sí | Sí | Solo si tiene soporte documental de origen |
| **Postindustrial (categoría separada)** | **No, por defecto** | Sí | Se registra aparte. Solo cuenta si se **reclasifica** a preconsumo válido con soporte y justificación normativa |
| **Recuperado en el mismo proceso** (scrap interno, retales, desbastes, mermas, reproceso del proceso que lo generó) | **No, nunca** | Sí | Regla dura. El sistema **impide** contarlo como reciclado |
| Virgen | No | Sí | |
| Aditivo | No | Sí | Salvo que el aditivo mismo sea reciclado con soporte |
| Pigmento | No | Sí | |
| Carga mineral | No | Sí | |
| Masterbatch | No | Sí | Evaluar composición; su portador suele ser virgen |
| Otro | Configurable | Configurable | Requiere criterio explícito documentado |

### 14.3 Reglas duras y controles del sistema

1. **El material recuperado en el mismo proceso de fabricación que lo generó NO cuenta como contenido reciclado.** Aplica a scrap interno, retales, desbastes, mermas y reproceso del mismo proceso. El sistema lo excluye del numerador de forma automática y **advierte/bloquea** cualquier intento de contarlo.
2. **El material postindustrial NO cuenta automáticamente.** Se registra como categoría separada. Por defecto queda fuera del numerador.
3. **Reclasificación controlada:** si una empresa pretende usar un material postindustrial (externo) como **preconsumo válido**, debe **reclasificarlo** aportando **soporte documental** y una **justificación normativa**. La reclasificación:
   - la realiza un rol con permiso (responsable de calidad/consultor con validación),
   - exige adjuntar evidencia y escribir la justificación,
   - queda registrada en la **bitácora**, y
   - se refleja en el **snapshot** del cálculo (para que sea defendible ante un auditor).
4. **Advertencias de clasificación:** al marcar un material como reciclado, si su clasificación u origen indican que **no debe contar** (mismo proceso, postindustrial no reclasificado, aditivo/pigmento virgen), el sistema muestra una advertencia y exige **confirmación explícita** (o lo impide, en el caso del mismo proceso).
5. **Transparencia en el reporte:** el reporte de contenido reciclado por lote lista explícitamente los materiales **excluidos** y el motivo, además de los incluidos.
6. **Soporte válido obligatorio:** un material preconsumo/postconsumo solo cuenta si tiene evidencia de origen asociada; sin soporte, no debe contarse (o se marca como "sin soporte" y no computa).

### 14.4 Nota de terminología y validación

En la industria, "postindustrial" y "preconsumo" a veces se usan de forma intercambiable, lo que genera sobre-declaración. Trazaloop los **separa deliberadamente**: "preconsumo válido" es la categoría que computa (con soporte), y "postindustrial" es una categoría de contención que **no** computa hasta reclasificarse con justificación. Las definiciones exactas (qué evidencia constituye "soporte válido", el criterio de reclasificación y los límites de cada categoría) deben **validarse con un experto certificado en NTC 6632:2022 y UNE-EN 15343:2008** antes de sembrar el catálogo. El sistema está diseñado para cargar esa validación como **configuración**, no como reprogramación.

---

## 15. Riesgos críticos del MVP Alpha

| # | Riesgo | Impacto | Mitigación |
|---|--------|---------|-----------|
| 1 | **Fuga de datos entre empresas** por RLS mal configurada | Crítico | Deny-by-default, pruebas de aislamiento por tabla, revisión obligatoria de políticas, sin `service_role` en navegador |
| 2 | **Cálculo o clasificación errónea** de contenido reciclado (sobre-declaración) | Crítico | Reglas corregidas (sección 14), exclusión dura del mismo proceso, advertencias, snapshots trazables, **validación con experto** y caso de prueba obligatorio con scrap/postindustrial |
| 3 | **Scope creep** de vuelta al Alpha | Alto | Frontera dura documentada (sección 16), gate de fase, DoD estricto (sección 10.2) |
| 4 | **Piloto no representativo / datos basura** | Alto | Elegir un piloto con operación real de reciclado, onboarding guiado, importación básica si aplica |
| 5 | **Constructor documental genera borradores pobres** | Medio-Alto | Cuestionarios y plantillas redactados por experto de dominio, prellenado desde ERP, validación de completitud |
| 6 | **PDF inconsistente** entre navegadores/entornos | Medio | Render del lado del servidor, plantillas versionadas, pruebas de render |
| 7 | **El diagnóstico "corto" sigue siendo largo** → abandono | Medio | Limitar a 10–12 preguntas, guardar/continuar, resultado inmediato |
| 8 | **Sobre-ingeniería en Fase 0** (gold-plating de fundaciones) | Medio | Timebox de Fase 0; no construir lo que el Alpha no exige |
| 9 | **Ambigüedad del modelo de genealogía** → rework | Medio | Fijar el modelo del Alpha (1 orden → N salidas; orden ↔ N entradas con masa) y documentarlo |
| 10 | **Terminología normativa mal fijada** (preconsumo/postindustrial) | Alto | Validación experta **antes** de sembrar el catálogo; reglas configurables |

---

## 16. Qué NO construir todavía

Lista explícita para proteger el foco del Alpha. Estos elementos **se posponen** (algunos ya diseñados en el esquema, pero sin UI/lógica completa):

**No en el Alpha (van en Fase 2 o después):**
- Auditoría interna, **incluso lite** (Fase 2).
- Matriz de brechas y **expediente de certificación** (Fase 2/3).
- Reportes por **referencia y familia** (Fase 2).
- **Comparación de versiones** documentales (Fase 2).
- Control documental **completo** (historial rico, `document_events`, todas las reglas de acceso por transición) — Fase 2.
- **Evidencias por requisito** y asociaciones requisito ↔ documento/reporte (Fase 2).
- **Alertas y notificaciones** de pendientes (Fase 2).
- **Diagnóstico completo** de 30 dimensiones (Alpha usa el corto).

**No hasta Fase 3+:**
- **Trazaloop Audit completo** (planes de acción, análisis de causa, eficacia).
- **ZIP de expediente** con adjuntos.
- **Dashboards avanzados** y vistas materializadas.
- **Calibraciones, ensayos y calidad robustos**.

**No hasta Fase 4 (solo compatibilidad de arquitectura, cero UI ahora):**
- **Trazaloop Quality (ISO 9001)** y **Trazaloop Textiles**.
- **Portal externo** de auditor/certificador.
- **API pública e integraciones** (ERP contable, básculas, LIMS).

**No construir (por ahora, sin fase asignada):**
- **Controlled blending / balance de masa con asignación** (el Alpha calcula por balance físico/segregado; solo se deja espacio en el snapshot).
- **Firma electrónica cualificada** (el Alpha usa **aprobación con trazabilidad**: usuario + fecha + motivo en bitácora).
- **Roles completos (8)** (el Alpha usa un subconjunto: administrador, responsable de calidad y consultor).
- **Multi-idioma** (el Alpha es solo español).
- **App móvil / modo offline**.

---

## 17. Siguientes pasos recomendados

### 17.1 Decisiones a tomar antes de programar

1. **Reglas de contenido reciclado:** confirmar con experto certificado qué evidencia constituye "soporte válido" para preconsumo/postconsumo y el criterio exacto de reclasificación de postindustrial.
2. **Marco normativo:** ¿NTC 6632 y UNE-EN 15343 como **marcos separados relacionables** (recomendado) o combinados?
3. **Modelo de genealogía del Alpha:** confirmar "1 orden → N lotes de salida" y "orden ↔ N lotes de entrada con masa". ¿Se necesita N:M salida-orden ya, o basta lo anterior?
4. **Unidades y precisión:** unidad de masa estándar (kg) y manejo de decimales; ¿se permite otra unidad?
5. **Roles del Alpha:** confirmar subconjunto (administrador, responsable de calidad, consultor).
6. **Autenticación:** solo email/contraseña en Alpha; ¿flujo de invitación por correo?
7. **Aprobación documental:** confirmar "aprobación con trazabilidad" (sin firma cualificada) para el Alpha.
8. **Idioma:** español únicamente en el Alpha (confirmar).
9. **Acceso:** ¿registro autoservicio o venta asistida con consultor?
10. **Onboarding del piloto:** ¿se necesita **importación básica (CSV)** de materiales, proveedores y referencias?
11. **Datos:** residencia (Colombia/UE) y política de retención de evidencias.
12. **Generación de PDF:** definir el método de render del lado del servidor (en la fase de arquitectura técnica).
13. **Contenido semilla:** definir **quién redacta** el contenido de los 6 cuestionarios/plantillas de procedimiento y las 10–12 preguntas del diagnóstico corto (requiere experto de dominio).

### 17.2 Secuencia recomendada de trabajo

1. Cerrar las decisiones de 17.1 (especialmente 1, 2 y 3, que afectan el modelo de datos).
2. **Validar las reglas de contenido reciclado** con el experto y redactar el contenido semilla (procedimientos y diagnóstico corto).
3. Diseñar el **modelo de datos detallado** (DDL) de Fase 0 + Fase 1 y las **políticas RLS**, con pruebas de aislamiento desde el primer día.
4. Elaborar **wireframes** de las 23 pantallas mínimas.
5. Planear **sprints**: primero **Fase 0** (fundaciones), luego el Alpha por épicas en este orden sugerido: E5 (catálogos) → E6 (trazabilidad) → E7 (cálculo) → E9/E10 (Docs + versiones) → E11/E12 (reportes + dashboard), con E4 (diagnóstico corto) en paralelo.
6. **Seleccionar la empresa piloto** y preparar sus datos reales para la validación end-to-end.

### 17.3 Cierre

La v1.1 mantiene la ambición de Trazaloop como SaaS modular, pero la vuelve **construible**: un Alpha pequeño y honesto que valida el corazón (trazabilidad + cálculo correcto + documentos + reportes) con una empresa real, antes de invertir en Beta y 1.0. Las tres decisiones estructurales y la visión modular futura se conservan intactas; lo que cambia es el **orden y el tamaño** de lo que se construye primero.
