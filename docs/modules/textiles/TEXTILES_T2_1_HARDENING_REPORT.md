# Trazaloop Textil · Reporte de hardening Sprint T2.1

> Sprint T2.1 — Hardening RLS y control de finalización del diagnóstico textil.
> Implementado sobre el resultado de T2.

## 1. Problema identificado (auditoría de 0071)

La política `textile_diagnostics_update` de 0071 (`for update using
is_org_member`) permitía a **cualquier miembro autenticado** de la organización,
usando la API de Supabase directamente (supabase-js con su propia sesión),
actualizar los campos calculados de su diagnóstico en progreso: `status →
'completed'`, `maturity_percent`, `maturity_level`, `dimension_scores`,
`critical_gaps` y `completed_at` — es decir, **autofinalizarse con resultados
fabricados**. El trigger `lock_completed_diagnostic` solo protege filas que YA
estaban completadas, no el tránsito borrador→completado. Adicionalmente, la
política de INSERT permitía crear un diagnóstico "nacido finalizado" con valores
arbitrarios. Las respuestas ya estaban razonablemente protegidas (escritura solo
con diagnóstico en progreso, FK compuesta por empresa), pero la validación de
"No aplica" en preguntas que no lo admiten y la de pregunta activa vivían solo en
la server action. Cross-tenant ya estaba bloqueado por RLS + FK compuesta; se
conserva y se re-verifica en la RPC.

## 2. Qué se endureció (migración `0072_textile_diagnostic_hardening.sql`, única del sprint)

1. **Sin UPDATE directo de clientes** sobre `textile_diagnostics`: la política de
   UPDATE se elimina y NO se recrea — deny-by-default real. No existe ninguna
   mutación legítima de esa tabla vía API: iniciar es INSERT, finalizar es RPC.
2. **INSERT endurecido**: la nueva política exige `started_by = auth.uid()`,
   `status = 'in_progress'`, resultados vacíos (`maturity_percent/level null`,
   `critical_gaps = 0`, `dimension_scores = '{}'`, `completed_at/finalized_by
   null`) además de la membresía. Imposible nacer finalizado.
3. **Trigger `protect_textile_diagnostic_calculated_fields`** (BEFORE UPDATE):
   bloquea cambios a `status`, `maturity_percent`, `maturity_level`,
   `critical_gaps`, `dimension_scores`, `completed_at`, `finalized_by`,
   `started_by` y `started_at` para **todos los roles** — incluido
   `service_role`, que bypasea RLS pero no triggers — salvo dentro de la RPC,
   que fija la bandera transaccional `trazaloop.textile_diag_finalize` vía
   `set_config(..., true)`. `set_config` no está expuesto por la API de
   PostgREST y la bandera muere con la transacción: un cliente no puede fijarla.
4. **RPC `finalize_textile_diagnostic(p_diagnostic_id)`** — Opción A del
   encargo, mismo patrón que `change_organization_plan` (0053): SECURITY
   DEFINER, `set search_path = public`, revoke a `public/anon`, grant solo a
   `authenticated`. Valida en orden: `auth.uid()`; propiedad + membresía con un
   único mensaje que no distingue existencia (sin filtración cross-tenant);
   habilitación del módulo `textiles` en `organization_modules`; estado
   borrador; completitud contra preguntas activas; "No aplica" inválidos.
   Después **calcula el resultado en SQL** (espejo determinista de
   `lib/domain/textiles-diagnostic.ts`: escala 1/0.5/0, NA fuera del
   denominador, regla de contexto TQ49 aplicada sobre lo guardado, tope 49 por
   crítica en "No", nivel global limitado a Básico con brechas críticas,
   ponderación por dimensión, redondeo a 4 decimales) y persiste `status =
   'completed'`, resultados, `completed_at = now()` y `finalized_by =
   auth.uid()`. **El cliente no aporta ningún valor calculado** — llamar la RPC
   directamente solo produce una finalización legítima con el cálculo real.
5. **Trigger `validate_textile_diagnostic_answer`** (BEFORE INSERT/UPDATE de
   respuestas): pregunta activa obligatoria; "No aplica" rechazado en BD donde
   `allows_na = false` (críticas TQ01, TQ06, TQ12, TQ18, TQ23, TQ56).
6. **Trigger `lock_finalized_textile_diagnostic_answers`** (INSERT/UPDATE/
   DELETE): respuestas de un diagnóstico finalizado inmutables para todos los
   roles (defensa en profundidad sobre las políticas de 0071, que ya exigen
   borrador). El CASCADE al descartar un borrador sigue funcionando.
7. **`finalized_by`** (columna aditiva, `if not exists`): trazabilidad de quién
   finalizó. `completed_at` ES la fecha de finalización — no se duplica con un
   `finalized_at` (evitar campos innecesarios). Mapa conceptual: el estado
   "finalized" del encargo = `status = 'completed'` del modelo T2.

## 3. Regla TQ49 e inconsistencias intencionales

La regla contextual NO se impone al escribir respuestas (validar consistencia
entre filas en triggers por fila introduce carreras con los upserts por lote):
se resuelve **al calcular**, dos veces y de forma independiente — en la función
pura de dominio y en la RPC SQL — tratando TQ50–52 como No aplica cuando TQ49 =
No/No aplica, sin importar lo guardado. Un cliente que grabe combinaciones
inconsistentes por API no puede alterar el resultado.

## 4. Server actions (`server/actions/textiles-diagnostic.ts`)

