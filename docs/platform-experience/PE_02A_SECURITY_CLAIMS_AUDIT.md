# PE-02A · Auditoría de afirmaciones de seguridad

**Regla de este documento:** ninguna frase se propone para publicar sin decir en
qué se apoya y con qué grado de certeza. Lo que no se pudo comprobar se marca
como no comprobado, **no se suaviza hasta que parezca cierto**.

**Método:** consultas de solo lectura contra la base local (0154, idéntica en
esquema a Staging), lectura de las 154 migraciones y del código de servidor.
Producción no se tocó.

**Escala de clasificación**

| Código | Significado |
|---|---|
| **V** | VERIFIED — comprobado en esquema o código, reproducible |
| **VQ** | VERIFIED WITH QUALIFIER — cierto con una salvedad que hay que decir |
| **NV** | NOT VERIFIED — no se pudo comprobar con lo que hay en el repositorio |
| **F** | FALSE / MUST NOT CLAIM — publicarlo sería falso |
| **EXT** | EXTERNAL POLICY VERIFICATION REQUIRED — depende de un tercero |

---

## 1 · Aislamiento entre empresas · el número exacto

Medido el 2026-08-30 contra la base local en 0154:

| Medida | Valor |
|---|---|
| Tablas en `public` | **282** |
| Tablas con RLS activada | **275** |
| Tablas **sin** RLS | **7** |
| Columnas llamadas `organization_id` | **321** |
| Columnas `organization_id` en tablas **sin** RLS | **0** |
| Políticas RLS | **630** |
| Claves foráneas **compuestas** que incluyen `organization_id` | **409** |
| De esas, con la forma `(organization_id, x) → (organization_id, x)` | **409 · el 100 %** |

### Las 7 tablas sin RLS, una por una

`quality_ai_sources` · `quality_automation_event_catalog` ·
`quality_automation_event_contracts` · `quality_automation_rule_templates` ·
`quality_automation_source_fields` · `quality_automation_sources` ·
`quality_management_review_input_catalog`

Las siete son **catálogos del producto**: ninguna tiene `organization_id`, en
ninguna hay un dato de una empresa. Las siete tienen `revoke all … from anon,
authenticated` seguido de `grant select … to authenticated`: se leen con sesión
y no se leen sin ella.

**Clasificación: V.** «Todas las tablas que contienen datos de una empresa
tienen control de acceso a nivel de fila» es literalmente cierto: cero
excepciones sobre 321 columnas.

### Ninguna política abre la puerta

Consulta ejecutada: políticas `SELECT`/`ALL` sobre tablas con `organization_id`
cuya condición sea nula o `true`. **Resultado: ninguna.** Todas pasan por
`is_org_member(...)`, `has_org_role(...)` o una función de permiso más estrecha
(`quality_can_read_person`, `quality_manages_suppliers`…).

### Las claves foráneas compuestas

Las 409 tienen la forma `(organization_id, hijo) → (organization_id, padre)`.
Ejemplo real:

```sql
quality_measurements
  FOREIGN KEY (organization_id, indicator_id)
  REFERENCES quality_indicators(organization_id, id) ON DELETE CASCADE
```

Esto significa que **la base rechaza** una fila que apunte al registro de otra
empresa, aunque el código de la aplicación lo intentara. Es una segunda barrera
independiente de la RLS.

**Clasificación: V.**

### El anónimo

Solo una política del esquema alcanza al rol anónimo:
`legal_documents_select_public`, `using (status = 'active')` — los documentos
legales publicados. Todo lo demás exige `auth.uid()`.

**Clasificación: V.**

---

## 2 · ¿Puede otra empresa ver mi información? · §6 del encargo

**La respuesta más fuerte que se puede sostener:**

> **No.** La separación entre empresas no depende del código de la aplicación:
> está aplicada en la base de datos. Cada consulta se resuelve con la identidad
> de quien pregunta, y solo devuelve registros de las empresas a las que esa
> persona pertenece. Además, la propia base impide que un registro apunte a
> información de otra empresa.

**Clasificación: V** para las tres frases.

**Salvedades que deben acompañarla en la respuesta larga**, porque son
superficies públicas **intencionales** y no excepciones ocultas:

