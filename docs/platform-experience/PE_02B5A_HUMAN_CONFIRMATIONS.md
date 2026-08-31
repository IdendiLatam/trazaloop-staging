# PE-02B5A · Lo que no puede salir del repositorio

Seis cosas que ninguna consulta al código ni a la base puede responder. Cada
una dice **qué bloquea**, **quién puede responderla** y **qué pasa si no se
responde**.

Ninguna bloquea las trece respuestas restantes: están verificadas y podrían
publicarse en B5B por su cuenta.

---

## 1 · ¿Qué proveedor de IA está contratado en producción?

**Estado:** HUMAN INPUT REQUIRED
**Bloquea:** que la FAQ pueda **nombrar** al proveedor.

El repositorio tiene adaptadores para OpenAI y para Anthropic, y un doble
determinista para cuando no hay ninguno. `QUALITY_AI_PROVIDER` existe en el
entorno de Preview y de Producción y **su valor está oculto**. En local no hay
proveedor: cae en el doble, que no llama a nadie.

**Si no se responde:** las respuestas hablan de «el proveedor» sin nombrarlo. Se
puede publicar así — pierde fuerza, no verdad.

---

## 2 · ¿La cuenta autorizó el uso de datos para entrenamiento?

**Estado:** HUMAN INPUT REQUIRED
**Bloquea:** la respuesta *«¿Mis datos se utilizan para entrenar modelos?»*

La política del proveedor dice «no se usa **por defecto**, salvo que el cliente
lo autorice». Eso describe el valor por defecto, **no el ajuste de nuestra
cuenta**. Deducir lo segundo de lo primero sería inventarlo.

**Cómo se responde:** entrando al panel de la organización del proveedor y
mirando el ajuste de uso de datos para mejora de modelos.

**Si no se responde:** la respuesta queda como
`external_policy_verification_required` y **la base rechaza publicarla**. Es la
barrera de 0155 funcionando, no un olvido.

---

## 3 · ¿Hay retención cero o exclusión de revisión humana contratadas?

**Estado:** HUMAN INPUT REQUIRED
**Bloquea:** la respuesta sobre conservación en el proveedor.

Trazaloop pide `store: false` en cada petición. La documentación oficial del
proveedor dice explícitamente que **eso no equivale** a retención cero: con ZDR
activado el parámetro se ignora y siempre se trata como falso, lo cual demuestra
que son mecanismos distintos.

**Si no se responde:** la respuesta dice «hasta 30 días» con sus excepciones, sin
mencionar retención cero. Es correcta así.

---

## 4 · Los datos de identidad legal

**Estado:** VERIFICADO — no hace falta preguntar

A diferencia de lo que PE-02A supuso, **el repositorio sí los tiene**: el paquete
jurídico v1.0, aprobado el 27 de julio de 2026, trae razón social, NIT,
representante legal, domicilio, dirección, teléfono y los dos canales de
contacto. La sucesora los hereda sin inventar nada.

**Lo que sí conviene confirmar:** que siguen vigentes a día de hoy.

---

## 5 · ¿Resend está realmente en uso?

**Estado:** HUMAN INPUT REQUIRED
**Bloquea:** la exactitud de la lista de encargados de la política.

La política aprobada v1.0 lo lista como encargado del envío transaccional de
correos. En el código **no aparece**: no es dependencia, no hay cliente, y los
correos de autenticación los envía el proveedor de identidad. Puede estar
configurado como servidor de correo saliente de ese proveedor —un ajuste que
vive fuera del repositorio— o puede ser un resto de una decisión que no se llegó
a ejecutar.

**Por qué importa:** una política que nombra a un encargado que no trata datos es
tan inexacta como una que omite a uno que sí.

**Si no se responde:** la sucesora lo mantiene, porque la v1.0 aprobada lo
mantenía, y queda esta nota.

---

## 6 · La configuración concreta de respaldos

**Estado:** LEGAL/HUMAN REVIEW REQUIRED
**Bloquea:** cualquier frase con una periodicidad o un plazo.

`docs/BACKUP_RESTORE.md` describe lo que el plan de pago del proveedor
**ofrece**, no lo que está **activado** en cada proyecto. Y el propio documento
exige probar una restauración; **no consta que se haya hecho**.

**Si no se responde:** ni la política ni la FAQ prometen periodicidad. La
sucesora dice que las copias «pueden persistir temporalmente durante ciclos
razonables», que es lo que la v1.0 aprobada ya decía.

---

## 7 · Revisión jurídica de la sucesora

**Estado:** LEGAL REVIEW REQUIRED
**Bloquea:** publicarla.

Lo que este tramo hizo es **técnico y editorial**: partió del paquete jurídico
aprobado, le añadió lo que el producto incorporó desde entonces —Quality,
Intelligence y el proveedor de IA— y no tocó ninguna interpretación legal.

Lo que **no** hizo, y no le corresponde: decidir si el tratamiento descrito
cumple la Ley 1581 de 2012 y el Decreto 1074 de 2015. La sucesora conserva la
fórmula de la v1.0 —«marco normativo tomado como referencia, sin declarar
cumplimiento»— y esa prudencia se mantiene a propósito.

**Puntos que merecen mirada jurídica:**

1. La sección 18 completa: es nueva y describe un tratamiento nuevo.
2. Si el proveedor de IA debe figurar además en el anexo de tratamiento para
   clientes empresariales.
3. Si nombrar el plazo de conservación de un tercero obliga a algo.
4. La transmisión internacional, ahora que hay un encargado más.

---

## Resumen

| # | Qué | Estado | ¿Bloquea publicar? |
|---|---|---|---|
| 1 | Proveedor de IA en producción | HUMAN INPUT | solo para nombrarlo |
| 2 | Ajuste de entrenamiento de la cuenta | HUMAN INPUT | **sí**, una respuesta |
| 3 | Retención cero / revisión humana | HUMAN INPUT | **sí**, una respuesta |
| 4 | Identidad legal | **verificado** | no |
| 5 | Resend | HUMAN INPUT | no, pero afecta la exactitud |
| 6 | Respaldos | LEGAL/HUMAN | no, si no se promete nada |
| 7 | Revisión jurídica de la sucesora | LEGAL REVIEW | **sí**, la política entera |

**Trece de las quince respuestas no dependen de ninguna de estas.**
