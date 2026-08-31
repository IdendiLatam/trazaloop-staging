# PE-02B5A · Revisión humana

Este tramo **no publicó nada**. Preparó el contenido y lo dejó donde se puede
leer. Lo que hace falta ahora es una decisión, no una comprobación técnica: las
60 pruebas ya están en verde y no hay que repetirlas.

Siete cosas que leer, en este orden.

---

## Antes de empezar

En el Preview, con una cuenta de superadministrador. Dos sitios:

- `/platform/legal` → la política sucesora, versión **v1.1-draft**
- `/platform/faq` → filtro **Categoría: Seguridad y privacidad** → quince
  borradores

**Nada de lo que veas está publicado.** Y por favor **no pulses publicar**
mientras revisas: hacerlo en la política activaría la sucesora y a todo el mundo
se le volvería a pedir aceptar.

---

## 1 · La nueva política de privacidad

**Qué mirar primero:** que reconozcas el documento. No es nuevo — es el paquete
jurídico que aprobaste el 27 de julio, con tres cosas añadidas: Quality,
Intelligence, y el proveedor de IA entre los encargados.

**Lo que de verdad hay que leer** es la **sección 18**, que es nueva entera, y la
**19**, que admite que lo que una empresa publica deja de ser privado.

**Pregunta honesta:** ¿la sección 18 dice de más, o de menos?

**Y una decisión que no es técnica:** la v1.0 aprobada nunca llegó a publicarse.
Hoy la plataforma sirve una política preliminar que habla solo de CPR. Publicar
la sucesora arregla eso — y obliga a todo el mundo a aceptar de nuevo. Cuándo
hacerlo es tuyo.

---

## 2 · La respuesta bandera de seguridad

`/platform/faq` → **«¿Cómo protege Trazaloop la información de mi empresa?»**

**Qué mirar:** si convence sin exagerar. Son ocho capas reales, y termina
diciendo que ninguna medida elimina el riesgo y que no tenemos certificaciones
propias.

**Pregunta honesta:** ¿se la enseñarías a un cliente que pregunta por seguridad?
Y si no, ¿le falta algo o le sobra?

---

## 3 · La respuesta sobre el equipo de Trazaloop

**«¿Puede el equipo de Trazaloop acceder a los datos de mi empresa?»**

Esta es la más delicada del conjunto. Dice que en la operación normal no, explica
qué sí ve el equipo, y después **admite** que administrar la infraestructura
implica acceso a los sistemas y que los respaldos contienen todo.

**Qué mirar:** si esa admisión te parece que resta o que suma. Nuestra posición es
que suma: cualquiera que sepa cómo funciona la nube sabe que el absoluto sería
mentira, y decirlo primero es lo que hace creíble el resto.

**Lo que no se puede cambiar:** el párrafo de infraestructura. Sin él la respuesta
es falsa, y hay una prueba que falla si desaparece.

---

## 4 · La respuesta sobre otras empresas

**«¿Puede otra empresa ver mi información?»**

Dice que no, explica las dos barreras, y **añade** que si tu empresa genera un
enlace de pasaporte o envía una encuesta, eso deja de ser privado.

**Qué mirar:** si esa aclaración se lee como transparencia o como letra pequeña.
Está donde está —al final, en su propio párrafo— a propósito.

---

## 5 · La respuesta sobre la IA y otras empresas

**«¿La IA utiliza información de otras empresas para responderme?»**

Es la afirmación más fuerte del conjunto y es sostenible tal cual: el contexto lo
compone nuestro servidor con tu sesión, acotado a tu empresa, y el modelo no
tiene forma de ir a buscar nada.

**Qué mirar:** si se entiende sin saber qué es un contexto.

---

## 6 y 7 · Las dos que NO se pueden publicar todavía

**«¿Mis datos se utilizan para entrenar modelos?»** y **«¿Cuánto tiempo puede
conservar el proveedor la información de una consulta?»**

Verás en las dos un aviso: **todavía no se pueden publicar**. No es un error: la
base las rechaza porque su verificación depende de algo que el repositorio no
puede saber.

**Lo que hace falta de ti** —está en `PE_02B5A_HUMAN_CONFIRMATIONS.md`—:

1. **Qué proveedor está contratado en producción.** El valor de la variable está
   oculto y hay adaptadores para dos.
2. **Si la cuenta autorizó el uso de datos para entrenamiento.** La política del
   proveedor dice «no, por defecto» — y eso es el valor por defecto, no nuestro
   ajuste. Se mira en el panel de la organización del proveedor.
3. **Si hay retención cero o exclusión de revisión humana contratadas.**

**Qué mirar mientras tanto:** que la redacción te parezca correcta *asumiendo* que
la respuesta a 2 sea «no autorizamos nada». Si es que sí, hay que reescribirlas.

---

## Dos cosas más que conviene decidir

- **Resend** figura como encargado en la política aprobada y **no aparece en el
  código**. Puede estar configurado fuera del repositorio, o ser un resto. Una
  política que nombra a un encargado que no trata datos es tan inexacta como una
  que omite a uno que sí.
- **Los otros cinco documentos** del paquete jurídico —términos, aviso de
  privacidad, autorización de registro, anexo para clientes, cookies— tampoco
  mencionan Intelligence. Cuatro probablemente necesiten la misma actualización.

---

## Cómo devolverlo

Por cada punto: **bien** / **cambiar** / **hablarlo**. Si es «cambiar», con la
frase que no te gusta: el texto se corrige desde la consola, sin desplegar.

Y una respuesta explícita a esto, que es lo que desbloquea B5B:

> ¿Se publican las trece verificadas ya, o se espera a tener las quince?
