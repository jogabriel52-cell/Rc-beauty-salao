-- =============================================================================
-- RC Beauty — Fase 0: modelo de acesso definitivo
--
-- Evolui a migração inicial (20261024000000) para:
--   * perfis de acesso EDITÁVEIS (modelos), em vez de papéis fixos no código;
--   * permissões no formato módulo.ação com ESCOPO ('own' = só o que é seu,
--     'unit' = toda a unidade);
--   * vínculo por unidade com um perfil + exceções individuais com escopo;
--   * gestão de acessos delegável por unidade (permissão access.manage), com:
--       - ninguém altera as próprias permissões;
--       - ninguém concede o que não possui (anti-escalada);
--       - acessos do Admin Geral só são alterados por outro Admin Geral;
--   * MFA obrigatório (aal2) para quem tem perfil marcado com requires_mfa ou é
--     Admin Geral: sem aal2, nenhuma permissão é efetiva;
--   * auditoria de toda concessão de acesso, inclusive de modelos.
--
-- Nomes e e-mails de pessoas NÃO são fixados aqui: o cadastro é feito pela
-- direção na aplicação (convite) e o primeiro Admin Geral pelo BOOTSTRAP.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos e catálogo de permissões
-- -----------------------------------------------------------------------------

create type public.access_scope as enum ('own', 'unit');

alter table public.permissions
  add column module          text,
  add column action          text,
  add column module_label    text,
  add column allowed_scopes  public.access_scope[] not null default '{unit}',
  add column sort_order      integer not null default 0;

-- Os códigos da migração inicial são substituídos por um catálogo por módulo.
-- (Nenhum ambiente compartilhado recebeu a migração inicial.)
delete from public.permissions;

alter table public.permissions
  alter column module set not null,
  alter column action set not null,
  alter column module_label set not null,
  add constraint permissions_code_matches check (code = module || '.' || action),
  add constraint permissions_scopes_not_empty check (cardinality(allowed_scopes) > 0);

insert into public.permissions (code, module, action, module_label, description, allowed_scopes, sort_order) values
  ('access.manage', 'access', 'manage', 'Pessoas e acessos',
   'Cadastrar e convidar pessoas, definir perfis, unidades e exceções na unidade', '{unit}', 900),
  ('audit.view', 'audit', 'view', 'Auditoria',
   'Consultar a trilha de auditoria da unidade', '{unit}', 910);

-- -----------------------------------------------------------------------------
-- 2. Perfis de acesso (modelos editáveis)
-- -----------------------------------------------------------------------------

create table public.access_profiles (
  id            uuid primary key default gen_random_uuid(),
  key           text unique check (key is null or key ~ '^[a-z0-9_]{2,40}$'),
  name          text not null unique check (length(btrim(name)) between 2 and 60),
  description   text check (description is null or length(description) <= 500),
  requires_mfa  boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid
);
comment on table public.access_profiles is
  'Modelos de acesso editáveis. key identifica os modelos iniciais para migrações; o nome é livre.';

create table public.access_profile_permissions (
  profile_id       uuid not null references public.access_profiles (id) on delete cascade,
  permission_code  text not null references public.permissions (code) on delete cascade,
  scope            public.access_scope not null default 'unit',
  created_at       timestamptz not null default now(),
  created_by       uuid,
  primary key (profile_id, permission_code)
);

insert into public.access_profiles (key, name, description, requires_mfa) values
  ('admin_geral', 'Admin Geral', 'Acesso completo a todos os módulos das unidades vinculadas, inclusive gestão de acessos.', true),
  ('direcao', 'Direção', 'Acesso completo aos módulos das unidades vinculadas, inclusive financeiro e gestão de acessos.', true),
  ('gerente', 'Gerente', 'Opera agenda, clientes, comandas, estoque, relatórios e financeiro da unidade.', false),
  ('vendedora', 'Vendedora', 'Atendimento no CRM/WhatsApp e agendamentos.', false),
  ('recepcao', 'Recepção', 'Agenda, cadastro de clientes e comandas.', false),
  ('profissional', 'Profissional', 'Somente a própria agenda e a própria comissão.', false),
  ('somente_leitura', 'Somente leitura', 'Consulta de dados operacionais, sem alterações.', false);

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, p.code, 'unit'
from public.access_profiles ap
cross join public.permissions p
where ap.key in ('admin_geral', 'direcao');

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, 'audit.view', 'unit' from public.access_profiles ap where ap.key = 'gerente';

