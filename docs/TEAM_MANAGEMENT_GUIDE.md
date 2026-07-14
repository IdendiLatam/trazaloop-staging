# Trazaloop · Guía de gestión de equipo (Sprint 8)

Esta guía explica cómo administrar el equipo de una empresa dentro de
Trazaloop desde `/team`: quién puede hacer qué, cómo invitar, cómo aceptar
una invitación, cómo cambiar roles y cómo retirar acceso.

## 1. Qué roles existen

Trazaloop tiene exactamente **tres roles reales** (catálogo `roles`,
Sprint 1). No existen roles "user" ni "viewer": no se inventan aquí.

| Rol | Nombre visible |
|---|---|
| `admin` | Administrador |
| `quality` | Responsable de calidad |
| `consultant` | Consultor externo |

## 2. Qué puede hacer cada rol

- **Administrador**: gestiona la empresa, usuarios, datos, evidencias,
  importaciones y configuración. Es el único rol que puede invitar,
  cambiar roles y desactivar/reactivar accesos.
- **Responsable de calidad**: puede validar evidencias, revisar cálculos y
  apoyar la preparación técnica.
- **Consultor externo**: puede cargar y organizar información, importar
  datos y registrar feedback, pero no valida evidencias (esa regla del
  motor de evidencias no cambia en este sprint).

Los tres roles pueden **ver** `/team` (miembros e invitaciones); solo
**admin** ve los controles para invitar, cambiar rol, desactivar o
reactivar.

## 3. Cómo invitar usuarios

1. En `/team` → **Invitar usuario** (solo visible para admin).
2. Completa correo y rol. La invitación expira en 7 días por defecto.
3. Al crearse, Trazaloop muestra un **enlace copiable**
   (`/accept-invite?token=...`). Compártelo por el canal que prefieras
   (correo, chat, etc.) — **Trazaloop todavía no envía el correo por sí
   mismo** porque no existe infraestructura de envío en este sprint.

Reglas aplicadas (servidor + base de datos, doble validación):

- Solo admin puede invitar.
- No se puede invitar dos veces al mismo correo mientras haya una
  invitación pendiente.
- No se puede invitar a alguien que ya es miembro activo de la empresa.
- No se puede asignar un rol de rango superior al propio (hoy es
  irrelevante en la práctica porque solo admin invita, pero la regla está
  implementada y probada para cuando cambie).

## 4. Cómo aceptar una invitación

1. Abre el enlace `/accept-invite?token=...`.
2. Si no tienes sesión, Trazaloop te pide iniciar sesión o crear una
   cuenta — después, **vuelve a abrir el mismo enlace** para continuar
   (no se modifica el flujo de login/registro existente).
3. Con sesión iniciada, verás a qué empresa y con qué rol te invitaron.
4. Si tu cuenta tiene un correo distinto al invitado, Trazaloop lo avisa
   claramente y no permite continuar con esa cuenta.
5. «Aceptar invitación» crea tu membership con el rol invitado y te deja
   con esa empresa como activa.

Una invitación deja de poder aceptarse si: ya fue aceptada, fue revocada,
o expiró (7 días por defecto).

## 5. Cómo cambiar roles

En `/team` → tabla de **Miembros actuales**, el selector de rol junto a
cada persona (solo admin). El cambio se aplica de inmediato.

## 6. Cómo retirar acceso

En `/team` → botón **Desactivar** junto al miembro (solo admin). Esto
pasa su membership a estado `suspended` — **no se borra** el registro ni
su historial. **Reactivar** vuelve el estado a `active`.

## 7. Por qué no se puede quitar el último admin

Toda empresa necesita al menos un administrador activo para poder seguir
gestionándose. Trazaloop bloquea, tanto en el servidor como con un
**trigger de base de datos** (`guard_last_admin`, migración 0037):

- cambiar el rol del **último** admin activo a otro rol;
- desactivar al **último** admin activo.

Si necesitas transferir la administración, primero asciende a otra
persona a admin y **después** cambia tu propio rol o desactívate.

## 8. Cómo usar Equipo durante una prueba con empresa real

Como parte de `docs/COMPANY_TESTING_GUIDE.md`, antes o durante la prueba
real:

1. Define quién de tu equipo y del equipo del cliente usará la cuenta.
2. Invita a esas personas con el rol que les corresponde.
3. Comparte el enlace de invitación por un canal seguro (no público).
4. Verifica en `/implementation` la tarjeta **"Definir equipo de
   prueba"**: queda en **completo** en cuanto hay más de un miembro o al
   menos una invitación pendiente.
5. Si alguien deja de participar, desactiva su acceso en vez de dejarlo
   activo sin necesidad.

## Seguridad multiempresa

- `organization_id` nunca viaja desde el cliente: toda acción usa la
  empresa activa validada en servidor.
- Aceptar una invitación pasa por una función seguridad-definidor
  (`accept_team_invitation`) que valida token, estado, expiración y
  coincidencia de correo — nunca por un INSERT/UPDATE directo desde el
  cliente.
- RLS aísla invitaciones y miembros por empresa; nadie ve ni modifica el
  equipo de otra organización.
- No se usa `service_role` en ninguna acción de negocio de este sprint.

## Comandos relacionados

```bash
npm run test:team   # lógica pura de roles/invitaciones (sin BD)
npm run test:rls    # aislamiento multiempresa de team_invitations (Supabase local)
```
