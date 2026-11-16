-- DISCARGA CONTROLER — Fase 18: teléfono celular editable por todos
-- Copia TODO este texto en Supabase → SQL Editor → New query → Run.
-- NO borra ni cambia datos. Seguro de repetir.
--
-- Qué hace: el teléfono celular del personal ("telefono") lo puede cambiar
-- cualquier usuario de la agencia, aunque no tenga permiso de la pantalla
-- Personal (igual que el estado y los motivos de Fin de Asignación).
-- Es la misma regla de la Fase 14 con "telefono" agregado a los campos libres.

create or replace function public.dc_vigilar_permisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Campos que la asignación diaria cambia en camiones y personal (cualquier
  -- usuario del tablero): no requieren permiso de Camiones / Personal.
  libres   text[] := array['estado', 'rutaActual', 'motivoNoAsignado', 'motivoNoAsignadoFecha',
                           'remuneraNoAsignado', 'estadoManual', 'prestamoInfo', 'updatedAt',
                           'telefono', 'comentarioNoAsignado'];
  ok       boolean := true;
  permiso  text;
  cambiados text[];
  reg      text := coalesce(new.id, old.id);
begin
  if auth.uid() is null then
    return coalesce(new, old);  -- SQL Editor, respaldos, procesos internos
  end if;
  if tg_op = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  if tg_table_name in ('app_routes', 'app_historical_routes') then
    if tg_op = 'DELETE' then
      return old;  -- el borrado de rutas tiene su propia regla (punto 3)
    end if;
    permiso := 'Asignación, Cargar Rutas o Rutas Liquidadas';
    ok := public.dc_tiene_permiso('board') or public.dc_tiene_permiso('batch') or public.dc_tiene_permiso('liquidated');

  elsif tg_table_name in ('app_trucks', 'app_staff') then
    if tg_op = 'DELETE' then
      return old;  -- ya exige "Puede eliminar" (Fase 2)
    end if;
    if tg_table_name = 'app_trucks' then
      permiso := 'Camiones';
      ok := public.dc_tiene_permiso('trucks') or public.dc_tiene_permiso('canBulkUploadTrucks', true)
            or (tg_op = 'INSERT' and public.dc_tiene_permiso('canManualAddTrucks', true));
    else
      permiso := 'Personal';
      ok := public.dc_tiene_permiso('staff') or public.dc_tiene_permiso('canBulkUploadStaff', true)
            or (tg_op = 'INSERT' and public.dc_tiene_permiso('canManualAddStaff', true));
    end if;
    if not ok and tg_op = 'UPDATE' then
      select coalesce(array_agg(k), '{}') into cambiados
      from (
        select k from jsonb_object_keys(coalesce(old.data, '{}') || coalesce(new.data, '{}')) k
        where not public.dc_json_igual(old.data -> k, new.data -> k)
      ) x;
      ok := cambiados <@ libres;
    end if;
  else
    return coalesce(new, old);
  end if;

  if ok then
    return coalesce(new, old);
  end if;
  if public.dc_config_si('bloquear_permisos_pantalla') then
    raise exception 'SIN_PERMISO: Tu usuario no tiene permiso de % para este cambio. Consulta con el administrador.', permiso;
  end if;
  perform public.dc_alerta('ALERTA_PERMISO', tg_table_name, reg, jsonb_build_object(
    'operacion', tg_op, 'permiso_requerido', permiso,
    'agencia', coalesce(new.data, old.data) ->> 'agencia',
    'campos', to_jsonb(cambiados)));
  return coalesce(new, old);
end $$;

-- Verificación: debe decir SÍ.
select case when pg_get_functiondef('public.dc_vigilar_permisos()'::regprocedure) like '%''telefono''%' then 'SÍ' else 'NO' end as telefono_libre;
