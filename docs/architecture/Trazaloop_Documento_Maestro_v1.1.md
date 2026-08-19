# TRAZALOOP
# DOCUMENTO MAESTRO DE PRODUCTO Y ARQUITECTURA

**Versión:** 1.1  
**Fecha de consolidación:** 17 de agosto de 2026  
**Estado:** Documento rector de producto y arquitectura  
**Uso previsto:** Contexto maestro para desarrollo, arquitectura, QA, documentación y evolución de Trazaloop  
**Documento complementario:** `Trazaloop_Quality_Architecture_Baseline_v1.0.md`

---

## 0. CONTROL DEL DOCUMENTO

Este documento describe la visión consolidada de **Trazaloop como plataforma**, sus módulos, principios de producto, límites funcionales, arquitectura transversal y reglas de evolución.

No sustituye al repositorio ni al esquema real de base de datos.

Cuando exista diferencia entre:

1. este documento;
2. una arquitectura detallada aprobada posteriormente;
3. el repositorio real;

se aplicará la siguiente regla:

- **el repositorio y las migraciones son la fuente de verdad sobre el estado técnico actual**;
- **los documentos de arquitectura aprobados son la fuente de verdad sobre la arquitectura objetivo**;
- una discrepancia entre ambos debe tratarse como un **gap de implementación**, no resolverse modificando silenciosamente el baseline.

Para **Trazaloop Quality**, el documento rector específico es:

`Trazaloop_Quality_Architecture_Baseline_v1.0.md`

y sus decisiones aprobadas prevalecen sobre descripciones resumidas de Quality contenidas aquí.

---

# 1. RESUMEN EJECUTIVO

Trazaloop es una plataforma SaaS multiempresa orientada a convertir la trazabilidad, la evidencia, la documentación, la auditoría y la gestión de calidad en un sistema digital integrado.

La plataforma parte de una idea central:

> **La información relevante debe capturarse una vez, conservar su trazabilidad y reutilizarse en todos los procesos donde tenga valor.**

Trazaloop no debe convertirse en una colección de formularios aislados por norma o por módulo.

Debe comportarse como una plataforma conectada donde:

```text
ORGANIZACIÓN
    │
    ├── PERSONAS Y RESPONSABILIDADES
    ├── DOCUMENTOS
    ├── PROCESOS
    ├── DATOS OPERACIONALES
    ├── EVIDENCIAS
    ├── INDICADORES
    ├── RIESGOS
    ├── AUDITORÍAS
    ├── ACCIONES
    └── TRAZABILIDAD
             │
             ↓
       INFORMACIÓN CONFIABLE
             │
             ↓
         DECISIONES
```

La plataforma está diseñada para evolucionar progresivamente desde módulos especializados de trazabilidad hacia una infraestructura empresarial transversal.

---

# 2. VISIÓN DE PRODUCTO

## 2.1 Propósito

Trazaloop busca ayudar a las organizaciones a:

- demostrar trazabilidad;
- conservar evidencia verificable;
- estructurar información documental;
- reducir duplicación;
- organizar datos de cumplimiento;
- conectar operación con evidencia;
- facilitar auditorías;
- gestionar acciones;
- comprender el desempeño;
- mantener memoria organizacional;
- soportar decisiones de mejora.

## 2.2 Qué no pretende ser

Trazaloop no debe transformarse indiscriminadamente en:

- ERP generalista;
- CRM completo;
- sistema contable;
- sistema de nómina;
- MES universal;
- LMS completo;
- gestor contractual completo;
- repositorio de archivos sin semántica.

Cuando estas capacidades ya existen en otros sistemas, Trazaloop debe preferir:

```text
INTEGRAR
REFERENCIAR
OBSERVAR
REUTILIZAR
```

antes que duplicar.

---

# 3. PRINCIPIOS MAESTROS

## 3.1 Zero Duplicate Management

Si una información existe confiablemente dentro de Trazaloop o en una fuente maestra integrada:

> **no debe pedirse al usuario que la vuelva a registrar para otro módulo.**

## 3.2 Capture Once, Reuse Many Times

Un mismo dato puede alimentar múltiples funciones.

Ejemplo:

```text
fecha de entrega
    ↓
indicador logístico
    ↓
evaluación de proveedor
    ↓
análisis de satisfacción
    ↓
señal de riesgo
    ↓
auditoría
```

## 3.3 Source of Truth

Cada dato crítico debe tener una fuente maestra identificable.

No deben existir dos valores diferentes mantenidos manualmente en módulos distintos.

## 3.4 Historical Truth

Trazaloop debe poder responder:

> ¿Qué era válido en una fecha determinada?

No solamente:

> ¿Qué es válido ahora?

## 3.5 Evidence, Not Claims

Trazaloop puede:

- organizar;
- calcular;
- relacionar;
- conservar;
- verificar disponibilidad de evidencia.

No debe afirmar automáticamente:

- certificación;
- conformidad total;
- cumplimiento garantizado;
- circularidad demostrada;

si esas conclusiones requieren evaluación humana o de terceros.

## 3.6 Fail Closed

En seguridad, cuando exista duda:

```text
NO AUTORIZADO
```

es preferible a conceder acceso accidental.

## 3.7 Append-Only Evolution

Las migraciones y los históricos deben evolucionar sin destruir silenciosamente información válida anterior.

---

# 4. ARQUITECTURA FUNCIONAL DE LA PLATAFORMA

La visión consolidada es:

```text
                         TRAZALOOP
                            │
       ┌────────────────────┼──────────────────────┐
       │                    │                      │
 TRAZABILIDAD          GESTIÓN TRANSVERSAL    GOBERNANZA
       │                    │                      │
       │                    │                      │
   Trazaloop PCR          TrazaDocs           Trazaloop Audit
   Trazaloop Textiles       │                      │
       │                    │                      │
       └────────────────────┼──────────────────────┘
                            │
                     Trazaloop Quality
                            │
                 inteligencia transversal
```

Quality no sustituye los módulos de trazabilidad.

Los utiliza como fuentes de:

- datos;
- evidencias;
- indicadores;
- eventos;
- riesgos;
- resultados.

---

# 5. MÓDULOS DE LA PLATAFORMA

## 5.1 Trazaloop PCR

Módulo especializado en trazabilidad de materiales y productos con contenido reciclado, con especial orientación a:

- NTC 6632;
- UNE-EN 15343;
- cadenas de trazabilidad de material reciclado;
- evidencias asociadas.

