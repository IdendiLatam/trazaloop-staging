# Trazaloop Textil · Sprint T9D — Enlace privado controlado y QR del pasaporte técnico textil (Reporte)

> Julio 2026. Añade una capa de compartición **controlada** del pasaporte
> técnico textil: enlaces privados tokenizados (revocables, con expiración y
> registro de accesos) y su QR, más una vista pública tokenizada de solo lectura
> con un snapshot **reducido**. **No es un portal público indexable, ni un DPP
> oficial, ni una certificación.** Sin PDF server-side, IA, ACV, huella ni planes
> por módulo. CPR sin cambios funcionales.

## 1. Qué se añadió

- Migración `0092_textile_passport_private_share_links.sql`: tabla
  `textile_technical_passport_share_links` + RPC pública controlada
  `resolve_textile_passport_share`.
- Capa DB `lib/db/textiles-passport-share.ts` y server actions
  `server/actions/textiles-passport-share.ts` (crear/revocar/deshabilitar/
  expirar).
- UI: gestor de enlaces en el detalle del pasaporte
  (`components/textiles/passports/share-link-manager.tsx`), QR del enlace, y
  **ruta pública tokenizada** `app/textile-passport-share/[token]/page.tsx`.

## 2. Modelo de token (seguridad)

El token en claro (32 bytes → base64url) se genera en el servidor con
`node:crypto` y se devuelve **una sola vez** al crear el enlace. En la BD se
guarda **solo su hash sha256** (`token_hash`, único) y un prefijo corto
(`token_prefix`) para identificarlo en la UI. No existe ninguna columna que
almacene el token en claro. La identidad (`passport_id`), el `token_hash` y el
prefijo son **inmutables** tras crear (trigger `protect_textile_passport_share_link`),
y **revocar es irreversible** (un enlace `revoked` no puede reactivarse).

## 3. Resolución pública controlada

La ruta tokenizada (sin login) **no lee la tabla**: llama únicamente a la RPC
`resolve_textile_passport_share(p_token)` (`SECURITY DEFINER`), que:

1. hashea el token y busca por `token_hash`;
2. valida estado `active`, no revocado, no expirado y bajo el límite de accesos;
3. registra el acceso (contador + última fecha);
4. devuelve un **snapshot reducido**: `passport_code`, versión, estado,
   `generated_at`, `source_hash` corto, nombre de la organización, y las
   secciones del snapshot recortadas según los flags `include_*` — **nunca**
   `token_hash`, `data_sources_json`, signed URLs ni datos de otras
   organizaciones.

Ante cualquier fallo (token inexistente, expirado, revocado, agotado) responde el
**mismo motivo genérico** (`not_available`), sin revelar si el token existió ni a
qué organización pertenece. La ruta muestra "Enlace no disponible".

## 4. Permisos (RLS + grants)

RLS deny-by-default: **SELECT** solo para miembros de la organización (incluye
consultant para lectura); **INSERT/UPDATE/DELETE** solo admin/quality (consultant
no crea ni revoca). **anon nunca tiene SELECT** sobre la tabla: la única
superficie pública es la RPC, concedida a `anon, authenticated` (revocada de
`public`). Las server actions verifican módulo Textil + organización + rol y que
el pasaporte pertenezca a la organización; no aceptan `organization_id` del
cliente.

## 5. Gestión desde el detalle

En el detalle del pasaporte (con snapshot generado) se añadió "Compartir / QR":
crear enlace (etiqueta opcional, expiración 7/30/90 días o sin expiración; default
30), copiar el enlace completo recién creado, ver su **QR**, y la tabla de
enlaces con prefijo, estado (activo/revocado/expirado/deshabilitado, derivado en
UI), expiración, número de accesos y último acceso, con acción de **revocar**.
Solo admin/quality ven los controles de crear/revocar. El aviso de seguridad
recuerda que el enlace completo solo se muestra al crearlo.

## 6. QR

Decisión: el proyecto no tenía generador de QR. Se añadió la librería `qrcode`
(madura, correcta) como dependencia pequeña y justificada, en vez de un encoder
casero frágil que podría producir códigos no escaneables. El QR se genera en el
cliente (`QRCode.toDataURL`) a partir del enlace recién creado y se muestra como
imagen; no se persiste. El QR es solo una representación de la URL.

## 7. Vista pública (contenido y límites)

Reutiliza los componentes de secciones del pasaporte para mostrar el snapshot
reducido con sus disclaimers. Lleva `noindex` (no indexable), identidad de
Trazaloop, y un pie que declara que es una vista de solo lectura y **no
constituye certificación ni pasaporte digital de producto oficial**. No expone
signed URLs ni permite descargar evidencias.

## 8. Verificación

- Sintaxis SQL validada con el parser de Postgres (`pglast.parse_sql`) — OK;
  `token_hash` único; palabra vetada = 0.
- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (las 5 rutas compilan dinámicas `ƒ`, incluida la
  pública `/textile-passport-share/[token]`).
- Nueva suite `tests/passports/textiles-passports-share.test.ts` (24 checks, con
  foco en seguridad: token como hash, inmutabilidad, revocar irreversible, RLS,
  anon sin SELECT, RPC SECURITY DEFINER, validación de estado/expiración/accesos,
  mensaje genérico, sin data_sources ni signed URLs, no indexable).
- Regresión: familia pasaporte + módulo Textil + diagnóstico + catálogos +
  productos + evidencias + trazabilidad + circularidad + TrazaDocs + **CPR** +
  platform/plans/launch/compliance. `test:all` en verde. Pin de inventario a
  0092; deriva de pins de T9B.3 fijada.

## 9. Validación manual (resumen)

1. Crear un enlace (admin/quality): se muestra el enlace completo + QR una sola
   vez; luego solo el prefijo. Abrir la URL en incógnito (sin login) muestra la
   vista reducida.
2. Revocar el enlace → la URL responde "Enlace no disponible" (mensaje genérico).
3. Expiración: crear con 7 días; tras la fecha, la vista deja de resolver.
4. Límite de accesos (si se fija `max_access_count`): tras agotarse, deja de
   resolver.
5. consultant no ve los botones de crear/revocar. Un enlace de otra organización
   no aparece; un token inválido nunca revela organización.
6. La vista pública no expone signed URLs ni `data_sources_json`.

## 10. Confirmaciones

No es portal público indexable (noindex), ni DPP oficial, ni certificación. El
token nunca se guarda en claro. anon solo puede la RPC controlada, nunca la
tabla. Sin PDF server-side, IA, ACV, huella, planes por módulo,
`organization_module_access`/`_subscriptions`. **CPR no fue modificado
funcionalmente.** Textil sigue privado. La estructura del snapshot no cambió; la
vista pública usa un snapshot reducido derivado del histórico. Nueva dependencia:
`qrcode` (generación de QR), documentada.
