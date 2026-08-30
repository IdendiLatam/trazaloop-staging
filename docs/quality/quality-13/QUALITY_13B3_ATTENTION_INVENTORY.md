# QUALITY-13B3 · INVENTARIO DE OBSERVADORES

`lib/domain/quality-observers.ts` · comprobado contra las migraciones por
`quality13b3-observers`

---

## 1 · Lo que decía la documentación y lo que dice el código

QUALITY-13A habló de **cinco mecanismos de atención** y **diez barridos**. Leer el código
dice otra cosa en cuatro puntos, y los cuatro cambian el plan:

**1 · Un barrido no es un observador: es un montón.** `quality_scan_audits` observa cinco
condiciones distintas; `quality_scan_people_signals`, siete. `supersedes_observer` nombra
el barrido, y la comprobación hacía `return 0` al principio de la función. Relevar «una»
condición apagaba todas las de ese barrido.

**2 · `quality_risk_signals` no la escribe nadie.** Ni una migración, ni una línea de
aplicación. Es una tabla creada en 0122 y nunca conectada. Relevarla —que es lo que 13A
proponía— habría sido relevar el vacío.

**3 · Las otras tres tablas de señal no son observadores.** Son el ALMACÉN donde su
barrido deja lo que vio. El observador es el barrido; el almacén tiene su propio
consumidor y se queda.

**4 · Hay observadores por evento que 13A no contó**: la medición que falla su meta, el
riesgo que se materializa, el control declarado ineficaz, la decisión de tratamiento y
los cinco pasos del flujo documental.

---

## 2 · Los cinco mecanismos, clasificados (§3)

| Mecanismo | Qué es | Autoridad sobre |
|---|---|---|
| `quality_signals` | señal del motor de reglas | **nada**: observa una verdad de otro |
| `quality_risk_signals` | compatibilidad histórica | nada · **sin emisor y sin lector** |
| `quality_supplier_signals` | resultado del barrido de proveedores | nada |
| `quality_customer_signals` | resultado del barrido de voz del cliente | nada |
| `quality_knowledge_signals` | resultado del barrido de personas | nada |
| `work_alerts` / `work_tasks` | **salidas** | nada: se multiplican por destinatario |

**Ninguno es la verdad.** La verdad de «la revisión del riesgo venció» es
`quality_risks.next_review_on`; la de «el indicador no cumplió» es
`quality_measurements.evaluation`. Todo lo demás observa. Por eso resolver una señal no
cambia el estado del sujeto, y por eso el propio motor la resuelve sola cuando la
condición deja de cumplirse.

---

## 3 · Las 33 condiciones observadas

Cada una con su verdad, su disparador, su sujeto y lo que emite. El detalle está en el
módulo; aquí el mapa.

| Mecanismo | Disparador | Condiciones |
|---|---|---|
| `quality_scan_audits` | barrido | 5 · próxima · vencida · informe pendiente · hallazgo sin evaluar · conflicto sin decidir |
| `quality_scan_customer_voice` | barrido | 5 · queja sin revisar · campaña que cierra · pocas respuestas · caída de satisfacción · rotura de comparabilidad |
| `quality_scan_management_reviews` | barrido | 4 · próxima · entradas sin mirar · vencida · acción de la dirección vencida |
| `quality_scan_people_signals` | barrido | 7 · evidencia caducada · conocimiento en una persona · cargo crítico vacante · transferencia vencida · eficacia de formación · actividad de desarrollo · evaluación de desempeño |
| `quality_scan_risk_reviews` | barrido | 1 · revisión de riesgo vencida |
| `quality_scan_supplier_reviews` | barrido | 4 · reevaluación · documento · aprobación caducada · crítico sin aprobación |
| `quality_scan_pending_measurements` | barrido | 1 · medición pendiente **(relevada)** |
| `work_scan_pending_actions` | barrido | 2 · acción vencida **(relevada)** · eficacia por verificar |
| `quality_emit_performance_signals` | evento | 3 · fuera de meta · fuente caída · zona de atención |
| `quality_materialize_risk` | evento | 1 · riesgo materializado |
| `quality_decide_risk_treatment` | evento | 1 · tratamiento por aprobar |
| `quality_review_control` | evento | 1 · control ineficaz |
| `trazadoc_*` | evento | 5 · los pasos del flujo documental |
| `quality_automation_emit` | reglas | paramétrico · lo que cada empresa escriba |

**33 condiciones**, sin contar el motor de reglas, que es paramétrico por definición.

---

## 4 · El vocabulario declarado que nadie emite

El CHECK de `work_alerts` admite **52** tipos de aviso y el de `work_tasks`, **43**. De
esos, **16 avisos** y **22 pendientes** no los escribe ninguna función.

No es basura: es sitio reservado. Pero mientras nadie los emita, una portada que los
cuente contará ceros, y por eso están inventariados aparte y la prueba comprueba que
efectivamente **nadie** los escribe.

---

## 5 · Cómo se comprueba que este inventario no envejece

La suite `quality13b3-observers` no lee este documento: abre las migraciones.

- saca el vocabulario real de los CHECK, en su **última** definición;
- para cada tipo, busca **qué funciones lo escriben**;
- exige que cada observador declare tipos que su mecanismo escribe de verdad;
- exige que lo declarado «sin emisor» no lo escriba nadie;
- y exige que la unión de las dos listas sea **exactamente** el vocabulario, sin
  solapes ni huecos.

Si mañana alguien añade un emisor y no lo inventaría, esto se pone en rojo. Es la
diferencia entre un documento y un contrato.
