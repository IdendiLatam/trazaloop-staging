# PE-02B6.1 · El paquete editorial de PE-02, para leer sin entrar a la consola

El propietario del producto no puede entrar hoy a la consola de Staging. Este
documento existe para que eso deje de bloquear la revisión: contiene **el texto
exacto** de todo lo que está preparado y sin publicar, más lo que hace falta
para decidir sobre él.

*31 de agosto de 2026 · sobre el commit `3bd38fc` · **no se publicó nada**.*

---

## Cómo leerlo

| Parte | Qué es | Para quién |
|---|---|---|
| **1** | La política de privacidad v1.1, completa y exacta | dirección + abogado |
| **2** | Qué cambia respecto de la vigente | dirección |
| **3** | Qué necesita confirmación y qué necesita abogado | dirección |
| **4** | Las quince respuestas de seguridad, exactas | dirección |
| **5** | Recomendación por respuesta | dirección |
| **6–11** | Las seis respuestas que hay que leer despacio | dirección |
| **12–13** | Proveedor de IA e identidad legal | dirección + abogado |
| **14–15** | Recomendación final y hoja de decisión | dirección |

**Nada de lo que sigue es aprobación jurídica.** Donde este documento dice que
algo está verificado, quiere decir que se comprobó contra el código, la base o
la documentación oficial de un tercero. La conformidad legal de un texto es
juicio de un abogado, y aquí no se emite.

---

## Antes de nada · tres cosas que hay que decidir aunque el texto guste

Aparecieron al preparar este paquete. Las tres son de forma, ninguna es de
fondo, y las tres impedirían publicar tal cual.

### A · La política se mostraría con la sintaxis a la vista

`/privacy` pinta el documento como **texto plano**:

```
<div className="whitespace-pre-wrap …">{doc.content}</div>
```

No hay ningún intérprete de Markdown en el repositorio. El borrador está escrito
en Markdown —encabezados con `##`, negritas con `**`, y **nueve tablas**—, así
que el cliente vería veinticinco mil caracteres con los `##`, los `**` y las
tuberías de las tablas a la vista. Las tablas serían ilegibles.

La vigente no tiene el problema porque son cinco párrafos numerados sin formato.

**Hay que elegir una:** o se añade un intérprete de Markdown a `/privacy`, a
`/legal/accept` y a la consola —cambio de producto, no editorial—, o el texto se
reescribe en prosa plana con las tablas convertidas en listas. Lo primero es
mejor y es más trabajo.

### B · El documento lleva dentro tres notas internas

Se publicarían tal cual, con las rutas del repositorio incluidas:

1. **La cabecera**, un recuadro que empieza «Este documento es un BORRADOR» y
   remite a `docs/platform-experience/PE_02B5A_PRIVACY_POLICY_DRAFT.md`.
2. **En el § 18.3**, un recuadro «Pendiente de confirmación» que remite a
   `PE_02B6_HUMAN_REVIEW_PACKAGE.md`.
3. **El § 21 «Vigencia»**, que sigue diciendo **versión 1.0** y **27 de julio de
   2026** — contradiciendo la cabecera, que dice 1.1 con las fechas en blanco.

Los tres son andamiaje de redacción. Ninguno se ha tocado aquí: quitarlos es
parte de aprobar el texto, no de prepararlo.

### C · En Producción no hay proveedor de IA configurado

Comprobado hoy en las variables de entorno del proyecto de Producción: **no
existe `QUALITY_AI_PROVIDER`, ni `QUALITY_AI_API_KEY`, ni
`QUALITY_MODULE_ENABLED`**. Sin proveedor reconocido, `aiConfig()` cae en el
doble determinista, que no llama a nadie.

Es coherente con que Producción esté en la migración 0111: Quality e Intelligence
no están allí. Lo que significa para este paquete está en la parte 12.

---
# Parte 1 · La política de privacidad v1.1, exacta

Lo que sigue es el contenido **literal** de `privacy · v1.1-draft`, sin resumir y
sin una palabra cambiada.

**Es la misma en los tres sitios.** Se comprobó por resumen criptográfico:

| Origen | md5 del contenido |
|---|---|
| Base local | `03c0ade478219ac4e970e2e25fa3d302` |
| Base de Staging | `03c0ade478219ac4e970e2e25fa3d302` |
| `docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md` | idéntico |

No hay divergencia entre la documentación y la base, así que no hay que elegir
cuál manda. Si alguna vez la hubiera, manda la base: es lo que se serviría.

**Metadatos de la fila:**

| Campo | Valor |
|---|---|
| `document_type` | `privacy` |
| `version` | `v1.1-draft` |
| `title` | Política de tratamiento de datos personales y privacidad |
| `status` | **`draft`** |
| `published_at` | *(vacío)* |
| Longitud | 25 086 caracteres |
| `change_note` | PE-02B5A · sucesora de la v1.0: incorpora Quality, Intelligence y el proveedor de IA. Pendiente de revisión humana. |

> Recordatorio de la nota **A** de arriba: hoy esto se mostraría como texto
> plano, con los `##` y las tuberías a la vista.

---

<!-- ════════ INICIO DEL TEXTO EXACTO DEL BORRADOR ════════ -->

# Política de tratamiento de datos personales y privacidad

**Documento:** Política de tratamiento de datos personales y privacidad
**Versión comercial:** 1.1
**Estado:** BORRADOR SUCESOR — PENDIENTE DE REVISIÓN Y APROBACIÓN
**Sucede a:** versión 1.0, aprobada el 27 de julio de 2026
**Fecha de aprobación:** —
**Fecha de entrada en vigor:** —
**Sitio:** https://www.trazaloop.com
**Responsable:** CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL
**NIT:** 901835846-6
**Canal legal y de privacidad:** contacto@idendi.org
**Canal de soporte técnico:** contacto@cirquiloconsultores.com

> **Este documento es un BORRADOR.** No está vigente y no sustituye a la
> versión 1.0 hasta que la dirección lo apruebe y se publique. Mientras
> tanto, la versión que rige es la que la plataforma muestra en `/privacy`.
>
> Actualizado en PE-02B6 con dos confirmaciones de la dirección del producto
> del 31 de agosto de 2026: no se ha activado el uso de datos para
> entrenamiento, y no hay retención cero contratada. El § 18.3 las recoge.
>
> Qué cambia respecto de la 1.0, y por qué: la plataforma incorporó
> **Trazaloop Quality** y **Trazaloop Intelligence**, que es una función
> asistida por un proveedor externo de inteligencia artificial. La versión
> 1.0 no los menciona. Una política que no nombra a un encargado que trata
> información es una política incompleta, y por eso se redacta esta.
>
> El detalle de qué se añadió y qué se conservó está en
> `docs/platform-experience/PE_02B5A_PRIVACY_POLICY_DRAFT.md`.

**Marco normativo tomado como referencia** *(sin declarar cumplimiento)*:
Ley 1581 de 2012, Decreto 1074 de 2015, Ley 527 de 1999, Ley 1480 de 2011
en lo que resulte imperativamente aplicable, y Ley 2439 de 2024 en lo que
resulte aplicable al comercio electrónico.

---

## 1. Identificación del responsable

| Campo | Dato |
|---|---|
| Razón social | CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL |
| NIT | 901835846-6 |
| Nombre comercial de la plataforma | Trazaloop |
| Representante legal | Jhorman Mena Ledezma |
| Cargo | Director General |
| Domicilio | Medellín, Colombia |
| Dirección | Carrera 43A #15 Sur – 15 |
| Teléfono | +57 324 3268865 |
| Correo general | contacto@idendi.org |
| **Correo de privacidad y habeas data** | **contacto@idendi.org** |
| Correo de soporte de la plataforma | contacto@cirquiloconsultores.com |
| Sitio oficial | https://www.trazaloop.com |

### 1.1 Área responsable de peticiones, consultas y reclamos

El **área de privacidad** de la Corporación atiende las peticiones,
consultas y reclamos sobre datos personales.

- **Canal principal:** contacto@idendi.org
- **Canal alterno:** Carrera 43A #15 Sur – 15, Medellín, Colombia

---

## 2. Alcance

Esta política cubre el tratamiento de datos personales realizado por la
Corporación con ocasión de la plataforma Trazaloop y de sus módulos
funcionales:

- **Trazaloop CPR** — trazabilidad de contenido reciclado: proveedores,
  materiales, productos, evidencias, órdenes o corridas de producción,
  lotes de entrada, lotes producidos, TrazaDocs, diagnóstico y reportes,
  con cálculos y documentación técnica que toman como referencia la
  NTC 6632:2022 y la UNE-EN 15343:2008.
- **Trazaloop Textiles** — trazabilidad textil y de confección:
  proveedores, materiales, fibras, productos y composiciones, órdenes,
  lotes, evidencias, criterios de circularidad, TrazaDocs Textiles y
  pasaportes técnicos textiles con enlaces privados.
- **Trazaloop Quality** — gestión de procesos, riesgos, objetivos e
  indicadores, personas y cargos, proveedores, partes interesadas,
  auditorías, casos y acciones, revisión por la dirección, voz del cliente
  y documentación asociada.
- **Trazaloop Intelligence** — función transversal, disponible dentro de
  Quality, que explica y resume la información que la empresa ya tiene en
  la plataforma. Su tratamiento se describe en el § 18.

Cuando se habiliten módulos nuevos, esta política los cubre en los mismos
términos: la Corporación **no anuncia** módulos que todavía no operan.

Trazaloop **no certifica** productos ni procesos y **no garantiza** la
obtención, renovación o ampliación de una certificación.

El servicio se dirige **exclusivamente a empresas**; las personas usuarias
deben ser **mayores de edad**.

---

## 3. Definiciones

| Término | Significado |
|---|---|
| **Dato personal** | Información vinculada o que pueda asociarse a una persona natural determinada o determinable. |
| **Dato sensible** | Dato que afecta la intimidad o cuyo uso indebido puede generar discriminación. |
| **Titular** | Persona natural cuyos datos son objeto de tratamiento. |
| **Responsable** | Quien decide sobre la base de datos y el tratamiento. |
| **Encargado** | Quien realiza el tratamiento por cuenta del responsable. |
| **Tratamiento** | Cualquier operación sobre datos personales: recolección, almacenamiento, uso, circulación o supresión. |
| **Autorización** | Consentimiento previo, expreso e informado del titular. |
| **Transmisión** | Envío de datos a un encargado, dentro o fuera del país, para que trate los datos por cuenta del responsable. |
| **Transferencia** | Envío de datos a un receptor que actúa como responsable. |
| **Aviso de privacidad** | Comunicación breve dirigida al titular en el momento de recoger los datos. |
| **Cliente** | Empresa u organización titular de un espacio de trabajo en Trazaloop. |

---

## 4. Principios

El tratamiento se rige por los principios de **legalidad**, **finalidad**,
**libertad**, **veracidad o calidad**, **transparencia**, **acceso y
circulación restringida**, **seguridad** y **confidencialidad**.

---

## 5. Separación de roles

Es esencial distinguir dos flujos de datos, porque los roles y las
responsabilidades cambian.

### 5.1 La Corporación como responsable

La Corporación es **responsable del tratamiento** de:

- **datos de registro** de las cuentas;
- **datos de administradores y usuarios** de cada empresa;
- **datos de contacto**;
- **datos de soporte** (tickets, mensajes y adjuntos de soporte);
- **seguridad y registros técnicos** (autenticación, auditoría, direcciones
  IP, agente de navegación);
- **comunicaciones del servicio**.

### 5.2 La empresa cliente como responsable

Cada **empresa cliente es responsable** de los datos personales o
empresariales que registra dentro de sus catálogos, evidencias, documentos,
trazabilidad, proveedores, empleados, pasaportes y demás contenidos.

### 5.3 La Corporación como encargada

Respecto de esos datos, **Trazaloop actúa como encargado del
tratamiento**, siguiendo las instrucciones de la empresa cliente, dentro de
los alcances técnicos y contractuales del servicio. Se rigen además por el
**Anexo de tratamiento de datos para clientes empresariales**, que la
Corporación entrega por contrato a solicitud de la empresa cliente.