Históricamente el proyecto utilizó denominaciones como CPR; la nomenclatura de experiencia preferida es **PCR**.

Los identificadores técnicos existentes no deben renombrarse destructivamente únicamente por este cambio de presentación.

### Capacidades funcionales

Incluye o contempla:

- diagnóstico;
- proveedores;
- familias;
- materiales;
- productos;
- órdenes / corridas de producción;
- lotes de entrada;
- lotes producidos / lotes finales;
- consumos;
- inventarios;
- balances;
- variables de proceso;
- evidencias;
- genealogía;
- reportes;
- dossier de auditoría;
- trazabilidad de contenido reciclado.

### Terminología UX consolidada

Preferir:

**Orden / corrida de producción**

en lugar de:

**Orden de producción**

y:

**Lote producido / lote final**

en lugar de:

**Lote de salida**

cuando corresponda en interfaz.

Las denominaciones de base de datos no deben modificarse solo por esta preferencia visual.

---

# 6. TRAZALOOP TEXTILES

Trazaloop Textiles extiende la filosofía de trazabilidad a cadenas textiles y circularidad.

No es una adaptación superficial del módulo PCR.

Tiene necesidades propias de:

- materias primas;
- fibras;
- materiales;
- componentes;
- productos y referencias;
- proveedores;
- lotes;
- transformación;
- evidencias;
- circularidad;
- declaraciones;
- pasaportes técnicos.

## 6.1 Filosofía

Debe permitir reconstruir relaciones entre:

```text
MATERIAL
   ↓
PROVEEDOR
   ↓
LOTE
   ↓
PROCESO
   ↓
PRODUCTO / REFERENCIA
   ↓
EVIDENCIA
   ↓
DECLARACIÓN
   ↓
PASAPORTE
```

## 6.2 Pasaporte técnico

El pasaporte no debe convertirse en otra fuente maestra.

Debe utilizar:

- referencias dinámicas;
- snapshots cuando sea necesario preservar un estado histórico;
- evidencia ya existente.

## 6.3 Circularidad

Las afirmaciones de circularidad deben estar sustentadas.

Trazaloop no debe convertir automáticamente una característica como:

> contiene material reciclado

en una conclusión como:

> producto circular.

---

# 7. TRAZADOCS

TrazaDocs es la capa de construcción y control documental de Trazaloop.

No debe ser entendido simplemente como:

```text
editor de texto + PDF
```

Su evolución objetivo es convertirse en el **Motor Documental Transversal** de la plataforma.

## 7.1 Capacidades centrales

TrazaDocs debe permitir progresivamente:

- creación documental;
- documentos sugeridos;
- documentos libres;
- estructuras guiadas;
- hints;
- ejemplos editables;
- revisión;
- aprobación;
- vigencia;
- versionamiento;
- histórico;
- obsolescencia;
- retiro;
- acceso;
- impresión;
- descarga;
- relación con evidencias;
- relación con módulos operacionales.

## 7.2 Principio Document ≠ File

Un documento es una entidad gestionada.

Un PDF, DOCX o archivo adjunto es una representación o evidencia asociada.

```text
DOCUMENTO
   │
   ├── revisión 1
   ├── revisión 2
   └── revisión 3
          │
          └── archivo / PDF / exportación
```

## 7.3 Fuente maestra

TrazaDocs no debe copiar manualmente información que ya existe en:

- catálogos;
- trazabilidad;
- evidencias;
- procesos;
- personas.

## 7.4 Quality

La arquitectura Quality establece que TrazaDocs debe **evolucionar**, cuando sea viable, al Motor Documental Transversal.

No se debe crear un segundo sistema documental Quality sin realizar previamente análisis de reutilización.

---

# 8. TRAZALOOP AUDIT

Trazaloop Audit es la experiencia especializada para:

- planificación de auditorías;
- ejecución;
- evidencias;
- hallazgos;
- informes;
- seguimiento.

Debe integrarse con Quality.

## 8.1 Principio de no duplicación

No deben existir:

```text
hallazgo Audit
+
copia independiente del hallazgo Quality
```

La arquitectura objetivo es compartir un núcleo común para:

- auditorías;
- evidencias;
- hallazgos;
- casos;
- acciones.

## 8.2 Auditoría como consumidor del sistema

Cuando Quality madure, Audit deberá ser capaz de preparar automáticamente una auditoría utilizando:

- proceso;
- flujo;
- documentos;
- responsables;
- competencias;
- indicadores;
- riesgos;
- proveedores;
- clientes;
- acciones anteriores.

---

# 9. TRAZALOOP QUALITY

Trazaloop Quality es la evolución transversal de Trazaloop hacia un Sistema de Gestión de Calidad digital.

Debe ser sectorialmente neutro.

No está restringido a:

- reciclaje;
- plásticos;
- textiles;
- manufactura.

Debe poder funcionar para organizaciones de servicios, educación, consultoría, industria, tecnología y otros sectores.

## 9.1 Base normativa

Su diseño se inspira en ISO 9001 y debe permitir evolucionar entre ediciones normativas sin reconstruir la base de datos.

La navegación puede utilizar la estructura familiar:

```text
4. CONTEXTO
5. LIDERAZGO
6. PLANIFICACIÓN
7. APOYO
8. OPERACIÓN
9. EVALUACIÓN DEL DESEMPEÑO
10. MEJORA
```

Pero:

> **la navegación normativa no es el modelo de datos.**

## 9.2 Dominios Quality

La arquitectura aprobada contempla:

- estrategia y contexto;
- mapas de procesos;
- procesos;
- flujos;
- documentos;
- organización;
- cargos;
- personas;
- competencias;
- conocimiento;
- objetivos;
- indicadores;
- proveedores;
- clientes;
- satisfacción;
- riesgos;
- oportunidades;
- controles;
- casos;
- no conformidades;
- acciones;
- mejora;
- auditorías;
- revisión por la dirección;
- automatización;
- alertas;
- IA.

El detalle completo se encuentra en:

`Trazaloop_Quality_Architecture_Baseline_v1.0.md`

---

# 10. CADENA DE GESTIÓN QUALITY

Quality debe conectar:

```text
DOCUMENTOS
+
PROCESOS
+
RESPONSABLES
+
OBJETIVOS
+
INDICADORES
+
RIESGOS
+
ACCIONES
+
EVIDENCIA
+
RESULTADOS
+
MEJORA
```

