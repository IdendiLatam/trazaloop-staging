# QUALITY-12 · Matriz de pruebas

## 1 · Las tres suites

| Suite | Comando | Qué comprueba | Resultado |
|---|---|---|---|
| Puras y estáticas | `npm run test:quality12` | que las seis separaciones existan en el código | **70 conformes, 0 fallos** |
| Contra base real | `npm run test:quality12-rls` | contexto, permisos, citas, historia, anonimato, borradores | **31 conformes, 0 fallos** |
| Barreras | `npm run test:quality12-safety` | que pedirle lo prohibido no cambie nada | **18 conformes, 0 fallos** |

Las dos últimas corren con `--conditions=react-server` y con el cliente de
sesión inyectado: el mismo camino que en producción, con la RLS de un usuario de
verdad y el doble determinístico como proveedor.

## 2 · La suite pura, bloque a bloque

| Bloque | Qué busca |
|---|---|
| A · separaciones | las seis escritas · las once decisiones prohibidas · **QUALITY-11 no llama a la IA y el cron tampoco** |
| B · proveedor | el dominio no habla con nadie concreto · la clave no sale del módulo · la configuración en un sitio · el doble existe |
| C · contexto | se lee con la sesión, **nunca** con `service_role` · no existe `runSql` · once adaptadores registrados con su semántica · presupuesto |
| D · números | la política prohíbe recalcular · los recuentos y las restas están en el código |
| E · citas | se escriben ANTES de preguntar · una cita fuera de rango se descarta · el nivel de evidencia lo pone el servidor · sin contexto no se llama al proveedor |
| F · inyección | el contenido va envuelto y marcado · la política nombra el ataque · la pregunta también es material · nada se pinta como HTML |
| G · permisos | pertenencia, sesión, uso permitido · topes antes de llamar · candado · metadatos ≠ contenido |
| H · barreras | ninguna acción toca tablas de negocio · aceptar no crea nada · las once prohibiciones, una por una |
| I · privacidad | la vista de comentarios sin una sola columna de identidad · personas solo con interruptor · se guarda lo mínimo |
| J · tiempo | el modo se guarda · las fuentes declaran sus límites · el indicador trae mediciones reales |
| K · fallos | las cuatro formas · un fallo no tumba Calidad · hay tiempo máximo real · se registra el coste |
| L · pantalla | hechos/interpretación/sugerencias separados · arrancadores · aviso sobrio · estados vacíos · botón en siete entidades |
| M · papeles | tres claves · el borrador se imprime como borrador · el reporte no lleva texto ajeno |
| N · esquema | RLS en seis tablas · solo lectura · historia inmutable · `search_path` · **sin base vectorial** · la 0132 es la última |
| O · dominio | catálogos cerrados · el texto se neutraliza |

## 3 · La suite contra base real

| Bloque | Escenario |
|---|---|
| A | con el Copilot apagado no se abre ni una ejecución · nace con los usos sensibles apagados |
| B | empresa vacía → «no encontré información suficiente», 0 fuentes |
| C | con datos → hechos con fuentes reales · citas guardadas con enlace interno · **el recuento lo hace el código** |
| D | pregunta por 2027 → devuelve el 82 de 2027, no el 90 de hoy · se guarda el modo temporal · las fuentes declaran sus límites |
| E | el contexto de A no trae nada de B · pedir el UUID de otra empresa no lo trae · la ajena no puede preguntar por A · personas exige interruptor |
| F | campaña anónima real → comentarios sin identidad · recuento calculado · **el comentario con órdenes no se obedece** · con el interruptor apagado no se leen |
| G | guardar borrador no crea nada · aceptar tampoco · el registro que sale es de la persona · descartar no cambia nada |
| H | proveedor caído · tiempo agotado · respuesta inválida no se guarda · el tope bloquea antes de llamar |
| I | la ajena no ve nada · quien administra ve consumo pero no texto ajeno · nadie escribe a mano · el anónimo no alcanza nada |

## 4 · La suite de barreras (§136)

Quince peticiones prohibidas. El patrón es siempre el mismo: **foto del sistema
de gestión → petición → foto**. Si algo cambió, falla.

Las quince están en `QUALITY_12_AI_SAFETY.md` §2.

## 5 · Los defectos que encontraron las pruebas

| # | Defecto | Cómo apareció |
|---|---|---|
| 1 | la vista `v_quality_campaign_comments` no existía: el adaptador de comentarios habría fallado en silencio | al escribir el adaptador y comprobar la vista |
| 2 | `v_quality_risk_overview` no tiene `risk_id` ni `current_level_label`: el adaptador de riesgos habría devuelto columnas vacías | verificación de columnas contra la base real |
| 3 | dos funciones con nombre `useCase*` que la regla de hooks de React trataba como hooks | `npm run lint` |
| 4 | la suite de QUALITY-10 prohibía la palabra «copilot» en sus pantallas, y el botón contextual la introducía | `test:all` |

## 6 · Regresiones

```
npm run test:all → EXIT 0
```

Las suites contra base real, en local, después de QUALITY-12:

```
quality11-rls   68 ✔     quality111-rls  42 ✔     quality12-rls  31 ✔
quality12-safety 18 ✔    quality10-rls   61 ✔     quality08-rls  60 ✔
```

## 7 · Lo que estas pruebas NO demuestran

**Que un modelo real responda bien.** No hay credencial de proveedor en este
entorno (GAP-01), así que todo corre con el doble determinístico. Lo que las
pruebas demuestran es que la arquitectura que rodea al modelo hace su trabajo:
qué contexto recibe, qué puede citar, qué no puede tocar y qué queda registrado.

La calidad de la redacción de un modelo real es, precisamente, lo único que
falta por comprobar.
