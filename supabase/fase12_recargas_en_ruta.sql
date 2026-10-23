-- DISCARGA CONTROLER — Fase 12: Recargas "En ruta" hasta liquidar
--
-- Los viajes de Recarga del Tablero se registran al ASIGNAR, pero quedan
-- "En ruta" y no se pueden autorizar. Al LIQUIDAR el viaje pasan a
-- "Pendiente" (Recargas → Por autorizar).
--
-- Antes, la base pasaba a "Pendiente" todo lo que guardaba un usuario que no
-- es administrador, así que una recarga recién asignada salía de una vez por
-- autorizar. Esta fase solo cambia esa regla: una recarga AUTOMÁTICA (del
-- Tablero) puede quedar "En ruta". Todo lo demás sigue igual (solo un
-- administrador autoriza o rechaza; una autorizada no se modifica).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO este contenido
-- (no el nombre del archivo) → Run. Es seguro correrlo más de una vez.
-- NO borra ni cambia ninguna recarga guardada.
-- Requiere haber corrido antes fase8_recargas.sql.

create or replace function public.dc_recargas_control()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  es_admin boolean;
  limpiar text[] := array['estado', 'autorizadoPor', 'autorizadoEn', 'motivoRechazo'];
begin
  -- Sin usuario (SQL Editor / procesos internos): sin restricción.
  if auth.uid() is null then
    return new;
  end if;
  -- Una recarga AUTORIZADA ya no se modifica (nadie, ni administradores); solo
  -- se puede eliminar (regla "Eliminar"). Guardar sin cambios reales sí pasa.
  if tg_op = 'UPDATE' and coalesce(old.data->>'estado', '') = 'Autorizada'
     and (old.data - 'editadoPor' - 'editadoEn') is distinct from (new.data - 'editadoPor' - 'editadoEn') then
    raise exception 'RECARGA_AUTORIZADA: Una recarga autorizada no se puede modificar. Si está mal, un administrador debe eliminarla y registrarla de nuevo.';
  end if;
  -- Administrador general, o administrador de la agencia de la recarga (la de
  -- antes y la de después, si se cambia de agencia).
  es_admin := public.is_agency_admin(new.data->>'agencia')
    and (tg_op = 'INSERT' or public.is_agency_admin(old.data->>'agencia'));
  if es_admin then
    return new;
  end if;
  -- Guardado sin cambios reales (solo quién/cuándo editó): se deja igual.
  if tg_op = 'UPDATE'
     and (old.data - 'editadoPor' - 'editadoEn') = (new.data - 'editadoPor' - 'editadoEn') then
    return new;
  end if;
  -- Una recarga ya AUTORIZADA solo la modifica un administrador.
  if tg_op = 'UPDATE' and coalesce(old.data->>'estado', '') = 'Autorizada' then
    raise exception 'RECARGA_AUTORIZADA: Solo un administrador (general o de la agencia) puede modificar una recarga autorizada.';
  end if;
  -- Alta o cambio de un usuario no administrador: queda "Pendiente", salvo una
  -- recarga automática cuyo viaje aún no se liquida, que queda "En ruta"
  -- (todavía no se puede autorizar).
  new.data := (new.data - limpiar) || jsonb_build_object('estado',
    case when new.data->>'estado' = 'En ruta' and coalesce(new.data->>'origen', '') = 'asignacion'
         then 'En ruta' else 'Pendiente' end);
  return new;
end $$;

-- El disparador de fase 8 ya usa esta función; se vuelve a crear por si acaso.
drop trigger if exists trg_recargas_control on public.app_recargas;
create trigger trg_recargas_control
  before insert or update on public.app_recargas
  for each row execute function public.dc_recargas_control();

-- Revisión: debe decir "true".
select exists (
  select 1 from pg_proc where proname = 'dc_recargas_control' and prosrc like '%En ruta%'
) as fase12_ok;
