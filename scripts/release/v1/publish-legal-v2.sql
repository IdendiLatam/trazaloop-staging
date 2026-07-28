-- ===========================================================================
-- Trazaloop v1.0.0 · PUBLICACIÓN DE DOCUMENTOS LEGALES v2
-- scripts/release/v1/publish-legal-v2.sql
-- ===========================================================================
--
--   ####################################################################
--   #                                                                  #
--   #   APROBACIÓN JURÍDICA · 27 DE JULIO DE 2026                      #
--   #                                                                  #
--   #   El paquete jurídico de Trazaloop v1.0 fue revisado y APROBADO. #
--   #   La aprobación para proceder fue comunicada por la dirección    #
--   #   del proyecto el 27 de julio de 2026. Constancia interna en     #
--   #   docs/legal/V1.0.0_APPROVAL_RECORD.md; la evidencia completa    #
--   #   se conserva FUERA de este repositorio.                         #
--   #                                                                  #
--   #   En consecuencia `c_legal_approval_confirmed` vale true         #
--   #   (paso 0) y este script YA PUEDE EJECUTARSE.                    #
--   #                                                                  #
--   #   ESTE SCRIPT NO SE HA EJECUTADO TODAVÍA contra ningún entorno.  #
--   #   Debe probarse primero en STAGING (publicación, reversión y     #
--   #   republicación) antes de tocar Production.                      #
--   #                                                                  #
--   #   El contenido que publica es el TEXTO EXACTO de los documentos  #
--   #   aprobados:                                                     #
--   #     · docs/legal/V1.0.0_TERMS_APPROVED.md                        #
--   #     · docs/legal/V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_      #
--   #       APPROVED.md                                                #
--   #   Carácter por carácter, sin resumir ni reformular.              #
--   #                                                                  #
--   ####################################################################
--
-- VERSIONES · COMERCIAL vs INTERNA
--   La versión COMERCIAL del paquete es la 1.0 y así aparece en el título
--   visible de cada documento («… de Trazaloop v1.0»).
--   La versión INTERNA en `legal_documents` es 'v2', porque 'v1' ya existe
--   desde la migración 0066 y nunca se sobrescribe: se archiva.
--
-- COMPATIBILIDAD DE EJECUCIÓN
--   Este archivo es SQL/PLpgSQL PURO: no contiene ningún metacomando de
--   psql (\pset, \echo, \timing…). Por tanto se puede ejecutar TAL CUAL
--   desde el SQL Editor de Supabase (pegar y ejecutar) o desde psql:
--
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--          -f scripts/release/v1/publish-legal-v2.sql
--
--   Los mensajes de progreso se emiten con RAISE NOTICE, que ambos
--   entornos muestran.
--
--   Los textos aprobados van en literales entre comillas de dólar, con
--   etiquetas «terms» y «privacy», anidadas dentro del bloque «publish».
--   PostgreSQL admite ese anidamiento mientras las etiquetas sean
--   distintas, y es la forma de incrustar el documento EXACTO sin escapar
--   ni un solo carácter. Los documentos aprobados no contienen el
--   carácter de dólar, de modo que no pueden cerrar el literal.
--
-- QUÉ HACE
--   Publica `terms/v2` y `privacy/v2` como ACTIVOS y archiva `terms/v1` y
--   `privacy/v1` (status = 'archived').
--
-- QUÉ NO HACE
--   · NO modifica la migración histórica 0066 (ni ninguna otra).
--   · NO es una migración: no crea, altera ni elimina esquema. No existe
--     ni debe existir un 0103 para esto.
--   · NO borra ninguna fila. `v1` se archiva, nunca se elimina.
--   · NO toca `user_legal_acceptances`: las aceptaciones históricas de v1
--     siguen existiendo como prueba de lo que cada usuario aceptó y cuándo.
--   · NO inserta el Anexo de tratamiento de datos (DPA) como documento
--     activo: ese anexo se entrega por contrato, a solicitud de la empresa
--     cliente. No se crea ninguna fila de tipo 'data_processing'.
--   · NO abre el registro público: `PUBLIC_REGISTRATION_ENABLED` es una
--     decisión distinta y ajena a este script.
--   · NO introduce consentimiento de mercadeo de ningún tipo.
--
-- RESTRICCIONES REALES DE public.legal_documents (migración 0066)
--   · legal_documents_document_type_check : document_type in ('terms',
--     'privacy', 'data_processing')
--   · legal_documents_status_check        : status in ('draft', 'active',
--     'archived')
--   · legal_documents_type_version_uniq   : unique (document_type, version)
--   · legal_documents_one_active_per_type : índice único parcial —
--     a lo sumo UN documento 'active' por tipo.
--
--   Este script NO se apoya en que esas restricciones lancen el error: hace
--   un censo explícito del estado ANTES de escribir y aborta con un mensaje
--   comprensible. Las restricciones son la segunda línea de defensa.
--
-- GARANTÍAS
--   · TRANSACCIONAL: un único BEGIN…COMMIT. O todo, o nada.
--   · CONCURRENCIA: advisory transaction lock (paso 1). Dos ejecuciones
--     simultáneas se serializan; el lock se libera solo al terminar o
--     revertirse la transacción.
--   · VALIDACIÓN EXACTA de v1: igualdad carácter por carácter de título y
--     contenido contra el texto literal de la migración 0066. Sin LIKE,
--     sin ILIKE, sin prefijos. Un solo carácter distinto aborta.
--   · CENSO DE v2 EN CUALQUIER ESTADO (draft/active/archived): solo se
--     admite «no existe ningún v2» o «exactamente un v2 activo por tipo».
--   · CONTEOS EXACTOS con GET DIAGNOSTICS: exactamente 2 filas archivadas
--     y exactamente 2 insertadas.
--   · FALLA CERRADO ante cualquier estado inesperado.
--
-- REQUISITOS
--   Las políticas RLS de `legal_documents` (0066) solo permiten INSERT y
--   UPDATE a `public.is_platform_superadmin()`. Ejecuta con la conexión
--   directa del operador (rol propietario) o desde el SQL Editor de
--   Supabase, nunca desde la aplicación.
--
-- REVERSIÓN
--   scripts/release/v1/rollback-legal-v2.sql (transaccional, sin borrados).
-- ===========================================================================

