# PE-05A · Qué hay hoy de pagos

Levantado leyendo el repositorio y la base aplicada. **No se dio por supuesto
que no hubiera nada**: se buscó.

## 1 · Código de pago: no existe

Búsqueda por `mercadopago`, `mercado_pago`, `stripe`, `wompi`, `paypal`,
`paddle`, `lemonsqueezy`, `payu`, `epayco`, `bold`, `invoice`, `refund`,
`chargeback`, `coupon`, `voucher`, `promo_code`, `webhook` en `lib`, `server`,
`app`, `components`, `supabase` y `scripts`:

| Término | Resultado |
|---|---|
| Todos los proveedores | **0 archivos** |
| `webhook` | **0 archivos** |
| `coupon` / `voucher` / `promo` | **0 archivos** |
| `invoice` / `refund` / `chargeback` | **0 archivos** |
| `bold` | 308 archivos — es `font-bold` de Tailwind, no la pasarela |
| `checkout` | **1** aparición: un valor del enum `source` en 0162 |

Dependencias del proyecto: ni un SDK de pagos. Solo `@supabase/*`, `next`,
`react`, `openai`, `pg`, `sharp`, `qrcode`, `fflate`, `jsdom`.

**Conclusión: PE-05 parte de cero.** No hay integración previa que auditar, ni
credenciales de pasarela esperadas, ni experimentos a medias que limpiar.

## 2 · El único rastro deliberado

0162 dejó dos ganchos preparados y sin usar:

```sql
source in ('seed', 'migration', 'trial', 'manual', 'checkout', 'promotion')
grant_kind in ('base', 'trial', 'sold', 'courtesy')
```

`checkout` y `promotion` como **origen** de una asignación, y `sold` como tipo de
concesión. PE-04 los dejó listos para que una activación por pago tuviera dónde
decir de dónde vino, sin inventar nada nuevo.

## 3 · Superficies públicas de precio: tampoco existen

Rutas públicas actuales: `/`, `/faq`, `/legal`, `/terms`, `/privacy`, `/survey`,
`/textile-passport-share`. **Ninguna menciona planes ni precios.** La portada no
tiene sección comercial.

Y no hay **ni un precio escrito a mano** en React. Los únicos sitios donde
aparecen cifras comerciales son:

- `components/domain/platform/plan-catalog-console.tsx` — campos de edición del
  catálogo (administración), no valores fijos.
- `lib/domain/commercial-catalog.ts` — `formatPrice`, que formatea lo que venga.

Eso es exactamente lo que PE-04B4/B5 dejaron: **una sola fuente de precio**.

## 4 · La fuente canónica de precio

`plan_revisions` de la revisión **publicada y vigente** por plan:

| Campo | Qué es |
|---|---|
| `plan_code` | `free` · `full` · `extra` |
| `price_state` | `configured` · `not_configured` |
| `currency` | `USD` |
| `monthly_price_minor` | céntimos enteros, **antes de impuestos** |
| `annual_price_minor` | ídem |
| `effective_from` / `effective_to` | vigencia de esas condiciones |

Valores vigentes hoy: Free `0/0` · Full `4000/40000` · Extra `10000/100000`.

Y B1 dejó ya la **proyección pública**: `v_public_plan_catalog` y
`v_public_plan_limits`, concedidas a `authenticated` y **nunca a `anon`** —a
propósito, hasta que exista una página pública que lo justifique—.

> **PAY-19** · La página pública de precios leerá esas vistas. No habrá una
> segunda tabla de precios ni una constante en React.

## 5 · Datos de facturación que ya existen

`organizations` tiene: `legal_name`, `tax_id` (NIT), `country`, `city`,
`address`, `contact_email`, `phone`. **No hace falta un perfil de empresa
duplicado**: lo que falta es, como mucho, un correo de facturación distinto del
de contacto, y solo si el negocio lo pide.

## 6 · Quién podría comprar, según el modelo de roles real

Tres roles de empresa: `admin`, `quality`, `consultant`. `canEditCompany` y
`canManageTeam` ya exigen **`admin`**, y el `consultant` es un asesor externo.

> **PAY-17** · Comprar, cambiar y cancelar el plan es de **`admin`**. Ni
> `quality` ni `consultant`, y desde luego no un consultor externo que factura
> aparte.

## 7 · Lo que NO hay y hará falta decidir

- **No hay motor de correo.** Ni Resend, ni SendGrid, ni SMTP. Las invitaciones
  se reparten como enlace. Cualquier aviso de pago fallido necesitará un canal
  que hoy no existe (ver `PE_05A_SUBSCRIPTION_LIFECYCLE.md`).
- **Sí hay un bus de hechos**: `work_events`, con `dedupe_key` y deduplicación
  por índice único. Sirve para registrar el hecho «pago fallido» sin construir
  todavía la entrega.
- **Sí hay telemetría de coste de IA**: `intelligence_run_cost_usd` y las vistas
  de plataforma. Lo que falta para la alerta de margen es el **otro lado**: los
  ingresos netos, que los crea PE-05.

---

# La pregunta que decide el modelo de cobro

## Qué compra realmente USD 40

PE-04 admite estado comercial **por módulo** —PEC-04 lo declaró un caso real que
no se podía perder: «PCR en Full y Textiles en Free»—. Pero PE-04 también decidió
que los recursos **de empresa** toman el **nivel más alto** entre los módulos.

