# Changelog

Todas las versiones notables de Trazaloop se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado sigue [SemVer](https://semver.org/lang/es/).

---

## [1.0.0] — fecha de lanzamiento pendiente

Primera versión **oficial** de Trazaloop. Consolida el trabajo de los
sprints 1–10 y T0–T9G en un producto publicado, retira todo el lenguaje de
beta / lanzamiento controlado y fija los procedimientos de despliegue,
verificación y reversión para producción.

> El despliegue todavía no se ha realizado. La fecha se fija al ejecutar el
> procedimiento de `docs/releases/V1.0.0_PRODUCTION_READINESS.md`.

### Plataforma

- Trazaloop se presenta como **plataforma modular de trazabilidad**, no
  como un producto de un solo módulo.
- **Portal público** (`/`) sin login: hero de plataforma y tarjetas por
  módulo con su estado real.
- **Acceso único**: una sola cuenta de Trazaloop da entrada a todos los
  módulos disponibles. Nunca hay logins separados por módulo.
- **Catálogo canónico de módulos** (`lib/modules/catalog.ts`) como fuente
  única de qué es comercial, qué es funcional y qué está «Próximamente»,
  con su espejo en base de datos (`modules.is_functional`).
- **Registro central del shell** (`lib/modules/registry.ts`): identidad,
  badge de encabezado, ruta de inicio y navegación por módulo.
- Módulos funcionales: **Trazaloop CPR** y **Trazaloop Textiles**.
- Módulos en preparación, no asignables: **Trazaloop Quality** y
  **Trazaloop Construcción**.
- Selector de empresa activa, gestión de equipo, invitaciones, perfil,
  datos de empresa, onboarding guiado y Centro de soporte.
- Consola de administración de plataforma para el superadministrador:
  alta de empresas, asignación de módulos, estructuras TrazaDocs y
  tickets.

### Trazaloop CPR

- Trazabilidad y **contenido reciclado** para plásticos conforme a
  criterios de **NTC 6632:2022** y **UNE-EN 15343:2008**.
- Diagnóstico normativo con puntuación y recomendaciones.
- Catálogos de proveedores, materiales, sitios y familias de producto,
  con clasificación de origen del material.
- Trazabilidad lote a lote: lotes de entrada, órdenes de producción,
  consumos, composición y lotes de salida.
- Cálculo de contenido reciclado por lote producido, con **snapshots
  inmutables**, niveles de defendibilidad y dossier técnico imprimible.
- Importación por CSV de catálogos, evidencias, lotes, órdenes, consumos
  y composición, con validación previa y trabajos de importación
  auditados.
- Flujo guiado y checklist de implementación.

### Trazaloop Textiles

- Diagnóstico textil propio, independiente del de CPR.
- Catálogos textiles: proveedores, materiales, procesos, colecciones,
  componentes y referencias.
- **Catálogo base de fibras** global más **fibras personalizadas** por
  empresa.
- Productos y **composición de fibras** con validación de porcentajes.
- Evidencias textiles con carga directa a Storage, finalización
  **server-only**, verificación de firma de archivo, validación de
  estructura OOXML y control de UTF-8 en CSV.
- Trazabilidad textil: órdenes de producción, lotes de entrada y salida,
  consumos, pasos de proceso y procesos externalizados.
- **Evaluación de circularidad** con metodología y criterios propios.
- **Pasaporte técnico textil** con snapshot completo e inmutable,
  trazabilidad de fuentes, huecos y advertencias declarados, y
  **enlaces privados de compartición** con caducidad.
- Kill switch global `TEXTILES_MODULE_ENABLED`, apagado por defecto.

### TrazaDocs

- Documentos técnicos vivos por blueprint, con secciones, versionado,
  historial de estados y transiciones controladas.
- Documentos **descargables** con versionado de archivo.
- **Maestro de documentos** unificado (vivos y descargables).
- Blueprints y secciones gestionables desde la consola de plataforma.
- Impresión y dossier con logo de la empresa.
- Blueprints diferenciados por módulo (CPR y Textiles).

### Pasaportes

- Generación con snapshot congelado del estado del producto.
- Cierre documental de fuentes, evidencias y circularidad.
- Enlaces privados firmados con digest, revocables y con caducidad.
- Los pasaportes **nunca** son públicos por defecto.

### Planes y accesos comerciales

- Planes **Demo**, **Full** y **Extra**.
- **Demo** es un plan comercial real, no una versión de prueba del
  software.
- Toda empresa nueva recibe **Demo temporal de 48 horas** en los módulos
  funcionales, de forma automática y auditada.
- **Full** y **Extra** tienen el mismo acceso funcional; se diferencian
  únicamente en la cuota de almacenamiento.
- Acceso por módulo (`access_mode` demo/full/extra) con vigencia propia,
  gestionable por el superadministrador de forma independiente para CPR y
  para Textiles.
- Contabilidad de almacenamiento y límites por plan, con reservas
  atómicas y reconciliación de tamaños.

### Seguridad

- **Row Level Security** en todas las tablas con ámbito de empresa, con
  aislamiento verificado entre organizaciones.
- Todos los buckets de Storage son **privados**; el acceso pasa por
  políticas y URLs firmadas.
- Cliente administrativo **server-only**: la clave secreta jamás llega al
  navegador.
- La finalización de cargas de evidencias es server-only y atómica.
- Inmutabilidad de metadata de archivo y de los snapshots de cálculo.
- Endurecimiento de las transiciones de estado en TrazaDocs, trazabilidad,
  circularidad y pasaportes.
- Aceptación legal obligatoria antes de operar, con registro de versión,
  momento, IP y agente.
- Los módulos «Próximamente» no son asignables ni operables por diseño.

### Enlaces seguros en hints

- Parser **único y compartido** (`lib/domain/hint-links.ts`) para los
  hints de CPR y de Textiles, y para la vista previa del editor.
- Solo se aceptan enlaces **HTTPS** y rutas **internas** de Trazaloop.
- Se rechazan `javascript:`, `data:`, `vbscript:`, `file:`, HTTP plano y
  URLs protocol-relative.

### Correcciones de lanzamiento (esta versión)

- Versión del paquete elevada de `0.5.0` a **1.0.0**, con
  `package-lock.json` sincronizado.
- Retirado el badge «Beta / lanzamiento controlado» de la portada.
- Retirada la etiqueta «beta / lanzamiento controlado» del riel de
  autenticación, sustituida por la etiqueta discreta de versión.
- Retirada la frase «Trazaloop está en beta / lanzamiento controlado» del
  muro de aceptación legal.
- Etiqueta de versión visible cambiada de `Trazaloop v0.5.0 · pilot` a
  **`Trazaloop v1.0`**, derivada de `package.json`.
- Metadatos HTML globales actualizados para representar la plataforma
  completa y no solo CPR.
- Retiradas las referencias visibles a sprints internos en los textos de
  catálogos, importación de catálogos y composición de lotes.
- **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** pasa a ser la variable
  principal de la clave pública en los clientes de servidor, de navegador
  y en el **middleware de sesión** (`proxy.ts`), con respaldo temporal de
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (mismo patrón que `SUPABASE_SECRET_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`).
- **Detección de ambiente de despliegue corregida**: el distintivo
  «Ambiente staging» ya no se deduce del nombre del dominio, sino de
  `VERCEL_TARGET_ENV` / `VERCEL_ENV` (`lib/env.ts` ·
  `resolveDeploymentEnvironment`). Un despliegue **Production** sobre un
  dominio `*.vercel.app` deja de marcarse por error como staging.
  `NEXT_PUBLIC_SITE_URL` deja de ser fuente de autoridad sobre el ambiente
  y queda solo como base para construir enlaces. Nuevo distintivo
  «Entorno local» en desarrollo.
- **Contrato de variables unificado**: `ACTIVE_ORG_COOKIE_SECRET` y
  `NEXT_PUBLIC_SITE_URL` — que el código consume de verdad — quedan como
  obligatorias en Production y Preview, verificadas por `precheck:env` y
  documentadas en `.env.example`, que separa variables vigentes,
  automáticas de Vercel, compatibilidad heredada y scripts locales.
- Añadida la plantilla `.env.example` (solo nombres, nunca valores) y su
  excepción en `.gitignore`.
- Nueva suite de regresión de release (`npm run test:release`) con los
  invariantes de la versión oficial, incluida la detección de ambiente y
  el contrato completo de variables.
- La prueba histórica que **exigía** el texto de beta en el riel de
  autenticación se ha invertido y reforzado: ahora lo **prohíbe**.
- Incorporada a `test:all` la suite `t9g-public-platform-entry`, que
  existía sin script de npm.

### Documentación y herramientas de release

- `docs/releases/V1.0.0_PRODUCTION_READINESS.md` — procedimiento completo
  de puesta en producción.
- `docs/releases/V1.0.0_SMOKE_TESTS.md` — pruebas manuales posteriores al
  despliegue.
- `docs/releases/V1.0.0_ROLLBACK.md` — procedimiento de reversión.
- `docs/releases/V1.0.0_LEGAL_REVIEW.md` — informe de documentos legales
  activos y propuesta de actualización.
- `scripts/release/v1/verify-empty-production.sql` — verificación de
  producción limpia, 100 % de solo lectura.
- `scripts/release/v1/precheck-env.ts` (`npm run precheck:env`) —
  comprobación de **presencia** de variables, nunca de valores.
- `scripts/release/v1/cleanup-staging.ts` (`npm run cleanup:staging`) —
  limpieza **opcional** de staging, dry-run por defecto.
- `scripts/release/v1/publish-legal-v2.sql` — publicación de documentos
  legales v2. **No ejecutado**; requiere revisión legal.

### Notas de migración

- No se ha añadido ninguna migración en esta versión. El esquema es el de
  **`0001`–`0102`**, sin cambios.
- La actualización de los documentos legales es una operación de **datos**
  y se hace con un script operativo, no con una migración.

### Pendiente antes de declarar GO

- Revisión legal de `docs/releases/V1.0.0_LEGAL_REVIEW.md`: los documentos
  legales activos todavía dicen «versión preliminar».

---

## Versiones anteriores

Las versiones `0.x` fueron internas y de piloto. Su historial detallado,
sprint a sprint, está en `README.md`.
