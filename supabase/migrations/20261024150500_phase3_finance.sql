-- =============================================================================
-- RC Beauty — Fase 3: financeiro, fluxo de caixa, conciliação e comissões
--
--   * Contas, categorias e lançamentos (receitas/despesas) por unidade.
--   * Fluxo de caixa realizado e previsto (vendas das comandas opcionais, para
--     não contar em dobro).
--   * Conciliação por CSV de banco/adquirente (sem API): linhas importadas,
--     sugestões e conciliação manual.
--   * Comissões configuráveis. Período, base de cálculo, estornos e fonte do
--     faturamento NÃO são presumidos: ficam nulos ("a confirmar") e o plano só
--     pode ser ativado e apurado com todos definidos.
-- =============================================================================

insert into public.permissions (code, module, action, module_label, description, allowed_scopes, sort_order) values
  ('finance.view', 'finance', 'view', 'Financeiro', 'Ver lançamentos, contas e fluxo de caixa da unidade', '{unit}', 300),
  ('finance.manage', 'finance', 'manage', 'Financeiro', 'Lançar e baixar receitas e despesas; contas e categorias', '{unit}', 301),
  ('finance.reconcile', 'finance', 'reconcile', 'Financeiro', 'Importar extratos (CSV) e conciliar', '{unit}', 302),
  ('commissions.view', 'commissions', 'view', 'Comissões', 'Ver apurações de comissão (as próprias ou da unidade)', '{own,unit}', 310),
  ('commissions.manage', 'commissions', 'manage', 'Comissões', 'Configurar regras e metas, apurar e aprovar comissões', '{unit}', 311);

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, p.code, 'unit'
from public.access_profiles ap cross join public.permissions p
where ap.key in ('admin_geral', 'direcao') and p.module in ('finance', 'commissions');

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, x.code, x.scope::public.access_scope
from (values
  ('gerente', 'finance.view', 'unit'), ('gerente', 'finance.manage', 'unit'), ('gerente', 'finance.reconcile', 'unit'),
  ('gerente', 'commissions.view', 'own'),
  ('vendedora', 'commissions.view', 'own'),
  ('profissional', 'commissions.view', 'own')
) as x(key, code, scope)
join public.access_profiles ap on ap.key = x.key;

-- -----------------------------------------------------------------------------
-- 1. Contas, categorias e lançamentos
-- -----------------------------------------------------------------------------

create table public.finance_accounts (
  id                     uuid primary key default gen_random_uuid(),
  unit_id                uuid not null references public.units (id) on delete restrict,
  name                   text not null check (length(btrim(name)) between 2 and 80),
  kind                   text not null check (kind in ('caixa', 'banco', 'adquirente', 'outro')),
  opening_balance_cents  integer not null default 0,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  unique (id, unit_id)
);
create unique index finance_accounts_name_uidx on public.finance_accounts (unit_id, lower(name)) where active;

