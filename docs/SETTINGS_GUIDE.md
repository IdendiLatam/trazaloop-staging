# Trazaloop · Configuración de empresa y perfil (Sprint 8.3)

Esta guía explica cómo editar los datos básicos de la empresa activa y los
datos personales de tu propio perfil, sin tocar Supabase manualmente.

## 1. Cómo editar datos de empresa

1. Ve a **Configuración** (barra lateral o barra superior) → **Datos de
   empresa**, o directamente a `/settings/company`.
2. Completa los campos que apliquen: nombre comercial, razón social, NIT,
   correo de contacto, teléfono, sitio web, ciudad, país, dirección.
3. «Guardar cambios». El nombre comercial actualizado se refleja de
   inmediato en `/implementation`, `/team` y en cualquier otra pantalla que
   muestre el nombre de la empresa activa.

Todos los campos son opcionales excepto el **nombre comercial**: una
empresa recién creada puede no tener todavía NIT, sitio web ni el resto de
los datos, y eso no bloquea nada del resto de Trazaloop.

## 2. Qué roles pueden editar

- **Admin**: puede ver y editar los datos de empresa.
- **Quality** (Supervisor) y **consultant** (Consultor): pueden **ver** los datos de empresa
  (`/settings/company` es de lectura para ellos), pero no editarlos —
  verán el aviso «Tu rol permite consultar estos datos, pero no
  modificarlos.».

Esto ya lo garantizaba la política de base de datos `organizations_update`
desde el Sprint 1 (exige ser admin de la empresa); este sprint solo agrega
la pantalla y valida lo mismo en servidor para dar un mensaje claro antes
de que la base rechace el cambio.

## 3. Cómo editar mi perfil

1. Ve a **Configuración** → **Mi perfil**, o directamente a
   `/settings/profile` (también accesible desde `/team` → «Mi perfil»).
2. Completa nombre completo, cargo / rol interno y teléfono.
3. «Guardar cambios».

Cada persona edita únicamente su propio perfil: no existe una pantalla
para que un admin edite el perfil de otra persona en este sprint (la
política `profiles_update`, también desde el Sprint 1, exige que el
perfil que se actualiza sea el de la sesión actual — `id = auth.uid()`).

## 4. Qué campos NO se pueden cambiar desde aquí

- El **correo de autenticación** (ver punto 5).
- El **rol** de un miembro dentro de una empresa — eso se cambia desde
  `/team` (ver `docs/TEAM_MANAGEMENT_GUIDE.md`), no desde "Mi perfil".
- La **foto de perfil (avatar)**: todavía no existe soporte de carga de
  archivos para esto: no se implementó en este sprint a propósito.

## 5. Por qué el correo de login no se cambia desde esta pantalla

El correo que usas para iniciar sesión pertenece a tu cuenta de acceso
(Supabase Auth), no a tu perfil de Trazaloop — cambiarlo implica
reverificar el correo y tiene implicaciones de seguridad que van más allá
de este formulario. Por eso "Mi perfil" lo muestra **solo lectura**, con
el aviso «Este correo viene de tu cuenta de acceso y no se modifica desde
aquí.».

## 6. Cómo revisar que la organización activa sea correcta

Los datos de empresa que edites en `/settings/company` son siempre los de
tu **organización activa** — la misma que ves en la barra superior
("nombre de la empresa · cambiar"). Si perteneces a varias empresas y no
estás seguro de cuál está activa:

1. Mira el nombre en la barra superior de cualquier pantalla del panel.
2. Si necesitas cambiar, usa el enlace "cambiar" ahí mismo, o ve a
   `/select-org`.
3. Vuelve a `/settings/company`: siempre edita la empresa activa en ese
   momento — nunca se acepta un identificador de empresa distinto desde
   el formulario ni desde ningún parámetro de la URL.

## Seguridad multiempresa

- `organization_id` nunca viaja desde el cliente: el UPDATE de empresa
  siempre se acota a la empresa activa validada en servidor
  (`requireActiveOrg`).
- El id de perfil que se actualiza siempre sale de la sesión
  (`requireSession`), nunca de un campo del formulario.
- No se usa `service_role` en ninguna de las dos acciones.
- Los cambios a datos de empresa quedan en `audit_log` (mismo trigger
  `audit_row_change` que ya auditaba `organizations` desde el Sprint 1).

## Comandos relacionados

```bash
npm run test:settings   # lógica pura de permisos y validación (sin BD)
npm run test:rls        # aislamiento multiempresa (Supabase local)
```
