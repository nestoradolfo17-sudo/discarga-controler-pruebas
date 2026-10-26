-- DISCARGA CONTROLER — Fase 14: seguridad, segunda etapa
-- Copia TODO este texto en Supabase → SQL Editor → New query → Run.
-- NO borra ni cambia rutas, camiones, personal ni usuarios. Seguro de repetir.
-- Requiere haber corrido antes las Fases 2, 3, 10 y 13.
--
-- Qué hace (todo en MODO ALERTA: nadie deja de trabajar; si algo no cumple la
-- regla, se anota una ALERTA en la bitácora. Cuando revises que las alertas son
-- solo casos reales, se activa el bloqueo con un interruptor, punto 6):
--
--  1) Permisos por pantalla en la base: quien no tiene el permiso de una
--     pantalla (Asignación, Cargar Rutas, Liquidadas, Camiones, Personal) no
--     debe guardar cambios de esa pantalla. Lo normal de la asignación
--     (camión/persona pasa a En Ruta o Disponible, motivo de no asignado) se
--     permite a todos.
--  2) Cambio de SEGMENTO de una ruta y de ESTATUS manual de un camión: la base
--     exige la autorización de un administrador (general o de la agencia),
--     no solo la pantalla.
--  3) Borrar rutas del tablero: solo con permiso de eliminar o administrador.
--     Lo automático sigue permitido: archivar liquidadas, dividir y revertir
--     rutas, limpieza de claves antiguas.
--  4) Usuarios de SOLO CONSULTA (para el DEMO, capacitación o supervisión):
--     pueden ver, pero la base les rechaza cualquier cambio. Aplica solo a los
--     usuarios que marques; a nadie más le cambia nada.
--  5) Respaldo diario: ahora incluye también recargas, préstamos, ZR y
--     perfiles de usuarios (sin contraseñas).

-- ════════════════════════════════════════════════════════════════════════
-- 0) Interruptores (todos inician en 'no' = solo alerta)
-- ════════════════════════════════════════════════════════════════════════
insert into public.app_seguridad_config (clave, valor) values
  ('bloquear_permisos_pantalla', 'no'),
  ('bloquear_segmento_estatus', 'no'),
  ('bloquear_borrado_rutas', 'no')
on conflict (clave) do nothing;

create or replace function public.dc_config_si(p_clave text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select valor = 'si' from public.app_seguridad_config where clave = p_clave), false);
$$;
revoke all on function public.dc_config_si(text) from public, anon, authenticated;

-- ¿El usuario en sesión tiene este permiso de pantalla? (administrador = todos).
-- p_defecto: valor cuando el permiso no está guardado (cuentas antiguas).
create or replace function public.dc_tiene_permiso(p text, p_defecto boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.is_admin
        or case when jsonb_typeof(u.permissions) = 'object' and u.permissions ? p
                then u.permissions ->> p = 'true' else p_defecto end
    from public.app_users u
    where u.id = auth.uid() and u.activo
  ), false);
$$;
grant execute on function public.dc_tiene_permiso(text, boolean) to authenticated;
revoke execute on function public.dc_tiene_permiso(text, boolean) from public, anon;

-- ¿El usuario en sesión es de SOLO CONSULTA? (nunca aplica a administradores)
create or replace function public.dc_solo_lectura()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and not u.is_admin
      and jsonb_typeof(u.permissions) = 'object'
      and u.permissions ->> 'soloLectura' = 'true'
  );
$$;
grant execute on function public.dc_solo_lectura() to authenticated;
revoke execute on function public.dc_solo_lectura() from public, anon;

