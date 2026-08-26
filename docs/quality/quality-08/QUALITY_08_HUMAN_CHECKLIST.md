# QUALITY-08 · Guion de prueba humana

Veinticuatro pasos. Cada uno dice **qué mirar**, que es lo que distingue una
prueba de un paseo.

---

**1. Crear un cliente reutilizando una empresa que ya existe.**
Quality → Voz del cliente → Clientes. Si ACME ya es proveedor, aparece en
«Empresas que ya están registradas». Dale el papel de cliente.
→ *Mira:* la ficha dice «También proveedor». Es **una** identidad, no dos.

**2. Crear una encuesta.**
Encuestas → nombre y propósito.
→ *Mira:* nace con su v1 en borrador.

**3. Publicar la v1.**
Añade dos preguntas —una escala 0–10 con clave estable `sat.global`, un texto
largo— y publícala.
→ *Mira:* el aviso de que a partir de ahí no se reescribe.

**4. Crear una campaña identificada.**
Campañas → elige la v1, modo **Identificada**, declara a cuántos vas a
preguntar. Ábrela.
→ *Mira:* el aviso de que el modo queda fijado al abrirla.

**5. Responder identificadamente.**
Emite un enlace para el cliente, cópialo y ábrelo en otra ventana.
→ *Mira:* arriba dice **«quedará asociada a tu empresa»**, antes de la primera
pregunta. Responde y envía.

**6. Crear una campaña anónima.**
Otra campaña sobre la misma versión, modo **Anónima**. Ábrela.

**7. Responder anónimamente.**
Emite un enlace, ábrelo, responde.
→ *Mira:* dice **«el sistema no guarda quién la envió»**. Después de enviar, lo
repite.

**8. Confirmar que NO puede saberse quién respondió.**
Vuelve a la campaña anónima.
→ *Mira:* la tabla de respuestas **no tiene columna de cliente ni de persona**.
La de invitaciones dice a quién invitaste y que el enlace se usó, pero **no cuál
respuesta produjo**. No hay forma de cruzarlas.

**9. Publicar la v2 y comprobar que la v1 sigue intacta.**
Crea una versión nueva, cambia la escala a 1–5, publícala.
→ *Mira:* la v1 queda «Sustituida», con fin de vigencia, y **conserva sus
preguntas**. Descarga su PDF: sigue diciendo 0–10.

**10. Ver los resultados.**
Cierra la campaña identificada y pulsa «Calcular».
→ *Mira:* el mensaje dice el resultado **y** que no abre casos, no clasifica no
conformidades y no crea riesgos.

**11. Ver una campaña sin respuestas.**
Crea una campaña, ciérrala sin responder, calcula.
→ *Mira:* dice **«Sin respuestas»**, no «0». Y si no declaraste población, la
tasa dice **«Sin denominador»**, no «0 %».

**12. Registrar retroalimentación a mano.**
Retroalimentación → una felicitación de un cliente, por teléfono.
→ *Mira:* no hizo falta ninguna encuesta.

**13. Registrar una queja.**
Otro registro, tipo **Queja**, con gravedad alta.
→ *Mira:* el mensaje dice **«NO es una no conformidad y no ha abierto ningún
caso»**.

**14. Confirmar que las no conformidades siguen igual.**
Ve a Casos y cuenta las clasificadas como no conformidad.
→ *Mira:* el mismo número que antes de registrar la queja.

**15. Crear el caso explícitamente.**
Vuelve a la queja y pulsa «Crear caso».
→ *Mira:* el caso existe, es de tipo «queja» y su clasificación está
**pendiente**.

**16. Confirmar que las NC siguen igual.**
→ *Mira:* el mismo número. Sube cuando **tú** clasifiques el caso en su ficha,
no antes.

**17. Provocar una señal.**
Voz del cliente → Resumen → «Revisar ahora». (Una queja de hace más de una
semana sin revisar la dispara.)
→ *Mira:* aparece la señal, con el aviso de que no decide nada.

**18. Confirmar que no se creó ningún riesgo.**
Ve a Riesgos.
→ *Mira:* el mismo número que antes.

**19. Revisar la tendencia.**
Resumen → «Cómo evoluciona».
→ *Mira:* si mediste con 0–10 y después con 1–5, la serie **se corta** y explica
por qué. No hay una línea continua.

**20. Revisar la ficha del cliente.**
Clientes → ACME.
→ *Mira:* su queja, su felicitación y sus respuestas **identificadas**.

**21. Confirmar que lo anónimo NO se le atribuye.**
En esa misma ficha, cuenta las respuestas.
→ *Mira:* la respuesta anónima del paso 7 **no está**, aunque invitaste a ese
mismo cliente. Ese es el punto.

**22. Descargar los PDF.**
La ficha del cliente, la versión de encuesta, el informe de la campaña anónima y
la queja.
→ *Mira:* el informe anónimo no lleva ninguna identidad. La queja se llama
**«Queja o reclamo de cliente»**, nunca «no conformidad».

**23. Probar los permisos con una segunda empresa.**
Entra con una cuenta de otra empresa.
→ *Mira:* no ve ni un cliente, ni una encuesta, ni una respuesta. Y con una
cuenta **consultora** de la primera: puede registrar y evaluar, pero **no puede
cerrar el periodo** de satisfacción.

**24. Probar un enlace usado y una campaña cerrada.**
Abre el enlace del paso 7 otra vez. Y emite uno nuevo, cierra la campaña, y
ábrelo.
→ *Mira:* los dos dicen exactamente lo mismo —«Este enlace no está
disponible»— y ninguno revela de qué empresa era.
