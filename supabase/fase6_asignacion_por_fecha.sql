-- DISCARGA CONTROLER — Fase 6: asignar camión y tripulación en rutas de OTRA FECHA
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run.
-- NO borra ni modifica rutas, camiones ni personal. Seguro de repetir.
--
-- Antes (Fase 5): las rutas de días anteriores que seguían "En Tránsito"
-- contaban como de HOY, así que un camión o una persona en una ruta de ayer
-- no se podía asignar a una ruta de hoy ("RECURSO_OCUPADO").
-- Ahora cada ruta pertenece a la jornada de SU PROPIA FECHA: solo hay
-- conflicto entre rutas con la MISMA fecha (misma regla que la app).

create or replace function public.route_jornada(f text)
returns date language plpgsql stable as $$
declare
  d date;
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
  -- Sin fecha legible: cuenta como de hoy.
  return coalesce(d, (now() at time zone 'America/Guatemala')::date);
end $$;

-- Regla de la base de datos (se vuelve a instalar por si la Fase 5 no se ejecutó).
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

-- Verificación: cada fecha devuelve su propio día.
select public.route_jornada(to_char((now() at time zone 'America/Guatemala') - interval '1 day', 'DD/MM/YYYY')) as ayer,
       public.route_jornada(to_char(now() at time zone 'America/Guatemala', 'DD/MM/YYYY')) as hoy,
       public.route_jornada(to_char((now() at time zone 'America/Guatemala') + interval '1 day', 'DD/MM/YYYY')) as manana;
