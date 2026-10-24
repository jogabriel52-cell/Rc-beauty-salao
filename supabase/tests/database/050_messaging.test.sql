-- Fase 4 — WhatsApp oficial (bloqueado até credenciais/consentimento/testes),
-- consentimento e opt-out, caixa de entrada, rascunhos e SDR IA, follow-ups,
-- pesquisas e reengajamento.
begin;
\ir ../helpers/setup.psql

select no_plan();

select tests.create_person('dir');
select tests.create_person('ger');
select tests.create_person('vend');
select tests.create_person('vend2');
select tests.create_person('recep');
select tests.create_person('prof');
select tests.create_person('vendvip');
select tests.link('dir', 'geral', 'direcao');
select tests.link('dir', 'vip', 'direcao');
select tests.link('ger', 'geral', 'gerente');
select tests.link('vend', 'geral', 'vendedora');
select tests.link('vend2', 'geral', 'vendedora');
select tests.link('recep', 'geral', 'recepcao');
select tests.link('prof', 'geral', 'profissional');
select tests.link('vendvip', 'vip', 'vendedora');

insert into test_ids (k, v) values ('id_ana', gen_random_uuid()), ('cu_ana', gen_random_uuid()),
  ('id_bia', gen_random_uuid()), ('cu_bia', gen_random_uuid()), ('svc', gen_random_uuid()), ('pro', gen_random_uuid()),
  ('apt', gen_random_uuid());
insert into public.client_identities (id, full_name, phone) values
  (tests.id('id_ana'), 'Ana Mensagem Teste', '5511955550001'),
  (tests.id('id_bia'), 'Bia Inativa', '5511955550002');
insert into public.client_units (id, unit_id, identity_id) values
  (tests.id('cu_ana'), tests.unit('geral'), tests.id('id_ana')),
  (tests.id('cu_bia'), tests.unit('geral'), tests.id('id_bia'));
insert into public.services (id, unit_id, name, duration_minutes, price_cents) values (tests.id('svc'), tests.unit('geral'), 'Manicure', 45, 4000);
insert into public.professionals (id, unit_id, display_name) values (tests.id('pro'), tests.unit('geral'), 'Prof');
insert into public.appointments (id, unit_id, client_id, professional_id, service_id, starts_at, ends_at) values
  (tests.id('apt'), tests.unit('geral'), tests.id('cu_ana'), tests.id('pro'), tests.id('svc'), now() - interval '1 day', now() - interval '1 day' + interval '45 minutes');
update public.appointments set status = 'concluido' where id = tests.id('apt');

create function tests.channel(p_unit text) returns uuid language sql stable as $$
  select id from public.messaging_channels where unit_id = tests.unit(p_unit)
$$;
grant execute on function tests.channel(text) to authenticated;

-- Canal ---------------------------------------------------------------------------
select is((select count(*)::int from public.messaging_channels where status = 'desativado'), 2, 'canais nascem desativados');

select tests.login('dir', 'aal2');
select throws_ok(format($$update public.messaging_channels set status = 'ativo' where id = %L$$, tests.channel('geral')),
  '23514', null, 'ativação sem verificações é recusada');
select lives_ok(format($$update public.messaging_channels set phone_number_id = '123456789012', display_phone = '5511900001111',
  consent_text = 'Ao informar seu WhatsApp você aceita receber mensagens sobre seus atendimentos. Responda PARAR para sair.'
  where id = %L$$, tests.channel('geral')), 'Direção configura número e texto de consentimento');
select throws_ok(format($$update public.messaging_channels set credentials_verified_at = now() where id = %L$$, tests.channel('geral')),
  '42501', null, 'verificação de credenciais não pode ser marcada pela aplicação');
reset role; select tests.clear();

select tests.login('ger');
select is(tests.count(format($$update public.messaging_channels set status = 'ativo' where id = %L returning 1$$, tests.channel('geral'))),
  0::bigint, 'Gerente não configura o canal');
reset role; select tests.clear();

