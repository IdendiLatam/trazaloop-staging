# QUALITY-11 · Inventario de los barridos anteriores (§177)

Antes de escribir nada, se buscó todo lo que ya observaba algo. Son **ocho
funciones**, repartidas entre QUALITY-03 y QUALITY-10. Ninguna se reescribió.

| Mecanismo anterior | Dominio | Dónde vive | Estado nuevo |
|---|---|---|---|
| `quality_scan_pending_measurements` | indicadores | 0119 | **integrado** como observador de plataforma · exige sesión: bajo el planificador se omite con motivo (0130) |
| `work_scan_pending_actions` | acciones | 0121 | **integrado** · exige sesión: igual |
| `quality_scan_risk_reviews` | riesgos | 0122 | **integrado**, contrato intacto |
| `quality_scan_people_signals` | personas | 0124 | **integrado**, contrato intacto |
| `quality_scan_supplier_reviews` | proveedores | 0125 | **integrado**, contrato intacto |
| `quality_scan_customer_voice` | voz del cliente | 0126 | **integrado**, contrato intacto |
| `quality_scan_audits` | auditorías | 0127 | **integrado**, contrato intacto |
| `quality_scan_management_reviews` | revisión por la dirección | 0128 | **integrado**, contrato intacto |

## Qué significa «integrado»

Los ocho se ejecutan **dentro** de `quality_automation_run`, en la misma
ejecución y con el mismo informe, cada uno aislado en su propio bloque de
excepción. Su firma, su comportamiento y su valor de retorno son exactamente los
de antes: las suites de QUALITY-03…10 los siguen dando por buenos sin cambiar
una línea.

Lo que cambia es dónde se disparan. Antes cada pantalla llamaba al suyo; ahora
hay **una sola puerta**, y el informe de ejecución dice qué hizo cada uno.

## Por qué no se reescribieron

Reescribirlos como reglas de QUALITY-11 habría sido rehacer ocho mecanismos que
ya funcionaban y romper el contrato que otras siete suites verifican. §126 y
§127 lo prohíben, y con razón: la migración habría cambiado el comportamiento
observable de cinco dominios en el mismo sprint que introduce la automatización.

## Cómo se evita el duplicado (§128)

Las 14 plantillas cubren condiciones que los ocho barridos **no** cubrían:
periodos consecutivos fuera de meta, tendencia descendente, objetivos sin dato,
conocimiento crítico con un solo titular, deterioro de métrica, ventana de
evaluación de hallazgos, cruce criticidad × reevaluación vencida. Ninguna repite
lo que un barrido ya avisa.

La comprobación es empírica, no una promesa: la prueba B6 lanza **dos barridos
consecutivos sin cambiar nada** y exige que el segundo no añada **ni un aviso** a
la bandeja —ni de las reglas ni de los ocho observadores—.

## El contador, corregido

Algunos barridos heredados devuelven el **total** de la condición y no las filas
nuevas. Contarlos tal cual habría hecho que la ejecución mintiera sobre lo que
creó. El motor mide el **delta real** de avisos alrededor de cada llamada, lo que
respeta el contrato de todos y dice la verdad (§44).

---

# Adenda · QUALITY-11.1 (§40)

El estado final de los dos que quedaban en `SKIPPED UNDER SCHEDULER` ya no es
ese. La tabla de arriba se mantiene como quedó al cerrar QUALITY-11 —es lo que
era cierto entonces— y esta adenda dice lo que es cierto ahora:

| Mecanismo anterior | Dominio | Estado en QUALITY-11 | Estado en QUALITY-11.1 |
|---|---|---|---|
| `quality_scan_pending_measurements` | indicadores | integrado · **omitido bajo el planificador** | **ADAPTED** · corre sin sesión con los mismos permisos cuando la hay, y **cede** ante la regla `indicator_measurement_due` si la empresa la adopta |
| `work_scan_pending_actions` | acciones | integrado · **omitido bajo el planificador** | **ADAPTED** · igual, y cede ante `action_overdue` |
| los otros seis | varios | integrados | **sin cambios** |

## Qué significa ADAPTED aquí

1. **Su lógica de negocio no se tocó.** Las mismas consultas, las mismas claves
   de dedupe, los mismos tipos de aviso y de tarea. Las suites de QUALITY-03 y
   QUALITY-04 pasan sin modificar una línea.

2. **Su guarda de sesión se alineó con la de los otros seis.** Con sesión, los
   mismos permisos de siempre; sin sesión, proceso del sistema. No se usa
   `service_role` para saltarse nada.

3. **Aprendieron a callar.** Si la empresa adopta la regla equivalente de
   QUALITY-11, el barrido heredado devuelve 0 sin emitir. La comprobación vive
   dentro de la función, así que vale igual la llame quien la llame.

**No hay motor duplicado, y ahora tampoco hay condición sin observar.**