| Superficie | Qué expone | Quién decide |
|---|---|---|
| Pasaporte textil compartido (`/textile-passport-share/[token]`) | La vista del pasaporte que la empresa **publicó**, resuelta por `resolve_textile_passport_share` | La empresa, al generar el enlace |
| Encuesta de voz de cliente (`/survey/[token]`) | El formulario de la campaña, por `quality_resolve_survey_token` | La empresa, al invitar |
| Documentos legales | Términos y privacidad activos | Trazaloop |

Ninguna de las tres consulta tablas directamente con el rol anónimo: `anon` no
tiene privilegios sobre ninguna tabla del dominio, y las tres pasan por
funciones de la base que resuelven el token.

**No decir:** «nadie fuera de tu empresa puede ver nada» — sería falso en cuanto
la propia empresa publica un pasaporte. **Clasificación de esa frase: F.**

---

## 3 · Autorización dentro de la empresa

| Hecho | Comprobación | Clase |
|---|---|---|
| Tres papeles de empresa: `admin`, `quality`, `consultant` | tabla `roles` | **V** |
| Las políticas de escritura exigen papel, no solo pertenencia | 630 políticas; las de escritura usan `has_org_role(...)` | **V** |
| Hay permisos más finos que el papel para datos de personas | `quality_can_read_person`, `quality_manages_people` en las políticas de `quality_people`, `quality_person_competencies`, `quality_performance_evaluations` | **V** |
| Entrar a un módulo **no** decide qué se puede hacer dentro | PE-01B: la resolución de acceso no lee el papel; los permisos se evalúan en cada política | **V** |
| Solo un administrador de empresa gestiona miembros | políticas de `memberships`: las cuatro exigen `is_org_admin(...)` | **V** |

---

## 4 · Archivos y almacenamiento

Tres cubos, medidos en la base:

| Cubo | ¿Público? | Lectura |
|---|---|---|
| `evidences` | **no** | `is_org_member(carpeta[1])` — la carpeta **es** el `organization_id` |
| `trazadocs-documents` | **no** | `is_org_member(carpeta[1])` |
| `organization-assets` | **no** | `is_org_member(...)`; escritura y borrado exigen `is_org_admin(...)` |

**Clasificación: V.** «Tus archivos no son públicos y solo se descargan con una
sesión que pertenece a tu empresa» es exacto. Ningún cubo está marcado público;
no hay URL adivinable que sirva un archivo.

**Lo que NO se puede afirmar:** cifrado en reposo de los objetos, ubicación
geográfica del almacenamiento, o retención tras el borrado. Nada de eso está en
el repositorio. **Clasificación: EXT.**

---

## 5 · `service_role` en tiempo de ejecución · la salvedad honesta

El cliente administrativo se usa en **seis** archivos de servidor:
`lib/auth/public-registration.ts`, `lib/db/textiles-evidences.ts`,
`lib/db/storage-deletion.ts`, `lib/db/storage-intents.ts`,
`lib/db/module-access.ts` (solo el camino de superadministrador) y
`lib/db/trazadocs-master.ts`.

Su uso es de una forma concreta y documentada: **finalizadores de subida**. La
función de la base ya **no es ejecutable por `authenticated`**, el actor viaja
explícito —bajo `service_role`, `auth.uid()` es nulo— y la propia función
revalida pertenencia, papel, propiedad del intent, estado, vigencia, acceso
comercial y cuota. El tamaño y el tipo del archivo se leen del objeto físico,
nunca de lo que dice el cliente.

**Clasificación: VQ.** La afirmación publicable es:

> Las operaciones internas del servidor que necesitan privilegios elevados están
> acotadas a pasos concretos y vuelven a comprobar tus permisos antes de hacer
> nada.

**No decir:** «Trazaloop nunca usa credenciales privilegiadas». **Clase: F.**

---

## 6 · ¿Puede el equipo de Trazaloop acceder a mis datos? · §7 del encargo

Esta es la pregunta que más fácil sería contestar de más.

### Lo que el personal de plataforma **sí** puede ver, medido

Solo **7** tablas con `organization_id` tienen una política que nombre a
`is_platform_staff()` o `is_platform_superadmin()`:

```
intelligence_limit_overrides   intelligence_usage_limits
organization_subscriptions     subscription_plan_history
support_tickets                support_ticket_messages
support_ticket_status_history
```

Es decir: **límites de consumo de IA, plan y suscripción, y los tickets de
soporte que la propia empresa escribe.**

Además hay vistas y funciones de plataforma:

- `v_platform_organizations` — datos de la empresa y **conteos agregados**
  (miembros, materiales, evidencias, lotes, cálculos). No contenido.
- `v_platform_organization_members` — nombre, correo, papel y estado de los
  miembros.
- `organization_authoring_context` — perfil de la empresa (nombre, sector,
  actividad, productos/servicios).
- `v_intelligence_usage_platform` — consumo por empresa. La migración 0141
  dice, y el SQL lo cumple: **no expone `question` ni `answer`**.

### Lo que **no** puede hacer

- **No** hay suplantación: `impersonat|act_as|login_as` no aparece ni en el
  código ni en las migraciones.
- **No** puede darse de alta en una empresa: las cuatro políticas de
  `memberships` exigen `is_org_admin(...)`, y `is_platform_staff()` no aparece
  en ninguna.
- **No** hay ninguna política que le dé lectura sobre riesgos, procesos,
  documentos, evidencias, auditorías, personas, proveedores ni respuestas de IA.

### Lo que sigue siendo cierto y hay que decir

Trazaloop se opera sobre Supabase y Vercel. **Quien administra el proyecto de
base de datos tiene, por definición, acceso técnico a la base.** Eso no está en
el código y no se arregla con una política: es cómo funciona administrar una
base de datos. Igual que los respaldos, que contienen todo.

### La redacción defendible

> **El personal de Trazaloop no accede al contenido de tu empresa como parte de
> la operación normal.** La aplicación no le da ninguna vía para leer tus
> procesos, riesgos, documentos, evidencias ni consultas a Trazaloop
> Intelligence: solo ve datos administrativos —tu plan, tu consumo, tus miembros
> y los tickets de soporte que tú abres—. No existe ninguna función que permita
> a nuestro equipo entrar a la plataforma haciéndose pasar por ti, ni añadirse a
> tu empresa.
>
> Como en cualquier servicio alojado, la administración técnica de la
> infraestructura implica acceso a los sistemas donde residen los datos. Ese
> acceso queda restringido a las tareas de operación y mantenimiento.

**Clasificación: VQ.** El primer párrafo es **V** en todas sus frases; el
segundo es la salvedad que impide que el conjunto sea una mentira.

**MUST NOT CLAIM (F):**
«Ni los administradores de Trazaloop pueden acceder nunca a tus datos» ·
«conocimiento cero» · «solo tú tienes la clave».

**¿Se puede afirmar algo más fuerte?** Solo con controles que hoy no existen:
registro de accesos administrativos, cifrado por empresa con clave que Trazaloop
no custodie, o una atestación externa. Ninguno está en el repositorio. **Hasta
entonces, la redacción de arriba es el techo.**

---

## 7 · Trazaloop Intelligence · aislamiento entre empresas · §8 del encargo

Verificado contra QUALITY-12 y QUALITY-13B5.

| Afirmación | Evidencia | Clase |
|---|---|---|
| El contexto lo compone el **servidor**, no el modelo | `lib/ai/context/builder.ts` | **V** |
| Se lee con la **sesión de quien pregunta**, con su RLS | `adapters.ts`: «no hay un cliente administrativo en este archivo, y no puede haberlo» — comprobado: ninguna importación de `createAdminClient` | **V** |
| Cada consulta va además acotada por `organization_id` | builder §16 | **V** |
| **El modelo no consulta la base** | no hay herramientas de base en la petición: el adaptador de OpenAI se documenta «sin herramientas … ni búsqueda web, ni ficheros, ni intérprete» | **V** |
| No hay SQL generado por el modelo | no existe superficie donde ejecutarlo | **V** |
| Las fuentes conocen su clase de privacidad | `quality_ai_sources`: 26 fuentes, clases `open`, `restricted`, `people`, `anonymous`, con `permission_note` | **V** |
| Lo que la persona no puede ver no entra, ni como dato ni como resumen | la lectura pasa por la RLS de esa persona | **V** |
| Las citas se quedan dentro del conjunto de fuentes accesibles | `quality_ai_add_reference` rechaza cualquier fuente ausente de `quality_ai_sources` (defecto corregido en 0154) | **V** |
| Los números los calcula el código, no el modelo | QUALITY-12 §58, adaptadores | **V** |
| Se guarda con qué modelo y proveedor se produjo cada respuesta | `quality_ai_runs` | **V** |