begin;

do $publish$
declare
  -- =======================================================================
  -- PASO 0 · BLOQUEO DE APROBACIÓN LEGAL (fail-closed)
  -- =======================================================================
  -- APROBADO EL 27 DE JULIO DE 2026.
  --
  -- La constante vale true porque el paquete jurídico de Trazaloop v1.0 fue
  -- revisado y aprobado, y la aprobación para proceder fue comunicada por
  -- la dirección del proyecto el 27 de julio de 2026. El alcance aprobado
  -- son los SEIS documentos inventariados en
  -- docs/legal/V1.0.0_APPROVAL_RECORD.md, del que este script publica los
  -- dos versionados: Términos de uso y Política de privacidad y
  -- tratamiento de datos personales.
  --
  -- El mecanismo sigue siendo fail-closed: si alguien devuelve esta
  -- constante a false, el script aborta antes de escribir nada.
  c_legal_approval_confirmed constant boolean := true;

  -- Clave del advisory lock. Constante arbitraria pero ESTABLE: debe ser la
  -- misma en publish-legal-v2.sql y rollback-legal-v2.sql para que ambos se
  -- excluyan mutuamente.
  c_lock_key constant bigint := 1000010001;

  -- -----------------------------------------------------------------------
  -- TEXTO EXACTO DE v1, copiado LITERALMENTE de la migración 0066.
  -- No se modifica 0066: se replican aquí sus literales E'' idénticos para
  -- poder comparar por IGUALDAD EXACTA. Si alguien editó el documento a
  -- mano en la base, la comparación falla y el script se detiene.
  -- -----------------------------------------------------------------------
  c_terms_v1_title constant text :=
    'Términos de uso de Trazaloop (versión preliminar)';

  c_terms_v1_content constant text :=
       E'Esta es una versión preliminar de los términos de uso de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.\n\n'
    || E'1. Trazaloop es una plataforma para gestionar trazabilidad, documentación técnica (TrazaDocs), evidencias y cálculo de contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343.\n\n'
    || E'2. Trazaloop no garantiza ni promete la obtención de ninguna certificación. La plataforma ofrece soporte técnico y herramientas de revisión técnica para organizar la información de tu producto objetivo; la evaluación y decisión de certificación, si aplica, corresponde siempre a un organismo externo independiente de Trazaloop.\n\n'
    || E'3. El uso de la plataforma está sujeto a los planes y límites vigentes (Demo, Full, Extra) descritos dentro de la plataforma. Trazaloop puede suspender el acceso de una cuenta que incumpla estos términos, sin perder los datos ya cargados.\n\n'
    || E'4. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  c_privacy_v1_title constant text :=
    'Política de privacidad de Trazaloop (versión preliminar)';

  c_privacy_v1_content constant text :=
       E'Esta es una versión preliminar de la política de privacidad de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.\n\n'
    || E'1. Trazaloop recopila los datos que registras dentro de la plataforma (datos de empresa, catálogos, evidencias, trazabilidad, documentos y tickets de soporte) con el único fin de operar el servicio para tu organización.\n\n'
    || E'2. Usamos tu información para: operar la plataforma, brindarte soporte técnico a través del Centro de soporte, proteger la seguridad de tu cuenta y de la de otras empresas (aislamiento entre organizaciones), y mejorar el servicio.\n\n'
    || E'3. No compartimos tus datos con terceros salvo cuando sea necesario para operar la plataforma (por ejemplo, el proveedor de infraestructura donde se aloja Trazaloop) o cuando la ley lo exija.\n\n'
    || E'4. Puedes solicitar información sobre tus datos o su eliminación contactando al equipo de Trazaloop desde el Centro de soporte.\n\n'
    || E'5. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  -- Huella md5 del texto v1 esperado, calculada fuera de la base a partir de
  -- la migración 0066. Es un DIAGNÓSTICO reproducible que se imprime cuando
  -- la comparación exacta falla; la validación que manda es la igualdad de
  -- texto de arriba, no el hash.
  c_terms_v1_md5   constant text := '7e30e6abb716d7d472b1b2d27e660a37';
  c_privacy_v1_md5 constant text := '9f3719ca5e83a6566ad8743d101e7d3f';

  -- -----------------------------------------------------------------------
  -- TEXTO APROBADO · TÉRMINOS DE USO — Trazaloop v1.0
  -- -----------------------------------------------------------------------
  -- Transcripción EXACTA de docs/legal/V1.0.0_TERMS_APPROVED.md, carácter
  -- por carácter, incluido el salto de línea final. No se resume, no se
  -- reformula y no se añade nada.
  --
  -- El título visible declara la versión COMERCIAL (v1.0). La versión
  -- INTERNA de la fila en legal_documents sigue siendo 'v2' (paso 5).
  -- -----------------------------------------------------------------------
  c_terms_v2_title constant text :=
    'Términos de uso de Trazaloop v1.0';

  c_terms_v2_content constant text := $terms$# Términos de uso de Trazaloop

