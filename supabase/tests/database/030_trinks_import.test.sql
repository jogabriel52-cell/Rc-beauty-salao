-- Fase 2 — importação Trinks: mapeamento conferido por outra pessoa, prévia
-- com classificação, decisões humanas, confirmação, reimportação bloqueada,
-- descarte com expurgo das linhas.
begin;
\ir ../helpers/setup.psql

select no_plan();

select tests.create_person('dir1');
select tests.create_person('dir2');
select tests.create_person('ger');
select tests.create_person('recep');
select tests.link('dir1', 'geral', 'direcao');
select tests.link('dir1', 'vip', 'direcao');
select tests.link('dir2', 'geral', 'direcao');
select tests.link('dir2', 'vip', 'direcao');
select tests.link('ger', 'geral', 'gerente');
select tests.link('recep', 'geral', 'recepcao');

insert into test_ids (k, v) values
  ('id_ana', gen_random_uuid()), ('id_bia', gen_random_uuid()), ('id_carla', gen_random_uuid()),
  ('id_dani', gen_random_uuid()), ('id_gabi', gen_random_uuid());
insert into public.client_identities (id, full_name, phone) values
  (tests.id('id_ana'), 'Ana Souza', '5511911110001'),
  (tests.id('id_bia'), 'Bia Lima', '5511911110002'),
  (tests.id('id_carla'), 'Carla Dias', '5511911110003'),
  (tests.id('id_dani'), 'Daniela Rocha', null),
  (tests.id('id_gabi'), 'Gabi Antiga', null);
insert into public.client_units (unit_id, identity_id, source, external_ref) values
  (tests.unit('geral'), tests.id('id_ana'), 'manual', null),
  (tests.unit('vip'), tests.id('id_bia'), 'manual', null),
  (tests.unit('vip'), tests.id('id_carla'), 'manual', null),
  (tests.unit('geral'), tests.id('id_dani'), 'manual', null),
  (tests.unit('geral'), tests.id('id_gabi'), 'trinks_csv', 'T-100');

-- Mapeamento --------------------------------------------------------------------
select tests.login('recep');
select throws_ok($$select public.import_save_mapping(null, 'X', '{"full_name":"Nome"}', 'DD/MM/YYYY', '{Nome}')$$,
  '42501', null, 'Recepção não cria mapeamento');
select is(tests.count('select 1 from public.import_mappings'), 0::bigint, 'Recepção não vê mapeamentos');
reset role; select tests.clear();

select tests.login('ger');
select throws_ok($$select public.import_save_mapping(null, 'X', '{"full_name":"Nome"}', 'DD/MM/YYYY', '{Nome}')$$,
  '42501', null, 'Gerente sem imports.run não cria mapeamento');
reset role; select tests.clear();

select tests.login('dir1', 'aal2');
select throws_ok($$select public.import_save_mapping(null, 'X', '{"nome":"Nome"}', 'DD/MM/YYYY', '{Nome}')$$,
  '22023', null, 'campo de destino desconhecido é recusado');
with m as (
  select public.import_save_mapping(null, 'Clientes Trinks (conferido)',
    '{"full_name":"Cliente","phone":"Celular","email":"E-mail","birth_date":"Nascimento","external_ref":"Código","notes":"Observação"}',
    'DD/MM/YYYY', '{Cliente,Celular,E-mail,Nascimento,Código,Observação}') as id
)
insert into test_ids (k, v) select 'map', id from m;
select is((select status from public.import_mappings where id = tests.id('map')), 'rascunho', 'mapeamento nasce como rascunho');
select throws_ok(format('select public.import_approve_mapping(%L)', tests.id('map')), '42501', null,
  'quem editou não aprova o próprio mapeamento');
select throws_ok(format($$select public.import_create_batch(%L, %L, 'a.csv', %L, 9)$$,
  tests.unit('geral'), tests.id('map'), repeat('a', 64)), '22023', null, 'lote exige mapeamento aprovado');
reset role; select tests.clear();

