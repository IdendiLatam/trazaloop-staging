# QUALITY-12 · Matriz de capacidades por dominio (§169)

**Leer · Resumir · Analizar · Sugerir · Redactar borrador · Escribir formalmente**

`ESCRITURA FORMAL` es **NO** en todos los dominios, sin excepción. Lo que
existe es una transición explícita: la persona acepta un borrador y crea el
registro con el comando de su dominio. Eso no es una escritura autónoma de la
IA; es una persona usando una idea.

| Dominio | Leer | Resumir | Analizar | Sugerir | Borrador | Escritura formal |
|---|---|---|---|---|---|---|
| Procesos | ✔ | ✔ | ✔ | ✔ | ✔ | **NO** |
| Documentos | ✔¹ | ✔¹ | ✔¹ | ✔¹ | ✔¹ | **NO** |
| Objetivos | ✔¹ | ✔¹ | ✔¹ | — | — | **NO** |
| Indicadores | ✔ | ✔ | ✔ | ✔ | — | **NO** |
| Casos / NC | ✔ | ✔ | ✔ | ✔ | ✔ | **NO** |
| Acciones | ✔ | ✔ | ✔ | ✔ | ✔ | **NO** |
| Riesgos | ✔ | ✔ | ✔ | ✔ | ✔ | **NO** |
| Controles | ✔¹ | ✔¹ | — | — | — | **NO** |
| Personas | ✔² | ✔² | ✔² | ✔² | — | **NO** |
| Conocimiento | ✔¹ | ✔¹ | — | — | — | **NO** |
| Proveedores | ✔ | ✔ | ✔ | ✔ | — | **NO** |
| Voz del cliente | ✔³ | ✔³ | ✔³ | ✔³ | ✔³ | **NO** |
| Auditorías | ✔ | ✔ | ✔ | ✔ | ✔ | **NO** |
| Revisión por la dirección | ✔ | ✔ | ✔ | ✔ | ✔ | **NO** |
| Señales (QUALITY-11) | ✔ | ✔ | ✔ | ✔ | — | **NO** |
| Automatización (reglas) | ✔¹ | ✔¹ | — | — | — | **NO** |
| Tareas | ✔ | ✔ | — | — | — | **NO** |

¹ declarado en el catálogo, adaptador no implementado en esta entrega (GAP-02)
² solo con `allow_people` encendido, y solo brechas ya calculadas por cargo
³ solo con `allow_customer` encendido, y siempre sin identidad

## Lo que «NO» significa, dominio a dominio

| Dominio | Lo que la IA nunca hace |
|---|---|
| Documentos | publicar una revisión · aprobar un documento · inventar un requisito de norma |
| Indicadores | recalcular la fórmula · fijar o cambiar una meta · declarar una evaluación |
| Casos / NC | declarar la no conformidad · afirmar la causa raíz · cerrar el caso |
| Acciones | crear la acción · cerrarla · declararla eficaz · prorrogarla |
| Riesgos | crear el riesgo · fijar su valoración · aceptar el residual |
| Personas | evaluar · calificar · ordenar · declarar competencia · recomendar despedir, sancionar o ascender |
| Proveedores | aprobar · rechazar · suspender · cambiar la decisión de un alcance |
| Voz del cliente | identificar a un respondente · atribuir un comentario · inventar un porcentaje |
| Auditorías | levantar un hallazgo · concluir la auditoría · afirmar conformidad con una norma |
| Revisión | emitir conclusiones · aprobar el acta · registrar decisiones · cerrarla |
| Señales | cambiar la regla · reabrir o resolver la señal · alterar su explicación |

## Y una fila más, la que importa

| | Puede |
|---|---|
| **La persona** | todo lo anterior, con su nombre encima y en el módulo que corresponde |
