# QUALITY-11 · Rollback

## 1 · Lo primero: cómo se apaga sin desplegar nada

```sql
update quality_automation_settings set is_enabled = false
 where organization_id = '<empresa>';
```

El endpoint del planificador solo barre las empresas con el motor encendido. Con
esa fila a `false`, la empresa deja de recibir señales automáticas **hoy mismo**,
sin tocar código, sin migraciones y sin perder nada de lo emitido.

Más fino todavía, sin apagar el motor entero:

```sql
-- una regla concreta deja de evaluarse, conservando su historia
update quality_automation_rules set status = 'inactive' where id = '<regla>';

-- o se silencia con motivo y fecha de fin
select quality_signal_suppress('rule', '<regla>', 'Motivo', '2027-01-31');
```

## 2 · Qué NO hace falta revertir

Nada de QUALITY-11 cambia el comportamiento previo de la aplicación:

- los ocho barridos de QUALITY-03…10 conservan su firma y su contrato;
- ningún catálogo transversal se estrechó: solo se ampliaron;
- ninguna política, tabla o función anterior se reescribió;
- Production sigue en **0111** y no ha visto ninguna de las dos migraciones.

Si se despliega el código sin aplicar las migraciones, las pantallas de
automatización fallarían al leer tablas que no existen; por eso el orden es
siempre **migración primero, despliegue después**.

## 3 · Revertir el código

```bash
git revert eacaa0d..HEAD     # o desplegar el commit anterior
```

El menú pierde el grupo «Automatización», las siete rutas desaparecen, las seis
exportaciones dejan de estar registradas y el endpoint del planificador deja de
existir. Las tablas siguen ahí con sus datos: nada se pierde.

## 4 · Revertir el esquema

**No se recomienda, y casi nunca hace falta** — apagar el motor consigue el
mismo efecto sin destruir la explicación de por qué la plataforma dijo lo que
dijo.

Si aun así se quisiera, el orden es el inverso al de creación y **hay que
escribirlo como una migración nueva** (0131), nunca editando la 0129 ni la 0130:

```sql
-- 1 · las salidas emitidas, si se quiere limpiarlas (append-only: se marcan)
update work_tasks  set status = 'cancelled' where source_domain = 'automation';
-- 2 · las tablas del dominio, en orden de dependencia
drop table if exists public.quality_signal_suppressions;
drop table if exists public.quality_signals;
drop table if exists public.quality_automation_run_rules;
drop table if exists public.quality_automation_runs;
drop table if exists public.quality_automation_rule_versions;
drop table if exists public.quality_automation_rules;
drop table if exists public.quality_automation_rule_templates;
drop table if exists public.quality_automation_source_fields;
drop table if exists public.quality_automation_sources;
drop table if exists public.quality_automation_settings;
-- 3 · las funciones y las vistas
-- 4 · y devolver `quality_deletion_eligibility` a su versión de 0128
```

El paso 4 no es opcional: la 0129 reescribió esa función para incluir la regla
de automatización, y dejarla apuntando a una tabla que ya no existe rompería el
ciclo de vida de las otras 21 entidades.

## 5 · Qué pasa con lo ya emitido

Las señales, las ejecuciones y su detalle **no se borran**: un disparador lo
impide y explica por qué. Una señal se resuelve, se descarta o se silencia. Las
tareas y los avisos que la automatización creó son objetos transversales
normales: se cierran como cualquier otro.

Si hiciera falta retirar datos de prueba, lo correcto es hacerlo **lógicamente**
—resolver las señales con una nota, retirar las reglas, apagar el motor de esa
empresa— y nunca aflojando una restricción.
