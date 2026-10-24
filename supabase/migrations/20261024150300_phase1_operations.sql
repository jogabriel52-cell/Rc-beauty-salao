-- =============================================================================
-- RC Beauty — Fase 1: operação diária
--
--   * Clientes: identidade única (client_identities) + vínculo por unidade
--     (client_units). Notas privadas e histórico de CRM por unidade
--     (crm_interactions). Duplicidades apresentadas para revisão; mescla só
--     dentro da unidade e nunca automática.
--   * Serviços, profissionais e agenda (profissional vê só a própria agenda,
--     com os dados mínimos da cliente).
--   * Comandas (vendas): quem abriu, quem vendeu e quem finalizou; finalização
--     exige pagamentos = total e baixa o estoque; cancelamento estorna.
--   * Estoque (produtos + movimentos somente de inclusão).
--   * Painel operacional e relatórios.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissões da fase e atribuição nos perfis iniciais
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, action, module_label, description, allowed_scopes, sort_order) values
  ('clients.view', 'clients', 'view', 'Clientes', 'Ver cadastro de clientes da unidade (nome, contato e observações de atendimento)', '{unit}', 100),
  ('clients.create', 'clients', 'create', 'Clientes', 'Cadastrar cliente ou vincular cliente existente à unidade', '{unit}', 101),
  ('clients.update', 'clients', 'update', 'Clientes', 'Editar cadastro e observações de atendimento', '{unit}', 102),
  ('clients.archive', 'clients', 'archive', 'Clientes', 'Arquivar e restaurar clientes', '{unit}', 103),
  ('clients.merge', 'clients', 'merge', 'Clientes', 'Revisar e mesclar possíveis duplicidades', '{unit}', 104),
  ('crm.view', 'crm', 'view', 'CRM', 'Ver notas privadas e histórico de relacionamento da unidade', '{unit}', 110),
  ('crm.write', 'crm', 'write', 'CRM', 'Registrar notas e interações de relacionamento', '{unit}', 111),
  ('services.view', 'services', 'view', 'Serviços', 'Ver serviços da unidade', '{unit}', 120),
  ('services.manage', 'services', 'manage', 'Serviços', 'Cadastrar e editar serviços', '{unit}', 121),
  ('professionals.view', 'professionals', 'view', 'Profissionais', 'Ver profissionais da unidade', '{unit}', 130),
  ('professionals.manage', 'professionals', 'manage', 'Profissionais', 'Cadastrar e editar profissionais', '{unit}', 131),
  ('appointments.view', 'appointments', 'view', 'Agenda', 'Ver agendamentos (os próprios, como profissional, ou de toda a unidade)', '{own,unit}', 140),
  ('appointments.create', 'appointments', 'create', 'Agenda', 'Criar agendamentos', '{unit}', 141),
  ('appointments.update', 'appointments', 'update', 'Agenda', 'Remarcar, confirmar, concluir e marcar falta', '{unit}', 142),
  ('appointments.cancel', 'appointments', 'cancel', 'Agenda', 'Cancelar agendamentos', '{unit}', 143),
  ('sales.view', 'sales', 'view', 'Comandas', 'Ver comandas (as próprias ou de toda a unidade)', '{own,unit}', 150),
  ('sales.open', 'sales', 'open', 'Comandas', 'Abrir comandas', '{unit}', 151),
  ('sales.edit', 'sales', 'edit', 'Comandas', 'Lançar itens, pagamentos, desconto e vendedor em comandas abertas', '{unit}', 152),
  ('sales.finalize', 'sales', 'finalize', 'Comandas', 'Finalizar comandas', '{unit}', 153),
  ('sales.cancel', 'sales', 'cancel', 'Comandas', 'Cancelar comandas (finalizadas têm estoque estornado)', '{unit}', 154),
  ('stock.view', 'stock', 'view', 'Estoque', 'Ver produtos e saldos', '{unit}', 160),
  ('stock.manage', 'stock', 'manage', 'Estoque', 'Cadastrar produtos e lançar entradas, saídas e ajustes', '{unit}', 161),
  ('dashboard.view', 'dashboard', 'view', 'Painel', 'Ver o painel operacional da unidade', '{unit}', 170),
  ('reports.view', 'reports', 'view', 'Relatórios', 'Ver relatórios de vendas e atendimentos', '{unit}', 180);

-- Admin Geral, Direção e Gerente: todas as permissões operacionais.
insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, p.code, 'unit'
from public.access_profiles ap
cross join public.permissions p
where ap.key in ('admin_geral', 'direcao', 'gerente')
  and p.module in ('clients', 'crm', 'services', 'professionals', 'appointments', 'sales', 'stock', 'dashboard', 'reports');

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, x.code, x.scope::public.access_scope
from (values
  ('vendedora', 'clients.view', 'unit'), ('vendedora', 'clients.create', 'unit'), ('vendedora', 'clients.update', 'unit'),
  ('vendedora', 'crm.view', 'unit'), ('vendedora', 'crm.write', 'unit'),
  ('vendedora', 'services.view', 'unit'), ('vendedora', 'professionals.view', 'unit'),
  ('vendedora', 'appointments.view', 'unit'), ('vendedora', 'appointments.create', 'unit'),
  ('vendedora', 'appointments.update', 'unit'), ('vendedora', 'appointments.cancel', 'unit'),
  ('vendedora', 'sales.view', 'own'),
  ('recepcao', 'clients.view', 'unit'), ('recepcao', 'clients.create', 'unit'), ('recepcao', 'clients.update', 'unit'),
  ('recepcao', 'crm.view', 'unit'),
  ('recepcao', 'services.view', 'unit'), ('recepcao', 'professionals.view', 'unit'),
  ('recepcao', 'appointments.view', 'unit'), ('recepcao', 'appointments.create', 'unit'),
  ('recepcao', 'appointments.update', 'unit'), ('recepcao', 'appointments.cancel', 'unit'),
  ('recepcao', 'sales.view', 'unit'), ('recepcao', 'sales.open', 'unit'), ('recepcao', 'sales.edit', 'unit'),
  ('recepcao', 'sales.finalize', 'unit'), ('recepcao', 'stock.view', 'unit'), ('recepcao', 'dashboard.view', 'unit'),
  ('profissional', 'appointments.view', 'own'), ('profissional', 'services.view', 'unit'),
  ('profissional', 'professionals.view', 'unit'),
  ('somente_leitura', 'clients.view', 'unit'), ('somente_leitura', 'services.view', 'unit'),
  ('somente_leitura', 'professionals.view', 'unit'), ('somente_leitura', 'appointments.view', 'unit'),
  ('somente_leitura', 'sales.view', 'unit'), ('somente_leitura', 'stock.view', 'unit'),
  ('somente_leitura', 'dashboard.view', 'unit'), ('somente_leitura', 'reports.view', 'unit')
) as x(key, code, scope)
join public.access_profiles ap on ap.key = x.key;

-- -----------------------------------------------------------------------------
-- 2. Utilitários
-- -----------------------------------------------------------------------------