**La redacción defendible:**

> **No.** Trazaloop Intelligence solo trabaja con la información de tu empresa, y
> solo con la parte que tú tienes permiso para ver. La información que se envía
> al modelo la selecciona nuestro servidor consultando la base con **tu** sesión
> y tus permisos: si tú no puedes ver un dato, no entra en la consulta, ni
> siquiera resumido. El modelo **no tiene acceso a la base de datos** ni puede
> hacer búsquedas por su cuenta. Los datos de una empresa nunca forman parte del
> contexto de otra.

**Clasificación: V.** La última frase —la que §8 exige— es sostenible tal cual.

**Salvedad de la voz de cliente anónima:** cuando una campaña es anónima, la
base **rechaza** guardar cliente, contacto, nombre, correo o invitación junto a
la respuesta (disparador de 0126), y las fuentes `customer_comment` y
`customer_metric` están marcadas `anonymous` con la nota «sin identidad,
nunca». Es decir: la IA no puede revelar quién respondió porque **ese dato no
existe**. **Clasificación: V**, y es una afirmación fuerte que merece su propia
pregunta.

---

## 8 · Qué recibe el proveedor de IA

| Hecho | Evidencia | Clase |
|---|---|---|
| Recibe **solo** el contexto seleccionado y la pregunta | `builder.ts` + adaptadores | **V** |
| Se le pide `store: false` | `lib/ai/providers/openai.ts` | **V** |
| No se le habilitan herramientas, ni web, ni ficheros | mismo archivo | **V** |
| La clave del proveedor **no está en el repositorio**: se lee del entorno del servidor y no se imprime nunca | `lib/ai/config.ts` | **V** |
| Un proveedor mal configurado **no cae en otro**: cae en un doble determinista que no llama a nadie y lo dice en pantalla | `aiConfig()` | **V** |
| Qué hace el proveedor con lo recibido | **no consta en el repositorio** | **EXT** |

**Redacción publicable hoy:**

> Al proveedor del modelo se le envía únicamente la pregunta y el contexto que
> el servidor seleccionó para responderla, y se le pide expresamente que **no
> conserve** esa información. No se le da acceso a la base de datos, ni a
> internet, ni a tus archivos.

**Clasificación: V.** Nótese que dice «se le pide», no «no la conserva»: lo
primero es nuestro código, lo segundo es su política.

---

## 9 · ¿Mis datos se usan para entrenar modelos? · §9 del encargo

**No se responde de memoria y no se responde todavía.**

Lo que consta en el repositorio:

- El proveedor se elige por entorno (`QUALITY_AI_PROVIDER`), con adaptadores
  para OpenAI y Anthropic y un doble determinista.
- A OpenAI se le pide `store: false`.
- **No hay ningún documento en el repositorio** —ni contrato, ni anexo, ni nota—
  que declare la política de uso de datos del proveedor contratado.
- La **política de privacidad vigente** (`legal_documents`, `privacy`, activa)
  se declara «versión preliminar … para la beta de Trazaloop CPR» y **no nombra
  al proveedor de IA** entre los terceros.

**Clasificación: EXT — EXTERNAL POLICY VERIFICATION REQUIRED.**

**PE-02B no puede publicar esta respuesta** hasta que una persona verifique la
política oficial vigente del proveedor contratado y la refleje en la política de
privacidad. Lo que sí puede publicarse mientras tanto, porque es nuestro y es
cierto:

> Trazaloop no utiliza la información de tu empresa para entrenar modelos
> propios, y no comparte tu información con otras empresas. El tratamiento que
> el proveedor del modelo hace de lo que recibe se rige por su propia política;
> cuando se envía una consulta se le pide expresamente que no conserve el
> contenido.

