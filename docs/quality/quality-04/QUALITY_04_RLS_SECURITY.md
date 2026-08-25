# QUALITY-04 · RLS, privilegios y aislamiento

## 1. Dos clases de escritura, deliberadamente

| | Cómo se escribe | Por qué |
|---|---|---|
| Crear un caso, un hallazgo, una acción | escritura normal bajo RLS | solo **registra** |
| Clasificar, aprobar causa, completar, verificar, cerrar, reabrir | **RPC `security definer`** | **decide**, y hay que comprobar rol, estado e invariantes en el mismo acto |

Una decisión formal no se «inserta». Necesita saber, en el instante de
registrarse, que quien la toma tiene autoridad, que el caso está en un estado
que la admite y que se cumplen las condiciones — y eso no se puede hacer con un
INSERT desde el navegador.

## 2. Las tablas de historia son de SOLO LECTURA

`work_decisions` y `work_action_verifications` tienen **política de SELECT y
nada más**. Sus escrituras vienen exclusivamente de las RPC.

Y, aplicando la lección de 0115/0118, se les **retira el privilegio** que el
entorno concede de más:

```sql
revoke insert, update, delete, truncate, references, trigger on table
  work_decisions, work_action_verifications, work_case_codes, work_action_codes
from authenticated;
```

Sin eso, en un proyecto remoto de Supabase `authenticated` conservaría el DML y
un `DELETE` sin política devolvería **204 sin error** en vez de fallar. «Cero
filas» no es «denegado».

Comprobado con sesión real: fabricar una decisión (`X1`) o una verificación
(`X2`) por PostgREST **falla**.

## 3. Inmutabilidad (AC-22)

| Objeto | Qué lo protege |
|---|---|
| Decisión formal | disparadores que impiden `update` y `delete` |
| Verificación de eficacia | los mismos disparadores |
| Causa aprobada | disparador que rechaza tocar análisis, metodología o causa validada |
| Caso cerrado | disparador que rechaza cambiar clasificación, título o declaración |

Si una conclusión cambia, se registra **otra** decisión. El historial debe
mostrar que cambió, no fingir que siempre se pensó lo mismo.

## 4. La referencia tipada como barrera de aislamiento

`work_reference_must_be_valid` comprueba, para cada tipo del catálogo cerrado:

1. que la fila **exista** (`A5`);
2. que sea de la **misma empresa** (`A4`);
3. que el propietario —caso o acción— también lo sea.

Lo segundo es aislamiento, no integridad: poder referenciar el indicador de otra
empresa filtraría su existencia.

## 5. Roles

```
registrar   admin · quality · consultant     (trabajo operativo)
gobernar    admin · quality                  (clasificar, aprobar, verificar, cerrar)
reabrir     admin                            (solo la administración)
```

Comprobado con sesiones reales, no con botones ocultos: un consultor no
clasifica ni verifica (`X3`), y no reabre (`X4`).

## 6. Multiempresa

Todas las tablas llevan `organization_id`; las relaciones usan **FK compuestas**
`(organization_id, id)`. Comprobado con la sesión de un tercero:

| | |
|---|---|
| `X5` | una empresa ajena no ve casos, ni decisiones, ni la vista de resumen |
| `X6` | una ajena no clasifica, ni cierra, ni completa, ni barre nada de la otra |
| `A4` | no puede referenciar objetos de otra empresa |

Ni siquiera se filtran contadores: la vista devuelve **cero filas**, no filas
enmascaradas.

## 7. Ataques comprobados

| | Intento | Resultado |
|---|---|---|
| `X1` | fabricar una decisión formal | rechazado |
| `X2` | fabricar una verificación de eficacia | rechazado |
| `B4` | editar o borrar una decisión | rechazado |
| `B13` | convertir «no eficaz» en «eficaz» con un UPDATE | rechazado |
| `B7` | reescribir una causa ya aprobada | rechazado |
| `B16` | reclasificar un caso cerrado con un UPDATE | rechazado |
| `X3` | clasificar o verificar sin autoridad | rechazado |
| `X4` | reabrir sin ser administración | rechazado |
| `X7` | reutilizar el número de un caso eliminado | rechazado |
| `X8` | borrar un caso con decisiones, o una acción verificada | rechazado |
| `X5`/`X6` | cualquier cosa cross-tenant | rechazado o invisible |

## 8. Rutas legacy

El encargo pide auditar que ninguna RPC anterior pueda saltarse el flujo nuevo
(§54). Las RPC de QUALITY-02 y QUALITY-03 operan sobre **sus** tablas
—documentos, indicadores, mediciones— y ninguna escribe en `work_cases`,
`work_actions`, `work_decisions` ni `work_action_verifications`. La única
superficie de escritura sobre la historia son las seis RPC de 0121 §15, y todas
comprueban empresa, membresía, rol y estado.
