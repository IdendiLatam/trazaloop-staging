# TRAZALOOP · SPRINT T9G — INFORME DE LANZAMIENTO: ESPAÑOL, HINTS CON ENLACES Y PARIDAD CPR/TEXTILES

Fecha de ejecución: 2026-07-23.

## 1. Resumen ejecutivo

T9G prepara Trazaloop para el lanzamiento en tres frentes: (a) barrido completo del español visible con el glosario canónico («Empresa», nunca «Organización»), (b) una arquitectura ÚNICA y compartida de tips/hints para TrazaDocs CPR y TrazaDocs Textiles, incluido el botón «i» y el soporte SEGURO de enlaces `[Texto](https://…)` y rutas internas `/…`, y (c) regresión verificada de que el superadministrador conserva la asignación independiente de módulos y planes por empresa. No se tocó ninguna migración, ninguna política RLS ni de Storage, ningún finalizador ni la arquitectura de carga directa de T9F.5B.1. No hubo limpieza de datos ni conexión a Supabase staging o producción.

## 2. Rama y commit de entrada

- Repositorio: `IdendiLatam/trazaloop-staging`.
- Rama: `feature/t9g-launch-language-hints`.
- Commit de entrada: `37ed2836693f1b19b9fd5833e93a839f223a1824` («chore: import T9F.5B.1 pre-QA candidate»), sobre `b922e1c` (T9F.5A) y `fa07e5a` (T9F.4).

## 3. Evidencia de que el árbol contenía T9F.5B.1

Verificado ANTES de modificar código. Presentes: `lib/db/cpr-storage-objects.ts`, `lib/domain/cpr-file-verification.ts`, `server/actions/cpr-upload-verification.ts` (finalizadores server-only), `lib/storage/direct-upload.ts` (begin con metadata → PUT directo a Storage con la sesión del usuario, sin signed URL, → finalize con intentId), `lib/db/storage-intents.ts` (mapa de códigos, `OBJECT_SIZE_MISMATCH`, `OBJECT_MIME_MISMATCH`, `p_actor_id`), `lib/db/storage-deletion.ts`, `supabase/migrations/0101_t9f1_module_access_hardening.sql`, `docs/platform/TRAZALOOP_T9F5B1_PRE_QA_CORRECTION_REPORT.md`, `docs/platform/TRAZALOOP_T9F5B_ATTACK_CLOSURE_MATRIX.md`, `docs/platform/TRAZALOOP_T9F5C_QA_EXECUTION_GUIDE.md` y `tests/rls/t9f5-adversarial-attacks.test.ts`. La corrección de service_role frente a `p_actor_id` está en 0101 (§ del RPC con validación de `p_actor_id` contra `auth.users` y funciones SERVER-ONLY restringidas a service_role). El único `formData.get("file")` del árbol es el import CSV de catálogos (`server/actions/imports.ts`); ningún archivo CPR o TrazaDocs viaja por FormData a una Server Action.

## 4. Alcance

Idioma visible y consistencia de redacción; glosario canónico; hints compartidos CPR/Textiles con botón «i»; enlaces seguros en hints (https y rutas internas); ayuda y vista previa en el editor de hints; pruebas de enlaces, paridad, control de inglés y regresión del superadministrador; documentación.

## 5. Exclusiones

Sin limpieza de datos; sin migraciones (0101 y 0100 intactas, sin 0102); sin cambios en RLS, políticas de Storage, upload intents, finalizadores, reservas, límites, cuotas, Demo/Full/Extra, pasaportes, QR ni circularidad; sin funciones comerciales nuevas; sin commit/push/PR/merge/despliegue; sin conexión a staging ni producción.

## 6. Rutas revisadas

98 rutas `page.tsx` bajo `app/`: autenticación (inicio de sesión, registro, recuperación y cambio de contraseña), selector de empresa y de módulos, shell (menú lateral, encabezados, navegación, breadcrumbs), panel, configuración (empresa, usuarios, roles, invitaciones), consola de plataforma (empresas, detalle de empresa, módulos y planes, tickets, estructuras TrazaDocs), CPR (diagnóstico, proveedores, materiales, productos, evidencias, órdenes, lotes, contenido reciclado, trazabilidad, reportes, TrazaDocs y maestro documental), Textiles (catálogos, productos y referencias, evidencias, trazabilidad — órdenes/corridas, lotes de entrada, lotes producidos —, circularidad, TrazaDocs Textil, pasaportes privados y su vista compartida) e implementación. La revisión combinó el detector automático (suite `t9g-spanish-ui`) y lectura manual de superficies (tablas, filtros, búsquedas, paginación, formularios, botones, modales, confirmaciones, estados vacíos, cargas, éxitos, errores, toasts, tooltips, placeholders, `aria-label`, `title`, `alt`).