### 5.4 Cuadro de roles

| Actor | Rol | Sobre qué datos |
|---|---|---|
| La Corporación | **Responsable** | Registro, usuarios, contacto, soporte, seguridad y comunicaciones del servicio |
| La empresa cliente | **Responsable** | Datos que ella registra en sus catálogos, evidencias y trazabilidad |
| La Corporación | **Encargada** | Esos mismos datos registrados por la empresa cliente |
| Proveedores tecnológicos | **Encargados o subencargados** | Según el servicio prestado |

---

## 6. Categorías de titulares

- Personas usuarias de la plataforma (administradores, supervisores,
  consultores y usuarios autorizados).
- Personas de contacto de empresas clientes o interesadas.
- Personas que solicitan soporte.
- Terceros cuyos datos registra una empresa cliente: trabajadores,
  proveedores, transportadores, auditores y contactos comerciales.

---

## 7. Categorías de datos

### 7.1 Datos tratados por la Corporación como responsable

| Categoría | Datos |
|---|---|
| Identificación | nombre, correo, teléfono, cargo |
| Empresa | razón social, identificación tributaria, dirección comercial |
| Técnicos y de conexión | dirección IP, agente de navegación, dispositivo |
| Seguridad | registros de autenticación y de actividad relevante |
| Soporte | contenido de tickets y comunicaciones de soporte |
| Aceptación legal | documento y versión aceptados, fecha y hora, IP y agente |
| Uso de Intelligence | consulta escrita, respuesta generada, contexto empleado, proveedor y modelo, consumo y fecha (§ 18) |

### 7.2 Datos empresariales y datos personales

Gran parte de la información que se registra en Trazaloop es
**información empresarial** (materiales, composiciones, lotes, procesos,
documentos técnicos) que no constituye dato personal.

Sin embargo, dentro de catálogos, evidencias y documentos pueden aparecer
**datos personales de contacto** de terceros. En esos casos aplica el § 5.2
y el Anexo de tratamiento de datos.

Categorías admitidas para terceros, limitadas a lo estrictamente necesario:
nombre, correo laboral, teléfono laboral, cargo, empresa, dirección
comercial y datos operativos indispensables.

### 7.3 Datos sensibles y de menores de edad

La Corporación **no solicita intencionalmente** datos sensibles ni datos de
menores de edad, y la plataforma **no está diseñada** para tratarlos.

Está **expresamente prohibido** registrar en la plataforma:

- datos médicos o de salud;
- datos biométricos;
- datos de menores de edad;
- información sobre la vida sexual;
- religión o creencias;
- opiniones políticas;
- afiliación sindical;
- cualquier dato sensible no indispensable;
- contraseñas;
- información financiera completa (números completos de tarjeta, códigos de
  seguridad, credenciales bancarias);
- secretos de autenticación de cualquier tipo.

**Procedimiento si se registran indebidamente:**

1. Quien lo detecte lo comunica a contacto@idendi.org.
2. La Corporación verifica el caso y **notifica a la empresa cliente**, que
   es la responsable de esa información.
3. Se **restringe el acceso** a la información afectada mientras se
   resuelve.
4. La empresa cliente debe **retirarla o acreditar la base que la
   legitima** dentro del plazo que se le indique.
5. Si no lo hace, la Corporación puede **eliminar la información** o
   suspender el servicio, conforme a los términos de uso.
6. La actuación se deja registrada.

> **Limitación técnica que debe conocerse:** los campos de texto libre, las
> evidencias y los archivos adjuntos **no se inspeccionan
> automáticamente**. El cumplimiento de esta prohibición depende del
> control de la empresa cliente. La Corporación no revisa el contenido
> registrado.

---

## 8. Fuentes de la información

- **Directamente del titular**, al registrarse, usar la plataforma,
  solicitar soporte o comunicarse con la Corporación.
- **De la empresa cliente**, cuando invita a personas usuarias o registra
  datos de terceros en sus catálogos y evidencias.
- **De la propia operación técnica**: registros de autenticación,
  seguridad y auditoría generados por el uso.

No se obtienen datos de fuentes públicas ni de terceros con fines de
enriquecimiento o perfilado.

---

## 9. Finalidades del tratamiento

Todas las finalidades son **necesarias para prestar el servicio**:

1. Crear, autenticar y administrar cuentas y accesos.
2. Prestar las funcionalidades de los módulos habilitados: trazabilidad,
   documentación técnica, evidencias, cálculos, diagnóstico, reportes y
   pasaportes.
3. Gestionar la relación con la empresa cliente: estados comerciales por
   módulo, límites y capacidad de almacenamiento.
4. Prestar soporte y atender solicitudes.
5. Garantizar la seguridad, el aislamiento entre organizaciones y la
   integridad de la información; prevenir accesos no autorizados.
6. Enviar **comunicaciones necesarias del servicio**: confirmación de
   cuenta, recuperación de contraseña, invitaciones de equipo, avisos de
   seguridad y cambios en los documentos legales.
7. Conservar prueba de la aceptación de los documentos legales.
8. Cumplir obligaciones legales y atender requerimientos de autoridad
   competente.

**No se realizan** comunicaciones comerciales automatizadas, analítica de
comportamiento, elaboración de perfiles ni decisiones automatizadas con
efectos jurídicos sobre los titulares.

---

## 10. Autorización

- La autorización se obtiene de forma **previa, expresa e informada**
  mediante la aceptación de los documentos legales antes de acceder a la
  plataforma.
- La aceptación se presenta en **dos manifestaciones separadas**: la
  aceptación de los Términos de uso y la autorización de tratamiento de
  datos vinculada a esta política.
- La plataforma **conserva prueba** de la aceptación: usuario, documento,
  versión, fecha y hora, dirección IP y agente de navegación.
- **No se solicita autorización de mercadeo**, porque no se realizan
  comunicaciones comerciales automatizadas en esta versión.
- Cuando se publique una versión nueva de un documento, se solicitará
  **aceptarla antes de continuar** usando la plataforma.

---

## 11. Encargados y proveedores tecnológicos

La Corporación se apoya en proveedores que pueden actuar como encargados o
subencargados:

| Proveedor | Categoría de servicio |
|---|---|
| **Supabase** | Autenticación, base de datos y almacenamiento |
| **Vercel** | Alojamiento y entrega de la aplicación web |
| **Resend** | Envío transaccional de correos de autenticación |
| **Proveedor de inteligencia artificial** | Generación de respuestas de Trazaloop Intelligence, únicamente sobre el contexto que el servidor selecciona para cada consulta (§ 18) |

Estos proveedores tratan la información **únicamente** para prestar el
servicio contratado por la Corporación.

El proveedor de inteligencia artificial **no recibe la base de datos** ni
acceso a ella: recibe, en cada consulta, la pregunta y el contexto que el
servidor de Trazaloop seleccionó para responderla. El § 18 lo describe en
detalle.

El soporte de la plataforma se presta a través del canal
contacto@cirquiloconsultores.com.

---

## 12. Transmisiones y transferencias internacionales

La plataforma se presta mediante proveedores de infraestructura que operan
en varias regiones. En consecuencia, **puede existir tratamiento o
transmisión internacional de la información**, sujeto a las medidas
contractuales, técnicas y legales aplicables.

La Corporación **no afirma** que la información se aloje de forma única o
permanente en un país determinado, ni garantiza una ubicación invariable:
los proveedores pueden modificar sus regiones e infraestructura.

---

## 13. Medidas de seguridad

Medidas técnicas efectivamente implementadas:

- **Aislamiento entre organizaciones** mediante seguridad a nivel de fila
  (Row Level Security) en las tablas con ámbito de empresa: las reglas de
  acceso se evalúan en la base de datos, no solo en la pantalla.
- **Integridad referencial acotada a la empresa**: la base impide que un
  registro de una empresa apunte a información de otra.
- **Almacenamiento privado**: los depósitos de archivos no son públicos y
  el acceso se realiza mediante enlaces firmados con caducidad.
- **Autenticación** gestionada por el proveedor de identidad, con
  confirmación de correo.
- **Control de acceso por roles** dentro de cada empresa.
- **Registro de auditoría** de operaciones relevantes.
- **Separación de ambientes**: producción y pruebas usan proyectos e
  infraestructura distintos.
- **Enlaces de compartición** de pasaportes privados, revocables y con
  caducidad.
- **Cifrado en tránsito** mediante HTTPS.
- **Contexto de Intelligence construido en el servidor**, con la sesión y
  los permisos de quien pregunta, y acotado a su empresa. El modelo no
  consulta la base de datos ni dispone de herramientas de búsqueda, de
  archivos ni de acceso a internet.
- **Anonimato estructural** en las campañas de voz del cliente declaradas
  anónimas: la base rechaza registrar identidad junto a esas respuestas.

El **cifrado en reposo** y la ubicación física de la infraestructura
corresponden a los proveedores de alojamiento y de base de datos, conforme
a su propia documentación. La Corporación no implementa cifrado propio ni
cifrado de extremo a extremo, y no lo afirma.

La plataforma **no ofrece hoy** segundo factor de autenticación, inicio de
sesión único ni detección automática de credenciales filtradas. Se dice
para no dar por supuesto lo que no existe.

Ninguna medida de seguridad elimina por completo el riesgo. La Corporación
**no garantiza** la inviolabilidad absoluta de los sistemas, y no declara
certificaciones de seguridad propias.

---

## 14. Cookies y tecnologías estrictamente necesarias

Trazaloop utiliza cookies y mecanismos equivalentes **estrictamente
necesarios** para autenticación, sesión, selección de empresa activa,
seguridad y funcionamiento técnico.

**No se utilizan** cookies de analítica, de publicidad ni de mercadeo, ni
herramientas de medición de terceros. Por eso **no existe** un mecanismo de
consentimiento de cookies opcionales.

Detalle en el **Aviso sobre cookies y tecnologías estrictamente
necesarias**, publicado en https://www.trazaloop.com/legal/paquete.

---

## 15. Derechos de los titulares

Toda persona titular de datos puede:

| Derecho | Alcance |
|---|---|
| **Conocer** | Saber si sus datos son tratados y acceder a ellos |
| **Actualizar** | Poner al día datos incompletos o desactualizados |
| **Rectificar** | Corregir datos inexactos |
| **Suprimir** | Solicitar la eliminación, cuando proceda conforme al § 17 |
| **Revocar la autorización** | Cuando proceda y no exista deber legal o contractual de conservar |
| **Solicitar prueba de la autorización** | Salvo cuando la ley exceptúe |
| **Presentar quejas** | Ante la Corporación y ante la autoridad competente |
| **Ser informado del uso** | Conocer las finalidades del tratamiento |

---

## 16. Consultas, reclamos y procedimiento

1. Enviar la solicitud a **contacto@idendi.org** indicando: nombre,
   documento de identidad, el derecho que se ejerce, los datos afectados y
   un canal de respuesta.
2. La Corporación podrá solicitar información adicional razonable para
   **verificar la identidad** del solicitante.
3. **Plazos de respuesta:** los que fije la normativa aplicable. **No se
   ofrecen plazos ni niveles de servicio distintos de los legales.**
4. Si el solicitante es un tercero cuyos datos registró una **empresa
   cliente**, la Corporación **remitirá la solicitud a dicha empresa**, que
   actúa como responsable, y colaborará razonablemente en su atención.
5. La actuación queda registrada como prueba de atención.

### 16.1 Límites de la revocación y la supresión

La revocación o la supresión **no proceden** cuando exista un deber legal,
contractual, contable, probatorio, de seguridad o de defensa ante
reclamaciones que obligue a conservar la información, ni cuando la
conservación sea necesaria para la ejecución de la relación contractual.

---

## 17. Conservación y criterios de retención

No existen calendarios automáticos ni eliminación automática integral. Los
criterios aplicados son:

1. **Mientras exista la relación contractual o la cuenta**, la información
   se conserva para prestar el servicio.
2. **Conservación adicional** cuando sea necesaria para cumplir
   obligaciones legales, atender requerimientos de autoridad, mantener la
   seguridad, soportar auditorías, defender reclamaciones o cumplir el
   contrato.