-- -----------------------------------------------------------------------------
-- 3. Vínculos passam a apontar para um perfil de acesso
-- -----------------------------------------------------------------------------

alter table public.unit_memberships
  add column access_profile_id uuid references public.access_profiles (id) on delete restrict;

update public.unit_memberships m
set access_profile_id = ap.id
from public.access_profiles ap
where ap.key = case m.role
  when 'admin_unidade' then 'gerente'
  when 'recepcao' then 'recepcao'
  when 'profissional' then 'profissional'
  when 'somente_leitura' then 'somente_leitura'
end;

alter table public.unit_memberships
  alter column access_profile_id set not null,
  drop column role;

create index unit_memberships_profile_idx on public.unit_memberships (access_profile_id);

drop table public.role_permissions;
drop type public.app_role;

-- Exceções individuais ganham escopo (para concessões).
alter table public.membership_permission_overrides
  add column scope public.access_scope,
  add constraint overrides_scope_for_grant check (
    (effect = 'grant' and scope is not null) or (effect = 'revoke' and scope is null)
  );

-- Perfil da pessoa: cargo livre (ex.: cabeleireira, manicure, lash designer).
alter table public.profiles
  add column job_title text check (job_title is null or length(btrim(job_title)) between 2 and 80);

-- -----------------------------------------------------------------------------
-- 4. Funções de autorização
-- -----------------------------------------------------------------------------

-- Nível de autenticação da sessão atual ('aal1' senha, 'aal2' senha + MFA).
create or replace function public.current_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1');
$$;

create or replace function public.mfa_required_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id)
      or exists (
        select 1
        from public.unit_memberships m
        join public.access_profiles ap on ap.id = m.access_profile_id
        where m.user_id = p_user_id and m.active and ap.requires_mfa
      );
$$;

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_aal() = 'aal2'
      or not public.mfa_required_for((select auth.uid()));
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join public.profiles p on p.id = pa.user_id
    where pa.user_id = (select auth.uid())
      and p.active
  ) and public.current_aal() = 'aal2';
$$;

-- Escopo efetivo de uma permissão para o usuário atual na unidade:
-- revogação individual > maior escopo entre perfil e concessão individual.
create or replace function public.permission_scope(p_unit_id uuid, p_permission text)
returns public.access_scope
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select m.id, m.access_profile_id
    from public.unit_memberships m
    join public.profiles p on p.id = m.user_id and p.active
    join public.units u on u.id = m.unit_id and u.active
    where m.user_id = (select auth.uid())
      and m.unit_id = p_unit_id
      and m.active
      and public.mfa_satisfied()
  ),
  o as (
    select o.effect, o.scope
    from public.membership_permission_overrides o
    join m on m.id = o.membership_id
    where o.permission_code = p_permission
  ),
  t as (
    select app.scope
    from public.access_profile_permissions app
    join m on m.access_profile_id = app.profile_id
    where app.permission_code = p_permission
  )
  select case
    when exists (select 1 from o where o.effect = 'revoke') then null
    else (select max(s) from (
            select o.scope as s from o where o.effect = 'grant'
            union all
            select t.scope from t
          ) x)
  end;
$$;

create or replace function public.has_permission(p_unit_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.permission_scope(p_unit_id, p_permission) is not null;
$$;

create or replace function public.has_unit_scope(p_unit_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.permission_scope(p_unit_id, p_permission) = 'unit', false);
$$;

-- Permissão em escopo de unidade em TODAS as unidades ativas (operações que
-- afetam mais de uma unidade, como editar um modelo de acesso).
create or replace function public.has_permission_all_units(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.units where active)
     and not exists (
       select 1 from public.units u
       where u.active and public.permission_scope(u.id, p_permission) is distinct from 'unit'
     );
$$;

create or replace function public.can_manage_access(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or public.has_unit_scope(p_unit_id, 'access.manage');
$$;

create or replace function public.can_manage_any_unit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (select 1 from public.units u where u.active and public.has_unit_scope(u.id, 'access.manage'));
$$;

create or replace function public.can_manage_templates()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or public.has_permission_all_units('access.manage');
$$;

-- O ator cobre (permissão, escopo) na unidade? Base da regra anti-escalada.
create or replace function public.actor_covers(p_unit_id uuid, p_permission text, p_scope public.access_scope)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or coalesce(public.permission_scope(p_unit_id, p_permission) >= p_scope, false);
$$;

create or replace function public.is_target_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = p_user_id);
$$;

-- Compartilha alguma unidade ativa com o usuário atual (para exibir nomes de
-- colegas em agenda e comandas, sem expor e-mail).
create or replace function public.shares_unit_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_memberships mine
    join public.unit_memberships theirs on theirs.unit_id = mine.unit_id and theirs.active
    where mine.user_id = (select auth.uid()) and mine.active
      and theirs.user_id = p_user_id
  ) and public.mfa_satisfied();
