# QUALITY-05 · Matriz de pruebas

| Suite | Comando | Qué prueba | Resultado |
|---|---|---|---|
| Pura y estática | `npm run test:quality05` | Que las separaciones existan en el CÓDIGO, no solo en la prosa | **56 ✔ · 0 ✘** |
| Base real | `npm run test:quality05-rls` | Las afirmaciones de RO que solo se demuestran ejecutándolas | **74 ✔ · 0 ✘** (local **y** Staging) |
| Regresión completa | `npm run test:all` | Los 14 dominios anteriores | **salida real 0** |

## Suite pura — 56 comprobaciones

| § | Qué defiende |
|---|---|
| **A · Las separaciones que RO exige** (8) | riesgo≠NC · materializado≠NC · control≠acción · causa≠evento≠consecuencia · inherente≠residual · nivel≠estado · metodología≠evaluación · oportunidad≠acción de mejora |
| **B · La metodología no está cableada** (5) | no hay matriz 5×5 en el código · las dimensiones salen de la versión · una sola función deriva · admite ≠2 dimensiones · la agregación es declarada |
| **C · Historical Truth** (6) | versión publicada congelada · sus escalas también (incluido INSERT) · evaluaciones inmutables · materialización protege el hecho y admite enlazar su caso · tratamiento append-only · la explicación se conserva |
| **D · No se duplican motores** (6) | no hay risk_tasks/alerts/actions/files · el ensanche no pierde ningún valor anterior · work_references sigue cerrado y validado · la acción de riesgo usa la misma acción de servidor · la bandeja conoce los asuntos nuevos · el barrido es idempotente |
| **E · Autorización y ciclo de vida** (7) | ningún rol inventado · las 12 RPC comprueban sesión, rol, definer y search_path · las tablas de historia no admiten DML · RLS en todas · el dictamen es uno · enmascara antes de contar · una versión usada no se borra |
| **F · Vocabulario** (5) | toda etiqueta en español · estrategias y decisiones explicadas · inherente/residual sin jerga · el aviso de «no hay NC» es del dominio · glosario: «empresa», no «organización» |
| **G · Derivación explicada** (5) | la explicación nombra factores, regla y resultado · sin datos no se inventa · el apetito sale del nivel · aceptar sobre el criterio exige aprobación · la periodicidad sale de la metodología |
| **H · Fechas y estados** (6) | días hasta la revisión · vencida se dice con esas palabras · concordancia singular/plural · abierto por estado · una versión solo evalúa si está publicada · eficaz es solo lo declarado eficaz |
| **I · La migración no rompe nada** (5) | aditiva · no borra datos · toda relación valida la misma empresa · códigos reservados · la numeración cuenta sobre la reserva |
| **J · Fuera de alcance** (3) | no se abre auditorías/proveedores/VoC/revisión por la dirección · no hay IA ni predictivo · no depende de PCR ni Textiles |

## Suite contra base real — 74 comprobaciones

| § | Qué demuestra | Nº |
|---|---|---|
| **A · La metodología manda** | no se evalúa con un borrador · publicar exige estar completa · un consultor no publica · publicada se congela · sus escalas también, ni añadiendo un nivel | 6 |
| **B · Derivación determinística** | N:M con procesos sin duplicar el riesgo · deriva y guarda la explicación · factores atados a la versión · falta una dimensión → rechazo · valor de otra metodología → rechazo · no se puede insertar a mano · no se puede alterar el puntaje · la revisión sale del nivel | 8 |
| **C · Control ≠ acción** | residual sin controles → rechazo · tres veredictos independientes · la evaluación del control es inmutable · un control ineficaz avisa una sola vez · la residual conserva qué controles y en qué estado · inherente 25 y residual 15 conviven · un control que sustenta una residual no se borra | 7 |
| **D · Reevaluar no reescribe** | dos residuales conviven (3 y 15) · la proyección muestra la última con 3 filas detrás · **un residual PEOR se acepta y se conserva** | 3 |
| **E · Tratamiento** | no se trata lo no evaluado · un consultor no decide · aceptar sobre el criterio queda pendiente · genera la tarea · el proponente no puede aprobar · un consultor tampoco · otro con autoridad sí, y cierra la tarea · cambiar de estrategia sucede el plan · el fundamento no se reescribe | 9 |
| **F · Materialización** | **no crea NC ni caso** · deja hecho, alerta y petición de reevaluar · el hecho es inmutable · el caso se abre explícitamente y referencia sin duplicar · **sigue sin haber NC** · no se abre dos veces | 6 |
| **G · Cambiar la metodología** | se publica una v2 más dura · la v1 queda sustituida, no borrada · **la evaluación de ayer sigue explicándose con la v1** · una versión usada no se borra | 4 |
| **H · Oportunidad** | no se prioriza con la metodología de riesgos · ni al revés · con la suya sí · no se decide sin priorizar · catálogo propio · decidir no la convierte en acción · la acción nace aparte y la referencia · el beneficio solo se mide tras implementar | 8 |
| **I · Revisión, cierre, reapertura** | el barrido es idempotente (1ª crea, 2ª no) · la vista marca vencida · revisar no toca evaluaciones · cerrar exige motivo y cancela lo pendiente · cerrado no admite evaluaciones · reabrir conserva el cierre | 6 |
| **J · Ciclo de vida** | borrador desechable · su número no vuelve a circulación · evaluado NO se borra ni por quien puede · el dictamen habla en español sin códigos | 4 |
| **K · Aislamiento entre empresas** | 9 comprobaciones, incluidos los ataques directos de §57 | 9 |
| **L · QUALITY-04 sigue igual** | caso normal · acción de caso · la sesión no escribe tareas a mano · el barrido transversal responde | 4 |

## Regresión (§90)

`npm run test:all` encadena 95 suites y termina con **salida real 0**. Se
comprobaron además, contra base real y tras aplicar 0122: QUALITY-01, 01.2, 02,
03, 03.1, 03.1a y 04 — todas verdes.

## Lo que las pruebas encontraron y el ojo no

| Defecto | Lo detectó |
|---|---|
| Las vistas se saltaban la RLS (`security_invoker`) | K1, contra base real |
| Tareas y alertas sin destinatario (columna NOT NULL) | E3, F1, C4 |
| Un disparador compartido resolvía una columna inexistente | humo SQL del motor |
| La materialización no podía enlazar su caso | F4 |
| Reutilización de variable en `quality_assess_risk` | lectura del código antes de aplicarlo |

Los defectos de **copia** —«Tiene 2 tiene 2 evaluaciones», «(active)»,
«Este oportunidad», «prioritization:Alta», la matriz marcando dos celdas, el
aviso contradiciendo al desplegable, el botón de aprobar ofrecido al proponente—
solo aparecieron **en el navegador**. Ninguna prueba los habría visto.
