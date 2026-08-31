# PE-02A · Propuesta de FAQ inicial

**32 preguntas.** No cien. Cada una responde algo que una persona pregunta de
verdad, y ninguna se publica sin poder responderse con exactitud.

**Cómo leer cada ficha**

- **V** = pública (sin sesión) · **A** = autenticada
- **Aplica a**: módulos a los que se refiere (≠ derecho de acceso, ver PEH-05)
- **Base**: dónde se comprobó lo que afirma
- **Estado**: `verificada` · `verificada con salvedad` · `pendiente de
  verificación externa` — y **lo pendiente no se publica** (PEH-11)

El estilo sigue §23: **respuesta corta primero**, detalle después. Aquí se
escribe la corta y, cuando hace falta, se indica qué lleva la larga.

---

## A · Primeros pasos · 4

**A1 · ¿Qué es Trazaloop?** · V · todos
> Una plataforma con varios módulos que comparten una sola cuenta. Cada módulo
> resuelve un ámbito —calidad, trazabilidad de contenido reciclado, textiles— y
> tu empresa entra a los que tenga activos.

*Base:* catálogo de módulos, portada. *Estado:* verificada.

**A2 · Acabo de entrar y no sé por dónde empezar.** · A · todos
> Empieza por la pantalla de módulos: es la puerta. Entra al módulo que uses y
> la portada de ese módulo te dirá qué requiere atención primero.

*Base:* PE-01B; portada de Quality (13B4). *Estado:* verificada.

**A3 · ¿Necesito una cuenta por cada módulo?** · V · todos
> No. Una sola cuenta de Trazaloop da acceso a todos los módulos que tu empresa
> tenga activos. Nunca hay inicios de sesión separados.

*Base:* `app/page.tsx`; PE-01B. *Estado:* verificada.

**A4 · ¿Puedo pertenecer a más de una empresa?** · A · todos
> Sí. Si te han invitado a varias, cambias de empresa desde la puerta de
> módulos, y lo que ves se recalcula para la empresa activa.

*Base:* `select-org`; suite `pe01-modules-access` K. *Estado:* verificada.

---

## B · Cuenta y empresa · 4

**B1 · ¿Quién puede invitar a alguien a mi empresa?** · A · todos
> Solo un administrador de tu empresa.

*Base:* las cuatro políticas de `memberships` exigen `is_org_admin`. *Estado:*
verificada.

**B2 · ¿Qué papeles existen y qué puede hacer cada uno?** · A · todos
> Tres: **administrador de empresa**, **responsable de calidad** y **consultor
> externo**. El papel decide qué puedes hacer; entrar a un módulo no lo decide.

*Base:* tabla `roles`; políticas con `has_org_role`. *Estado:* verificada.

**B3 · Perdí mi contraseña.** · V · todos
> Desde «Iniciar sesión» pide el enlace de recuperación; llega a tu correo.

*Base:* flujo probado (`test:auth-password-recovery`). *Estado:* verificada.

**B4 · ¿Cómo cambio los datos de mi empresa?** · A · todos
> En Datos de empresa. Los cambia un administrador.

*Base:* `/settings/company`. *Estado:* verificada.

---

## C · Seguridad y privacidad · 10 · **categoría prioritaria**

Todas se apoyan en
[PE_02A_SECURITY_CLAIMS_AUDIT.md](./PE_02A_SECURITY_CLAIMS_AUDIT.md).

**C1 · ¿Puede otra empresa ver mi información?** · V · todos · **destacada**
> **No.** Cada empresa solo ve lo suyo, y esa separación no depende del código de
> la pantalla: está aplicada dentro de la base de datos. Cada consulta se
> resuelve con la identidad de quien pregunta y solo devuelve registros de las
> empresas a las que pertenece.

