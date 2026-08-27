# QUALITY-11 · Quality by Observation

## 1 · Qué es

Trazaloop mira lo que **ya está registrado** y detecta condiciones que merecen
atención: un indicador que se deteriora tres periodos seguidos, un certificado
que caduca dentro de un mes, un proveedor crítico cuya reevaluación venció, una
queja que lleva 45 días sin atender.

Lo que **no** hace es decidir qué hacer con ellas.

## 2 · Qué NO es

| No es | Por qué importa la diferencia |
|---|---|
| un asistente | no propone, no redacta, no interpreta |
| un motor de reglas de negocio | no cambia el estado de nada |
| un sistema de scoring | no puntúa procesos, ni proveedores, ni personas |
| vigilancia de empleados | observa vencimientos de evidencias, no desempeño |
| inteligencia artificial | catorce operadores deterministas y una tabla |

## 3 · La promesa, en una frase

**Si la plataforma dice algo, puede decir exactamente por qué.**

Cada señal trae la regla, la versión con la que se emitió, el sujeto, la
condición evaluada con su valor observado, la fecha de detección y el retrato
mínimo de los datos que se miraron. No hay una sola afirmación que dependa de un
modelo, de una heurística o de un umbral que nadie escribió.

Y al revés: si la plataforma **no** dice nada, tampoco es magia. La ejecución
registra cuántos sujetos se miraron y cuántos coincidieron. Cero señales nuevas
significa «nada ha cambiado», no «no se ha mirado».

## 4 · Por qué la gravedad la declara la regla

La plataforma no deduce que «todo lo vencido es crítico». En una empresa un
certificado vencido detiene la producción y en otra se renueva por correo en una
tarde. La gravedad la fija quien escribe la regla, que es quien conoce su
empresa.

## 5 · Por qué ninguna plantilla se enciende sola

Encender cincuenta reglas el primer día llena la bandeja de ruido y enseña a
ignorarla. A partir de ahí el motor está encendido y apagado a la vez: corre,
gasta, escribe, y nadie lo mira.

Las 14 plantillas están disponibles y **ninguna** está activa. La empresa
instancia la que quiere, ajusta sus números —treinta días o sesenta, según le
convenga— y la publica. El estado inicial de una regla instanciada es `draft`.

## 6 · El lugar que ocupa esto en el sistema

```
QUALITY-01…10  registran lo que la empresa hace
QUALITY-11     mira lo registrado y avisa
las personas   deciden
```

La automatización se sitúa entre el registro y la decisión, y no invade ninguno
de los dos. No inventa datos y no toma decisiones: convierte información que ya
existía —y que nadie tenía tiempo de revisar a diario— en un aviso a la persona
correcta, con su explicación al lado.
