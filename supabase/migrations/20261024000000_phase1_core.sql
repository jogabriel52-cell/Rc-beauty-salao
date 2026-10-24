-- =============================================================================
-- RC Beauty — Fase 1: núcleo operacional
--
-- Conteúdo: unidades, perfis, Admin Geral, papéis-base, permissões,
-- vínculos por unidade com exceções individuais, profissionais, serviços,
-- clientes, agendamentos e trilha de auditoria.
--
-- Fora desta migração (cada item exige projeto e revisão próprios):
-- financeiro, comissões, WhatsApp, integrações bancárias, staging de
-- importação Trinks, horários de funcionamento e bloqueios de agenda.
--
-- Princípios:
--   * RLS habilitado em TODAS as tabelas; nada é liberado para `anon`.
--   * Privilégios concedidos explicitamente a `authenticated`, por operação.
--   * Funções SECURITY DEFINER com `search_path = ''` e nomes qualificados.
--   * Sem DELETE para usuários da aplicação: registros são arquivados,
--     cancelados ou desativados.
--   * O Admin Geral administra usuários e vínculos, mas o acesso a dados
--     operacionais de uma unidade exige vínculo explícito com ela.
-- =============================================================================

-- Extensões ------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- Tipos ----------------------------------------------------------------------
create type public.app_role as enum (
  'admin_unidade',
  'recepcao',
  'profissional',
  'somente_leitura'
);

create type public.permission_effect as enum ('grant', 'revoke');

create type public.appointment_status as enum (
  'agendado',
  'confirmado',
  'concluido',
  'cancelado',
  'nao_compareceu'
);

-- =============================================================================
-- Tabelas de identidade e acesso
-- =============================================================================

create table public.units (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
  name        text not null check (length(btrim(name)) between 2 and 120),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.units is
  'Unidades de negócio. Dados operacionais são sempre isolados por unidade.';

-- Perfil de aplicação para cada usuário do Auth. Um usuário do Auth sem perfil
-- ativo não tem acesso a nada. Usuários não são excluídos: são desativados.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  full_name   text not null check (length(btrim(full_name)) between 2 and 160),
  active      boolean not null default true,
  deactivated_at       timestamptz,
  deactivation_reason  text check (deactivation_reason is null
                                   or length(btrim(deactivation_reason)) between 3 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (active or deactivation_reason is not null)
);

-- Admin Geral: administra unidades, usuários, vínculos e exceções.
-- Escrita somente pelo administrador do banco (ver supabase/BOOTSTRAP.md).
create table public.platform_admins (
  user_id     uuid primary key references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

-- Catálogo de permissões (somente leitura para a aplicação).
create table public.permissions (
  code        text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role             public.app_role not null,
  permission_code  text not null references public.permissions (code) on delete cascade,
  primary key (role, permission_code)
);

-- Vínculo explícito usuário × unidade, com um papel-base.
create table public.unit_memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete restrict,
  unit_id     uuid not null references public.units (id) on delete restrict,
  role        public.app_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (user_id, unit_id)
);
create index unit_memberships_unit_idx on public.unit_memberships (unit_id);

-- Exceções individuais sobre o papel-base: concede ou revoga uma permissão
-- para um vínculo específico. Uma permissão tem no máximo um efeito por vínculo.
create table public.membership_permission_overrides (
  membership_id    uuid not null references public.unit_memberships (id) on delete cascade,
  permission_code  text not null references public.permissions (code) on delete cascade,
  effect           public.permission_effect not null,
  reason           text not null check (length(btrim(reason)) between 3 and 500),
  created_at       timestamptz not null default now(),
  created_by       uuid,
  primary key (membership_id, permission_code)
);

-- =============================================================================
-- Tabelas operacionais (todas com unit_id obrigatório)
-- =============================================================================

create table public.professionals (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete restrict,
  user_id       uuid references public.profiles (id) on delete restrict,
  display_name  text not null check (length(btrim(display_name)) between 2 and 120),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  unique (id, unit_id),
  unique (unit_id, user_id)
);

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.units (id) on delete restrict,
  name              text not null check (length(btrim(name)) between 2 and 120),
  duration_minutes  integer not null check (duration_minutes between 5 and 720),
  price_cents       integer check (price_cents is null or price_cents >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  unique (id, unit_id)
);
create unique index services_unit_name_uidx
  on public.services (unit_id, lower(name)) where active;

-- Clientes pertencem a uma unidade. A mesma pessoa atendida na RC Beauty Geral
-- e na Sala VIP tem dois cadastros independentes nesta fase.
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete restrict,
  full_name     text not null check (length(btrim(full_name)) between 2 and 160),
  phone         text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  birth_date    date check (birth_date is null or birth_date > date '1900-01-01'),
  notes         text check (notes is null or length(notes) <= 2000),
  source        text not null default 'manual' check (source in ('manual', 'trinks_csv')),
  external_ref  text check (external_ref is null or length(external_ref) <= 120),
  archived_at   timestamptz,
  archived_by   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  unique (id, unit_id)
);
create index clients_unit_name_idx on public.clients (unit_id, lower(full_name));
create index clients_unit_phone_idx on public.clients (unit_id, phone) where phone is not null;
create unique index clients_external_ref_uidx
  on public.clients (unit_id, source, external_ref) where external_ref is not null;

