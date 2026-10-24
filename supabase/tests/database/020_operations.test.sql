-- Fase 1 — operação diária: clientes (identidade única + vínculo por unidade),
-- CRM por unidade, duplicidades, agenda, comandas, estoque, painel e relatórios.
-- Inclui as verificações equivalentes às do modelo inicial (tests/legacy).
begin;
\ir ../helpers/setup.psql

select no_plan();

-- Massa ---------------------------------------------------------------------
select tests.create_person('dir');
select tests.create_person('ger');
select tests.create_person('recep');
select tests.create_person('recep_vip');
select tests.create_person('vend');
select tests.create_person('prof');
select tests.create_person('prof2');
select tests.create_person('leitura');
select tests.create_person('recep_nocancel');
select tests.create_person('inativo', false);
select tests.link('dir', 'geral', 'direcao');
select tests.link('dir', 'vip', 'direcao');
select tests.link('ger', 'geral', 'gerente');
select tests.link('recep', 'geral', 'recepcao');
select tests.link('recep_vip', 'vip', 'recepcao');
select tests.link('vend', 'geral', 'vendedora');
select tests.link('prof', 'geral', 'profissional');
select tests.link('prof2', 'geral', 'profissional');
select tests.link('leitura', 'geral', 'somente_leitura');
select tests.link('recep_nocancel', 'geral', 'recepcao');
select tests.link('inativo', 'geral', 'recepcao');
insert into public.membership_permission_overrides (membership_id, permission_code, effect, reason)
values (tests.membership('recep_nocancel', 'geral'), 'appointments.cancel', 'revoke', 'teste');

insert into test_ids (k, v) values
  ('svc', gen_random_uuid()), ('svc_vip', gen_random_uuid()),
  ('pro', gen_random_uuid()), ('pro2', gen_random_uuid()), ('pro_vip', gen_random_uuid()),
  ('prd', gen_random_uuid()),
  ('id_ana', gen_random_uuid()), ('cu_ana', gen_random_uuid()),
  ('id_bia', gen_random_uuid()), ('cu_bia_vip', gen_random_uuid()),
  ('id_dup1', gen_random_uuid()), ('cu_dup1', gen_random_uuid()),
  ('id_dup2', gen_random_uuid()), ('cu_dup2', gen_random_uuid()),
  ('id_dup3', gen_random_uuid()), ('cu_dup3', gen_random_uuid()),
  ('apt1', gen_random_uuid()), ('apt2', gen_random_uuid()), ('apt_vip', gen_random_uuid());

insert into public.services (id, unit_id, name, duration_minutes, price_cents) values
  (tests.id('svc'), tests.unit('geral'), 'Corte', 60, 8000),
  (tests.id('svc_vip'), tests.unit('vip'), 'Tratamento VIP', 90, 30000);
insert into public.professionals (id, unit_id, user_id, display_name, specialty) values
  (tests.id('pro'), tests.unit('geral'), tests.id('prof'), 'Ana Cabeleireira', 'Cabeleireira'),
  (tests.id('pro2'), tests.unit('geral'), tests.id('prof2'), 'Bia Manicure', 'Manicure'),
  (tests.id('pro_vip'), tests.unit('vip'), null, 'Carla Lash', 'Lash designer');
insert into public.products (id, unit_id, name, sale_price_cents, min_quantity) values
  (tests.id('prd'), tests.unit('geral'), 'Shampoo', 5000, 2);
insert into public.stock_movements (unit_id, product_id, kind, quantity_delta) values
  (tests.unit('geral'), tests.id('prd'), 'entrada', 10);

insert into public.client_identities (id, full_name, phone, email) values
  (tests.id('id_ana'), 'Ana Cliente', '5511900000001', 'ana@teste.invalid'),
  (tests.id('id_bia'), 'Bia Cliente VIP', '5511900000002', null),
  (tests.id('id_dup1'), 'Carla Souza', '5511900000003', null),
  (tests.id('id_dup2'), 'Carla  Souza', '5511900000003', null),
  (tests.id('id_dup3'), 'Débora Lima', null, 'debora@teste.invalid');
