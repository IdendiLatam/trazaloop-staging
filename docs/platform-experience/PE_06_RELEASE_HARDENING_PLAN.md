# PE-06 · Plan de endurecimiento y salida a Producción

*PE-06A, escrito el 5 de septiembre de 2026. **No es una implementación**:
convierte lo que queda en un plan ordenado y con puertas explícitas.*

*Cabeceras: Local **0182** · Staging **0182** · **Producción 0111**. En este
tramo no se ha migrado, ni desplegado, ni configurado, ni cobrado nada.*

---

## Principio

Nada de «desplegamos y vemos qué pasa». Cada paso irreversible lleva
**precondición**, **evidencia de ejecución**, **postcondición** y **plan de
contención**. Lo que no se pueda revertir se dice que no se puede, y se contiene
hacia delante.

---

## 1 · El salto de Producción: 0112 → 0182

**71 migraciones.** El tramo entero se leyó y se clasificó por lo que hace, no
por su nombre.

Lo primero, porque es lo que más tranquiliza:

> En las 71 no hay **ni un `drop table`**, **ni un `drop column`**, y hay **un
> solo `delete`** —el de 0147, sobre una fila de catálogo y condicionado a que
> nadie la referencie—.

La cadena es **aditiva**.

| Grupo | Migraciones | Qué son |
|---|---|---|
| Quality · dominio | 0112–0135, 0149–0154 | Procesos, documentos, objetivos, casos, riesgos, personas, proveedores, cliente, auditorías, revisión, automatización, copiloto, partes interesadas |
| TrazaDocs / documentos | 0136–0139, 0142 | Guía canónica, perfil de empresa, redacción, revisión contextual, catálogo de evidencias |
| Intelligence | 0140–0141 | Uso y coste, visibilidad de plataforma |
| Textiles | 0143–0148 | Códigos de unidad, contenido reciclado, inventario, movimientos, endurecimiento |
| Platform Experience | 0155–0161 | FAQ, legales, ayuda contextual, tutoriales, preferencias |
| Comercial (PE-04) | 0162–0168 | Catálogo de planes, migración comercial, cuota de almacenamiento, RLS de Quality, créditos, soporte, transición |
| Facturación (PE-05) | 0169–0182 | Presupuestos, proveedores, periodos, renovación, cupones, transiciones, tipo de cambio |

### Migraciones que merecen atención

Ninguna es «insegura», pero seis se comportan según **lo que Producción
contenga**, y por eso el inventario de datos va antes que ellas.

| Migración | Qué hace | Riesgo |
|---|---|---|
| **0163** | Llama a `commercial_migrate_organizations()`, que recorre **cada empresa** y le crea su base Free y su nivel vendido según `organization_modules.access_mode` | **El único recorrido sobre datos de inquilino.** Es idempotente (`if not exists`) y solo **inserta**. Su resultado depende por completo de qué haya en Producción |
| **0147** | `delete` de una metodología de catálogo | Condicionado a que ningún cálculo la referencie. Si hay cálculos, la fila se queda inerte |
| **0164** | Reconcilia intenciones de subida de ficheros | Toca `storage_upload_intents` y los de Textiles; no toca objetos |
| **0134**, **0153**, **0156** | Rellenos acotados sobre `quality_ai_runs`, plantillas de automatización y `legal_documents` | Correcciones de datos propios del producto |
| **0181** | Rellena el ancla de facturación de las suscripciones existentes | Sin suscripciones en Producción, no hace nada |
| **0182** | Rellena la identidad comercial de las obligaciones, **de forma conservadora** | Lo que no se sabe se queda vacío, no se deduce |

### Lo que protege la cadena

- **`SEC01_RLS_PREFLIGHT`** en 0166–0180: se niegan a correr sobre una base con
  tablas expuestas.
- **Precondiciones explícitas** (`presupone`) en 0170–0182: cada una comprueba
  que existe lo que necesita y aborta si no.
- **Semillas de catálogo idempotentes** en las de contenido (FAQ, tutoriales,
  planes, pesos de IA, reglas fiscales).

**Veredicto:** la cadena se puede aplicar en orden y de una vez. Lo que **no** se
puede es aplicarla sin haber mirado antes qué hay en Producción, porque 0163
actúa sobre ello.

