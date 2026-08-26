# QUALITY-09 · RLS, privilegios y frontera entre empresas

## 1 · Deny-by-default, comprobado tabla por tabla

Las **22** tablas del dominio tienen RLS activa. Ninguna concede nada a `anon`.

Supabase concede por defecto `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre cada
tabla nueva —no `SELECT`, pero sí lo suficiente para que «no hicimos nada» no
signifique «no se puede hacer nada»—. Por eso cada tabla **revoca primero**:

```sql
revoke all on table public.quality_audit_… from anon, authenticated;
grant  …    on table public.quality_audit_… to authenticated;
```

Las tres vistas llevan su propio `grant select`: `security_invoker` decide qué
filas, pero el privilegio decide si se puede mirar.

## 2 · Quién puede qué

| | Leer | Conducir | Cerrar / emitir informe |
|---|---|---|---|
| `admin` | sí | sí | **sí** |
| `quality` | sí | sí | **sí** |
| `consultant` | sí | sí | **no** |

`quality_reads_audits`, `quality_manages_audits` y `quality_closes_audits`
resuelven esto en la base, y `canReadAudits` / `canManageAudits` /
`canCloseAudits` lo repiten en la interfaz para no ofrecer botones que fallarán.

El informe y el cierre son actos de la **empresa sobre sí misma**: no los firma
un consultor externo. **Verificado** (`test:quality09-rls` K1–K2): el consultor
crea la auditoría y no puede cerrarla.

## 3 · La nota restringida

El único objeto del dominio cuya lectura no coincide con la pertenencia.
`quality_can_read_audit_note()` la reserva a `admin`/`quality` y al equipo
auditor de esa auditoría.

Por eso su escritura **no** puede declararse `for all`: en PostgreSQL `for all`
concede también `select` y las políticas se suman. Se declara en tres piezas
—`insert`, `update`, `delete`— y las dos últimas repiten la guarda de lectura.

Este defecto existió y lo encontró la suite contra base real. Está en el §5 de
`QUALITY_09_TEST_MATRIX.md`.

## 4 · Las funciones

- **Todas** las `security definer` fijan `set search_path = public`. Comprobado
  recorriendo la migración entera, no con una lista escrita a mano.
- Ninguna confía en el `p_organization_id` que le pasen: revalidan con
  `is_org_member` o `has_org_role`, que resuelven contra la **sesión**.
- `quality_audit_notice_recipient` está revocada incluso de `authenticated`:
  solo la llama el barrido, que ya revalidó.
- Ninguna está concedida a `anon`. Probado también contra Staging por HTTP: las
  seis RPC del dominio responden 404 o 401 al cliente anónimo.

## 5 · La frontera entre empresas (§62)

Toda relación usa FK compuestas `(organization_id, id)`. Más de treinta en la
migración. Lo que eso impide, **con el UUID en la mano**:

| Intento | Resultado |
|---|---|
| Auditoría de A → proceso de B en el alcance | rechazado por la FK |
| Auditoría de A → persona de B en el equipo | rechazado por la FK |
| A lee las auditorías de B | 0 filas |
| A lee los hallazgos de B | 0 filas |
| A pide los conflictos de una auditoría de B | 0 filas |
| A pide el expediente de una auditoría de B | `null` |
| A cierra una auditoría de B | excepción |
| A pide el dictamen de borrado de una auditoría de B | sin permiso |

**Verificado** (`test:quality09-rls` L1–L6), incluido el cliente anónimo: no lee
nada, no escribe nada y no ejecuta ninguna RPC del dominio.

## 6 · El dictamen de borrado conserva sus guardas

`quality_deletion_eligibility` se reescribió para admitir `audit` y
`audit_program` —veinte entidades ahora—. La reescritura **conserva** las dos
guardas heredadas que ya estaban:

```sql
if auth.uid() is null then return v_none; end if;
if p_entity = 'person' and not quality_can_read_person(v_org, p_id) …
```

No es una precaución teórica: en QUALITY-08 una reescritura equivalente las
perdió, y lo detectó la regresión de QUALITY-06, no una prueba del sprint. Aquí
`test:quality09` M3 las defiende explícitamente y `test:quality09-rls` N5 lo
comprueba con el cliente anónimo.

## 7 · Nunca `service_role`

Ni en `lib/db/quality-audits.ts` ni en `server/actions/quality-audits.ts`. Se
opera con la sesión del usuario y decide RLS. `test:quality09` K8 lo comprueba
sobre el código sin comentarios.