*Larga:* añade las 275 tablas con control de acceso por fila, las 409 claves que
impiden apuntar a otra empresa, y las tres superficies que **tú** puedes hacer
públicas (pasaporte compartido, encuesta a clientes) para que no parezcan
excepciones ocultas.
*Base:* auditoría §1 y §2 · medición del 2026-08-30. *Estado:* verificada.

**C2 · ¿Cómo separa Trazaloop los datos entre empresas?** · V · todos
> Con dos barreras independientes. La primera: cada tabla que contiene datos de
> una empresa tiene reglas de acceso a nivel de fila, y se evalúan con tu
> sesión. La segunda: la propia base impide que un registro apunte a información
> de otra empresa, aunque el programa lo intentara.

*Base:* auditoría §1. *Estado:* verificada.

**C3 · ¿Puede el equipo de Trazaloop acceder a mis datos?** · V · todos ·
**destacada**
> El personal de Trazaloop **no accede al contenido de tu empresa como parte de
> la operación normal**. La aplicación no le da ninguna vía para leer tus
> procesos, riesgos, documentos, evidencias ni tus consultas a Trazaloop
> Intelligence: solo ve datos administrativos —plan, consumo, miembros y los
> tickets de soporte que tú abres—. No existe ninguna función que permita a
> nuestro equipo entrar haciéndose pasar por ti, ni añadirse a tu empresa.
>
> Como en cualquier servicio alojado, la administración técnica de la
> infraestructura implica acceso a los sistemas donde residen los datos. Ese
> acceso queda restringido a las tareas de operación y mantenimiento.

*Base:* auditoría §6 · 7 tablas con política de plataforma, ninguna de
contenido; sin suplantación; `memberships` sin acceso de plataforma.
*Estado:* **verificada con salvedad** — el segundo párrafo es la salvedad y no
se puede quitar.

**C4 · ¿Cómo se controlan los permisos de las personas?** · A · todos
> Tu papel en la empresa decide qué puedes hacer, y se comprueba en cada
> operación, no solo al entrar en la pantalla. Alguna información —como los
> datos de personas— tiene reglas todavía más estrechas que el papel.

*Base:* auditoría §3. *Estado:* verificada.

**C5 · ¿Dónde se guardan mis archivos y quién puede descargarlos?** · A · todos
> En almacenamiento **privado**. Ningún archivo tiene dirección pública: para
> descargar uno hace falta una sesión que pertenezca a tu empresa.

*Base:* tres cubos, `public=false`, lectura por `is_org_member` sobre la carpeta
de la empresa. *Estado:* verificada.
*Nota editorial:* **no** añadir cifrado en reposo ni ubicación (auditoría §4).

**C6 · ¿La IA usa información de otras empresas para responderme?** · V ·
Quality · **destacada**
> **No.** Trazaloop Intelligence solo trabaja con información de tu empresa, y
> solo con la parte que tú puedes ver. Lo que se envía al modelo lo selecciona
> nuestro servidor consultando la base **con tu sesión y tus permisos**: si tú no
> puedes ver un dato, no entra en la consulta, ni siquiera resumido. El modelo
> **no tiene acceso a la base de datos** ni puede buscar por su cuenta.

*Base:* auditoría §7. *Estado:* verificada.

**C7 · ¿Qué información recibe el proveedor de IA?** · V · Quality
> Únicamente la pregunta y el contexto que el servidor seleccionó para
> responderla, y se le pide expresamente que **no conserve** esa información. No
> se le da acceso a la base de datos, ni a internet, ni a tus archivos.

*Base:* auditoría §8 · `store: false`, sin herramientas. *Estado:* verificada.

**C8 · ¿Mis datos se usan para entrenar modelos de IA?** · V · Quality
> **NO PUBLICAR TODAVÍA.**

*Base:* auditoría §9. El repositorio no contiene la política de uso de datos del
proveedor contratado, y la política de privacidad vigente **no lo menciona**.
*Estado:* **pendiente de verificación externa.** Redacción provisional propuesta
en la auditoría §9, a publicar solo cuando (a) se verifique la política oficial
vigente del proveedor y (b) la política de privacidad la refleje.

