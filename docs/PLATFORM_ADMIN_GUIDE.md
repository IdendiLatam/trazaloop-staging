# Trazaloop · Administración de plataforma (Sprint 8.4)

Esta guía explica la diferencia entre administrar UNA empresa dentro de
Trazaloop y administrar la PLATAFORMA Trazaloop en sí — dos niveles
completamente separados, con tablas, permisos y pantallas distintas.

## 1. Diferencia entre admin de empresa y superadmin de plataforma

| | Admin de empresa | Superadmin de plataforma |
|---|---|---|
| Tabla | `memberships.role_code = 'admin'` | `platform_staff.role_code = 'superadmin'` |
| Alcance | Solo SU empresa | Todas las empresas |
| Cómo se asigna | Invitación desde `/team` | Bootstrap manual por SQL (ver §2) |
| Dónde administra | `/team`, `/settings/company` | `/platform` |
| Puede crear empresas | Solo la primera (ver §7) | Sí, ilimitadas, desde `/platform` |

`platform_staff` es una tabla **completamente separada** de `memberships`
— no comparten filas, no comparten `role_code`, y un `role_code` de una
nunca es válido en la otra (`memberships.role_code` tiene una referencia a
la tabla `roles`, que solo contiene `admin`/`quality`/`consultant`;
`platform_staff.role_code` solo acepta `superadmin`/`support`). Mezclarlas
habría filtrado el concepto de "plataforma" a cada política de cada
empresa — se evitó a propósito.

## 2. Cómo crear el primer superadmin manualmente

Por diseño, **nadie puede auto-asignarse superadmin desde la aplicación**
— ni siquiera el primero. La política de `INSERT` de `platform_staff`
exige ya ser superadmin (`is_platform_superadmin()`), así que mientras la
tabla esté vacía, esa condición nunca se cumple para nadie. Esto es
intencional: es la única forma de garantizar que ningún usuario común
pueda escalar privilegios por sí mismo.

El primer superadmin se crea con acceso **directo** a la base de datos
(SQL Editor de Supabase, o `psql` con las credenciales del proyecto —
nunca a través de la aplicación ni de un endpoint):

```sql
-- 1. Encuentra el id de perfil de la persona (ya debe tener cuenta creada
--    en Trazaloop — inicia sesión una vez primero si hace falta).
select id, email from profiles where email = 'CORREO_DE_LA_PERSONA';

-- 2. Con ese id, crea el registro de superadmin.
insert into platform_staff (user_id, role_code, status)
values ('PROFILE_ID_DEL_USUARIO_INTERNO', 'superadmin', 'active');
```

No hay seed automático de superadmin en ninguna migración: el ejemplo de
arriba es exactamente eso, un ejemplo — no lleva datos reales ni se
ejecuta solo.

## 3. Qué puede hacer un superadmin

> **`/platform` no depende de ninguna empresa.** Vive fuera del shell de
> empresa (`app/(app)/platform/`, con su propio layout) — un
> superadministrador sin ninguna organización activa (o sin ninguna
> membership en absoluto) puede entrar igual: solo se exige sesión +
> `platform_staff` activo (`requirePlatformStaff`), nunca
> `getActiveOrganization()`. Si además pertenece a una empresa, puede
> volver a ella con el enlace "Ir a mi empresa".

- Ver `/platform`: resumen de plataforma, empresas registradas con sus
  métricas agregadas, y personal de plataforma.
- Crear empresas desde `/platform/organizations/new`, vinculando o
  invitando al administrador inicial (§5).
- Ver el resumen de implementación de cualquier empresa
  (`/platform/organizations/[id]`), **sin cambiar su organización activa**
  ni acceder a datos fila por fila de esa empresa — solo a los conteos
  agregados.
- Agregar o desactivar personal de plataforma (`support`).
- Crear más de una empresa (a diferencia de un usuario normal, §7).

## 4. Qué puede hacer support (si se usa ese rol)

`support` es `platform_staff` pero **no** `superadmin`: puede entrar a
`/platform` y ver el resumen/las empresas registradas, pero **no** puede
crear empresas ni administrar personal de plataforma (agregar o cambiar el
estado de otros registros de `platform_staff`) — esas dos acciones exigen
`is_platform_superadmin()` específicamente, no solo `is_platform_staff()`.

## 5. Cómo crear empresas desde consola de plataforma

`/platform/organizations/new` (solo superadmin): nombre visible, razón
social, NIT, país, ciudad, correo de contacto, y los datos del
administrador inicial (nombre y correo). Al confirmar:

- Si el correo del administrador inicial **ya tiene cuenta** en Trazaloop,
  queda vinculado como admin de la nueva empresa de inmediato.
- Si **no tiene cuenta todavía**, se crea una invitación pendiente con rol
  admin — se muestra un enlace copiable (`/accept-invite?token=...`),
  igual que al invitar desde `/team`. **No se envía ningún correo real**:
  no existe infraestructura de envío en este sprint (mismo criterio que
  `/team` desde el Sprint 8).

En ambos casos (creación normal desde `/select-org` o desde esta consola)
la empresa nueva activa como módulos base únicamente `core` y
`traceability_6632`. **`docs` (Trazaloop Docs) ya no se activa
automáticamente**: el dashboard muestra un badge por cada módulo activo, y
activar `docs` creaba la expectativa visible de un constructor documental
funcional que no existe. La fila del catálogo `modules` sigue existiendo
(no se renombra ni se borra) — simplemente ninguna empresa nueva lo
recibe activado por defecto.

## 6. Cómo se asigna el administrador inicial

Ver §5 — automático según si el correo ya tiene cuenta o no. Nunca se crea
una cuenta de autenticación manualmente desde aquí: eso solo lo hace
Supabase Auth cuando la persona se registra por su cuenta (con o sin
invitación pendiente esperándola).

## 7. Por qué un usuario normal solo puede crear una empresa

Antes de este sprint, cualquier persona podía crear tantas empresas como
quisiera desde `/select-org`. Eso no tiene sentido para el modelo de
negocio real: cada empresa cliente tiene un administrador, no varios
administradores creando organizaciones sueltas. Ahora, `create_organization`
(la función que crea la empresa) bloquea a un usuario normal si:

- ya tiene una membership activa en alguna empresa, o
- ya creó una empresa antes (aunque ya no sea miembro activo), o
- tiene una invitación pendiente y vigente (debe aceptarla, no crear una
  empresa nueva).

Un **superadmin** nunca choca con esta regla: puede crear tantas empresas
como haga falta, típicamente desde `/platform/organizations/new`.

## 8. Por qué superadmin no aparece en roles de empresa

`superadmin` y `support` son roles de **plataforma**, no de empresa — no
tiene sentido que alguien "invite a un superadmin" dentro de su compañía
(eso no significaría nada: el superadmin ya puede ver cualquier empresa
desde `/platform`, no necesita una membership). Por eso el selector de rol
del formulario de invitar (`/team`) solo ofrece **Administrador**,
**Supervisor** y **Consultor** — los únicos 3 roles reales de
`memberships` — y nunca se agregó ninguna opción de plataforma ahí. Ver
`docs/TEAM_MANAGEMENT_GUIDE.md` §1.

> Nota de nomenclatura: el `role_code` interno `quality` ahora se muestra
> como **Supervisor** en toda la UI (antes "Responsable de calidad"), y
> `consultant` como **Consultor** (antes "Consultor externo"). El valor
> guardado en la base de datos no cambió, solo la etiqueta visible.

## 9. Riesgos de acceso a datos y necesidad de auditoría

`/platform` da visibilidad agregada de TODAS las empresas — es poder
sensible, y se trató como tal:

- Toda acción de escritura (crear empresa, agregar personal de plataforma,
  cambiar su estado) queda en `audit_log` vía el mismo trigger
  `audit_row_change` que ya auditaba tablas de negocio desde el Sprint 1
  (con `organization_id` NULL para eventos que son de plataforma, no de
  una empresa concreta), más eventos semánticos explícitos
  (`platform_organization_created`, `platform_staff_added`) vía
  `log_event`.
- La vista `v_platform_organizations` NUNCA expone datos fila por fila de
  una empresa (nombres de personas, evidencias, cálculos individuales) —
  solo conteos agregados. Ver el detalle de una empresa desde
  `/platform/organizations/[id]` tampoco cambia la organización activa del
  superadmin ni crea ningún acceso "silencioso": es una lectura de solo
  lectura, sin sesión especial que salir/entrar.
- **No se implementó "Entrar como soporte"** (modo donde el superadmin
  opera DENTRO de una empresa con una sesión marcada) — es la opción
  avanzada que el propio sprint permite posponer. Si en el futuro se
  necesita, debe: auditarse explícitamente, dejar claro en la UI que se
  está en modo soporte, no crear membership normal, no modificar roles de
  empresa, y poder salir del modo — documentado aquí como pendiente, no
  como algo ya construido.

## Comandos relacionados

```bash
npm run test:platform   # lógica pura de permisos y separación de roles (sin BD)
npm run test:rls        # aislamiento de plataforma con bootstrap directo (Supabase local)
```
