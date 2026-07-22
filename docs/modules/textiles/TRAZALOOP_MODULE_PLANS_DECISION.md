# Trazaloop · Decisión sobre planes por módulo

> Sprint T0.2 — Solo documentación. Define cómo deben entenderse Demo/Full/Extra en
> una plataforma multi-módulo. **No se implementa nada aquí** (DL-22): fase piloto
> usa el modelo actual; fase comercial implementa el modelo por módulo en
> Plataforma-M1.

## 1. Cambio de enfoque

| Antes (modelo actual en código) | Nuevo enfoque (decidido, no implementado) |
|---|---|
| Demo/Full/Extra = plan **global** de la organización (`organization_subscriptions`, un plan por empresa). | Demo/Full/Extra = **nivel de acceso por módulo** (DL-20), sobre `organization_module_access` (Opción C de `TRAZALOOP_MODULE_ACCESS_MODEL.md`). |

## 2. Las diez preguntas del encargo

**1. ¿Debe mantenerse un plan global de organización?**
Como *plan comercial*, no: el plan vive por módulo. Como *estado global*, sí: la
organización conserva un estado (activa/suspendida) que **domina** sobre todos sus
módulos, y atributos genuinamente globales pueden permanecer a nivel organización
(p. ej. un tope de storage de cortesía de plataforma, si la política comercial lo
quiere). Durante la transición, el plan global existente se reinterpreta como "plan
del módulo CPR" vía backfill.

**2. ¿Debe existir un plan por módulo?**
Sí (DL-20): `plan_key demo/full/extra` por `(organization_id, module_key)`. Los
planes se siguen **definiendo** una sola vez (`plan_definitions`); lo que cambia es
dónde se **asignan**.

**3. ¿Cómo se calculan límites de almacenamiento?**
Regla futura: cada módulo tiene su límite de storage según su plan (con
sobrescritura opcional `storage_limit_mb` por fila de acceso); el uso se mide por
módulo (los buckets/prefijos por módulo — DL-14 — hacen el uso atribuible). El
consumo de un módulo no debe agotar el storage de otro. `v_organization_plan_usage`
evoluciona a una vista por módulo (p. ej. `v_organization_module_usage`) + un
agregado total para la consola. Diseño fino en Plataforma-M1.

**4. ¿Cómo se calculan límites de documentos?**
Por módulo: los recursos de `plan_limits` ganan dimensión de módulo (recursos
prefijados, p. ej. `documents_trazadocs` [CPR] y `documents_trazadocs_textiles`,
patrón ya decidido en D-09). El conteo TrazaDocs usa `module_key` (DL-06). Demo: 2
documentos **por módulo**, no 2 en total.

**5. ¿Cómo se calculan límites de usuarios?**
Los usuarios son de **plataforma/empresa**, no de módulo (una membresía sirve a
todos los módulos). Recomendación: `team_members` se rige por el plan más alto que
la empresa tenga activo en cualquier módulo (regla "máximo de los módulos"), para no
bloquear al equipo por el módulo más barato. Alternativa (límite por módulo de
"usuarios que usan ese módulo") se descarta por complejidad de medición. Ratificar
en Plataforma-M1.

**6. ¿Cómo se calculan límites de evidencias?**
Por módulo, igual que documentos: `evidences` (CPR) y `textile_evidences` son
tablas distintas, así que el conteo es naturalmente separable; el recurso de plan se
expresa por módulo.

**7. ¿Qué pasa si CPR está en Full y Textil en Demo?**
La empresa opera CPR sin límites de recursos (límites Full) y Textil con límites
Demo; el portal muestra ambos accesibles con su insignia de plan; los contadores y
avisos de límite son del módulo donde ocurren; subir de plan Textil no toca CPR.

**8. ¿Qué pasa si una organización está suspendida globalmente pero un módulo está activo?**
La suspensión global **domina**: ningún módulo es accesible aunque su fila diga
`active` (precedencia definida en `TRAZALOOP_MODULE_ACCESS_MODEL.md` §4). La fila
del módulo no se reescribe: al levantar la suspensión global, cada módulo vuelve a
su estado propio.

**9. ¿Qué pasa si un módulo está suspendido pero la empresa tiene otros módulos activos?**
Solo ese módulo queda inaccesible (rutas 404/redirección, tarjeta "suspendido/sin
acceso" para esa empresa); los demás módulos y toda la capa de plataforma (equipo,
soporte, legal) siguen operando. Los datos del módulo suspendido se conservan
(nunca se borran por suspensión).

**10. ¿Qué debe ver el usuario en `/modules`?**
Todos los módulos del catálogo, cada uno con el estado **para su empresa**:
accesible (con insignia de plan Demo/Full/Extra), suspendido, sin acceso
("Próximamente" o "No incluido en tu plan" según política comercial). Nunca datos de
otros módulos ni de otras empresas. El superadministrador, en su consola, ve la
matriz empresa × módulo × plan × estado × uso.

## 3. Decisión por fases

| Fase | Decisión |
|---|---|
| **Piloto (T1–T11)** | **Simple y seguro: no cambiar nada del modelo de planes.** Se mantienen plan global + `organization_modules` como interruptor. Textil se activa manualmente a organizaciones internas/piloto sin límites (MVP privado). Deuda registrada: acceso modular avanzado (este documento + `TRAZALOOP_MODULE_ACCESS_MODEL.md`). |
| **Comercial (Plataforma-M1)** | Implementar `organization_module_access` (Opción C), límites por módulo en `plan_limits`, vistas de uso por módulo, consola superadmin ampliada, precedencias del §2 y tests de seguridad. Solo entonces se venden módulos de forma independiente. |

## 4. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Planes y límites por módulo | — (modelo comercial, no normativo) | n/a | Que un plan (Demo/Full/Extra) implique nivel de cumplimiento, certificación o validez técnica de los datos del cliente. |

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Implementar planes por módulo "de paso" en T1 (R-20) | DL-22: prohibido; Plataforma-M1 es el único sprint autorizado. |
| Conteos mal atribuidos entre módulos (R-23) | Tablas de dominio separadas por módulo + storage por prefijo/bucket + vistas de uso por módulo con tests. |
| Bloquear al equipo por el módulo más barato | Regla "máximo de los módulos" para `team_members` (ratificar en Plataforma-M1). |

## 6. Criterios de aceptación

- [ ] Las 10 preguntas tienen respuesta operativa.
- [ ] La decisión por fases es inequívoca: piloto sin cambios, comercial con Opción C.

## 7. Próximos pasos

1. Ratificar con el propietario del producto la regla de `team_members` y la
   política de "sin acceso" visible ("Próximamente" vs "No incluido").
2. Incluir este documento como lectura obligatoria de Plataforma-M1.