create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete restrict,
  client_id        uuid not null,
  professional_id  uuid not null,
  service_id       uuid not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           public.appointment_status not null default 'agendado',
  notes            text check (notes is null or length(notes) <= 2000),
  cancel_reason    text check (cancel_reason is null or length(cancel_reason) <= 500),
  cancelled_at     timestamptz,
  cancelled_by     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  -- Chaves compostas: cliente, profissional e serviço precisam ser da mesma unidade.
  foreign key (client_id, unit_id) references public.clients (id, unit_id) on delete restrict,
  foreign key (professional_id, unit_id) references public.professionals (id, unit_id) on delete restrict,
  foreign key (service_id, unit_id) references public.services (id, unit_id) on delete restrict,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours'),
  check (status <> 'cancelado' or cancel_reason is not null),
  -- Um profissional não pode ter dois atendimentos ativos sobrepostos.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('agendado', 'confirmado', 'concluido'))
);
create index appointments_unit_start_idx on public.appointments (unit_id, starts_at);
create index appointments_professional_start_idx on public.appointments (professional_id, starts_at);
create index appointments_client_idx on public.appointments (client_id);

-- Auditoria: somente inserida por gatilho. Nunca alterada pela aplicação.
create table public.audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  db_role      text not null default current_user,
  unit_id      uuid,
  table_name   text not null,
  record_id    text,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data     jsonb,
  new_data     jsonb
);
create index audit_log_unit_time_idx on public.audit_log (unit_id, occurred_at desc);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);

-- =============================================================================
-- Funções de autorização
-- =============================================================================

-- Usuário atual da aplicação: auth.uid() quando há JWT de usuário; caso
-- contrário, o ator informado por uma função de servidor via
-- set_config('app.actor_id', ...). Um JWT de usuário sempre prevalece.
create or replace function public.current_actor_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );
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
  );
$$;

-- Permissão efetiva = (papel-base − revogações) ∪ concessões, apenas para
-- perfil ativo, vínculo ativo e unidade ativa.
create or replace function public.has_permission(p_unit_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_memberships m
    join public.profiles p on p.id = m.user_id and p.active
    join public.units u on u.id = m.unit_id and u.active
    where m.user_id = (select auth.uid())
      and m.unit_id = p_unit_id
      and m.active
      and (
        exists (
          select 1 from public.membership_permission_overrides o
          where o.membership_id = m.id
            and o.permission_code = p_permission
            and o.effect = 'grant'
        )
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.role = m.role and rp.permission_code = p_permission
          )
          and not exists (
            select 1 from public.membership_permission_overrides o
            where o.membership_id = m.id
              and o.permission_code = p_permission
              and o.effect = 'revoke'
          )
        )
      )
  );
$$;

create or replace function public.is_unit_member(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit_memberships m
    join public.profiles p on p.id = m.user_id and p.active
    where m.user_id = (select auth.uid())
      and m.unit_id = p_unit_id
      and m.active
  );
$$;

-- O profissional informado está vinculado ao usuário atual?
create or replace function public.is_own_professional(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.professionals pr
    where pr.id = p_professional_id
      and pr.user_id = (select auth.uid())
  );
