-- Fase 3 — financeiro, conciliação por CSV e comissões configuráveis.
begin;
\ir ../helpers/setup.psql

select no_plan();

select tests.create_person('dir');
select tests.create_person('dir2');
select tests.create_person('ger');
select tests.create_person('ger_vip');
select tests.create_person('vend');
select tests.create_person('prof');
select tests.create_person('recep');
select tests.link('dir', 'geral', 'direcao');
select tests.link('dir', 'vip', 'direcao');
select tests.link('dir2', 'geral', 'direcao');
select tests.link('dir2', 'vip', 'direcao');
select tests.link('ger', 'geral', 'gerente');
select tests.link('ger_vip', 'vip', 'gerente');
select tests.link('vend', 'geral', 'vendedora');
select tests.link('prof', 'geral', 'profissional');
select tests.link('recep', 'geral', 'recepcao');

-- Categorias resolvidas pelo administrador do banco (a Recepção não as enxerga).
insert into test_ids (k, v)
select 'cat:' || u.code || ':' || c.name, c.id
from public.finance_categories c join public.units u on u.id = c.unit_id;
create function tests.category(p_unit text, p_name text) returns uuid language sql stable as $$
  select tests.id('cat:' || p_unit || ':' || p_name)
$$;
grant execute on function tests.category(text, text) to authenticated;

insert into test_ids (k, v) values ('acc_banco', gen_random_uuid()), ('acc_caixa', gen_random_uuid()),
  ('svc', gen_random_uuid()), ('pro', gen_random_uuid()), ('id_cli', gen_random_uuid()), ('cu', gen_random_uuid()),
  ('s1', gen_random_uuid()), ('s2', gen_random_uuid());
insert into public.finance_accounts (id, unit_id, name, kind, opening_balance_cents) values
  (tests.id('acc_banco'), tests.unit('geral'), 'Banco Teste', 'banco', 1000000),
  (tests.id('acc_caixa'), tests.unit('geral'), 'Caixa', 'caixa', 0);
insert into public.services (id, unit_id, name, duration_minutes, price_cents) values
  (tests.id('svc'), tests.unit('geral'), 'Corte', 60, 50000);
insert into public.professionals (id, unit_id, user_id, display_name) values
  (tests.id('pro'), tests.unit('geral'), tests.id('prof'), 'Prof');
insert into public.client_identities (id, full_name) values (tests.id('id_cli'), 'Cliente Financeiro');
insert into public.client_units (id, unit_id, identity_id) values (tests.id('cu'), tests.unit('geral'), tests.id('id_cli'));

-- Comandas finalizadas (dados preparados pelo administrador do banco)
insert into public.sales (id, unit_id, client_unit_id, opened_by, sold_by) values
  (tests.id('s1'), tests.unit('geral'), tests.id('cu'), tests.id('recep'), tests.id('vend')),
  (tests.id('s2'), tests.unit('geral'), tests.id('cu'), tests.id('recep'), tests.id('vend'));
insert into public.sale_items (unit_id, sale_id, kind, service_id, professional_id, quantity) values
  (tests.unit('geral'), tests.id('s1'), 'servico', tests.id('svc'), tests.id('pro'), 1),
  (tests.unit('geral'), tests.id('s2'), 'servico', tests.id('svc'), tests.id('pro'), 2);
insert into public.sale_payments (unit_id, sale_id, method, amount_cents) values
  (tests.unit('geral'), tests.id('s1'), 'pix', 50000),
  (tests.unit('geral'), tests.id('s2'), 'pix', 100000);
update public.sales set status = 'finalizada', finalized_at = '2031-01-15 15:00-03', finalized_by = tests.id('recep')
 where id = tests.id('s1');
update public.sales set status = 'finalizada', finalized_at = '2031-02-10 15:00-03', finalized_by = tests.id('recep')
 where id = tests.id('s2');