Y ahí está el problema, con números:

| Recurso | Alcance | Con Full en **un solo** módulo |
|---|---|---|
| Almacenamiento | **empresa** | 500 MiB **para toda la empresa** |
| Créditos de Intelligence | **empresa** | 500 al mes **para toda la empresa** |
| Reloj de uso | **empresa** | **desaparece** en toda la empresa |
| Casos de soporte | **empresa** | los de Extra, si el módulo es Extra |
| Proveedores, materiales, evidencias, documentos… | módulo | solo en el módulo comprado |
| Importaciones, roles | módulo | solo en el módulo comprado |

Una empresa con Calidad, PCR y Textiles que comprara Full **para el módulo más
barato de usar** obtendría 500 MiB, 500 créditos y ningún límite de tiempo **en
los tres**. Lo único que seguiría limitado son los conteos y las funciones de los
otros dos.

Eso no es una laguna de implementación: es la consecuencia lógica de dos
decisiones correctas por separado —«hay recursos que son de la empresa» y «el
plan puede ser por módulo»— que nadie ha reconciliado todavía **en términos de
precio**.

## Las tres opciones

| | Qué significa | Consecuencia |
|---|---|---|
| **A · Plan de empresa** | USD 40 = Full para **toda** la empresa | simple de explicar, simple de cobrar, coherente con que los recursos ya son de empresa. Deja de existir el caso «PCR en Full y Textiles en Free» como algo *comprable* |
| **B · Plan por módulo** | USD 40 = Full **de un módulo** | conserva PEC-04, pero hay que **rediseñar los recursos de empresa** —o aceptar que una compra desbloquea capacidad en todos los módulos— |
| **C · Base + módulos** | una base por empresa y un precio por módulo adicional | el más justo y el más caro de construir y de explicar; multiplica los casos del checkout |

> **Recomendación: A, plan de empresa.**
>
> No por comodidad: porque es la única que **no exige rehacer PE-04**. Los cuatro
> recursos que más definen el plan —almacenamiento, Intelligence, tiempo y
> soporte— ya son de empresa por diseño, y están así porque el negocio los
> congeló así. Cobrar por módulo obligaría a partirlos por módulo, y eso deshace
> tres tramos de trabajo terminado.
>
> El estado por módulo **no desaparece**: sigue existiendo para lo que sirve
> —conceder acceso, cortesías, migraciones, casos particulares administrados
> desde la consola—. Lo que se decide aquí es que **el producto no se vende así**.

> **Decisión humana pendiente 5.** Es la de mayor impacto de PE-05: determina el
> checkout, el catálogo público, la interfaz de facturación y qué pasa al añadir
> un módulo a una empresa que ya paga. **Ningún tramo de implementación debería
> empezar sin ella.**

## Qué pasa al añadir un módulo

- Con **A**: el módulo nuevo hereda el plan de la empresa. No hay compra nueva y
  no hay nada que decidir.
- Con **B** o **C**: el módulo nuevo nace en Free y hay que comprarlo aparte, con
  su propia suscripción o su propia línea.

## Una sola suscripción por empresa

> **PAY-63** · Sea cual sea la respuesta, **una empresa no puede acabar con dos
> suscripciones activas contradictorias** en el proveedor. Si el modelo fuera por
> módulo, serían líneas de una misma suscripción, no suscripciones sueltas.

---

# Tramos propuestos para PE-05B

Derivados de lo que el descubrimiento encontró: no hay nada construido, así que
el orden lo marca **qué se puede probar sin proveedor** y **qué no se puede
empezar sin la decisión de alcance**.

| Tramo | Qué | Depende de |
|---|---|---|
| **B1 · Cimientos** | presupuesto, suscripción, pago, canje, RLS y el estado del catálogo público. Sin proveedor: con un adaptador falso, determinista, como el de Intelligence | **decisión 5** (alcance) |
| **B2 · Proveedor y webhooks** | adaptador real, verificación de firma, persistencia cruda, idempotencia, conciliación | decisiones 1 y 2 |
| **B3 · Precio final** | cupones, impuestos y conversión dentro del presupuesto | decisiones 2, 3 y 4 |
| **B4 · Checkout y facturación del cliente** | comprar, ver el estado, cancelar al final del periodo | B1–B3 |
| **B5 · Consola de facturación y ciclo de vida** | superadministración, gracia, cambios de plan, revisión manual de webhooks | decisiones 6, 7 y 8 |
| **B6 · Precios públicos y aceptación** | página pública desde el catálogo canónico, cierre integrado | todo |

Dos observaciones sobre este orden:

**B1 puede empezar sin proveedor.** Presupuesto, registros y RLS no necesitan
saber quién cobra; y construirlos primero con un adaptador falso es lo que
permite probar el ciclo entero —incluida la idempotencia— sin depender de un
sandbox ajeno. Es exactamente lo que `fakeProvider` hace hoy con Intelligence.

**Nada empieza sin la decisión 5.** Si el alcance cambia después de B1, cambia el
presupuesto, el checkout y la interfaz. Es la decisión que hay que tomar primero
aunque las demás parezcan más urgentes.

## Migraciones previstas

`0169` cimientos de facturación · `0170` eventos de proveedor y conciliación ·
`0171` cupones e impuestos. Ninguna se crea en PE-05A.