-- Verificações feitas pelas funções de servidor
select public.messaging_mark_channel('geral', 'credentials');
select public.messaging_mark_channel('geral', 'webhook');
select public.messaging_mark_channel('geral', 'test');
select ok(not has_function_privilege('authenticated', 'public.messaging_mark_channel(text, text)', 'execute'),
  'marcação de verificações só pelo servidor');

select tests.login('dir', 'aal2');
select lives_ok(format($$update public.messaging_channels set status = 'ativo' where id = %L$$, tests.channel('geral')),
  'com credenciais, webhook, consentimento e teste o canal é ativado');
select is((select activated_by from public.messaging_channels where id = tests.channel('geral')), tests.id('dir'), 'quem ativou registrado');
select lives_ok(format($$update public.messaging_channels set phone_number_id = '999999999999' where id = %L$$, tests.channel('geral')),
  'troca de número');
select ok((select status = 'configurado' and credentials_verified_at is null and test_message_at is null
           from public.messaging_channels where id = tests.channel('geral')), 'trocar número invalida verificações e desativa o envio');
reset role; select tests.clear();
update public.messaging_channels set phone_number_id = '123456789012' where id = tests.channel('geral');
select public.messaging_mark_channel('geral', 'credentials');
select public.messaging_mark_channel('geral', 'webhook');
select public.messaging_mark_channel('geral', 'test');
update public.messaging_channels set status = 'ativo' where id = tests.channel('geral');

-- Webhook / caixa de entrada --------------------------------------------------------
select is(public.whatsapp_ingest($${"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123456789012"},
  "contacts":[{"profile":{"name":"Ana"}}],
  "messages":[{"from":"5511955550001","id":"wamid.IN1","type":"text","text":{"body":"Oi, quero agendar"}}]}}]}]}$$::jsonb) ->> 'mensagens',
  '1', 'webhook registra mensagem recebida');
select ok(exists (select 1 from public.conversations where contact_phone = '5511955550001' and client_unit_id = tests.id('cu_ana')),
  'conversa ligada à cliente pelo telefone');
insert into test_ids (k, v) select 'conv', id from public.conversations where contact_phone = '5511955550001';
select is(public.whatsapp_ingest($${"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"000"},
  "messages":[{"from":"5511955550009","id":"wamid.X","type":"text","text":{"body":"x"}}]}}]}]}$$::jsonb) ->> 'mensagens',
  '0', 'número de canal desconhecido é ignorado');
select ok(not has_function_privilege('authenticated', 'public.whatsapp_ingest(jsonb)', 'execute'), 'ingestão só pelo servidor');

select tests.login('vend');
select is(tests.count('select 1 from public.conversations'), 1::bigint, 'Vendedora vê a caixa de entrada da unidade');
select is(tests.count('select 1 from public.messages'), 1::bigint, 'e as mensagens');
select ok((public.messaging_prepare_send(tests.id('conv'), 'Olá! Temos horário amanhã.', null) ->> 'to') = '5511955550001',
  'resposta dentro da janela de 24 h é preparada');
select is((select status from public.messages where body = 'Olá! Temos horário amanhã.'), 'na_fila', 'mensagem entra na fila');
select throws_ok(format($$insert into public.messages (unit_id, conversation_id, direction, body, status) values (%L, %L, 'saida', 'x', 'na_fila')$$,
  tests.unit('geral'), tests.id('conv')), '42501', null, 'aplicação não grava mensagem como enviada');
select lives_ok(format($$insert into public.messages (unit_id, conversation_id, direction, body) values (%L, %L, 'saida', 'rascunho')$$,
  tests.unit('geral'), tests.id('conv')), 'cria rascunho');
select lives_ok($$update public.messages set status = 'descartada' where body = 'rascunho'$$, 'descarta rascunho');
select throws_ok($$update public.messages set status = 'enviada' where body = 'Olá! Temos horário amanhã.'$$,
  '42501', null, 'não altera mensagem enviada');
reset role; select tests.clear();

select tests.login('prof');
select is(tests.count('select 1 from public.conversations'), 0::bigint, 'Profissional não vê mensagens');
reset role; select tests.clear();
select tests.login('recep');
select is(tests.count('select 1 from public.conversations'), 0::bigint, 'Recepção (sem messaging.view) não vê mensagens');
reset role; select tests.clear();