## 7. Componentes revisados

Todos los árboles `components/ui`, `components/layout`, `components/domain` (audit-support, evidences, plans, platform, team, textiles, trazadocs) y `components/textiles` (pasaportes). Resultado: la interfaz ya estaba redactada en español (trabajo acumulado de sprints previos); los hallazgos reales fueron del glosario (ver §9-§11) y la brecha de paridad de hints en Textiles.

## 8. Server Actions revisadas

Las 20+ Server Actions bajo `server/actions/` que emiten mensajes a interfaz: auth, organizations, settings, team, support, platform, platform-modules, module-plans, catalog, evidences, imports/import, traceability, recycled, trazadocs, trazadocs-master, cpr-upload-verification, textiles-* (catalogs-admin, products, evidences, traceability, circularity, trazadocs, passport, passport-share). Los mensajes visibles están en español y los códigos internos se mapean centralizadamente (`lib/db/storage-intents.ts`, `lib/modules/messages.ts`, mapeos por acción). No se muestran errores SQL, stack traces, nombres de tablas o funciones ni errores crudos de Supabase; `server/actions/auth.ts` traduce los mensajes conocidos de Supabase Auth (p. ej. «Invalid login credentials» → «Correo o contraseña incorrectos.»).

## 9. Textos en inglés encontrados

El detector de alta confianza (§19) arrojó CERO textos visibles en inglés. Los candidatos iniciales del barrido exploratorio («Roles», «No aplica», «No documentado», «No hay invitaciones pendientes», «Respuestas “No”…») resultaron español válido (falsos positivos del listado de palabras). Los atributos `type="password"`, `autoComplete`, claves internas (`pending`, `failed`, `expired`, `demo`, `full`, `extra`) y códigos de error permanecen en inglés por ser identificadores no visibles, conforme a §5.

## 10. Textos mixtos encontrados

Un caso: la introducción de «Cargar evidencia» de Textiles mezclaba término técnico de infraestructura con español («…se sube DIRECTAMENTE al bucket privado de la organización…»). Se corrigió a «…se sube directamente al almacenamiento privado de la empresa…» (elimina «bucket» visible y la mayúscula enfática).

## 11. Traducciones aplicadas

68 reemplazos de redacción en 32 archivos (66 en código de producto + 2 expectativas de copy en pruebas T9E): la totalidad de las cadenas visibles con «organización/organizaciones» pasó a «empresa/empresas», incluyendo mensajes de Server Actions («…no existe o no pertenece a tu empresa», «verifica tu rol en la empresa», «…no es válida para tu empresa»), encabezados («Empresa activa»), constantes de dominio (fibras del catálogo base, evidencias Textiles, guía de importación CSV, mensajes de plataforma), la etiqueta de área de soporte («Empresa») y el ítem del checklist («Crear empresa»). El detalle línea a línea está en `TRAZALOOP_T9G_SPANISH_SWEEP_MATRIX.md`.

## 12. Términos técnicos conservados

Trazaloop, TrazaDocs, Trazaloop CPR, Trazaloop Textiles, Demo, Full, Extra, CPR, QR, PDF, CSV, XLSX, MIME, NTC 6632, UNE-EN 15343, ISO, Supabase, Vercel; nombres de variables, tablas, columnas, RPC, funciones, códigos de error, rutas, migraciones y claves internas (`demo`, `full`, `extra`, `pending`, `failed`, `expired`, `disabled`, `demo_permanent`). Los códigos internos siguen en inglés; solo su representación es visible y en español.

## 13. Arquitectura previa de hints CPR

Botón «i» (`components/domain/trazadocs/section-hint.tsx`, desplegable simple sin librerías), usado por `section-editor.tsx` dentro de `document-editor.tsx`; contenido: columna `hint` de las secciones del blueprint (`getBlueprintSections(doc.blueprintId)` en la página de edición); edición: exclusiva del superadministrador de plataforma en `/platform/trazadocs/[id]` (`blueprint-detail-editor.tsx`, campo `name="hint"`, guardas `canEditBlueprint` + server action + RLS); sin contenido no se renderizaba nada. Textiles mostraba en cambio un párrafo plano «Tip: …» siempre visible: esa era la brecha.