select tests.login('dir2', 'aal2');
select lives_ok(format('select public.import_approve_mapping(%L)', tests.id('map')), 'outra pessoa da Direção aprova');
reset role; select tests.clear();
select ok((select status = 'aprovado' and approved_by = tests.id('dir2') from public.import_mappings where id = tests.id('map')),
  'aprovação registrada com quem conferiu');

-- Prévia --------------------------------------------------------------------------
select tests.login('dir1', 'aal2');
with b as (select public.import_create_batch(tests.unit('geral'), tests.id('map'), 'clientes.csv', repeat('b', 64), 9) as id)
insert into test_ids (k, v) select 'batch', id from b;
select is(public.import_stage_rows(tests.id('batch'), $$[
  {"row_number":1,"full_name":"Ana Souza","phone":"(11) 91111-0001"},
  {"row_number":2,"full_name":"Bia Lima","phone":"11911110002"},
  {"row_number":3,"full_name":"Joana Alves","phone":"11 91111-0003"},
  {"row_number":4,"full_name":"Daniela  Rocha"},
  {"row_number":5,"full_name":"Eva Nova","phone":"11911110005","email":"EVA@teste.invalid","birth_date":"31/12/1990","external_ref":"T-200","notes":"gosta de café"},
  {"row_number":6,"full_name":"Eva Nova","phone":"(11) 91111-0005"},
  {"row_number":7,"full_name":""},
  {"row_number":8,"full_name":"Fabi Teste","phone":"123","birth_date":"99/99/9999"},
  {"row_number":9,"full_name":"Gabi","external_ref":"T-100"}
]$$::jsonb), 9, 'nove linhas recebidas');
select results_eq(format('select row_number, classification, decision from public.import_rows where batch_id = %L order by row_number', tests.id('batch')),
  $$values (1, 'duplicada_na_unidade'::text, 'ignorar'::text),
           (2, 'vincular', 'vincular'),
           (3, 'possivel_duplicidade', null),
           (4, 'possivel_duplicidade', null),
           (5, 'nova', 'criar'),
           (6, 'duplicada_no_arquivo', 'ignorar'),
           (7, 'invalida', 'ignorar'),
           (8, 'nova', 'criar'),
           (9, 'duplicada_na_unidade', 'ignorar')$$,
  'classificação e decisão sugerida por linha');
select ok((select 'telefone inválido (ignorado)' = any (issues) and 'data de nascimento inválida (ignorada)' = any (issues)
           from public.import_rows where batch_id = tests.id('batch') and row_number = 8),
  'problemas de campo ficam registrados na linha');
select is((select phone from public.import_rows where batch_id = tests.id('batch') and row_number = 5), '5511911110005',
  'telefone normalizado na prévia');
select is((select (public.import_batch_summary(tests.id('batch')) ->> 'pendentes')::int), 2, 'resumo mostra 2 pendentes');
select throws_ok(format('select public.import_commit_batch(%L)', tests.id('batch')), '22023', null,
  'não confirma com dúvidas pendentes');
select throws_ok(format($$select public.import_decide_row((select id from public.import_rows where batch_id = %L and row_number = 1), 'criar')$$,
  tests.id('batch')), '22023', null, 'linha já existente na unidade só pode ser ignorada');
select throws_ok(format($$select public.import_decide_row((select id from public.import_rows where batch_id = %L and row_number = 4), 'vincular')$$,
  tests.id('batch')), '22023', null, 'não vincula a cadastro da própria unidade');
select lives_ok(format($$select public.import_decide_row((select id from public.import_rows where batch_id = %L and row_number = 3), 'criar')$$,
  tests.id('batch')), 'decide criar cadastro novo para nome diferente');
select lives_ok(format($$select public.import_decide_row((select id from public.import_rows where batch_id = %L and row_number = 4), 'ignorar')$$,
  tests.id('batch')), 'decide ignorar possível duplicidade por nome');
reset role; select tests.clear();

select tests.login('recep');
select is(tests.count('select 1 from public.import_rows'), 0::bigint, 'Recepção não vê linhas da prévia');
select throws_ok(format('select public.import_commit_batch(%L)', tests.id('batch')), '42501', null, 'Recepção não confirma');
reset role; select tests.clear();

