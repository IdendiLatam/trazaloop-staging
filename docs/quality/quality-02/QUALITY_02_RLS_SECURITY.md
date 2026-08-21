# QUALITY-02 · Seguridad y RLS

**Decisiones ancladas:** MDR-03 · MDR-04 · MDR-42 · AT-04 · D-20 · D-02
**Verificado por:** `npm run test:quality02-rls` — 58 comprobaciones contra base
real, con la sesión de cada usuario y sin `service_role` en ninguna aserción.

---

## 1. Principio

> Ocultar un botón no protege nada.

Cada regla de este sprint está en **tres capas**, y las tres se comprobaron por
separado:

| Capa | Qué hace | Si falla |
|---|---|---|
| Dominio (`lib/domain/document-control.ts`) | Decide qué se dibuja y qué mensaje se da | El usuario ve un botón que no debería |
| Server action | Comprueba antes de escribir, para explicar el motivo | El usuario recibe un error genérico |
| **Base de datos** | RLS + triggers + RPC `SECURITY DEFINER` | **Nada. La operación no ocurre.** |

La tercera es la barrera. Las dos primeras existen para que el sistema sepa
decir *por qué*.

---

## 2. Tablas nuevas: convención completa

Las cinco tablas nuevas cumplen la convención del repositorio sin excepción:

- `organization_id` explícito y `not null` (MDR-03).
- `unique (organization_id, id)` para habilitar FK compuestas.
- **FK compuesta** `(organization_id, padre_id) → padre(organization_id, id)`:
  una fila hija NUNCA puede apuntar a un padre de otra empresa (MDR-42). Lo
  impide el motor, no la aplicación.
- `prevent_organization_id_change`, `force_created_by`, `set_updated_at` y
  `audit_row_change` adjuntados como en el resto del proyecto.
- RLS habilitada y **deny-by-default**.
- Privilegios **explícitos por tabla**. Sin `ALTER DEFAULT PRIVILEGES`.

### 2.1 Por qué las escrituras NO se conceden

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `trazadoc_document_revisions` | miembro de la empresa | — | solo revisión abierta, y solo su ficha de vigencia (§3) | — |
| `trazadoc_document_workflow_participants` | miembro | — | — | — |
| `trazadoc_document_decisions` | miembro | — | — | — |
| `work_tasks` | miembro | — | — | — |
| `work_alerts` | miembro | — | solo el destinatario, y solo el estado (§3) | — |

Conceder `INSERT` «por si acaso» abriría exactamente la puerta que el diseño
cierra: el workflow se movería con una llamada directa a PostgREST, saltándose
revisores, aprobadores y motivos obligatorios.

Las decisiones formales son **append-only real**: sin política de `UPDATE` ni de
`DELETE`, no existe vía para reescribir un rechazo (D-20, MDR-49).

`SELECT` sí es amplio dentro de la empresa: un responsable de calidad necesita
ver la carga del área, y una tarea no contiene información que el miembro no
pudiera ver ya por otra vía —el documento es visible para toda la empresa—.

---

## 3. Triggers: lo que la RLS no puede decir

La RLS decide **qué filas**. Los triggers deciden **qué columnas**, y ahí está
media seguridad de este sprint.

| Trigger | Qué impide |
|---|---|
| `t_trazadoc_document_revisions_immutable` | Modificar el contenido, el número o el acto de aprobación de una revisión aprobada (D-02) |
| `t_trazadoc_document_revisions_direct_update` | Mover el estado del workflow, las firmas o el snapshot con un `PATCH` directo. Solo deja pasar `effective_from`, `effective_to`, `review_due_at` y `change_note` |
| `t_trazadoc_documents_revision_guard` | Cambiar `current_version` en un documento controlado sin la marca de transacción; y cambiar `revision_model` después de crear |
| `t_trazadoc_sections_controlled_editing` | Editar el contenido mientras el documento está en revisión, aprobado o retirado |
| `t_work_alerts_recipient_scope` | Cambiar de una alerta propia cualquier cosa que no sea su estado |

