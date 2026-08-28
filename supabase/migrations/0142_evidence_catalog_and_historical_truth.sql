-- ============================================================================
-- Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PT-01
-- LA EVIDENCIA GUARDA POR QUÉ VALÍA, NO SOLO QUE VALE
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `evidences` es mutable, y una de sus guardas es destructiva. Al reabrir una
-- evidencia rechazada, `guard_evidence_review` hace esto:
--
--     new.reviewed_at    := null;
--     new.reviewed_by    := null;
--     new.review_comment := null;
--
-- La fila BORRA su propia historia de aprobación. `reviewed_at` no significa
-- «cuándo se aprobó»: significa «cuándo se revisó por última vez, si es que
-- esa revisión no fue anulada después». No sirve para responder la única
-- pregunta que un recálculo necesita hacer:
--
--     ¿esta evidencia estaba aceptada el 15 de marzo de 2026?
--
-- `audit_log` sí lo sabe —`audit_row_change` guarda la fila entera, no el
-- campo cambiado— pero reconstruir un estado a fecha exige recorrer todas las
-- versiones de la fila, y un cálculo de negocio no puede depender de una
-- bitácora de auditoría. Es el sitio equivocado para preguntar.
--
--
-- LO QUE SE HACE, Y LO QUE DELIBERADAMENTE NO
--
-- Se congela la RAZÓN junto al HECHO, en la propia fila de asociación. Seis
-- columnas sobre una tabla que ya existe, ya enlaza a lotes y ya valida el
-- inquilino. No una tabla nueva, no un versionado de evidencias, no un
-- segundo motor documental.
--
-- El patrón es de esta misma casa: `recycled_content_calculations` ya congela
-- `methodology_rules_snapshot` y el desglose por componente con el estado de
-- su soporte. Congelar la razón junto al resultado es lo que aquí se hace
-- desde el principio.
--
-- NO se copia el archivo, ni el nombre, ni el cuerpo del documento. Un
-- snapshot que copia de más es un segundo documento disfrazado.
--
--
-- Y UNA COSA QUE SE ARREGLA DE PASO
--
-- `evidences` no tiene índice por `evidence_type` aunque su lista filtra por
-- él. `textile_evidences` sí lo tiene. Cuesta una línea.
-- ============================================================================


-- ============================================================================
-- 1 · EL ÍNDICE QUE FALTABA
-- ============================================================================

create index if not exists evidences_org_type_idx
  on public.evidences (organization_id, evidence_type);

comment on index public.evidences_org_type_idx is
  'PT-01 · La lista de evidencias de PCR filtra por tipo desde PCR-01 y lo hacia sin indice. textile_evidences ya tenia el suyo.';


-- ============================================================================
-- 2 · EL SNAPSHOT DE APLICABILIDAD
-- ----------------------------------------------------------------------------
-- Todas NULLABLE, y a propósito. Las filas anteriores a esta migración se
-- quedan con `confirmed_at IS NULL` y se leen como «asociación histórica sin
-- confirmación registrada». Rellenarlas con valores plausibles sería
-- falsificar el registro para que la columna se vea bonita.
-- ============================================================================

alter table public.evidence_links
  add column if not exists confirmed_at   timestamptz,
  add column if not exists confirmed_by   uuid references public.profiles(id),
  -- La fecha del HECHO contra la que se juzgó la evidencia. Congelarla es lo
  -- que hace que un recálculo en 2028 dé lo mismo que en 2026: sin ella
  -- habría que volver a leer el lote, y el lote es mutable.
  add column if not exists reference_date date,
  add column if not exists evidence_status_at_confirmation text,
  add column if not exists evidence_valid_until_at_confirmation date,
  -- Por qué era aplicable, en un código estable y no en prosa.
  add column if not exists applicability_basis text;

comment on column public.evidence_links.reference_date is
  'PT-F02 · Fecha empresarial del destino contra la que se juzgo la evidencia (received_date del lote de entrada, produced_date del de salida, order_date de la orden; current_date cuando el destino es de catalogo y no tiene fecha propia). Congelada: PT-F04 depende de ella.';