3. **Supresión, anonimización o bloqueo** cuando la información deje de ser
   necesaria y ello resulte legal y técnicamente procedente.
4. Las solicitudes se **tramitan por los canales de contacto** del § 16.
5. Las **copias de respaldo y los registros técnicos** pueden persistir
   temporalmente durante ciclos razonables de respaldo y seguridad.

Pueden conservarse por los plazos legalmente aplicables: documentos legales
aceptados y su prueba de aceptación, registros contables, eventos de
seguridad e información necesaria para reclamaciones.

**No se fija en esta política ningún plazo tributario o contable concreto**,
para no anunciar calendarios que la plataforma no ejecuta de forma
automática.

---

## 18. Trazaloop Intelligence e inteligencia artificial

Trazaloop Intelligence explica y resume la información que la empresa ya
tiene registrada en la plataforma. Esta sección separa **tres capas** que a
menudo se confunden: lo que hace Trazaloop, cómo está construida la función,
y qué hace el proveedor externo con lo que recibe.

### 18.1 Lo que hace la Corporación

- La función está **apagada por defecto**: la enciende quien administra
  Quality en cada empresa.
- Se registra cada consulta con su pregunta, su respuesta, el contexto
  empleado, el proveedor y el modelo con los que se produjo, el consumo y la
  fecha. Ese registro pertenece a la empresa y sirve para poder revisar
  después con qué se respondió.
- La Corporación **no utiliza** la información de las empresas clientes para
  entrenar modelos propios, y **no comparte** información de una empresa con
  otra.

### 18.2 Cómo está construida la función

- El **contexto lo compone el servidor de Trazaloop**, consultando la base
  con la sesión y los permisos de quien pregunta. Si esa persona no puede
  ver un dato, ese dato no entra en la consulta, ni siquiera resumido.
- Cada consulta está **acotada a la empresa activa**. La información de una
  empresa no forma parte del contexto de otra.
- El **modelo no accede a la base de datos**. No se le entregan herramientas
  de consulta, de búsqueda en internet, de lectura de archivos ni de
  ejecución de código.
- Los **cálculos los hace la plataforma**, no el modelo: el modelo los
  explica y los cita.
- Intelligence **no toma decisiones formales**. No aprueba documentos, no
  cierra acciones, no declara conformidad, no clasifica no conformidades ni
  aprueba proveedores. Esas decisiones siguen siendo de las personas.

### 18.3 Lo que hace el proveedor externo

Al proveedor se le envía **únicamente** la pregunta y el contexto que el
servidor seleccionó para responderla, junto con las instrucciones del
sistema. No se le envía la base de datos ni se le da acceso a ella.

Conforme a la documentación oficial del proveedor consultada el **31 de
agosto de 2026**:

- los datos enviados a su interfaz de programación **no se utilizan para
  entrenar ni mejorar sus modelos**, salvo que el cliente lo autorice
  expresamente;
- las peticiones y respuestas **pueden conservarse hasta 30 días** con fines
  de prestación del servicio y vigilancia de abusos, salvo que una
  obligación legal o la protección del servicio exijan más tiempo.

Sobre la configuración de la cuenta de la Corporación ante ese proveedor:

- **No se ha activado** la autorización que permitiría usar estos datos para
  entrenar o mejorar los modelos del proveedor. Esa autorización existe, es
  del cliente activarla, y la Corporación no la ha activado.
- **No se tiene contratado** un acuerdo de retención cero. En consecuencia
  aplica el plazo de conservación descrito arriba, y esta política **no
  afirma** que la información no se conserve.

Trazaloop solicita además en cada petición que el proveedor **no almacene** el
contenido en sus repositorios de la interfaz de programación. Esa solicitud
reduce lo que se guarda pero **no equivale** a un acuerdo de retención cero:
son mecanismos distintos y esta política no los confunde.

> **Pendiente de confirmación:** el proveedor concreto contratado para el
> entorno de producción. Ver `PE_02B6_HUMAN_REVIEW_PACKAGE.md`.

### 18.4 Qué no se afirma

La Corporación no afirma que el proveedor elimine inmediatamente cada
consulta, ni que ninguna persona del proveedor pueda acceder nunca a
contenido almacenado por él, ni que sus modelos no vayan a entrenarse nunca
bajo ninguna circunstancia. Lo que se declara es lo que consta en su
documentación oficial —con la fecha en que se consultó— y cuál es la
configuración que la Corporación ha elegido para su cuenta.

---

## 19. Información que una empresa decide hacer pública

El aislamiento entre empresas **no impide** que una empresa publique
deliberadamente parte de su información. La plataforma ofrece dos
superficies de ese tipo:

- **Pasaportes técnicos textiles compartidos**, mediante enlaces privados
  que genera la propia empresa, revocables y con caducidad.
- **Encuestas de voz del cliente**, cuyo formulario se abre con un enlace
  que la empresa envía a sus clientes.

En ambos casos la decisión de publicar es de la empresa, y lo que se muestra
es la vista que ella publicó. **Esto no es una excepción de seguridad**: es
una función del producto, y quien la usa debe saber que lo que comparte deja
de ser privado para quien reciba el enlace.

---

## 20. Cambios a esta política

La Corporación puede actualizar esta política. Cuando el cambio sea
sustancial se solicitará **aceptar la nueva versión antes de continuar**
usando la plataforma. La plataforma conserva el historial de versiones y la
prueba de las aceptaciones.

---

## 21. Vigencia

- **Fecha de aprobación:** 27 de julio de 2026.
- **Fecha de entrada en vigor:** 27 de julio de 2026.
- **Versión comercial:** 1.0.
- **Última actualización:** 27 de julio de 2026.

<!-- ════════ FIN DEL TEXTO EXACTO DEL BORRADOR ════════ -->

---
# Parte 2 · Qué cambia respecto de la vigente

## La vigente, entera

La v1 son **1 100 caracteres**: cinco párrafos numerados que empiezan diciendo
que son «una versión preliminar de la política de privacidad de Trazaloop,
publicada para la beta / lanzamiento controlado de **Trazaloop CPR**».

Conviene tenerlo presente: la comparación no es entre dos políticas, sino entre
un aviso preliminar y una política.

Y la v1.1 **no se escribió desde cero**. Es el paquete jurídico que la dirección
aprobó el **27 de julio de 2026** —y que nunca llegó a publicarse en la
plataforma— con Quality, Intelligence y el proveedor de IA añadidos.

## Los cambios materiales

| § | Antes (v1) | Ahora (v1.1) | Por qué |
|---|---|---|---|
| **1** | No identifica a nadie | Razón social, NIT, representante legal, domicilio, dirección, teléfono, correo de habeas data | Una política sin responsable identificable no permite ejercer un derecho contra nadie |
| **2 · Alcance** | «beta / lanzamiento controlado de Trazaloop CPR» | CPR, Textiles, Quality e Intelligence, cada uno con lo que trata | La plataforma dejó de ser CPR hace tiempo. Añade que los módulos nuevos quedan cubiertos, y que Trazaloop no anuncia lo que no opera |
| **5 · Roles** | No existe | Separa: la Corporación **responsable** de cuentas, soporte y seguridad; la empresa cliente **responsable** de lo que registra; la Corporación **encargada** de eso mismo | Son dos flujos con responsabilidades distintas, y la v1 los trataba como uno |
| **7.2 · Datos empresariales** | No distingue | Dice que gran parte de lo registrado —materiales, lotes, procesos— **no es dato personal**, y acota qué datos de terceros se admiten | Sin la distinción, la política promete sobre información que no la necesita y se queda corta donde sí |
| **7.3 · Sensibles** | No existe | Prohíbe expresamente once categorías, con procedimiento de seis pasos, y **advierte que el texto libre y los adjuntos no se inspeccionan** | Prohibir sin decir que no se vigila sería insinuar un control que no existe |
| **11 · Encargados** | «el proveedor de infraestructura» | Tabla: Supabase, Vercel, Resend y **Proveedor de inteligencia artificial**, con qué hace cada uno | Un encargado sin nombre es un encargado no declarado |
| **12 · Internacional** | No existe | Reconoce que puede haber tratamiento internacional y **no promete** una ubicación fija | Los proveedores cambian de región; prometer lo contrario sería falso mañana |
| **13 · Seguridad** | No existe | Doce medidas implementadas **y lo que no hay**: sin segundo factor, sin inicio de sesión único, sin cifrado propio, sin certificaciones propias | Callar lo que no existe se lee como que existe |
| **14 · Cookies** | No existe | Solo estrictamente necesarias; sin analítica ni publicidad; por eso **no hay banner** | Explica una ausencia que si no se lee como descuido |
| **15–16 · Derechos** | «puedes solicitar información o eliminación por el Centro de soporte» | Ocho derechos, procedimiento en cinco pasos, verificación de identidad, y qué pasa si el solicitante es un tercero de una empresa cliente | La v1 daba un canal y ningún procedimiento |
| **16.1 · Límites** | No existe | Dice cuándo la supresión **no** procede | Prometer supresión incondicional sería incumplible |
| **17 · Retención** | No existe | Cinco criterios, y declara que **no hay calendarios automáticos** ni plazos concretos | No anunciar calendarios que la plataforma no ejecuta |
| **18 · IA** | No existe | Sección nueva en tres capas: lo que hace la Corporación, cómo está construida la función, qué hace el proveedor | Intelligence no existía cuando se escribió la v1 |
| **18.3 · Entrenamiento** | — | Política del proveedor (no por defecto, salvo autorización) **+ la Corporación no la ha activado** | Confirmación de la dirección del 31/08/2026 |
| **18.3 · Retención en el proveedor** | — | Hasta 30 días con excepciones; **no hay retención cero contratada**; `store:false` **no equivale** a retención cero | Confirmación de la dirección del 31/08/2026 |
| **18.4 · Qué no se afirma** | — | No se afirma borrado inmediato, ni que nadie del proveedor pueda acceder nunca, ni que sus modelos no se entrenen jamás | Lo que se declara es lo que consta con su fecha |
| **19 · Público** | No existe | Pasaportes textiles compartidos y encuestas de voz del cliente; **no es una excepción de seguridad, es una función** | El aislamiento no impide publicar, y quien comparte tiene que saberlo |
| **10 · Autorización** | «se te pedirá aceptar» | Dos manifestaciones separadas, con prueba conservada: usuario, versión, fecha, IP y agente | Es lo que la plataforma ya hace |
| **20–21 · Versiones** | «puede actualizarse» | Historial de versiones y prueba de aceptaciones | Es lo que 0156 implementó |

## Lo que NO cambia

Las finalidades siguen siendo las mismas, y siguen sin haber comunicaciones
comerciales, analítica de comportamiento, perfilado ni decisiones automatizadas
con efectos jurídicos. Eso estaba en la v1 y se conserva.

---
# Parte 3 · Qué necesita qué

Cuatro marcas:

- **VERIFICADO TÉCNICAMENTE** — se comprobó contra el código, la base o la
  documentación oficial de un tercero. No quiere decir aprobado jurídicamente.
- **CONFIRMACIÓN DE NEGOCIO** — depende de un hecho que solo conoce la
  dirección. El repositorio no puede responderlo.
- **REVISIÓN JURÍDICA RECOMENDADA** — hay una calificación legal en juego.
- **BLOQUEADO** — no puede publicarse tal como está.

