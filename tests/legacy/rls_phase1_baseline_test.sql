-- =============================================================================
-- Testes de isolamento e permissões da Fase 1.
--
-- Roda tudo em uma transação e desfaz ao final (ROLLBACK). Use somente em
-- banco local ou de desenvolvimento, nunca em produção.
--
--   Pré-checagem:  scripts/precheck-migrations.sh
--   Stack local:   psql "$(supabase status -o env | grep DB_URL ...)" \
--                    -v ON_ERROR_STOP=1 -f supabase/tests/rls_phase1_test.sql
--
-- Qualquer asserção falha interrompe o script com erro.
-- =============================================================================

\set ON_ERROR_STOP 1
\o /dev/null
begin;

create schema tests;
grant usage on schema tests to authenticated, anon;

-- Helpers ---------------------------------------------------------------------

create function tests.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;

create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Volta ao administrador do banco: usar sempre após `reset role`.
create function tests.clear_claims() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALHOU: %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'with q as (' || p_sql || ') select count(*) from q' into n;
  return n;
end $$;

-- Espera erro. p_state opcional: SQLSTATE esperado.
create function tests.throws(p_sql text, p_msg text, p_state text default null)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is not null and sqlstate <> p_state then
      raise exception 'FALHOU: % (esperado SQLSTATE %, veio % - %)', p_msg, p_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok - % [% %]', p_msg, sqlstate, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % (nenhum erro)', p_msg;
end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- Massa de teste (como administrador do banco) --------------------------------

create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;

create function tests.id(p_k text) returns uuid language sql stable as $$
  select v from ids where k = p_k
$$;
grant execute on function tests.id(text) to authenticated, anon;

insert into ids (k, v)
select k, gen_random_uuid() from unnest(array[
  'admin', 'admin2', 'rec_geral', 'rec_geral_nocancel', 'prof_geral', 'prof_geral2',
  'rec_vip', 'leitura_geral', 'inativo'
]) k;

insert into ids (k, v) select 'geral', id from public.units where code = 'geral';
insert into ids (k, v) select 'vip', id from public.units where code = 'vip';

insert into auth.users (id, email)
select v, k || '@teste.invalid' from ids where k not in ('geral', 'vip');

insert into public.profiles (id, full_name, active, deactivation_reason)
select v, 'Usuário ' || k, k <> 'inativo', case when k = 'inativo' then 'teste' end
from ids where k not in ('geral', 'vip');

insert into public.platform_admins (user_id) values (tests.id('admin')), (tests.id('admin2'));

insert into public.unit_memberships (user_id, unit_id, role) values
  (tests.id('admin'), tests.id('geral'), 'admin_unidade'),
  (tests.id('admin'), tests.id('vip'), 'admin_unidade'),
  (tests.id('rec_geral'), tests.id('geral'), 'recepcao'),
  (tests.id('rec_geral_nocancel'), tests.id('geral'), 'recepcao'),
  (tests.id('prof_geral'), tests.id('geral'), 'profissional'),
  (tests.id('prof_geral2'), tests.id('geral'), 'profissional'),
  (tests.id('rec_vip'), tests.id('vip'), 'recepcao'),
  (tests.id('leitura_geral'), tests.id('geral'), 'somente_leitura'),
  (tests.id('inativo'), tests.id('geral'), 'recepcao');

insert into public.membership_permission_overrides (membership_id, permission_code, effect, reason)
select m.id, 'appointments.cancel', 'revoke', 'teste de revogação'
from public.unit_memberships m where m.user_id = tests.id('rec_geral_nocancel');

insert into public.membership_permission_overrides (membership_id, permission_code, effect, reason)
select m.id, 'clients.view', 'grant', 'teste de concessão'
from public.unit_memberships m where m.user_id = tests.id('prof_geral2');

insert into ids (k, v) values
  ('svc_geral', gen_random_uuid()), ('svc_vip', gen_random_uuid()),
  ('pro_geral', gen_random_uuid()), ('pro_geral2', gen_random_uuid()), ('pro_vip', gen_random_uuid()),
  ('cli_geral', gen_random_uuid()), ('cli_vip', gen_random_uuid()),
  ('apt_geral_p1', gen_random_uuid()), ('apt_geral_p2', gen_random_uuid()), ('apt_vip', gen_random_uuid());