$$;

-- Lista as permissões efetivas do usuário atual em uma unidade. Serve para a
-- interface esconder ações; a autorização real continua nas políticas RLS.
create or replace function public.my_permissions(p_unit_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.code
  from public.permissions p
  where public.has_permission(p_unit_id, p.code)
  order by p.code;
$$;

-- Agenda do profissional logado com o nome do cliente, sem expor o restante
-- do cadastro (telefone, e-mail, observações) a quem não tem clients.view.
create or replace function public.get_my_agenda(p_from timestamptz, p_to timestamptz)
returns table (
  appointment_id   uuid,
  unit_id          uuid,
  starts_at        timestamptz,
  ends_at          timestamptz,
  status           public.appointment_status,
  service_name     text,
  client_name      text,
  notes            text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Intervalo inválido' using errcode = '22023';
  end if;
  if p_to - p_from > interval '31 days' then
    raise exception 'Intervalo máximo de 31 dias' using errcode = '22023';
  end if;

  return query
  select a.id, a.unit_id, a.starts_at, a.ends_at, a.status,
         s.name, c.full_name, a.notes
  from public.appointments a
  join public.professionals pr on pr.id = a.professional_id
  join public.services s on s.id = a.service_id
  join public.clients c on c.id = a.client_id
  where pr.user_id = (select auth.uid())
    and a.starts_at < p_to
    and a.ends_at > p_from
    and public.has_permission(a.unit_id, 'appointments.view_own')
  order by a.starts_at;
end;
$$;

-- =============================================================================
-- Gatilhos genéricos
-- =============================================================================

create or replace function public.tg_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if to_jsonb(new) ? 'created_by' then
      -- Nunca confiar no created_by enviado pelo cliente.
      new := jsonb_populate_record(new, jsonb_build_object('created_by', public.current_actor_id()));
    end if;
    if to_jsonb(new) ? 'created_at' then
      new := jsonb_populate_record(new, jsonb_build_object('created_at', now()));
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if to_jsonb(new) ? 'created_by' then
      new := jsonb_populate_record(new, jsonb_build_object('created_by', old.created_by));
    end if;
    if to_jsonb(new) ? 'created_at' then
      new := jsonb_populate_record(new, jsonb_build_object('created_at', old.created_at));
    end if;
  end if;
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;

-- unit_id é imutável: mover um registro entre unidades quebraria o isolamento.
create or replace function public.tg_unit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'unit_id não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  v_record := coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'code',
                       (v_row ->> 'membership_id') || ':' || (v_row ->> 'permission_code'));

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

-- =============================================================================
-- Gatilhos específicos (regras que RLS não expressa sozinho)
-- =============================================================================

-- Contextos administrativos de servidor (SQL Editor, migrações, funções com a
-- chave secreta). Usado apenas para liberar operações de manutenção.
create or replace function public.is_server_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active is distinct from old.active
     and not (public.is_platform_admin() or public.is_server_context()) then
    raise exception 'Somente o Admin Geral pode ativar ou desativar usuários'
      using errcode = '42501';
  end if;
  if new.active = false and old.active = true
     and new.id = (select auth.uid()) then
    raise exception 'Um usuário não pode desativar a si mesmo' using errcode = '42501';
  end if;
  if new.active = false and old.active = true
     and exists (select 1 from public.platform_admins where user_id = new.id)
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

create or replace function public.tg_platform_admins_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.platform_admins pa
    join public.profiles p on p.id = pa.user_id
    where p.active and pa.user_id <> old.user_id
  ) = 0 then
    raise exception 'Não é possível remover o último Admin Geral ativo' using errcode = '42501';
  end if;
  return old;
end;
$$;