**Documento:** Términos de uso de Trazaloop
**Versión comercial:** 1.0
**Estado:** VIGENTE
**Fecha de aprobación:** 27 de julio de 2026
**Fecha de entrada en vigor:** 27 de julio de 2026
**Sitio:** https://www.trazaloop.com
**Responsable:** CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL
**NIT:** 901835846-6
**Canal legal y de privacidad:** contacto@idendi.org
**Canal de soporte técnico:** contacto@cirquiloconsultores.com

> Paquete jurídico v1.0 aprobado por la dirección del proyecto el 27 de
> julio de 2026. La evidencia completa de la aprobación se conserva fuera
> de este repositorio. Registro interno: `V1.0.0_APPROVAL_RECORD.md`.

---

## 1. Identificación del operador

Trazaloop es operado por:

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
| Correo general y de privacidad | contacto@idendi.org |
| Correo de soporte de la plataforma | contacto@cirquiloconsultores.com |
| Sitio oficial | https://www.trazaloop.com |

En adelante, «la Corporación». La plataforma se denomina «Trazaloop».

---

## 2. Objeto y alcance

Trazaloop es una **plataforma SaaS modular para empresas** dedicada a la
gestión de información técnica, trazabilidad, documentación y evidencias.
Se presta como servicio a través de internet.

Estos términos regulan el acceso y uso de la plataforma por parte de la
empresa cliente (en adelante, «el Cliente») y de las personas usuarias que
el Cliente autorice.

### 2.1 Módulos funcionales disponibles

**Trazaloop CPR** — trazabilidad de contenido reciclado:

- proveedores, materiales, productos y evidencias;
- órdenes o corridas de producción;
- lotes de entrada;
- lotes producidos o lotes finales;
- cálculos y documentación técnica tomando como referencia la NTC 6632:2022
  y la UNE-EN 15343:2008;
- TrazaDocs;
- diagnóstico y reportes.

**Trazaloop Textiles** — trazabilidad textil y de confección:

- proveedores, materiales, fibras, productos y composiciones;
- órdenes, lotes y evidencias;
- criterios de circularidad;
- TrazaDocs Textiles;
- pasaportes técnicos textiles y enlaces privados.

Las normas NTC 6632:2022 y UNE-EN 15343:2008 se toman como referencia
**únicamente** en el módulo Trazaloop CPR.

Cualquier otro módulo anunciado como futuro **no está disponible** y no
forma parte del servicio contratado hasta que la Corporación lo habilite
expresamente.

### 2.2 Qué NO es Trazaloop

Trazaloop es una **herramienta de gestión, soporte documental y
trazabilidad**. La Corporación **no**:

- certifica productos;
- certifica procesos;
- reemplaza a organismos de certificación, acreditación o inspección;
- garantiza la conformidad con norma alguna;
- garantiza la aceptación de una auditoría, verificación o revisión;
- garantiza la obtención, renovación o ampliación de una certificación;
- emite conceptos jurídicos;
- garantiza resultados comerciales de ningún tipo.

Los resultados, cálculos, niveles de defendibilidad, dossiers y pasaportes
que produce la plataforma son **consolidados técnicos** construidos a
partir de la información que registra el Cliente. La evaluación y decisión
de certificación, cuando aplique, corresponde siempre a un tercero
independiente de la Corporación.

### 2.3 Naturaleza empresarial del servicio

El servicio es de naturaleza **empresarial (B2B)**. Se dirige
exclusivamente a empresas y organizaciones y **no está destinado a
consumidores finales ni a uso personal o doméstico**.

Cuando una disposición imperativa de protección al consumidor resulte
aplicable pese a lo anterior, prevalecerá sobre lo pactado en estos
términos en aquello que la ley no permita excluir.

---

## 3. Cuentas y seguridad

- Las personas usuarias deben ser **mayores de edad** y contar con
  facultades para actuar en nombre del Cliente.
- Cada cuenta es **personal e intransferible**. No se admite el uso
  compartido de credenciales.
- El Cliente y cada persona usuaria son responsables de la custodia de sus
  credenciales y de la actividad realizada con ellas.
- El acceso no autorizado debe notificarse sin demora a
  contacto@cirquiloconsultores.com.
- La creación de cuentas puede requerir invitación. La Corporación puede
  mantener el registro cerrado y gestionar las altas por sus propios
  canales.

### 3.1 Autoridad del administrador de empresa

La persona con rol de **administrador** del espacio de una empresa puede,
dentro de esa empresa: invitar y retirar personas usuarias, asignar roles,
acceder a la información registrada, modificarla y eliminarla según las
funciones disponibles.

El Cliente reconoce que **los actos del administrador se entienden
realizados por el Cliente** y que la Corporación no arbitra conflictos
internos sobre quién debe ostentar ese rol.

---

## 4. Accesos comerciales por módulo

Los estados comerciales por módulo son **Demo**, **Full** y **Extra**.

| Estado | Descripción |
|---|---|
| **Demo** | Acceso con límites funcionales y de capacidad. |
| **Full** | Acceso funcional completo del módulo. |
| **Extra** | Mismo acceso funcional que Full, con **mayor capacidad de almacenamiento**. |

Reglas aplicables:

- **Full y Extra no se diferencian funcionalmente.** Su diferencia es
  principalmente la capacidad de almacenamiento disponible.
