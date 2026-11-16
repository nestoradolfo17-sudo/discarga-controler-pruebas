-- DISCARGA CONTROLER — Fase 17: rendimiento de lectura (permisos por agencia)
-- Copia TODO este texto en Supabase → SQL Editor → New query → Run.
-- NO borra ni cambia rutas, camiones, personal ni usuarios. Seguro de repetir.
--
-- Qué hace: las reglas "Ver / Crear / Editar por agencia" de Rutas, Historial,
-- Camiones y Personal revisaban los permisos del usuario UNA VEZ POR CADA FILA
-- (miles de consultas a app_users en cada carga y en cada cambio en vivo).
-- Ahora los permisos del usuario se leen UNA SOLA VEZ por consulta.
-- Quién ve qué queda EXACTAMENTE igual que antes:
--   administrador o acceso "all" → todas; si no, solo sus agencias; registros
--   sin agencia siguen visibles.

begin;

-- ¿Ve todas las agencias? (administrador activo o acceso "all")
create or replace function public.dc17_ve_todas()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo and (u.is_admin or u.agency_access = '"all"'::jsonb)
  );
$$;

-- Lista de agencias del usuario activo (vacía si no tiene).
create or replace function public.dc17_mis_agencias()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((
    select array_agg(x)
    from public.app_users u, jsonb_array_elements_text(
      case when jsonb_typeof(u.agency_access) = 'array' then u.agency_access else '[]'::jsonb end) x
    where u.id = auth.uid() and u.activo
  ), '{}'::text[]);
$$;

revoke execute on function public.dc17_ve_todas(), public.dc17_mis_agencias() from public, anon;
grant execute on function public.dc17_ve_todas(), public.dc17_mis_agencias() to authenticated;

do $$
declare
  t text;
  cond text := '(select public.is_app_user()) and ((select public.dc17_ve_todas()) or coalesce(data->>''agencia'', '''') = '''' or (data->>''agencia'') = any ((select public.dc17_mis_agencias())::text[]))';
begin
  foreach t in array array['app_routes','app_historical_routes','app_trucks','app_staff'] loop
    execute format('drop policy if exists "Ver por agencia" on public.%I', t);
    execute format('drop policy if exists "Crear por agencia" on public.%I', t);
    execute format('drop policy if exists "Editar por agencia" on public.%I', t);
    execute format('create policy "Ver por agencia" on public.%I for select to authenticated using (%s)', t, cond);
    execute format('create policy "Crear por agencia" on public.%I for insert to authenticated with check (%s)', t, cond);
    execute format('create policy "Editar por agencia" on public.%I for update to authenticated using (%s) with check (%s)', t, cond, cond);
  end loop;
end $$;

commit;

-- Verificación: debe devolver 12 filas (3 reglas × 4 tablas).
select tablename, policyname, cmd from pg_policies
where schemaname = 'public'
  and tablename in ('app_routes','app_historical_routes','app_trucks','app_staff')
  and policyname in ('Ver por agencia','Crear por agencia','Editar por agencia')
order by tablename, policyname;