-- Janela de 24 h, modelos e consentimento --------------------------------------------
update public.conversations set last_inbound_at = now() - interval '2 days' where id = tests.id('conv');
insert into test_ids (k, v) values ('tpl_rascunho', gen_random_uuid()), ('tpl_atend', gen_random_uuid()), ('tpl_mkt', gen_random_uuid());
insert into public.message_templates (id, unit_id, name, purpose, body, provider_status) values
  (tests.id('tpl_rascunho'), tests.unit('geral'), 'lembrete_rascunho', 'atendimento', 'Lembrete {{1}}', 'rascunho'),
  (tests.id('tpl_atend'), tests.unit('geral'), 'lembrete_horario', 'atendimento', 'Olá {{1}}, lembrete do seu horário.', 'aprovado'),
  (tests.id('tpl_mkt'), tests.unit('geral'), 'saudade_promo', 'marketing', 'Sentimos sua falta, {{1}}!', 'aprovado');

select tests.login('vend');
select throws_ok(format($$select public.messaging_prepare_send(%L, 'Oi', null)$$, tests.id('conv')),
  '23514', 'Fora da janela de 24 h: use um modelo de mensagem aprovado', 'fora da janela exige modelo');
select throws_ok(format($$select public.messaging_prepare_send(%L, null, %L)$$, tests.id('conv'), tests.id('tpl_rascunho')),
  '23514', 'Modelo de mensagem não aprovado', 'modelo não aprovado é recusado');
select throws_ok(format($$select public.messaging_prepare_send(%L, null, %L)$$, tests.id('conv'), tests.id('tpl_atend')),
  '23514', 'Sem consentimento registrado (opt-in) para esta finalidade', 'mensagem iniciada pelo salão exige opt-in');
reset role; select tests.clear();

select tests.login('recep');
select throws_ok(format($$insert into public.consent_events (unit_id, client_unit_id, purpose, action, source) values (%L, %L, 'atendimento', 'opt_in', 'presencial')$$,
  tests.unit('geral'), tests.id('cu_ana')), '23514', null, 'opt-in presencial exige registro da evidência');
select lives_ok(format($$insert into public.consent_events (unit_id, client_unit_id, purpose, action, source, evidence)
  values (%L, %L, 'atendimento', 'opt_in', 'presencial', 'Ficha assinada na recepção')$$, tests.unit('geral'), tests.id('cu_ana')),
  'Recepção registra opt-in de atendimento');
select throws_ok(format($$update public.consent_events set action = 'opt_out' where client_unit_id = %L$$, tests.id('cu_ana')),
  '42501', null, 'eventos de consentimento são somente inclusão');
select throws_ok(format($$insert into public.consent_events (unit_id, client_unit_id, purpose, action, source, evidence, occurred_at)
  values (%L, %L, 'marketing', 'opt_in', 'presencial', 'x', now() + interval '1 year')$$, tests.unit('geral'), tests.id('cu_ana')),
  '23514', null, 'consentimento com data futura é recusado');
reset role; select tests.clear();

select tests.login('vend');
select lives_ok(format($$select public.messaging_prepare_send(%L, null, %L)$$, tests.id('conv'), tests.id('tpl_atend')),
  'com opt-in, modelo de atendimento é preparado');
select throws_ok(format($$select public.messaging_prepare_send(%L, null, %L)$$, tests.id('conv'), tests.id('tpl_mkt')),
  '23514', 'Sem consentimento registrado (opt-in) para esta finalidade', 'marketing exige opt-in de marketing');
select lives_ok(format($$insert into public.consent_events (unit_id, client_unit_id, purpose, action, source, evidence)
  values (%L, %L, 'marketing', 'opt_in', 'presencial', 'Aceitou receber novidades')$$, tests.unit('geral'), tests.id('cu_ana')),
  'Vendedora registra opt-in de marketing');
select lives_ok(format($$select public.messaging_prepare_send(%L, null, %L)$$, tests.id('conv'), tests.id('tpl_mkt')),
  'com opt-in de marketing, modelo de marketing é preparado');