---

## 2 · Verificar los datos de Producción — solo lectura

El dueño de producto dijo que Producción no tiene información de clientes que
haya que preservar. **Eso se trata como una suposición sin verificar**, no como
una verdad permanente, y se comprueba **inmediatamente antes** del corte.

En PE-06A **no se ha inspeccionado Producción**. Esto es la lista, lista para
correr:

```sql
-- Empresas, personas y pertenencia
select count(*) from public.organizations;
select count(*) from auth.users;
select count(*) from public.memberships;
select count(*) from public.profiles;

-- Módulos habilitados y su modo de acceso  ← lo que leerá 0163
select module_code, access_mode, count(*)
  from public.organization_modules group by 1,2 order by 1,2;

-- Dominio de negocio
select count(*) from public.evidences;
select count(*) from public.trazadoc_file_documents;
select count(*) from public.production_orders;
select count(*) from public.textile_products;

-- Comercial y facturación (deberían estar vacías: Producción es 0111)
select to_regclass('public.organization_plan_assignments');
select to_regclass('public.billing_subscriptions');

-- Soporte
select count(*) from public.support_tickets;

-- Objetos de almacenamiento por cubo
select bucket_id, count(*), sum((metadata->>'size')::bigint)
  from storage.objects group by 1 order by 1;
```

**Regla:** si `organizations` devuelve algo distinto de cero, el corte **para** y
se replantea; 0163 dejaría de ser una migración vacía y pasaría a ser una
migración de datos reales, que exige su propio ensayo.

---

## 3 · Puerta de Wompi · `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = YES`

Lo probado lo está **en sandbox**. La configuración de producción es otra cuenta,
con otro adquirente y otras reglas. **El sandbox no cierra esta puerta.**

| Elemento | Clase |
|---|---|
| Afiliación al Gateway aprobada | **BLOQUEANTE · EXTERNO** |
| Adquirencia de Bancolombia activa | **BLOQUEANTE · EXTERNO** |
| Comercio electrónico / *Card Not Present* habilitado | **BLOQUEANTE · EXTERNO** |
| Procesador de tarjetas real identificado | **BLOQUEANTE · DESCONOCIDO** |
| Recurrencia Visa | **BLOQUEANTE · DESCONOCIDO** |
| Recurrencia Mastercard | **BLOQUEANTE · DESCONOCIDO** |
| Credencial almacenada (COF) en producción | **BLOQUEANTE · DESCONOCIDO** |
| RBM o equivalente documentado | **BLOQUEANTE · DESCONOCIDO** |
| Configuración de 3DS | **BLOQUEANTE · DECISIÓN** |
| 3RI, si se adopta | NO BLOQUEANTE · DECISIÓN |
| Tarjetas internacionales, si hacen falta | NO BLOQUEANTE · EXTERNO |
| Credenciales de producción (pública, privada, eventos, integridad) | **BLOQUEANTE · EXTERNO** |
| URL de webhook y eventos configurados | **BLOQUEANTE · INTERNO** |
| Comisiones y condiciones comerciales | NO BLOQUEANTE · EXTERNO |
| Liquidación y abonos | NO BLOQUEANTE · EXTERNO |

### Qué hay que volver a probar, y qué no

**Ya probado dentro, no depende del adquirente** — no se repite:
conciliación exacta de importe y moneda, idempotencia por identificador de pago,
rechazo de referencia repetida, encaminamiento de los tres tipos de cobro,
prorrateo de la subida, calendario y gracia, congelado de importes, verdad
histórica.

**Depende del Gateway de producción** — hay que verlo allí:
que una fuente de pago se pueda guardar; que un cobro con credencial almacenada
sea aceptado; que el evento firmado llegue a la URL de producción y valide; y
que un importe distinto sobre la misma fuente siga aceptándose.

**Mínimo humo de pago en Producción** (PE-06D, no antes): **una** contratación
real de importe bajo con tarjeta real del equipo, su webhook, y **una** pasada
del corredor en seco. Nada más. La renovación real y el cambio de plan se
observan cuando ocurran solos.

---

## 4 · Puerta del planificador · `PRODUCTION_RENEWAL_SCHEDULER_NOT_CONFIGURED = YES`

