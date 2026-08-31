# PE-01A · DESCUBRIMIENTO DE LA EXPERIENCIA DE ENTRADA

Leído del código, no de la documentación. Todas las rutas, funciones y ficheros citados
existen y se comprobaron el 2026-08-30 sobre `c54bf6b`.

---

## 1 · Dónde vive cada cosa

| Superficie | Ruta | Fichero |
|---|---|---|
| Portal público | `/` | `app/page.tsx` |
| Login / registro | `/login`, `/register` | `app/(auth)/…` |
| **Selector de módulos** | `/modules` | `app/(app)/modules/page.tsx` (215 líneas) |
| Selector de empresa | `/select-org` | `app/(app)/select-org/page.tsx` |
| Shell autenticado | — | `app/(app)/(shell)/layout.tsx` |
| Navegación del shell | — | `components/layout/nav.tsx` + `lib/modules/registry.ts` |
| Portada de PCR | `/dashboard` | `app/(app)/(shell)/(cpr)/dashboard/page.tsx` |
| Portada de Quality | `/quality` | `app/(app)/(shell)/quality/page.tsx` · **cerrada en 13B4** |
| Portada de Textiles | `/textiles` | `app/(app)/(shell)/textiles/…` |

**Cinco superficies distintas**, y PE-01 solo toca la tercera. La portada de Quality quedó
aceptada por un humano en QUALITY-13B4 y **no se rediseña**.

---

## 2 · El flujo de entrada actual, paso a paso

```
login  →  redirectPostAuth
          └─ postAuthDestinationPath(resolvePostAuthDestination(hechos))
             ├─ invitación pendiente única  →  /accept-invite?token=…
             └─ todo lo demás               →  /modules
/modules  →  tarjeta «Entrar»  →  homePath del módulo
elegir empresa  →  writeActiveOrgCookie  →  /modules
```

**Hallazgo bueno, y es el más importante del descubrimiento:** el supuesto «PCR es el
destino por defecto» **ya no existe en el flujo de entrada**. Lo quitaron el Sprint 10A
(login → `/modules`) y QUALITY-01.2 (aceptar invitación y elegir empresa → `/modules`).
`resolvePostAuthDestination` sigue devolviendo un caso llamado `"dashboard"`, pero
`postAuthDestinationPath` lo traduce a `/modules`: **el nombre es histórico, el
comportamiento es correcto.**

---

## 3 · El catálogo de módulos · ya es canónico

`lib/modules/catalog.ts` es fuente única desde el Sprint T9F, con espejo en BD
(`modules.is_functional`) verificado por prueba unitaria.

| clave | `module_code` | estado | `homePath` | kill switch |
|---|---|---|---|---|
| `cpr` | `traceability_6632` | functional | `/dashboard` | — |
| `textiles` | `textiles` | functional | `/textiles` | `TEXTILES_MODULE_ENABLED` |
| `quality` | `quality` | functional | `/quality` | `QUALITY_MODULE_ENABLED` |
| `construccion` | `construccion` | **coming_soon** | `null` | — |

Más `core`, que es infraestructura y **no** es una tarjeta comercial.

**No hace falta consolidar nada** (§27): el catálogo existe, es único, declara la ruta de
entrada de cada módulo y una prueba exige que esa ruta exista en disco. Crear una segunda
lista sería el defecto que T9F vino a corregir.

---

## 4 · El modelo de estados · ya existe y es bueno

`lib/modules/access.ts` resuelve nueve estados con la hora del servidor:

```
demo_active · demo_permanent · demo_expired · full · extra
disabled · globally_disabled · coming_soon · not_assigned
```

Con sus etiquetas y frases en `lib/modules/messages.ts`, y `isEnterableState()` como espejo
del permiso real. **No hay que inventar estados comerciales nuevos** (§6): los que pide el
encargo ya existen, salvo `free`, que es de PE-04.

La regla: funcional **y** publicado **y** kill switch activo **y** asignación **y**
`enabled` **y** modo vigente. La barrera real es el guard de servidor de cada módulo; la
tarjeta solo comunica.

---

## 5 · El aviso de pruebas · más maduro de lo que parecía

`classifyDemoNotice` distingue cinco situaciones y —esto es lo importante— **habla siempre
de módulos, nunca de la cuenta**:

| Aviso | Cuándo |
|---|---|
| `none` | nada que anunciar |
| `active` | TODO lo que la empresa tiene está en prueba |
| `active_partial` | hay pruebas, pero algo no es una prueba |
| `partial` | venció alguna, queda al menos un módulo entrable |
| `all_expired` | venció alguna y no queda ninguno |

Ya se corrigió dos veces el mismo error de fondo: decir «tu cuenta venció» cuando el hecho
era de un módulo. La banda aparece en el shell **y** en el selector, y se puede cerrar
durante la sesión.

**Lo que sigue mal:** la banda vive en el `layout` del shell, así que se ve **dentro de
Quality** mientras alguien trabaja, hablando de una prueba de PCR que no le afecta. Es
ruido persistente, no un error de contenido.

---

## 6 · Lo que SÍ está roto · tres hallazgos

### 6.1 · Un fallo de lectura se presenta como «no tienes el módulo» · **PE-D1**

`lib/db/module-access.ts:51`

```ts
const { data } = await supabase.from("organization_modules")…;
if (!data) return null;          // ← el `error` se descarta
```

`null` → `resolveModuleAccess` → **`not_assigned`** → la tarjeta dice
**«Sin asignar · Este módulo no está asignado a la empresa»**.