**C9 · ¿Las respuestas anónimas de mis clientes son realmente anónimas?** · A ·
Quality
> Sí. Cuando una campaña se declara anónima, la base **rechaza** guardar
> cliente, contacto, nombre, correo o invitación junto a la respuesta. No es que
> se oculte esa identidad: es que no llega a existir.

*Base:* disparador de 0126; fuentes `customer_comment` / `customer_metric`
marcadas `anonymous`. *Estado:* verificada.

**C10 · ¿Hay copias de seguridad?** · A · todos
> Sí: la base de datos se respalda a diario. Ten en cuenta que los archivos
> subidos se respaldan por separado de la base.

*Base:* `docs/BACKUP_RESTORE.md`. *Estado:* **verificada con salvedad** — no
afirmar que las restauraciones estén probadas mientras no conste (auditoría §10).

---

## D · Trazaloop Quality · 5

**D1 · ¿Qué hace Trazaloop Quality?** · V · Quality
> Gestiona procesos, riesgos, objetivos, personas, proveedores, auditorías y
> mejora continua desde un entorno conectado y trazable.

*Base:* copia congelada en PE-01. *Estado:* verificada.
*Nota:* esta frase la congeló una decisión humana. **No reescribirla.**

**D2 · ¿Trazaloop me certifica en ISO 9001?** · V · Quality · **destacada**
> **No.** Trazaloop no emite certificaciones ni declara conformidad. Organiza tu
> información con criterios de las normas técnicas y te prepara para una
> auditoría; quien certifica es un organismo certificador.

*Base:* `docs/FAQ_PILOT.md` #8; disciplina de `normative_class`. *Estado:*
verificada. `normative_class = normative_reference`.

**D3 · ¿Por qué la portada me muestra unas cosas y no otras?** · A · Quality
> Porque muestra lo que requiere atención según tu papel y lo que hay abierto en
> tu empresa. Si algo no se pudo consultar, se dice — no se enseña un cero.

*Base:* QUALITY-13B4; principio «sin dato no es cero». *Estado:* verificada.

**D4 · ¿Puedo saber qué decía un documento hace seis meses?** · A · Quality
> Sí. Las revisiones no se sobrescriben: cada una conserva su periodo de
> vigencia, así que se puede reconstruir qué regía en una fecha.

*Base:* QUALITY-02; revisiones con vigencia. *Estado:* verificada.

**D5 · ¿Qué hace Trazaloop Intelligence y qué no hace?** · A · Quality
> Explica y resume información que ya está en tu Trazaloop, y cita de dónde la
> sacó. **No** toma decisiones formales: no aprueba, no declara conformidad y no
> cierra nada por ti.

*Base:* QUALITY-12/13B5. *Estado:* verificada.

---

## E · Trazaloop PCR · 4

**E1 · ¿Por qué mi cálculo salió 0 %?** · A · PCR
> Casi siempre porque el material reciclado no tiene su evidencia de origen
> asociada **como soporte** y **validada**.

*Base:* `docs/FAQ_PILOT.md` #2. *Estado:* verificada.

**E2 · ¿Qué es el nivel de defendibilidad?** · A · PCR
> Qué tan respaldado está tu cálculo: defendible, con advertencias o preliminar.
> La aplicación te dice exactamente qué falta.

*Base:* `DEFENSIBILITY_HELP`; FAQ piloto #1. *Estado:* verificada.

**E3 · Si recalculo, ¿pierdo el cálculo anterior?** · A · PCR
> No. Cada cálculo queda congelado como un registro nuevo y el historial se
> conserva.

*Base:* FAQ piloto #5. *Estado:* verificada.

**E4 · ¿Quién valida las evidencias?** · A · PCR
> Las personas con papel de administrador o de calidad en tu empresa.

