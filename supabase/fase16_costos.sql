-- DISCARGA CONTROLER — Fase 16: Costos (tarifario mensual y standby diario)
-- Copia TODO este texto en Supabase → SQL Editor → New query → Run.
-- NO borra ni cambia rutas, camiones, personal ni usuarios. Seguro de repetir.
--
-- Qué hace:
--  1) app_costos: tarifario de cada mes (tarifa por viaje, standby de personal
--     y de camiones) y los costos asignados a mano a viajes con camión rentado.
--     SOLO administradores pueden verla y cambiarla.
--  2) app_standby_dia: una fila por día y agencia con los camiones y el personal
--     que no salieron y su motivo (la app la llena sola mientras se trabaja).
--     La escriben los usuarios de esa agencia; la leen ellos y los administradores.
--     No contiene montos.

-- Ayudantes propios de esta fase.
create or replace function public.dc16_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users u where u.id = auth.uid() and u.activo and u.is_admin);
$$;
create or replace function public.dc16_ve_agencia(ag text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo
      and (u.is_admin
           or to_jsonb(u) -> 'agency_access' = '"all"'::jsonb
           or (jsonb_typeof(to_jsonb(u) -> 'agency_access') = 'array' and (to_jsonb(u) -> 'agency_access') ? ag))
  );
$$;
revoke execute on function public.dc16_es_admin(), public.dc16_ve_agencia(text) from public, anon;
grant execute on function public.dc16_es_admin(), public.dc16_ve_agencia(text) to authenticated;

-- 1) Tarifarios y costos manuales (solo administradores)
create table if not exists public.app_costos (
  id             text primary key,
  tipo           text not null check (tipo in ('tarifario', 'manual')),
  mes            text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  data           jsonb not null default '{}'::jsonb,
  actualizado_por text,
  actualizado_el timestamptz not null default now()
);
create index if not exists app_costos_tipo_mes on public.app_costos (tipo, mes);
alter table public.app_costos enable row level security;

drop policy if exists "Costos ver" on public.app_costos;
drop policy if exists "Costos crear" on public.app_costos;
drop policy if exists "Costos editar" on public.app_costos;
drop policy if exists "Costos eliminar" on public.app_costos;
create policy "Costos ver" on public.app_costos for select to authenticated using (public.dc16_es_admin());
create policy "Costos crear" on public.app_costos for insert to authenticated with check (public.dc16_es_admin());
create policy "Costos editar" on public.app_costos for update to authenticated using (public.dc16_es_admin()) with check (public.dc16_es_admin());
create policy "Costos eliminar" on public.app_costos for delete to authenticated using (public.dc16_es_admin());
revoke all on public.app_costos from anon;
grant select, insert, update, delete on public.app_costos to authenticated;

-- 2) Foto diaria de recursos sin salir (standby)
create table if not exists public.app_standby_dia (
  id              text primary key,          -- 'AAAA-MM-DD|Agencia'
  fecha           date not null,
  agencia         text not null,
  data            jsonb not null default '{}'::jsonb,
  actualizado_por text,
  actualizado_el  timestamptz not null default now()
);
create index if not exists app_standby_dia_fecha on public.app_standby_dia (fecha);
alter table public.app_standby_dia enable row level security;

drop policy if exists "Standby ver" on public.app_standby_dia;
drop policy if exists "Standby crear" on public.app_standby_dia;
drop policy if exists "Standby editar" on public.app_standby_dia;
drop policy if exists "Standby eliminar" on public.app_standby_dia;
create policy "Standby ver" on public.app_standby_dia for select to authenticated using (public.dc16_ve_agencia(agencia));
create policy "Standby crear" on public.app_standby_dia for insert to authenticated with check (public.dc16_ve_agencia(agencia));
create policy "Standby editar" on public.app_standby_dia for update to authenticated
  using (public.dc16_ve_agencia(agencia)) with check (public.dc16_ve_agencia(agencia));
create policy "Standby eliminar" on public.app_standby_dia for delete to authenticated using (public.dc16_es_admin());
revoke all on public.app_standby_dia from anon;
grant select, insert, update, delete on public.app_standby_dia to authenticated;

-- Usuarios de solo consulta (Fase 14): no escriben standby.
do $$
begin
  if to_regprocedure('public.dc_solo_lectura()') is not null then
    execute 'drop policy if exists "Standby solo lectura" on public.app_standby_dia';
    execute 'create policy "Standby solo lectura" on public.app_standby_dia as restrictive for insert to authenticated with check (not public.dc_solo_lectura())';
    execute 'drop policy if exists "Standby solo lectura upd" on public.app_standby_dia';
    execute 'create policy "Standby solo lectura upd" on public.app_standby_dia as restrictive for update to authenticated using (not public.dc_solo_lectura())';
  end if;
end $$;

-- Verificación: debe devolver 2 filas.
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('app_costos', 'app_standby_dia');