Es decir: una denegación de RLS, un corte de red o un error de PostgREST se presentan como
una **decisión comercial**. Es exactamente el fallo que Quality persiguió cinco veces
—12.2F, B1, B2, B3, B4— y la puerta de entrada de la plataforma todavía lo tiene.

Gravedad: alta. Es la primera pantalla que ve alguien después de entrar.

### 6.2 · La plataforma devuelve a PCR a quien no es staff · **PE-D2**

`lib/auth/require-platform-staff.ts:18` → `redirect("/dashboard")`

Alguien sin permiso de plataforma que abre `/platform/*` acaba en la portada de **PCR**,
tenga PCR o no. Si no lo tiene, el guard de PCR lo devuelve al selector: un rebote.

### 6.3 · El shell transversal cae en PCR por omisión · **PE-D3**

`lib/modules/registry.ts` · `resolveShellModuleForPath` → «si no, CPR».

Mitigado con el parámetro `?m=`, que los enlaces internos arrastran. Pero una URL
transversal escrita a mano, guardada en marcadores o llegada por correo —`/team`,
`/settings/company`, `/support`— muestra **el shell de PCR** a una empresa que solo tiene
Quality: menú de PCR, identidad de PCR, normas de PCR.

---

## 7 · Empresa sin ningún módulo entrable

Hoy: el selector pinta las cuatro tarjetas, todas sin enlace, con sus frases correctas
(«Prueba finalizada», «Sin asignar», «Próximamente»). No hay bucle de redirección —bien—
pero **tampoco hay una sola línea que diga qué hacer**. `getDemoTrialSummary` ya calcula
`hasEnterableModule` y **nadie lo usa** para cambiar el mensaje.

---

## 8 · Cambio de empresa

Correcto desde QUALITY-01.2: `selectActiveOrganizationAction` escribe la cookie y redirige
a `/modules`. El módulo anterior **no** se conserva, así que el caso del encargo —empresa A
con PCR, empresa B sin él— no puede acabar en 404 ni en «acceso denegado».

**No requiere cambio.**

---

## 9 · Planes y cuotas · de quién es la deuda

`organization_effective_plan_code` (0103) deriva el plan del **mejor modo de acceso vivo**
entre los módulos, con suelo `demo` cuando no queda ninguno.

El síntoma conocido —una empresa Full que se ve como «Plan Demo · 0 MB / 50 MB»— aparece
cuando todos sus módulos están vencidos o deshabilitados: entonces el suelo `demo` es
correcto en la función y **engañoso en la pantalla**.

**PE-01 no depende de ese dato.** El selector resuelve por `derivedState` de cada módulo,
no por plan. La deuda es de **PE-04** y aquí solo se documenta, como pide §20.

---

## 10 · Último módulo visitado · no existe

Ni columna, ni cookie, ni almacenamiento local. Nada que migrar.

## 11 · Telemetría · existe el mecanismo, no el uso

`log_event()` → `audit_log` registra la **administración** de módulos
(`organization_module_demo_started`, …). No hay «módulo abierto» ni «selector visto», y no
hay analítica externa.

**Recomendación:** no usarlo para navegación. QUALITY-13B4 ya decidió que la bitácora no es
historia de negocio; convertirla en telemetría de páginas sería el mismo error.

---

## 12 · Deuda visual inventariada

| | Qué | Veredicto |
|---|---|---|
| 1 | Las cuatro tarjetas **son iguales**: `grid sm:grid-cols-2`, mismo tamaño, mismo peso | **ADAPT** · es el objeto de PE-01 |
| 2 | El selector se titula «Elige un módulo» y no dice qué es Trazaloop | **ADAPT** |
| 3 | La descripción de Quality en el catálogo se quedó en QUALITY-01: «cargos, procesos… mapa publicable». Hoy son trece dominios | **ADAPT** |
| 4 | La descripción de PCR mete dos normas y siete funciones en una frase | **ADAPT** |
| 5 | La banda de pruebas se ve dentro de un módulo que no está en prueba | **ADAPT** |
| 6 | `demo_permanent` se etiqueta «Demo permanente» — será confuso junto al plan gratuito de PE-04 | **DEFER a PE-04** |
| 7 | El portal público dice «Quality/Construcción próximamente» y Quality **ya existe** | **ADAPT** (`app/page.tsx`) |
| 8 | «Trazaloop CPR» vs «Trazaloop PCR» conviven en comentarios y copy | **ADAPT** solo en lo visible |
| 9 | `moduleEntryDestinationPath` devuelve `/dashboard` y el caso se llama `"dashboard"` | **KEEP** · es la entrada real de PCR, no un defecto |
| 10 | Ningún estado de carga ni de fallo en el selector | **ADAPT** · ver PE-D1 |
| 11 | Sin mensaje para «no tienes ningún módulo» | **ADAPT** |
| 12 | El portal público muestra «Crear cuenta Demo» según un kill switch | **KEEP** |

---

## 13 · Lo que este descubrimiento NO encontró

- **No hay** un segundo catálogo de módulos que consolidar.
- **No hay** redirección automática a PCR después del login.
- **No hay** módulo que sirva de repuesto implícito de otro en las rutas *de módulo*: los
  tres guards son independientes y las suites `module-access-isolation` y
  `pcr-textiles-nav` lo comprueban.
- **No hay** deuda de esquema que PE-01 necesite tocar.

El trabajo de PE-01 es **jerarquía, honestidad de estados y tres fugas concretas**. No es
una refundación.
