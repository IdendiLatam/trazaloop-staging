# PE-01B · La puerta de Trazaloop · Implementación

**Sprint:** PE-01B — Entry Experience & Modules
**Estado:** implementado, en verde, pendiente de humo humano
**Migraciones:** ninguna. Local 0154 · Staging 0154 · Production 0111
**Precede:** [PE-01A](./PE_01A_ENTRY_DISCOVERY.md) (descubrimiento y congelado de arquitectura)

---

## 1 · Qué cambia, en una frase

`/modules` deja de ser un desvío técnico entre el login y PCR y pasa a ser **la
puerta de Trazaloop**: una pantalla con dueño, con Quality como protagonista,
que no empuja a nadie a ningún sitio y que no vende nada.

---

## 2 · Las decisiones humanas que se implementaron tal cual

Vinieron congeladas del encargo. No se reinterpretaron.

| # | Decisión | Dónde vive |
|---|---|---|
| 1 | Después de iniciar sesión, aceptar una invitación o elegir empresa se aterriza **siempre** en `/modules`, aunque solo haya un módulo. Nunca se entra automáticamente. | `lib/domain/team.ts` (`postAuthDestinationPath`, `resolveAcceptInviteDestination`), `server/actions/organizations.ts` |
| 2 | Los módulos no contratados **se ven**, con su estado, y **sin ninguna llamada comercial**. | `app/(app)/modules/page.tsx`, `lib/modules/entry.ts` |
| 3 | **No** se recuerda ni se restaura el último módulo visitado. | no hay código que lo haga; comprobado en `pe01-modules` y en P1.3 |
| 4 | Frase de Quality, literal y sin promesas de certificación. | `ENTRY_COPY.quality` en `lib/modules/entry.ts` |
| 5 | Sin módulos activos: se permanece en `/modules`, se explica, sin bucle, sin error falso y sin venta temporal. | `NO_ACTIVE_MODULES_*` + el bloque `role="status"` de la puerta |

---

## 3 · Los tres defectos de PE-01A, resueltos

### PE-D1 · Un fallo de lectura se presentaba como una decisión comercial

`getOrganizationModuleAssignment` devolvía `ModuleAssignment | null` y
**descartaba el `error`**. Para la regla pura, `null` significa «la empresa no
tiene este módulo», así que un corte de red, una denegación de RLS o un fallo de
PostgREST terminaban pintando **«este módulo no está asignado a la empresa»**:
una afirmación sobre el contrato construida a partir de una avería.

Es el mismo defecto que Quality persiguió cinco veces —12.2F, 13B1, 13B2, 13B3,
13B4— y estaba en la puerta de entrada, que es donde más caro sale: quien lee
«no lo tienes» cierra el navegador.

**El arreglo, en tres capas:**

1. La búsqueda devuelve **tres** respuestas, no dos:
   `{status:"found"} | {status:"absent"} | {status:"unavailable"}`.
2. La regla pura recibe `assignmentUnavailable` y lo evalúa **antes** que
   `!assignment`, con un décimo estado: `unavailable`.
3. La presentación tiene su propio texto —«No se pudo verificar» / «Es un
   problema temporal al consultar tu acceso, no un cambio en lo que tienes
   contratado»— que **no afirma nada sobre lo contratado** y **no ofrece entrar**.

Una excepción del cliente se trata igual que un `error` devuelto (`try/catch` en
`resolveModuleAccessForOrg`): en ambos casos la respuesta honesta es «no se sabe».

**Lo que la RLS no puede distinguir, dicho en voz alta:** una denegación de RLS
devuelve *cero filas*, no un error, así que llega como `absent`. No es un
agujero —la empresa activa sale siempre de la sesión, nunca del cliente—, pero
queda escrito en `P5` de la suite contra base real para que nadie construya
encima la suposición contraria.

### PE-D2 · La plataforma devolvía a PCR a quien no era staff

`requirePlatformStaff` redirigía a `/dashboard`. Alguien sin permiso de
plataforma acababa dentro de PCR sin haber navegado allí —y si su empresa no
tenía PCR, en un segundo rechazo—. Ahora redirige a `MODULE_SELECTOR_PATH`.