Los tres primeros comprueban `current_user not in ('anon','authenticated')` para
dejar pasar a las RPC `SECURITY DEFINER`, que corren como el dueño del esquema.
El de `current_version` **no** usa ese criterio a propósito: usa una marca de
transacción, porque la RPC histórica también es `SECURITY DEFINER` y debe
quedar bloqueada.

---

## 4. Ataques comprobados

`tests/rls/quality-02-document-control.test.ts` §H — once intentos reales por
PostgREST con la sesión de un usuario legítimo. Todos fallan **en la base**:

| # | Intento | Resultado |
|---|---|---|
| H1 | `UPDATE workflow_state = 'approved'` | Bloqueado por trigger |
| H2 | Fabricar `approved_at` / `approved_by` | Bloqueado por trigger |
| H3 | `INSERT` un participante con la decisión ya tomada | Sin política de INSERT |
| H4 | `INSERT` una decisión formal a mano | Sin política de INSERT |
| H5 | Autoasignarse una tarea de aprobación | Sin política de INSERT |
| H6 | `change_trazadoc_document_status` sobre un documento controlado | Bloqueado por el guarda de revisión |
| H7 | Editar la ficha de vigencia con la revisión abierta | **Permitido** (es lo correcto) |
| H8 | Decidir sobre un documento de otra empresa | Bloqueado |
| H9 | Retirar / eliminar de otra empresa | Bloqueado |
| H10 | Leer revisiones, participantes o decisiones de otra empresa | 0 filas |
| H11 | Designar aprobador a alguien de otra empresa | Bloqueado con mensaje |

Y en §E, sobre la bandeja:

- Una empresa ajena no ve **ni una** tarea ni **ni una** alerta de la otra.
- Nadie marca la alerta de otra persona.
- De una alerta propia solo se cambia el estado.

---

## 5. Aislamiento multiempresa

Comprobado sobre **cada** superficie nueva:

- `trazadoc_document_revisions`, `..._workflow_participants`, `..._decisions`
- `work_tasks`, `work_alerts`
- `v_trazadoc_document_control` (la Lista Maestra)
- Los tres endpoints de descarga: PDF de documento, PDF de lista, CSV de lista

### 5.1 Los endpoints de descarga

**Los layouts de Next no envuelven a los route handlers.** La protección del
namespace `/quality` que aplica a las páginas **no alcanza** a
`route.ts`. Sin un guard explícito, el PDF sería una puerta abierta al
contenido documental de cualquier empresa.

Los tres llaman a `requireQualityForAction()` en su primera línea, acotan por
`organizationId` y responden `cache-control: no-store`. Una prueba estática
(`N6`) lo exige archivo por archivo, de modo que un endpoint nuevo que se olvide
del guard no pasará.

---

## 6. Privilegios explícitos

```sql
grant select on table … to authenticated;
grant update on table trazadoc_document_revisions to authenticated;  -- §3
grant update on table work_alerts to authenticated;                   -- §3

revoke truncate, references, trigger on table … from anon, authenticated;
revoke all on table … from anon;
```

`TRUNCATE` **bypasea la RLS por completo**, y los privilegios por defecto del
rol `postgres` lo conceden a `anon` y `authenticated` en cada tabla que se crea.
Sin el bloque de `revoke`, las tablas nuevas nacerían con `TRUNCATE` en manos de
roles de cliente. Es la misma corrección que 0111 aplicó al esquema existente, y
0116 la repite —a mano y por tabla— porque 0111 no dejó `ALTER DEFAULT
PRIVILEGES` a propósito.

`anon` no recibe **nada**: ninguna superficie de Quality es pública.

---

## 7. Nada usa `service_role`

Ninguna ruta, ninguna server action y ninguna función de la capa de datos usa
el cliente administrativo. Todo corre con la sesión real bajo RLS. Las RPC son
`SECURITY DEFINER` —corren como el dueño del esquema— pero resuelven la
identidad con `auth.uid()`, nunca con un parámetro del cliente.

En las pruebas, el cliente administrativo se usa **solo** para crear usuarios y
ajustar el plan comercial: jamás para saltarse una comprobación que la prueba
quiere hacer.
