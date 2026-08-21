-- 0115_quality_map_edges_privilege_hardening.sql
-- Trazaloop Quality · QUALITY-01.2 · El snapshot del mapa, de solo lectura de
-- verdad también en un proyecto remoto.
--
-- ============================================================================
-- QUÉ CORRIGE, Y POR QUÉ NO SE VIO ANTES
-- ============================================================================
-- 0114 crea quality_process_map_edges como una tabla que ninguna sesión de
-- cliente debe poder escribir: el snapshot de una version publicada del mapa lo
-- escribe UNICAMENTE quality_publish_map_version, que corre como propietaria.
-- Por eso la tabla no tiene politica de INSERT, UPDATE ni DELETE, y por eso
-- 0114 concede a `authenticated` solamente SELECT.
--
-- Conceder SELECT, sin embargo, no QUITA lo que ya venia concedido. Y lo que
-- viene concedido depende del entorno:
--
--   · En el stack LOCAL, los privilegios por defecto del rol propietario dan
--     Dxtm (truncate, references, trigger, maintain) sobre cada tabla nueva.
--     0114 los revoca, y el resultado local era el correcto: solo SELECT.
--
--   · En un proyecto REMOTO de Supabase, los privilegios por defecto dan
--     arwdDxtm — es decir, TAMBIEN insert, update y delete. Ahi 0114 dejaba a
--     `authenticated` con DML sobre el snapshot.
--
-- La RLS seguia impidiendo escribir (sin politica no hay acceso), asi que el
-- comportamiento observable era el correcto y las pruebas pasaban en los dos
-- sitios. Pero la defensa en profundidad se apoyaba en una sola capa en vez de
-- en dos, y la migracion afirmaba algo que en remoto no era cierto.
--
-- Es exactamente la leccion de 0111 y de 0112 §12, aplicada al caso que faltaba:
-- cuando una tabla debe ser de SOLO LECTURA para el cliente, no basta con
-- conceder SELECT — hay que revocar explicitamente lo demas, porque el entorno
-- concede de mas.
--
-- Se descubrio validando contra Staging, no en local: los dos entornos no
-- reparten los mismos privilegios por defecto.
--
-- ============================================================================
-- ALCANCE
-- ============================================================================
-- Idempotente y minima: solo revoca. No crea, no altera datos, no toca ninguna
-- otra tabla de Quality —las once de 0112 SI necesitan DML, y ahi el privilegio
-- es deliberado— ni ninguna migracion anterior.
--
-- ROLLBACK (documentado; NO ejecutar sin decision):
--   grant insert, update, delete on public.quality_process_map_edges
--     to authenticated;
--   (Devolveria un privilegio que nada usa: la RLS seguiria bloqueando igual.)
-- ============================================================================

revoke insert, update, delete, truncate, references, trigger
  on table public.quality_process_map_edges
from authenticated;

-- anon no debe conservar NADA: ninguna superficie de Quality es publica. 0114
-- ya lo revoco; se reafirma porque este es justo el momento de comprobarlo.
revoke all on table public.quality_process_map_edges from anon;

-- Y se deja constancia del contrato en la propia base, para quien lea el
-- esquema sin tener delante la migracion.
comment on table public.quality_process_map_edges is
  'QUALITY-01.2 · Snapshot de las relaciones que mostraba una version PUBLICADA del mapa. SOLO LECTURA para authenticated (0115): lo escribe unicamente quality_publish_map_version, que corre como propietaria. Sin politicas de INSERT/UPDATE/DELETE.';