create or replace function public.tg_memberships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id de um vínculo não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.tg_professionals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Vincular um usuário a um profissional concede a ele acesso à própria
  -- agenda; por isso o usuário precisa ter vínculo ativo com a mesma unidade.
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id)
     and not exists (
       select 1 from public.unit_memberships m
       where m.user_id = new.user_id and m.unit_id = new.unit_id and m.active
     ) then
    raise exception 'O usuário precisa ter vínculo ativo com a unidade do profissional'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.tg_clients_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.full_name, new.phone, new.email, new.birth_date, new.notes)
     is distinct from (old.full_name, old.phone, old.email, old.birth_date, old.notes)
     and not (public.has_permission(new.unit_id, 'clients.update') or public.is_server_context()) then
    raise exception 'Sem permissão para editar clientes' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at then
    if not (public.has_permission(new.unit_id, 'clients.archive') or public.is_server_context()) then
      raise exception 'Sem permissão para arquivar ou restaurar clientes' using errcode = '42501';
    end if;
    new.archived_by := case when new.archived_at is null then null else public.current_actor_id() end;
  else
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

create or replace function public.tg_appointments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelado' then
      raise exception 'Um agendamento não pode ser criado já cancelado' using errcode = '23514';
    end if;
    new.cancelled_at := null;
    new.cancelled_by := null;
    return new;
  end if;

  -- Quem só tem appointments.cancel pode apenas cancelar (status + motivo).
  if (new.client_id, new.professional_id, new.service_id, new.starts_at, new.ends_at, new.notes)
     is distinct from (old.client_id, old.professional_id, old.service_id, old.starts_at, old.ends_at, old.notes)
     or (new.status is distinct from old.status and new.status <> 'cancelado') then
    if not (public.has_permission(new.unit_id, 'appointments.update') or public.is_server_context()) then
      raise exception 'Sem permissão para editar agendamentos' using errcode = '42501';
    end if;
  end if;

  if old.status = 'cancelado' and new.status is distinct from old.status then
    raise exception 'Agendamento cancelado não pode ser reaberto; crie um novo'
      using errcode = '23514';
  end if;

  if new.status = 'cancelado' and old.status <> 'cancelado' then
    if not (public.has_permission(new.unit_id, 'appointments.cancel') or public.is_server_context()) then
      raise exception 'Sem permissão para cancelar agendamentos' using errcode = '42501';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := public.current_actor_id();
  else
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
  end if;
  return new;
end;
$$;

-- Ligação dos gatilhos --------------------------------------------------------

create trigger units_stamp before insert or update on public.units
  for each row execute function public.tg_stamp();
create trigger profiles_stamp before insert or update on public.profiles
  for each row execute function public.tg_stamp();
create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();
create trigger platform_admins_stamp before insert or update on public.platform_admins
  for each row execute function public.tg_stamp();
create trigger platform_admins_guard before delete on public.platform_admins
  for each row execute function public.tg_platform_admins_guard();
create trigger unit_memberships_stamp before insert or update on public.unit_memberships
  for each row execute function public.tg_stamp();
create trigger unit_memberships_unit before update on public.unit_memberships
  for each row execute function public.tg_unit_immutable();
create trigger unit_memberships_guard before update on public.unit_memberships
  for each row execute function public.tg_memberships_guard();
create trigger overrides_stamp before insert or update on public.membership_permission_overrides
  for each row execute function public.tg_stamp();
create trigger professionals_stamp before insert or update on public.professionals
  for each row execute function public.tg_stamp();
create trigger professionals_unit before update on public.professionals
  for each row execute function public.tg_unit_immutable();
create trigger professionals_guard before insert or update on public.professionals
  for each row execute function public.tg_professionals_guard();
create trigger services_stamp before insert or update on public.services
  for each row execute function public.tg_stamp();
create trigger services_unit before update on public.services
  for each row execute function public.tg_unit_immutable();
create trigger clients_stamp before insert or update on public.clients
  for each row execute function public.tg_stamp();
create trigger clients_unit before update on public.clients
  for each row execute function public.tg_unit_immutable();
create trigger clients_guard before update on public.clients
  for each row execute function public.tg_clients_guard();
create trigger appointments_stamp before insert or update on public.appointments
  for each row execute function public.tg_stamp();
create trigger appointments_unit before update on public.appointments
  for each row execute function public.tg_unit_immutable();
create trigger appointments_guard before insert or update on public.appointments
  for each row execute function public.tg_appointments_guard();

do $$
declare
  t text;
begin
  foreach t in array array[
    'units', 'profiles', 'platform_admins', 'unit_memberships',
    'membership_permission_overrides', 'professionals', 'services',
    'clients', 'appointments'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.tg_audit()',
      t || '_audit', t);
  end loop;