El ciclo operativo esperado es:

```text
PLANEAR
   ↓
DOCUMENTAR
   ↓
EJECUTAR
   ↓
MEDIR
   ↓
EVALUAR
   ↓
CORREGIR
   ↓
MEJORAR
```

---

# 11. PRINCIPIO QUALITY BY OBSERVATION

Quality no debe convertirse en una plataforma donde las personas deban reportar nuevamente lo que Trazaloop ya conoce.

Ejemplo incorrecto:

```text
ERP registra entregas
↓
usuario abre Quality
↓
vuelve a digitar entregas
```

Modelo objetivo:

```text
ERP / Trazaloop registra operación
↓
Quality observa
↓
calcula
↓
alerta
↓
persona analiza
```

---

# 12. ARQUITECTURA TECNOLÓGICA GENERAL

La implementación existente utiliza como base:

- Next.js;
- TypeScript;
- Supabase;
- PostgreSQL;
- Supabase Auth;
- Supabase Storage;
- Row Level Security;
- Vercel.

El repositorio real deberá confirmar:

- versiones exactas;
- estructura;
- convenciones;
- helpers;
- migraciones;
- políticas;
- funciones.

No deben asumirse nombres físicos de tablas desde este documento.

---

# 13. MULTI-TENANCY

La unidad de aislamiento empresarial es la organización.

Conceptualmente:

```text
USER
  ↓
MEMBERSHIP
  ↓
ORGANIZATION
  ↓
DATA
```

Todo objeto empresarial debe pertenecer inequívocamente a una organización.

## 13.1 Regla

No se deben permitir relaciones accidentales:

```text
organization A record
        ↓
organization B record
```

## 13.2 organization_id

La arquitectura favorece que las tablas tenant-owned relevantes tengan `organization_id` explícito para:

- RLS;
- consultas;
- índices;
- defensa en profundidad.

---

# 14. SEGURIDAD

## 14.1 RLS

RLS es una barrera primaria de aislamiento.

No debe dependerse únicamente de:

- ocultar botones;
- layouts;
- redirects;
- filtros del cliente.

## 14.2 Server-side authorization

Además de RLS, el servidor debe validar capacidades y alcance para operaciones sensibles.

## 14.3 Storage

Los archivos privados deben utilizar Storage privado y acceso controlado.

Los enlaces de descarga deben ser:

- autorizados;
- limitados;
- temporales cuando corresponda.

## 14.4 Service role

Las credenciales administrativas deben permanecer server-only.

Nunca deben exponerse al navegador.

---

# 15. AUTORIZACIÓN

Modelo objetivo:

```text
AUTHORIZATION
=
ROLE
+
CAPABILITY
+
SCOPE
```

## 15.1 Role

Describe una agrupación de capacidades.

## 15.2 Capability

Describe una operación concreta.

Ejemplos:

```text
document.approve
supplier.evaluate
risk.accept
audit.execute
```

## 15.3 Scope

Limita dónde puede ejercerse.

Ejemplos:

- organización;
- proceso;
- sede;
- unidad.

---

# 16. PLAN COMERCIAL ≠ PERMISO

Principio no negociable:

```text
ENTITLEMENT
≠
AUTHORIZATION
```

El plan comercial determina:

> qué funcionalidad está disponible para la empresa.

El rol determina:

> qué puede hacer una persona.

---

# 17. MODELO COMERCIAL

Los estados comerciales vigentes de acceso son:

```text
DEMO
FULL
EXTRA
```

## 17.1 Demo

Permite experimentar la plataforma con límites funcionales y/o temporales definidos por producto.

## 17.2 Full

Acceso funcional completo del módulo contratado bajo la capacidad de almacenamiento definida para Full.

## 17.3 Extra

Funcionalmente comparte el acceso de Full.

Su diferencia principal es una mayor capacidad de almacenamiento.

Por tanto:

> **Full y Extra no deben tener diferencias funcionales arbitrarias.**

## 17.4 Acceso por módulo

Una organización puede tener distinto estado por módulo.

Ejemplo:

```text
PCR       FULL
Textiles  DEMO
Quality   no asignado / futuro
```

---

# 18. DEMO

Las empresas nuevas pueden disponer de un periodo Demo temporal.

La lógica exacta implementada debe confirmarse desde el repositorio.

El Demo no debe confundirse con:

- módulo deshabilitado;
- módulo no asignado;
- módulo próximo;
- kill switch.

Son estados semánticamente distintos.

---

# 19. SUPERADMINISTRACIÓN

La plataforma contempla una capa de Superadministrador para gobierno global.

Sus responsabilidades pueden incluir:

- empresas;
- acceso a módulos;
- planes;
- cuotas;
- estado de módulos;
- diagnóstico técnico;
- soporte.

El Superadministrador no debe mezclarse conceptualmente con Administrador de una empresa.

---

# 20. ROLES DE ORGANIZACIÓN

Trazaloop contempla perfiles empresariales como:

- Administrador;
- Supervisor / Consultor;
- Usuario;

según módulo y estado de evolución.

Quality evolucionará hacia capabilities y scopes más granulares.

No debe romperse la compatibilidad actual sin migración.

---

# 21. DIAGNÓSTICO

El diagnóstico es una capacidad relevante de Trazaloop.

No debe reducirse necesariamente a una única lógica para todos los módulos.

## 21.1 Diagnóstico especializado

PCR/Textiles pueden tener diagnóstico propio de trazabilidad.

## 21.2 Quality

El diagnóstico Quality deberá evaluar madurez y cobertura de gestión.

No debe afirmar automáticamente:

> cumple / no cumple ISO.

Puede evaluar:

- existencia;
- estructura;
- gestión;
- medición;
- automatización.

---

# 22. EVIDENCIAS

La evidencia es un concepto transversal.

Puede provenir de:

- archivo;
- documento;
- registro;
- dato;
- medición;
- lote;
- auditoría;
- sistema externo.

Principio:

> **Evidencia no significa necesariamente archivo duplicado.**

Quality debe poder referenciar un objeto existente.

---

# 23. DOCUMENTO, REGISTRO, EVIDENCIA Y ARCHIVO

Deben diferenciarse:

```text
DOCUMENTO
define / instruye / controla

PLANTILLA
estructura captura

REGISTRO
demuestra ejecución

EVIDENCIA
sustenta una afirmación

ARCHIVO
representación física digital
```