| Pieza | Estado hoy |
|---|---|
| Ruta `POST /api/billing/renewals/run` | desplegada, **falla cerrada** sin secreto (404) |
| `BILLING_RENEWAL_RUNNER_SECRET` (mirar) | en Preview · **ausente en Producción** |
| `BILLING_RENEWAL_EXECUTE_SECRET` (cobrar) | **ausente en los dos** |
| `BILLING_RENEWAL_EXECUTION_ENABLED` | **ausente en los dos** |
| `BILLING_RENEWAL_EXECUTION_ALLOWLIST` | **ausente en los dos** |
| Llamador externo / cron | **no existe** (no hay `vercel.json`) |
| Cadencia prevista | horaria |
| Observabilidad | `billing_renewal_runs` + consola de plataforma |

**Orden de activación** (PE-06D, y solo cuando la puerta de Wompi esté cerrada):

1. desplegar el dominio y comprobar que sin secreto la ruta responde 404;
2. poner **solo** el secreto de mirar y comprobar una pasada **en seco**;
3. configurar el llamador externo seguro, todavía en seco;
4. observar varias pasadas en seco con vencimientos reales;
5. y solo entonces encender ejecución: interruptor, secreto de ejecución y lista
   blanca **acotada a una suscripción**, antes de abrirla.

---

## 5 · El tipo de cambio en Producción

Sin tasa vigente **no se pueden fijar precios nuevos**: contratar, cambiar de
plan y subir fallan cerrado. Renovar no la necesita.

- **Quién:** superadministración humana.
- **Cuándo:** después de desplegar, antes del primer humo de pago.
- **Cómo:** `/platform/plans → Tipo de cambio → Fijar un tipo de cambio`.
- **`effective_from`:** el instante del corte, no una fecha redonda inventada.
- **Verificación:** la pantalla dice «Vigente ahora», y una contratación de
  prueba presupuesta el importe esperado.
- **Retirada:** si la tasa fuese incorrecta y **no ha puesto precios todavía**,
  se abre otra que la cierra; si ya los puso, **no se reescribe** —se abre la
  siguiente y lo cobrado queda como está—.

**No se siembra por migración.** Sembrarla congelaría en el esquema un número
comercial que cambia, y quitaría la decisión de quien debe tomarla.

---

## 6 · Impuestos y legal

Hoy: **19 %** en Full, Extra y Acompañamiento. La exención de software de
autoservicio **no está activa**.

| Elemento | Clase |
|---|---|
| Confirmación contable del tratamiento | **BLOQUEANTE · EXTERNO** |
| Redacción legal y comercial que ve el cliente | **BLOQUEANTE · INTERNO** |
| Estado ante MinTIC, si se persigue la exención | NO BLOQUEANTE · EXTERNO |
| Fecha efectiva de una exención futura | NO BLOQUEANTE · DECISIÓN |
| Preservación de lo ya cobrado | **YA RESUELTO** — el impuesto se congela en el pago |

Una regla fiscal nueva es **prospectiva**: nunca reescribe historia.

---

## 7 · Identidades de superadministración

| Identidad | Qué hacer |
|---|---|
| `idendilatam@gmail.com` | superadministración humana prevista. Verificar que existe en Producción, que tiene el papel y que puede entrar |
| `qa-a@trazaloop-staging.local` | identidad de aceptación de Staging. **Retirar en el corte**, no antes: sigue haciendo falta hasta la última prueba |
| Cuentas de sonda y prueba | inventariar y desactivar; **no borrar** |
| Atribución histórica | **se conserva siempre**. Quien firmó una publicación sigue firmándola aunque su cuenta se desactive |

Secuencia: verificar el superadministrador humano → confirmar que ninguna
identidad de QA tiene sesión viva en Producción → desactivar (no borrar) →
comprobar que la atribución histórica sigue visible.

**En PE-06A no se ha desactivado ni revocado nada.**

---

## 8 · Variables de entorno

Solo nombres y presencia. **Ningún valor.**