| § | Marca | Por qué |
|---|---|---|
| 1 · Responsable | **CONFIRMACIÓN DE NEGOCIO** | Los datos son verificables solo por la dirección. Ver parte 13 |
| 1.1 · Área de privacidad | **CONFIRMACIÓN DE NEGOCIO** | El canal alterno es una dirección postal; confirmar que se atiende |
| 2 · Alcance | **VERIFICADO TÉCNICAMENTE** | Los cuatro módulos existen en el código; NTC 6632 y UNE-EN 15343 se citan como referencia, no como certificación |
| 3 · Definiciones | **REVISIÓN JURÍDICA RECOMENDADA** | Vocabulario de la Ley 1581; que estén bien traídas lo dice un abogado |
| 4 · Principios | **REVISIÓN JURÍDICA RECOMENDADA** | Enumeración legal |
| 5 · Roles | **REVISIÓN JURÍDICA RECOMENDADA** | La calificación responsable/encargado es la decisión jurídica más importante del documento |
| 5.3 · Anexo para clientes | **CONFIRMACIÓN DE NEGOCIO** | Dice que se entrega por contrato a solicitud. Confirmar que existe el procedimiento |
| 6 · Titulares | **VERIFICADO TÉCNICAMENTE** | Coinciden con lo que la plataforma registra |
| 7.1 · Datos como responsable | **VERIFICADO TÉCNICAMENTE** | Cada categoría corresponde a tablas reales, incluida la de uso de Intelligence |
| 7.2 · Empresarial vs personal | **VERIFICADO TÉCNICAMENTE** | La distinción se sostiene en el modelo de datos |
| 7.3 · Sensibles y menores | **REVISIÓN JURÍDICA RECOMENDADA** | La prohibición y su procedimiento tienen efectos contractuales. La advertencia de que no se inspecciona es técnicamente cierta |
| 8 · Fuentes | **VERIFICADO TÉCNICAMENTE** | No hay enriquecimiento ni perfilado en el código |
| 9 · Finalidades | **VERIFICADO TÉCNICAMENTE** | Las ocho corresponden a funciones existentes |
| 10 · Autorización | **VERIFICADO TÉCNICAMENTE** | Dos manifestaciones y prueba conservada: es lo que hace 0156 |
| 11 · Encargados | **BLOQUEADO** | **Resend** figura como encargado y no aparece en el código de producción: su única mención en todo el repositorio está dentro de una prueba, y como término prohibido. Hay que confirmarlo o quitarlo. Ver parte 12 |
| 12 · Internacional | **REVISIÓN JURÍDICA RECOMENDADA** | Transmisión internacional sin cláusulas nombradas |
| 13 · Medidas de seguridad | **VERIFICADO TÉCNICAMENTE** | Las doce se midieron sobre el esquema el 31/08/2026. Las cuatro ausencias declaradas también se comprobaron |
| 14 · Cookies | **VERIFICADO TÉCNICAMENTE** | No hay analítica ni medición de terceros en el código |
| 15 · Derechos | **REVISIÓN JURÍDICA RECOMENDADA** | Catálogo legal |
| 16 · Procedimiento | **REVISIÓN JURÍDICA RECOMENDADA** | Los plazos se remiten a la norma, que es lo prudente |
| 16.1 · Límites | **REVISIÓN JURÍDICA RECOMENDADA** | Limitar un derecho exige base legal |
| 17 · Retención | **VERIFICADO TÉCNICAMENTE** + **REVISIÓN JURÍDICA RECOMENDADA** | Es cierto que no hay eliminación automática. Si eso basta legalmente, lo dice un abogado |
| 18.1 · Lo que hace la Corporación | **VERIFICADO TÉCNICAMENTE** | Apagada por defecto y registro por consulta: ambas comprobadas |
| 18.2 · Cómo está construida | **VERIFICADO TÉCNICAMENTE** | Contexto compuesto en el servidor con la sesión de quien pregunta; el modelo sin herramientas |
| 18.3 · El proveedor externo | **BLOQUEADO** | El contenido está resuelto y verificado. Lo que bloquea es el recuadro «Pendiente de confirmación» con una ruta del repositorio dentro, que se publicaría tal cual |
| 18.4 · Qué no se afirma | **VERIFICADO TÉCNICAMENTE** | Es la sección que impide que las anteriores se lean como absolutos |
| 19 · Información pública | **VERIFICADO TÉCNICAMENTE** | Las dos superficies existen y las dos las inicia la empresa |
| 20 · Cambios | **VERIFICADO TÉCNICAMENTE** | El historial y la prueba existen desde 0156 |
| 21 · Vigencia | **BLOQUEADO** | Dice **versión 1.0** y **27 de julio de 2026**, contradiciendo la cabecera. Publicarlo así dejaría el documento fechado en su propia versión anterior |
| Cabecera | **BLOQUEADO** | El recuadro «Este documento es un BORRADOR», con dos rutas del repositorio, se publicaría al cliente |

## Resumen

**Cuatro bloqueos.** Tres son de andamiaje —cabecera, § 18.3, § 21— y se
resuelven borrando texto. El cuarto, Resend, es una pregunta de negocio de una
línea.

Ninguno afecta al fondo. Ninguna afirmación del documento resultó falsa.

Y a los cuatro hay que sumar la nota **A**: hoy el documento se mostraría con la
sintaxis a la vista.

---
# Parte 4 · Las quince respuestas de seguridad, exactas

Las quince están en la categoría **Seguridad y privacidad**, todas en estado
`draft`, con **cero revisiones publicadas**. Hoy no se leen: ni sin sesión, ni
con ella, y la categoría ni siquiera se ofrece en `/faq` porque las categorías
sin contenido publicado no se muestran.

El contenido de Local y el de Staging son **idénticos** campo por campo; se
comparó el registro completo de las quince.

En cada ficha, lo que ve el cliente está bajo **Respuesta corta** y **Respuesta
larga**, literal. El resto es metadato interno y no se publica.

| # | Pregunta | Visibilidad | Destacada | Verificación |
|---|---|---|---|---|
| 1 | ¿Cómo protege Trazaloop la información de mi empresa? | Pública | sí | verificada |
| 2 | ¿Puede otra empresa ver mi información? | Pública | sí | verificada |
| 3 | ¿Cómo separa Trazaloop la información entre empresas? | Pública | no | verificada |
| 4 | ¿Puede el equipo de Trazaloop acceder a los datos de mi empresa? | Pública | sí | con salvedad |
| 5 | ¿Cómo protege Trazaloop mis archivos y evidencias? | Con sesión | no | verificada |
| 6 | ¿Cómo se controlan los permisos de las personas? | Con sesión | no | verificada |
| 7 | ¿Cómo protege Trazaloop Intelligence la información de mi empresa? | Con sesión | no | verificada |
| 8 | ¿La IA utiliza información de otras empresas para responderme? | Pública | sí | verificada |
| 9 | ¿Qué información recibe el proveedor de inteligencia artificial? | Pública | no | verificada |
| 10 | ¿Mis datos se utilizan para entrenar modelos de inteligencia artificial? | Pública | sí | con salvedad |
| 11 | ¿Cuánto tiempo puede conservar el proveedor de IA la información de una consulta? | Pública | no | con salvedad |
| 12 | ¿El modelo de IA puede acceder directamente a la base de datos? | Pública | no | verificada |
| 13 | ¿Puede Trazaloop Intelligence modificar o aprobar información por su cuenta? | Con sesión | no | verificada |
| 14 | ¿Cómo se protege la identidad en las respuestas anónimas de mis clientes? | Con sesión | no | verificada |
| 15 | ¿Qué información puede hacerse pública en Trazaloop? | Pública | no | verificada |

**Diez públicas y cinco con sesión.** Cinco destacadas, que son las que
saldrían arriba.

---

## FAQ 01 · ¿Cómo protege Trazaloop la información de mi empresa?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Con varias capas que actúan a la vez: solo se entra con sesión, cada empresa queda aislada de las demás en la propia base de datos, tu papel decide qué puedes hacer, los archivos son privados y Trazaloop Intelligence solo trabaja con lo que tú puedes ver.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> En detalle, y solo lo que está implementado:
>
> · Para entrar hace falta una sesión: no hay ninguna pantalla con datos de empresa abierta sin identificarse.
>
> · El aislamiento entre empresas se aplica DENTRO de la base de datos, no solo en la pantalla. Cada consulta se resuelve con la identidad de quien pregunta y solo devuelve registros de su empresa.
>
> · La base impide además que un registro de una empresa apunte a información de otra, aunque el programa lo intentara.
>
> · Dentro de tu empresa, tu papel decide qué puedes hacer. Algunos datos, como los de personas, tienen reglas todavía más estrechas.
>
> · Los archivos y evidencias están en almacenamiento privado: no tienen dirección pública y se descargan con enlaces firmados que caducan.
>
> · Trazaloop Intelligence compone lo que consulta en nuestro servidor, con tu sesión y tus permisos. El modelo no accede a la base de datos.
>
> · Lo que se publica queda con su fecha y su autor en los ámbitos donde eso importa —documentos, revisiones, decisiones—, y no se reescribe: se sucede con una versión nueva.
>
> · La conexión con Trazaloop viaja cifrada.
>
> Ninguna medida elimina el riesgo por completo, y no afirmamos lo contrario. Tampoco tenemos certificaciones de seguridad propias: el cifrado en reposo y la infraestructura los aportan nuestros proveedores, con su propia documentación.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_como_protege` |
| Orden | 5 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | sí |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §1–§12 · medición del esquema del 2026-08-31: 289 tablas, 282 con control por fila, 0 de 321 columnas organization_id sin él, 409/409 claves compuestas acotadas, 3 de 3 cubos privados. |

---

## FAQ 02 · ¿Puede otra empresa ver mi información?

> **Respuesta corta** *(lo que ve el cliente)*
>
> No. Otra empresa no puede consultar la información privada de la tuya a través de Trazaloop. La separación no depende del código de la pantalla: está aplicada en la base de datos.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Cada consulta se resuelve con la identidad de quien pregunta y solo devuelve registros de las empresas a las que pertenece. Además, la propia base rechaza que un registro apunte a información de otra empresa.
>
> Hay una excepción que conviene conocer, y no es un fallo: TU EMPRESA puede decidir publicar algo. Al generar un enlace de pasaporte textil compartido o al enviar una encuesta a tus clientes, lo que compartes deja de ser privado para quien reciba ese enlace. Esa decisión es siempre tuya, y esos enlaces son revocables.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_otra_empresa` |
| Orden | 10 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | sí |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §2 y §3 · políticas de lectura sobre datos de empresa: ninguna abierta; superficies públicas por token, decididas por la empresa. |

---

## FAQ 03 · ¿Cómo separa Trazaloop la información entre empresas?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Con dos barreras independientes. La primera: las reglas de acceso se aplican en la base de datos y se evalúan con tu sesión. La segunda: la base impide que un registro apunte a información de otra empresa.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> La primera barrera es lo que se llama seguridad a nivel de fila. Significa que aunque una consulta pidiera todos los registros de una tabla, la base solo devolvería los de las empresas a las que pertenece quien pregunta.
>
> La segunda es de integridad: al relacionar dos registros, la base comprueba que los dos sean de la misma empresa. Si el programa intentara enlazar información de dos empresas distintas, la operación falla.
>
> Que sean dos barreras independientes importa: un error en una no abre la otra.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_como_separa` |
| Orden | 20 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §2 · 282 de 289 tablas con control por fila; las 7 restantes son catálogos sin organization_id. 409 claves compuestas, todas acotadas a la empresa. |

---

## FAQ 04 · ¿Puede el equipo de Trazaloop acceder a los datos de mi empresa?

> **Respuesta corta** *(lo que ve el cliente)*
>
> En la operación normal de la plataforma, no. La consola de administración no da a nuestro equipo ninguna vía para leer tus procesos, riesgos, documentos, evidencias ni tus consultas a Trazaloop Intelligence: solo ve datos administrativos —tu plan, tu consumo, tus miembros y los tickets de soporte que tú abres—.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Tampoco existe ninguna función que permita a nuestro equipo entrar a la plataforma haciéndose pasar por ti, ni añadirse a tu empresa: gestionar los miembros es potestad exclusiva de un administrador tuyo.
>
> Ahora la parte que no se puede omitir. Como en cualquier servicio alojado en la nube, la administración técnica de la infraestructura implica acceso a los sistemas donde reside la información, y las copias de respaldo contienen todo. Esos accesos técnicos excepcionales pueden ser necesarios para seguridad, soporte, recuperación o cumplimiento legal, y deben limitarse a personal autorizado y a lo estrictamente necesario.
>
> No afirmamos que ese acceso sea imposible, porque no lo es en ningún servicio gestionado. Lo que sí decimos es que la aplicación no lo ofrece como función.
>
> Sobre el registro: las operaciones que se hacen a través de la plataforma quedan registradas. Los accesos administrativos a la infraestructura los registra el proveedor conforme a sus propias herramientas, y eso no lo controla Trazaloop.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_equipo_trazaloop` |
| Orden | 30 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | sí |
| Clase normativa | `safe` |
| Verificación | `verified_with_qualifier` — verificada **con salvedad** |
| En qué se apoya | PE-02B5A §4 y §5 · solo 7 tablas con organization_id tienen política de plataforma, todas administrativas o de soporte; sin suplantación; memberships sin acceso de plataforma; el registro de auditoría cubre operaciones de la aplicación, no accesos de infraestructura. |
| **Salvedad obligatoria** | La salvedad de infraestructura NO puede quitarse: sin ella la respuesta sería falsa. Y no se puede añadir que todo acceso excepcional quede auditado: eso no está verificado. |