Una misma pieza digital puede desempeñar varias funciones, pero el modelo debe conocer su semántica.

---

# 24. HISTÓRICO Y VERSIONAMIENTO

Para objetos con vigencia empresarial debe poder resolverse:

> ¿qué revisión era válida en fecha X?

Ejemplos:

- documento;
- proceso;
- flujo;
- cargo;
- metodología;
- indicador.

La plataforma debe distinguir:

```text
created_at
```

de:

```text
effective_from
effective_to
```

---

# 25. INMUTABILIDAD

Una revisión aprobada o publicada no debe poder editarse silenciosamente.

Un cambio produce:

```text
NUEVA REVISIÓN
```

o evento de corrección controlado.

---

# 26. PROCESOS

Quality introduce el proceso como entidad empresarial estable.

Debe diferenciar:

```text
MAPA DE PROCESOS
```

de:

```text
PROCESO
```

de:

```text
FLUJO FUNCIONAL
```

de:

```text
PROCEDIMIENTO
```

## 26.1 Mapa

Vista macro de la arquitectura de procesos.

## 26.2 Proceso

Entidad estable con:

- propósito;
- alcance;
- propietario;
- entradas;
- salidas;
- indicadores;
- riesgos.

## 26.3 Flujo

Representa cómo se desarrolla funcionalmente.

## 26.4 Procedimiento

Información documentada que puede gobernar una parte del trabajo.

---

# 27. PERSONAS Y RESPONSABILIDAD

Principio central:

```text
POSITION
≠
PERSON
≠
USER ACCOUNT
```

## 27.1 Position

Representa una responsabilidad organizacional estable.

## 27.2 Person

Representa a la persona que ocupa o desempeña posiciones.

## 27.3 User

Representa una identidad de acceso a la plataforma.

Una persona puede existir en Quality sin tener cuenta de usuario.

---

# 28. RESPONSABILIDAD PERSISTENTE

Objetos como:

- proceso;
- documento;
- indicador;
- riesgo;

deben preferentemente asignar propietario a un cargo.

Ejemplo:

```text
Owner:
Director Logístico
```

La persona actual se deriva de la ocupación del cargo.

Esto evita reescribir el SGC cada vez que cambia una persona.

---

# 29. PROVEEDORES Y CLIENTES

Quality establece un Maestro Transversal de Terceros.

```text
EXTERNAL PARTY
       │
   ┌───┴────┐
   │        │
SUPPLIER CUSTOMER
```

Una misma organización externa puede ejercer múltiples roles.

No deben crearse identidades separadas innecesariamente.

---

# 30. EVENTOS

La arquitectura objetivo considera un motor transversal de eventos.

Ejemplo:

```text
document.approved
supplier.suspended
indicator.target_missed
action.overdue
```

Evento no significa:

- alerta;
- acción;
- notificación.

Cada concepto conserva su función.

---

# 31. AUTOMATIZACIÓN

Modelo:

```text
EVENT
↓
RULE
↓
CONDITION
↓
ACTION
```

La automatización debe ser:

- explicable;
- idempotente;
- auditable;
- segura.

Las reglas críticas deben utilizar lógica determinística.

---

# 32. ALERTAS

Una alerta es una situación persistente que requiere atención.

Debe conocer:

- origen;
- severidad;
- responsable;
- vencimiento;
- estado;
- regla;
- histórico.

Debe soportar:

- deduplicación;
- agrupación;
- escalamiento.

---

# 33. NOTIFICACIONES

Una notificación informa sobre:

- tarea;
- alerta;
- aprobación;
- evento.

No es la alerta misma.

Canales:

- aplicación;
- email;
- futuros conectores.

---

# 34. TAREAS Y ACCIONES

Deben diferenciarse.

## Tarea

Obligación operativa.

## Acción Quality

Intervención formal asociada a:

- mejora;
- riesgo;
- NC;
- auditoría;
- decisión.

La plataforma objetivo debe tener una bandeja transversal:

```text
MIS TAREAS
```

en lugar de múltiples listas inconexas por módulo.

---

# 35. AUDIT TRAIL

La plataforma debe preservar:

```text
QUIÉN
QUÉ
CUÁNDO
SOBRE QUÉ
```

para operaciones relevantes.

Debe diferenciar:

- histórico empresarial;
- audit trail técnico.

---

# 36. INTELIGENCIA ARTIFICIAL

La IA forma parte importante de la evolución de Trazaloop, especialmente Quality.

No debe ser un chatbot decorativo.

Debe utilizarse para:

- búsqueda;
- resumen;
- análisis;
- explicación;
- clasificación;
- detección de patrones;
- generación de borradores;
- comparación;
- análisis transversal.

---

# 37. LÍMITES DE LA IA

La IA no debe autónomamente:

- aprobar documentos;
- publicar procesos;
- cerrar no conformidades;
- aceptar riesgos;
- suspender proveedores;
- validar eficacia formal;
- certificar organizaciones;
- fabricar evidencia;
- tomar decisiones laborales de alto impacto.

---

# 38. HECHO, INFERENCIA Y SUGERENCIA

La experiencia IA deberá distinguir:

### Hecho

> Existen tres acciones vencidas.

### Inferencia

> El deterioro coincide temporalmente con el cambio de proveedor.

### Sugerencia

> Podría revisarse el riesgo relacionado.

---

# 39. IA Y SEGURIDAD

Regla:

> **Si el usuario no puede ver un dato, la IA tampoco puede utilizarlo para responderle.**

La recuperación debe respetar:

- tenant;
- RLS;
- capability;
- scope;
- clasificación.

No debe recuperarse todo el tenant para después intentar ocultarlo.

---

# 40. IA Y TEMPORALIDAD

La IA deberá saber distinguir:

```text
versión actual
```

de:

```text
versión vigente en una fecha histórica
```

cuando responda sobre auditorías, documentos o procesos.

---

# 41. IA Y FUENTES

Las respuestas basadas en datos empresariales deben poder mostrar sus fuentes cuando sea viable.

La IA no debe inventar información faltante.

Debe poder responder:

> No encuentro evidencia suficiente registrada.

---

# 42. IA INDEPENDIENTE DEL PROVEEDOR

La arquitectura no debe quedar atada a un único modelo o proveedor.

Debe existir una capa de orquestación capaz de evolucionar.

Las funciones críticas del SGC deben seguir funcionando si la IA está deshabilitada o temporalmente indisponible.

