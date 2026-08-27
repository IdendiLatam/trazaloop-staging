# QUALITY-10 · Privacidad, RLS y frontera entre empresas

## 1 · El problema que este dominio crea, y cómo se resuelve

La revisión por la dirección **agrega información de dominios con permisos más
estrechos**: competencias de personas, respuestas de clientes, notas de
auditoría. La tentación es guardar aquí una copia cómoda de todo.

La regla es la contraria: lo que se guarda son **agregados** y **referencias**.
El detalle crudo sigue detrás de las políticas de su propio dominio, y el enlace
de profundización solo funciona para quien ya tenía permiso allí.

> **Ver un agregado no concede acceso al detalle.** Quien no podía ver una ficha
> antes, sigue sin poder.

## 2 · Anonimato del cliente — absoluto (§63, §81, §100)

`quality_mr_src_customer_voice` es la función más estrecha de las catorce. En su
cuerpo **no aparecen**:

- `quality_survey_responses`
- `quality_survey_answers`
- `quality_survey_invitations`
- `quality_customer_contacts`

Lo que devuelve son métricas de campaña —que ya nacieron agregadas—, conteos de
manifestaciones por tipo y conteos de señales. Ni un identificador de quien
respondió.

Y devuelve una `anonymity_note` que lo explica en el propio retrato, para que
quien lea el acta entienda que la ausencia es deliberada.

**Verificado contra base real** (`test:quality10-rls` E2–E3): con una campaña
anónima real, el retrato no contiene `respondent`, `contact_id`, `invitation`,
`response_id`, `@` ni `token`. Y la suite de anonimato de QUALITY-08 se ejecuta
completa como regresión: **60 conformes, 0 fallos**, en local y contra Staging.

La prueba pura lo comprueba además **función por función**: ninguna de las
funciones de QUALITY-10 menciona esas cuatro tablas.

## 3 · Personas — agregados, nunca nombres (§62)

`quality_mr_src_resources` no contiene `full_name` ni `person_name`. Devuelve:

```
personas activas · cargos vacantes · brechas de competencia obligatoria
evaluaciones pendientes · conocimientos con un solo poseedor
```

La revisión por la dirección no es una evaluación de empleados. Si hace falta
mirar un caso individual, se mira en Personas, con sus permisos.

## 4 · Notas de auditoría — se quedan en auditorías (§64)

`quality_mr_src_audits` no lee `quality_audit_notes`. De las auditorías entran
resultados formales: cobertura, ejecutadas, hallazgos, escaladas y seguimientos.
Las notas de entrevista están restringidas a quien audita y ahí se quedan.

## 5 · RLS, deny-by-default

Las **ocho** tablas del dominio tienen RLS activa. La novena —el catálogo— es
global y solo se puede leer.

Supabase concede por defecto `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre cada
tabla nueva. Por eso cada una **revoca primero**:

```sql
revoke all on table public.quality_management_review_… from anon, authenticated;
grant  …    on table public.quality_management_review_… to authenticated;
```

**El acta solo se concede como `SELECT`.** Se escribe por su RPC, que comprueba
rol, estado y conclusiones en el mismo acto en que congela el retrato. Un acta
editable no es un acta.

Las tres vistas son `security_invoker` y llevan su propio `grant select`.

## 6 · Quién puede qué

| | Leer | Conducir | Cerrar / emitir acta |
|---|---|---|---|
| `admin` | sí | sí | **sí** |
| `quality` | sí | sí | **sí** |
| `consultant` | sí | sí | **no** |

Cerrar la revisión y emitir el acta es un acto de la **empresa sobre sí misma**:
la dirección no delega su propia revisión en un consultor externo.

**Verificado** (K1–K2): el consultor prepara las entradas y no puede cerrar ni
emitir el acta.

## 7 · Las funciones

- **Todas** las `security definer` fijan `set search_path = public`. Comprobado
  recorriendo la migración entera, no con una lista escrita a mano.
- Ninguna confía en el `p_organization_id` recibido: revalidan con
  `is_org_member` o `has_org_role`, que resuelven contra la **sesión**.
- `quality_mr_notice_recipient` está revocada incluso de `authenticated`.
- Ninguna está concedida a `anon`. Comprobado también por HTTP contra Staging:
  las seis RPC del dominio responden 404 al cliente anónimo.

## 8 · La frontera entre empresas (§65, §98)

**Verificado** (`test:quality10-rls` L1–L7), incluido PostgREST directo:

| Intento | Resultado |
|---|---|
| A lee la revisión de B | 0 filas |
| A lee las entradas de B | 0 filas |
| A lee las decisiones de B | 0 filas |
| A inserta una entrada en la revisión de B | rechazado |
| A reescribe el título de una revisión de B | sin efecto |
| A borra una revisión de B | sin efecto |
| A mete una persona de B como participante | rechazado por la FK |
| A pide el dato de origen de B (`quality_mr_source_payload`) | `null` |
| A pide el estado de preparación de una revisión de B | `null` |
| A pide el seguimiento de una revisión de B | `null` |
| A prepara las entradas de una revisión de B | excepción |
| Un adaptador de A trae un proceso de B | no ocurre |
| Un anónimo lee, escribe o ejecuta cualquier cosa | denegado |
| Un anónimo lee el catálogo de entradas | denegado |

## 9 · El dictamen de borrado conserva sus guardas

`quality_deletion_eligibility` se reescribió para admitir `management_review`
—veintiuna entidades ahora—. La reescritura **conserva** las dos guardas
heredadas:

```sql
if auth.uid() is null then return v_none; end if;
if p_entity = 'person' and not quality_can_read_person(v_org, p_id) …
```

No es una precaución teórica: en QUALITY-08 una reescritura equivalente las
perdió. Aquí la prueba pura las defiende y `test:quality10-rls` M5 las comprueba
con el cliente anónimo, sobre `management_review` **y** sobre `person`.

## 10 · Nunca `service_role`

Ni en `lib/db/quality-management-review.ts` ni en
`server/actions/quality-management-review.ts`. Se opera con la sesión del
usuario y decide RLS.