insert into public.client_units (id, unit_id, identity_id, service_notes) values
  (tests.id('cu_ana'), tests.unit('geral'), tests.id('id_ana'), 'Alergia a amônia'),
  (tests.id('cu_bia_vip'), tests.unit('vip'), tests.id('id_bia'), null),
  (tests.id('cu_dup1'), tests.unit('geral'), tests.id('id_dup1'), null),
  (tests.id('cu_dup2'), tests.unit('geral'), tests.id('id_dup2'), 'Prefere manhã'),
  (tests.id('cu_dup3'), tests.unit('geral'), tests.id('id_dup3'), null);
insert into public.crm_interactions (unit_id, client_unit_id, kind, body) values
  (tests.unit('geral'), tests.id('cu_ana'), 'nota', 'Nota privada da Geral');

insert into public.appointments (id, unit_id, client_id, professional_id, service_id, starts_at, ends_at) values
  (tests.id('apt1'), tests.unit('geral'), tests.id('cu_ana'), tests.id('pro'), tests.id('svc'),
   '2030-01-10 13:00-03', '2030-01-10 14:00-03'),
  (tests.id('apt2'), tests.unit('geral'), tests.id('cu_dup2'), tests.id('pro2'), tests.id('svc'),
   '2030-01-10 13:00-03', '2030-01-10 14:00-03'),
  (tests.id('apt_vip'), tests.unit('vip'), tests.id('cu_bia_vip'), tests.id('pro_vip'), tests.id('svc_vip'),
   '2030-01-10 13:00-03', '2030-01-10 14:30-03');

-- Anônimo -------------------------------------------------------------------
select tests.anon();
select throws_ok('select * from public.client_identities', '42501', null, 'anon não lê identidades');
select throws_ok('select * from public.client_units', '42501', null, 'anon não lê clientes');
select throws_ok('select * from public.sales', '42501', null, 'anon não lê comandas');
select throws_ok('select * from public.product_stock', '42501', null, 'anon não lê estoque');
reset role; select tests.clear();

-- Clientes: isolamento e identidade única -----------------------------------
select tests.login('recep');
select is(tests.count('select 1 from public.client_units'), 4::bigint, 'Recepção Geral vê só clientes da Geral');
select is(tests.count(format('select 1 from public.client_identities where id = %L', tests.id('id_bia'))), 0::bigint,
  'Recepção Geral não vê identidade só vinculada à VIP');
select is(tests.count('select 1 from public.crm_interactions'), 1::bigint, 'Recepção vê CRM da Geral (crm.view)');
select throws_ok(format($$insert into public.crm_interactions (unit_id, client_unit_id, body) values (%L, %L, 'x')$$,
  tests.unit('geral'), tests.id('cu_ana')), '42501', null, 'Recepção sem crm.write não registra CRM');
select throws_ok(format($$insert into public.client_units (unit_id, identity_id) values (%L, %L)$$,
  tests.unit('geral'), tests.id('id_bia')), '42501', null, 'vínculo direto pela API é proibido (só por create_client)');
select lives_ok(format($$select public.create_client(%L, 'Maria Silva', '(11) 98888-0001', null, null, 'Cabelo fino')$$,
  tests.unit('geral')), 'Recepção cadastra cliente nova');
select is((select phone from public.client_identities where full_name = 'Maria Silva'), '5511988880001',
  'telefone normalizado com DDI');
select is((select created_by from public.client_identities where full_name = 'Maria Silva'), tests.id('recep'),
  'created_by é o ator');
select throws_ok(format($$select public.create_client(%L, 'X Y', '123')$$, tests.unit('geral')),
  '23514', null, 'telefone inválido é recusado');
select throws_ok(format($$select public.create_client(%L, 'Intrusa', null)$$, tests.unit('vip')),
  '42501', null, 'Recepção Geral não cadastra na VIP');
select throws_ok(format($$update public.client_units set archived_at = now() where id = %L$$, tests.id('cu_ana')),
  '42501', null, 'Recepção não arquiva clientes');
select throws_ok(format($$delete from public.client_units where id = %L$$, tests.id('cu_ana')),
  '42501', null, 'não existe DELETE de clientes');
select throws_ok(format($$update public.client_units set unit_id = %L where id = %L$$, tests.unit('vip'), tests.id('cu_ana')),
  '42501', null, 'unit_id não pode ser alterado');