---

# 43. NORMATIVA

Las normas y reglamentos se modelarán como referencias versionadas.

No como estructura primaria del producto.

Ejemplo:

```text
ISO 9001
  ↓
edición
  ↓
requisitos
  ↓
mappings
  ↓
procesos / documentos / riesgos / evidencias
```

Un mapping significa:

> relacionado / soporta / evidencia.

No significa automáticamente:

> cumple.

---

# 44. ARQUITECTURA DE MÓDULOS Y CONTRATOS

Los módulos deben evitar depender fuertemente de tablas internas de otros dominios.

Se favorecerán:

- contratos;
- servicios;
- relaciones;
- eventos;
- mappings.

Ejemplo:

```text
PCR
↓
evento / source link
↓
Quality
```

en lugar de hacer que Quality dependa de detalles internos no estables de PCR.

---

# 45. INTEGRACIONES EXTERNAS

Quality podrá integrarse con:

- ERP;
- CRM;
- MES;
- HRIS;
- LMS;
- sistemas contables;
- mantenimiento;
- APIs;
- CSV/Excel.

Pero debe identificar:

> **qué sistema gobierna cada dato.**

Ejemplo:

```text
ERP
gobierna:
razón social proveedor

Quality
gobierna:
criticidad del proveedor
```

---

# 46. IMPORTACIONES

Importar no debe equivaler a:

> validar automáticamente.

Los datos importados pueden requerir:

- normalización;
- deduplicación;
- validación;
- conciliación.

No deben inventarse datos para completar históricos incompletos.

---

# 47. UX

Trazaloop debe priorizar claridad empresarial.

El usuario no debe necesitar comprender:

- IDs internos;
- UUID;
- nombres de tablas;
- políticas RLS;
- jerga técnica.

Debe navegar por conceptos:

- proveedor;
- producto;
- lote;
- proceso;
- documento;
- indicador;
- riesgo;
- acción.

---

# 48. EXPERIENCIA POR MÓDULO

Cada módulo puede tener navegación propia.

Sin embargo, los motores transversales deben evitar duplicación de UX.

Ejemplo futuro:

```text
MIS TAREAS
ALERTAS
DOCUMENTOS
EVIDENCIAS
```

pueden existir transversalmente.

---

# 49. CENTRO DE MANDO QUALITY

Quality contempla una experiencia:

```text
HOY EN QUALITY
```

que debe responder:

> ¿Qué merece mi atención hoy?

No debe ser simplemente otro dashboard cargado de métricas.

---

# 50. ESTADOS VS. SALUD

Evitar etiquetas absolutas como:

```text
CUMPLE ISO
NO CUMPLE ISO
```

para inferencias automáticas.

Preferir estados operacionales:

```text
EN META
FUERA DE META
REQUIERE ATENCIÓN
REVISIÓN VENCIDA
INFORMACIÓN INSUFICIENTE
```

---

# 51. CURRENT VS. TARGET

Este documento contiene:

- elementos implementados;
- elementos parcialmente implementados;
- arquitectura futura.

Claude o cualquier desarrollador debe distinguir siempre:

```text
CURRENT IMPLEMENTATION
```

de:

```text
TARGET ARCHITECTURE
```

La presencia de un concepto aquí no significa que ya exista en código.

---

# 52. ESTADO FUNCIONAL GENERAL AL INICIO DE QUALITY

Antes de implementar Quality, Trazaloop ya cuenta con una base funcional significativa alrededor de:

- multiempresa;
- autenticación;
- roles;
- planes;
- acceso modular;
- PCR;
- Textiles;
- TrazaDocs;
- evidencias;
- reportes;
- Storage;
- auditoría técnica;
- migraciones PostgreSQL.

Sin embargo, el estado exacto debe ser descubierto desde el repositorio.

No debe inferirse únicamente desde documentación histórica.

---

# 53. QUALITY COMO EVOLUCIÓN, NO REESCRITURA

Quality debe construirse sobre los activos existentes.

Para cada componente se deberá decidir:

```text
REUTILIZAR
EVOLUCIONAR
ADAPTAR
CREAR
DEPRECAR
POSPONER
```

No asumir:

> Quality necesita todo nuevo.

---

# 54. DEUDA TÉCNICA Y COMPATIBILIDAD

Quality no debe utilizarse como excusa para realizar refactors destructivos no necesarios.

Si existe deuda técnica:

1. documentarla;
2. evaluar impacto;
3. decidir momento;
4. proteger rollback.

---

# 55. MIGRACIONES

Principios:

- append-only;
- revisables;
- pequeñas cuando sea posible;
- reversibilidad operacional;
- sin modificar migraciones ya desplegadas;
- validar dependencias.

Toda migración remota requiere procedimiento explícito.

---

# 56. PRODUCCIÓN

`trazaloop.com` es un sistema real.

Cambios de producción requieren:

```text
PRECHECK
↓
BACKUP / ROLLBACK PLAN
↓
MIGRATION / DEPLOY
↓
SMOKE TEST
↓
VALIDATION
```

No realizar cambios destructivos ad hoc.

---

# 57. GIT

La implementación debe respetar:

- branch dedicada;
- working tree conocido;
- commits legibles;
- tags para hitos;
- backup branch antes de cambios de alto riesgo;
- no force push salvo decisión expresa.

---

# 58. TESTING

Trazaloop ha evolucionado utilizando pruebas específicas por sprint/módulo.

Quality deberá reforzar esa disciplina.

Cada vertical relevante deberá considerar:

- unit tests;
- RLS tests;
- integración;
- regresión;
- smoke humano;
- fail-closed;
- multi-tenant.

---

# 59. TEST MULTIEMPRESA

Toda nueva entidad Quality sensible debe probar como mínimo:

```text
ORG A puede ver A
ORG A no puede ver B
ORG A no puede editar B
```

No basta probar happy path.

---

# 60. TEST DE PERMISOS

Deben verificarse:

```text
puede ver
puede crear
puede editar
puede aprobar
puede cerrar
```

según capability.

Ocultar un botón no constituye prueba de seguridad.

---

# 61. TEST DE HISTÓRICO

Para objetos versionados:

```text
versión vigente hoy
```

y:

```text
versión vigente fecha histórica
```

deben estar cubiertas por tests.

---

# 62. TEST DE IA

Las capacidades IA críticas deberán probar:

- grounding;
- permisos;
- fuentes;
- temporalidad;
- no invención;
- distinción hechos/inferencias.