reset role; select tests.clear();

-- Opt-out por palavra-chave
select public.whatsapp_ingest($${"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123456789012"},
  "messages":[{"from":"5511955550001","id":"wamid.IN2","type":"text","text":{"body":"PARAR"}}]}}]}]}$$::jsonb);
select is(public.consent_status(tests.id('cu_ana'), 'marketing'), 'opt_out', 'PARAR registra opt-out de marketing');
select is(public.consent_status(tests.id('cu_ana'), 'atendimento'), 'opt_out', 'e de atendimento');
select tests.login('vend');
select throws_ok(format($$select public.messaging_prepare_send(%L, 'Ok, removida da lista', null)$$, tests.id('conv')),
  '23514', null, 'após opt-out nada é enviado, nem dentro da janela');
reset role; select tests.clear();

-- PARAR de número ainda sem cadastro
select public.whatsapp_ingest($${"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123456789012"},
  "messages":[{"from":"5511955550077","id":"wamid.NC1","type":"text","text":{"body":"Oi, quanto custa?"}},
              {"from":"5511955550077","id":"wamid.NC2","type":"text","text":{"body":" sair "}}]}}]}]}$$::jsonb);
insert into test_ids (k, v) select 'conv_nc', id from public.conversations where contact_phone = '5511955550077';
-- now() é fixo na transação do teste: simula que o SAIR chegou uma hora antes.
update public.conversations set opted_out_at = now() - interval '1 hour' where id = tests.id('conv_nc');
select ok((select opted_out_at is not null and client_unit_id is null from public.conversations where id = tests.id('conv_nc')),
  'SAIR de número sem cadastro fica registrado na conversa');
select tests.login('vend');
select throws_ok(format($$select public.messaging_prepare_send(%L, 'Custa R$ 40', null)$$, tests.id('conv_nc')),
  '23514', 'Contato pediu para não receber mensagens (opt-out por PARAR)', 'número sem cadastro que pediu PARAR não recebe nem dentro da janela');
reset role; select tests.clear();
insert into test_ids (k, v) values ('id_nc', gen_random_uuid()), ('cu_nc', gen_random_uuid());
insert into public.client_identities (id, full_name, phone) values (tests.id('id_nc'), 'Cliente Cadastrada Depois', '5511955550077');
insert into public.client_units (id, unit_id, identity_id) values (tests.id('cu_nc'), tests.unit('geral'), tests.id('id_nc'));
select tests.login('vend');
select lives_ok(format($$update public.conversations set client_unit_id = %L where id = %L$$, tests.id('cu_nc'), tests.id('conv_nc')),
  'conversa vinculada ao cadastro feito depois');
reset role; select tests.clear();
select is(public.consent_status(tests.id('cu_nc'), 'marketing'), 'opt_out', 'opt-out do número passa para a cliente (marketing)');
select is(public.consent_status(tests.id('cu_nc'), 'atendimento'), 'opt_out', 'e atendimento');
select ok((select bool_and(e.occurred_at = c.opted_out_at and e.source = 'palavra_chave')
           from public.consent_events e join public.conversations c on c.client_unit_id = e.client_unit_id
           where e.client_unit_id = tests.id('cu_nc')), 'com a data original do PARAR');
select tests.login('vend');
select lives_ok(format($$insert into public.consent_events (unit_id, client_unit_id, purpose, action, source)
  values (%L, %L, 'atendimento', 'opt_in', 'whatsapp')$$, tests.unit('geral'), tests.id('cu_nc')), 'cliente autoriza de novo (opt-in)');
select lives_ok(format($$select public.messaging_prepare_send(%L, 'Custa R$ 40', null)$$, tests.id('conv_nc')),
  'com opt-in posterior ao PARAR, a resposta volta a ser permitida');
select throws_ok(format($$update public.conversations set opted_out_at = null where id = %L$$, tests.id('conv_nc')),
  '42501', null, 'aplicação não apaga o PARAR da conversa');
reset role; select tests.clear();

