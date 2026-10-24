-- Fase 0 — modelo de acesso: perfis editáveis, escopos, MFA, anti-escalada,
-- autoproteção, proteção do Admin Geral, auditoria.
begin;
\ir ../helpers/setup.psql

select no_plan();

-- Massa ---------------------------------------------------------------------
select tests.create_person('admin');
select tests.create_person('dir1');
select tests.create_person('dir2');
select tests.create_person('gerente');
select tests.create_person('recep');
select tests.create_person('vend_vip');
select tests.create_auth_user('novo');
insert into public.platform_admins (user_id) values (tests.id('admin'));
select tests.link('admin', 'geral', 'admin_geral');
select tests.link('admin', 'vip', 'admin_geral');
select tests.link('dir1', 'geral', 'direcao');
select tests.link('dir1', 'vip', 'direcao');
select tests.link('dir2', 'geral', 'direcao');
select tests.link('dir2', 'vip', 'direcao');
select tests.link('gerente', 'geral', 'gerente');
select tests.link('recep', 'geral', 'recepcao');
select tests.link('vend_vip', 'vip', 'vendedora');

-- Catálogo ------------------------------------------------------------------
select is((select count(*)::int from public.access_profiles where key is not null), 7,
  'sete perfis iniciais com chave');
select set_eq($$select name from public.access_profiles$$,
  array['Admin Geral', 'Direção', 'Gerente', 'Vendedora', 'Recepção', 'Profissional', 'Somente leitura'],
  'nomes dos perfis iniciais');
select ok((select bool_and(requires_mfa) from public.access_profiles where key in ('admin_geral', 'direcao')),
  'Admin Geral e Direção exigem MFA');
select ok(not exists (select 1 from public.access_profiles where key not in ('admin_geral', 'direcao') and requires_mfa),
  'demais perfis não exigem MFA por padrão');

-- Anônimo -------------------------------------------------------------------
select tests.anon();
select throws_ok('select * from public.access_profiles', '42501', null, 'anon não lê perfis de acesso');
select throws_ok('select * from public.unit_memberships', '42501', null, 'anon não lê vínculos');
select throws_ok('select public.my_access()', '42501', null, 'anon não executa my_access');
reset role; select tests.clear();

-- MFA -----------------------------------------------------------------------
select tests.login('dir1', 'aal1');
select is(tests.count(format('select * from public.my_permissions(%L)', tests.unit('geral'))), 0::bigint,
  'Direção sem MFA (aal1) não tem permissões efetivas');
select ok(not public.can_manage_access(tests.unit('geral')), 'Direção sem MFA não gere acessos');
select ok((public.my_access() ->> 'mfa_required')::boolean, 'my_access informa que MFA é exigido');
select is(tests.count('select 1 from public.units'), 0::bigint, 'Direção sem MFA não vê unidades');
reset role; select tests.clear();

select tests.login('dir1', 'aal2');
select ok(public.can_manage_access(tests.unit('geral')), 'Direção com MFA gere acessos na Geral');
select ok(public.can_manage_access(tests.unit('vip')), 'Direção com MFA gere acessos na VIP');
select ok(public.can_manage_templates(), 'Direção com MFA edita modelos (gere todas as unidades)');
select is(tests.count('select 1 from public.units'), 2::bigint, 'Direção vê as duas unidades');
reset role; select tests.clear();

select tests.login('admin', 'aal1');
select ok(not public.is_platform_admin(), 'Admin Geral sem MFA não é reconhecido como Admin Geral');
reset role; select tests.clear();
select tests.login('admin', 'aal2');
select ok(public.is_platform_admin(), 'Admin Geral com MFA é reconhecido');
reset role; select tests.clear();

select tests.login('recep', 'aal1');
select ok(not (public.my_access() ->> 'mfa_required')::boolean, 'Recepção não exige MFA');
select is(tests.count('select 1 from public.units'), 1::bigint, 'Recepção vê só a própria unidade');
reset role; select tests.clear();

-- Concessão de acesso pela Direção ------------------------------------------
select tests.login('dir1', 'aal2');
select lives_ok(format(
  $$select public.admin_provision_person(%L, 'Pessoa Nova', 'Manicure',
     jsonb_build_array(jsonb_build_object('unit_id', %L, 'access_profile_id', %L)))$$,
  tests.id('novo'), tests.unit('geral'), tests.profile('profissional')),
  'Direção cadastra pessoa com vínculo e perfil');
select is(tests.count(format('select 1 from public.unit_memberships where user_id = %L', tests.id('novo'))), 1::bigint,
  'vínculo criado');
select is(tests.count(format(
  $$select 1 from public.audit_log where table_name = 'unit_memberships' and action = 'INSERT'
     and actor_id = %L and new_data ->> 'user_id' = %L$$, tests.id('dir1'), tests.id('novo'))), 1::bigint,
  'concessão de acesso auditada com o ator');

