# PE-02B5A · La política de privacidad sucesora

**Borrador:** `docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md`
**En la base:** `privacy` · `v1.1-draft` · **estado `draft`**, en Local y Staging
**La vigente sigue siendo `v1` y nadie tiene que volver a aceptar nada.**

---

## 1 · El hallazgo que cambió el trabajo

PE-02A dio por supuesto que había que redactar una política desde cero y que
faltaban los datos de identidad legal. **No era así.**

El repositorio tiene un **paquete jurídico v1.0 aprobado** el 27 de julio de 2026
—`docs/legal/`, seis documentos, con registro de aprobación y hashes—. Su
política de privacidad son 431 líneas, 19 secciones, con razón social, NIT,
representante legal, domicilio, canales de contacto, marco normativo colombiano,
separación de roles, categorías de datos, finalidades, encargados, transmisión
internacional, medidas de seguridad, cookies, derechos, procedimiento de
reclamos, conservación y vigencia.

**Lo que nunca ocurrió:** publicarla. La base sigue sirviendo la `v1` preliminar
—1.100 caracteres— que se declara «versión preliminar para la beta de Trazaloop
CPR».

Así que este tramo **no redactó una política**: partió de la aprobada y le añadió
lo que el producto incorporó desde entonces.

---

## 2 · Qué se conservó, palabra por palabra

Todo lo que la dirección aprobó: identidad, definiciones, principios, separación
de roles, categorías de titulares, datos sensibles y su procedimiento, fuentes,
finalidades, autorización, transmisión internacional, cookies, derechos,
procedimiento de reclamos y criterios de conservación.

**No se tocó ni una interpretación jurídica.** Tampoco la fórmula que da su tono
al documento: «marco normativo tomado como referencia, **sin declarar
cumplimiento**».

---

## 3 · Qué se añadió, y por qué

| Dónde | Qué | Por qué |
|---|---|---|
| Cabecera | versión **1.1**, estado **borrador sucesor**, y qué cambia | la v1.0 decía «VIGENTE» y no lo está |
| § 2 Alcance | **Trazaloop Quality** y **Trazaloop Intelligence** | existen desde entonces y no figuraban |
| § 2 Alcance | criterio para módulos futuros | evita reescribir la política por cada módulo, sin anunciar los que no operan |
| § 7 Categorías | uso de Intelligence: consulta, respuesta, contexto, proveedor, modelo, consumo y fecha | es un dato que se guarda y no estaba declarado |
| § 11 Encargados | **el proveedor de inteligencia artificial** | **era el hueco grave**: una política que no nombra a un encargado que trata información está incompleta |
| § 13 Seguridad | integridad acotada a la empresa; contexto de Intelligence en el servidor; anonimato estructural | medidas reales que no estaban dichas |
| § 13 Seguridad | de quién es el cifrado; qué **no** hay (segundo factor, inicio único, detección de filtraciones); sin certificaciones propias | decir lo que no existe es parte de no engañar |
| **§ 18 nuevo** | Trazaloop Intelligence, en **tres capas** | ver §4 |
| **§ 19 nuevo** | información que una empresa decide hacer pública | el aislamiento no impide publicar, y eso hay que decirlo |

Las secciones de cambios y vigencia pasan a 20 y 21.

---

## 4 · La sección 18, que es la razón del tramo

Separa **tres capas** que se confunden con facilidad, y que la frase «la IA
protege tus datos» colapsa en nada:

**18.1 · Lo que hace la Corporación.** Función apagada por defecto; se registra
cada consulta con su procedencia; no se entrenan modelos propios; no se comparte
entre empresas.

**18.2 · Cómo está construida.** El contexto lo compone el servidor con la sesión
y los permisos de quien pregunta; acotado a la empresa activa; el modelo no
accede a la base ni tiene herramientas; los cálculos los hace la plataforma;
Intelligence no toma decisiones formales.

**18.3 · Lo que hace el proveedor externo.** Recibe solo la pregunta y el
contexto. Y entonces se cita su política **con la fecha en que se consultó**: no
se usa para entrenar salvo autorización expresa; puede conservarse **hasta 30
días** con excepciones. Con una frase que no se puede quitar: pedir que no
almacene **no equivale** a un acuerdo de retención cero.

**18.4 · Qué no se afirma.** Ni borrado inmediato, ni que ninguna persona del
proveedor acceda nunca a contenido almacenado por él.

Y un aviso visible de **pendiente de confirmación humana** sobre el proveedor
concreto, el ajuste de entrenamiento de la cuenta y la existencia de acuerdos de
retención cero.

---

## 5 · Lo que NO se hizo

- **No se activó.** La `v1` sigue vigente; la sucesora está en `draft`.
- **No se provocó re-aceptación.** Comprobado: quien acepta hoy acepta `v1`.
- **No se inventó identidad legal.** Se hereda de la v1.0 aprobada.
- **No se declaró cumplimiento** de ninguna ley.
- **No se tocó** el resto del paquete jurídico —términos, aviso de privacidad,
  autorización de registro, anexo para clientes, cookies—. Cuatro de ellos
  probablemente necesiten la misma actualización por Intelligence, y eso es una
  decisión que no corresponde a este tramo.
- **No se tocó `lib/domain/legal-package.ts`**, que sirve `/legal/paquete` y
  también lista encargados. Si la sucesora se publica, ese texto habrá que
  alinearlo; queda anotado.

---

## 6 · Cómo revisarla

En Staging, con una cuenta de superadministrador:

```
/platform/legal → Política de tratamiento de datos personales y privacidad
                → versión v1.1-draft  ·  Borrador
```

La ficha muestra el texto completo, dice que no está vigente y que no se puede
aceptar. **No pulsar publicar**: hacerlo activaría la sucesora y a todas las
personas se les volvería a pedir aceptar. Eso es B5B, y solo tras aprobación
explícita.

---

## 7 · Antes de publicarla

1. **Revisión jurídica** de la sección 18 y de los cuatro puntos de
   `PE_02B5A_HUMAN_CONFIRMATIONS.md` §7.
2. Resolver las confirmaciones 1, 2, 3 y 5 de ese mismo documento.
3. Decidir si los otros cinco documentos del paquete se actualizan a la vez.
4. Confirmar que la identidad legal de la v1.0 sigue vigente.