---

## FAQ 05 · ¿Cómo protege Trazaloop mis archivos y evidencias?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Están en almacenamiento privado. Ningún archivo tiene dirección pública: para descargar uno hace falta una sesión que pertenezca a tu empresa, y la descarga se hace con un enlace firmado que caduca.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Conocer la ruta o el identificador de un archivo no basta para abrirlo. El permiso se comprueba en el momento de pedirlo, contra la empresa a la que pertenece la carpeta donde está guardado.
>
> El cifrado en reposo y la ubicación física del almacenamiento corresponden a nuestro proveedor de infraestructura, conforme a su documentación. Trazaloop no implementa cifrado propio, y no afirmamos cifrado de extremo a extremo.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_archivos` |
| Orden | 40 |
| Visibilidad | Con sesión · solo dentro |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §6 · tres cubos, los tres privados; lectura por is_org_member sobre la carpeta de la empresa; descarga por enlace firmado con caducidad. |

---

## FAQ 06 · ¿Cómo se controlan los permisos de las personas?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Tu papel dentro de la empresa decide qué puedes hacer, y se comprueba en cada operación, no solo al abrir la pantalla.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Hay dos cosas distintas que a veces se confunden. Que tu empresa tenga acceso a un módulo decide si se puede entrar en él. Tu papel decide qué puedes hacer una vez dentro. Lo primero es del acuerdo de tu empresa; lo segundo, de quien la administra.
>
> Alguna información tiene reglas más estrechas que el papel: los datos de personas, por ejemplo, solo los ve quien tiene motivo para verlos.
>
> Los miembros de tu empresa los gestiona un administrador tuyo, y solo él.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_permisos` |
| Orden | 50 |
| Visibilidad | Con sesión · solo dentro |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §9 · las políticas de escritura exigen papel; funciones de permiso más estrechas para datos de personas; políticas de memberships solo para is_org_admin. |

---

## FAQ 07 · ¿Cómo protege Trazaloop Intelligence la información de mi empresa?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Lo que se consulta lo compone nuestro servidor leyendo la base con TU sesión y TUS permisos, y siempre acotado a tu empresa. Si tú no puedes ver un dato, no entra en la consulta, ni siquiera resumido.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> El modelo no tiene acceso a la base de datos ni herramientas para buscar por su cuenta: recibe un texto ya preparado y responde sobre él.
>
> Las fuentes que Intelligence puede usar están declaradas una a una, con su nivel de sensibilidad, y se respetan los permisos de quien pregunta.
>
> Los números los calcula la plataforma, no el modelo: el modelo los explica y señala de dónde salen, para que puedas comprobarlo.
>
> Y queda registrado con qué proveedor y con qué modelo se produjo cada respuesta, para que dentro de un año se pueda saber con qué se respondió.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_intelligence` |
| Orden | 60 |
| Visibilidad | Con sesión · solo dentro |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §10 · contexto compuesto en el servidor con la sesión de quien pregunta; cero usos del cliente administrativo en lib/ai/context/; 26 fuentes con clase de privacidad; sin herramientas de búsqueda, ficheros ni código. |

---

## FAQ 08 · ¿La IA utiliza información de otras empresas para responderme?

> **Respuesta corta** *(lo que ve el cliente)*
>
> No. La información de una empresa no se usa como contexto de Trazaloop Intelligence para otra empresa.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Cada consulta se compone en nuestro servidor, con la sesión de quien pregunta y acotada a su empresa activa. No existe ningún modo en que el contenido de una empresa entre en la respuesta de otra.
>
> El modelo tampoco puede ir a buscarlo: no tiene acceso a la base de datos ni herramientas de búsqueda.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_ia_otras_empresas` |
| Orden | 70 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | sí |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §10 · el constructor de contexto acota por organization_id y lee con la sesión; el modelo no recibe herramientas. |

---

## FAQ 09 · ¿Qué información recibe el proveedor de inteligencia artificial?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Únicamente la pregunta y el contexto que nuestro servidor seleccionó para responderla, junto con las instrucciones del sistema. No recibe la base de datos ni acceso a ella.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Trazaloop no envía toda tu información: envía lo que hace falta para la pregunta concreta, elegido con tus permisos.
>
> Tampoco se le entregan herramientas: no puede buscar en internet, ni abrir archivos, ni ejecutar código, ni consultar la base.
>
> En cada petición se le solicita además que no almacene el contenido en sus repositorios.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_que_recibe_proveedor` |
| Orden | 80 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §10 y AI_PROVIDER_POLICY §3 · el adaptador envía instructions + input; store:false; sin herramientas. |

---

## FAQ 10 · ¿Mis datos se utilizan para entrenar modelos de inteligencia artificial?

> **Respuesta corta** *(lo que ve el cliente)*
>
> No. Trazaloop no entrena modelos con la información de tu empresa, y no ha activado la autorización que permitiría al proveedor usarla para entrenar los suyos. Su documentación oficial establece que los datos enviados a su interfaz de programación no se usan para entrenar ni mejorar sus modelos salvo que el cliente lo autorice expresamente, y Trazaloop no lo ha autorizado.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Conviene separar tres cosas, porque se confunden con facilidad.
>
> Lo que hace Trazaloop: no entrenamos modelos con tu información, ni propios ni de nadie.
>
> Lo que dice la política del proveedor: por defecto, lo que se le envía por su interfaz de programación no alimenta el entrenamiento de sus modelos. Esa autorización existe y es del cliente activarla.
>
> Lo que Trazaloop ha decidido: no activarla. Es una configuración de nuestra cuenta, no una promesa del proveedor.
>
> Lo que sí se le pide en cada consulta: que no almacene el contenido en sus repositorios. Eso reduce lo que se guarda, pero no es lo mismo que un acuerdo de retención cero — ver la pregunta sobre cuánto tiempo puede conservarlo.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_entrenamiento_modelos` |
| Orden | 90 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | sí |
| Clase normativa | `safe` |
| Verificación | `verified_with_qualifier` — verificada **con salvedad** |
| En qué se apoya | AI_PROVIDER_POLICY · documentación oficial del proveedor consultada el 2026-08-31 (política del proveedor) + confirmación de la dirección del producto del 2026-08-31 (ajuste de nuestra cuenta). Son dos fuentes distintas y la respuesta las distingue. |
| **Salvedad obligatoria** | La afirmación tiene dos mitades con procedencia distinta: la política del proveedor está verificada en su documentación oficial; que Trazaloop no haya activado la autorización lo confirmó una persona, no el repositorio. Si ese ajuste cambiara, esta respuesta pasa a ser falsa y hay que rehacerla. Y no se puede escribir que el proveedor no entrenará nunca bajo ninguna circunstancia: lo que dice es que no lo hace salvo autorización. |
| Fuente externa | https://developers.openai.com/api/docs/guides/your-data |
| Consultada el | 2026-08-31 |

---

## FAQ 11 · ¿Cuánto tiempo puede conservar el proveedor de IA la información de una consulta?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Según la documentación oficial del proveedor, las peticiones y respuestas pueden conservarse HASTA 30 DÍAS con fines de prestación del servicio y vigilancia de abusos, salvo que una obligación legal o la protección del servicio exijan más tiempo. Trazaloop no tiene contratado un acuerdo de retención cero, así que ese plazo es el que aplica.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> «Hasta 30 días» no significa «siempre 30 días» ni «siempre menos»: es un máximo, con las dos excepciones que la propia política nombra.
>
> Trazaloop pide en cada consulta que el contenido no se almacene en los repositorios de la interfaz de programación. Esa petición reduce lo que se guarda, pero NO es un acuerdo de retención cero: son dos mecanismos distintos, y decimos con claridad que el segundo no lo tenemos.
>
> Por la misma razón no afirmamos que ninguna persona del proveedor pueda acceder nunca a contenido almacenado por él. Existen controles contractuales para eso y no declaramos tenerlos.
>
> Lo que sí controlamos: qué se envía. Solo la pregunta y el contexto que el servidor seleccionó para responderla, con tus permisos.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_retencion_proveedor` |
| Orden | 100 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified_with_qualifier` — verificada **con salvedad** |
| En qué se apoya | AI_PROVIDER_POLICY §2 · «retained for up to 30 days, unless longer retention is required by law, or is reasonably necessary to protect our services», consultado el 2026-08-31 + confirmación de la dirección del 2026-08-31: no hay retención cero contratada. |
| **Salvedad obligatoria** | La salvedad es doble y no se puede quitar: el plazo es del proveedor y es un máximo con excepciones, y Trazaloop no tiene retención cero. Si algún día se contratara, esta respuesta hay que rehacerla — decir hoy que no la hay es lo que la hace honesta. |
| Fuente externa | https://developers.openai.com/api/docs/guides/your-data |
| Consultada el | 2026-08-31 |

---

## FAQ 12 · ¿El modelo de IA puede acceder directamente a la base de datos?

> **Respuesta corta** *(lo que ve el cliente)*
>
> No. El modelo no se conecta a la base de datos de Trazaloop.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Nuestro servidor lee las fuentes que tú puedes ver, compone un texto con esa información y se lo envía al modelo. El modelo responde sobre ese texto.
>
> Eso significa que no hay consultas escritas por el modelo, no hay forma de que pida más de lo que se le dio, y no puede alcanzar información que tú no puedas ver.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_modelo_sin_base` |
| Orden | 110 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §10 · sin herramientas de base, búsqueda, ficheros ni código en lib/ai/; el contexto se compone antes de la petición. |

---

## FAQ 13 · ¿Puede Trazaloop Intelligence modificar o aprobar información por su cuenta?

> **Respuesta corta** *(lo que ve el cliente)*
>
> No. Analiza, resume y sugiere; las decisiones formales siguen siendo de las personas.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Intelligence no aprueba documentos, no cierra acciones, no declara conformidad, no clasifica no conformidades, no acepta riesgos y no aprueba proveedores. Tampoco modifica registros por su cuenta.
>
> Lo que hace es explicar lo que ya está registrado y señalar de dónde lo sacó, para que quien decide lo haga con la información delante.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_ia_no_decide` |
| Orden | 120 |
| Visibilidad | Con sesión · solo dentro |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §10 · QUALITY-12/13B5: el modelo no escribe; las acciones formales pasan por las funciones del dominio con su papel y su registro. |

---

