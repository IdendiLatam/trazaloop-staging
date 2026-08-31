# PE-01A · ESTRATEGIA DE PRUEBAS PARA PE-01B

Diseñada, no implementada. PE-01A es descubrimiento.

---

## 1 · Las cuatro suites propuestas

| Suite | Qué probaría | Dónde |
|---|---|---|
| `pe01-entry` | catálogo, estados, jerarquía, copy | estática y pura |
| `pe01-entry-ui` | la puerta pintada en un DOM real | jsdom |
| `pe01-entry-rls` | acceso efectivo por empresa, y el fallo ≠ «no lo tienes» | base real |
| `pe01-entry-e2e` | el recorrido por HTTP con las once empresas de la matriz | build de producción |

Las dos primeras en `test:all`; las dos últimas aparte, como el resto del repositorio.

---

## 2 · La matriz del encargo (§29)

| | Escenario | Qué se comprueba |
|---|---|---|
| A | solo Quality | Quality entrable y protagonista; PCR/Textiles «No incluido»; **cero** rastro de PCR en el shell |
| B | solo PCR | PCR entrable; Quality no incluido y **aun así protagonista visual** |
| C | solo Textiles | ídem, y ningún repuesto de PCR |
| D | Quality + PCR | dos entrables; la jerarquía no cambia con lo contratado |
| E | Quality + Textiles | ídem |
| F | todo activo | cuatro tarjetas, tres entrables, Construcción no |
| G | **prueba de PCR vencida + Quality activo** | «Prueba finalizada» solo en PCR; **ninguna banda dentro de Quality**; los datos se conservan |
| H | sin ningún módulo | el mensaje de cuenta activa; sin bucle; catálogo completo visible |
| I | módulo no incluido | se ve, sin entrada y **sin enlace roto** |
| J | Construcción | «Próximamente», inerte, no enlace |
| K | **cambiar de empresa con el módulo actual no disponible** | acaba en la puerta, sin 404 y sin PCR |
| L | URL directa a un módulo | el guard decide; el rebote lleva a la puerta, no a PCR |
| M | móvil | Quality primero, sin desplazamiento horizontal |
| N | independencia de módulo | ningún enlace de un módulo dentro de otro |
| O | entitlement ≠ autorización | entrar no es poder: los roles siguen decidiendo dentro |
| P | **fallo del backend ≠ sin acceso** | «no se pudo comprobar», nunca «no lo tienes» |

---

## 3 · Las cuatro que más van a valer

**P · el fallo no se disfraza de decisión comercial.** Un `Proxy` que rompe la lectura de
`organization_modules` y la exigencia de que la tarjeta diga «no se pudo comprobar». Es el
defecto **PE-D1**, y es el que hoy está vivo.

**G · la prueba vencida no invade el módulo sano.** Empresa con PCR vencido y Quality en
Full: se abre `/quality` y se comprueba que **no hay banda**. Hoy la hay.

**K · cambiar de empresa no deja a nadie en un módulo ajeno.** Empresa A con PCR, empresa B
sin él: se cambia estando dentro de PCR y se comprueba el destino.

**A/B/C · el shell transversal no cae en PCR.** Se pide `/team` **sin** `?m=` desde una
empresa que solo tiene Quality y se comprueba que no aparece el menú de PCR. Es **PE-D3**,
y hoy falla.

---

## 4 · Fixtures de QA · qué hay y qué falta

El repositorio ya crea empresas y asigna módulos en las suites de base real
(`t9f-module-access`, `module-access-isolation`, `pcr-textiles-*`, las de Quality). El
patrón está resuelto: crear usuario → `create_organization` → `update organization_modules`.

**Se reutiliza. No hacen falta empresas nuevas de QA**, salvo dos huecos:

| Hueco | Para qué | Cómo |
|---|---|---|
| empresa **sin ningún módulo entrable** | escenario H | poner `enabled=false` en las tres asignaciones |
| empresa con **prueba vencida y otro módulo activo** | escenario G | `access_expires_at` en el pasado para PCR, `full` en Quality |

Los dos se montan con `update`, sin datos nuevos y sin migración. Prefijo `QA PE-01 ·`.

---

## 5 · Lo que estas pruebas NO deben hacer

- **No** comprobar precios, planes, límites ni cuotas: es PE-04/05.
- **No** fijar la cabecera de migraciones como invariante. Esa lección costó tres pruebas
  reescritas en QUALITY-13.
- **No** afirmar que la jerarquía visual «se entiende»: eso lo juzga una persona.
- **No** comprobar el interior de los módulos: hay suites para eso, y siguen verdes.

---

## 6 · Regresiones que PE-01B tendrá que mantener

`test:all`, `typecheck`, `lint 0 errores`, `build`, y expresamente:

`t9f-module-access` · `module-access-isolation` · `t9f-provisioning` · `t9f1` · `team` ·
`platform` · `launch` · `textiles-module-selector` · `textiles-navigation` ·
`pcr-textiles-nav` · `quality01` · las diecinueve suites de QUALITY-13.

Y las tres aceptaciones por HTTP de Quality —mirador, portada e Intelligence—, porque
cualquier cambio en el shell las atraviesa.