$$;

drop function public.my_permissions(uuid);
create function public.my_permissions(p_unit_id uuid)
returns table (code text, scope public.access_scope)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, public.permission_scope(p_unit_id, p.code)
  from public.permissions p
  where public.permission_scope(p_unit_id, p.code) is not null
  order by p.sort_order, p.code;
$$;

-- Resumo do acesso do usuário atual para a interface. Funciona com aal1 para
-- que a aplicação saiba quando exigir MFA.
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'full_name', p.full_name,
    'active', p.active,
    'is_platform_admin', exists (select 1 from public.platform_admins pa where pa.user_id = p.id),
    'mfa_required', public.mfa_required_for(p.id),
    'aal', public.current_aal(),
    'can_manage_templates', public.can_manage_templates(),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unit_id', u.id,
               'code', u.code,
               'name', u.name,
               'access_profile', ap.name,
               'permissions', coalesce((
                 select jsonb_object_agg(mp.code, mp.scope) from public.my_permissions(u.id) mp
               ), '{}'::jsonb)
             ) order by u.name)
      from public.unit_memberships m
      join public.units u on u.id = m.unit_id and u.active
      join public.access_profiles ap on ap.id = m.access_profile_id
      where m.user_id = p.id and m.active
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 5. Gatilhos de proteção do modelo de acesso
-- -----------------------------------------------------------------------------

-- Vínculos: ninguém mexe no próprio; Admin Geral só por Admin Geral;
-- anti-escalada: o perfil atribuído precisa estar contido nas permissões do ator.
create or replace function public.tg_memberships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_missing text;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id de um vínculo não pode ser alterado' using errcode = '42501';
  end if;

  if public.is_server_context() then
    return new;
  end if;

  if new.user_id = (select auth.uid()) then
    raise exception 'Ninguém pode alterar os próprios acessos' using errcode = '42501';
  end if;
  if public.is_target_platform_admin(new.user_id) and not public.is_platform_admin() then
    raise exception 'Acessos do Admin Geral só podem ser alterados por outro Admin Geral'
      using errcode = '42501';
  end if;

  if new.active and (tg_op = 'INSERT'
                     or new.access_profile_id is distinct from old.access_profile_id
                     or not old.active) then
    select string_agg(app.permission_code, ', ') into v_missing
    from public.access_profile_permissions app
    where app.profile_id = new.access_profile_id
      and not public.actor_covers(new.unit_id, app.permission_code, app.scope);
    if v_missing is not null then
      raise exception 'Você não pode conceder permissões que não possui: %', v_missing
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger unit_memberships_guard on public.unit_memberships;
create trigger unit_memberships_guard before insert or update on public.unit_memberships
  for each row execute function public.tg_memberships_guard();

create or replace function public.tg_overrides_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row record := case when tg_op = 'DELETE' then old else new end;
  v_member record;
begin
  if tg_op = 'UPDATE' and (new.membership_id, new.permission_code)
                          is distinct from (old.membership_id, old.permission_code) then
    raise exception 'Exceção não pode trocar de vínculo ou permissão; remova e crie outra'
      using errcode = '42501';
  end if;

  if public.is_server_context() then
    return v_row;
  end if;

  select m.user_id, m.unit_id into v_member
  from public.unit_memberships m where m.id = v_row.membership_id;

  if v_member.user_id = (select auth.uid()) then
    raise exception 'Ninguém pode alterar as próprias permissões' using errcode = '42501';
  end if;
  if public.is_target_platform_admin(v_member.user_id) and not public.is_platform_admin() then
    raise exception 'Acessos do Admin Geral só podem ser alterados por outro Admin Geral'
      using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and new.effect = 'grant' then
    if not exists (select 1 from public.permissions p
                   where p.code = new.permission_code and new.scope = any (p.allowed_scopes)) then
      raise exception 'Escopo % não permitido para %', new.scope, new.permission_code
        using errcode = '23514';
    end if;
    if not public.actor_covers(v_member.unit_id, new.permission_code, new.scope) then
      raise exception 'Você não pode conceder permissões que não possui: %', new.permission_code
        using errcode = '42501';
    end if;
  end if;
  return v_row;
