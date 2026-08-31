# PE-03A · Lo que ya existe, medido

Antes de diseñar nada. Todo lo que sigue se leyó del repositorio o se midió
contra la base y el almacenamiento reales; nada se supone.

*31 de agosto de 2026 · sin cambios de código, sin migración, sin despliegue.*

---

## 1 · Almacenamiento

### Tres cubos, los tres privados

| Cubo | Desde | Convención de ruta | Límite | MIME |
|---|---|---|---|---|
| `evidences` | 0015 | `{organization_id}/{...}` | sin límite en el cubo | cualquiera |
| `organization-assets` | 0049 | `{organization_id}/...` | sin límite | cualquiera |
| `trazadocs-documents` | 0058 | `{organization_id}/...` | sin límite | cualquiera |

**Los tres empiezan por `organization_id`**, y sus políticas operan sobre
`(storage.foldername(name))[1]`. No hay ningún cubo de contenido de plataforma.

**Ninguno declara `file_size_limit` ni `allowed_mime_types`.** El tamaño y el
formato se controlan arriba: en la reserva y en la verificación física del
servidor, no en el cubo.

### No hay cubo público

Y no por descuido: 0015 lo dice —«Sin acceso público: el bucket es privado y no
hay políticas para `anon`»—. Un cubo público sería el primero de la plataforma.

---

## 2 · Cómo se sube un archivo hoy

Hay **dos transportes**, los dos con los bytes yendo del navegador a Storage
**sin atravesar Next.js**, y los dos autorizados por un **intento** creado antes
en el servidor.

### A · CPR y TrazaDocs · sesión del usuario + política ligada al intento

`lib/storage/direct-upload.ts` sube con la sesión autenticada, y la política
`evidences_insert_cpr` de 0101 exige que la ruta corresponda **exactamente** a un
`storage_upload_intents` propio, vigente y con esa ruta reservada.

### B · Textiles · URL de subida firmada

`createTextileEvidenceSignedUploadUrl` emite una URL para la ruta exacta, con la
sesión del usuario. La autorización vive en **emitir** la URL.

### El hallazgo de 0099, que decide el diseño de PE-03

> «Una *signed upload URL* autoriza POR SÍ MISMA: se comprobó que
> `uploadToSignedUrl` funciona incluso desde un cliente ANÓNIMO, sin JWT de
> usuario y por tanto **sin pasar por la política INSERT** de `authenticated`.»

Es un hecho experimental, ya comprobado en este repositorio, y significa que los
dos transportes protegen cosas distintas:

- el **A** ejerce la política de Storage en cada subida;
- el **B** no la ejerce: toda la autorización está en el momento de emitir.

Ninguno es mejor en abstracto. Para PE-03 importa porque el B permite que el
servidor decida una sola vez, y el A permite que la base vuelva a decidir.

### Y por qué los bytes no pasan por Next.js

`next.config.ts` lo explica: T9E subió `serverActions.bodySizeLimit` a 25 MB
porque el archivo viajaba dentro de una Server Action, y **T9E.1 lo retiró** al
sustituir el transporte por carga directa. Las Server Actions volvieron a su
límite por defecto de **1 MB**, y hay pruebas que fallan si alguien lo
reintroduce.

**Para un vídeo esto no es una preferencia: es la única vía.** Un tutorial de
tres minutos supera el límite por un orden de magnitud.

---

## 3 · La reserva · `storage_upload_intents`

Creada en 0101. Reserva ruta, tamaño esperado, MIME esperado, caducidad, quién y
para qué; con estados `pending`/`finalized`/`failed`/`expired`, clave de
idempotencia, y `storage_resolved_at` para no dejar de contar unos bytes hasta
confirmar físicamente que el objeto ya no está.

**La tabla no se puede reutilizar tal cual.** Tiene `organization_id NOT NULL`,
un `check` que exige `module_code = 'traceability_6632'`, otro que ata
`resource_type` a `evidence`/`trazadoc_*`, y otro que exige que la ruta empiece
por el `organization_id`. Un tutorial no tiene empresa.