-- Anota una alerta en la bitácora (sin repetir la misma en 10 minutos).
create or replace function public.dc_alerta(p_accion text, p_tabla text, p_registro text, p_detalle jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  if exists (
    select 1 from public.app_audit_log
    where accion = p_accion and tabla = p_tabla and registro = p_registro
      and usuario_id is not distinct from auth.uid() and fecha > now() - interval '10 minutes'
  ) then
    return;
  end if;
  select username into v_user from public.app_users where id = auth.uid();
  insert into public.app_audit_log (tabla, registro, accion, usuario_id, usuario, detalle)
  values (p_tabla, p_registro, p_accion, auth.uid(), v_user, p_detalle);
end $$;
revoke all on function public.dc_alerta(text, text, text, jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 1) Permisos por pantalla
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.dc_vigilar_permisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Campos que la asignación diaria cambia en camiones y personal (cualquier
  -- usuario del tablero): no requieren permiso de Camiones / Personal.
  libres   text[] := array['estado', 'rutaActual', 'motivoNoAsignado', 'motivoNoAsignadoFecha',
                           'remuneraNoAsignado', 'estadoManual', 'prestamoInfo', 'updatedAt'];
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

do $$
declare t text;
begin
  foreach t in array array['app_routes', 'app_historical_routes', 'app_trucks', 'app_staff'] loop
    execute format('drop trigger if exists trg_vigilar_permisos on public.%I', t);
    execute format('create trigger trg_vigilar_permisos before insert or update on public.%I
                    for each row execute function public.dc_vigilar_permisos()', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 2) Segmento y estatus de camión: autorización de administrador en la base
-- ════════════════════════════════════════════════════════════════════════
-- Cuando un administrador escribe su usuario y contraseña en la ventana de
-- autorización, la app (con la sesión temporal del administrador) registra
-- aquí la aprobación. La aprobación vale 15 minutos y solo para el usuario y
-- el registro indicados.
create table if not exists public.app_aprobaciones (
  id            bigserial primary key,
  fecha         timestamptz not null default now(),
  tipo          text not null check (tipo in ('segmento', 'estatus_camion', 'borrar_ruta')),
  ref           text not null,           -- número de ruta o id del camión
  agencia       text,
  admin_id      uuid not null,
  admin_usuario text,
  para_usuario  uuid,                    -- quien pidió la autorización
  usado         timestamptz
);
create index if not exists app_aprobaciones_busqueda_idx on public.app_aprobaciones (tipo, ref, fecha desc);
alter table public.app_aprobaciones enable row level security;
drop policy if exists "Solo admin ve aprobaciones" on public.app_aprobaciones;
create policy "Solo admin ve aprobaciones" on public.app_aprobaciones
  for select to authenticated using (public.is_app_admin());

create or replace function public.dc_registrar_aprobacion(p_tipo text, p_ref text, p_agencia text, p_para uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_user text;
begin
  if auth.uid() is null or not public.is_agency_admin(p_agencia) then
    raise exception 'NO_AUTORIZADO: solo un administrador (general o de la agencia) puede autorizar.';
  end if;
  if p_tipo not in ('segmento', 'estatus_camion', 'borrar_ruta') or coalesce(p_ref, '') = '' then
    raise exception 'DATOS_INVALIDOS';
  end if;
  select username into v_user from public.app_users where id = auth.uid();
  insert into public.app_aprobaciones (tipo, ref, agencia, admin_id, admin_usuario, para_usuario)
  values (p_tipo, p_ref, p_agencia, auth.uid(), v_user, p_para)
  returning id into v_id;
  delete from public.app_aprobaciones where fecha < now() - interval '180 days';
  return v_id;
end $$;
revoke all on function public.dc_registrar_aprobacion(text, text, text, uuid) from public, anon;
grant execute on function public.dc_registrar_aprobacion(text, text, text, uuid) to authenticated;

-- ¿Hay una aprobación vigente para este usuario y registro? (la marca como usada)
create or replace function public.dc_usar_aprobacion(p_tipo text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from public.app_aprobaciones
  where tipo = p_tipo and ref = p_ref
    and (para_usuario is null or para_usuario = auth.uid())
    and fecha > now() - interval '15 minutes'
  order by fecha desc limit 1;
  if v_id is null then
    return false;
  end if;
  update public.app_aprobaciones set usado = coalesce(usado, now()) where id = v_id;
  return true;
end $$;
revoke all on function public.dc_usar_aprobacion(text, text) from public, anon, authenticated;

create or replace function public.dc_vigilar_autorizacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  v_ref  text;
  v_ag   text := coalesce(new.data ->> 'agencia', old.data ->> 'agencia');
  v_det  jsonb;
  n_old  int;
  n_new  int;
begin
  if auth.uid() is null or old.data is not distinct from new.data then
    return new;
  end if;

  if tg_table_name = 'app_routes' then
    -- Solo cuando una ruta que YA tenía segmento cambia a otro.
    if coalesce(old.data ->> 'segmento', '') = ''
       or upper(coalesce(old.data ->> 'segmento', '')) = upper(coalesce(new.data ->> 'segmento', '')) then
      return new;
    end if;
    v_tipo := 'segmento';
    -- Número de ruta base (los viajes de una ruta dividida, 300.1 / 300.2, usan 300).
    v_ref  := split_part(coalesce(nullif(new.data ->> 'parentRouteId', ''), new.data ->> 'id', new.id), '.', 1);
    v_det  := jsonb_build_object('ruta', v_ref, 'fecha', new.data ->> 'fecha', 'agencia', v_ag,
                                 'antes', old.data ->> 'segmento', 'despues', new.data ->> 'segmento');
  else
    n_old := case when jsonb_typeof(old.data -> 'historialEstado') = 'array' then jsonb_array_length(old.data -> 'historialEstado') else 0 end;
    n_new := case when jsonb_typeof(new.data -> 'historialEstado') = 'array' then jsonb_array_length(new.data -> 'historialEstado') else 0 end;
    if not (
         n_new > n_old
      or (coalesce(old.data ->> 'estado', '') = 'Baja') <> (coalesce(new.data ->> 'estado', '') = 'Baja')
      or (jsonb_typeof(new.data -> 'estadoManual') = 'object'
          and not public.dc_json_igual(old.data -> 'estadoManual', new.data -> 'estadoManual'))
    ) then
      return new;  -- cambios automáticos de la asignación (En Ruta / Disponible)
    end if;
    v_tipo := 'estatus_camion';
    v_ref  := new.id;
    v_det  := jsonb_build_object('camion', coalesce(new.data ->> 'placa', new.id), 'agencia', v_ag,
                                 'antes', old.data ->> 'estado', 'despues', new.data ->> 'estado');
  end if;

  if public.is_agency_admin(v_ag) or public.dc_usar_aprobacion(v_tipo, v_ref) then
    return new;
  end if;
  if public.dc_config_si('bloquear_segmento_estatus') then
    raise exception 'SIN_AUTORIZACION: Este cambio requiere la autorización de un administrador (general o de la agencia %).', coalesce(v_ag, '');
  end if;
  perform public.dc_alerta('ALERTA_AUTORIZACION', tg_table_name, new.id, v_det || jsonb_build_object('tipo', v_tipo));
  return new;
end $$;

drop trigger if exists trg_vigilar_autorizacion on public.app_routes;
create trigger trg_vigilar_autorizacion before update on public.app_routes
  for each row execute function public.dc_vigilar_autorizacion();
drop trigger if exists trg_vigilar_autorizacion on public.app_trucks;
create trigger trg_vigilar_autorizacion before update on public.app_trucks
  for each row execute function public.dc_vigilar_autorizacion();

-- ════════════════════════════════════════════════════════════════════════
-- 3) Borrar rutas del tablero
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.dc_vigilar_borrado_ruta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id    text := old.data ->> 'id';
  v_fecha text := old.data ->> 'fecha';
  v_ag    text := old.data ->> 'agencia';
begin
  if auth.uid() is null then
    return old;
  end if;
  -- Con permiso de eliminar o administrador (general o de la agencia).
  if public.can_delete_data() or public.is_agency_admin(v_ag) then
    return old;
  end if;
  -- Trabajo automático de la app:
  --  • archivar rutas liquidadas al cargar el Excel del día;
  --  • revertir una ruta dividida (se borran sus viajes);
  --  • dividir una ruta (la original se reemplaza por sus viajes, que ya existen);
  --  • limpieza de la misma ruta guardada con una clave anterior.
  if coalesce(old.data ->> 'estado', '') = 'Liquidada'
     or coalesce(old.data ->> 'isSplitRoute', '') = 'true'
     or exists (
       select 1 from public.app_routes r
       where r.id <> old.id and r.data ->> 'fecha' is not distinct from v_fecha
         and (r.data ->> 'id' = v_id
              or (r.data ->> 'isSplitRoute' = 'true'
                  and (r.data ->> 'parentRouteId' = v_id or r.data ->> 'id' like v_id || '.%')))
     )
     or public.dc_usar_aprobacion('borrar_ruta', coalesce(v_id, old.id)) then
    return old;
  end if;

  if public.dc_config_si('bloquear_borrado_rutas') then
    raise exception 'SIN_PERMISO: Para eliminar rutas del tablero se necesita el permiso "Puede eliminar" o ser administrador.';
  end if;
  -- (La ruta borrada queda guardada completa en la bitácora: se puede recuperar.)
  perform public.dc_alerta('ALERTA_BORRADO', 'app_routes', old.id, jsonb_build_object(
    'ruta', v_id, 'fecha', v_fecha, 'agencia', v_ag, 'estado', old.data ->> 'estado'));
  return old;
end $$;

drop trigger if exists trg_vigilar_borrado_ruta on public.app_routes;
create trigger trg_vigilar_borrado_ruta before delete on public.app_routes
  for each row execute function public.dc_vigilar_borrado_ruta();

-- ════════════════════════════════════════════════════════════════════════
-- 4) Usuarios de SOLO CONSULTA: la base rechaza sus cambios
-- ════════════════════════════════════════════════════════════════════════
-- Políticas RESTRICTIVAS: se suman a las existentes (no las reemplazan). Para
-- todos los demás usuarios no cambia nada.
do $$
declare t text;
begin
  foreach t in array array['app_routes', 'app_historical_routes', 'app_trucks', 'app_staff',
                           'app_recargas', 'app_prestamos', 'app_zr'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists "Solo consulta: no crea" on public.%I', t);
    execute format('drop policy if exists "Solo consulta: no edita" on public.%I', t);
    execute format('drop policy if exists "Solo consulta: no borra" on public.%I', t);
    execute format('create policy "Solo consulta: no crea" on public.%I as restrictive for insert to authenticated
                    with check (not public.dc_solo_lectura())', t);
    execute format('create policy "Solo consulta: no edita" on public.%I as restrictive for update to authenticated
                    using (not public.dc_solo_lectura()) with check (not public.dc_solo_lectura())', t);
    execute format('create policy "Solo consulta: no borra" on public.%I as restrictive for delete to authenticated
                    using (not public.dc_solo_lectura())', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 5) Respaldo diario más completo
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.take_daily_backup()
returns void language plpgsql security definer set search_path = public as $$
declare t text; n integer; d jsonb;
begin
  -- Freno de espacio (Fase 4): sobre 400 MB no crea respaldo nuevo.
  if pg_database_size(current_database()) < 400 * 1024 * 1024 then
    foreach t in array array['app_routes','app_historical_routes','app_trucks','app_staff'] loop
      execute format('select count(*), coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''data'', data)), ''[]''::jsonb) from public.%I', t)
        into n, d;
      insert into public.app_backups (tabla, filas, datos) values (t, n, d);
    end loop;
    -- Nuevas (si existen): recargas, préstamos, ZR y perfiles (sin contraseñas).
    foreach t in array array['app_recargas','app_prestamos','app_zr','app_users'] loop
      if to_regclass('public.' || t) is not null then
        execute format('select count(*), coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t)
          into n, d;
        insert into public.app_backups (tabla, filas, datos) values (t, n, d);
      end if;
    end loop;
  else
    raise notice 'Base de datos sobre 400 MB: se omite el respaldo de hoy para proteger el espacio.';
  end if;
  delete from public.app_backups   where fecha < now() - interval '14 days';
  delete from public.app_audit_log where fecha < now() - interval '180 days';
end $$;
revoke all on function public.take_daily_backup() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Verificación (debe decir SÍ en todo)
-- ════════════════════════════════════════════════════════════════════════
select 'Permisos por pantalla (vigilancia)' as revision,
       case when (select count(*) from pg_trigger where tgname = 'trg_vigilar_permisos') = 4 then 'SÍ' else 'NO' end as activo
union all
select 'Segmento y estatus con autorización en la base',
       case when (select count(*) from pg_trigger where tgname = 'trg_vigilar_autorizacion') = 2 then 'SÍ' else 'NO' end
union all
select 'Borrado de rutas vigilado',
       case when exists (select 1 from pg_trigger where tgname = 'trg_vigilar_borrado_ruta') then 'SÍ' else 'NO' end
union all
select 'Usuarios de solo consulta protegidos',
       case when exists (select 1 from pg_policies where policyname = 'Solo consulta: no edita') then 'SÍ' else 'NO' end
union all
select 'Modo actual', case when (select count(*) from public.app_seguridad_config
                                  where clave in ('bloquear_permisos_pantalla','bloquear_segmento_estatus','bloquear_borrado_rutas')
                                    and valor = 'si') = 0
                           then 'Solo alerta (no bloquea)' else 'Bloqueo activo en algún punto' end;

-- ════════════════════════════════════════════════════════════════════════
-- 6) Después (en una semana): revisar alertas y activar bloqueos
-- ════════════════════════════════════════════════════════════════════════
-- Ver alertas:
--   select fecha at time zone 'America/Guatemala' as fecha, accion, usuario, tabla, registro, detalle
--   from public.app_audit_log
--   where accion in ('ALERTA_PERMISO','ALERTA_AUTORIZACION','ALERTA_BORRADO')
--   order by fecha desc limit 200;
-- Activar cada bloqueo (uno por uno):
--   update public.app_seguridad_config set valor = 'si', actualizado = now() where clave = 'bloquear_segmento_estatus';
--   update public.app_seguridad_config set valor = 'si', actualizado = now() where clave = 'bloquear_borrado_rutas';
--   update public.app_seguridad_config set valor = 'si', actualizado = now() where clave = 'bloquear_permisos_pantalla';
-- Volver a solo alerta: el mismo comando con valor = 'no'.
-- Marcar un usuario como SOLO CONSULTA (también se puede desde Usuarios):
--   update public.app_users set permissions = permissions || '{"soloLectura": true}' where username = 'demo';