### PE-D3 · El shell caía en PCR por omisión

`resolveShellModuleForPath` devolvía `CPR_SHELL_MODULE` para cualquier ruta que
no reconociera: `/settings`, `/support`, `/team` se pintaban con el marco de un
módulo al que no pertenecen. Se introduce una **superficie de plataforma**
(`PLATFORM_SURFACE_KEY = "platform"`, nombre «Trazaloop», sin navegación propia)
y el repuesto pasa a ser esa.

Quitar el repuesto **destapó una regresión que estaba enmascarada**:
`/onboarding` es una ruta de PCR y no figuraba en sus prefijos; con el repuesto
puesto nadie lo notaba. Se añadió a `pathPrefixes` de CPR. Está cubierta en R1.

---

## 4 · Los dos arreglos de presentación

- **La portada pública mentía sobre Quality.** Decía que estaba por llegar. Ahora
  lleva el distintivo «Disponible», la frase acordada y una entrada real.
- **El aviso de prueba estaba en el sitio equivocado.** Vivía en el shell —dentro
  del módulo— cuando habla del estado comercial de la empresa. Se movió a la
  puerta y del shell salió `DemoTrialBanner`; a cambio, el shell ganó el
  `ModuleSwitcher` («Ver módulos»), que es lo que sí hace falta dentro.

---

## 5 · El código nuevo

| Archivo | Qué es |
|---|---|
| `lib/modules/entry.ts` | Las decisiones de **presentación** de la puerta, puras: quién es el protagonista, en qué orden van los demás, qué texto lleva cada uno, qué se puede pulsar (`presentationFor`, `isNavigable`) y qué se dice cuando no hay nada o no se pudo leer. Ni consulta ni autoriza. |
| `components/domain/modules/module-entry.tsx` | `HeroModuleCard` y `SpecializedModuleCard`. Regla dura: **enterable → `<Link>`; cualquier otra cosa → `<article aria-label=…>`**. Nunca un enlace muerto ni un botón deshabilitado, que se anuncian igual y frustran igual. |

El orden de los módulos es **estable**: no se reordena por estado. Lo que cambia
de sitio entre visitas no se aprende.

---

## 6 · El cliente inyectable, y por qué

`getOrganizationModuleAssignment`, `resolveModuleAccessForOrg`,
`getActiveOrgModuleStatuses` y `getDemoTrialSummary` aceptan ahora un cliente
opcional. **En producción no se pasa nunca**: la ruta por defecto sigue siendo la
sesión real con su RLS.

Existe porque sin él la comprobación que sostiene este tramo —que un fallo de
lectura no se presenta como una decisión comercial— **no se puede ejecutar contra
la base de verdad**: fuera de una petición, construir el cliente desde cookies
lanza. Es el mismo patrón que `lib/db/quality-suppliers.ts` ya usaba. El guardián
estático 13 de `t9f-provisioning-and-guards` se reforzó en vez de relajarse:
comprueba que el camino por defecto es `createServerClient()` y que por ningún
camino entra el cliente administrativo.

---

## 7 · Lo que NO se hizo, a propósito

- **Ninguna migración.** El décimo estado es de presentación y de regla pura; el
  esquema no tenía ningún hueco. (§24 del encargo: si aparece un hueco real de
  esquema, se para y se reporta; no apareció.)
- **Ninguna deuda comercial del Superadministrador.** El «Plan Demo / 0 MB /
  50 MB» de la consola de plataforma sigue como estaba: arreglarlo en silencio
  aquí lo escondería (§29).
- **Ningún recuerdo del último módulo**, ninguna reordenación por uso, ningún
  CTA, ningún precio, ninguna lista de espera para Construcción.

---

## 8 · Estado de verificación

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | **0 errores** (66 avisos, la línea base previa) |
| `npm run build` | **EXIT=0** |
| Suites nuevas | 43 + 12 + 17 + 21 = **93 comprobaciones**, 0 en rojo |
| Suites QUALITY-13 | B1, B2, B3, B4, B5 en verde, incluidas las tres aceptaciones HTTP |

Detalle en [PE_01B_TEST_MATRIX.md](./PE_01B_TEST_MATRIX.md).