-- Resultado do envio e status do provedor (servidor)
select public.messaging_mark_result((select id from public.messages where body = 'Olá! Temos horário amanhã.'), 'wamid.OUT1', null);
select public.whatsapp_ingest($${"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123456789012"},
  "statuses":[{"id":"wamid.OUT1","status":"read"}]}}]}]}$$::jsonb);
select is((select status from public.messages where provider_message_id = 'wamid.OUT1'), 'lida', 'status de leitura atualizado pelo webhook');

-- Canal suspenso bloqueia envio
select tests.login('dir', 'aal2');
select lives_ok(format($$update public.messaging_channels set status = 'suspenso', status_reason = 'teste' where id = %L$$, tests.channel('geral')),
  'Direção suspende o canal');
reset role; select tests.clear();
update public.conversations set last_inbound_at = now() where id = tests.id('conv');
select tests.login('vend');
select throws_ok(format($$select public.messaging_prepare_send(%L, 'Oi', null)$$, tests.id('conv')), '55000', null,
  'canal não ativo bloqueia qualquer envio');
-- SDR IA
select throws_ok(format('select public.sdr_context(%L)', tests.id('conv')), '55000', null, 'SDR IA desligada por padrão');
reset role; select tests.clear();
select tests.login('dir', 'aal2');
select lives_ok(format($$update public.messaging_channels set ai_enabled = true where id = %L$$, tests.channel('geral')), 'Direção liga a SDR IA');
reset role; select tests.clear();
select tests.login('vend');
select is(public.sdr_context(tests.id('conv')) ->> 'first_name', 'Ana', 'contexto da IA usa só o primeiro nome');
select ok(not (public.sdr_context(tests.id('conv'))::text ~ '5511955550001'), 'contexto da IA não contém telefone');
select ok(jsonb_array_length(public.sdr_context(tests.id('conv')) -> 'messages') >= 1, 'contexto traz as últimas mensagens');
select throws_ok(format($$insert into public.messages (unit_id, conversation_id, direction, body, ai_generated) values (%L, %L, 'saida', 'x', true)$$,
  tests.unit('geral'), tests.id('conv')), '42501', null, 'rascunho de IA só pelo servidor');
reset role; select tests.clear();

-- Follow-ups --------------------------------------------------------------------------
select tests.login('vend');
select lives_ok(format($$insert into public.followups (unit_id, client_unit_id, assigned_to, kind, reason, due_at)
  values (%L, %L, %L, 'retorno', 'Ligar para remarcar', now() + interval '1 day')$$, tests.unit('geral'), tests.id('cu_ana'), tests.id('vend')),
  'Vendedora cria follow-up para si');
select throws_ok(format($$insert into public.followups (unit_id, client_unit_id, assigned_to, kind, reason, due_at)
  values (%L, %L, %L, 'retorno', 'Para colega', now())$$, tests.unit('geral'), tests.id('cu_ana'), tests.id('vend2')),
  '42501', null, 'com escopo próprio não atribui a outra pessoa');
reset role; select tests.clear();
select tests.login('ger');
select lives_ok(format($$insert into public.followups (unit_id, client_unit_id, assigned_to, kind, reason, due_at)
  values (%L, %L, %L, 'reengajamento', 'Cliente inativa', now())$$, tests.unit('geral'), tests.id('cu_bia'), tests.id('vend2')),
  'Gerente atribui follow-up à equipe');
select ok(exists (select 1 from public.inactive_clients(tests.unit('geral'), 30) where client_unit_id = tests.id('cu_bia')),
  'reengajamento lista cliente sem visita');
select ok(not exists (select 1 from public.inactive_clients(tests.unit('geral'), 30) where client_unit_id = tests.id('cu_ana')),
  'cliente atendida recentemente não aparece');
reset role; select tests.clear();
select tests.login('vend');
select is(tests.count('select 1 from public.followups'), 1::bigint, 'Vendedora vê só os próprios follow-ups');
select lives_ok($$update public.followups set status = 'feito', outcome = 'Remarcado' where reason = 'Ligar para remarcar'$$, 'conclui');
select is((select done_by from public.followups where reason = 'Ligar para remarcar'), tests.id('vend'), 'quem concluiu registrado');
select throws_ok($$update public.followups set status = 'aberto' where reason = 'Ligar para remarcar'$$, '23514', null, 'não reabre');
select throws_ok(format('select * from public.inactive_clients(%L, 30)', tests.unit('geral')), '42501', null,
  'lista de reengajamento exige escopo da unidade');