end;
$$;

create trigger overrides_guard before insert or update or delete on public.membership_permission_overrides
  for each row execute function public.tg_overrides_guard();

-- Modelos: quem tem o modelo não o edita (alteraria as próprias permissões);
-- modelos usados por Admin Geral só por Admin Geral; anti-escalada em todas as
-- unidades ativas; modelo em uso não pode ser desativado.
-- Consultas auxiliares SEM RLS para os gatilhos (que rodam como o chamador).
create or replace function public.actor_holds_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.unit_memberships m
                 where m.access_profile_id = p_profile_id and m.active
                   and m.user_id = (select auth.uid()));
$$;

create or replace function public.profile_used_by_platform_admin(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.unit_memberships m
                 join public.platform_admins pa on pa.user_id = m.user_id
                 where m.access_profile_id = p_profile_id and m.active);
$$;

create or replace function public.profile_in_use(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.unit_memberships m
                 where m.access_profile_id = p_profile_id and m.active);
$$;

create or replace function public.tg_templates_guard_common(p_profile_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if public.actor_holds_profile(p_profile_id) then
    raise exception 'Ninguém pode alterar o perfil de acesso que possui' using errcode = '42501';
  end if;
  if not public.is_platform_admin() and public.profile_used_by_platform_admin(p_profile_id) then
    raise exception 'Perfis usados pelo Admin Geral só podem ser alterados por outro Admin Geral'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.tg_access_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_server_context() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    perform public.tg_templates_guard_common(new.id);
    if new.key is distinct from old.key then
      raise exception 'A chave interna do perfil não pode ser alterada' using errcode = '42501';
    end if;
    if old.active and not new.active and public.profile_in_use(new.id) then
      raise exception 'Perfil em uso não pode ser desativado; mova as pessoas para outro perfil'
        using errcode = '23514';
    end if;
  elsif new.key is not null then
    raise exception 'Chave interna é reservada aos perfis iniciais' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger access_profiles_stamp before insert or update on public.access_profiles
  for each row execute function public.tg_stamp();
create trigger access_profiles_guard before insert or update on public.access_profiles
  for each row execute function public.tg_access_profiles_guard();

create or replace function public.tg_access_profile_permissions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row record := case when tg_op = 'DELETE' then old else new end;
  v_unit record;
begin
  if tg_op = 'UPDATE' and (new.profile_id, new.permission_code)
                          is distinct from (old.profile_id, old.permission_code) then
    raise exception 'Use remover e adicionar para trocar a permissão' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and not exists (
       select 1 from public.permissions p
       where p.code = new.permission_code and new.scope = any (p.allowed_scopes)) then
    raise exception 'Escopo % não permitido para %', new.scope, new.permission_code
      using errcode = '23514';
  end if;

  if public.is_server_context() then
    return v_row;
  end if;

  perform public.tg_templates_guard_common(v_row.profile_id);

  if tg_op <> 'DELETE' then
    for v_unit in select id from public.units where active loop
      if not public.actor_covers(v_unit.id, new.permission_code, new.scope) then
        raise exception 'Você não pode conceder permissões que não possui: %', new.permission_code
          using errcode = '42501';
      end if;
    end loop;
  end if;
  return v_row;
end;
$$;

create trigger access_profile_permissions_stamp before insert or update on public.access_profile_permissions
  for each row execute function public.tg_stamp();
create trigger access_profile_permissions_guard before insert or update or delete on public.access_profile_permissions
  for each row execute function public.tg_access_profile_permissions_guard();

-- Perfis de pessoa: ativação/desativação exige gestão de acesso em todas as
-- unidades em que a pessoa tem vínculo ativo; ninguém se desativa; Admin Geral
-- só por Admin Geral; último Admin Geral ativo protegido.
-- O ator gere TODAS as unidades em que a pessoa tem vínculo ativo?
-- (sem RLS: a checagem precisa enxergar vínculos de unidades que o ator não gere)
create or replace function public.actor_manages_person(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or (
    exists (select 1 from public.unit_memberships m where m.user_id = p_user_id)
    and not exists (select 1 from public.unit_memberships m
                    where m.user_id = p_user_id and m.active
                      and not public.can_manage_access(m.unit_id)));
$$;

create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active is distinct from old.active and not public.is_server_context() then
    if new.id = (select auth.uid()) then
      raise exception 'Ninguém pode ativar ou desativar a si mesmo' using errcode = '42501';
    end if;
    if public.is_target_platform_admin(new.id) and not public.is_platform_admin() then
      raise exception 'Somente o Admin Geral pode ativar ou desativar outro Admin Geral'
        using errcode = '42501';
    end if;
    if not public.actor_manages_person(new.id) then
      raise exception 'É preciso gerir os acessos de todas as unidades da pessoa para ativá-la ou desativá-la'
        using errcode = '42501';
    end if;
  end if;

  if (new.full_name, new.job_title) is distinct from (old.full_name, old.job_title)
     and new.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
     and not public.is_server_context()
     and not public.is_platform_admin()
     and public.is_target_platform_admin(new.id) then
    raise exception 'Somente o Admin Geral pode editar outro Admin Geral' using errcode = '42501';
  end if;

  if new.active = false and old.active = true
     and public.is_target_platform_admin(new.id)
     and (
       select count(*) from public.platform_admins pa
       join public.profiles p on p.id = pa.user_id
       where p.active and pa.user_id <> new.id
     ) = 0 then
    raise exception 'Não é possível desativar o último Admin Geral ativo' using errcode = '42501';
  end if;

  if new.active then
    new.deactivated_at := null;
    new.deactivation_reason := null;
  elsif old.active then
    new.deactivated_at := now();
  else
    new.deactivated_at := old.deactivated_at;
  end if;
  return new;
end;
$$;

-- Auditoria passa a cobrir os modelos de acesso.
create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_unit uuid;
  v_record text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  v_unit := nullif(v_row ->> 'unit_id', '')::uuid;
  v_record := coalesce(
    v_row ->> 'id',
    case when v_row ? 'profile_id' then (v_row ->> 'profile_id') || ':' || (v_row ->> 'permission_code') end,
    case when v_row ? 'membership_id' then (v_row ->> 'membership_id') || ':' || (v_row ->> 'permission_code') end,
    v_row ->> 'user_id',
    v_row ->> 'code');

  if tg_table_name = 'membership_permission_overrides' then
    select m.unit_id into v_unit
    from public.unit_memberships m
    where m.id = (v_row ->> 'membership_id')::uuid;
  elsif tg_table_name = 'units' then
    v_unit := (v_row ->> 'id')::uuid;
  end if;

  insert into public.audit_log (actor_id, unit_id, table_name, record_id, action, old_data, new_data)
  values (public.current_actor_id(), v_unit, tg_table_name, v_record, tg_op, v_old, v_new);
  return null;
end;
$$;

create trigger access_profiles_audit after insert or update or delete on public.access_profiles
  for each row execute function public.tg_audit();
create trigger access_profile_permissions_audit after insert or update or delete on public.access_profile_permissions
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- 6. Políticas RLS do modelo de acesso
-- -----------------------------------------------------------------------------

alter table public.access_profiles enable row level security;
alter table public.access_profile_permissions enable row level security;

drop policy units_select on public.units;
create policy units_select on public.units for select to authenticated
  using ((select public.is_platform_admin()) or (public.is_unit_member(id) and (select public.mfa_satisfied())));

drop policy profiles_select on public.profiles;
drop policy profiles_insert on public.profiles;
drop policy profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_platform_admin())
    or public.shares_unit_with(id)
    or exists (select 1 from public.unit_memberships m
               where m.user_id = profiles.id and public.can_manage_access(m.unit_id))
  );
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select public.can_manage_any_unit()));
create policy profiles_update on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_platform_admin())
    or exists (select 1 from public.unit_memberships m
               where m.user_id = profiles.id and public.can_manage_access(m.unit_id))
  )
  with check (true);