**Lo reutilizable es el patrón**, que es lo que vale.

### El límite honesto que 0099 deja escrito

> «Storage RLS vincula la RUTA a un intento válido; NO inspecciona el contenido.
> El tamaño real, el MIME real y la firma binaria se verifican en la
> finalización server-only.»

---

## 4 · Validación de archivos

`lib/domain/cpr-file-verification.ts` define topes por recurso y plan —evidencia
CPR 20 MB, TrazaDocs Demo 10 MB, Full/Extra 25 MB—, y hay verificación de
**firma binaria** para evidencias textiles. El tope estructural del `check` de la
tabla de intentos es 25 MB.

**Ninguno sirve para vídeo**, y el patrón sí.

---

## 5 · El registro de claves de página · PE-02

`lib/modules/page-keys.ts`: **diez** claves, con `key`, `label`, `module` y
`route`, más `isKnownPageKey`, `getPageKey`, `pageKeysForModule`,
`PAGE_KEY_PATTERN` y `isWellFormedPageKey`.

| Módulo | Claves |
|---|---|
| quality | 7 |
| cpr | 2 |
| textiles | 1 |

Vive en `lib/modules/` y no dentro de la ayuda, **a propósito**: PE-02B4 lo dejó
ahí para que PE-03 lo reutilizara. Se reutiliza.

---

## 6 · Las páginas que hay

**147 páginas** bajo `app/(app)/(shell)`: 104 de listado y 43 de detalle.

### No existe un componente de cabecera compartido

Cada página escribe su propia cabecera a mano:

```tsx
<header className="space-y-2">
  <p className="eyebrow">Trazaloop Quality</p>
  <h1 className="text-2xl font-semibold tracking-tight">Procesos</h1>
  ...
```

No hay `PageHeader`, ni `SectionHeader`, ni `PageTitle`. **Es el hallazgo que más
condiciona PE-03:** poner «Ver video tutorial» en la cabecera de cada página
significa tocar 147 ficheros.

### Pero el shell sí tiene un sitio, y está reservado

La barra superior de `app/(app)/(shell)/layout.tsx` ya lleva «Ayuda», con este
comentario escrito en PE-02B4:

> «se llama «Ayuda» y no «FAQ» porque **PE-03 sumará el tutorial de la pantalla y
> el soporte al mismo sitio**.»

Y junto a ella conviven `ModuleSwitcher`, `ModuleAwareSettingsLink` y
`ModuleHeaderBadge`, que son componentes de cliente que resuelven por
`usePathname()`. El mecanismo que hace falta ya está en uso.

### El precedente exacto de una acción por clave de página

`ExportPdfButton`, con `exportKey="quality.process.list"`, aparece **70 veces**
en las páginas. Es una acción secundaria, identificada por una clave estable, que
no depende de la ruta. Es el mismo problema que el botón de tutorial, ya resuelto
una vez.

---

## 7 · Preferencias de usuario · no existen

`profiles` tiene siete columnas: `id`, `full_name`, `email`, `created_at`,
`updated_at`, `phone`, `position`. **No hay ninguna tabla de preferencias, ni de
onboarding, ni de banderas de primer inicio.**

Lo único parecido es `user_legal_acceptances`, que no es una preferencia sino una
constancia.

PE-03 necesita crear el primer resorte de preferencias por persona.

---

## 8 · El camino desde el inicio de sesión

Ocho guardianes en `lib/auth/`. El orden real, leído del código:

```
/login
  → requireSession()            · sin sesión → /login
  → requireLegalAcceptance()    · sin aceptar lo vigente → /legal/accept
  → getActiveOrganization()     · sin empresa → /select-org
  → /modules                    · la puerta
  → requireQualityModule() etc. · sin acceso al módulo → /modules
```

`/modules` aplica `requireSession` + `requireLegalAcceptance`; el shell aplica
los tres. **`/modules` es la primera superficie normal**, y es donde el vídeo de
bienvenida no estorba a ninguna puerta obligatoria.