- Las empresas nuevas reciben un acceso **Demo temporal durante 2 días** en
  los módulos funcionales.
- El acceso **puede ser diferente por módulo**: una misma empresa puede
  tener un estado comercial en Trazaloop CPR y otro distinto en Trazaloop
  Textiles.
- Vencido el acceso Demo temporal, el módulo deja de ser accesible hasta
  que se habilite otro estado. La información registrada no se elimina por
  ese solo hecho.
- Los límites y cuotas vigentes se describen dentro de la plataforma y
  pueden actualizarse con aviso previo razonable.

---

## 5. Contratación, facturación y pagos

- **Dentro de la plataforma no existe pago integrado, pasarela de pagos,
  renovación automática ni facturación automática.**
- La contratación, la asignación de estados comerciales por módulo y su
  renovación **se gestionan de forma manual, por fuera de la plataforma**,
  a través de los canales de contacto de la Corporación.
- La habilitación de Full o Extra la realiza la Corporación mediante su
  consola de administración, previa gestión comercial.
- Los documentos de cobro, sus condiciones y su forma de pago se acuerdan
  por esos mismos canales y se rigen por lo pactado entre las partes.

La Corporación **no promete** la disponibilidad futura de pagos en línea,
avisos automáticos de vencimiento ni renovación automática.

---

## 6. Información registrada por el Cliente

### 6.1 Responsabilidad

El Cliente es responsable de la información que registra en la plataforma:
catálogos, proveedores, materiales, productos, composiciones, órdenes,
lotes, evidencias, documentos, pasaportes y cualquier otro contenido.

El Cliente debe contar con **autorización, legitimación o base válida**
para registrar datos de terceros, conforme al Anexo de tratamiento de datos
para clientes empresariales.

### 6.2 Calidad y exactitud de los datos

La exactitud de los cálculos, los indicadores y la trazabilidad reflejan
directamente la calidad, veracidad y completitud de los datos, evidencias y
validaciones que el Cliente registra y mantiene. El Cliente es responsable
de las declaraciones o decisiones que adopte a partir de los resultados
generados por la plataforma.

### 6.3 Evidencias y trazabilidad

Las evidencias documentales y los registros de trazabilidad se conservan
como los cargó el Cliente. La Corporación **no revisa, valida ni audita el
contenido** de los archivos cargados, ni verifica su autenticidad frente a
terceros.

Determinados registros son **inmutables por diseño** una vez consolidados
(por ejemplo, ciertos metadatos de archivo y las instantáneas de un
pasaporte técnico), para que la trazabilidad sea defendible. El Cliente
acepta esa inmutabilidad como una característica del servicio.

---

## 7. Propiedad intelectual y titularidad

- La plataforma, su código, diseño, marcas, denominaciones —incluidas
  «Trazaloop», «Trazaloop CPR», «Trazaloop Textiles» y «TrazaDocs»— y su
  documentación son de la Corporación o de sus licenciantes. Estos términos
  no transfieren ningún derecho sobre ellos.
- **La información y los documentos del Cliente siguen siendo del
  Cliente.** La Corporación no adquiere titularidad sobre ellos.
- El Cliente otorga a la Corporación una **licencia técnica, no exclusiva,
  limitada y revocable** para alojar, reproducir, transmitir, procesar,
  respaldar y mostrar esa información **únicamente** en la medida
  necesaria para prestar el servicio, atender el soporte y cumplir
  obligaciones legales. La licencia termina con la relación, salvo lo que
  deba conservarse conforme al § 11.
- La Corporación **no usa la información del Cliente con finalidades
  propias**, ni para mercadeo, ni la cede a terceros con fines comerciales.

---

## 8. Confidencialidad

Cada parte se obliga a mantener la confidencialidad de la información no
pública de la otra a la que acceda con ocasión del servicio, a usarla solo
para su ejecución y a protegerla con diligencia razonable.

La obligación no cubre la información que sea o llegue a ser pública sin
incumplimiento, la que la parte receptora ya conociera legítimamente, la
desarrollada de forma independiente ni la que deba revelarse por mandato
legal o de autoridad competente, en cuyo caso se informará a la otra parte
cuando sea jurídicamente posible.

El personal de la Corporación con acceso a información del Cliente está
sujeto a deber de confidencialidad.

---

## 9. Uso aceptable y prohibiciones

El Cliente y sus personas usuarias se obligan a usar la plataforma conforme
a estos términos y a la ley aplicable, y **no podrán**:

1. intentar vulnerar la seguridad de la plataforma o el aislamiento entre
   empresas, ni acceder a información de otra organización;
2. eludir los límites de plan, las cuotas de almacenamiento o los controles
   de acceso por módulo;
3. realizar ingeniería inversa, descompilar o extraer el código, salvo en
   la medida que la ley lo permita imperativamente;
4. revender, sublicenciar o ceder el acceso sin autorización escrita;
5. automatizar el uso de forma que degrade el servicio, ni realizar pruebas
   de carga, escaneo o intrusión sin autorización escrita previa;
6. cargar programas maliciosos ni contenido ilícito;
7. registrar información cuya carga está prohibida por la Política de
   tratamiento de datos personales y privacidad (datos sensibles no
   indispensables, datos de menores, contraseñas, información financiera
   completa y secretos de autenticación);
8. suplantar la identidad de otra persona o entidad;
9. usar la plataforma para afirmar o sugerir que la Corporación certifica,
   acredita o avala un producto, proceso o resultado.

---

## 10. Disponibilidad, mantenimiento, cambios y soporte