select throws_ok(format('select public.client_duplicate_candidates(%L)', tests.unit('geral')), '42501', null,
  'Recepção não revisa duplicidades (sem clients.merge)');
reset role; select tests.clear();

select tests.login('recep_vip');
select is(tests.count('select 1 from public.client_units'), 1::bigint, 'Recepção VIP vê só clientes da VIP');
select is(tests.count('select 1 from public.crm_interactions'), 0::bigint, 'CRM da Geral não aparece na VIP');
select results_eq(format($$select display_name, phone_hint, linked_here from public.find_client_candidates(%L, null, '11988880001', null)$$,
    tests.unit('vip')),
  $$values ('Maria S.'::text, '…0001'::text, false)$$,
  'candidato de outra unidade aparece mascarado');
select throws_ok(format($$select public.create_client(%L, 'Maria', '11999990000', null, null, null,
    (select identity_id from public.find_client_candidates(%L, null, '11988880001', null)))$$,
  tests.unit('vip'), tests.unit('vip')),
  '42501', null, 'vincular identidade existente exige o mesmo telefone ou e-mail');
select lives_ok(format($$select public.create_client(%L, 'Maria Silva', '11988880001', null, null, null,
    (select identity_id from public.find_client_candidates(%L, null, '11988880001', null)))$$,
  tests.unit('vip'), tests.unit('vip')),
  'Recepção VIP vincula a mesma identidade à VIP');
select is(tests.count($$select 1 from public.client_units cu join public.client_identities i on i.id = cu.identity_id
                        where i.full_name = 'Maria Silva'$$), 1::bigint, 'VIP vê apenas o próprio vínculo da Maria');
select is((select service_notes from public.client_units cu join public.client_identities i on i.id = cu.identity_id
           where i.full_name = 'Maria Silva'), null, 'observações da Geral não aparecem na VIP');
reset role; select tests.clear();
select is((select count(distinct identity_id)::int from public.client_units cu join public.client_identities i on i.id = cu.identity_id
           where i.full_name = 'Maria Silva'), 1, 'uma identidade, dois vínculos (Geral e VIP)');

-- CRM por unidade
select tests.login('vend');
select lives_ok(format($$insert into public.crm_interactions (unit_id, client_unit_id, kind, body) values (%L, %L, 'whatsapp', 'Pediu orçamento')$$,
  tests.unit('geral'), tests.id('cu_ana')), 'Vendedora registra interação no CRM');
select is((select created_by from public.crm_interactions where body = 'Pediu orçamento'), tests.id('vend'), 'autor do CRM registrado');
select throws_ok(format($$update public.crm_interactions set body = 'x' where client_unit_id = %L$$, tests.id('cu_ana')),
  '42501', null, 'CRM é somente inclusão');
reset role; select tests.clear();

-- Profissional ---------------------------------------------------------------
select tests.login('prof');
select is(tests.count('select 1 from public.client_units'), 0::bigint, 'profissional não lê cadastro de clientes');
select is(tests.count('select 1 from public.client_identities'), 0::bigint, 'profissional não lê identidades');
select is(tests.count('select 1 from public.crm_interactions'), 0::bigint, 'profissional não lê CRM');
select is(tests.count('select 1 from public.appointments'), 1::bigint, 'profissional vê só os próprios agendamentos');
select results_eq($$select client_name, service_notes from public.get_my_agenda('2030-01-01', '2030-01-31')$$,
  $$values ('Ana Cliente'::text, 'Alergia a amônia'::text)$$, 'agenda própria traz nome e observação de atendimento');
select ok(not exists (select 1 from information_schema.routines r
                      join information_schema.parameters p on p.specific_name = r.specific_name
                      where r.routine_name = 'get_my_agenda' and p.parameter_name in ('phone', 'email', 'client_phone')),
  'agenda do profissional não expõe telefone nem e-mail');
select throws_ok($$select * from public.get_my_agenda('2030-01-01', '2030-06-01')$$, '22023', null, 'intervalo limitado');
select throws_ok(format($$insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
  values (%L, %L, %L, %L, '2030-03-01 10:00-03', '2030-03-01 11:00-03')$$,
  tests.unit('geral'), tests.id('cu_ana'), tests.id('pro'), tests.id('svc')), '42501', null, 'profissional não cria agendamento');
