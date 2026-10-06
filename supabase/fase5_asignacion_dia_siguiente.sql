-- DISCARGA CONTROLER — Fase 5: asignar rutas de otra fecha sin liquidar las de hoy
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run.
-- NO borra ni modifica rutas, camiones ni personal. Seguro de repetir.
--
-- Antes: la base de datos rechazaba ("RECURSO_OCUPADO") asignar a una ruta de
-- MAÑANA un camión o una persona que todavía estaba en tránsito en una ruta de
-- HOY. Ahora solo se considera conflicto entre rutas de la misma jornada:
--   • ruta con fecha futura → jornada = su fecha
--   • ruta de hoy o de días anteriores (rezagadas activas) → jornada = hoy
-- (misma regla que usa la app).

create or replace function public.route_jornada(f text)
returns date language plpgsql stable as $$
declare
  d date;
  today date := (now() at time zone 'America/Guatemala')::date;
begin
  begin
    if f ~ '^\s*\d{1,2}/\d{1,2}/\d{4}' then
      d := to_date(substring(f from '\d{1,2}/\d{1,2}/\d{4}'), 'DD/MM/YYYY');
    elsif f ~ '^\s*\d{4}-\d{2}-\d{2}' then
      d := substring(f from '\d{4}-\d{2}-\d{2}')::date;
    end if;
  exception when others then
    d := null;
  end;
  if d is null or d <= today then
    return today;
  end if;
  return d;
end $$;

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
      -- Solo compiten rutas de la MISMA jornada (las de mañana no chocan con las de hoy).
      and public.route_jornada(r.data->>'fecha') = public.route_jornada(new.data->>'fecha')
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

-- Verificación (debe mostrar la fecha de hoy y la de mañana):
select public.route_jornada(to_char(now() at time zone 'America/Guatemala', 'DD/MM/YYYY')) as hoy,
       public.route_jornada(to_char((now() at time zone 'America/Guatemala') + interval '1 day', 'DD/MM/YYYY')) as manana;