## FAQ 14 · ¿Cómo se protege la identidad en las respuestas anónimas de mis clientes?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Cuando una campaña de voz del cliente se declara anónima, la base rechaza guardar cliente, contacto, nombre, correo o invitación junto a la respuesta. No es que la identidad se oculte: no llega a existir.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Como consecuencia, Trazaloop Intelligence no puede revelar una identidad que no está guardada.
>
> Esto aplica al modo anónimo de campaña. Una campaña identificada sí registra quién respondió, porque para eso se elige: son dos modos distintos y la elección es de tu empresa al crearla.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_anonimato` |
| Orden | 130 |
| Visibilidad | Con sesión · solo dentro |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §11 · disparador de 0126 que rechaza identidad en campañas anónimas; fuentes customer_comment y customer_metric marcadas anonymous. |

---

## FAQ 15 · ¿Qué información puede hacerse pública en Trazaloop?

> **Respuesta corta** *(lo que ve el cliente)*
>
> Solo la que tu empresa decide publicar. Por defecto, todo es privado de tu empresa.

> **Respuesta larga** *(lo que ve el cliente al abrirla)*
>
> Hoy hay dos formas de compartir hacia fuera, y las dos las inicia tu empresa:
>
> · El pasaporte técnico textil, mediante un enlace privado que generas tú, revocable y con caducidad. Muestra la vista que publicaste, no todo el expediente.
>
> · Las encuestas de voz del cliente, cuyo formulario se abre con el enlace que envías a tus clientes.
>
> Fuera de eso, no hay ninguna pantalla que muestre información de una empresa sin haber iniciado sesión en ella. Compartir es una función del producto, no un fallo de aislamiento — pero conviene saber que lo compartido deja de ser privado para quien reciba el enlace.

**Metadato interno** *(no se publica)*

| Campo | Valor |
|---|---|
| Identificador | `seguridad_publicar` |
| Orden | 140 |
| Visibilidad | Pública · la ve cualquiera |
| Destacada | no |
| Clase normativa | `safe` |
| Verificación | `verified` — verificada |
| En qué se apoya | PE-02B5A §3 · resolución por token de pasaporte y encuesta; anon sin privilegios sobre tablas del dominio. |

---
# Parte 5 · Recomendación por respuesta

Cuatro clases, y son **recomendaciones**: ninguna respuesta se ha modificado.

- **PUBLICAR TAL CUAL**
- **PUBLICAR TRAS RETOQUE DE REDACCIÓN**
- **NECESITA CONFIRMACIÓN HUMANA**
- **NO PUBLICAR TODAVÍA**

La clasificación se apoya en el metadato de verificación de cada una, no en
prudencia general.

> **A favor de las quince:** las respuestas están escritas en prosa plana, sin
> Markdown, y `/faq` las pinta con `whitespace-pre-wrap`. Se leen bien tal como
> están. El problema de formato de la política **no las afecta**.

| # | Respuesta | Recomendación | Por qué |
|---|---|---|---|
| 1 | Cómo protege Trazaloop | **PUBLICAR TAL CUAL** | Ocho capas medidas sobre el esquema; cierra reconociendo el riesgo residual y la ausencia de certificaciones propias. Ver parte 6 |
| 2 | ¿Puede otra empresa ver mi información? | **PUBLICAR TAL CUAL** | Empieza con «No.» y separa lo privado de lo que la empresa decide publicar. Ver parte 7 |
| 3 | Cómo separa la información | **PUBLICAR TAL CUAL** | Dos barreras independientes, ambas medidas. Explica por qué la independencia importa |
| 4 | Acceso del equipo de Trazaloop | **PUBLICAR TAL CUAL** | La más delicada y la mejor construida. Ver parte 8. **La salvedad de infraestructura no puede quitarse** |
| 5 | Archivos y evidencias | **PUBLICAR TAL CUAL** | Tres cubos privados, enlaces firmados con caducidad; y dice que el cifrado en reposo es del proveedor |
| 6 | Permisos de las personas | **PUBLICAR TAL CUAL** | Distingue acceso al módulo de papel dentro del módulo, que es la confusión habitual |
| 7 | Intelligence y la información | **PUBLICAR TAL CUAL** | Coincide con el § 18.2 de la política |
| 8 | ¿La IA usa datos de otras empresas? | **PUBLICAR TAL CUAL** | Empieza con «No.». Ver parte 9 |
| 9 | Qué recibe el proveedor | **PUBLICAR TAL CUAL** | Verificado en el adaptador: instrucciones + entrada, `store:false`, sin herramientas |
| 10 | Entrenamiento de modelos | **PUBLICAR TAL CUAL** | Resuelta el 31/08/2026. Separa las tres cosas que se confunden. Ver parte 10 |
| 11 | Retención en el proveedor | **PUBLICAR TRAS RETOQUE** | Correcta y completa, pero es la más difícil de leer de las quince. Ver parte 11 |
| 12 | ¿El modelo accede a la base? | **PUBLICAR TAL CUAL** | Corta, tajante y verificada |
| 13 | ¿Intelligence decide? | **PUBLICAR TAL CUAL** | Lista seis decisiones formales que no toma |
| 14 | Anonimato de las encuestas | **PUBLICAR TAL CUAL** | «No es que la identidad se oculte: no llega a existir» es exactamente lo que hace el disparador de 0126 |
| 15 | Qué puede hacerse público | **PUBLICAR TAL CUAL** | Complementa la 2 y coincide con el § 19 de la política |

## Resumen

**Catorce para publicar tal cual. Una con retoque de redacción.**

Ninguna necesita confirmación humana —las dos que la necesitaban se resolvieron
el 31 de agosto— y ninguna hay que retenerla.

Es un resultado alto, y conviene decir por qué no es complacencia: las quince
pasaron antes por una barrera de la propia base que rechaza publicar lo que no
está verificado, y por una auditoría que midió el esquema en vez de citar
informes anteriores.

---
# Parte 6 · La respuesta bandera

Es la primera de la categoría, está destacada, y es la que se enviaría a un
cliente que escribe preguntando por seguridad.

> **Pregunta**
>
> ¿Cómo protege Trazaloop la información de mi empresa?

> **Respuesta corta**
>
> Con varias capas que actúan a la vez: solo se entra con sesión, cada empresa queda aislada de las demás en la propia base de datos, tu papel decide qué puedes hacer, los archivos son privados y Trazaloop Intelligence solo trabaja con lo que tú puedes ver.

> **Respuesta larga**
>
> En detalle, y solo lo que está implementado:
>
> · Para entrar hace falta una sesión: no hay ninguna pantalla con datos de empresa abierta sin identificarse.
>
> · El aislamiento entre empresas se aplica DENTRO de la base de datos, no solo en la pantalla. Cada consulta se resuelve con la identidad de quien pregunta y solo devuelve registros de su empresa.
>
> · La base impide además que un registro de una empresa apunte a información de otra, aunque el programa lo intentara.
>
> · Dentro de tu empresa, tu papel decide qué puedes hacer. Algunos datos, como los de personas, tienen reglas todavía más estrechas.
>
> · Los archivos y evidencias están en almacenamiento privado: no tienen dirección pública y se descargan con enlaces firmados que caducan.
>
> · Trazaloop Intelligence compone lo que consulta en nuestro servidor, con tu sesión y tus permisos. El modelo no accede a la base de datos.
>
> · Lo que se publica queda con su fecha y su autor en los ámbitos donde eso importa —documentos, revisiones, decisiones—, y no se reescribe: se sucede con una versión nueva.
>
> · La conexión con Trazaloop viaja cifrada.
>
> Ninguna medida elimina el riesgo por completo, y no afirmamos lo contrario. Tampoco tenemos certificaciones de seguridad propias: el cifrado en reposo y la infraestructura los aportan nuestros proveedores, con su propia documentación.

## Vista desde el cliente

**¿Se entiende?** Sí. La respuesta corta cabe en un vistazo y nombra cinco cosas
concretas en lugar de adjetivos. La larga usa ocho viñetas, cada una una idea.

**¿Convence?** Sí, y por una razón que no es el contenido: **el último párrafo**.
Decir «ninguna medida elimina el riesgo por completo, y no afirmamos lo
contrario» y admitir que no hay certificaciones propias es lo que hace creíbles
las ocho viñetas anteriores. Una respuesta de seguridad sin límites declarados se
lee como folleto.

**¿Demasiado técnica?** Roza el límite en dos puntos —«el aislamiento se aplica
DENTRO de la base de datos» y «enlaces firmados que caducan»—, pero los dos van
explicados en la misma frase. No usa ni una palabra de jerga de desarrollo: no
dice RLS, ni tenant, ni endpoint.

**¿Falta alguna capa verificada?** Se comprobó contra las doce medidas del § 13
de la política. Faltan tres, y las tres se omitieron con criterio:

- *separación de ambientes* — importa poco al cliente;
- *autenticación con confirmación de correo* — está implícita en «solo se entra
  con sesión»;
- *anonimato estructural de las encuestas* — tiene su propia respuesta, la 14.

La única que merecería estar y no está es la **separación de ambientes**:
producción y pruebas usan proyectos distintos, y a un cliente que pregunta por
seguridad eso le dice algo. Es una viñeta.

**¿Alguna afirmación sin respaldo?** No. Cada viñeta corresponde a una medición
del esquema del 31/08/2026: 289 tablas, 282 con control por fila, 0 de 321
columnas `organization_id` sin él, 409 de 409 claves compuestas acotadas, 3 de 3
cubos privados.

**¿Alarma innecesaria?** No. El párrafo final es la dosis justa: reconoce el
límite sin dramatizarlo.

## Versión alternativa · opcional

No se recomienda cambiarla. Si aun así se quiere la capa que falta, esta viñeta
se insertaría antes del párrafo final, y no hay que tocar nada más:

> · Producción y pruebas están separadas: usan proyectos e infraestructura
> distintos, así que trabajar en una versión nueva no toca los datos reales.

---

# Parte 7 · Otra empresa

> **Pregunta**
>
> ¿Puede otra empresa ver mi información?

> **Respuesta corta**
>
> No. Otra empresa no puede consultar la información privada de la tuya a través de Trazaloop. La separación no depende del código de la pantalla: está aplicada en la base de datos.

> **Respuesta larga**
>
> Cada consulta se resuelve con la identidad de quien pregunta y solo devuelve registros de las empresas a las que pertenece. Además, la propia base rechaza que un registro apunte a información de otra empresa.
>
> Hay una excepción que conviene conocer, y no es un fallo: TU EMPRESA puede decidir publicar algo. Al generar un enlace de pasaporte textil compartido o al enviar una encuesta a tus clientes, lo que compartes deja de ser privado para quien reciba ese enlace. Esa decisión es siempre tuya, y esos enlaces son revocables.

## Lo privado frente a lo que se decide publicar

La respuesta distingue las dos cosas y las pone en párrafos separados:

| | |
|---|---|
| **Información privada de la empresa** | Nadie de fuera la consulta. Aplicado en la base, no en la pantalla |
| **Información que la empresa publica** | Pasaportes textiles y encuestas. Enlaces revocables, decisión de la empresa |

Y la marca explícitamente: «no es un fallo». Sin esa frase, quien lea la
excepción después de leer el «No» pensaría que se contradicen.

## ¿La primera frase es suficientemente directa?

**Sí.** Empieza con **«No.»** — punto y aparte. Es la única forma correcta de
abrir esta pregunta: cualquier matiz antes del «no» se lee como un «depende».

Y la segunda frase hace el trabajo pesado: «la separación no depende del código
de la pantalla: está aplicada en la base de datos». Eso es lo que distingue esta
respuesta de la que daría cualquiera.

**Un matiz que conviene ver:** la respuesta corta dice «no puede consultar la
información **privada**». La palabra «privada» es la que deja sitio a la
excepción del segundo párrafo. Es deliberado y es correcto — pero si alguien
quisiera un «No» sin ninguna cualificación, tendría que quitar esa palabra, y
entonces la respuesta sería falsa. **No se recomienda quitarla.**

---

# Parte 8 · El equipo de Trazaloop

> **Pregunta**
>
> ¿Puede el equipo de Trazaloop acceder a los datos de mi empresa?

> **Respuesta corta**
>
> En la operación normal de la plataforma, no. La consola de administración no da a nuestro equipo ninguna vía para leer tus procesos, riesgos, documentos, evidencias ni tus consultas a Trazaloop Intelligence: solo ve datos administrativos —tu plan, tu consumo, tus miembros y los tickets de soporte que tú abres—.

> **Respuesta larga**
>
> Tampoco existe ninguna función que permita a nuestro equipo entrar a la plataforma haciéndose pasar por ti, ni añadirse a tu empresa: gestionar los miembros es potestad exclusiva de un administrador tuyo.
>
> Ahora la parte que no se puede omitir. Como en cualquier servicio alojado en la nube, la administración técnica de la infraestructura implica acceso a los sistemas donde reside la información, y las copias de respaldo contienen todo. Esos accesos técnicos excepcionales pueden ser necesarios para seguridad, soporte, recuperación o cumplimiento legal, y deben limitarse a personal autorizado y a lo estrictamente necesario.
>
> No afirmamos que ese acceso sea imposible, porque no lo es en ningún servicio gestionado. Lo que sí decimos es que la aplicación no lo ofrece como función.
>
> Sobre el registro: las operaciones que se hacen a través de la plataforma quedan registradas. Los accesos administrativos a la infraestructura los registra el proveedor conforme a sus propias herramientas, y eso no lo controla Trazaloop.

## Las dos clases de acceso, separadas

**ACCESO NORMAL DE LA APLICACIÓN — no existe.**

La consola de administración no ofrece ninguna vía para leer procesos, riesgos,
documentos, evidencias ni consultas a Intelligence. Solo datos administrativos:
plan, consumo, miembros y los tickets que la propia empresa abre. No hay
suplantación, y el equipo de Trazaloop no puede añadirse a una empresa.

*Verificado:* de todas las tablas con `organization_id`, solo **siete** tienen
política de plataforma, y las siete son administrativas o de soporte.

**ACCESO EXCEPCIONAL DE INFRAESTRUCTURA — existe, y se dice.**

Administrar la infraestructura implica acceso a los sistemas donde reside la
información, y las copias de respaldo contienen todo. Puede ser necesario para
seguridad, soporte, recuperación o cumplimiento legal.

*Verificado:* el registro de auditoría cubre operaciones de la aplicación, **no**
accesos de infraestructura. Por eso la respuesta no promete que todo acceso
excepcional quede auditado — y no puede añadirse esa promesa.

## ¿Se entiende sin que la plataforma suene insegura?

**Sí**, y el mecanismo es una sola frase: *«Como en cualquier servicio alojado en
la nube…»*. Eso convierte la admisión en una característica del modelo de nube,
no en un defecto de Trazaloop. Cualquiera que sepa cómo funciona un servicio
gestionado lo reconocerá; quien no lo sepa, aprende algo cierto.

El cierre remata: *«No afirmamos que ese acceso sea imposible, porque no lo es en
ningún servicio gestionado. Lo que sí decimos es que la aplicación no lo ofrece
como función.»*

## ¿Hay algún «nunca» absoluto?

**No, y se comprobó palabra por palabra.** No aparece «nunca», ni «imposible»
referido a Trazaloop, ni «jamás», ni «bajo ninguna circunstancia». El único
absoluto del texto es *«gestionar los miembros es potestad exclusiva de un
administrador tuyo»*, que sí está verificado: las políticas de `memberships` solo
admiten `is_org_admin`.

**La salvedad de infraestructura no puede quitarse.** Está escrita en el
metadato de la respuesta, y sin ella la respuesta sería falsa.

---
# Parte 9 · La IA y las otras empresas

> **Pregunta**
>
> ¿La IA utiliza información de otras empresas para responderme?

> **Respuesta corta**
>
> No. La información de una empresa no se usa como contexto de Trazaloop Intelligence para otra empresa.

> **Respuesta larga**
>
> Cada consulta se compone en nuestro servidor, con la sesión de quien pregunta y acotada a su empresa activa. No existe ningún modo en que el contenido de una empresa entre en la respuesta de otra.
>
> El modelo tampoco puede ir a buscarlo: no tiene acceso a la base de datos ni herramientas de búsqueda.

## ¿Dice con claridad lo que tiene que decir?

Sí. La afirmación exigida es: *los datos de una organización no se usan como
contexto de Trazaloop Intelligence para otra organización.* La respuesta la dice
dos veces, con palabras distintas:

- corta: «La información de una empresa **no se usa como contexto** de Trazaloop
  Intelligence para otra empresa.»
- larga: «**No existe ningún modo** en que el contenido de una empresa entre en
  la respuesta de otra.»

Y empieza con «No.» a secas.

## El fundamento técnico, aparte del texto del cliente

Esto **no** va en la respuesta; es lo que la sostiene.

1. **El contexto lo compone el servidor**, no el navegador ni el modelo. El
   constructor lee la base con la sesión de quien pregunta.
2. **Acotado por `organization_id`** a la empresa activa. La misma seguridad a
   nivel de fila que aísla toda la plataforma aísla también lo que entra en la
   consulta: si la persona no puede leer un registro, el constructor tampoco.
3. **Cero usos del cliente administrativo** en todo `lib/ai/context/`. Es el
   punto que cierra el argumento: un cliente con privilegios elevados ahí
   saltaría la regla anterior, y no lo hay.
4. **El modelo no recibe herramientas.** Ni base de datos, ni búsqueda, ni
   archivos, ni código. No puede ir a buscar lo que no se le dio.

Las cuatro son verificables leyendo el código, y la 3 se midió contando.

## Nota

La respuesta habla del **contexto**, que es lo que la pregunta pregunta. Lo que
el proveedor haga después con lo que recibe es otra pregunta, y tiene sus dos
respuestas propias: la 10 y la 11. La separación es correcta — mezclarlas haría
las tres peores.

---

# Parte 10 · El entrenamiento

> **Pregunta**
>
> ¿Mis datos se utilizan para entrenar modelos de inteligencia artificial?

> **Respuesta corta**
>
> No. Trazaloop no entrena modelos con la información de tu empresa, y no ha activado la autorización que permitiría al proveedor usarla para entrenar los suyos. Su documentación oficial establece que los datos enviados a su interfaz de programación no se usan para entrenar ni mejorar sus modelos salvo que el cliente lo autorice expresamente, y Trazaloop no lo ha autorizado.

> **Respuesta larga**
>
> Conviene separar tres cosas, porque se confunden con facilidad.
>
> Lo que hace Trazaloop: no entrenamos modelos con tu información, ni propios ni de nadie.
>
> Lo que dice la política del proveedor: por defecto, lo que se le envía por su interfaz de programación no alimenta el entrenamiento de sus modelos. Esa autorización existe y es del cliente activarla.
>
> Lo que Trazaloop ha decidido: no activarla. Es una configuración de nuestra cuenta, no una promesa del proveedor.
>
> Lo que sí se le pide en cada consulta: que no almacene el contenido en sus repositorios. Eso reduce lo que se guarda, pero no es lo mismo que un acuerdo de retención cero — ver la pregunta sobre cuánto tiempo puede conservarlo.

## Los dos hechos, y cómo la respuesta los separa

| Hecho | De dónde viene | Dónde está en la respuesta |
|---|---|---|
| El proveedor no usa los datos de su interfaz de programación para entrenar, **salvo autorización expresa del cliente** | Documentación oficial, consultada el 31/08/2026 | «Lo que dice la política del proveedor» |
| **Trazaloop no ha activado** esa autorización | Confirmación de la dirección del 31/08/2026 | «Lo que Trazaloop ha decidido» |

La respuesta larga los separa con encabezados propios, y añade un tercero —«Lo
que hace Trazaloop»: no entrenamos modelos con tu información— que es el que la
mayoría de la gente cree que está preguntando.

Y remata la distinción con una frase que es el corazón de la respuesta:

> «Es una **configuración de nuestra cuenta**, no una promesa del proveedor.»

Esa frase es lo que impide que se lea como si el proveedor hubiera prometido
algo. Si desapareciera, la respuesta cambiaría de significado.

## ¿Hay alguna promesa eterna?

**No.** No aparece «nunca», ni «jamás», ni «bajo ninguna circunstancia». La
salvedad del metadato lo deja escrito: *no se puede escribir que el proveedor no
entrenará nunca bajo ninguna circunstancia; lo que dice es que no lo hace salvo
autorización.* Y esa autorización es nuestra, así que un «nunca» sería una
promesa sobre nuestra propia conducta futura disfrazada de política ajena.

## Lo que hay que saber

Si algún día se activara esa autorización, **esta respuesta pasa a ser falsa**.
No se degrada: se vuelve falsa. Está anotado en su salvedad, y conviene que
quien administre la cuenta del proveedor lo sepa.

---

# Parte 11 · La retención

> **Pregunta**
>
> ¿Cuánto tiempo puede conservar el proveedor de IA la información de una consulta?

> **Respuesta corta**
>
> Según la documentación oficial del proveedor, las peticiones y respuestas pueden conservarse HASTA 30 DÍAS con fines de prestación del servicio y vigilancia de abusos, salvo que una obligación legal o la protección del servicio exijan más tiempo. Trazaloop no tiene contratado un acuerdo de retención cero, así que ese plazo es el que aplica.

> **Respuesta larga**
>
> «Hasta 30 días» no significa «siempre 30 días» ni «siempre menos»: es un máximo, con las dos excepciones que la propia política nombra.
>
> Trazaloop pide en cada consulta que el contenido no se almacene en los repositorios de la interfaz de programación. Esa petición reduce lo que se guarda, pero NO es un acuerdo de retención cero: son dos mecanismos distintos, y decimos con claridad que el segundo no lo tenemos.
>
> Por la misma razón no afirmamos que ninguna persona del proveedor pueda acceder nunca a contenido almacenado por él. Existen controles contractuales para eso y no declaramos tenerlos.
>
> Lo que sí controlamos: qué se envía. Solo la pregunta y el contexto que el servidor seleccionó para responderla, con tus permisos.

## La semántica exigida, comprobada

| Debe decir | ¿Lo dice? | Dónde |
|---|---|---|
| Hasta 30 días donde aplique | **sí** | corta, en mayúsculas: «HASTA 30 DÍAS» |
| Que es un máximo, no un plazo fijo | **sí** | larga: «no significa "siempre 30 días" ni "siempre menos"» |
| Las excepciones legales y de protección del servicio | **sí** | corta y larga |
| Que no hay retención cero contratada | **sí** | corta, última frase |
| Que `store:false` no es retención cero | **sí** | larga, segundo párrafo |

Todo está. El problema no es lo que dice.

## ¿La entiende un cliente no técnico?

**Es la más difícil de leer de las quince**, y es la única que se recomienda
retocar. Tres razones concretas:

1. **La respuesta corta tiene una sola frase de 47 palabras**, con dos
   subordinadas antes de llegar al verbo principal. Las otras catorce abren con
   una frase de menos de veinte.
2. **«Interfaz de programación»** aparece dos veces. Es la traducción correcta de
   *API*, pero un cliente no técnico no reconoce ninguna de las dos, y aquí no
   aporta nada: podría decir «el servicio del proveedor».
3. **«Retención cero»** se usa antes de explicarse. Se explica en el párrafo
   siguiente —que no es lo mismo que pedir que no se almacene—, pero quien lea
   solo la corta se queda con un término que no conoce.

Lo que **no** hay que tocar: la mención explícita de que no tenemos retención
cero. Podría parecer que resta. Suma: quien hace esta pregunta sabe que la
retención cero existe, y callarlo sería lo que restaría.

Tampoco hay que tocar el tercer párrafo —el que dice que no afirmamos que nadie
del proveedor pueda acceder nunca—. Es el mismo tipo de límite declarado que
hace creíble la respuesta 4.

## Versión alternativa · opcional

Solo la respuesta corta; la larga se deja igual. Dice exactamente lo mismo, en
tres frases:

> Hasta 30 días. Según la documentación oficial del proveedor, las preguntas y
> respuestas pueden conservarse ese tiempo para prestar el servicio y vigilar
> abusos, y más si una obligación legal o la protección de su servicio lo exigen.
> Trazaloop no tiene contratado un acuerdo de retención cero, así que ese es el
> plazo que aplica.

Cambia tres cosas: abre con el dato, parte la frase larga, y sustituye «peticiones
y respuestas a su interfaz de programación» por «preguntas y respuestas».
Conserva las cinco exigencias de la tabla.

**Si se adopta, hay que conservar la salvedad del metadato tal cual.** La base
rechaza publicar una respuesta marcada con salvedad que no la tenga escrita.

---
# Parte 12 · El proveedor de IA, y cómo nombrarlo

## Lo que se comprobó hoy, sin inventar nada

**Producción no tiene proveedor de IA configurado.** Las variables del proyecto
de Producción son cinco, y ninguna es de IA:

```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
TEXTILES_MODULE_ENABLED
```

No existe `QUALITY_AI_PROVIDER`, ni `QUALITY_AI_API_KEY`, ni
`QUALITY_MODULE_ENABLED`. Y el código es explícito sobre qué pasa entonces: un
proveedor que no se reconoce **no cae en silencio sobre otro**, cae sobre el
doble determinista, que no llama a nadie.

Es coherente con que Producción esté en la migración **0111**: ni Quality ni
Intelligence existen allí.

**Preview sí lo tiene.** `QUALITY_AI_PROVIDER`, `QUALITY_AI_MODEL` y
`QUALITY_AI_REASONING_EFFORT` están definidas, las tres marcadas **Sensitive**,
así que su valor no se muestra al listarlas. **No se leyó ni se descifró
ninguna**, y no se va a hacer para esto.

**El código admite dos:** `openai` y `anthropic`, cada uno con su adaptador. Con
cualquier otro valor, o sin valor, cae en el doble.

## Qué significa para la revisión

Que la pregunta abierta cambia de forma. No es «qué proveedor está contratado en
Producción»: hoy en Producción **no hay ninguno operando**. La pregunta real es
**cuál está configurado en Preview**, que es donde Quality e Intelligence
funcionan, y que es el que operará el día que Producción reciba las migraciones.

Y aparece una segunda, que no estaba: **si Producción no llama a ningún
proveedor de IA, ¿debe la política vigente en Producción describir uno?**

## La recomendación

**En la política de privacidad: no nombrarlo.** Mantener «proveedor de
inteligencia artificial contratado por la Corporación», como está hoy en el
§ 11 y en el § 18.

Tres razones:

1. **El § 11 ya cumple** identificando la *categoría* de encargado, que es lo que
   permite a un titular saber qué clase de tercero trata su información.
2. **Nombrarlo obliga a mantenerlo.** Cambiar de proveedor pasaría a exigir una
   versión nueva de la política, y una versión nueva **obliga a todo el mundo a
   aceptar otra vez**. Es un coste alto por un dato que no cambia el derecho de
   nadie.
3. **Producción no tiene proveedor hoy.** Nombrar uno concreto en el documento
   que Producción sirve describiría algo que allí no ocurre.

*Si un abogado determina que la normativa aplicable exige identificar
nominalmente al encargado, esta recomendación cede: eso es juicio jurídico y no
se emite aquí.*

**En la FAQ: atribuir a OpenAI lo que es de OpenAI.**

Las respuestas 10 y 11 dicen «la documentación oficial del proveedor», y la
fuente que llevan en su metadato es
`https://developers.openai.com/api/docs/guides/your-data`, consultada el
31/08/2026. Es documentación de **OpenAI**, y el texto se comprobó contra ella.

