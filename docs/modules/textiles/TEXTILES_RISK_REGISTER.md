# Trazaloop Textil · Registro de riesgos

> Sprints T0.1 y T0.2 — Solo documentación (R-01…R-16 en T0.1; R-17…R-24 en T0.2).
> Severidad/Probabilidad: Alta · Media · Baja.
> Estado: Abierto (mitigación planificada) · Mitigado por diseño (la mitigación está
> incorporada en los documentos y se verifica en el sprint indicado).

| ID | Riesgo | Severidad | Probabilidad | Impacto | Mitigación | Sprint donde debe atenderse | Estado |
|---|---|---|---|---|---|---|---|
| R-01 | Mezclar CPR y Textil (código, datos o UI compartidos indebidamente) | Alta | Media | Regresiones CPR, confusión de usuarios multi-módulo, deuda estructural | Lista de exclusión vinculante (`CPR_REUSE` §6), lint de imports, namespaces separados (DL-04, DL-07), UI contextualizada por módulo | T1 (lint) y todos | Mitigado por diseño |
| R-02 | Romper TrazaDocs CPR al volverlo multi-módulo | Alta | Media | Pérdida de funcionalidad documental en producción CPR | Opción A con salvaguardas (`TRAZADOCS_MODEL` §5): default `'cpr'`, migración aditiva, regresión CPR completa, rollback planificado, sprint aislado | T8 | Abierto |
| R-03 | Aplicar `module_key` de forma incompleta (consultas/acciones/vistas sin filtro) | Alta | Media | Fuga de estructuras entre módulos; conteos de plan erróneos | Checklist exhaustivo de puntos de consulta afectados; tests de aislamiento entre módulos; tipo `TrazadocModuleKey` obligatorio en firmas | T8 | Abierto |
| R-04 | Generar promesas regulatorias indebidas (certificación, cumplimiento automático) | Alta | Media | Riesgo legal y reputacional | Reglas de lenguaje (`NORMATIVE_MAPPING`), advertencias fijas, `tests/compliance` de vocabulario prohibido, columna "qué NO prometer" en toda la documentación | Todos; verificación automatizada en T11 | Mitigado por diseño |
| R-05 | Confundir el pasaporte técnico con el DPP oficial | Alta | Media | Expectativa regulatoria falsa ante clientes/auditores | Naming "pasaporte técnico textil (interno)", advertencia fija no removible, estado "Aprobado internamente", incertidumbre de actos delegados declarada | T9 | Mitigado por diseño |
| R-06 | Duplicar tablas innecesariamente (motores paralelos por módulo) | Media | Baja | Mantenimiento doble, divergencia de features | DL-05/DL-06 (motor TrazaDocs único); transversales reutilizadas tal cual (`DATA_MODEL` §6.3); solo se duplica donde la semántica difiere (evidencias, diagnóstico) con justificación escrita | T2–T9 | Mitigado por diseño |
| R-07 | Modelo de datos demasiado complejo para confeccionistas reales | Media | Media | Adopción baja; captura abandonada | Datos mínimos por módulo definidos en `FUNCTIONAL_MODEL`; campos opcionales con brecha en lugar de bloqueo; Q-02/Q-03 resueltas hacia lo simple; feedback de piloto antes de ampliar | T3–T6, revisión en T10 | Abierto |
| R-08 | Arrancar con QR o blockchain demasiado pronto | Media | Media | Desvío de foco; exposición pública prematura de datos | Exclusiones vinculantes del MVP (`MVP_SCOPE` §5); D-18/D-19 marcan todo como futuro; Q-12/Q-13/Q-14 previas a cualquier diseño público | Vigilancia continua; revisión de PRs | Mitigado por diseño |
| R-09 | Diagnóstico demasiado largo (abandono del wizard) | Media | Media | Diagnósticos incompletos; primera experiencia negativa | 58 preguntas en 12 dimensiones con guardado por dimensión; "No aplica" reduce fricción; validación con piloto puede recortar banco | T2, revisión en T10 | Abierto |
| R-10 | Usar normas sin entender su alcance (citas incorrectas o infladas) | Alta | Baja | Pérdida de credibilidad técnica; promesas implícitas | Catálogo N-01…N-17 con tipo de referencia y alcance declarado; matriz de trazabilidad normativa; regla "no inventar normas"; validación experta (Q-16) | T0.1 (matriz) + validaciones Q-16 | Mitigado por diseño |
| R-11 | Permitir claims ambientales sin evidencias | Alta | Media | Greenwashing facilitado por la plataforma | Regla dura: estado "soportado" exige evidencia válida vinculada; claims sin evidencia quedan "declarados" con brecha visible; ISO 14021 como marco de redacción | T5 | Mitigado por diseño |
| R-12 | Exponer información privada en futuros pasaportes públicos | Alta | Baja (hoy) / Media (futuro) | Fuga de datos de proveedores, costos o brechas internas | Nada público en MVP; diseño futuro solo desde snapshot aprobado con lista blanca de campos (Q-13/Q-14, D-18); privado por defecto | T9 (diseño), futuro (impl.) | Mitigado por diseño |
| R-13 | No controlar documentos obsoletos (uso de versiones viejas) | Media | Media | Decisiones sobre información desactualizada | Estados draft/in_review/approved/obsolete heredados del motor; maestro documental con vigencias; marca de desactualización en circularidad/pasaporte cuando cambian las fuentes | T8/T9 | Mitigado por diseño |
| R-14 | No versionar pasaportes | Alta | Baja | Consolidados mutables sin historial; imposible saber qué se entregó | DL-10: snapshot inmutable + versión incremental + historial de estados; test de inmutabilidad | T9 | Mitigado por diseño |
| R-15 | No separar documentos por módulo (TrazaDocs y maestro mezclados) | Media | Media | Confusión documental; límites de plan cruzados entre módulos | `module_key` en unicidad y filtros; maestro y export CSV por módulo; conteo Demo por módulo (DL-06/D-09) | T8 | Abierto |
| R-16 | No proteger RLS multiempresa en tablas textiles | Alta | Baja | Fuga de datos entre organizaciones (riesgo máximo de plataforma) | Patrón 0024 obligatorio en toda tabla; FK compuestas con `organization_id`; triggers de consistencia en polimórficas; suite `tests/rls` por sprint; auditoría completa en T11 | Cada sprint con tablas + auditoría T11 | Mitigado por diseño |
| R-17 | Seguir comunicando "Trazaloop CPR" como plataforma principal | Alta | Alta (estado actual del hero) | La marca queda acoplada a un sector; vender Textil exige "otra plataforma"; confusión de clientes multi-módulo | DL-16/DL-17/DL-21: hero "Trazaloop" en T1 (Parte A del prompt revisado); copy oficial en TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY; test de contenido del hero en T11 | T1 | Abierto |
| R-18 | Que Textil quede acoplado comercialmente a CPR (solo vendible como "extensión") | Alta | Media | Imposible vender Textil solo; precios y planes distorsionados | Plataforma modular (DL-16), acceso por módulo (DL-18/DL-20), tarjetas de módulos pares en landing; ejemplo válido documentado: empresa solo-Textil | T1 (comunicación) y Plataforma-M1 (acceso) | Abierto |
| R-19 | Que una empresa no pueda comprar módulos independientes | Alta | Alta (con el modelo actual: plan global único) | Bloqueo del modelo de negocio modular | Opción C (`organization_module_access`) recomendada y especificada; fase piloto no lo necesita (activación manual); Plataforma-M1 lo implementa | Plataforma-M1 | Abierto |
| R-20 | Que los planes globales impidan escalamiento modular (o que se "parcheen" fuera de un sprint dedicado) | Alta | Media | Deuda irreversible en planes; regresiones CPR por cambios apurados | DL-22: prohibido implementar planes por módulo antes de Plataforma-M1; el plan global vigente queda documentado como transitorio con backfill definido | Plataforma-M1 | Mitigado por diseño |
| R-21 | Que el superadministrador no pueda controlar acceso por módulo | Media | Baja | Operación comercial manual imposible; activaciones incontroladas | Hoy ya controla `organization_modules` (patrón superadmin); T1 añade la acción/vista de activación de Textil; Plataforma-M1 añade plan/estado por módulo (DL-19) | T1 y Plataforma-M1 | Mitigado por diseño |
| R-22 | Que una empresa acceda a un módulo sin habilitación explícita | Alta | Baja | Acceso no autorizado a funcionalidad; ingresos perdidos; datos creados en módulos no contratados | Guard por módulo en el layout del namespace (deny-by-default), flag de entorno, activación solo superadmin, tests de acceso denegado por sprint; en transición de acceso avanzado, una sola fuente de verdad con sincronización derivada | T1 (guard) y Plataforma-M1 (transición) | Mitigado por diseño |
| R-23 | Que storage y límites se calculen mal al existir varios módulos | Media | Media | Cobros/cuotas injustos; bloqueos indebidos; fugas de cuota entre módulos | Dominios de datos separados por módulo (tablas propias), storage por bucket/prefijo de módulo (DL-14), vistas de uso por módulo con tests (evolución de `v_organization_plan_usage`), conteo TrazaDocs por `module_key` | Plataforma-M1 (y T5/T8 para las bases) | Abierto |
| R-24 | Que "Demo" sea confuso: cuenta Demo (usuario) vs empresa Demo (organización) vs módulo en Demo (acceso) | Media | Alta | Soporte saturado; expectativas erróneas; textos legales/comerciales ambiguos | Semántica fijada en TRAZALOOP_MODULE_ACCESS_MODEL §5; copy de UI y documentación de usuario deben usar los tres términos según esa tabla; revisar textos en T1 y en fase comercial | T1 (copy) y fase comercial | Abierto |

