-- ============================================================================
-- QUALITY-12.2F · ¿Quién puede entrar a /platform/intelligence?
-- ----------------------------------------------------------------------------
-- SOLO LECTURA. Ni crea, ni modifica, ni concede nada.
--
-- Devuelve únicamente correo, nombre, rol y estado. Sin identificadores
-- internos, sin fechas de sesión, sin nada de `auth.users`: para saber con qué
-- cuenta entrar no hace falta ver más.
-- ============================================================================
select
  p.email                                   as correo,
  coalesce(p.full_name, '—')                as nombre,
  s.role_code                               as rol,          -- superadmin | support
  s.status                                  as estado,       -- active | suspended | revoked
  (s.status = 'active')                     as puede_entrar_a_plataforma,
  (s.status = 'active' and s.role_code = 'superadmin')
                                            as puede_cambiar_limites
from public.platform_staff s
join public.profiles p on p.id = s.user_id
order by (s.status = 'active') desc, s.role_code, p.email;
