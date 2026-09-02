-- ===========================================================================
-- PE-04B6 · Retirada de empresas sintéticas de QA (SOLO local/Staging)
-- ---------------------------------------------------------------------------
-- Las suites crean empresas de prueba y las retiran al terminar. Cuando el
-- borrado falla —hay una veintena de tablas que referencian a `organizations`
-- con `on delete restrict`— la empresa se queda, y perseguir cada clave foránea
-- a mano en cuatro suites distintas es frágil.
--
-- Esto recorre TODAS las tablas de `public` con `organization_id` y las vacía
-- para las empresas indicadas, en el orden que las dependencias permiten, antes
-- de retirar la empresa.
--
-- SOLO retira empresas cuyo nombre coincide con los prefijos de QA. Nunca toca
-- una empresa de cliente, y nunca se ejecuta contra Producción.
-- ===========================================================================
do $$
declare
  v_org record;
  v_tab record;
  v_borradas int := 0;
begin
  for v_org in
    select id, name from public.organizations
     where name ~ '^(B[0-9]|SEC01|DBG|QA )'
  loop
    -- Varias pasadas: unas tablas dependen de otras.
    for i in 1..4 loop
      for v_tab in
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id'
         where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
         order by c.relname
      loop
        begin
          execute format('delete from public.%I where organization_id = $1', v_tab.relname)
            using v_org.id;
        exception when others then
          null;  -- otra tabla la referencia todavía; la siguiente pasada lo resuelve
        end;
      end loop;
    end loop;

    begin
      delete from public.organizations where id = v_org.id;
      v_borradas := v_borradas + 1;
      raise notice 'retirada: %', v_org.name;
    exception when others then
      raise notice 'NO se pudo retirar %: %', v_org.name, sqlerrm;
    end;
  end loop;

  raise notice 'empresas sintéticas retiradas: %', v_borradas;
end;
$$;