## 14. Arquitectura compartida final

- `lib/domain/hint-links.ts` (nuevo): parser puro `parseHintText` → tokens (`text` | `break` | `link{label,href,external}`), clasificador `classifyHintUrl`, `hasHintContent` y `HINT_LINK_HELP_TEXT`.
- `components/ui/hint-text.tsx` (nuevo): renderizador React único de tokens.
- `components/ui/section-hint.tsx` (nuevo): botón «i» compartido, generalización del componente CPR (mismo icono, tamaño, posición y estilos), con Escape, cierre visible, foco visible y desplazamiento para contenido largo.
- El duplicado `components/domain/trazadocs/section-hint.tsx` se ELIMINÓ; CPR importa el compartido. `parseHintText` se define UNA sola vez en todo el árbol (verificado por prueba).

## 15. Paridad Textiles

`trazadoc-editor.tsx` reemplazó el párrafo «Tip:» por `<SectionHint hint={s.hint} />` junto al título de cada sección. El contexto documental se conserva: los hints Textiles siguen resolviéndose vía `listTextileTrazadocHints(blueprintId)` sobre el blueprint del propio documento; el motor filtra blueprints y documentos por `module_key` (`textiles` en el wrapper, `cpr` por defecto), de modo que un hint CPR no puede aparecer en Textiles ni al revés (pruebas 6-7 de paridad). El contenido CPR existente no cambió.

## 16. Botón «i»

`type="button"` en el botón y en el cierre (jamás envía formularios ni bloquea la edición); «i» reconocible en círculo (h-5 w-5, mismos estilos previos); `aria-label="Más información"` y `title="Más información"`; `aria-expanded`; operable con teclado (elemento `button` nativo) con foco visible (`focus-visible:outline`); Escape cierra y devuelve el foco al botón; cierre visible «Cerrar»; el panel se inserta en flujo con `mt-1.5` (sin saltos bruscos) y `max-h-64 overflow-y-auto` para contenido largo; contraste con los tokens `text-loop`/`text-ink-soft` existentes; funciona igual en escritorio y móvil (sin hover obligatorio). Sin contenido: ni botón, ni panel vacío, ni error (`hasHintContent` → `null`).

## 17. Renderizador seguro

`HintText` recibe texto plano y produce nodos React (React escapa el texto: `<script>` o `<a href=…>` escritos en un hint se MUESTRAN como texto y jamás se ejecutan/interpretan). Admite saltos de línea, varios enlaces por hint y conserva el texto anterior y posterior; Markdown incompleto queda literal. Nunca usa `dangerouslySetInnerHTML`, editores HTML, iframes, imágenes remotas, scripts, estilos inyectados, eventos ni atributos arbitrarios. Lo usan CPR, Textiles y la vista previa del editor (mismo módulo importado; verificado por prueba de definición única).

## 18. Enlaces internos

`[Ir a configuración](/settings)`: deben comenzar por `/` y nunca por `//`; se renderizan con `next/link`, abren normalmente en Trazaloop y NO fuerzan nueva pestaña.

## 19. Enlaces externos

`[Texto del enlace](https://ejemplo.com)`: solo `https:`; se renderizan con `target="_blank"` y `rel="noopener noreferrer"`. Se admiten parámetros de consulta y fragmentos.

## 20. Protocolos bloqueados

`javascript:`, `data:`, `file:`, `vbscript:`, `ftp:`, `http:`, `mailto:` y cualquier otro distinto de `https:`; URLs protocol-relative `//dominio.com`; HTML embebido; URLs con caracteres de control, espacios, comillas o ángulos. La barrera NO es una regex única: la regex solo tokeniza `[texto](url)`; la decisión la toma `classifyHintUrl` con el constructor `URL` + allowlist explícita de protocolo + verificación de caracteres. URL inválida → el texto se muestra literal, sin crear enlace y sin romper el contenido.

## 21. Edición

La interfaz y los permisos de edición de hints se CONSERVAN: solo el superadministrador de plataforma (`canEditBlueprint === "superadmin"`; support y roles de empresa en solo lectura, `disabled={!canManage}` + server action + RLS). Como los hints Textiles provienen del mismo motor de blueprints, la extensión a Textiles usa la MISMA interfaz de `/platform/trazadocs` sin crear una segunda. Sin migraciones ni cambios de base de datos.