insert into public.services (id, unit_id, name, duration_minutes, price_cents) values
  (tests.id('svc_geral'), tests.id('geral'), 'Corte', 60, 8000),
  (tests.id('svc_vip'), tests.id('vip'), 'Tratamento VIP', 90, 30000);

insert into public.professionals (id, unit_id, user_id, display_name) values
  (tests.id('pro_geral'), tests.id('geral'), tests.id('prof_geral'), 'Ana'),
  (tests.id('pro_geral2'), tests.id('geral'), tests.id('prof_geral2'), 'Bia'),
  (tests.id('pro_vip'), tests.id('vip'), null, 'Carla');

insert into public.clients (id, unit_id, full_name, phone) values
  (tests.id('cli_geral'), tests.id('geral'), 'Cliente Geral', '5511999990001'),
  (tests.id('cli_vip'), tests.id('vip'), 'Cliente VIP', '5511999990002');

insert into public.appointments (id, unit_id, client_id, professional_id, service_id, starts_at, ends_at) values
  (tests.id('apt_geral_p1'), tests.id('geral'), tests.id('cli_geral'), tests.id('pro_geral'), tests.id('svc_geral'),
   '2030-01-10 13:00-03', '2030-01-10 14:00-03'),
  (tests.id('apt_geral_p2'), tests.id('geral'), tests.id('cli_geral'), tests.id('pro_geral2'), tests.id('svc_geral'),
   '2030-01-10 13:00-03', '2030-01-10 14:00-03'),
  (tests.id('apt_vip'), tests.id('vip'), tests.id('cli_vip'), tests.id('pro_vip'), tests.id('svc_vip'),
   '2030-01-10 13:00-03', '2030-01-10 14:30-03');

-- =============================================================================
-- 1. Anônimo não acessa nada
-- =============================================================================
select tests.as_anon();
select tests.throws('select * from public.clients', 'anon não lê clients', '42501');
select tests.throws('select * from public.units', 'anon não lê units', '42501');
select tests.throws('select * from public.audit_log', 'anon não lê audit_log', '42501');
select tests.throws('select public.has_permission(null, ''clients.view'')', 'anon não executa has_permission', '42501');
reset role;
select tests.clear_claims();

-- =============================================================================
-- 2. Recepção da Geral: isolada da Sala VIP
-- =============================================================================
select tests.as_user(tests.id('rec_geral'));
select tests.ok(tests.count('select 1 from public.units') = 1, 'recepção Geral vê apenas a própria unidade');
select tests.ok(tests.count('select 1 from public.clients') = 1, 'recepção Geral vê 1 cliente');
select tests.ok(tests.count(format('select 1 from public.clients where unit_id = %L', tests.id('vip'))) = 0,
  'recepção Geral não vê clientes da VIP');
select tests.ok(tests.count(format('select 1 from public.appointments where unit_id = %L', tests.id('vip'))) = 0,
  'recepção Geral não vê agenda da VIP');
select tests.ok(tests.count('select 1 from public.appointments') = 2, 'recepção Geral vê toda a agenda da Geral');
select tests.throws(format('insert into public.clients (unit_id, full_name) values (%L, ''Intrusa'')', tests.id('vip')),
  'recepção Geral não cria cliente na VIP', '42501');
select tests.ok(tests.count(format(
  'update public.clients set notes = ''x'' where id = %L returning 1', tests.id('cli_vip'))) = 0,
  'recepção Geral não altera cliente da VIP');
insert into public.clients (unit_id, full_name, phone) values (tests.id('geral'), 'Nova Cliente', '5511988887777');
select tests.ok((select created_by from public.clients where full_name = 'Nova Cliente') = tests.id('rec_geral'),
  'created_by é preenchido com o ator');
select tests.throws(format('delete from public.clients where id = %L', tests.id('cli_geral')),
  'não existe DELETE de clientes', '42501');
select tests.throws(format('update public.clients set archived_at = now() where id = %L', tests.id('cli_geral')),
  'recepção não arquiva clientes', '42501');
