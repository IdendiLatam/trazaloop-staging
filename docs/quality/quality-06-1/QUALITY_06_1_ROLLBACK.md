# QUALITY-06.1 · Reversión

## 1 · Es la reversión más simple posible

**Sin migración.** QUALITY-06.1 no añade esquema, no altera ninguna tabla y no
escribe nada. Las dos derivaciones son consultas de lectura.

Revertir es volver el despliegue al commit anterior:

```bash
git checkout bff5988      # HEAD de QUALITY-06
# desplegar ese commit en el entorno afectado
```

Las bases de datos no requieren ninguna acción: Local y Staging siguen en
**0124**, Production en **0111**, exactamente igual que antes del sprint.

## 2 · Qué desaparece al revertir

| | |
|---|---|
| Dos rutas | `/quality/people/[personId]/onboarding/[assignmentId]` y `/quality/people/performance/[evaluationId]` |
| Una exportación | `quality.onboarding.detail` |
| Una sección del PDF de evaluación | «Contexto del sistema de gestión» |
| Tres enlaces | Desde la ficha de persona, la ficha del cargo y el listado de desempeño |

Ningún dato se pierde, porque ninguno era propio de este sprint.

## 3 · Reversión parcial

Los dos huecos son independientes y se pueden revertir por separado:

- **Solo el onboarding:** quitar `qualityOnboardingDetail` del registro, su fila
  del inventario, la ruta y los dos enlaces. Regenerar los documentos de
  cobertura con `npx tsx scripts/export/build-coverage-docs.ts`.
- **Solo el contexto:** quitar `contextSections` del adaptador de evaluación y
  el bloque de contexto de `evaluation-detail.tsx`. La ruta de la evaluación
  sigue siendo útil sin él.

## 4 · Un cambio que conviene no revertir a ciegas

`listPositionVersions`, `getOnboarding` y `getEvaluationContext` aceptan un
**cliente opcional**. La aplicación no lo pasa nunca: existe para que la suite
contra base real ejercite el código de producción con la sesión de un usuario.

Quitarlo no rompe la aplicación, pero deja las pruebas sin forma de ejercitar la
derivación real, y volverían a probar una copia.

## 5 · Qué NO hacer

- **No** `migration repair`: no hay nada que reparar, este sprint no tocó el
  histórico de migraciones.
- **No** borrar las evaluaciones ni las mediciones creadas durante la
  validación: son historia y sus dominios lo impiden a propósito.
- **No** revertir el `create or replace` de nada: este sprint no reemplazó
  ninguna función de base de datos.