comment on column public.evidence_links.applicability_basis is
  'PT-F06 · Codigo estable de POR QUE era aplicable. operation_date = el destino tenia fecha propia. catalog_current = destino de catalogo, se juzgo contra el dia de la confirmacion. legacy_unconfirmed no existe como valor: esas filas tienen todo el snapshot en NULL.';

comment on column public.evidence_links.confirmed_at is
  'PT-F05 · Marca de que hubo confirmacion humana explicita. NULL en las filas anteriores a 0142, que NO se rellenan.';


-- ============================================================================
-- 3 · EL DISPARADOR DICE LO QUE NO SABE HACER
-- ----------------------------------------------------------------------------
-- `evidence_target_type` declara ONCE valores; este disparador resuelve NUEVE.
-- `document` y `requirement` caían en el `else` genérico con un mensaje que
-- sonaba a «todavía no» sin decir qué sí.
--
-- QUALITY-12.2D perdió tiempo con esto: un adaptador que enlazaba evidencias
-- a documentos devolvía siempre cero filas y hubo que averiguar por qué. El
-- mensaje ahora nombra los nueve que sí, para que la próxima persona lo lea
-- en el error en vez de deducirlo.
--
-- No se reescribe el enum. Quitar dos valores de un tipo obliga a recrearlo y
-- a tocar toda columna que lo use, y no compensa para ganar exactitud en un
-- mensaje.
-- ============================================================================

create or replace function public.validate_evidence_link_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_target_org uuid;
begin
  case new.target_type::text
    when 'site'             then select organization_id into v_target_org from sites             where id = new.target_id;
    when 'supplier'         then select organization_id into v_target_org from suppliers         where id = new.target_id;
    when 'material'         then select organization_id into v_target_org from materials         where id = new.target_id;
    when 'product'          then select organization_id into v_target_org from products          where id = new.target_id;
    when 'product_family'   then select organization_id into v_target_org from product_families  where id = new.target_id;
    when 'input_batch'      then select organization_id into v_target_org from input_batches     where id = new.target_id;
    when 'production_order' then select organization_id into v_target_org from production_orders where id = new.target_id;
    when 'output_batch'     then select organization_id into v_target_org from output_batches    where id = new.target_id;
    when 'customer_requirement'
                            then select organization_id into v_target_org from customer_requirements where id = new.target_id;
    else
      raise exception
        'El tipo de destino % no admite enlaces de evidencia. Los admitidos son: sitio, proveedor, material, producto, familia de producto, lote de entrada, orden de produccion, lote de salida y acuerdo/requisito de cliente.',
        new.target_type
        using errcode = '22023';
  end case;

  if v_target_org is null then
    raise exception 'El destino % del enlace de evidencia no existe', new.target_id;
  end if;

  if v_target_org <> new.organization_id then
    raise exception 'Enlace de evidencia entre empresas bloqueado (evidencia % vs destino %)',
      new.organization_id, v_target_org;
  end if;

  return new;
end;
$$;


-- ============================================================================
-- 4 · LA FECHA EMPRESARIAL DE UN DESTINO
-- ----------------------------------------------------------------------------
-- Pura y pequeña, para que la regla viva en un solo sitio y la puedan usar
-- tanto la confirmación como cualquier lectura futura.
--
-- Devuelve NULL cuando el destino es de catálogo: un proveedor no ocurre un
-- día concreto. Quien la llame decide qué hacer con ese NULL — y aquí se
-- decide juzgarlo contra el día de la confirmación, dejándolo dicho en
-- `applicability_basis`.
-- ============================================================================

create or replace function public.evidence_target_reference_date(
  p_target_type text,
  p_target_id   uuid
) returns date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v date;
begin
  case p_target_type
    when 'input_batch'      then select received_date into v from input_batches     where id = p_target_id;
    when 'output_batch'     then select produced_date into v from output_batches    where id = p_target_id;
    when 'production_order' then select order_date    into v from production_orders where id = p_target_id;
    else return null;   -- destino de catalogo: no ocurre un dia concreto
  end case;
  return v;
end;
$$;

