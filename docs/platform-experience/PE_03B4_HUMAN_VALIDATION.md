# PE-03B4 · Lo que hay que mirar con los ojos

Nueve cosas, y ninguna es de seguridad ni de RLS: eso ya está probado contra la
base.

**Dónde:** el despliegue de Preview.
**Con qué cuenta:** `idendilatam@gmail.com`, con **la contraseña de siempre**.
Nadie la cambió.

---

## 1 · «Tutoriales» se encuentra, desde los dos sitios

**En la consola de plataforma.** Entrar a `/platform`. Tienen que verse:

- «Tutoriales» en el menú de la izquierda, entre «Ayuda del producto» y
  «Documentos legales»;
- una tarjeta «Tutoriales» en el bloque **Contenido de la plataforma** del
  panel, junto a las otras cuatro consolas.

**Dentro de una empresa.** Entrar a cualquier módulo —Quality, por ejemplo— y
mirar la barra superior: junto a «Ayuda» y «Ver video tutorial» hay una
etiqueta ámbar **«Tutoriales»**.

Navegar por cinco o seis pantallas del módulo. La etiqueta **no desaparece**.
Eso es lo que se pedía: que no se pierda el acceso por entrar a una empresa.

Pulsarla lleva a la consola sin cerrar sesión, sin cambiar de usuario y sin
escribir ninguna dirección.

---

## 2 · Y un usuario normal no la ve

Con una cuenta de empresa **sin papel de plataforma**: en la barra superior hay
«Ayuda» y «Ver video tutorial», y **nada más**. Ni una etiqueta ámbar, ni un
grupo «Plataforma» en el menú lateral.

---

## 3 · La consola enseña el catálogo completo

En `/platform/tutorials`, el bloque **Cobertura** tiene que decir **152**
pantallas en el registro — no 11 — y debajo una tabla por módulo:

| Módulo | Pantallas |
|---|---|
| Trazaloop Quality | 67 |
| Trazaloop PCR | 44 |
| Trazaloop Textiles | 33 |
| Transversal | 8 |

Y una línea diciendo que hay **37** pantallas excluidas a propósito.

Al crear un tutorial, el selector de pantalla tiene que ofrecer el catálogo
entero: buscar «auditor», «pasaporte» o «proveedor» y comprobar que aparecen.

---

## 4 · El botón está en las pantallas de los tres módulos

Elegir una al azar de cada uno y comprobar que la barra superior dice **«Ver
video tutorial»**:

- Quality: `/quality/audits/findings`, `/quality/people/competencies`,
  `/quality/suppliers/evaluations`…
- PCR: `/catalog/materials`, `/traceability/genealogy`, `/audit-prep/dossiers`…
- Textiles: `/textiles/catalogs/fibers`, `/textiles/circularity/assessments`…

Al pulsarlo, como todavía no hay vídeos publicados, tiene que leerse:

> Este tutorial está en actualización y estará disponible pronto

**No** un reproductor vacío, y **no** un mensaje de error.

Y en una pantalla excluida —`/login`, `/legal`, `/platform/tutorials`— el botón
**no aparece en absoluto**.

---

## 5 · Las dos pestañas que comparten dirección

Es el detalle fino de este tramo, y merece un minuto.

1. Ir a `/quality/risks`, pulsar «Ver video tutorial», cerrar.
2. Cambiar a la pestaña **Oportunidades** y volver a pulsarlo.

Son **dos tutoriales distintos**. Hoy los dos dicen «en actualización», así que
la forma de verlo es en la consola: `quality.risks` y
`quality.risks.opportunities` son dos entradas.

Lo mismo en `/traceability/inventory`, entre **Materias primas** y **Producto
terminado**.

Y con el diálogo abierto en una pestaña, cambiar a la otra: **el diálogo se
cierra solo**.

---

## 6 · El vídeo de bienvenida

Hace falta subir uno primero, desde `/platform/tutorials` → «Bienvenida a
Trazaloop» → subir → publicar.

Después, **cerrar sesión y volver a entrar**. Al llegar a `/modules` tiene que
abrirse el diálogo de bienvenida.

| Qué mirar | Qué tiene que pasar |
|---|---|
| Antes de la bienvenida | Si había que aceptar términos, **eso va primero** |
| El vídeo | **No arranca solo.** Empieza al darle al play |
| Los controles | Play, pausa, barra, volumen, pantalla completa |
| Adelantar | Arrastrar a la mitad funciona |
| Escape | Cierra el diálogo |
| Al cerrar | El foco vuelve donde estaba |
| En el móvil | Se ve y se puede cerrar |

---

## 7 · «Cerrar» es por ahora

1. Cerrar la bienvenida con **«Cerrar»**.
2. Navegar por la aplicación y volver a `/modules`: **no vuelve a salir**.
3. Abrir otra pestaña en `/modules`: **tampoco** — es la misma sesión.
4. **Cerrar el navegador entero**, abrirlo y volver a entrar: **sí vuelve a
   salir**.

Ese cuarto paso es el que distingue «por ahora» de «nunca».

---

## 8 · «No volver a mostrar» es para siempre

1. Volver a abrirla y pulsar **«No volver a mostrar»**.
2. Cerrar el navegador, entrar de nuevo: **no sale**.
3. Desde la consola, **subir y publicar una versión nueva** del vídeo.
4. Volver a entrar: **sigue sin salir**.

El paso 4 es el que importa. Si el vídeo reapareciera al publicar una versión
nueva, la promesa que se le hizo a esa persona estaría rota.

Y con **otra cuenta** que no haya dicho nada: a esa sí le sale. La preferencia
es de la persona, no del ordenador ni de la empresa.

---

## 9 · Ningún tope, tampoco aquí

Al subir el vídeo de bienvenida, el texto bajo el selector de archivo dice que
Trazaloop no pone límite y que la carga depende del servicio de almacenamiento.

**No** debe aparecer ningún número de megas ni ningún aviso de duración máxima.

---

## Lo que NO hay que encontrar

- Ningún mensaje con una ruta de archivo, un identificador de versión o un
  código de error del almacenamiento.
- Ningún «Próximamente».
- Ningún vídeo que arranque solo.
- Ningún tutorial de una pantalla apareciendo en otra.
- La etiqueta «Tutoriales» en la sesión de un usuario de empresa normal.

---

## Después de confirmar

- **Ejecutar la retirada de `qa-a`**, que está preparada y no ejecutada:
  ver [PE_03B4_SUPERADMIN_RETIREMENT.md](PE_03B4_SUPERADMIN_RETIREMENT.md).
- Grabar y publicar los vídeos. Ese es el trabajo editorial que este tramo
  acaba de hacer posible para las 152 pantallas.
- PE-03B5 puede empezar.

Producción no entra en esta validación. Sigue en la migración 0111.