---

# 63. ROADMAP DE PLATAFORMA

La evolución general puede entenderse así:

```text
FASE A
TRAZABILIDAD ESPECIALIZADA
PCR + Textiles

FASE B
GESTIÓN DOCUMENTAL
TrazaDocs

FASE C
AUDITORÍA
Audit

FASE D
SISTEMA DE GESTIÓN
Quality

FASE E
INTELIGENCIA TRANSVERSAL
Automatización + Coherence + AI
```

Las fases pueden superponerse y reutilizar componentes.

---

# 64. RELACIÓN PCR / TEXTILES / QUALITY

PCR y Textiles representan operación especializada.

Quality representa gestión transversal.

Ejemplo:

```text
PCR lote rechazado
↓
evento
↓
Quality case
↓
acción
↓
riesgo
↓
revisión por la dirección
```

Quality no debe copiar toda la genealogía del lote.

Debe referenciar el objeto fuente.

---

# 65. RELACIÓN TRAZADOCS / QUALITY

```text
TrazaDocs
↓
motor documental
↓
Quality
```

Quality añade contexto de:

- procesos;
- riesgos;
- cargos;
- requisitos;
- auditorías.

No debe duplicar el documento.

---

# 66. RELACIÓN AUDIT / QUALITY

```text
Audit
↓
auditoría
↓
hallazgo
↓
Quality Case
↓
acción
```

Audit puede especializar la experiencia del auditor.

Quality utiliza el resultado dentro del SGC.

---

# 67. PRINCIPIO DE OBJETO ÚNICO

Ejemplo:

```text
ACCIÓN AC-041
```

puede estar relacionada con:

- riesgo;
- auditoría;
- NC;
- revisión gerencial.

No deben existir cuatro copias independientes.

---

# 68. MODELO SEMÁNTICO

La arquitectura Quality contempla relaciones como:

```text
belongs_to
governs
supports
measures
evidences
supersedes
implements
affects
mitigates
derives_from
responds_to
generates
verifies
occupies
requires
possesses
trained_by
interacts_with
consumes
produces
executed_by
documented_by
controlled_by
supplied_by
delivered_to
```

Inicialmente pueden implementarse sobre PostgreSQL.

No se requiere una base de grafos desde el MVP.

---

# 69. POSTGRESQL COMO FUENTE DE VERDAD

La IA no debe convertirse en base de datos.

El patrón es:

```text
POSTGRESQL
conserva hechos y relaciones
        ↓
MOTORES
automatizan
        ↓
IA
interpreta y propone
        ↓
PERSONAS
deciden
```

---

# 70. FUENTES Y SNAPSHOTS

Preferencia:

```text
FK a revisión inmutable
```

antes de copiar un snapshot.

Usar snapshot cuando se necesite conservar una composición puntual de múltiples fuentes.

Ejemplos:

- revisión por dirección;
- auditoría;
- reporte emitido.

---

# 71. RETENCIÓN

No toda información tiene igual política.

Deben diferenciarse:

- registro empresarial;
- evidencia;
- documento;
- log técnico;
- conversación IA;
- evento.

La retención deberá ser configurable cuando corresponda y respetar requisitos aplicables.

---

# 72. PRIVACIDAD

Trazaloop deberá minimizar la información sensible que conserva.

Quality no debe evolucionar hacia almacenamiento indiscriminado de:

- datos bancarios;
- nómina;
- salud;
- datos personales innecesarios.

Especial protección para:

- personas;
- clientes;
- contratos;
- estrategia;
- auditorías.

---

# 73. CLASIFICACIÓN DE INFORMACIÓN

La arquitectura futura puede contemplar:

```text
GENERAL
INTERNAL
RESTRICTED
CONFIDENTIAL
```

La clasificación debe afectar:

- acceso;
- descarga;
- IA;
- exportaciones.

---

# 74. REPORTES

Los reportes son representaciones.

No deben convertirse en fuentes paralelas.

Ejemplo:

```text
DATABASE
↓
REPORT
↓
PDF
```

No:

```text
PDF
↓
nuevo dato maestro
```

---

# 75. EXPORTACIONES

PDF, XLSX, CSV y otros exports deben representar el estado del sistema.

Cuando sea necesario preservar exactamente lo emitido, se guarda:

- referencia;
- fecha;
- versión;
- snapshot apropiado.

---

# 76. NOMENCLATURA DE MARCA

Nombre principal:

**Trazaloop**

Módulos:

- **Trazaloop PCR**
- **Trazaloop Textiles**
- **TrazaDocs**
- **Trazaloop Audit**
- **Trazaloop Quality**

Evitar crear submarcas innecesarias para cada función transversal.

---

# 77. IDENTIFICADORES TÉCNICOS LEGACY

El repositorio puede mantener identificadores históricos diferentes de las etiquetas UX.

Regla:

> **No renombrar destructivamente identificadores técnicos únicamente para alinear branding.**

Primero debe evaluarse:

- impacto;
- migraciones;
- APIs;
- tests;
- datos.

---

# 78. PRODUCT PHILOSOPHY

La filosofía final de Trazaloop puede resumirse en cinco afirmaciones:

### 1. Lo que ocurre debe dejar rastro.

### 2. El rastro debe poder convertirse en evidencia.

### 3. La evidencia debe estar conectada con el objeto real que demuestra.

### 4. La información no debe repetirse en cada módulo.

### 5. El sistema debe ayudar a convertir datos en decisiones.

---

# 79. QUALITY PHILOSOPHY

Principio específico:

> **Las personas trabajan para la organización y Trazaloop Quality trabaja para el sistema de gestión.**

Esto implica observar:

- procesos;
- resultados;
- controles;
- relaciones.

No construir vigilancia invasiva de empleados.

---

# 80. REGLAS NO NEGOCIABLES PARA DESARROLLO

Un agente de desarrollo que trabaje sobre Trazaloop debe respetar:

1. No inventar estado técnico.
2. Inspeccionar código y migraciones antes de modificar.
3. No duplicar entidades sin analizar reutilización.
4. No modificar producción durante discovery.
5. No exponer secretos.
6. No debilitar RLS para resolver bugs.
7. No mezclar entitlement y autorización.
8. No sobrescribir históricos.
9. No editar migraciones ya desplegadas.
10. No crear afirmaciones automáticas de certificación.
11. No utilizar IA para lógica determinística crítica.
12. No introducir dependencias cross-tenant.
13. No tratar documentos como simples archivos.
14. No tratar persona y usuario como lo mismo.
15. No copiar datos que puedan referenciarse.
16. No cambiar arquitectura aprobada silenciosamente.