Aquí hay una asimetría que conviene ver antes de decidir:

> Si el proveedor configurado en Preview fuera **Anthropic** y no OpenAI, las
> respuestas 10 y 11 estarían citando la política de un proveedor distinto del
> que se usa. Los plazos y las condiciones no son necesariamente los mismos.

Por eso la recomendación de la FAQ es doble:

- **Antes de publicar la 10 y la 11**, confirmar qué proveedor está configurado
  en Preview. Es una consulta a la consola de Vercel, no una investigación.
- **Si es OpenAI**, sustituir «el proveedor» por «OpenAI» **solo en la frase que
  atribuye la política**, dejando el resto genérico. Una afirmación citada gana
  fuerza cuando se dice de quién es.
- **Si es Anthropic**, las dos respuestas hay que rehacerlas contra su
  documentación. No es un retoque.

**Ninguna de las otras trece depende del proveedor.**

---

# Parte 13 · La identidad legal y el contacto

Extraído literalmente del borrador. No se añadió ni se completó nada.

| Campo | Lo que dice el documento |
|---|---|
| Razón social | CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL |
| NIT | 901835846-6 |
| Nombre comercial | Trazaloop |
| Representante legal | Jhorman Mena Ledezma |
| Cargo | Director General |
| Domicilio | Medellín, Colombia |
| Dirección | Carrera 43A #15 Sur – 15 |
| Teléfono | +57 324 3268865 |
| Correo general | contacto@idendi.org |
| **Correo de privacidad y habeas data** | **contacto@idendi.org** |
| Correo de soporte | contacto@cirquiloconsultores.com |
| Sitio oficial | https://www.trazaloop.com |
| Jurisdicción | Colombia · Ley 1581 de 2012, Decreto 1074 de 2015, Ley 527 de 1999, Ley 1480 de 2011 y Ley 2439 de 2024, **como referencia y sin declarar cumplimiento** |
| Autoridad | «la autoridad competente», sin nombrarla |

