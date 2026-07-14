# Trazaloop · Guía de prueba con empresa real (Sprint 6)

Esta guía explica cómo probar Trazaloop con una empresa y **datos reales**,
apoyándose en la sección **Implementación** (`/implementation`). No describe
un caso piloto ficticio ni datos de demostración: la empresa, los
proveedores, los materiales, los lotes y los cálculos son siempre los
reales del cliente.

`/implementation` no cambia la metodología de cálculo ni el motor normativo:
solo lee lo que ya existe (catálogos, evidencias, trazabilidad, cálculos) y
ayuda a ver qué falta, en qué orden avanzar y dónde registrar lo que se va
encontrando durante la prueba.

> **Nota técnica interna** (no forma parte del flujo con empresas reales):
> para pruebas internas aisladas del equipo de Trazaloop existen guiones
> técnicos aparte (`npm run seed:demo`, `docs/DEMO_FLOW.md`). No se
> recomiendan ni se usan como parte de la implementación con una empresa.

## Antes de empezar

- La empresa debe existir en Trazaloop (o créala en el paso 1) con al menos
  un usuario administrador.
- Define quién de tu equipo y del equipo del cliente va a usar la cuenta
  durante la prueba, y con qué rol (administrador, calidad o consultor).
- Ten a mano proveedores, materiales, evidencias de origen y al menos una
  orden / corrida real para registrar durante la prueba.
- **Carga masiva (Sprint 7):** si la empresa ya tiene sus datos en hojas de
  cálculo, puedes cargarlos por CSV desde `/imports` en vez de digitarlos
  uno a uno — ver `docs/IMPORTS_GUIDE.md`. Es opcional: los pasos 3–12 de
  abajo funcionan igual si prefieres crear los registros a mano en la UI.
- **Equipo (Sprint 8):** define quién de tu equipo y del equipo del
  cliente usará la cuenta e invítalos desde `/team` con el rol que les
  corresponda — ver `docs/TEAM_MANAGEMENT_GUIDE.md`.

## Los 17 pasos

1. **Crear organización.** Si la empresa todavía no existe en Trazaloop,
   créala desde `/select-org` → «Crear empresa». Quien la crea queda como
   administrador.
2. **Crear usuarios o definir quién usará la cuenta.** Un administrador
   agrega memberships de usuarios ya registrados (Sprint 1); decide de
   antemano qué personas del cliente participarán y con qué rol.
3. **Crear proveedores** reales (Catálogos → Proveedores).
4. **Crear materiales** reales con su clasificación normativa (Catálogos →
   Materiales).
5. **Cargar evidencias** de origen del material (Evidencias).
6. **Validar evidencias** (solo administrador o calidad).
7. **Asociar soporte de origen**: vincula la evidencia validada al material
   como «Soporte de origen del material» para que cuente en el cálculo.
8. **Crear lotes de entrada** reales (Trazabilidad → Lotes de entrada).
9. **Crear orden / corrida de producción** (Trazabilidad → Órdenes).
10. **Registrar consumos**: asocia a la orden / corrida los lotes de
    entrada realmente consumidos.
11. **Crear lote producido / lote final** asociado a la orden.
12. **Registrar composición** del lote producido / lote final.
13. **Calcular** el contenido reciclado con la metodología vigente
    (NTC 6632:2022 / UNE-EN 15343:2008).
14. **Revisar el dossier técnico** del cálculo (Soporte técnico), incluida
    la matriz de evidencias y las brechas identificadas.
15. **Revisar el flujo guiado** (`/guided-flow`) para confirmar que no falta
    ningún paso del recorrido.
16. **Registrar feedback**: cualquier error, duda, falta de datos o mejora
    encontrada durante la prueba se registra en `/implementation/feedback`,
    clasificada por módulo, categoría y severidad.
17. **Revisar el checklist de implementación** en `/implementation` para
    confirmar el avance general y ver la siguiente acción recomendada.

## Qué mirar en `/implementation`

- **Estado general de implementación**: conteos reales de proveedores,
  materiales, evidencias, trazabilidad, cálculos y feedback — nunca datos
  inventados.
- **Checklist de implementación real**: los 17 pasos anteriores con su
  estado (pendiente, en progreso, completo o con advertencias) y un acceso
  directo a la pantalla correspondiente.
- **Siguiente acción recomendada**: la brecha de mayor prioridad detectada
  ahora mismo, con un botón directo para resolverla.
- **Últimos cálculos y dossiers**: los cálculos más recientes con acceso
  directo al cálculo, al dossier y a registrar feedback sobre ese cálculo.
- **Feedback reciente**: los últimos hallazgos registrados, clasificados por
  módulo, categoría, severidad y estado.

## Registrar feedback durante la prueba

`/implementation/feedback` permite:

- listar y filtrar el feedback por módulo, categoría, severidad y estado;
- registrar un hallazgo nuevo con título, descripción, pasos para
  reproducir, resultado esperado/actual y, si aplica, la entidad
  relacionada (material, evidencia, lote de entrada, orden / corrida,
  lote producido / lote final, cálculo, dossier u otro);
- cambiar el estado (abierto → en revisión → resuelto → cerrado);
- editar el feedback propio, o cualquiera si el rol es administrador o
  calidad;
- eliminar feedback (solo administrador o calidad).

Además, varias pantallas existentes (flujo guiado, detalle de cálculo,
dossier técnico, evidencias y trazabilidad) tienen un botón «Registrar
feedback…» que abre el formulario con el módulo (y a veces la entidad)
ya sugeridos.

**Lenguaje**: se habla de implementación, prueba real, feedback, brecha,
hallazgo de prueba, soporte técnico, dossier técnico y revisión técnica.
Trazaloop no promete ni menciona certificación en ningún punto de esta
sección; ver `/legal`.

## Qué NO hace esta sección

- No crea caso piloto ni datos de demostración.
- No importa plantillas ni casos automáticos.
- No es Trazaloop Docs, ni un constructor documental, ni genera PDF en
  servidor.
- No es un módulo de auditorías formales ni de planes de acción.
- No cambia la metodología de cálculo ni el motor normativo.

## Pruebas relacionadas

```bash
npm run test:implementation   # lógica pura del checklist y la siguiente acción (sin BD)
npm run test:rls              # aislamiento multiempresa de implementation_feedback (Supabase local)
```
