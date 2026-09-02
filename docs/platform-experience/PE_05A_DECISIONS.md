# PE-05A · Decisiones de arquitectura (PAY-01 … PAY-62)

## Proveedor y frontera

| | |
|---|---|
| **PAY-01** | El dominio comercial no conoce al proveedor. Frontera `BillingProvider` con operaciones de negocio; ningún `mercadopago_*` fuera de la tabla de referencias |
| **PAY-02** | **Un solo proveedor** en el lanzamiento. Reemplazo posible, orquestación multi-proveedor no |
| **PAY-03** | Sandbox y producción separados por entorno. Credenciales de producción **solo** en Producción |
| **PAY-04** | **Trazaloop nunca ve una tarjeta.** Checkout alojado o tokenización; alcance PCI mínimo |

## Moneda

| | |
|---|---|
| **PAY-05** | Catálogo en **USD**, cobro recomendado en **COP** con importe exacto mostrado antes de pagar |
| **PAY-06** | Tipo de cambio **comercial fijado por administración**, con vigencia y margen. Auditable sin depender de terceros |
| **PAY-07** | El importe **se congela en el presupuesto**. Se guardan importe de catálogo, tipo, origen, instante e importe cobrado |

## Impuestos

| | |
|---|---|
| **PAY-08** | Cuatro cifras separadas: base, impuesto, referencia de regla y total |
| **PAY-09** | El **servidor** calcula el impuesto. La interfaz no |
| **PAY-10** | Configuración fiscal sin tocar código; **no** un motor fiscal global |
| **PAY-11** | **Recibo de pago ≠ factura electrónica.** PE-05 no implementa DIAN |

## Presupuesto

| | |
|---|---|
| **PAY-12** | Todo cobro nace de un **presupuesto** que congela plan, revisión, intervalo, precio, descuento, impuesto, cambio y total |
| **PAY-13** | **El navegador no es autoridad de precio.** Solo manda intenciones |
| **PAY-14** | El presupuesto **caduca** (30 min sugeridos) |
| **PAY-15** | El intervalo es atributo del **cobro**, no identidad de plan. No hay `full_monthly` |

## Ciclo de vida

| | |
|---|---|
| **PAY-16** | **Derecho ≠ pago ≠ autorización.** Los tres ejes siguen separados |
| **PAY-17** | Compra, cambia y cancela el **`admin`**. Ni `quality` ni `consultant` |
| **PAY-18** | Free y la prueba **no pasan por caja** ni crean nada en el proveedor. Free funciona con la pasarela caída |
| **PAY-19** | La página pública lee la proyección canónica. **No hay segunda fuente de precio** |
| **PAY-20** | **Volver del checkout no activa nada.** Manda el evento verificado |
| **PAY-21** | La activación usa **`commercial_assign_plan`**, con `source='checkout'` y `grant_kind='sold'` |
| **PAY-22** | Estados de suscripción **canónicos de Trazaloop**; los del proveedor se traducen en la frontera |
| **PAY-23** | La comisión del proveedor se guarda para análisis y **nunca** altera el derecho |
| **PAY-24** | Una renovación **no crea** transición de plan redundante |
| **PAY-25** | Un fallo de cobro **no baja el plan de inmediato** |
| **PAY-26** | **Pasarela caída ≠ pago fallido.** Estado propio, sin efecto comercial |
| **PAY-27** | Gracia recomendada de **14 días** conservando el plan; después, suelo Free sin borrar nada |
| **PAY-28** | Durante la gracia **no se dice «eres Free»** |
| **PAY-29** | Cancelar es **al final del periodo pagado** |
| **PAY-30** | La cancelación inmediata es acción **administrativa**, no el botón del cliente |
| **PAY-31** | Bajar de plan: **al final del periodo** |
| **PAY-32** | Subir: inmediato **solo si el proveedor prorratea**; si no, siguiente periodo |
| **PAY-33** | Mensual ↔ anual: siguiente ciclo |
| **PAY-34** | Una devolución **no borra datos** ni retira el derecho automáticamente |
| **PAY-35** | Un contracargo abre **revisión manual** |
| **PAY-36** | Un error no se corrige borrando historia: se emite **transición compensatoria** |
| **PAY-37** | Los avisos se **registran** en `work_events`; la entrega espera a que exista canal |

## Webhooks

| | |
|---|---|
| **PAY-38** | **Verificar antes de creer.** Sin firma válida, cero efecto |
| **PAY-39** | El evento se guarda **crudo** antes de interpretarlo |
| **PAY-40** | `provider_event_id` único **y** efecto idempotente. Dos líneas de defensa |
| **PAY-41** | Firma inválida, tipo desconocido o error: **ninguno concede nada** |
| **PAY-42** | El privilegio del webhook vive **solo ahí**, documentado |
| **PAY-43** | El entorno viaja en el evento y se rechaza si no coincide |
| **PAY-44** | Conciliación periódica que **informa, no corrige sola** |

## Cupones

| | |
|---|---|
| **PAY-45** | Un cupón toca **el precio**, nunca las capacidades |
| **PAY-46** | Los códigos son **datos**, no lógica |
| **PAY-47** | Dos tipos desde el principio: porcentaje e importe fijo |
| **PAY-48** | Cupón de aliados: hasta **40 % sobre Full** |
| **PAY-49** | `eligible_plan_codes` **explícito**. Extra **no hereda** el de Full |
| **PAY-50** | El Acompañamiento **no admite** cupones de SaaS |
| **PAY-51** | El servidor valida todo; el navegador manda un código |
| **PAY-52** | El canje se registra aparte y **no se reescribe** |
| **PAY-53** | **No se verifica la pertenencia a gremios.** Tener el código basta (decisión de negocio) |

## Seguridad

| | |
|---|---|
| **PAY-54** | Idempotencia en las siete mutaciones financieras |
| **PAY-55** | Serialización **por empresa**, y la invariante de 0168 sigue vigilando |
| **PAY-56** | Ninguna credencial del proveedor llega al navegador ni a una vista |
| **PAY-57** | RLS por rol en todo lo financiero; toda tabla nueva nace con política |
| **PAY-58** | Ningún registro de pago es público |
| **PAY-59** | La historia financiera vive en **tablas de dominio**, no en `audit_log` |

## Acompañamiento

| | |
|---|---|
| **PAY-60** | **No entra en `plan_revisions`.** No es un nivel comercial |
| **PAY-61** | Catálogo de servicios y contrato, mínimos. **Sin** motor de horas |
| **PAY-62** | **No se vende en línea en el lanzamiento**: contratación comercial manual |