| Variable | Clase | Local | Preview | Producción |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública, en tiempo de construcción | ✔ | ✔ | ✔ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | — | ✔ | ✔ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública (heredada) | ✔ | ✔ | — |
| `NEXT_PUBLIC_SITE_URL` | pública | ✔ | ✔ | ✔ |
| `SUPABASE_SECRET_KEY` | secreto de servidor | — | ✔ | ✔ |
| `SUPABASE_SERVICE_ROLE_KEY` | secreto (heredado) | ✔ | ✔ | — |
| `SUPABASE_DB_URL` | solo local | ✔ | — | — |
| `ACTIVE_ORG_COOKIE_SECRET` | secreto de servidor | ✔ | ✔ | ✔ |
| `PUBLIC_REGISTRATION_ENABLED` | bandera | ✔ | ✔ | ✔ |
| `TEXTILES_MODULE_ENABLED` | bandera | ✔ | ✔ | ✔ |
| `QUALITY_MODULE_ENABLED` | bandera | ✔ | ✔ | **AUSENTE** |
| `QUALITY_AI_PROVIDER` · `_API_KEY` · `_MODEL` · `_REASONING_EFFORT` | credencial de proveedor | — | ✔ | **AUSENTE** |
| `WOMPI_PUBLIC_KEY` · `_PRIVATE_KEY` · `_EVENTS_SECRET` · `_INTEGRITY_SECRET` | credencial de proveedor | — | ✔ | **AUSENTE** |
| `BILLING_RENEWAL_RUNNER_SECRET` | secreto de corredor | — | ✔ | **AUSENTE** |
| `AUTOMATION_RUNNER_SECRET` | secreto de corredor | — | ✔ | **AUSENTE** |
| `MERCADOPAGO_ACCESS_TOKEN` · `_TEST_BUYER_EMAIL` | **obsoletas** | — | ✔ | — |
| `NEXT_TELEMETRY_DISABLED` | opcional | ✔ | ✔ | — |

### Lo que hay que saber de esta tabla

**Los nombres heredados tienen respaldo en el código.** `SUPABASE_SECRET_KEY ??
SUPABASE_SERVICE_ROLE_KEY` y `PUBLISHABLE_KEY ?? ANON_KEY`. Producción usa los
nombres nuevos y funciona. **No es un bloqueo.**

**Todo lo que falta en Producción falla CERRADO, no roto.** Una bandera de módulo
solo enciende con `"true"` o `"1"`; la llave de Intelligence exige más de veinte
caracteres; sin llaves de Wompi el proveedor se declara no configurado; sin
secreto de corredor la ruta responde 404. **Se puede desplegar Producción antes
de tener las credenciales de pago**, y el producto simplemente no ofrecerá lo que
no puede sostener.

**Decisión pendiente:** `QUALITY_MODULE_ENABLED` no existe en Producción. Si
Quality entra en el arranque, hay que ponerla; si no, hay que decirlo. **Es una
decisión de producto, no un olvido de configuración.**

**Limpieza:** `MERCADOPAGO_*` sobra. Mercado Pago quedó como historia y no se usa.

---

## 9 · El riesgo de `NEXT_PUBLIC` — y es real

Los valores `NEXT_PUBLIC_*` se **incrustan al construir**. Preview y Producción
son **el mismo proyecto de Vercel** (`trazaloop-production`) con dos destinos.

> **Nunca promover una construcción de Preview a Producción.** Una construcción
> de Preview lleva dentro la URL y la llave pública de **Staging**: promoverla
> haría que Producción sirviera datos de Staging. No es una hipótesis: es lo que
> pasaría.

Regla: Producción se construye **con destino producción**, siempre. Y después
del despliegue, antes de anunciar nada, se comprueba desde el navegador que la
URL de Supabase incrustada es la de Producción.

---

## 10 · Copias de seguridad y reversión

Lo que hay que **verificar** antes de migrar (no se ha verificado en PE-06A: hace
falta acceso a la administración del proyecto de Supabase):

- que existe copia de seguridad reciente del proyecto de Producción;
- si el plan contratado incluye **recuperación a un punto en el tiempo (PITR)** y
  con qué ventana;
- que se puede **descargar** una copia lógica antes del corte y dónde se guarda.

**Lo que sí se puede decir ya, sin adornos:**

