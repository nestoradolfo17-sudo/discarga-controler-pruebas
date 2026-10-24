-- DISCARGA CONTROLER — Fase 13: Seguridad (primera etapa, SIN afectar el uso)
--
-- Todo lo de este script es "invisible" para los usuarios: no bloquea ni
-- cambia ninguna pantalla ni ningún flujo de trabajo. NO borra datos.
--
--   1) Bitácora de usuarios y permisos: queda registrado quién crea, cambia
--      (permisos, agencias, administrador, activo) o elimina usuarios.
--   2) Vigilancia de liquidaciones cerradas: si alguien que NO es
--      administrador (general o de la agencia) cambia los resultados de una
--      liquidación ya cerrada (cajas entregadas/devueltas, guías, motivo,
--      fecha, auditor), queda una ALERTA en la bitácora. Por ahora SOLO
--      avisa; cuando se confirme que no hay alertas de trabajo normal, se
--      puede activar el bloqueo con una sola línea (ver al final).
--   3) Funciones privilegiadas: ya no se pueden ejecutar sin iniciar sesión.
--   4) Funciones con "search_path" fijo (recomendación de Supabase).
--   5) Se cierra la búsqueda de usuarios de ZR (ZR ya no tiene sección Usuarios).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO este contenido
-- (no el nombre del archivo) → Run. Es seguro correrlo más de una vez.
-- Requiere haber corrido antes la Fase 3 (bitácora) y la Fase 8 (is_agency_admin).

