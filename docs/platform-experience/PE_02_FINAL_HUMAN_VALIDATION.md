# PE-02 · Lo que hay que mirar con los ojos

Todo lo técnico está comprobado y en verde. Lo que queda son seis cosas que
ninguna prueba puede juzgar: si se lee bien, si convence, y si se encuentra.

**Calcula veinte minutos.** En el Preview, y la mayor parte sin sesión.

> No hace falta repetir nada de permisos, historia ni aislamiento. Eso está
> cubierto por 200 comprobaciones automáticas contra la base real.

---

## 1 · La política de privacidad · `/privacy`

Sin sesión. Es lo primero porque es lo que más cuesta deshacer si algo chirría.

- ¿Se **lee**? Hasta hoy este documento se habría mostrado con los `##` y las
  tuberías de las tablas a la vista. Ahora tiene encabezados, seis tablas y
  listas de verdad.
- ¿Las tablas se ven bien **en el teléfono**? Deben desplazarse ellas solas, sin
  arrastrar la página.
- ¿Dice **v1.1** arriba?
- Lee despacio la **sección 18** —Trazaloop Intelligence, en tres capas— y la
  **19**, sobre lo que una empresa decide publicar.
- ¿Notas algo que sobre o que falte?

---

## 2 · La pantalla de aceptar · `/legal/accept`

Entra con una cuenta de QA que ya existiera. Debería pedirte aceptar de nuevo:
la política cambió.

- ¿El texto de la pantalla explica **por qué** te lo vuelve a pedir?
- ¿Puedes **leer** la política antes de aceptar?
- Acepta. ¿Entras con normalidad, o te vuelve a pedir lo mismo?

*(Lo último está probado automáticamente, pero es el fallo más caro de todos y
conviene verlo una vez.)*

---

## 3 · La categoría de seguridad · `/faq`

Sin sesión.

- ¿Aparece **Seguridad y privacidad** entre los temas?
- Ábrela. ¿Las preguntas están en un orden que tiene sentido?
- ¿Las destacadas son las que tú destacarías?

---

## 4 · La respuesta bandera

`/faq/seguridad_como_protege` — «¿Cómo protege Trazaloop la información de mi
empresa?»

**La pregunta que importa: ¿se la enviarías a un cliente que pregunta por
seguridad?**

Fíjate en el último párrafo: reconoce que ninguna medida elimina el riesgo y que
no tenemos certificaciones propias. Es deliberado — es lo que hace creíbles las
ocho capas anteriores. ¿Te parece que suma o que resta?

---

## 5 · Las dos respuestas de IA

- **«¿Mis datos se utilizan para entrenar modelos?»** — dice **no**, y separa lo
  que dice la política del proveedor de lo que decidimos nosotros. ¿Se lee clara
  esa distinción? Es lo que la hace creíble.
- **«¿Cuánto tiempo puede conservar el proveedor la información?»** — dice hasta
  30 días y **admite que no tenemos retención cero contratada**. ¿Te parece que
  admitirlo resta? Nuestra posición es que suma: quien pregunta esto sabe que la
  retención cero existe, y callarlo sería lo que resta.

Ninguna de las dos nombra al proveedor. **Si quieres que se nombre, dilo** — es
una decisión de negocio, no técnica.

---

## 6 · «Ayuda», con sesión

Recorre unas cuantas pantallas: la puerta, Quality, PCR, tu perfil.

- ¿Está siempre en el **mismo sitio**?
- ¿Te parece bien que dentro se llame **«Ayuda»** y fuera **«Preguntas
  frecuentes»**? Dentro va a crecer con el tutorial de pantalla y el soporte;
  fuera es como se busca desde fuera.
- Entra en Quality → Contexto → Partes interesadas y pulsa un botón **«i»**.
  ¿El texto ayuda de verdad?

---

## Lo que hay que devolver

Por cada punto: **bien** / **cambiar** / **hablarlo**.

Y tres decisiones que no bloquean nada pero están esperando:

```
[ ] ¿Se nombra al proveedor de IA (OpenAI) en el texto público?

[ ] ¿Se corrige el paquete jurídico v1.0? Menciona a Resend, que no tiene
    integración, y cuatro de sus seis documentos no mencionan Intelligence.

[ ] Buscar «inteligencia artificial» no encuentra la respuesta sobre datos de
    otras empresas, porque su texto dice «IA». ¿Se añade la palabra?
```

---

## Antes de Producción, y esto sí bloquea

**Falta la revisión de un abogado.** Nada de lo hecho es aprobación legal: las
pruebas verifican que lo que el documento afirma coincide con lo que la
plataforma hace, que es otra cosa.

Lo concreto que hay que mirar está en
[`PE_02_FINAL_CLOSURE.md`](PE_02_FINAL_CLOSURE.md).

Y llevar esto a Producción es un trabajo aparte: Producción está en la migración
0111, sin Quality, sin Intelligence y sin las tablas de la FAQ. Empieza por
aplicar 47 migraciones, y no es parte de este cierre.
