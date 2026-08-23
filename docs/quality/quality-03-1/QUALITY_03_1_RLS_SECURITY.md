# QUALITY-03.1 · RLS, privilegios y aislamiento

## 1. Lo que añade este sprint

QUALITY-03.1 no crea superficie nueva salvo una tabla —la reserva de códigos
documentales— y varias funciones. Lo que sí hace es **cerrar tres huecos**.

## 2. La puerta del borrado

Un disparador `BEFORE DELETE` sobre las cuatro entidades con ciclo de vida
controlado —indicador, objetivo, cargo y documento— consulta el mismo dictamen
que ve el usuario y levanta una excepción con el mismo texto.

Es la barrera que **un administrador tampoco puede saltarse**: el rol decide
quién opera, no qué se puede destruir (§24 del encargo).

Y es la que cierra la ventana TOCTOU: entre que alguien abre el aviso y
confirma pueden pasar cosas. Si en ese rato otra persona registra una medición,
el borrado falla (prueba `L17`).

> **Por qué NO hay disparador en revisiones, decisiones, mediciones,
> configuraciones, cierres ni eventos.** Esas tablas no tienen política de
> `DELETE`, así que la RLS ya las niega, y además se borran **en cascada**
> cuando se elimina un objeto que sí era desechable. Un disparador allí
> rompería el borrado legítimo de un borrador.

## 3. El dictamen enmascara lo ajeno

La lógica se parte en dos a propósito:

| Función | Enmascara | Quién la usa |
|---|---|---|
| `quality_*_deletion_verdict(id)` | **no** | el disparador — en ese instante la RLS ya decidió si la fila era tocable |
| `quality_deletion_eligibility(entidad, id)` | **sí** | la aplicación |

Para quien no es miembro de la empresa, la respuesta es **idéntica** a la de un
identificador inventado: `not_found`, sin motivo y sin contadores.

Esto último importa: **un contador es información**. Saber que un indicador
ajeno tiene cuatro mediciones ya dice algo de esa empresa. La prueba `L15` lo
comprueba con la sesión real de un tercero.

## 4. La lección de 0115 y 0118, otra vez

Doce tablas conservaban el privilegio de `DELETE` **sin política que lo
permitiera**. La RLS ya lo negaba, pero un `DELETE` sin política **no da
error**: afecta a cero filas y devuelve 204.

`0119 §2.7` retira el privilegio. Ahora el intento falla con `42501`, que es la
verdad:

```
quality_process_revisions        quality_process_map_versions
quality_process_maps             quality_process_categories
quality_position_assignments     trazadoc_document_versions
trazadoc_file_document_versions  trazadoc_file_documents
trazadoc_status_history          trazadoc_blueprints
trazadoc_blueprint_sections
```

Más las de 0116 que guardan la historia formal del workflow — **D-20: una
decisión de revisión o aprobación es un hecho histórico inmutable**:

```
trazadoc_document_decisions               → revocados UPDATE y DELETE
trazadoc_document_revisions               → revocado DELETE
trazadoc_document_workflow_participants   → revocado DELETE
```

## 5. La tabla nueva

`trazadoc_document_codes` — la reserva de códigos documentales.

| | |
|---|---|
| RLS | activada |
| Políticas | **solo SELECT**, para miembros de la empresa |
| Escritura | ninguna política: la gestionan los disparadores |
| `authenticated` | `SELECT`; `insert`, `update`, `delete`, `truncate`, `references`, `trigger` revocados |
| `anon` | nada |
| Clave | `(organization_id, code_key)` — la reserva es **por empresa**, nunca global |

## 6. Aislamiento multiempresa

Todo lo nuevo lleva `organization_id` y toda consulta filtra por él.
Comprobado con sesiones reales —no con `service_role`— en local y en Staging:

| | |
|---|---|
| `T12` | una empresa ajena no ve el estado de un indicador de otra |
| `L12` | la reserva de código de una empresa no bloquea a otra |
| `L15` | una empresa ajena no averigua nada: ni motivo ni contadores |
| `L16` | una empresa ajena no puede eliminar un cargo de otra |

## 7. El logo

`loadCompanyLogoForPdf` no acepta ninguna URL. La ruta sale de la fila de la
empresa ya autorizada, se comprueba que pertenezca a esa empresa, y se lee del
bucket **con la sesión del usuario**, de modo que la RLS del Storage vuelve a
decidir. Detalle en `QUALITY_03_1_PDF_IDENTITY.md` §3.

## 8. Ataques comprobados contra base real

| | Intento | Resultado |
|---|---|---|
| `L4` | borrar un indicador con mediciones (como administrador) | rechazado; la medición sigue |
| `L6` | borrar una medición por PostgREST | rechazado |
| `L8` | borrar un objetivo ya activo | rechazado |
| `L13` | borrar una decisión de workflow | rechazado |
| `L14` | borrar un cierre de periodo | rechazado |
| `L15` | consultar la elegibilidad de algo ajeno | enmascarado |
| `L16` | eliminar algo de otra empresa | rechazado |
| `L17` | borrar con un dictamen ya caducado | rechazado |