drop policy memberships_select on public.unit_memberships;
drop policy memberships_insert on public.unit_memberships;
drop policy memberships_update on public.unit_memberships;
create policy memberships_select on public.unit_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_access(unit_id));
create policy memberships_insert on public.unit_memberships for insert to authenticated
  with check (public.can_manage_access(unit_id));
create policy memberships_update on public.unit_memberships for update to authenticated
  using (public.can_manage_access(unit_id))
  with check (public.can_manage_access(unit_id));

drop policy overrides_select on public.membership_permission_overrides;
drop policy overrides_insert on public.membership_permission_overrides;
drop policy overrides_update on public.membership_permission_overrides;
drop policy overrides_delete on public.membership_permission_overrides;
create policy overrides_select on public.membership_permission_overrides for select to authenticated
  using (exists (
    select 1 from public.unit_memberships m
    where m.id = membership_id
      and (m.user_id = (select auth.uid()) or public.can_manage_access(m.unit_id))
  ));
create policy overrides_insert on public.membership_permission_overrides for insert to authenticated
  with check (exists (select 1 from public.unit_memberships m
                      where m.id = membership_id and public.can_manage_access(m.unit_id)));
create policy overrides_update on public.membership_permission_overrides for update to authenticated
  using (exists (select 1 from public.unit_memberships m
                 where m.id = membership_id and public.can_manage_access(m.unit_id)))
  with check (exists (select 1 from public.unit_memberships m
                      where m.id = membership_id and public.can_manage_access(m.unit_id)));