- La Corporación procurará una disponibilidad razonable del servicio.
  **No garantiza** operación ininterrumpida ni libre de errores, ni
  compromete un nivel de servicio determinado.
- Pueden realizarse **mantenimientos** programados o de urgencia, con aviso
  cuando sea posible.
- La Corporación puede **modificar, añadir o retirar funcionalidades** y
  módulos. Los cambios sustanciales que afecten de forma relevante al uso
  contratado se avisarán con antelación razonable.
- El **soporte** se presta por los canales indicados dentro de la
  plataforma y en el correo contacto@cirquiloconsultores.com, en horario
  hábil y sin compromiso de tiempo de respuesta garantizado.

---

## 11. Suspensión, terminación, entrega de información y eliminación

### 11.1 Suspensión y terminación

La Corporación puede suspender o terminar el acceso por incumplimiento de
estos términos, por riesgo de seguridad o por finalización de la relación
comercial, previo aviso cuando sea posible y sin perjuicio de la
suspensión inmediata ante un riesgo grave.

El Cliente puede solicitar la terminación por los canales de contacto.

### 11.2 Entrega o exportación de información

El Cliente puede **solicitar la entrega o exportación de su información**
por los canales de contacto. La entrega se atenderá **según las
capacidades técnicas disponibles** en cada momento y en los formatos que la
plataforma pueda producir.

La plataforma dispone hoy de exportaciones parciales en formato CSV. **No
existe una función automática de exportación integral** de todos los datos
y archivos de una empresa, y este documento no promete una que no exista.

### 11.3 Conservación y eliminación

La información se conserva mientras exista la relación contractual o la
cuenta, y adicionalmente cuando sea necesario para cumplir obligaciones
legales, atender requerimientos de autoridad, mantener la seguridad,
soportar auditorías, defender reclamaciones o cumplir el contrato.

Cuando la información deje de ser necesaria y su eliminación resulte legal
y técnicamente procedente, se **suprime, anonimiza o bloquea**.

Las solicitudes de eliminación se tramitan por los canales de contacto.
Las **copias de respaldo y los registros técnicos** pueden persistir
temporalmente durante ciclos razonables de respaldo y seguridad.

La Corporación **no garantiza la conservación indefinida** de la
información una vez terminada la relación, ni afirma disponer de
eliminación automática integral ni de calendarios técnicos automatizados.

Los criterios detallados de conservación figuran en el § 17 de la Política
de tratamiento de datos personales y privacidad.

---

## 12. Limitación de responsabilidad

- La Corporación responde por los daños directos que le sean imputables,
  conforme a la ley aplicable.
- **No se excluye ni se limita** la responsabilidad por dolo, culpa grave,
  daños a la vida o la integridad de las personas, ni ningún otro supuesto
  que la ley no permita excluir.
- La Corporación **no responde** por: la inexactitud o falta de veracidad
  de la información que registra el Cliente; las decisiones comerciales,
  técnicas o regulatorias que el Cliente adopte a partir de los resultados;
  el resultado de auditorías, verificaciones o procesos de certificación
  ante terceros; ni el uso que el Cliente haga de los documentos y
  pasaportes generados.
- Cualquier límite cuantitativo de responsabilidad que llegue a pactarse
  con un Cliente debe ser **proporcionado** al valor de la contraprestación
  y no puede vaciar de contenido las obligaciones esenciales del contrato.
  Estos términos, por sí solos, no fijan un límite cuantitativo.

---

## 13. Fuerza mayor

Ninguna parte responderá por el incumplimiento debido a hechos de fuerza
mayor o caso fortuito, tales como catástrofes naturales, conflictos,
actos de autoridad, fallas generalizadas de telecomunicaciones o de
energía, o interrupciones graves de proveedores de infraestructura ajenas a
su control razonable.

La parte afectada informará a la otra tan pronto sea posible y adoptará
medidas razonables de mitigación. Si la causa persiste de forma prolongada,
cualquiera de las partes podrá terminar la relación sin penalidad.

---

## 14. Modificaciones y nuevas aceptaciones

La Corporación puede actualizar estos términos. Cuando el cambio sea
sustancial, se solicitará a cada persona usuaria **aceptar la nueva versión
antes de continuar** usando la plataforma.

La plataforma registra qué versión aceptó cada usuario y cuándo, y conserva
las aceptaciones anteriores como historial.

---

## 15. Comunicaciones electrónicas

- Las partes aceptan que las comunicaciones relativas al servicio se
  realicen por **medios electrónicos**, incluidos el correo electrónico y
  los avisos mostrados dentro de la plataforma.
- La **aceptación electrónica** de estos términos y de la política de
  privacidad, registrada por la plataforma con usuario, documento, versión,
  fecha y hora y datos técnicos de la conexión, se considera manifestación
  válida de la voluntad. No constituye firma digital certificada ni se
  presenta como tal.
- Es carga del Cliente mantener actualizadas las direcciones de correo de
  sus personas usuarias.

---

## 16. Ley aplicable y jurisdicción

- **Ley aplicable:** legislación colombiana.
- **Jurisdicción:** jueces y tribunales de Medellín, Colombia.

Sin perjuicio de las normas imperativas que resulten aplicables por razón
del domicilio del Cliente.

---

## 17. Vigencia

- **Fecha de aprobación:** 27 de julio de 2026.
- **Fecha de entrada en vigor:** 27 de julio de 2026.
- **Versión comercial:** 1.0.

---

## 18. Contacto