---

# 81. DOCUMENTOS RECTORES

Para implementación deben consultarse como mínimo:

## Documento 1

`Trazaloop_Documento_Maestro_v1.1.md`

Define:

- plataforma;
- módulos;
- filosofía;
- principios comunes;
- límites.

## Documento 2

`Trazaloop_Quality_Architecture_Baseline_v1.0.md`

Define específicamente Quality:

- dominios;
- decisiones congeladas;
- arquitectura transversal;
- modelo relacional maestro.

## Documento 3

Repositorio `trazaloop2`

Define:

- estado técnico actual;
- tablas reales;
- migraciones;
- código;
- tests;
- deuda técnica.

---

# 82. PRECEDENCIA

Para una pregunta como:

> ¿Existe ya una tabla para X?

No responder desde este documento.

Se inspecciona el repositorio.

Para una pregunta como:

> ¿Quality debe usar un segundo motor de documentos?

La arquitectura aprobada responde:

> No, debe evaluar reutilización/evolución de TrazaDocs.

---

# 83. ESTADO DE DOCUMENTOS NORMATIVOS

Las referencias normativas pueden cambiar.

Antes de implementar comportamiento normativo específico debe verificarse la edición vigente desde fuentes oficiales.

Nunca congelar en código una interpretación normativa que puede evolucionar cuando puede modelarse mediante:

```text
STANDARD
↓
EDITION
↓
REQUIREMENT
↓
MAPPING
```

---

# 84. ISO 9001 Y QUALITY

Quality ha sido diseñado anticipando la transición hacia ISO 9001:2026.

Sin embargo, el software debe permanecer desacoplado de una edición específica.

La capa estable está constituida por conceptos como:

- contexto;
- liderazgo;
- política;
- objetivos;
- procesos;
- riesgos;
- soporte;
- competencia;
- operación;
- seguimiento;
- auditoría;
- revisión;
- mejora.

---

# 85. NO CERTIFICATION CLAIM

Trazaloop puede facilitar preparación y evidencia.

No debe presentarse como organismo certificador.

Mensajes apropiados:

> Información relacionada disponible.

> Evidencia registrada.

> Revisión pendiente.

Evitar:

> Trazaloop certifica que cumple.

---

# 86. ROADMAP DE IMPLEMENTACIÓN QUALITY

Quality no debe comenzar implementando todas las entidades simultáneamente.

Secuencia general:

```text
Q0
Technical Discovery & Schema Mapping

↓
Fundación transversal

↓
Procesos

↓
Motor documental / integración TrazaDocs

↓
Personas

↓
Objetivos e indicadores

↓
Proveedores / clientes

↓
Riesgos / acciones

↓
Audit / Revisión gerencial

↓
Automatización / IA
```

El roadmap final se definirá después de Q0 según dependencias reales.

---

# 87. SPRINT Q0

El primer trabajo técnico para Quality debe ser exclusivamente:

**Technical Discovery & Schema Mapping**

Debe inspeccionar:

- repo;
- esquema;
- migraciones;
- RLS;
- TrazaDocs;
- Audit;
- evidencias;
- roles;
- planes;
- Storage.

Resultado:

```text
MODELO QUALITY
↔
IMPLEMENTACIÓN REAL
```

Clasificando:

```text
REUTILIZAR
EVOLUCIONAR
CREAR
ADAPTAR
DEPRECAR
POSPONER
```

---

# 88. Q0 NO IMPLEMENTA QUALITY

Durante Q0:

- no migrations nuevas;
- no deploy;
- no cambios de producción;
- no refactors;
- no correcciones “aprovechando” el análisis.

Q0 produce conocimiento técnico confiable.

---

# 89. CRITERIO PARA EL PRIMER SPRINT REAL

Después de Q0, el primer sprint deberá:

- ser vertical;
- producir valor observable;
- incluir RLS;
- incluir tests;
- preservar compatibilidad;
- minimizar cambios destructivos.

Evitar implementar cien tablas sin flujo funcional.

---

# 90. VERTICAL SLICES

Ejemplo conceptual:

```text
ORGANIZACIÓN
↓
PROCESO
↓
RESPONSABLE
↓
DOCUMENTO
↓
INDICADOR
↓
ALERTA
```

puede ser más valioso que desarrollar cinco dominios incompletos en paralelo.

---

# 91. QUALITY Y EL PRODUCTO EXISTENTE

Quality no debe romper:

- PCR;
- Textiles;
- TrazaDocs;
- autenticación;
- planes;
- Storage.

Toda evolución transversal debe contar con pruebas de regresión.

---

# 92. COMPATIBILIDAD DE DATOS

Cuando una entidad actual sea reemplazada por un modelo más robusto:

preferir:

```text
EVOLUCIONAR
MIGRAR
COMPATIBILITY LAYER
```

antes de eliminar.

---

# 93. DEPRECACIÓN

Una entidad o feature solo debe declararse deprecada cuando exista:

- reemplazo definido;
- estrategia de migración;
- análisis de datos;
- plan de rollback.

---

# 94. OBSERVABILIDAD TÉCNICA

La evolución Quality necesitará saber:

- qué automatización falló;
- qué evento se procesó;
- qué integración está desconectada;
- qué job se retrasó.

Estas capacidades pertenecen al backoffice técnico.

No deben confundirse con alertas del SGC.

---

# 95. MONITORING ≠ QUALITY EVENT

Ejemplo:

```text
API ERP DOWN
```

es inicialmente un problema técnico de integración.

No debe interpretarse como:

```text
proveedor incumple
```

sin datos.

---

# 96. CURRENT TECHNICAL SOURCE OF TRUTH

Claude Code o cualquier agente que implemente Trazaloop debe ejecutar discovery sobre el repo antes de afirmar:

- nombre de tabla;
- último migration number;
- current branch;
- versión de Next;
- políticas;
- helpers;
- rutas;
- entitlements.

Este documento deliberadamente evita congelar detalles volátiles.

---

# 97. DECISIONES DE PRODUCTO CONSOLIDADAS

Las siguientes decisiones se consideran rectoras:

### PDM-01
Trazaloop es una plataforma multiempresa modular, no varias aplicaciones inconexas.