Y aun esa versión debería esperar a que la política de privacidad mencione al
proveedor. Ver §12.

---

## 10 · Autenticación, respaldos, registros y cifrado

| Tema | Qué consta | Clase |
|---|---|---|
| Autenticación | Supabase Auth; sesión en cookie; contraseñas nunca en el repositorio | **V** |
| Recuperación de contraseña | flujo propio, probado (`test:auth-password-recovery`) | **V** |
| Respaldos | `docs/BACKUP_RESTORE.md`: respaldos diarios del plan de pago de Supabase, volcado manual antes de cambios mayores, y una advertencia — **el almacenamiento de archivos no entra en el volcado de la base** | **VQ** |
| Prueba de restauración | el documento la exige («un backup no probado no es un backup»); **no consta que se haya hecho** | **NV** |
| Registro de cambios | `audit_log` con `organization_id`, actor, tabla, operación, `diff`; el cliente no puede modificarlo ni borrarlo (probado en `isolation.test.ts` 8a) | **V** |
| Registro de **accesos** (quién leyó qué) | **no existe** | **NV** |
| Cifrado en tránsito | HTTPS por la plataforma de despliegue; no configurado en este repositorio | **VQ** — decir «la conexión con Trazaloop viaja cifrada», no más |
| Cifrado en reposo | propiedad del proveedor de infraestructura; sin evidencia en el repositorio | **EXT** |
| Residencia de datos | sin evidencia | **EXT** |
| Pruebas de intrusión, SOC 2, ISO 27001 | **no existen** | **F — nunca afirmarlo** |

---

## 11 · Tabla resumen de afirmaciones

| # | Afirmación propuesta | Clase |
|---|---|---|
| 1 | Otra empresa no puede ver tu información | **V** |
| 2 | La separación se aplica en la base de datos, no solo en la aplicación | **V** |
| 3 | La base impide que un registro apunte a información de otra empresa | **V** |
| 4 | Tus archivos no son públicos y exigen sesión de tu empresa | **V** |
| 5 | Tu papel decide qué puedes hacer dentro de un módulo | **V** |
| 6 | Solo un administrador de tu empresa gestiona a los miembros | **V** |
| 7 | Nadie de Trazaloop puede entrar haciéndose pasar por ti | **V** |
| 8 | Nadie de Trazaloop puede añadirse a tu empresa desde la aplicación | **V** |
| 9 | El personal de Trazaloop no accede al contenido en la operación normal | **VQ** (§6) |
| 10 | La IA no usa datos de otras empresas | **V** |
| 11 | El modelo no tiene acceso a la base de datos | **V** |
| 12 | Al proveedor se le pide que no conserve el contenido | **V** |
| 13 | Las respuestas anónimas de tus clientes no guardan identidad | **V** |
| 14 | Operaciones privilegiadas acotadas, que revalidan permisos | **VQ** (§5) |
| 15 | Hay respaldos | **VQ** (§10) |
| 16 | La conexión viaja cifrada | **VQ** |
| 17 | Cifrado en reposo / residencia de datos | **EXT** |
| 18 | El proveedor de IA no entrena con tus datos | **EXT** |
| 19 | Certificaciones, auditorías externas, pruebas de intrusión | **F** |
| 20 | Cifrado de extremo a extremo / conocimiento cero | **F** |

---

## 12 · Lo que hay que resolver antes de publicar

1. **La política de privacidad vigente es preliminar y solo habla de Trazaloop
   CPR.** Publicar una FAQ de seguridad que describa Quality, Textiles e
   Intelligence mientras el documento legal habla de otra cosa crea una
   contradicción entre dos textos públicos.
2. **La política de privacidad no menciona al proveedor de IA.** Ninguna
   respuesta sobre IA debería publicarse antes de que lo haga.
3. **No consta que se haya probado una restauración.** Mientras no conste, la
   respuesta sobre respaldos debe decir que existen, no que están probados.
4. **`legal_documents` no tiene pantalla de administración.** Si la FAQ va a
   remitir a la política de privacidad, conviene decidir si esa política pasa a
   ser administrable en el mismo movimiento.

Los cuatro son decisiones humanas, no bloqueos técnicos.
