-- 0068_legal_acceptance_hardening.sql
-- Trazaloop · Sprint 10D · Corrección (Bloqueante 1): user_legal_acceptances
-- (0066) permitía INSERT directo del cliente con `with check (user_id =
-- auth.uid())` — sin restringir document_type/version/legal_document_id/
-- accepted_at/ip_address/user_agent. Un usuario autenticado podía
-- insertar una fila con datos manipulados (por ejemplo, aceptar un
-- documento distinto al realmente activo, o falsificar accepted_at) sin
-- pasar por /legal/accept. El HECHO de aceptar siempre depende de una
-- acción real del usuario, pero el REGISTRO histórico de esa aceptación
-- nunca debía quedar manipulable.
--
-- Se elimina la política de INSERT directo y se reemplaza por una RPC
-- SECURITY DEFINER — MISMO patrón que change_trazadoc_document_status/
-- reopen_support_ticket: toda escritura sensible pasa por una función
-- controlada, nunca por un INSERT directo del cliente.

drop policy if exists user_legal_acceptances_insert on public.user_legal_acceptances;

-- Sin política de INSERT para clientes (deny-by-default): la única vía
-- real es accept_active_legal_documents, que es SECURITY DEFINER y
-- bypassa esta RLS por completo.

create or replace function public.accept_active_legal_documents(
  p_ip_address text default null,
  p_user_agent text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_count integer := 0;
  v_doc record;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  -- Documentos requeridos ACTUALES (Sprint 10D, Parte 5/12): terms y
  -- privacy — nunca lo que mande el cliente, siempre lo que el servidor
  -- considera activo en este momento.
  for v_doc in
    select id, document_type, version
    from legal_documents
    where status = 'active' and document_type in ('terms', 'privacy')
  loop
    insert into user_legal_acceptances (user_id, legal_document_id, document_type, version, accepted_at, ip_address, user_agent)
    values (v_user, v_doc.id, v_doc.document_type, v_doc.version, now(), p_ip_address, p_user_agent)
    on conflict (user_id, legal_document_id) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.accept_active_legal_documents(text, text) from public, anon;
grant execute on function public.accept_active_legal_documents(text, text) to authenticated;
