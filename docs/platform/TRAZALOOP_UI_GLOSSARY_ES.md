# TRAZALOOP · GLOSARIO CANÓNICO DE LA INTERFAZ EN ESPAÑOL

Documento de referencia del Sprint T9G. Define la terminología ÚNICA de todos
los textos visibles al usuario. Los identificadores internos (variables,
tablas, columnas, RPC, códigos de error, claves almacenadas) NO se traducen:
solo su representación visible.

## 1. Término interno → texto visible

| Término interno / inglés | Texto visible | Contexto |
|---|---|---|
| Organization / Organisation | Empresa | Toda la interfaz: shell, configuración, plataforma, mensajes de Server Actions. Jamás «Organización» visible. |
| Organizations | Empresas | Listados de la consola de plataforma. |
| Dashboard | Panel | Navegación y encabezados. |
| Settings | Configuración | Menú lateral y páginas. |
| Sign in | Iniciar sesión | Autenticación. |
| Sign up | Crear cuenta | Autenticación. |
| Sign out / Log out | Cerrar sesión | Menú de usuario. |
| Save | Guardar | Botones de formularios. |
| Cancel | Cancelar | Botones y modales. |
| Edit | Editar | Acciones de tabla y detalle. |
| Delete | Eliminar | Eliminación definitiva. |
| Remove | Quitar (desvincular) o Eliminar (destruir), según contexto | P. ej. «Quitar el vínculo» de una evidencia. |
| Create | Crear | Altas. |
| Add | Agregar | Añadir elementos a un conjunto. |
| Update | Actualizar | Ediciones guardadas. |
| Search | Buscar | Cajas de búsqueda. |
| Filter | Filtrar | Controles de listados. |
| Clear filters | Limpiar filtros | Listados. |
| Loading | Cargando | Estados de carga («Cargando…»). |
| Processing | Procesando | Operaciones largas. |
| Upload | Cargar archivo / Cargar | Envío de archivos («cargar», nunca «subir file» ni «upload»). |
| Download | Descargar | Recepción de archivos. |
| Retry / Try again | Intentar nuevamente / Intenta de nuevo | Mensajes de error accionables. |
| Previous | Anterior | Paginación. |
| Next | Siguiente | Paginación y asistentes. |
| Back | Volver | Navegación. |
| Continue | Continuar | Asistentes. |
| Close | Cerrar | Modales y paneles (incluye el cierre del botón «i»). |
| Confirm | Confirmar | Confirmaciones. |
| Active | Activo / Activa | Estados (concuerda en género con el sustantivo). |
| Inactive | Inactivo / Inactiva | Estados. |
| Enabled | Habilitado | Módulos y funciones. |
| Disabled | Deshabilitado | Módulos y funciones. |
| Pending | Pendiente | Estados (clave interna `pending`). |
| Completed | Completado / Completada | Estados. |
| Failed | Fallido / Fallida | Estados (clave interna `failed`). |
| Expired | Vencido / Vencida | Estados (clave interna `expired`). |
| Unknown | Desconocido | Valores no determinables. |
| No data | No hay información | Estados vacíos. |
| No results | No se encontraron resultados | Búsquedas sin coincidencias. |
| Created at | Fecha de creación | Columnas de tabla. |
| Updated at | Última actualización | Columnas de tabla. |
| Created by | Creado por | Columnas de tabla. |
| File | Archivo | Siempre «archivo», nunca «file». |
| Attachment | Adjunto | Documentos vinculados. |
| Evidence | Evidencia | CPR y Textiles. |
| Supplier | Proveedor | Catálogos. |
| Material | Material | Catálogos. |
| Product | Producto | Catálogos. |
| Help | Ayuda | Soporte y hints. |
| More information | Más información | `aria-label`/`title` del botón «i» de hints. |
| Coming soon | Próximamente | Módulos Quality y Construcción. |
| Production order / run | Orden / corrida de producción | Trazabilidad (CPR y Textiles). |
| Input lot | Lote de entrada | Trazabilidad. |
| Output / final lot | Lote producido / lote final | Trazabilidad y contenido reciclado. |

## 2. Preferencias obligatorias

- «Empresa», nunca «Organización», en cualquier texto visible.
- «Orden / corrida de producción» para las órdenes de trazabilidad.
- «Lote de entrada» para insumos; «Lote producido / lote final» para salidas.
- «NTC 6632 · UNE-EN 15343» como referencia normativa (con el separador «·»).
- «Trazaloop Textiles» como nombre del módulo textil.
- Mensajes accionables: decir qué pasó y qué hacer («No fue posible cargar el
  archivo. Inténtalo nuevamente.»), sin jerga técnica.
- Sin mayúsculas en todas las palabras; tildes correctas; fechas y números con
  el locale del proyecto (`es-CO`, con `es-ES` heredado en superficies previas).

## 3. Términos que NO deben traducirse (allowlist)

Trazaloop · TrazaDocs · Trazaloop CPR · Trazaloop Textiles · Demo · Full ·
Extra · CPR · QR · PDF · CSV · XLSX · MIME · NTC 6632 · UNE-EN 15343 · ISO ·
Supabase · Vercel · SKU.

Tampoco se traducen: nombres de variables, tablas, columnas, RPC, funciones,
códigos de error (`MODULE_ACCESS_BLOCKED`, `OBJECT_SIZE_MISMATCH`, …), rutas,
nombres de migraciones ni valores almacenados (`demo`, `full`, `extra`,
`pending`, `failed`, `expired`, `disabled`, `demo_permanent`). Su
representación visible SIEMPRE va en español, p. ej.:

- `MODULE_ACCESS_BLOCKED` → «El módulo no está disponible para tu empresa en
  este momento.»
- `OBJECT_SIZE_MISMATCH` → «El tamaño del archivo subido no coincide con el
  declarado. Intenta de nuevo.»
- `OBJECT_MIME_MISMATCH` → «El tipo del archivo subido no corresponde al
  declarado. Intenta subirlo de nuevo.»
- `STORAGE_QUOTA_EXCEEDED` → «No hay capacidad de almacenamiento disponible
  para este archivo en el plan del módulo.»
- `STORAGE_USAGE_UNVERIFIABLE` → «El uso de almacenamiento no pudo
  verificarse. Intenta de nuevo.»
- Tamaño excedido (TrazaDocs) → «El archivo no puede pesar más de 10 MB en el
  plan Demo.» / «…más de 25 MB.»
- Demo vencido → «Tu periodo Demo de <módulo> ha finalizado. Tus datos se
  conservarán. Contacta al equipo de Trazaloop para reactivar el acceso.»

## 4. Excepciones y matices

- «Remove» se decide por contexto: desvincular («Quitar») no es destruir
  («Eliminar»).
- Los atributos HTML no visibles (`type="password"`, `autoComplete`) y las
  claves de estado internas permanecen en inglés: no son texto de interfaz.
- En pantallas técnicas de plataforma puede citarse un identificador interno
  (p. ej. `organization_subscriptions`) SOLO como referencia técnica explícita
  para el personal de plataforma, nunca como mensaje para usuarios de empresa.
- Los hints de TrazaDocs admiten enlaces con el formato
  `[Texto del enlace](https://ejemplo.com)` y rutas internas `[texto](/ruta)`;
  la ayuda visible del editor documenta exactamente ese formato.