-- Confirmação ---------------------------------------------------------------------
select tests.login('dir1', 'aal2');
select results_eq(format('select public.import_commit_batch(%L)', tests.id('batch')),
  $$values ('{"criadas": 3, "vinculadas": 1, "ignoradas": 5}'::jsonb)$$, 'resumo da confirmação');
reset role; select tests.clear();

select ok(exists (
  select 1 from public.client_units cu join public.client_identities i on i.id = cu.identity_id
  where cu.unit_id = tests.unit('geral') and i.full_name = 'Eva Nova' and i.phone = '5511911110005'
    and i.email = 'eva@teste.invalid' and i.birth_date = '1990-12-31'
    and cu.source = 'trinks_csv' and cu.external_ref = 'T-200'), 'cliente nova criada com origem e código do Trinks');
select ok(exists (
  select 1 from public.crm_interactions c join public.client_units cu on cu.id = c.client_unit_id
  join public.client_identities i on i.id = cu.identity_id
  where i.full_name = 'Eva Nova' and c.body = 'Importado do Trinks: gosta de café'), 'observação vira nota privada de CRM');
select is((select count(*)::int from public.client_units where identity_id = tests.id('id_bia')), 2,
  'identidade da VIP vinculada à Geral (sem duplicar)');
select ok(exists (select 1 from public.client_identities where full_name = 'Joana Alves' and id <> tests.id('id_carla')),
  'nome diferente com mesmo telefone vira cadastro separado por decisão humana');
select is((select count(*)::int from public.client_identities where full_name = 'Daniela  Rocha' or full_name = 'Daniela Rocha'), 1,
  'possível duplicidade ignorada não foi criada');
select ok(exists (select 1 from public.audit_log where table_name = 'client_identities' and action = 'INSERT'
                  and actor_id = tests.id('dir1') and new_data ->> 'full_name' = 'Eva Nova'), 'criação auditada com o ator');
select is((select confirmed_by from public.import_batches where id = tests.id('batch')), tests.id('dir1'), 'quem confirmou registrado');

select tests.login('dir1', 'aal2');
select throws_ok(format($$select public.import_create_batch(%L, %L, 'de novo.csv', %L, 9)$$,
  tests.unit('geral'), tests.id('map'), repeat('b', 64)), '23505', null, 'mesmo arquivo não é importado duas vezes na unidade');
select lives_ok(format($$select public.import_create_batch(%L, %L, 'clientes.csv', %L, 9)$$,
  tests.unit('vip'), tests.id('map'), repeat('b', 64)), 'o mesmo arquivo pode ser preparado em outra unidade');

-- Descarte apaga as linhas
with b as (select public.import_create_batch(tests.unit('geral'), tests.id('map'), 'outro.csv', repeat('c', 64), 1) as id)
insert into test_ids (k, v) select 'batch2', id from b;
select public.import_stage_rows(tests.id('batch2'), '[{"row_number":1,"full_name":"Helena"}]');
select lives_ok(format('select public.import_discard_batch(%L)', tests.id('batch2')), 'descarta lote');
select is(tests.count(format('select 1 from public.import_rows where batch_id = %L', tests.id('batch2'))), 0::bigint,
  'linhas do lote descartado apagadas');
select throws_ok(format($$select public.import_stage_rows(%L, '[{"row_number":1,"full_name":"X"}]')$$, tests.id('batch2')),
  '22023', null, 'lote encerrado não recebe linhas');
-- Edição de mapeamento aprovado volta para rascunho
select lives_ok(format($$select public.import_save_mapping(%L, 'Clientes Trinks v2', '{"full_name":"Cliente"}', 'DD/MM/YYYY', '{Cliente}')$$,
  tests.id('map')), 'edita mapeamento');
reset role; select tests.clear();
select ok((select status = 'rascunho' and approved_by is null from public.import_mappings where id = tests.id('map')),
  'mapeamento editado exige nova aprovação');

select ok(not has_function_privilege('authenticated', 'public.import_purge_staging(integer)', 'execute'),
  'expurgo de staging só pelo administrador do banco');
select ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS em todas as tabelas');

select * from finish();
rollback;