-- Ninguém altera as próprias permissões
select throws_ok(format('update public.unit_memberships set access_profile_id = %L where id = %L',
  tests.profile('gerente'), tests.membership('dir1', 'geral')), '42501', null,
  'Direção não altera o próprio vínculo');
select throws_ok(format(
  $$insert into public.membership_permission_overrides (membership_id, permission_code, effect, scope, reason)
    values (%L, 'audit.view', 'grant', 'unit', 'autoconcessão')$$, tests.membership('dir1', 'geral')),
  '42501', null, 'Direção não cria exceção para si');
select throws_ok(format(
  $$insert into public.unit_memberships (user_id, unit_id, access_profile_id) values (%L, %L, %L)$$,
  tests.id('dir1'), tests.unit('geral'), tests.profile('gerente')),
  '42501', null, 'ninguém cria vínculo para si');

-- Admin Geral só por Admin Geral
select throws_ok(format('update public.unit_memberships set active = false where id = %L',
  tests.membership('admin', 'vip')), '42501', null, 'Direção não altera vínculo do Admin Geral');
select throws_ok(format(
  $$update public.profiles set active = false, deactivation_reason = 'teste' where id = %L$$, tests.id('admin')),
  '42501', null, 'Direção não desativa o Admin Geral');

-- Direção altera outra pessoa da Direção (não é ela mesma)
select lives_ok(format(
  $$insert into public.membership_permission_overrides (membership_id, permission_code, effect, reason)
    values (%L, 'audit.view', 'revoke', 'teste de revogação')$$, tests.membership('dir2', 'vip')),
  'Direção revoga permissão de outra pessoa da Direção');

-- Delegação para a Gerente e anti-escalada
select lives_ok(format(
  $$insert into public.membership_permission_overrides (membership_id, permission_code, effect, scope, reason)
    values (%L, 'access.manage', 'grant', 'unit', 'delegação de cadastro na Geral')$$,
  tests.membership('gerente', 'geral')),
  'Direção delega gestão de acessos da Geral à Gerente');
select lives_ok(format(
  $$insert into public.membership_permission_overrides (membership_id, permission_code, effect, reason)
    values (%L, 'audit.view', 'revoke', 'teste anti-escalada')$$, tests.membership('gerente', 'geral')),
  'Direção revoga auditoria da Gerente');
select throws_ok(format(
  $$insert into public.membership_permission_overrides (membership_id, permission_code, effect, scope, reason)
    values (%L, 'access.manage', 'grant', 'own', 'escopo inválido')$$, tests.membership('recep', 'geral')),
  '23514', null, 'escopo não permitido para a permissão é recusado');
reset role; select tests.clear();

select tests.login('gerente', 'aal1');
select ok(public.can_manage_access(tests.unit('geral')), 'Gerente com delegação gere a Geral');
select ok(not public.can_manage_access(tests.unit('vip')), 'Gerente não gere a VIP');
select ok(not public.can_manage_templates(), 'Gerente não edita modelos (não gere todas as unidades)');
select ok(not public.has_permission(tests.unit('geral'), 'audit.view'), 'revogação individual remove permissão');
select throws_ok(format(
  $$insert into public.unit_memberships (user_id, unit_id, access_profile_id) values (%L, %L, %L)$$,
  tests.id('novo'), tests.unit('vip'), tests.profile('recepcao')),
  '42501', null, 'Gerente não cria vínculo na VIP');
select throws_ok(format('update public.unit_memberships set access_profile_id = %L where id = %L',
  tests.profile('gerente'), tests.membership('recep', 'geral')),
  '42501', null, 'anti-escalada: Gerente não atribui perfil com permissão que não possui');
select throws_ok(format(
  $$insert into public.membership_permission_overrides (membership_id, permission_code, effect, scope, reason)
    values (%L, 'audit.view', 'grant', 'unit', 'tentativa')$$, tests.membership('recep', 'geral')),
  '42501', null, 'anti-escalada: Gerente não concede permissão que não possui');
select lives_ok(format('update public.unit_memberships set access_profile_id = %L where id = %L',
  tests.profile('somente_leitura'), tests.membership('recep', 'geral')),
  'Gerente troca perfil de outra pessoa dentro do que possui');
select throws_ok(format(
  $$update public.profiles set active = false, deactivation_reason = 'teste' where id = %L$$, tests.id('dir2')),
  '42501', null, 'Gerente não desativa pessoa que também atua em unidade que ela não gere');
select is(tests.count(format(
  $$update public.access_profiles set description = 'x' where id = %L returning 1$$, tests.profile('recepcao'))),
  0::bigint, 'Gerente não edita modelos');
select is(tests.count('select * from public.admin_list_people()'), 6::bigint,
  'Gerente lista apenas pessoas com vínculo na Geral');
