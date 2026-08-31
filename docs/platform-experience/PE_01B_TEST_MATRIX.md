# PE-01B · Matriz de pruebas

**Cuatro suites, 97 comprobaciones, 0 en rojo.**
La estrategia venía de [PE_01A_TEST_STRATEGY.md](./PE_01A_TEST_STRATEGY.md); esto
es lo que quedó ejecutándose.

---

## 1 · Las cuatro suites

| Suite | Naturaleza | Comprobaciones | Comando |
|---|---|---:|---|
| `tests/unit/pe01-modules.test.ts` | estática — contratos, textos, fronteras | **46** | `npm run test:pe01-modules` |
| `tests/ui/pe01-modules.test.tsx` | jsdom — lo que llega al HTML | **12** | `npm run test:pe01-modules-ui` |
| `tests/rls/pe01-modules-access.test.ts` | **base real** — sesión y RLS de verdad | **18** | `npm run test:pe01-modules-access` |
| `tests/e2e/pe01-entry.test.ts` | **HTTP** contra el build de producción | **21** | `npm run test:pe01-modules-e2e` |

Las dos puras (`pe01-modules`, `pe01-modules-ui`) entran en `npm run test:all`.
Las dos que necesitan base o servidor se corren aparte, como el resto del
repositorio.

---

## 2 · La matriz A–P del encargo, y dónde se comprueba cada fila

| # | Escenario | Dónde | Qué se afirma |
|---|---|---|---|
| A | solo Quality | acceso · A | Quality entrable; PCR y Textiles no; Construcción es futuro |
| B | solo PCR | acceso · B | PCR entrable; Quality no entrable **y aun así protagonista** (estática A2) |
| C | solo Textiles | acceso · C | entrable, y **ningún repuesto de PCR** |
| D | Quality + PCR | acceso · D | los dos entran; la jerarquía no depende de lo contratado (estática A4) |
| E | Quality + Textiles | acceso · E | la pareja sin PCR de por medio |
| F | todo activo | acceso · F | tres entrables, `extra` y `demo` bien resueltos, el futuro fuera |
| G | prueba de PCR vencida + Quality activo | acceso · G | aviso **parcial**, nombra solo PCR, la empresa **no** se queda sin módulos |
| H | sin ningún módulo | acceso · H · HTTP P6.1/P6.2 | se explica, sin bucle, sin error falso, sin venta |
| I | módulo no incluido | acceso · I · UI J3 · HTTP P5.1 | se ve, sin entrada, **sin enlace roto** |
| J | Construcción | acceso · J · UI J2 · HTTP P5.3 | «Próximamente», inerte, ni enlace ni botón, sin lista de espera |
| K | cambiar de empresa | acceso · K · HTTP P7 | recalcula por empresa; la acción lleva a la puerta |
| L | aislamiento entre empresas | acceso · L · P5 | cada empresa ve la suya; leer la ajena no concede nada |
| M | móvil | estática I1–I3 | una columna, sin desplazamiento horizontal, protagonista primero |
| N | independencia de módulo | estática E1–E6 | ninguna ruta transversal resuelve a un módulo; cada ruta la reclama el suyo |
| O | entitlement ≠ autorización | acceso · O · estática H1 | entrar no es poder: el acceso se resuelve sin mirar el rol |
| **P** | **fallo del backend ≠ sin acceso** | **acceso · P, P2, P3, P4, P5** | **la comprobación que sostiene el tramo** |

---

## 3 · P, en detalle, porque es la que importa

| | Qué se rompe | Qué se exige |
|---|---|---|
| P | la regla pura, con `assignmentUnavailable` | `unavailable`, y **no** `allowed` |
| P2 | nada: se pregunta bien | la búsqueda distingue `found` / `absent` |
| **P3** | **el cliente real: `maybeSingle` devuelve `error`** | la búsqueda, la resolución **y los tres módulos** llegan como `unavailable`; el resumen dice «no se pudo comprobar», no «no tienes nada» |
| P4 | el cliente lanza una excepción | se trata **igual** que un error devuelto |
| P5 | nada: se lee la empresa de otro | llega `absent` —la RLS no distingue— y **no concede acceso**. Queda escrito para que nadie suponga lo contrario |

Y en pantalla (UI K1–K3): se ve distinto, **no afirma nada sobre lo contratado**,
no ofrece entrar, y no filtra jerga del motor (`PGRST`, `SQL`, `null`, `Error`).

---

## 4 · Las regresiones Q–W

| | Qué protege | Dónde |
|---|---|---|
| Q | una lectura fallida **nunca** es `not_assigned` | estática B1–B7 · acceso P3 |
| R | el orden de evaluación: «no se sabe» **antes** que «no hay» | estática B6 |
| S | quien no es de plataforma vuelve a la **puerta**, no a PCR · PE-D2 | estática E7 |
| T | ninguna ruta transversal cae en PCR por omisión · PE-D3 | estática E1–E5 · HTTP R1 |
| U | `/onboarding` sigue siendo de PCR (la regresión que PE-D3 destapó) | HTTP R1 |
| V | el aviso de prueba salió del shell y vive en la puerta | estática F1–F3 |
| W | la portada pública ya no dice que Quality está por llegar | estática G5 · HTTP R2 |

---

## 5 · Los ocho recorridos por HTTP · P1…P8

Contra `next start`, con sesión real, cookie de empresa firmada y RLS real.

| | Recorrido | Comprobaciones |
|---|---|---:|
| P1 | Nadie es empujado dentro de un módulo — con uno, con varios, y después de haber entrado | 3 |
| P2 | Lo que la puerta enseña: protagonista con su frase, los tres en orden, **y nada comercial** | 3 |
| P3 | Entrar a Quality, y saber desde dentro dónde se está y cómo salir | 2 |
| P4 | Volver a la puerta sin rebotar | 1 |
| P5 | Lo que no se tiene: se ve, no enlaza, el guardián sigue ahí aunque se escriba la URL | 3 |
| P6 | Una empresa sin módulos: se explica, no es un error ni un bucle, y lo transversal sigue funcionando | 3 |
| P7 | Cambiar de empresa, y saber de qué empresa habla la puerta | 2 |
| P8 | **Ningún enlace de la puerta lleva a 404 ni a 500** — en las dos formas de empresa | 2 |
| R1–R2 | Las dos regresiones de arriba | 2 |

En P2.3 se comprueba la ausencia por partida doble: los textos comerciales
—«Ver planes», «Contratar», «Precio», «Hablar con ventas»…— **y** los destinos
(`pricing`, `checkout`, `billing`, `upgrade`) de todos los enlaces.

---

## 6 · Lo que estas pruebas NO hacen

- No llaman a ningún proveedor de IA.
- No escriben en Staging ni en Production: todo contra el stack local.
- No dan por buena una pantalla porque devuelva 200: en P8 se abre cada enlace.
- No comprueban color: cada estado tiene que decirse **con texto** (UI L1).

---

## 7 · Regresión completa ejecutada

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | **0 errores**, 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| `test:quality13b1-rls` | 9 ✔ |
| `test:quality13b2-cockpit-db` / `-e2e` | 19 ✔ / 28 ✔ |
| `test:quality13b3-convergence` | 25 ✔ |
| `test:quality13b4-home-db` / `-e2e` | 16 ✔ / 23 ✔ |
| `test:quality13b5-context` / `-injection` / `-e2e` | 19 ✔ / 6 ✔ / 15 ✔ |