create policy overrides_delete on public.membership_permission_overrides for delete to authenticated
  using (exists (select 1 from public.unit_memberships m
                 where m.id = membership_id and public.can_manage_access(m.unit_id)));

create policy access_profiles_select on public.access_profiles for select to authenticated
  using (true);
create policy access_profiles_insert on public.access_profiles for insert to authenticated
  with check ((select public.can_manage_templates()));
create policy access_profiles_update on public.access_profiles for update to authenticated
  using ((select public.can_manage_templates()))
  with check ((select public.can_manage_templates()));

create policy access_profile_permissions_select on public.access_profile_permissions for select to authenticated
  using (true);
create policy access_profile_permissions_insert on public.access_profile_permissions for insert to authenticated
  with check ((select public.can_manage_templates()));
create policy access_profile_permissions_update on public.access_profile_permissions for update to authenticated
  using ((select public.can_manage_templates()))
  with check ((select public.can_manage_templates()));
create policy access_profile_permissions_delete on public.access_profile_permissions for delete to authenticated
  using ((select public.can_manage_templates()));

-- Auditoria: Admin Geral; audit.view na unidade; registros sem unidade
-- (modelos de acesso) para quem tem audit.view em todas as unidades.
drop policy audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (
    (select public.is_platform_admin())
    or (unit_id is not null and public.has_permission(unit_id, 'audit.view'))
    or (unit_id is null and (select public.has_permission_all_units('audit.view')))
  );

-- -----------------------------------------------------------------------------
-- 7. Funções administrativas
-- -----------------------------------------------------------------------------

-- Lista de pessoas visíveis para quem gere acessos, com e-mail, status de MFA e
-- vínculos. Só retorna pessoas com vínculo em unidade que o ator gere
-- (ou todas, para o Admin Geral).
create or replace function public.admin_list_people()
returns table (
  user_id          uuid,
  full_name        text,
  job_title        text,
  email            text,
  active           boolean,
  deactivated_at   timestamptz,
  deactivation_reason text,
  is_platform_admin boolean,
  mfa_enabled      boolean,
  last_sign_in_at  timestamptz,
  invited_at       timestamptz,
  memberships      jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.job_title, u.email::text, p.active, p.deactivated_at, p.deactivation_reason,
         exists (select 1 from public.platform_admins pa where pa.user_id = p.id),
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status::text = 'verified'),
         u.last_sign_in_at, u.invited_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'membership_id', m.id,
                    'unit_id', m.unit_id,
                    'unit_name', un.name,
                    'access_profile_id', m.access_profile_id,
                    'access_profile_name', ap.name,
                    'active', m.active,
                    'can_manage', public.can_manage_access(m.unit_id),
                    'overrides', coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'permission_code', o.permission_code,
                               'effect', o.effect,
                               'scope', o.scope,
                               'reason', o.reason) order by o.permission_code)
                      from public.membership_permission_overrides o
                      where o.membership_id = m.id), '[]'::jsonb)
                  ) order by un.name)
           from public.unit_memberships m
           join public.units un on un.id = m.unit_id
           join public.access_profiles ap on ap.id = m.access_profile_id
           where m.user_id = p.id
             and public.can_manage_access(m.unit_id)
         ), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_platform_admin()
     or exists (select 1 from public.unit_memberships m
                where m.user_id = p.id and public.can_manage_access(m.unit_id))
  order by p.full_name;