*Base:* FAQ piloto #4; políticas de evidencias. *Estado:* verificada.

---

## F · Trazaloop Textiles · 2

**F1 · ¿Qué es el pasaporte textil y quién puede verlo?** · A · Textiles
> Es la ficha técnica publicable de una referencia. Solo se ve fuera de tu
> empresa si **tú** generas un enlace de compartición, y solo muestra la vista
> que publicaste.

*Base:* `resolve_textile_passport_share`. *Estado:* verificada.
*Nota editorial:* esta pregunta es también la salvedad honesta de C1.

**F2 · ¿Puedo dejar de compartir un pasaporte ya compartido?** · A · Textiles
> **Pendiente de redacción.** Hay que comprobar el comportamiento exacto de
> revocación antes de responder.

*Estado:* **no verificada** — no publicar hasta comprobarlo.

---

## G · Documentos y evidencias · 3

**G1 · ¿Qué pasa con mis documentos si cambia mi plan o termina una prueba?** ·
V · todos · **destacada**
> Tus datos **se conservan**. Un módulo sin acceso deja de poder usarse, pero no
> borra nada: cuando se restablece el acceso, todo sigue donde estaba.

*Base:* PE-01B (`NO_ACTIVE_MODULES_BODY`, mensajes de bloqueo); ninguna ruta de
borrado por caducidad. *Estado:* verificada.

**G2 · ¿Puedo borrar un documento?** · A · todos
> Depende de su estado: lo que sirve de evidencia de algo que ya ocurrió no se
> borra, se sucede con una versión nueva.

*Base:* inmutabilidad documental (QUALITY-02, TrazaDocs). *Estado:* verificada.

**G3 · ¿Cuánto espacio tengo?** · A · todos
> Lo ves en la pantalla de plan de cada módulo, con lo usado y lo disponible.

*Base:* T9F.1/T9F.2. *Estado:* verificada.
*Nota:* **sin cifras** en el texto (PEH-16).

---

## H · Planes y soporte · 3

**H1 · ¿Cómo sé qué módulos tiene mi empresa?** · A · todos
> En la puerta de módulos: cada uno muestra su estado. Que veas un módulo no
> significa que lo tengas: significa que existe.

*Base:* PE-01B. *Estado:* verificada.

**H2 · ¿Cómo pido ayuda?** · A · todos
> Desde el Centro de soporte, dentro de la plataforma.

*Base:* `/support`. *Estado:* verificada.
*Nota:* aquí irá el gancho de PE-04 (técnico ≠ funcional), **no ahora**.

**H3 · ¿Trazaloop hace la implantación por mí?** · V · todos
> La documentación y la ayuda explican cómo funciona Trazaloop. El acompañamiento
> para implantar un sistema de gestión en tu empresa es un servicio distinto del
> producto.

*Base:* frontera editorial PEH-13. *Estado:* verificada.
*Nota:* redacción a confirmar con quien decide la oferta comercial.

---

## Resumen

| | Cuenta |
|---|---|
| Preguntas propuestas | **32** |
| Publicables ya | **30** |
| **No publicables**: C8 (política del proveedor), F2 (sin comprobar) | **2** |
| Públicas (sin sesión) | 12 |
| Autenticadas | 20 |
| Destacadas | 5 — C1, C3, C6, D2, G1 |
| Con salvedad obligatoria | 2 — C3, C10 |

**Fuente reutilizada:** ocho de las diez preguntas de `docs/FAQ_PILOT.md` sirven
tal cual o casi. Ese archivo debería marcarse como **sustituido** el día que la
FAQ se publique, para que no haya dos verdades.

**Lo que NO se propuso, y por qué:** nada sobre certificaciones de seguridad,
cifrado de extremo a extremo, residencia de datos ni auditorías externas. No hay
con qué responderlas, y una FAQ que las esquiva es mejor que una que las inventa.