select tests.throws(format('update public.clients set unit_id = %L where id = %L', tests.id('vip'), tests.id('cli_geral')),
  'unit_id não pode ser alterado pela aplicação', '42501');
select tests.throws(format(
  'insert into public.clients (unit_id, full_name, created_by) values (%L, ''X'', %L)', tests.id('geral'), tests.id('admin')),
  'created_by não pode ser enviado pelo cliente', '42501');
select tests.ok(tests.count('select 1 from public.audit_log') = 0, 'recepção não vê auditoria');
select tests.throws('insert into public.audit_log (table_name, action) values (''x'', ''INSERT'')',
  'ninguém insere auditoria manualmente', '42501');
select tests.throws(format('insert into public.unit_memberships (user_id, unit_id, role) values (%L, %L, ''admin_unidade'')',
  tests.id('rec_geral'), tests.id('vip')), 'recepção não cria vínculos', '42501');
select tests.ok(tests.count(format(
  'update public.unit_memberships set role = ''admin_unidade'' where user_id = %L returning 1', tests.id('rec_geral'))) = 0,
  'recepção não promove o próprio papel');
select tests.throws(format('insert into public.platform_admins (user_id) values (%L)', tests.id('rec_geral')),
  'recepção não vira Admin Geral', '42501');
select tests.throws(format('update public.profiles set active = false, deactivation_reason = ''saída'' where id = %L', tests.id('rec_geral')),
  'usuário não altera o próprio status', '42501');
update public.profiles set full_name = 'Recepção Geral' where id = tests.id('rec_geral');
select tests.ok((select full_name from public.profiles where id = tests.id('rec_geral')) = 'Recepção Geral',
  'usuário edita o próprio nome');
select tests.ok(tests.count('select 1 from public.profiles') = 1, 'usuário vê apenas o próprio perfil');
select tests.ok(tests.count(format('select * from public.my_permissions(%L)', tests.id('geral'))) = 9,
  'my_permissions lista as 9 permissões da recepção');
select tests.ok(tests.count(format('select * from public.my_permissions(%L)', tests.id('vip'))) = 0,
  'my_permissions vazio na unidade sem vínculo');
-- Cancelamento exige motivo e não pode ser revertido
select tests.throws(format('update public.appointments set status = ''cancelado'' where id = %L', tests.id('apt_geral_p1')),
  'cancelar exige motivo', '23514');
update public.appointments set status = 'cancelado', cancel_reason = 'cliente desmarcou' where id = tests.id('apt_geral_p1');
select tests.ok((select cancelled_by from public.appointments where id = tests.id('apt_geral_p1')) = tests.id('rec_geral'),
  'cancelled_by registrado');
select tests.throws(format('update public.appointments set status = ''agendado'' where id = %L', tests.id('apt_geral_p1')),
  'cancelado não reabre', '23514');
reset role;
select tests.clear_claims();

-- =============================================================================
-- 3. Recepção da VIP: isolada da Geral
-- =============================================================================
select tests.as_user(tests.id('rec_vip'));
select tests.ok(tests.count('select 1 from public.clients') = 1, 'recepção VIP vê 1 cliente');
select tests.ok(tests.count(format('select 1 from public.clients where unit_id = %L', tests.id('geral'))) = 0,
  'recepção VIP não vê clientes da Geral');
select tests.ok(tests.count('select 1 from public.professionals') = 1, 'recepção VIP vê só profissionais da VIP');
-- Integridade entre unidades: cliente da Geral em agendamento da VIP
select tests.throws(format(
  'insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
   values (%L, %L, %L, %L, ''2030-02-01 10:00-03'', ''2030-02-01 11:00-03'')',
  tests.id('vip'), tests.id('cli_geral'), tests.id('pro_vip'), tests.id('svc_vip')),
  'agendamento não mistura cliente de outra unidade', '23503');
-- Conflito de horário do mesmo profissional
select tests.throws(format(
  'insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
   values (%L, %L, %L, %L, ''2030-01-10 14:00-03'', ''2030-01-10 15:00-03'')',
  tests.id('vip'), tests.id('cli_vip'), tests.id('pro_vip'), tests.id('svc_vip')),
  'profissional não tem atendimentos sobrepostos', '23P01');
insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
values (tests.id('vip'), tests.id('cli_vip'), tests.id('pro_vip'), tests.id('svc_vip'),
        '2030-01-10 14:30-03', '2030-01-10 15:30-03');
select tests.ok(true, 'horário encostado (fim = início) é permitido');
reset role;
select tests.clear_claims();

-- =============================================================================
-- 4. Profissional: vê só a própria agenda, sem cadastro de clientes
-- =============================================================================
select tests.as_user(tests.id('prof_geral'));
select tests.ok(tests.count('select 1 from public.clients') = 0, 'profissional não lê cadastro de clientes');
select tests.ok(tests.count('select 1 from public.appointments') = 1, 'profissional vê apenas os próprios agendamentos');
select tests.ok(tests.count('select 1 from public.get_my_agenda(''2030-01-01'', ''2030-01-31'') where client_name = ''Cliente Geral''') = 1,
  'get_my_agenda devolve o nome do cliente');
select tests.throws('select * from public.get_my_agenda(''2030-01-01'', ''2030-06-01'')',
  'get_my_agenda limita o intervalo', '22023');
select tests.throws(format(
  'insert into public.appointments (unit_id, client_id, professional_id, service_id, starts_at, ends_at)
   values (%L, %L, %L, %L, ''2030-03-01 10:00-03'', ''2030-03-01 11:00-03'')',
  tests.id('geral'), tests.id('cli_geral'), tests.id('pro_geral'), tests.id('svc_geral')),
  'profissional não cria agendamento', '42501');
reset role;
select tests.clear_claims();

-- =============================================================================
-- 5. Exceções individuais
-- =============================================================================
select tests.as_user(tests.id('prof_geral2'));
select tests.ok(tests.count('select 1 from public.clients') >= 1, 'concessão individual: profissional com clients.view lê clientes');
select tests.ok(tests.count('select 1 from public.membership_permission_overrides') = 1, 'usuário vê as próprias exceções');
reset role;
select tests.clear_claims();

select tests.as_user(tests.id('rec_geral_nocancel'));
select tests.throws(format(
  'update public.appointments set status = ''cancelado'', cancel_reason = ''x'' where id = %L', tests.id('apt_geral_p2')),
  'revogação individual: recepção sem appointments.cancel não cancela', '42501');
update public.appointments set notes = 'confirmar por telefone' where id = tests.id('apt_geral_p2');
select tests.ok((select notes from public.appointments where id = tests.id('apt_geral_p2')) = 'confirmar por telefone',
  'revogação não afeta as demais permissões');
reset role;
select tests.clear_claims();

-- Somente appointments.cancel não permite remarcar
update public.membership_permission_overrides o set effect = 'grant', reason = 'teste'
from public.unit_memberships m
where o.membership_id = m.id and m.user_id = tests.id('rec_geral_nocancel');
insert into public.membership_permission_overrides (membership_id, permission_code, effect, reason)
select m.id, 'appointments.update', 'revoke', 'teste: só cancela'
from public.unit_memberships m where m.user_id = tests.id('rec_geral_nocancel');
select tests.as_user(tests.id('rec_geral_nocancel'));
select tests.throws(format(
  'update public.appointments set starts_at = starts_at + interval ''1 hour'', ends_at = ends_at + interval ''1 hour'' where id = %L',
  tests.id('apt_geral_p2')), 'quem só cancela não remarca', '42501');
update public.appointments set status = 'cancelado', cancel_reason = 'desistiu' where id = tests.id('apt_geral_p2');
select tests.ok((select status from public.appointments where id = tests.id('apt_geral_p2')) = 'cancelado',
  'quem só cancela consegue cancelar');
reset role;
select tests.clear_claims();

-- =============================================================================
-- 6. Somente leitura e usuário inativo
-- =============================================================================
select tests.as_user(tests.id('leitura_geral'));
select tests.ok(tests.count('select 1 from public.clients') >= 1, 'somente leitura lê clientes');
select tests.throws(format('insert into public.clients (unit_id, full_name) values (%L, ''X'')', tests.id('geral')),
  'somente leitura não cria clientes', '42501');
select tests.ok(tests.count(format(
  'update public.clients set notes = ''x'' where id = %L returning 1', tests.id('cli_geral'))) = 0,
  'somente leitura não edita clientes');