comment on function public.evidence_target_reference_date(text, uuid) is
  'PT-F02 · La fecha empresarial del destino. NULL para destinos de catalogo, que no tienen una.';


-- ============================================================================
-- 5 · LA CONFIRMACIÓN
-- ----------------------------------------------------------------------------
-- Las cuatro condiciones de PT-F05 se comprueban AQUÍ, en la base, y no en la
-- acción de servidor. La razón es concreta y ya nos costó un sprint:
-- QUALITY-12.2D descubrió que un `update` sobre una tabla sin política de
-- escritura no falla — afecta a cero filas y devuelve éxito. Una comprobación
-- que solo vive en TypeScript se salta escribiendo directamente en la tabla.
--
-- Por eso, además, el `insert` directo se revoca abajo (§6): una guarda que se
-- puede rodear no es una guarda, es una sugerencia.
--
-- Y si algo falla, la función RECHAZA. No escribe una fila «pendiente»: una
-- asociación a medias es una afirmación a medias.
-- ============================================================================

create or replace function public.evidence_link_confirm(
  p_evidence_id  uuid,
  p_target_type  text,
  p_target_id    uuid,
  p_link_role    text default null,
  p_confirmed    boolean default false
) returns public.evidence_links
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_ev        record;
  v_ref       date;
  v_basis     text;
  v_row       public.evidence_links;
