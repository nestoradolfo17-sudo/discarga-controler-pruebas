-- DISCARGA CONTROLER — Fase 2 de correcciones (análisis de errores)
-- Ejecutar en Supabase → SQL Editor → New query → Run (después de publicar la
-- versión nueva de la app). Seguro de repetir.
--
-- Punto 1: la BASE DE DATOS impide que un camión o una persona queden en dos
--          rutas en tránsito a la vez (dos tablets asignando al mismo tiempo).
-- Punto 2: los permisos de agencia y de eliminar se aplican en la base de
--          datos, no solo en la pantalla.

-- ════════════════════════════════════════════════════════════════════════
-- PUNTO 1 — Recursos ocupados
-- ════════════════════════════════════════════════════════════════════════
-- Regla (la misma de la app): es CONFLICTO si
--   • el mismo camión está en otra ruta en tránsito con OTRO piloto, o
--   • la misma persona (piloto o auxiliar) está en otra ruta en tránsito de la
--     misma agencia con OTRO camión.
-- La carga compartida legítima (mismo camión y misma tripulación en 2+ rutas,
-- vía "Optimización de Carga") sigue permitida.
-- Solo se revisa cuando cambia la asignación o el estado de la ruta, para no
-- bloquear otras ediciones.
create or replace function public.check_route_resources()
returns trigger language plpgsql as $$
declare
  a jsonb;
  c record;
  my_people text[];
  other_people text[];
  shared text[];
begin
  if coalesce(new.data->>'estado', '') <> 'En Tránsito'
     or jsonb_typeof(new.data->'asignacion') is distinct from 'object' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.data->'asignacion' is not distinct from new.data->'asignacion'
     and old.data->>'estado' is not distinct from new.data->>'estado' then
    return new;
  end if;

  a := new.data->'asignacion';
  my_people := array_remove(array[
    nullif(lower(trim(a->>'conductor')), ''),
    nullif(lower(trim(a->>'auxiliar1')), ''),
    nullif(lower(trim(a->>'auxiliar2')), ''),
    nullif(lower(trim(a->>'auxiliar3')), ''),
    nullif(lower(trim(a->>'auxiliar4')), '')], null);

  for c in
    select r.data->>'id' as rid, r.data->>'agencia' as ag, r.data->'asignacion' as oa
    from public.app_routes r
    where r.id <> new.id
      and r.data->>'estado' = 'En Tránsito'
      and jsonb_typeof(r.data->'asignacion') = 'object'
  loop
    -- Mismo camión con otro piloto.
    if coalesce(a->>'camionId', '') <> ''
       and a->>'camionId' = c.oa->>'camionId'
       and lower(trim(coalesce(a->>'conductor', ''))) <> lower(trim(coalesce(c.oa->>'conductor', ''))) then
      raise exception 'RECURSO_OCUPADO: el camión % ya está en la ruta % con otro piloto.',
        coalesce(a->>'camionPlaca', a->>'camionId'), c.rid;
    end if;

    -- Misma persona en otra ruta (misma agencia) con otro camión.
    if coalesce(c.ag, '') = coalesce(new.data->>'agencia', '')
       and coalesce(a->>'camionId', '') <> coalesce(c.oa->>'camionId', '') then
      other_people := array_remove(array[
        nullif(lower(trim(c.oa->>'conductor')), ''),
        nullif(lower(trim(c.oa->>'auxiliar1')), ''),
        nullif(lower(trim(c.oa->>'auxiliar2')), ''),
        nullif(lower(trim(c.oa->>'auxiliar3')), ''),
        nullif(lower(trim(c.oa->>'auxiliar4')), '')], null);
      select array_agg(p) into shared from unnest(my_people) p where p = any(other_people);
      if shared is not null and array_length(shared, 1) > 0 then
        raise exception 'RECURSO_OCUPADO: % ya está en la ruta % con otro camión.',
          array_to_string(shared, ', '), c.rid;
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_check_route_resources on public.app_routes;
create trigger trg_check_route_resources
  before insert or update on public.app_routes
  for each row execute function public.check_route_resources();

-- ════════════════════════════════════════════════════════════════════════
-- PUNTO 2 — Permisos por agencia y de eliminar, en la base de datos
-- ════════════════════════════════════════════════════════════════════════
-- ¿El usuario en sesión puede ver/usar esta agencia? (admin o acceso "all" =
-- todas; si no, solo las de su lista). Registros sin agencia (antiguos) quedan
-- visibles para no ocultarlos por error.
create or replace function public.can_access_agency(ag text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo
      and (
        u.is_admin
        or u.agency_access = '"all"'::jsonb
        or coalesce(ag, '') = ''
        or (jsonb_typeof(u.agency_access) = 'array' and u.agency_access ? ag)
      )
  );
$$;

-- ¿Tiene permiso de eliminar? (administrador o "Puede eliminar datos").
create or replace function public.can_delete_data()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo and (u.is_admin or u.can_delete)
  );
$$;

grant execute on function public.can_access_agency(text), public.can_delete_data() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['app_routes','app_historical_routes','app_trucks','app_staff'] loop
    execute format('drop policy if exists "Usuarios activos" on public.%I', t);
    execute format('drop policy if exists "Ver por agencia" on public.%I', t);
    execute format('drop policy if exists "Crear por agencia" on public.%I', t);
    execute format('drop policy if exists "Editar por agencia" on public.%I', t);
    execute format('drop policy if exists "Eliminar" on public.%I', t);

    execute format(
      'create policy "Ver por agencia" on public.%I for select to authenticated
         using (public.is_app_user() and public.can_access_agency(data->>''agencia''))', t);
    execute format(
      'create policy "Crear por agencia" on public.%I for insert to authenticated
         with check (public.is_app_user() and public.can_access_agency(data->>''agencia''))', t);
    execute format(
      'create policy "Editar por agencia" on public.%I for update to authenticated
         using (public.is_app_user() and public.can_access_agency(data->>''agencia''))
         with check (public.is_app_user() and public.can_access_agency(data->>''agencia''))', t);
  end loop;
end $$;

-- Eliminar:
--  • Tablero activo (app_routes): la app borra filas como parte normal del
--    trabajo (archivar liquidadas al cargar el Excel, partir/revertir rutas),
--    así que se permite a cualquier usuario activo dentro de SUS agencias.
--  • Historial, camiones y personal: solo con permiso de eliminar.
create policy "Eliminar" on public.app_routes for delete to authenticated
  using (public.is_app_user() and public.can_access_agency(data->>'agencia'));
create policy "Eliminar" on public.app_historical_routes for delete to authenticated
  using (public.can_delete_data() and public.can_access_agency(data->>'agencia'));
create policy "Eliminar" on public.app_trucks for delete to authenticated
  using (public.can_delete_data() and public.can_access_agency(data->>'agencia'));
create policy "Eliminar" on public.app_staff for delete to authenticated
  using (public.can_delete_data() and public.can_access_agency(data->>'agencia'));