| | Reversible |
|---|---|
| Despliegue de la aplicación | **Sí** — se vuelve al despliegue anterior |
| Variables de entorno | **Sí** |
| Tipo de cambio | **Sí por vigencia**, nunca por borrado |
| Migraciones 0112→0182 | **No hay `down`.** La reversión real es *restaurar la copia* |
| Objetos de almacenamiento | **No.** Un objeto borrado no vuelve |
| Cobro real al proveedor | **No.** Un cobro se contiene, no se deshace |

Por eso la estrategia es **copia antes + contención después**, no «rollback».
Prometer lo contrario sería mentir.

---

## 11 · Ensayo de la migración

Local y Staging llegaron a 0182 **incrementalmente**, migración a migración.
Producción daría **un salto de 71 de golpe** desde 0111. Que las dos primeras
funcionen no demuestra que el salto funcione.

**Estrategia recomendada, con lo que hay hoy:**

1. **Base limpia desechable.** Levantar una base nueva (Supabase local o proyecto
   temporal), aplicar **0001→0111** para reproducir la línea de Producción, y a
   partir de ahí aplicar **0112→0182 de una sola tirada**, midiendo tiempo y
   anotando la primera que falle.
2. **Con datos parecidos.** Repetir cargando antes una copia lógica de la
   estructura y los datos de Producción —cuando el inventario del punto 2 diga
   qué hay—, para que 0163 tenga sobre qué actuar.
3. **Después del ensayo:** correr `test:all` contra esa base, más el guardián
   SEC-01 y un humo de la aplicación.

**Si la infraestructura permite ramas de base de datos**, una rama efímera de
Producción es mejor que una base sintética: parte de datos reales sin tocarlos.
Hay que confirmar si el plan contratado las incluye.

---

## 12 · Observabilidad para el primer arranque

| Qué | Estado |
|---|---|
| Pasadas de renovación (`billing_renewal_runs` + consola) | **existe** |
| Estado de cada intento y clase de fallo | **existe** |
| Eventos del proveedor con su desenlace | **existe** |
| Historial de cobros del cliente | **existe** |
| Suscripciones y cambios, en consola de plataforma | **existe** |
| Estado de almacenamiento por empresa | **existe** |
| Créditos de Intelligence y su consumo | **existe** |
| Entrada de soporte | **existe** |
| **Aviso activo cuando aparece `provider_unknown`** | **falta · BLOQUEANTE para encender el cobro automático** |
| **Aviso activo cuando falta tipo de cambio vigente** | falta · seguimiento |
| **Aviso activo cuando una suscripción caduca** | falta · seguimiento |

Hoy todo se **consulta**; nada **avisa**. Para el despliegue sin cobro automático
eso basta. Para encender el planificador, no: un cobro en duda que nadie mira
durante una semana es exactamente el caso que la arquitectura evita en la base y
que la operación tiene que rematar.

**No se construye una plataforma de observabilidad en PE-06.** Un aviso por
correo o por Slack sobre `billing_renewal_runs` es suficiente.

---

## 13 · Puerta de seguridad para el corte

Todo esto ya está probado y se **vuelve a correr** contra Producción tras migrar:

- **0** tablas base de `public` sin RLS;
- aislamiento entre empresas;
- límites de superadministración y soporte de solo lectura;
- ninguna vista de propietario sin clasificar;
- ningún secreto en el paquete del navegador;
- `PAN_SERVER_EXPOSURE = NONE`, `CVV_SERVER_EXPOSURE = NONE`,
  `RAW_CARD_TOKEN_DURABLE_STORAGE = NONE`;
- validación de firma y de entorno en el webhook;
- secreto del corredor aislado del de ejecución;
- separación real entre Preview y Producción.

---

## 14 · Prueba humana del corte

Solo lo que una persona juzga mejor que una prueba:

1. entrar y elegir módulo;
2. ver el plan y lo que incluye;
3. contratar: que el importe y el impuesto se entiendan **antes** de pagar;
4. fijar el tipo de cambio desde plataforma;
5. crear una campaña y aplicar un cupón;
6. leer la explicación de subir y bajar de plan;
7. leer el historial de cobros.

**Nadie repite a mano** RLS, inmutabilidad, conversión de centavos, techos de
cupón ni permisos: eso está probado y se ve fallar cuando se rompe.

---

## 15 · Orden del corte

Cada paso solo empieza cuando el anterior dejó evidencia.