-- Financeiro: acesso ------------------------------------------------------------
select tests.login('recep');
select is(tests.count('select 1 from public.finance_entries'), 0::bigint, 'Recepção não vê financeiro');
select throws_ok(format($$insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date)
  values (%L, 'despesa', %L, 'X', 100, '2031-01-01')$$, tests.unit('geral'), tests.category('geral', 'Aluguel')),
  '42501', null, 'Recepção não lança');
select throws_ok(format($$select public.finance_cash_flow(%L, '2031-01-01', '2031-01-31', false)$$, tests.unit('geral')),
  '42501', null, 'Recepção não vê fluxo de caixa');
reset role; select tests.clear();

select tests.login('vend');
select is(tests.count('select 1 from public.finance_accounts'), 0::bigint, 'Vendedora não vê contas');
reset role; select tests.clear();

-- Lançamentos ---------------------------------------------------------------------
select tests.login('ger');
with e as (
  insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date)
  values (tests.unit('geral'), 'despesa', tests.category('geral', 'Aluguel'), 'Aluguel janeiro', 150000, '2031-01-05')
  returning id)
insert into test_ids (k, v) select 'rent', id from e;
select is((select created_by from public.finance_entries where id = tests.id('rent')), tests.id('ger'), 'Gerente lança despesa');
select throws_ok(format($$insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date)
  values (%L, 'receita', %L, 'Errado', 100, '2031-01-01')$$, tests.unit('geral'), tests.category('geral', 'Aluguel')),
  '23514', null, 'categoria de despesa não serve para receita');
select throws_ok(format($$update public.finance_entries set status = 'pago' where id = %L$$, tests.id('rent')),
  '23514', null, 'pago exige data e conta');
select throws_ok(format($$insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date, source)
  values (%L, 'despesa', %L, 'X', 100, '2031-01-01', 'comissao')$$, tests.unit('geral'), tests.category('geral', 'Comissões')),
  '42501', null, 'origem do sistema não pode ser forjada');
with e as (
  insert into public.finance_entries (unit_id, kind, category_id, description, amount_cents, due_date, status, paid_at, account_id)
  values (tests.unit('geral'), 'despesa', tests.category('geral', 'Marketing'), 'Panfletos', 20000, '2031-01-10', 'pago', '2031-01-10', tests.id('acc_caixa'))
  returning id)
insert into test_ids (k, v) select 'mkt', id from e;
select throws_ok(format($$update public.finance_entries set amount_cents = 1 where id = %L$$, tests.id('mkt')),
  '23514', null, 'valor de lançamento pago não muda');
select throws_ok(format($$update public.finance_entries set status = 'cancelado' where id = %L$$, tests.id('mkt')),
  '23514', null, 'cancelar exige motivo');
select lives_ok(format($$update public.finance_entries set status = 'cancelado', cancel_reason = 'lançado em duplicidade' where id = %L$$,
  tests.id('mkt')), 'cancela com motivo');
select throws_ok(format($$update public.finance_entries set description = 'x y' where id = %L$$, tests.id('mkt')),
  '23514', null, 'cancelado não é alterado');
select throws_ok(format($$delete from public.finance_entries where id = %L$$, tests.id('rent')), '42501', null, 'sem DELETE');
reset role; select tests.clear();

select tests.login('ger_vip');
select is(tests.count('select 1 from public.finance_entries'), 0::bigint, 'Gerente da VIP não vê financeiro da Geral');
reset role; select tests.clear();

