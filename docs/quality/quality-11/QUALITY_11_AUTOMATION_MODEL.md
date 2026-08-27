# QUALITY-11 · El modelo de automatización

## 1 · Las siete separaciones

Toda la capa se sostiene sobre siete distinciones. Ninguna es filosofía: cada
una está comprobada por una prueba que busca la escritura concreta que la
rompería.

| Separación | Qué significa | Dónde se comprueba |
|---|---|---|
| **EVENTO ≠ OBSERVACIÓN** | un evento es algo que ocurrió y quedó escrito; observar es mirar el estado de hoy | E1 · la migración no crea bitácora propia |
| **OBSERVACIÓN ≠ SEÑAL** | mirar es gratis y no deja rastro; la señal es la afirmación de que algo merece atención | E2 · el proveedor de sujetos no escribe |
| **SEÑAL ≠ ALERTA** | la señal es el hecho; la alerta es que alguien se entere | E3 · la alerta depende de una salida declarada |
| **ALERTA ≠ TAREA** | enterarse no es tener trabajo asignado | E4 · se cuentan por separado |
| **TAREA ≠ ACCIÓN** | una tarea es «mira esto»; una acción correctiva la abre una persona | E5 · el motor no escribe en `work_actions` |
| **CONDICIÓN ≠ DECISIÓN** | que se cumpla una condición no declara nada | E6 · ningún nivel de autonomía decide |
| **AUTOMATIZACIÓN ≠ IA** | catorce operadores deterministas, cero modelos | Q1 · ni una llamada, ni una librería |

## 2 · La cadena, entera

```
OBSERVAR       quality_automation_subjects(empresa, fuente, día)
   ↓             una consulta por fuente · los hechos en jsonb
DETECTAR       quality_automation_evaluate(hechos, condiciones, día)
   ↓             AND entre condiciones · catorce operadores · falla cerrada
EXPLICAR         cada condición devuelve su frase con el valor observado
   ↓
EMITIR SEÑAL   quality_signals · on conflict (empresa, clave) where abierta
   ↓             idempotente por índice, no por «mirar antes de insertar»
ALERTAR        work_alerts · clave auto_alert:<señal>:<perfil>
   ↓
CREAR TAREA    work_tasks · clave auto_task:<señal>:<perfil>
   ↓
SEGUIMIENTO    la señal se reconoce, se resuelve o se silencia · y se REARMA
```

## 3 · Los cuatro niveles de autonomía (AT-06)

| Nivel | Qué declara |
|---|---|
| **A** | observar y avisar · seguro y automático |
| **B** | automático y reversible |
| **C** | prepara el trabajo, lo revisa una persona |
| **D** | la decisión es humana y obligatoria |

**Ningún nivel decide.** El nivel no cambia lo que el motor escribe: las 14
plantillas son de nivel A y el motor emite exactamente las mismas tres cosas en
todos los niveles. C y D existen para que una regla pueda **declarar** que lo
suyo lo decide una persona, no para que el motor lo decida por ella. La prueba
K5 comprueba que el nivel de autonomía no aparece en la rama de escritura.

## 4 · Las nueve cosas que la automatización NO hace (§19)

Ninguna de estas escrituras existe en el motor **ni en el resto de la
migración** — se buscan como patrones de `update`/`insert` reales, no como
promesas en un comentario:

1. declarar una no conformidad
2. aprobar o rechazar un proveedor
3. declarar competente a una persona
4. cerrar una acción como eficaz
5. aceptar un riesgo residual
6. cerrar una auditoría
7. cerrar la revisión por la dirección
8. suspender un proveedor
9. emitir una conclusión de dirección

Y está comprobado ejecutándolo, no solo leyéndolo: en los escenarios 4, 5, 6, 7
y 8 se guarda el estado del proveedor, de la competencia, del caso, de la
auditoría y de la revisión **antes** del barrido y se compara **después**.

## 5 · Las tres salidas posibles

`CREATE_SIGNAL` · `CREATE_ALERT` · `CREATE_TASK`. La primera es obligatoria y va
siempre primera: la alerta y la tarea la referencian. Cualquier otra —correo
arbitrario, HTTP, no conformidad, cambio de estado— se rechaza en la validación
y la regla no llega a publicarse.

## 6 · El destinatario es estructural

`rule_owner_position` · `subject_owner_position` · `specific_position`. Nunca un
correo, nunca un `user_id`. Se resuelve en el momento de ejecutar con quien
ocupa el cargo **ese día**; si lo ocupan varias personas se avisa a todas; si no
lo ocupa nadie con cuenta, la señal existe igual y lo dice
(`recipient_unresolved`).