---

## 9 · Historia de contenido de plataforma

Tres motores ya construidos con el mismo patrón:

| | Identidad | Revisiones | Borrador | Publicación |
|---|---|---|---|---|
| Legales | `legal_documents` | la propia fila, versionada | — | `legal_publish_document` |
| FAQ | `faq_entries` | `faq_entry_revisions` | `faq_entry_drafts` | `faq_publish_entry` |
| Ayuda | `help_items` | `help_item_revisions` | `help_item_drafts` | `help_publish_item` |

La forma común: **identidad estable + revisiones inmutables con
`effective_from`/`effective_to` + un borrador mutable en tabla aparte**, un índice
único parcial que garantiza una sola revisión abierta, publicación por función
`security definer`, e inmutabilidad por **disparador** —no por política, porque
una política no detiene a `service_role`—.

PE-02B5B lo ejerció entero y aguantó.

---

## 10 · Cómo se cuenta la cuota de una empresa

`v_module_usage` suma tamaños desde las **tablas de dominio con
`organization_id`** —`cpr_objects`, `textile_evidences`,
`storage_orphan_candidates`, intentos vencidos—, deduplicando por
`(bucket, ruta)`. **No recorre cubos.**

Consecuencia estructural, no promesa: un cubo de tutoriales sin `organization_id`
y con tablas propias **no puede** contar contra ninguna cuota. No hay que añadir
una exclusión; hay que no añadir una inclusión.

---

## 11 · Limpieza de huérfanos

`storage_orphan_candidates` registra objetos a retirar con su estado y sus
intentos, y `lib/db/storage-deletion.ts` los retira **server-only** con cliente
administrativo. Nunca hay «DELETE directo → referencia de dominio rota».

Y 0101 deja escrito por qué las políticas de DELETE de cliente se quitaron: un
usuario de la misma empresa podía borrar el objeto de una evidencia consumida.

---

## 12 · La sonda de almacenamiento

Medido contra el stack local con un objeto de 3 MB declarado `video/mp4`, en el
cubo privado `organization-assets`, y retirado al terminar.

| Qué se midió | Resultado |
|---|---|
| `Content-Type` servido | **`video/mp4`** · el declarado al subir |
| `Accept-Ranges` | **`bytes`** |
| `Range: bytes=1048576-2097151` | **206 Partial Content** · `content-range: bytes 1048576-2097151/3145728` · **bytes correctos** |
| `Range: bytes=0-` (lo primero que pide un `<video>`) | **206** con el rango completo |
| `Content-Disposition` | **ausente** → reproducción en línea, no descarga forzada |
| `Cache-Control` | **ausente** |
| URL firmada caducada (1 s, pedida a los 2,5 s) | **400** · rechazada |
| Sin firma y sin sesión | **400** · denegado |
| Descarga con clave anónima sin sesión | denegado · «Object not found» |
| Coste de firmar | **10 firmas en 176 ms** (~18 ms cada una) |

### Lo que esto decide

**Un cubo privado con URL firmada sirve vídeo con búsqueda.** Es la pregunta del
encargo §10 y §45, y la respuesta es sí, medida: 206, `content-range` correcto y
bytes correctos. No hay que elegir cubo público para que el vídeo se pueda
adelantar.

**La caducidad se aplica de verdad**, así que el plazo importa: una URL que
caduca a mitad de reproducción rompe la búsqueda.

**No hay `Cache-Control`**, así que cada reproducción vuelve a traer los bytes.
Es lo esperable en un objeto firmado y con caducidad, y es el coste real de la
privacidad.

### El límite de esta medición, dicho

Se midió contra el **stack local**. Supabase alojado sirve Storage detrás de una
red de distribución y **puede añadir cabeceras de caché** que aquí no aparecen.
Lo que no cambia entre entornos es la semántica de rango y de firma, que es lo
que decide la arquitectura. Antes de fijar el plazo de la firma en PE-03B
conviene repetir la sonda contra Staging.