reset role; select tests.clear();

-- Pesquisas ---------------------------------------------------------------------------
select tests.login('ger');
with s as (insert into public.surveys (unit_id, name) values (tests.unit('geral'), 'Satisfação pós-atendimento') returning id)
insert into test_ids (k, v) select 'survey', id from s;
select is(tests.count(format('select * from public.survey_candidates(%L)', tests.id('survey'))), 1::bigint,
  'atendimento concluído aparece para pedir avaliação');
select lives_ok(format($$insert into public.survey_responses (unit_id, survey_id, client_unit_id, appointment_id, score, comment)
  values (%L, %L, %L, %L, 10, 'Amei')$$, tests.unit('geral'), tests.id('survey'), tests.id('cu_ana'), tests.id('apt')), 'registra resposta');
select is(tests.count(format('select * from public.survey_candidates(%L)', tests.id('survey'))), 0::bigint, 'respondido sai da lista');
select is((public.survey_results(tests.id('survey'), current_date - 1, current_date) ->> 'nps')::int, 100, 'NPS calculado');
reset role; select tests.clear();
select tests.login('vend');
select throws_ok(format('select public.survey_results(%L, current_date, current_date)', tests.id('survey')), '42501', null,
  'Vendedora sem permissão de pesquisas');
reset role; select tests.clear();

-- Conversa iniciada pelo salão
insert into test_ids (k, v) values ('id_semfone', gen_random_uuid()), ('cu_semfone', gen_random_uuid());
insert into public.client_identities (id, full_name) values (tests.id('id_semfone'), 'Cliente Sem Fone');
insert into public.client_units (id, unit_id, identity_id) values (tests.id('cu_semfone'), tests.unit('geral'), tests.id('id_semfone'));
select tests.login('vend');
select lives_ok(format($$insert into test_ids (k, v) values ('conv_start', public.messaging_start_conversation(%L))$$, tests.id('cu_bia')),
  'Vendedora inicia conversa com cliente da unidade');
select is(public.messaging_start_conversation(tests.id('cu_bia')), tests.id('conv_start'), 'iniciar de novo reabre a mesma conversa');
select throws_ok(format('select public.messaging_start_conversation(%L)', tests.id('cu_semfone')), '23514', null,
  'cliente sem telefone não tem conversa de WhatsApp');
reset role; select tests.clear();
select is((select contact_phone from public.conversations where id = tests.id('conv_start')), '5511955550002',
  'conversa usa o telefone do cadastro');
select ok((select assigned_to is not null from public.conversations where id = tests.id('conv_start')), 'conversa fica atribuída');
select is((select count(*)::int from public.messages where conversation_id = tests.id('conv_start') and direction = 'saida'
           and status <> 'rascunho'), 0, 'iniciar conversa não envia mensagem');
select tests.login('recep');
select throws_ok(format('select public.messaging_start_conversation(%L)', tests.id('cu_bia')), '42501', null,
  'Recepção sem messaging.send não inicia conversa');
reset role; select tests.clear();
select tests.login('vendvip');
select throws_ok(format('select public.messaging_start_conversation(%L)', tests.id('cu_bia')), '42501', null,
  'Vendedora da VIP não inicia conversa com cliente da Geral');
reset role; select tests.clear();

-- Mescla move consentimento e follow-ups
select tests.login('ger');
select lives_ok(format('select public.merge_clients(%L, %L, %L)', tests.unit('geral'), tests.id('cu_ana'), tests.id('cu_bia')),
  'mescla clientes');
reset role; select tests.clear();
select ok(not exists (select 1 from public.followups where client_unit_id = tests.id('cu_bia')), 'follow-ups movidos na mescla');

select tests.anon();
select throws_ok('select * from public.messages', '42501', null, 'anon não lê mensagens');
reset role; select tests.clear();
select ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS em todas as tabelas');

select * from finish();
rollback;