## 22. Vista previa

`HintEditorField` (dentro de `blueprint-detail-editor.tsx`) añade bajo el textarea la ayuda «Puedes agregar enlaces usando el formato: [Texto del enlace](https://ejemplo.com)» y una vista previa en vivo que renderiza con EXACTAMENTE el mismo `HintText` del usuario final, tanto al editar secciones existentes como al agregar una nueva. Sin editor enriquecido pesado; el campo sigue siendo el mismo textarea con `name="hint"`.

## 23. Permisos

Sin cambios: superadministrador de plataforma edita hints; support consulta; administradores de empresa, supervisores, consultores y usuarios normales no acceden a `/platform/trazadocs`. Verificado en la suite de paridad (pruebas 8-9).

## 24. Accesibilidad

Botón nativo con `aria-label`/`title` «Más información», `aria-expanded`, foco visible, Escape con retorno de foco, cierre visible, contraste de los tokens del design system y panel desplazable. Los textos leídos por tecnologías de asistencia (aria-label, title, alt) del resto de la interfaz se auditaron dentro del detector §19.

## 25. Regresión del superadministrador

Verificado por la suite `t9g-spanish-ui` (pruebas 5-12) sobre la lógica pura real (`resolveModuleAccess`, `isFunctionalModuleCode`) y la fuente de la acción: CPR y Textiles admiten cada uno Deshabilitado / Demo permanente / Full / Extra de forma independiente (combinaciones CPR Full + Textiles Demo; CPR Demo + Textiles Extra; CPR deshabilitado + Textiles Full; Textiles deshabilitado + CPR Extra); `TARGET_STATES` sigue siendo exactamente esos cuatro; Quality y Construcción siguen `coming_soon` («Próximamente»), no asignables y sin controles; no existe un plan general editable contradictorio (la suscripción general es informativa y así lo dice la pantalla); la acción exige `requirePlatformStaff` + `isSuperadmin` con mensaje en español, y la RPC 0100 lo re-verifica en SQL — ningún rol de empresa puede cambiar planes. Todos los textos de la sección están en español.

## 26. Archivos creados

`lib/domain/hint-links.ts`; `components/ui/hint-text.tsx`; `components/ui/section-hint.tsx`; `tests/unit/t9g-hint-links.test.ts`; `tests/unit/t9g-hint-parity.test.ts`; `tests/unit/t9g-spanish-ui.test.ts`; `docs/platform/TRAZALOOP_T9G_LAUNCH_LANGUAGE_AND_HINTS_REPORT.md`; `docs/platform/TRAZALOOP_UI_GLOSSARY_ES.md`; `docs/platform/TRAZALOOP_T9G_SPANISH_SWEEP_MATRIX.md`.

## 27. Archivos modificados

34: `package.json` (scripts T9G y test:all); componentes de hints (`section-editor.tsx`, `trazadoc-editor.tsx`, `blueprint-detail-editor.tsx`); 9 páginas de `app/`; 8 archivos de `lib/`; 12 Server Actions; y 2 pruebas T9E cuyas ASERCIONES DE COPY se actualizaron al glosario («todas las empresas», «no existe o no pertenece a tu empresa») conservando intactas sus expectativas de seguridad (filtro `organization_id` del servidor, FK 23503, triggers). Detalle completo en la matriz de barrido.

## 28. Archivos eliminados

`components/domain/trazadocs/section-hint.tsx` (sustituido por el componente compartido `components/ui/section-hint.tsx`; sin duplicados).

## 29. Pruebas de idioma

`npm run test:t9g-spanish` (12 verificaciones): detector §19 en cero hallazgos; cero «organización» visible; términos obligatorios presentes; códigos internos mapeados a español. Ejecutada y aprobada.

## 30. Pruebas de hints

`npm run test:t9g-parity` (14 verificaciones §18): componente único, renderizador único (definición única de `parseHintText` en todo el árbol), enlaces en ambos módulos, «i» con/sin contenido, aislamiento CPR↔Textiles, permisos de edición, vista previa con el mismo renderer, `type="button"`, teclado, Escape y conservación del comportamiento CPR. Ejecutada y aprobada.

## 31. Pruebas de seguridad de enlaces

`npm run test:t9g-links` (24 verificaciones; incluye las 20 de §17): texto sin enlaces; https válido; interno válido; varios enlaces; saltos de línea; parámetros; fragmento; `javascript:`/`data:`/`file:`/`vbscript:` y `//dominio.com` sin enlace; `<script>` y `<a>` como texto plano; `noopener noreferrer`; `_blank` externo; interno sin nueva pestaña; Markdown malformado; texto posterior conservado; URL inválida como texto seguro; más allowlist de protocolo, caracteres prohibidos, `hasHintContent` y la ayuda del editor. Ejecutada y aprobada.

## 32. Pruebas de regresión

`test:all` completo (incluye T9F.4 `test:t9f4`, T9F.5B `test:t9f5b`, T9F.5B.1 `test:t9f5b1`, T9F.1-3, y las suites T9E de TrazaDocs y Textiles: trazadocs, trazadocs-section-hardening, textiles-trazadocs, evidencias + hardening + carga directa + server-only + inmutabilidad + políticas estáticas, trazabilidad + hardening, circularidad + hardening, pasaportes completos, navegación, selector de módulos, t9f-module-access y t9f-provisioning): 826 verificaciones en verde, salida 0. Ninguna expectativa de seguridad fue debilitada. Las suites RLS contra base de datos (`tests/rls/*`, incluida `t9f5-adversarial-attacks`) NO se ejecutaron: requieren credenciales de Supabase staging y T9G prohíbe esa conexión.

## 33. npm ci

Ejecutado y aprobado (instalación limpia desde `package-lock.json`, sin conexión a Supabase).

## 34. Typecheck

`npm run typecheck` (tsc --noEmit): ejecutado y aprobado, cero errores.

## 35. Lint

`npm run lint`: ejecutado y aprobado — cero errores; 1 warning PREEXISTENTE de la base (`tests/evidences/textiles-evidences-hardening.test.ts`, variable sin uso), no introducido ni tocado por T9G.

## 36. Build

`npm run build` (Next.js producción): ejecutado y aprobado; todas las rutas dinámicas, sin prerender que exija conexión.

## 37. test:all

Ejecutado y aprobado: salida 0, 826 ✔ / 0 ✘, 52 suites en verde (incluye typecheck y lint internos y las tres suites T9G al final de la cadena).

## 38. Riesgos residuales

1) El detector de inglés es heurístico de alta confianza: minimiza falsos positivos a costa de poder omitir frases cortas ambiguas; por eso se complementó con revisión manual y queda como control permanente en `test:all`. 2) Las suites RLS/BD no corrieron en este entorno (prohibición de conexión): deben ejecutarse en la ventana QA habitual (guía T9F.5C) antes del despliegue. 3) Los enlaces externos de hints los redacta únicamente el superadministrador; la validación técnica no juzga la reputación del destino — es un riesgo editorial, no técnico. 4) El texto de hints con `[texto](url)` escrito antes de T9G (si existiera en datos) pasará a renderizarse como enlace si la URL es segura; con URL no segura se muestra literal, comportamiento idéntico al actual. 5) El warning de lint preexistente se dejó intacto para no tocar una prueba de seguridad T9F fuera de alcance.

## 39. Checklist final

- [x] Punto de partida T9F.5B.1 completo (commit 37ed283).
- [x] 0101 sin modificar; 0100 sin modificar; ninguna migración tocada; sin 0102; sin migraciones aplicadas.
- [x] Arquitectura de seguridad intacta (carga directa, finalizadores, intents, reservas, tamaños, MIME, p_actor_id).
- [x] Textos visibles en español; términos técnicos conservados; sin errores internos crudos.
- [x] «Empresa», «Orden / corrida de producción», «Lote de entrada», «Lote producido / lote final», «Trazaloop Textiles».
- [x] CPR conserva hints; Textiles con botón «i»; arquitectura única; sin implementación paralela.
- [x] Enlaces https + rutas internas; protocolos peligrosos bloqueados; sin dangerouslySetInnerHTML; HTML nunca se ejecuta; noopener noreferrer; vista previa con el mismo renderizador; permisos conservados; botón accesible.
- [x] Superadministrador con asignación independiente CPR/Textiles; Quality y Construcción no asignables.
- [x] Sin limpieza de datos; sin conexión a staging/producción.
- [x] Typecheck ✔ · Lint sin errores ✔ · Build ✔ · test:all ✔ · Suites T9G ✔ · ZIP limpio ✔.