begin
  -- 4 · Confirmación humana. Primero, porque sin ella no hay nada que mirar.
  if not coalesce(p_confirmed, false) then
    raise exception 'La asociacion requiere confirmacion explicita.'
      using errcode = '23514';
  end if;

  if v_uid is null then
    raise exception 'Se requiere una sesion activa para asociar una evidencia'
      using errcode = '42501';
  end if;

  -- La organizacion sale de la EVIDENCIA, jamas del cliente.
  select id, organization_id, status::text, valid_until, archived_at
    into v_ev
  from public.evidences
  where id = p_evidence_id;

  if not found then
    raise exception 'La evidencia no existe' using errcode = '23503';
  end if;

  -- 1 · Misma organizacion, y ademas membresia real de quien confirma.
  if not public.is_org_member(v_ev.organization_id) then
    raise exception 'No eres miembro activo de la empresa de esta evidencia'
      using errcode = '42501';
  end if;

  -- 2 · Aprobacion interna. 'valid' ES la aceptacion interna (enum de 0002);
  --     el archivado es ortogonal y tambien descalifica AL CONFIRMAR.
  if v_ev.status <> 'valid' then
    raise exception 'La evidencia no esta aceptada internamente (estado: %). Solo se pueden asociar evidencias aceptadas.',
      v_ev.status using errcode = '23514';
  end if;
  if v_ev.archived_at is not null then
    raise exception 'La evidencia esta archivada y no puede asociarse a nuevos destinos.'
      using errcode = '23514';
  end if;

  -- 3 · Aplicabilidad TEMPORAL, contra la fecha del destino y nunca contra hoy.
  v_ref := public.evidence_target_reference_date(p_target_type, p_target_id);
  if v_ref is null then
    -- Destino de catalogo: no ocurre un dia concreto, asi que se juzga contra
    -- el dia de la confirmacion y queda DICHO en el snapshot.
    v_ref   := current_date;
    v_basis := 'catalog_current';
  else
    v_basis := 'operation_date';
  end if;

  -- valid_until es INCLUSIVO: una evidencia que vence el 30 de junio ampara
  -- una operacion del 30 de junio. Misma semantica en la base, la interfaz y
  -- las pruebas.
  if v_ev.valid_until is not null and v_ev.valid_until < v_ref then
    raise exception 'La evidencia no estaba vigente en la fecha de la operacion (vigencia hasta %, fecha del destino %).',
      v_ev.valid_until, v_ref using errcode = '23514';
  end if;

  -- El duplicado se busca A MANO, y no con `on conflict`, por una razón que
  -- no se ve mirando el DDL: `evidence_links_uniq` es un índice único sobre
  -- (evidence_id, target_type, target_id, link_role) y PostgreSQL trata los
  -- NULL como DISTINTOS por defecto. Con `link_role` nulo —que es el caso
  -- normal— dos filas idénticas NO colisionan, `on conflict` nunca dispara y
  -- se insertaría un duplicado en cada reconfirmación.
  --
  -- El agujero es anterior a este sprint: la deteccion de duplicados por
  -- codigo 23505 de la accion de servidor tampoco disparaba nunca con rol
  -- nulo. Aqui se cierra con `is not distinct from`, que si equipara nulos.
  select * into v_row from public.evidence_links
  where evidence_id = p_evidence_id
    and target_type = p_target_type::public.evidence_target_type
    and target_id   = p_target_id
    and link_role is not distinct from p_link_role;

  if found then
    -- Ya estaba. Se devuelve TAL CUAL: reescribir el snapshot de la primera
    -- vez seria perder justo la historia que esta funcion existe para
    -- conservar.
    return v_row;
  end if;

  insert into public.evidence_links (
    organization_id, evidence_id, target_type, target_id, link_role,
    confirmed_at, confirmed_by, reference_date,
    evidence_status_at_confirmation, evidence_valid_until_at_confirmation,
    applicability_basis
  ) values (
    v_ev.organization_id, p_evidence_id, p_target_type::public.evidence_target_type,
    p_target_id, p_link_role,
    now(), v_uid, v_ref,
    v_ev.status, v_ev.valid_until,
    v_basis
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.evidence_link_confirm(uuid, text, uuid, text, boolean) is
  'PT-F05/PT-F06 · Unica via de escritura de evidence_links. Comprueba las cuatro condiciones y congela el snapshot de aplicabilidad. Reconfirmar NO reescribe el snapshot original.';

revoke all on function public.evidence_link_confirm(uuid, text, uuid, text, boolean) from public, anon;
grant execute on function public.evidence_link_confirm(uuid, text, uuid, text, boolean) to authenticated;

revoke all on function public.evidence_target_reference_date(text, uuid) from public, anon;
grant execute on function public.evidence_target_reference_date(text, uuid) to authenticated;


-- ============================================================================
-- 6 · LA PUERTA DE ATRÁS SE CIERRA
-- ----------------------------------------------------------------------------
-- Sin esto, la funcion de arriba seria una recomendacion: cualquiera con
-- sesion podria insertar la fila a mano, sin confirmacion, sin comprobar
-- vigencia y sin snapshot, y la RLS lo permitiria porque la politica solo
-- exige pertenecer a la empresa.
--
-- Se retira la POLITICA de insert, no el privilegio de tabla: asi el resto de
-- operaciones (leer, actualizar el rol del enlace, borrar) siguen exactamente
-- igual, y una lectura no se rompe.
--
-- El unico sitio del codigo que insertaba aqui era
-- server/actions/evidences.ts, que pasa a llamar a la RPC.
-- ============================================================================

drop policy if exists evidence_links_insert on public.evidence_links;

comment on table public.evidence_links is
  'PT-01 · La escritura entra EXCLUSIVAMENTE por evidence_link_confirm(): no hay politica de insert. Las cuatro condiciones de PT-F05 y el snapshot de PT-F06 no se pueden rodear.';


-- ============================================================================
-- 7 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop policy if exists evidence_links_insert on public.evidence_links;
--   create policy evidence_links_insert on public.evidence_links
--     for insert to authenticated with check (public.is_org_member(organization_id));
--   drop function if exists public.evidence_link_confirm(uuid, text, uuid, text, boolean);
--   drop function if exists public.evidence_target_reference_date(text, uuid);
--   alter table public.evidence_links
--     drop column if exists confirmed_at, drop column if exists confirmed_by,
--     drop column if exists reference_date,
--     drop column if exists evidence_status_at_confirmation,
--     drop column if exists evidence_valid_until_at_confirmation,
--     drop column if exists applicability_basis;
--   drop index if exists public.evidences_org_type_idx;
--   -- y restaurar validate_evidence_link_org() de 0019.
--
-- Ninguna fila existente se modifica en esta migracion. La reversion no
-- pierde datos porque no se creo ninguno.
-- ============================================================================