-- Telefone: somente dígitos, com DDI. Números brasileiros de 10/11 dígitos
-- recebem 55. Retorna NULL se não for um telefone plausível.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^\d{10,11}$' then '55' || d
    when d ~ '^55\d{10,11}$' then d
    when d ~ '^\d{12,15}$' then d
    else null
  end
  from (select regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^00', '') as d) x;
$$;

create or replace function public.normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_name, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '\s+', ' ', 'g'));
$$;

-- "Maria Silva Souza" -> "Maria S."
create or replace function public.mask_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when array_length(parts, 1) > 1 then parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.'
    else parts[1]
  end
  from (select regexp_split_to_array(btrim(p_name), '\s+') as parts) x;
$$;

create or replace function public.local_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- -----------------------------------------------------------------------------
-- 3. Clientes: identidade única + vínculo por unidade
-- -----------------------------------------------------------------------------

create table public.client_identities (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null check (length(btrim(full_name)) between 2 and 160),
  phone           text check (phone is null or phone ~ '^\d{12,15}$'),
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  birth_date      date check (birth_date is null or birth_date > date '1900-01-01'),
  merged_into_id  uuid references public.client_identities (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid
);
comment on table public.client_identities is
  'Identidade única da cliente. Dados de cada unidade ficam em client_units e crm_interactions.';
create index client_identities_phone_idx on public.client_identities (phone) where phone is not null;
create index client_identities_email_idx on public.client_identities (lower(email)) where email is not null;
create index client_identities_name_idx on public.client_identities (public.normalize_name(full_name));

create table public.crm_interactions (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete restrict,
  client_unit_id  uuid not null,
  kind            text not null default 'nota'
                  check (kind in ('nota', 'ligacao', 'whatsapp', 'visita', 'email', 'outro')),
  body            text not null check (length(btrim(body)) between 1 and 4000),
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid
);

alter table public.clients rename to client_units;
comment on table public.client_units is
  'Vínculo da cliente com uma unidade: observações de atendimento, origem e arquivamento por unidade.';

-- Migração dos dados existentes: uma identidade por cadastro e notas -> CRM.
alter table public.client_units add column identity_id uuid;
update public.client_units set identity_id = gen_random_uuid();
insert into public.client_identities (id, full_name, phone, email, birth_date, created_at, created_by)
select identity_id, full_name, public.normalize_phone(phone), email, birth_date, created_at, created_by
from public.client_units;
insert into public.crm_interactions (unit_id, client_unit_id, kind, body, occurred_at, created_by)
select unit_id, id, 'nota', notes, created_at, created_by
from public.client_units where notes is not null and btrim(notes) <> '';

drop trigger clients_guard on public.client_units;
drop policy clients_insert on public.client_units;
alter table public.client_units
  drop column full_name,
  drop column phone,
  drop column email,
  drop column birth_date,
  drop column notes,
  alter column identity_id set not null,
  add constraint client_units_identity_fk foreign key (identity_id)
    references public.client_identities (id) on delete restrict,
  add constraint client_units_unit_identity_key unique (unit_id, identity_id),
  add column service_notes text check (service_notes is null or length(service_notes) <= 1000),
  add column merged_into_id uuid references public.client_units (id) on delete restrict;
comment on column public.client_units.service_notes is
  'Observações necessárias ao atendimento (ex.: alergia a produto). Visíveis ao profissional na própria agenda.';
create index client_units_identity_idx on public.client_units (identity_id);

alter table public.crm_interactions
  add constraint crm_interactions_client_fk foreign key (client_unit_id, unit_id)
    references public.client_units (id, unit_id) on delete restrict;
create index crm_interactions_client_idx on public.crm_interactions (client_unit_id, occurred_at desc);

create table public.client_duplicate_dismissals (
  unit_id     uuid not null references public.units (id) on delete restrict,
  client_a    uuid not null,
  client_b    uuid not null,
  reason      text not null check (length(btrim(reason)) between 3 and 500),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  primary key (unit_id, client_a, client_b),
  check (client_a < client_b),
  foreign key (client_a, unit_id) references public.client_units (id, unit_id) on delete restrict,
  foreign key (client_b, unit_id) references public.client_units (id, unit_id) on delete restrict
);

-- Identidade visível/editável para quem tem permissão em alguma unidade
-- vinculada a ela (sem RLS, para não depender do que o chamador enxerga).
create or replace function public.can_view_identity(p_identity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.client_units cu
                 where cu.identity_id = p_identity_id
                   and public.has_permission(cu.unit_id, 'clients.view'));
$$;

create or replace function public.can_update_identity(p_identity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.client_units cu
                 where cu.identity_id = p_identity_id
                   and public.has_permission(cu.unit_id, 'clients.update'));
$$;

create or replace function public.tg_client_identities_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is not null then
    new.phone := public.normalize_phone(new.phone);
    if new.phone is null then
      raise exception 'Telefone inválido' using errcode = '23514';
    end if;
  end if;
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and new.merged_into_id is distinct from old.merged_into_id
     and not public.is_server_context() then
    raise exception 'Mescla só pela função de revisão de duplicidades' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger client_identities_normalize before insert or update on public.client_identities
  for each row execute function public.tg_client_identities_normalize();
create trigger client_identities_stamp before insert or update on public.client_identities
  for each row execute function public.tg_stamp();

create or replace function public.tg_clients_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_server_context() then
    return new;
  end if;
  if new.identity_id is distinct from old.identity_id or new.merged_into_id is distinct from old.merged_into_id then
    raise exception 'Vínculo de identidade só muda pela revisão de duplicidades' using errcode = '42501';
  end if;
  if new.service_notes is distinct from old.service_notes
     and not public.has_permission(new.unit_id, 'clients.update') then
    raise exception 'Sem permissão para editar clientes' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at then
    if not public.has_permission(new.unit_id, 'clients.archive') then
      raise exception 'Sem permissão para arquivar ou restaurar clientes' using errcode = '42501';
    end if;
    new.archived_by := case when new.archived_at is null then null else public.current_actor_id() end;
  else
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

create trigger clients_guard before update on public.client_units
  for each row execute function public.tg_clients_guard();

-- -----------------------------------------------------------------------------
-- 4. Profissionais, serviços e agenda
-- -----------------------------------------------------------------------------

alter table public.professionals
  add column specialty text check (specialty is null or length(btrim(specialty)) between 2 and 80);
alter table public.services
  add column category text check (category is null or length(btrim(category)) between 2 and 60);

alter table public.appointments add constraint appointments_id_unit_key unique (id, unit_id);

create or replace function public.tg_appointments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('agendado', 'confirmado') then
      raise exception 'Agendamento novo deve estar agendado ou confirmado' using errcode = '23514';
    end if;
    new.cancelled_at := null;
    new.cancelled_by := null;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status in ('cancelado', 'concluido', 'nao_compareceu') then
      raise exception 'Agendamento % não pode mudar de situação; crie um novo', old.status
        using errcode = '23514';
    end if;
    if old.status = 'confirmado' and new.status = 'agendado' then
      raise exception 'Agendamento confirmado não volta para agendado' using errcode = '23514';
    end if;
  end if;

  if not public.is_server_context() then
    -- Quem só tem appointments.cancel pode apenas cancelar (situação + motivo).
    if (new.client_id, new.professional_id, new.service_id, new.starts_at, new.ends_at, new.notes)
       is distinct from (old.client_id, old.professional_id, old.service_id, old.starts_at, old.ends_at, old.notes)
       or (new.status is distinct from old.status and new.status <> 'cancelado') then
      if not public.has_permission(new.unit_id, 'appointments.update') then
        raise exception 'Sem permissão para editar agendamentos' using errcode = '42501';
      end if;
    end if;
    if new.status = 'cancelado' and old.status <> 'cancelado'
       and not public.has_permission(new.unit_id, 'appointments.cancel') then
      raise exception 'Sem permissão para cancelar agendamentos' using errcode = '42501';
    end if;
  end if;

  if new.status = 'cancelado' and old.status <> 'cancelado' then
    new.cancelled_at := now();
    new.cancelled_by := public.current_actor_id();
  else
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
  end if;
  return new;
end;
$$;

-- Agenda do profissional logado: somente os dados da cliente necessários ao
-- atendimento (nome e observações de atendimento). Sem telefone, e-mail ou
-- notas privadas de CRM.
drop function public.get_my_agenda(timestamptz, timestamptz);
create function public.get_my_agenda(p_from timestamptz, p_to timestamptz)
returns table (
  appointment_id   uuid,
  unit_id          uuid,
  unit_name        text,
  professional_id  uuid,
  starts_at        timestamptz,
  ends_at          timestamptz,
  status           public.appointment_status,
  service_name     text,
  client_name      text,
  service_notes    text,
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
  select a.id, a.unit_id, u.name, a.professional_id, a.starts_at, a.ends_at, a.status,
         s.name, ci.full_name, cu.service_notes, a.notes
  from public.appointments a
  join public.units u on u.id = a.unit_id
  join public.professionals pr on pr.id = a.professional_id
  join public.services s on s.id = a.service_id
  join public.client_units cu on cu.id = a.client_id
  join public.client_identities ci on ci.id = cu.identity_id
  where pr.user_id = (select auth.uid())
    and a.starts_at < p_to
    and a.ends_at > p_from
    and public.has_permission(a.unit_id, 'appointments.view')
  order by a.starts_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Estoque
-- -----------------------------------------------------------------------------

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.units (id) on delete restrict,
  name              text not null check (length(btrim(name)) between 2 and 120),
  sku               text check (sku is null or length(btrim(sku)) between 1 and 60),
  sale_price_cents  integer check (sale_price_cents is null or sale_price_cents >= 0),
  cost_cents        integer check (cost_cents is null or cost_cents >= 0),
  min_quantity      integer not null default 0 check (min_quantity >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  unique (id, unit_id)
);
create unique index products_unit_name_uidx on public.products (unit_id, lower(name)) where active;
create unique index products_unit_sku_uidx on public.products (unit_id, lower(sku)) where sku is not null;

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete restrict,
  product_id      uuid not null,
  kind            text not null check (kind in ('entrada', 'saida', 'ajuste', 'venda', 'estorno_venda')),
  quantity_delta  integer not null check (quantity_delta <> 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  reason          text check (reason is null or length(reason) <= 300),
  sale_id         uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  foreign key (product_id, unit_id) references public.products (id, unit_id) on delete restrict,
  check (
    (kind in ('entrada', 'estorno_venda') and quantity_delta > 0)
    or (kind in ('saida', 'venda') and quantity_delta < 0)
    or kind = 'ajuste'
  ),
  check (kind not in ('ajuste', 'saida') or reason is not null)
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- Saldo por produto. security_invoker: aplica o RLS de quem consulta.
create view public.product_stock with (security_invoker = true) as
select p.id, p.unit_id, p.name, p.sku, p.sale_price_cents, p.cost_cents, p.min_quantity, p.active,
       coalesce((select sum(m.quantity_delta) from public.stock_movements m where m.product_id = p.id), 0)::integer
         as quantity
from public.products p;

create or replace function public.tg_stock_movements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_server_context() and new.kind in ('venda', 'estorno_venda') then
    raise exception 'Movimentos de venda são gerados pelas comandas' using errcode = '42501';
  end if;
  if not public.is_server_context() then
    new.sale_id := null;
  end if;
  return new;
end;
$$;

create trigger stock_movements_guard before insert on public.stock_movements
  for each row execute function public.tg_stock_movements_guard();

-- -----------------------------------------------------------------------------
-- 6. Comandas (vendas)
-- -----------------------------------------------------------------------------

create type public.sale_status as enum ('aberta', 'finalizada', 'cancelada');

create table public.unit_sequences (
  unit_id     uuid not null references public.units (id) on delete restrict,
  name        text not null,
  last_value  integer not null default 0,
  primary key (unit_id, name)
);

create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete restrict,
  number           integer not null,
  client_unit_id   uuid,
  appointment_id   uuid,
  status           public.sale_status not null default 'aberta',
  opened_by        uuid not null,
  opened_at        timestamptz not null default now(),
  sold_by          uuid references public.profiles (id) on delete restrict,
  finalized_by     uuid,
  finalized_at     timestamptz,
  cancelled_by     uuid,
  cancelled_at     timestamptz,
  cancel_reason    text check (cancel_reason is null or length(cancel_reason) <= 500),
  subtotal_cents   integer not null default 0 check (subtotal_cents >= 0),
  discount_cents   integer not null default 0 check (discount_cents >= 0),
  total_cents      integer not null default 0,
  notes            text check (notes is null or length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  unique (id, unit_id),
  unique (unit_id, number),
  foreign key (client_unit_id, unit_id) references public.client_units (id, unit_id) on delete restrict,
  foreign key (appointment_id, unit_id) references public.appointments (id, unit_id) on delete restrict,
  check (status <> 'cancelada' or cancel_reason is not null),
  check (discount_cents <= subtotal_cents),
  check (total_cents = subtotal_cents - discount_cents)
);
create index sales_unit_opened_idx on public.sales (unit_id, opened_at desc);
create index sales_unit_status_idx on public.sales (unit_id, status);

create table public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.units (id) on delete restrict,
  sale_id           uuid not null,
  kind              text not null check (kind in ('servico', 'produto')),
  service_id        uuid,
  product_id        uuid,
  professional_id   uuid,
  description       text not null check (length(btrim(description)) between 1 and 200),
  quantity          integer not null default 1 check (quantity between 1 and 999),
  unit_price_cents  integer not null check (unit_price_cents >= 0),
  discount_cents    integer not null default 0 check (discount_cents >= 0),
  total_cents       integer generated always as (quantity * unit_price_cents - discount_cents) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  foreign key (sale_id, unit_id) references public.sales (id, unit_id) on delete restrict,
  foreign key (service_id, unit_id) references public.services (id, unit_id) on delete restrict,
  foreign key (product_id, unit_id) references public.products (id, unit_id) on delete restrict,
  foreign key (professional_id, unit_id) references public.professionals (id, unit_id) on delete restrict,
  check ((kind = 'servico' and service_id is not null and product_id is null)
      or (kind = 'produto' and product_id is not null and service_id is null)),
  check (quantity * unit_price_cents - discount_cents >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);

create table public.sale_payments (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete restrict,
  sale_id       uuid not null,
  method        text not null check (method in ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'voucher', 'outro')),
  amount_cents  integer not null check (amount_cents > 0),
  installments  smallint not null default 1 check (installments between 1 and 24),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  foreign key (sale_id, unit_id) references public.sales (id, unit_id) on delete restrict,
  check (method = 'cartao_credito' or installments = 1)
);
create index sale_payments_sale_idx on public.sale_payments (sale_id);

-- Auxiliares sem RLS para os gatilhos.
create or replace function public.sale_status_of(p_sale_id uuid)
returns public.sale_status
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.sales where id = p_sale_id;
$$;

create or replace function public.sale_items_count(p_sale_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.sale_items where sale_id = p_sale_id;
$$;

create or replace function public.sale_payments_total(p_sale_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::integer from public.sale_payments where sale_id = p_sale_id;
$$;

create or replace function public.is_active_unit_member(p_user_id uuid, p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.unit_memberships m
    join public.profiles p on p.id = m.user_id and p.active
    where m.user_id = p_user_id and m.unit_id = p_unit_id and m.active);
$$;

create or replace function public.can_view_sale(p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sales s
    where s.id = p_sale_id
      and (public.has_unit_scope(s.unit_id, 'sales.view')
           or (public.has_permission(s.unit_id, 'sales.view')
               and (select auth.uid()) in (s.opened_by, s.sold_by, s.finalized_by))));
$$;

-- Numeração sequencial por unidade.
create or replace function public.tg_sales_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.unit_sequences as us (unit_id, name, last_value)
  values (new.unit_id, 'sale', 1)
  on conflict (unit_id, name) do update set last_value = us.last_value + 1
  returning last_value into new.number;
  return new;
end;
$$;

-- Recalcula totais da comanda a partir dos itens.
create or replace function public.recalc_sale_totals(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal integer;
begin
  select coalesce(sum(total_cents), 0)::integer into v_subtotal from public.sale_items where sale_id = p_sale_id;
  update public.sales
  set subtotal_cents = v_subtotal, total_cents = v_subtotal - discount_cents
  where id = p_sale_id
    and (subtotal_cents, total_cents) is distinct from (v_subtotal, v_subtotal - discount_cents);
exception when check_violation then
  raise exception 'O desconto da comanda não pode ser maior que o subtotal' using errcode = '23514';
end;
$$;

-- Baixa (p_sign = -1) ou estorno (p_sign = 1) de estoque dos produtos da comanda.
create or replace function public.apply_sale_stock(p_sale_id uuid, p_sign integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.stock_movements (unit_id, product_id, kind, quantity_delta, sale_id, reason)
  select i.unit_id, i.product_id,
         case when p_sign < 0 then 'venda' else 'estorno_venda' end,
         p_sign * sum(i.quantity), p_sale_id,
         case when p_sign < 0 then 'Baixa automática da comanda' else 'Estorno por cancelamento da comanda' end
  from public.sale_items i
  where i.sale_id = p_sale_id and i.kind = 'produto'
  group by i.unit_id, i.product_id;
$$;

create or replace function public.tg_sales_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := public.current_actor_id();
begin
  if tg_op = 'INSERT' then
    if new.status <> 'aberta' then
      raise exception 'Comanda nova deve estar aberta' using errcode = '23514';
    end if;
    new.opened_by := coalesce(v_actor, new.opened_by);
    new.opened_at := now();
    new.finalized_by := null; new.finalized_at := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    new.subtotal_cents := 0; new.discount_cents := 0; new.total_cents := 0;
    if new.sold_by is not null and not public.is_active_unit_member(new.sold_by, new.unit_id) then
      raise exception 'Quem vendeu precisa ter vínculo ativo com a unidade' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.opened_by is distinct from old.opened_by or new.opened_at is distinct from old.opened_at
     or new.number is distinct from old.number then
    raise exception 'Abertura da comanda não pode ser alterada' using errcode = '42501';
  end if;

  if public.is_server_context() then
    return new;
  end if;

  if old.status = 'cancelada' then
    raise exception 'Comanda cancelada não pode ser alterada' using errcode = '23514';
  end if;

  if old.status = 'finalizada' then
    if new.status <> 'cancelada'
       or (new.client_unit_id, new.appointment_id, new.sold_by, new.discount_cents, new.notes)
          is distinct from (old.client_unit_id, old.appointment_id, old.sold_by, old.discount_cents, old.notes) then
      raise exception 'Comanda finalizada não pode ser alterada; cancele e abra outra' using errcode = '23514';
    end if;
  end if;

  -- Edição de comanda aberta
  if old.status = 'aberta'
     and (new.client_unit_id, new.appointment_id, new.sold_by, new.discount_cents, new.notes)
         is distinct from (old.client_unit_id, old.appointment_id, old.sold_by, old.discount_cents, old.notes) then
    if not public.has_permission(new.unit_id, 'sales.edit') then
      raise exception 'Sem permissão para editar comandas' using errcode = '42501';
    end if;
    new.total_cents := new.subtotal_cents - new.discount_cents;
    if new.total_cents < 0 then
      raise exception 'O desconto da comanda não pode ser maior que o subtotal' using errcode = '23514';
    end if;
  end if;

  if new.sold_by is distinct from old.sold_by and new.sold_by is not null
     and not public.is_active_unit_member(new.sold_by, new.unit_id) then
    raise exception 'Quem vendeu precisa ter vínculo ativo com a unidade' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'finalizada' then
      if not public.has_permission(new.unit_id, 'sales.finalize') then
        raise exception 'Sem permissão para finalizar comandas' using errcode = '42501';
      end if;
      if public.sale_items_count(new.id) = 0 then
        raise exception 'Comanda sem itens não pode ser finalizada' using errcode = '23514';
      end if;
      if public.sale_payments_total(new.id) <> new.total_cents then
        raise exception 'Pagamentos (%) diferentes do total da comanda (%)',
          public.sale_payments_total(new.id), new.total_cents using errcode = '23514';
      end if;
      new.sold_by := coalesce(new.sold_by, new.opened_by);
      if not public.is_active_unit_member(new.sold_by, new.unit_id) then
        raise exception 'Quem vendeu precisa ter vínculo ativo com a unidade' using errcode = '23514';
      end if;
      new.finalized_by := v_actor;
      new.finalized_at := now();
    elsif new.status = 'cancelada' then
      if not public.has_permission(new.unit_id, 'sales.cancel') then
        raise exception 'Sem permissão para cancelar comandas' using errcode = '42501';
      end if;
      new.cancelled_by := v_actor;
      new.cancelled_at := now();
    else
      raise exception 'Transição de situação não permitida' using errcode = '23514';
    end if;
  end if;

  if new.status = old.status then
    new.finalized_by := old.finalized_by; new.finalized_at := old.finalized_at;
    new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  end if;
  return new;
end;
$$;

create or replace function public.tg_sales_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'finalizada' and old.status = 'aberta' then
    perform public.apply_sale_stock(new.id, -1);
  elsif new.status = 'cancelada' and old.status = 'finalizada' then
    perform public.apply_sale_stock(new.id, 1);
  end if;
  return null;
end;
$$;

create or replace function public.tg_sale_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row record := case when tg_op = 'DELETE' then old else new end;
begin
  if tg_op = 'UPDATE' and new.sale_id is distinct from old.sale_id then
    raise exception 'Item ou pagamento não pode trocar de comanda' using errcode = '42501';
  end if;
  if public.is_server_context() then
    return v_row;
  end if;
  if public.sale_status_of(v_row.sale_id) is distinct from 'aberta' then
    raise exception 'Só é possível alterar itens e pagamentos de comanda aberta' using errcode = '23514';
  end if;
  if not public.has_permission(v_row.unit_id, 'sales.edit') then
    raise exception 'Sem permissão para editar comandas' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- Preenche descrição e preço a partir do cadastro quando não informados.
create or replace function public.tg_sale_items_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'servico' then
    select coalesce(new.description, s.name), coalesce(new.unit_price_cents, s.price_cents, 0)
      into new.description, new.unit_price_cents
    from public.services s where s.id = new.service_id and s.unit_id = new.unit_id;
  else
    select coalesce(new.description, p.name), coalesce(new.unit_price_cents, p.sale_price_cents, 0)
      into new.description, new.unit_price_cents
    from public.products p where p.id = new.product_id and p.unit_id = new.unit_id;
  end if;
  return new;
end;
$$;

create or replace function public.tg_sale_items_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalc_sale_totals(coalesce(new.sale_id, old.sale_id));
  return null;
end;
$$;

create trigger sales_number before insert on public.sales
  for each row execute function public.tg_sales_number();
create trigger sales_guard before insert or update on public.sales
  for each row execute function public.tg_sales_guard();
create trigger sales_after after update on public.sales
  for each row execute function public.tg_sales_after();
create trigger sale_items_defaults before insert on public.sale_items
  for each row execute function public.tg_sale_items_defaults();
create trigger sale_items_guard before insert or update or delete on public.sale_items
  for each row execute function public.tg_sale_children_guard();
create trigger sale_items_after after insert or update or delete on public.sale_items
  for each row execute function public.tg_sale_items_after();
create trigger sale_payments_guard before insert or update or delete on public.sale_payments
  for each row execute function public.tg_sale_children_guard();

-- -----------------------------------------------------------------------------
-- 7. Funções de clientes: busca de candidatos, cadastro, duplicidades e mescla
-- -----------------------------------------------------------------------------

-- Candidatos a mesma pessoa antes de cadastrar.
-- * Telefone ou e-mail idênticos: busca em todas as identidades; se a pessoa
--   não tem vínculo com esta unidade, devolve só o primeiro nome + inicial e os
--   4 últimos dígitos do telefone (nada de outra unidade é exposto).
-- * Nome: busca somente entre clientes desta unidade.
create or replace function public.find_client_candidates(
  p_unit_id uuid, p_full_name text, p_phone text, p_email text)
returns table (
  identity_id     uuid,
  client_unit_id  uuid,
  display_name    text,
  phone_hint      text,
  match           text,
  linked_here     boolean,
  archived        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name  text := nullif(public.normalize_name(p_full_name), '');
begin
  if not (public.has_permission(p_unit_id, 'clients.create') or public.has_permission(p_unit_id, 'clients.view')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return query
  with strong as (
    select i.id, case when v_phone is not null and i.phone = v_phone then 'telefone' else 'email' end as m
    from public.client_identities i
    where i.merged_into_id is null
      and ((v_phone is not null and i.phone = v_phone) or (v_email is not null and lower(i.email) = v_email))
  ),
  by_name as (
    select i.id, 'nome' as m
    from public.client_units cu
    join public.client_identities i on i.id = cu.identity_id
    where cu.unit_id = p_unit_id and v_name is not null and length(v_name) >= 3
      and public.normalize_name(i.full_name) like v_name || '%'
  ),
  hits as (
    select distinct on (x.id) x.id, x.m
    from (select * from strong union all select * from by_name) x
    order by x.id, case x.m when 'telefone' then 1 when 'email' then 2 else 3 end
  )
  select i.id, cu.id,
         case when cu.id is not null then i.full_name else public.mask_name(i.full_name) end,
         case when i.phone is null then null
              when cu.id is not null then i.phone
              else '…' || right(i.phone, 4) end,
         h.m, cu.id is not null, cu.archived_at is not null
  from hits h
  join public.client_identities i on i.id = h.id
  left join public.client_units cu on cu.identity_id = i.id and cu.unit_id = p_unit_id
  order by (cu.id is not null) desc, i.full_name
  limit 20;
end;
$$;

-- Cadastra cliente na unidade: cria identidade nova ou vincula uma existente.
-- Para vincular identidade existente é preciso informar o mesmo telefone ou
-- e-mail dela (a recepção só vincula quem ela consegue identificar).
create or replace function public.create_client(
  p_unit_id uuid,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_birth_date date default null,
  p_service_notes text default null,
  p_identity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_identity public.client_identities%rowtype;
  v_existing uuid;
  v_client uuid;
begin
  if not public.has_permission(p_unit_id, 'clients.create') then
    raise exception 'Sem permissão para cadastrar clientes' using errcode = '42501';
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and v_phone is null then
    raise exception 'Telefone inválido' using errcode = '23514';
  end if;

  if p_identity_id is not null then
    select * into v_identity from public.client_identities where id = p_identity_id and merged_into_id is null;
    if not found then
      raise exception 'Cadastro de origem não encontrado' using errcode = '22023';
    end if;
    if not ((v_phone is not null and v_identity.phone = v_phone)
            or (v_email is not null and lower(v_identity.email) = v_email)) then
      raise exception 'Para vincular um cadastro existente, informe o mesmo telefone ou e-mail' using errcode = '42501';
    end if;
    select id into v_existing from public.client_units where unit_id = p_unit_id and identity_id = p_identity_id;
    if v_existing is not null then
      update public.client_units set archived_at = null where id = v_existing and archived_at is not null;
      return v_existing;
    end if;
    -- Completa somente campos vazios da identidade; nunca sobrescreve.
    update public.client_identities
    set phone = coalesce(phone, v_phone),
        email = coalesce(email, v_email),
        birth_date = coalesce(birth_date, p_birth_date)
    where id = p_identity_id
      and (phone is null or email is null or birth_date is null);
  else
    insert into public.client_identities (full_name, phone, email, birth_date)
    values (p_full_name, v_phone, v_email, p_birth_date)
    returning * into v_identity;
  end if;

  insert into public.client_units (unit_id, identity_id, service_notes, source)
  values (p_unit_id, v_identity.id, nullif(btrim(coalesce(p_service_notes, '')), ''), 'manual')
  returning id into v_client;
  return v_client;
end;
$$;

-- Possíveis duplicidades dentro da unidade (mesmo telefone, mesmo e-mail ou
-- mesmo nome normalizado), excluindo pares já descartados.
create or replace function public.client_duplicate_candidates(p_unit_id uuid)
returns table (
  client_a uuid, name_a text, phone_a text, email_a text,
  client_b uuid, name_b text, phone_b text, email_b text,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_unit_id, 'clients.merge') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
  select a.id, ia.full_name, ia.phone, ia.email,
         b.id, ib.full_name, ib.phone, ib.email,
         case when ia.phone is not null and ia.phone = ib.phone then 'Mesmo telefone'
              when ia.email is not null and lower(ia.email) = lower(ib.email) then 'Mesmo e-mail'
              else 'Mesmo nome' end
  from public.client_units a
  join public.client_identities ia on ia.id = a.identity_id
  join public.client_units b on b.unit_id = a.unit_id and a.id < b.id
  join public.client_identities ib on ib.id = b.identity_id
  where a.unit_id = p_unit_id
    and a.archived_at is null and b.archived_at is null
    and ia.id <> ib.id
    and ((ia.phone is not null and ia.phone = ib.phone)
         or (ia.email is not null and lower(ia.email) = lower(ib.email))
         or public.normalize_name(ia.full_name) = public.normalize_name(ib.full_name))
    and not exists (select 1 from public.client_duplicate_dismissals d
                    where d.unit_id = p_unit_id and d.client_a = a.id and d.client_b = b.id)
  order by ia.full_name
  limit 200;
end;
$$;

create or replace function public.dismiss_client_duplicate(p_unit_id uuid, p_a uuid, p_b uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_unit_id, 'clients.merge') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into public.client_duplicate_dismissals (unit_id, client_a, client_b, reason, created_by)
  values (p_unit_id, least(p_a, p_b), greatest(p_a, p_b), p_reason, public.current_actor_id())
  on conflict do nothing;
end;
$$;

-- Mescla dois cadastros da MESMA unidade: o histórico da unidade (agenda,
-- comandas, CRM) passa para o cadastro mantido e o outro é arquivado. Nada de
-- outras unidades é alterado; a identidade do cadastro mesclado só é marcada
-- como mesclada se não tiver vínculo ativo em outra unidade.
create or replace function public.merge_clients(p_unit_id uuid, p_keep uuid, p_merge uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.client_units%rowtype;
  v_merge public.client_units%rowtype;
begin
  if not public.has_permission(p_unit_id, 'clients.merge') then
    raise exception 'Sem permissão para mesclar clientes' using errcode = '42501';
  end if;
  if p_keep = p_merge then
    raise exception 'Escolha dois cadastros diferentes' using errcode = '22023';
  end if;
  select * into v_keep from public.client_units where id = p_keep and unit_id = p_unit_id and archived_at is null;
  select * into v_merge from public.client_units where id = p_merge and unit_id = p_unit_id and archived_at is null;
  if v_keep.id is null or v_merge.id is null then
    raise exception 'Cadastros devem ser da mesma unidade e estar ativos' using errcode = '22023';
  end if;

  update public.appointments set client_id = p_keep where client_id = p_merge and unit_id = p_unit_id;
  update public.sales set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  update public.crm_interactions set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  delete from public.client_duplicate_dismissals
   where unit_id = p_unit_id and (client_a = p_merge or client_b = p_merge);

  update public.client_units
  set service_notes = nullif(concat_ws(E'\n', v_keep.service_notes, v_merge.service_notes), '')
  where id = p_keep;

  insert into public.crm_interactions (unit_id, client_unit_id, kind, body, created_by)
  values (p_unit_id, p_keep, 'nota', 'Cadastro mesclado com outro cadastro duplicado da unidade.', public.current_actor_id());

  update public.client_units
  set archived_at = now(), archived_by = public.current_actor_id(), merged_into_id = p_keep
  where id = p_merge;

  if v_keep.identity_id <> v_merge.identity_id then
    -- Completa campos vazios da identidade mantida.
    update public.client_identities k
    set phone = coalesce(k.phone, m.phone), email = coalesce(k.email, m.email),
        birth_date = coalesce(k.birth_date, m.birth_date)
    from public.client_identities m
    where k.id = v_keep.identity_id and m.id = v_merge.identity_id;

    if not exists (select 1 from public.client_units
                   where identity_id = v_merge.identity_id and archived_at is null) then
      update public.client_identities set merged_into_id = v_keep.identity_id where id = v_merge.identity_id;
    end if;
  end if;
  return p_keep;
end;
$$;

-- Pessoas ativas da unidade (nome e cargo, sem e-mail), para escolher quem
-- vendeu e para ligar profissional a usuário.
create or replace function public.unit_people(p_unit_id uuid)
returns table (user_id uuid, full_name text, job_title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission(p_unit_id, 'sales.edit') or public.has_permission(p_unit_id, 'sales.finalize')
          or public.has_permission(p_unit_id, 'professionals.manage')
          or public.has_unit_scope(p_unit_id, 'sales.view')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.job_title
  from public.unit_memberships m
  join public.profiles p on p.id = m.user_id and p.active
  where m.unit_id = p_unit_id and m.active
  order by p.full_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Painel e relatórios
-- -----------------------------------------------------------------------------

create or replace function public.operational_dashboard(p_unit_id uuid, p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_date, public.local_today());
  v_from timestamptz := (v_date::timestamp at time zone 'America/Sao_Paulo');
  v_to timestamptz := ((v_date + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_month timestamptz := (date_trunc('month', v_date)::timestamp at time zone 'America/Sao_Paulo');
  v_result jsonb := jsonb_build_object('date', v_date);
begin
  if not public.has_permission(p_unit_id, 'dashboard.view') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if public.has_unit_scope(p_unit_id, 'appointments.view') then
    v_result := v_result || jsonb_build_object('appointments', (
      select jsonb_build_object(
        'total', count(*) filter (where status <> 'cancelado'),
        'agendado', count(*) filter (where status = 'agendado'),
        'confirmado', count(*) filter (where status = 'confirmado'),
        'concluido', count(*) filter (where status = 'concluido'),
        'nao_compareceu', count(*) filter (where status = 'nao_compareceu'),
        'cancelado', count(*) filter (where status = 'cancelado'),
        'proximos', count(*) filter (where status in ('agendado', 'confirmado') and starts_at > now()))
      from public.appointments
      where unit_id = p_unit_id and starts_at >= v_from and starts_at < v_to));
  end if;

  if public.has_unit_scope(p_unit_id, 'sales.view') then
    v_result := v_result || jsonb_build_object('sales', (
      select jsonb_build_object(
        'finalizadas', count(*) filter (where status = 'finalizada'),
        'faturamento_cents', coalesce(sum(total_cents) filter (where status = 'finalizada'), 0),
        'ticket_medio_cents', coalesce(round(avg(total_cents) filter (where status = 'finalizada')), 0),
        'abertas', (select count(*) from public.sales s2 where s2.unit_id = p_unit_id and s2.status = 'aberta'))
      from public.sales
      where unit_id = p_unit_id and status = 'finalizada' and finalized_at >= v_from and finalized_at < v_to))
      || jsonb_build_object('month_sales', (
      select jsonb_build_object(
        'finalizadas', count(*),
        'faturamento_cents', coalesce(sum(total_cents), 0))
      from public.sales
      where unit_id = p_unit_id and status = 'finalizada' and finalized_at >= v_month and finalized_at < v_to))
      || jsonb_build_object('top_services', coalesce((
      select jsonb_agg(x order by x.quantidade desc) from (
        select i.description as nome, sum(i.quantity)::integer as quantidade, sum(i.total_cents)::integer as total_cents
        from public.sale_items i join public.sales s on s.id = i.sale_id
        where s.unit_id = p_unit_id and s.status = 'finalizada' and i.kind = 'servico'
          and s.finalized_at >= v_month and s.finalized_at < v_to
        group by i.description order by sum(i.quantity) desc limit 5) x), '[]'::jsonb));
  end if;

  if public.has_permission(p_unit_id, 'stock.view') then
    v_result := v_result || jsonb_build_object('low_stock', coalesce((
      select jsonb_agg(jsonb_build_object('id', ps.id, 'nome', ps.name, 'saldo', ps.quantity, 'minimo', ps.min_quantity)
                       order by ps.quantity)
      from (select p.id, p.name, p.min_quantity,
                   coalesce((select sum(m.quantity_delta) from public.stock_movements m where m.product_id = p.id), 0) as quantity
            from public.products p where p.unit_id = p_unit_id and p.active) ps
      where ps.quantity <= ps.min_quantity), '[]'::jsonb));
  end if;

  if public.has_permission(p_unit_id, 'clients.view') then
    v_result := v_result || jsonb_build_object('new_clients_month', (
      select count(*) from public.client_units
      where unit_id = p_unit_id and created_at >= v_month and merged_into_id is null));
  end if;
  return v_result;
end;
$$;

create or replace function public.report_sales(p_unit_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if not public.has_permission(p_unit_id, 'reports.view') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido (máximo de 1 ano)' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'totals', (select jsonb_build_object(
                 'comandas', count(*), 'faturamento_cents', coalesce(sum(total_cents), 0),
                 'descontos_cents', coalesce(sum(discount_cents), 0),
                 'ticket_medio_cents', coalesce(round(avg(total_cents)), 0))
               from public.sales s
               where s.unit_id = p_unit_id and s.status = 'finalizada'
                 and s.finalized_at >= v_from and s.finalized_at < v_to),
    'by_day', coalesce((select jsonb_agg(x order by x.dia) from (
                 select (s.finalized_at at time zone 'America/Sao_Paulo')::date as dia,
                        count(*) as comandas, sum(s.total_cents)::bigint as faturamento_cents
                 from public.sales s
                 where s.unit_id = p_unit_id and s.status = 'finalizada'
                   and s.finalized_at >= v_from and s.finalized_at < v_to
                 group by 1) x), '[]'::jsonb),
    'by_seller', coalesce((select jsonb_agg(x order by x.faturamento_cents desc) from (
                 select coalesce(p.full_name, 'Sem vendedor') as vendedor, count(*) as comandas,
                        sum(s.total_cents)::bigint as faturamento_cents
                 from public.sales s left join public.profiles p on p.id = s.sold_by
                 where s.unit_id = p_unit_id and s.status = 'finalizada'
                   and s.finalized_at >= v_from and s.finalized_at < v_to
                 group by 1) x), '[]'::jsonb),
    'by_professional', coalesce((select jsonb_agg(x order by x.total_cents desc) from (
                 select coalesce(pr.display_name, 'Sem profissional') as profissional,
                        sum(i.quantity)::integer as itens, sum(i.total_cents)::bigint as total_cents
                 from public.sale_items i
                 join public.sales s on s.id = i.sale_id
                 left join public.professionals pr on pr.id = i.professional_id
                 where s.unit_id = p_unit_id and s.status = 'finalizada' and i.kind = 'servico'
                   and s.finalized_at >= v_from and s.finalized_at < v_to
                 group by 1) x), '[]'::jsonb),
    'by_method', coalesce((select jsonb_agg(x order by x.total_cents desc) from (
                 select sp.method as forma, count(*) as pagamentos, sum(sp.amount_cents)::bigint as total_cents
                 from public.sale_payments sp join public.sales s on s.id = sp.sale_id
                 where s.unit_id = p_unit_id and s.status = 'finalizada'
                   and s.finalized_at >= v_from and s.finalized_at < v_to
                 group by 1) x), '[]'::jsonb),
    'by_item', coalesce((select jsonb_agg(x order by x.total_cents desc) from (
                 select i.kind as tipo, i.description as item, sum(i.quantity)::integer as quantidade,
                        sum(i.total_cents)::bigint as total_cents
                 from public.sale_items i join public.sales s on s.id = i.sale_id
                 where s.unit_id = p_unit_id and s.status = 'finalizada'
                   and s.finalized_at >= v_from and s.finalized_at < v_to
                 group by 1, 2 limit 100) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.report_appointments(p_unit_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if not public.has_permission(p_unit_id, 'reports.view') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido (máximo de 1 ano)' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(x order by x.profissional) from (
    select pr.display_name as profissional,
           count(*) filter (where a.status <> 'cancelado') as agendados,
           count(*) filter (where a.status = 'concluido') as concluidos,
           count(*) filter (where a.status = 'nao_compareceu') as faltas,
           count(*) filter (where a.status = 'cancelado') as cancelados
    from public.appointments a join public.professionals pr on pr.id = a.professional_id
    where a.unit_id = p_unit_id and a.starts_at >= v_from and a.starts_at < v_to
    group by pr.display_name) x), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Gatilhos padrão nas tabelas novas
-- -----------------------------------------------------------------------------

create trigger crm_interactions_stamp before insert or update on public.crm_interactions
  for each row execute function public.tg_stamp();
create trigger crm_interactions_unit before update on public.crm_interactions
  for each row execute function public.tg_unit_immutable();
create trigger products_stamp before insert or update on public.products
  for each row execute function public.tg_stamp();
create trigger products_unit before update on public.products
  for each row execute function public.tg_unit_immutable();
create trigger stock_movements_stamp before insert on public.stock_movements
  for each row execute function public.tg_stamp();
create trigger sales_stamp before insert or update on public.sales
  for each row execute function public.tg_stamp();
create trigger sales_unit before update on public.sales
  for each row execute function public.tg_unit_immutable();
create trigger sale_items_stamp before insert or update on public.sale_items
  for each row execute function public.tg_stamp();
create trigger sale_items_unit before update on public.sale_items
  for each row execute function public.tg_unit_immutable();
create trigger sale_payments_stamp before insert or update on public.sale_payments
  for each row execute function public.tg_stamp();
create trigger sale_payments_unit before update on public.sale_payments
  for each row execute function public.tg_unit_immutable();

do $$
declare
  t text;
begin
  foreach t in array array[
    'client_identities', 'crm_interactions', 'client_duplicate_dismissals', 'products',
    'stock_movements', 'sales', 'sale_items', 'sale_payments'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.tg_audit()', t || '_audit', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. RLS
-- -----------------------------------------------------------------------------

alter table public.client_identities enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.client_duplicate_dismissals enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.unit_sequences enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;

create policy client_identities_select on public.client_identities for select to authenticated
  using (public.can_view_identity(id));
create policy client_identities_update on public.client_identities for update to authenticated
  using (public.can_update_identity(id))
  with check (public.can_update_identity(id));

create policy crm_select on public.crm_interactions for select to authenticated
  using (public.has_permission(unit_id, 'crm.view'));
create policy crm_insert on public.crm_interactions for insert to authenticated
  with check (public.has_permission(unit_id, 'crm.write'));

create policy dismissals_select on public.client_duplicate_dismissals for select to authenticated
  using (public.has_permission(unit_id, 'clients.merge'));

drop policy appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated
  using (
    public.has_unit_scope(unit_id, 'appointments.view')
    or (public.has_permission(unit_id, 'appointments.view') and public.is_own_professional(professional_id))
  );

create policy products_select on public.products for select to authenticated
  using (public.has_permission(unit_id, 'stock.view') or public.has_permission(unit_id, 'sales.edit'));
create policy products_insert on public.products for insert to authenticated
  with check (public.has_permission(unit_id, 'stock.manage'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission(unit_id, 'stock.manage'))
  with check (public.has_permission(unit_id, 'stock.manage'));

create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_permission(unit_id, 'stock.view'));
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (public.has_permission(unit_id, 'stock.manage'));

create policy sales_select on public.sales for select to authenticated
  using (
    public.has_unit_scope(unit_id, 'sales.view')
    or (public.has_permission(unit_id, 'sales.view') and (select auth.uid()) in (opened_by, sold_by, finalized_by))
  );
create policy sales_insert on public.sales for insert to authenticated
  with check (public.has_permission(unit_id, 'sales.open'));
create policy sales_update on public.sales for update to authenticated
  using (public.has_permission(unit_id, 'sales.edit') or public.has_permission(unit_id, 'sales.finalize')
         or public.has_permission(unit_id, 'sales.cancel'))
  with check (public.has_permission(unit_id, 'sales.edit') or public.has_permission(unit_id, 'sales.finalize')
              or public.has_permission(unit_id, 'sales.cancel'));

create policy sale_items_select on public.sale_items for select to authenticated
  using (public.can_view_sale(sale_id));
create policy sale_items_insert on public.sale_items for insert to authenticated
  with check (public.has_permission(unit_id, 'sales.edit'));
create policy sale_items_update on public.sale_items for update to authenticated
  using (public.has_permission(unit_id, 'sales.edit'))
  with check (public.has_permission(unit_id, 'sales.edit'));
create policy sale_items_delete on public.sale_items for delete to authenticated
  using (public.has_permission(unit_id, 'sales.edit'));

create policy sale_payments_select on public.sale_payments for select to authenticated
  using (public.can_view_sale(sale_id));
create policy sale_payments_insert on public.sale_payments for insert to authenticated
  with check (public.has_permission(unit_id, 'sales.edit'));
create policy sale_payments_update on public.sale_payments for update to authenticated
  using (public.has_permission(unit_id, 'sales.edit'))
  with check (public.has_permission(unit_id, 'sales.edit'));
create policy sale_payments_delete on public.sale_payments for delete to authenticated
  using (public.has_permission(unit_id, 'sales.edit'));

-- -----------------------------------------------------------------------------
-- 11. Privilégios
-- -----------------------------------------------------------------------------

revoke all on public.client_identities, public.crm_interactions, public.client_duplicate_dismissals,
  public.products, public.stock_movements, public.unit_sequences, public.sales, public.sale_items,
  public.sale_payments, public.product_stock from anon, authenticated;

-- client_units: cadastro e vínculo só pelas funções create_client/merge_clients.
revoke insert on public.client_units from authenticated;
revoke update on public.client_units from authenticated;
grant update (service_notes, archived_at) on public.client_units to authenticated;

grant select on public.client_identities to authenticated;
grant update (full_name, phone, email, birth_date) on public.client_identities to authenticated;

grant select on public.crm_interactions to authenticated;
grant insert (unit_id, client_unit_id, kind, body, occurred_at) on public.crm_interactions to authenticated;

grant select on public.client_duplicate_dismissals to authenticated;

grant insert (specialty) on public.professionals to authenticated;
grant update (specialty) on public.professionals to authenticated;
grant insert (category) on public.services to authenticated;
grant update (category) on public.services to authenticated;

grant select on public.products, public.product_stock to authenticated;
grant insert (unit_id, name, sku, sale_price_cents, cost_cents, min_quantity, active) on public.products to authenticated;
grant update (name, sku, sale_price_cents, cost_cents, min_quantity, active) on public.products to authenticated;

grant select on public.stock_movements to authenticated;
grant insert (unit_id, product_id, kind, quantity_delta, unit_cost_cents, reason) on public.stock_movements to authenticated;

grant select on public.sales to authenticated;
grant insert (unit_id, client_unit_id, appointment_id, sold_by, notes) on public.sales to authenticated;
grant update (client_unit_id, appointment_id, sold_by, discount_cents, notes, status, cancel_reason)
  on public.sales to authenticated;

grant select, delete on public.sale_items to authenticated;
grant insert (unit_id, sale_id, kind, service_id, product_id, professional_id, description, quantity,
              unit_price_cents, discount_cents) on public.sale_items to authenticated;
grant update (professional_id, description, quantity, unit_price_cents, discount_cents)
  on public.sale_items to authenticated;

grant select, delete on public.sale_payments to authenticated;
grant insert (unit_id, sale_id, method, amount_cents, installments) on public.sale_payments to authenticated;
grant update (method, amount_cents, installments) on public.sale_payments to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function
  public.tg_client_identities_normalize(), public.tg_clients_guard(), public.tg_appointments_guard(),
  public.tg_stock_movements_guard(), public.tg_sales_number(), public.tg_sales_guard(), public.tg_sales_after(),
  public.tg_sale_children_guard(), public.tg_sale_items_defaults(), public.tg_sale_items_after(),
  public.recalc_sale_totals(uuid), public.apply_sale_stock(uuid, integer)
from authenticated;

grant execute on function
  public.normalize_phone(text), public.normalize_name(text), public.mask_name(text), public.local_today(),
  public.can_view_identity(uuid), public.can_update_identity(uuid),
  public.get_my_agenda(timestamptz, timestamptz),
  public.sale_status_of(uuid), public.sale_items_count(uuid), public.sale_payments_total(uuid),
  public.is_active_unit_member(uuid, uuid), public.can_view_sale(uuid),
  public.find_client_candidates(uuid, text, text, text),
  public.create_client(uuid, text, text, text, date, text, uuid),
  public.client_duplicate_candidates(uuid),
  public.dismiss_client_duplicate(uuid, uuid, uuid, text),
  public.merge_clients(uuid, uuid, uuid),
  public.unit_people(uuid),
  public.operational_dashboard(uuid, date),
  public.report_sales(uuid, date, date),
  public.report_appointments(uuid, date, date)
to authenticated;
