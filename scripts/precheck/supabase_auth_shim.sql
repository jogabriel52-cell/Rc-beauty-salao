-- =============================================================================
-- SOMENTE PARA PRÉ-CHECAGEM EM POSTGRESQL PURO. NUNCA APLICAR NO SUPABASE.
--
-- Simula o mínimo do ambiente Supabase que a migração da Fase 1 usa:
-- roles da API, schema auth com auth.users e auth.uid(), e os privilégios
-- padrão amplos que o Supabase concede no schema public. Não substitui o teste
-- na stack local oficial (`supabase start`) nem no projeto de desenvolvimento.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id               uuid primary key default gen_random_uuid(),
  email            text unique,
  invited_at       timestamptz,
  last_sign_in_at  timestamptz,
  banned_until     timestamptz
);

create table if not exists auth.mfa_factors (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  status   text not null default 'unverified'
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Privilégios padrão equivalentes aos do Supabase: tudo exposto às roles da
-- API. A migração precisa revogar isso explicitamente.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