select throws_ok(format('select public.operational_dashboard(%L)', tests.unit('geral')), '42501', null,
  'profissional não vê o painel');
select throws_ok(format('select public.unit_people(%L)', tests.unit('geral')), '42501', null,
  'profissional não lista pessoas da unidade');
reset role; select tests.clear();

-- Agenda ---------------------------------------------------------------------
select tests.login('recep_vip');
select throws_ok(format($$insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
  values (%L, %L, %L, %L, '2030-02-01 10:00-03', '2030-02-01 11:00-03')$$,
  tests.unit('vip'), tests.id('cu_ana'), tests.id('pro_vip'), tests.id('svc_vip')),
  '23503', null, 'agendamento não mistura cliente de outra unidade');
select throws_ok(format($$insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
  values (%L, %L, %L, %L, '2030-01-10 14:00-03', '2030-01-10 15:00-03')$$,
  tests.unit('vip'), tests.id('cu_bia_vip'), tests.id('pro_vip'), tests.id('svc_vip')),
  '23P01', null, 'profissional não tem atendimentos sobrepostos');
select lives_ok(format($$insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
  values (%L, %L, %L, %L, '2030-01-10 14:30-03', '2030-01-10 15:30-03')$$,
  tests.unit('vip'), tests.id('cu_bia_vip'), tests.id('pro_vip'), tests.id('svc_vip')), 'horário encostado é permitido');
select is(tests.count(format('select 1 from public.appointments where unit_id = %L', tests.unit('geral'))), 0::bigint,
  'Recepção VIP não vê agenda da Geral');
reset role; select tests.clear();

select tests.login('recep');
select throws_ok(format($$update public.appointments set status = 'cancelado' where id = %L$$, tests.id('apt1')),
  '23514', null, 'cancelar exige motivo');
select lives_ok(format($$update public.appointments set status = 'confirmado' where id = %L$$, tests.id('apt1')),
  'Recepção confirma agendamento');
select throws_ok(format($$update public.appointments set status = 'agendado' where id = %L$$, tests.id('apt1')),
  '23514', null, 'confirmado não volta para agendado');
select lives_ok(format($$update public.appointments set status = 'cancelado', cancel_reason = 'cliente desmarcou' where id = %L$$,
  tests.id('apt1')), 'Recepção cancela com motivo');
select is((select cancelled_by from public.appointments where id = tests.id('apt1')), tests.id('recep'), 'quem cancelou registrado');
select throws_ok(format($$update public.appointments set status = 'agendado' where id = %L$$, tests.id('apt1')),
  '23514', null, 'cancelado não reabre');
reset role; select tests.clear();

select tests.login('recep_nocancel');
select throws_ok(format($$update public.appointments set status = 'cancelado', cancel_reason = 'x' where id = %L$$, tests.id('apt2')),
  '42501', null, 'revogação individual: sem appointments.cancel não cancela');
select lives_ok(format($$update public.appointments set notes = 'confirmar por telefone' where id = %L$$, tests.id('apt2')),
  'revogação não afeta as demais permissões');
reset role; select tests.clear();

select tests.login('leitura');
select ok(tests.count('select 1 from public.appointments') >= 2, 'somente leitura vê a agenda');
select is(tests.count(format($$update public.client_units set service_notes = 'x' where id = %L returning 1$$, tests.id('cu_ana'))),
  0::bigint, 'somente leitura não edita clientes');
select throws_ok(format($$select public.create_client(%L, 'X Y')$$, tests.unit('geral')), '42501', null,
  'somente leitura não cadastra');
select lives_ok(format($$select public.report_sales(%L, '2030-01-01', '2030-01-31')$$, tests.unit('geral')),
  'somente leitura vê relatórios');
reset role; select tests.clear();

-- Duplicidades e mescla ------------------------------------------------------
select tests.login('ger');
select is(tests.count(format('select 1 from public.client_duplicate_candidates(%L)', tests.unit('geral'))), 1::bigint,
  'Gerente vê par com mesmo telefone/nome');