-- ════════════════════════════════════════════════════════════════════════
-- 0) Configuración de seguridad (interruptores). Solo se cambia desde el
--    SQL Editor; la app no la puede leer ni modificar.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.app_seguridad_config (
  clave       text primary key,
  valor       text not null,
  actualizado timestamptz not null default now()
);
alter table public.app_seguridad_config enable row level security;
-- (sin políticas: nadie la toca desde la app)
insert into public.app_seguridad_config (clave, valor)
values ('bloquear_cambios_liquidacion', 'no')
on conflict (clave) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 1) Bitácora de usuarios y permisos
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.audit_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user  text;
  antes   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  despues jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  campos  text[] := array['username', 'nombre', 'is_admin', 'can_delete', 'permissions', 'agency_access', 'admin_agencies', 'activo', 'email'];
  k       text;
  cambios jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    foreach k in array campos loop
      if (antes -> k) is distinct from (despues -> k) then
        cambios := cambios || jsonb_build_object(k, jsonb_build_object('antes', antes -> k, 'despues', despues -> k));
      end if;
    end loop;
    -- Solo cambió la fecha de último acceso: no se registra.
    if cambios = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    cambios := despues - 'last_login';
  else
    cambios := antes - 'last_login';
  end if;

  select username into v_user from public.app_users where id = auth.uid();
  insert into public.app_audit_log (tabla, registro, accion, usuario_id, usuario, detalle)
  values (
    'app_users',
    coalesce(despues ->> 'id', antes ->> 'id'),
    tg_op,
    auth.uid(),
    coalesce(v_user, case when auth.uid() is null then 'Sistema / función admin-users' else null end),
    jsonb_build_object('usuario', coalesce(despues ->> 'username', antes ->> 'username'), 'cambios', cambios)
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit_usuarios on public.app_users;
create trigger trg_audit_usuarios
  after insert or update or delete on public.app_users
  for each row execute function public.audit_usuarios();

-- ════════════════════════════════════════════════════════════════════════
-- 2) Vigilancia de liquidaciones cerradas
-- ════════════════════════════════════════════════════════════════════════
-- Igualdad "de negocio" entre dos valores JSON: 10 = "10" = 10.0, y vacío =
-- nulo = ausente. Así no salen alertas por diferencias de formato.
create or replace function public.dc_json_igual(a jsonb, b jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  x numeric;
  y numeric;
begin
  if a is not distinct from b then
    return true;
  end if;
  if coalesce(nullif(a #>> '{}', ''), '') = coalesce(nullif(b #>> '{}', ''), '') then
    return true;
  end if;
  begin
    x := (a #>> '{}')::numeric;
    y := (b #>> '{}')::numeric;
    return x = y;
  exception when others then
    return false;
  end;
end $$;

create or replace function public.dc_vigilar_liquidacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  campos   text[] := array['cajasEntregadas', 'cajasDevueltas', 'guiasExitosas', 'guiasRechazadas',
                           'motivoDevolucion', 'motivosSeleccionados', 'fechaLiquidacion', 'auditor'];
  o        jsonb := old.data -> 'liquidacion';
  n        jsonb := new.data -> 'liquidacion';
  k        text;
  cambios  jsonb := '{}'::jsonb;
  bloquear boolean := false;
  v_user   text;
begin
  -- SQL Editor / procesos internos (respaldos, cron): sin revisión.
  if auth.uid() is null then
    return new;
  end if;
  -- Solo liquidaciones cerradas: en el tablero, las rutas en estado Liquidada;
  -- en el historial, cualquier registro con liquidación.
  if jsonb_typeof(o) is distinct from 'object' then
    return new;
  end if;
  if tg_table_name = 'app_routes' and coalesce(old.data ->> 'estado', '') <> 'Liquidada' then
    return new;
  end if;

  foreach k in array campos loop
    if not public.dc_json_igual(o -> k, case when jsonb_typeof(n) = 'object' then n -> k else null end) then
      cambios := cambios || jsonb_build_object(k, jsonb_build_object('antes', o -> k, 'despues', case when jsonb_typeof(n) = 'object' then n -> k else null end));
    end if;
  end loop;
  if cambios = '{}'::jsonb then
    return new;  -- abonos / liquidación final de Caja Abierta, clientes, etc.: normal
  end if;
  -- Administrador general o de la agencia: permitido (queda en la bitácora normal).
  if public.is_agency_admin(old.data ->> 'agencia') then
    return new;
  end if;

  select valor = 'si' into bloquear from public.app_seguridad_config where clave = 'bloquear_cambios_liquidacion';
  if coalesce(bloquear, false) then
    raise exception 'LIQUIDACION_CERRADA: Solo un administrador (general o de la agencia) puede cambiar los resultados de una liquidación cerrada.';
  end if;

  select username into v_user from public.app_users where id = auth.uid();
  insert into public.app_audit_log (tabla, registro, accion, usuario_id, usuario, estado_antes, estado_despues, detalle)
  values (
    tg_table_name, old.id, 'ALERTA_LIQUIDACION', auth.uid(), v_user,
    old.data ->> 'estado', new.data ->> 'estado',
    jsonb_build_object('ruta', old.data ->> 'id', 'agencia', old.data ->> 'agencia', 'cambios', cambios)
  );
  return new;
end $$;

drop trigger if exists trg_vigilar_liquidacion on public.app_historical_routes;
create trigger trg_vigilar_liquidacion
  before update on public.app_historical_routes
  for each row execute function public.dc_vigilar_liquidacion();

drop trigger if exists trg_vigilar_liquidacion on public.app_routes;
create trigger trg_vigilar_liquidacion
  before update on public.app_routes
  for each row execute function public.dc_vigilar_liquidacion();

-- ════════════════════════════════════════════════════════════════════════
-- 3) Funciones privilegiadas: solo con sesión iniciada
-- ════════════════════════════════════════════════════════════════════════
-- Se quita el permiso de ejecución a "anon" (sin sesión) y a "public". Quien
-- ya podía usarlas con sesión (authenticated) las sigue usando igual. Las que
-- estaban cerradas para la app (p. ej. el respaldo diario) siguen cerradas.
do $$
declare
  f record;
begin
  for f in
    select p.oid, p.oid::regprocedure as firma,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as usuarios_la_usan
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    if f.usuarios_la_usan then
      execute format('grant execute on function %s to authenticated, service_role', f.firma);
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 4) search_path fijo en funciones que no lo tenían
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  f text;
begin
  foreach f in array array['public.route_jornada(text)', 'public.check_route_resources()', 'public.dc_agencia_key(text)',
                           'public.dc_set_agencia_key()', 'public.zr_solo_admin(text, text)'] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public', f);
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 5) ZR: ya no hay sección Usuarios → se cierra la búsqueda de usuarios
-- ════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.zr_buscar_usuarios(text, text)') is not null then
    revoke execute on function public.zr_buscar_usuarios(text, text) from public, anon, authenticated;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Verificación: todo debe decir "SÍ"
-- ════════════════════════════════════════════════════════════════════════
select 'Bitácora de usuarios y permisos' as que,
       case when exists (select 1 from pg_trigger where tgname = 'trg_audit_usuarios' and not tgisinternal) then 'SÍ' else 'NO' end as listo
union all
select 'Vigilancia de liquidaciones cerradas',
       case when (select count(*) from pg_trigger where tgname = 'trg_vigilar_liquidacion' and not tgisinternal) = 2 then 'SÍ' else 'NO' end
union all
select 'Funciones privilegiadas cerradas sin sesión',
       case when not exists (
         select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')) then 'SÍ' else 'NO' end
union all
select 'Modo de liquidaciones cerradas',
       (select case valor when 'si' then 'BLOQUEO activo' else 'Solo alerta (no bloquea)' end
        from public.app_seguridad_config where clave = 'bloquear_cambios_liquidacion');

-- ────────────────────────────────────────────────────────────────────────
-- CONSULTAS ÚTILES (no se ejecutan solas; cópialas cuando las necesites)
--
-- Ver alertas de liquidaciones cerradas cambiadas por no administradores:
--   select fecha, usuario, tabla, detalle from public.app_audit_log
--   where accion = 'ALERTA_LIQUIDACION' order by fecha desc;
--
-- Ver cambios de usuarios y permisos:
--   select fecha, usuario as hecho_por, accion, detalle from public.app_audit_log
--   where tabla = 'app_users' order by fecha desc;
--
-- ACTIVAR el bloqueo (cuando ya no salgan alertas de trabajo normal):
--   update public.app_seguridad_config set valor = 'si', actualizado = now()
--   where clave = 'bloquear_cambios_liquidacion';
--
-- Volver a solo alerta:
--   update public.app_seguridad_config set valor = 'no', actualizado = now()
--   where clave = 'bloquear_cambios_liquidacion';
-- ────────────────────────────────────────────────────────────────────────