create table public.finance_categories (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units (id) on delete restrict,
  name        text not null check (length(btrim(name)) between 2 and 80),
  kind        text not null check (kind in ('receita', 'despesa')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (id, unit_id)
);
create unique index finance_categories_name_uidx on public.finance_categories (unit_id, kind, lower(name)) where active;

insert into public.finance_categories (unit_id, name, kind)
select u.id, c.name, c.kind
from public.units u
cross join (values
  ('Serviços', 'receita'), ('Produtos', 'receita'), ('Outras receitas', 'receita'),
  ('Aluguel', 'despesa'), ('Folha de pagamento', 'despesa'), ('Comissões', 'despesa'),
  ('Produtos e estoque', 'despesa'), ('Impostos e taxas', 'despesa'), ('Tarifas bancárias e de cartão', 'despesa'),
  ('Marketing', 'despesa'), ('Outras despesas', 'despesa')
) as c(name, kind);

create table public.finance_entries (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete restrict,
  kind             text not null check (kind in ('receita', 'despesa')),
  category_id      uuid not null,
  description      text not null check (length(btrim(description)) between 2 and 200),
  amount_cents     integer not null check (amount_cents > 0),
  due_date         date not null,
  status           text not null default 'previsto' check (status in ('previsto', 'pago', 'cancelado')),
  paid_at          date,
  account_id       uuid,
  counterparty     text check (counterparty is null or length(counterparty) <= 120),
  document_ref     text check (document_ref is null or length(document_ref) <= 80),
  notes            text check (notes is null or length(notes) <= 1000),
  cancel_reason    text check (cancel_reason is null or length(cancel_reason) <= 500),
  source           text not null default 'manual' check (source in ('manual', 'comissao', 'extrato')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  unique (id, unit_id),
  foreign key (category_id, unit_id) references public.finance_categories (id, unit_id) on delete restrict,
  foreign key (account_id, unit_id) references public.finance_accounts (id, unit_id) on delete restrict,
  check (status <> 'pago' or (paid_at is not null and account_id is not null)),
  check (status <> 'cancelado' or cancel_reason is not null)
);
create index finance_entries_unit_due_idx on public.finance_entries (unit_id, due_date);
create index finance_entries_unit_paid_idx on public.finance_entries (unit_id, paid_at) where status = 'pago';

-- -----------------------------------------------------------------------------
-- 2. Conciliação (extratos CSV de banco/adquirente)
-- -----------------------------------------------------------------------------

create table public.bank_statements (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units (id) on delete restrict,
  account_id   uuid not null,
  file_name    text not null check (length(file_name) between 1 and 255),
  file_sha256  text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  line_count   integer not null check (line_count between 1 and 10000),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  unique (id, unit_id),
  unique (account_id, file_sha256),
  foreign key (account_id, unit_id) references public.finance_accounts (id, unit_id) on delete restrict
);

create table public.bank_statement_lines (
  id                uuid primary key default gen_random_uuid(),
  statement_id      uuid not null,
  unit_id           uuid not null,
  account_id        uuid not null,
  line_number       integer not null,
  line_date         date not null,
  description       text not null check (length(description) <= 300),
  amount_cents      integer not null check (amount_cents <> 0),
  status            text not null default 'pendente' check (status in ('pendente', 'conciliado', 'ignorado')),
  matched_entry_id  uuid,
  matched_by        uuid,
  matched_at        timestamptz,
  ignore_reason     text check (ignore_reason is null or length(ignore_reason) <= 300),
  unique (statement_id, line_number),
  foreign key (statement_id, unit_id) references public.bank_statements (id, unit_id) on delete restrict,
  foreign key (matched_entry_id, unit_id) references public.finance_entries (id, unit_id) on delete restrict,
  check ((status = 'conciliado') = (matched_entry_id is not null)),
  check (status <> 'ignorado' or ignore_reason is not null)
);
create unique index bank_statement_lines_entry_uidx on public.bank_statement_lines (matched_entry_id) where matched_entry_id is not null;
create index bank_statement_lines_pending_idx on public.bank_statement_lines (account_id, status, line_date);

create or replace function public.is_entry_reconciled(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bank_statement_lines where matched_entry_id = p_entry_id);
$$;

create or replace function public.finance_category_kind(p_category_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select kind from public.finance_categories where id = p_category_id;
$$;

create or replace function public.tg_finance_entries_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelado' then
      raise exception 'Lançamento novo não pode estar cancelado' using errcode = '23514';
    end if;
    if not public.is_server_context() and new.source <> 'manual' then
      raise exception 'Origem reservada ao sistema' using errcode = '42501';
    end if;
  else
    if public.is_server_context() then
      return new;
    end if;
    if new.source is distinct from old.source or new.kind is distinct from old.kind then
      raise exception 'Tipo e origem do lançamento não podem ser alterados' using errcode = '42501';
    end if;
    if old.status = 'cancelado' then
      raise exception 'Lançamento cancelado não pode ser alterado' using errcode = '23514';
    end if;
    if public.is_entry_reconciled(old.id)
       and (new.amount_cents, new.paid_at, new.account_id, new.status)
           is distinct from (old.amount_cents, old.paid_at, old.account_id, old.status) then
      raise exception 'Lançamento conciliado: desfaça a conciliação antes de alterar valor, data, conta ou situação'
        using errcode = '23514';
    end if;
    if old.status = 'pago' and new.amount_cents is distinct from old.amount_cents then
      raise exception 'Valor de lançamento pago não pode ser alterado; volte para previsto ou cancele' using errcode = '23514';
    end if;
  end if;
  if new.status <> 'pago' then
    new.paid_at := null;
  end if;
  if public.finance_category_kind(new.category_id) is distinct from new.kind then
    raise exception 'Categoria incompatível com o tipo do lançamento' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_entries_guard before insert or update on public.finance_entries
  for each row execute function public.tg_finance_entries_guard();

-- Importa linhas de extrato já interpretadas no navegador.
-- p_lines: [{"line_number":1,"line_date":"2026-01-05","description":"...","amount_cents":-1234}, ...]
create or replace function public.finance_import_statement(
  p_unit_id uuid, p_account_id uuid, p_file_name text, p_file_sha256 text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_line jsonb;
begin
  if not public.has_permission(p_unit_id, 'finance.reconcile') then
    raise exception 'Sem permissão para conciliar' using errcode = '42501';
  end if;
  if not exists (select 1 from public.finance_accounts where id = p_account_id and unit_id = p_unit_id and active) then
    raise exception 'Conta inválida' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 10000 then
    raise exception 'Envie de 1 a 10000 linhas' using errcode = '22023';
  end if;
  if exists (select 1 from public.bank_statements where account_id = p_account_id and file_sha256 = lower(p_file_sha256)) then
    raise exception 'Este extrato já foi importado nesta conta' using errcode = '23505';
  end if;
  insert into public.bank_statements (unit_id, account_id, file_name, file_sha256, line_count, created_by)
  values (p_unit_id, p_account_id, p_file_name, lower(p_file_sha256), jsonb_array_length(p_lines), public.current_actor_id())
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.bank_statement_lines (statement_id, unit_id, account_id, line_number, line_date, description, amount_cents)
    values (v_id, p_unit_id, p_account_id, (v_line ->> 'line_number')::integer, (v_line ->> 'line_date')::date,
            left(coalesce(v_line ->> 'description', ''), 300), (v_line ->> 'amount_cents')::integer);
  end loop;
  return v_id;
end;
$$;

-- Sugestões: lançamentos da unidade com mesmo valor absoluto, tipo compatível
-- (crédito = receita, débito = despesa), data até 7 dias de distância e ainda
-- não conciliados. A decisão é sempre humana.
create or replace function public.finance_match_suggestions(p_line_id uuid)
returns table (entry_id uuid, description text, due_date date, paid_at date, status text, days_apart integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.bank_statement_lines%rowtype;
begin
  select * into v from public.bank_statement_lines where id = p_line_id;
  if not found or not public.has_permission(v.unit_id, 'finance.reconcile') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
  select e.id, e.description, e.due_date, e.paid_at, e.status,
         abs(coalesce(e.paid_at, e.due_date) - v.line_date)::integer
  from public.finance_entries e
  where e.unit_id = v.unit_id and e.status <> 'cancelado'
    and e.amount_cents = abs(v.amount_cents)
    and e.kind = case when v.amount_cents > 0 then 'receita' else 'despesa' end
    and abs(coalesce(e.paid_at, e.due_date) - v.line_date) <= 7
    and (e.account_id is null or e.account_id = v.account_id or e.status = 'previsto')
    and not exists (select 1 from public.bank_statement_lines l where l.matched_entry_id = e.id)
  order by 6, e.due_date
  limit 10;
end;
$$;

-- Concilia uma linha com um lançamento; lançamento previsto passa a pago na
-- data da linha e na conta do extrato.
create or replace function public.finance_reconcile(p_line_id uuid, p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bank_statement_lines%rowtype;
  e public.finance_entries%rowtype;
  v_kind text;
begin
  select * into v from public.bank_statement_lines where id = p_line_id for update;
  if not found or not public.has_permission(v.unit_id, 'finance.reconcile') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v.status <> 'pendente' then
    raise exception 'Linha já tratada' using errcode = '22023';
  end if;
  select * into e from public.finance_entries where id = p_entry_id and unit_id = v.unit_id for update;
  if not found or e.status = 'cancelado' then
    raise exception 'Lançamento inválido' using errcode = '22023';
  end if;
  v_kind := case when v.amount_cents > 0 then 'receita' else 'despesa' end;
  if e.amount_cents <> abs(v.amount_cents) or e.kind <> v_kind then
    raise exception 'Valor ou tipo diferente da linha do extrato' using errcode = '23514';
  end if;
  if e.status = 'previsto' then
    update public.finance_entries set status = 'pago', paid_at = v.line_date, account_id = v.account_id where id = e.id;
  elsif e.account_id <> v.account_id then
    raise exception 'Lançamento pago em outra conta' using errcode = '23514';
  end if;
  update public.bank_statement_lines
  set status = 'conciliado', matched_entry_id = e.id, matched_by = public.current_actor_id(), matched_at = now()
  where id = v.id;
end;
$$;

-- Cria lançamento pago a partir da linha (ex.: tarifa bancária) e concilia.
create or replace function public.finance_create_from_line(p_line_id uuid, p_category_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bank_statement_lines%rowtype;
  v_entry uuid;
begin
  select * into v from public.bank_statement_lines where id = p_line_id for update;
  if not found or not public.has_permission(v.unit_id, 'finance.reconcile')
     or not public.has_permission(v.unit_id, 'finance.manage') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v.status <> 'pendente' then
    raise exception 'Linha já tratada' using errcode = '22023';
  end if;
  insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date, status, paid_at,
                                      account_id, source)
  values (v.unit_id, case when v.amount_cents > 0 then 'receita' else 'despesa' end, p_category_id,
          coalesce(nullif(btrim(p_description), ''), v.description), abs(v.amount_cents), v.line_date, 'pago', v.line_date,
          v.account_id, 'extrato')
  returning id into v_entry;
  update public.bank_statement_lines
  set status = 'conciliado', matched_entry_id = v_entry, matched_by = public.current_actor_id(), matched_at = now()
  where id = v.id;
  return v_entry;
end;
$$;

create or replace function public.finance_ignore_line(p_line_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bank_statement_lines%rowtype;
begin
  select * into v from public.bank_statement_lines where id = p_line_id for update;
  if not found or not public.has_permission(v.unit_id, 'finance.reconcile') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v.status <> 'pendente' then
    raise exception 'Linha já tratada' using errcode = '22023';
  end if;
  update public.bank_statement_lines
  set status = 'ignorado', ignore_reason = p_reason, matched_by = public.current_actor_id(), matched_at = now()
  where id = v.id;
end;
$$;

create or replace function public.finance_unreconcile(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bank_statement_lines%rowtype;
begin
  select * into v from public.bank_statement_lines where id = p_line_id for update;
  if not found or not public.has_permission(v.unit_id, 'finance.reconcile') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.bank_statement_lines
  set status = 'pendente', matched_entry_id = null, matched_by = null, matched_at = null, ignore_reason = null
  where id = v.id;
end;
$$;

-- Fluxo de caixa por dia: realizado (lançamentos pagos), previsto (lançamentos
-- previstos com vencimento no período) e, opcionalmente, pagamentos de
-- comandas finalizadas (quando as vendas não são lançadas manualmente).
create or replace function public.finance_cash_flow(p_unit_id uuid, p_from date, p_to date, p_include_sales boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_unit_id, 'finance.view') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido (máximo de 1 ano)' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'days', coalesce((select jsonb_agg(d order by d.dia) from (
      select g.dia,
        coalesce((select sum(amount_cents) from public.finance_entries e
                  where e.unit_id = p_unit_id and e.status = 'pago' and e.kind = 'receita' and e.paid_at = g.dia), 0)
        + case when p_include_sales then coalesce((
            select sum(sp.amount_cents) from public.sale_payments sp join public.sales s on s.id = sp.sale_id
            where s.unit_id = p_unit_id and s.status = 'finalizada'
              and (s.finalized_at at time zone 'America/Sao_Paulo')::date = g.dia), 0) else 0 end as entradas,
        coalesce((select sum(amount_cents) from public.finance_entries e
                  where e.unit_id = p_unit_id and e.status = 'pago' and e.kind = 'despesa' and e.paid_at = g.dia), 0) as saidas,
        coalesce((select sum(amount_cents) from public.finance_entries e
                  where e.unit_id = p_unit_id and e.status = 'previsto' and e.kind = 'receita' and e.due_date = g.dia), 0) as a_receber,
        coalesce((select sum(amount_cents) from public.finance_entries e
                  where e.unit_id = p_unit_id and e.status = 'previsto' and e.kind = 'despesa' and e.due_date = g.dia), 0) as a_pagar
      from (select d::date as dia from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d) g
      ) d where d.entradas <> 0 or d.saidas <> 0 or d.a_receber <> 0 or d.a_pagar <> 0), '[]'::jsonb),
    'by_category', coalesce((select jsonb_agg(c order by c.tipo, c.total_cents desc) from (
      select e.kind as tipo, cat.name as categoria, sum(e.amount_cents)::bigint as total_cents
      from public.finance_entries e join public.finance_categories cat on cat.id = e.category_id
      where e.unit_id = p_unit_id and e.status = 'pago' and e.paid_at between p_from and p_to
      group by 1, 2) c), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(a order by a.conta) from (
      select fa.name as conta, fa.kind as tipo,
             fa.opening_balance_cents + coalesce((select sum(case when e.kind = 'receita' then e.amount_cents else -e.amount_cents end)
               from public.finance_entries e where e.account_id = fa.id and e.status = 'pago' and e.paid_at <= p_to), 0) as saldo_cents
      from public.finance_accounts fa where fa.unit_id = p_unit_id and fa.active) a), '[]'::jsonb),
    'include_sales', p_include_sales
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Comissões configuráveis
-- -----------------------------------------------------------------------------

-- Modelos de referência (sem nomes de pessoas). Só preenchem tipo de meta e
-- faixas; o restante fica a confirmar.
create table public.commission_presets (
  key         text primary key,
  name        text not null,
  goal_type   text not null check (goal_type in ('individual', 'coletiva')),
  tiers       jsonb not null,
  notes       text not null
);
insert into public.commission_presets (key, name, goal_type, tiers, notes) values
  ('meta_individual_referencia', 'Meta individual (referência inicial das vendedoras)', 'individual',
   '[{"min_achievement_pct": 0, "rate_pct": 0.8}, {"min_achievement_pct": 100, "rate_pct": 2.0}]',
   'Referência: 0,8% abaixo de 100% da meta individual; 2% ao atingir. Período, base, estornos e fonte do faturamento a confirmar.'),
  ('meta_coletiva_referencia', 'Meta coletiva (referência inicial da gerente)', 'coletiva',
   '[{"min_achievement_pct": 0, "rate_pct": 0.5}, {"min_achievement_pct": 100, "rate_pct": 1.5}]',
   'Referência: 0,5% abaixo de 100% da meta coletiva; 1,5% ao atingir. Período, base, estornos e fonte do faturamento a confirmar.');

create table public.commission_plans (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.units (id) on delete restrict,
  name              text not null check (length(btrim(name)) between 3 and 120),
  beneficiary_id    uuid not null references public.profiles (id) on delete restrict,
  goal_type         text not null check (goal_type in ('individual', 'coletiva')),
  -- Parâmetros a confirmar (NULL = não definido; impede ativar e apurar):
  revenue_source    text check (revenue_source in ('comandas_finalizadas', 'pagamentos_recebidos', 'valor_informado')),
  base_scope        text check (base_scope in ('vendas_do_beneficiario', 'servicos_do_beneficiario', 'vendas_da_unidade')),
  item_filter       text check (item_filter in ('todos', 'servicos', 'produtos')),
  amount_basis      text check (amount_basis in ('bruto_itens', 'liquido_comanda')),
  period_type       text check (period_type in ('mensal')),
  period_start_day  smallint check (period_start_day between 1 and 28),
  refund_policy     text check (refund_policy in ('excluir_canceladas_ate_apuracao', 'descontar_no_periodo_do_cancelamento')),
  tier_mode         text check (tier_mode in ('faixa_sobre_total', 'progressiva')),
  check (not (revenue_source = 'pagamentos_recebidos' and base_scope = 'servicos_do_beneficiario')),
  status            text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'inativo')),
  activated_by      uuid,
  activated_at      timestamptz,
  preset_key        text references public.commission_presets (key),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  unique (id, unit_id)
);

create table public.commission_plan_tiers (
  plan_id               uuid not null references public.commission_plans (id) on delete cascade,
  min_achievement_pct   numeric(6,2) not null check (min_achievement_pct >= 0),
  rate_pct              numeric(6,3) not null check (rate_pct >= 0 and rate_pct <= 100),
  primary key (plan_id, min_achievement_pct)
);

create table public.commission_goals (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.commission_plans (id) on delete restrict,
  period_start  date not null,
  period_end    date not null,
  goal_cents    integer not null check (goal_cents > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  unique (plan_id, period_start),
  check (period_end >= period_start)
);

create table public.commission_statements (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.units (id) on delete restrict,
  plan_id           uuid not null,
  beneficiary_id    uuid not null references public.profiles (id) on delete restrict,
  period_start      date not null,
  period_end        date not null,
  revenue_cents     integer not null check (revenue_cents >= 0),
  adjustments_cents integer not null default 0,
  goal_cents        integer not null check (goal_cents > 0),
  achievement_pct   numeric(8,2) not null,
  rate_pct          numeric(6,3) not null,
  commission_cents  integer not null check (commission_cents >= 0),
  parameters        jsonb not null,
  status            text not null default 'calculada' check (status in ('calculada', 'aprovada', 'paga', 'cancelada')),
  calculated_by     uuid,
  calculated_at     timestamptz not null default now(),
  approved_by       uuid,
  approved_at       timestamptz,
  finance_entry_id  uuid,
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (plan_id, unit_id) references public.commission_plans (id, unit_id) on delete restrict,
  foreign key (finance_entry_id, unit_id) references public.finance_entries (id, unit_id) on delete restrict,
  check (status <> 'cancelada' or cancel_reason is not null)
);
create unique index commission_statements_once_uidx
  on public.commission_statements (plan_id, period_start) where status <> 'cancelada';

create or replace function public.commission_plan_pending(p public.commission_plans)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p.revenue_source is null then 'fonte do faturamento' end,
    case when p.revenue_source is distinct from 'valor_informado' and p.base_scope is null then 'base de cálculo' end,
    case when p.revenue_source is distinct from 'valor_informado' and p.item_filter is null then 'itens considerados' end,
    case when p.revenue_source = 'comandas_finalizadas' and p.amount_basis is null then 'valor considerado (bruto ou líquido)' end,
    case when p.period_type is null or p.period_start_day is null then 'período' end,
    case when p.refund_policy is null then 'tratamento de estornos' end,
    case when p.tier_mode is null then 'forma de aplicar as faixas' end
  ], null);
$$;

create or replace function public.tg_commission_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_server_context() then
    return new;
  end if;
  if new.beneficiary_id = (select auth.uid()) or (tg_op = 'UPDATE' and old.beneficiary_id = (select auth.uid())) then
    raise exception 'Ninguém configura a própria comissão' using errcode = '42501';
  end if;
  if not public.is_active_unit_member(new.beneficiary_id, new.unit_id) and tg_op = 'INSERT' then
    raise exception 'Beneficiário precisa ter vínculo ativo com a unidade' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.status <> 'rascunho' then
    raise exception 'Plano novo começa como rascunho' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'ativo' and new.status = 'ativo'
       and (new.revenue_source, new.base_scope, new.item_filter, new.amount_basis, new.period_type, new.period_start_day,
            new.refund_policy, new.tier_mode, new.goal_type, new.beneficiary_id)
           is distinct from
           (old.revenue_source, old.base_scope, old.item_filter, old.amount_basis, old.period_type, old.period_start_day,
            old.refund_policy, old.tier_mode, old.goal_type, old.beneficiary_id) then
      raise exception 'Plano ativo não muda regras; volte para rascunho' using errcode = '23514';
    end if;
    if new.status = 'ativo' and old.status <> 'ativo' then
      if cardinality(public.commission_plan_pending(new)) > 0 then
        raise exception 'Defina antes de ativar: %', array_to_string(public.commission_plan_pending(new), ', ')
          using errcode = '23514';
      end if;
      if not exists (select 1 from public.commission_plan_tiers t where t.plan_id = new.id) then
        raise exception 'Defina ao menos uma faixa' using errcode = '23514';
      end if;
      new.activated_by := public.current_actor_id();
      new.activated_at := now();
    elsif new.status <> 'ativo' then
      new.activated_by := null;
      new.activated_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger commission_plans_guard before insert or update on public.commission_plans
  for each row execute function public.tg_commission_plans_guard();

create or replace function public.commission_plan_beneficiary(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select beneficiary_id from public.commission_plans where id = p_plan_id;
$$;

create or replace function public.commission_plan_unit(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select unit_id from public.commission_plans where id = p_plan_id;
$$;

create or replace function public.commission_plan_status(p_plan_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.commission_plans where id = p_plan_id;
$$;

create or replace function public.tg_commission_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan uuid := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
begin
  if public.is_server_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if public.commission_plan_beneficiary(v_plan) = (select auth.uid()) then
    raise exception 'Ninguém configura a própria comissão' using errcode = '42501';
  end if;
  if tg_table_name = 'commission_plan_tiers' and public.commission_plan_status(v_plan) = 'ativo' then
    raise exception 'Plano ativo não muda faixas; volte para rascunho' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger commission_plan_tiers_guard before insert or update or delete on public.commission_plan_tiers
  for each row execute function public.tg_commission_children_guard();
create trigger commission_goals_guard before insert or update or delete on public.commission_goals
  for each row execute function public.tg_commission_children_guard();

create or replace function public.commission_create_plan_from_preset(
  p_unit_id uuid, p_preset_key text, p_beneficiary_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_preset public.commission_presets%rowtype;
  v_plan uuid;
  v_tier jsonb;
begin
  select * into v_preset from public.commission_presets where key = p_preset_key;
  if not found then
    raise exception 'Modelo inexistente' using errcode = '22023';
  end if;
  insert into public.commission_plans (unit_id, name, beneficiary_id, goal_type, preset_key)
  values (p_unit_id, p_name, p_beneficiary_id, v_preset.goal_type, v_preset.key)
  returning id into v_plan;
  for v_tier in select * from jsonb_array_elements(v_preset.tiers) loop
    insert into public.commission_plan_tiers (plan_id, min_achievement_pct, rate_pct)
    values (v_plan, (v_tier ->> 'min_achievement_pct')::numeric, (v_tier ->> 'rate_pct')::numeric);
  end loop;
  return v_plan;
end;
$$;

-- Base de cálculo no período conforme os parâmetros do plano.
create or replace function public.commission_base_cents(p public.commission_plans, p_from date, p_to date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_total bigint;
begin
  if p.revenue_source = 'comandas_finalizadas' then
    select coalesce(sum(
      case when p.amount_basis = 'liquido_comanda' and s.subtotal_cents > 0
           then round(i.total_cents::numeric * s.total_cents / s.subtotal_cents)
           else i.total_cents end), 0)
    into v_total
    from public.sales s
    join public.sale_items i on i.sale_id = s.id
    left join public.professionals pr on pr.id = i.professional_id
    where s.unit_id = p.unit_id
      and s.finalized_at >= v_from and s.finalized_at < v_to
      and (s.status = 'finalizada'
           or (s.status = 'cancelada' and p.refund_policy = 'descontar_no_periodo_do_cancelamento'))
      and (p.item_filter = 'todos' or (p.item_filter = 'servicos' and i.kind = 'servico')
           or (p.item_filter = 'produtos' and i.kind = 'produto'))
      and (p.base_scope = 'vendas_da_unidade'
           or (p.base_scope = 'vendas_do_beneficiario' and s.sold_by = p.beneficiary_id)
           or (p.base_scope = 'servicos_do_beneficiario' and pr.user_id = p.beneficiary_id));
    -- Estornos de comandas canceladas no período (vendidas antes) quando a
    -- política é descontar no período do cancelamento.
    if p.refund_policy = 'descontar_no_periodo_do_cancelamento' then
      select v_total - coalesce(sum(
        case when p.amount_basis = 'liquido_comanda' and s.subtotal_cents > 0
             then round(i.total_cents::numeric * s.total_cents / s.subtotal_cents)
             else i.total_cents end), 0)
      into v_total
      from public.sales s
      join public.sale_items i on i.sale_id = s.id
      left join public.professionals pr on pr.id = i.professional_id
      where s.unit_id = p.unit_id and s.status = 'cancelada'
        and s.finalized_at is not null
        and s.cancelled_at >= v_from and s.cancelled_at < v_to
        and (p.item_filter = 'todos' or (p.item_filter = 'servicos' and i.kind = 'servico')
             or (p.item_filter = 'produtos' and i.kind = 'produto'))
        and (p.base_scope = 'vendas_da_unidade'
             or (p.base_scope = 'vendas_do_beneficiario' and s.sold_by = p.beneficiary_id)
             or (p.base_scope = 'servicos_do_beneficiario' and pr.user_id = p.beneficiary_id));
    end if;
  elsif p.revenue_source = 'pagamentos_recebidos' then
    select coalesce(sum(sp.amount_cents), 0) into v_total
    from public.sale_payments sp join public.sales s on s.id = sp.sale_id
    where s.unit_id = p.unit_id and s.status = 'finalizada'
      and s.finalized_at >= v_from and s.finalized_at < v_to
      and (p.base_scope = 'vendas_da_unidade' or (p.base_scope = 'vendas_do_beneficiario' and s.sold_by = p.beneficiary_id));
  else
    raise exception 'Fonte do faturamento informada manualmente' using errcode = '22023';
  end if;
  return greatest(v_total, 0)::integer;
end;
$$;

create or replace function public.commission_calculate(p_plan_id uuid, p_period_start date, p_manual_revenue_cents integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.commission_plans%rowtype;
  g public.commission_goals%rowtype;
  v_revenue integer;
  v_pct numeric;
  v_rate numeric;
  v_commission numeric;
  v_tier record;
  v_prev_min numeric;
  v_prev_rate numeric;
  v_id uuid;
begin
  select * into p from public.commission_plans where id = p_plan_id;
  if not found or not public.has_permission(p.unit_id, 'commissions.manage') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p.beneficiary_id = (select auth.uid()) then
    raise exception 'Ninguém apura a própria comissão' using errcode = '42501';
  end if;
  if p.status <> 'ativo' then
    raise exception 'Plano precisa estar ativo (parâmetros confirmados)' using errcode = '23514';
  end if;
  select * into g from public.commission_goals where plan_id = p_plan_id and period_start = p_period_start;
  if not found then
    raise exception 'Cadastre a meta do período antes de apurar' using errcode = '23514';
  end if;

  if p.revenue_source = 'valor_informado' then
    if p_manual_revenue_cents is null or p_manual_revenue_cents < 0 then
      raise exception 'Informe o faturamento do período' using errcode = '22023';
    end if;
    v_revenue := p_manual_revenue_cents;
  else
    v_revenue := public.commission_base_cents(p, g.period_start, g.period_end);
  end if;

  v_pct := round(v_revenue::numeric * 100 / g.goal_cents, 2);
  select rate_pct into v_rate from public.commission_plan_tiers
  where plan_id = p_plan_id and min_achievement_pct <= v_pct order by min_achievement_pct desc limit 1;
  v_rate := coalesce(v_rate, 0);

  if p.tier_mode = 'faixa_sobre_total' then
    v_commission := v_revenue * v_rate / 100;
  else
    -- Progressiva: cada faixa incide sobre a parte da base correspondente.
    v_commission := 0;
    v_prev_min := null;
    for v_tier in select * from public.commission_plan_tiers where plan_id = p_plan_id order by min_achievement_pct loop
      if v_prev_min is not null then
        v_commission := v_commission + greatest(least(v_revenue, g.goal_cents * v_tier.min_achievement_pct / 100)
                                                - g.goal_cents * v_prev_min / 100, 0) * v_prev_rate / 100;
      end if;
      v_prev_min := v_tier.min_achievement_pct;
      v_prev_rate := v_tier.rate_pct;
    end loop;
    if v_prev_min is not null then
      v_commission := v_commission + greatest(v_revenue - g.goal_cents * v_prev_min / 100, 0) * v_prev_rate / 100;
    end if;
  end if;

  insert into public.commission_statements (unit_id, plan_id, beneficiary_id, period_start, period_end, revenue_cents,
    goal_cents, achievement_pct, rate_pct, commission_cents, parameters, calculated_by)
  values (p.unit_id, p.id, p.beneficiary_id, g.period_start, g.period_end, v_revenue, g.goal_cents, v_pct, v_rate,
    round(v_commission)::integer,
    jsonb_build_object('revenue_source', p.revenue_source, 'base_scope', p.base_scope, 'item_filter', p.item_filter,
      'amount_basis', p.amount_basis, 'refund_policy', p.refund_policy, 'tier_mode', p.tier_mode,
      'tiers', (select jsonb_agg(jsonb_build_object('min_achievement_pct', min_achievement_pct, 'rate_pct', rate_pct)
                                 order by min_achievement_pct) from public.commission_plan_tiers where plan_id = p.id)),
    public.current_actor_id())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.commission_set_status(p_statement_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.commission_statements%rowtype;
  v_category uuid;
  v_entry uuid;
begin
  select * into s from public.commission_statements where id = p_statement_id for update;
  if not found or not public.has_permission(s.unit_id, 'commissions.manage') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if s.beneficiary_id = (select auth.uid()) then
    raise exception 'Ninguém aprova ou paga a própria comissão' using errcode = '42501';
  end if;
  if p_status = 'aprovada' and s.status = 'calculada' then
    if s.calculated_by = public.current_actor_id() then
      raise exception 'A apuração deve ser aprovada por outra pessoa' using errcode = '42501';
    end if;
    update public.commission_statements set status = 'aprovada', approved_by = public.current_actor_id(), approved_at = now()
    where id = s.id;
  elsif p_status = 'paga' and s.status = 'aprovada' then
    if not public.has_permission(s.unit_id, 'finance.manage') then
      raise exception 'Gerar o pagamento exige permissão financeira' using errcode = '42501';
    end if;
    select id into v_category from public.finance_categories
    where unit_id = s.unit_id and kind = 'despesa' and lower(name) = 'comissões' and active limit 1;
    if v_category is null then
      raise exception 'Cadastre a categoria de despesa "Comissões"' using errcode = '23514';
    end if;
    if s.commission_cents > 0 then
      insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date, source, counterparty)
      values (s.unit_id, 'despesa', v_category,
              'Comissão ' || to_char(s.period_start, 'DD/MM/YYYY') || '–' || to_char(s.period_end, 'DD/MM/YYYY'),
              s.commission_cents, public.local_today(), 'comissao',
              (select full_name from public.profiles where id = s.beneficiary_id))
      returning id into v_entry;
    end if;
    update public.commission_statements set status = 'paga', finance_entry_id = v_entry where id = s.id;
  elsif p_status = 'cancelada' and s.status in ('calculada', 'aprovada') then
    if p_reason is null or length(btrim(p_reason)) < 3 then
      raise exception 'Informe o motivo' using errcode = '22023';
    end if;
    update public.commission_statements set status = 'cancelada', cancel_reason = p_reason where id = s.id;
  else
    raise exception 'Transição não permitida' using errcode = '23514';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Gatilhos padrão, RLS e privilégios
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['finance_accounts', 'finance_categories', 'finance_entries', 'commission_plans', 'commission_goals',
                           'commission_statements'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_stamp()',
                   t || '_stamp', t);
  end loop;
  foreach t in array array['finance_accounts', 'finance_categories', 'finance_entries', 'commission_plans', 'commission_statements'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_unit_immutable()',
                   t || '_unit', t);
  end loop;
  foreach t in array array['finance_accounts', 'finance_categories', 'finance_entries', 'bank_statements', 'bank_statement_lines',
                           'commission_plans', 'commission_plan_tiers', 'commission_goals', 'commission_statements'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_audit()',
                   t || '_audit', t);
  end loop;
end;
$$;

alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_entries enable row level security;
alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;
alter table public.commission_presets enable row level security;
alter table public.commission_plans enable row level security;
alter table public.commission_plan_tiers enable row level security;
alter table public.commission_goals enable row level security;
alter table public.commission_statements enable row level security;

create policy finance_accounts_select on public.finance_accounts for select to authenticated
  using (public.has_permission(unit_id, 'finance.view') or public.has_permission(unit_id, 'finance.reconcile'));
create policy finance_accounts_insert on public.finance_accounts for insert to authenticated
  with check (public.has_permission(unit_id, 'finance.manage'));
create policy finance_accounts_update on public.finance_accounts for update to authenticated
  using (public.has_permission(unit_id, 'finance.manage')) with check (public.has_permission(unit_id, 'finance.manage'));

create policy finance_categories_select on public.finance_categories for select to authenticated
  using (public.has_permission(unit_id, 'finance.view') or public.has_permission(unit_id, 'finance.reconcile'));
create policy finance_categories_insert on public.finance_categories for insert to authenticated
  with check (public.has_permission(unit_id, 'finance.manage'));
create policy finance_categories_update on public.finance_categories for update to authenticated
  using (public.has_permission(unit_id, 'finance.manage')) with check (public.has_permission(unit_id, 'finance.manage'));

create policy finance_entries_select on public.finance_entries for select to authenticated
  using (public.has_permission(unit_id, 'finance.view') or public.has_permission(unit_id, 'finance.reconcile'));
create policy finance_entries_insert on public.finance_entries for insert to authenticated
  with check (public.has_permission(unit_id, 'finance.manage'));
create policy finance_entries_update on public.finance_entries for update to authenticated
  using (public.has_permission(unit_id, 'finance.manage')) with check (public.has_permission(unit_id, 'finance.manage'));

create policy bank_statements_select on public.bank_statements for select to authenticated
  using (public.has_permission(unit_id, 'finance.reconcile'));
create policy bank_statement_lines_select on public.bank_statement_lines for select to authenticated
  using (public.has_permission(unit_id, 'finance.reconcile'));

create policy commission_presets_select on public.commission_presets for select to authenticated using (true);

create policy commission_plans_select on public.commission_plans for select to authenticated
  using (public.has_permission(unit_id, 'commissions.manage')
         or public.has_unit_scope(unit_id, 'commissions.view')
         or (public.has_permission(unit_id, 'commissions.view') and beneficiary_id = (select auth.uid())));
create policy commission_plans_insert on public.commission_plans for insert to authenticated
  with check (public.has_permission(unit_id, 'commissions.manage'));
create policy commission_plans_update on public.commission_plans for update to authenticated
  using (public.has_permission(unit_id, 'commissions.manage')) with check (public.has_permission(unit_id, 'commissions.manage'));

create policy commission_plan_tiers_select on public.commission_plan_tiers for select to authenticated
  using (exists (select 1 from public.commission_plans p where p.id = plan_id));
create policy commission_plan_tiers_write on public.commission_plan_tiers for all to authenticated
  using (public.has_permission(public.commission_plan_unit(plan_id), 'commissions.manage'))
  with check (public.has_permission(public.commission_plan_unit(plan_id), 'commissions.manage'));

create policy commission_goals_select on public.commission_goals for select to authenticated
  using (exists (select 1 from public.commission_plans p where p.id = plan_id));
create policy commission_goals_insert on public.commission_goals for insert to authenticated
  with check (public.has_permission(public.commission_plan_unit(plan_id), 'commissions.manage'));
create policy commission_goals_update on public.commission_goals for update to authenticated
  using (public.has_permission(public.commission_plan_unit(plan_id), 'commissions.manage'))
  with check (public.has_permission(public.commission_plan_unit(plan_id), 'commissions.manage'));

create policy commission_statements_select on public.commission_statements for select to authenticated
  using (public.has_permission(unit_id, 'commissions.manage')
         or public.has_unit_scope(unit_id, 'commissions.view')
         or (public.has_permission(unit_id, 'commissions.view') and beneficiary_id = (select auth.uid())));

revoke all on public.finance_accounts, public.finance_categories, public.finance_entries, public.bank_statements,
  public.bank_statement_lines, public.commission_presets, public.commission_plans, public.commission_plan_tiers,
  public.commission_goals, public.commission_statements from anon, authenticated;

grant select on public.finance_accounts, public.finance_categories, public.finance_entries, public.bank_statements,
  public.bank_statement_lines, public.commission_presets, public.commission_plans, public.commission_plan_tiers,
  public.commission_goals, public.commission_statements to authenticated;
grant insert (unit_id, name, kind, opening_balance_cents, active) on public.finance_accounts to authenticated;
grant update (name, opening_balance_cents, active) on public.finance_accounts to authenticated;
grant insert (unit_id, name, kind, active) on public.finance_categories to authenticated;
grant update (name, active) on public.finance_categories to authenticated;
grant insert (unit_id, kind, category_id, description, amount_cents, due_date, status, paid_at, account_id, counterparty,
              document_ref, notes) on public.finance_entries to authenticated;
grant update (category_id, description, amount_cents, due_date, status, paid_at, account_id, counterparty, document_ref,
              notes, cancel_reason) on public.finance_entries to authenticated;
grant insert (unit_id, name, beneficiary_id, goal_type, revenue_source, base_scope, item_filter, amount_basis, period_type,
              period_start_day, refund_policy, tier_mode, preset_key) on public.commission_plans to authenticated;
grant update (name, goal_type, revenue_source, base_scope, item_filter, amount_basis, period_type, period_start_day,
              refund_policy, tier_mode, status) on public.commission_plans to authenticated;
grant insert, update, delete on public.commission_plan_tiers to authenticated;
grant insert (plan_id, period_start, period_end, goal_cents) on public.commission_goals to authenticated;
grant update (period_end, goal_cents) on public.commission_goals to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.tg_finance_entries_guard(), public.tg_commission_plans_guard(),
  public.tg_commission_children_guard(), public.commission_base_cents(public.commission_plans, date, date)
from authenticated;
grant execute on function
  public.is_entry_reconciled(uuid),
  public.finance_category_kind(uuid),
  public.finance_import_statement(uuid, uuid, text, text, jsonb),
  public.finance_match_suggestions(uuid),
  public.finance_reconcile(uuid, uuid),
  public.finance_create_from_line(uuid, uuid, text),
  public.finance_ignore_line(uuid, text),
  public.finance_unreconcile(uuid),
  public.finance_cash_flow(uuid, date, date, boolean),
  public.commission_plan_pending(public.commission_plans),
  public.commission_plan_beneficiary(uuid),
  public.commission_plan_unit(uuid),
  public.commission_plan_status(uuid),
  public.commission_create_plan_from_preset(uuid, text, uuid, text),
  public.commission_calculate(uuid, date, integer),
  public.commission_set_status(uuid, text, text)
to authenticated;
