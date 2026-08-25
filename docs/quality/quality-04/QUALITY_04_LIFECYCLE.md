# QUALITY-04 · Ciclo de vida y eliminación

Aplica el patrón congelado en QUALITY-03.1: **un objeto puede eliminarse
mientras no haya adquirido valor histórico**. Cuando lo adquiere, no se
destruye.

## 1. Dónde está la frontera de cada entidad

| Entidad | ¿Hard delete? | ¿Hasta cuándo? | Qué la vuelve histórica | Alternativa |
|---|---|---|---|---|
| **Caso** | **Sí** | borrador, sin evaluar, sin hallazgos, sin acciones y sin decisiones | evaluarlo, registrar un hallazgo, planificar una acción, o cualquier decisión | **cerrarlo** cuando el ciclo termine |
| **Hallazgo** | Sí | mientras el caso siga sin evaluar | que el caso se evalúe (el hallazgo lo fundamentó) | queda en el caso |
| **No conformidad** | **Nunca** | — | la decisión de clasificación existe desde que se toma | retirar no aplica: se **cierra** |
| **Acción** | **Sí** | `planned`, sin ejecución ni verificaciones | completarla, verificarla, o cualquier decisión distinta de «planificada» | **cancelarla** con motivo |
| **Decisión formal** | **Nunca** | — | existe (AC-22) | — |
| **Verificación de eficacia** | **Nunca** | — | existe | registrar otra |
| **Causa aprobada** | **Nunca** | — | aprobarla | registrar un análisis nuevo |

**La frontera no es «crear».** Un caso recién abierto por error es
perfectamente desechable; deja de serlo en cuanto alguien registra un hecho o
toma una decisión sobre él.

## 2. La puerta está en la base

`work_case_deletion_verdict` y `work_action_deletion_verdict` emiten el
dictamen, y disparadores `BEFORE DELETE` lo aplican. El despachador
`quality_deletion_eligibility` de 0119/0120 aprende `'case'` y `'action'`, de
modo que la aplicación sigue preguntando por **una sola puerta**.

Se aplica también al **administrador**: administrar es decidir quién opera, no
poder destruir la historia.

### Por qué hacía falta

`work_decisions.subject_id` es genérico —apunta a casos **y** a acciones—, así
que **no tiene FK** al caso. Sin la puerta, borrar un caso habría dejado su acta
huérfana. Es el mismo agujero que 0119 cerró para indicadores y objetivos, y lo
detectó la suite: la primera versión de esta migración no lo tenía, y la prueba
`X8` lo puso en rojo.

## 3. Los mensajes

Nunca «No se puede eliminar» a secas:

> **Este caso ya no puede eliminarse.**
> Este caso ya tiene historia y debe conservarse: ya fue evaluado, tiene 1
> hallazgo, tiene 2 decisiones registradas.

## 4. Las confirmaciones

Se avisa **solo cuando es verdad** —la regla de QUALITY-03.1—. Un modal que
anuncia «esto no podrá borrarse» al abrir un borrador enseña a cerrar los avisos
sin leerlos.

| Acción | Aviso previo |
|---|---|
| Evaluar el caso | «Esta decisión queda en el historial y no podrá modificarse. Si más adelante la conclusión cambia, se registrará una decisión nueva.» |
| Aprobar la causa | «Al aprobarla queda fija: es la que fundamenta el plan de acciones.» |
| Completar una acción | «Completar la acción no significa que haya funcionado. Si exige verificación, quedará pendiente de comprobar su eficacia.» |
| Verificar la eficacia | «El resultado queda en el historial y no se sobrescribe.» |
| Cerrar el caso | «Cerrar deja el caso consultable pero ya no editable. Para retomarlo habría que reabrirlo formalmente, con motivo.» |
| Eliminar un borrador | «Esta acción eliminará definitivamente el borrador «…». No se puede deshacer.» |

## 5. El número no se recicla

Un `C-2026-001` eliminado en borrador deja su número ocupado
(`work_case_codes`). Aparece en actas y correos: que designe dos cosas distintas
en momentos distintos es el problema que D-04 describe.

**No se generalizó por analogía** (§35): se aplicó porque el número de caso
tiene la misma propiedad que un código documental. Otros identificadores del
sprint —los `id` internos— no la tienen y no llevan lápida.