reset role;
select tests.clear_claims();

select tests.as_user(tests.id('inativo'));
select tests.ok(tests.count('select 1 from public.clients') = 0, 'usuário inativo não lê clientes');
select tests.ok(tests.count('select 1 from public.appointments') = 0, 'usuário inativo não lê agenda');
select tests.ok(tests.count('select 1 from public.units') = 0, 'usuário inativo não lê unidades');
reset role;
select tests.clear_claims();

-- =============================================================================
-- 7. Admin Geral
-- =============================================================================
select tests.as_user(tests.id('admin2'));
select tests.ok(tests.count('select 1 from public.units') = 2, 'Admin Geral vê todas as unidades');
select tests.ok(tests.count('select 1 from public.clients') = 0,
  'Admin Geral sem vínculo não lê dados operacionais');
select tests.ok(tests.count('select 1 from public.audit_log') > 0, 'Admin Geral lê auditoria');
reset role;
select tests.clear_claims();

select tests.as_user(tests.id('admin'));
select tests.ok(tests.count('select 1 from public.clients') >= 2, 'Admin Geral com vínculos lê as duas unidades');
select tests.throws(format(
  'insert into public.professionals (unit_id, user_id, display_name) values (%L, %L, ''Sem vínculo'')',
  tests.id('vip'), tests.id('rec_geral')),
  'profissional só pode ser ligado a usuário com vínculo na unidade', '23514');
update public.clients set archived_at = now() where id = tests.id('cli_geral');
select tests.ok((select archived_by from public.clients where id = tests.id('cli_geral')) = tests.id('admin'),
  'admin da unidade arquiva cliente');
select tests.throws(format('update public.profiles set active = false where id = %L', tests.id('rec_geral')),
  'desativação exige motivo', '23514');
update public.profiles set active = false, deactivation_reason = 'desligamento' where id = tests.id('rec_geral');
select tests.ok((select not active and deactivated_at is not null from public.profiles where id = tests.id('rec_geral')),
  'Admin Geral desativa usuário com motivo e data');
select tests.throws(format('update public.profiles set active = false, deactivation_reason = ''x x'' where id = %L', tests.id('admin')),
  'Admin Geral não desativa a si mesmo', '42501');
select tests.ok(tests.count(format(
  'select 1 from public.audit_log where table_name = ''profiles'' and record_id = %L and actor_id = %L',
  tests.id('rec_geral'), tests.id('admin'))) = 1, 'desativação auditada com o ator');
reset role;
select tests.clear_claims();

select tests.as_user(tests.id('rec_geral'));
select tests.ok(tests.count('select 1 from public.clients') = 0, 'usuário desativado perde o acesso imediatamente');
reset role;
select tests.clear_claims();

select tests.as_user(tests.id('admin'));
update public.profiles set active = true where id = tests.id('rec_geral');
select tests.ok((select active and deactivated_at is null and deactivation_reason is null
                 from public.profiles where id = tests.id('rec_geral')), 'reativação limpa data e motivo');
reset role;
select tests.clear_claims();

-- Último Admin Geral (como administrador do banco)
update public.profiles set active = false, deactivation_reason = 'teste' where id = tests.id('admin2');
select tests.throws(format('update public.profiles set active = false, deactivation_reason = ''teste'' where id = %L', tests.id('admin')),
  'último Admin Geral ativo não pode ser desativado', '42501');
select tests.throws(format('delete from public.platform_admins where user_id = %L', tests.id('admin')),
  'último Admin Geral ativo não pode ser removido', '42501');

-- =============================================================================
-- 8. Privilégios e funções
-- =============================================================================
select tests.ok(not exists (
  select 1 from pg_tables t
  where t.schemaname = 'public' and not t.rowsecurity
), 'todas as tabelas de public têm RLS');
select tests.ok(not exists (
  select 1 from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee = 'anon'
), 'anon não tem privilégio em nenhuma tabela');
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce('search_path=""' = any(p.proconfig), false)
), 'toda função SECURITY DEFINER fixa search_path vazio');
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
), 'anon não executa funções de public');

rollback;
\o
\echo 'Todos os testes passaram.'