## Lectura del registro

- Los riesgos "Mitigado por diseño" no están eliminados: su mitigación está
  especificada en los documentos y **se convierte en criterio de aceptación** del
  sprint indicado; si el sprint no la implementa, el riesgo se reabre.
- Los riesgos que exigen más atención operativa son **R-02, R-03 y R-16** (técnicos,
  T8/T11) y **R-17/R-19** (de plataforma: comunicación y modelo comercial; el
  primero se cierra en T1, el segundo en Plataforma-M1); todos con criterio de
  cierre verificable.

## Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| R-04/R-05/R-11 (lenguaje y claims) | N-05 (ISO 14021), N-01 (contexto ESPR/DPP) | Las mitigaciones aplican condiciones de autodeclaración prudente y separación frente al DPP oficial. | Que mitigar el riesgo equivalga a validar claims o cumplir el ESPR. |
| R-10 (alcance de normas) | Catálogo N-01…N-17 | Tipos de referencia declarados evitan sobre-atribución. | n/a |

## Criterios de aceptación

- [ ] Los 16 riesgos del encargo T0.1 y los 8 del encargo T0.2 (R-17…R-24) tienen
  entrada completa (severidad, probabilidad,
  impacto, mitigación, sprint, estado).
- [ ] Cada mitigación apunta a un mecanismo concreto ya especificado en el paquete.

## Próximos pasos

1. Revisar este registro al inicio de cada sprint (los riesgos del sprint entran a
   su planning).
2. Reevaluar severidades tras el piloto (T10/T11).