end;
$$;

-- =============================================================================
-- Dados de referência
-- =============================================================================

insert into public.units (code, name) values
  ('geral', 'RC Beauty Geral'),
  ('vip',   'Sala VIP');

insert into public.permissions (code, description) values
  ('clients.view',           'Ver cadastro completo de clientes da unidade'),
  ('clients.create',         'Cadastrar clientes na unidade'),
  ('clients.update',         'Editar cadastro de clientes da unidade'),
  ('clients.archive',        'Arquivar e restaurar clientes da unidade'),
  ('professionals.view',     'Ver profissionais da unidade'),
  ('professionals.manage',   'Cadastrar e editar profissionais da unidade'),
  ('services.view',          'Ver serviços da unidade'),
  ('services.manage',        'Cadastrar e editar serviços da unidade'),
  ('appointments.view_all',  'Ver todos os agendamentos da unidade'),
  ('appointments.view_own',  'Ver os próprios agendamentos como profissional'),
  ('appointments.create',    'Criar agendamentos na unidade'),
  ('appointments.update',    'Editar agendamentos da unidade'),
  ('appointments.cancel',    'Cancelar agendamentos da unidade'),
  ('audit.view',             'Ver a trilha de auditoria da unidade');

insert into public.role_permissions (role, permission_code)
select 'admin_unidade'::public.app_role, code from public.permissions;

insert into public.role_permissions (role, permission_code) values
  ('recepcao', 'clients.view'),
  ('recepcao', 'clients.create'),
  ('recepcao', 'clients.update'),
  ('recepcao', 'professionals.view'),
  ('recepcao', 'services.view'),
  ('recepcao', 'appointments.view_all'),
  ('recepcao', 'appointments.create'),
  ('recepcao', 'appointments.update'),
  ('recepcao', 'appointments.cancel'),
  ('profissional', 'professionals.view'),
  ('profissional', 'services.view'),
  ('profissional', 'appointments.view_own'),
  ('somente_leitura', 'clients.view'),
  ('somente_leitura', 'professionals.view'),
  ('somente_leitura', 'services.view'),
  ('somente_leitura', 'appointments.view_all');

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.units                            enable row level security;
alter table public.profiles                         enable row level security;
alter table public.platform_admins                  enable row level security;
alter table public.permissions                      enable row level security;
alter table public.role_permissions                 enable row level security;
alter table public.unit_memberships                 enable row level security;
alter table public.membership_permission_overrides  enable row level security;
alter table public.professionals                    enable row level security;
alter table public.services                         enable row level security;
alter table public.clients                          enable row level security;
alter table public.appointments                     enable row level security;
alter table public.audit_log                        enable row level security;

-- units
create policy units_select on public.units for select to authenticated
  using ((select public.is_platform_admin()) or public.is_unit_member(id));
create policy units_insert on public.units for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy units_update on public.units for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_platform_admin()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_platform_admin()))
  with check (id = (select auth.uid()) or (select public.is_platform_admin()));

-- platform_admins (escrita apenas pelo administrador do banco)
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

-- catálogo
create policy permissions_select on public.permissions for select to authenticated
  using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (true);

-- unit_memberships
create policy memberships_select on public.unit_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
create policy memberships_insert on public.unit_memberships for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy memberships_update on public.unit_memberships for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- membership_permission_overrides
create policy overrides_select on public.membership_permission_overrides for select to authenticated
  using (
    (select public.is_platform_admin())
    or exists (
      select 1 from public.unit_memberships m
      where m.id = membership_id and m.user_id = (select auth.uid())
    )
  );
create policy overrides_insert on public.membership_permission_overrides for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy overrides_update on public.membership_permission_overrides for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy overrides_delete on public.membership_permission_overrides for delete to authenticated
  using ((select public.is_platform_admin()));

-- professionals
create policy professionals_select on public.professionals for select to authenticated
  using (public.has_permission(unit_id, 'professionals.view'));
create policy professionals_insert on public.professionals for insert to authenticated
  with check (public.has_permission(unit_id, 'professionals.manage'));
create policy professionals_update on public.professionals for update to authenticated
  using (public.has_permission(unit_id, 'professionals.manage'))
  with check (public.has_permission(unit_id, 'professionals.manage'));