### PDM-02
PCR y Textiles son módulos especializados de trazabilidad.

### PDM-03
TrazaDocs evoluciona hacia motor documental transversal.

### PDM-04
Audit y Quality deben compartir conceptos de auditoría/hallazgo/acción.

### PDM-05
Quality es transversal y sectorialmente neutro.

### PDM-06
Los módulos pueden operar independientemente según acceso contratado.

### PDM-07
Demo, Full y Extra son estados comerciales de acceso; Full y Extra comparten capacidad funcional y se diferencian principalmente por almacenamiento.

### PDM-08
Plan comercial y autorización están separados.

### PDM-09
El aislamiento empresarial se basa en organización y debe ser fail-closed.

### PDM-10
RLS no se sustituye por controles visuales de UI.

### PDM-11
Storage sensible permanece privado.

### PDM-12
Las evidencias pueden ser referencias a objetos existentes.

### PDM-13
Los datos se capturan una vez y se reutilizan.

### PDM-14
No se duplican entidades maestras entre módulos sin justificación.

### PDM-15
Objetos con valor histórico conservan versiones/eventos y no se sobrescriben.

### PDM-16
Documentos y archivos son conceptos diferentes.

### PDM-17
Procesos y procedimientos son conceptos diferentes.

### PDM-18
Cargo, persona y usuario son conceptos diferentes.

### PDM-19
Clientes y proveedores pueden compartir identidad de tercero.

### PDM-20
Eventos, tareas, alertas, acciones y notificaciones son conceptos diferentes.

### PDM-21
Los cálculos y reglas críticas son determinísticos.

### PDM-22
La IA es asistencial y contextual, no autoridad formal.

### PDM-23
La IA no fabrica evidencia.

### PDM-24
La IA respeta permisos, tenant y temporalidad.

### PDM-25
La normativa se mapea sobre los objetos del sistema y no define directamente el esquema.

### PDM-26
Los reportes y PDFs son representaciones, no fuente maestra.

### PDM-27
La implementación evoluciona mediante migraciones incrementales.

### PDM-28
Producción requiere procedimiento, rollback y smoke test.

### PDM-29
Quality reutilizará PCR/Textiles mediante contratos, eventos y source links cuando corresponda.

### PDM-30
El repositorio define el estado técnico actual; la arquitectura aprobada define el estado objetivo.

---

# 98. ARQUITECTURA CONSOLIDADA FINAL

```text
                         TRAZALOOP
                            │
                 ORGANIZACIÓN / TENANT
                            │
     ┌──────────────────────┼────────────────────────┐
     │                      │                        │
AUTH / MEMBERSHIP       ENTITLEMENTS              STORAGE
     │                      │                        │
     └──────────────────────┼────────────────────────┘
                            │
                 MÓDULOS OPERACIONALES
                            │
              ┌─────────────┴─────────────┐
              │                           │
        TRAZALOOP PCR               TRAZALOOP TEXTILES
              │                           │
              └─────────────┬─────────────┘
                            │
                   DATOS + EVIDENCIAS
                            │
             ┌──────────────┼──────────────┐
             │              │              │
         TRAZADOCS        AUDIT         QUALITY
             │              │              │
             └──────────────┼──────────────┘
                            │
                 MOTORES TRANSVERSALES
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
      DOCUMENTOS         EVIDENCIAS         ACCIONES
          │                 │                  │
      WORKFLOWS           EVENTOS           ALERTAS
          │                 │                  │
          └─────────────────┼──────────────────┘
                            │
                   COHERENCE ENGINE
                            │
                       QUALITY AI
                            │
                    DECISIÓN HUMANA
```

---

# 99. PRINCIPIO FINAL

Trazaloop debe evolucionar hacia una plataforma donde la información pueda responder:

```text
¿QUÉ OCURRIÓ?
¿DÓNDE?
¿CUÁNDO?
¿QUIÉN ERA RESPONSABLE?
¿QUÉ DOCUMENTO APLICABA?
¿QUÉ EVIDENCIA EXISTE?
¿QUÉ INDICADOR CAMBIÓ?
¿QUÉ RIESGO SE AFECTÓ?
¿QUÉ ACCIÓN SE TOMÓ?
¿FUNCIONÓ?
```

sin obligar a reconstruir la historia desde:

- hojas de cálculo;
- carpetas;
- correos;
- PDFs aislados.

---

# 100. CIERRE

La arquitectura de Trazaloop se resume en cuatro niveles:

```text
1. OPERACIÓN
PCR · Textiles · sistemas externos

2. MEMORIA ESTRUCTURADA
datos · documentos · evidencias · histórico

3. GESTIÓN
Quality · Audit · indicadores · riesgos · acciones

4. INTELIGENCIA
automatización · coherencia · IA
```

La regla de diseño que debe acompañar toda evolución futura será:

> **No digitalizar burocracia. Digitalizar relaciones, evidencia y decisiones.**

Y su complemento técnico:

> **PostgreSQL conserva la verdad estructurada. Los motores automatizan. La IA ayuda a comprender. Las personas deciden.**

---

## ANEXO A — CHECKLIST PARA UN AGENTE DE DESARROLLO

Antes de modificar Trazaloop, confirmar:

- [ ] Leí este documento.
- [ ] Leí el baseline específico del dominio que voy a tocar.
- [ ] Inspeccioné el repositorio real.
- [ ] Inspeccioné migraciones relevantes.
- [ ] Identifiqué organización y RLS.
- [ ] Identifiqué si existe ya una entidad equivalente.
- [ ] Diferencié current vs target architecture.
- [ ] No voy a duplicar datos sin justificación.
- [ ] No voy a modificar producción durante discovery.
- [ ] No voy a exponer secretos.
- [ ] Tengo plan de tests.
- [ ] Tengo estrategia de rollback si el cambio llega a producción.

---

## ANEXO B — DOCUMENTOS DE CONTEXTO PARA CLAUDE

Para el proyecto de implementación de Quality deben incluirse como mínimo:

```text
Trazaloop_Documento_Maestro_v1.1.md
Trazaloop_Quality_Architecture_Baseline_v1.0.md
```

y Claude Code debe operar sobre:

```text
~/Developer/trazaloop2
```

El Sprint Q0 debe utilizar estos documentos como arquitectura objetivo y el repositorio como estado técnico real.

---

**FIN — Trazaloop Documento Maestro v1.1**