-- Conciliação --------------------------------------------------------------------
select tests.login('ger');
with st as (
  select public.finance_import_statement(tests.unit('geral'), tests.id('acc_banco'), 'extrato-jan.csv', repeat('d', 64),
    '[{"line_number":1,"line_date":"2031-01-06","description":"PAG ALUGUEL","amount_cents":-150000},
      {"line_number":2,"line_date":"2031-01-07","description":"TARIFA PACOTE","amount_cents":-1290},
      {"line_number":3,"line_date":"2031-01-08","description":"TED RECEBIDA","amount_cents":5000}]') as id)
insert into test_ids (k, v) select 'st', id from st;
select throws_ok(format($$select public.finance_import_statement(%L, %L, 'de novo.csv', %L, '[{"line_number":1,"line_date":"2031-01-06","description":"x","amount_cents":-1}]')$$,
  tests.unit('geral'), tests.id('acc_banco'), repeat('d', 64)), '23505', null, 'mesmo extrato não é importado duas vezes');
insert into test_ids (k, v) select 'l' || line_number, id from public.bank_statement_lines where statement_id = tests.id('st');
select results_eq(format('select entry_id from public.finance_match_suggestions(%L)', tests.id('l1')),
  format('values (%L::uuid)', tests.id('rent')), 'sugestão encontra o aluguel (mesmo valor, data próxima)');
select lives_ok(format('select public.finance_reconcile(%L, %L)', tests.id('l1'), tests.id('rent')), 'concilia');
select ok((select status = 'pago' and paid_at = '2031-01-06' and account_id = tests.id('acc_banco')
           from public.finance_entries where id = tests.id('rent')), 'lançamento previsto vira pago na data e conta do extrato');
select throws_ok(format($$update public.finance_entries set amount_cents = 1 where id = %L$$, tests.id('rent')),
  '23514', null, 'lançamento conciliado não muda');
select lives_ok(format($$select public.finance_create_from_line(%L, %L, 'Tarifa bancária')$$,
  tests.id('l2'), tests.category('geral', 'Tarifas bancárias e de cartão')), 'cria lançamento a partir da linha');
select ok(exists (select 1 from public.finance_entries where source = 'extrato' and amount_cents = 1290 and status = 'pago'),
  'tarifa lançada como paga e conciliada');
select throws_ok(format($$select public.finance_ignore_line(%L, null)$$, tests.id('l3')), '23514', null, 'ignorar exige motivo');
select lives_ok(format($$select public.finance_ignore_line(%L, 'transferência entre contas')$$, tests.id('l3')), 'ignora linha com motivo');
select lives_ok(format('select public.finance_unreconcile(%L)', tests.id('l1')), 'desfaz conciliação');
select is((select status from public.bank_statement_lines where id = tests.id('l1')), 'pendente', 'linha volta a pendente');
reset role; select tests.clear();

select tests.login('recep');
select throws_ok(format('select public.finance_match_suggestions(%L)', tests.id('l1')), '42501', null, 'Recepção não concilia');
reset role; select tests.clear();

-- Fluxo de caixa -------------------------------------------------------------------
select tests.login('ger');
select ok((public.finance_cash_flow(tests.unit('geral'), '2031-01-01', '2031-01-31', false) -> 'days') @> '[{"dia": "2031-01-06", "saidas": 150000}]',
  'fluxo realizado mostra a saída do aluguel');
select ok((public.finance_cash_flow(tests.unit('geral'), '2031-01-01', '2031-01-31', true) -> 'days') @> '[{"dia": "2031-01-15", "entradas": 50000}]',
  'com vendas: pagamentos de comandas entram no fluxo');
select ok(not ((public.finance_cash_flow(tests.unit('geral'), '2031-01-01', '2031-01-31', false) -> 'days') @> '[{"dia": "2031-01-15"}]'),
  'sem vendas: comandas não entram (evita contar em dobro)');
reset role; select tests.clear();

-- Comissões ------------------------------------------------------------------------
select tests.login('ger');
select throws_ok(format($$select public.commission_create_plan_from_preset(%L, 'meta_individual_referencia', %L, 'Plano X')$$,
  tests.unit('geral'), tests.id('vend')), '42501', null, 'Gerente sem commissions.manage não cria plano');
reset role; select tests.clear();

select tests.login('dir', 'aal2');
with p as (select public.commission_create_plan_from_preset(tests.unit('geral'), 'meta_individual_referencia', tests.id('vend'),
  'Vendedora — meta individual') as id)
insert into test_ids (k, v) select 'plan', id from p;
select results_eq(format('select min_achievement_pct, rate_pct from public.commission_plan_tiers where plan_id = %L order by 1', tests.id('plan')),
  $$values (0::numeric(6,2), 0.8::numeric(6,3)), (100, 2.0)$$, 'faixas de referência 0,8% e 2%');
select is((select revenue_source from public.commission_plans where id = tests.id('plan')), null,
  'fonte do faturamento não é presumida');
select throws_ok(format($$update public.commission_plans set status = 'ativo' where id = %L$$, tests.id('plan')),
  '23514', 'Defina antes de ativar: fonte do faturamento, base de cálculo, itens considerados, período, tratamento de estornos, forma de aplicar as faixas',
  'não ativa com parâmetros a confirmar');
select throws_ok(format($$select public.commission_create_plan_from_preset(%L, 'meta_individual_referencia', %L, 'Meu plano')$$,
  tests.unit('geral'), tests.id('dir')), '42501', null, 'ninguém cria a própria comissão');
select lives_ok(format($$update public.commission_plans set revenue_source = 'comandas_finalizadas', base_scope = 'vendas_do_beneficiario',
  item_filter = 'todos', amount_basis = 'liquido_comanda', period_type = 'mensal', period_start_day = 1,
  refund_policy = 'excluir_canceladas_ate_apuracao', tier_mode = 'faixa_sobre_total' where id = %L$$, tests.id('plan')),
  'confirma parâmetros');
select lives_ok(format($$update public.commission_plans set status = 'ativo' where id = %L$$, tests.id('plan')), 'ativa plano');
select throws_ok(format($$update public.commission_plan_tiers set rate_pct = 5 where plan_id = %L$$, tests.id('plan')),
  '23514', null, 'faixas de plano ativo não mudam');
insert into public.commission_goals (plan_id, period_start, period_end, goal_cents) values
  (tests.id('plan'), '2031-01-01', '2031-01-31', 100000),
  (tests.id('plan'), '2031-02-01', '2031-02-28', 50000);
select throws_ok(format($$select public.commission_calculate(%L, '2031-03-01')$$, tests.id('plan')),
  '23514', null, 'apuração exige meta do período');
with s as (select public.commission_calculate(tests.id('plan'), '2031-01-01') as id)
insert into test_ids (k, v) select 'stmt', id from s;
select results_eq(format('select revenue_cents, achievement_pct, rate_pct, commission_cents from public.commission_statements where id = %L', tests.id('stmt')),
  $$values (50000, 50.00::numeric(8,2), 0.800::numeric(6,3), 400)$$, 'abaixo da meta: 0,8% sobre R$ 500,00 = R$ 4,00');
with s as (select public.commission_calculate(tests.id('plan'), '2031-02-01') as id)
insert into test_ids (k, v) select 'stmt2', id from s;
select results_eq(format('select achievement_pct, rate_pct, commission_cents from public.commission_statements where id = %L', tests.id('stmt2')),
  $$values (200.00::numeric(8,2), 2.000::numeric(6,3), 2000)$$, 'meta atingida: 2% sobre R$ 1.000,00 = R$ 20,00');
select throws_ok(format($$select public.commission_calculate(%L, '2031-01-01')$$, tests.id('plan')),
  '23505', null, 'não apura o mesmo período duas vezes');
select throws_ok(format($$select public.commission_set_status(%L, 'aprovada')$$, tests.id('stmt')),
  '42501', null, 'quem apurou não aprova');
reset role; select tests.clear();

select tests.login('dir2', 'aal2');
select lives_ok(format($$select public.commission_set_status(%L, 'aprovada')$$, tests.id('stmt')), 'outra pessoa aprova');
select lives_ok(format($$select public.commission_set_status(%L, 'paga')$$, tests.id('stmt')), 'gera pagamento');
select ok(exists (select 1 from public.finance_entries e join public.commission_statements s on s.finance_entry_id = e.id
                  where s.id = tests.id('stmt') and e.amount_cents = 400 and e.source = 'comissao' and e.kind = 'despesa'),
  'despesa de comissão criada no financeiro');
-- Valor informado manualmente (ex.: faturamento coletivo de outra fonte)
with p as (select public.commission_create_plan_from_preset(tests.unit('geral'), 'meta_coletiva_referencia', tests.id('ger'),
  'Gerente — meta coletiva') as id)
insert into test_ids (k, v) select 'plan_ger', id from p;
select lives_ok(format($$update public.commission_plans set revenue_source = 'valor_informado', period_type = 'mensal', period_start_day = 1,
  refund_policy = 'excluir_canceladas_ate_apuracao', tier_mode = 'faixa_sobre_total', status = 'ativo' where id = %L$$, tests.id('plan_ger')),
  'plano com faturamento informado ativado');
insert into public.commission_goals (plan_id, period_start, period_end, goal_cents) values (tests.id('plan_ger'), '2031-01-01', '2031-01-31', 1000000);
select throws_ok(format($$select public.commission_calculate(%L, '2031-01-01')$$, tests.id('plan_ger')),
  '22023', null, 'faturamento informado é obrigatório nesse modo');
with s as (select public.commission_calculate(tests.id('plan_ger'), '2031-01-01', 800000) as id)
insert into test_ids (k, v) select 'stmt_ger', id from s;
select is((select commission_cents from public.commission_statements where id = tests.id('stmt_ger')), 4000,
  '80% da meta coletiva: 0,5% sobre R$ 8.000,00 = R$ 40,00');
-- Faixa progressiva com base nos serviços da própria profissional
with p as (select public.commission_create_plan_from_preset(tests.unit('geral'), 'meta_individual_referencia', tests.id('prof'),
  'Profissional — serviços') as id)
insert into test_ids (k, v) select 'plan_prof', id from p;
select lives_ok(format($$update public.commission_plans set revenue_source = 'comandas_finalizadas', base_scope = 'servicos_do_beneficiario',
  item_filter = 'servicos', amount_basis = 'bruto_itens', period_type = 'mensal', period_start_day = 1,
  refund_policy = 'descontar_no_periodo_do_cancelamento', tier_mode = 'progressiva', status = 'ativo' where id = %L$$, tests.id('plan_prof')),
  'plano progressivo ativado');
insert into public.commission_goals (plan_id, period_start, period_end, goal_cents) values (tests.id('plan_prof'), '2031-02-01', '2031-02-28', 50000);
with s as (select public.commission_calculate(tests.id('plan_prof'), '2031-02-01') as id)
insert into test_ids (k, v) select 'stmt_prof', id from s;
select is((select commission_cents from public.commission_statements where id = tests.id('stmt_prof')), 1400,
  'progressiva: 0,8% sobre os primeiros R$ 500 + 2% sobre os R$ 500 acima da meta = R$ 14,00');
reset role; select tests.clear();

-- Visibilidade das comissões
select tests.login('vend');
select is(tests.count('select 1 from public.commission_statements'), 2::bigint, 'Vendedora vê as próprias apurações');
select is(tests.count('select 1 from public.commission_plans'), 1::bigint, 'e o próprio plano');
select is(tests.count($$update public.commission_plans set tier_mode = 'progressiva' returning 1$$), 0::bigint,
  'mas não altera o plano');
reset role; select tests.clear();

select tests.login('ger');
select is(tests.count('select 1 from public.commission_statements'), 1::bigint, 'Gerente vê só a própria apuração');
reset role; select tests.clear();

select tests.login('prof');
select is(tests.count('select 1 from public.commission_statements'), 1::bigint, 'Profissional vê a própria comissão');
select is((select commission_cents from public.commission_statements), 1400, 'valor da própria comissão');
reset role; select tests.clear();

select ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS em todas as tabelas');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.prosecdef and not coalesce('search_path=""' = any (p.proconfig), false)),
  'SECURITY DEFINER com search_path vazio');

select * from finish();
rollback;