$$;

create or replace function public.profile_exists(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id);
$$;

-- Cria perfil e vínculos de uma pessoa recém-convidada. SECURITY INVOKER:
-- roda com o JWT do chamador, então RLS, anti-escalada e auditoria valem.
create or replace function public.admin_provision_person(
  p_user_id uuid,
  p_full_name text,
  p_job_title text,
  p_memberships jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_memberships) <> 'array' or jsonb_array_length(p_memberships) = 0 then
    raise exception 'Informe ao menos uma unidade' using errcode = '22023';
  end if;

  -- ON CONFLICT aplicaria a política de SELECT à linha nova (ainda sem vínculo);
  -- por isso a existência é verificada antes.
  if not public.profile_exists(p_user_id) then
    insert into public.profiles (id, full_name, job_title)
    values (p_user_id, p_full_name, nullif(btrim(coalesce(p_job_title, '')), ''));
  end if;

  for v_item in select * from jsonb_array_elements(p_memberships) loop
    insert into public.unit_memberships (user_id, unit_id, access_profile_id)
    values (p_user_id, (v_item ->> 'unit_id')::uuid, (v_item ->> 'access_profile_id')::uuid)
    on conflict (user_id, unit_id) do nothing;
  end loop;
  return p_user_id;
end;
$$;

-- Busca de usuário do Auth por e-mail, apenas para funções de servidor.
create or replace function public.admin_find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 8. Privilégios
-- -----------------------------------------------------------------------------

revoke all on public.access_profiles, public.access_profile_permissions from anon, authenticated;

grant select on public.access_profiles to authenticated;
grant insert (name, description, requires_mfa, active) on public.access_profiles to authenticated;
grant update (name, description, requires_mfa, active) on public.access_profiles to authenticated;

grant select, delete on public.access_profile_permissions to authenticated;
grant insert (profile_id, permission_code, scope) on public.access_profile_permissions to authenticated;
grant update (scope) on public.access_profile_permissions to authenticated;

grant insert (user_id, unit_id, access_profile_id, active) on public.unit_memberships to authenticated;
grant update (access_profile_id, active) on public.unit_memberships to authenticated;

grant insert (membership_id, permission_code, effect, scope, reason)
  on public.membership_permission_overrides to authenticated;
grant update (effect, scope, reason) on public.membership_permission_overrides to authenticated;

grant insert (job_title) on public.profiles to authenticated;
grant update (job_title) on public.profiles to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.current_actor_id(),
  public.is_server_context(),
  public.current_aal(),
  public.mfa_required_for(uuid),
  public.mfa_satisfied(),
  public.is_platform_admin(),
  public.permission_scope(uuid, text),
  public.has_permission(uuid, text),
  public.has_unit_scope(uuid, text),
  public.has_permission_all_units(text),
  public.can_manage_access(uuid),
  public.can_manage_any_unit(),
  public.can_manage_templates(),
  public.actor_covers(uuid, text, public.access_scope),
  public.is_target_platform_admin(uuid),
  public.shares_unit_with(uuid),
  public.is_unit_member(uuid),
  public.is_own_professional(uuid),
  public.my_permissions(uuid),
  public.my_access(),
  public.admin_list_people(),
  public.admin_provision_person(uuid, text, text, jsonb),
  public.profile_exists(uuid),
  public.actor_manages_person(uuid),
  public.tg_templates_guard_common(uuid),
  public.actor_holds_profile(uuid),
  public.profile_used_by_platform_admin(uuid),
  public.profile_in_use(uuid)
to authenticated;

grant execute on function public.admin_find_user_id_by_email(text) to service_role;