`completeTextileDiagnosticAction` ya no hace `update` de `textile_diagnostics`:
pre-valida con la función pura (mensajes amigables de completitud/NA), llama la
RPC y, como cinturón y tirantes, compara el resultado SQL persistido contra el
cálculo de dominio — una divergencia (que indicaría desalineación entre ambas
implementaciones) se registra en el log del servidor; el valor de la RPC es el
autoritativo. `startTextileDiagnosticAction` y
`saveTextileDiagnosticAnswersAction` quedan igual (compatibles con la política
de INSERT endurecida y las validaciones de BD nuevas). Ninguna action usa
`service_role`; las tres re-verifican flag + habilitación + solo-lectura de
plataforma. Errores: mensajes seguros sin detalles internos.

## 5. UI

**Cero cambios**: el wizard sigue llamando `completeTextileDiagnosticAction`
(misma firma), el guardado parcial y las rutas `/textiles/diagnostic` y
`/textiles/diagnostic/results` funcionan igual. La página de resultados ya leía
el resultado persistido para finalizados y recalculaba para borradores — ambas
fuentes aplican las mismas reglas.

## 6. Reapertura: decisión

**No se permite reabrir** (recomendación del encargo adoptada): un diagnóstico
finalizado es histórico inmutable y trazable (respuestas + resultados +
`completed_at` + `finalized_by`); para actualizar la evaluación se inicia un
diagnóstico nuevo (flujo ya existente en la UI). No se creó
`reopen_textile_diagnostic_assessment` ni `recalculate_*`: reabrir contradice el
histórico y recalcular sin reabrir no tiene caso de uso todavía. Registrado como
DL-23/DL-24 en el decision log.

## 7. Verificación

| Verificación | Resultado |
|---|---|
| `npm run typecheck` · `npm run lint` · `npm run build` | ✅ (las 3 rutas textiles siguen registradas) |
| 14 suites CPR (incl. platform, plans, launch) | ✅ 14/14 sin modificar ningún test CPR |
| `npx tsx tests/diagnostic/textiles-diagnostic-hardening.test.ts` | ✅ 18/18 (nuevo) — única migración 0072; sin tablas nuevas ni objetos CPR/planes; UPDATE de clientes eliminado; INSERT "en cero"; trigger de protección por campo; RPC con SECURITY DEFINER + revoke/grant, membresía sin filtración cross-tenant, borrador, completitud, NA inválidos y regla TQ49; respuestas bloqueadas tras finalizar; finalized_by; actions vía RPC sin update directo ni service_role; advertencia intacta; wizard sin llamar la RPC directamente |
| `npx tsx tests/diagnostic/textiles-scoring.test.ts` | ✅ 18/18 (T2, sin cambios) |
| `npx tsx tests/unit/textiles-module.test.ts` | ✅ 11/11 (check 10 actualizado: migraciones = 0070+0071+0072) |
| `npm run test:smoke` | No ejecutado: requiere entorno staging con BD real (script de despliegue, no de CI local) |

## 8. Validación manual (guion)

1. **Acceso normal**: flag + organización habilitada → responder, guardar,
   finalizar, ver resultados; intentar editar respuestas del finalizado (API) →
   falla por RLS y por trigger.
2. **Manipulación**: con supabase-js y sesión de miembro,
   `update textile_diagnostics set status='completed', maturity_percent=99...`
   → 0 filas (sin política de UPDATE); con `service_role` → excepción del
   trigger de protección. `insert` con `status='completed'` → rechazado por la
   política de INSERT.
3. **Cross-tenant**: leer/actualizar/finalizar un diagnóstico de otra empresa →
   RLS no devuelve filas y la RPC responde "no existe o no pertenece a tu
   organización".
4. **Flag apagado**: `/textiles/diagnostic*` → 404; las tres actions devuelven
   error de módulo no habilitado.

## 9. Riesgos restantes

| Riesgo | Estado |
|---|---|
| Doble implementación del cálculo (dominio TS + RPC SQL) | Asumido y mitigado: comentario espejo en ambos lados, comparación post-finalización con log de divergencia, y los 18 tests de scoring fijan la semántica del dominio. Cualquier cambio futuro del modelo debe tocar ambos (nota añadida al modelo). |
| El flag de entorno no es verificable en BD | La RPC re-verifica la habilitación por organización (BD); el flag lo exige la server action y el guard de rutas. Un usuario de una organización habilitada que llame la RPC con el flag apagado solo lograría una finalización legítima de su propio borrador — sin impacto de integridad. |
| R-22 (admin de empresa puede autohabilitarse el módulo con flag encendido, RLS de organization_modules heredada de CPR) | Sin cambios en este sprint (modificarla es tocar CPR); se resuelve en Plataforma-M1. |
| Validación experta del banco de preguntas (Q-16) | Sigue pendiente antes del piloto. |

## 10. Qué quedó fuera (a propósito)

Reapertura/recalculo de diagnósticos · catálogos, productos, composición,
proveedores, evidencias, circularidad, TrazaDocs Textil, pasaporte · QR,
blockchain, IA, ACV, huella de carbono · planes por módulo,
`organization_module_access`, consola modular avanzada · cambios al banco de
preguntas (no se detectó error crítico).

## 11. Confirmaciones

- ✅ CPR intacto: cero cambios funcionales, cero objetos CPR tocados en 0072
  (verificado por test), regresión de 14 suites en verde.
- ✅ Textil sigue privado: triple control (flag + organización activa +
  habilitación) vigente en rutas y actions, y ahora también en la RPC.
- ✅ No se tocaron planes, TrazaDocs, pasaporte, catálogos ni Plataforma-M1.
- ✅ No se modificaron migraciones anteriores; 0072 es aditiva, sin drops
  destructivos, idempotente donde aplica y comentada campo por campo.
