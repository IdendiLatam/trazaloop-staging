-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01D · Las campañas dejan rastro
-- =============================================================================
--
-- POR QUÉ HAY MIGRACIÓN EN UN TRAMO DE INTERFAZ
--
-- Porque la auditoría de este proyecto NO se escribe a mano desde las
-- acciones: la hace `audit_row_change`, un disparador de tabla que ya usan
-- `platform_staff`, `plan_definitions` y `trazadoc_blueprints`, y que ya
-- registra con `organization_id` nulo —hay 1443 filas así—. Enganchar el
-- disparador es DDL, y el encargo pide reutilizar la auditoría existente en
-- vez de inventar otra.
--
-- Registrar desde la acción habría sido código, sí, pero también un segundo
-- sistema de auditoría que se salta quien opere por SQL. Abrir o cerrar una
-- campaña queda anotado venga de donde venga.
--
-- Con esto quedan cubiertos `campaign.created`, `.updated`, `.opened`,
-- `.closed` y `.archived`: los tres últimos son cambios de `status`, y el
-- `diff` que guarda el disparador dice de qué estado a cuál.
--
-- Y `updated_at`, que hasta ahora no se movía solo.
-- =============================================================================

drop trigger if exists t_audit_public_diagnostic_campaigns
  on public.public_diagnostic_campaigns;
create trigger t_audit_public_diagnostic_campaigns
  after insert or update or delete on public.public_diagnostic_campaigns
  for each row execute function public.audit_row_change();

drop trigger if exists t_public_diagnostic_campaigns_updated
  on public.public_diagnostic_campaigns;
create trigger t_public_diagnostic_campaigns_updated
  before update on public.public_diagnostic_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists t_public_diagnostic_submissions_updated
  on public.public_diagnostic_submissions;
create trigger t_public_diagnostic_submissions_updated
  before update on public.public_diagnostic_submissions
  for each row execute function public.set_updated_at();

drop trigger if exists t_public_diagnostic_answers_updated
  on public.public_diagnostic_answers;
create trigger t_public_diagnostic_answers_updated
  before update on public.public_diagnostic_answers
  for each row execute function public.set_updated_at();

-- Las PARTICIPACIONES no se auditan fila a fila a propósito: llevan datos
-- personales, y `audit_row_change` guarda la fila entera en `diff`. Duplicar
-- nombre, correo y teléfono en una tabla de auditoría que nadie limpia es
-- justo lo contrario de la frontera que 0196 puso. Su historia se sigue por
-- `status`, `started_at`, `completed_at` y la cadena de supersesión.