select is(tests.count($$select 1 from public.admin_list_people() p, jsonb_array_elements(p.memberships) m
                        where m ->> 'unit_name' = 'Sala VIP'$$), 0::bigint,
  'Gerente não vê vínculos da VIP');
reset role; select tests.clear();

-- Modelos -------------------------------------------------------------------
select tests.login('dir1', 'aal2');
select lives_ok(format(
  $$insert into public.access_profile_permissions (profile_id, permission_code, scope) values (%L, 'audit.view', 'unit')$$,
  tests.profile('recepcao')), 'Direção edita o modelo Recepção');
select is(tests.count(format($$select 1 from public.audit_log where table_name = 'access_profile_permissions'
  and unit_id is null and actor_id = %L$$, tests.id('dir1'))), 1::bigint, 'alteração de modelo auditada com o ator');
select throws_ok(format(
  $$delete from public.access_profile_permissions where profile_id = %L and permission_code = 'audit.view'$$,
  tests.profile('direcao')), '42501', null, 'Direção não altera o próprio modelo');
select throws_ok(format(
  $$update public.access_profiles set requires_mfa = false where id = %L$$, tests.profile('admin_geral')),
  '42501', null, 'modelo usado pelo Admin Geral só por Admin Geral');
select throws_ok(format(
  $$update public.access_profiles set active = false where id = %L$$, tests.profile('vendedora')),
  '23514', null, 'modelo em uso não pode ser desativado');
select lives_ok($$insert into public.access_profiles (name, description) values ('Estagiária', 'teste')$$,
  'Direção cria novo modelo');
select throws_ok($$insert into public.access_profiles (name, key) values ('X', 'x_key')$$,
  '42501', null, 'chave interna é reservada');
-- Desativação
select lives_ok(format(
  $$update public.profiles set active = false, deactivation_reason = 'desligamento' where id = %L$$, tests.id('recep')),
  'Direção desativa pessoa');
select throws_ok(format(
  $$update public.profiles set active = false, deactivation_reason = 'x x' where id = %L$$, tests.id('dir1')),
  '42501', null, 'ninguém desativa a si mesmo');
select is(tests.count('select * from public.admin_list_people()'), 7::bigint, 'Direção lista todas as pessoas');
select ok((select email from public.admin_list_people() where user_id = tests.id('novo')) = 'novo@teste.invalid',
  'lista de pessoas traz o e-mail do Auth');
reset role; select tests.clear();

select tests.login('admin', 'aal2');
select lives_ok(format(
  $$delete from public.access_profile_permissions where profile_id = %L and permission_code = 'audit.view'$$,
  tests.profile('direcao')), 'Admin Geral altera o modelo Direção');
reset role; select tests.clear();

-- Pessoa comum --------------------------------------------------------------
select tests.login('vend_vip', 'aal1');
select is(tests.count('select 1 from public.unit_memberships'), 1::bigint, 'pessoa vê apenas o próprio vínculo');
select is(tests.count('select * from public.admin_list_people()'), 0::bigint, 'pessoa sem gestão não lista pessoas');
select is(tests.count('select 1 from public.audit_log'), 0::bigint, 'pessoa sem audit.view não vê auditoria');
select ok(tests.count(format('select 1 from public.profiles where id = %L', tests.id('dir1'))) = 1,
  'colega da mesma unidade aparece pelo nome');
select is(tests.count(format('select 1 from public.profiles where id = %L', tests.id('gerente'))), 0::bigint,
  'pessoa de outra unidade não aparece');
select throws_ok(format(
  $$select public.admin_provision_person(%L, 'X', null, jsonb_build_array(jsonb_build_object('unit_id', %L, 'access_profile_id', %L)))$$,
  gen_random_uuid(), tests.unit('vip'), tests.profile('recepcao')),
  null, null, 'pessoa sem gestão não cadastra ninguém');
reset role; select tests.clear();

-- Usuário desativado perde tudo imediatamente
select tests.login('recep', 'aal1');
select is(tests.count('select 1 from public.units'), 0::bigint, 'pessoa desativada não vê unidades');
select ok(public.my_access() ->> 'active' = 'false', 'my_access mostra conta desativada');
reset role; select tests.clear();

-- Último Admin Geral
select throws_ok(format('delete from public.platform_admins where user_id = %L', tests.id('admin')),
  '42501', null, 'último Admin Geral não pode ser removido');

-- Estrutura -----------------------------------------------------------------
select ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'todas as tabelas de public têm RLS');
select ok(not exists (select 1 from information_schema.role_table_grants
                      where table_schema = 'public' and grantee = 'anon'),
  'anon não tem privilégio em tabelas de public');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce('search_path=""' = any (p.proconfig), false)),
  'toda função SECURITY DEFINER fixa search_path vazio');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  'anon não executa funções de public');
select ok(not has_function_privilege('authenticated', 'public.admin_find_user_id_by_email(text)', 'execute'),
  'busca de usuário por e-mail só para service_role');

select * from finish();
rollback;
