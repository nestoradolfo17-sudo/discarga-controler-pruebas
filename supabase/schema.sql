-- DISCARGA CONTROLER — esquema de base de datos temporal (fase de pruebas)
--
-- Ejecuta este script UNA SOLA VEZ en el SQL Editor de tu proyecto de
-- Supabase (Project → SQL Editor → New query → pega esto → Run).
--
-- Diseño: cada tabla espeja una colección que hoy vive en localStorage
-- (rutas, historial de liquidadas, camiones, personal, usuarios). La columna
-- "data" guarda el objeto completo tal como lo maneja la aplicación (mismo
-- formato que Route/Truck/Staff/AppUser en src/types.ts). Esto es intencional
-- para esta fase de pruebas: es rápido de levantar y no obliga a rediseñar
-- cada campo como columna relacional todavía — eso queda para cuando pasen a
-- producción con el esquema completo ya planeado (roles, RLS por agencia,
-- Supabase Auth). Migrar en ese momento es sencillo porque los datos ya están
-- guardados con el mismo "id" que usa la aplicación.

create table if not exists app_routes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_historical_routes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_trucks (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_staff (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Tiempo real: para que los cambios de un usuario de prueba se vean en las
-- pantallas de los demás sin recargar la página.
alter publication supabase_realtime add table app_routes;
alter publication supabase_realtime add table app_historical_routes;
alter publication supabase_realtime add table app_trucks;
alter publication supabase_realtime add table app_staff;
alter publication supabase_realtime add table app_users;

-- Seguridad TEMPORAL para esta fase de pruebas: se habilita RLS pero con una
-- política abierta (cualquiera con la "anon key" del proyecto puede leer y
-- escribir). Esto es intencional — el objetivo de esta fase es que los
-- usuarios de prueba compartan datos reales, no endurecer la seguridad
-- todavía (la app sigue controlando el acceso con su propio login de
-- usuario/contraseña, igual que antes). Antes de usar esto con datos reales
-- de la empresa hay que reemplazar estas políticas por reglas basadas en
-- Supabase Auth y agencia, como ya estaba planeado para producción.
alter table app_routes enable row level security;
alter table app_historical_routes enable row level security;
alter table app_trucks enable row level security;
alter table app_staff enable row level security;
alter table app_users enable row level security;

create policy "Acceso temporal de pruebas" on app_routes for all using (true) with check (true);
create policy "Acceso temporal de pruebas" on app_historical_routes for all using (true) with check (true);
create policy "Acceso temporal de pruebas" on app_trucks for all using (true) with check (true);
create policy "Acceso temporal de pruebas" on app_staff for all using (true) with check (true);
create policy "Acceso temporal de pruebas" on app_users for all using (true) with check (true);
