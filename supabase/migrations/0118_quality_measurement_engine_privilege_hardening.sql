-- ============================================================================
-- 0118 · QUALITY-03 · Endurecimiento de privilegios del motor de medición
-- ============================================================================
--
-- POR QUÉ EXISTE ESTA MIGRACIÓN
--
-- 0117 §21 declara —y con razón— que las tablas del motor de medición son de
-- SOLO LECTURA para el cliente: sus escrituras son exclusivamente de las RPC
-- SECURITY DEFINER. Para conseguirlo concedió `select` y revocó
-- `truncate, references, trigger`.
--
-- Eso basta en LOCAL y no basta en REMOTO. Es literalmente la lección que 0115
-- dejó escrita hace tres migraciones, aplicada al caso que faltaba:
--
--   · en local, los privilegios por defecto sobre una tabla nueva dan Dxtm a
--     anon y authenticated — solo TRUNCATE y DDL, nada de DML;
--   · en un proyecto remoto de Supabase dan arwdDxtm — es decir, TAMBIÉN
--     insert, update y delete.
--
-- Conceder SELECT no retira lo que el entorno ya concedió. Así que en Staging
-- `authenticated` conservaba UPDATE y DELETE sobre las mediciones, sobre las
-- configuraciones, sobre las ejecuciones de cálculo, sobre los cierres y sobre
-- los eventos.
--
-- QUÉ SE VEÍA Y QUÉ NO
--
-- La RLS seguía impidiendo la escritura: ninguna de estas tablas tiene política
-- de UPDATE ni de DELETE, así que la sentencia no afectaba a ninguna fila. Pero
-- «cero filas» no es «denegado»: PostgREST devuelve 204 y ningún error. Un
-- INSERT sí levanta error —violar la política de inserción es un error, no un
-- filtro—, y por eso las pruebas de inserción pasaban en los dos entornos
-- mientras las de UPDATE solo pasaban en local, donde la falta de privilegio
-- produce un 42501 honesto.
--
-- Lo descubrió la validación contra Staging, no la local. Otra vez. Los dos
-- entornos no reparten los mismos privilegios por defecto, y el único modo de
-- que la afirmación «esta tabla es de solo lectura» sea cierta en ambos es
-- revocar explícitamente en vez de suponer.
--
-- ALCANCE
--
-- Idempotente y mínima: solo revoca. No crea, no altera y no toca datos. No
-- roza las cuatro tablas de 0117 que SÍ necesitan DML —objetivos, sus procesos,
-- sus indicadores y el catálogo de indicadores—, donde el privilegio es
-- deliberado. Tampoco modifica 0117 ni ninguna migración anterior.
--
-- ROLLBACK (documentado; NO ejecutar sin decisión):
--   grant insert, update, delete on
--     public.quality_indicator_configs, public.quality_measurements,
--     public.quality_calculation_runs, public.quality_period_closures,
--     public.work_events
--   to authenticated;
--   grant update on public.quality_measurement_evidence to authenticated;
--   (Devolvería privilegios que nada usa: la RLS seguiría bloqueando igual.)
-- ============================================================================

-- Las cinco tablas de solo lectura del motor. Todo lo que se escribe en ellas
-- pasa por una RPC que corre como propietaria.
revoke insert, update, delete, truncate, references, trigger on table
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events
from authenticated;

-- La evidencia es el único caso mixto: se adjunta y se quita —de ahí insert y
-- delete en 0117 §21—, pero nunca se reescribe. Un archivo adjunto que cambia
-- de contenido conservando su identidad es justo lo que una evidencia no puede
-- ser.
revoke update, truncate, references, trigger on table
  public.quality_measurement_evidence
from authenticated;

-- anon no debe conservar NADA: ninguna superficie de Quality es pública. 0117
-- §21 ya lo revocó; se reafirma porque este es justo el momento de comprobarlo.
revoke all on table
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_measurement_evidence,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events
from anon;

-- Y se deja constancia del contrato en la propia base, para quien lea el
-- esquema sin tener delante la migración.
comment on table public.quality_measurements is
  'QUALITY-03 · Mediciones por periodo. SOLO LECTURA para authenticated (0118): las escribe únicamente quality_record_measurement / quality_run_indicator_calculation / quality_correct_measurement, que corren como propietarias. Sin políticas de INSERT/UPDATE/DELETE.';

comment on table public.quality_indicator_configs is
  'QUALITY-03 · Configuración vigente por tramo (meta, dirección, unidad, periodicidad, fuente). SOLO LECTURA para authenticated (0118): la escribe únicamente quality_publish_indicator_config. Versionada: cambiar la meta abre un tramo nuevo, nunca reescribe el pasado.';

comment on table public.work_events is
  'QUALITY-03 · Bitácora append-only de hechos de desempeño (AT-02/AT-03). SOLO LECTURA para authenticated (0118); ni siquiera las RPC la reescriben: un trigger impide UPDATE y DELETE.';