-- services
create policy services_select on public.services for select to authenticated
  using (public.has_permission(unit_id, 'services.view'));
create policy services_insert on public.services for insert to authenticated
  with check (public.has_permission(unit_id, 'services.manage'));
create policy services_update on public.services for update to authenticated
  using (public.has_permission(unit_id, 'services.manage'))
  with check (public.has_permission(unit_id, 'services.manage'));

-- clients
create policy clients_select on public.clients for select to authenticated
  using (public.has_permission(unit_id, 'clients.view'));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_permission(unit_id, 'clients.create'));
create policy clients_update on public.clients for update to authenticated
  using (public.has_permission(unit_id, 'clients.update') or public.has_permission(unit_id, 'clients.archive'))
  with check (public.has_permission(unit_id, 'clients.update') or public.has_permission(unit_id, 'clients.archive'));

-- appointments
create policy appointments_select on public.appointments for select to authenticated
  using (
    public.has_permission(unit_id, 'appointments.view_all')
    or (
      public.has_permission(unit_id, 'appointments.view_own')
      and public.is_own_professional(professional_id)
    )
  );
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.has_permission(unit_id, 'appointments.create'));
create policy appointments_update on public.appointments for update to authenticated
  using (public.has_permission(unit_id, 'appointments.update') or public.has_permission(unit_id, 'appointments.cancel'))
  with check (public.has_permission(unit_id, 'appointments.update') or public.has_permission(unit_id, 'appointments.cancel'));

-- audit_log
create policy audit_select on public.audit_log for select to authenticated
  using (
    (select public.is_platform_admin())
    or (unit_id is not null and public.has_permission(unit_id, 'audit.view'))
  );

-- =============================================================================
-- Privilégios
--
-- O Supabase concede privilégios amplos por padrão às roles da API. Aqui eles
-- são revogados e concedidos de novo de forma explícita. RLS continua sendo
-- obrigatório: os GRANTs definem o que pode ser tentado; as políticas, sobre
-- quais linhas.
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.permissions, public.role_permissions, public.platform_admins
  to authenticated;

grant select, insert on public.units to authenticated;
grant update (name, active) on public.units to authenticated;

grant select on public.profiles to authenticated;
grant insert (id, full_name, active) on public.profiles to authenticated;
grant update (full_name, active, deactivation_reason) on public.profiles to authenticated;

grant select on public.unit_memberships to authenticated;
grant insert (user_id, unit_id, role, active) on public.unit_memberships to authenticated;
grant update (role, active) on public.unit_memberships to authenticated;

grant select, delete on public.membership_permission_overrides to authenticated;
grant insert (membership_id, permission_code, effect, reason)
  on public.membership_permission_overrides to authenticated;
grant update (effect, reason) on public.membership_permission_overrides to authenticated;

grant select on public.professionals to authenticated;
grant insert (unit_id, user_id, display_name, active) on public.professionals to authenticated;
grant update (user_id, display_name, active) on public.professionals to authenticated;

grant select on public.services to authenticated;
grant insert (unit_id, name, duration_minutes, price_cents, active) on public.services to authenticated;
grant update (name, duration_minutes, price_cents, active) on public.services to authenticated;

grant select on public.clients to authenticated;
grant insert (unit_id, full_name, phone, email, birth_date, notes) on public.clients to authenticated;
grant update (full_name, phone, email, birth_date, notes, archived_at) on public.clients to authenticated;

grant select on public.appointments to authenticated;
grant insert (unit_id, client_id, professional_id, service_id, starts_at, ends_at, status, notes)
  on public.appointments to authenticated;
grant update (client_id, professional_id, service_id, starts_at, ends_at, status, notes, cancel_reason)
  on public.appointments to authenticated;

grant select on public.audit_log to authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.is_unit_member(uuid) to authenticated;
grant execute on function public.is_own_professional(uuid) to authenticated;
grant execute on function public.my_permissions(uuid) to authenticated;
grant execute on function public.get_my_agenda(timestamptz, timestamptz) to authenticated;
grant execute on function public.current_actor_id() to authenticated;
grant execute on function public.is_server_context() to authenticated;

-- Novos objetos criados no schema public não ficam expostos automaticamente.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