## Lo que falta o no encaja

**1 · El § 21 fecha el documento en su versión anterior.** Dice versión **1.0**,
aprobada y vigente desde el **27 de julio de 2026**, y «última actualización» ese
mismo día. La cabecera dice versión 1.1 con las fechas en blanco. Un documento
que se contradice sobre qué versión es no debería publicarse. **Hay que decidir
las dos fechas y corregir el § 21.**

**2 · El canal alterno es una dirección postal.** El § 1.1 ofrece
contacto@idendi.org y, como alterno, la dirección de Medellín. No hay teléfono
—aunque el § 1 lo tiene— ni formulario. Conviene confirmar que las peticiones de
habeas data que lleguen por correo postal se atienden, o añadir el teléfono como
alterno.

**3 · Un solo correo para dos funciones.** contacto@idendi.org es a la vez el
general y el de privacidad. Es válido y es común en organizaciones de este
tamaño; solo conviene saberlo, porque mezcla la correspondencia general con la de
habeas data, que tiene plazos legales.

**4 · La autoridad de vigilancia no se nombra.** El § 15 permite «presentar
quejas ante la autoridad competente» sin decir cuál. En Colombia es la
Superintendencia de Industria y Comercio. Nombrarla es más útil para el titular;
si se omite deliberadamente, es una decisión de abogado.

**5 · Dos dominios distintos.** El correo legal es `@idendi.org` y el de soporte
`@cirquiloconsultores.com`, ninguno de los dos `@trazaloop.com`. El documento no
explica la relación entre las tres marcas. Un cliente que escriba a
`privacidad@trazaloop.com` no llegará a nadie.

**6 · Resend.** Figura como encargado en el § 11 para envío de correos de
autenticación. Su única aparición en todo el repositorio está **dentro de una
prueba, y como término prohibido**: no hay integración de Resend en el código de
producción. Los correos de autenticación los envía el proveedor de identidad. Hay
que **confirmarlo o quitarlo del § 11** — declarar un encargado que no trata nada
es tan inexacto como omitir uno que sí.

**Nada de lo anterior se ha modificado.** Los seis puntos son para decidir.

---
# Parte 14 · ¿Se publican las quince?

## Recomendación: **B · publicar un subconjunto**

**Trece ahora. Dos después de una comprobación de una línea.**

| | Respuestas | Condición |
|---|---|---|
| **Publicar ya** | 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15 | Ninguna |
| **Publicar tras comprobar el proveedor** | 10 · entrenamiento · 11 · retención | Confirmar en la consola de Vercel qué proveedor está configurado en Preview |

## Por qué esas dos, y no por prudencia general

Las dos son las únicas que citan la documentación de un tercero, y la fuente que
llevan escrita en su metadato es de **OpenAI**. El código admite dos proveedores
—`openai` y `anthropic`—, y el valor configurado en Preview está marcado como
sensible, así que no se leyó.

Si es OpenAI, las dos se publican tal cual: su contenido está verificado contra
esa documentación y las dos confirmaciones de la dirección ya están incorporadas.
Si fuera Anthropic, estarían citando la política de otro proveedor y habría que
rehacerlas.

**No es una duda sobre el texto. Es una comprobación de configuración**, y se
resuelve mirando una variable.

## Lo que NO justifica retener nada

- Las quince están en `verified` o `verified_with_qualifier`. La barrera de
  publicación de la base las dejaría pasar a todas.
- Las dos con salvedad **la llevan escrita**; si alguien la borrara al editar, la
  base rechazaría publicarlas.
- Ninguna promete soporte, ni certifica cumplimiento, ni escribe una cifra
  comercial, ni presenta algo como futuro. Se comprobó por prueba automática.

## Sobre publicar sin la política

Trece de las quince pueden publicarse **antes** que la política v1.1, y no hay
contradicción: hablan de cómo funciona la plataforma, no de qué política rige.

Las dos de IA sí conviene que salgan **después** o **a la vez** que la v1.1. Hoy
la política vigente es la preliminar de CPR, que no menciona la IA; publicar
respuestas detalladas sobre el tratamiento de datos por un proveedor de IA
mientras el documento legal vigente no lo nombra dejaría dos textos públicos que
no coinciden. Es exactamente el bloqueo editorial que PE-02A identificó.

**Orden recomendado:** las trece → la política v1.1 → las dos de IA.

---

# Parte 15 · Hoja de decisión

Marcar y devolver. Nada de esto se ejecuta hasta que vuelva firmado.

## La política de privacidad v1.1

```
[ ] APRUEBO           el texto, con las correcciones marcadas abajo
[ ] SOLICITO CAMBIOS
```

**Las cuatro correcciones que hay que resolver aunque se apruebe:**

```
[ ] quitar el recuadro «Este documento es un BORRADOR» de la cabecera
[ ] quitar el recuadro «Pendiente de confirmación» del § 18.3
[ ] corregir el § 21 Vigencia · hoy dice v1.0 y 27 de julio de 2026
[ ] Resend en el § 11 · se confirma  [ ]   se quita  [ ]
```

**Y la decisión de formato:**

```
[ ] añadir un intérprete de Markdown a /privacy y a /legal/accept
[ ] reescribir el documento en prosa plana, sin tablas
```

**Fechas, si se aprueba:**

```
fecha de aprobación:        ____________________
fecha de entrada en vigor:  ____________________
```

## Las quince respuestas de seguridad

```
FAQ 01  Cómo protege Trazaloop la información         [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 02  ¿Puede otra empresa ver mi información?       [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 03  Cómo separa la información entre empresas     [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 04  ¿Puede el equipo de Trazaloop acceder?        [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 05  Archivos y evidencias                         [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 06  Permisos de las personas                      [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 07  Intelligence y la información de la empresa   [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 08  ¿La IA usa datos de otras empresas?           [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 09  Qué recibe el proveedor de IA                 [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 10  ¿Se usan mis datos para entrenar modelos?     [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 11  Cuánto conserva el proveedor de IA            [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 12  ¿El modelo accede a la base de datos?         [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 13  ¿Intelligence decide o aprueba?               [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 14  Anonimato en las encuestas                    [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
FAQ 15  Qué información puede hacerse pública         [ ] APRUEBO  [ ] CAMBIAR  [ ] RETENER
```

**Las dos alternativas opcionales de este documento:**

```
[ ] FAQ 01 · añadir la viñeta de separación de ambientes   (parte 6)
[ ] FAQ 11 · adoptar la respuesta corta reescrita           (parte 11)
```

## Lo que hay que averiguar antes de publicar la 10 y la 11

```
proveedor configurado en Preview:   [ ] OpenAI   [ ] Anthropic   [ ] otro: __________
```

## Firma

```
nombre:  ____________________     fecha:  ____________________
```

---

## Qué pasa después

Nada, hasta que esta hoja vuelva. Cuando vuelva, lo que sigue está en
[`PE_02B6_B5B_PUBLICATION_PLAN.md`](PE_02B6_B5B_PUBLICATION_PLAN.md), con el
orden de publicación y el plan de reaceptación.

**Recordar lo que no se deshace:** publicar la política obliga a todo el mundo a
aceptar de nuevo, y no existe «despublicar». Corregir una política publicada
significa redactar una v1.2 y volver a pedir aceptación. Las respuestas de la
FAQ, en cambio, se corrigen y se retiran sin consecuencias.
