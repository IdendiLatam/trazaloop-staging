# PE-02B4 · Validación humana

Lo automatizado está en verde: 89 comprobaciones nuevas, incluidas las de
permisos, historia y rendimiento. **No hace falta repetir nada de eso.**

Cinco preguntas.

---

## 1 · ¿Está «Ayuda» donde la buscas?

Entra a Trazaloop y recorre unas cuantas pantallas: la puerta de módulos,
Quality, PCR, Textiles, tu perfil, el equipo.

**Qué debería pasar:** «Ayuda» está en la barra superior, siempre en el mismo
sitio, sin estorbar el trabajo.

**Qué mirar:** si en algún momento desaparece. Era el problema de B3 y es lo
primero que se arregló.

**Sería un fallo:** que tengas que buscarla, o que compita visualmente con lo que
estabas haciendo.

---

## 2 · ¿Vuelve siempre a la ayuda?

Púlsala desde tres pantallas distintas.

**Qué debería pasar:** siempre llegas a las preguntas frecuentes.

**Qué mirar:** si el nombre «Ayuda» te parece el correcto. Se eligió así, y no
«FAQ», porque más adelante llevará también al tutorial de la pantalla y al
soporte — y renombrarlo entonces sería mover algo que ya sabrías dónde está.

---

## 3 · ¿El botón «i» explica sin abrumar?

Ve a **Quality → Contexto → Partes interesadas** y pulsa alguno de los «i»
—los hay junto al título, en la valoración, en los requisitos, en las estrategias,
en las revisiones y en la historia—.

**Qué debería pasar:** tres bloques cortos.

```
QUÉ ES     la explicación
EJEMPLO    un caso concreto
RESPALDO   la referencia normativa
```

**Qué mirar:** si se lee de un vistazo o si pesa. Si algún bloque sobra. Si el
respaldo te parece útil o ruido.

**Pregunta honesta:** ¿te ayuda a decidir, o solo te informa?

**Un detalle a propósito:** algunos «i» tienen solo dos bloques, y otros uno. No
falta nada — es que no todos tenían ejemplo o respaldo, y no se inventó ninguno
para rellenar.

---

## 4 · ¿Parece de Trazaloop?

**Qué mirar:** si el texto suena a producto o a manual pegado. Si el tono es el
mismo que el del resto de la aplicación.

**Sería un fallo:** que suene a documentación de otro sitio, o que prometa
cumplimiento normativo. El respaldo dice «ISO 9001:2015, 4.2 pide determinar…»,
nunca «esto garantiza que cumples».

---

## 5 · ¿Se entiende cómo se administra?

Entra a `/platform` → **Ayuda del producto**. Abre una cualquiera.

**Qué mirar:**
- ¿distingues lo publicado del borrador?
- ¿la vista previa te deja claro cómo se verá **y** que todavía no lo ve nadie?
- ¿sabrías cambiar un texto y publicarlo sin preguntarle a nadie?
- ¿entiendes qué es «solo para la plataforma» y por qué no llega al producto?

**Pruébalo de verdad:** cambia una palabra de una ayuda, publícala, y ve a la
pantalla de partes interesadas a comprobar que cambió. Eso es lo que este tramo
entrega.

---

## Lo que se sabe que sigue pendiente

- **Solo las once de partes interesadas** son administrables. Las otras siete
  familias de ayuda siguen en el código: son diccionarios de estado sin ejemplo
  ni respaldo, y trasladarlas hoy significaría inventarlos. Ver el
  [inventario](./PE_02B4_HELP_MIGRATION_INVENTORY.md).
- **La guía de TrazaDocs no cambió**: sigue siendo administrable por su lado, con
  su puerta comercial.
- **No hay vídeos ni tutoriales**: es PE-03, y usará las mismas claves de
  pantalla.
- **Nada de seguridad ni de la política de privacidad**: es B5.

---

## Cómo devolverlo

Por cada punto: **bien** / **mal** / **dudoso**, y si es mal o dudoso, qué
esperabas ver. Y si alguna de las once ayudas te parece mal redactada, dilo con
su nombre: ahora se corrige desde la consola, sin desplegar.