| Asunto | Canal |
|---|---|
| General | contacto@idendi.org |
| Privacidad, habeas data, consultas y reclamos | contacto@idendi.org |
| Soporte técnico de la plataforma | contacto@cirquiloconsultores.com |
| Correspondencia física | Carrera 43A #15 Sur – 15, Medellín, Colombia |
| Sitio oficial | https://www.trazaloop.com |
$terms$;

  -- -----------------------------------------------------------------------
  -- TEXTO APROBADO · POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS
  -- PERSONALES — Trazaloop v1.0
  -- -----------------------------------------------------------------------
  -- Transcripción EXACTA de
  -- docs/legal/V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md,
  -- carácter por carácter, incluido el salto de línea final.
  -- -----------------------------------------------------------------------
  c_privacy_v2_title constant text :=
    'Política de privacidad y tratamiento de datos personales v1.0';

  c_privacy_v2_content constant text := $privacy$# Política de tratamiento de datos personales y privacidad

**Documento:** Política de tratamiento de datos personales y privacidad
**Versión comercial:** 1.0
**Estado:** VIGENTE
**Fecha de aprobación:** 27 de julio de 2026
**Fecha de entrada en vigor:** 27 de julio de 2026
**Sitio:** https://www.trazaloop.com
**Responsable:** CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL
**NIT:** 901835846-6
**Canal legal y de privacidad:** contacto@idendi.org
**Canal de soporte técnico:** contacto@cirquiloconsultores.com

> Paquete jurídico v1.0 aprobado por la dirección del proyecto el 27 de
> julio de 2026. La evidencia completa de la aprobación se conserva fuera
> de este repositorio. Registro interno: `V1.0.0_APPROVAL_RECORD.md`.

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

Estos proveedores tratan la información **únicamente** para prestar el
servicio contratado por la Corporación.

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
  (Row Level Security) en las tablas con ámbito de empresa.
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

Ninguna medida de seguridad elimina por completo el riesgo. La Corporación
**no garantiza** la inviolabilidad absoluta de los sistemas.

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

## 18. Cambios a esta política

La Corporación puede actualizar esta política. Cuando el cambio sea
sustancial se solicitará **aceptar la nueva versión antes de continuar**
usando la plataforma. La plataforma conserva el historial de versiones y la
prueba de las aceptaciones.

---

## 19. Vigencia

- **Fecha de aprobación:** 27 de julio de 2026.
- **Fecha de entrada en vigor:** 27 de julio de 2026.
- **Versión comercial:** 1.0.
- **Última actualización:** 27 de julio de 2026.
$privacy$;

  -- Variables de trabajo -------------------------------------------------
  v_terms_v1_id      uuid;
  v_privacy_v1_id    uuid;
  v_v2_total         int;
  v_v2_terms_total   int;
  v_v2_privacy_total int;
  v_v2_terms_active  int;
  v_v2_privacy_active int;
  v_active_terms     int;
  v_active_privacy   int;
  v_archived_terms   int;
  v_archived_privacy int;
  v_rows             int;
  v_actual_title     text;
  v_actual_md5       text;
