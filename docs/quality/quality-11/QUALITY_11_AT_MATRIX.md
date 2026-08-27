# QUALITY-11 · Matriz AT-01…AT-45 (§178)

Cada línea dice qué se implementó y **dónde se comprueba**. Ninguna dice PASS
porque exista una tabla.

| AT | Qué exige | Estado | Evidencia |
|---|---|---|---|
| AT-01 | automatización determinística, sin IA | **IMPLEMENTED** | 14 operadores en SQL puro · prueba Q1: ni librería, ni llamada, ni red |
| AT-02 | evento ≠ estado actual | **IMPLEMENTED** | `work_events` append-only · 5 tipos nuevos en pasado · prueba E1 |
| AT-03 | evento de negocio inmutable | **IMPLEMENTED** | disparador de 0118 impide UPDATE/DELETE · no se tocó |
| AT-04 | observación ≠ señal | **IMPLEMENTED** | el proveedor de sujetos no escribe · prueba E2 |
| AT-05 | catálogo tipado de fuentes | **IMPLEMENTED** | 18 fuentes · 70 campos · sin tabla ni columna · pruebas A1–A4 |
| AT-06 | niveles de autonomía A–D | **IMPLEMENTED** | restricción en la tabla · ninguno decide · pruebas E6, K5 |
| AT-07 | regla con identidad estable | **IMPLEMENTED** | `quality_automation_rules` sin condiciones · prueba B1 |
| AT-08 | versionado del contenido | **IMPLEMENTED** | versión congelada al publicar · disparador · prueba B2 |
| AT-09 | publicada ≠ activa · vigencia | **IMPLEMENTED** | ventana de vigencia · el motor la respeta · pruebas C1–C3 |
| AT-10 | validación cerrada de la regla | **IMPLEMENTED** | campo, operador, forma del valor, salidas · pruebas B3, B4, R4, R5 |
| AT-11 | catálogo cerrado de salidas | **IMPLEMENTED** | tres · la señal primera · pruebas K3, P1 |
| AT-12 | destinatario estructural por cargo | **IMPLEMENTED** | tres formas · resuelto el día de ejecución · pruebas M8, M9, B5 |
| AT-13 | señal explicable | **IMPLEMENTED** | regla, versión, sujeto, condición, valor, fecha · pruebas F1–F3, B4 |
| AT-14 | no declara no conformidad | **IMPLEMENTED** | escenario 6: NC = 0 · prueba K1 |
| AT-15 | no aprueba proveedores | **IMPLEMENTED** | escenario 4: aprobación intacta · prueba K1 |
| AT-16 | no declara competencia | **IMPLEMENTED** | escenario 5: nivel y estado intactos · prueba K1 |
| AT-17 | no cierra auditoría ni revisión | **IMPLEMENTED** | escenarios 7 y 8 · prueba K1 |
| AT-18 | no cierra acciones ni acepta riesgos | **IMPLEMENTED** | prueba K1 · el motor no escribe en `work_actions` |
| AT-19 | simulación sin efectos | **IMPLEMENTED** | mismo evaluador · restricción en la tabla · pruebas H1–H4, E1–E3 |
| AT-20 | señal idempotente | **IMPLEMENTED** | índice único parcial · `on conflict` · pruebas G1, G2, B6 |
| AT-21 | alerta y tarea idempotentes | **IMPLEMENTED** | clave por señal y perfil · prueba G5 |
| AT-22 | dedupe bajo concurrencia | **IMPLEMENTED** | escenario 11: dos barridos simultáneos, una señal |
| AT-23 | rearme tras resolución | **IMPLEMENTED** | predicado parcial · escenario 3 |
| AT-24 | reintento exacto | **IMPLEMENTED** | escenario 12: 0 señales nuevas, la tarea que faltaba una vez |
| AT-25 | reloj del servidor · día de negocio local | **IMPLEMENTED** | `business_timezone` · pruebas I1–I3 |
| AT-26 | un solo motor: manual, programado, simulado | **IMPLEMENTED** | una función · pruebas T1, T5, V1 |
| AT-27 | barrido acotado | **IMPLEMENTED** | `p_limit` en las 18 ramas · prueba T6 · rendimiento medido |
| AT-28 | fallo aislado | **IMPLEMENTED** | bloque por regla y por observador · pruebas L3, W1 |
| AT-29 | salud del motor visible | **IMPLEMENTED** | `quality_automation_health` · pruebas S6, W2 |
| AT-30 | avería ≠ hallazgo de calidad | **IMPLEMENTED** | contadores separados · tipo de alerta propio · prueba W2 |
| AT-31 | sin motores duplicados | **IMPLEMENTED** | los 8 barridos integrados con contrato intacto · pruebas L1, L2, L6 |
| AT-32 | reutiliza tareas, alertas y bitácora | **IMPLEMENTED** | `work_tasks` · `work_alerts` · `work_events` · prueba L6 |
| AT-33 | cobertura de los diez dominios | **IMPLEMENTED** | 18 fuentes · `QUALITY_11_DOMAIN_COVERAGE.md` |
| AT-34 | regla que cruza dominios | **IMPLEMENTED** | criticidad × reevaluación vencida · escenario 4 |
| AT-35 | biblioteca de reglas seguras | **IMPLEMENTED** | 14 plantillas · ninguna activa · pruebas L4, L5, A4 |
| AT-36 | RLS por empresa | **IMPLEMENTED** | 7 tablas · pruebas M2–M5, Q1–Q5 |
| AT-37 | `security definer` con `search_path` | **IMPLEMENTED** | prueba M1 · 24 funciones |
| AT-38 | sin SQL arbitrario | **IMPLEMENTED** | sin SQL dinámico en sujetos ni evaluador · pruebas A6, A7 |
| AT-39 | fallo cerrado ante datos raros | **IMPLEMENTED** | `exception when others` → no coincide · pruebas D2, D3, R6 |
| AT-40 | ataques cerrados | **IMPLEMENTED** | los once de §152 · bloque R |
| AT-41 | ciclo de vida y borrado | **IMPLEMENTED** | veredicto propio · historia inmutable · pruebas O1–O5, U1–U3 |
| AT-42 | interfaz explicable | **IMPLEMENTED** | vista previa determinística · explicación línea a línea · bloque S |
| AT-43 | señales consolidadas en el inicio | **IMPLEMENTED** | tarjeta «Requieren atención» · prueba S5 |
| AT-44 | contrato de exportación | **IMPLEMENTED** | 6 claves · `Q11_EXPORT_PENDING = 0` · bloque R |
| AT-45 | privacidad y anonimato | **IMPLEMENTED** | agregados · sin vigilancia · retrato mínimo · bloque N + escenario 15 |

**45 IMPLEMENTED · 0 PARTIAL · 0 DEFERRED · 0 NOT_APPLICABLE.**

La única limitación conocida no corresponde a ningún AT: es GAP-01 del informe
—dos barridos heredados que exigen sesión y por tanto no corren bajo el
planificador—, y viene de QUALITY-03 y QUALITY-04, no de esta capa.