select lives_ok(format($$select public.merge_clients(%L, %L, %L)$$, tests.unit('geral'), tests.id('cu_dup1'), tests.id('cu_dup2')),
  'Gerente mescla duplicidade na unidade');
select is((select client_id from public.appointments where id = tests.id('apt2')), tests.id('cu_dup1'),
  'agendamento passou para o cadastro mantido');
select ok((select archived_at is not null and merged_into_id = tests.id('cu_dup1') from public.client_units where id = tests.id('cu_dup2')),
  'cadastro mesclado arquivado com referência');
select is((select service_notes from public.client_units where id = tests.id('cu_dup1')), 'Prefere manhã',
  'observações preservadas no cadastro mantido');
select is(tests.count(format('select 1 from public.client_duplicate_candidates(%L)', tests.unit('geral'))), 0::bigint,
  'par mesclado sai da lista');
select lives_ok(format($$update public.client_units set archived_at = now() where id = %L$$, tests.id('cu_dup3')),
  'Gerente arquiva cliente');
reset role; select tests.clear();
select is((select merged_into_id from public.client_identities where id = tests.id('id_dup2')), tests.id('id_dup1'),
  'identidade sem outros vínculos marcada como mesclada');

-- Comandas e estoque ----------------------------------------------------------
select tests.login('vend');
select throws_ok(format($$insert into public.sales (unit_id) values (%L)$$, tests.unit('geral')), '42501', null,
  'Vendedora não abre comanda');
reset role; select tests.clear();

select tests.login('recep');
with s as (
  insert into public.sales (unit_id, client_unit_id) values (tests.unit('geral'), tests.id('cu_ana')) returning id
)
insert into test_ids (k, v) select 'sale1', id from s;
select is((select number from public.sales where id = tests.id('sale1')), 1, 'numeração sequencial por unidade');
select is((select opened_by from public.sales where id = tests.id('sale1')), tests.id('recep'), 'quem abriu registrado');
insert into public.sale_items (unit_id, sale_id, kind, service_id, professional_id)
values (tests.unit('geral'), tests.id('sale1'), 'servico', tests.id('svc'), tests.id('pro'));
insert into public.sale_items (unit_id, sale_id, kind, product_id, quantity)
values (tests.unit('geral'), tests.id('sale1'), 'produto', tests.id('prd'), 2);
select is((select total_cents from public.sales where id = tests.id('sale1')), 18000, 'total calculado pelos itens (8000 + 2x5000)');
select ok(exists (select 1 from public.unit_people(tests.unit('geral')) where user_id = tests.id('vend')),
  'Recepção lista pessoas da unidade para escolher quem vendeu');
select ok(not exists (select 1 from public.unit_people(tests.unit('geral')) where user_id = tests.id('recep_vip')),
  'pessoas de outra unidade não aparecem');
select throws_ok(format($$update public.sales set sold_by = %L where id = %L$$, tests.id('recep_vip'), tests.id('sale1')),
  '23514', null, 'vendedor precisa ter vínculo com a unidade');
select lives_ok(format($$update public.sales set sold_by = %L, discount_cents = 1000 where id = %L$$, tests.id('vend'), tests.id('sale1')),
  'Recepção registra quem vendeu e desconto');
select is((select total_cents from public.sales where id = tests.id('sale1')), 17000, 'desconto aplicado');
select throws_ok(format($$update public.sales set status = 'finalizada' where id = %L$$, tests.id('sale1')),
  '23514', null, 'não finaliza sem pagamentos que fechem o total');
insert into public.sale_payments (unit_id, sale_id, method, amount_cents) values
  (tests.unit('geral'), tests.id('sale1'), 'pix', 10000),
  (tests.unit('geral'), tests.id('sale1'), 'cartao_credito', 7000);
select lives_ok(format($$update public.sales set status = 'finalizada' where id = %L$$, tests.id('sale1')),
  'Recepção finaliza comanda');