begin

  -- =======================================================================
  -- PASO 0 · Bloqueo de aprobación legal
  -- =======================================================================
  if not c_legal_approval_confirmed then
    raise exception
      E'BLOQUEADO · el script no se ejecuta sin aprobación jurídica explícita.\n'
      '  Este archivo publica documentos legales que todos los usuarios\n'
      '  deberán aceptar.\n'
      '  El paquete jurídico v1.0 fue aprobado el 27 de julio de 2026, de\n'
      '  modo que c_legal_approval_confirmed debería valer true. Si vale\n'
      '  false, alguien lo revirtió a propósito: no se publica nada hasta\n'
      '  que se resuelva esa decisión y exista copia de seguridad de\n'
      '  legal_documents y user_legal_acceptances.\n'
      '  No se ha modificado nada.';
  end if;

  -- =======================================================================
  -- PASO 1 · Advisory transaction lock (protección de concurrencia)
  -- =======================================================================
  -- pg_advisory_xact_lock bloquea hasta obtener el lock y lo LIBERA
  -- AUTOMÁTICAMENTE al hacer COMMIT o ROLLBACK — no hay forma de dejarlo
  -- colgado. Serializa este script consigo mismo y con
  -- rollback-legal-v2.sql, que usa la misma clave.
  perform pg_advisory_xact_lock(c_lock_key);
  raise notice 'Advisory lock % adquirido (se libera al terminar la transacción).', c_lock_key;

  -- Además se bloquean las filas relevantes: cualquier otra sesión que
  -- intente tocarlas espera a que esta transacción termine.
  perform 1
  from public.legal_documents
  where document_type in ('terms', 'privacy')
  for update;

  -- =======================================================================
  -- PASO 2 · CENSO DE v2 EN CUALQUIER ESTADO (draft / active / archived)
  -- =======================================================================
  -- Solo se admiten dos situaciones:
  --   A. no existe NINGUNA fila v2  → continuar y publicar;
  --   B. exactamente un terms/v2 ACTIVO y un privacy/v2 ACTIVO, y ningún
  --      otro v2                    → ya publicado, terminar sin cambios.
  -- Cualquier otra combinación (v2 archivado, v2 draft, más de una fila por
  -- tipo, un tipo sí y el otro no, dos activos, estado mixto) aborta.
  -- =======================================================================
  select
    count(*),
    count(*) filter (where document_type = 'terms'),
    count(*) filter (where document_type = 'privacy'),
    count(*) filter (where document_type = 'terms'   and status = 'active'),
    count(*) filter (where document_type = 'privacy' and status = 'active')
  into
    v_v2_total, v_v2_terms_total, v_v2_privacy_total,
    v_v2_terms_active, v_v2_privacy_active
  from public.legal_documents
  where version = 'v2'
    and document_type in ('terms', 'privacy');

  if v_v2_total = 0 then
    raise notice 'Estado v2: no existe ninguna fila v2. Se procede a publicar.';

  elsif v_v2_terms_total = 1
    and v_v2_privacy_total = 1
    and v_v2_terms_active = 1
    and v_v2_privacy_active = 1
    and v_v2_total = 2 then
    raise notice '';
    raise notice 'SIN CAMBIOS · terms/v2 y privacy/v2 ya están publicados y activos.';
    raise notice 'El script es idempotente: no se ha modificado nada.';
    raise notice '';
    return;

  else
    raise exception
      E'ESTADO v2 INESPERADO · no se puede publicar ni confirmar idempotencia.\n'
      '  Filas v2 encontradas (cualquier estado): %\n'
      '    · terms/v2   total=%  activos=%\n'
      '    · privacy/v2 total=%  activos=%\n'
      '  Situaciones admitidas SOLAMENTE:\n'
      '    A. 0 filas v2 (publicación pendiente), o\n'
      '    B. exactamente 1 terms/v2 ACTIVO + 1 privacy/v2 ACTIVO y nada más.\n'
      '  Todo lo demás (v2 archivado, v2 en draft, un tipo sí y el otro no,\n'
      '  estado mixto) exige REVISIÓN HUMANA. No se ha modificado nada.',
      v_v2_total,
      v_v2_terms_total, v_v2_terms_active,
      v_v2_privacy_total, v_v2_privacy_active;
  end if;

  -- =======================================================================
  -- PASO 3 · EXIGIR EL ESTADO DE PARTIDA v1 EXACTO
  -- =======================================================================
  -- Debe existir exactamente UN documento activo por tipo, y debe ser v1
  -- con el título y el contenido IDÉNTICOS a los de la migración 0066.
  -- Comparación por igualdad exacta (=), nunca LIKE ni ILIKE.
  -- =======================================================================
  select count(*) into v_active_terms
  from public.legal_documents
  where document_type = 'terms' and status = 'active';

  if v_active_terms <> 1 then
    raise exception
      E'ESTADO INESPERADO · hay % documento(s) «terms» activo(s); se esperaba 1.\n'
      '  No se ha modificado nada.', v_active_terms;
  end if;

  select count(*) into v_active_privacy
  from public.legal_documents
  where document_type = 'privacy' and status = 'active';

  if v_active_privacy <> 1 then
    raise exception
      E'ESTADO INESPERADO · hay % documento(s) «privacy» activo(s); se esperaba 1.\n'
      '  No se ha modificado nada.', v_active_privacy;
  end if;

  -- --- terms/v1: igualdad EXACTA de título y contenido -------------------
  select id, title, md5(content)
  into v_terms_v1_id, v_actual_title, v_actual_md5
  from public.legal_documents
  where document_type = 'terms'
    and version       = 'v1'
    and status        = 'active'
    and title         = c_terms_v1_title
    and content       = c_terms_v1_content;

  if v_terms_v1_id is null then
    -- Diagnóstico comprensible: se recupera la fila real para explicar EN QUÉ
    -- difiere, sin volcar el documento completo al log.
    select title, md5(content) into v_actual_title, v_actual_md5
    from public.legal_documents
    where document_type = 'terms' and status = 'active';

    raise exception
      E'ESTADO INESPERADO · terms/v1 activo NO coincide EXACTAMENTE con el texto\n'
      '  sembrado por la migración 0066.\n'
      '    Título esperado : %\n'
      '    Título real     : %\n'
      '    md5 esperado    : %\n'
      '    md5 real        : %\n'
      '  El documento fue editado a mano, o la versión activa no es v1. El\n'
      '  script se niega a actuar sobre un estado que no reconoce, porque no\n'
      '  puede saber qué aceptaron realmente los usuarios. REVISIÓN HUMANA.\n'
      '  No se ha modificado nada.',
      c_terms_v1_title, coalesce(v_actual_title, '(sin fila activa)'),
      c_terms_v1_md5,   coalesce(v_actual_md5, '(sin fila activa)');
  end if;

  -- --- privacy/v1: igualdad EXACTA de título y contenido -----------------
  select id, title, md5(content)
  into v_privacy_v1_id, v_actual_title, v_actual_md5
  from public.legal_documents
  where document_type = 'privacy'
    and version       = 'v1'
    and status        = 'active'
    and title         = c_privacy_v1_title
    and content       = c_privacy_v1_content;

  if v_privacy_v1_id is null then
    select title, md5(content) into v_actual_title, v_actual_md5
    from public.legal_documents
    where document_type = 'privacy' and status = 'active';

    raise exception
      E'ESTADO INESPERADO · privacy/v1 activo NO coincide EXACTAMENTE con el\n'
      '  texto sembrado por la migración 0066.\n'
      '    Título esperado : %\n'
      '    Título real     : %\n'
      '    md5 esperado    : %\n'
      '    md5 real        : %\n'
      '  REVISIÓN HUMANA. No se ha modificado nada.',
      c_privacy_v1_title, coalesce(v_actual_title, '(sin fila activa)'),
      c_privacy_v1_md5,   coalesce(v_actual_md5, '(sin fila activa)');
  end if;

  raise notice 'Estado de partida verificado: terms/v1 y privacy/v1 activos, texto EXACTO de 0066.';

  -- --- Salvaguarda: el texto v2 no reintroduce el lenguaje retirado ------
  if c_terms_v2_title     ilike '%preliminar%'
  or c_privacy_v2_title   ilike '%preliminar%'
  or c_terms_v2_content   ilike '%versión preliminar%'
  or c_terms_v2_content   ilike '%beta%'
  or c_terms_v2_content   ilike '%lanzamiento controlado%'
  or c_privacy_v2_content ilike '%versión preliminar%'
  or c_privacy_v2_content ilike '%beta%'
  or c_privacy_v2_content ilike '%lanzamiento controlado%' then
    raise exception
      E'TEXTO PROPUESTO INVÁLIDO · el contenido v2 todavía contiene lenguaje de\n'
      '  versión preliminar / beta / lanzamiento controlado. Corrige el script.';
  end if;

  -- =======================================================================
  -- PASO 4 · ARCHIVAR v1 (nunca borrar) — conteo exacto
  -- =======================================================================
  -- Se archiva ANTES de insertar v2 porque el índice único parcial
  -- legal_documents_one_active_per_type impide dos activos del mismo tipo.
  update public.legal_documents
     set status = 'archived'
   where id in (v_terms_v1_id, v_privacy_v1_id);

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception
      E'CONTEO INESPERADO al archivar v1 · se actualizaron % fila(s); se\n'
      '  esperaban EXACTAMENTE 2 (terms/v1 y privacy/v1).\n'
      '  Se revierte toda la transacción.', v_rows;
  end if;
  raise notice 'Archivadas exactamente 2 filas v1 (historial intacto, sin borrados).';

  -- =======================================================================
  -- PASO 5 · PUBLICAR v2 — conteo exacto
  -- =======================================================================
  insert into public.legal_documents
    (document_type, version, title, content, status, published_at)
  values
    ('terms',   'v2', c_terms_v2_title,   c_terms_v2_content,   'active', now()),
    ('privacy', 'v2', c_privacy_v2_title, c_privacy_v2_content, 'active', now());

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception
      E'CONTEO INESPERADO al insertar v2 · se insertaron % fila(s); se\n'
      '  esperaban EXACTAMENTE 2. Se revierte toda la transacción.', v_rows;
  end if;
  raise notice 'Insertadas exactamente 2 filas v2 (terms y privacy), activas.';

  -- =======================================================================
  -- PASO 6 · VERIFICACIÓN FINAL DENTRO DE LA MISMA TRANSACCIÓN
  -- =======================================================================
  select
    count(*) filter (where document_type = 'terms'   and version = 'v2' and status = 'active'),
    count(*) filter (where document_type = 'privacy' and version = 'v2' and status = 'active'),
    count(*) filter (where document_type = 'terms'   and version = 'v1' and status = 'archived'),
    count(*) filter (where document_type = 'privacy' and version = 'v1' and status = 'archived'),
    count(*) filter (where document_type = 'terms'   and status = 'active'),
    count(*) filter (where document_type = 'privacy' and status = 'active')
  into
    v_v2_terms_active, v_v2_privacy_active,
    v_archived_terms, v_archived_privacy,
    v_active_terms, v_active_privacy
  from public.legal_documents
  where document_type in ('terms', 'privacy');

  if v_v2_terms_active <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · terms/v2 activos = % (se esperaba 1). Se revierte.', v_v2_terms_active;
  end if;
  if v_v2_privacy_active <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · privacy/v2 activos = % (se esperaba 1). Se revierte.', v_v2_privacy_active;
  end if;
  if v_archived_terms <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · terms/v1 archivados = % (se esperaba 1). Se revierte.', v_archived_terms;
  end if;
  if v_archived_privacy <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · privacy/v1 archivados = % (se esperaba 1). Se revierte.', v_archived_privacy;
  end if;
  -- No debe quedar NINGÚN otro documento activo de esos tipos.
  if v_active_terms <> 1 then
    raise exception
      E'VERIFICACIÓN FALLIDA · hay % documentos «terms» activos (se esperaba\n'
      '  exactamente 1: el v2 recién publicado). Se revierte.', v_active_terms;
  end if;
  if v_active_privacy <> 1 then
    raise exception
      E'VERIFICACIÓN FALLIDA · hay % documentos «privacy» activos (se esperaba\n'
      '  exactamente 1: el v2 recién publicado). Se revierte.', v_active_privacy;
  end if;

  -- Ningún documento ACTIVO puede conservar el lenguaje retirado.
  select count(*) into v_rows
  from public.legal_documents
  where status = 'active'
    and document_type in ('terms', 'privacy')
    and (content ilike '%versión preliminar%'
      or content ilike '%beta%'
      or content ilike '%lanzamiento controlado%'
      or title   ilike '%preliminar%');

  if v_rows > 0 then
    raise exception
      E'VERIFICACIÓN FALLIDA · % documento(s) ACTIVO(S) siguen conteniendo\n'
      '  lenguaje de versión preliminar. Se revierte toda la transacción.', v_rows;
  end if;

  raise notice '';
  raise notice '=========================================================';
  raise notice ' OK · documentos legales v2 publicados y v1 archivados.';
  raise notice ' Todos los usuarios deberán aceptar de nuevo en /legal/accept.';
  raise notice '=========================================================';
  raise notice '';
end
$publish$;

-- Resultado final para inspección humana.
select document_type, version, status, left(title, 60) as titulo, published_at
from public.legal_documents
where document_type in ('terms', 'privacy')
order by document_type, version;

commit;