1. congelar el commit de salida;
2. **verificar los datos de Producción** (solo lectura);
3. verificar copia de seguridad y ventana de recuperación;
4. cerrar la puerta de Wompi (o decidir salir **sin cobro**);
5. cerrar la puerta fiscal y legal;
6. completar variables de entorno de Producción y decidir Quality;
7. evidencia del ensayo de migración;
8. **aplicar 0112→0182**;
9. desplegar la aplicación **con destino producción**;
10. comprobar la configuración pública incrustada;
11. humo de lo que no cobra: entrar, módulos, Quality, Textiles, ayuda, soporte;
12. **fijar el tipo de cambio** desde plataforma;
13. humo de contratación con tarjeta real de importe bajo;
14. comprobar el webhook firmado y la liquidación;
15. corredor **en seco**, varias pasadas;
16. activación controlada del planificador —solo con la puerta de Wompi cerrada—;
17. desactivar identidades de QA, conservando su atribución;
18. correr la puerta de seguridad completa;
19. firma de salida.

**Salir sin cobro es una opción legítima.** Si la puerta de Wompi no se cierra a
tiempo, los pasos 13–16 se aplazan y el producto sale con Free y las
contrataciones desactivadas. Todo lo demás funciona.

---

## 16 · Fallos y contención

| Fallo | Cómo se detecta | Contención | Vuelta atrás | Impacto en el cliente |
|---|---|---|---|---|
| Una migración aborta a mitad | código de salida de `psql` | parar la cadena; **no** seguir a mano | restaurar la copia | Producción no publicada todavía → ninguno |
| Despliegue defectuoso | humo posterior | volver al despliegue anterior | inmediata | minutos de servicio raro |
| **Construcción de Preview promovida** | la URL pública incrustada apunta a Staging | despliegue inmediato con destino producción | inmediata | **grave**: datos de otro entorno |
| Wompi no disponible | el adaptador se declara no configurado | contratar falla cerrado | no aplica | no se puede comprar; nada se rompe |
| El webhook no llega | pago enviado sin liquidar | reconciliar releyendo la transacción | no aplica | plan no concedido pese al cobro → revisión humana |
| Sin tipo de cambio | `no_active_rate` | fijar la vigencia | no aplica | no se puede contratar; renovar sigue |
| Planificador mal configurado | pasadas con `provider_calls` inesperados | quitar el interruptor y la lista blanca | inmediata | posible cobro indebido → revisión |
| Cobro en duda | `provider_unknown` | no se concede, no se recobra | no aplica | espera hasta que una persona lo resuelva |
| Fallo de RLS o aislamiento | guardián SEC-01 | **parar la salida** | volver atrás el despliegue | crítico |

---

## 17 · Fases

| Fase | Qué |
|---|---|
| **PE-06A** | *(esta)* arquitectura, inventario y puertas |
| **PE-06B** | Ensayo de la migración + línea base de Producción en solo lectura |
| **PE-06C** | Preparar la configuración de Producción: variables, decisión de Quality, credenciales cuando existan, copia y observabilidad mínima |
| **PE-06D** | Corte controlado: migrar, desplegar, humo, tipo de cambio, pago y activación del planificador |
| **PE-06E** | Verificación posterior y cierre de la salida |

Ninguna fase empieza sola.

---

## 18 · Lo que bloquea hoy

```
WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = YES     ← externo
PRODUCTION_RENEWAL_SCHEDULER_NOT_CONFIGURED = YES  ← interno, tras el anterior
TAX_LEGAL_VERIFICATION_PENDING = YES               ← externo
PRODUCTION_DATA_BASELINE_UNVERIFIED = YES          ← interno, PE-06B
MIGRATION_REHEARSAL_NOT_PERFORMED = YES            ← interno, PE-06B
PRODUCTION_BACKUP_EVIDENCE_MISSING = YES           ← interno, PE-06C
PRODUCTION_ENV_INCOMPLETE = YES                    ← interno, PE-06C
QUALITY_MODULE_PRODUCTION_DECISION_PENDING = YES   ← decisión de producto
PROVIDER_UNKNOWN_ALERTING_MISSING = YES            ← interno, bloquea el cobro automático
```

Producción sigue en **0111**. PE-05 sigue **cerrado**.