select is((select finalized_by from public.sales where id = tests.id('sale1')), tests.id('recep'), 'quem finalizou registrado');
select is((select quantity from public.product_stock where id = tests.id('prd')), 8, 'estoque baixado na finalização');
select throws_ok(format($$insert into public.sale_items (unit_id, sale_id, kind, service_id) values (%L, %L, 'servico', %L)$$,
  tests.unit('geral'), tests.id('sale1'), tests.id('svc')), '23514', null, 'comanda finalizada não recebe itens');
select throws_ok(format($$update public.sales set notes = 'x' where id = %L$$, tests.id('sale1')),
  '23514', null, 'comanda finalizada não é editada');
select throws_ok(format($$update public.sales set status = 'cancelada', cancel_reason = 'erro' where id = %L$$, tests.id('sale1')),
  '42501', null, 'Recepção sem sales.cancel não cancela');
select throws_ok(format($$insert into public.stock_movements (unit_id, product_id, kind, quantity_delta) values (%L, %L, 'entrada', 5)$$,
  tests.unit('geral'), tests.id('prd')), '42501', null, 'Recepção não lança estoque');
select ok((public.operational_dashboard(tests.unit('geral')) -> 'sales') is not null, 'painel da Recepção mostra vendas');
select throws_ok(format($$select public.report_sales(%L, '2030-01-01', '2030-01-31')$$, tests.unit('geral')),
  '42501', null, 'Recepção sem reports.view não vê relatórios');
reset role; select tests.clear();

select tests.login('vend');
select is(tests.count('select 1 from public.sales'), 1::bigint, 'Vendedora vê a comanda em que é vendedora (escopo próprio)');
select is(tests.count('select 1 from public.sale_items'), 2::bigint, 'e os itens dela');
reset role; select tests.clear();

select tests.login('ger');
select throws_ok(format($$insert into public.stock_movements (unit_id, product_id, kind, quantity_delta) values (%L, %L, 'venda', -1)$$,
  tests.unit('geral'), tests.id('prd')), '42501', null, 'movimento de venda manual é proibido');
select throws_ok(format($$insert into public.stock_movements (unit_id, product_id, kind, quantity_delta) values (%L, %L, 'ajuste', -1)$$,
  tests.unit('geral'), tests.id('prd')), '23514', null, 'ajuste exige motivo');
select lives_ok(format($$insert into public.stock_movements (unit_id, product_id, kind, quantity_delta) values (%L, %L, 'entrada', 4)$$,
  tests.unit('geral'), tests.id('prd')), 'Gerente lança entrada');
select lives_ok(format($$update public.sales set status = 'cancelada', cancel_reason = 'cliente devolveu' where id = %L$$, tests.id('sale1')),
  'Gerente cancela comanda finalizada');
select is((select quantity from public.product_stock where id = tests.id('prd')), 14, 'estoque estornado no cancelamento');
select throws_ok(format($$update public.sales set status = 'aberta' where id = %L$$, tests.id('sale1')),
  '23514', null, 'comanda cancelada não reabre');
select ok((public.operational_dashboard(tests.unit('geral')) ->> 'date') is not null, 'Gerente vê painel');
reset role; select tests.clear();

-- Usuário inativo ---------------------------------------------------------------
select tests.login('inativo');
select is(tests.count('select 1 from public.client_units'), 0::bigint, 'inativo não lê clientes');
select is(tests.count('select 1 from public.appointments'), 0::bigint, 'inativo não lê agenda');
select is(tests.count('select 1 from public.sales'), 0::bigint, 'inativo não lê comandas');
reset role; select tests.clear();

-- Direção sem MFA não opera
select tests.login('dir', 'aal1');
select is(tests.count('select 1 from public.client_units'), 0::bigint, 'Direção sem MFA não lê clientes');
reset role; select tests.clear();
select tests.login('dir', 'aal2');
select ok(tests.count('select 1 from public.client_units') >= 5, 'Direção com MFA lê clientes das duas unidades');
reset role; select tests.clear();

-- Estrutura -----------------------------------------------------------------
select ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'todas as tabelas de public têm RLS');
select ok(not exists (select 1 from information_schema.role_table_grants
                      where table_schema = 'public' and grantee = 'anon'),
  'anon não tem privilégio em tabelas e views de public');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce('search_path=""' = any (p.proconfig), false)),
  'toda função SECURITY DEFINER fixa search_path vazio');

select * from finish();
rollback;
